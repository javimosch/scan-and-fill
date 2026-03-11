import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import pdfParse from 'pdf-parse';
import Tesseract from 'tesseract.js';

export async function extractAmountFromPdfBuffer(pdfBuffer) {
  try {
    const parsed = await pdfParse(pdfBuffer);
    let text = parsed.text || '';

    if (text.trim().length < 50) {
      text = await performOcr(pdfBuffer);
    }

    return findAmountInText(text);
  } catch (error) {
    return { status: 'failed', amount: 0, candidates: [], message: error.message };
  }
}

/**
 * Sophisticated amount extraction ported from the desktop ParserService.
 * Uses multi-tier keyword matching with context-aware number extraction.
 */
function findAmountInText(text, customPattern) {
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
    'total ht', 'net ht', 'hors taxe', 'total net ht', 'montant ht',
    'total ht net', 'total marchandise', 'total hors taxe', 'sous-total ht',
    'sous total ht', 'base ht', 'montant hors taxe'
  ];
  const strongKeywords = [
    'total due', 'amount due', 'balance due', 'total facturado', 'total factura',
    'total general', 'amount', 'montant', 'importe', 'sum', 'total:',
    'payer', 'regler', 'net a payer', 'net à payer', 'total à payer', 'total a payer',
    'à payer', 'a payer', 'a votre debit'
  ];
  const secondaryKeywords = [
    'total ttc', 'ttc', 'montant ttc', 'total eur ttc', 'total eur',
    'net a payer ttc', 'total net ttc', 'net à régler', 'net a régler',
    'total à régler', 'total a régler', 'net a payer en €', 'net à payer en €',
    'net a payer ttc en euros', 'net à payer ttc en euros'
  ];
  const genericKeywords = [
    'total', 'net', 'ht'
  ];
  const subtotalKeywords = [];

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
    const canonicalLine = rawLine.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s.]/g, '');

    let tier = 0;
    const check = (k) => {
      const canonicalK = k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s.]/g, '');
      return canonicalLine.includes(canonicalK);
    };

    if (supremeKeywords.some(check)) tier = 3;
    else if (strongKeywords.some(check)) tier = 2;
    else if (secondaryKeywords.some(check)) tier = 1;
    else if (genericKeywords.some(check)) tier = 1;

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
        if (i + j < lines.length) linesToScan.push(lines[i + j]);
      }

      linesToScan.forEach((scanLine, idx) => {
        if (ignoreWords.some(w => scanLine.toLowerCase().includes(w))) return;

        const isSameLine = idx === 0;
        const found = extractAllNumbersWithContext(scanLine);
        found.forEach(c => {
          c.tier = tier;
          const ctxLower = c.context.toLowerCase();
          let priority = 1;
          if (currencySymbols.some(s => ctxLower.includes(s))) priority = 2;
          if (isSameLine) priority += 2;
          c.priority = priority;
        });
        candidates.push(...found);
      });
    }
  }

  if (candidates.length === 0) {
    const allNumbers = extractAllNumbersWithContext(text);
    if (allNumbers.length > 0) {
      allNumbers.forEach(c => { c.tier = 0; c.priority = 1; });
      return { status: 'ambiguous', amount: 0, candidates: allNumbers.slice(-5), message: 'No keywords found, showing last candidates' };
    }
    return { status: 'failed', amount: 0, candidates: [], message: 'No amount found' };
  }

  const maxTier = Math.max(...candidates.map(c => c.tier || 0));
  const filtered = candidates.filter(c => c.tier === maxTier);

  const candidatesMap = new Map();
  filtered.forEach(c => {
    const existing = candidatesMap.get(c.amount);
    if (!existing || (c.priority || 0) > (existing.priority || 0)) {
      candidatesMap.set(c.amount, c);
    }
  });

  const uniqueCandidates = Array.from(candidatesMap.values());

  if (uniqueCandidates.length === 1) {
    return { status: 'success', amount: uniqueCandidates[0].amount, candidates: uniqueCandidates, message: 'Amount extracted' };
  }

  if (uniqueCandidates.length > 1) {
    const highPriority = uniqueCandidates.filter(c => c.priority === 2);
    const pool = highPriority.length > 0 ? highPriority : uniqueCandidates;

    if (pool.length === 1) {
      return { status: 'success', amount: pool[0].amount, candidates: pool, message: 'Amount extracted' };
    }

    const maxPriority = Math.max(...pool.map(c => c.priority || 0));
    const bestPool = pool.filter(c => c.priority === maxPriority);

    if (bestPool.length === 1) {
      return { status: 'success', amount: bestPool[0].amount, candidates: bestPool, message: 'Amount extracted' };
    }

    const sorted = [...bestPool].sort((a, b) => b.amount - a.amount);
    if (sorted.length >= 3) {
      const sumOfSmaller = sorted[1].amount + sorted[2].amount;
      if (Math.abs(sorted[0].amount - sumOfSmaller) < 0.05) {
        return { status: 'success', amount: sorted[1].amount, candidates: [sorted[1]], message: 'Amount extracted (HT from HT+TVA=TTC)' };
      }
    }

    if (sorted.length > 1 && sorted[0].amount > 10 && sorted[sorted.length - 1].amount < 5) {
      const significantPool = bestPool.filter(c => c.amount >= 5);
      if (significantPool.length === 1) {
        return { status: 'success', amount: significantPool[0].amount, candidates: significantPool, message: 'Amount extracted' };
      }
    }

    if (bestPool.length <= 2 && sorted[0].amount > sorted[1].amount * 1.5 && sorted[0].amount < sorted[1].amount * 10) {
      return { status: 'success', amount: sorted[0].amount, candidates: sorted, message: 'Amount extracted (largest)' };
    }

    return { status: 'ambiguous', amount: 0, candidates: uniqueCandidates, message: 'Multiple amount candidates' };
  }

  const allNumbers = extractAllNumbersWithContext(text);
  if (allNumbers.length > 0) {
    return { status: 'ambiguous', amount: 0, candidates: allNumbers.slice(-5), message: 'Multiple amount candidates' };
  }

  return { status: 'failed', amount: 0, candidates: [], message: 'No amount found' };
}

/**
 * Context-aware number extraction with filtering for identifiers, phone numbers, etc.
 * Ported from the desktop ParserService.
 */
function extractAllNumbersWithContext(scanText) {
  const regex = /(\d+(?:[\s.]\d{3})*(?:[.,]\d{1,2})?)/g;
  const results = [];
  let match;

  while ((match = regex.exec(scanText)) !== null) {
    const rawMatch = match[1];
    const endChar = scanText[match.index + rawMatch.length];
    const prevChar = scanText[match.index - 1];

    if (/[a-zA-Z\-]/.test(prevChar || '') || /[a-zA-Z\-]/.test(endChar || '')) {
      continue;
    }

    const startIdx = Math.max(0, match.index - 30);
    const endIdx = Math.min(scanText.length, match.index + rawMatch.length + 30);
    const localContext = scanText.substring(startIdx, endIdx).toLowerCase();

    const identifierKeywords = [
      'iban', 'siret', 'siren', 'ean', 'bic', 'swift', 'rib', 'compte', 'account',
      'ref', 'n°', 'page', 'of', 'sur', 'bord', 'commande', 'réf'
    ];
    if (identifierKeywords.some(k => localContext.includes(k))) continue;

    if (/(\d+)\s*[/]\s*\d+/.test(localContext) || /--\s*\d+\s*--/.test(localContext)) continue;

    if (/202[0-9]/.test(rawMatch) && !rawMatch.includes(',') && !rawMatch.includes('.')) continue;

    if (/0[1-9](\s?\d{2}){4}/.test(localContext) || /tél|tel|phone/.test(localContext)) continue;

    if (/\b\d{5}\b/.test(rawMatch) && rawMatch.length === 5 && !rawMatch.includes('.') && !rawMatch.includes(',')) continue;

    if (rawMatch.replace(/[\s.]/g, '').length > 12) continue;

    if (scanText[match.index + rawMatch.length] === '%' || localContext.includes('%')) continue;

    const isDatePart = /\d+\/\d+/.test(localContext) || /\/\d+/.test(localContext);
    if (isDatePart && rawMatch.length <= 4) continue;

    let raw = rawMatch.replace(/\s/g, '');

    if (raw.includes('.') && raw.includes(',')) {
      raw = raw.replace(/\./g, '').replace(',', '.');
    } else if (raw.includes(',')) {
      raw = raw.replace(',', '.');
    }

    const amount = parseFloat(raw);
    if (amount > 0.01 && amount < 1000000 && !isNaN(amount)) {
      const ctxStart = Math.max(0, match.index - 50);
      const ctxEnd = Math.min(scanText.length, match.index + rawMatch.length + 50);
      const context = scanText.substring(ctxStart, ctxEnd).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

      results.push({ amount, context: `...${context}...` });
    }
  }
  return results;
}

const OCR_CONFIGS = [
  {
    name: 'enhanced_french',
    oem: 3,
    params: {
      tessedit_pageseg_mode: '6',
      preserve_interword_spaces: '1',
      tessedit_char_whitelist: '0123456789.,€$£ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzàâäéèêëïîôöùûüÿç '
    }
  },
  {
    name: 'standard_french',
    oem: 3,
    params: {
      tessedit_pageseg_mode: '3',
      preserve_interword_spaces: '1',
      tessedit_char_whitelist: ''
    }
  },
  {
    name: 'auto_layout',
    oem: 3,
    params: {
      tessedit_pageseg_mode: '1',
      preserve_interword_spaces: '1',
      tessedit_char_whitelist: ''
    }
  },
  {
    name: 'basic_french',
    oem: 1,
    params: {
      tessedit_pageseg_mode: '6',
      tessedit_char_whitelist: ''
    }
  }
];

function assessOCRQuality(text) {
  const meaningfulWords = text.split(/\s+/).filter(word => word.length > 2);
  const wordCount = meaningfulWords.length;
  const hasNumbers = /\d/.test(text);
  const hasCurrency = /[€$£]/.test(text);
  const hasAmountPattern = /\d+[.,]\d+/.test(text);
  const charCount = text.replace(/\s+/g, '').length;

  let score = 0;
  score += wordCount * 2;
  score += hasNumbers ? 5 : 0;
  score += hasCurrency ? 10 : 0;
  score += hasAmountPattern ? 15 : 0;
  score += charCount > 50 ? 5 : 0;

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

async function performOcr(pdfBuffer) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-fill-web-'));
  const pdfPath = path.join(tempDir, 'input.pdf');
  const outputPrefix = path.join(tempDir, 'page');
  fs.writeFileSync(pdfPath, pdfBuffer);

  let workerOem3 = null;
  let workerOem1 = null;

  try {
    execSync(`pdftoppm -png -r 600 "${pdfPath}" "${outputPrefix}"`);
    const pngFiles = fs.readdirSync(tempDir).filter((f) => f.startsWith('page') && f.endsWith('.png')).sort();
    console.log('[ocr] Found ' + pngFiles.length + ' page images to process');

    for (const pngFile of pngFiles) {
      const imgPath = path.join(tempDir, pngFile);
      try {
        execSync(`convert "${imgPath}" -colorspace Gray -normalize -level 10%,85% -sharpen 0x1 "${imgPath}"`, { timeout: 15000 });
      } catch (e) {
        console.warn('[ocr] ImageMagick preprocessing failed for ' + pngFile + ': ' + e.message);
      }
    }

    workerOem3 = await Tesseract.createWorker('fra+eng', 3);
    workerOem1 = await Tesseract.createWorker('fra+eng', 1);

    let fullText = '';
    for (let i = 0; i < pngFiles.length; i++) {
      const imagePath = path.join(tempDir, pngFiles[i]);
      let bestText = '';
      let bestQuality = 0;

      for (const ocrConfig of OCR_CONFIGS) {
        try {
          const worker = ocrConfig.oem === 1 ? workerOem1 : workerOem3;
          await worker.setParameters(ocrConfig.params);
          const { data: { text: ocrText } } = await worker.recognize(imagePath);

          const quality = assessOCRQuality(ocrText);
          console.log('[ocr] config ' + ocrConfig.name + ' page ' + (i + 1) + ': score=' + quality.score + ' words=' + quality.wordCount);

          if (quality.score > bestQuality) {
            bestQuality = quality.score;
            bestText = ocrText;
          }

          if (quality.score > 100) break;
        } catch (ocrError) {
          console.warn('[ocr] config ' + ocrConfig.name + ' failed for page ' + (i + 1) + ': ' + ocrError.message);
        }
      }

      console.log('[ocr] Best result for page ' + (i + 1) + ': ' + bestText.length + ' chars, quality=' + bestQuality);
      fullText += bestText + '\n';
    }

    const finalQuality = assessOCRQuality(fullText);
    console.log('[ocr] Final quality: score=' + finalQuality.score + ' words=' + finalQuality.wordCount + ' hasNumbers=' + finalQuality.hasNumbers + ' hasCurrency=' + finalQuality.hasCurrency + ' hasAmountPattern=' + finalQuality.hasAmountPattern);

    if (!finalQuality.isAcceptable) {
      console.warn('[ocr] Quality is poor — text may not yield good extraction results');
    }

    return fullText;
  } finally {
    if (workerOem3) await workerOem3.terminate().catch(() => {});
    if (workerOem1) await workerOem1.terminate().catch(() => {});
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
