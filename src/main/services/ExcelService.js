import ExcelJS from 'exceljs';
import XLSX from 'xlsx';
import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';
import { ScannerService } from './ScannerService.js';

// ---- Surgical ODS cell editing (preserves external-link sheets, formulas,
// cached values and XML namespaces; avoids SheetJS's 31-char sheet-name limit
// which crashes on externally-linked spreadsheets). See issue #2. ----
function odsFloatCell(v) {
  const n = Math.round(v * 100) / 100;
  return `<table:table-cell office:value-type="float" office:value="${n}"><text:p>${n.toFixed(2)}</text:p></table:table-cell>`;
}
function odsStripRepeat(cellXml) {
  return cellXml.replace(/\s*table:number-columns-repeated="\d+"/, '');
}
function editOdsRowCells(attrs, inner, colEdits) {
  const cellRe = /<table:(table-cell|covered-table-cell)\b([^>]*?)(\/>|>[\s\S]*?<\/table:\1>)/g;
  let out = '', lastIdx = 0, colNum = 0, m;
  while ((m = cellRe.exec(inner)) !== null) {
    const cellFull = m[0];
    const repM = m[2].match(/table:number-columns-repeated="(\d+)"/);
    const rep = repM ? parseInt(repM[1], 10) : 1;
    const startCol = colNum, endCol = colNum + rep - 1;
    colNum += rep;
    const targets = Object.keys(colEdits).map(Number).filter((c) => c >= startCol && c <= endCol);
    if (!targets.length) continue;
    out += inner.slice(lastIdx, m.index);
    for (let c = startCol; c <= endCol; c++) {
      out += colEdits[c] !== undefined ? odsFloatCell(colEdits[c]) : odsStripRepeat(cellFull);
    }
    lastIdx = m.index + cellFull.length;
  }
  out += inner.slice(lastIdx);
  return `<table:table-row${attrs}>${out}</table:table-row>`;
}
function editOdsCells(xml, sheetName, edits) {
  const tableRe = new RegExp('(<table:table\\b[^>]*table:name="' + sheetName + '"[^>]*>)([\\s\\S]*?)(</table:table>)');
  const tm = xml.match(tableRe);
  if (!tm) throw new Error('Sheet not found in ODS: ' + sheetName);
  const body = tm[2];
  const rowRe = /<table:table-row\b([^>]*)>([\s\S]*?)<\/table:table-row>/g;
  let result = '', lastIdx = 0, rowNum = 0, m;
  while ((m = rowRe.exec(body)) !== null) {
    const attrs = m[1], rowInner = m[2];
    const repM = attrs.match(/table:number-rows-repeated="(\d+)"/);
    const rep = repM ? parseInt(repM[1], 10) : 1;
    const startRow = rowNum + 1, endRow = rowNum + rep;
    rowNum = endRow;
    const targets = Object.keys(edits).map(Number).filter((r) => r >= startRow && r <= endRow);
    if (!targets.length) continue;
    if (rep !== 1) throw new Error('Cannot edit a repeated row (' + startRow + '); add data to a distinct row.');
    result += body.slice(lastIdx, m.index);
    result += editOdsRowCells(attrs, rowInner, edits[startRow]);
    lastIdx = m.index + m[0].length;
  }
  result += body.slice(lastIdx);
  return xml.slice(0, tm.index) + tm[1] + result + tm[3] + xml.slice(tm.index + tm[0].length);
}

/**
 * Service to interact with Excel and ODS files.
 */
export default class ExcelService {
  isODS(filePath) {
    return filePath.toLowerCase().endsWith('.ods');
  }

  /**
   * Updates a spreadsheet sheet with the extracted totals.
   */
  async updateSheet(filePath, sheetName, mapping, data) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    if (this.isODS(filePath)) {
      return this.updateODS(filePath, sheetName, mapping, data);
    } else {
      return this.updateXLSX(filePath, sheetName, mapping, data);
    }
  }

  async updateXLSX(filePath, sheetName, mapping, data) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    
    const worksheet = workbook.getWorksheet(sheetName);
    if (!worksheet) {
      throw new Error(`Worksheet not found: ${sheetName}`);
    }

    const { monthStartCell, categoryColumn, categoryRows } = mapping;
    const startCell = worksheet.getCell(monthStartCell);
    const startCol = startCell.col;
    
    const baseMonthValue = startCell.value ? startCell.value.toString() : '';
    const scanner = new ScannerService();
    const baseMonthInfo = scanner.identifyMonth(baseMonthValue);
    const baseMonthIdx = baseMonthInfo ? baseMonthInfo.index : 0;

    for (const [monthName, categories] of Object.entries(data)) {
      const monthInfo = scanner.identifyMonth(monthName);
      if (!monthInfo) continue;

      const currentMonthIdx = monthInfo.index;
      const colOffset = currentMonthIdx - baseMonthIdx;
      const col = startCol + colOffset;

      for (const [categoryName, total] of Object.entries(categories)) {
        const row = categoryRows[categoryName];
        if (row) {
          const cell = worksheet.getRow(row).getCell(col);
          cell.value = total;
          cell.numFmt = '#,##0.00';
        }
      }
    }

    await workbook.xlsx.writeFile(filePath);
  }

  async updateODS(filePath, sheetName, mapping, data) {
    const buf = fs.readFileSync(filePath);
    // Reading is safe (only WRITE rejects >31-char sheet names); use it to find
    // the base month so column offsets match the header row.
    const workbook = XLSX.read(buf, { cellStyles: true, cellNF: true, cellDates: true });
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      throw new Error(`Worksheet not found: ${sheetName}`);
    }

    const { monthStartCell, categoryRows } = mapping;
    const start = XLSX.utils.decode_cell(monthStartCell);
    const startCellAddr = XLSX.utils.encode_cell({ r: start.r, c: start.c });
    const baseMonthValue = worksheet[startCellAddr] ? worksheet[startCellAddr].v.toString() : '';

    const scanner = new ScannerService();
    const baseMonthInfo = scanner.identifyMonth(baseMonthValue);
    const baseMonthIdx = baseMonthInfo ? baseMonthInfo.index : 0;

    // Build edits keyed by { rowNumber(1-based): { colIndex(0-based): value } }
    const edits = {};
    for (const [monthName, categories] of Object.entries(data)) {
      const monthInfo = scanner.identifyMonth(monthName);
      if (!monthInfo) continue;
      const col = start.c + (monthInfo.index - baseMonthIdx);
      for (const [categoryName, total] of Object.entries(categories)) {
        const row = categoryRows[categoryName];
        if (!row) continue;
        (edits[row] = edits[row] || {})[col] = total;
      }
    }

    // Apply via surgical content.xml edit inside the ODS zip.
    const zip = await JSZip.loadAsync(buf);
    const contentFile = zip.file('content.xml');
    if (!contentFile) throw new Error('Invalid ODS file: content.xml missing');
    let xml = await contentFile.async('string');
    xml = editOdsCells(xml, sheetName, edits);
    zip.file('content.xml', xml);
    // mimetype must stay first and stored uncompressed for a valid ODS
    if (zip.file('mimetype')) {
      zip.file('mimetype', await zip.file('mimetype').async('string'), { compression: 'STORE' });
    }
    const outBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    fs.writeFileSync(filePath, outBuf);
  }

  /**
   * Gets comprehensive metadata from an Excel or ODS file.
   */
  async getMetadata(filePath, sheetName, categoryColumn = 'A', monthStartCell = 'B1') {
      if (!fs.existsSync(filePath)) return { tabs: [], categories: {}, months: [] };

      if (this.isODS(filePath)) {
          return this.getODSMetadata(filePath, sheetName, categoryColumn, monthStartCell);
      } else {
          return this.getXLSXMetadata(filePath, sheetName, categoryColumn, monthStartCell);
      }
  }

  async getXLSXMetadata(filePath, sheetName, categoryColumn, monthStartCell) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);
      const tabs = workbook.worksheets.map(ws => ws.name);
      
      const worksheet = workbook.getWorksheet(sheetName) || workbook.worksheets[0];
      if (!worksheet) return { tabs, categories: {}, months: [] };

      const categories = {};
      if (categoryColumn) {
          worksheet.eachRow((row, rowNumber) => {
              try {
                  const cell = row.getCell(categoryColumn);
                  const value = cell.value;
                  if (value && typeof value === 'string') {
                      const label = value.trim();
                      categories[label] = {
                          row: rowNumber,
                          address: cell.address
                      };
                  }
              } catch (e) {}
          });
      }

      const months = [];
      const scanner = new ScannerService();
      try {
          const startCell = worksheet.getCell(monthStartCell);
          const startCol = startCell.col;
          const startRow = startCell.row;

          for (let i = 0; i < 12; i++) {
              const cell = worksheet.getRow(startRow).getCell(startCol + i);
              const val = cell.value ? cell.value.toString() : '';
              const monthInfo = scanner.identifyMonth(val);
              if (monthInfo) {
                  months.push({
                      label: val,
                      month: monthInfo.standardName,
                      address: cell.address
                  });
              }
          }
      } catch (e) {}

      return { tabs, categories, months };
  }

  async getODSMetadata(filePath, sheetName, categoryColumn, monthStartCell) {
      const workbook = XLSX.readFile(filePath, { cellStyles: true, cellNF: true, cellDates: true });
      const tabs = workbook.SheetNames;
      const worksheet = workbook.Sheets[sheetName] || workbook.Sheets[tabs[0]];
      
      if (!worksheet) return { tabs, categories: {}, months: [] };

      const categories = {};
      if (categoryColumn) {
          const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:A1');
          for (let r = range.s.r; r <= range.e.r; r++) {
              const addr = categoryColumn + (r + 1);
              const cell = worksheet[addr];
              if (cell && cell.v && typeof cell.v === 'string') {
                  const label = cell.v.trim();
                  categories[label] = {
                      row: r + 1,
                      address: addr
                  };
              }
          }
      }

      const months = [];
      const scanner = new ScannerService();
      try {
          const start = XLSX.utils.decode_cell(monthStartCell);
          for (let i = 0; i < 12; i++) {
              const addr = XLSX.utils.encode_cell({r: start.r, c: start.c + i});
              const cell = worksheet[addr];
              const val = (cell && cell.v) ? cell.v.toString() : '';
              const monthInfo = scanner.identifyMonth(val);
              if (monthInfo) {
                  months.push({
                      label: val,
                      month: monthInfo.standardName,
                      address: addr
                  });
              }
          }
      } catch (e) {}

      return { tabs, categories, months };
  }

  /**
   * @deprecated Use getMetadata
   */
  async getSheetNames(filePath) {
      const res = await this.getMetadata(filePath);
      return res.tabs;
  }

  /**
   * @deprecated Use getMetadata
   */
  async findCategories(filePath, sheetName, categoryColumn = 'A') {
      const res = await this.getMetadata(filePath, sheetName, categoryColumn);
      const simple = {};
      Object.entries(res.categories).forEach(([k, v]) => simple[k] = v.row);
      return simple;
  }
}

export { ExcelService };
