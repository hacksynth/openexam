# OpenExam Product Requirements

Last updated: 2026-05-05

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
9. Generate a structured 14-day study plan.
10. Upload a material file, extract candidate questions with AI, manually confirm them, and add them to the private question bank.
11. Generate a wrong-note review card image.
12. Let an administrator inspect question sources, AI usage, job status, and user usage.

Current implementation status:

- The repository now has separate runnable learner and admin foundation apps with documented route placeholders, health APIs, shared core helpers, and initial domain tests.
- The app does not yet complete the MVP learning loop.
- Email/password authentication and route protection are started.
- Real practice sessions, AI provider calls, material uploads, image generation, and admin CRUD remain future implementation work.

## Exam Coverage

The architecture must support multiple exam families, but the MVP only needs to fully implement one exam track.

MVP content focus:

- Exam program: Ruankao.
- Exam track: Software Designer.
- Exam sessions: basic knowledge and application technology.
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

The unauthenticated landing page stays lightweight: product introduction, login/register, open-source and self-hosting notes.

Implementation note: the current `/dashboard` page is a static foundation shell that shows representative goal, task, weak-point, wrong-note, and job-status areas. It is not yet backed by authentication or database records.

### Exam Goals

Users can save multiple exam goals, but the core loop focuses on one current primary goal at a time.

Each goal records:

- Exam program, track, cycle, and subject scope.
- Target date.
- Target score or passing objective.
- Daily available study time.

AI plans and diagnoses are generated for one goal at a time.

### Practice

The MVP supports these practice modes:

- Random practice by exam, subject, knowledge node, type, and difficulty.
- Focused practice by knowledge tree.
- Real-paper practice by year, cycle, and subject.
- Wrong-note retry.
- AI-generated practice, saved as user-private content by default.
- Case-analysis practice for Ruankao application-technology questions.

The MVP does not include leaderboards, social check-ins, class assignments, community question lists, or complex adaptive testing.

Implementation note: `packages/core/src/grading.ts` contains the first tested objective-grading helper. Practice sessions, question retrieval, submissions, persistence, and wrong-note creation are still pending.

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

### Knowledge Points

Knowledge pages are learning indexes, not a full textbook platform.

Required behavior:

- Browse knowledge trees.
- Show short descriptions, exam expectations, related questions, common mistakes, mastery status, and recent performance.
- Start focused practice from a knowledge point.
- Let users request AI explanations based on public metadata and their own wrong notes.
- Allow user notes.

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
- DOCX.

Required workflow:

1. Upload material and bind it to an exam, subject, or syllabus.
2. Extract text or OCR.
3. Use AI to extract candidate questions, answers, explanations, knowledge nodes, difficulty, and source page references.
4. Require manual confirmation before candidate questions become practiceable.
5. Add confirmed questions to the user's private question bank.
6. Allow materials to be used as AI chat context.
7. Track import status, source, and processing errors.

The MVP does not include full vector search, automatic copyright determination, knowledge graph fusion, video parsing, or large-scale batch-processing UI.

## AI Features

OpenExam centers AI around concrete learning contexts.

Supported providers:

- OpenAI.
- Claude.
- Gemini.

The MVP uses bring-your-own-key as the primary model. Platform keys are optional for demos, trials, or administrator-managed usage. All provider calls go through the backend.

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

Study plans must be structured task tables, not plain text. Tasks are checkable and can bind to subjects, knowledge nodes, papers, materials, and question sets.

Implementation note: `packages/core/src/study-plan-schema.ts` defines the first Zod schema for structured 14-day plans. Plan generation and task completion UI are not implemented yet.

## Question Bank Policy

OpenExam does not ship third-party question banks unless their rights and redistribution terms are explicit.

The MVP ships:

- Small original sample questions for demos.
- Generic importers for administrator-provided JSON/CSV question data.
- Material upload and AI-assisted extraction for user-private content.

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
- Full i18n UI.
- Desktop app or mobile app.
- Complex ML scoring predictions, IRT, or peer ranking.

## Acceptance Criteria

The MVP is accepted when a self-hosted instance can complete the full loop described in "MVP Scope", with PostgreSQL persistence, private user data isolation, AI provider configuration, material import, wrong-note review-card generation, and minimal admin governance for sources, jobs, and usage.
