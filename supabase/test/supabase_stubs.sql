-- Stand-ins for the parts of Supabase that a plain Postgres does not have.
-- Only used for local testing; never run this on Supabase.
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;
create schema auth; create schema extensions; create schema storage; create schema net;
create extension pgcrypto with schema extensions;
create table auth.users (
  instance_id uuid, id uuid primary key, aud varchar(255), role varchar(255), email varchar(255) unique,
  encrypted_password varchar(255), email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
  created_at timestamptz, updated_at timestamptz, confirmation_token varchar(255), recovery_token varchar(255),
  email_change_token_new varchar(255), email_change varchar(255), banned_until timestamptz,
  phone text default null, phone_change text default '', email_change_token_current varchar(255) default '',
  reauthentication_token varchar(255) default '', is_sso_user boolean not null default false, is_anonymous boolean not null default false,
  confirmed_at timestamptz generated always as (email_confirmed_at) stored
);
create table auth.identities (
  provider_id text not null, user_id uuid not null references auth.users (id) on delete cascade, identity_data jsonb not null,
  provider text not null, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz,
  email text generated always as (lower(identity_data->>'email')) stored, id uuid primary key default gen_random_uuid(),
  unique (provider_id, provider)
);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create table net.calls (id serial, url text, body jsonb);
create function net.http_post(url text, body jsonb) returns bigint language sql as $$ insert into net.calls (url, body) values (url, body) returning id $$;
