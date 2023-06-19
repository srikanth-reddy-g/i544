// Importing the necessary modules
import { default as parse, CellRef, Ast } from './expr-parser.js';
import { Result, okResult, errResult } from 'cs544-js-utils';

// Factory method
export default async function makeSpreadsheet(name: string): Promise<Result<Spreadsheet>> {
  return okResult(new Spreadsheet(name));
}

// Updates type for storing cell updates
type Updates = { [cellId: string]: number };

// Interface for representing an UndoObject
interface UndoObject {
  cellId: string;
  property: string;
  oldValue: any;
}

// Class representing a Spreadsheet
export class Spreadsheet {
  readonly name: string;
  cells: { [cellId: string]: Ast }; // Object to store cell expressions
  values: { [cellId: string]: number }; // Object to store cell values
  visitedCells: string[]; // Array to store visited cell IDs during evaluation
  undoStack: UndoObject[]; // Array to store undo objects

  constructor(name: string) {
    this.name = name;
    this.cells = {};
    this.values = {};
    this.visitedCells = [];
    this.undoStack = [];
  }

  // Method to evaluate a cell expression
  async eval(cellId: string, expr: string): Promise<Result<Updates>> {
    if (this.visitedCells.includes(cellId)) {
      const msg = `cyclic dependency ...`;
      throw errResult(msg, 'CIRCULAR_REF');
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
        const result = this.evaluateExpression(parsedExpr.val, cellId);
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

  // Method to evaluate an expression recursively
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
        throw errResult(msg, 'CIRCULAR_REF');
      }
      if (cellId === baseCellId) {
        const msg = `cyclic dependency ...`;
        throw errResult(msg, 'CIRCULAR_REF');
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

  // Method to update dependent cells recursively
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

  // Method to check if a cell expression is dependent on another cell
  private isDependent(expr: Ast, id: string, cellId: string): boolean {
    if (expr.kind === 'app') {
      const isDependent = expr.kids.some((kid) => {
        const dependent = this.isDependent(kid, id, cellId);
        return dependent;
      });
      return isDependent;
    } else if (expr.kind === 'ref') {
      const baseCellRef = CellRef.parseRef(id);
      const refCellId = expr.toText(baseCellRef);
      return refCellId === cellId;
    } else {
      return false;
    }
  }

  // Method to rollback changes by restoring old cell values
  private rollbackChanges() {
    while (this.undoStack.length > 0) {
      const undoObject = this.undoStack.pop();
      if (undoObject) {
        this.values[undoObject.cellId] = undoObject.oldValue;
      }
    }
  }
}

// Object containing arithmetic functions for evaluation
const FNS = {
  '+': (a: number, b: number): number => a + b,
  '-': (a: number, b?: number): number => (b === undefined ? -a : a - b),
  '*': (a: number, b: number): number => a * b,
  '/': (a: number, b: number): number => a / b,
  min: (a: number, b: number): number => Math.min(a, b),
  max: (a: number, b: number): number => Math.max(a, b),
};
