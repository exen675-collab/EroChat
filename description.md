# EroChat Project Description

This document is an AI-agent-oriented guide to the EroChat codebase. It summarizes the app purpose, runtime architecture, important files, data flow, storage model, APIs, tests, and development conventions.

## High-Level Summary

EroChat is a private browser app for AI roleplay chat with optional automatic image generation. It has:

- A Node.js/Express backend in `server.js`.
- SQLite-backed username/password authentication, sessions, credits, generator jobs, and generator assets.
- A static frontend served from `index.html`, `css/styles.css`, and ES modules in `js/`.
- Login and signup UI in `login.html`.
- Local browser storage for per-user chat state, settings, characters, gallery metadata, generator preferences, and statistics.
- Media persistence under `data/media/`, served only to authenticated users through `/app/media/...`.
- External integrations with OpenRouter for text, SwarmUI and ComfyUI for image generation, and Grok TTS for message playback.

The project is intentionally simple: there is no bundler or frontend framework. The browser loads `index.html`, Tailwind from CDN, `css/styles.css`, and `js/main.js` as an ES module.

## Runtime Entry Points

- `server.js` is the backend entry point and the `npm start` target.
- `login.html` is served at `/`, `/login`, and `/signin`.
- `index.html` is served at `/app` and `/app/` after authentication.
- `index.html` loads `js/main.js`, which initializes the frontend app.
- Static frontend assets are exposed under authenticated paths:
    - `/app/css` -> `css/`
    - `/app/js` -> `js/`
    - `/app/media` -> `data/media/`

## Development Commands

Use these commands from the repository root:

```bash
npm install
npm start
npm run lint
npm run lint:fix
npm run format
npm run format:check
npm run test
npm run test:watch
```

The default server port is `20121`, so the app runs at:

- Login/signup: `http://localhost:20121/`
- App: `http://localhost:20121/app/`

Docker is also supported:

```bash
docker compose up -d --build
```

## Environment Variables

`server.js` reads:

- `PORT`: HTTP port. Defaults to `20121`.
- `SESSION_SECRET`: Express session secret. Defaults to `change-this-secret`; set a real secret in production.
- `COOKIE_SECURE`: set to `true` when behind HTTPS.
- `DEFAULT_USER_CREDITS`: initial credits for newly created users. Defaults to `100`.

The default admin account is created or reset on startup:

- Username: `admin`
- Password: `admin`

Important: `ensureDefaultAdminAccount()` always hashes and writes the default admin password on startup. If this app is exposed beyond local/private use, change this behavior or credentials.

## Full Source File Structure

Generated dependency and runtime directories are summarized, not expanded file-by-file.

```text
EroChat/
|-- .dockerignore
|-- .gitignore
|-- .prettierignore
|-- character-card-import.cjs
|-- description.md
|-- docker-compose.yml
|-- Dockerfile
|-- eslint.config.mjs
|-- index.html
|-- login.html
|-- package-lock.json
|-- package.json
|-- prettier.config.mjs
|-- README.md
|-- server.js
|-- vitest.config.mjs
|-- css/
|   `-- styles.css
|-- data/
|   |-- erochat.sqlite
|   |-- sessions.sqlite
|   `-- media/
|       |-- generated/stored user media files
|       |-- current snapshot observed: 496 .png, 5 .jpg, 1 .mp4
|       `-- filenames are timestamp plus UUID, for example <timestamp>-<uuid>.png
|-- js/
|   |-- admin.js
|   |-- api-comfyui.js
|   |-- api-generator.js
|   |-- api-image.js
|   |-- api-openrouter.js
|   |-- api-swarmui.js
|   |-- character-import.js
|   |-- characters.js
|   |-- chat-request.js
|   |-- config.js
|   |-- dom.js
|   |-- events.js
|   |-- gallery-search.js
|   |-- generator.js
|   |-- main.js
|   |-- media.js
|   |-- messages.js
|   |-- notifications.js
|   |-- prompt-helper.js
|   |-- state.js
|   |-- stats.js
|   |-- storage.js
|   |-- suggestions.js
|   |-- tts.js
|   |-- ui.js
|   `-- utils.js
|-- node_modules/
|   `-- installed npm dependencies, not source
`-- tests/
    |-- character-card-import-server.test.js
    |-- character-import.test.js
    |-- chat-request.test.js
    |-- config.test.js
    |-- gallery-search.test.js
    |-- message-editing.test.js
    |-- notifications.test.js
    |-- stats.test.js
    `-- utils.test.js
```

## Backend Architecture

`server.js` is a CommonJS Express server. It handles:

- App bootstrapping and SQLite initialization.
- Login/signup/logout/session middleware.
- Admin user listing and credit management.
- Media upload, Base64 media storage, remote media import, and authenticated media serving.
- Character Card V2 import via `character-card-import.cjs`.
- Generator job and asset CRUD endpoints for the frontend generator workspace.
- Static serving for the app shell and frontend modules.

Important backend constants:

- JSON request limit: `25mb`.
- Inline Base64 media limit: `10mb`.
- Uploaded media limit: `80mb`.
- Remote imported media limit: `80mb`.
- Login rate limit: 20 attempts per 15 minutes per client IP.
- Allowed generator mode: `image_generate`.
- Allowed generator providers: `swarm`, `comfy`.
- Allowed generator statuses: `queued`, `running`, `polling`, `succeeded`, `failed`, `interrupted`.

### Backend Routes

Public/auth routes:

- `GET /`: login page.
- `GET /login`, `GET /signin`: login page.
- `POST /api/auth/signup`: create account.
- `POST /api/auth/login`: log in.
- `POST /api/auth/logout`: destroy session.
- `GET /api/auth/me`: return current user if logged in.

Authenticated app/media routes:

- `GET /app`, `GET /app/`: main app.
- `GET /api/credits/me`: current user credits and cost map.
- `POST /api/media/store`: persist a Base64 data URL.
- `POST /api/media/upload`: upload one media file with `multipart/form-data`.
- `POST /api/media/import-remote`: fetch and store remote HTTP/HTTPS media.
- `POST /api/characters/import-card`: upload and parse `.png` or `.json` SillyTavern Character Card V2 files.
- `GET /app/css/*`, `GET /app/js/*`, `GET /app/media/*`: authenticated static assets.

Admin routes:

- `GET /api/admin/users`: list users, credits, admin flag, created date.
- `PATCH /api/admin/users/:userId/credits`: update a user's credit balance.

Generator routes:

- `GET /api/generator/jobs`: paginated jobs for the current user.
- `POST /api/generator/jobs`: create one or more queued generator jobs.
- `PATCH /api/generator/jobs/:jobId`: update job status, provider request id, request JSON, errors, credits, completion time, and created assets.
- `GET /api/generator/assets`: paginated generated assets for the current user.

### SQLite Schema

The app uses two SQLite files in `data/`:

- `data/erochat.sqlite`: app data.
- `data/sessions.sqlite`: Express session store created by `connect-sqlite3`.

`server.js` creates or migrates these app tables:

```text
users
- id INTEGER PRIMARY KEY AUTOINCREMENT
- username TEXT UNIQUE COLLATE NOCASE
- password_hash TEXT
- credits INTEGER DEFAULT DEFAULT_USER_CREDITS
- is_admin INTEGER DEFAULT 0
- created_at DATETIME DEFAULT CURRENT_TIMESTAMP

generator_jobs
- id INTEGER PRIMARY KEY AUTOINCREMENT
- user_id INTEGER
- batch_id TEXT
- mode TEXT
- provider TEXT
- status TEXT
- prompt TEXT
- negative_prompt TEXT
- source_asset_ids TEXT JSON array
- provider_model TEXT
- provider_request_id TEXT
- request_json TEXT JSON object
- result_asset_ids TEXT JSON array
- error_message TEXT
- credits_charged INTEGER
- created_at DATETIME
- updated_at DATETIME
- completed_at DATETIME

generator_assets
- id INTEGER PRIMARY KEY AUTOINCREMENT
- job_id INTEGER
- user_id INTEGER
- media_type TEXT, image or video
- url TEXT, must be stored under /app/media/
- thumbnail_url TEXT
- width INTEGER
- height INTEGER
- duration_seconds INTEGER
- source TEXT
- metadata_json TEXT JSON object
- created_at DATETIME
```

Indexes:

- `idx_generator_jobs_user_created`
- `idx_generator_jobs_user_status_updated`
- `idx_generator_assets_user_created`
- `idx_generator_assets_job`

## Frontend Architecture

The frontend is a static browser app using ES modules, shared mutable state, DOM references, and localStorage.

The root module is `js/main.js`. Startup flow:

1. Install toast-based alert/confirm overrides.
2. Register DOM event listeners.
3. Fetch `/api/auth/me`; redirect to `/` if unauthenticated.
4. Update user/credit UI and admin visibility.
5. Load per-user browser state from localStorage.
6. Initialize generator history and resume pending jobs.
7. Sync the visible view from the URL hash.
8. Auto-fetch provider models when credentials/URLs are configured.

Views in `index.html`:

- `chatView`: main chat workspace.
- `generatorView`: standalone image generator workspace.
- `galleryView`: merged chat/generated media gallery.
- `statsView`: usage and activity dashboard.

Primary modals/overlays:

- Settings/sidebar panel.
- Advanced settings panel.
- Request preview modal.
- Assistant message edit modal.
- Character edit/import modal.
- Gallery lightbox.

### Frontend State Shape

`js/state.js` exports a single shared `state` object:

```text
currentUser
adminUsers
creditCosts
currentView
messages
galleryImages
gallerySearchQuery
gallerySortOrder
gallerySourceFilter
galleryFilterCharacterId
generatorJobs
generatorAssets
generatorActiveBatchId
generatorPrefs
sessionId
isGenerating
currentCharacterId
characters
settings
statistics
```

`state.messages` is the active character conversation. Character-specific histories live in `state.characters[*].messages`.

### Frontend Persistence

`js/storage.js` persists data to browser localStorage. Storage keys:

- Legacy key: `erochat_data`.
- Per-user key: `erochat_data_user_<userId>`.
- Legacy migration marker: `erochat_data_legacy_migrated`.

Persisted fields:

- `settings`
- `characters`
- `currentCharacterId`
- `galleryImages`
- `gallerySearchQuery`
- `gallerySortOrder`
- `galleryFilterCharacterId`
- `gallerySourceFilter`
- `currentView`
- `generatorPrefs`
- `statistics`

Top-level messages are no longer persisted directly; messages are synced into the selected character before saving. The loader includes migration behavior for older saved top-level messages and older gallery data embedded in assistant messages.

When localStorage quota is exceeded, `storage.js` prunes old gallery entries, inline data URLs, message media, and thumbnails before retrying.

## JavaScript Module Responsibilities

- `js/admin.js`: admin panel visibility, user list fetching/rendering, and user credit edits.
- `js/api-comfyui.js`: ComfyUI model loading, workflow creation, prompt queueing, history polling, and image URL extraction.
- `js/api-generator.js`: bridge between local generator jobs/assets endpoints and provider execution. Creates jobs, updates jobs, persists generated media, and dispatches to SwarmUI or ComfyUI.
- `js/api-image.js`: provider-agnostic image generation wrapper used by chat and thumbnail flows.
- `js/api-openrouter.js`: OpenRouter model fetching/search UI, chat completion calls, and system prompt generation for characters.
- `js/api-swarmui.js`: SwarmUI model loading, session handling, payload construction, and image generation.
- `js/character-import.js`: client-side normalization of imported SillyTavern Character Card V2 payloads into EroChat character objects.
- `js/characters.js`: character list rendering, selection, create/edit/delete modal logic, thumbnail generation, and system prompt helper integration.
- `js/chat-request.js`: pure helpers for building chat API messages and request preview data.
- `js/config.js`: default character, app settings, and generator preferences.
- `js/dom.js`: central map of DOM elements by id/query selector.
- `js/events.js`: central DOM event wiring for settings, navigation, chat controls, gallery filters, generator controls, character import, admin panel, and modals.
- `js/gallery-search.js`: pure search parser/scorer for gallery free text and field filters.
- `js/generator.js`: standalone generator workspace UI, queue building, prompt presets/templates, source image selection, job execution, retries, history loading, and pending job resume.
- `js/main.js`: frontend bootstrap, view hash sync, current-user loading, chat send flow, AI response handling, image prompt extraction, and auto model fetching.
- `js/media.js`: uploads/persists generated, remote, blob, and data URL media to backend storage.
- `js/messages.js`: chat message rendering, assistant image/video rendering, gallery additions, image regeneration, context exclusion, and assistant message editing.
- `js/notifications.js`: toast system, confirmation prompts, and replacement for blocking `alert`.
- `js/prompt-helper.js`: prompt template groups and OpenRouter-powered prompt improve/negative-prompt helper actions.
- `js/state.js`: shared state object and default statistics factory.
- `js/stats.js`: statistics normalization, event tracking, daily activity, usage summaries, and dashboard rendering.
- `js/storage.js`: localStorage save/load, migration, UI syncing, and storage pruning.
- `js/suggestions.js`: AI-generated next-message suggestions.
- `js/tts.js`: Grok TTS voice selection, speech fetch/cache, playback state, and per-message TTS controls.
- `js/ui.js`: sidebar/modal/view/gallery rendering and layout helpers.
- `js/utils.js`: IDs, HTML escaping, message formatting, provider URL normalization, sampler/voice normalization, image prompt stripping, context window helpers.

## Character Card Import

`character-card-import.cjs` is shared server-side parsing logic for imported character cards. It supports:

- `.json` Character Card V2 files.
- `.png` Character Card V2 files with `chara` metadata in `tEXt`, `zTXt`, or `iTXt` chunks.
- Direct JSON or Base64-encoded JSON payloads.

It validates:

- `spec` must be `chara_card_v2`.
- `spec_version` must start with `2` if present.
- `data.name` must exist.

PNG imports keep the PNG as the character thumbnail by storing it through the backend media pipeline.

## Chat Flow

The normal chat flow is:

1. User writes a message in `messageInput`.
2. `main.sendMessage()` validates configured text provider/model and optional image provider/model.
3. `chat-request.js` builds the OpenRouter-compatible request preview from:
    - current character system prompt,
    - recent context messages,
    - pending user draft.
4. User message is added to `state.messages`, rendered, tracked in stats, and saved.
5. `api-openrouter.js` sends the chat completion request.
6. Assistant response is added to state/UI and saved.
7. If image generation is enabled, `main.js` extracts:

```text
---IMAGE_PROMPT START---
...
---IMAGE_PROMPT END---
```

8. `api-image.js` dispatches image generation to SwarmUI or ComfyUI.
9. `media.js` persists returned media through the backend.
10. `messages.js` updates the assistant message image and adds the image to the gallery.

## Generator Workspace Flow

The standalone generator is managed by `js/generator.js` and `js/api-generator.js`.

Typical flow:

1. User configures prompt, provider, batch count, source assets, dimensions, sampler, seed, and presets.
2. `generator.js` builds one or more job requests.
3. `api-generator.createGeneratorJobs()` posts jobs to `/api/generator/jobs`.
4. `generator.js` processes the queue.
5. `api-generator.executeGeneratorJob()` dispatches provider work:
    - `swarm` -> `api-swarmui.generateLocalImages()`
    - `comfy` -> `api-comfyui.generateComfyImages()`
6. Generated media is persisted via `media.js`.
7. Jobs are patched with status/assets through `/api/generator/jobs/:jobId`.
8. Results are rendered in the generator view and included in the gallery.

Generator jobs are server-persisted; frontend generator preferences are localStorage-persisted.

## Media Model

Media can originate from:

- Chat image generation.
- Standalone generator.
- Uploaded local files.
- Remote HTTP/HTTPS imports.
- Character card PNG thumbnails.

Allowed stored MIME types:

- `image/png`
- `image/jpeg` / `image/jpg`
- `image/webp`
- `image/gif`
- `video/mp4`
- `video/webm`
- `video/quicktime`

Stored URLs always look like:

```text
/app/media/<timestamp>-<uuid>.<ext>
```

Remote imports block localhost, private IP ranges, link-local hosts, `.local`, and non-HTTP(S) protocols.

## Styling and UI

- `index.html` and `login.html` use Tailwind via CDN.
- `css/styles.css` contains the custom app styling for layout, chat bubbles, settings panels, generator workspace, gallery, stats dashboard, responsive behavior, and animations.
- There is no CSS build step.
- DOM ids in `index.html` are tightly coupled to `js/dom.js`; when adding/changing UI elements, update `dom.js` and event wiring in `events.js`.

## Tests

Vitest runs in `jsdom` with tests under `tests/**/*.test.js`.

Current tests cover:

- Server-side Character Card V2 parsing and PNG metadata extraction.
- Client-side imported character normalization.
- Chat request preview/message construction.
- Default config stability.
- Gallery search parsing/filtering/sorting.
- Assistant message editing and context removal.
- Toasts, confirmations, and alert override behavior.
- Statistics tracking and rendering.
- Utility helpers for URLs, providers, samplers, TTS voices, formatting, escaping, and context windows.

Run all tests with:

```bash
npm run test
```

## Linting and Formatting

- ESLint config: `eslint.config.mjs`.
- Prettier config: `prettier.config.mjs`.
- Formatting uses 4 spaces, single quotes, no trailing commas, and print width 100.
- ESLint ignores `coverage/**`, `data/**`, and `node_modules/**`.
- Server code is CommonJS.
- Frontend/test/config files are ES modules.

## Deployment Files

- `Dockerfile`: Node 20 Alpine image, installs production dependencies, copies the repo, exposes port `20121`, and runs `npm start`.
- `docker-compose.yml`: builds the app, maps `20121:20121`, sets default env vars, persists `./data:/app/data`, and restarts unless stopped.
- `.dockerignore`: excludes files from Docker build context.
- `.gitignore`: should keep generated/dependency artifacts out of version control.
- `.prettierignore`: Prettier ignore list.

## Important Coding Notes for Future Agents

- This is not a React/Vite app. Do not introduce a build system unless the user explicitly asks.
- Keep backend work in `server.js` unless there is a strong reason to split modules.
- Keep frontend work aligned with the current module boundaries listed above.
- If you add an element in `index.html`, add it to `js/dom.js` if any JS needs it.
- If you add persistent settings/state, update:
    - `js/config.js` defaults,
    - `js/state.js` state shape if needed,
    - `js/storage.js` save/load/migration,
    - `js/events.js` event wiring,
    - `js/ui.js` or relevant renderer,
    - tests when the behavior is non-trivial.
- If you add backend-persisted entities, update `initDb()` in `server.js`, route handlers, and tests or docs.
- Avoid storing large Base64 media in localStorage. Use `media.js` and backend media endpoints to store files under `data/media/`.
- `data/` is runtime state, not application source. Be careful before editing or deleting database/media files.
- Authenticated media URLs are not public; they depend on the user's session.
- The frontend calls OpenRouter directly from the browser using the user's API key stored in localStorage.
- SwarmUI and ComfyUI are expected to run separately and be reachable from the browser.
- Many UI strings and the default character prompt contain adult roleplay context. Preserve intended app behavior unless the user asks to change it.
- The default character prompt in `js/config.js` appears mojibake when printed in some terminals, likely due to encoding/display mismatch. Check in an editor before doing broad text edits.

## Common Change Patterns

Adding a new setting:

1. Add default value in `js/config.js`.
2. Add matching input/control in `index.html`.
3. Add DOM reference in `js/dom.js`.
4. Load/save/sync it in `js/storage.js`.
5. Wire events in `js/events.js`.
6. Use it in the relevant feature module.
7. Update tests if default or helper behavior changes.

Adding a new provider:

1. Add provider defaults and normalization in `js/config.js` and `js/utils.js`.
2. Add settings UI in `index.html`.
3. Add DOM references in `js/dom.js`.
4. Add API module or extend existing API wrapper.
5. Dispatch from `js/api-image.js` and/or `js/api-generator.js`.
6. Persist provider settings through `js/storage.js`.
7. Add model fetching and event wiring through `events.js` and startup behavior if needed.

Adding generator fields:

1. Add UI controls in the generator section of `index.html`.
2. Add references in `js/dom.js`.
3. Extend `defaultGeneratorPrefs` in `js/config.js`.
4. Update `generator.js` read/apply/render logic.
5. Include the value in job `requestJson` if it affects provider execution.
6. Update provider payload construction in `api-swarmui.js` or `api-comfyui.js`.

Adding backend media behavior:

1. Reuse `storeMediaBuffer()` where possible.
2. Keep MIME normalization and size checks.
3. Only return `/app/media/...` URLs for stored media.
4. Keep `requireApiAuth` on write/import endpoints.
5. Avoid allowing local/private remote URLs in import flows.

## Known Sharp Edges

- The default admin password reset on every server start is convenient locally but unsafe for production.
- Browser localStorage is still important even though media files and generator records are server-persisted.
- The backend `credits` support exists, but most generation cost enforcement is currently minimal: `/api/credits/me` returns an empty `costs` object and generator job creation does not appear to reserve credits.
- The app depends on external services being CORS-compatible from the browser, especially local SwarmUI/ComfyUI and OpenRouter.
- The frontend uses global `window.*` handlers for some inline/on-click style interactions; check `main.js` before removing or renaming exported functions used by markup.
- `index.html` is large and id-heavy. Small DOM id changes can break module references.
