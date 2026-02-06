import fs from 'fs';
import path from 'path';

/**
 * Service to scan directory structures and identify months/categories.
 */
export default class ScannerService {
  /**
   * Month patterns including abbreviations for English, French, and Spanish.
   */
  static MONTH_RULES = [
    { index: 0, en: ['january', 'jan'], fr: ['janvier', 'janv'], es: ['enero', 'ene'] },
    { index: 1, en: ['february', 'feb'], fr: ['fevrier', 'février', 'fevr', 'févr'], es: ['febrero', 'feb'] },
    { index: 2, en: ['march', 'mar'], fr: ['mars'], es: ['marzo', 'mar'] },
    { index: 3, en: ['april', 'apr'], fr: ['avril', 'avr'], es: ['abril', 'abr'] },
    { index: 4, en: ['may'], fr: ['mai'], es: ['mayo'] },
    { index: 5, en: ['june', 'jun'], fr: ['juin'], es: ['junio', 'jun'] },
    { index: 6, en: ['july', 'jul'], fr: ['juillet', 'juil'], es: ['julio', 'jul'] },
    { index: 7, en: ['august', 'aug'], fr: ['aout', 'août'], es: ['agosto', 'ago'] },
    { index: 8, en: ['september', 'sep', 'sept'], fr: ['septembre', 'sept'], es: ['septiembre', 'sep', 'sept'] },
    { index: 9, en: ['october', 'oct'], fr: ['octobre', 'oct'], es: ['octubre', 'oct'] },
    { index: 10, en: ['november', 'nov'], fr: ['novembre', 'nov'], es: ['noviembre', 'nov'] },
    { index: 11, en: ['december', 'dec'], fr: ['decembre', 'décembre', 'dec', 'déc'], es: ['diciembre', 'dic'] }
  ];

  /**
   * Scans the root folder for month directories and category sub-folders.
   * @param {string} rootPath - The root path to scan.
   * @param {Object} categoryMapping - Optional mapping of folder name to category label.
   * @returns {Promise<Object>} - A structured object containing detected files by month and category.
   */
  async scan(rootPath, categoryMapping = {}) {
    if (!fs.existsSync(rootPath)) {
      throw new Error(`Path does not exist: ${rootPath}`);
    }

    const result = {
      projectRoot: rootPath,
      months: {}
    };

    const topLevelFolders = fs.readdirSync(rootPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    for (const folderName of topLevelFolders) {
      const monthInfo = this.identifyMonth(folderName);
      if (monthInfo) {
        // Apply month filter if provided
        if (categoryMapping && categoryMapping.monthFilter) {
            const filterInfo = this.identifyMonth(categoryMapping.monthFilter);
            if (filterInfo && filterInfo.index !== monthInfo.index) {
                continue;
            }
        }

        const monthKey = monthInfo.standardName; // English full name
        if (!result.months[monthKey]) {
          result.months[monthKey] = {
            index: monthInfo.index,
            originalName: folderName,
            categories: {}
          };
        }

        const monthPath = path.join(rootPath, folderName);
        const categoryFolders = fs.readdirSync(monthPath, { withFileTypes: true })
          .filter(dirent => dirent.isDirectory())
          .map(dirent => dirent.name);

        for (const catFolderName of categoryFolders) {
          const categoryName = categoryMapping[catFolderName] || catFolderName;
          const categoryPath = path.join(monthPath, catFolderName);
          
          const pdfFiles = fs.readdirSync(categoryPath)
            .filter(file => file.toLowerCase().endsWith('.pdf'))
            .map(file => path.join(categoryPath, file));

          if (pdfFiles.length > 0) {
            if (!result.months[monthKey].categories[categoryName]) {
              result.months[monthKey].categories[categoryName] = [];
            }
            result.months[monthKey].categories[categoryName].push(...pdfFiles);
          }
        }
      }
    }

    return result;
  }

  /**
   * Identifies if a folder name matches a month in supported languages.
   * @param {string} folderName 
   * @returns {Object|null} - Month metadata.
   */
  identifyMonth(folderName) {
    const normalized = folderName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    for (const rule of ScannerService.MONTH_RULES) {
      const variants = [
        ...rule.en,
        ...rule.fr.map(m => m.normalize("NFD").replace(/[\u0300-\u036f]/g, "")),
        ...rule.es
      ];

      // Check if the folder name contains any of the variants as a separate word or at start
      // Example: "January 2026", "01-Jan", "Enero"
      const regex = new RegExp(`(^|[^a-z])(${variants.join('|')})([^a-z]|$)`, 'i');
      if (regex.test(normalized)) {
        return {
          index: rule.index,
          standardName: rule.en[0]
        };
      }
    }
    return null;
  }
}

// Fixed aligned months for easier mapping
ScannerService.MONTHS_MAPPING = [
    { en: 'january', fr: 'janvier', es: 'enero' },
    { en: 'february', fr: 'fevrier', es: 'febrero' },
    { en: 'march', fr: 'mars', es: 'marzo' },
    { en: 'april', fr: 'avril', es: 'abril' },
    { en: 'may', fr: 'mai', es: 'mayo' },
    { en: 'june', fr: 'juin', es: 'junio' },
    { en: 'july', fr: 'juillet', es: 'julio' },
    { en: 'august', fr: 'aout', es: 'agosto' },
    { en: 'september', fr: 'septembre', es: 'septiembre' },
    { en: 'october', fr: 'octobre', es: 'octubre' },
    { en: 'november', fr: 'novembre', es: 'noviembre' },
    { en: 'december', fr: 'decembre', es: 'diciembre' }
];

export { ScannerService };
