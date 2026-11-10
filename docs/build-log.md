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

