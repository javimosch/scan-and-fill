// HT-focused invoice extraction, ported from the web pipeline that reached ~83%
// on the LIBRERIE dataset. Operates on already-extracted text (pdf-parse or OCR).
//
// Goals: read the *HT* total (not TTC), classify document type (skip statements,
// flag credit notes), apply per-publisher templates, derive HT = TTC/rate when a
// publisher's HT line is column-scrambled, and guard against OCR digit-merges.
//
// extractHTFromText(text, fileName, opts) -> {
//   status: 'ok' | 'avoir' | 'skip' | 'review',
//   ht, ttc, type, publisher, message
// }

const NUM = '([0-9][0-9\\u00a0 .]*,[0-9]{2}|[0-9]+\\.[0-9]{2})';
// Per-invoice HT above this is implausible for a small bookstore and almost always
// an OCR digit-merge. Tune per project if the app is reused elsewhere.
const MAX_PLAUSIBLE_HT = 5000;

function num(s) {
  if (s == null) return NaN;
  let r = String(s).replace(/[\u00a0 ]/g, '');
  if (r.includes(',') && r.includes('.')) r = r.replace(/\./g, '').replace(',', '.');
  else if (r.includes(',')) r = r.replace(',', '.');
  return parseFloat(r);
}

export function classifyDocument(fileName) {
  const n = fileName.toUpperCase();
  if (/AVIS DE PAIE?MENT|EXTRAIT DE COMPTE|RELEVE DE FACTURATION|JUSTIFICATIF|AVIS DE PAIMENT/.test(n))
    return 'statement';
  const m = n.match(/ ([A-Z])([0-9]?)\.PDF$/);
  if (m) {
    if (m[1] === 'A') return 'avoir';     // credit note
    if (m[1] === 'R') return 'statement'; // relevé
    if (m[1] === 'F') return 'facture';
  }
  return 'facture';
}

export function detectPublisher(fileName) {
  const n = fileName.toUpperCase();
  for (const p of ['INTERFORUM', 'DILISCO', 'HACHETTE', 'SODIS', 'MDS', 'UD FLAMMARION', 'FLAMMARION',
    'HARMONIA MUNDI', 'DG DIFFUSION', 'DG', 'BLDD']) {
    if (n.startsWith(p)) return p;
  }
  return null;
}

function htMDS(t) {
  const m = t.match(new RegExp('TOTAL HT\\s*' + NUM, 'i'));
  return m ? num(m[1]) : NaN;
}
function htDILISCO(t) {
  let m = t.match(/Total net HT\s*\n?\s*([0-9]+[.,][0-9]{2})/i);
  if (m) return num(m[1]);
  m = t.match(/Total HT\s*\n?\s*([0-9]+[.,][0-9]{2})/i);
  return m ? num(m[1]) : NaN;
}
function htSODIS(t) {
  const m = t.match(/Total en EUR\s*\n?\s*([0-9.,\u00a0 ]+)/i);
  if (m) {
    const parts = (m[1].match(/[0-9]+,[0-9]{2}/g) || []).map(num);
    if (parts.length >= 3) return parts[1]; // TTC, HT, TVA
  }
  return NaN;
}
function htINTERFORUM(t) {
  const m = t.match(new RegExp('TOTAL GENERAL HT\\s*:?\\s*' + NUM, 'i'));
  return m ? num(m[1]) : NaN;
}
function htHARMONIA(t) {
  // "Total marchandise <qty> <amount>" — take the LAST decimal amount on that line
  // (the qty has no decimals, and the wide gap before the amount is not a thousands
  // separator, so a greedy match would otherwise merge qty+amount).
  const line = (t.split('\n').find((l) => /Total\s+marchandise/i.test(l)) || '');
  const amts = line.match(/[0-9](?:[0-9]| [0-9]{3})*,[0-9]{2}/g);
  return amts && amts.length ? num(amts[amts.length - 1]) : NaN;
}
function htDG(t) {
  let m = t.match(new RegExp(NUM + '\\s*€?\\s*TOTAUX', 'i'));
  if (m) return num(m[1]);
  m = t.match(/Total TTC\s*Montant TVA\s*Montant HT[^\n]*\n\s*([0-9.,\u00a0 ]+)/i);
  if (m) {
    const parts = (m[1].match(/[0-9]+,[0-9]{2}/g) || []).map(num);
    if (parts.length >= 3) return parts[2];
  }
  return NaN;
}

const HT_FN = {
  MDS: htMDS, DILISCO: htDILISCO, SODIS: htSODIS, INTERFORUM: htINTERFORUM,
  'DG DIFFUSION': htDG, DG: htDG, 'HARMONIA MUNDI': htHARMONIA
};

function htGeneric(t) {
  // per-TVA-rate HT lines ("Total HT (taux à 5,50%) :11,09") -> sum
  const rateLines = [...t.matchAll(new RegExp('Total HT \\(taux[^)]*\\)\\s*:?\\s*' + NUM, 'ig'))];
  if (rateLines.length) {
    const sum = rateLines.reduce((a, m) => a + (num(m[1]) || 0), 0);
    if (sum > 0) return sum;
  }
  const labels = [
    /TOTAL GENERAL HT\s*:?\s*/i, /TOTAL NET HT\s*:?\s*/i,
    /TOTAL\s+HORS\s+TAXES?\s*:?\s*/i, /NET\s+HORS\s+TAXES?\s*:?\s*/i,
    /TOTAL HT\s*:?\s*/i, /NET HT\s*:?\s*/i, /MONTANT HT\s*:?\s*/i, /TOTAUX(?!\s*TVA)\s*/i
  ];
  for (const lab of labels) {
    const m = t.match(new RegExp(lab.source + NUM, 'i'));
    if (m) return num(m[1]);
  }
  return NaN;
}

function findTTC(t) {
  const pats = [
    /A VOTRE DEBIT\s*:?\s*/i, /Net [aà] payer\s*:?\s*/i, /TOTAL [AÀ] PAYER\s*\(?[^):]*\)?\s*:?\s*/i,
    /TOTAL TTC\s*:?\s*/i, /MONTANT TTC\s*:?\s*/i, /TTC\s*€?\s*/i
  ];
  const found = [];
  for (const p of pats) {
    const re = new RegExp(p.source + NUM, 'ig');
    let m;
    while ((m = re.exec(t)) !== null) found.push(num(m[1]));
  }
  return found.length ? Math.max(...found.filter((x) => !isNaN(x))) : NaN;
}

const DERIVE_OK = ['INTERFORUM', 'HACHETTE', 'UD FLAMMARION', 'FLAMMARION'];

export function extractHTFromText(text, fileName, opts = {}) {
  const expectedRate = opts.expectedRate || 1.055;
  const type = classifyDocument(fileName);
  const publisher = detectPublisher(fileName);

  if (type === 'statement') {
    return { status: 'skip', type, publisher, ht: 0, message: 'statement/payment-notice, excluded' };
  }
  if (!text || text.trim().length < 5) {
    return { status: 'review', type, publisher, ht: 0, message: 'no text' };
  }

  const htFn = (publisher && HT_FN[publisher]) || null;
  let ht = htFn ? htFn(text) : NaN;
  if (isNaN(ht)) ht = htGeneric(text);

  const ttc = findTTC(text);
  let derived = false;

  // derive HT = TTC / rate for book publishers whose HT line is scrambled
  if ((isNaN(ht) || ht <= 0) && !isNaN(ttc) && ttc > 0 && (DERIVE_OK.includes(publisher) || expectedRate === 1.0)) {
    const has20 = /\b20[.,]00\s*%|\b20\s*%|TAUX\s*:?\s*20/i.test(text);
    if (!has20 || expectedRate === 1.0) {
      ht = ttc / expectedRate;
      derived = true;
    }
  }

  const rate = !isNaN(ht) && ht > 0 && !isNaN(ttc) ? ttc / ht : NaN;

  if (isNaN(ht) || ht <= 0) {
    return { status: 'review', type, publisher, ht: 0, ttc, message: 'no HT total found' };
  }
  // rate > 1.30 means HT is suspiciously low vs TTC (mixed-rate/subtotal) -> review.
  // rate < 1.0 just means the detected TTC is unreliable -> trust the labeled HT.
  if (!isNaN(rate) && rate > 1.30) {
    return { status: 'review', type, publisher, ht, ttc, message: `HT/TTC sanity failed (rate=${rate.toFixed(2)})` };
  }
  if (ht > MAX_PLAUSIBLE_HT && (isNaN(rate) || rate < 1.0 || rate > 1.30)) {
    return { status: 'review', type, publisher, ht: 0, ttc, message: `implausibly large HT (${ht.toFixed(2)}, likely OCR error) — needs manual check` };
  }

  return {
    status: type === 'avoir' ? 'avoir' : 'ok',
    type, publisher, ht, ttc, derived,
    message: derived ? `HT derived from TTC/${expectedRate}` : 'HT extracted'
  };
}
