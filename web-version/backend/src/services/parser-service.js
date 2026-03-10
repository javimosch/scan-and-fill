import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import pdfParse from 'pdf-parse';
import Tesseract from 'tesseract.js';

const AMOUNT_PATTERNS = [
  /(total\s*ttc|net\s*a\s*payer|montant\s*total|total)\D{0,20}([\d.,]+)/gi,
  /([$€£]\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/g,
  /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?\s*[$€£])/g
];

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

function findAmountInText(text) {
  const candidates = [];
  for (const pattern of AMOUNT_PATTERNS) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const raw = match[2] || match[1] || '';
      const value = parseAmount(raw);
      if (value > 0) candidates.push(value);
    }
  }

  const unique = [...new Set(candidates.map((n) => Number(n.toFixed(2))))].sort((a, b) => b - a);
  if (unique.length === 0) {
    return { status: 'failed', amount: 0, candidates: [], message: 'No amount found' };
  }
  if (unique.length === 1) {
    return { status: 'success', amount: unique[0], candidates: unique, message: 'Amount extracted' };
  }
  return { status: 'ambiguous', amount: unique[0], candidates: unique.slice(0, 5), message: 'Multiple amount candidates' };
}

function parseAmount(input) {
  const cleaned = String(input).replace(/[$€£\s]/g, '');
  const normalized = cleaned.includes(',') && cleaned.includes('.')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned.replace(',', '.');
  const amount = Number.parseFloat(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

async function performOcr(pdfBuffer) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-fill-web-'));
  const pdfPath = path.join(tempDir, 'input.pdf');
  const outputPrefix = path.join(tempDir, 'page');
  fs.writeFileSync(pdfPath, pdfBuffer);

  try {
    execSync(`pdftoppm -png -r 300 "${pdfPath}" "${outputPrefix}"`);
    const pngFiles = fs.readdirSync(tempDir).filter((f) => f.startsWith('page') && f.endsWith('.png')).sort();
    let fullText = '';
    for (const pngFile of pngFiles) {
      const { data: { text } } = await Tesseract.recognize(path.join(tempDir, pngFile), 'fra+eng');
      fullText += `${text}\n`;
    }
    return fullText;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
