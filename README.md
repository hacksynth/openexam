# OpenExam

OpenExam is a self-hostable AI exam preparation platform for individual learners. The MVP focuses on Ruankao Software Designer while keeping the domain model open for other exam families.

## Status

This repository is in the foundation stage. The web app, admin app, shared core package, Prisma domain schema, and initial rule tests are in place. The product and architecture source of truth remains in `docs/`.

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
- Auth.js or an equivalent session system.
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
npm run prisma:validate
npm run prisma:generate
npx prisma migrate dev
```

Copy `.env.example` to `.env` and update `DATABASE_URL` before running migrations or seed data.

For local PostgreSQL:

```sh
docker compose up -d postgres
npm run db:migrate
npm run db:seed
```

For split-container deployment:

```sh
docker compose up --build web admin postgres
```

## Project Layout

- `apps/web/`: learner-facing Next.js application.
- `apps/admin/`: admin Next.js application.
- `packages/core/`: shared domain helpers, validation schemas, route metadata, environment parsing, and Prisma client setup.
- `prisma/`: database schema and seed script.
- `tests/`: Vitest unit tests.
- `docs/`: product, architecture, roadmap, and design-system decisions.

## License

OpenExam application code is licensed under AGPL-3.0-only. Question data, uploaded materials, and user content have separate licensing and visibility rules.
