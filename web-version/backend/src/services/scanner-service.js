import path from 'path';
import { identifyMonth } from './month-utils.js';

export function scanUploadedFiles(pdfFiles, categoryMapping = {}, monthFilter = null) {
  const result = { months: {} };
  const filterInfo = monthFilter ? identifyMonth(monthFilter) : null;

  for (const file of pdfFiles) {
    const relativePath = file.relativePath || file.originalname;
    const parts = relativePath.split(/[\\/]/).filter(Boolean);
    if (parts.length < 3) continue;

    const monthFolder = parts[0];
    const categoryFolder = parts[1];
    const monthInfo = identifyMonth(monthFolder);
    if (!monthInfo) continue;
    if (filterInfo && filterInfo.index !== monthInfo.index) continue;

    const monthKey = monthInfo.standardName;
    if (!result.months[monthKey]) {
      result.months[monthKey] = {
        index: monthInfo.index,
        originalName: monthFolder,
        categories: {}
      };
    }

    const categoryName = categoryMapping[categoryFolder] || categoryFolder;
    if (!result.months[monthKey].categories[categoryName]) {
      result.months[monthKey].categories[categoryName] = [];
    }

    result.months[monthKey].categories[categoryName].push({
      fileName: path.basename(relativePath),
      relativePath,
      buffer: file.buffer
    });
  }

  return result;
}
