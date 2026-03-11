# Web version implementation notes

The `web-version/` directory contains the web port implementation using a static frontend and stateless backend.

## Decisions applied
- Rate limit key: `Origin` hostname with IP fallback.
- JSON import behavior: replace all local state.
- Finalize flow: `/api/v1/finalize` returns updated spreadsheet directly.
- Frontend language: English only, with straightforward path for future i18n.

## Stateless backend contract
- Server does not persist projects, settings, or run artifacts.
- Every processing request provides all needed payload/files.
- CORS is wildcard and there is no authentication layer.

## Client persistence and reduced prompt strategy
- Business state persists in localStorage.
- File/folder handles persist in IndexedDB.
- On app load, saved handles request/verify permissions so users are not repeatedly prompted after full refresh (browser support dependent).
