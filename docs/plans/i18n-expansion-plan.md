# i18n Expansion Plan: Multi-Language Support

## Current Status (Feb 6, 2026)
- **i18n Framework**: ✅ `i18next` + `react-i18next` configured
- **Supported Languages**: EN, FR (partial - first view only)
- **Scope**: EN/FR languages only (no Spanish planned)

## Existing Translations (Limited Scope)
Currently only covering first view (Dashboard + Scan/Conflicts):
```json
- dashboard.*
- scan.*
- conflicts.*
```
**Target**: Expand to cover all views with EN/FR parity

## Views & Components Requiring Translation

### 1. **Dashboard.jsx**
   - "Delete" (button title)
   - "Force Re-scan" (button title)
   - Project card actions

### 2. **ProjectForm.jsx**
   - "Select Directory" (button title)
   - "Select Spreadsheet" (button title)
   - "Folder Name" (placeholder)
   - Form labels and validation messages
   - Mapping table headers and buttons

### 3. **ExecutionView.jsx**
   - Progress messages
   - Status labels
   - Result summaries
   - Error/success messages

### 4. **ConflictResolverPDF.jsx**
   - "Hide PDF" / "Show PDF"
   - "PDF Preview" (title)
   - PDF viewer controls and labels

### 5. **ConflictResolver.jsx**
   - Modal titles and messages
   - Button labels
   - Form fields

### 6. **CollapsibleSection.jsx**
   - Section headers/titles

### 7. **LanguageSelector.jsx**
   - Currently minimal, but needs consistent styling

### 8. **General UI Elements**
   - Common buttons: Save, Cancel, Continue, Back, Next
   - Common labels: Error, Success, Warning, Loading
   - Validation messages
   - Status indicators

## Implementation Strategy

### Phase 1: Audit & Plan (1 day)
1. Identify all hardcoded strings in `.jsx` files
2. Define complete translation key structure for EN/FR parity
3. Map keys across all views/components

### Phase 2: Expand Translation Files (2-3 days)
1. Expand `en.json` with all missing keys (~100+ total)
2. Add corresponding `fr.json` translations (maintain parity)
3. No config changes needed (ES already excluded)

### Phase 3: Update Components (3-4 days)
1. Update all components to use `useTranslation()` hook
2. Replace hardcoded strings with translation keys via `t()` calls
3. Test language switching across all views

### Phase 4: Quality Assurance (1-2 days)
1. Verify all strings are translatable
2. Check for missing translation keys (console warnings)
3. Test language persistence via localStorage

## Translation Keys Structure

```
{
  "common": {
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "edit": "Edit",
    "loading": "Loading...",
    "error": "Error",
    "success": "Success",
    "warning": "Warning",
    "back": "Back",
    "next": "Next",
    "continue": "Continue"
  },
  "dashboard": { ... },
  "projectForm": {
    "title": "Create Project",
    "selectDirectory": "Select Directory",
    "selectSpreadsheet": "Select Spreadsheet",
    "folderName": "Folder Name",
    "mappingTable": {
      "header": "Folder Mappings",
      "add": "Add Mapping",
      "remove": "Remove"
    }
  },
  "execution": {
    "title": "Execution",
    "scanning": "Scanning...",
    "parsing": "Parsing...",
    "processing": "Processing...",
    "complete": "Complete",
    "failed": "Failed"
  },
  "pdfViewer": {
    "show": "Show PDF",
    "hide": "Hide PDF",
    "preview": "PDF Preview"
  }
}
```

## Languages to Support

1. **English (en)** - Primary
2. **French (fr)** - Existing partial (expand to full)

## Success Criteria

- [ ] All UI strings are translatable (0 hardcoded strings in production views)
- [ ] EN and FR have complete parity in translation keys
- [ ] Language switcher works across all views
- [ ] Selected language persists via localStorage
- [ ] No missing translation keys (console warnings = 0)
- [ ] All components use `useTranslation()` hook
- [ ] No Spanish (ES) support added

## Files to Modify

### Modified Files
- `src/renderer/src/i18n/locales/en.json` (expand keys from ~30 to ~100+)
- `src/renderer/src/i18n/locales/fr.json` (expand keys with FR translations)
- All component files (add `useTranslation()` hook)

### Affected Components
- Dashboard.jsx
- ProjectForm.jsx
- ExecutionView.jsx
- ConflictResolver.jsx
- ConflictResolverPDF.jsx
- CollapsibleSection.jsx
- LanguageSelector.jsx

## Timeline

| Phase | Task | Duration | Status |
|-------|------|----------|--------|
| 1 | Audit & Plan | 1 day | ⏳ Pending |
| 2 | Expand EN/FR translation files | 2-3 days | ⏳ Pending |
| 3 | Update all components | 3-4 days | ⏳ Pending |
| 4 | QA & Testing | 1-2 days | ⏳ Pending |
| **Total** | | **7-10 days** | |

## Scope Definition

**IN SCOPE**: 
- All text in Dashboard, ProjectForm, ExecutionView, ConflictResolver, ConflictResolverPDF
- Common UI elements (buttons, labels, placeholders)
- Error/success/warning messages
- Form validation messages

**OUT OF SCOPE**:
- Spanish (ES) language support
- RTL language support
- Documentation localization
- PDF content OCR translations (handled separately by OCR engine)
