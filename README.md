# OpenExam

<p align="center">
  <img src="docs/assets/openexam-banner.png" alt="OpenExam self-hosted AI exam preparation platform" />
</p>

<p align="center">
  <a href="README.zh-CN.md">简体中文</a> · <strong>English</strong>
</p>

[![CI](https://github.com/hacksynth/openexam/actions/workflows/ci.yml/badge.svg)](https://github.com/hacksynth/openexam/actions/workflows/ci.yml)
[![Docker](https://github.com/hacksynth/openexam/actions/workflows/docker.yml/badge.svg)](https://github.com/hacksynth/openexam/actions/workflows/docker.yml)
[![CodeQL](https://github.com/hacksynth/openexam/actions/workflows/codeql.yml/badge.svg)](https://github.com/hacksynth/openexam/actions/workflows/codeql.yml)
[![License: AGPL-3.0-only](https://img.shields.io/badge/license-AGPL--3.0--only-111111.svg)](LICENSE)
[![Node.js 24](https://img.shields.io/badge/node-24-339933.svg)](package.json)
[![Next.js 16](https://img.shields.io/badge/next.js-16-000000.svg)](package.json)

OpenExam is a self-hostable AI exam preparation platform for individual learners. The MVP focuses on Ruankao Software Designer while keeping the domain model open for other exam families.

## Status

OpenExam is prepared as a `v0.1.0` release candidate. The learner and admin apps, shared core package, Prisma/PostgreSQL schema, auth/session layer, exam hierarchy management, multi-kind objective practice, paper attempts with autosave/pause/resume, wrong notes, learning analysis, rolling study plans, OpenAI/Claude/Gemini BYOK settings, AI call logs, material uploads, AI-assisted material question extraction, a persistent worker, and wrong-note review-card image generation are in place.

The release-critical learning loop is covered by automated unit/API tests plus Playwright browser workflows. OCR beyond provider document/image fallback, richer file extraction, deeper subjective grading workflows, problem-solving diagrams, audit hardening, and advanced practice modes remain future work. The product and architecture source of truth remains in `docs/`.

The first product version targets Simplified Chinese (`zh-CN`) UI copy by default.

## v0.1.0 Highlights

- Split learner/admin Next.js apps with authenticated private routes and independent health APIs.
- PostgreSQL schema, Prisma migrations, seed data, and Docker Compose services for web, admin, worker, and database.
- Goal-scoped practice, public paper attempts, answer autosave, reports, wrong-note ingestion, retry, and weak-point summaries.
- BYOK AI settings, provider call logs, admin model presets, material extraction jobs, context chat, learning diagnosis, and rolling study plans.
- Private local asset serving for generated wrong-note review cards.
- CI for Prisma validation, TypeScript checks, Vitest, app builds, migration deploy, Playwright browser workflows, Docker image builds, and CodeQL analysis.

## Product Screenshots

| Learner dashboard | Admin dashboard |
| --- | --- |
| ![Learner dashboard screenshot](docs/assets/screenshots/learner-dashboard.png) | ![Admin dashboard screenshot](docs/assets/screenshots/admin-dashboard.png) |

## Documentation

- `docs/product-requirements.md`: product scope, workflows, and non-goals.
- `docs/architecture-decisions.md`: stack, routing, data model, and governance decisions.
- `docs/mvp-roadmap.md`: delivery order and acceptance criteria.
- `docs/design-system.md`: UI direction and accessibility rules.
- `docs/release-v0.1.0.md`: release scope, acceptance gates, and known follow-up work.
- `CHANGELOG.md`: user-facing release history.
- `SUPPORT.md`: support, bug-report, feature-request, and private security-report routing.
- `AGENTS.md`: contributor and agent guidance for this repository.

## Stack

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
npm run prisma:generate
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

Recommended pre-release gate:

```sh
npm run prisma:validate
npm run lint
npm test
npm run build
npm run test:e2e
```

Copy `.env.example` to `.env` and update `DATABASE_URL`, `SESSION_SECRET`, `NEXT_PUBLIC_WEB_URL`, and `NEXT_PUBLIC_ADMIN_URL` before running migrations or seed data.

Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` to bootstrap or update an admin login. The Docker admin service runs this bootstrap automatically after migrations; local development can run `npm run db:bootstrap-admin` or `npm run db:seed`.

Set `AI_KEY_ENCRYPTION_SECRET` before saving BYOK provider keys. `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and `GEMINI_API_KEY` are optional platform fallbacks when a learner has not saved a personal key. Set provider base URL env vars when using compatible gateways.

Set `OPENEXAM_DAILY_AI_CALL_LIMIT`, `OPENEXAM_DAILY_PLATFORM_TOKEN_LIMIT`, `OPENEXAM_UPLOAD_MAX_BYTES`, `OPENEXAM_MATERIAL_EXTRACT_CONTEXT_CHARS`, `OPENEXAM_MATERIAL_EXTRACT_TIMEOUT_MS`, `OPENEXAM_MATERIAL_EXTRACT_JOB_STALE_MS`, `OPENEXAM_WORKER_POLL_MS`, and `OPENEXAM_JOB_STALE_MS` to control AI usage, upload size, material extraction context, material extraction request/stale timeouts, worker polling, and stale running-job recovery. Material uploads and generated review-card images use `STORAGE_DRIVER=local` at `LOCAL_STORAGE_DIR` by default, or `STORAGE_DRIVER=s3` with an S3-compatible endpoint such as self-hosted MinIO; `npm run worker` processes queued extraction and image jobs, while admin `/jobs` still provides manual processing, retry, recovery, and job-detail controls.

Playwright starts a local OpenAI-compatible mock server on `127.0.0.1:8317` for AI browser tests, so `npm run test:e2e` exercises the real Responses and Images API adapters without calling an external model.

For local PostgreSQL:

```sh
docker compose up -d postgres
npm run db:migrate
set -a; . ./.env; set +a; npm run db:seed
```

For split-container deployment:

```sh
docker compose build seed
docker compose run --rm seed
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

The local Compose defaults are intentionally convenient, but production deployments must override secret defaults. Set strong values for `SESSION_SECRET` and `AI_KEY_ENCRYPTION_SECRET`; configure `OPENAI_API_KEY` and `OPENAI_BASE_URL` only for the platform provider or compatible gateway you intend to use. Use a durable `LOCAL_STORAGE_DIR` volume for local storage, or configure `STORAGE_DRIVER=s3` with S3-compatible storage for uploads and generated assets.

Keep PostgreSQL on persistent storage with backups and restore testing. Tune `OPENEXAM_WORKER_POLL_MS`, `OPENEXAM_JOB_STALE_MS`, `OPENEXAM_WORKER_HEALTH_PATH`, and `OPENEXAM_WORKER_HEALTH_MAX_AGE_MS` for your worker runtime so queued jobs are picked up promptly, stale running jobs are recovered, and health checks do not mask a stalled worker.

GitHub Actions runs `npm ci`, Prisma generation and validation, TypeScript linting, Vitest, both app builds, migration deploy, Playwright browser workflows, Docker image builds, and CodeQL analysis on pushes to `main` and pull requests targeting `main`. Dependabot checks npm, GitHub Actions, and Docker base image updates weekly.

## Repository Maintenance

- `.github/ISSUE_TEMPLATE/`: structured bug and feature intake.
- `.github/PULL_REQUEST_TEMPLATE.md`: required summary, test, release, and security checks.
- `.github/CODEOWNERS`: default review ownership.
- `.github/dependabot.yml`: weekly dependency update pull requests.
- `.github/workflows/`: CI, Docker image build, and CodeQL code scanning workflows.
- `.editorconfig` and `.gitattributes`: consistent text encoding, line endings, and binary handling.
- `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `SECURITY.md`, and `SUPPORT.md`: community and maintainer operating policies.

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=hacksynth/openexam&type=Date)](https://www.star-history.com/#hacksynth/openexam&Date)

## Contributing

OpenExam welcomes focused issues and pull requests that strengthen the self-hosted learning loop. Good first contributions include tests, provider adapters, import validation, accessibility fixes, documentation, and small admin hardening improvements. Read `CONTRIBUTING.md` before opening a pull request.

## Project Layout

- `apps/web/`: learner-facing Next.js application.
- `apps/admin/`: admin Next.js application.
- `packages/core/`: shared domain helpers, validation schemas, route metadata, environment parsing, and Prisma client setup.
- `prisma/`: database schema and seed script.
- `tests/`: Vitest unit tests.
- `docs/`: product, architecture, roadmap, and design-system decisions.

## License

OpenExam application code is licensed under AGPL-3.0-only. Question data, uploaded materials, and user content have separate licensing and visibility rules.
