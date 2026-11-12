-- End-to-end and rule tests for schema.sql on a local Postgres (see run_tests.sh).
\set ON_ERROR_STOP 1
set client_min_messages = warning;
\pset tuples_only on
\pset format unaligned

create or replace function pg_temp.as_user(p_login text) returns void language plpgsql as $$
begin perform set_config('test.uid', coalesce((select id::text from public.profiles where login = p_login), ''), false); end $$;

create or replace function pg_temp.expect_error(p_sql text, p_code text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FAIL: expected % from: %', p_code, p_sql;
exception when others then
  if sqlerrm <> p_code then raise exception 'FAIL: expected % but got "%" from: %', p_code, sqlerrm, p_sql; end if;
  raise notice 'ok  %', p_code;
end $$;

create or replace function pg_temp.check(p_ok boolean, p_what text) returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception 'FAIL: %', p_what; end if;
  raise notice 'ok  %', p_what;
end $$;

set client_min_messages = notice;

-- 1. First creator from the SQL editor (no signed-in user)
select pg_temp.check(public.setup_first_creator('Founder', 'Creator', 'creator-pass-1') = 'Creator account created: creator', 'setup_first_creator');
select pg_temp.expect_error($$select public.setup_first_creator('X', 'x2', 'xxxxxxxx')$$, 'A creator account already exists');
select pg_temp.check((select email from auth.users u join public.profiles p on p.id = u.id where p.login = 'creator') = 'creator@users.edunest.local', 'auth email = login@users.edunest.local');
select pg_temp.check((select count(*) from auth.identities i join public.profiles p on p.id = i.user_id where p.login = 'creator') = 1, 'identity row created');
select pg_temp.check((select encrypted_password = extensions.crypt('creator-pass-1', encrypted_password) from auth.users u join public.profiles p on p.id = u.id where p.login = 'creator'), 'password stored as bcrypt');

-- 2. Not signed in / wrong role
select pg_temp.as_user('nobody');
select pg_temp.expect_error($$select public.me()$$, 'NOT_AUTHENTICATED');
select pg_temp.as_user('creator');
select pg_temp.check(public.me()->>'role' = 'creator', 'me() as creator');

-- 3. Creator makes accounts (same values that failed on WeWeb live)
select pg_temp.check(public.creator_create_user('Toxirjon Baxodirov', 'TOXIRJON', '22222222', 'teacher')->>'login' = 'toxirjon', 'create teacher with upper-case login');
select pg_temp.check(public.creator_create_user('Jasurbek Abduraximov', 'jasurbek', 'boss-pass-1', 'boss')->>'role' = 'boss', 'create boss');
select public.creator_create_user('Teacher Two', 'teach2', 'teacher-2-pass', 'teacher');
select public.creator_create_user('Teacher Three', 'teach3', 'teacher-3-pass', 'teacher', 'active', '123456789');
select pg_temp.check(public.creator_create_user('Cand One', 'cand1', 'cand-1-pass', 'candidate', 'active', '',
  (select id from public.profiles where login = 'teach3'))->>'stage' = 'shadowing', 'candidate starts at shadowing with mentor');
select pg_temp.expect_error($$select public.creator_create_user('Dup', 'toxirjon', '12345678', 'teacher')$$, 'LOGIN_TAKEN');
select pg_temp.expect_error($$select public.creator_create_user('Bad', 'a b', '12345678', 'teacher')$$, 'INVALID_LOGIN');
select pg_temp.expect_error($$select public.creator_create_user('Short', 'shorty', '1234567', 'teacher')$$, 'PASSWORD_TOO_SHORT');
select pg_temp.expect_error($$select public.creator_create_user('  ', 'noname', '12345678', 'teacher')$$, 'NAME_REQUIRED');
select pg_temp.expect_error($$select public.creator_create_user('Role', 'norole', '12345678', 'admin')$$, 'INVALID_ROLE');
select pg_temp.check(jsonb_array_length(public.creator_list_users()) = 6, 'creator_list_users lists 6 accounts (creator included)');
select pg_temp.expect_error($$select public.creator_update_user((select id from public.profiles where login='creator'), 'Founder', 'creator', 'creator', 'blocked')$$, 'CANNOT_BLOCK_SELF');
select pg_temp.expect_error($$select public.creator_update_user((select id from public.profiles where login='creator'), 'Founder', 'creator', 'boss', 'active')$$, 'CANNOT_CHANGE_OWN_ROLE');
select public.creator_update_user((select id from public.profiles where login='teach2'), 'Teacher Two', 'teacher.two', 'teacher', 'active', '987654');
select pg_temp.check((select email from auth.users where id = (select id from public.profiles where login='teacher.two')) = 'teacher.two@users.edunest.local', 'login change updates auth email');
select public.creator_reset_password((select id from public.profiles where login='teacher.two'), 'new-pass-22');
select pg_temp.check((select encrypted_password = extensions.crypt('new-pass-22', encrypted_password) from auth.users where id = (select id from public.profiles where login='teacher.two')), 'password reset');

-- Blocking: banned in auth, refused by every function
select public.creator_create_user('Blocked Guy', 'blocked.guy', 'blocked-pass', 'teacher');
select public.creator_update_user((select id from public.profiles where login='blocked.guy'), 'Blocked Guy', 'blocked.guy', 'teacher', 'blocked');
select pg_temp.check((select banned_until > now() from auth.users where id = (select id from public.profiles where login='blocked.guy')), 'blocked user is banned in auth');
select pg_temp.as_user('blocked.guy');
select pg_temp.expect_error($$select public.teacher_my_work()$$, 'BLOCKED');

-- Role checks
select pg_temp.as_user('toxirjon');
select pg_temp.expect_error($$select public.creator_list_users()$$, 'FORBIDDEN');
select pg_temp.expect_error($$select public.boss_list_lessons()$$, 'FORBIDDEN');

-- 4. Boss schedules a full lesson
select pg_temp.as_user('jasurbek');
select pg_temp.expect_error($$select public.boss_schedule_lesson((select id from public.profiles where login='cand1'), 'full', '2026-11-10T09:00:00Z', 'Elementary 3', 'Food',
  array[(select id from public.profiles where login='toxirjon'), (select id from public.profiles where login='teach3')])$$, 'MENTOR_AS_OBSERVER');
select pg_temp.expect_error($$select public.boss_schedule_lesson((select id from public.profiles where login='cand1'), 'full', '2026-11-10T09:00:00Z', '', '',
  array[(select id from public.profiles where login='toxirjon')])$$, 'OBSERVERS_COUNT');
select pg_temp.expect_error($$select public.boss_schedule_lesson((select id from public.profiles where login='cand1'), 'full', 'not a date', '', '',
  array[(select id from public.profiles where login='toxirjon'), (select id from public.profiles where login='teacher.two')])$$, 'INVALID_DATE');
select pg_temp.expect_error($$select public.boss_schedule_lesson((select id from public.profiles where login='cand1'), 'full', '2026-11-10T09:00:00Z', '', '',
  array[(select id from public.profiles where login='toxirjon'), (select id from public.profiles where login='blocked.guy')])$$, 'NOT_A_TEACHER');
create temp table l1 as select (public.boss_schedule_lesson((select id from public.profiles where login='cand1'), 'full', '2026-11-10T09:00:00Z', 'Elementary 3', 'Food',
  array[(select id from public.profiles where login='toxirjon'), (select id from public.profiles where login='teacher.two')])->>'lesson_id')::uuid as id;
select pg_temp.check((select status from public.trial_lessons where id = (select id from l1)) = 'scheduled', 'lesson scheduled');
select pg_temp.check((select count(*) from public.observer_assignments where lesson_id = (select id from l1)) = 2, '2 observer assignments');
select pg_temp.check(jsonb_array_length(public.boss_list_lessons()) = 1, 'boss_list_lessons');

-- 5. Teachers score
select pg_temp.as_user('toxirjon');
create temp table a1 as select (x->>'assignment_id')::uuid as id from jsonb_array_elements(public.teacher_my_work()->'assignments') x;
select pg_temp.check((select count(*) from a1) = 1, 'teacher sees their assignment');
select pg_temp.check(jsonb_array_length(public.teacher_get_scoring_form((select id from a1))->'criteria') = 10, 'scoring form has 10 criteria');
select pg_temp.expect_error(format($$select public.teacher_submit_scores(%L, (select jsonb_agg(jsonb_build_object('criterion_id', id, 'band', 7)) from public.criteria where sort_order < 10))$$, (select id from a1)), 'INCOMPLETE_SCORES');
select pg_temp.expect_error(format($$select public.teacher_submit_scores(%L, (select jsonb_agg(jsonb_build_object('criterion_id', id, 'band', 10)) from public.criteria))$$, (select id from a1)), 'INVALID_BAND');
select pg_temp.check((public.teacher_submit_scores((select id from a1),
  (select jsonb_agg(jsonb_build_object('criterion_id', id, 'band', case sort_order when 7 then 6 else 7 end, 'comment', case sort_order when 1 then 'Clear stages and timings' end)) from public.criteria),
  'Calm, well planned lesson.')->>'submitted_count')::int = 1, 'first teacher submits');
select pg_temp.expect_error(format($$select public.teacher_submit_scores(%L, (select jsonb_agg(jsonb_build_object('criterion_id', id, 'band', 7)) from public.criteria))$$, (select id from a1)), 'ALREADY_SUBMITTED');
select pg_temp.check((public.teacher_get_scoring_form((select id from a1))->>'locked')::boolean, 'form locked after submit');
-- another teacher cannot touch it
select pg_temp.as_user('teach3');
select pg_temp.expect_error(format($$select public.teacher_get_scoring_form(%L)$$, (select id from a1)), 'NOT_YOUR_ASSIGNMENT');

-- Candidate sees "Waiting" and no details before the decision
select pg_temp.as_user('cand1');
select pg_temp.check(public.candidate_my_results()->'lessons'->0->>'status' = 'Waiting' and public.candidate_my_results()->'lessons'->0->'criteria' is null, 'candidate: Waiting, no details');

-- Boss cannot decide with 1 of 2
select pg_temp.as_user('jasurbek');
select pg_temp.expect_error(format($$select public.boss_decide(%L, 'approved', '')$$, (select id from l1)), 'NOT_ENOUGH_SCORES');

select pg_temp.as_user('teacher.two');
select pg_temp.check((public.teacher_submit_scores(
  (select (x->>'assignment_id')::uuid from jsonb_array_elements(public.teacher_my_work()->'assignments') x),
  (select jsonb_agg(jsonb_build_object('criterion_id', id, 'band', case when sort_order in (1,4,6,9) then 8 when sort_order = 7 then 6 else 7 end,
     'comment', case sort_order when 6 then 'Used names, warm atmosphere' end)) from public.criteria),
  'Good rapport; give students more speaking time.')->>'submitted_count')::int = 2, 'second teacher submits');
select pg_temp.check((select status from public.trial_lessons where id = (select id from l1)) = 'awaiting_decision', 'lesson awaiting decision');

-- 6. Boss sees the result (same numbers as the WeWeb walkthrough: overall 7.0, raw 7.1, ready)
select pg_temp.as_user('jasurbek');
create temp table g1 as select public.boss_get_lesson((select id from l1)) as j;
select pg_temp.check((select (j->'result'->>'overall')::numeric = 7 and (j->'result'->>'overall_raw')::numeric = 7.1 and j->'result'->>'recommendation' = 'ready' from g1), 'result overall 7.0, raw 7.1, ready');
select pg_temp.check((select jsonb_array_length(j->'observers') = 2 and jsonb_array_length(j->'result'->'disagreements') = 0 from g1), 'two observers, no disagreements');
select pg_temp.expect_error(format($$select public.boss_decide(%L, 'declined', '  ')$$, (select id from l1)), 'NOTE_REQUIRED');
select pg_temp.check(public.boss_decide((select id from l1), 'approved', 'Well done.')->>'to_probation' = 'true', 'boss approves');
select pg_temp.expect_error(format($$select public.boss_decide(%L, 'approved', '')$$, (select id from l1)), 'ALREADY_DECIDED');
select pg_temp.check((select stage from public.profiles where login = 'cand1') = 'probation', 'candidate moved to probation');

-- 7. Candidate sees the result, anonymously
select pg_temp.as_user('cand1');
create temp table r1 as select public.candidate_my_results() as j;
select pg_temp.check((select j->'lessons'->0->>'status' = 'Approved' and (j->'lessons'->0->>'overall')::numeric = 7 from r1), 'candidate sees Approved 7.0');
select pg_temp.check((select jsonb_array_length(j->'lessons'->0->'criteria') = 10 and jsonb_array_length(j->'lessons'->0->'comments') = 4 from r1), '10 bands and 4 comments');
select pg_temp.check((select (j->'lessons'->0->'criteria'->0->>'band')::numeric = 7.5 from r1), 'Preparation band 7.5');
select pg_temp.check((select j::text not like '%toxirjon%' and j::text not like '%Toxirjon%' and j::text not like '%Teacher Two%' from r1), 'no observer names in candidate data');

-- 8. Rules: IELTS rounding and readiness
select pg_temp.check(public._ielts_round(6.24) = 6 and public._ielts_round(6.25) = 6.5 and public._ielts_round(6.74) = 6.5 and public._ielts_round(6.75) = 7, 'IELTS rounding');

-- Disagreement + not ready + declined lesson: micro lesson, bands 3 vs 9 on criterion 1
select pg_temp.as_user('jasurbek');
create temp table l2 as select (public.boss_schedule_lesson((select id from public.profiles where login='cand1'), 'micro', '2026-11-09T09:00:00Z', '', '',
  array[(select id from public.profiles where login='toxirjon'), (select id from public.profiles where login='teacher.two')])->>'lesson_id')::uuid as id;
select pg_temp.as_user('toxirjon');
select public.teacher_submit_scores((select a.id from public.observer_assignments a join public.profiles p on p.id = a.observer_id where a.lesson_id = (select id from l2) and p.login = 'toxirjon'),
  (select jsonb_agg(jsonb_build_object('criterion_id', id, 'band', case sort_order when 1 then 3 else 6 end)) from public.criteria));
select pg_temp.as_user('teacher.two');
select public.teacher_submit_scores((select a.id from public.observer_assignments a join public.profiles p on p.id = a.observer_id where a.lesson_id = (select id from l2) and p.login = 'teacher.two'),
  (select jsonb_agg(jsonb_build_object('criterion_id', id, 'band', case sort_order when 1 then 9 else 6 end)) from public.criteria));
select pg_temp.as_user('jasurbek');
select pg_temp.check((select r->'disagreements'->>0 = 'Preparation' and r->>'recommendation' = 'ready' from (select public.boss_get_lesson((select id from l2))->'result' as r) x), 'disagreement flagged on Preparation (avg 6 keeps it ready)');
-- reopen one score, then the lesson waits again
select public.boss_reopen_score((select a.id from public.observer_assignments a join public.profiles p on p.id = a.observer_id where a.lesson_id = (select id from l2) and p.login = 'teacher.two'));
select pg_temp.check((select status from public.trial_lessons where id = (select id from l2)) = 'scheduled', 'reopen puts lesson back to scheduled');
select pg_temp.as_user('teacher.two');
select public.teacher_submit_scores((select a.id from public.observer_assignments a join public.profiles p on p.id = a.observer_id where a.lesson_id = (select id from l2) and p.login = 'teacher.two'),
  (select jsonb_agg(jsonb_build_object('criterion_id', id, 'band', case sort_order when 1 then 3 else 5 end)) from public.criteria));
select pg_temp.as_user('jasurbek');
select pg_temp.check((select r->>'recommendation' = 'not_ready' and (r->>'must_pass_ok')::boolean = false from (select public.boss_get_lesson((select id from l2))->'result' as r) x), 'must-pass below 6 → not ready');
select pg_temp.expect_error(format($$select public.boss_decide(%L, 'approved', '')$$, (select id from l2)), 'NOTE_REQUIRED');
select public.boss_decide((select id from l2), 'declined', '');
select pg_temp.check((select stage from public.profiles where login = 'cand1') = 'probation', 'declining a micro lesson does not change the stage');
select pg_temp.expect_error(format($$select public.boss_add_observer(%L, (select id from public.profiles where login='teach3'))$$, (select id from l2)), 'ALREADY_DECIDED');

-- 9. Telegram: token set → message queued for observers with a chat id
update public.app_settings set value = 'TEST_TOKEN' where key = 'telegram_bot_token';
create temp table l3 as select public.boss_schedule_lesson((select id from public.profiles where login='cand1'), 'micro', '2026-12-01T09:00:00Z', 'Pre-Int 1', '',
  array[(select id from public.profiles where login='toxirjon'), (select id from public.profiles where login='teacher.two')]) as j;
select pg_temp.check((select count(*) from net.calls) = 1 and (select body->>'chat_id' from net.calls limit 1) = '987654', 'Telegram sent only to the teacher with a chat id');
select pg_temp.check((select jsonb_array_length(j->'telegram_failed') = 1 from l3), 'telegram_failed lists the teacher without chat id');
select pg_temp.check((select body->>'text' like '%01 Dec 2026, 14:00%' from net.calls limit 1), 'message uses Tashkent time');

-- 10. Standard versioning: lessons keep their version
select pg_temp.expect_error($$select public.boss_save_draft_criteria('[{"area":"A","name":""}]')$$, 'NAME_REQUIRED');
select public.boss_save_draft_criteria((select jsonb_agg(jsonb_build_object('area', area, 'name', case sort_order when 2 then 'Lesson aim' else name end,
  'sort_order', sort_order, 'must_pass', must_pass, 'desc_9', desc_9, 'desc_7', desc_7, 'desc_5', desc_5, 'desc_3', desc_3) order by sort_order)
  from public.criteria where rubric_version_id = (select id from public.rubric_versions where version_no = 1)));
select pg_temp.check((select (s->'draft'->>'version_no')::int = 2 and (s->'active'->>'version_no')::int = 1 from (select public.boss_get_standard() s) x), 'draft v2 next to active v1');
select public.boss_publish_rubric();
select pg_temp.expect_error($$select public.boss_publish_rubric()$$, 'NO_DRAFT');
select pg_temp.as_user('toxirjon');
select pg_temp.check((select bool_or(x->>'name' = 'Clear lesson aim') from jsonb_array_elements(public.teacher_get_scoring_form(
  (select a.id from public.observer_assignments a join public.profiles p on p.id = a.observer_id where a.lesson_id = (select (j->>'lesson_id')::uuid from l3) and p.login='toxirjon'))->'criteria') x),
  'old lesson keeps v1 criteria after v2 is published');

-- 11. Materials
select pg_temp.as_user('jasurbek');
select pg_temp.expect_error($$select public.boss_save_material(null, 'Drills', '', 'exercises', 'Elementary', '', null, null)$$, 'FILE_OR_LINK_REQUIRED');
select pg_temp.expect_error($$select public.boss_save_material(null, 'Drills', '', 'exercises', 'Expert', 'https://x', null, null)$$, 'INVALID_LEVEL');
create temp table m1 as select (public.boss_save_material(null, 'Past simple drills', '', 'exercises', 'Elementary', 'https://example.com/d', null, null)->>'id')::uuid id;
select public.boss_save_material(null, 'Food slides', 'Warm-up', 'slides', '', '', 'materials/1-food.pdf', 'food.pdf');
select pg_temp.as_user('cand1');
select pg_temp.check(jsonb_array_length(public.materials_list('exercises', '')) = 1 and jsonb_array_length(public.materials_list('', '')) = 2, 'candidate lists materials with filters');
select pg_temp.as_user('jasurbek');
select pg_temp.check(public.boss_delete_material((select id from m1))->>'ok' = 'true', 'delete material');

-- 12. Calibration
select pg_temp.expect_error($$select public.boss_save_calibration_lesson(null, 'Sample', 'https://v', '{}'::jsonb, true)$$, 'REFERENCE_INCOMPLETE');
create temp table cl as select (public.boss_save_calibration_lesson(null, 'Sample', 'https://video',
  (select jsonb_object_agg(id::text, 5) from public.criteria where rubric_version_id = (select id from public.rubric_versions where is_active)), true)->>'id')::uuid id;
select pg_temp.as_user('toxirjon');
select pg_temp.check((select x->'reference_bands' = 'null'::jsonb from jsonb_array_elements(public.calibration_overview()->'lessons') x), 'reference hidden before first attempt');
select pg_temp.check((public.teacher_submit_calibration((select id from cl),
  (select jsonb_object_agg(id::text, 7) from public.criteria where rubric_version_id = (select id from public.rubric_versions where is_active)))->>'accuracy')::int = 75, 'every band 2 off → 75%');
select pg_temp.check((public.teacher_submit_calibration((select id from cl),
  (select jsonb_object_agg(id::text, 5) from public.criteria where rubric_version_id = (select id from public.rubric_versions where is_active)))->>'accuracy')::int = 100, 'all equal → 100%');
select pg_temp.check((select x->'reference_bands' <> 'null'::jsonb and (x->'my_latest'->>'accuracy')::int = 100 from jsonb_array_elements(public.calibration_overview()->'lessons') x), 'reference shown after attempt');
select pg_temp.as_user('jasurbek');
select pg_temp.check((select (t->>'latest_accuracy')::int = 100 from jsonb_array_elements(public.calibration_overview()->'teachers') t where t->>'name' = 'Toxirjon Baxodirov'), 'boss sees teacher accuracy');

-- 13. Journal
select pg_temp.as_user('cand1');
select pg_temp.expect_error($$select public.candidate_add_journal('2026-11-08', 'T', '', '', 'x')$$, 'JOURNAL_FIELDS_REQUIRED');
select public.candidate_add_journal('2026-11-08', 'Teacher Three', 'Elementary 2', 'CCQs after each new word.', 'CCQs before every task.');
select pg_temp.check(jsonb_array_length(public.journal_list(null)) = 1, 'candidate reads own journal');
select pg_temp.as_user('teach3');
select pg_temp.check(jsonb_array_length(public.journal_list((select id from public.profiles where login='cand1'))) = 1, 'mentor reads mentee journal');
select pg_temp.check(jsonb_array_length(public.teacher_my_work()->'mentees') = 1, 'mentor sees mentee');
select pg_temp.as_user('toxirjon');
select pg_temp.expect_error($$select public.journal_list((select id from public.profiles where login='cand1'))$$, 'NOT_YOUR_MENTEE');

-- 14. Dashboard, candidates, reminders
select pg_temp.as_user('jasurbek');
select pg_temp.check((public.boss_dashboard()->>'candidates')::int = 1, 'dashboard counts');
select pg_temp.check(jsonb_array_length(public.boss_list_candidates()) = 1, 'candidate list');
select pg_temp.check(jsonb_array_length(public.boss_get_candidate((select id from public.profiles where login='cand1'))->'lessons') = 3, 'candidate page lessons');
select pg_temp.check(public.boss_send_reminders() ? 'overdue', 'reminders run');
select public.boss_set_stage((select id from public.profiles where login='cand1'), 'certified');
select pg_temp.expect_error($$select public.boss_set_stage((select id from public.profiles where login='cand1'), 'flying')$$, 'INVALID_STAGE');
select pg_temp.expect_error($$select public.boss_set_mentor((select id from public.profiles where login='cand1'), (select id from public.profiles where login='cand1'))$$, 'NOT_A_TEACHER');

-- 15. Who may call what (as the "authenticated" database role used by the app).
-- Supabase gives that role table access by default; row level security must still hide every row.
reset role;
grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;
select pg_temp.as_user('jasurbek');
set role authenticated;
select pg_temp.check((public.boss_dashboard()->>'teachers')::int >= 1, 'authenticated role can call boss_dashboard');
select pg_temp.expect_error($$select public._lesson_result(gen_random_uuid())$$, 'permission denied for function _lesson_result');
select pg_temp.expect_error($$select public.setup_first_creator('a','b','cccccccc')$$, 'permission denied for function setup_first_creator');
select pg_temp.check((select count(*) from public.profiles) = 0 and (select count(*) from public.scores) = 0, 'tables return no rows directly (RLS)');
reset role;

\echo ALL TESTS PASSED
