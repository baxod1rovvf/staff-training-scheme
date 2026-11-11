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

## Task 7: Standard editor and calibration

Endpoints:
- `boss_get_standard` `/boss/standard` — `56704e50-3250-4396-82d1-edb9fa05d2fa` → `{ active, draft, versions }`
- `boss_save_draft_criteria` `/boss/standard/save-draft` — `60aacc31-6005-4203-a8df-95d5478e56a7` (whole list; draft = active + 1, not active)
- `boss_publish_rubric` `/boss/standard/publish` — `811b4a9f-fd8f-452c-83db-c0aa2c7723f5`
- `boss_save_calibration_lesson` `/boss/calibration/save` — `56320516-9832-41a1-8aa0-6c659312ab6d`
- `teacher_submit_calibration` `/teacher/calibration/submit` — `32e93dc4-77c9-4b94-814c-dec978d919af`
- `calibration_overview` `/calibration/overview` — `09d578c6-199c-437b-a1fb-19977fe97c37` (boss: lessons + teacher accuracy; teacher: active lessons, reference hidden until they have an attempt)

Data kept: calibration lesson "Elementary speaking lesson (sample)" with attempts by t1 (100) and t2 (75).

## Task 8: Scoring reminders

Scheduled Tasks are not in the current WeWeb plan (`JOBS_PLAN_REQUIRED`). Built `boss_send_reminders` `/boss/reminders/send` — `4fce8c44-b0fd-4117-be16-12344e8fb6e4` (boss) instead, used by a "Send reminders" button on the boss dashboard. When the plan is upgraded, the same steps can run as a daily Scheduled Task at 09:00 Asia/Tashkent.

## Task 9: Frontend foundation (in progress)

Global formula `edErrorText(err)` — `43e3c095-9a63-4580-94af-55d174e74c28` (error code → friendly sentence).
Variables: `loginError` `c5d22f8d-3fb4-4f15-88d6-aa2da410f844`, `isSigningIn` `ac22d2ec-8e67-4b8d-b4c1-06c4ebe78ac3`.
App default theme: light. Design system: see `docs/design-system.md`.

Pages:
| page | path | id |
|---|---|---|
| Login | login | b1b67da0-8601-4730-89fc-5a927645ad75 (form `c3d54584-2e74-4790-a0a6-08bd5824831b`, workflow "Sign in" `8f3c2a10-4b1e-4c7a-9d2e-1a2b3c4d5e01`) |
| Home (redirect) | home | 3c48aeea-ea0f-4378-9a32-1456e6c05c19 |
| Creator · Accounts | creator | cae3c561-7d2d-4778-b042-a06430354e6f |
| Boss · Dashboard | boss | 79819aa0-7c72-4088-8675-9627745a35ce |
| Boss · Candidates | boss/candidates | 9c053e5c-2f86-4b76-8bb4-f7a2c6a76214 |
| Boss · Candidate | boss/candidate/{{candidateId}} | 60eac284-efe6-448a-b774-a75d2ec5afc6 |
| Boss · Lessons | boss/lessons | e8ba6e60-cded-4962-942a-cb3dd42f9ee6 |
| Boss · Lesson decision | boss/lesson/{{lessonId}} | 389fd162-3361-4df7-96e5-4994c7447666 |
| Boss · Report | boss/report/{{lessonId}} | 76ba1daa-5ac4-4d2c-a648-1923beb9c439 |
| Boss · Standard | boss/standard | 51e1b5ef-a028-48a8-a43b-a407bad62071 |
| Boss · Materials | boss/materials | 6c93aa63-bbfd-44cc-9e74-08b83bb461f3 |
| Boss · Calibration | boss/calibration | 6d42e90f-1335-4752-9c4f-aa83c22dbe1b |
| Teacher · My lessons | teacher | 164d60b2-51ec-4a64-828e-f2d1bfa48980 |
| Teacher · Score lesson | teacher/score/{{assignmentId}} | 83ab9c3a-26d6-46c6-810d-39009ccf08aa |
| Teacher · Calibration | teacher/calibration | 0165247c-1cc0-4f6b-b9e9-d8f99febcbb3 |
| Teacher · Mentee journal | teacher/mentee/{{candidateId}} | ea48e8e3-09b9-4303-a937-321eb42836bb |
| Candidate · Home | candidate | a7539762-ed1b-465a-adfa-3e1780c12e4f |
| Candidate · Result | candidate/result/{{lessonId}} | 7d3bf514-c0cf-4f36-ad38-c53b0a14fb2e |
| Candidate · Materials | candidate/materials | a12cbeae-c620-417c-af0f-d2babcb0deb1 |
| Candidate · Journal | candidate/journal | 8d499a16-0fd7-40bc-a0b6-f6777f03d68e |
| Signup / Forgot password (old) | — | f7e55307-a820-4748-82f0-e00aa3246bbd / a31d97b7-2106-46d9-9c83-2032ae3cad69 → emptied, draft |


### Task 9 (continued): shell

| Item | Id |
|---|---|
| App Sidebar (shared section, reused on 17 pages, not on the print report) | 85909faf-5156-4061-9857-c41c5af2bb21 |
| Sign Out Button (click → signout → `login`) | element 5570fab4-dd44-4263-bee5-9c6438748250, workflow 5e1f0a77-2b3c-4d5e-8f90-a1b2c3d4e5f6 |
| Page onload guards "Guard: <role>" (call Guard page) | 6a7b8c9d-00NN-… one per role page (18) |
| Start page (home, onload "Route by role") | f86ed6ed-4b66-482d-a6c9-5e6dd3cdf707 |

Decisions:
- The old Loom "Home" page belongs to an earlier project in the same WeWeb workspace, so it was set to draft instead of being emptied. A new "Start" page is the home page and redirects by role.
- Signup and Forgot password are drafts (accounts and password resets come from the creator only).
- Content sections on role pages use `margin-left: 248px` on desktop and `0` on tablet/mobile so they clear the fixed sidebar (applied as each page is built in Tasks 10–14).
- Nav labels are grey (`ed-sidebar-text`); the active item is marked by the `nav_a` background. Hover/active white text would need the parent-state ids that WeWeb regenerates on insert, so it was left out.
- Browser checks wait for the first publish: the live site is still v1 (2026-11-07) and publishing can only be done from the WeWeb editor.

## Task 10: Creator panel (page `creator`)

Sections: "Creator Accounts" `32f9c609-fbe7-4d62-9fd4-de612c6370ac`, "Creator Overlays" `b7690062-cb24-402f-850b-aab59ceb64b9`.
Variables (folder Creator): crAccounts `b8deca6c-bcf0-4c87-b534-9220b20e12aa`, crTeachers `cee26e3c-cab2-450a-9c30-429e1afcb6e8`, crLoading `f169bab4-a044-47a7-b72c-0d31b6247641`, crFilter `ec388d18-006d-4c97-997f-43ebce1d91cd`, crPanel `f80b6122-387c-4a56-88bf-7fd437bdffd2`, crTarget `d90d1f71-6395-4af2-a0a7-fdc4421bb8c0`, crForm `b6f3b713-7256-402c-a451-c8b5dfff0ec4`, crSaving `783d2a08-0d93-4680-8a41-165ec4591042`, crError `45c64c2b-8a4a-46bd-b29b-77474193e9ee`, crToast `50322557-a9ce-4d0f-b082-b68cceb33161`.
Function workflows: "Creator: load accounts" `c0a1b2c3-0001-…`, "Creator: close overlay" `c0a1b2c3-0002-…`, "Creator: show toast" `c0a1b2c3-0003-…`. Element/page workflows `c0a1b2c3-0010-…` to `c0a1b2c3-0041-…` (load on open, search, 8 filter chips, open create/edit/password/block, 4 close, 7 option chips, Save account, Confirm dialog).

Decisions:
- Option pickers (role, status, mentor) are chips, not select boxes: there are at most a handful of choices and they stay visible on mobile.
- WeWeb requires every endpoint parameter to be sent, so `creator_update_user` now treats empty full_name/login/role/status/stage as "not changed" (empty telegram_chat_id / mentor_id still clear). The block action sends the account's current Telegram id and mentor so they are kept.
- Double submit: Save and Confirm start with "already saving?" and the loader flag is reset in the trycatch `finally`.
- Design patterns (chips, table, slide-over, dialog, toast) appended to the WeWeb design guidelines.

## Task 11: Boss pages

New endpoint `boss_list_lessons` `/boss/lessons` — `5c66db83-83e8-4962-a9f7-cb0b5aa721ed` (boss): lessons newest first, optional `candidate_id`, with candidate_name, observers_total/submitted, has_disagreement (any criterion spread >= 3 among submitted observers) and decision. One SQL query (counts + grouped check).
Variables (folder Boss): bLessons `77240e75-0ee6-4a89-b85f-0060cd8a6658`, bCandidates `901ee58a-bded-47c9-9c95-10bc8bd70d7b`, bTeachers `8b74c25f-e68e-4729-850e-99424e6a73d9`, bLoading `63987228-6b6e-4827-a2e7-7371cb6adc9b`, bBusy `72a03139-5927-4d89-9351-24496c7491fa`, bToast `9f64485d-823d-43dc-99e2-ac3750675de1`.
Dashboard: section "Boss Dashboard" `ef9155e6-3488-4fe7-81f6-105e73af536c`; page onload "Boss: load dashboard" `c0a1b2c3-0101-…`; "Send reminders" `c0a1b2c3-0102-…` (message explains when the Telegram bot is not set up).
Candidates page: section "Boss Candidates" `87288308-3954-4283-8b31-0bd8fe5d6dee`; variable bFilter `f4d18ef9-3b13-406a-ab59-8f56766ce828`; onload "Boss: load candidates" `c0a1b2c3-0110-…`, stage chips `c0a1b2c3-0111…0118`. Search and stage filter run in the browser on the loaded list (small data).
Trial lessons page: section "Boss Lessons" `9d531333-55cd-4d42-8872-1d70fa17bf98`; variables bForm `f6dac6dd-fed8-4664-8753-c04a1a329dee`, bPanel `70d796ce-eafc-445f-8983-7914ef3f1072`, bError `0502acb4-3ddd-4967-8712-e6a44147d3e6`. Functions "Boss: load lessons page" `c0a1b2c3-0120-…`, "Boss: close overlay" `c0a1b2c3-0121-…`; onload `c0a1b2c3-0122-…`; status chips `0123…0127`; open form `0128`; pick candidate `0129`; type `0130/0131`; toggle observer `0132`; close `0133…0135`; Schedule `0136`.
- Date + time are joined in the browser and sent as ISO (UTC), so the lesson time follows the boss's own time zone (Tashkent).
- Picking a candidate removes their mentor from the chosen observers; the mentor's chip is disabled. At most 3 observers.
Candidate page: section "Boss Candidate" `3534876d-a0ae-412b-b9a7-ebba7f5b1925`; new variable bJournal `44debc4e-d5f1-4821-9661-a14b9f2d8461`. Function "Boss: load candidate" `c0a1b2c3-0140-…` (people, then lessons + journal for `globalContext.pageParameters['candidateId']`); onload `0141`; "Set stage" `0142` on Stage Option `c35b4d61-…`; "Set mentor" `0143` on Mentor Option `467137d8-…`.
- The candidate is looked up in the boss_list_people result (no single-candidate endpoint): the list is small and already needed for the pickers.
- Stage and mentor are saved one click at a time; each call sends the other field's current value so it is kept. The list is updated in place instead of reloading.
Standard page: section "Boss Standard" `8d856947-1a34-4230-aed4-43aa07a19f7b`; variables sStd `5bdb0bc0-d4a7-4d04-8782-3ec3576d33e3`, sEdit `f3adea2a-9ceb-4b33-96a8-ae02a391dff8`, sEditing `61d02310-ea63-4967-b4c1-2df2a4ad0956`, sView `8192cb58-2d63-413f-aaf0-d74fb0a9b130`.
Element uids for workflows: Edit Criteria `3c56cd85-…`, Toggle Version `0f03bd83-…`, Publish Draft `5bb3b74e-…`, Dialog Backdrop `66e574cf-…`, Cancel Publish `b79438c2-…`, Confirm Publish `d9b11b93-…`; editor repeat: Must Pass `c89d5610-…`, Move Up `0f421a9d-…`, Delete `9d57fd00-…`, inputs Area `1ebc38ae-…`, Name `c48e7caa-…`, Band 9 `e8d53428-…`, Band 7 `b59e077d-…`, Band 5 `f6834afa-…`, Band 3 `70e7cf54-…`; Add Criterion `0944ec7f-…`, Cancel Edit `401e20f8-…`, Save Draft `16603a2e-…`.
- Editing happens in place on the page (not a slide-over): 10 criteria x 6 fields need the full width. Inputs inside the repeat save to sEdit with debounced change workflows (repeat inputs expose no variables).
- edErrorText now also covers the standard, stage, material, lesson and calibration error codes; NAME_REQUIRED reads "Please enter the name." so it fits accounts and criteria.
Standard workflows: function "Boss: load standard" `c0a1b2c3-0150-…`; onload `0151`; edit `0152`; toggle version `0153`; ask/cancel/backdrop/confirm publish `0154…0157`; field changes `0160…0165`; must pass `0166`; move up `0167`; remove `0168`; add `0169`; cancel edit `0170`; save draft `0171`.
Materials page: section "Boss Materials" `0acfbdbf-133c-4463-b56b-6041851e5575`; variable mLevel `b33cd9ec-df9c-4543-a259-5769c8f234cb` (bFilter = type). Function "Load materials" `c0a1b2c3-0180-…` (fetch tv_materials with type/level); onload `0181`; type/level chips `0182/0183` (one repeated chip each); add/edit `0184/0185`; form type/level `0186/0187`; close `0188…0190`; save `0191`; delete ask/cancel/backdrop/confirm `0192…0195`.
- Filter chips are repeats with one click workflow each instead of one workflow per chip.
- File URLs come from `wwFormulas.getStorageUrl(file_path, 'public')` (never built from the path by hand).
- The save calls the endpoint with the file only when one is chosen (`if` with two calls); without a file it sends `file: ""`, which the endpoint treats as "keep the current file".
Calibration page: section "Boss Calibration" `da18abb5-0a14-4bea-bf36-28028a30689f`; variable cCal `4579ec51-7eae-4765-b880-49c87032cbcd`. Function "Boss: load calibration" `c0a1b2c3-0200-…` (calibration_overview + boss_get_standard); onload `0201`; add/edit `0202/0203`; visibility `0204`; band chip `0205` (nested repeat items carry the criterion id); close `0206…0208`; save `0209`.
- Reference bands are a 1–9 chip row per criterion, so the boss never types numbers; the save names any criterion still missing a band.

## Task 12: Lesson decision and report

Decision page: section "Boss Lesson Decision" `5282ea85-5678-4c16-bfe4-1816fc21e04c`; variable dLesson `bbddc826-37d1-4d15-b104-083ab81eb452`. Function "Boss: load lesson" `c0a1b2c3-0220-…`; onload `0221`; outcome `0222`; ask/cancel/backdrop/confirm decision `0223…0226`; add observer open/pick/close×3/confirm `0227…0232`; reopen scores `0233`. Shared "Hide toast later" `c0a1b2c3-0099-…`.
- The decision needs a confirmation dialog because it cannot be changed; the page checks the 2-observer rule and the override note before the dialog opens (the endpoint checks them again).
Report page: section "Report" `3ed12d6b-ec29-4182-af15-c196b3465532` (no sidebar, max 760 px wide); onload `c0a1b2c3-0240-…` reuses "Boss: load lesson"; Print `0241` runs `window.print()` (custom JS: WeWeb has no print action). The Print button also prints; hide it in the print dialog's "headers" or ignore.

## Task 13: Teacher pages

Endpoint `teacher_my_work` `/teacher/my-work` — `9ff37dd3-9c9f-4bec-b644-b561ab81ff79` (teacher) → `{ assignments: [{assignment_id, submitted, submitted_at, lesson_id, type, scheduled_at, group_name, topic, status, candidate_name, decided}], mentees: [{id, name, login, stage, journal_count}] }`.
Variables: tWork `91d4b94b-3e12-4e77-8603-fd01b6c622f6`, tForm `2a9b9c95-78d2-4670-a48d-7cfdf2341308`, tOpen `ab3c918a-70cb-4205-ab65-d8e6a673b9ea`, tCal `f2a57176-f090-4d76-acb7-d1bc84f7cbf9`.
Pages and sections: home `164d60b2…` (section `e7aa6f72`), mentee `ea48e8e3…` (`5e63aeb3`), score `83ab9c3a…` (`4904ca75`), calibration `0165247c…` (`4f98306f-555e-4ba9-910f-b4861bb96cd8`).
Workflows (folder Teacher/): functions "Teacher: load my work" `c0a1b2c3-0250-…`, "Teacher: load scoring form" `0254`, "Teacher: load calibration" `0270`. Home onload `0251`, tab `0252`; mentee onload `0253`; score onload `0255`, band `0256`, descriptors `0257`, comment `0258`, check `0259`, close/cancel `0260/0261`, confirm submit `0262`; calibration onload `0271`, score it `0272`, band `0273`, descriptors `0274`, check my bands `0275`, back `0276/0277`.
- Scoring and calibration share one form variable (tForm) and the same chip pattern (nested repeat items `{n, cid}`).
- Submitted scores come back with `locked: true`; band clicks are ignored and the submit button checks it again. The backend still refuses a second submit (`ALREADY_SUBMITTED`).
- Calibration reference bands stay hidden until the teacher has sent their own bands; the result view compares per criterion (green same, blue 1 off, amber 2, red 3+).

## Task 14: Candidate pages

Variable cMe `73729c46-8710-4843-b5cb-5a09aaa544df` (kept between pages) = candidate_my_results `{name, stage, lessons:[{lesson_id, type, scheduled_at, group_name, topic, status, overall, boss_note, decided_at, criteria:[{name, area, band}], comments:[{criterion, comment}]}]}`.
Sections: home "Candidate Home" `cf4f1456-97cd-472e-838a-97d6819adb8e`, result `21f08b93-5666-478e-bea6-e87c29e45aca`, materials `8813dfa9-c66d-4ba7-b65e-43dae4c643ff`, journal `0b27f48f-ffb8-4b48-8a59-043246ca9d4d`.
Workflows (folder Candidate/): functions "Candidate: load my results" `c0a1b2c3-0300-…`, "Candidate: load journal" `0306`; home onload `0301`; result onload `0302`; materials onload `0303`, type/level chips `0304/0305` (reuse the shared "Load materials" `0180`); journal onload `0307`; save entry `0308`.
- The result page finds the lesson inside cMe (no extra endpoint); the backend only returns bands, comments and the boss note after the decision, and never observer names.
- Stage tracker: 6 steps (shadowing, micro-teaching, full trial, decision, probation, certified); "declined" shows a banner instead.
- The journal is loaded with the user's own id; journal_list ignores it for candidates and always returns their own entries.
