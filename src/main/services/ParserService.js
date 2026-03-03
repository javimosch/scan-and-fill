import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { PDFParse } from 'pdf-parse';
import Tesseract from 'tesseract.js';
import { app } from 'electron';
import CacheService from './CacheService.js';
import AIDetectionService from './AIDetectionService.js';
import SettingsService from './SettingsService.js';
import LoggingService from './LoggingService.js';

// DOMMatrix polyfill for Node.js environment (fallback)
if (typeof globalThis.DOMMatrix === 'undefined') {
  try {
    // Try to use @napi-rs/canvas DOMMatrix if available
    const canvas = require('@napi-rs/canvas');
    if (canvas.DOMMatrix) {
      globalThis.DOMMatrix = canvas.DOMMatrix;
    }
  } catch (error) {
    // Minimal DOMMatrix polyfill as fallback
    globalThis.DOMMatrix = class DOMMatrix {
      constructor(a = 1, b = 0, c = 0, d = 1, e = 0, f = 0) {
        if (typeof a === 'object') {
          this.a = a.a || 1;
          this.b = a.b || 0;
          this.c = a.c || 0;
          this.d = a.d || 1;
          this.e = a.e || 0;
          this.f = a.f || 0;
        } else {
          this.a = a;
          this.b = b;
          this.c = c;
          this.d = d;
          this.e = e;
          this.f = f;
        }
      }
      
      scaleSelf(sx, sy = sx) {
        this.a *= sx;
        this.d *= sy;
        return this;
      }
      
      translateSelf(tx, ty) {
        this.e += tx;
        this.f += ty;
        return this;
      }
      
      invertSelf() {
        const det = this.a * this.d - this.b * this.c;
        if (det === 0) throw new Error('Matrix cannot be inverted');
        
        const a = this.a;
        this.a = this.d / det;
        this.d = a / det;
        this.b = -this.b / det;
        this.c = -this.c / det;
        
        const e = this.e;
        const f = this.f;
        this.e = (this.c * f - this.d * e) / det;
        this.f = (this.b * e - this.a * f) / det;
        
        return this;
      }
      
      multiplySelf(other) {
        const a = this.a * other.a + this.c * other.b;
        const b = this.b * other.a + this.d * other.b;
        const c = this.a * other.c + this.c * other.d;
        const d = this.b * other.c + this.d * other.d;
        const e = this.a * other.e + this.c * other.f + this.e;
        const f = this.b * other.e + this.d * other.f + this.f;
        
        this.a = a;
        this.b = b;
        this.c = c;
        this.d = d;
        this.e = e;
        this.f = f;
        
        return this;
      }
      
      preMultiplySelf(other) {
        return this.multiplySelf(other);
      }
    };
  }
}

/**
 * Service to extract currency amounts from PDF files with ambiguity detection.
 */
export default class ParserService {
  constructor() {
    this._cache = null;
    this._aiDetection = new AIDetectionService();
    this._settings = new SettingsService();
    this._logger = new LoggingService();
  }

  // Lazy-initialize cache to avoid accessing electron.app before it's ready
  get cache() {
    if (!this._cache) {
      this._cache = new CacheService();
    }
    return this._cache;
  }

  /**
   * Extracts the total amount from a PDF file.
   * @param {string} filePath - Path to the PDF file.
   * @param {Object} options - Configuration for extraction patterns.
   * @returns {Promise<Object>} - The extraction result object.
   */
  async extractAmount(filePath, options = {}) {
    let parser = null;
    const startTime = Date.now();
    
    this._logger.info(`Starting PDF extraction for: ${path.basename(filePath)}`);
    
    try {
      // Check if file exists and is readable
      if (!fs.existsSync(filePath)) {
        const error = new Error(`File not found: ${filePath}`);
        this._logger.logPDFError(filePath, error, { phase: 'file_check' });
        return { status: 'failed', amount: 0, candidates: [], message: error.message };
      }

      const stats = fs.statSync(filePath);
      this._logger.info(`File stats: ${stats.size} bytes, modified: ${stats.mtime}`);

      const dataBuffer = fs.readFileSync(filePath);
      this._logger.debug(`Buffer size: ${dataBuffer.length} bytes`);
      
      parser = new PDFParse({ data: dataBuffer });
      this._logger.debug('PDFParse instance created');
      
      const data = await parser.getText();
      this._logger.debug(`PDF text extracted, length: ${data.text?.length || 0} characters`);
      
      let text = data.text;

      // Detect scanned PDFs (no text or very little text)
      if (!text || text.trim().length < 50) {
          this._logger.info(`Normal extraction failed (text length: ${text?.length || 0}). Triggering OCR...`);
          this._logger.logOCRAttempt(filePath, this.getPageCount(filePath), 1);
          
          try {
            text = await this.performOCR(filePath);
            this._logger.info(`OCR completed, extracted ${text.length} characters`);
          } catch (ocrError) {
            this._logger.logOCRFailure(filePath, ocrError, 1);
            throw ocrError;
          }
      }

      let result = this.findAmountInText(text, options.pattern);
      this._logger.info(`Amount extraction result: ${result.status}, candidates: ${result.candidates?.length || 0}`);
      
      // AI Detection Fallback
      if (this._aiDetection.shouldUseFallback(result.status, this.getPageCount(filePath))) {
        this._logger.info(`OCR result: ${result.status}. Triggering AI detection fallback...`);
        
        try {
          const aiSettings = this._settings.getAIDetectionSettings();
          this._aiDetection.initialize(aiSettings);
          
          const pdfContext = {
            fileName: path.basename(filePath),
            pageCount: this.getPageCount(filePath)
          };
          
          this._logger.logAIDetectionAttempt(filePath, text.length);
          const aiResult = await this._aiDetection.extractAmountFromText(text, pdfContext);
          
          if (aiResult.status === 'success') {
            this._logger.logAIDetectionSuccess(filePath, aiResult.amount, aiResult.confidence || 'unknown');
            return {
              ...aiResult,
              method: 'ai',
              fallback: true,
              originalResult: result
            };
          } else {
            this._logger.logAIDetectionFailure(filePath, new Error(aiResult.message || 'AI detection failed'));
            return {
              ...result,
              method: 'ocr',
              fallbackAttempted: true,
              fallbackError: aiResult.message
            };
          }
        } catch (aiError) {
          this._logger.logAIDetectionFailure(filePath, aiError);
          return {
            ...result,
            method: 'ocr',
            fallbackAttempted: true,
            fallbackError: aiError.message
          };
        }
      }

      const duration = Date.now() - startTime;
      this._logger.info(`PDF extraction completed in ${duration}ms with status: ${result.status}`);

      return {
        ...result,
        method: 'ocr',
        fallbackAttempted: false
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const context = {
        phase: 'pdf_extraction',
        duration: duration,
        fileSize: fs.existsSync(filePath) ? fs.statSync(filePath).size : 0,
        pdfParseVersion: require('pdf-parse/package.json').version
      };
      
      this._logger.logPDFError(filePath, error, context);
      
      return { 
        status: 'failed', 
        amount: 0, 
        candidates: [], 
        message: error.message,
        error: error.stack
      };
    } finally {
      if (parser) {
        try {
          await parser.destroy();
          this._logger.debug('PDFParse instance destroyed');
        } catch (destroyError) {
          this._logger.warn('Failed to destroy PDFParse instance:', destroyError);
        }
      }
    }
  }

  /**
   * Performs OCR on the PDF by converting pages to images first.
   * Checks cache first to avoid re-processing.
   */
  async performOCR(filePath) {
      // Check cache first
      const cachedText = this.cache.getOCRCache(filePath);
      if (cachedText) {
          this._logger.info(`Using cached OCR result for ${path.basename(filePath)} (${cachedText.length} characters)`);
          return cachedText;
      }

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-'));
      this._logger.info(`Created temporary OCR directory: ${tempDir}`);
      
      try {
          const baseName = path.basename(filePath, '.pdf');
          const outputPrefix = path.join(tempDir, 'page');
          
          this._logger.info(`Converting PDF to images for ${path.basename(filePath)}...`);
          
          // Use pdftoppm (fast system tool) to convert PDF to PNG
          // We convert at 300 DPI for better OCR quality
          // On Windows, use bundled poppler binaries
          let pdftoppmCommand;
          if (process.platform === 'win32') {
            // Use bundled pdftoppm.exe on Windows
            const isDev = !app.isPackaged;
            const popplerPath = isDev 
              ? path.join(process.cwd(), 'build', 'poppler-windows', 'poppler-25.12.0', 'Library', 'bin', 'pdftoppm.exe')
              : path.join(process.resourcesPath, 'poppler-windows', 'poppler-25.12.0', 'Library', 'bin', 'pdftoppm.exe');
            
            // Validate binary exists
            if (!fs.existsSync(popplerPath)) {
              const error = new Error(`Poppler binary not found at ${popplerPath}. Please ensure poppler-windows is properly bundled.`);
              this._logger.error(`Poppler binary missing: ${popplerPath}`);
              throw error;
            }
            
            this._logger.info(`Using poppler binary: ${popplerPath}`);
            pdftoppmCommand = `"${popplerPath}"`;
          } else {
            // Use system pdftoppm on Linux/macOS
            pdftoppmCommand = 'pdftoppm';
            this._logger.info('Using system pdftoppm command');
          }
          
          const convertCommand = `${pdftoppmCommand} -png -r 600 "${filePath}" "${outputPrefix}"`;
          this._logger.debug(`Executing: ${convertCommand}`);
          
          execSync(convertCommand);
          this._logger.info('PDF to image conversion completed');

          const files = fs.readdirSync(tempDir)
              .filter(f => f.startsWith('page') && f.endsWith('.png'))
              .sort();

          this._logger.info(`Found ${files.length} page images to process`);

          let fullText = '';
          
          for (let i = 0; i < files.length; i++) {
              const file = files[i];
              const imagePath = path.join(tempDir, file);
              this._logger.info(`Processing OCR for page ${i + 1}/${files.length}: ${file}`);
              
              // Try multiple OCR approaches for better results
              let bestText = '';
              let bestQuality = 0;
              
              const ocrConfigs = [
                {
                  name: 'enhanced_french',
                  languages: 'fra+eng',
                  config: {
                    tessedit_ocr_engine_mode: 3,
                    tessedit_pageseg_mode: 6,
                    preserve_interword_spaces: '1',
                    tessedit_char_whitelist: '0123456789.,€$£ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzàâäéèêëïîôöùûüÿç'
                  }
                },
                {
                  name: 'standard_french',
                  languages: 'fra+eng',
                  config: {
                    tessedit_ocr_engine_mode: 3,
                    tessedit_pageseg_mode: 3,
                    preserve_interword_spaces: '1'
                  }
                },
                {
                  name: 'auto_layout',
                  languages: 'fra+eng',
                  config: {
                    tessedit_ocr_engine_mode: 3,
                    tessedit_pageseg_mode: 1,
                    preserve_interword_spaces: '1'
                  }
                },
                {
                  name: 'basic_french',
                  languages: 'fra+eng',
                  config: {
                    tessedit_ocr_engine_mode: 1,
                    tessedit_pageseg_mode: 6
                  }
                }
              ];
              
              for (const ocrConfig of ocrConfigs) {
                try {
                  this._logger.debug(`Trying OCR config: ${ocrConfig.name}`);
                  
                  const { data: { text: ocrText } } = await Tesseract.recognize(
                    imagePath,
                    ocrConfig.languages,
                    { 
                      logger: () => {}, // Reduce log noise during multiple attempts
                      ...ocrConfig.config
                    }
                  );
                  
                  // Assess OCR quality
                  const quality = this.assessOCRQuality(ocrText);
                  this._logger.debug(`OCR config ${ocrConfig.name}: quality=${quality.score}, words=${quality.wordCount}, text="${ocrText.substring(0, 50)}${ocrText.length > 50 ? '...' : ''}"`);
                  
                  if (quality.score > bestQuality) {
                    bestQuality = quality.score;
                    bestText = ocrText;
                  }
                  
                } catch (ocrError) {
                  this._logger.warn(`OCR config ${ocrConfig.name} failed for page ${i + 1}:`, ocrError.message);
                }
              }
              
              this._logger.info(`Best OCR result for page ${i + 1}: "${bestText.substring(0, 100)}${bestText.length > 100 ? '...' : ''}" (${bestText.length} chars, quality=${bestQuality})`);
              fullText += bestText + '\n';
          }

          this._logger.info(`OCR completed for ${path.basename(filePath)}. Extracted ${fullText.length} characters.`);
          
          // Validate OCR quality using the assessment method
          const quality = this.assessOCRQuality(fullText);
          
          this._logger.info(`OCR quality assessment: score=${quality.score}, words=${quality.wordCount}, hasNumbers=${quality.hasNumbers}, hasCurrency=${quality.hasCurrency}, hasAmountPattern=${quality.hasAmountPattern}`);
          
          if (!quality.isAcceptable) {
            this._logger.warn(`OCR quality is poor for ${path.basename(filePath)} - text may not be suitable for AI analysis`);
            this._logger.warn(`OCR text sample:`, fullText.replace(/\s+/g, ' ').trim().substring(0, 200));
            
            // Provide suggestions for improvement
            const suggestions = [];
            if (quality.wordCount < 2) suggestions.push('Try scanning at higher resolution');
            if (!quality.hasNumbers) suggestions.push('Ensure the document contains visible numbers');
            if (!quality.hasCurrency) suggestions.push('Check if currency symbols are present');
            
            this._logger.warn(`OCR suggestions: ${suggestions.join(', ')}`);
          }
          
          // Cache the result
          this.cache.setOCRCache(filePath, fullText);
          this._logger.debug(`OCR result cached for ${path.basename(filePath)}`);
          
          return fullText;
      } catch (error) {
          this._logger.error(`OCR failed for ${path.basename(filePath)}:`, error);
          throw new Error(`OCR failed: ${error.message}`);
      } finally {
          // Cleanup temp files
          try {
              fs.rmSync(tempDir, { recursive: true, force: true });
              this._logger.debug(`Cleaned up temporary OCR directory: ${tempDir}`);
          } catch (e) {
              this._logger.warn(`Failed to cleanup temp dir ${tempDir}:`, e.message);
          }
      }
  }

  /**
   * Extract full text from PDF for AI analysis
   */
  async extractFullText(filePath) {
    try {
      // Try normal PDF text extraction first
      const dataBuffer = fs.readFileSync(filePath);
      const parser = new PDFParse({ data: dataBuffer });
      const data = await parser.getText();
      let text = data.text;

      // Detect scanned PDFs (no text or very little text)
      if (!text || text.trim().length < 50) {
        console.log(`[ParserService] Normal extraction failed (text length: ${text?.length || 0}). Triggering OCR for AI analysis...`);
        text = await this.performOCR(filePath);
      }

      console.log(`[ParserService] Extracted ${text.length} characters for AI analysis`);
      return text;
    } catch (error) {
      console.error('[ParserService] Failed to extract text for AI analysis:', error);
      throw new Error(`Text extraction failed: ${error.message}`);
    }
  }

  /**
   * Manual AI analysis for conflict resolution
   */
  async manualAIAnalysis(text, pdfContext, aiSettings) {
    try {
      this._aiDetection.initialize(aiSettings)
      const result = await this._aiDetection.extractAmountFromText(text, pdfContext)
      
      return {
        ...result,
        method: 'ai',
        manual: true,
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      console.error('[ParserService] Manual AI analysis failed:', error)
      throw error
    }
  }

  /**
   * Assess OCR quality to determine if text is suitable for AI analysis
   */
  assessOCRQuality(text) {
    const meaningfulWords = text.split(/\s+/).filter(word => word.length > 2);
    const wordCount = meaningfulWords.length;
    const hasNumbers = /\d/.test(text);
    const hasCurrency = /[€$£]/.test(text);
    const hasAmountPattern = /\d+[.,]\d+/.test(text);
    const charCount = text.replace(/\s+/g, '').length;
    
    // Calculate quality score
    let score = 0;
    score += wordCount * 2; // Each meaningful word is worth 2 points
    score += hasNumbers ? 5 : 0; // Numbers are valuable
    score += hasCurrency ? 10 : 0; // Currency symbols are very valuable
    score += hasAmountPattern ? 15 : 0; // Amount patterns are most valuable
    score += charCount > 50 ? 5 : 0; // Reasonable length
    
    return {
      score,
      wordCount,
      hasNumbers,
      hasCurrency,
      hasAmountPattern,
      charCount,
      isAcceptable: score >= 10 || (wordCount >= 2 && hasNumbers)
    };
  }

  /**
   * Get page count from PDF
   */
  getPageCount(filePath) {
    try {
      // Simple page count estimation - in a real implementation you might use pdf-parse to get accurate count
      // For now, we'll use a simple heuristic based on file size
      const stats = fs.statSync(filePath);
      const sizeInMB = stats.size / (1024 * 1024);
      
      // Rough estimate: ~1MB per page for typical PDFs
      return Math.max(1, Math.ceil(sizeInMB));
    } catch (error) {
      console.warn(`[ParserService] Could not estimate page count: ${error.message}`);
      return 1; // Default to 1 page
    }
  }

  /**
   * Logic to find the amount in extracted text.
   * Returns candidates and a status.
   * @param {string} text 
   * @param {string} customPattern - Optional regex pattern.
   * @returns {Object}
   */
  findAmountInText(text, customPattern) {
    if (customPattern) {
       const regex = new RegExp(customPattern, 'i');
       const match = text.match(regex);
       if (match && match[1]) {
           const amount = parseFloat(match[1].replace(',', '.'));
           return { status: 'success', amount, candidates: [{ amount, context: match[0] }] };
       }
    }

    const lines = text.split('\n');
    const supremeKeywords = [
        'total ttc', 'ttc', 'net a payer', 'net à payer', 'total à payer', 'total a payer',
        'net à régler', 'net a régler', 'à payer', 'a payer', 'total à régler', 'total a régler',
        'net a payer en €', 'net à payer en €', 'montant ttc', 'total eur ttc', 'total eur',
        'a votre debit', 'total net a payer', 'total net ttc', 'net a payer ttc', 
        'net a payer ttc en euros', 'net à payer ttc en euros'
    ];
    const strongKeywords = [
        'total due', 'amount due', 'balance due', 'total facturado', 'total factura',
        'total general', 'amount', 'montant', 'importe', 'sum', 'total:',
        'payer', 'regler'
    ];
    const secondaryKeywords = [
        'total ht', 'net ht', 'hors taxe', 'total net ht', 'ht', 'total ht net', 'total marchandise'
    ];
    const genericKeywords = [
        'total', 'net'
    ];
    const subtotalKeywords = [...secondaryKeywords]; // Keywords that definitely mean "subtotal/HT"
    
    // Words that indicate this is NOT a monetary total
    const ignoreWords = [
        'poids', 'weight', 'kg', 'volume', 'qty', 'quantité', 'quantity', 'qte', 'quantite',
        'articles', 'items', 'unité', 'unités', 'indemnité', 'pénalité', 
        'intérêt', 'intérêts', 'penalite', 'indemnite', 'interet',
        'iban', 'siret', 'siren', 'ean', 'bic', 'swift', 'rib', 'account', 'compte', 'no.', 'ref',
        'colis', 'nb colis', 'livraison', 'capital', 'social', 'société', 'page', 'of', 'sur',
        'bord', 'bordereau', 'commande', 'réf', 'noël', 'noel', 'échéance', 'echeance',
        'escompte', 'remise', 'p.u.', 'taux', 'tva', 'tél', 'tel', 'route', 'rue', 'avenue', 'adresse'
    ];
    
    const candidates = [];
    const currencySymbols = ['€', '$', '£', 'chf'];

    for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i].toLowerCase();
        // Canonical: strip spaces, dots, and accents
        const canonicalLine = rawLine.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s\.]/g, '');
        
        let tier = 0;
        const check = (k) => {
            const canonicalK = k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s\.]/g, '');
            return canonicalLine.includes(canonicalK);
        };

        // Priority order: 
        // 1. HT/Subtotals (Always lowest priority)
        // 2. Supreme (TTC, Net a payer)
        // 3. Strong (Generic Total)
        if (supremeKeywords.some(check)) tier = 3;
        else if (strongKeywords.some(check)) tier = 2;
        else if (secondaryKeywords.some(check)) tier = 1;
        else if (genericKeywords.some(check)) tier = 1;

        // High priority demotion: if it contains "HT" or other subtotal keywords, 
        // it's likely a subtotal, even if it has "Total" or "Net"
        if (tier > 1 && subtotalKeywords.some(check)) {
            tier = 1;
        }

        if (tier > 0) {
            if (ignoreWords.some(w => rawLine.includes(w))) continue;
            
            const linesToScan = [lines[i]];
            let lookahead = 0;
            if (tier === 3) lookahead = 20;
            else if (tier === 2) lookahead = 5;
            else lookahead = 1;

            for (let j = 1; j <= lookahead; j++) {
                if (i + j < lines.length) linesToScan.push(lines[i+j]);
            }

            linesToScan.forEach((scanLine, idx) => {
                // Also check ignoreWords on the scanLine to avoid legal/metadata numbers
                if (ignoreWords.some(w => scanLine.toLowerCase().includes(w))) {
                    return;
                }

                const isSameLine = idx === 0;
                const found = this.extractAllNumbersWithContext(scanLine);
                found.forEach(c => {
                    c.tier = tier;
                    const ctxLower = c.context.toLowerCase();
                    let priority = 1;
                    if (currencySymbols.some(s => ctxLower.includes(s))) priority = 2;
                    if (isSameLine) priority += 2; // Same line boost (+2)
                    
                    c.priority = priority;
                });
                candidates.push(...found);
            });
        }
    }

    if (candidates.length === 0) {
        const allNumbers = this.extractAllNumbersWithContext(text);
        if (allNumbers.length > 0) {
            allNumbers.forEach(c => {
                c.tier = 0;
                c.priority = 1;
            });
            return { status: 'ambiguous', amount: 0, candidates: allNumbers.slice(-5) };
        }
        return { status: 'failed', amount: 0, candidates: [] };
    }

    // 1. Keep only candidates from the highest tier found
    const maxTier = Math.max(...candidates.map(c => c.tier || 0));
    let filtered = candidates.filter(c => c.tier === maxTier);

    // 2. Deduplicate by amount, keeping highest priority
    const candidatesMap = new Map();
    filtered.forEach(c => {
        const existing = candidatesMap.get(c.amount);
        if (!existing || (c.priority || 0) > (existing.priority || 0)) {
            candidatesMap.set(c.amount, c);
        }
    });

    const uniqueCandidates = Array.from(candidatesMap.values());

    // Filter candidates: if we have some with priority 2 (currency symbol), 
    // maybe we should ignore those with priority 1 if they are small?
    // For now, just let ambiguity handle it unless one is clearly better.

    if (uniqueCandidates.length === 1) {
        return { status: 'success', amount: uniqueCandidates[0].amount, candidates: uniqueCandidates };
    } else if (uniqueCandidates.length > 1) {
        // Tie-breaking:
        // 1. If some have currency symbols and others don't, prioritize currency ones
        const highPriority = uniqueCandidates.filter(c => c.priority === 2);
        const pool = highPriority.length > 0 ? highPriority : uniqueCandidates;
        
        if (pool.length === 1) {
            return { status: 'success', amount: pool[0].amount, candidates: pool };
        }

        // 2. If still multiple, try to find the one with the highest priority first
        const maxPriority = Math.max(...pool.map(c => c.priority || 0));
        const bestPool = pool.filter(c => c.priority === maxPriority);
        
        if (bestPool.length === 1) {
            return { status: 'success', amount: bestPool[0].amount, candidates: bestPool };
        }

        // 3. If still multiple, try to find a relationship (HT + TVA = TTC)
        const sorted = [...bestPool].sort((a, b) => b.amount - a.amount);
        if (sorted.length >= 3) {
            // Check if largest is roughly sum of two others (common for HT, TVA, TTC)
            const sumOfothers = sorted[1].amount + sorted[2].amount;
            if (Math.abs(sorted[0].amount - sumOfothers) < 0.05) {
                return { status: 'success', amount: sorted[0].amount, candidates: [sorted[0]] };
            }
        }

        // 4. If still multiple, and one is significantly larger than others
        
        // Filter out very small numbers if larger ones exist in the same pool
        // (Avoid picking up page counts or small item counts as totals)
        if (sorted.length > 1 && sorted[0].amount > 10 && sorted[sorted.length - 1].amount < 5) {
            const significantPool = bestPool.filter(c => c.amount >= 5);
            if (significantPool.length === 1) {
                return { status: 'success', amount: significantPool[0].amount, candidates: significantPool };
            }
        }

        if (bestPool.length <= 2 && sorted[0].amount > sorted[1].amount * 1.5 && sorted[0].amount < sorted[1].amount * 10) {
            return { status: 'success', amount: sorted[0].amount, candidates: sorted };
        }

        return { status: 'ambiguous', amount: 0, candidates: uniqueCandidates };
    }

    // Fallback: search for potential "Total" style numbers even without keywords
    const allNumbers = this.extractAllNumbersWithContext(text);
    if (allNumbers.length > 0) {
        return { status: 'ambiguous', amount: 0, candidates: allNumbers.slice(-5) }; // Show last few numbers
    }

    return { status: 'failed', amount: 0, candidates: [] };
  }

  extractAllNumbersWithContext(text) {
      // Matches: 1.234,56 or 1234.56 or 236,50 or 236
      const regex = /(\d+(?:[\s\.]\d{3})*(?:[\.,]\d{1,2})?)/g;
      const results = [];
      let match;
      
      while ((match = regex.exec(text)) !== null) {
          const rawMatch = match[1];
          const endChar = text[match.index + rawMatch.length];
          const prevChar = text[match.index - 1];
          
          // Basic alphanumeric check: if preceded or followed by a letter, it's likely an identifier/code
          if (/[a-zA-Z\-]/.test(prevChar || '') || /[a-zA-Z\-]/.test(endChar || '')) {
              continue;
          }

          const startIdx = Math.max(0, match.index - 30);
          const endIdx = Math.min(text.length, match.index + rawMatch.length + 30);
          const fullContext = text.substring(startIdx, endIdx).toLowerCase();
          
          // Ignore identifiers (IBAN, SIRET, page numbers, etc.) by checking context
          const identifierKeywords = ['iban', 'siret', 'siren', 'ean', 'bic', 'swift', 'rib', 'compte', 'account', 'ref', 'n°', 'page', 'of', 'sur', 'bord', 'commande', 'réf'];
          if (identifierKeywords.some(k => fullContext.includes(k))) {
              continue;
          }
          
          // Special check for page patterns like "1 / 2" or "1 of 2" or "-- 1 --"
          if (/(\d+)\s*[/]\s*\d+/.test(fullContext) || /--\s*\d+\s*--/.test(fullContext)) {
              continue;
          }

          // Ignore years (2020-2029) if not clearly a decimal amount
          if (/202[0-9]/.test(rawMatch) && !rawMatch.includes(',') && !rawMatch.includes('.')) {
              continue;
          }

          // Ignore phone numbers (patterns like 07 81 34 24 46 or 0781342446)
          if (/0[1-9](\s?\d{2}){4}/.test(fullContext) || /tél|tel|phone/.test(fullContext)) {
              continue;
          }

          // Ignore postal codes (5-digit numbers in France like 73340)
          if (/\b\d{5}\b/.test(rawMatch) && rawMatch.length === 5 && !rawMatch.includes('.') && !rawMatch.includes(',')) {
              continue;
          }

          // Ignore large numeric strings (likely barcodes or bank details)
          if (rawMatch.replace(/[\s\.]/g, '').length > 12) {
              continue;
          }
          if (text[match.index + rawMatch.length] === '%' || fullContext.includes('%')) {
              continue;
          }

          // Ignore dates (simple check: if preceded or followed by / and is small)
          const isDatePart = /\d+\/\d+/.test(fullContext) || /\/\d+/.test(fullContext);
          if (isDatePart && rawMatch.length <= 4) {
              continue;
          }

          let raw = rawMatch.replace(/\s/g, '');
          
          // Handle European format: "1.234,56" -> "1234.56"
          if (raw.includes('.') && raw.includes(',')) {
              raw = raw.replace(/\./g, '').replace(',', '.');
          } else if (raw.includes(',')) {
              raw = raw.replace(',', '.');
          }

          const amount = parseFloat(raw);
          // Hard limit: Invoices > 1M are extremely rare for this tool
          // and usually indicate an extraction error (like an IBAN)
          if (amount > 0.01 && amount < 1000000 && !isNaN(amount)) {
              // Increase context for UI clarity
              const start = Math.max(0, match.index - 50);
              const end = Math.min(text.length, match.index + rawMatch.length + 50);
              const context = text.substring(start, end).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
              
              results.push({ 
                  amount, 
                  context: `...${context}...`,
                  fullContext: {
                      fullContext: text,
                      matchIndex: match.index,
                      matchLength: rawMatch.length
                  }
              });
          }
      }
      return results;
  }
}

export { ParserService };
