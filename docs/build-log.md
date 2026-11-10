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

