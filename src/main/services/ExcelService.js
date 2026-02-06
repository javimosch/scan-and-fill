import ExcelJS from 'exceljs';
import fs from 'fs';
import { ScannerService } from './ScannerService.js';

/**
 * Service to interact with Excel files.
 */
export default class ExcelService {
  /**
   * Updates an Excel sheet with the extracted totals.
   */
  async updateSheet(filePath, sheetName, mapping, data) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    
    const worksheet = workbook.getWorksheet(sheetName);
    if (!worksheet) {
      throw new Error(`Worksheet not found: ${sheetName}`);
    }

    const { monthStartCell, categoryColumn, categoryRows } = mapping;
    const startCell = worksheet.getCell(monthStartCell);
    const startCol = startCell.col;
    
    // 1. Identify the base month from the start cell
    const baseMonthValue = startCell.value ? startCell.value.toString() : '';
    const scanner = new ScannerService();
    const baseMonthInfo = scanner.identifyMonth(baseMonthValue);
    
    // If we can't identify the base month, fallback to January (index 0)
    const baseMonthIdx = baseMonthInfo ? baseMonthInfo.index : 0;

    for (const [monthName, categories] of Object.entries(data)) {
      const monthInfo = scanner.identifyMonth(monthName);
      if (!monthInfo) continue;

      const currentMonthIdx = monthInfo.index;
      
      // 2. Calculate column offset relative to the base month
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

  /**
   * Gets comprehensive metadata from an Excel file.
   */
  async getMetadata(filePath, sheetName, categoryColumn = 'A', monthStartCell = 'B1') {
      if (!fs.existsSync(filePath)) return { tabs: [], categories: {}, months: [] };

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
              } catch (e) {
                  // Ignore invalid columns during row iteration
              }
          });
      }

      const months = [];
      const scanner = new ScannerService();
      try {
          const startCell = worksheet.getCell(monthStartCell);
          const startCol = startCell.col;
          const startRow = startCell.row;

          // Scan next 12 columns for months
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
      } catch (e) {
          console.error('Error scanning months:', e);
      }

      return { tabs, categories, months };
  }

  /**
   * @deprecated Use getMetadata
   */
  async getSheetNames(filePath) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);
      return workbook.worksheets.map(ws => ws.name);
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
