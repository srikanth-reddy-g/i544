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
  cells: { [cellId: string]: Ast };
  values: { [cellId: string]: number };
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

    const undoObject: UndoObject = {
      cellId,
      property: 'value',
      oldValue: this.values[cellId]
    };
    
    try {
      const parsedExpr = parse(expr, cellId);
      if (parsedExpr.isOk) {
        this.cells[cellId] = parsedExpr.val;
        const result = this.evaluateExpression(parsedExpr.val,cellId);
        this.values[cellId] = result;
        const updates: Updates = { [cellId]: result };
        for (const key in updates) {
          if (updates.hasOwnProperty(key)) {
            const value = updates[key];
          }
        }
        this.updateDependentCells(cellId, updates);
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
        return 0;
      }
    } else {
      throw new Error(`Invalid expression: ${expr}`);
    }
  }

  private updateDependentCells(cellId: string, updates: Updates) {
    for (const id in this.cells) {
      if (this.cells.hasOwnProperty(id)) {
        const expr = this.cells[id];
        if (this.isDependent(expr, id, cellId)) {
          const result = this.evaluateExpression(expr, id);
          this.values[id] = result;
          updates[id] = result;
          this.updateDependentCells(id, updates);
        }
      }
    }
  }

  private isDependent(expr: Ast, id: string, cellId: string): boolean {
      if (expr.kind === 'app') {
        const isDependent = expr.kids.some((kid) => {
          const dependent = this.isDependent(kid, id, cellId);
          return dependent;
        });
        return isDependent;    
      } 
      else if (expr.kind === 'ref') {
      const baseCellRef = CellRef.parseRef(id);
      const refCellId = expr.toText(baseCellRef);
      return refCellId === cellId;
    } else {
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