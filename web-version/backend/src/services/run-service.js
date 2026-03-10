import { scanUploadedFiles } from './scanner-service.js';
import { extractAmountFromPdfBuffer } from './parser-service.js';

export async function runProject({ project, pdfFiles }) {
  // eslint-disable-next-line no-console
  console.log(`[run] Processing ${pdfFiles.length} files for project "${project?.name || 'unnamed'}"`);
  for (const f of pdfFiles.slice(0, 5)) {
    // eslint-disable-next-line no-console
    console.log('[run]   file: originalname=' + f.originalname + ' relativePath=' + (f.relativePath || '(none)'));
  }

  const scanResult = scanUploadedFiles(
    pdfFiles,
    project?.categoryMapping || {},
    project?.monthFilter || null
  );

  const monthKeys = Object.keys(scanResult.months);
  // eslint-disable-next-line no-console
  console.log(`[run] Scanner found ${monthKeys.length} months: ${monthKeys.join(', ')}`);

  const summary = {
    project: project?.name || 'Unnamed project',
    files: [],
    totals: {},
    conflicts: [],
    stats: { done: 0, skipped: 0, failed: 0, ambiguous: 0, total: 0 }
  };

  const months = Object.keys(scanResult.months);
  summary.stats.total = months.reduce((acc, month) => {
    const monthCategories = Object.values(scanResult.months[month].categories);
    return acc + monthCategories.reduce((inner, files) => inner + files.length, 0);
  }, 0);

  for (const monthName of months) {
    if (!summary.totals[monthName]) summary.totals[monthName] = {};
    for (const [categoryName, files] of Object.entries(scanResult.months[monthName].categories)) {
      let categoryTotal = 0;
      for (const file of files) {
        const result = await extractAmountFromPdfBuffer(file.buffer);
        // eslint-disable-next-line no-console
        console.log(`[run]   ${file.fileName}: ${result.status} ${result.amount || 0} (${result.message || ''})`);
        const fileInfo = {
          month: monthName,
          category: categoryName,
          fileName: file.fileName,
          filePath: file.relativePath,
          status: result.status,
          amount: result.amount || 0,
          message: result.message
        };
        summary.files.push(fileInfo);

        if (result.status === 'success') {
          categoryTotal += result.amount;
          summary.stats.done += 1;
        } else if (result.status === 'ambiguous') {
          summary.stats.ambiguous += 1;
          const nums = (result.candidates || []).map(c => typeof c === 'object' ? c.amount : c);
          summary.conflicts.push({ ...fileInfo, type: 'ambiguity', candidates: nums });
        } else {
          summary.stats.failed += 1;
          const nums = (result.candidates || []).map(c => typeof c === 'object' ? c.amount : c);
          summary.conflicts.push({ ...fileInfo, type: 'failure', candidates: nums });
        }
      }
      summary.totals[monthName][categoryName] = categoryTotal;
    }
  }

  return summary;
}
