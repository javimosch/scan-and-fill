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

    // "Only analyze mapping" mode: report which discovered categories map to a
    // spreadsheet row (and which don't) without parsing any PDFs.
    if (project.mappingOnly) {
      const report = this.buildMappingReport(scanResult, project);
      onProgress({ status: 'mapping-results', message: 'Mapping analysis complete.', mappingReport: report });
      return report;
    }

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
            categoryTotal += result.amount; // avoirs come through as negative amounts
            summary.stats.done += result.skipped ? 0 : 1;
            if (result.skipped) summary.stats.skipped++;
          } else if (result.status === 'skip' || result.excluded) {
            // statement / payment-notice: intentionally excluded, not a conflict
            fileInfo.status = 'skip';
            summary.stats.skipped++;
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
   * Builds a category-mapping report from a scan result: for each discovered
   * category, how many files and which months it appears in, and whether it
   * maps to a spreadsheet row (via excelConfig.categoryRowsMap).
   */
  buildMappingReport(scanResult, project) {
    const categoryRowsMap = project.excelConfig?.categoryRowsMap || {};
    const cats = {};
    for (const [monthName, monthData] of Object.entries(scanResult.months)) {
      for (const [categoryName, filePaths] of Object.entries(monthData.categories)) {
        if (!cats[categoryName]) cats[categoryName] = { category: categoryName, fileCount: 0, months: [] };
        cats[categoryName].fileCount += filePaths.length;
        if (!cats[categoryName].months.includes(monthName)) cats[categoryName].months.push(monthName);
      }
    }
    const categories = Object.values(cats)
      .map((c) => ({ ...c, mappedRow: categoryRowsMap[c.category] ?? null }))
      .sort((a, b) => b.fileCount - a.fileCount);
    const mappedCount = categories.filter((c) => c.mappedRow != null && c.mappedRow !== '').length;
    return {
      months: Object.keys(scanResult.months),
      categories,
      totalFiles: categories.reduce((a, c) => a + c.fileCount, 0),
      mappedCount,
      unmappedCount: categories.length - mappedCount
    };
  }

  /**
   * Persists a single resolved/edited amount to the project cache so that a later
   * resume (project / month / all) skips it instead of re-asking. Stored as a
   * successful entry keyed by file path + mtime.
   */
  cacheResolution(projectId, filePath, amount) {
    try {
      this.cache.updateEntry(projectId, filePath, { amount, status: 'success', resolved: true });
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Builds a review summary for an existing project WITHOUT parsing any PDFs:
   * lists the folder structure and joins each file with its cached amount. Lets
   * the UI open a project to edit amounts / fix conflicts without re-scanning.
   */
  async loadCachedState(project) {
    const scanResult = await this.scanner.scan(project.rootPath, {
      ...project.categoryMapping,
      monthFilter: project.monthFilter
    });
    const cache = this.cache.getCache(project.id);

    const summary = {
      projects: project.name,
      files: [],
      totals: {},
      conflicts: [],
      stats: { done: 0, skipped: 0, failed: 0, ambiguous: 0, total: 0 }
    };

    for (const monthName of Object.keys(scanResult.months)) {
      const monthData = scanResult.months[monthName];
      if (!summary.totals[monthName]) summary.totals[monthName] = {};

      for (const [categoryName, filePaths] of Object.entries(monthData.categories)) {
        let categoryTotal = 0;
        for (const filePath of filePaths) {
          summary.stats.total++;
          const fileName = filePath.split('/').pop();
          const entry = cache[filePath];
          const hasAmount = entry && entry.status === 'success' && typeof entry.amount === 'number';
          const fileInfo = {
            month: monthName,
            category: categoryName,
            fileName,
            filePath,
            status: hasAmount ? (entry.resolved ? 'resolved' : 'success') : 'pending',
            amount: hasAmount ? entry.amount : 0,
            message: hasAmount ? 'From cache' : 'Not yet extracted'
          };
          summary.files.push(fileInfo);

          if (hasAmount) {
            categoryTotal += entry.amount;
            summary.stats.done++;
          } else {
            summary.stats.failed++;
            summary.conflicts.push({ ...fileInfo, candidates: [], type: 'pending' });
          }
        }
        summary.totals[monthName][categoryName] = categoryTotal;
      }
    }

    return summary;
  }

  /**
   * Extracts a single file on demand (e.g. to fix a conflict from the review
   * screen without re-scanning the whole project). Caches success.
   */
  async extractSingleFile(project, filePath) {
    const result = await this.parser.extractAmount(filePath);
    if (result.status === 'success') {
      this.cache.updateEntry(project.id, filePath, { amount: result.amount, status: 'success' });
    }
    return result;
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
            // persist the resolution so a future resume keeps it
            this.cacheResolution(project.id, f.filePath, f.resolvedAmount);
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
