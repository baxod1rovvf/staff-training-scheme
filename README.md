# Edunest Teacher Certification Pathway

A WeWeb app that takes a new teacher from "candidate" to "certified Edunest teacher".
Observers score trial lessons against one shared standard (4 areas, 10 criteria, bands 1–9
like IELTS). The app works out the result, and the boss makes the decision.

- WeWeb project: `0375231c-d322-4bec-9a5a-776702ac3ce1` (frontend, WeWeb Backend, WeWeb Auth, Storage)
- Design spec: `docs/superpowers/specs/2026-11-10-staff-training-scheme-design.md`
- Build plan: `docs/superpowers/plans/2026-11-10-teacher-certification.md`
- Every id (tables, endpoints, pages, workflows): `docs/build-log.md`
- Test results: `docs/test-cases.md` (`scripts/check-test-cases.sh <task>` checks one task's rows)
- Design system: `docs/design-system.md`

## Roles

| Role | What they do |
|---|---|
| Creator | Creates and edits every account (full name, login, password, role, status, Telegram chat id, mentor), resets passwords, blocks and unblocks. Nobody can sign up. |
| Boss | Dashboard, candidates and stages, mentor choice, standard editor (versioned), materials library, schedules lessons and observers, decides, prints reports, calibration lessons, Telegram reminders. |
| Teacher | Scores the lessons they observe (they never see other observers' scores), practises on calibration lessons, reads the journals of the candidates they mentor. |
| Candidate | Sees their stage, their lesson results (bands, comments and the boss's note, never observer names), lesson materials, and writes a shadowing journal. |

## Signing in

Everyone signs in with **login + password**. WeWeb Auth needs an email, so the login `ali` is
stored as `ali@users.edunest.local`. The login page shows only a "Login" field and adds the
domain itself. A blocked account cannot sign in, and every backend call from it is refused.

## Pages

| Role | Page | Path |
|---|---|---|
| All | Login | `/login` (home `/home` sends each role to its own start page) |
| Creator | Accounts | `/creator` |
| Boss | Dashboard | `/boss` |
| Boss | Candidates · Candidate | `/boss/candidates` · `/boss/candidate/<id>` |
| Boss | Lessons · Lesson decision · Report | `/boss/lessons` · `/boss/lesson/<id>` · `/boss/report/<id>` |
| Boss | Standard · Materials · Calibration | `/boss/standard` · `/boss/materials` · `/boss/calibration` |
| Teacher | My lessons · Score lesson | `/teacher` · `/teacher/score/<assignmentId>` |
| Teacher | Calibration · Mentee journal | `/teacher/calibration` · `/teacher/mentee/<candidateId>` |
| Candidate | My progress · Result | `/candidate` · `/candidate/result/<lessonId>` |
| Candidate | Materials · Journal | `/candidate/materials` · `/candidate/journal` |

## Rules

- **Criterion band** = average of the observers' bands for that criterion.
- **Overall band** = average of the 10 criterion bands, rounded like IELTS (below .25 rounds down, .25–.74 becomes .5, .75 or more rounds up).
- **Ready** when the overall band is 6.0 or more, every must-pass criterion (Preparation, Clear instructions, Accurate English model, Classroom management and pace) is 6.0 or more, and no criterion is below 4.0.
- **Disagreement** when two observers are 3 or more bands apart on a criterion. The boss can add another observer.
- The boss can decide only after **at least 2 observers** have submitted. The candidate's mentor cannot observe their lessons.
- The result is a recommendation. If the boss goes against it, a note is required. A decision cannot be changed.
- Approving a **full** trial lesson moves the candidate to **Probation**. Other stage changes are made by the boss.
- Stages: Shadowing → Micro-teaching → Full trial → Decision → Probation → Certified (or Declined).
- The standard is versioned. A lesson always keeps the version it was scheduled with.
- Calibration: a teacher scores a recorded lesson and sees how close they are to the reference bands (accuracy 85% or more = scores like the team).

## Telegram setup

Teachers get a Telegram message when they are added as observers, and the boss can send reminders for scores that are late.

1. In Telegram, open **@BotFather**, send `/newbot`, follow the steps and copy the bot token.
2. In WeWeb: Backend → Environment variables → set `TELEGRAM_BOT_TOKEN` (secure) to that token, for every environment you use.
3. Optional: set `EDUNEST_APP_URL` to the public address of the app (for the link in messages). When it is empty, WeWeb's own app URL is used.
4. Each teacher opens your bot and presses **Start** (a bot cannot message someone who never started it).
5. Each teacher gets their chat id from **@userinfobot** (it replies with "Id: 123456789"). The creator enters it on the teacher's account.

Without a token or chat id, the app still works; messages are just skipped. The lesson page shows who was not notified.

Daily automatic reminders need WeWeb Scheduled Tasks, which are not in the current plan. The boss uses the **Send reminders** button on the dashboard instead. After a plan upgrade, `boss_send_reminders` can run as a daily Scheduled Task.

## Accounts

Only the `creator` account exists. The creator makes every other account from the Accounts page.
All test accounts and test data were deleted on 11 Nov 2026 (see `docs/test-cases.md`, "Test data cleanup").

## Handover notes for the main Edunest system

Tables (WeWeb Backend, Postgres): `rubric_versions`, `criteria`, `trial_lessons`, `observer_assignments`,
`scores`, `decisions`, `materials`, `journal_entries`, `calibration_lessons`, `calibration_attempts`,
plus custom columns on `auth.users`: `login`, `status`, `telegram_chat_id`, `stage`, `mentor_id`.

Endpoints (POST, role-protected, all behind the `mw_active_user` middleware). Errors come back as an upper-case code such as `NOT_ENOUGH_SCORES`.

| Area | Endpoints |
|---|---|
| Accounts (creator) | `creator_create_user`, `creator_update_user`, `creator_reset_password`, `creator_list_users` |
| Lessons (boss) | `boss_schedule_lesson`, `boss_add_observer`, `boss_reopen_score`, `boss_get_lesson`, `boss_decide`, `boss_send_reminders` |
| People and materials (boss) | `boss_list_people`, `boss_update_candidate`, `boss_save_material`, `boss_delete_material` |
| Standard (boss) | `boss_get_standard`, `boss_save_draft_criteria`, `boss_publish_rubric` |
| Calibration | `boss_save_calibration_lesson`, `teacher_submit_calibration`, `calibration_overview` |
| Teacher | `teacher_my_work`, `teacher_get_scoring_form`, `teacher_submit_scores` |
| Candidate | `candidate_my_results`, `candidate_add_journal`, `journal_list` |

The scoring rules live in one JavaScript block that is the same in `boss_get_lesson` and `boss_decide`. Change both together.

## Roadmap

- **Phase 2:** short feedback from students, a teaching-methods quiz, video upload, rewarding observers with diamonds, analytics (time to "ready", weakest criteria), regular observation of current teachers.
- **Phase 3:** move into the main Edunest system; a paid "Edunest Teacher Course" for teachers from outside.

## Still to do

- Browser tests on the live site (all page rows marked DEFERRED in `docs/test-cases.md`), including screenshots at 375 px and 1280 px.
- Telegram bot token and teacher chat ids (see above).
