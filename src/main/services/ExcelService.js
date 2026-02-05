import ExcelJS from 'exceljs';
import fs from 'fs';

/**
 * Service to interact with Excel files.
 */
export default class ExcelService {
  /**
   * Updates an Excel sheet with the extracted totals.
   * @param {string} filePath - Path to the Excel file.
   * @param {string} sheetName - Name of the worksheet.
   * @param {Object} mapping - Mapping of months and categories to cells.
   *   Example mapping: {
   *     monthStartCell: 'B1', // January
   *     categoryColumn: 'A', // Where category labels are
   *     categoryMap: { 'Category1': 2, 'Category2': 3 } // Row numbers for categories
   *   }
   * @param {Object} data - Processed data { monthName: { categoryName: total } }
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
    const startRow = startCell.row;
    const startCol = startCell.col;

    // Standard English month order to find offsets
    const monthOrder = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

    for (const [monthName, categories] of Object.entries(data)) {
      const monthIdx = monthOrder.indexOf(monthName.toLowerCase());
      if (monthIdx === -1) continue;

      // Calculate column offset from January start cell
      // Note: This logic assumes January is the start cell. 
      // If user selected March as start cell, we need to adjust offset.
      // For now, let's assume the user mapped the "first available month" in their sheet.
      const col = startCol + monthIdx;

      for (const [categoryName, total] of Object.entries(categories)) {
        const row = categoryRows[categoryName];
        if (row) {
          const cell = worksheet.getRow(row).getCell(col);
          cell.value = total;
          cell.numFmt = '#,##0.00'; // Format as currency/number
        }
      }
    }

    await workbook.xlsx.writeFile(filePath);
  }

  /**
   * Helper to list tabs in a workbook.
   * @param {string} filePath 
   * @returns {Promise<string[]>}
   */
  async getSheetNames(filePath) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);
      return workbook.worksheets.map(ws => ws.name);
  }

  /**
   * Helper to scan a sheet for potential category rows.
   * @param {string} filePath 
   * @param {string} sheetName 
   * @param {string} categoryColumn 
   * @returns {Promise<Object>} - { label: rowNumber }
   */
  async findCategories(filePath, sheetName, categoryColumn = 'A') {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);
      const worksheet = workbook.getWorksheet(sheetName);
      
      const categories = {};
      worksheet.eachRow((row, rowNumber) => {
          const value = row.getCell(categoryColumn).value;
          if (value && typeof value === 'string') {
              categories[value] = rowNumber;
          }
      });
      return categories;
  }
}

export { ExcelService };
