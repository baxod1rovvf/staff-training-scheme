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

## Task 4: Lesson scheduling and Telegram

Env variables: `TELEGRAM_BOT_TOKEN` (secure, empty until the user creates a bot), `EDUNEST_APP_URL` (public, optional; when empty the WeWeb built-in `APP_URL` is used — it arrives as a JSON list, first entry taken).

Endpoints (folder Boss/, role `boss`, middleware `mw_active_user`, POST):
- `boss_schedule_lesson` `/boss/lessons/schedule` — `a92ff3c8-61c6-4b92-a578-d164c6e5c0c9` → `{ lesson_id, telegram_failed }`
- `boss_add_observer` `/boss/lessons/add-observer` — `c039ae79-29b4-4407-a171-b39e01d32c9e` → `{ assignment_id, telegram_sent }`
- `boss_reopen_score` `/boss/lessons/reopen-score` — `d0259353-c38d-4453-98ec-3fdbc774be78` (keeps scores, recomputes lesson status)

Telegram: `sendMessage` via HTTP request with `throw: false`; delivery stored in `observer_assignments.telegram_sent`. Messages are skipped silently when the token or the teacher's chat id is empty.

## Task 5: Scoring, result and decision

Endpoints:
- `boss_get_lesson` `/boss/lessons/get` — `27842599-1bd1-4fcb-b8e4-00f36143a157` (boss) → `{ lesson, candidate, observers[{…, scores}], result, decision }`
- `boss_decide` `/boss/lessons/decide` — `cdc590f8-ba9e-4c08-8dcb-3db86f7e7914` (boss)
- `teacher_get_scoring_form` `/teacher/scoring-form` — `bcdc27a1-a5e6-48f1-8ea8-4a16e003b1d2` (teacher, own assignment only)
- `teacher_submit_scores` `/teacher/submit-scores` — `20bb3fbd-60a1-412b-b7a1-2eef52dca36c` (teacher)

Rules block ("Edunest Lesson Standard rules") is the same JS in `boss_get_lesson` and `boss_decide`. Per-criterion bands come from one grouped SQL query (submitted observers only).
Double-submit protection: the submit first sets `submitted_at` only where it is still empty; if nothing was updated → `ALREADY_SUBMITTED`. If saving the bands fails, `submitted_at` is cleared again (`SAVE_FAILED`).

Test helpers (folder Tests/, deleted after Task 6): `tmp_test_set_bands` `176a3d50-3a81-4940-acf9-8d26a432bdca`, `tmp_test_result_summary` `39791eb5-f515-46ad-b2d9-54ca71e669fe`.

## Task 6: Candidate data, journal, materials

Endpoints:
- `candidate_my_results` `/candidate/results` — `78fba6bf-7dd9-49b0-9ab4-e32da7fec62e` (candidate)
- `candidate_add_journal` `/candidate/journal/add` — `693aa9d6-0df2-4fa8-b3ce-ee5cc2458d82` (candidate)
- `journal_list` `/journal/list` — `ceb5cec8-17d0-4541-9ccd-3660fe02ef92` (boss any, teacher own mentees, candidate own)
- `boss_save_material` `/boss/materials/save` — `b0929667-b8fe-4c33-a6d1-341932b6672b` (file → public storage `materials/…`)
- `boss_delete_material` `/boss/materials/delete` — `0d83f182-8591-4462-a97c-ae2b929a3f5a`
- `boss_update_candidate` `/boss/candidates/update` — `074158f5-e017-4671-a11b-decd5923fdbe`
- `boss_list_people` `/boss/people` — `62ec9b94-c06d-4598-b6fa-ad4ebf6b4409`

Note: a request containing the SQL keyword pair "UNION ALL" was blocked by a network firewall (403) — avoid it in workflow SQL.
Test helpers deleted.

