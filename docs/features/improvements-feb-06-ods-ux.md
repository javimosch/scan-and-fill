# ODS Fixes & UX Improvements (Feb 6)

## 1. ODS Formatting Preservation 📊
**Issue**: Editing ODS files was stripping formatting (bold, fonts).
**Fix**: Updated `ExcelService.js` to strictly request cell styles, number formats, and dates when reading ODS files (`cellStyles: true`). This ensures the internal workbook model retains the original styling before writing it back.

## 2. Auto-Fill Manual Amount ⚡
**Feature**: When openning a conflict resolution dialog, if a manual entry was previously saved for that file, the "Manual Entry" field is now **automatically populated**.
**Benefit**: You can simply click "Apply" immediately without re-typing the amount.

## 3. Auto-Advance Conflict Resolution ⏩
**Feature**: After resolving a conflict (applying an amount), the app now **automatically opens the next unresolved conflict** in the list.
**Benefit**: Speeds up the workflow significantly.

## 4. Conflict Count Indicator 🔢
**Feature**: The conflict resolution modal now displays a badge in the header (e.g., "**2 Left**") showing how many conflicts remain unresolved.
**Benefit**: Gives you immediate context on your progress without having to close the modal.

## Files Modified
- `src/main/services/ExcelService.js`
- `src/renderer/src/components/ConflictResolverPDF.jsx`
- `src/renderer/src/components/ExecutionView.jsx`
