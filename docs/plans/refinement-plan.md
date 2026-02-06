# Implementation Plan: scan-and-fill Refinements

## 1. Document Caching
- **Service**: `DocumentCacheService`.
- **Functionality**:
    - For each project, maintain a tracking file.
    - Store: `filePath, mtime, lastStatus, extractedAmount`.
    - Logic: If file exists in cache and `mtime` matches, skip extraction.

## 2. Enhanced PDF Extraction
- **Service**: `ParserService`.
- **Refinement**:
    - Instead of returning one number, return a list of `candidates`.
    - A candidate includes the `amount` and its `context` (surrounding words).
    - Status codes: `SUCCESS` (one clear match), `AMBIGUOUS` (multiple candidates), `FAILED` (no candidates).

## 3. UI Conflict Resolution
- **Component**: `ConflictResolver` (Modal).
- **Features**:
    - Show ambiguous files in `ExecutionView`.
    - Allow user to pick from a list of candidates.
    - Allow manual input if extraction failed.
    - Provide a "Context" snippet to help the user decide.

## 4. Manual Re-scan
- Add a "Clear Cache" or "Re-scan" button in the Project Dashboard/Form to force processing of all files.
