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
