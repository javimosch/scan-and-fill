import { ScannerService } from './ScannerService.js';
import { ParserService } from './ParserService.js';
import { ExcelService } from './ExcelService.js';
import { DocumentCacheService } from './DocumentCacheService.js';
import fs from 'fs';

export default class MainService {
  constructor() {
    this.scanner = new ScannerService();
    this.parser = new ParserService();
    this.excel = new ExcelService();
    this.cache = new DocumentCacheService();
  }

  /**
   * Proxies Excel metadata extraction.
   */
  async getExcelMetadata(filePath, sheetName, categoryColumn, monthStartCell) {
    return this.excel.getMetadata(filePath, sheetName, categoryColumn, monthStartCell);
  }

  /**
   * Orchestrates the document scanning and parsing process.
   */
  async runProcess(project, onProgress) {
    onProgress({ status: 'scanning', message: 'Scanning directory structure...' });

    // Pass monthFilter via project if it exists
    const scanResult = await this.scanner.scan(project.rootPath, {
        ...project.categoryMapping,
        monthFilter: project.monthFilter
    });

    const summary = {
      projects: project.name,
      files: [], // { month, category, fileName, status, amount, candidates, message }
      totals: {}, // { month: { category: amount } }
      conflicts: [],
      stats: { done: 0, skipped: 0, failed: 0, ambiguous: 0, total: 0 }
    };

    const monthsToProcess = Object.keys(scanResult.months);
    let processedFiles = 0;
    const totalFiles = monthsToProcess.reduce((acc, m) => 
        acc + Object.values(scanResult.months[m].categories).reduce((acc2, c) => acc2 + c.length, 0), 0
    );

    summary.stats.total = totalFiles;

    for (const monthName of monthsToProcess) {
      const monthData = scanResult.months[monthName];
      if (!summary.totals[monthName]) summary.totals[monthName] = {};

      for (const [categoryName, filePaths] of Object.entries(monthData.categories)) {
        let categoryTotal = 0;

        for (const filePath of filePaths) {
          processedFiles++;
          const fileName = filePath.split('/').pop();
          
          onProgress({ 
            status: 'parsing', 
            message: `Parsing ${fileName}...`, 
            progress: Math.round((processedFiles / totalFiles) * 100) 
          });

          // 1. Check Caching
          let result = null;
          if (!project.forceRescan) {
            const cached = this.cache.getValidEntry(project.id, filePath);
            if (cached) {
              result = { status: 'success', amount: cached.amount, skipped: true };
            }
          }

          // 2. Extract if not cached
          if (!result) {
            result = await this.parser.extractAmount(filePath);
            if (result.status === 'success') {
              this.cache.updateEntry(project.id, filePath, {
                amount: result.amount,
                status: 'success'
              });
            }
          }

          const fileInfo = {
            month: monthName,
            category: categoryName,
            fileName,
            filePath,
            status: result.skipped ? 'skip' : result.status,
            amount: result.amount || 0,
            message: result.message
          };

          summary.files.push(fileInfo);

          if (result.status === 'success') {
            categoryTotal += result.amount;
            summary.stats.done += result.skipped ? 0 : 1;
            if (result.skipped) summary.stats.skipped++;
          } else if (result.status === 'ambiguous') {
            summary.stats.ambiguous++;
            summary.conflicts.push({
              ...fileInfo,
              candidates: result.candidates,
              type: 'ambiguity'
            });
          } else {
            summary.stats.failed++;
            summary.conflicts.push({
              ...fileInfo,
              candidates: result.candidates || [],
              type: 'failure'
            });
          }
        }
        summary.totals[monthName][categoryName] = categoryTotal;
      }
    }

    if (summary.conflicts.length > 0) {
      onProgress({ status: 'waiting-resolutions', message: 'Conflicts detected. Please resolve them.', summary });
    } else {
      onProgress({ status: 'review-results', message: 'Scan complete. Review results.', summary });
    }

    return summary;
  }

  /**
   * Finalizes the process by updating the Excel file.
   */
  async finalizeProcess(project, summary) {
    // Re-calculate totals based on resolutions
    const finalTotals = { ...summary.totals };
    
    summary.files.forEach(f => {
        if (f.resolvedAmount !== undefined) {
            if (!finalTotals[f.month]) finalTotals[f.month] = {};
            if (!finalTotals[f.month][f.category]) finalTotals[f.month][f.category] = 0;
            finalTotals[f.month][f.category] += f.resolvedAmount;
        }
    });

    const mapping = {
      monthStartCell: project.excelConfig.monthStartCell,
      categoryColumn: project.excelConfig.categoryColumn,
      categoryRows: project.excelConfig.categoryRowsMap
    };

    await this.excel.updateSheet(
      project.excelConfig.filePath,
      project.excelConfig.sheetName,
      mapping,
      finalTotals
    );

    return { success: true };
  }

  getManualEntry(filePath) {
    return this.parser.cache.getManualEntry(filePath);
  }

  setManualEntry(filePath, amount) {
    return this.parser.cache.setManualEntry(filePath, amount);
  }
}
