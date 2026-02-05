import ScannerService from './ScannerService.js';
import ParserService from './ParserService.js';
import ExcelService from './ExcelService.js';
import DocumentCacheService from './DocumentCacheService.js';

/**
 * Main orchestrator for the scan-and-fill process.
 */
export default class MainService {
  constructor() {
    this.scanner = new ScannerService();
    this.parser = new ParserService();
    this.excel = new ExcelService();
    this.cache = new DocumentCacheService();
  }

  /**
   * Runs the full scan and extract process.
   * Collects results and identifies conflicts that need user attention.
   */
  async runProcess(projectConfig, onProgress = () => {}) {
    const { id: projectId, rootPath, categoryMapping, excelConfig, forceRescan } = projectConfig;

    if (forceRescan) {
        this.cache.clearCache(projectId);
    }

    onProgress({ status: 'scanning', message: 'Scanning directory structure...' });
    const scanResult = await this.scanner.scan(rootPath, categoryMapping);

    const totalCategories = Object.values(scanResult.months).reduce((acc, m) => acc + Object.keys(m.categories).length, 0);
    let processedCategories = 0;

    const summary = {
        projectId,
        months: {},
        conflicts: [] // Files that need manual review
    };

    for (const [monthName, monthData] of Object.entries(scanResult.months)) {
      summary.months[monthName] = {
          categories: {},
          originalName: monthData.originalName
      };

      for (const [categoryName, filePaths] of Object.entries(monthData.categories)) {
        onProgress({ 
            status: 'parsing', 
            message: `Processing ${monthName} - ${categoryName}...`,
            progress: (processedCategories / totalCategories) * 100
        });

        let categoryTotal = 0;
        for (const filePath of filePaths) {
            // Check Cache
            const cached = this.cache.getValidEntry(projectId, filePath);
            if (cached) {
                categoryTotal += cached.extractedAmount;
                continue;
            }

            // Extract
            const result = await this.parser.extractAmount(filePath);
            
            if (result.status === 'success') {
                categoryTotal += result.amount;
                // Save to Cache
                this.cache.updateEntry(projectId, filePath, {
                    extractedAmount: result.amount,
                    status: 'success'
                });
            } else {
                // Buffer the conflict for user resolution
                summary.conflicts.push({
                    month: monthName,
                    category: categoryName,
                    filePath,
                    fileName: filePath.split('/').pop(),
                    status: result.status,
                    candidates: result.candidates,
                    message: result.message
                });
            }
        }
        
        summary.months[monthName].categories[categoryName] = categoryTotal;
        processedCategories++;
      }
    }

    onProgress({ status: 'waiting-resolutions', message: 'Waiting for manual resolutions...', summary });
    return summary;
  }

  /**
   * Finalizes the process after conflicts are resolved.
   */
  async finalizeProcess(projectConfig, finalSummary) {
    const { excelConfig, id: projectId } = projectConfig;
    
    // 1. Update Cache for resolved items
    for (const conflict of finalSummary.conflicts) {
        if (conflict.resolvedAmount !== undefined) {
            this.cache.updateEntry(projectId, conflict.filePath, {
                extractedAmount: conflict.resolvedAmount,
                status: 'success'
            });
            
            // Add to the monthly total in summary
            finalSummary.months[conflict.month].categories[conflict.category] += conflict.resolvedAmount;
        }
    }

    // 2. Format data for ExcelService
    const excelData = {};
    for (const [month, data] of Object.entries(finalSummary.months)) {
        excelData[month] = data.categories;
    }

    const excelMapping = {
      monthStartCell: excelConfig.monthStartCell,
      categoryColumn: excelConfig.categoryColumn,
      categoryRows: excelConfig.categoryRowsMap
    };

    await this.excel.updateSheet(
      excelConfig.filePath,
      excelConfig.sheetName,
      excelMapping,
      excelData
    );

    return { status: 'done', message: 'Excel updated successfully!' };
  }

  /**
   * Helper to get data needed for mapping configuration.
   */
  async getExcelMetadata(filePath, sheetName, categoryColumn) {
      const tabs = await this.excel.getSheetNames(filePath);
      let categories = {};
      if (sheetName) {
          categories = await this.excel.findCategories(filePath, sheetName, categoryColumn);
      }
      return { tabs, categories };
  }
}

export { MainService };
