# OpenExam MVP Roadmap

Last updated: 2026-05-06

The MVP roadmap follows this sequence:

```text
Foundation -> Exam Core -> Practice Loop -> AI Core -> Materials
-> Plan & Analysis -> Exam Simulation -> Image & Jobs -> Admin Hardening
```

Current progress:

- Single-app foundation scaffold is complete enough to run, build, and test learner workflows and `/admin` role routes together.
- Email/password auth, database-backed sessions, route protection, live PostgreSQL migration validation, and Docker image builds are complete for the foundation slice.
- Exam core schema exists in Prisma, and the first admin CRUD slice now manages exam hierarchy and knowledge trees.
- Learners can save a primary exam goal and see that goal on the dashboard.
- The first Practice Loop slice is implemented for goal-scoped multi-kind objective practice, subjective answer capture, improved question rotation, paper attempts, attempt reports, answer-card submission, wrong-note filters/retry, and database-backed dashboard summaries.
- Admins can create and govern single-choice questions, filter and archive questions, and create/filter/hide ordered public papers.
- Learning analysis, structured rolling plans, worker-backed jobs, private generated assets, and wrong-note review-card images are started.
- The visible foundation UI uses Simplified Chinese (`zh-CN`) copy.

## 1. Foundation

Goal: create the base application that all later work depends on.

Status: mostly complete.

Deliverables:

- Next.js App Router project for learner routes and `/admin` role routes. Completed.
- TypeScript strict configuration. Completed.
- Tailwind CSS base styling. Completed.
- shadcn/ui base components. Started with local Button, Input, Textarea, Select, Card, Tabs, and Dialog primitives styled through the existing pixel tokens.
- Prisma with PostgreSQL schema and local compose configuration. Completed.
- Auth and session layer. Completed for email/password and database sessions.
- `user` and `admin` roles in schema. Completed.
- Base layout for learner and admin routes in one app. Completed.
- Local asset storage adapter. Started for material uploads and private review-card images.
- Basic environment configuration. Completed.
- Test setup with Vitest and Playwright. Completed for the current core and browser workflow slice.

Acceptance:

- A user can register, sign in, and reach `/dashboard`. Completed.
- An admin can reach `/admin`. Completed with seeded admin credentials.
- PostgreSQL migrations run cleanly. Completed against local Docker PostgreSQL.
- Private routes reject anonymous users. Completed for learner and admin routes.
- The Docker image for `web` builds successfully. Completed with app health checks in Compose and runtime standalone static assets copied into the image output.

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

Status: first multi-kind workflow implemented and expanded.

Deliverables:

- User exam goals. Started with primary goal selection.
- Current primary goal selection. Started.
- Random practice. Started with goal-scoped public approved question rotation that avoids immediate repeats.
- Knowledge-node practice. Pending as a direct entry mode; current selector respects goal knowledge scope.
- Paper practice. Started with public paper listing, answer card, persistent elapsed-time display, autosave, pause/resume, unanswered confirmation, full-paper submission, scoring, reports, and wrong-note ingestion.
- Practice session records. Started with one-question practice attempts, paper attempts, a learner history page, and per-attempt reports.
- Objective answer grading. Started for single-choice, multiple-choice, true-false, and blank questions.
- Wrong-note auto-collection. Started for incorrect objective submissions, with correct retry marking notes as mastered.
- Consolidation collection. Started for correct objective answers the learner explicitly marks as not mastered; these live outside the wrong-note system.
- Wrong-note filters and mastery state. Started with all/unmastered/mastered filters, knowledge-node filters, weak-node summaries, and retry entry.
- Basic statistics by goal, subject, question type, difficulty, and knowledge node. Started with pending wrong-note count, pending consolidation count, and weak knowledge-node ranking.

Acceptance:

- A learner can choose a goal, start practice, answer questions, see grading, and review wrong notes.
- A learner can open a public paper for the current goal, submit objective answers, and review score/knowledge statistics in a report.
- Wrong answers are recorded with question version references.
- Basic analysis shows weak knowledge nodes.

## 4. AI Core

Goal: add safe provider integration and the first high-value AI actions.

Deliverables:

- User BYOK settings for OpenAI, Claude, and Gemini. Started.
- Optional platform provider settings. Started with provider-specific platform fallbacks.
- Encrypted API key storage. Started for provider keys with AES-256-GCM.
- Text provider adapters. Started with OpenAI Responses API.
- Model presets and task routing. Started with seeded and admin-managed OpenAI `explain_question` presets.
- AI call logs. Started with learner-visible recent call history, duration/usage display, error summaries, and failed wrong-note retry.
- Usage limits. Started with daily AI call and platform token caps.
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

- Material upload. Started for TXT, Markdown, JSON, PDF, DOCX, and image storage through the configured storage driver.
- Material binding to exam goal, subject, or syllabus. Started with subject binding.
- Text extraction for supported formats. Started for TXT/Markdown/JSON/DOCX and text-based PDF.
- OCR pipeline placeholder or first OCR implementation. Implemented as AI document/image fallback for scanned PDFs and images; no standalone OCR service yet.
- AI question extraction job. Started with admin-triggered database Jobs.
- Candidate-question review UI. Started in admin materials.
- Manual confirmation into private question bank. Started for single-choice candidates, with learner materials entering personal private practice and admin materials entering platform pending review.
- Material-based AI chat context. Started through `/ai/chat` with material text or AI document/image input.

Acceptance:

- A learner can upload a document, extract candidate questions, edit them, confirm them, and practice them privately.
- Unconfirmed extracted questions are not practiceable.
- Extracted questions preserve source material and page/reference metadata.
- A learner can browse confirmed private questions from a lightweight "My Question Bank" view.

## 6. Plan & Analysis

Goal: convert learning history into diagnosis and actionable plans.

Status: started with database-backed analysis, AI diagnosis, and structured plan generation.

Deliverables:

- Mastery calculation rules. Started from attempts, wrong-note mastery state, and consolidation-note mastery state.
- Weak-point ranking. Started from knowledge-node accuracy, pending wrong notes, and pending consolidation notes.
- Goal-based analysis page. Started.
- AI diagnosis grounded in statistics. Started with persisted `LearningDiagnosis` records on `/analysis`.
- Structured study-plan schema. Started.
- Plan generation. Started with rolling JSON plans based on saved exam date, daily availability, and current learning data.
- Daily plan and task completion. Started.
- Plan history, abandon flow, task skipping, and AI-backed adjustment of the active plan.

Acceptance:

- A learner can generate a rolling plan from a saved target date, availability, and learning data. Started.
- Plan tasks are checkable and linked to practice, papers, materials, or knowledge nodes. Started.
- AI diagnosis cites the data it used.

## 7. Exam Simulation

Goal: support quasi-formal mock exams and reports.

Deliverables:

- Attempt creation from paper. Started.
- Timer. Started as server-derived elapsed-time display.
- Answer sheet. Started as an answer card with answered/unanswered state.
- Autosave. Started.
- Pause/resume records. Started.
- Submission and scoring.
- Subjective answer capture.
- AI-assisted subjective grading.
- User confirmation or manual score adjustment.
- Exam score report. Started for objective and subjective-answer papers.
- Automatic wrong-note ingestion.

Acceptance:

- A learner can complete a mock paper and get a report.
- Objective scores are automatic.
- Subjective scores distinguish AI-suggested and user-confirmed values.

## 8. Image & Jobs

Goal: make long-running work reliable and visible.

Status: started with a persistent worker, material extraction jobs, and wrong-note review-card image jobs.

Deliverables:

- Database-backed job queue. Started for material extraction and wrong-note review cards, with atomic claim and stale running-job recovery.
- Worker process. Started with `npm run worker` and a `docker-compose` worker service.
- Job status UI. Started in admin `/admin/jobs` with payload/result/timestamp details, and learner wrong-note cards.
- AI image provider adapter. Started with OpenAI Images.
- Wrong-note review-card generation. Started.
- Problem-solving diagram generation.
- Image asset storage. Started with private local `Asset` records served through authenticated `/assets/[assetId]`.
- Image limits and error handling. Started with daily AI call limits and failed-job error summaries.

Acceptance:

- A learner can request a wrong-note review card and see job progress. Started.
- Generated images are private authenticated assets. Started.
- Failed image jobs expose useful error summaries without leaking secrets. Started.
- Running jobs that exceed the configured stale threshold can be automatically or manually requeued. Started.

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
- Admin material confirmations enter the question-review flow instead of public practice directly.
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

Current tests cover public question visibility constraints, admin single-choice validation, JSON import validation and filters, admin paper validation and archivedAt filters, paper submission scoring, report statistics, objective grading, multi-kind practice helpers, dashboard aggregation, AI output schemas, wrong-note summarization, study-plan schema validation, wrong-note review-card prompt/job/asset behavior, and the first Playwright browser workflow. The remaining priorities are still required before MVP exit.

Browser workflow tests should cover:

- Register/login. Started.
- Select goal. Started.
- Practice, wrong-note, and consolidation flow. Started for paper wrong-note retry, mastered-state update after correct retry, correct-answer not-mastered marking, and consolidation practice.
- Admin question and paper creation. Started, including JSON question import.
- Paper report and unanswered confirmation. Started.
- Paper hide/restore. Started.
- Non-admin admin access rejection. Started.
- Configure BYOK and request AI explanation. Started with an OpenAI-compatible mock browser workflow, including failure and retry.
- Upload material and confirm extracted question.
- Generate plan. Started.
- Generate wrong-note review-card images. Started, including success, failed job summary, and admin retry.

## MVP Exit Criteria

The MVP is complete when a clean self-hosted PostgreSQL deployment can run the full learner loop and the admin can govern content sources, AI settings, jobs, and usage without direct database edits.
