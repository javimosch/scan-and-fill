import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { PDFParse } from 'pdf-parse';
import Tesseract from 'tesseract.js';
import CacheService from './CacheService.js';

/**
 * Service to extract currency amounts from PDF files with ambiguity detection.
 */
export default class ParserService {
  constructor() {
    this._cache = null;
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
    try {
      const dataBuffer = fs.readFileSync(filePath);
      parser = new PDFParse({ data: dataBuffer });
      const data = await parser.getText();
      let text = data.text;

      // Detect scanned PDFs (no text or very little text)
      if (!text || text.trim().length < 100) {
          console.log(`[ParserService] Normal extraction failed (text length: ${text?.length || 0}). Triggering OCR...`);
          text = await this.performOCR(filePath);
      }

      return this.findAmountInText(text, options.pattern);
    } catch (error) {
      console.error(`Error parsing PDF ${filePath}:`, error);
      return { status: 'failed', amount: 0, candidates: [], message: error.message };
    } finally {
      if (parser) {
        await parser.destroy();
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
          console.log(`[ParserService] Using cached OCR result (${cachedText.length} characters)`);
          return cachedText;
      }

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-'));
      try {
          const baseName = path.basename(filePath, '.pdf');
          const outputPrefix = path.join(tempDir, 'page');
          
          console.log(`[ParserService] Converting PDF to images in ${tempDir}...`);
          // Use pdftoppm (fast system tool) to convert PDF to PNG
          // We convert at 300 DPI for better OCR quality
          execSync(`pdftoppm -png -r 300 "${filePath}" "${outputPrefix}"`);

          const files = fs.readdirSync(tempDir)
              .filter(f => f.startsWith('page') && f.endsWith('.png'))
              .sort();

          let fullText = '';
          console.log(`[ParserService] Running Tesseract OCR on ${files.length} pages...`);
          
          for (const file of files) {
              const imagePath = path.join(tempDir, file);
              const { data: { text } } = await Tesseract.recognize(
                  imagePath,
                  'fra+eng', // French and English
                  { logger: m => console.log(`[OCR] ${m.status}: ${Math.round(m.progress * 100)}%`) }
              );
              fullText += text + '\n';
          }

          console.log(`[ParserService] OCR completed. Extracted ${fullText.length} characters.`);
          
          // Cache the result
          this.cache.setOCRCache(filePath, fullText);
          
          return fullText;
      } catch (error) {
          console.error('[ParserService] OCR failed:', error);
          throw new Error(`OCR failed: ${error.message}`);
      } finally {
          // Cleanup temp files
          try {
              fs.rmSync(tempDir, { recursive: true, force: true });
          } catch (e) {
              console.warn(`[ParserService] Failed to cleanup temp dir ${tempDir}:`, e.message);
          }
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
