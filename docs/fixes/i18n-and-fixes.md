# i18n & CSP Implementation Report

## 1. Fixed PDF Preview (Security Policy) 🔒
**Issue**: The preview was blocked by the browser's security rules (`ERR_BLOCKED_BY_CSP`).
**Fix**: Updated `src/renderer/index.html` to explicitly allow the `app-file:` protocol in frames.
- **CSP Change**: Added `frame-src 'self' app-file:;` to the Content Security Policy meta tag.

## 2. Fixed Language Selector UI 🎨
**Issue**: The dropdown options were unreadable (white text on white background) in the dark theme.
**Fix**:
- **Styling**: Forced a dark background (`#333`) and white text (`#fff`) on the `<option>` elements in `LanguageSelector.jsx`.
- **Localization**: Updated the label "Language:" to use the localized string `{t('dashboard.language')}`.

## 3. i18n System Overview 🌍
- **Engine**: `react-i18next`
- **Storage**: `localStorage` (persists on restart)
- **Languages**: English / French
- **Integration**: Fully integrated into Dashboard and Conflict Resolution UI logic.

## 4. Environment
If you still see startup crashes, ensure you have reset your environment:
```bash
rm -rf node_modules package-lock.json out
npm install
npm run dev
```
