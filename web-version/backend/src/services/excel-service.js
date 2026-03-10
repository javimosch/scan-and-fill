import ExcelJS from 'exceljs';
import XLSX from 'xlsx';
import { identifyMonth } from './month-utils.js';

export async function getSpreadsheetMetadata(fileName, fileBuffer, sheetName, categoryColumn = 'A', monthStartCell = 'B1') {
  const isOds = fileName.toLowerCase().endsWith('.ods');
  return isOds
    ? getOdsMetadata(fileBuffer, sheetName, categoryColumn, monthStartCell)
    : getXlsxMetadata(fileBuffer, sheetName, categoryColumn, monthStartCell);
}

export async function applySummaryToSpreadsheet(fileName, fileBuffer, sheetName, mapping, data) {
  const isOds = fileName.toLowerCase().endsWith('.ods');
  return isOds
    ? applyToOds(fileBuffer, sheetName, mapping, data)
    : applyToXlsx(fileBuffer, sheetName, mapping, data);
}

async function getXlsxMetadata(fileBuffer, sheetName, categoryColumn, monthStartCell) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);
  const tabs = workbook.worksheets.map((ws) => ws.name);
  const worksheet = workbook.getWorksheet(sheetName) || workbook.worksheets[0];
  if (!worksheet) return { tabs, categories: {}, months: [] };

  const categories = {};
  worksheet.eachRow((row, rowNumber) => {
    try {
      const cell = row.getCell(categoryColumn);
      if (!cell?.value) return;
      const label = String(cell.value).trim();
      if (!label) return;
      categories[label] = { row: rowNumber, address: cell.address };
    } catch {
      // ignore malformed cell references
    }
  });

  const months = [];
  try {
    const startCell = worksheet.getCell(monthStartCell);
    for (let i = 0; i < 12; i += 1) {
      const cell = worksheet.getRow(startCell.row).getCell(startCell.col + i);
      const label = String(cell.value || '').trim();
      const monthInfo = identifyMonth(label);
      if (monthInfo) {
        months.push({ label, month: monthInfo.standardName, address: cell.address });
      }
    }
  } catch {
    // ignore invalid reference
  }

  return { tabs, categories, months };
}

function getOdsMetadata(fileBuffer, sheetName, categoryColumn, monthStartCell) {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellStyles: true, cellNF: true, cellDates: true });
  const tabs = workbook.SheetNames;
  const worksheet = workbook.Sheets[sheetName] || workbook.Sheets[tabs[0]];
  if (!worksheet) return { tabs, categories: {}, months: [] };

  const categories = {};
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:A1');
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    const addr = `${categoryColumn}${r + 1}`;
    const cell = worksheet[addr];
    if (!cell?.v) continue;
    const label = String(cell.v).trim();
    if (!label) continue;
    categories[label] = { row: r + 1, address: addr };
  }

  const months = [];
  try {
    const start = XLSX.utils.decode_cell(monthStartCell);
    for (let i = 0; i < 12; i += 1) {
      const addr = XLSX.utils.encode_cell({ r: start.r, c: start.c + i });
      const cell = worksheet[addr];
      const label = String(cell?.v || '').trim();
      const monthInfo = identifyMonth(label);
      if (monthInfo) {
        months.push({ label, month: monthInfo.standardName, address: addr });
      }
    }
  } catch {
    // ignore invalid cell
  }

  return { tabs, categories, months };
}

async function applyToXlsx(fileBuffer, sheetName, mapping, data) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);
  const worksheet = workbook.getWorksheet(sheetName);
  if (!worksheet) throw new Error(`Worksheet not found: ${sheetName}`);

  const { monthStartCell, categoryRows } = mapping;
  const startCell = worksheet.getCell(monthStartCell);
  const baseMonth = identifyMonth(String(startCell.value || ''));
  const baseIdx = baseMonth ? baseMonth.index : 0;

  for (const [monthName, categories] of Object.entries(data || {})) {
    const monthInfo = identifyMonth(monthName);
    if (!monthInfo) continue;
    const col = startCell.col + (monthInfo.index - baseIdx);
    for (const [categoryName, total] of Object.entries(categories)) {
      const row = categoryRows?.[categoryName];
      if (!row) continue;
      const cell = worksheet.getRow(row).getCell(col);
      cell.value = total;
      cell.numFmt = '#,##0.00';
    }
  }

  return workbook.xlsx.writeBuffer();
}

function applyToOds(fileBuffer, sheetName, mapping, data) {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellStyles: true, cellNF: true, cellDates: true });
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) throw new Error(`Worksheet not found: ${sheetName}`);

  const { monthStartCell, categoryRows } = mapping;
  const start = XLSX.utils.decode_cell(monthStartCell);
  const startAddr = XLSX.utils.encode_cell({ r: start.r, c: start.c });
  const baseMonth = identifyMonth(String(worksheet[startAddr]?.v || ''));
  const baseIdx = baseMonth ? baseMonth.index : 0;

  for (const [monthName, categories] of Object.entries(data || {})) {
    const monthInfo = identifyMonth(monthName);
    if (!monthInfo) continue;
    const col = start.c + (monthInfo.index - baseIdx);
    for (const [categoryName, total] of Object.entries(categories)) {
      const row = categoryRows?.[categoryName];
      if (!row) continue;
      const addr = XLSX.utils.encode_cell({ r: row - 1, c: col });
      worksheet[addr] = { v: total, t: 'n', z: '#,##0.00' };
    }
  }

  return XLSX.write(workbook, { type: 'buffer', bookType: 'ods' });
}
