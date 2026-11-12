# Edunest Teacher Certification Pathway

**Live app: https://baxod1rovvf.github.io/staff-training-scheme/**

A web app that takes a new teacher from "candidate" to "certified Edunest teacher".
Observers score trial lessons against one shared standard (4 areas, 10 criteria, bands 1–9
like IELTS). The app works out the result, and the boss makes the decision.

- **Website:** plain HTML/JavaScript in this repository, published by GitHub Pages from `main`.
- **Database and logins:** Supabase (free plan). Everything it needs is in one file: `supabase/schema.sql`.
- **Updates:** every change is made in this repository. Say "merge it" and the change goes to `main`; GitHub Pages publishes it within a minute or two.

## Roles

| Role | What they do |
|---|---|
| Creator | Creates, edits, blocks and deletes accounts (full name, login, password, role, status, Telegram chat id, mentor); sets new passwords. Can **view the site as** any boss, teacher or candidate (read-only) from the sidebar. Nobody can sign up. |
| Boss | Dashboard, candidates and stages, mentor choice, schedules lessons and observers, edits, moves or cancels lessons, removes observers, decides, prints reports, student feedback QR codes, analytics, lesson standard (versioned), materials, calibration lessons, methods quiz, Telegram reminders. |
| Teacher | Scores the lessons they observe (never sees other observers' scores; unsent scores are kept as a draft on the device), practises on calibration lessons, reads the journals of the candidates they mentor. |
| Candidate | Sees their stage and next lesson, their results (bands, comments, the boss's note and student feedback, never observer names), lesson materials, the methods quiz, and writes a shadowing journal. |
| Students | Open the QR code shown at the end of a trial lesson and answer 4 quick questions anonymously, without an account. |

Every role has **My account**: change your own password, set your Telegram chat id, and install the app on your phone.

Everyone signs in with **login + password**. Supabase needs an email, so the login `ali` is stored as `ali@users.edunest.local`; people never see it.

## One-time setup (about 10 minutes)

1. **Create the database.** Go to https://supabase.com, sign in, click **New project**, choose a name (e.g. `edunest`), a database password and a region close to you (e.g. Frankfurt). Wait until it is ready.
2. **Load the app's database.** In the project: **SQL Editor → New query**. Open [`supabase/schema.sql`](supabase/schema.sql) in this repository, copy all of it, paste it, click **Run**. It should end with "Success. No rows returned".
3. **Create your creator account.** In a new SQL query, run (with your own name, login and password, at least 8 characters):
   ```sql
   select setup_first_creator('Your Full Name', 'creator', 'your-password');
   ```
   This works only once. After that, all accounts are made in the app.
4. **Turn off sign-ups.** **Authentication → Sign In / Providers**: switch off **Allow new users to sign up** and save. (Accounts are made by the creator only.)
5. **Connect the website.** In **Project Settings → Data API** copy the **Project URL**; in **Project Settings → API Keys** copy the **anon public** key (newer projects call it the **Publishable key**). Send both to me in the chat (they are safe to publish), or put them into [`config.js`](config.js) yourself.
6. **Publish.** GitHub → this repository → **Settings → Pages**: Source **Deploy from a branch**, branch `main`, folder `/ (root)`, Save. Then say "merge it".

Open the live link and sign in with the creator login from step 3.

### Telegram (optional)

Teachers get a message when they are added as observers, and the boss can send reminders for late scores.

1. In Telegram, open **@BotFather**, send `/newbot`, follow the steps and copy the token.
2. In Supabase **SQL Editor**, run:
   ```sql
   update app_settings set value = 'PASTE-THE-TOKEN' where key = 'telegram_bot_token';
   ```
3. If messages do not arrive, check **Database → Extensions** and make sure **pg_net** is on.
4. Each teacher opens your bot and presses **Start**, then gets their chat id from **@userinfobot**. The creator enters it on the teacher's account.

Without a token or chat id the app works normally; messages are just skipped and the lesson page shows who was not notified.

### Updating the database later

When a change needs the database too, run the new `supabase/schema.sql` again in the SQL Editor (copy all, paste, Run). It keeps all data, adds any new tables and columns, and updates the functions. The site and the database must be updated together: after "merge it", run the file once.

## Rules

- **Criterion band** = average of the observers' bands for that criterion.
- **Overall band** = average of the 10 criterion bands, rounded like IELTS (below .25 rounds down, .25–.74 becomes .5, .75 or more rounds up).
- **Ready** when the overall band is 6.0 or more, every must-pass criterion (Preparation, Clear instructions, Accurate English model, Classroom management and pace) is 6.0 or more, and no criterion is below 4.0.
- **Disagreement** when two observers are 3 or more bands apart on a criterion. The boss can add another observer.
- A lesson has 1–3 observers. The candidate's mentor cannot observe their lessons. The last observer cannot be removed.
- The boss can decide once **2 observers** have submitted, or **1** when only one teacher observes the lesson. Going against the calculated result needs a note. A decision cannot be changed.
- Approving a **full** trial lesson moves the candidate to **Probation**. Other stage changes are made by the boss.
- Stages: Shadowing → Micro-teaching → Full trial → Decision → Probation → Certified (or Declined).
- The standard is versioned. A lesson keeps the version it was scheduled with.
- Calibration accuracy: 0 bands away on average = 100%, 8 bands away = 0%. 85% or more = scores like the team.
- A lesson can be edited or cancelled until it is decided. Cancelled lessons stay in the list but nobody can score them; teachers and the candidate no longer see them.
- An account can be deleted only if the person has no lessons, scores, decisions, journal entries or attempts; otherwise it is blocked, so the records stay.
- Student feedback is open from one day before to 14 days after the lesson (at most 80 answers). Students answer from 1 to 5: understood the lesson, the teacher explained clearly, I spoke a lot, I enjoyed it.
- "View as" is read-only: the database refuses every change while the creator is looking at someone else's pages.

## Files

| Path | What it is |
|---|---|
| `index.html`, `config.js` | The website entry and the Supabase connection |
| `app/` | The app: `main.js` (sign-in, navigation), `api.js` (database calls, error texts), `ui.js` (shared parts), `pages/` (one file per role area) |
| `assets/app.css` | Design system: Inter, indigo accent, cards, chips, band buttons |
| `assets/vendor/` | Preact + htm 3.1.1, supabase-js 2.45.4 and qrcode-generator 1.4.4 (MIT), stored here so the site needs no other server |
| `manifest.webmanifest`, `sw.js`, `assets/icons/` | Install on the phone; the service worker always prefers the newest files |
| `supabase/schema.sql` | Tables, the standard v1, every rule and role check, file storage |
| `supabase/test/` | Tests: `run_tests.sh` (143 database checks), `local_api.cjs` + `e2e.cjs` (the whole flow and every feature in a browser) |
| `docs/` | Original design spec, plan and the WeWeb build history |

## How it is protected

The website never reads tables directly. Every action is a database function that first checks who is signed in, their role and that the account is not blocked (`FORBIDDEN`, `BLOCKED`). Tables have row level security with no open rules, so a direct query returns nothing. A blocked account also cannot sign in.

## Tests

Database checks (needs a local Postgres 16):
```bash
supabase/test/run_tests.sh
```

Whole flow in a browser (creator → boss → two teachers → decision → candidate → mentor), with screenshots at 1280 px and 375 px:
```bash
NODE_PATH=<folder with the pg package> node supabase/test/local_api.cjs
```
```bash
node supabase/test/e2e.cjs /tmp/shots
```

## Roadmap

- **Next:** daily automatic reminders (Supabase cron), more Telegram messages (day-before reminder, "your result is ready"), Uzbek and Russian, calendar view, Excel export.
- **Phase 2:** video upload, observer rewards in diamonds, certificate PDF, probation goals with the mentor, regular observation of current teachers.
- **Phase 3:** move into the main Edunest system; a paid "Edunest Teacher Course" for teachers from outside.
