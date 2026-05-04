# Repository Guidelines

## Project Structure & Module Organization

This repository contains a split Next.js foundation scaffold plus planning documentation. Keep source-of-truth product and architecture notes in `docs/`, including `product-requirements.md`, `architecture-decisions.md`, `mvp-roadmap.md`, and `design-system.md`.

Top-level paths are `apps/web/` for the learner app, `apps/admin/` for the admin app, `packages/core/` for shared domain helpers and schemas, `prisma/` for schema and seed data, `tests/` for Vitest coverage, and `docs/` for product and architecture decisions. Add `e2e/` when Playwright workflows are introduced.

## Build, Test, and Development Commands

- `npm run dev:web`: start the learner app on port `3000`.
- `npm run dev:admin`: start the admin app on port `3001`.
- `npm run build`: build both apps.
- `npm run build:web`: build only the learner app.
- `npm run build:admin`: build only the admin app.
- `npm run lint`: run TypeScript checks.
- `npm test`: run Vitest unit tests.
- `npm run test:e2e`: run Playwright browser workflow tests once e2e specs exist.
- `npm run prisma:validate`: validate the Prisma schema with a fallback local Postgres URL.
- `npm run prisma:generate`: generate Prisma Client.
- `npm run db:migrate`: apply local PostgreSQL migrations.

## Coding Style & Naming Conventions

Use TypeScript with strict settings. Prefer explicit domain names from the architecture docs, such as `ExamProgram`, `KnowledgeNode`, `QuestionVersion`, and `AttemptAnswer`. Use PascalCase for React components and types, camelCase for variables/functions, and kebab-case for route segments. UI work must follow `docs/design-system.md`: square controls, hard outlines, accessible contrast, and theme changes through tokens only.

## Testing Guidelines

Use Vitest for unit and API tests and Playwright for critical browser workflows. Cover authentication, private-route protection, exam-goal selection, practice submission, wrong-note ingestion, AI task failures, and admin review flows. Name tests by behavior, for example `practice-session.test.ts` or `wrong-notes.spec.ts`.

## Commit & Pull Request Guidelines

Use short, imperative Conventional Commit-style messages such as `docs: add architecture decisions` or `feat: scaffold exam core models`. Pull requests should include a concise summary, linked issue when available, test results, migration notes, and screenshots for UI changes.

## Security & Configuration Tips

Do not commit `.env*` files, API keys, uploaded materials, generated private questions, or local database dumps. BYOK provider keys must be encrypted at rest. Treat question data, uploads, and user content as separately licensed from the AGPL-3.0 application code unless the license decision changes before release.
