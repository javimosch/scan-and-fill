# Web Version vs. Desktop Version Gap Report

This document outlines the discrepancies and missing features in the `web-version` compared to the main desktop application.

## 1. Backend Logic & PDF Parsing

The web backend's `parser-service.js` is significantly less sophisticated than the desktop's `ParserService.js`.

| Feature | Desktop Version | Web Version | Gap / Impact |
| :--- | :--- | :--- | :--- |
| **Extraction Algorithm** | Multi-tier keyword system (Supreme, Strong, Secondary, Generic) with tie-breaking and subtotal demotion. | Basic regex patterns for "total" and currency symbols. | **High.** Web version is much more likely to return incorrect or ambiguous amounts. |
| **OCR Resolution** | 600 DPI (for better Tesseract accuracy). | 300 DPI. | **Medium.** Lower accuracy on small or blurry text. |
| **OCR Robustness** | Tries 4 different Tesseract configurations and picks the best one based on a quality assessment. | Single Tesseract call with hardcoded French+English. | **High.** Less robust for varied document layouts. |
| **AI Fallback** | Integrated `AIDetectionService` via OpenRouter (GPT-4o/Claude) for failed or ambiguous extractions. | None. | **High.** No recovery for documents that OCR cannot handle. |
| **Caching** | `CacheService` stores OCR results to avoid re-processing the same files. | No caching. | **Medium.** Every "Run" requires full processing of all uploaded PDFs. |
| **Filtering** | Excludes identifiers (IBAN, SIRET, phone numbers, etc.) from candidates. | No identifier filtering. | **High.** Likely to pick up account numbers or metadata as amounts. |
| **DOMMatrix** | Polyfilled for Node.js to ensure PDF layout compatibility. | No polyfill. | **Low/Medium.** Potential issues with complex PDF layouts. |

## 2. Frontend & User Experience

The web frontend is a basic Vue single-page application, while the desktop version is a full-featured React app.

| Feature | Desktop Version | Web Version | Gap / Impact |
| :--- | :--- | :--- | :--- |
| **Conflict Resolution** | Dedicated UI (`ConflictResolver.jsx`) for reviewing and selecting candidates for ambiguous/failed files. | Simple table display; no interactive resolution. | **High.** Users cannot fix errors without manual spreadsheet editing. |
| **Internationalization** | Full i18n support (English/French) with `react-i18next`. | Hardcoded in English. | **Medium.** Less accessible to non-English speakers. |
| **UI Components** | Sophisticated React components (Collapsible Sections, Settings Modals, etc.). | Single-page Vue template with basic styles. | **Medium.** Less polished and harder to navigate for large projects. |
| **Mapping UX** | Likely form-based mapping interface. | Manual JSON editing for category mapping. | **High.** Error-prone and difficult for non-technical users. |
| **Settings** | Full Settings Modal for API keys, OCR models, and UI preferences. | Only a "Backend URL" field. | **Medium.** Users cannot configure AI or OCR settings. |

## 3. Architecture & Infrastructure

| Feature | Desktop Version | Web Version | Gap / Impact |
| :--- | :--- | :--- | :--- |
| **Persistence** | `ProjectService.js` manages project data on the local disk. | `localStorage` + `IndexedDB` for file handles. | **Medium.** Data is easily lost if browser cache is cleared. |
| **File Access** | Direct access to local file system via Node.js `fs`. | File System Access API (requires repeated user permission). | **Medium.** UX friction due to browser security restrictions. |
| **Dependencies** | Bundles Poppler for Windows to ensure `pdftoppm` is available. | Depends on system-level Poppler installation. | **High.** Backend will fail if Poppler is not installed on the server. |
| **Logging** | Comprehensive `LoggingService.js` with structured logs. | Minimal `console.log` in backend. | **Medium.** Harder to debug issues in production. |
| **Statelessness** | Works on local files (no upload needed). | Requires uploading all PDFs to the backend for every run. | **High.** Performance and privacy concerns for large sets of documents. |

## Recommendations for Parity

1.  **Port Parser Logic:** Migrate the multi-tier keyword and tie-breaking logic from `src/main/services/ParserService.js` to the web backend.
2.  **Implement Conflict Resolver:** Create a UI in the web frontend to handle the `conflicts` array returned by the `/api/v1/run` endpoint.
3.  **Add AI Fallback:** Port `AIDetectionService.js` to the web backend and add API key configuration to the frontend.
4.  **Improve Mapping UX:** Replace the manual JSON editor with a table-based mapping interface (Source Folder -> Spreadsheet Category).
5.  **Add i18n:** Implement a translation system (e.g., `vue-i18n`) to match desktop's language support.
6.  **Enhance OCR:** Increase DPI to 600 and implement multiple Tesseract configurations as seen in the desktop version.
