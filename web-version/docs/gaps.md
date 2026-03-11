# Web Version vs. Desktop Version Gap Report (Final Evaluation)

This document outlines the discrepancies and missing features in the `web-version` compared to the main desktop application after recent updates.

## 1. Backend Logic & PDF Parsing

The web backend's `parser-service.js` has been significantly improved by porting the sophisticated amount extraction and OCR logic from the desktop version.

| Feature | Desktop Version | Web Version | Status | Gap / Impact |
| :--- | :--- | :--- | :--- | :--- |
| **Extraction Algorithm** | Multi-tier keyword system (Supreme, Strong, Secondary, Generic) with tie-breaking and subtotal demotion. | Same logic ported from desktop. | **Closed** | **None.** Extraction accuracy should match the desktop version. |
| **OCR Resolution** | 600 DPI (for better Tesseract accuracy). | 600 DPI. | **Closed** | **None.** OCR accuracy matches the desktop version. |
| **OCR Robustness** | Tries 4 different Tesseract configurations and picks the best one based on a quality assessment. | Same configurations ported. | **Closed** | **None.** Robustness matches the desktop version. |
| **AI Fallback** | Integrated `AIDetectionService` via OpenRouter (GPT-4o/Claude) for failed or ambiguous extractions. | None. | **Open** | **High.** No recovery for documents that OCR cannot handle. |
| **Caching** | `CacheService` stores OCR results to avoid re-processing the same files. | Frontend-side scan results caching in IndexedDB. | **Partial** | **Medium.** Avoids re-scanning if the user doesn't refresh, but lacks backend OCR caching for permanent speedup. |
| **Filtering** | Excludes identifiers (IBAN, SIRET, phone numbers, etc.) from candidates. | Same filtering logic ported. | **Closed** | **None.** Reduced false positives from metadata. |
| **DOMMatrix** | Polyfilled for Node.js to ensure PDF layout compatibility. | No polyfill. | **Open** | **Low/Medium.** Potential issues with complex PDF layouts. |

## 2. Frontend & User Experience

The web frontend has been upgraded with a more robust Vue application that includes a conflict resolution UI and full i18n support.

| Feature | Desktop Version | Web Version | Status | Gap / Impact |
| :--- | :--- | :--- | :--- | :--- |
| **Conflict Resolution** | Dedicated UI (`ConflictResolver.jsx`) for reviewing and selecting candidates. | Integrated Conflict Modal with PDF preview and manual entry. | **Closed** | **None.** Users can now resolve ambiguities and failures within the app. |
| **Internationalization** | Full i18n support (English/French) with `react-i18next`. | Custom `i18n.js` with English and French support. | **Closed** | **None.** Parity with desktop language options. |
| **UI Components** | Sophisticated React components with advanced styling. | Single-file Vue app with refined CSS and interactive elements. | **Closed** | **None.** UX is now comparable in functionality and polish. |
| **Mapping UX** | Form-based mapping interface. | Table-based mapping UI with dropdowns and auto-row detection. | **Closed** | **None.** Mapping is now user-friendly and interactive. |
| **Settings** | Full Settings Modal for API keys, OCR models, and UI preferences. | Only a "Backend URL" field in Advanced Settings. | **Open** | **Medium.** Users cannot configure AI or OCR settings. |

## 3. Architecture & Infrastructure

| Feature | Desktop Version | Web Version | Status | Gap / Impact |
| :--- | :--- | :--- | :--- | :--- |
| **Persistence** | `ProjectService.js` manages project data on the local disk. | `localStorage` + `IndexedDB` for file handles. | **Partial** | **Medium.** Data is more volatile than on-disk storage, but handles are persisted. |
| **File Access** | Direct access to local file system via Node.js `fs`. | File System Access API (requires repeated user permission). | **Closed** | **UX Friction.** Inherent limitation of web browsers compared to desktop. |
| **Dependencies** | Bundles Poppler for Windows to ensure `pdftoppm` is available. | Depends on system-level Poppler installation or Docker. | **Closed** | **Deployment.** Web version provides a `Dockerfile` to handle dependencies. |
| **Logging** | Comprehensive `LoggingService.js` with structured logs. | Basic `console.log` in backend and frontend. | **Open** | **Medium.** Harder to debug issues in production. |
| **Statelessness** | Works on local files (no upload needed). | Requires uploading all PDFs to the backend for every run. | **Open** | **High.** Performance and privacy concerns for large sets of documents. |

## Final Remaining Priorities for Parity

1.  **AI Fallback Integration:** Port `AIDetectionService.js` to the web backend and add API key configuration to the frontend to handle OCR failures.
2.  **Backend OCR Caching:** Implement a backend-side cache (e.g., using file hashes) to avoid re-processing the same PDF buffers across different users or sessions.
3.  **DOMMatrix Polyfill:** Add the `DOMMatrix` polyfill to `web-version/backend/src/services/parser-service.js` to ensure maximum PDF compatibility.
4.  **Logging Service:** Create a more structured logging system for the web backend to help with remote debugging.
