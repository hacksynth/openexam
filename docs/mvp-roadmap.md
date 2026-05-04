# OpenExam MVP Roadmap

Last updated: 2026-05-05

The MVP roadmap follows this sequence:

```text
Foundation -> Exam Core -> Practice Loop -> AI Core -> Materials
-> Plan & Analysis -> Exam Simulation -> Image & Jobs -> Admin Hardening
```

Current progress:

- Split foundation scaffold is complete enough to run, build, and test the web and admin apps independently.
- Email/password auth, database-backed sessions, route protection, live PostgreSQL migration validation, and Docker image builds are complete for the foundation slice.
- Exam core schema exists in Prisma, and the first admin CRUD slice now manages exam hierarchy and knowledge trees.
- Learners can save a primary exam goal and see that goal on the dashboard.
- The first Practice Loop slice is implemented for goal-scoped single-choice practice, improved question rotation, objective grading, paper attempts, attempt reports, answer-card submission, wrong-note filters/retry, and dashboard weak-node summaries.
- Admins can create and govern single-choice questions, filter and archive questions, and create/filter/hide ordered public papers.
- The visible foundation UI uses Simplified Chinese (`zh-CN`) copy.

## 1. Foundation

Goal: create the base application that all later work depends on.

Status: mostly complete.

Deliverables:

- Next.js App Router projects for learner and admin. Completed.
- TypeScript strict configuration. Completed.
- Tailwind CSS base styling. Completed.
- shadcn/ui base components. Pending.
- Prisma with PostgreSQL schema and local compose configuration. Completed.
- Auth and session layer. Completed for email/password and database sessions.
- `user` and `admin` roles in schema. Completed.
- Base layout for learner and admin routes in separate apps. Completed.
- Local asset storage adapter. Pending.
- Basic environment configuration. Completed.
- Test setup with Vitest and Playwright. Completed for the current core and browser workflow slice.

Acceptance:

- A user can register, sign in, and reach `/dashboard`. Completed.
- An admin can reach the admin app root `/` on the admin service. Completed with seeded admin credentials.
- PostgreSQL migrations run cleanly. Completed against local Docker PostgreSQL.
- Private routes reject anonymous users. Completed for learner and admin routes.
- Docker images for `web` and `admin` build successfully. Completed with app health checks in Compose.

## 2. Exam Core

Goal: establish generalized multi-exam data structures before building workflows.

Status: minimal data workflow started.

Deliverables:

- `ExamProgram`. Schema completed.
- `ExamTrack`. Schema completed.
- `ExamCycle`. Schema completed.
- `Subject`. Schema completed.
- `Syllabus`. Schema completed.
- `KnowledgeNode`. Schema completed.
- `Question`. Schema completed.
- `QuestionVersion`. Schema completed.
- `QuestionKnowledgeNode`. Schema completed.
- `Paper`. Schema completed with explicit `archivedAt` archive metadata.
- `PaperQuestion`. Schema completed.
- Source, visibility, and review fields. Schema and rule helper started.
- Minimal admin CRUD for exams and knowledge trees. Started.
- Minimal admin CRUD for questions and papers. Started for single-choice questions, JSON single-choice imports, and ordered papers.
- Original sample data for Ruankao Software Designer. Started with zh-CN seed data.
- Learner primary exam goal selection. Started.

Acceptance:

- Admin can create the Ruankao Software Designer hierarchy.
- Admin can create syllabus and knowledge nodes.
- Learner can save one primary exam goal and dashboard reads it.
- Admin can create a paper with ordered questions. Started.
- A question can bind to multiple weighted knowledge nodes.
- Public question constraints prevent unknown-source public publishing.

## 3. Practice Loop

Goal: make the core learner loop useful before adding advanced AI.

Status: first single-choice workflow implemented and expanded.

Deliverables:

- User exam goals. Started with primary goal selection.
- Current primary goal selection. Started.
- Random practice. Started with goal-scoped public approved single-choice rotation that avoids immediate repeats.
- Knowledge-node practice. Pending as a direct entry mode; current selector respects goal knowledge scope.
- Paper practice. Started with public single-choice paper listing, answer card, elapsed-time display, unanswered confirmation, full-paper submission, scoring, reports, and wrong-note ingestion.
- Practice session records. Started with one-question practice attempts, paper attempts, a learner history page, and per-attempt reports.
- Objective answer grading. Started for single-choice questions.
- Wrong-note auto-collection. Started for incorrect single-choice submissions, with correct retry marking notes as mastered.
- Manual favorite/collection.
- Wrong-note filters and mastery state. Started with all/unmastered/mastered filters, knowledge-node filters, weak-node summaries, and retry entry.
- Basic statistics by goal, subject, question type, difficulty, and knowledge node. Started with pending wrong-note count and weak knowledge-node ranking.

Acceptance:

- A learner can choose a goal, start practice, answer questions, see grading, and review wrong notes.
- A learner can open a public paper for the current goal, submit objective answers, and review score/knowledge statistics in a report.
- Wrong answers are recorded with question version references.
- Basic analysis shows weak knowledge nodes.

## 4. AI Core

Goal: add safe provider integration and the first high-value AI actions.

Deliverables:

- User BYOK settings for OpenAI, Claude, and Gemini. Started with OpenAI BYOK.
- Optional platform provider settings. Started with `OPENAI_API_KEY` fallback.
- Encrypted API key storage. Started for OpenAI keys with AES-256-GCM.
- Text provider adapters. Started with OpenAI Responses API.
- Model presets and task routing. Started with seeded and admin-managed OpenAI `explain_question` presets.
- AI call logs. Started with learner-visible recent call history, duration/usage display, error summaries, and failed wrong-note retry.
- Usage limits.
- Prompt versioning. Started with `wrong-note-explain-v1`.
- Single-question AI explanation.
- Wrong-note AI explanation. Started as synchronous short task.
- Context-bound AI chat.

Acceptance:

- A BYOK user can generate an AI explanation for a question. Started for wrong notes.
- AI calls record provider, model, task, prompt version, and status. Started.
- Disabled or over-limit AI usage fails clearly.

## 5. Materials

Goal: support user-owned content without building a full knowledge-base product.

Deliverables:

- Material upload.
- Material binding to exam goal, subject, or syllabus.
- Text extraction for supported formats.
- OCR pipeline placeholder or first OCR implementation.
- AI question extraction job.
- Candidate-question review UI.
- Manual confirmation into private question bank.
- Material-based AI chat context.

Acceptance:

- A learner can upload a document, extract candidate questions, edit them, confirm them, and practice them privately.
- Unconfirmed extracted questions are not practiceable.
- Extracted questions preserve source material and page/reference metadata.

## 6. Plan & Analysis

Goal: convert learning history into diagnosis and actionable plans.

Deliverables:

- Mastery calculation rules.
- Weak-point ranking.
- Goal-based analysis page.
- AI diagnosis grounded in statistics.
- Structured study-plan schema.
- Plan generation.
- Daily plan and task completion.
- Plan history and abandon/regenerate flow.

Acceptance:

- A learner can generate a 14-day plan from a target date, availability, and learning data.
- Plan tasks are checkable and linked to practice, papers, materials, or knowledge nodes.
- AI diagnosis cites the data it used.

## 7. Exam Simulation

Goal: support quasi-formal mock exams and reports.

Deliverables:

- Attempt creation from paper. Started.
- Timer. Started as non-persistent elapsed-time display.
- Answer sheet. Started as an answer card with answered/unanswered state.
- Autosave.
- Pause/resume records.
- Submission and scoring.
- Subjective answer capture.
- AI-assisted subjective grading.
- User confirmation or manual score adjustment.
- Exam score report. Started for objective single-choice papers.
- Automatic wrong-note ingestion.

Acceptance:

- A learner can complete a mock paper and get a report.
- Objective scores are automatic.
- Subjective scores distinguish AI-suggested and user-confirmed values.

## 8. Image & Jobs

Goal: make long-running work reliable and visible.

Deliverables:

- Database-backed job queue.
- Worker process.
- Job status UI.
- AI image provider adapter.
- Wrong-note review-card generation.
- Problem-solving diagram generation.
- Image asset storage.
- Image limits and error handling.

Acceptance:

- A learner can request a wrong-note review card and see job progress.
- Generated images are private authenticated assets.
- Failed image jobs expose useful error summaries without leaking secrets.

## 9. Admin Hardening

Goal: make self-hosted operation governable.

Deliverables:

- Admin overview metrics.
- Generic JSON/CSV question import adapter. Started with JSON single-choice import.
- Import validation for administrator-provided question data. Started with all-or-nothing JSON validation.
- Source and license management.
- Review and visibility enforcement.
- AI presets and task settings.
- User usage view.
- Upload and AI limits.
- Audit log events for sensitive changes.

Acceptance:

- Admin can import compliant question data without direct database edits.
- Admin can review sources and prevent unknown-source public publication.
- Admin can inspect AI usage, failed jobs, and public question changes.

## Testing Priorities

Minimum test coverage should include:

- Auth and role checks.
- Public question visibility constraints.
- Question version binding on attempts.
- Objective grading.
- Wrong-note creation.
- AI settings encryption and resolution.
- AI structured-output validation.
- Material extraction confirmation gating.
- Study-plan schema validation.
- Admin import validation.
- Admin question filters/archive/review actions.
- Admin paper validation, filters, and hide/restore behavior.
- Browser workflow coverage for auth, goal selection, admin content creation/import, paper submission/report, unanswered confirmation, paper hide/restore, wrong-note retry, and non-admin rejection.

Current tests cover public question visibility constraints, admin single-choice validation, JSON import validation and filters, admin paper validation and archivedAt filters, paper submission scoring, report statistics, objective grading, single-choice practice helpers, wrong-note summarization, study-plan schema validation, and the first Playwright browser workflow. The remaining priorities are still required before MVP exit.

Browser workflow tests should cover:

- Register/login. Started.
- Select goal. Started.
- Practice and wrong-note flow. Started for paper wrong-note retry and mastered-state update after correct retry.
- Admin question and paper creation. Started, including JSON question import.
- Paper report and unanswered confirmation. Started.
- Paper hide/restore. Started.
- Non-admin admin access rejection. Started.
- Configure BYOK and request AI explanation. Started with an OpenAI-compatible mock browser workflow, including failure and retry.
- Upload material and confirm extracted question.
- Generate plan.

## MVP Exit Criteria

The MVP is complete when a clean self-hosted PostgreSQL deployment can run the full learner loop and the admin can govern content sources, AI settings, jobs, and usage without direct database edits.
