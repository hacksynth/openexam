# OpenExam Architecture Decisions

Last updated: 2026-05-05

This document records confirmed architecture decisions for the OpenExam MVP.

## Product Principle

OpenExam is a new platform designed from first principles for multi-exam AI preparation.

Confirmed approach:

- Build a generalized multi-exam architecture from the start.
- Keep learner, admin, question-bank, material, AI, and asset boundaries explicit.
- Treat all imported content as source-governed data with independent rights metadata.
- Keep implementation choices aligned with OpenExam's own product model instead of inheriting another application's assumptions.

OpenExam code uses AGPL-3.0 unless this license decision is changed before release. Question data, uploaded materials, and user content keep separate licensing and visibility rules.

## Technology Stack

MVP stack:

- Next.js App Router.
- TypeScript.
- Prisma.
- PostgreSQL as the only officially supported production database.
- Tailwind CSS.
- shadcn/ui.
- Auth.js or an equivalent session system.
- Vitest for unit and API tests.
- Playwright for critical browser workflow tests.

Admin and learner UI are separate Next.js applications in the same monorepo. They are deployed as separate containers and share only explicit packages such as `packages/core`.

The first UI locale is `zh-CN`. Product-facing copy should be written in Simplified Chinese until the project explicitly adds an i18n layer.

Current implementation status:

- The foundation web and admin apps are scaffolded with Next.js App Router, TypeScript strict mode, Tailwind CSS, Prisma, PostgreSQL configuration, and Vitest.
- `package.json` exposes stable scripts for development, build, TypeScript checks, tests, Prisma validation/generation, migrations, and seeding.
- `docker-compose.yml` defines separate `web`, `admin`, and `postgres` services with health checks.
- Database-backed email/password auth and separate learner/admin session cookies are implemented.
- The first Exam Core workflow is implemented with admin exam hierarchy and knowledge-tree management, learner primary goal selection, and a dashboard goal read path.
- The first Practice Loop workflow is implemented for multi-kind objective practice, subjective answer capture, paper attempts, graded attempts, attempt reports, answer-card submission, wrong-note auto-collection, filters, retry, mastery toggles, and database-backed dashboard summaries.
- Playwright now covers the first critical browser workflow across admin content creation/import, learner paper submission/reporting, unanswered confirmation, paper hide/restore, wrong-note retry, and role rejection.
- shadcn/ui installation and S3 storage adapters are still pending.
- Full i18n routing and locale negotiation are not implemented.

## Deployment Shape

The MVP targets self-hosted web deployment.

Included:

- Learner web application container.
- Admin application container.
- PostgreSQL.
- Local file storage adapter. Started for material uploads under `LOCAL_STORAGE_DIR`.
- Optional S3-compatible storage adapter.

Not included as MVP targets:

- Tauri desktop app.
- Full offline PWA.
- Mobile app.

## Routing

Learner routes:

- `/dashboard`
- `/goals`
- `/practice`
- `/papers`
- `/attempts`
- `/wrong-notes`
- `/knowledge`
- `/materials`
- `/plan`
- `/analysis`
- `/ai/tasks`
- `/profile`

Admin app routes, rooted at the admin service or admin domain:

- `/`
- `/exams`
- `/knowledge`
- `/questions`
- `/papers`
- `/materials`
- `/ai`
- `/jobs`
- `/users`
- `/audit`

Admin APIs live inside the admin app under `/api/...`. If a reverse proxy mounts the admin app under `/admin`, that prefix is infrastructure-level routing, not an in-app route requirement.

Implementation note:

- `apps/web` includes a route shell for every learner route above; `/goals`, `/dashboard`, `/practice`, `/papers`, `/attempts`, `/attempts/[attemptId]`, and `/wrong-notes` now use database-backed workflow data.
- `apps/admin` includes a route shell for every admin route above; `/exams`, `/knowledge`, `/questions`, and `/papers` now contain the first minimal CRUD workflows.
- Both apps expose `/api/health` for foundation health checks.
- Admin business APIs are not implemented yet.

## Core Exam Model

The core model is rooted in exam programs, not question banks.

Canonical hierarchy:

```text
ExamProgram -> ExamTrack -> ExamCycle -> Subject
             -> Syllabus -> KnowledgeNode
             -> Question / Paper -> Attempt
```

Examples:

- `Ruankao -> Intermediate -> Software Designer -> 2026 H1 -> Basic Knowledge`.
- `Postgraduate Exam -> Computer Science -> 2026 -> English I`.
- `Legal Qualification -> Objective Exam -> 2026 -> Civil Law`.

The first Prisma schema implements this hierarchy with `ExamProgram`, `ExamTrack`, `ExamCycle`, `Subject`, `Syllabus`, `KnowledgeNode`, `Question`, `Paper`, and `Attempt` models. Migrations have been validated against local PostgreSQL. Minimal CRUD exists for the exam hierarchy, knowledge trees, single-choice questions, and ordered papers.

## Question Model

MVP question kinds:

- `single_choice`
- `multiple_choice`
- `true_false`
- `blank`
- `short_answer`
- `case_analysis`

Questions are extensible with structured fields:

- `kind`
- `stem`
- `payload`
- `answerKey`
- `rubric`
- `assets`
- `difficulty`
- `source`
- `visibility`
- `reviewStatus`

`payload`, `answerKey`, and `rubric` should use JSONB and schema validation.

Implementation note:

- Prisma uses JSON columns for `payload`, `answerKey`, and `rubric`.
- `packages/core/src/question-governance.ts` contains the first tested public-visibility rule helper.
- `packages/core/src/question-admin.ts` contains the first admin single-choice input validation, JSON import validation, filtering, archive, review-status, and persistence helpers.
- Additional Zod schemas are still needed before accepting AI-generated question payloads.

## Papers And Attempts

Questions are independent reusable entities. Papers are ordered references to questions.

Rules:

- `Question` stores the reusable question content.
- `Paper` stores real papers, mock papers, focused papers, and AI-generated paper sets.
- `PaperQuestion` stores order, number, section, and score.
- A question may appear in multiple papers.
- `Attempt` records user work.
- Attempt answers bind to the question version used at answer time.

Implementation note: the current practice workflow creates one `Attempt` per submitted question, grades objective question kinds, and captures subjective answers for later confirmation. The current paper workflow creates or resumes one `Attempt` per public paper with multiple `AttemptAnswer` rows, autosave, pause records, and server-derived elapsed time. Both store selected answers in `AttemptAnswer.userAnswer` and incorrect objective answers enter `WrongNote`. Correct retry from a wrong note marks it mastered. The report helper reads only the current user's attempts and aggregates score, accuracy, unanswered count, and knowledge-node statistics.

Paper hiding uses `Paper.archivedAt`. Visibility remains the publication state (`private`, `unlisted`, or `public`), while archived papers are excluded from learner paper lists and attempts. Restoring a public paper still checks that all bound questions are public, approved, and not deleted.

## Question Versioning

Question versioning is lightweight.

Rules:

- `Question` stores the current version.
- Meaning-changing edits create a `QuestionVersion` snapshot.
- `AttemptAnswer` references `questionVersionId`.
- Version snapshots include stem, payload, answer key, rubric, explanation, knowledge bindings, and source info.
- Answer, stem, option, and rubric changes must create versions.
- Minor metadata edits may avoid version bumps.
- Deletion is soft deletion.

Implementation note: practice submission resolves the current `QuestionVersion` and stores its id on `AttemptAnswer` when available.

## Knowledge Nodes

Questions can bind to multiple knowledge nodes.

Rules:

- Use a many-to-many `QuestionKnowledgeNode` relation.
- Each binding may include a `weight`.
- Each practiceable question should have at least one main knowledge node.
- Imported unknown questions may start in an uncategorized node.
- Knowledge trees belong to syllabi and are isolated by syllabus.
- AI may suggest classifications, but public-bank classification requires review.

## Source, Review, And Visibility

Question governance uses three axes.

`visibility`:

- `private`
- `unlisted`
- `public`

`sourceType`:

- `original`
- `authorized`
- `public_domain_or_open`
- `user_uploaded`
- `ai_generated`
- `unknown`

`reviewStatus`:

- `draft`
- `pending_review`
- `approved`
- `rejected`
- `needs_changes`
- `takedown`

Constraints:

- `public` requires `approved`.
- `public` requires source type `original`, `authorized`, or `public_domain_or_open`.
- `unknown` can never be public.
- `ai_generated` is private by default and cannot become public without manual source clarification.
- Public visibility changes write audit logs.
- `takedown` immediately removes public availability.

## User Content And Privacy

Default privacy is conservative.

Rules:

- Uploaded materials, private questions, wrong notes, AI chats, plans, and AI outputs are private by default.
- User content is not automatically converted to public question-bank content.
- User content is not used for model training by default.
- AI requests must clearly indicate that content is sent to the selected provider.
- Users can delete API keys, uploaded materials, and AI history.
- Logs must not contain full API keys or unnecessary sensitive content.
- AI call records keep provider, model, task type, token estimate, usage metadata, and configurable content retention.

## Authentication And Authorization

The MVP supports:

- Email/password registration and login.
- Database-backed session authentication.
- Roles: `user`, `admin`.

No complex RBAC is included in the MVP.

Implementation rules:

- Passwords are hashed with Node `crypto.scrypt`; plaintext passwords are never stored.
- Session cookies store only random tokens; the database stores token hashes.
- Learner and admin apps use separate cookies: `openexam_web_session` and `openexam_admin_session`.
- The learner app allows registration and login.
- The admin app allows login only; admin users are created through seed/bootstrap configuration.
- The first version does not include email verification or password reset.

## AI Provider Architecture

Text providers:

- OpenAI. Started for synchronous wrong-note explanations through the Responses API.
- Claude.
- Gemini.

Image providers:

- OpenAI Images first.
- Other OpenAI-compatible image endpoints later.

Provider keys:

- User BYOK is primary.
- Platform keys are optional fallback or demo configuration.
- All AI calls go through the backend.
- User keys must be encrypted at rest and deletable.

Implementation note:

- `/profile` lets learners save/delete OpenAI, Claude, and Gemini BYOK keys. Keys are encrypted with AES-256-GCM using `AI_KEY_ENCRYPTION_SECRET`; only a short key hint is displayed.
- If a learner has no BYOK key, provider-specific platform keys may be used as fallbacks. Provider base URL env vars can point calls at compatible gateways.
- `/wrong-notes` can synchronously generate or regenerate a plain-text AI analysis for one wrong note and stores it in `WrongNote.aiAnalysis`.
- `/ai/tasks` lists the user's recent `AiCall` records with model, status, prompt version, duration, token usage, error summary, and retry for failed wrong-note explanations.
- Admin `/ai` manages provider model presets, default task routing, temperature, max tokens, and enabled state.
- Material extraction jobs use the text provider adapter and write Zod-validated pending `MaterialQuestionCandidate` records before admin confirmation creates private questions.

Each AI task records:

- Provider.
- Model.
- Task type.
- Prompt version.
- Input context source.
- Token estimate or image count.
- Status and error summary.

## AI Model Presets And Routing

The system has admin-managed provider presets and user advanced overrides.

Model capability tags:

- `text`
- `vision`
- `long_context`
- `json`
- `reasoning`
- `image_generation`

Task types:

- `explain_question`
- `grade_subjective`
- `generate_plan`
- `extract_questions`
- `diagnose_learning`
- `generate_wrong_note_image_prompt`
- `generate_image`
- `chat_with_context`

Routing rules:

- Each task type has a default provider and model.
- BYOK users can override within capability constraints.
- Vision tasks require vision-capable models.
- Image tasks require image providers.
- No multi-model voting in the MVP.
- No silent cross-provider fallback unless explicitly configured.

## Prompt Management

Core prompts are code-versioned, not freely editable from the admin UI.

Rules:

- Store prompt templates in code.
- Assign each prompt a `promptVersion`.
- Save `promptVersion` on AI call records.
- Admins may configure models, temperature, token limits, task switches, limits, and bounded extra instructions.
- Admin extra instructions require audit logs.

## AI Output Validation

Structured AI outputs must be schema-validated before they enter the database or affect user records.

Schema validation is required for:

- Question extraction.
- Study-plan JSON.
- Subjective grading.
- Knowledge classification.
- Diagnosis key metric references.
- Image prompt metadata.

Plain text is acceptable for:

- Single-question explanation.
- Chat replies.
- Knowledge-point explanation.
- Wrong-note cause explanation.

Use Zod or an equivalent schema library. Failed parsing may retry once. Persistent failure becomes a failed job with an error summary.

Implementation note:

- `packages/core/src/study-plan-schema.ts` defines and tests the structured 14-day plan schema.
- `packages/core/src/ai-output-schemas.ts` defines and tests structured schemas for material question extraction, subjective grading, learning diagnosis, and review-card image prompts.
- `packages/core/src/ai.ts` defines the first plain-text wrong-note prompt version, `wrong-note-explain-v1`.
- Playwright uses an OpenAI-compatible mock `/v1/responses` server so browser tests exercise the HTTP adapter without calling a live model.

## Jobs And Async Work

Short AI tasks may be synchronous.

Synchronous examples:

- Single-question explanation.
- One chat reply.
- Short knowledge explanation.

Long tasks use a database-backed job queue in the MVP.

Async examples:

- Batch wrong-note explanations.
- AI image generation.
- Material OCR and question extraction.
- Study-plan generation.
- Bulk import.
- AI knowledge classification.
- Deep mock-exam diagnosis.

The initial job table should support:

- `type`
- `status`
- `priority`
- `userId`
- `payload`
- `result`
- `error`
- `progress`
- `runAt`
- `startedAt`
- `finishedAt`

Redis or BullMQ can be added later.

## Asset Storage

All files use a unified asset model.

Asset examples:

- Uploaded materials.
- Question images.
- OCR intermediate outputs.
- AI-generated review cards.
- AI-generated diagrams.

Asset fields include:

- Owner.
- Visibility.
- MIME type.
- Size.
- SHA-256.
- Storage key.
- Source.
- Created time.

Default storage is local `storage/`. Production can configure S3-compatible storage.

Private files are served through authenticated backend routes, not direct public URLs. AI-generated images are private assets by default.

Implementation note: local material upload storage is implemented for TXT, Markdown, and PDF files. TXT/Markdown extraction jobs read UTF-8 text directly; PDF OCR/text extraction is still pending and fails with an explicit processing error.

## Admin Surface

MVP admin pages:

- Overview.
- Exam management.
- Knowledge management.
- Question management.
- Paper management.
- Material management.
- AI settings.
- Job queue.
- User management.
- Audit logs.

The audit log may start as a simple append-only event table.

## Usage Limits And Cost Protection

The MVP does not include payment or subscriptions.

Required controls:

- AI call logs.
- User daily/monthly call limits. Started with `OPENEXAM_DAILY_AI_CALL_LIMIT`.
- Image generation limits.
- Upload size limits. Started with `OPENEXAM_UPLOAD_MAX_BYTES`.
- Admin usage view. Started in `/users` and `/ai`.
- Platform-key budget protection. Started with `OPENEXAM_DAILY_PLATFORM_TOKEN_LIMIT`.

The learner UI shows usage and limits, not exact cost. BYOK users are told provider billing belongs to their provider account.

## Locale

The MVP is Simplified Chinese first.

Rules:

- UI language: `zh-CN`.
- Prompt language: Chinese by default.
- Data model may reserve `locale`.
- Content can contain any language, but complete UI i18n is not part of the MVP.

## License

Code license:

- AGPL-3.0.

Separate content licensing:

- Documentation may use CC BY or CC BY-SA.
- Original sample questions need explicit open license metadata.
- Authorized question banks follow their own license and visibility rules.
- User-uploaded content remains user/private content unless explicitly changed.
