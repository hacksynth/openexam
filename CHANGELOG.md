# Changelog

All notable changes to OpenExam are documented here.

## 0.1.0 - 2026-05-05

### Added

- Split learner and admin Next.js apps with authenticated route protection and health APIs.
- Prisma/PostgreSQL schema, migrations, seed data, and Docker Compose services for web, admin, worker, and database.
- Exam hierarchy, goal selection, goal-scoped practice, public paper attempts, autosave/pause/resume, grading, reports, wrong notes, retries, and dashboard summaries.
- Admin question, paper, material, job, AI preset, audit, and user-management surfaces.
- OpenAI/Claude/Gemini BYOK settings, encrypted key storage, usage limits, AI call logs, material extraction, context chat, learning diagnosis, generated practice questions, and structured 14-day study plans.
- Worker-backed material extraction and wrong-note review-card image generation with authenticated private asset serving.
- Vitest coverage, Playwright browser workflow coverage, and GitHub Actions CI.

### Known Gaps

- Standalone OCR, richer document parsing, problem-solving diagram generation, advanced practice modes, deeper subjective grading review, source/license management, and broader audit hardening remain post-0.1 work.
