import ExcelJS from 'exceljs';
import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { ScannerService } from './ScannerService.js';

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
    const workbook = XLSX.readFile(filePath, { cellStyles: true, cellNF: true, cellDates: true });
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      throw new Error(`Worksheet not found: ${sheetName}`);
    }

    const { monthStartCell, categoryColumn, categoryRows } = mapping;
    const start = XLSX.utils.decode_cell(monthStartCell);
    const startCol = start.c;
    const startRow = start.r;
    
    const startCellAddr = XLSX.utils.encode_cell({r: startRow, c: startCol});
    const baseMonthValue = worksheet[startCellAddr] ? worksheet[startCellAddr].v.toString() : '';
    
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
          const addr = XLSX.utils.encode_cell({r: row - 1, c: col});
          worksheet[addr] = { v: total, t: 'n', z: '#,##0.00' };
        }
      }
    }

    XLSX.writeFile(workbook, filePath);
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
