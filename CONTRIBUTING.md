# Contributing

Thanks for helping improve OpenExam. Keep changes aligned with the product and architecture documents before adding implementation details.

## Before You Start

Read these files first:

- `docs/product-requirements.md`
- `docs/architecture-decisions.md`
- `docs/mvp-roadmap.md`
- `docs/design-system.md`
- `AGENTS.md`

## Working Locally

There is no application scaffold yet. When adding one, preserve the planned stack from `docs/architecture-decisions.md`: Next.js App Router, TypeScript, Prisma, PostgreSQL, Tailwind CSS, shadcn/ui, Vitest, and Playwright.

Use stable script names in `package.json`:

```sh
npm run dev
npm run lint
npm test
npm run test:e2e
```

## Contribution Standards

- Keep domain names consistent with the architecture: `ExamProgram`, `ExamTrack`, `KnowledgeNode`, `QuestionVersion`, `Attempt`, and related terms.
- Add tests for behavior that affects authentication, attempts, scoring, wrong notes, AI calls, imports, or admin review.
- Update documentation when changing product scope, architecture, data ownership, or UI rules.
- Do not commit secrets, uploaded materials, local databases, or private generated question data.

## Pull Requests

Use short, imperative commit messages such as `docs: add roadmap` or `feat: scaffold auth`. Pull requests should include a summary, linked issue when available, test results, migration notes, and screenshots for UI changes.
