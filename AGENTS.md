# Agent Rules for scan-and-fill

## Verification
- This project has no `test` script. The verification gate is `npm run lint` followed by `npm run build`.
- Use project-local tools via `npm run <script>` or `npx <tool>`; do not rely on bare global binaries.

## Code Conventions
- `src/main/services/ParserService.js` is the source of truth for PDF page count and AI fallback logic.
- The root `index.js` is a stale CommonJS bundle and must not be edited.
- Keep AM scaffolding out of commits: do not add `.devin/`, `.claude/`, or `.am-summary` files.

## Open PR Awareness
- PRs #5, #6, and #7 touch `src/main/services/AIDetectionService.js`, `ParserService.js`, `CacheService.js`, `MainService.js`, `SettingsService.js`, `src/main/index.js`, `src/renderer/src/components/ExecutionView.jsx`, and `SettingsModal.jsx`.
- Work on issue #4 may overlap with these paths; implement #4 self-contained from `origin/master` and do not depend on unmerged branches.
