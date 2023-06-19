import { default as parse, CellRef, Ast } from './expr-parser.js';
import { Result, okResult, errResult } from 'cs544-js-utils';

// factory method
export default async function makeSpreadsheet(name: string): Promise<Result<Spreadsheet>> {
  return okResult(new Spreadsheet(name));
}

type Updates = { [cellId: string]: number };

interface UndoObject {
  cellId: string;
  property: string;
  oldValue: any;
}

export class Spreadsheet {
  readonly name: string;
  cells: { [cellId: string]: Ast }; // Store the parsed expression for each cell
  values: { [cellId: string]: number }; // Store the evaluated value for each cell
  visitedCells: string[];
  undoStack: UndoObject[]; 

  constructor(name: string) {
    this.name = name;
    this.cells = {};
    this.values = {};
    this.visitedCells = [];
    this.undoStack = [];
  }

  async eval(cellId: string, expr: string): Promise<Result<Updates>> {
    if (this.visitedCells.includes(cellId)) {
      const msg = `cyclic dependency ...`;
      throw  errResult(msg, 'CIRCULAR_REF');
    }

    // Mark the current cell as visited

    const undoObject: UndoObject = {
      cellId,
      property: 'value',
      oldValue: this.values[cellId]
    };
    
    try {
      const parsedExpr = parse(expr, cellId);
      console.log(JSON.stringify(parsedExpr, null, 2));
      if (parsedExpr.isOk) {
        this.cells[cellId] = parsedExpr.val; // Store the parsed expression
        const result = this.evaluateExpression(parsedExpr.val,cellId);
        this.values[cellId] = result; // Store the evaluated value
        console.log("Values stored in "+ cellId + " is "+this.values[cellId]);
        const updates: Updates = { [cellId]: result };
        for (const key in updates) {
          if (updates.hasOwnProperty(key)) {
            const value = updates[key];
            console.log(`Key: ${key}, Value: ${value}`);
          }
        }
        // Update dependent cells recursively
        this.updateDependentCells(cellId, updates);
        console.log('updates,',updates);
        console.log('values,',this.values);
        console.log('cells,',this.cells);
        return okResult(updates);
      } else {
        return errResult(parsedExpr, 'SYNTAX');
      }
    } catch (error) {
      this.undoStack.push(undoObject);
      this.values[cellId] = undoObject.oldValue;
      return errResult(error, 'SYNTAX');
    } finally {
      this.visitedCells = [];
    }
  }

  private evaluateExpression(expr: Ast, baseCellId: string): number {
    if (expr.kind === 'num') {
      return expr.value;
    } else if (expr.kind === 'app') {
      const fn = expr.fn;
      const args = expr.kids.map((kid) => this.evaluateExpression(kid, baseCellId));
      if (FNS[fn]) {
        return FNS[fn].apply(null, args);
      } else {
        throw new Error(`Unknown function: ${fn}`);
      }
    } else if (expr.kind === 'ref') {
      const baseCellRef = CellRef.parseRef(baseCellId);
      const cellId = expr.toText(baseCellRef);
      this.visitedCells.push(cellId);
      if (this.visitedCells.includes(baseCellId)) {
        this.rollbackChanges();
        const msg = `cyclic dependency ...`;
        throw  errResult(msg, 'CIRCULAR_REF');
      }
      if(cellId === baseCellId){
        const msg = `cyclic dependency ...`;
        throw  errResult(msg, 'CIRCULAR_REF');
      }
      if (this.values[cellId] !== undefined) {
        return this.values[cellId];
      } else {
        return 0; // Return 0 for undefined cells
      }
    } else {
      throw new Error(`Invalid expression: ${expr}`);
    }
  }

  private updateDependentCells(cellId: string, updates: Updates) {
    for (const id in this.cells) {
      // console.log('inside updateDependentCells cells ', this.cells);
      if (this.cells.hasOwnProperty(id)) {
        const expr = this.cells[id];
        // console.log('expr ',expr);
        if (this.isDependent(expr, id, cellId)) {
          // console.log('dependents ', id, cellId);
          const result = this.evaluateExpression(expr, id);
          this.values[id] = result; // Update the value
          updates[id] = result; // Add to the updates object
          // Update dependent cells recursively
          this.updateDependentCells(id, updates);
        }
      }
    }
  }

  private isDependent(expr: Ast, id: string, cellId: string): boolean {
      if (expr.kind === 'app') {
        const isDependent = expr.kids.some((kid) => {
          const dependent = this.isDependent(kid, id, cellId);
          // console.log(`Checking dependency: cellId=${cellId}, expr=${JSON.stringify(kid)}, dependent=${dependent}`);
          return dependent;
        });
        // console.log(`Expression: cellId=${cellId}, expr=${JSON.stringify(expr)}, isDependent=${isDependent}`);
        return isDependent;    
      } 
      else if (expr.kind === 'ref') {
      const baseCellRef = CellRef.parseRef(id);
      const refCellId = expr.toText(baseCellRef);
      // console.log('ref ', refCellId, id, cellId);
      return refCellId === cellId;
    } else {
      // console.log('num ');
      return false;
    }
  }


  private rollbackChanges() {
    while (this.undoStack.length > 0) {
      const undoObject = this.undoStack.pop();
      if (undoObject) {
        this.values[undoObject.cellId] = undoObject.oldValue;
      }
    }
  }
  
  
}
const FNS = {
  '+': (a: number, b: number): number => a + b,
  '-': (a: number, b?: number): number => (b === undefined ? -a : a - b),
  '*': (a: number, b: number): number => a * b,
  '/': (a: number, b: number): number => a / b,
  min: (a: number, b: number): number => Math.min(a, b),
  max: (a: number, b: number): number => Math.max(a, b),
};