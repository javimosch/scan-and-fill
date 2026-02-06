# scan-and-fill

A desktop application for automated invoice scanning, OCR-based amount extraction, and Excel data entry. Built with Electron and React.

## Features

- **PDF Document Scanning**: Automatically scan and organize PDF invoices by month and category
- **OCR Amount Extraction**: Extract currency amounts from both digital and scanned PDFs using Tesseract.js
- **Multi-language Support**: Available in English, French, and Spanish
- **Smart Parsing**: Intelligent amount detection with ambiguity resolution for "Total TTC", "Net à payer", and other billing terms
- **Excel Integration**: Automatically fill extracted data into Excel spreadsheets
- **Cross-platform**: Builds for Windows, macOS, and Linux

## How It Works

1. **Create a Project**: Set up a project with a root folder path and Excel configuration
2. **Scan Documents**: The app scans for month-named folders and category sub-folders containing PDFs
3. **Extract Amounts**: Each PDF is processed to extract the invoice total using:
   - Direct text extraction for digital PDFs
   - OCR (Tesseract.js) for scanned PDFs
4. **Resolve Ambiguities**: When multiple amounts are detected, intelligent conflict resolution helps select the correct total
5. **Fill Excel**: Extracted amounts are written to the configured Excel file

## Requirements

- Node.js 18+
- `pdftoppm` (part of poppler-utils) for OCR processing
  - Ubuntu/Debian: `sudo apt-get install poppler-utils`
  - macOS: `brew install poppler`

## Project Setup

### Install

```bash
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
# For Windows
npm run build:win

# For macOS
npm run build:mac

# For Linux
npm run build:linux
```

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Author

Javier Leandro Arancibia - arancibiajav@gmail.com

## License

MIT
