# OpenExam Product Requirements

Last updated: 2026-05-06

## Product Positioning

OpenExam is a self-hostable AI exam preparation platform for individual learners. It aims to unify exam preparation workflows across exams such as Ruankao, gaokao, postgraduate entrance exams, and legal qualification exams, while the first complete implementation focuses on Ruankao Software Designer.

The product is not a school, training institution, proctoring system, payment platform, or public question-bank community in the MVP.

## Target User

The MVP serves individual exam candidates.

The first product version uses Simplified Chinese (`zh-CN`) as the default UI language. Full i18n remains outside the MVP.

The system is multi-user by design, but roles are limited to:

- `user`: learner-facing workflows.
- `admin`: minimal platform and content management.

The MVP does not include organizations, classes, teachers, students, or tenant-level management.

## MVP Scope

The MVP must complete this learning loop:

1. Register and sign in.
2. Select a current exam goal: Ruankao -> Software Designer -> target cycle.
3. Configure a personal OpenAI, Claude, or Gemini API key.
4. Practice with original sample questions or administrator-imported questions.
5. Complete a focused practice session.
6. View grading, explanations, and wrong notes.
7. Generate an AI explanation for a wrong question.
8. View weak knowledge points.
9. Generate a structured rolling study plan from the saved exam date and daily available time.
10. Upload a material file, extract candidate questions with AI, manually confirm them, and add them to the private question bank.
11. Generate a wrong-note review card image.
12. Let an administrator inspect question sources, AI usage, job status, and user usage.

Current implementation status:

- The repository now has one runnable web app with learner workflows, `/admin` role routes, a health API, shared core helpers, Prisma/PostgreSQL persistence, worker-backed jobs, Vitest coverage, and Playwright browser workflows.
- The `v0.1.0` release candidate covers the release-critical MVP learning loop for the first Ruankao Software Designer sample track.
- Email/password authentication, database-backed sessions, and route protection are implemented for learner routes and `/admin` role routes.
- Admin exam hierarchy and knowledge-tree management are started as a minimal CRUD workflow.
- Learners can save a primary exam goal and see it on the dashboard.
- The practice workflow is implemented with goal-scoped question retrieval, repeat avoidance, single-choice/multiple-choice/true-false/blank objective grading, subjective answer capture, paper attempts, attempt reports, wrong-note auto-collection, wrong-note knowledge filters/retry, mastery toggles, and database-backed dashboard summaries.
- Admin single-choice question CRUD is implemented for question creation, JSON import, editing, filtering, review-status changes, archive/restore, knowledge binding, source, visibility, and review status.
- Admin paper CRUD is implemented for ordered multi-kind papers with subject binding, visibility, type, question order, section, number, score, archivedAt-based filters, and hide/restore controls. OpenAI/Claude/Gemini BYOK settings, wrong-note AI analysis, AI call logs, failed-call retry, admin model presets, learning analysis, rolling study plans, material uploads, worker-backed extraction jobs, wrong-note review-card image jobs, AI candidate questions, private asset serving, and basic usage protection are implemented for the first release path; advanced practice modes and deeper admin hardening remain future implementation work.

## Exam Coverage

The architecture must support multiple exam families, but the MVP only needs to fully implement one exam track.

MVP content focus:

- Exam program: 软考.
- Exam track: 软件设计师.
- Exam sessions: 基础知识 and 应用技术.
- Other exams such as gaokao, postgraduate exams, and legal qualification exams may exist as empty templates.

## Core User Workflows

### Dashboard

After login, the first screen is a learner dashboard, not a marketing page. It shows:

- Current primary exam goal.
- Today's plan tasks.
- Continue practice or continue mock exam entry.
- Wrong notes due for review.
- Recent weak knowledge points.
- AI diagnosis entry.
- Recent AI/import job status.
- Quick entries for practice, papers, materials, wrong notes, plans, and analysis.

The unauthenticated landing page stays lightweight: product introduction, learner entry, open-source, and self-hosting notes. It shows exam program cards, then sends users to an exam detail page to choose the configured direction or subject. Programs can choose a front-end selection level: track mode uses administrator-configured exam directions, while subject mode uses administrator-configured subjects under one default track/cycle. The current open entry is Ruankao Software Designer; future exams should be added through the admin exam hierarchy before being shown on the homepage.

Implementation note: the current `/dashboard` page is authenticated and reads the user's primary exam goal, active plan tasks, derived review tasks, pending wrong-note and weak knowledge-node summaries, recent jobs, recent AI calls, and active AI task count from the database.

### Exam Goals

Users can save multiple exam goals, but the core loop focuses on one current primary goal at a time.

Each goal records:

- Exam program, track, cycle, and subject scope.
- Target date.
- Target score or passing objective.
- Daily available study time.

AI plans and diagnoses are generated for one goal at a time.

Implementation note: `/goals` now supports creating or updating the current primary goal from available exam hierarchy data. It also accepts homepage prefill query parameters for exam program and track selection. The app enforces one primary goal per user in application logic.

### Practice

The MVP supports these practice modes:

- Focused practice by knowledge tree as the primary learner path.
- Comprehensive random practice by exam, subject, type, and difficulty as a secondary path.
- Real-paper practice by year, cycle, and subject.
- Wrong-note retry.
- AI-generated practice, saved as user-private content by default.
- Case-analysis practice for Ruankao application-technology questions.

Practice selection rules:

- The default practice entry should guide the learner to a knowledge node or enter from weak knowledge, today's plan, or the knowledge tree. Full-goal random practice remains available as a secondary "comprehensive practice" entry.
- Practice modes share `/practice` and are selected with an explicit mode parameter such as `new`, `wrong`, `retry_practiced`, or `comprehensive`. Single-question wrong-note retry continues to use a direct retry question id.
- Knowledge-node practice includes the selected node and its child nodes by default. Selecting a leaf node naturally scopes practice to that leaf.
- Default practice excludes questions the learner has already submitted under the current primary exam goal. A question counts as practiced after a submitted attempt answer exists for the current user and goal, including single-question practice, knowledge-node practice, material practice, AI-private questions, and paper attempts. In-progress, unsubmitted, or abandoned drafts do not count.
- Subjective questions count as practiced immediately after answer submission, even if AI-assisted or manual score confirmation is still pending.
- Deduplication is by `Question.id`, not by `QuestionVersion`. A later question version does not automatically make the same question eligible as new practice.
- New-question mode uses a stable queue rather than random selection. Comprehensive practice may provide a separate random entry.
- Repeat practice is explicit. When no new questions are available, the UI should offer clear actions such as unmastered wrong-note practice, retry practiced questions in the same scope, nearby child/sibling knowledge nodes, or AI-generated new questions.
- Material and knowledge-node filters intersect. For example, material practice with a knowledge-node filter only returns confirmed questions from that material that also belong to the selected knowledge scope and current goal.
- AI-generated candidates only enter practice after learner confirmation creates private questions. Confirmed AI questions follow the same knowledge binding and deduplication rules as other questions.
- After submission, the result page and "practice another question" action must preserve the current mode, knowledge-node filter, material filter, and other explicit practice filters.
- If the current goal is broader than a single subject, knowledge trees should be grouped by subject. Default new-question practice should start from a selected subject or knowledge node, while comprehensive practice may span subjects inside the goal.

The MVP does not include leaderboards, social check-ins, class assignments, community question lists, or complex adaptive testing.

Implementation note: `/practice` supports a goal-scoped multi-kind flow. `packages/core/src/practice.ts` retrieves public approved questions for the current goal, avoids immediate repeats, supports wrong-note retry, persists one-question attempts, references the answered question version, grades single-choice/multiple-choice/true-false/blank objective answers, captures subjective answers, and writes wrong notes for incorrect objective answers.

### Attempt History

Implementation note: `/attempts` lists recent practice and paper attempts with score, submitted time, user answer, correct answer, explanation, paper title when present, report links, and retry links. `/attempts/[attemptId]` shows a per-attempt report with score, correct rate, unanswered count, knowledge-node statistics, and per-question review.

### Mock Exams

Mock exams are quasi-formal but do not include proctoring.

Required behavior:

- Generate attempts from papers.
- Timer and answer sheet.
- Autosave.
- Pause/resume with pause records.
- Submit and score.
- Objective questions auto-graded.
- Subjective questions AI-assisted and user-confirmable.
- Score report by total, subject, question type, and knowledge node.
- Wrong answers automatically enter the wrong-note system.

Not included:

- Camera proctoring.
- Screen recording.
- Anti-tab-switching.
- Institution-level exam release.
- Multi-user same-session exams.

Implementation note: `/papers` now lists public papers for the learner's current goal, and `/papers/[paperId]` supports first-version full-paper submission with an answer card, server-derived elapsed time, autosave status, pause/resume, unanswered confirmation, objective grading, and subjective score suggestions. Submission redirects to an attempt report.

### Wrong Notes

The wrong-note system is a core module.

Required behavior:

- Automatically collect wrong answers.
- Allow manual collection of correct questions.
- Mark mastered or not mastered.
- Record mistake reason tags: unclear concept, misread question, calculation error, memory gap, wrong method, time pressure, guessed answer.
- User notes.
- AI mistake analysis.
- AI review-card image generation.
- Retry from wrong notes.
- Filter by exam goal, subject, knowledge node, question type, error count, and recency.
- Feed status into diagnosis and study plans.

Wrong-note practice rules:

- Wrong-note practice defaults to unmastered wrong notes.
- Correct retry marks the wrong note mastered.
- Incorrect retry keeps the note unmastered and increments the error count.
- Subjective answers do not automatically enter wrong notes at submission time. After score confirmation, non-full-score answers enter wrong notes, full-score answers do not, and retry only marks mastered after a confirmed full score.
- Practicing mastered or all wrong notes requires an explicit learner choice.
- Wrong-note retry remains constrained by the current goal, selected knowledge scope, material scope when present, and question permissions.
- Parent knowledge-node wrong-note practice includes child-node wrong notes, deduplicated by question.
- Wrong-note practice is ordered by higher error count first, then older update time, then stable knowledge-tree order.

Implementation note: `/wrong-notes` lists auto-collected wrong notes, shows correct answer and explanation, supports all/unmastered/mastered and knowledge-node filters, lets the learner toggle mastered/not mastered, links directly to retry, marks a note mastered after a correct retry, generates OpenAI wrong-note analysis, and can queue private review-card image generation. The page displays the latest review-card job status, generated image asset, and failed-job error summary. Mistake reason tags and user notes remain pending.

### Knowledge Points

Knowledge pages are learning indexes, not a full textbook platform.

Required behavior:

- Browse knowledge trees.
- Show short descriptions, exam expectations, related questions, common mistakes, mastery status, recent performance, new-question count, unmastered wrong-note count, and practiced-question count.
- Start focused practice from a knowledge point.
- Let users request AI explanations based on public metadata and their own wrong notes.
- Allow user notes.

Knowledge-node practice actions:

- The primary action is practicing new questions in that knowledge scope.
- Parent knowledge-node counts include child nodes for new questions, unmastered wrong notes, and practiced questions.
- Knowledge-node counts are deduplicated by question, not counted once per knowledge binding.
- If no new questions remain, the page should explain whether the empty state is caused by goal scope, material scope, knowledge scope, or deduplication.
- Empty states should prioritize actions in this order: unmastered wrong-note practice for the same knowledge scope, explicit retry of practiced questions, nearby child/sibling knowledge nodes with new questions, and AI generation for the selected knowledge scope.

Not included:

- Complete course content.
- Video courses.
- Copied commercial textbook content.
- Community encyclopedia features.

### Materials And Import

The MVP includes a material library and AI-assisted question extraction, but not a full RAG knowledge base.

Supported material types:

- PDF.
- Images.
- Markdown.
- TXT.
- JSON.
- DOCX.

Required workflow:

1. Upload material and bind it to an exam, subject, or syllabus.
2. Extract text or OCR.
3. Use AI to extract candidate questions, answers, explanations, knowledge nodes, difficulty, and source page references.
4. Require manual confirmation before candidate questions become practiceable.
5. Add learner-uploaded confirmed questions to the user's private question bank.
6. Add admin-uploaded confirmed questions to the platform question bank as private pending-review uploaded questions.
7. Allow personal materials to be used as AI chat context.
8. Track import status, source, and processing errors.

Implementation note: TXT, Markdown, JSON, DOCX, PDF, and image uploads use the configured storage driver. TXT/Markdown/JSON/DOCX and text-based PDFs are read locally from storage; scanned PDFs and images are passed to the configured AI provider as document/image input for extraction and context chat. Material extraction sets question source to `user_uploaded`; AI is the extraction method, not the question source. Learner uploads remain personal, while admin uploads enter the platform review queue. A standalone OCR service remains outside the MVP.

The MVP does not include full vector search, automatic copyright determination, knowledge graph fusion, video parsing, or large-scale batch-processing UI.

## AI Features

OpenExam centers AI around concrete learning contexts.

Supported providers:

- OpenAI.
- Claude.
- Gemini.

The MVP uses bring-your-own-key as the primary model. Platform keys are optional for demos, trials, or administrator-managed usage. All provider calls go through the backend. The current implementation supports learner BYOK settings for OpenAI, Claude, and Gemini, platform fallback keys, provider base URL overrides, learner-visible AI call logs, admin-managed model presets, daily call limits, platform token budget protection, OpenAI Images for wrong-note review cards, context-bound chat, AI learning diagnoses, and private AI-generated practice-question candidates.

AI features:

- Question explanation.
- Wrong-note explanation.
- Learning diagnosis.
- Structured study-plan generation.
- Subjective-answer grading.
- Question extraction from uploaded materials.
- AI-generated practice questions.
- Context-bound AI chat.
- Wrong-note review-card image generation.
- Problem-solving diagrams for graph-heavy or diagram-heavy questions.

AI chat is a context assistant, not the main product entry. Each chat must bind to a question, wrong note, knowledge point, plan, exam report, or uploaded material.

## AI Image Scope

The MVP supports two image use cases:

- Wrong-note review cards.
- Problem-solving diagrams.

Images are user-private by default and generated asynchronously.

Image styles are limited to:

- `clean_card`.
- `hand_drawn`.
- `flowchart`.

The text provider may generate the image prompt. The image provider is configured separately, with OpenAI Images as the preferred first implementation.

Implementation note: wrong-note review-card images are generated asynchronously by the job worker using OpenAI Images. The default image model is `gpt-image-1.5` unless an enabled admin preset is set for `generate_image`. Generated files are stored under `review-cards/{userId}/` as private `Asset` records and served through authenticated `/assets/[assetId]`; owner or admin access is required. Failed image jobs store an error summary and do not create placeholder images. The worker claims jobs with conditional status updates, requeues stale running jobs by `OPENEXAM_JOB_STALE_MS`, and admin `/admin/jobs` exposes payload, result, timestamps, retry, and recovery controls.

## AI Diagnosis And Plans

AI diagnosis and study plans must be grounded in learning data, not free-form chat.

Diagnosis inputs:

- Target exam and target date.
- Practice history.
- Accuracy, timing, type, subject, and knowledge-node performance.
- Wrong-note counts and mastery status.
- Mock exam scores and completion records.
- User self-assessment and daily available time.
- Question metadata including difficulty, source, year, and cycle.

Diagnosis outputs:

- Knowledge-node mastery.
- Weak-point ranking.
- Score risks.
- Recommended next actions.
- Plan suggestions.

Study plans must be structured task tables, not plain text. Tasks are scheduled by date, carry explicit status, and can bind to subjects, knowledge nodes, papers, materials, and question sets. A saved target date is required before plan generation. The active window starts today and covers the remaining exam-prep period up to a maximum of 30 days.

Implementation note: `/analysis` summarizes practice history, weak knowledge nodes, and wrong-note pressure from database-backed learning data. `/plan` generates and adjusts structured rolling plans with the schema in `packages/core/src/study-plan-schema.ts`, stores scheduled task status, and records plan revisions.

## Question Bank Policy

OpenExam does not ship third-party question banks unless their rights and redistribution terms are explicit.

The MVP ships:

- Small original sample questions for demos.
- Generic importers for administrator-provided JSON/CSV question data. JSON single-choice import is implemented first.
- Material upload and AI-assisted extraction for user-private and platform-review content.

Public question-bank content must be one of:

- Original.
- Explicitly authorized.
- Clearly public or open-licensed.

Unknown-source, user-uploaded, and AI-generated questions are private by default and must not become public without review and source clarification.

## Non-Goals

The MVP does not include:

- Public question-bank contribution platform.
- Organization, class, teacher, or student management.
- Payment, subscription, orders, invoicing, or promotion.
- Proctoring or anti-cheating.
- Social community, ranking, or sharing.
- Full RAG knowledge base.
- Full translated i18n UI beyond the current `zh-CN` locale route skeleton.
- Desktop app or mobile app.
- Complex ML scoring predictions, IRT, or peer ranking.

## Acceptance Criteria

The MVP is accepted when a self-hosted instance can complete the full loop described in "MVP Scope", with PostgreSQL persistence, private user data isolation, AI provider configuration, material import, wrong-note review-card generation, and minimal admin governance for sources, jobs, models, and usage.
