#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, '..');

const popplerBinaryPath = path.join(repoRoot, 'build', 'poppler-windows', 'poppler-25.12.0', 'Library', 'bin', 'pdftoppm.exe');

if (!fs.existsSync(popplerBinaryPath)) {
  console.error(`❌ Poppler binary not found: ${popplerBinaryPath}`);
  console.error('Please ensure build/poppler-windows/ directory is present and contains pdftoppm.exe');
  process.exit(1);
}

console.log(`✅ Poppler binary found: ${popplerBinaryPath}`);
const stats = fs.statSync(popplerBinaryPath);
console.log(`   Size: ${(stats.size / 1024).toFixed(2)} KB`);
console.log(`   Modified: ${stats.mtime.toISOString()}`);
process.exit(0);
