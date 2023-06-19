import { default as parse, CellRef, Ast } from './expr-parser.js';
import { Result, okResult, errResult } from 'cs544-js-utils';

// factory method
export default async function makeSpreadsheet(name: string): Promise<Result<Spreadsheet>> {
  return okResult(new Spreadsheet(name));
}

type Updates = { [cellId: string]: number };

export class Spreadsheet {
  readonly name: string;
  cells: { [cellId: string]: Ast }; // Store the parsed expression for each cell
  values: { [cellId: string]: number }; // Store the evaluated value for each cell

  constructor(name: string) {
    this.name = name;
    this.cells = {};
    this.values = {};
  }

  async eval(cellId: string, expr: string): Promise<Result<Updates>> {
    try {
      const parsedExpr = parse(expr, cellId);
      // console.log(JSON.stringify(parsedExpr, null, 2));
      if (parsedExpr.isOk) {
        this.cells[cellId] = parsedExpr.val; // Store the parsed expression
        const result = this.evaluateExpression(parsedExpr.val,cellId);
        this.values[cellId] = result; // Store the evaluated value
        // console.log("Values stored in "+ cellId + " is "+this.values[cellId]);
        const updates: Updates = { [cellId]: result };
        for (const key in updates) {
          if (updates.hasOwnProperty(key)) {
            const value = updates[key];
            // console.log(`Key: ${key}, Value: ${value}`);
          }
        }
        // Update dependent cells recursively
        this.updateDependentCells(cellId, updates);
        return okResult(updates);
      } else {
        return errResult(parsedExpr, 'SYNTAX');
      }
    } catch (error) {
      return errResult(error, 'SYNTAX');
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
      if (this.cells.hasOwnProperty(id)) {
        const expr = this.cells[id];
        if (this.isDependent(expr, cellId)) {
          const result = this.evaluateExpression(expr,cellId);
          this.values[id] = result; // Update the value
          updates[id] = result; // Add to the updates object
          // Update dependent cells recursively
          this.updateDependentCells(id, updates);
        }
      }
    }
  }

  private isDependent(expr: Ast, cellId: string): boolean {
    if (expr.kind === 'app') {
      return expr.kids.some((kid) => this.isDependent(kid, cellId));
    } else if (expr.kind === 'ref') {
      const baseCellRef = CellRef.parseRef(cellId);
      const refCellId = expr.toText(baseCellRef);
      return refCellId === cellId;
    } else {
      return false;
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