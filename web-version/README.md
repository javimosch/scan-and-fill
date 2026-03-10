# scan-and-fill web-version

Web port of scan-and-fill with:
- Static frontend (Vue 3 CDN + Tailwind CDN + DaisyUI CDN)
- Stateless Node.js backend (no server persistence)
- Full client-side persistence + JSON export/import

## Structure
- `frontend/`: static app (GitHub Pages compatible)
- `backend/`: API server (OCR/parse/excel processing)

## Backend
```bash
cd web-version/backend
npm install
npm start
```

Environment variables:
- `PORT` (default: `8787`)
- `RATE_LIMIT_WINDOW_MS` (default: `600000`)
- `RATE_LIMIT_MAX` (default: `60`)

Endpoints:
- `GET /health`
- `POST /api/v1/excel/metadata`
- `POST /api/v1/run`
- `POST /api/v1/finalize`

Notes:
- CORS is `*`
- No auth
- Rate-limited by `Origin` hostname with IP fallback

## Frontend
Serve `web-version/frontend` as static files (GitHub Pages or any static host).

For local testing:
```bash
cd web-version/frontend
python3 -m http.server 4173
```

Open `http://localhost:4173` and set backend URL (e.g. `http://localhost:8787`).

### Persistence model
- Local state is stored in `localStorage`
- Folder/spreadsheet permission handles are stored in IndexedDB
- On load, app requests permissions on previously saved handles to reduce repeat prompts

### JSON export/import
- Export current local state as JSON
- Import JSON using **replace all** behavior

## Out of scope in web-version
- AI detection features/endpoints/settings
