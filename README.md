# OpenExam

OpenExam is a self-hostable AI exam preparation platform for individual learners. The MVP focuses on Ruankao Software Designer while keeping the domain model open for other exam families.

## Status

This repository is in the planning and foundation stage. The current source of truth is in `docs/`; application code has not been scaffolded yet.

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

No runnable application exists yet. Once the app is scaffolded, expected commands are:

```sh
npm run dev
npm run build
npm run lint
npm test
npm run test:e2e
npx prisma migrate dev
```

## License

OpenExam application code is licensed under AGPL-3.0-only. Question data, uploaded materials, and user content have separate licensing and visibility rules.
