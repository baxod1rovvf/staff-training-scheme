-- =====================================================================
-- Edunest Teacher Certification — Supabase database
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run again: it updates functions and keeps existing data.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;
do $$ begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net is not available: Telegram messages are switched off';
end $$;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table if not exists public.app_settings (
  key text primary key,
  value text not null default ''
);
insert into public.app_settings (key, value) values
  ('telegram_bot_token', ''),
  ('app_url', 'https://baxod1rovvf.github.io/staff-training-scheme/')
on conflict (key) do nothing;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  login text not null unique,
  role text not null check (role in ('creator', 'boss', 'teacher', 'candidate')),
  status text not null default 'active' check (status in ('active', 'blocked')),
  telegram_chat_id text,
  stage text check (stage in ('shadowing', 'micro_teaching', 'full_trial', 'decision', 'probation', 'certified', 'declined')),
  mentor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.rubric_versions (
  id uuid primary key default gen_random_uuid(),
  version_no int not null unique,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.criteria (
  id uuid primary key default gen_random_uuid(),
  rubric_version_id uuid not null references public.rubric_versions (id) on delete cascade,
  sort_order int not null,
  area text not null,
  name text not null,
  must_pass boolean not null default false,
  desc_9 text, desc_7 text, desc_5 text, desc_3 text,
  unique (rubric_version_id, sort_order)
);

create table if not exists public.trial_lessons (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('micro', 'full')),
  scheduled_at timestamptz not null,
  group_name text,
  topic text,
  status text not null default 'scheduled',
  rubric_version_id uuid not null references public.rubric_versions (id),
  created_at timestamptz not null default now()
);

-- Changes for databases created before these columns existed (safe to run again)
alter table public.trial_lessons drop constraint if exists trial_lessons_status_check;
alter table public.trial_lessons add constraint trial_lessons_status_check
  check (status in ('scheduled', 'awaiting_decision', 'approved', 'declined', 'cancelled'));
alter table public.trial_lessons add column if not exists cancel_reason text;
alter table public.trial_lessons add column if not exists feedback_token text unique default encode(extensions.gen_random_bytes(9), 'hex');

create table if not exists public.observer_assignments (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.trial_lessons (id) on delete cascade,
  observer_id uuid not null references public.profiles (id) on delete cascade,
  submitted_at timestamptz,
  overall_comment text,
  telegram_sent boolean not null default false,
  created_at timestamptz not null default now(),
  unique (lesson_id, observer_id)
);

create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.observer_assignments (id) on delete cascade,
  criterion_id uuid not null references public.criteria (id) on delete cascade,
  band int not null check (band between 1 and 9),
  comment text,
  unique (assignment_id, criterion_id)
);

create table if not exists public.decisions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null unique references public.trial_lessons (id) on delete cascade,
  boss_id uuid references public.profiles (id) on delete set null,
  outcome text not null check (outcome in ('approved', 'declined')),
  recommended text not null,
  overall_band numeric(3, 1) not null,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  type text not null check (type in ('slides', 'exercises', 'pairwork_games')),
  level text check (level in ('Beginner', 'Elementary', 'Pre-Intermediate', 'Intermediate', 'Upper-Intermediate', 'Advanced')),
  file_path text,
  file_name text,
  link_url text,
  created_at timestamptz not null default now(),
  check (file_path is not null or link_url is not null)
);

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.profiles (id) on delete cascade,
  lesson_date date not null,
  observed_teacher text not null,
  group_name text,
  techniques text not null,
  will_use text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.calibration_lessons (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  video_url text not null,
  rubric_version_id uuid not null references public.rubric_versions (id),
  reference_bands jsonb not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.calibration_attempts (
  id uuid primary key default gen_random_uuid(),
  calibration_lesson_id uuid not null references public.calibration_lessons (id) on delete cascade,
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  bands jsonb not null,
  accuracy int not null,
  created_at timestamptz not null default now()
);

-- Anonymous feedback from the students of a trial lesson (QR code)
create table if not exists public.student_feedback (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.trial_lessons (id) on delete cascade,
  understood int not null check (understood between 1 and 5),
  clear int not null check (clear between 1 and 5),
  spoke int not null check (spoke between 1 and 5),
  enjoyed int not null check (enjoyed between 1 and 5),
  comment text check (length(comment) <= 500),
  created_at timestamptz not null default now()
);

-- Teaching-methods quiz
create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  sort_order int not null default 0,
  question text not null,
  options jsonb not null,
  correct_index int not null,
  explanation text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.profiles (id) on delete cascade,
  answers jsonb not null,
  score int not null,
  total int not null,
  created_at timestamptz not null default now()
);

-- Nobody reads or writes the tables directly: every request goes through the
-- functions below, which check the user's role first.
alter table public.app_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.rubric_versions enable row level security;
alter table public.criteria enable row level security;
alter table public.trial_lessons enable row level security;
alter table public.observer_assignments enable row level security;
alter table public.scores enable row level security;
alter table public.decisions enable row level security;
alter table public.materials enable row level security;
alter table public.journal_entries enable row level security;
alter table public.calibration_lessons enable row level security;
alter table public.calibration_attempts enable row level security;
alter table public.student_feedback enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_attempts enable row level security;

-- ---------------------------------------------------------------------
-- Lesson standard v1 (only when the database is new)
-- ---------------------------------------------------------------------
do $$
declare v uuid;
begin
  if not exists (select 1 from public.rubric_versions) then
    insert into public.rubric_versions (version_no, is_active) values (1, true) returning id into v;
    insert into public.criteria (rubric_version_id, sort_order, area, name, must_pass, desc_9, desc_7, desc_5, desc_3) values
    (v, 1, 'Before the lesson', 'Preparation', true,
      'Detailed written plan with aim, stages, timings; all materials ready; board planned; zero time lost.',
      'Plan with stages and timings; materials ready; minor lost time.',
      'Rough plan; some materials missing or improvised; noticeable lost time.',
      'No plan; materials not ready; lesson visibly improvised.'),
    (v, 2, 'Before the lesson', 'Clear lesson aim', false,
      'Aim stated; every activity serves it; students can say what they learned.',
      'Aim clear; most activities serve it.',
      'Aim vague; several activities unrelated.',
      'No identifiable aim.'),
    (v, 3, 'Teacher delivery', 'Confidence and flow', false,
      'No hesitation; smooth transitions; handles surprises calmly.',
      'Mostly confident; small pauses; transitions clear.',
      'Frequent pauses; abrupt transitions; unsettled by questions.',
      'Long hesitations; loses the thread; visibly uncomfortable.'),
    (v, 4, 'Teacher delivery', 'Clear instructions', true,
      'Short, demonstrated, checked with instruction-check questions; students start immediately.',
      'Clear; usually demonstrated or checked; rare confusion.',
      'Long or unchecked; several students confused.',
      'Unclear; most students do not know what to do.'),
    (v, 5, 'Teacher delivery', 'Accurate English model', true,
      'Accurate, natural, graded to level; clear pronunciation.',
      'Few minor errors; mostly well graded.',
      'Noticeable errors or poorly graded language.',
      'Frequent errors that students could copy.'),
    (v, 6, 'Students'' experience', 'Rapport and atmosphere', false,
      'Warm, humorous, uses names; students relaxed and willing to make mistakes.',
      'Friendly; most students comfortable.',
      'Neutral; some students withdrawn.',
      'Tense or cold; students afraid to speak.'),
    (v, 7, 'Students'' experience', 'Student talking time', false,
      'Students talk much more than the teacher; everyone speaks in pairs or groups.',
      'Students talk more than the teacher; most speak.',
      'Roughly equal; mostly strong students speak.',
      'Teacher dominates; few students speak.'),
    (v, 8, 'Students'' experience', 'Checking understanding and correcting errors', false,
      'Concept-check questions used; errors corrected kindly at the right time; peer correction.',
      'Understanding usually checked; errors corrected appropriately.',
      '"Do you understand?" only; correction inconsistent.',
      'Understanding not checked; errors ignored or corrected harshly.'),
    (v, 9, 'Lesson management', 'Classroom management and pace', true,
      'Calm control without shouting; no dead time; ends on time with summary and homework.',
      'Good control; pace mostly right; ends near time.',
      'Some disorder or dead time; rushed or unfinished ending.',
      'Loses control; pace wrong; no proper ending.'),
    (v, 10, 'Lesson management', 'Edunest systems', false,
      'Attendance, diamonds and Journey used correctly and purposefully.',
      'Used correctly with minor slips.',
      'Used partly or late.',
      'Not used or used wrongly.');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Helpers (not callable from the app)
-- ---------------------------------------------------------------------

-- The creator can look at the site as another person ("View as"): the app then sends
-- the header x-view-as with that person's id. Only reading is allowed in that mode.
create or replace function public._view_as()
returns uuid language plpgsql stable as $$
begin
  return nullif(coalesce(current_setting('request.headers', true), '{}')::json->>'x-view-as', '')::uuid;
exception when others then return null;
end $$;

-- The signed-in user (or the person the creator is viewing as), checked:
-- raises NOT_AUTHENTICATED / BLOCKED / FORBIDDEN
create or replace function public._auth(p_roles text[] default null)
returns public.profiles language plpgsql stable security definer set search_path = public as $$
declare p public.profiles; v_as uuid := public._view_as();
begin
  select * into p from public.profiles where id = auth.uid();
  if not found then raise exception 'NOT_AUTHENTICATED'; end if;
  if p.status = 'blocked' then raise exception 'BLOCKED'; end if;
  if v_as is not null then
    if p.role <> 'creator' then raise exception 'FORBIDDEN'; end if;
    select * into p from public.profiles where id = v_as;
    if not found then raise exception 'USER_NOT_FOUND'; end if;
  end if;
  if p_roles is not null and not (p.role = any (p_roles)) then raise exception 'FORBIDDEN'; end if;
  return p;
end $$;

-- Same, for anything that changes data: refused while the creator is viewing as someone
create or replace function public._auth_write(p_roles text[] default null)
returns public.profiles language plpgsql security definer set search_path = public as $$
begin
  if public._view_as() is not null then raise exception 'PREVIEW_READ_ONLY'; end if;
  return public._auth(p_roles);
end $$;

create or replace function public._setting(p_key text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select value from public.app_settings where key = p_key), '');
$$;

-- Sends a Telegram message (queued through pg_net). Returns true when it was sent off.
create or replace function public._telegram(p_chat_id text, p_text text)
returns boolean language plpgsql security definer set search_path = public as $$
declare token text := public._setting('telegram_bot_token');
begin
  if coalesce(token, '') = '' or coalesce(trim(p_chat_id), '') = '' then return false; end if;
  if to_regproc('net.http_post') is null then return false; end if;
  execute 'select net.http_post(url := $1, body := $2)'
    using 'https://api.telegram.org/bot' || token || '/sendMessage',
          jsonb_build_object('chat_id', trim(p_chat_id), 'text', p_text);
  return true;
exception when others then
  return false;
end $$;

create or replace function public._tashkent(p_at timestamptz)
returns text language sql immutable as $$
  select to_char(p_at at time zone 'Asia/Tashkent', 'DD Mon YYYY, HH24:MI');
$$;

create or replace function public._open_link(p_path text)
returns text language sql stable security definer set search_path = public as $$
  select case when public._setting('app_url') = '' then ''
    else E'\nOpen: ' || rtrim(public._setting('app_url'), '/') || '/#/' || p_path end;
$$;

-- IELTS-style rounding: below .25 down, .25–.74 to .5, .75 and above up
create or replace function public._ielts_round(x numeric)
returns numeric language sql immutable as $$
  select case
    when x - floor(x + 0.000000001) < 0.25 - 0.000000001 then floor(x + 0.000000001)
    when x - floor(x + 0.000000001) < 0.75 - 0.000000001 then floor(x + 0.000000001) + 0.5
    else floor(x + 0.000000001) + 1 end;
$$;

-- ===== Edunest Lesson Standard rules =====
-- Criterion band = average of the submitted observers' bands.
-- Overall = IELTS-rounded average of the criterion bands.
-- Ready = overall ≥ 6, every must-pass criterion ≥ 6, no criterion below 4.
-- Disagreement = 3 or more bands between the highest and lowest observer.
create or replace function public._lesson_result(p_lesson_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_rows jsonb;
  v_submitted int;
  v_complete boolean;
  v_raw numeric;
  v_overall numeric;
  v_must boolean;
  v_none4 boolean;
begin
  select count(*) into v_submitted from public.observer_assignments
    where lesson_id = p_lesson_id and submitted_at is not null;

  with per as (
    select c.id, c.name, c.area, c.must_pass, c.sort_order,
      coalesce(array_agg(s.band order by s.band) filter (where s.band is not null), '{}') as bands,
      avg(s.band)::numeric as raw_avg
    from public.trial_lessons l
    join public.criteria c on c.rubric_version_id = l.rubric_version_id
    left join public.observer_assignments a on a.lesson_id = l.id and a.submitted_at is not null
    left join public.scores s on s.assignment_id = a.id and s.criterion_id = c.id
    where l.id = p_lesson_id
    group by c.id
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'criterion_id', id, 'name', name, 'area', area, 'must_pass', must_pass, 'sort_order', sort_order,
      'bands', to_jsonb(bands),
      'band_avg', case when raw_avg is null then null else round(raw_avg, 2) end,
      'disagreement', cardinality(bands) >= 2 and (bands[cardinality(bands)] - bands[1]) >= 3
    ) order by sort_order), '[]'::jsonb),
    count(*) > 0 and bool_and(raw_avg is not null),
    avg(raw_avg),
    coalesce(bool_and(raw_avg >= 6) filter (where must_pass), true),
    bool_and(raw_avg >= 4)
  into v_rows, v_complete, v_raw, v_must, v_none4
  from per;

  v_complete := coalesce(v_complete, false);
  if v_complete then v_overall := public._ielts_round(v_raw); end if;

  return jsonb_build_object(
    'criteria', v_rows,
    'overall', v_overall,
    'overall_raw', case when v_complete then round(v_raw, 3) else null end,
    'must_pass_ok', v_complete and v_must,
    'none_below_4', v_complete and coalesce(v_none4, false),
    'recommendation', case when v_complete and v_overall >= 6 and v_must and coalesce(v_none4, false) then 'ready' else 'not_ready' end,
    'submitted_count', v_submitted,
    'needed_count', public._scores_needed(p_lesson_id),
    'disagreements', coalesce((select jsonb_agg(x->>'name') from jsonb_array_elements(v_rows) x where (x->>'disagreement')::boolean), '[]'::jsonb)
  );
end $$;

-- How many submitted observers a lesson needs before the boss can decide:
-- 2, or 1 when only one teacher observes it
create or replace function public._scores_needed(p_lesson_id uuid)
returns int language sql stable security definer set search_path = public as $$
  select greatest(1, least(2, (select count(*)::int from public.observer_assignments where lesson_id = p_lesson_id)));
$$;

-- Lesson status follows the number of submitted observers (until it is decided)
create or replace function public._refresh_lesson_status(p_lesson_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.trial_lessons set status = case
      when (select count(*) from public.observer_assignments where lesson_id = p_lesson_id and submitted_at is not null) >= public._scores_needed(p_lesson_id)
      then 'awaiting_decision' else 'scheduled' end
  where id = p_lesson_id and status in ('scheduled', 'awaiting_decision');
$$;

create or replace function public._profile_json(p public.profiles)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', p.id, 'full_name', p.full_name, 'login', p.login, 'role', p.role, 'status', p.status,
    'telegram_chat_id', p.telegram_chat_id, 'stage', p.stage, 'mentor_id', p.mentor_id,
    'mentor_name', (select full_name from public.profiles m where m.id = p.mentor_id), 'created_at', p.created_at);
$$;

-- Creates the login (Supabase Auth) and the profile together
create or replace function public._create_user(p_full_name text, p_login text, p_password text, p_role text,
  p_status text, p_telegram_chat_id text, p_mentor_id uuid)
returns public.profiles language plpgsql security definer set search_path = public, extensions as $$
declare
  v_login text := lower(trim(coalesce(p_login, '')));
  v_name text := trim(coalesce(p_full_name, ''));
  v_status text := coalesce(nullif(p_status, ''), 'active');
  v_email text;
  v_id uuid := gen_random_uuid();
  v_mentor public.profiles;
  p public.profiles;
begin
  if v_login !~ '^[a-z0-9._-]{3,32}$' then raise exception 'INVALID_LOGIN'; end if;
  if v_name = '' then raise exception 'NAME_REQUIRED'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'PASSWORD_TOO_SHORT'; end if;
  if p_role is null or p_role not in ('creator', 'boss', 'teacher', 'candidate') then raise exception 'INVALID_ROLE'; end if;
  if v_status not in ('active', 'blocked') then raise exception 'INVALID_STATUS'; end if;
  v_email := v_login || '@users.edunest.local';
  if exists (select 1 from public.profiles where login = v_login) or exists (select 1 from auth.users where email = v_email) then
    raise exception 'LOGIN_TAKEN';
  end if;
  if p_role = 'candidate' and p_mentor_id is not null then
    select * into v_mentor from public.profiles where id = p_mentor_id;
    if not found or v_mentor.role <> 'teacher' or v_mentor.status <> 'active' then raise exception 'NOT_A_TEACHER'; end if;
  end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change, banned_until)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    crypt(p_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name', v_name), now(), now(),
    '', '', '', '', case when v_status = 'blocked' then '2999-12-31 00:00:00+00'::timestamptz end);

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
    'email', now(), now(), now());

  insert into public.profiles (id, full_name, login, role, status, telegram_chat_id, stage, mentor_id)
  values (v_id, v_name, v_login, p_role, v_status, nullif(trim(coalesce(p_telegram_chat_id, '')), ''),
    case when p_role = 'candidate' then 'shadowing' end,
    case when p_role = 'candidate' then p_mentor_id end)
  returning * into p;
  return p;
end $$;

-- ---------------------------------------------------------------------
-- Everyone
-- ---------------------------------------------------------------------

create or replace function public.me()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  return public._profile_json(public._auth());
end $$;

-- ---------------------------------------------------------------------
-- Creator: accounts
-- ---------------------------------------------------------------------

create or replace function public.creator_list_users()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public._auth(array['creator']);
  return coalesce((select jsonb_agg(public._profile_json(p) order by p.created_at desc) from public.profiles p), '[]'::jsonb);
end $$;

create or replace function public.creator_create_user(p_full_name text, p_login text, p_password text, p_role text,
  p_status text default 'active', p_telegram_chat_id text default '', p_mentor_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public._auth_write(array['creator']);
  return public._profile_json(public._create_user(p_full_name, p_login, p_password, p_role, p_status, p_telegram_chat_id, p_mentor_id));
end $$;

create or replace function public.creator_update_user(p_user_id uuid, p_full_name text, p_login text, p_role text,
  p_status text, p_telegram_chat_id text default '', p_mentor_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := public._auth_write(array['creator']);
  t public.profiles;
  v_login text := lower(trim(coalesce(p_login, '')));
  v_name text := trim(coalesce(p_full_name, ''));
  v_mentor public.profiles;
begin
  select * into t from public.profiles where id = p_user_id;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  if v_login !~ '^[a-z0-9._-]{3,32}$' then raise exception 'INVALID_LOGIN'; end if;
  if v_name = '' then raise exception 'NAME_REQUIRED'; end if;
  if p_role not in ('creator', 'boss', 'teacher', 'candidate') then raise exception 'INVALID_ROLE'; end if;
  if p_status not in ('active', 'blocked') then raise exception 'INVALID_STATUS'; end if;
  if exists (select 1 from public.profiles where login = v_login and id <> t.id) then raise exception 'LOGIN_TAKEN'; end if;
  if t.id = me.id and p_role <> 'creator' then raise exception 'CANNOT_CHANGE_OWN_ROLE'; end if;
  if t.id = me.id and p_status = 'blocked' then raise exception 'CANNOT_BLOCK_SELF'; end if;
  if p_role = 'candidate' and p_mentor_id is not null then
    select * into v_mentor from public.profiles where id = p_mentor_id;
    if not found or v_mentor.role <> 'teacher' or v_mentor.status <> 'active' then raise exception 'NOT_A_TEACHER'; end if;
  end if;

  update public.profiles set
    full_name = v_name, login = v_login, role = p_role, status = p_status,
    telegram_chat_id = nullif(trim(coalesce(p_telegram_chat_id, '')), ''),
    mentor_id = case when p_role = 'candidate' then p_mentor_id end,
    stage = case when p_role <> 'candidate' then null when t.role = 'candidate' then t.stage else 'shadowing' end
  where id = t.id returning * into t;

  update auth.users set email = v_login || '@users.edunest.local',
    banned_until = case when p_status = 'blocked' then '2999-12-31 00:00:00+00'::timestamptz end,
    raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('full_name', v_name),
    updated_at = now()
  where id = t.id;
  update auth.identities set identity_data = identity_data || jsonb_build_object('email', v_login || '@users.edunest.local')
  where user_id = t.id and provider = 'email';
  return public._profile_json(t);
end $$;

create or replace function public.creator_reset_password(p_user_id uuid, p_password text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public._auth_write(array['creator']);
  if length(coalesce(p_password, '')) < 8 then raise exception 'PASSWORD_TOO_SHORT'; end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now() where id = p_user_id;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
-- Boss: people, candidates
-- ---------------------------------------------------------------------

create or replace function public.boss_list_people(p_role text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public._auth(array['boss']);
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'login', p.login,
      'telegram_linked', coalesce(p.telegram_chat_id, '') <> '', 'stage', p.stage, 'mentor_id', p.mentor_id)
      order by lower(p.full_name))
    from public.profiles p where p.role = p_role and p.status = 'active'), '[]'::jsonb);
end $$;

create or replace function public.boss_list_candidates()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public._auth(array['boss']);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'name', p.full_name, 'login', p.login, 'status', p.status, 'stage', p.stage,
      'mentor_id', p.mentor_id, 'mentor_name', m.full_name, 'created_at', p.created_at,
      'lessons', (select count(*) from public.trial_lessons l where l.candidate_id = p.id),
      'journal_count', (select count(*) from public.journal_entries j where j.candidate_id = p.id),
      'last_lesson', (select jsonb_build_object('scheduled_at', l.scheduled_at, 'type', l.type, 'status', l.status,
          'overall_band', d.overall_band)
        from public.trial_lessons l left join public.decisions d on d.lesson_id = l.id
        where l.candidate_id = p.id order by l.scheduled_at desc limit 1)
    ) order by lower(p.full_name))
    from public.profiles p left join public.profiles m on m.id = p.mentor_id
    where p.role = 'candidate'), '[]'::jsonb);
end $$;

create or replace function public.boss_list_lessons(p_candidate_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public._auth(array['boss']);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', l.id, 'type', l.type, 'scheduled_at', l.scheduled_at, 'group_name', l.group_name, 'topic', l.topic,
      'status', l.status, 'candidate_id', l.candidate_id, 'candidate_name', u.full_name,
      'observers_total', (select count(*) from public.observer_assignments a where a.lesson_id = l.id),
      'observers_submitted', (select count(*) from public.observer_assignments a where a.lesson_id = l.id and a.submitted_at is not null),
      'has_disagreement', exists (select 1 from public.observer_assignments a join public.scores s on s.assignment_id = a.id
          where a.lesson_id = l.id and a.submitted_at is not null group by s.criterion_id having max(s.band) - min(s.band) >= 3),
      'decision', case when d.id is null then null else jsonb_build_object('outcome', d.outcome, 'overall_band', d.overall_band, 'decided_at', d.created_at) end
    ) order by l.scheduled_at desc)
    from public.trial_lessons l
    join public.profiles u on u.id = l.candidate_id
    left join public.decisions d on d.lesson_id = l.id
    where p_candidate_id is null or l.candidate_id = p_candidate_id), '[]'::jsonb);
end $$;

create or replace function public.boss_get_candidate(p_candidate_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare c public.profiles;
begin
  perform public._auth(array['boss']);
  select * into c from public.profiles where id = p_candidate_id and role = 'candidate';
  if not found then raise exception 'CANDIDATE_NOT_FOUND'; end if;
  return jsonb_build_object(
    'candidate', public._profile_json(c),
    'lessons', public.boss_list_lessons(p_candidate_id),
    'journal', coalesce((select jsonb_agg(to_jsonb(j) order by j.lesson_date desc, j.created_at desc)
      from public.journal_entries j where j.candidate_id = c.id), '[]'::jsonb),
    'quiz', coalesce((select jsonb_agg(jsonb_build_object('score', q.score, 'total', q.total, 'created_at', q.created_at) order by q.created_at desc)
      from public.quiz_attempts q where q.candidate_id = c.id), '[]'::jsonb));
end $$;

create or replace function public.boss_set_stage(p_candidate_id uuid, p_stage text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.profiles;
begin
  perform public._auth_write(array['boss']);
  if p_stage not in ('shadowing', 'micro_teaching', 'full_trial', 'decision', 'probation', 'certified', 'declined') then
    raise exception 'INVALID_STAGE'; end if;
  update public.profiles set stage = p_stage where id = p_candidate_id and role = 'candidate' returning * into c;
  if not found then raise exception 'NOT_A_CANDIDATE'; end if;
  return public._profile_json(c);
end $$;

create or replace function public.boss_set_mentor(p_candidate_id uuid, p_mentor_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.profiles; m public.profiles;
begin
  perform public._auth_write(array['boss']);
  if p_mentor_id is not null then
    select * into m from public.profiles where id = p_mentor_id;
    if not found or m.role <> 'teacher' or m.status <> 'active' then raise exception 'NOT_A_TEACHER'; end if;
  end if;
  update public.profiles set mentor_id = p_mentor_id where id = p_candidate_id and role = 'candidate' returning * into c;
  if not found then raise exception 'NOT_A_CANDIDATE'; end if;
  return public._profile_json(c);
end $$;

-- ---------------------------------------------------------------------
-- Boss: trial lessons
-- ---------------------------------------------------------------------

create or replace function public.boss_schedule_lesson(p_candidate_id uuid, p_type text, p_scheduled_at text,
  p_group_name text default '', p_topic text default '', p_observer_ids uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_version uuid;
  v_when timestamptz;
  c public.profiles;
  o public.profiles;
  v_ids uuid[];
  v_lesson uuid;
  v_assignment uuid;
  v_text text;
  v_failed uuid[] := '{}';
  v_sent boolean;
begin
  perform public._auth_write(array['boss']);
  select id into v_version from public.rubric_versions where is_active limit 1;
  if v_version is null then raise exception 'NO_ACTIVE_STANDARD'; end if;
  if p_type not in ('micro', 'full') then raise exception 'INVALID_TYPE'; end if;
  begin v_when := p_scheduled_at::timestamptz;
  exception when others then raise exception 'INVALID_DATE'; end;
  if v_when is null then raise exception 'INVALID_DATE'; end if;
  select * into c from public.profiles where id = p_candidate_id;
  if not found or c.role <> 'candidate' then raise exception 'NOT_A_CANDIDATE'; end if;
  select array_agg(distinct x) into v_ids from unnest(coalesce(p_observer_ids, '{}')) x where x is not null;
  if coalesce(cardinality(v_ids), 0) < 1 or cardinality(v_ids) > 3 then raise exception 'OBSERVERS_COUNT'; end if;
  if exists (select 1 from unnest(v_ids) x left join public.profiles p on p.id = x
             where p.id is null or p.role <> 'teacher' or p.status <> 'active') then raise exception 'NOT_A_TEACHER'; end if;
  if c.mentor_id is not null and c.mentor_id = any (v_ids) then raise exception 'MENTOR_AS_OBSERVER'; end if;

  insert into public.trial_lessons (candidate_id, type, scheduled_at, group_name, topic, rubric_version_id)
  values (c.id, p_type, v_when, nullif(trim(coalesce(p_group_name, '')), ''), nullif(trim(coalesce(p_topic, '')), ''), v_version)
  returning id into v_lesson;

  v_text := 'New trial lesson to observe: ' || c.full_name || ' — ' ||
    case when p_type = 'full' then 'full trial lesson' else 'micro-teaching' end || ', ' || public._tashkent(v_when) ||
    coalesce(', group ' || nullif(trim(coalesce(p_group_name, '')), ''), '') || '.' || public._open_link('teacher');

  for o in select p.* from public.profiles p where p.id = any (v_ids) loop
    v_sent := public._telegram(o.telegram_chat_id, v_text);
    insert into public.observer_assignments (lesson_id, observer_id, telegram_sent) values (v_lesson, o.id, v_sent);
    if not v_sent then v_failed := v_failed || o.id; end if;
  end loop;
  return jsonb_build_object('lesson_id', v_lesson, 'telegram_failed', to_jsonb(v_failed));
end $$;

create or replace function public.boss_add_observer(p_lesson_id uuid, p_observer_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l public.trial_lessons; t public.profiles; c public.profiles; v_sent boolean; v_id uuid;
begin
  perform public._auth_write(array['boss']);
  select * into l from public.trial_lessons where id = p_lesson_id;
  if not found then raise exception 'LESSON_NOT_FOUND'; end if;
  if l.status in ('approved', 'declined') then raise exception 'ALREADY_DECIDED'; end if;
  if l.status = 'cancelled' then raise exception 'LESSON_CANCELLED'; end if;
  select * into t from public.profiles where id = p_observer_id;
  if not found or t.role <> 'teacher' or t.status <> 'active' then raise exception 'NOT_A_TEACHER'; end if;
  select * into c from public.profiles where id = l.candidate_id;
  if c.mentor_id = t.id then raise exception 'MENTOR_AS_OBSERVER'; end if;
  if exists (select 1 from public.observer_assignments where lesson_id = l.id and observer_id = t.id) then raise exception 'ALREADY_OBSERVER'; end if;
  v_sent := public._telegram(t.telegram_chat_id, 'You were added as an observer: ' || c.full_name || ' — ' ||
    case when l.type = 'full' then 'full trial lesson' else 'micro-teaching' end || ', ' || public._tashkent(l.scheduled_at) ||
    coalesce(', group ' || l.group_name, '') || '.' || public._open_link('teacher'));
  insert into public.observer_assignments (lesson_id, observer_id, telegram_sent) values (l.id, t.id, v_sent) returning id into v_id;
  return jsonb_build_object('assignment_id', v_id, 'telegram_sent', v_sent);
end $$;

create or replace function public.boss_reopen_score(p_assignment_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.observer_assignments; v_status text;
begin
  perform public._auth_write(array['boss']);
  select * into a from public.observer_assignments where id = p_assignment_id;
  if not found then raise exception 'ASSIGNMENT_NOT_FOUND'; end if;
  select status into v_status from public.trial_lessons where id = a.lesson_id;
  if v_status in ('approved', 'declined') then raise exception 'ALREADY_DECIDED'; end if;
  update public.observer_assignments set submitted_at = null where id = a.id;
  perform public._refresh_lesson_status(a.lesson_id);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.boss_get_lesson(p_lesson_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare l public.trial_lessons; c public.profiles;
begin
  perform public._auth(array['boss']);
  select * into l from public.trial_lessons where id = p_lesson_id;
  if not found then raise exception 'LESSON_NOT_FOUND'; end if;
  select * into c from public.profiles where id = l.candidate_id;
  return jsonb_build_object(
    'lesson', to_jsonb(l),
    'candidate', public._profile_json(c),
    'observers', coalesce((select jsonb_agg(jsonb_build_object(
        'assignment_id', a.id, 'observer_id', a.observer_id, 'name', p.full_name, 'login', p.login,
        'submitted', a.submitted_at is not null, 'submitted_at', a.submitted_at,
        'overall_comment', case when a.submitted_at is not null then a.overall_comment end,
        'telegram_sent', a.telegram_sent,
        'scores', case when a.submitted_at is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object(
            'criterion_id', s.criterion_id, 'band', s.band, 'comment', s.comment)) from public.scores s where s.assignment_id = a.id), '[]'::jsonb) end
      ) order by a.created_at)
      from public.observer_assignments a join public.profiles p on p.id = a.observer_id where a.lesson_id = l.id), '[]'::jsonb),
    'result', public._lesson_result(l.id),
    'student_feedback', public._feedback_summary(l.id),
    'decision', (select jsonb_build_object('outcome', d.outcome, 'recommended', d.recommended, 'overall_band', d.overall_band,
        'note', d.note, 'created_at', d.created_at, 'boss_name', b.full_name)
      from public.decisions d left join public.profiles b on b.id = d.boss_id where d.lesson_id = l.id)
  );
end $$;

create or replace function public.boss_decide(p_lesson_id uuid, p_outcome text, p_note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := public._auth_write(array['boss']);
  l public.trial_lessons;
  r jsonb;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_override boolean;
begin
  select * into l from public.trial_lessons where id = p_lesson_id for update;
  if not found then raise exception 'LESSON_NOT_FOUND'; end if;
  if l.status in ('approved', 'declined') or exists (select 1 from public.decisions where lesson_id = l.id) then
    raise exception 'ALREADY_DECIDED'; end if;
  if l.status = 'cancelled' then raise exception 'LESSON_CANCELLED'; end if;
  if p_outcome not in ('approved', 'declined') then raise exception 'INVALID_OUTCOME'; end if;
  r := public._lesson_result(l.id);
  if (r->>'submitted_count')::int < public._scores_needed(l.id) or r->'overall' = 'null'::jsonb then raise exception 'NOT_ENOUGH_SCORES'; end if;
  v_override := (p_outcome = 'approved' and r->>'recommendation' <> 'ready') or (p_outcome = 'declined' and r->>'recommendation' = 'ready');
  if v_override and v_note is null then raise exception 'NOTE_REQUIRED'; end if;

  insert into public.decisions (lesson_id, boss_id, outcome, recommended, overall_band, note)
  values (l.id, me.id, p_outcome, r->>'recommendation', (r->>'overall')::numeric, v_note);
  update public.trial_lessons set status = p_outcome where id = l.id;
  -- Approving a full trial lesson puts the candidate on probation
  if p_outcome = 'approved' and l.type = 'full' then
    update public.profiles set stage = 'probation' where id = l.candidate_id;
  end if;
  return jsonb_build_object('outcome', p_outcome, 'recommended', r->>'recommendation', 'overall_band', (r->>'overall')::numeric,
    'to_probation', p_outcome = 'approved' and l.type = 'full');
end $$;

create or replace function public.boss_send_reminders()
returns jsonb language plpgsql security definer set search_path = public as $$
declare rec record; v_out jsonb := '[]'::jsonb; v_sent boolean;
begin
  perform public._auth_write(array['boss']);
  for rec in
    select a.id as assignment_id, l.id as lesson_id, o.full_name as observer_name, o.telegram_chat_id,
      l.scheduled_at, c.full_name as candidate_name
    from public.observer_assignments a
    join public.trial_lessons l on l.id = a.lesson_id
    join public.profiles o on o.id = a.observer_id
    join public.profiles c on c.id = l.candidate_id
    where a.submitted_at is null and l.status in ('scheduled', 'awaiting_decision')
      and l.scheduled_at < now() - interval '24 hours' and o.status = 'active'
    order by l.scheduled_at
  loop
    v_sent := public._telegram(rec.telegram_chat_id, 'Reminder: please submit your scores for ' || rec.candidate_name ||
      '''s lesson on ' || public._tashkent(rec.scheduled_at) || '.' || public._open_link('teacher'));
    v_out := v_out || jsonb_build_object('assignment_id', rec.assignment_id, 'lesson_id', rec.lesson_id,
      'observer_name', rec.observer_name, 'candidate_name', rec.candidate_name, 'scheduled_at', rec.scheduled_at, 'sent', v_sent);
  end loop;
  return jsonb_build_object('overdue', v_out, 'telegram_configured', public._setting('telegram_bot_token') <> '');
end $$;

create or replace function public.boss_dashboard()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public._auth(array['boss']);
  return jsonb_build_object(
    'stages', coalesce((select jsonb_object_agg(stage, n) from (select stage, count(*) n from public.profiles
        where role = 'candidate' and status = 'active' group by stage) s), '{}'::jsonb),
    'candidates', (select count(*) from public.profiles where role = 'candidate' and status = 'active'),
    'teachers', (select count(*) from public.profiles where role = 'teacher' and status = 'active'),
    'awaiting', coalesce((select jsonb_agg(x) from (
        select l.id, l.type, l.scheduled_at, l.group_name, l.topic, l.status, u.full_name as candidate_name,
          (select count(*) from public.observer_assignments a where a.lesson_id = l.id) as observers_total,
          (select count(*) from public.observer_assignments a where a.lesson_id = l.id and a.submitted_at is not null) as observers_submitted
        from public.trial_lessons l join public.profiles u on u.id = l.candidate_id
        where l.status = 'awaiting_decision' order by l.scheduled_at) x), '[]'::jsonb),
    'upcoming', coalesce((select jsonb_agg(x) from (
        select l.id, l.type, l.scheduled_at, l.group_name, l.topic, l.status, u.full_name as candidate_name,
          (select count(*) from public.observer_assignments a where a.lesson_id = l.id) as observers_total,
          (select count(*) from public.observer_assignments a where a.lesson_id = l.id and a.submitted_at is not null) as observers_submitted
        from public.trial_lessons l join public.profiles u on u.id = l.candidate_id
        where l.status = 'scheduled' order by l.scheduled_at limit 8) x), '[]'::jsonb),
    'overdue', (select count(*) from public.observer_assignments a join public.trial_lessons l on l.id = a.lesson_id
        where a.submitted_at is null and l.status in ('scheduled', 'awaiting_decision') and l.scheduled_at < now() - interval '24 hours'),
    'telegram_configured', public._setting('telegram_bot_token') <> ''
  );
end $$;

-- ---------------------------------------------------------------------
-- Boss: lesson standard (versioned)
-- ---------------------------------------------------------------------

create or replace function public._criteria_json(p_version uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(c) order by c.sort_order), '[]'::jsonb) from public.criteria c where c.rubric_version_id = p_version;
$$;

create or replace function public.boss_get_standard()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a public.rubric_versions; d public.rubric_versions;
begin
  perform public._auth(array['boss']);
  select * into a from public.rubric_versions where is_active limit 1;
  select * into d from public.rubric_versions where not is_active and version_no > coalesce(a.version_no, 0) order by version_no desc limit 1;
  return jsonb_build_object(
    'active', case when a.id is null then null else jsonb_build_object('id', a.id, 'version_no', a.version_no, 'criteria', public._criteria_json(a.id)) end,
    'draft', case when d.id is null then null else jsonb_build_object('id', d.id, 'version_no', d.version_no, 'criteria', public._criteria_json(d.id)) end,
    'versions', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'version_no', version_no, 'is_active', is_active, 'created_at', created_at)
      order by version_no desc) from public.rubric_versions), '[]'::jsonb));
end $$;

create or replace function public.boss_save_draft_criteria(p_criteria jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.rubric_versions; v_draft uuid; v_no int; x jsonb; i int := 0; v_orders int[] := '{}'; v_order int;
begin
  perform public._auth_write(array['boss']);
  if jsonb_typeof(p_criteria) <> 'array' or jsonb_array_length(p_criteria) = 0 or jsonb_array_length(p_criteria) > 20 then
    raise exception 'NO_CRITERIA'; end if;
  for x in select * from jsonb_array_elements(p_criteria) loop
    i := i + 1;
    if trim(coalesce(x->>'name', '')) = '' then raise exception 'NAME_REQUIRED'; end if;
    if trim(coalesce(x->>'area', '')) = '' then raise exception 'AREA_REQUIRED'; end if;
    v_order := coalesce((x->>'sort_order')::int, i);
    if v_order = any (v_orders) then raise exception 'DUPLICATE_ORDER'; end if;
    v_orders := v_orders || v_order;
  end loop;
  select * into a from public.rubric_versions where is_active limit 1;
  select id, version_no into v_draft, v_no from public.rubric_versions
    where not is_active and version_no > coalesce(a.version_no, 0) order by version_no desc limit 1;
  if v_draft is null then
    insert into public.rubric_versions (version_no, is_active)
    values ((select coalesce(max(version_no), 0) + 1 from public.rubric_versions), false) returning id, version_no into v_draft, v_no;
  end if;
  delete from public.criteria where rubric_version_id = v_draft;
  i := 0;
  for x in select * from jsonb_array_elements(p_criteria) loop
    i := i + 1;
    insert into public.criteria (rubric_version_id, sort_order, area, name, must_pass, desc_9, desc_7, desc_5, desc_3)
    values (v_draft, coalesce((x->>'sort_order')::int, i), trim(x->>'area'), trim(x->>'name'), coalesce((x->>'must_pass')::boolean, false),
      nullif(trim(coalesce(x->>'desc_9', '')), ''), nullif(trim(coalesce(x->>'desc_7', '')), ''),
      nullif(trim(coalesce(x->>'desc_5', '')), ''), nullif(trim(coalesce(x->>'desc_3', '')), ''));
  end loop;
  return jsonb_build_object('draft_id', v_draft, 'version_no', v_no, 'criteria_count', i);
end $$;

create or replace function public.boss_publish_rubric()
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.rubric_versions; d public.rubric_versions;
begin
  perform public._auth_write(array['boss']);
  select * into a from public.rubric_versions where is_active limit 1;
  select * into d from public.rubric_versions where not is_active and version_no > coalesce(a.version_no, 0) order by version_no desc limit 1;
  if d.id is null then raise exception 'NO_DRAFT'; end if;
  if not exists (select 1 from public.criteria where rubric_version_id = d.id) then raise exception 'DRAFT_EMPTY'; end if;
  update public.rubric_versions set is_active = false where is_active;
  update public.rubric_versions set is_active = true where id = d.id;
  return jsonb_build_object('version_no', d.version_no, 'version_id', d.id);
end $$;

-- ---------------------------------------------------------------------
-- Materials (files live in the public "materials" storage bucket)
-- ---------------------------------------------------------------------

create or replace function public.materials_list(p_type text default '', p_level text default '')
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public._auth();
  return coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at desc) from public.materials m
    where (coalesce(p_type, '') = '' or m.type = p_type) and (coalesce(p_level, '') = '' or m.level = p_level)), '[]'::jsonb);
end $$;

create or replace function public.boss_save_material(p_id uuid, p_title text, p_description text, p_type text, p_level text,
  p_link_url text, p_file_path text default null, p_file_name text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cur public.materials; m public.materials; v_link text := nullif(trim(coalesce(p_link_url, '')), '');
  v_level text := nullif(trim(coalesce(p_level, '')), ''); v_file text := nullif(trim(coalesce(p_file_path, '')), '');
begin
  perform public._auth_write(array['boss']);
  if p_id is not null then
    select * into cur from public.materials where id = p_id;
    if not found then raise exception 'MATERIAL_NOT_FOUND'; end if;
  end if;
  if trim(coalesce(p_title, '')) = '' then raise exception 'TITLE_REQUIRED'; end if;
  if p_type not in ('slides', 'exercises', 'pairwork_games') then raise exception 'INVALID_TYPE'; end if;
  if v_level is not null and v_level not in ('Beginner', 'Elementary', 'Pre-Intermediate', 'Intermediate', 'Upper-Intermediate', 'Advanced') then
    raise exception 'INVALID_LEVEL'; end if;
  if v_file is null and v_link is null and cur.file_path is null then raise exception 'FILE_OR_LINK_REQUIRED'; end if;
  if p_id is null then
    insert into public.materials (title, description, type, level, link_url, file_path, file_name)
    values (trim(p_title), nullif(trim(coalesce(p_description, '')), ''), p_type, v_level, v_link, v_file, nullif(p_file_name, ''))
    returning * into m;
  else
    update public.materials set title = trim(p_title), description = nullif(trim(coalesce(p_description, '')), ''), type = p_type,
      level = v_level, link_url = v_link, file_path = coalesce(v_file, cur.file_path),
      file_name = case when v_file is not null then nullif(p_file_name, '') else cur.file_name end
    where id = p_id returning * into m;
  end if;
  return to_jsonb(m) || jsonb_build_object('replaced_file', case when v_file is not null and cur.file_path is not null then cur.file_path end);
end $$;

create or replace function public.boss_delete_material(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m public.materials;
begin
  perform public._auth_write(array['boss']);
  delete from public.materials where id = p_id returning * into m;
  if not found then raise exception 'MATERIAL_NOT_FOUND'; end if;
  return jsonb_build_object('ok', true, 'file_path', m.file_path);
end $$;

-- ---------------------------------------------------------------------
-- Calibration
-- ---------------------------------------------------------------------

create or replace function public.boss_save_calibration_lesson(p_id uuid, p_title text, p_video_url text,
  p_reference_bands jsonb, p_is_active boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_version uuid; c record; v_bands jsonb := '{}'::jsonb; v_b int; x public.calibration_lessons;
begin
  perform public._auth_write(array['boss']);
  if p_id is not null and not exists (select 1 from public.calibration_lessons where id = p_id) then raise exception 'NOT_FOUND'; end if;
  if trim(coalesce(p_title, '')) = '' then raise exception 'TITLE_REQUIRED'; end if;
  if trim(coalesce(p_video_url, '')) = '' then raise exception 'VIDEO_REQUIRED'; end if;
  select id into v_version from public.rubric_versions where is_active limit 1;
  if v_version is null then raise exception 'NO_ACTIVE_STANDARD'; end if;
  for c in select id from public.criteria where rubric_version_id = v_version loop
    if p_reference_bands->>(c.id::text) is null or p_reference_bands->>(c.id::text) = '' then raise exception 'REFERENCE_INCOMPLETE'; end if;
    begin v_b := (p_reference_bands->>(c.id::text))::int; exception when others then raise exception 'INVALID_BAND'; end;
    if v_b < 1 or v_b > 9 then raise exception 'INVALID_BAND'; end if;
    v_bands := v_bands || jsonb_build_object(c.id::text, v_b);
  end loop;
  if p_id is null then
    insert into public.calibration_lessons (title, video_url, rubric_version_id, reference_bands, is_active)
    values (trim(p_title), trim(p_video_url), v_version, v_bands, coalesce(p_is_active, true)) returning * into x;
  else
    update public.calibration_lessons set title = trim(p_title), video_url = trim(p_video_url), rubric_version_id = v_version,
      reference_bands = v_bands, is_active = coalesce(p_is_active, true) where id = p_id returning * into x;
  end if;
  return jsonb_build_object('id', x.id, 'title', x.title, 'is_active', x.is_active);
end $$;

create or replace function public.calibration_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me public.profiles := public._auth(array['boss', 'teacher']);
begin
  if me.role = 'boss' then
    return jsonb_build_object(
      'lessons', coalesce((select jsonb_agg(to_jsonb(l) || jsonb_build_object('criteria', public._criteria_json(l.rubric_version_id),
          'attempts', (select count(*) from public.calibration_attempts a where a.calibration_lesson_id = l.id))
        order by l.created_at desc) from public.calibration_lessons l), '[]'::jsonb),
      'teachers', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.full_name, 'status', t.status,
          'attempts', (select count(*) from public.calibration_attempts a where a.teacher_id = t.id),
          'latest_accuracy', la.accuracy, 'latest_lesson', la.title, 'latest_at', la.created_at) order by lower(t.full_name))
        from public.profiles t
        left join lateral (select a.accuracy, a.created_at, l.title from public.calibration_attempts a
          join public.calibration_lessons l on l.id = a.calibration_lesson_id
          where a.teacher_id = t.id order by a.created_at desc limit 1) la on true
        where t.role = 'teacher'), '[]'::jsonb));
  end if;
  -- Teacher: active lessons; the team's bands stay hidden until the teacher has sent their own
  return jsonb_build_object('lessons', coalesce((select jsonb_agg(jsonb_build_object(
      'id', l.id, 'title', l.title, 'video_url', l.video_url, 'criteria', public._criteria_json(l.rubric_version_id),
      'my_latest', case when la.id is null then null else jsonb_build_object('accuracy', la.accuracy, 'bands', la.bands, 'at', la.created_at) end,
      'reference_bands', case when la.id is null then null else l.reference_bands end) order by l.created_at desc)
    from public.calibration_lessons l
    left join lateral (select * from public.calibration_attempts a where a.calibration_lesson_id = l.id and a.teacher_id = me.id
      order by a.created_at desc limit 1) la on true
    where l.is_active), '[]'::jsonb));
end $$;

create or replace function public.teacher_submit_calibration(p_calibration_lesson_id uuid, p_bands jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._auth_write(array['teacher']); l public.calibration_lessons; k text; v_b int;
  v_total numeric := 0; v_n int := 0; v_bands jsonb := '{}'::jsonb; v_acc int;
begin
  select * into l from public.calibration_lessons where id = p_calibration_lesson_id and is_active;
  if not found then raise exception 'NOT_FOUND'; end if;
  for k in select jsonb_object_keys(l.reference_bands) loop
    if p_bands->>k is null or p_bands->>k = '' then raise exception 'INCOMPLETE_SCORES'; end if;
    begin v_b := (p_bands->>k)::int; exception when others then raise exception 'INVALID_BAND'; end;
    if v_b < 1 or v_b > 9 then raise exception 'INVALID_BAND'; end if;
    v_bands := v_bands || jsonb_build_object(k, v_b);
    v_total := v_total + abs(v_b - (l.reference_bands->>k)::int);
    v_n := v_n + 1;
  end loop;
  -- 0 bands away on average = 100%, 8 bands away (the biggest gap) = 0%
  v_acc := round(100 - (v_total / greatest(v_n, 1)) / 8 * 100);
  insert into public.calibration_attempts (calibration_lesson_id, teacher_id, bands, accuracy) values (l.id, me.id, v_bands, v_acc);
  return jsonb_build_object('accuracy', v_acc, 'reference_bands', l.reference_bands, 'my_bands', v_bands);
end $$;

-- ---------------------------------------------------------------------
-- Teacher
-- ---------------------------------------------------------------------

create or replace function public.teacher_my_work()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me public.profiles := public._auth(array['teacher']);
begin
  return jsonb_build_object(
    'assignments', coalesce((select jsonb_agg(jsonb_build_object(
        'assignment_id', a.id, 'submitted', a.submitted_at is not null, 'submitted_at', a.submitted_at,
        'lesson_id', l.id, 'type', l.type, 'scheduled_at', l.scheduled_at, 'group_name', l.group_name, 'topic', l.topic,
        'status', l.status, 'candidate_name', c.full_name, 'decided', l.status in ('approved', 'declined'))
        order by l.scheduled_at desc)
      from public.observer_assignments a join public.trial_lessons l on l.id = a.lesson_id join public.profiles c on c.id = l.candidate_id
      where a.observer_id = me.id and l.status <> 'cancelled'), '[]'::jsonb),
    'mentees', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'login', p.login, 'stage', p.stage,
        'journal_count', (select count(*) from public.journal_entries j where j.candidate_id = p.id)) order by lower(p.full_name))
      from public.profiles p where p.mentor_id = me.id and p.status = 'active'), '[]'::jsonb));
end $$;

create or replace function public.teacher_get_scoring_form(p_assignment_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me public.profiles := public._auth(array['teacher']); a public.observer_assignments; l public.trial_lessons;
begin
  select * into a from public.observer_assignments where id = p_assignment_id and observer_id = me.id;
  if not found then raise exception 'NOT_YOUR_ASSIGNMENT'; end if;
  select * into l from public.trial_lessons where id = a.lesson_id;
  return jsonb_build_object(
    'assignment_id', a.id, 'submitted', a.submitted_at is not null, 'submitted_at', a.submitted_at,
    'overall_comment', a.overall_comment,
    'locked', a.submitted_at is not null or l.status in ('approved', 'declined', 'cancelled'),
    'lesson', jsonb_build_object('id', l.id, 'type', l.type, 'scheduled_at', l.scheduled_at, 'group_name', l.group_name, 'topic', l.topic, 'status', l.status),
    'candidate_name', (select full_name from public.profiles where id = l.candidate_id),
    'criteria', public._criteria_json(l.rubric_version_id),
    'my_scores', coalesce((select jsonb_agg(jsonb_build_object('criterion_id', s.criterion_id, 'band', s.band, 'comment', s.comment))
      from public.scores s where s.assignment_id = a.id), '[]'::jsonb));
end $$;

create or replace function public.teacher_submit_scores(p_assignment_id uuid, p_scores jsonb, p_overall_comment text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._auth_write(array['teacher']); a public.observer_assignments; l public.trial_lessons;
  x jsonb; v_b int; v_needed uuid[]; v_sent uuid[] := '{}'; v_count int;
begin
  select * into a from public.observer_assignments where id = p_assignment_id for update;
  if not found or a.observer_id <> me.id then raise exception 'NOT_YOUR_ASSIGNMENT'; end if;
  if a.submitted_at is not null then raise exception 'ALREADY_SUBMITTED'; end if;
  select * into l from public.trial_lessons where id = a.lesson_id;
  if l.status in ('approved', 'declined') then raise exception 'ALREADY_DECIDED'; end if;
  if l.status = 'cancelled' then raise exception 'LESSON_CANCELLED'; end if;
  if jsonb_typeof(p_scores) <> 'array' then raise exception 'INCOMPLETE_SCORES'; end if;
  for x in select * from jsonb_array_elements(p_scores) loop
    begin v_b := (x->>'band')::int; exception when others then raise exception 'INVALID_BAND'; end;
    if v_b is null or v_b < 1 or v_b > 9 or (x->>'band')::numeric <> v_b then raise exception 'INVALID_BAND'; end if;
    v_sent := v_sent || (x->>'criterion_id')::uuid;
  end loop;
  select array_agg(id) into v_needed from public.criteria where rubric_version_id = l.rubric_version_id;
  if cardinality(v_sent) <> cardinality(v_needed)
     or (select count(distinct s) from unnest(v_sent) s) <> cardinality(v_needed)
     or not (v_sent @> v_needed) then raise exception 'INCOMPLETE_SCORES'; end if;

  delete from public.scores where assignment_id = a.id;
  insert into public.scores (assignment_id, criterion_id, band, comment)
  select a.id, (e->>'criterion_id')::uuid, (e->>'band')::int, nullif(trim(coalesce(e->>'comment', '')), '')
  from jsonb_array_elements(p_scores) e;
  update public.observer_assignments set submitted_at = now(), overall_comment = nullif(trim(coalesce(p_overall_comment, '')), '')
  where id = a.id;
  perform public._refresh_lesson_status(l.id);
  select count(*) into v_count from public.observer_assignments where lesson_id = l.id and submitted_at is not null;
  return jsonb_build_object('ok', true, 'submitted_count', v_count);
end $$;

-- ---------------------------------------------------------------------
-- Candidate and journal
-- ---------------------------------------------------------------------

create or replace function public.candidate_my_results()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me public.profiles := public._auth(array['candidate']);
begin
  return jsonb_build_object('name', me.full_name, 'stage', me.stage, 'lessons', coalesce((select jsonb_agg(
    jsonb_build_object('lesson_id', l.id, 'type', l.type, 'scheduled_at', l.scheduled_at, 'group_name', l.group_name, 'topic', l.topic,
      'status', case d.outcome when 'approved' then 'Approved' when 'declined' then 'Declined' else 'Waiting' end)
    -- Bands, comments and the boss's note only after the decision; never who wrote what
    || case when d.id is null then '{}'::jsonb else jsonb_build_object(
      'overall', d.overall_band, 'boss_note', d.note, 'decided_at', d.created_at,
      'student_feedback', public._feedback_summary(l.id),
      'criteria', (select coalesce(jsonb_agg(jsonb_build_object('name', c.name, 'area', c.area,
          'band', (select round(avg(s.band)::numeric, 1) from public.scores s join public.observer_assignments a on a.id = s.assignment_id
                   where a.lesson_id = l.id and a.submitted_at is not null and s.criterion_id = c.id)) order by c.sort_order), '[]'::jsonb)
        from public.criteria c where c.rubric_version_id = l.rubric_version_id),
      'comments', coalesce((select jsonb_agg(x) from (
          select jsonb_build_object('criterion', null, 'comment', a.overall_comment) x from public.observer_assignments a
            where a.lesson_id = l.id and a.submitted_at is not null and a.overall_comment is not null
          union all
          select jsonb_build_object('criterion', c.name, 'comment', s.comment) from public.scores s
            join public.observer_assignments a on a.id = s.assignment_id join public.criteria c on c.id = s.criterion_id
            where a.lesson_id = l.id and a.submitted_at is not null and s.comment is not null) q), '[]'::jsonb)) end
    order by l.scheduled_at desc)
    from public.trial_lessons l left join public.decisions d on d.lesson_id = l.id where l.candidate_id = me.id and l.status <> 'cancelled'), '[]'::jsonb));
end $$;

create or replace function public.candidate_add_journal(p_lesson_date text, p_observed_teacher text, p_group_name text,
  p_techniques text, p_will_use text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._auth_write(array['candidate']); v_date date; j public.journal_entries;
begin
  if trim(coalesce(p_lesson_date, '')) = '' or trim(coalesce(p_observed_teacher, '')) = ''
     or trim(coalesce(p_techniques, '')) = '' or trim(coalesce(p_will_use, '')) = '' then raise exception 'JOURNAL_FIELDS_REQUIRED'; end if;
  begin v_date := trim(p_lesson_date)::date; exception when others then raise exception 'INVALID_DATE'; end;
  insert into public.journal_entries (candidate_id, lesson_date, observed_teacher, group_name, techniques, will_use)
  values (me.id, v_date, trim(p_observed_teacher), nullif(trim(coalesce(p_group_name, '')), ''), trim(p_techniques), trim(p_will_use))
  returning * into j;
  return to_jsonb(j);
end $$;

-- Boss: any candidate. Teacher: own mentees. Candidate: always their own journal.
create or replace function public.journal_list(p_candidate_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me public.profiles := public._auth(array['boss', 'teacher', 'candidate']); v_target uuid;
begin
  if me.role = 'candidate' then v_target := me.id;
  else
    v_target := p_candidate_id;
    if me.role = 'teacher' and not exists (select 1 from public.profiles where id = v_target and mentor_id = me.id) then
      raise exception 'NOT_YOUR_MENTEE'; end if;
  end if;
  return coalesce((select jsonb_agg(to_jsonb(j) order by j.lesson_date desc, j.created_at desc)
    from public.journal_entries j where j.candidate_id = v_target), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------
-- Boss: change, cancel, remove observer
-- ---------------------------------------------------------------------

create or replace function public.boss_update_lesson(p_lesson_id uuid, p_scheduled_at text, p_group_name text default '', p_topic text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare l public.trial_lessons; v_when timestamptz; o record; v_moved boolean; c public.profiles;
begin
  perform public._auth_write(array['boss']);
  select * into l from public.trial_lessons where id = p_lesson_id for update;
  if not found then raise exception 'LESSON_NOT_FOUND'; end if;
  if l.status in ('approved', 'declined') then raise exception 'ALREADY_DECIDED'; end if;
  if l.status = 'cancelled' then raise exception 'LESSON_CANCELLED'; end if;
  begin v_when := p_scheduled_at::timestamptz; exception when others then raise exception 'INVALID_DATE'; end;
  if v_when is null then raise exception 'INVALID_DATE'; end if;
  v_moved := v_when <> l.scheduled_at;
  update public.trial_lessons set scheduled_at = v_when, group_name = nullif(trim(coalesce(p_group_name, '')), ''),
    topic = nullif(trim(coalesce(p_topic, '')), '') where id = l.id;
  if v_moved then
    select * into c from public.profiles where id = l.candidate_id;
    for o in select p.telegram_chat_id from public.observer_assignments a join public.profiles p on p.id = a.observer_id where a.lesson_id = l.id loop
      perform public._telegram(o.telegram_chat_id, 'Lesson moved: ' || c.full_name || ' — now ' || public._tashkent(v_when) ||
        ' (was ' || public._tashkent(l.scheduled_at) || ').' || public._open_link('teacher'));
    end loop;
  end if;
  return jsonb_build_object('ok', true, 'moved', v_moved);
end $$;

create or replace function public.boss_cancel_lesson(p_lesson_id uuid, p_reason text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare l public.trial_lessons; o record; c public.profiles;
begin
  perform public._auth_write(array['boss']);
  select * into l from public.trial_lessons where id = p_lesson_id for update;
  if not found then raise exception 'LESSON_NOT_FOUND'; end if;
  if l.status in ('approved', 'declined') then raise exception 'ALREADY_DECIDED'; end if;
  if l.status = 'cancelled' then raise exception 'LESSON_CANCELLED'; end if;
  update public.trial_lessons set status = 'cancelled', cancel_reason = nullif(trim(coalesce(p_reason, '')), '') where id = l.id;
  select * into c from public.profiles where id = l.candidate_id;
  for o in select p.telegram_chat_id from public.observer_assignments a join public.profiles p on p.id = a.observer_id
           where a.lesson_id = l.id and a.submitted_at is null loop
    perform public._telegram(o.telegram_chat_id, 'Lesson cancelled: ' || c.full_name || ', ' || public._tashkent(l.scheduled_at) || '. No scores needed.');
  end loop;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.boss_remove_observer(p_assignment_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.observer_assignments; v_status text;
begin
  perform public._auth_write(array['boss']);
  select * into a from public.observer_assignments where id = p_assignment_id;
  if not found then raise exception 'ASSIGNMENT_NOT_FOUND'; end if;
  select status into v_status from public.trial_lessons where id = a.lesson_id;
  if v_status in ('approved', 'declined') then raise exception 'ALREADY_DECIDED'; end if;
  if v_status = 'cancelled' then raise exception 'LESSON_CANCELLED'; end if;
  if (select count(*) from public.observer_assignments where lesson_id = a.lesson_id) <= 1 then raise exception 'LAST_OBSERVER'; end if;
  delete from public.observer_assignments where id = a.id;
  perform public._refresh_lesson_status(a.lesson_id);
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
-- My account (every role)
-- ---------------------------------------------------------------------

create or replace function public.me_change_password(p_current text, p_new text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare me public.profiles := public._auth_write();
begin
  if not exists (select 1 from auth.users where id = me.id and encrypted_password = crypt(coalesce(p_current, ''), encrypted_password)) then
    raise exception 'WRONG_PASSWORD'; end if;
  if length(coalesce(p_new, '')) < 8 then raise exception 'PASSWORD_TOO_SHORT'; end if;
  update auth.users set encrypted_password = crypt(p_new, gen_salt('bf')), updated_at = now() where id = me.id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.me_set_telegram(p_chat_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._auth_write(); v text := nullif(trim(coalesce(p_chat_id, '')), '');
begin
  if v is not null and v !~ '^-?[0-9]{3,20}$' then raise exception 'INVALID_CHAT_ID'; end if;
  update public.profiles set telegram_chat_id = v where id = me.id;
  return jsonb_build_object('ok', true, 'telegram_chat_id', v);
end $$;

-- ---------------------------------------------------------------------
-- Creator: delete an account that has no history
-- ---------------------------------------------------------------------

create or replace function public.creator_delete_user(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._auth_write(array['creator']);
begin
  if p_user_id = me.id then raise exception 'CANNOT_DELETE_SELF'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then raise exception 'USER_NOT_FOUND'; end if;
  if exists (select 1 from public.trial_lessons where candidate_id = p_user_id)
     or exists (select 1 from public.observer_assignments where observer_id = p_user_id)
     or exists (select 1 from public.decisions where boss_id = p_user_id)
     or exists (select 1 from public.journal_entries where candidate_id = p_user_id)
     or exists (select 1 from public.calibration_attempts where teacher_id = p_user_id)
     or exists (select 1 from public.quiz_attempts where candidate_id = p_user_id) then
    raise exception 'HAS_HISTORY';
  end if;
  delete from auth.users where id = p_user_id;
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
-- Student feedback (QR code; students do not sign in)
-- ---------------------------------------------------------------------

create or replace function public._feedback_summary(p_lesson_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'count', count(*),
    'understood', round(avg(understood), 1), 'clear', round(avg(clear), 1),
    'spoke', round(avg(spoke), 1), 'enjoyed', round(avg(enjoyed), 1),
    'comments', coalesce(jsonb_agg(comment order by created_at) filter (where comment is not null), '[]'::jsonb),
    'token', (select feedback_token from public.trial_lessons where id = p_lesson_id))
  from public.student_feedback where lesson_id = p_lesson_id;
$$;

-- What the student sees before answering (no names of observers, only the teacher's first name)
create or replace function public.feedback_form(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare l public.trial_lessons; c public.profiles;
begin
  select * into l from public.trial_lessons where feedback_token = p_token;
  if not found then raise exception 'FEEDBACK_NOT_FOUND'; end if;
  select * into c from public.profiles where id = l.candidate_id;
  return jsonb_build_object('teacher', split_part(c.full_name, ' ', 1), 'scheduled_at', l.scheduled_at, 'group_name', l.group_name,
    'open', l.status <> 'cancelled' and l.scheduled_at > now() - interval '14 days' and l.scheduled_at < now() + interval '1 day');
end $$;

create or replace function public.feedback_submit(p_token text, p_understood int, p_clear int, p_spoke int, p_enjoyed int, p_comment text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare l public.trial_lessons;
begin
  select * into l from public.trial_lessons where feedback_token = p_token;
  if not found then raise exception 'FEEDBACK_NOT_FOUND'; end if;
  if l.status = 'cancelled' or l.scheduled_at <= now() - interval '14 days' or l.scheduled_at >= now() + interval '1 day' then
    raise exception 'FEEDBACK_CLOSED'; end if;
  if least(p_understood, p_clear, p_spoke, p_enjoyed) < 1 or greatest(p_understood, p_clear, p_spoke, p_enjoyed) > 5
     or p_understood is null or p_clear is null or p_spoke is null or p_enjoyed is null then raise exception 'FEEDBACK_INCOMPLETE'; end if;
  if (select count(*) from public.student_feedback where lesson_id = l.id) >= 80 then raise exception 'FEEDBACK_FULL'; end if;
  insert into public.student_feedback (lesson_id, understood, clear, spoke, enjoyed, comment)
  values (l.id, p_understood, p_clear, p_spoke, p_enjoyed, left(nullif(trim(coalesce(p_comment, '')), ''), 500));
  return jsonb_build_object('ok', true);
end $$;

-- ---------------------------------------------------------------------
-- Teaching-methods quiz
-- ---------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from public.quiz_questions) then
    insert into public.quiz_questions (sort_order, question, options, correct_index, explanation) values
    (1, 'What is the main purpose of a concept-check question (CCQ)?',
      '["To test grammar rules", "To check students really understand the meaning of new language", "To start a discussion", "To fill extra time"]', 1,
      'CCQs check meaning, e.g. "used to play" → "Do I play now?" (No). Asking "Do you understand?" does not check anything.'),
    (2, 'Which is the best way to give instructions for a pair activity?',
      '["Explain everything in detail before handing out the paper", "Give short instructions, demonstrate with one student, then check with ICQs", "Write the instructions on the board and let students read them", "Let students guess what to do"]', 1,
      'Keep instructions short, show an example, then ask instruction-check questions ("Do you write or speak?").'),
    (3, 'In a good communicative lesson, who should talk most?',
      '["The teacher", "The strongest students", "The students, in pairs and groups", "Nobody: the lesson should be silent work"]', 2,
      'Student talking time should be high: everyone speaks in pairs or groups, not only the strong students.'),
    (4, 'A student says "Yesterday I go to the park." during a fluency activity. What is usually best?',
      '["Stop them at once and correct", "Note it and give feedback after the activity", "Ignore all errors forever", "Ask the class to laugh at the mistake"]', 1,
      'During fluency work, let students speak and correct later (delayed correction). During accuracy work, correct on the spot.'),
    (5, 'What does PPP stand for?',
      '["Plan, Practise, Present", "Presentation, Practice, Production", "Pair, Practise, Perform", "Prepare, Present, Pass"]', 1,
      'Presentation (new language), Practice (controlled), Production (freer use).'),
    (6, 'Why should every activity in a lesson connect to the lesson aim?',
      '["So the lesson looks long", "So students can say what they learned and the lesson has a clear direction", "Because the textbook says so", "It does not matter"]', 1,
      'A clear aim keeps the lesson focused; at the end students should be able to say what they can now do.'),
    (7, 'What is the best way to handle a student who never speaks?',
      '["Ignore them", "Put them in pairs and give them a clear, small speaking task", "Make them speak in front of the whole class first", "Send them to the director"]', 1,
      'Pair work is safer than speaking in front of everyone; small, clear tasks build confidence.'),
    (8, 'At the end of the lesson the teacher should…',
      '["Stop when the bell rings, mid-activity", "Summarise what was learned and give homework, ending on time", "Start a new topic", "Leave early"]', 1,
      'End on time with a short summary and homework, so students leave knowing what they learned.');
  end if;
end $$;

create or replace function public.boss_quiz()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public._auth(array['boss']);
  return jsonb_build_object(
    'questions', coalesce((select jsonb_agg(to_jsonb(q) order by q.sort_order, q.created_at) from public.quiz_questions q), '[]'::jsonb),
    'candidates', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'attempts', x.n, 'best', x.best,
        'latest_score', x.latest_score, 'latest_total', x.latest_total, 'latest_at', x.latest_at) order by lower(p.full_name))
      from public.profiles p
      join lateral (select count(*) n, max(round(100.0 * score / nullif(total, 0))) best,
          (array_agg(score order by created_at desc))[1] latest_score, (array_agg(total order by created_at desc))[1] latest_total,
          max(created_at) latest_at from public.quiz_attempts a where a.candidate_id = p.id) x on x.n > 0
      where p.role = 'candidate'), '[]'::jsonb));
end $$;

create or replace function public.boss_save_quiz_question(p_id uuid, p_question text, p_options jsonb, p_correct_index int,
  p_explanation text default '', p_is_active boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_opts jsonb; q public.quiz_questions;
begin
  perform public._auth_write(array['boss']);
  if trim(coalesce(p_question, '')) = '' then raise exception 'QUESTION_REQUIRED'; end if;
  select coalesce(jsonb_agg(trim(x)), '[]'::jsonb) into v_opts from jsonb_array_elements_text(coalesce(p_options, '[]')) x where trim(x) <> '';
  if jsonb_array_length(v_opts) < 2 or jsonb_array_length(v_opts) > 6 then raise exception 'OPTIONS_COUNT'; end if;
  if p_correct_index is null or p_correct_index < 0 or p_correct_index >= jsonb_array_length(v_opts) then raise exception 'CORRECT_REQUIRED'; end if;
  if p_id is null then
    insert into public.quiz_questions (sort_order, question, options, correct_index, explanation, is_active)
    values ((select coalesce(max(sort_order), 0) + 1 from public.quiz_questions), trim(p_question), v_opts, p_correct_index,
      nullif(trim(coalesce(p_explanation, '')), ''), coalesce(p_is_active, true)) returning * into q;
  else
    update public.quiz_questions set question = trim(p_question), options = v_opts, correct_index = p_correct_index,
      explanation = nullif(trim(coalesce(p_explanation, '')), ''), is_active = coalesce(p_is_active, true) where id = p_id returning * into q;
    if not found then raise exception 'NOT_FOUND'; end if;
  end if;
  return to_jsonb(q);
end $$;

create or replace function public.boss_delete_quiz_question(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public._auth_write(array['boss']);
  delete from public.quiz_questions where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- Candidate: questions without the answers, and their own attempts
create or replace function public.candidate_quiz()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me public.profiles := public._auth(array['candidate']);
begin
  return jsonb_build_object(
    'questions', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'question', q.question, 'options', q.options) order by q.sort_order, q.created_at)
      from public.quiz_questions q where q.is_active), '[]'::jsonb),
    'attempts', coalesce((select jsonb_agg(jsonb_build_object('score', a.score, 'total', a.total, 'created_at', a.created_at) order by a.created_at desc)
      from public.quiz_attempts a where a.candidate_id = me.id), '[]'::jsonb));
end $$;

create or replace function public.candidate_submit_quiz(p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me public.profiles := public._auth_write(array['candidate']); q record; v_score int := 0; v_total int := 0; v_results jsonb := '[]'::jsonb; v_pick int;
begin
  for q in select * from public.quiz_questions where is_active order by sort_order, created_at loop
    v_total := v_total + 1;
    if p_answers->>(q.id::text) is null then raise exception 'QUIZ_INCOMPLETE'; end if;
    begin v_pick := (p_answers->>(q.id::text))::int; exception when others then raise exception 'QUIZ_INCOMPLETE'; end;
    if v_pick = q.correct_index then v_score := v_score + 1; end if;
    v_results := v_results || jsonb_build_object('question_id', q.id, 'chosen', v_pick, 'correct_index', q.correct_index,
      'correct', v_pick = q.correct_index, 'explanation', q.explanation);
  end loop;
  if v_total = 0 then raise exception 'QUIZ_EMPTY'; end if;
  insert into public.quiz_attempts (candidate_id, answers, score, total) values (me.id, p_answers, v_score, v_total);
  return jsonb_build_object('score', v_score, 'total', v_total, 'results', v_results);
end $$;

-- ---------------------------------------------------------------------
-- Boss: analytics
-- ---------------------------------------------------------------------

create or replace function public.boss_analytics()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public._auth(array['boss']);
  return jsonb_build_object(
    'outcomes', (select jsonb_build_object(
        'decided', count(*) filter (where status in ('approved', 'declined')),
        'approved', count(*) filter (where status = 'approved'),
        'declined', count(*) filter (where status = 'declined'),
        'cancelled', count(*) filter (where status = 'cancelled'),
        'open', count(*) filter (where status in ('scheduled', 'awaiting_decision')),
        'full_approved', count(*) filter (where status = 'approved' and type = 'full'),
        'full_decided', count(*) filter (where status in ('approved', 'declined') and type = 'full'),
        'micro_approved', count(*) filter (where status = 'approved' and type = 'micro'),
        'micro_decided', count(*) filter (where status in ('approved', 'declined') and type = 'micro'))
      from public.trial_lessons),
    -- Average band per criterion over all decided lessons, weakest first
    'criteria', coalesce((select jsonb_agg(x order by x.avg_band) from (
        select c.name, min(c.area) as area, bool_or(c.must_pass) as must_pass, round(avg(s.band), 2) as avg_band, count(distinct l.id) as lessons
        from public.scores s join public.observer_assignments a on a.id = s.assignment_id and a.submitted_at is not null
        join public.trial_lessons l on l.id = a.lesson_id and l.status in ('approved', 'declined')
        join public.criteria c on c.id = s.criterion_id group by c.name) x), '[]'::jsonb),
    -- Days from a candidate's first lesson to their approved full trial lesson
    'time_to_approval', coalesce((select jsonb_agg(x order by x.days) from (
        select p.full_name as name, min(l.scheduled_at) as first_lesson, min(d.created_at) filter (where l.type = 'full' and d.outcome = 'approved') as approved_at,
          extract(day from min(d.created_at) filter (where l.type = 'full' and d.outcome = 'approved') - min(l.scheduled_at))::int as days
        from public.profiles p join public.trial_lessons l on l.candidate_id = p.id left join public.decisions d on d.lesson_id = l.id
        where p.role = 'candidate' group by p.id
        having min(d.created_at) filter (where l.type = 'full' and d.outcome = 'approved') is not null) x), '[]'::jsonb),
    -- How each observer scores compared with the other observers of the same lessons (+ = more generous)
    'observers', coalesce((select jsonb_agg(x order by x.name) from (
        select p.full_name as name, count(distinct a.lesson_id) as lessons, round(avg(s.band), 2) as avg_band,
          round(avg(s.band - o.others), 2) as vs_team
        from public.scores s join public.observer_assignments a on a.id = s.assignment_id and a.submitted_at is not null
        join public.trial_lessons l on l.id = a.lesson_id and l.status <> 'cancelled'
        join public.profiles p on p.id = a.observer_id
        join lateral (select avg(s2.band) as others from public.scores s2 join public.observer_assignments a2 on a2.id = s2.assignment_id
            where a2.lesson_id = a.lesson_id and a2.submitted_at is not null and a2.id <> a.id and s2.criterion_id = s.criterion_id) o on o.others is not null
        group by p.id) x), '[]'::jsonb),
    'calibration', (select jsonb_build_object('teachers', count(*), 'avg_latest', round(avg(acc))) from (
        select distinct on (teacher_id) accuracy as acc from public.calibration_attempts order by teacher_id, created_at desc) t),
    'quiz', (select jsonb_build_object('attempts', count(*), 'avg_percent', round(avg(100.0 * score / nullif(total, 0)))) from public.quiz_attempts),
    'student_feedback', (select jsonb_build_object('answers', count(*), 'understood', round(avg(understood), 1), 'clear', round(avg(clear), 1),
        'spoke', round(avg(spoke), 1), 'enjoyed', round(avg(enjoyed), 1)) from public.student_feedback)
  );
end $$;

-- ---------------------------------------------------------------------
-- First creator account (run once from the SQL editor, see README)
-- ---------------------------------------------------------------------
create or replace function public.setup_first_creator(p_full_name text, p_login text, p_password text)
returns text language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  if exists (select 1 from public.profiles where role = 'creator') then raise exception 'A creator account already exists'; end if;
  p := public._create_user(p_full_name, p_login, p_password, 'creator', 'active', '', null);
  return 'Creator account created: ' || p.login;
end $$;

-- ---------------------------------------------------------------------
-- Storage for material files
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('materials', 'materials', true) on conflict (id) do nothing;

create or replace function public.is_boss()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'boss' and status = 'active');
$$;

drop policy if exists "Boss uploads materials" on storage.objects;
create policy "Boss uploads materials" on storage.objects for insert to authenticated
  with check (bucket_id = 'materials' and public.is_boss());
drop policy if exists "Boss updates materials" on storage.objects;
create policy "Boss updates materials" on storage.objects for update to authenticated
  using (bucket_id = 'materials' and public.is_boss());
drop policy if exists "Boss deletes materials" on storage.objects;
create policy "Boss deletes materials" on storage.objects for delete to authenticated
  using (bucket_id = 'materials' and public.is_boss());

-- ---------------------------------------------------------------------
-- Who may call what: only signed-in users, and only the public functions
-- ---------------------------------------------------------------------
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f' loop
    execute format('revoke all on function %s from public', f.sig);
    begin execute format('revoke all on function %s from anon', f.sig); exception when undefined_object then null; end;
    begin execute format('revoke all on function %s from authenticated', f.sig); exception when undefined_object then null; end;
    if f.proname not like '\_%' and f.proname <> 'setup_first_creator' then
      begin execute format('grant execute on function %s to authenticated', f.sig); exception when undefined_object then null; end;
    end if;
  end loop;
end $$;
-- Students give feedback without signing in
grant execute on function public.feedback_form(text) to anon, authenticated;
grant execute on function public.feedback_submit(text, int, int, int, int, text) to anon, authenticated;
-- The storage policy helper must stay callable for signed-in users
grant execute on function public.is_boss() to authenticated;
-- Helpers used inside the functions run as the function owner, so they need no grants.
