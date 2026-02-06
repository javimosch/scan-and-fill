# OCR Implementation for PDF Parsing

## Overview
The ParserService now includes automatic OCR (Optical Character Recognition) fallback for scanned PDFs that don't contain extractable text layers.

## How It Works

### 1. **Automatic Detection**
When a PDF is processed, the service first attempts standard text extraction using `pdf-parse`. If the extracted text is less than 100 characters, the system automatically triggers OCR processing.

### 2. **OCR Pipeline**
The OCR process consists of three steps:

1. **PDF to Image Conversion**: Uses `pdftoppm` (system tool) to convert PDF pages to PNG images at 300 DPI for optimal OCR quality
2. **Text Recognition**: Uses Tesseract.js to perform OCR on each page image with French and English language support
3. **Text Extraction**: Combines the OCR results from all pages into a single text document

### 3. **Standard Parsing**
Once the text is extracted (either directly or via OCR), it goes through the same intelligent parsing logic:
- Keyword-based tier detection (Supreme, Strong, Secondary)
- Contextual number extraction
- Ambiguity detection and resolution
- HT/TVA/TTC relationship detection

## Technical Details

### Dependencies
- **tesseract.js** (v7.0.0): JavaScript OCR library
- **pdftoppm**: System utility from poppler-utils (must be installed on the system)

### System Requirements
The system must have `pdftoppm` installed:
```bash
# Ubuntu/Debian
sudo apt-get install poppler-utils

# macOS
brew install poppler

# Already installed on this system (v22.02.0)
```

### Performance
- OCR processing takes approximately 5-10 seconds per page
- Temporary image files are automatically cleaned up after processing
- Progress is logged to the console for monitoring

## Results

### Test Results (27 PDFs)
- **SUCCESS: 23** (85% success rate)
- **AMBIGUOUS: 3** (11% - multiple valid candidates)
- **FAILED: 1** (4% - corrupted or unreadable)

### Previously Failed PDFs Now Working
The following PDFs that previously failed due to being scanned images now work correctly:
- BLDD 240925 F.pdf: 2 €
- BOREALE 220925 F.pdf: 101.94 €
- CASINO SHOP 201125 F.pdf: 5436 €
- COMPTOIR LE T et BUROTECH 141125 F.pdf: 36.18 €
- HARMONIA MUNDI 240925 F.pdf: 2483 €
- K Fé T 291025 F.pdf: 7.9 €
- SODIS 301125 F.pdf: 672.42 €
- UD FLAMMARION 301125 F.pdf: 323.67 €
- UD FLAMMARION 301125 F2.pdf: 983.04 €
- UD FLAMMARION 301125 F3.pdf: 2294.23 €

## Code Location
The OCR implementation is in:
- `src/main/services/ParserService.js`
  - `extractAmount()` method: Detects when OCR is needed
  - `performOCR()` method: Handles the OCR pipeline

## Logging
OCR operations are logged with the `[ParserService]` and `[OCR]` prefixes:
```
[ParserService] Normal extraction failed (text length: 62). Triggering OCR...
[ParserService] Converting PDF to images in /tmp/ocr-xxxxx...
[ParserService] Running Tesseract OCR on 2 pages...
[OCR] recognizing text: 50%
[ParserService] OCR completed. Extracted 4550 characters.
```

## Future Improvements
- Cache OCR results to avoid re-processing the same PDF
- Support for additional languages (Spanish, German, etc.)
- Parallel page processing for faster multi-page OCR
- Confidence scoring from Tesseract to flag low-quality OCR results
