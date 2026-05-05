# Contributing

Thanks for helping improve OpenExam. Keep changes aligned with the product and architecture documents before changing implementation details.

## Before You Start

Read these files first:

- `docs/product-requirements.md`
- `docs/architecture-decisions.md`
- `docs/mvp-roadmap.md`
- `docs/design-system.md`
- `AGENTS.md`

## Working Locally

OpenExam is a split Next.js monorepo with a learner app, admin app, shared core package, Prisma schema, worker process, Vitest tests, and Playwright workflows.

Install dependencies and generate Prisma Client:

```sh
npm install
npm run prisma:generate
```

Start local infrastructure and seed sample data:

```sh
docker compose up -d postgres
npm run db:migrate
npm run db:seed
```

Run the apps in separate terminals:

```sh
npm run dev:web
npm run dev:admin
```

Use stable script names in `package.json`:

```sh
npm run dev:web
npm run dev:admin
npm run build
npm run lint
npm test
npm run test:e2e
npm run worker
```

Before opening a pull request, run the smallest relevant checks plus the full gate when the change touches shared behavior:

```sh
npm run prisma:validate
npm run lint
npm test
npm run build
npm run test:e2e
```

## Contribution Standards

- Keep domain names consistent with the architecture: `ExamProgram`, `ExamTrack`, `KnowledgeNode`, `QuestionVersion`, `Attempt`, and related terms.
- Add tests for behavior that affects authentication, attempts, scoring, wrong notes, AI calls, imports, or admin review.
- Update documentation when changing product scope, architecture, data ownership, or UI rules.
- Do not commit secrets, uploaded materials, local databases, or private generated question data.

## Pull Requests

Use short, imperative commit messages such as `docs: add roadmap` or `feat: scaffold auth`. Pull requests should include a summary, linked issue when available, test results, migration notes, and screenshots for UI changes.

Keep pull requests focused. Update `docs/`, `CHANGELOG.md`, `.env.example`, migrations, and tests whenever behavior, configuration, release scope, or data contracts change.
