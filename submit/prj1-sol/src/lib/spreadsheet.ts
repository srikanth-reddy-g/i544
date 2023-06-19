import { ok } from 'assert';
import { default as parse, CellRef, Ast } from './expr-parser.js';

import { Result, okResult, errResult } from 'cs544-js-utils';
import exp from 'constants';

//factory method
export default async function makeSpreadsheet(name: string): Promise<Result<Spreadsheet>> {
  return okResult(new Spreadsheet(name));
}

type Updates = { [cellId: string]: number };

export class Spreadsheet {
  readonly name: string;
  private cells: { [cellId: string]: Ast | undefined };
  //TODO: add other instance variable declarations
  constructor(name: string) {
    this.name = name;
    this.cells = {};
    //TODO: add initializations for other instance variables
  }

  /** Set cell with id cellId to result of evaluating formula
   *  specified by the string expr.  Update all cells which are
   *  directly or indirectly dependent on the base cell cellId.
   *  Return an object mapping the id's of all updated cells to
   *  their updated values.
   *
   *  Errors must be reported by returning an error Result having its
   *  code options property set to `SYNTAX` for a syntax error and
   *  `CIRCULAR_REF` for a circular reference and message property set
   *  to a suitable error message.
   */
  async eval(cellId: string, expr: string): Promise<Result<Updates>> {
    //TODO
    try {
      const parsedExpr = parse(expr, cellId);
      console.log(JSON.stringify(parsedExpr, null, 2));
      if (parsedExpr.isOk) {
        const result = this.evaluateExpression(parsedExpr.val,cellId);
        return okResult({ [cellId]: result });
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
      if (this.cells[cellId] !== undefined) {
        return this.evaluateExpression(this.cells[cellId]!, cellId);
      } else {
        return 0; // undefined cell is treated as 0
      }
    } else {
      throw new Error(`Invalid expression: ${expr}`);
    }
  }
  
  
  // return okResult({}); //initial dummy result

  //TODO: add additional methods
}

//TODO: add additional classes and/or functions

const FNS = {
  '+': (a: number, b: number): number => a + b,
  '-': (a: number, b?: number): number => (b === undefined ? -a : a - b),
  '*': (a: number, b: number): number => a * b,
  '/': (a: number, b: number): number => a / b,
  min: (a: number, b: number): number => Math.min(a, b),
  max: (a: number, b: number): number => Math.max(a, b),
};