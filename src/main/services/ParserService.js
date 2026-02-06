import fs from 'fs';
import { PDFParse } from 'pdf-parse';

/**
 * Service to extract currency amounts from PDF files with ambiguity detection.
 */
export default class ParserService {
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
      const text = data.text;

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
        'net a payer en €', 'net à payer en €'
    ];
    const strongKeywords = [
        'total due', 'amount due', 'balance due', 'total facturado', 'total factura',
        'total general', 'amount', 'total', 'montant', 'importe', 'sum', 'total:'
    ];
    const secondaryKeywords = [
        'total ht', 'net ht', 'hors taxe', 'total net ht', 'ht'
    ];
    
    // Words that indicate this is NOT a monetary total
    const ignoreWords = ['poids', 'weight', 'kg', 'volume', 'qty', 'quantité', 'quantity', 'articles', 'items', 'unité', 'unités'];
    
    const candidates = [];
    const currencySymbols = ['€', '$', '£', 'chf'];

    for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i].toLowerCase();
        const canonicalLine = rawLine.replace(/[\s\.]/g, '');
        
        let tier = 0;
        const check = (k) => canonicalLine.includes(k.toLowerCase().replace(/[\s\.]/g, ''));

        if (supremeKeywords.some(check)) tier = 3;
        else if (strongKeywords.some(check)) tier = 2;
        else if (secondaryKeywords.some(check)) tier = 1;

        if (tier > 0) {
            if (ignoreWords.some(w => rawLine.includes(w))) continue;
            
            const linesToScan = [lines[i]];
            for (let j = 1; j <= 2; j++) {
                if (i + j < lines.length) linesToScan.push(lines[i+j]);
            }

            linesToScan.forEach(scanLine => {
                const found = this.extractAllNumbersWithContext(scanLine);
                found.forEach(c => {
                    c.tier = tier;
                    const ctxLower = c.context.toLowerCase();
                    if (currencySymbols.some(s => ctxLower.includes(s))) {
                        c.priority = 2;
                    } else {
                        c.priority = 1;
                    }
                });
                candidates.push(...found);
            });
        }
    }

    if (candidates.length === 0) {
        const allNumbers = this.extractAllNumbersWithContext(text);
        if (allNumbers.length > 0) {
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
        // If there's one candidate with a currency symbol and others without, 
        // we could prioritize it, but safer to show ambiguity.
        const highPriority = uniqueCandidates.filter(c => c.priority === 2);
        if (highPriority.length === 1) {
            return { status: 'success', amount: highPriority[0].amount, candidates: highPriority };
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
          const fullContext = text.substring(Math.max(0, match.index - 5), Math.min(text.length, match.index + rawMatch.length + 5));
          
          // Ignore percentages (e.g. "20%")
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
          // Ignore too small numbers that are likely not totals (adjust if needed)
          // But 4.06 could be a total, so we keep everything > 0.01
          if (amount > 0.01 && !isNaN(amount)) {
              const start = Math.max(0, match.index - 20);
              const end = Math.min(text.length, match.index + rawMatch.length + 20);
              const context = text.substring(start, end).replace(/\n/g, ' ').trim();
              
              results.push({ amount, context: `...${context}...` });
          }
      }
      return results;
  }
}

export { ParserService };
