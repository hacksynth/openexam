# Repository Guidelines

## Project Structure & Module Organization

This repository currently contains planning documentation only. Keep source-of-truth product and architecture notes in `docs/`, including `product-requirements.md`, `architecture-decisions.md`, `mvp-roadmap.md`, and `design-system.md`.

When implementation begins, follow the documented MVP stack: a single Next.js App Router application with learner and admin UI together. Expected top-level paths are `app/` for routes, `components/` for shared UI, `lib/` for server/client utilities, `prisma/` for schema and migrations, `public/` for static assets, `tests/` for unit/API coverage, and `e2e/` or `tests/e2e/` for Playwright workflows.

## Build, Test, and Development Commands

No package manifest exists yet, so there are no runnable project commands today. After scaffolding the app, add scripts to `package.json` and keep these names stable:

- `npm run dev`: start the local Next.js development server.
- `npm run build`: create a production build.
- `npm run lint`: run TypeScript, ESLint, and formatting checks.
- `npm test`: run Vitest unit and API tests.
- `npm run test:e2e`: run Playwright browser workflow tests.
- `npx prisma migrate dev`: apply local PostgreSQL migrations.

## Coding Style & Naming Conventions

Use TypeScript with strict settings. Prefer explicit domain names from the architecture docs, such as `ExamProgram`, `KnowledgeNode`, `QuestionVersion`, and `AttemptAnswer`. Use PascalCase for React components and types, camelCase for variables/functions, and kebab-case for route segments. UI work must follow `docs/design-system.md`: square controls, hard outlines, accessible contrast, and theme changes through tokens only.

## Testing Guidelines

Use Vitest for unit and API tests and Playwright for critical browser workflows. Cover authentication, private-route protection, exam-goal selection, practice submission, wrong-note ingestion, AI task failures, and admin review flows. Name tests by behavior, for example `practice-session.test.ts` or `wrong-notes.spec.ts`.

## Commit & Pull Request Guidelines

This repository has no committed history yet. Use short, imperative Conventional Commit-style messages such as `docs: add architecture decisions` or `feat: scaffold exam core models`. Pull requests should include a concise summary, linked issue when available, test results, migration notes, and screenshots for UI changes.

## Security & Configuration Tips

Do not commit `.env*` files, API keys, uploaded materials, generated private questions, or local database dumps. BYOK provider keys must be encrypted at rest. Treat question data, uploads, and user content as separately licensed from the AGPL-3.0 application code unless the license decision changes before release.
