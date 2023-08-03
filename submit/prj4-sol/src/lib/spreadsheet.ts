import SpreadsheetWs from './ss-ws.js';

import { Result, okResult, errResult } from 'cs544-js-utils';

import { Errors, makeElement } from './utils.js';

const [N_ROWS, N_COLS] = [10, 10];

export default async function make(ws: SpreadsheetWs, ssName: string) {
  return await Spreadsheet.make(ws, ssName);
}


class Spreadsheet {

  private readonly ws: SpreadsheetWs;
  private readonly ssName: string;
  private readonly errors: Errors;
  private focusedCellId: string | null;
  private isCopying: boolean;
  private copiedcellId: string | null;

  constructor(ws: SpreadsheetWs, ssName: string) {
    this.ws = ws; this.ssName = ssName;
    this.errors = new Errors();
    this.focusedCellId = null;
    this.isCopying = false;
    this.copiedcellId = null;
    this.makeEmptySS();
    this.addListeners();
  }

  static async make(ws: SpreadsheetWs, ssName: string) {
    const ss = new Spreadsheet(ws, ssName);
    await ss.load();
    return ss;
  }

  /** add listeners for different events on table elements */
  private addListeners() {
    const clearButton = document.querySelector('#clear')!;
    clearButton.addEventListener('click', this.clearSpreadsheet);

    const dataCells = document.querySelectorAll('.cell');
    dataCells.forEach(cell => {
      cell.addEventListener('focusin', this.focusCell);
      cell.addEventListener('focusout', this.blurCell);
      cell.addEventListener('copy', this.copyCell);
      cell.addEventListener('paste', this.pasteCell);
    });
  }

  /** listener for a click event on #clear button */
  private readonly clearSpreadsheet = async (ev: Event) => {
    const result = await this.ws.clear(this.ssName);
    if (result.isOk) {
      const dataCells = document.querySelectorAll('.cell');
      dataCells.forEach(cell => {
        cell.removeAttribute('data-value');
        cell.removeAttribute('data-expr');
        cell.textContent = '';
      });
    } else {
      this.errors.display(result.errors);
    }
  };

  /** listener for a focus event on a spreadsheet data cell */
  private readonly focusCell = (ev: Event) => {
    const cell = ev.currentTarget as HTMLElement;
    this.focusedCellId = cell.id;
    const exprValue = cell.getAttribute('data-expr') || cell.getAttribute('data-value') || '';
    cell.textContent = exprValue;
    this.errors.clear();
  };

  /** listener for a blur event on a spreadsheet data cell */
  private readonly blurCell = async (ev: Event) => {
    const cell = ev.currentTarget as HTMLElement;
    const cellId = cell.getAttribute('id')!;
    const newExpr = cell.textContent?.trim() || '';
    if (newExpr === '') {
      const result = await this.ws.remove(this.ssName, cellId);
      if (result.isOk) {
        cell.removeAttribute('data-expr');
        cell.removeAttribute('data-value');
        const updates = result.val;
        for (const [id, value] of Object.entries(updates)) {
          const updatedCell = document.getElementById(id);
          if (updatedCell && (this.focusedCellId !== id)) {
            updatedCell.setAttribute('data-value', value.toString());
            updatedCell.textContent = value.toString();
          }
        }
      } else {
        this.errors.display(result.errors);
      }
    } else {
      const result = await this.ws.evaluate(this.ssName, cellId, newExpr);
      if (result.isOk) {
        const updates = result.val;
        cell.dataset.expr = newExpr;
        cell.textContent = cell.dataset.value || '';
        for (const [id, value] of Object.entries(updates)) {
          const updatedCell = document.getElementById(id);
          if (updatedCell && (this.focusedCellId !== id)) {
            updatedCell.setAttribute('data-value', value.toString());
            updatedCell.textContent = value.toString();
          }
        }
      } else {
        this.errors.display(result.errors);
        this.setContentOnError(cell);
      }
    }
    if (this.focusedCellId !== cellId) {
      this.focusedCellId = null;
    }
  };

  // Helper method to restore cell content to its original value on an error
  private setContentOnError(cell: HTMLElement) {
    const dataValue = cell.getAttribute('data-value');
    const dataExpr = cell.getAttribute('data-expr');
    if (dataValue) {
      cell.textContent = dataValue;
    } else if (dataExpr) {
      cell.textContent = dataExpr;
    } else {
      cell.textContent = '';
    }
  };

  /** listener for a copy event on a spreadsheet data cell */
  private readonly copyCell = (ev: Event) => {
    this.isCopying = true;
    const cell = ev.currentTarget as HTMLElement;
    const copySelectedcell = document.querySelector('.is-copy-source');
    if (copySelectedcell)
    {
      copySelectedcell.classList.remove('is-copy-source');
    }
    cell.classList.add('is-copy-source');
    this.copiedcellId = cell.id;
  };

  /** listener for a paste event on a spreadsheet data cell */
  private readonly pasteCell = async (ev: Event) => {
    ev.preventDefault();
    if (this.isCopying && this.copiedcellId) {
      const destCell = ev.currentTarget as HTMLElement;
      const destCellId = destCell.id;
      const sourceCellId = this.copiedcellId;
      if (sourceCellId && destCellId) {
        const result = await this.ws.copy(this.ssName, destCellId, sourceCellId);
        if (result.isOk) {
          const updates = result.val;
          const queryResult = await this.ws.query(this.ssName, destCellId);
          if (queryResult.isOk) {
            const destinationExpression = queryResult.val;
            const destinationCellExpression = destinationExpression.expr;
            destCell.setAttribute('data-expr', destinationCellExpression);

            for (const [id, value] of Object.entries(updates)) {
              const updatedCell = document.getElementById(id);
              if (updatedCell) {

                updatedCell.setAttribute('data-value', value.toString());
                updatedCell.textContent = value.toString();
              }
            }
            destCell.textContent = destinationCellExpression;
          }
        } else {
          this.errors.display(result.errors);
        }
      }
      this.isCopying = false;
      this.copiedcellId = null;
      const sourceCells = document.querySelectorAll('.is-copy-source');
      sourceCells.forEach((sourceCell) => {
        sourceCell.classList.remove('is-copy-source');
      });
    }
  };

  /** Replace entire spreadsheet with that from the web services.
   *  Specifically, for each active cell set its data-value and 
   *  data-expr attributes to the corresponding values returned
   *  by the web service and set its text content to the cell value.
   */
  /** load initial spreadsheet data into DOM */
  private async load() {
    const result = await this.ws.dumpWithValues(this.ssName);
    if (result.isOk) {
      const data = result.val;
      for (const [cellId, expr, value] of data) {
        const cell = document.getElementById(cellId);
        if (cell) {
          cell.setAttribute('data-value', value.toString());
          cell.setAttribute('data-expr', expr);
          cell.textContent = value.toString();
        }
      }
    } else {
      this.errors.display(result.errors);
    }
  }


  private makeEmptySS() {
    const ssDiv = document.querySelector('#ss')!;
    ssDiv.innerHTML = '';
    const ssTable = makeElement('table');
    const header = makeElement('tr');
    const clearCell = makeElement('td');
    const clear = makeElement('button', { id: 'clear', type: 'button' }, 'Clear');
    clearCell.append(clear);
    header.append(clearCell);
    const A = 'A'.charCodeAt(0);
    for (let i = 0; i < N_COLS; i++) {
      header.append(makeElement('th', {}, String.fromCharCode(A + i)));
    }
    ssTable.append(header);
    for (let i = 0; i < N_ROWS; i++) {
      const row = makeElement('tr');
      row.append(makeElement('th', {}, (i + 1).toString()));
      const a = 'a'.charCodeAt(0);
      for (let j = 0; j < N_COLS; j++) {
        const colId = String.fromCharCode(a + j);
        const id = colId + (i + 1);
        const cell =
          makeElement('td', { id, class: 'cell', contentEditable: 'true' });
        row.append(cell);
      }
      ssTable.append(row);
    }
    ssDiv.append(ssTable);
  }

}



