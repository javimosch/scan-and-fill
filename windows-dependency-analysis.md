# Windows Runtime Dependency Analysis

## Critical Issue: Linux Dependencies That Will Fail on Windows

### 🚨 **BLOCKER: pdftoppm Dependency**

**Location**: `src/main/services/ParserService.js:76`
```javascript
execSync(`pdftoppm -png -r 300 "${filePath}" "${outputPrefix}"`);
```

**Problem**: 
- `pdftoppm` is part of poppler-utils, available by default on Linux
- **NOT available on Windows by default**
- This will cause OCR processing to fail completely

**Impact**: 
- Users cannot process scanned PDFs
- App will crash with "command not found" error
- Core functionality broken

### 🔍 **Other Potential Issues**

#### 1. **Path Handling Issues**
**Location**: Multiple files use `path.join()` with Unix-style assumptions
```javascript
// These might work but could have edge cases on Windows
path.join(os.tmpdir(), 'ocr-')
path.join(userDataPath, 'projects.json')
```

#### 2. **Temp Directory Permissions**
**Location**: `ParserService.js:68`
```javascript
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-'));
```
**Potential Issue**: Windows temp directory permissions and naming conventions

#### 3. **File System Operations**
**Locations**: Various services use `fs.readdirSync`, `fs.existsSync`, etc.
**Mostly Compatible**: Node.js fs module works cross-platform

## Solutions Required

### Option 1: Bundle poppler-utils (Recommended)
- Include Windows binaries for pdftoppm
- Update ParserService to detect platform and use appropriate binary
- Add to electron-builder.yml asarUnpack

### Option 2: Pure JavaScript Alternative
- Use pdf-poppler (Node.js wrapper)
- Or implement PDF-to-image conversion using canvas/pdf2pic

### Option 3: Fallback Strategy
- Detect if pdftoppm is available
- Provide clear error message to users
- Offer installation instructions

## Implementation Priority

1. **CRITICAL**: Fix pdftoppm dependency
2. **MEDIUM**: Test path handling on Windows
3. **LOW**: Improve error messages and fallbacks
