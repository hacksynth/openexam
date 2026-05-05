# OpenExam

OpenExam is a self-hostable AI exam preparation platform for individual learners. The MVP focuses on Ruankao Software Designer while keeping the domain model open for other exam families.

## Status

This repository has a runnable foundation plus early MVP learning-loop slices. The learner and admin apps, shared core package, Prisma/PostgreSQL schema, auth/session layer, exam hierarchy management, single-choice practice, paper attempts, wrong notes, learning analysis, structured 14-day study plans, OpenAI BYOK explanations, AI call logs, material uploads, AI-assisted material question extraction, a persistent worker, and wrong-note review-card image generation are in place.

The app does not yet complete the full MVP loop. OCR and richer file extraction, Claude/Gemini support, subjective grading, problem-solving diagrams, audit hardening, and advanced practice modes remain future work. The product and architecture source of truth remains in `docs/`.

The first product version targets Simplified Chinese (`zh-CN`) UI copy by default.

## Documentation

- `docs/product-requirements.md`: product scope, workflows, and non-goals.
- `docs/architecture-decisions.md`: stack, routing, data model, and governance decisions.
- `docs/mvp-roadmap.md`: delivery order and acceptance criteria.
- `docs/design-system.md`: UI direction and accessibility rules.
- `AGENTS.md`: contributor and agent guidance for this repository.

## Planned Stack

- Next.js App Router and TypeScript.
- Prisma with PostgreSQL.
- Tailwind CSS and shadcn/ui.
- Email/password auth with database-backed sessions.
- Vitest for unit/API tests.
- Playwright for critical browser workflows.

## Development

Install dependencies, then run the local apps in separate terminals:

```sh
npm install
npm run dev:web
npm run dev:admin
```

The learner web app runs on port `3000`. The admin app runs on port `3001`.

Useful commands:

```sh
npm run build
npm run build:web
npm run build:admin
npm run lint
npm test
npm run test:e2e
npm run worker
npm run prisma:validate
npm run prisma:generate
npx prisma migrate dev
```

Copy `.env.example` to `.env` and update `DATABASE_URL`, `SESSION_SECRET`, `NEXT_PUBLIC_WEB_URL`, and `NEXT_PUBLIC_ADMIN_URL` before running migrations or seed data.

Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` before seeding if you want to bootstrap an admin login.

Set `AI_KEY_ENCRYPTION_SECRET` before saving BYOK provider keys. `OPENAI_API_KEY` is optional and acts as the platform fallback when a learner has not saved a personal key. Set `OPENAI_BASE_URL` when using an OpenAI-compatible gateway.

Set `OPENEXAM_DAILY_AI_CALL_LIMIT`, `OPENEXAM_DAILY_PLATFORM_TOKEN_LIMIT`, `OPENEXAM_UPLOAD_MAX_BYTES`, `OPENEXAM_WORKER_POLL_MS`, and `OPENEXAM_JOB_STALE_MS` to control AI usage, upload size, worker polling, and stale running-job recovery. Material uploads and generated review-card images use local storage at `LOCAL_STORAGE_DIR`; `npm run worker` processes queued extraction and image jobs, while admin `/jobs` still provides manual processing, retry, recovery, and job-detail controls.

Playwright starts a local OpenAI-compatible mock server on `127.0.0.1:8317` for AI browser tests, so `npm run test:e2e` exercises the real Responses and Images API adapters without calling an external model.

For local PostgreSQL:

```sh
docker compose up -d postgres
npm run db:migrate
npm run db:seed
```

For split-container deployment:

```sh
docker compose up --build
```

The learner, admin, worker, and PostgreSQL services run as separate containers. Compose health checks call `/api/health` on ports `3000` and `3001`, and the app images copy standalone `.next/static` assets into the runtime output.

### Docker Acceptance Check

Before a release, run the full local container stack:

```sh
docker compose up -d --build
docker compose ps
```

The learner app should be healthy on port `3000`, the admin app should be healthy on port `3001`, PostgreSQL should be reachable on port `5432`, and `docker compose ps worker` should show the worker as `healthy` or `up` after its start period. Check the HTTP health routes directly when needed:

```sh
curl -f http://127.0.0.1:3000/api/health
curl -f http://127.0.0.1:3001/api/health
docker compose logs worker
```

Exercise the release-critical flows in the running stack: learner login, material upload, worker question extraction, wrong-note review-card generation, and admin `/jobs` inspection for failed jobs and retry behavior.

### Production Checklist

The local Compose defaults are intentionally convenient, but production deployments must override secret defaults. Set strong values for `SESSION_SECRET` and `AI_KEY_ENCRYPTION_SECRET`; configure `OPENAI_API_KEY` and `OPENAI_BASE_URL` only for the platform provider or compatible gateway you intend to use. Use a durable `LOCAL_STORAGE_DIR` volume for local storage, or move uploads and generated assets to S3-compatible storage when that driver is completed.

Keep PostgreSQL on persistent storage with backups and restore testing. Tune `OPENEXAM_WORKER_POLL_MS`, `OPENEXAM_JOB_STALE_MS`, `OPENEXAM_WORKER_HEALTH_PATH`, and `OPENEXAM_WORKER_HEALTH_MAX_AGE_MS` for your worker runtime so queued jobs are picked up promptly, stale running jobs are recovered, and health checks do not mask a stalled worker.

GitHub Actions runs `npm ci`, Prisma generation and validation, TypeScript linting, Vitest, both app builds, migration deploy, and Playwright browser workflows on pushes to `main` and pull requests targeting `main`.

## Project Layout

- `apps/web/`: learner-facing Next.js application.
- `apps/admin/`: admin Next.js application.
- `packages/core/`: shared domain helpers, validation schemas, route metadata, environment parsing, and Prisma client setup.
- `prisma/`: database schema and seed script.
- `tests/`: Vitest unit tests.
- `docs/`: product, architecture, roadmap, and design-system decisions.

## License

OpenExam application code is licensed under AGPL-3.0-only. Question data, uploaded materials, and user content have separate licensing and visibility rules.
