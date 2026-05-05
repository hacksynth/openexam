# OpenExam v0.1.0 Release Notes

Release date: 2026-05-05

## Release Goal

`v0.1.0` is the first self-hostable OpenExam release candidate. It should let a maintainer run the split learner/admin stack locally or in Docker, exercise the Ruankao Software Designer learning loop, and accept focused community contributions without relying on private setup knowledge.

## Scope

- Learner app: registration, login, dashboard, goal selection, practice, paper attempts, reports, wrong notes, BYOK AI settings, material uploads, analysis, study plans, and context chat.
- Admin app: login, dashboard metrics, exam hierarchy, knowledge nodes, questions, papers, materials, jobs, AI presets, users, and audit events.
- Worker: database-backed material extraction and wrong-note review-card jobs with stale-job recovery.
- Storage: local private asset storage for uploads and generated images.
- Data: Prisma migrations and seed data for the first Ruankao Software Designer sample track.
- Delivery: Dockerfiles, Docker Compose, CI, Vitest, and Playwright browser workflows.

## Acceptance Gates

Run these before cutting a tag:

```sh
npm run prisma:validate
npm run lint
npm test
npm run build
npm run test:e2e
```

For container acceptance, run:

```sh
docker compose build seed
docker compose run --rm seed
docker compose up -d --build
docker compose ps
curl -f http://127.0.0.1:3000/api/health
curl -f http://127.0.0.1:3001/api/health
```

Then exercise the release-critical flows in a browser:

- Learner registers or logs in and saves an exam goal.
- Learner completes practice or a public paper and receives a report.
- Wrong answers create wrong notes, and retry can mark them mastered.
- Learner saves BYOK settings and generates a wrong-note AI explanation.
- Learner uploads material; admin reviews extraction jobs and confirms a candidate question.
- Learner generates a wrong-note review card and can view the private asset.
- Admin can inspect failed jobs, AI usage, public question review state, and audit activity.

## Known Follow-Up Work

- Standalone OCR and richer PDF/DOCX extraction.
- Advanced knowledge-node entry modes and adaptive practice.
- Deeper subjective grading review and confirmation workflows.
- Problem-solving diagram generation.
- Source/license governance and public question provenance hardening.
- S3-compatible storage driver completion.
- Broader audit coverage and production deployment guides.
