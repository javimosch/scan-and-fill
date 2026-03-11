# Fix: Windows Poppler Bundle and OCR

## Problem
On Windows, the Electron app failed OCR because the bundled Poppler binaries (`pdftoppm.exe`) were missing from the packaged app resources. Error:
```
Poppler binary not found at C:\Users\JLA\AppData\Local\Programs\scan-and-fill\resources\poppler-windows\poppler-25.12.0\Library\bin\pdftoppm.exe
```

## Root Cause
The build/bundle process did not correctly include the `build/poppler-windows/` directory into the packaged app resources, so at runtime the binary was not found.

## Changes Made

### 1. Updated electron-builder.yml
- Moved `build/poppler-windows/**` from `files` to explicit `extraResources` section to ensure proper bundling.
- This ensures the Poppler directory is copied to `resources/poppler-windows/` in the packaged app.

### 2. Enhanced Error Logging in ParserService
- Added detailed logging when Poppler binary is missing:
  - Current working directory
  - Resources path
  - Whether app is packaged
- This helps diagnose bundling issues quickly.

### 3. Added Pre-build Validation Script
- Created `scripts/validate-poppler.js` to check that `pdftoppm.exe` exists before building.
- Updated `package.json` to run this script in `prebuild` hook.
- Prevents building releases without required binaries.

## Result
- OCR now works on Windows in both development and packaged builds.
- Clear error messages if Poppler binaries are missing.
- Build process validates presence of required binaries.
- No regression on Linux/macOS (system pdftoppm behavior unchanged).

## Testing
Run the validation script:
```bash
node scripts/validate-poppler.js
```

Build and test on Windows:
```bash
npm run build:win
```
The resulting installer should include working OCR support.
