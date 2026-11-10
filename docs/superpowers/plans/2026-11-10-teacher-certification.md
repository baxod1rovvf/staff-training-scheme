# Edunest Teacher Certification Pathway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the v1 Teacher Certification Pathway (creator panel, boss, teacher and candidate areas) in the WeWeb project "My project".

**Architecture:** WeWeb Backend holds all data and rules. Business logic lives in **internal** backend workflows (callable and testable without a logged-in user); role-protected **endpoints** are thin wrappers that check role + `status`, then call the internal workflow. The WeWeb frontend has one page per screen, a shared design system, and a sidebar no-code component per role.

**Tech Stack:** WeWeb frontend, WeWeb Backend (PostgreSQL tables, table views, backend workflows, scheduled tasks), WeWeb Auth (email/password, app roles), WeWeb Storage, Telegram Bot API (`https://api.telegram.org/bot<token>/sendMessage`).

**Spec:** `docs/superpowers/specs/2026-11-10-staff-training-scheme-design.md`

**WeWeb project id:** `0375231c-d322-4bec-9a5a-776702ac3ce1`

## Global Constraints

- All work happens through the WeWeb MCP tools on the **editor** environment; nothing is published to staging/production without the user's go-ahead.
- Existing pages ("Home" with "Loom Top Navigation", "Signup", "Forgot password") are replaced or deleted; **do not reuse their layout or positions** — original design.
- Roles: `creator`, `boss`, `teacher`, `candidate`. Status: `active` | `blocked`.
- Login → auth email: `lower(trim(login)) + "@users.edunest.local"`. Login allowed chars: `a-z 0-9 . _ -`, 3–32 chars. Password min length 8 (existing `PROVIDER_EMAIL_PASSWORD_MIN_LENGTH`).
- Bands are integers 1–9. Overall rounding: fraction < .25 → .0; .25–.74 → .5; ≥ .75 → next whole.
- Ready = overall ≥ 6.0 AND every must-pass criterion band ≥ 6.0 AND no criterion band < 4.0.
- Disagreement: max − min observer band on a criterion ≥ 3.
- Decide requires ≥ 2 submitted assignments. Override of recommendation requires a non-empty note.
- Lesson status: `scheduled` → `awaiting_decision` (when submitted count ≥ 2) → `approved` | `declined`.
- Candidate stages: `shadowing`, `micro_teaching`, `full_trial`, `decision`, `probation`, `certified`, `declined`.
- Material types: `slides`, `exercises`, `pairwork_games`. Levels: Beginner, Elementary, Pre-Intermediate, Intermediate, Upper-Intermediate, Advanced.
- Calibration accuracy = `round(100 − mean(|teacher − reference|) / 8 × 100)`.
- Secrets: `TELEGRAM_BOT_TOKEN` is a **secure** env variable. A Telegram failure never fails the calling workflow.
- Visual: Inter; off-white surfaces, slate text, one deep-indigo accent; green/amber/red only for Approved/Waiting/Declined and alerts; 8 pt spacing; works at 375 px and 1280 px.
- UI text is English.

## Review Focus

1. **Double submit** (double tap on "Submit scores", or a second submit later) → second call rejected with "Already submitted", no duplicate `scores` rows. Test in Task 5.
2. **Standard edited mid-scoring** → lessons already scheduled keep their `rubric_version_id`; their scoring form and result use the old criteria. Test in Task 5.
3. **Login typed as `" Ali "`** → treated as `ali` both when created and when logging in; creating `ALI` when `ali` exists → "Login already taken". Test in Task 3.
4. **Candidate requests a result before the decision** (or another candidate's lesson id) → no bands, no comments, only status `Waiting` / not found. Test in Task 6.
5. **Teacher without Telegram chat id, or Telegram API error** → lesson is still scheduled; the response lists `telegram_failed` observers; the boss sees a warning. Test in Task 4.

---

## File Structure (repository)

The app itself lives in WeWeb. The repo holds the documents that make it reviewable and portable:

- `docs/superpowers/specs/2026-11-10-staff-training-scheme-design.md` — spec (exists)
- `docs/superpowers/plans/2026-11-10-teacher-certification.md` — this plan
- `docs/build-log.md` — one section per task: WeWeb ids/names created (tables, views, workflows, pages, components) and verification output
- `docs/test-cases.md` — every backend test case: workflow, input, expected output, actual result
- `README.md` — what the project is, roles, how to log in, how to hand over to the main Edunest system

---

### Task 1: Auth foundation and cleanup

**WeWeb:** auth roles, `auth.users` custom columns, auth settings, remove signup, middleware.

**Interfaces:**
- Produces: roles `creator|boss|teacher|candidate`; user columns `full_name text`, `login text unique`, `status text default 'active'`, `telegram_chat_id text`, `stage text`, `mentor_id uuid → auth.users.id`; middleware workflow `mw_active_user` (rejects when `context.auth.user.status = 'blocked'` with error code `BLOCKED`); internal workflow `int_login_to_email(login: string) -> { email: string }`.

- [ ] **Step 1:** Create the 4 auth roles and the 6 custom user columns.
- [ ] **Step 2:** Set `PROVIDER_EMAIL_DISABLE_SIGNUP=TRUE`; delete backend workflow "Send welcome email"; keep "Send OTP" untouched but unused.
- [ ] **Step 3:** Create `int_login_to_email` and `mw_active_user`.
- [ ] **Step 4: Test** with `runBackendWorkflow` on `int_login_to_email`:
  - `" Ali "` → `ali@users.edunest.local`
  - `"a b"` → error `INVALID_LOGIN`
  - `"ab"` → error `INVALID_LOGIN`
- [ ] **Step 5:** Seed accounts with `createWeWebAuthUser` (passwords generated, 12 chars, reported to the user only in chat, never committed): `creator` (role creator), `test.boss`, `test.t1`, `test.t2`, `test.t3`, `test.c1`, `test.c2` (`test.c1` mentor = `test.t3`).
- [ ] **Step 6:** Delete pages "Signup" and "Forgot password". Record everything in `docs/build-log.md`, cases in `docs/test-cases.md`.
- [ ] **Step 7:** Commit `docs/` — `feat: auth roles, user columns, signup disabled`.

### Task 2: Data tables, seed standard, table views

**Interfaces:**
- Produces tables exactly as spec §8: `rubric_versions`, `criteria`, `trial_lessons`, `observer_assignments`, `scores`, `decisions`, `materials`, `journal_entries`, `calibration_lessons`, `calibration_attempts`. Unique constraint `scores(assignment_id, criterion_id)`; unique `observer_assignments(lesson_id, observer_id)`; `scores.band` check 1–9.
- Produces table views (all with `mw_active_user`):
  - `tv_active_criteria` (authenticated) — criteria of active version, sorted `sort_order`.
  - `tv_criteria_by_version(version_id)` (authenticated).
  - `tv_boss_lessons` (boss) — lessons joined with candidate `full_name`, submitted count, observer count; sort `scheduled_at desc`.
  - `tv_boss_candidates` (boss) — users with role candidate: `full_name, login, stage, mentor_id`, last lesson status.
  - `tv_my_assignments` (teacher) — `observer_id = context.auth.user.id`, joined lesson + candidate `full_name`; never joins other assignments' scores.
  - `tv_materials(type?, level?)` (authenticated) — sorted `created_at desc`, joined storage file.
  - `tv_my_journal` (candidate) — own entries; `tv_mentee_journal(candidate_id)` (teacher: only if candidate's `mentor_id` = me; boss: any).
  - `tv_calibration_lessons` (authenticated, `is_active = true`); `tv_teacher_accuracy` (boss) — latest attempt per teacher.

- [ ] **Step 1:** Create the 10 tables with foreign keys and constraints.
- [ ] **Step 2:** Seed `rubric_versions` v1 (`is_active=true`) and the 10 `criteria` rows with areas, must-pass flags (Preparation, Clear instructions, Accurate English model, Classroom management and pace) and descriptors copied verbatim from spec Appendix A.
- [ ] **Step 3:** Create the table views.
- [ ] **Step 4: Test:** `fetchTableViewData(tv_active_criteria)` → 10 rows, first `Preparation`, last `Edunest systems`, 4 with `must_pass = true`.
- [ ] **Step 5:** Update build log; commit — `feat: data model and seeded standard v1`.

### Task 3: Creator account management

**Interfaces:**
- Consumes: `int_login_to_email`, `mw_active_user`.
- Produces endpoints (role `creator`, middleware `mw_active_user`):
  - `creator_list_users(search?: string, role?: string, status?: string) -> User[]` (`id, full_name, login, roles, status, telegram_chat_id, stage, mentor_id, createdAt`)
  - `creator_create_user(full_name, login, password, role, status, telegram_chat_id?, mentor_id?) -> User` (sets `stage='shadowing'` for candidates, `emailVerified=true`)
  - `creator_update_user(user_id, full_name?, login?, role?, status?, telegram_chat_id?, mentor_id?, stage?) -> User`
  - `creator_reset_password(user_id, password) -> { ok: true }`
- Errors: `LOGIN_TAKEN`, `INVALID_LOGIN`, `PASSWORD_TOO_SHORT`, `INVALID_ROLE`, `CANNOT_BLOCK_SELF`.

- [ ] **Step 1: Write cases** in `docs/test-cases.md`: create `" Ali "` → login `ali`; create `ALI` again → `LOGIN_TAKEN`; password `"1234567"` → `PASSWORD_TOO_SHORT`; role `"admin"` → `INVALID_ROLE`; creator blocks self → `CANNOT_BLOCK_SELF`; block `ali` then `ali` calls any endpoint → `BLOCKED`.
- [ ] **Step 2:** Build logic as internal workflows `int_create_user`, `int_update_user`; endpoints wrap them.
- [ ] **Step 3:** Run all cases; record actual results; delete test user `ali` afterwards.
- [ ] **Step 4:** Commit — `feat: creator account management endpoints`.

### Task 4: Lesson scheduling and Telegram

**Interfaces:**
- Produces internal `int_send_telegram(chat_id?: string, text: string) -> { sent: boolean, error?: string }` (never throws; `sent=false` when chat id empty or API non-2xx; `throw: false` on the HTTP action).
- Produces endpoints (boss):
  - `boss_schedule_lesson(candidate_id, type: 'micro'|'full', scheduled_at, group_name, topic, observer_ids: uuid[]) -> { lesson_id, telegram_failed: uuid[] }` — uses active rubric version; rejects `< 2` or `> 3` observers (`OBSERVERS_COUNT`), mentor as observer (`MENTOR_AS_OBSERVER`), non-teacher observer (`NOT_A_TEACHER`), non-candidate (`NOT_A_CANDIDATE`). Telegram text: `"New trial lesson to observe: {candidate} — {type}, {date time}, group {group}. Open: {app url}"`.
  - `boss_add_observer(lesson_id, observer_id) -> { telegram_sent: boolean }` (no 3-limit; same mentor/teacher checks; `ALREADY_OBSERVER`).
  - `boss_reopen_score(assignment_id) -> { ok }` — sets `submitted_at = null`, recomputes lesson status; rejected when lesson decided (`ALREADY_DECIDED`).
- Env: create secure `TELEGRAM_BOT_TOKEN` empty; ask the user for the token when available.

- [ ] **Step 1: Cases:** 1 observer → `OBSERVERS_COUNT`; `test.t3` observing `test.c1` → `MENTOR_AS_OBSERVER`; valid with `test.t1`, `test.t2` (no chat ids) → lesson created, `telegram_failed` = both ids (Review Focus 5); add `test.t1` again → `ALREADY_OBSERVER`.
- [ ] **Step 2:** Build `int_send_telegram`, then logic as `int_schedule_lesson`, `int_add_observer`; endpoints wrap.
- [ ] **Step 3:** Run cases; record; commit — `feat: lesson scheduling with Telegram notifications`.

### Task 5: Scoring, result and decision (core rules)

**Interfaces:**
- Produces internal `int_compute_result(lesson_id) -> { criteria: [{criterion_id, name, area, must_pass, band_avg: number, bands: number[], disagreement: boolean}], overall: number, must_pass_ok: boolean, none_below_4: boolean, recommendation: 'ready'|'not_ready', submitted_count: number }` — `sql-execute` for the per-criterion aggregate over submitted assignments only (aggregate needs SQL); rounding in `custom-js` per Global Constraints.
- Produces endpoints:
  - `teacher_get_scoring_form(assignment_id)` (teacher, own only) → lesson info + criteria of the **lesson's** `rubric_version_id` + own saved scores.
  - `teacher_submit_scores(assignment_id, scores: [{criterion_id, band, comment?}], overall_comment?) -> { ok }` — own assignment (`NOT_YOUR_ASSIGNMENT`), not submitted (`ALREADY_SUBMITTED`), lesson not decided, exactly one score per criterion of the lesson's version (`INCOMPLETE_SCORES`), band 1–9 (`INVALID_BAND`); inserts, sets `submitted_at`, sets lesson `awaiting_decision` when submitted ≥ 2.
  - `boss_get_lesson(lesson_id)` → lesson, candidate, assignments with each observer's scores and comments, `int_compute_result` output, `telegram` warnings.
  - `boss_decide(lesson_id, outcome: 'approved'|'declined', note?) -> { decision_id }` — `NOT_ENOUGH_SCORES` when submitted < 2; `NOTE_REQUIRED` when outcome contradicts recommendation and note empty; `ALREADY_DECIDED`; stores `recommended`, `overall_band`; sets lesson status; if `type='full'` and approved → candidate `stage='probation'`; if declined → stage unchanged.

- [ ] **Step 1: Cases** for `int_compute_result` using seeded scores on a test lesson (insert assignments + scores directly, bands chosen so the mean hits the target):
  - all criteria mean 6.24 → overall **6.0**; 6.25 → **6.5**; 6.75 → **7.0**
  - overall 7.0 but Preparation 5.5 → `not_ready`
  - overall 6.5, one criterion 3.5 → `not_ready`
  - observer bands 4 and 7 on one criterion → `disagreement: true`; 5 and 7 → `false`
  - only `submitted_at` assignments counted
- [ ] **Step 2: Cases** for endpoints: second submit → `ALREADY_SUBMITTED` and score row count unchanged (Review Focus 1); 9 of 10 criteria → `INCOMPLETE_SCORES`; band 10 → `INVALID_BAND`; `test.t2` submitting `test.t1`'s assignment → `NOT_YOUR_ASSIGNMENT`; decide with 1 submission → `NOT_ENOUGH_SCORES`; decline a `ready` lesson with empty note → `NOTE_REQUIRED`; approve full lesson → candidate stage `probation`.
- [ ] **Step 3: Case (Review Focus 2):** schedule lesson L, publish rubric v2 with criterion 2 renamed (Task 7's `boss_publish_rubric`, or insert v2 directly if Task 7 not done) → `teacher_get_scoring_form(L)` still returns v1 names.
- [ ] **Step 4:** Build workflows; run all cases until they match; record.
- [ ] **Step 5:** Commit — `feat: scoring, result rules and boss decision`.

### Task 6: Candidate data, journal, materials

**Interfaces:**
- Produces endpoints:
  - `candidate_my_results() -> [{lesson_id, type, scheduled_at, topic, status: 'Waiting'|'Approved'|'Declined', overall?, criteria?: [{name, band}], comments?: string[], boss_note?}]` — `overall/criteria/comments/boss_note` only when decided; comments without observer names.
  - `candidate_add_journal(lesson_date, observed_teacher, group_name, techniques, will_use) -> { id }` (all required except `group_name`).
  - `boss_save_material(id?, title, description, type, level, link_url?, file?) -> { id }` — `storage-put` public folder `materials/`; requires file or link (`FILE_OR_LINK_REQUIRED`).
  - `boss_delete_material(id) -> { ok }`.
  - `boss_set_stage(candidate_id, stage)`, `boss_set_mentor(candidate_id, mentor_id)`.

- [ ] **Step 1: Cases (Review Focus 4):** `test.c1` with one undecided and one decided lesson → undecided item has `status: 'Waiting'` and no `overall`; decided item has bands and comments, no observer ids/names; `test.c2` never sees `test.c1` lessons. Material with neither file nor link → `FILE_OR_LINK_REQUIRED`.
- [ ] **Step 2:** Build; run; record; commit — `feat: candidate results, journal and materials`.

### Task 7: Standard editor and calibration backend

**Interfaces:**
- Produces endpoints:
  - `boss_save_draft_criteria(criteria: [{id?, area, name, sort_order, must_pass, desc_9, desc_7, desc_5, desc_3}])` — writes to a draft version (`is_active=false`, highest `version_no`), creating it by copying the active one if none.
  - `boss_publish_rubric() -> { version_no }` — activates the draft, deactivates the previous.
  - `boss_save_calibration_lesson(id?, title, video_url, reference_bands: {criterion_id: band}, is_active)` — requires all criteria of the active version.
  - `teacher_submit_calibration(calibration_lesson_id, bands: {criterion_id: band}) -> { accuracy }`.
- [ ] **Step 1: Cases:** all bands equal reference → 100; every band off by 2 → 75; off by 8 → 0; publish → `tv_active_criteria` returns the new version, old lessons unaffected.
- [ ] **Step 2:** Build; run; record; commit — `feat: standard versioning and calibration`.

### Task 8: Daily reminder scheduled task

**Interfaces:** Consumes `int_send_telegram`. Produces scheduled task `job_score_reminders`, daily at 09:00 Asia/Tashkent: for assignments with `submitted_at is null` on lessons with status `scheduled|awaiting_decision` and `scheduled_at < now() − 24h`, send `"Reminder: please submit your scores for {candidate}'s lesson on {date}."`.
- [ ] **Step 1:** Read `scheduleJobs` docs; create the job; `replayJob`/manual run with a lesson scheduled 25 h ago → execution log shows one attempt per unsubmitted observer, zero for submitted.
- [ ] **Step 2:** Record; commit — `feat: daily scoring reminders`.

### Task 9: Design system, shell and login

**Interfaces:** Produces tokens (colors `bg`, `surface`, `border`, `text`, `text-muted`, `accent`, `accent-contrast`, `success`, `warning`, `danger` + soft variants; radius 8/12; spacing 4–48; Inter type scale 12/14/16/20/24/32), classes (`card`, `btn-primary`, `btn-secondary`, `btn-danger`, `input`, `badge-approved`, `badge-waiting`, `badge-declined`, `table`, `page-title`, `section-title`), no-code component `AppShell` (props: `role`, `activeItem`; sidebar with role menu, user name, logout; collapses to top bar + drawer under 768 px; on load, if the user is not logged in, lacks the page's role, or any backend call returns `BLOCKED`, it logs out and goes to `/login`), global formula `statusBadge(status)`.
Role menus: creator — Accounts. boss — Dashboard, Candidates, Lessons, Standard, Materials, Calibration. teacher — My lessons, Calibration, Mentees. candidate — Home, Materials, Journal.
- [ ] **Step 1:** Build tokens, classes, `AppShell`; append design guidelines.
- [ ] **Step 2:** Login page (path `login`): split layout — brand panel ("Edunest Teacher Certification") + form with "Login", "Password", "Sign in"; error "Login or password is incorrect"; blocked → "Your account is blocked. Contact the administrator."; on success redirect by role (`creator → /creator`, `boss → /boss`, `teacher → /teacher`, `candidate → /candidate`). Replace Home as home page with a redirect page.
- [ ] **Step 3: Verify:** screenshots at 375 and 1280; log in as each test account → correct landing route; wrong password → error text.
- [ ] **Step 4:** Commit build log — `feat: design system, app shell and login`.

### Task 10: Creator panel page

Page `creator` (role guard creator): accounts table (full name, login, role badge, status badge, Telegram, created), search + role/status filters, "Create account" slide-over (fields from `creator_create_user`; mentor select shown for candidate), row actions Edit, Reset password, Block/Unblock (confirm dialog naming the user).
- [ ] **Step 1:** Build. **Step 2: Verify** create → appears in table; duplicate login → inline "Login already taken"; block → status badge changes and that user's login fails. **Step 3:** Screenshots, commit.

### Task 11: Boss pages

Pages under `boss/`: `dashboard` (stat cards: active candidates, awaiting decision, disagreement alerts; upcoming lessons; recent decisions; teacher accuracy), `candidates` (table + stage badges), `candidate/:id` (stage control, mentor select, lessons, journal tab), `lessons` (table + "Schedule lesson" slide-over with observer multi-select, Telegram warnings), `standard` (criteria grouped by area, edit descriptors, must-pass toggle, "Publish new version" confirm), `materials` (grid cards with type/level filters, add/edit slide-over with file upload or link), `calibration` (lessons list, reference band editor, teacher accuracy table).
- [ ] **Step 1:** Build page by page. **Step 2: Verify** each against its endpoint with test data; screenshots at 375/1280. **Step 3:** Commit.

### Task 12: Boss lesson decision and print report

Page `boss/lesson/:id`: header (candidate, type, date, status), result panel (overall band large, Ready/Not ready badge, must-pass and below-4 checks), criteria table (rows = criteria, columns = observers + average; disagreement rows highlighted with "Add observer"), observers' comments, journal link, decision box (Approve / Decline, note — required hint when overriding), "Reopen" per observer. Page `boss/report/:id`: print-only layout (no shell), Edunest header, candidate, date, result, criteria bands, comments, decision, signature line; "Print" button calls `window.print()`.
- [ ] **Step 1:** Build. **Step 2: Verify** with the Task 5 test lesson: numbers equal `int_compute_result`; override without note shows error; print preview fits A4. **Step 3:** Commit.

### Task 13: Teacher pages

Pages under `teacher/`: `home` (To score / Submitted tabs, mentees list), `score/:assignmentId` (mobile-first: lesson header, one card per criterion with 9 tap targets ≥ 40 px, "Descriptors" expander showing 9/7/5/3, comment; sticky footer "Submit scores (n/10)" disabled until 10; confirm dialog; read-only after submit), `calibration` (video link, same scoring cards, result accuracy), `mentee/:id` (journal read-only).
- [ ] **Step 1:** Build. **Step 2: Verify** at 375 px: complete flow as `test.t1`; double tap submit → one submission. **Step 3:** Commit.

### Task 14: Candidate pages

Pages under `candidate/`: `home` (stage stepper Shadowing → … → Certified; results list with status badges), `result/:lessonId` (bands per criterion as bars, overall, comments, boss note), `materials` (type tabs Slides / Exercises / Pairwork games, level filter, download/open), `journal` (entry form + list).
- [ ] **Step 1:** Build. **Step 2: Verify** as `test.c1` and `test.c2` (isolation). **Step 3:** Commit.

### Task 15: End-to-end walkthrough and handover docs

- [ ] **Step 1:** Full flow with fresh accounts: creator creates boss/2 teachers/candidate → boss schedules full lesson → both teachers score → boss sees result, decides Approved → candidate sees Approved + bands, stage Probation. Record each step in `docs/test-cases.md`.
- [ ] **Step 2:** Screenshots of every page at 375 and 1280 into `docs/screenshots/`.
- [ ] **Step 3:** Rewrite `README.md`: purpose, roles, login format, pages, rules, Telegram setup (bot token, chat ids via @userinfobot), test accounts list (no passwords), Phase 2/3 roadmap, handover notes for the main-system developer (tables + endpoints list).
- [ ] **Step 4:** Remove test data except the creator account (ask the user first). Commit and push.
