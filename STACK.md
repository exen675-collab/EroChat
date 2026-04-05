# Stack — EroChat v2

## Frontend

**React 19 + Vite**
SPA loaded after login. No SSR — the entire UI is client-side, which simplifies deployment to a single `dist/` folder.

**React Router v7**
Client-side routing. Protected routes require a valid JWT in memory — unauthenticated users are redirected to `/login`.

**Zustand**
Global application state: active character, current session message history, image generation status, logged-in user data.

**TanStack Query**
All API requests — models, settings, credits, gallery. Automatic caching, retry on network errors, and cache invalidation after mutations.

**shadcn/ui + Tailwind CSS**
UI components copied directly into the project (dialogs, dropdowns, toggles, sliders). Full control over the code, zero black boxes.

**TypeScript** — required across the entire frontend.

---

## Backend

**Hono + Node.js 22 LTS**
API server with native SSE support (LLM response streaming), REST, and WebSocket. Zod middleware for request validation.

**Zod**
Validation and typing for all input data — request bodies, environment variables, provider configuration.

**JWT + bcrypt**
Stateless authentication. Access token valid for 15 minutes, refresh token valid for 7 days stored in an httpOnly cookie. Passwords hashed with bcrypt at cost 12.

**TypeScript** — required, with shared types between `apps/web` and `apps/api` via `packages/shared`.

---

## Database

**PostgreSQL 16**
Primary relational database. Stores users, characters, chat history, credits, and generation jobs. JSONB columns for flexible character settings and provider configuration.

**Drizzle ORM**
Typesafe query builder with migrations written in TypeScript. Zero additional processes at startup, full control over the generated SQL.

---

## Cache and Queue

**Redis 7**
Two purposes: storing refresh tokens (with TTL) and acting as the BullMQ queue broker.

**BullMQ**
Job queue for image and video generation. No HTTP request blocks waiting for a result — the job enters the queue, the client receives a `jobId`, and picks up the result via SSE when the worker finishes.

---

## Storage

**MinIO** (local) → **Cloudflare R2** (production)
Both share an identical S3-compatible API. Switching environments is a change to three variables in `.env`. R2 charges no egress fees, which matters for a media gallery.

---

## Infrastructure

**pnpm workspaces**
Monorepo with three packages: `apps/web`, `apps/api`, `packages/shared`. Shared TypeScript types without duplicating code.

**Docker Compose**
Six services: `web`, `api`, `worker`, `postgres`, `redis`, `minio`. One file for local development and self-hosted production.

**Vitest**
Unit and integration tests. Shared configuration with Vite — zero additional setup for TypeScript and ESM.

---

## Project structure

```
erochat/
├── apps/
│   ├── web/                  # React + Vite
│   │   ├── src/
│   │   │   ├── pages/        # Login, Chat, Characters, Gallery, Settings
│   │   │   ├── components/   # UI components
│   │   │   ├── stores/       # Zustand stores
│   │   │   ├── hooks/        # TanStack Query hooks
│   │   │   └── lib/          # API clients, utils
│   │   └── Dockerfile
│   │
│   └── api/                  # Hono + Node.js
│       ├── src/
│       │   ├── routes/       # auth, chat, image, characters, credits
│       │   ├── services/     # ChatService, ImageService, CreditService
│       │   ├── adapters/     # SwarmUIAdapter, 
│       │   ├── middleware/   # JWT auth, rate limit, zod validator
│       │   └── db/           # Drizzle schema + queries
│       └── Dockerfile
│
├── packages/
│   └── shared/               # shared TypeScript types (User, Character, Job...)
│
├── workers/
│   └── image/                # BullMQ worker for image generation
│       └── Dockerfile
│
├── docker-compose.yml
├── .env.example
└── pnpm-workspace.yaml
```

---
