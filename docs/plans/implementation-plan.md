# Implementation Plan: scan-and-fill

## 1. Technology Stack
- **Framework**: Electron (for Cross-Platform Desktop support).
- **Frontend**: React + Vite (Modern, fast, and rich UI).
- **Desktop APIs**: Node.js `fs` and `path` for folder traversal.
- **Parsing**: `pdf-parse` for PDF text extraction.
- **Excel**: `exceljs` for writing to `.xlsx` files without losing formatting.

## 2. Core Architecture

### 2.1 Scanner (Folder Traversal)
- Recursive scan of `Root Folder`.
- Regex-based month identification:
  - English: `January`, `Jan`, etc.
  - French: `Janvier`, `Janv`, etc.
  - Spanish: `Enero`, `Ene`, etc.
- Year extraction from folder names if present.

### 2.2 Mapper (Configuration)
- Stores project settings in a local JSON config.
- Maps `Folder Name` -> `Excel Category Label`.
- Maps `Month Cell` -> `Excel Month Row/Column`.

### 2.3 Filler (Excel Integration)
- Loads the target Excel file.
- Iterates through the scanned data.
- Sums totals by category/month.
- Updates cells and saves.

## 3. Customization & Extensibility
- **App Name**: Configurable via `branding.json`.
- **Language Support**: Uses `i18next` for UI localization.
- **PDF Layouts**: Includes a configurable "Amount Extraction" pattern (e.g. searching for the last numeric value after keywords like "Total", "Montant", "Importe").

## 4. Security & Privacy
- All processing is local (no data sent to cloud).
- User selects local root and local Excel files.

## 5. Development Phases
1. **Phase 1**: Setup Electron + Vite boilerplate.
2. **Phase 2**: Implement Folder Scanner and Month detection logic.
3. **Phase 3**: Implement PDF parsing and amount extraction.
4. **Phase 4**: Implement Excel writing service.
5. **Phase 5**: Build the Configuration UI (Project creation, mapping table).
6. **Phase 6**: Polish UI/UX and localization.
