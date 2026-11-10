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
