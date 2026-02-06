# PDF Preview & Fallback Fixes

## 1. Fixed "Blank PDF" (Protocol Path Parsing) 🛠️
- **Issue**: The `app-file:` protocol handler was not correctly parsing absolute paths on Linux/Mac, leading to `ERR_FILE_NOT_FOUND` because the first path segment (e.g., `home`) was being interpreted as a hostname and stripped from the path.
- **Fix**: Updated `src/main/index.js` to correctly reconstruct the absolute path from the parsing result, ensuring `/home/user/...` remains intact.

## 2. Added "Open in System Viewer" Fallback 📄
- **Feature**: Added an "Open External" button (icon: External Link) in the PDF preview toolbar.
- **Implementation**:
  - **Main**: Added `open-path` IPC handler using `shell.openPath`.
  - **Preload**: Exposed `api.openPath`.
  - **UI**: Added button to `ConflictResolverPDF.jsx`.

## 3. Status
- **PDF Preview**: Should now render correctly inside the app.
- **Fallback**: If not, you can click the new button to open the PDF in your default system viewer (e.g., Evince, Acrobat).
- **Environment**: Ensure you restart the app to pick up the `main/index.js` changes.
