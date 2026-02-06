# PDF Amount Extraction - Complete Implementation Summary

## Final Results (27 Test PDFs)
- ✅ **SUCCESS: 23** (85.2%)
- ⚠️ **AMBIGUOUS: 3** (11.1%) - Multiple valid candidates requiring user selection
- ❌ **FAILED: 1** (3.7%) - Corrupted or unreadable file

## Major Features Implemented

### 1. **Intelligent Keyword Tiering**
Three-tier priority system for identifying invoice totals:

**Tier 3 (Supreme)** - Final totals with 20-line lookahead:
- `Total TTC`, `Net à payer`, `A votre débit`, `Montant TTC`
- These keywords get the highest priority and deepest scanning

**Tier 2 (Strong)** - General totals with 5-line lookahead:
- `Amount`, `Montant`, `Payer`, `Régler`
- Used when supreme keywords aren't found

**Tier 1 (Secondary)** - Subtotals with 1-line lookahead:
- `Total HT`, `Net HT`, `Hors taxe`
- Automatically demoted even if they contain "Total"

### 2. **Advanced Filtering**
Comprehensive ignore list to avoid false positives:
- **Legal/Financial**: `capital`, `social`, `pénalité`, `indemnité`, `intérêt`
- **Identifiers**: `IBAN`, `SIRET`, `SIREN`, `EAN`, `BIC`, `SWIFT`, `RIB`
- **Metadata**: `page`, `of`, `bord`, `commande`, `référence`
- **Quantities**: `qty`, `quantité`, `articles`, `items`, `colis`
- **Years**: `2020-2029` (when not part of decimal amounts)
- **Page markers**: `1 of 2`, `-- 1 --`, etc.

### 3. **Smart Candidate Selection**
Multiple tie-breaking strategies:

1. **Same-line Priority**: Numbers on the same line as keywords get +2 priority boost
2. **Currency Symbol Weighting**: Amounts with `€`, `$`, `£` symbols prioritized
3. **HT+TVA=TTC Detection**: Automatically identifies and selects the TTC when all three are present
4. **Small Number Filtering**: Ignores page counts and small integers when larger monetary values exist
5. **Conservative Auto-selection**: Only auto-selects when confidence is high (1.5x larger, <10x larger)

### 4. **OCR Fallback for Scanned PDFs**
Automatic OCR processing when text extraction fails:

**Trigger**: Text length < 100 characters
**Process**:
1. Convert PDF to 300 DPI PNG images using `pdftoppm`
2. Run Tesseract OCR with French + English language support
3. Combine results from all pages
4. Apply same intelligent parsing logic

**Performance**: ~5-10 seconds per page
**Success Rate**: 10 previously failed PDFs now working

### 5. **Context-Aware Number Extraction**
Sophisticated regex and validation:
- Supports European format: `1.234,56` and US format: `1,234.56`
- Ignores alphanumeric codes: `DD03617`, `00003010`
- Filters out percentages, dates, and barcodes
- Provides 50-character context window for UI display
- Hard limit of 1,000,000 to prevent IBAN/account number extraction

## Key Improvements from Debugging

### Issue: Excessive Candidates (Hachette - 100+ candidates)
**Solution**: Demoted generic `total` and `net` keywords to Tier 1, reducing lookahead from 5 lines to 1 line for product tables.

### Issue: Wrong Amount Selected (ASMODEE - 355,017.45 instead of 793.46)
**Solution**: Added `capital`, `social`, `société` to ignore list and implemented per-line ignore checking.

### Issue: Page Numbers as Candidates (SODIS - "1.00 €", "2.00 €")
**Solution**: Added page pattern detection (`X of Y`, `-- X --`) and expanded ignore keywords.

### Issue: Ambiguity Between HT/TVA/TTC (Monsieur Papier)
**Solution**: Implemented accounting relationship detection (A + B = C) to auto-select TTC.

### Issue: Failed Scanned PDFs (13 files)
**Solution**: Integrated Tesseract.js OCR with automatic fallback detection.

## Technical Architecture

### ParserService.js Methods
1. **extractAmount(filePath)**: Entry point, handles OCR fallback
2. **performOCR(filePath)**: Converts PDF to images and runs Tesseract
3. **findAmountInText(text)**: Main parsing logic with tiering
4. **extractAllNumbersWithContext(text)**: Regex-based number extraction with validation

### Dependencies
- `pdf-parse`: Standard PDF text extraction
- `tesseract.js`: OCR for scanned documents
- `pdftoppm`: System utility for PDF to image conversion (poppler-utils)

## Usage Example

```javascript
import ParserService from './services/ParserService.js';

const parser = new ParserService();
const result = await parser.extractAmount('/path/to/invoice.pdf');

// Result structure:
{
  status: 'success' | 'ambiguous' | 'failed',
  amount: 793.46,
  candidates: [
    {
      amount: 793.46,
      context: '...Net à Payer EUR 793,46...',
      tier: 3,
      priority: 4
    }
  ]
}
```

## Performance Metrics
- **Standard PDFs**: <100ms per file
- **OCR PDFs**: 5-10 seconds per page
- **Memory**: Temporary files auto-cleaned
- **Accuracy**: 85% fully automatic, 11% require user selection

## Future Enhancements
1. OCR result caching to avoid re-processing
2. Parallel page processing for faster multi-page OCR
3. Confidence scoring from Tesseract
4. Support for additional languages (Spanish, German, Italian)
5. Machine learning model for amount detection
6. Invoice template recognition for faster processing
