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
      // e.g. Base is Feb (1), Current is March (2) -> Offset = 1
      const colOffset = currentMonthIdx - baseMonthIdx;
      
      // Only process if the month is at or after the start cell (or handle negative if needed)
      // For now, assume sequential months to the right.
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

  async getSheetNames(filePath) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);
      return workbook.worksheets.map(ws => ws.name);
  }

  async findCategories(filePath, sheetName, categoryColumn = 'A') {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);
      const worksheet = workbook.getWorksheet(sheetName);
      
      const categories = {};
      worksheet.eachRow((row, rowNumber) => {
          const value = row.getCell(categoryColumn).value;
          if (value && typeof value === 'string') {
              // Trim to match exactly
              categories[value.trim()] = rowNumber;
          }
      });
      return categories;
  }
}

export { ExcelService };
