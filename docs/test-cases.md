# Backend and UI test cases

Each case is run against the WeWeb **editor** environment (runBackendWorkflow, fetchTableViewData, or a browser walk-through).
`Result` is PASS only when the actual output matched the expected output in this session.

## Task 1: Auth foundation

| # | Workflow / check | Input | Expected | Actual | Result |
|---|---|---|---|---|---|
| 1 | int_login_to_email | `" Ali "` | `ali@users.edunest.local` | `{login:"ali", email:"ali@users.edunest.local"}` | PASS |
| 2 | int_login_to_email | `"a b"` | error `INVALID_LOGIN` | `CodeEvalError: Code evaluation error: INVALID_LOGIN` | PASS |
| 3 | int_login_to_email | `"ab"` | error `INVALID_LOGIN` | `CodeEvalError: Code evaluation error: INVALID_LOGIN` | PASS |
| 4 | listWeWebAuthRoles | — | creator, boss, teacher, candidate | creator, boss, teacher, candidate | PASS |
| 5 | listInstalledAuth | — | PROVIDER_EMAIL_DISABLE_SIGNUP = TRUE | TRUE (editor, staging, production) | PASS |

Moved to Task 3 (see ledger ruling): mw_active_user blocked/active cases, account seeding.
## Task 2: Data model and seeded standard

| # | Workflow / check | Input | Expected | Actual | Result |
|---|---|---|---|---|---|
| 1 | tv_active_criteria | as test.boss | 10 rows, first `Preparation`, last `Edunest systems` | 10 rows; Preparation … Edunest systems | PASS |
| 2 | tv_active_criteria | as test.boss | exactly 4 rows with `must_pass = true` | Preparation, Clear instructions, Accurate English model, Classroom management and pace | PASS |
| 3 | scores insert | band 10 | rejected by check constraint | `violates check constraint "scores_band_1_9"` | PASS |
| 4 | scores insert | same (assignment, criterion) twice | second rejected; other criterion allowed | `violates unique constraint "scores_one_per_criterion"`; different criterion inserted | PASS |
| 5 | observer_assignments insert | same (lesson, observer) twice | second rejected | `violates unique constraint "assignments_unique_observer"` | PASS |
| 6 | delete trial lesson | lesson with assignment + 2 scores | assignment and scores deleted too | first attempt FAILED (FK without cascade) → fixed links → scores table empty after delete | PASS |

Note: debug fetches do not enforce access rules, so "anonymous is rejected" is checked in the browser in Task 9.
## Task 3: Creator account management

| # | Workflow / check | Input | Expected | Actual | Result |
|---|---|---|---|---|---|
| 1 | creator_create_user | login `" Ali "`, role teacher | login `ali`, email `ali@users.edunest.local`, status active | login `ali`, email `ali@users.edunest.local`, status `active`, emailVerified true | PASS |
| 2 | creator_create_user | login `ALI` | error `LOGIN_TAKEN` | `Error: LOGIN_TAKEN` | PASS |
| 3 | creator_create_user | password `1234567` | error `PASSWORD_TOO_SHORT` | `Code evaluation error: PASSWORD_TOO_SHORT` | PASS |
| 4 | creator_create_user | role `admin` | error `INVALID_ROLE` | `Code evaluation error: INVALID_ROLE` | PASS |
| 5 | creator_create_user | role candidate (test.c1, mentor test.t3) | `stage = shadowing`, mentor set | stage `shadowing`, mentor_id = test.t3 | PASS |
| 6 | creator_update_user | creator blocks self | error `CANNOT_BLOCK_SELF` | `Code evaluation error: CANNOT_BLOCK_SELF` | PASS |
| 7 | creator_update_user | ali login → `Test.Boss` | error `LOGIN_TAKEN` | `Code evaluation error: LOGIN_TAKEN` | PASS |
| 8 | creator_update_user | ali status blocked | status `blocked`, other fields untouched | status `blocked`; name/login/roles unchanged | PASS |
| 9 | mw_active_user | as blocked ali | 403 `BLOCKED` | response 403 `{error:"BLOCKED"}` | PASS |
| 10 | mw_active_user | as active test.boss | passes, no response sent | condition false, no response | PASS |
| 11 | creator_reset_password | ali, `newpass123` | `{ ok: true }` | "Password updated successfully", body `{ok:true}` | PASS |
| 12 | creator_list_users | search `ali`; role teacher + active | ali only, no password field; t1–t3 only | ali row without password; t3, t2, t1 | PASS |
## Task 4: Lesson scheduling and Telegram

| # | Workflow / check | Input | Expected | Actual | Result |
|---|---|---|---|---|---|
| 1 | boss_schedule_lesson | 1 observer | error `OBSERVERS_COUNT` | `Code evaluation error: OBSERVERS_COUNT` | PASS |
| 2 | boss_schedule_lesson | test.c1 with observers t1 + t3 (t3 = c1's mentor) | error `MENTOR_AS_OBSERVER` | `Code evaluation error: MENTOR_AS_OBSERVER` | PASS |
| 3 | boss_schedule_lesson | candidate = test.t1 | error `NOT_A_CANDIDATE` | `Code evaluation error: NOT_A_CANDIDATE` | PASS |
| 4 | boss_schedule_lesson | observer = test.c2 | error `NOT_A_TEACHER` | `Code evaluation error: NOT_A_TEACHER` | PASS |
| 5 | boss_schedule_lesson | test.c1, t1 + t2, no chat ids, no bot token | lesson created (status scheduled, active version); `telegram_failed` = [t1, t2] | lesson `scheduled`, version v1, 2 assignments, `telegram_failed` = [t1, t2] | PASS |
| 6 | boss_add_observer | same lesson, t1 again | error `ALREADY_OBSERVER` | `Code evaluation error: ALREADY_OBSERVER` | PASS |
| 7 | boss_add_observer | same lesson, t3 (mentor) | error `MENTOR_AS_OBSERVER` | `Code evaluation error: MENTOR_AS_OBSERVER` | PASS |
| 8 | boss_reopen_score | t1's assignment, both submitted, lesson awaiting_decision | t1 `submitted_at` null; lesson back to `scheduled` | unlocked; 1 submitted left; lesson `scheduled` | PASS |
| 9 | boss_reopen_score | lesson already approved | error `ALREADY_DECIDED` | `Code evaluation error: ALREADY_DECIDED` | PASS |
| 10 | Telegram text | no EDUNEST_APP_URL set | link uses the first app address | first run FAILED (printed the raw list `["https://…","https://…"]/teacher`) → parse fix → `Open: https://directional-calculus-editor.weweb.io/teacher` | PASS |
## Task 5: Scoring, result and decision

Setup: lesson L (test.c2, full, v1) with observers t1 + t2 (both submitted) unless stated. Bands listed per criterion 1–10 as t1 / t2.

| # | Workflow / check | Input | Expected | Actual | Result |
|---|---|---|---|---|---|
| 1 | boss_get_lesson | criterion averages sum 62.0 | overall **6.0** | overall 6, overall_raw 6.2, ready | PASS |
| 2 | boss_get_lesson | sum 62.5 (incl. criterion 6 = 4/7) | overall **6.5** | overall 6.5, raw 6.25, ready | PASS |
| 3 | rules (tmp_test_result_summary, same code) | sum 67.0 | overall **6.5** | overall 6.5, raw 6.7 | PASS |
| 4 | rules (same code) | sum 67.5 | overall **7.0** | overall 7, raw 6.75 | PASS |
| 5 | rules (same code) | overall 7.0, Preparation 5.5 | `not_ready`, must_pass_ok false | overall 7, must_pass_ok false, not_ready | PASS |
| 6 | rules (same code) | overall 6.5, Clear lesson aim 3.5 | `not_ready`, none_below_4 false | overall 6.5, none_below_4 false, not_ready | PASS |
| 7 | boss_get_lesson / rules | criterion bands 4 and 7 / 5 and 7 | disagreement true / false | 4/7 → `disagreements: [Rapport and atmosphere]`; 5/7 → none | PASS |
| 8 | rules after boss_reopen_score(t2) | one observer not submitted | that observer's bands not counted | single bands per criterion, submitted_count 1 | PASS |
| 9 | teacher_submit_scores | second submit by t1 | `ALREADY_SUBMITTED`, score count unchanged | `ALREADY_SUBMITTED`; still exactly 2 bands per criterion | PASS |
| 10 | teacher_submit_scores | 9 of 10 criteria | `INCOMPLETE_SCORES` | `INCOMPLETE_SCORES` | PASS |
| 11 | teacher_submit_scores | band 10 | `INVALID_BAND` | `INVALID_BAND` | PASS |
| 12 | teacher_submit_scores | t1 submits t2's assignment | `NOT_YOUR_ASSIGNMENT` | `NOT_YOUR_ASSIGNMENT` | PASS |
| 13 | teacher_submit_scores | valid, 2nd observer | lesson becomes `awaiting_decision` | `{ok:true, submitted_count:2}`, lesson `awaiting_decision` | PASS |
| 14 | boss_decide | only 1 submitted | `NOT_ENOUGH_SCORES` | `NOT_ENOUGH_SCORES` | PASS |
| 15 | boss_decide | decline a `ready` lesson, note of spaces | `NOTE_REQUIRED` | `NOTE_REQUIRED` | PASS |
| 16 | boss_decide | approve full lesson (ready) | decision stored; lesson `approved`; candidate stage `probation` | decision (ready, 7.0); lesson approved; test.c2 stage `probation` | PASS |
| 17 | boss_decide | decide again | `ALREADY_DECIDED` | `ALREADY_DECIDED` | PASS |
| 18 | teacher_get_scoring_form | lesson on v1 after v2 activated (criterion 2 renamed) | still returns v1 name `Clear lesson aim` | 10 v1 criteria incl. `Clear lesson aim`; v2 removed again | PASS |
| 19 | teacher_submit_scores | resubmit after boss reopened | new bands replace old ones, no duplicates | t2's 7/4/… replaced by 8s; 2 bands per criterion | PASS |
## Task 6: Candidate results, journal, materials

Data: lesson L (test.c2, full, decided Approved 7.0) and L2 (test.c1, micro, 1 of 2 submitted).

| # | Workflow / check | Input | Expected | Actual | Result |
|---|---|---|---|---|---|
| 1 | candidate_my_results | as test.c1 | L2 `Waiting`, no overall / criteria / comments | one lesson, status `Waiting`, only basic fields | PASS |
| 2 | candidate_my_results | as test.c2 | L `Approved`, overall 7, 10 criterion bands, comments, boss note; no observer ids or names | Approved, overall 7, 10 bands (7.5…6.5), comments "Confident, good pace." + Preparation "Clear plan", boss note; no ids/names | PASS |
| 3 | candidate_my_results | c1 vs c2 | neither sees the other's lesson | c1 only L2, c2 only L | PASS |
| 4 | candidate_add_journal | missing techniques | `JOURNAL_FIELDS_REQUIRED` | `JOURNAL_FIELDS_REQUIRED` | PASS |
| 5 | candidate_add_journal | valid, as c1 | entry created for c1 | entry `01a1c67f-688e…` with candidate c1 | PASS |
| 6 | journal_list | c1's journal as t3 (mentor) / t1 / boss / c2 | t3 ✓, t1 `NOT_YOUR_MENTEE`, boss ✓, c2 sees only own (empty) | t3 1 entry, t1 `NOT_YOUR_MENTEE`, boss 1 entry, c2 `[]` | PASS |
| 7 | boss_save_material | no file, no link | `FILE_OR_LINK_REQUIRED` | `FILE_OR_LINK_REQUIRED` | PASS |
| 8 | boss_save_material | link, type exercises | saved; tv_materials(type=exercises) returns it | saved; view returns 1 row "Past simple drills" | PASS |
| 9 | boss_update_candidate | stage `flying` / mentor = c2 / stage micro_teaching | `INVALID_STAGE` / `NOT_A_TEACHER` / saved | as expected; c1 stage `micro_teaching`, mentor unchanged | PASS |
| 10 | boss_list_people | role teacher | t1, t2, t3 only | t1, t3, t2 (sorted by name) | PASS |

Not covered by a backend run: uploading a real file (file parameters cannot be mocked) — checked in the browser in Task 11.
## Task 7: Standard versioning and calibration

| # | Workflow / check | Input | Expected | Actual | Result |
|---|---|---|---|---|---|
| 1 | boss_save_draft_criteria | a criterion with empty name | `NAME_REQUIRED` | `NAME_REQUIRED` | PASS |
| 2 | boss_save_draft_criteria | 10 criteria, #2 renamed | draft v2 created; v1 still active | draft v2 (10 criteria); versions: v1 active, v2 inactive | PASS |
| 3 | boss_publish_rubric | draft exists | returns version 2; v2 active, v1 inactive | `{version_no: 2}`; v1 false, v2 true (then reverted to v1 by hand) | PASS |
| 4 | boss_publish_rubric | no draft | `NO_DRAFT` | `NO_DRAFT` | PASS |
| 5 | boss_save_calibration_lesson | reference missing a criterion | `REFERENCE_INCOMPLETE` | `REFERENCE_INCOMPLETE` | PASS |
| 6 | teacher_submit_calibration | all bands = reference (5) | accuracy 100 | 100 | PASS |
| 7 | teacher_submit_calibration | every band off by 2 | accuracy 75 | 75 | PASS |
| 8 | teacher_submit_calibration | reference all 1, teacher all 9 | accuracy 0 | 0 | PASS |
| 9 | calibration_overview (boss) | after 6–8 | one row per teacher with their latest attempt | t1 100, t2 75, t3 0 with lesson titles | PASS |
## Task 8: Scoring reminders

WeWeb Scheduled Tasks need a paid plan (`JOBS_PLAN_REQUIRED`), so reminders are sent by the boss with one button (`boss_send_reminders`).

| # | Workflow / check | Input | Expected | Actual | Result |
|---|---|---|---|---|---|
| 1 | getJobsConfiguration | editor | Scheduled Tasks available | `JOBS_PLAN_REQUIRED` → ruling: manual reminders | PASS |
| 2 | boss_send_reminders | L2 (t1 submitted, t2 not, 1+ day ago), L decided | overdue list = [t2 on L2] only; `sent: false` (no bot token) | 1 row: Test Teacher Two / Test Candidate One, sent false, telegram_configured false | PASS |
## Task 9: Design system, shell and login

Checked in the WeWeb editor preview / published editor link with a real browser.

| # | Workflow / check | Input | Expected | Actual | Result |
|---|---|---|---|---|---|
| 1 | Login page | open `/login` at 375 and 1280 px | split layout at 1280, single column at 375, no horizontal scroll | waiting for the first publish of the new pages (live site is v1 from 2026-11-07) | DEFERRED (user skipped browser run; test on live site later) |
| 2 | Login | wrong password | "Login or password is incorrect" shown, stays on page | waiting for publish | DEFERRED (user skipped browser run; test on live site later) |
| 3 | Login | `test.boss` / correct password | lands on `/boss` | waiting for publish | DEFERRED (user skipped browser run; test on live site later) |
| 4 | Login | `test.t1`, `test.c1`, `creator` | land on `/teacher`, `/candidate`, `/creator` | waiting for publish | DEFERRED (user skipped browser run; test on live site later) |
| 5 | Role guard | teacher opens `/boss` | sent to own home `/teacher` | onload "Guard: <role>" workflow exists on all 18 role pages (editor data); browser run waiting for publish | DEFERRED (user skipped browser run; test on live site later) |
| 6 | Pages | Signup and Forgot password | removed | both are drafts and hidden from the sitemap (searchPages: `isDraft: true`) | PASS |
| 7 | Home | open `/` | Start page: login when signed out, role home when signed in | Start is the home page (`isHomePage: true`); old Loom Home kept as a draft, content untouched; browser run waiting for publish | DEFERRED (user skipped browser run; test on live site later) |
| 8 | Sidebar | every role page except the print report | shared "App Sidebar" section, nav groups shown by role, Sign out → login | reuse list shows 17 pages; Sign Out Button carries the click workflow (editor data) | PASS |

## Task 10: Creator panel

Backend regression for the change made in this task (empty fields = "not changed"), run with runBackendWorkflow as `creator`. Browser checks are deferred like Task 9 (the user skipped the live-site run).

| # | Workflow / check | Input | Expected | Actual | Result |
|---|---|---|---|---|---|
| 1 | creator_update_user | test.c2, status `blocked`, every other field empty/null | only status changes; name, login, role, stage kept | changes `{status: blocked}`; name "Test Candidate Two", stage `probation` unchanged | PASS |
| 2 | creator_update_user | test.c2, status `active`, others empty | back to active, nothing else changed | changes `{status: active}`; stage `probation` | PASS |
| 3 | Creator page | open `/creator` as creator | table lists the accounts, chips filter by role/status, search narrows | page, 2 sections and 31 workflows built (editor data); browser run waiting | DEFERRED (user skipped browser run; test on live site later) |
| 4 | Create account | new login | slide-over closes, toast "Account created for …", row appears | waiting for browser run | DEFERRED (user skipped browser run; test on live site later) |
| 5 | Create account | login already used | "This login is already taken." in the slide-over | backend returns LOGIN_TAKEN (Task 3 #2); UI waiting for browser run | DEFERRED (user skipped browser run; test on live site later) |
| 6 | Block | Block on a row → confirm | badge turns Blocked; that user's sign-in is refused | backend + middleware verified in Tasks 3/1; UI waiting for browser run | DEFERRED (user skipped browser run; test on live site later) |

## Task 11: Boss pages

New endpoint `boss_list_lessons` (runBackendWorkflow as `test.boss`):

| # | Workflow / check | Input | Expected | Actual | Result |
|---|---|---|---|---|---|
| 1 | boss_list_lessons | candidate_id empty | both test lessons, newest first, counts as numbers | L2 (scheduled, 1/2 submitted) then L (approved, 2/2, decision 7.0) | PASS |
| 2 | boss_list_lessons | lesson L (bands differ by 3 on a criterion) | has_disagreement true | true | PASS |
| 3 | boss_list_lessons | candidate_id = test.c1 | only test.c1's lesson | only L2 | PASS |
| 4 | boss_send_reminders | no Telegram token | overdue list returned, nothing sent, telegram_configured false | 1 overdue (Test Teacher Two), sent false, telegram_configured false | PASS |
| 6 | Candidates page | open `/boss/candidates`, type in search, pick a stage chip | table narrows on name/login and stage; row opens the candidate page | page + 9 workflows built (editor data); browser run waiting | DEFERRED (user skipped browser run; test on live site later) |
| 5 | Dashboard page | open `/boss` | 4 stat cards, decision / upcoming / recent lists, teacher accuracy | page built with load workflow (editor data); browser run waiting | DEFERRED (user skipped browser run; test on live site later) |
