import path from 'path'
import { identifyMonth } from './month-utils.js'

export function scanUploadedFiles(pdfFiles, categoryMapping = {}, monthFilter = null) {
  const result = { months: {} }
  const filterInfo = monthFilter ? identifyMonth(monthFilter) : null

  for (const file of pdfFiles) {
    const relativePath = file.relativePath || file.originalname
    const parts = relativePath.split(/[\\/]/).filter(Boolean)
    if (parts.length < 3) continue

    const monthInfo = findMonthInPath(parts)
    if (!monthInfo) continue
    if (filterInfo && filterInfo.index !== monthInfo.index) continue

    const monthKey = monthInfo.standardName
    if (!result.months[monthKey]) {
      result.months[monthKey] = {
        index: monthInfo.index,
        originalName: monthInfo.folderName,
        categories: {}
      }
    }

    const categoryFolder = monthInfo.categoryFolder
    const categoryName = categoryMapping[categoryFolder] || categoryFolder
    if (!result.months[monthKey].categories[categoryName]) {
      result.months[monthKey].categories[categoryName] = []
    }

    result.months[monthKey].categories[categoryName].push({
      fileName: path.basename(relativePath),
      relativePath,
      buffer: file.buffer
    })
  }

  return result
}

export function findMonthInPath(parts) {
  for (let i = 0; i < parts.length - 2; i++) {
    const monthInfo = identifyMonth(parts[i])
    if (monthInfo) {
      return {
        ...monthInfo,
        folderName: parts[i],
        categoryFolder: parts[i + 1],
        fileRelativePath: parts.slice(i + 2).join('/')
      }
    }
  }
  return null
}
