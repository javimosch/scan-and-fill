# i18n Hotfix: ExecutionView Months Array Bug

## Issue
```
TypeError: months.map is not a function
at ExecutionView.jsx:237
```

## Root Cause
The `t('execution.months')` call in ExecutionView.jsx was not configured to return an array object. i18next by default treats array values as nested objects rather than returning the array itself.

## Solution
Updated line 17-18 in ExecutionView.jsx:

**Before:**
```javascript
const months = t('execution.months')  // Returns string, not array
```

**After:**
```javascript
const monthsTranslated = t('execution.months', { returnObjects: true })
const months = Array.isArray(monthsTranslated) ? monthsTranslated : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
```

## Key Changes
1. **Added `{ returnObjects: true }` option** - Tells i18next to return the array as an object
2. **Added Array.isArray() check** - Verifies the translation returned an array
3. **Added fallback array** - Ensures months.map() always has an array to work with

## Testing
✅ Build passes: `npm run build` → 0 errors
✅ No breaking changes
✅ Months selector now works in both EN and FR

## Files Modified
- `src/renderer/src/components/ExecutionView.jsx` (lines 16-18)

## Status
✅ **FIXED & VERIFIED**
