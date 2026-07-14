import type {
  ICellData,
  IObjectMatrixPrimitiveType,
  IWorkbookData,
  IWorksheetData,
} from '@univerjs/core';
import { BooleanNumber, CellValueType, LocaleType } from '@univerjs/core';

type LuckysheetCellValue = {
  v?: unknown;
  m?: string;
  f?: string;
};

type LuckysheetCell = {
  r?: number;
  c?: number;
  v?: LuckysheetCellValue | string | number | boolean | null;
};

type LuckysheetSheet = {
  name?: string;
  index?: string;
  row?: number;
  column?: number;
  celldata?: LuckysheetCell[];
  config?: {
    columnlen?: Record<string, number>;
    rowlen?: Record<string, number>;
    merges?: string[];
  };
};

const DEFAULT_ROW_COUNT = 100;
const DEFAULT_COLUMN_COUNT = 26;

export function parseWorkbookSnapshot(
  sheetData: string | null | undefined,
  workbookName: string,
  workbookId: string,
): IWorkbookData {
  if (sheetData) {
    try {
      const parsed = JSON.parse(sheetData) as unknown;
      if (isWorkbookData(parsed)) {
        return withWorkbookIdentity(parsed, workbookName, workbookId);
      }
      if (Array.isArray(parsed)) {
        return luckysheetToWorkbook(parsed as LuckysheetSheet[], workbookName, workbookId);
      }
    } catch {
      // Fall through to an empty workbook.
    }
  }

  return luckysheetToWorkbook([{ name: 'Sheet1', celldata: [] }], workbookName, workbookId);
}

export function workbookToPersistedSheets(workbook: IWorkbookData): IWorkbookData {
  return workbook;
}

function isWorkbookData(value: unknown): value is IWorkbookData {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<IWorkbookData>;
  return !!candidate.sheets && !Array.isArray(candidate.sheets) && Array.isArray(candidate.sheetOrder);
}

function withWorkbookIdentity(snapshot: IWorkbookData, name: string, id: string): IWorkbookData {
  return {
    ...snapshot,
    id,
    name: snapshot.name || name,
    locale: snapshot.locale || LocaleType.ZH_CN,
  };
}

function luckysheetToWorkbook(
  sheets: LuckysheetSheet[],
  workbookName: string,
  workbookId: string,
): IWorkbookData {
  const safeSheets = sheets.length > 0 ? sheets : [{ name: 'Sheet1', celldata: [] }];
  const sheetOrder: string[] = [];
  const workbookSheets: IWorkbookData['sheets'] = {};

  safeSheets.forEach((sheet, idx) => {
    const sheetId = makeSheetId(sheet.index || sheet.name, idx);
    sheetOrder.push(sheetId);
    workbookSheets[sheetId] = convertSheet(sheet, sheetId, idx);
  });

  return {
    id: workbookId,
    name: workbookName,
    appVersion: '3.0.0',
    locale: LocaleType.ZH_CN,
    styles: {},
    sheetOrder,
    sheets: workbookSheets,
  };
}

function convertSheet(sheet: LuckysheetSheet, sheetId: string, idx: number): Partial<IWorksheetData> {
  const cellData: IObjectMatrixPrimitiveType<ICellData> = {};
  let maxRow = 0;
  let maxColumn = 0;

  for (const item of sheet.celldata || []) {
    const row = Number(item.r);
    const column = Number(item.c);
    if (!Number.isInteger(row) || !Number.isInteger(column) || row < 0 || column < 0) continue;

    const cell = convertCell(item.v);
    if (!cell) continue;
    cellData[row] ||= {};
    cellData[row][column] = cell;
    maxRow = Math.max(maxRow, row + 1);
    maxColumn = Math.max(maxColumn, column + 1);
  }

  return {
    id: sheetId,
    name: sheet.name || `Sheet${idx + 1}`,
    tabColor: '',
    hidden: BooleanNumber.FALSE,
    freeze: { xSplit: 0, ySplit: 0, startRow: 0, startColumn: 0 },
    rowCount: Math.max(sheet.row || DEFAULT_ROW_COUNT, maxRow, DEFAULT_ROW_COUNT),
    columnCount: Math.max(sheet.column || DEFAULT_COLUMN_COUNT, maxColumn, DEFAULT_COLUMN_COUNT),
    zoomRatio: 1,
    scrollTop: 0,
    scrollLeft: 0,
    defaultColumnWidth: 88,
    defaultRowHeight: 24,
    mergeData: [],
    cellData,
    rowData: convertRowData(sheet.config?.rowlen),
    columnData: convertColumnData(sheet.config?.columnlen),
    rowHeader: { width: 46 },
    columnHeader: { height: 24 },
    showGridlines: BooleanNumber.TRUE,
    rightToLeft: BooleanNumber.FALSE,
  };
}

function convertCell(value: LuckysheetCell['v']): ICellData | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && !Array.isArray(value)) {
    const cellValue = (value as LuckysheetCellValue).v;
    const formula = (value as LuckysheetCellValue).f;
    if (cellValue === null || cellValue === undefined) {
      return formula ? { f: formula } : null;
    }
    return {
      v: normalizeCellValue(cellValue),
      t: getValueType(cellValue),
      ...(formula ? { f: formula } : {}),
    };
  }
  return { v: normalizeCellValue(value), t: getValueType(value) };
}

function normalizeCellValue(value: unknown): string | number | boolean {
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value ?? '');
}

function getValueType(value: unknown): CellValueType {
  if (typeof value === 'number') return CellValueType.NUMBER;
  if (typeof value === 'boolean') return CellValueType.BOOLEAN;
  return CellValueType.STRING;
}

function convertColumnData(columnLengths: Record<string, number> | undefined) {
  const data: IWorksheetData['columnData'] = {};
  for (const [key, width] of Object.entries(columnLengths || {})) {
    const column = Number(key);
    if (Number.isInteger(column) && width > 0) data[column] = { w: width };
  }
  return data;
}

function convertRowData(rowLengths: Record<string, number> | undefined) {
  const data: IWorksheetData['rowData'] = {};
  for (const [key, height] of Object.entries(rowLengths || {})) {
    const row = Number(key);
    if (Number.isInteger(row) && height > 0) data[row] = { h: height };
  }
  return data;
}

function makeSheetId(value: string | undefined, index: number): string {
  const normalized = (value || `sheet-${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, '-');
  return normalized || `sheet-${index + 1}`;
}
