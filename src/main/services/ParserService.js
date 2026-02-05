import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

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
    try {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdf(dataBuffer);
      const text = data.text;

      return this.findAmountInText(text, options.pattern);
    } catch (error) {
      console.error(`Error parsing PDF ${filePath}:`, error);
      return { status: 'failed', amount: 0, candidates: [], message: error.message };
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
    const keywords = ['total', 'montant', 'importe', 'net a payer', 'net à payer', 'total general', 'total à régler', 'total a pagar'];
    
    const candidates = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].toLowerCase();
        if (keywords.some(k => line.includes(k))) {
            // Find numbers in this line or nearby
            const foundInLine = this.extractAllNumbersWithContext(lines[i]);
            candidates.push(...foundInLine);
            
            if (i + 1 < lines.length) {
                const foundInNext = this.extractAllNumbersWithContext(lines[i+1]);
                candidates.push(...foundInNext);
            }
        }
    }

    // Deduplicate candidates by amount
    const uniqueCandidates = Array.from(new Map(candidates.map(c => [c.amount, c])).values());

    if (uniqueCandidates.length === 1) {
        return { status: 'success', amount: uniqueCandidates[0].amount, candidates: uniqueCandidates };
    } else if (uniqueCandidates.length > 1) {
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
      // Matches 1.234,56 or 1234.56 or 1234,56
      const regex = /(\d+[\s\.,]?\d*[\.,]\d{2})/g;
      const results = [];
      let match;
      
      while ((match = regex.exec(text)) !== null) {
          const amount = parseFloat(match[1].replace(/\s/g, '').replace(',', '.'));
          if (amount > 0) {
              const start = Math.max(0, match.index - 20);
              const end = Math.min(text.length, match.index + match[1].length + 20);
              const context = text.substring(start, end).trim();
              
              results.push({ amount, context: `...${context}...` });
          }
      }
      return results;
  }
}

export { ParserService };
