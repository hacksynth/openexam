# OpenExam MVP Roadmap

Last updated: 2026-05-05

The MVP roadmap follows this sequence:

```text
Foundation -> Exam Core -> Practice Loop -> AI Core -> Materials
-> Plan & Analysis -> Exam Simulation -> Image & Jobs -> Admin Hardening
```

Current progress:

- Split foundation scaffold is complete enough to run, build, and test the web and admin apps independently.
- Exam core schema exists in Prisma, but admin CRUD and migrations against a live database are not complete.
- Learner/admin routes exist as shell pages in separate apps; real workflows begin in the next slices.

## 1. Foundation

Goal: create the base application that all later work depends on.

Status: partially complete.

Deliverables:

- Next.js App Router projects for learner and admin. Completed.
- TypeScript strict configuration. Completed.
- Tailwind CSS base styling. Completed.
- shadcn/ui base components. Pending.
- Prisma with PostgreSQL schema and local compose configuration. Completed.
- Auth and session layer. Pending.
- `user` and `admin` roles in schema. Completed.
- Base layout for learner and admin routes in separate apps. Completed.
- Local asset storage adapter. Pending.
- Basic environment configuration. Completed.
- Test setup with Vitest. Completed.

Acceptance:

- A user can register, sign in, and reach `/dashboard`. Pending auth.
- An admin can reach the admin app root `/` on the admin service. Route shell completed; authorization pending.
- PostgreSQL migrations run cleanly. Pending live database validation.
- Private routes reject anonymous users. Pending auth.

## 2. Exam Core

Goal: establish generalized multi-exam data structures before building workflows.

Status: schema started; workflow UI pending.

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
- `Paper`. Schema completed.
- `PaperQuestion`. Schema completed.
- Source, visibility, and review fields. Schema and rule helper started.
- Minimal admin CRUD for exams, knowledge trees, questions, and papers.
- Original sample data for Ruankao Software Designer. Seed script started.

Acceptance:

- Admin can create the Ruankao Software Designer hierarchy.
- Admin can create a paper with ordered questions.
- A question can bind to multiple weighted knowledge nodes.
- Public question constraints prevent unknown-source public publishing.

## 3. Practice Loop

Goal: make the core learner loop useful before adding advanced AI.

Deliverables:

- User exam goals.
- Current primary goal selection.
- Random practice.
- Knowledge-node practice.
- Paper practice.
- Practice session records.
- Objective answer grading.
- Wrong-note auto-collection.
- Manual favorite/collection.
- Wrong-note filters and mastery state.
- Basic statistics by goal, subject, question type, difficulty, and knowledge node.

Acceptance:

- A learner can choose a goal, start practice, answer questions, see grading, and review wrong notes.
- Wrong answers are recorded with question version references.
- Basic analysis shows weak knowledge nodes.

## 4. AI Core

Goal: add safe provider integration and the first high-value AI actions.

Deliverables:

- User BYOK settings for OpenAI, Claude, and Gemini.
- Optional platform provider settings.
- Encrypted API key storage.
- Text provider adapters.
- Model presets and task routing.
- AI call logs.
- Usage limits.
- Prompt versioning.
- Single-question AI explanation.
- Wrong-note AI explanation.
- Context-bound AI chat.

Acceptance:

- A BYOK user can generate an AI explanation for a question.
- AI calls record provider, model, task, prompt version, and status.
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

- Attempt creation from paper.
- Timer.
- Answer sheet.
- Autosave.
- Pause/resume records.
- Submission and scoring.
- Subjective answer capture.
- AI-assisted subjective grading.
- User confirmation or manual score adjustment.
- Exam score report.
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
- Generic JSON/CSV question import adapter.
- Import validation for administrator-provided question data.
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

Current tests cover public question visibility constraints, objective grading, and study-plan schema validation. The remaining priorities are still required before MVP exit.

Browser workflow tests should cover:

- Register/login.
- Select goal.
- Practice and wrong-note flow.
- Configure BYOK and request AI explanation.
- Upload material and confirm extracted question.
- Generate plan.

## MVP Exit Criteria

The MVP is complete when a clean self-hosted PostgreSQL deployment can run the full learner loop and the admin can govern content sources, AI settings, jobs, and usage without direct database edits.
