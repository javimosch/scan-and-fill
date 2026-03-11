import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { rateLimitByHostname } from './middleware/rate-limit-by-hostname.js';
import { getSpreadsheetMetadata, applySummaryToSpreadsheet } from './services/excel-service.js';
import { runProject, extractSingleFile } from './services/run-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({ limits: { fileSize: 35 * 1024 * 1024 }, storage: multer.memoryStorage() });
const port = Number.parseInt(process.env.PORT || '8787', 10);

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const ts = new Date().toLocaleString();
    // eslint-disable-next-line no-console
    console.log(`HTTP  ${ts} ${req.ip} ${req.method} ${req.originalUrl} → ${res.statusCode} in ${ms} ms`);
  });
  next();
});

app.use(rateLimitByHostname);

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'scan-and-fill-web-backend' });
});

app.post('/api/v1/excel/metadata', upload.single('spreadsheet'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json(errorEnvelope('MISSING_FILE', 'Missing spreadsheet file'));
    }

    const { sheetName = '', categoryColumn = 'A', monthStartCell = 'B1' } = req.body;
    const metadata = await getSpreadsheetMetadata(
      req.file.originalname,
      req.file.buffer,
      sheetName,
      categoryColumn,
      monthStartCell
    );

    return res.json({ metadata });
  } catch (error) {
    return res.status(500).json(errorEnvelope('METADATA_FAILED', error.message));
  }
});

app.post('/api/v1/extract-single', upload.single('pdfFile'), async (req, res) => {
  try {
    const project = parseJsonBody(req.body.project, {});
    const relativePath = req.body.relativePath || req.file?.originalname || '';
    if (!req.file) {
      return res.status(400).json(errorEnvelope('MISSING_PDF', 'PDF file is required'));
    }
    const result = await extractSingleFile({ project, pdfFile: req.file, relativePath });
    return res.json({ result });
  } catch (error) {
    return res.status(500).json(errorEnvelope('EXTRACT_FAILED', error.message));
  }
});

app.post('/api/v1/run', upload.array('pdfFiles', 500), async (req, res) => {
  try {
    const project = parseJsonBody(req.body.project, {});
    const pdfFiles = req.files || [];
    if (pdfFiles.length === 0) {
      return res.status(400).json(errorEnvelope('MISSING_PDFS', 'At least one PDF is required'));
    }

    // Multer strips path separators from filenames, so we receive the
    // relative paths (month/category/file.pdf) as a separate JSON field.
    const paths = parseJsonBody(req.body.paths, []);
    for (let i = 0; i < pdfFiles.length; i++) {
      pdfFiles[i].relativePath = paths[i] || pdfFiles[i].originalname;
    }

    const summary = await runProject({ project, pdfFiles });
    return res.json({ summary });
  } catch (error) {
    return res.status(500).json(errorEnvelope('RUN_FAILED', error.message));
  }
});

app.post(
  '/api/v1/finalize',
  upload.fields([
    { name: 'spreadsheet', maxCount: 1 },
    { name: 'payload', maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const spreadsheet = req.files?.spreadsheet?.[0];
      if (!spreadsheet) {
        return res.status(400).json(errorEnvelope('MISSING_SPREADSHEET', 'Spreadsheet file is required'));
      }

      const payload = parseJsonBody(req.body.payload, {});
      const project = payload.project || {};
      const summary = payload.summary || {};

      const finalTotals = recomputeTotals(summary);
      const mapping = {
        monthStartCell: project?.excelConfig?.monthStartCell || 'B1',
        categoryRows: project?.excelConfig?.categoryRowsMap || {}
      };

      const outputBuffer = await applySummaryToSpreadsheet(
        spreadsheet.originalname,
        spreadsheet.buffer,
        project?.excelConfig?.sheetName,
        mapping,
        finalTotals
      );

      const ext = spreadsheet.originalname.toLowerCase().endsWith('.ods') ? 'ods' : 'xlsx';
      const filename = `updated-${Date.now()}.${ext}`;
      res.setHeader('Content-Type', ext === 'ods' ? 'application/vnd.oasis.opendocument.spreadsheet' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(Buffer.from(outputBuffer));
    } catch (error) {
      return res.status(500).json(errorEnvelope('FINALIZE_FAILED', error.message));
    }
  }
);

const frontendDir = path.resolve(__dirname, '../../frontend');
app.use(express.static(frontendDir));
app.get('*', (_req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[web-backend] listening on :${port}`);
  // eslint-disable-next-line no-console
  console.log(`[web-backend] serving frontend from ${frontendDir}`);
});

function parseJsonBody(input, fallback) {
  if (!input) return fallback;
  try {
    return JSON.parse(input);
  } catch {
    return fallback;
  }
}

function recomputeTotals(summary) {
  const totals = { ...(summary.totals || {}) };
  for (const file of summary.files || []) {
    if (file.resolvedAmount === undefined) continue;
    if (!totals[file.month]) totals[file.month] = {};
    if (!totals[file.month][file.category]) totals[file.month][file.category] = 0;
    totals[file.month][file.category] += Number(file.resolvedAmount || 0);
  }
  return totals;
}

function errorEnvelope(code, message, details = null) {
  return { error: { code, message, details } };
}
