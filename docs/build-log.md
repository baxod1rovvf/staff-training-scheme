# Build log

WeWeb project: `0375231c-d322-4bec-9a5a-776702ac3ce1` ("My project"), editor environment.

## Task 1: Auth foundation

- Auth roles: `creator`, `boss`, `teacher`, `candidate`.
- `auth.users` custom columns: `login` (text, unique), `status` (text, required, default `'active'`), `telegram_chat_id` (text), `stage` (text), `mentor_id` (uuid → auth.users.id, on delete SET NULL). The system column `name` holds the full name.
- `PROVIDER_EMAIL_DISABLE_SIGNUP = TRUE` (all environments).
- Deleted backend workflow "Send welcome email" (would email fake addresses).
- `int_login_to_email` (internal, folder Auth/) — id `4fbe338f-1f8f-4081-8550-b685590e46b5`.
- `mw_active_user` (middleware, folder Auth/) — id `56b500ac-557f-4712-8e5d-4fa44279bf16`. Returns 401 `NOT_AUTHENTICATED` / 403 `BLOCKED`.
- Error convention: workflows throw `Error('<CODE>')`; the response message reads `Code evaluation error: <CODE>`; the frontend extracts the code with `/[A-Z_]{4,}/`.

## Task 2: Data model

Tables (all have system `id`, `createdAt`, `updatedAt`):
`rubric_versions`, `criteria`, `trial_lessons`, `observer_assignments` (+ `telegram_sent`), `scores`, `decisions` (unique `lesson_id`), `materials`, `journal_entries`, `calibration_lessons`, `calibration_attempts`.

Constraints: `scores_band_1_9` (integer 1–9), `scores_one_per_criterion`, `assignments_unique_observer`, `lessons_valid_values`, `materials_valid_type` (type list + file or link), `criteria_unique_order`. Cascade deletes: lesson → assignments → scores; lesson → decision; calibration lesson → attempts.

Seed: standard v1 `01a1c660-a71c-7290-b4f2-f592570d2f2b` (active) with the 10 criteria from spec Appendix A.

Table views (authenticated + `mw_active_user`):
- `tv_active_criteria` `a172cdf9-0508-4b20-91f9-50af166cda43`
- `tv_criteria_by_version(version_id)` `aa36c171-ba0e-4f4e-aef4-a715e3b2a622`
- `tv_materials(type, level)` `7055fd34-4c3e-43d5-b2b4-f5391e6f488f`
- `tv_calibration_lessons` `6cdf2732-cec0-46a2-85f4-2a60591e329e`

Seed user so far: `test.boss` `01a1c661-5205-76bd-9522-296e181c10f8` (login column set in Task 3).

## Task 3: Creator account management

Endpoints (folder Creator/, role `creator`, middleware `mw_active_user`, all POST):
- `creator_create_user` `/creator/users/create` — `355a3633-b828-473e-a61e-d9f4708f0b47`
- `creator_update_user` `/creator/users/update` — `e6418873-2fd6-4d45-bd0f-b435f999dd8c` (only sent fields change)
- `creator_reset_password` `/creator/users/reset-password` — `e1ac72e7-ae0a-4e1c-8887-85b0cc8c9155`
- `creator_list_users` `/creator/users` — `62ffe72d-b3de-418e-b452-ad21ed869682` (only accounts with one of the 4 roles)

The auth users table is addressed as `auth.users` in table-select. `context.auth.user` carries the custom columns (status checked by the middleware).

Seed accounts (passwords given to the user in chat only):

| login | role | id |
|---|---|---|
| creator | creator | `01a1c663-68f7-743c-a9bd-258ac3d8a2c2` |
| test.boss | boss | `01a1c661-5205-76bd-9522-296e181c10f8` |
| test.t1 | teacher | `01a1c665-0092-73cc-b30a-922c955ae3c2` |
| test.t2 | teacher | `01a1c665-1f87-7405-bb71-84ba27e6f062` |
| test.t3 | teacher | `01a1c665-42e5-7dc2-92aa-155a0e48990d` |
| test.c1 | candidate (mentor test.t3) | `01a1c665-8b65-72e0-85bc-b95517303bc2` |
| test.c2 | candidate | `01a1c665-a0cd-736e-944a-55e1ec2329c1` |

The project also has older accounts without any role (from before this project); they can't reach any page or endpoint. Left untouched.

