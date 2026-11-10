# Edunest Teacher Certification Pathway — Design Spec

Date: 2026-11-10
Status: Draft for review
Platform: WeWeb (frontend + WeWeb Backend, Auth, Storage)

## 1. Problem

Today a new staff member at Edunest shadows some lessons, teaches one lesson, and a single
teacher tells the boss whether the newcomer is ready. Different teachers judge differently
("ready" vs "not ready" for the same person) because:

1. There is no written definition of a good Edunest lesson.
2. The decision rests on one person's opinion.
3. There is no recorded evidence the boss can check.

## 2. Goal and success criteria

Replace the single-opinion judgement with a shared standard, several independent scores and a
rule-based result that the boss confirms.

Success after the 1-month pilot:

- Every trial lesson is scored by at least 2 teachers against the same 10 criteria.
- The verdict (Ready / Not ready) is calculated by a written rule, not argued.
- Disagreements between observers are flagged automatically, not discovered later.
- The boss decides from one screen that shows all evidence.
- Candidates see the lesson materials, their own progress and their results.

Out of scope for v1 (Phase 2+): student micro-feedback, method quiz, video upload,
observer rewards, analytics dashboard, observation of current teachers, integration into the
main Edunest system, the paid "Edunest Teacher Course".

## 3. Roles and access

All accounts are created by the **Creator** (project founder). Nobody can sign up.
Every user logs in with **login + password**. Signup and forgot-password pages are removed.

| Role | Can do |
|---|---|
| Creator | Creator panel: create / edit accounts (full name, login, password, role, status, Telegram chat ID), reset passwords, block / unblock. |
| Boss | Dashboard, candidates and stages, standard editor, materials library, schedule trial lessons, add observers, decide, print reports, manage calibration lessons. |
| Teacher | See assigned lessons, score them (blind), do calibration, read journals of candidates they mentor. |
| Candidate | Lesson materials, own progress (stage), own results, own shadowing journal. |

**Status:** `active` or `blocked`. A blocked user cannot log in; if already logged in, every
backend call is refused and the app sends them to the login page.

**Login implementation:** WeWeb Auth is email-based. A login `ali` is stored as the auth email
`ali@users.edunest.local`. The login form shows a single "Login" field and appends the domain
itself. Users never see an email.

Role enforcement is done on the **backend** (role-protected table views and endpoints, plus a
middleware that rejects blocked users). Frontend page guards are only for navigation.

## 4. The Edunest Lesson Standard

4 areas, 10 criteria, each scored **1–9** (IELTS-like). Each criterion has written band
descriptors for bands 9, 7, 5 and 3; even bands mean "between the two descriptors".
The standard is **versioned**: editing creates a new version; past lessons keep the version
they were scored with.

| # | Area | Criterion | Must-pass |
|---|---|---|---|
| 1 | Before the lesson | Preparation | yes |
| 2 | Before the lesson | Clear lesson aim | |
| 3 | Teacher delivery | Confidence and flow | |
| 4 | Teacher delivery | Clear instructions | yes |
| 5 | Teacher delivery | Accurate English model | yes |
| 6 | Students' experience | Rapport and atmosphere | |
| 7 | Students' experience | Student talking time | |
| 8 | Students' experience | Checking understanding and correcting errors | |
| 9 | Lesson management | Classroom management and pace | yes |
| 10 | Lesson management | Edunest systems (attendance, diamonds, Journey) | |

Initial descriptors are in Appendix A. The boss can edit them.

## 5. Scoring rules

- **Criterion band** for a lesson = average of the observers' bands for that criterion.
- **Overall band** = average of the 10 criterion bands, rounded IELTS-style:
  fractional part < .25 → down to .0; .25–.74 → .5; ≥ .75 → up to the next whole band.
- **Ready** when all of:
  - overall band ≥ 6.0
  - every must-pass criterion band ≥ 6.0
  - no criterion band < 4.0
- **Disagreement alert** on a criterion when the highest and lowest observer band differ by
  **3 or more**. The boss sees which criteria and can add another observer.
- The boss can decide only when **at least 2 observers have submitted**.
- The calculated verdict is a recommendation. The boss's decision is **Approved** or
  **Declined**, with a note. If the boss overrides the recommendation, the note is required.

## 6. Candidate pathway

Stages: `Shadowing → Micro-teaching → Full trial → Decision → Probation → Certified`
(plus `Declined`).

- The boss moves a candidate between stages manually from the candidate page.
- Approving a **full trial** lesson moves the candidate to Probation automatically.
- Each candidate has an optional **mentor** (a teacher).
- A teacher cannot be assigned as observer of a lesson of a candidate they mentor.

## 7. Functions (v1)

1. **Creator panel** — accounts table with search and filters by role and status;
   create / edit dialog; reset password; block / unblock.
2. **Standard editor** (boss) — edit criteria, descriptors, must-pass flags; "Publish new
   version".
3. **Candidates** (boss) — list with stage and last result; candidate detail with stage
   control, mentor, lessons, journal.
4. **Trial lesson scheduling** (boss) — candidate, type (micro / full), date-time, group,
   topic, 2–3 observers. Observers get a **Telegram message**.
5. **Scoring form** (teacher, mobile-first) — one card per criterion: 1–9 selector, tap to see
   descriptors, optional comment, and an overall comment. Validation: all 10 criteria scored.
   After submit the score is **locked** (only the boss can reopen it). Teachers never see other
   observers' scores (blind).
6. **Automatic result** — criterion bands, overall band, must-pass check, recommendation.
7. **Disagreement alert** — badge on the lesson and dashboard; "Add observer" action.
8. **Decision screen + printable report** (boss) — all scores per observer, comments,
   result, alerts, candidate journal link; Approve / Decline with note; "Print report" opens a
   clean printable page.
9. **Calibration** — the boss adds a calibration lesson (video link + reference bands for the
   10 criteria). Teachers score it and get an **accuracy %**:
   `accuracy = 100 − (mean |teacher band − reference band| ÷ 8 × 100)`. The boss sees each
   teacher's latest accuracy.
10. **Materials library** — the boss adds items of type **Slides**, **Exercises**,
    **Pairwork games**, with title, description, level (Beginner, Elementary, Pre-Intermediate,
    Intermediate, Upper-Intermediate, Advanced), and a file upload and/or link.
    Candidates browse, filter by type and level, and download.
11. **Candidate results** — list of the candidate's lessons with status **Waiting** (scheduled,
    being scored, or awaiting decision), **Approved** or **Declined**. After the decision the
    candidate also sees criterion bands, overall band and observers' comments (not observer
    names).
12. **Shadowing journal** — the candidate adds entries: date, observed teacher, group,
    techniques noticed, what I will use. The mentor and the boss can read them.
13. **Reminders** — a daily scheduled task sends a Telegram reminder to observers who have not
    submitted 24 h after the lesson time.

## 8. Data model (WeWeb tables)

Custom columns on `auth.users`: `full_name` (text), `login` (text, unique), `status`
(text: active / blocked), `telegram_chat_id` (text), `stage` (text, candidates only),
`mentor_id` (uuid → auth.users).
App roles: `creator`, `boss`, `teacher`, `candidate`.

| Table | Columns |
|---|---|
| `rubric_versions` | id, version_no, is_active, created_at |
| `criteria` | id, rubric_version_id → rubric_versions, area, name, sort_order, must_pass, desc_9, desc_7, desc_5, desc_3 |
| `trial_lessons` | id, candidate_id → users, type (micro / full), scheduled_at, group_name, topic, rubric_version_id, status (scheduled / awaiting_decision / approved / declined), created_at |
| `observer_assignments` | id, lesson_id → trial_lessons, observer_id → users, submitted_at, overall_comment |
| `scores` | id, assignment_id → observer_assignments, criterion_id → criteria, band (1–9), comment |
| `decisions` | id, lesson_id → trial_lessons, boss_id → users, outcome (approved / declined), recommended (ready / not_ready), overall_band, note, created_at |
| `materials` | id, title, description, type (slides / exercises / pairwork_games), level, file_path → storage, link_url, created_by, created_at |
| `journal_entries` | id, candidate_id → users, lesson_date, observed_teacher, group_name, techniques, will_use, created_at |
| `calibration_lessons` | id, title, video_url, rubric_version_id, reference_bands (jsonb: criterion_id → band), is_active |
| `calibration_attempts` | id, calibration_lesson_id, teacher_id → users, bands (jsonb), accuracy, created_at |

Lesson status moves `scheduled → awaiting_decision` once at least 2 observers have submitted,
and to `approved` / `declined` when the boss decides.

## 9. Backend endpoints (role-protected)

| Endpoint | Role | Does |
|---|---|---|
| `creator_create_user`, `creator_update_user`, `creator_reset_password` | creator | Auth user actions; validates unique login. |
| `boss_schedule_lesson` | boss | Inserts lesson + assignments; rejects mentor-as-observer and fewer than 2 observers; sends Telegram. |
| `boss_add_observer` | boss | Adds an assignment; sends Telegram. |
| `boss_reopen_score` | boss | Clears `submitted_at` of one assignment. |
| `get_lesson_result` | boss | Computes criterion bands, overall band, must-pass, recommendation and disagreements. |
| `boss_decide` | boss | Requires ≥ 2 submitted; stores decision with computed result; updates lesson status and candidate stage. |
| `boss_publish_rubric` | boss | Copies the active criteria into a new version and activates it. |
| `teacher_submit_scores` | teacher | Only own, unlocked assignment; requires all criteria with band 1–9; saves and locks; updates lesson status. |
| `teacher_submit_calibration` | teacher | Computes and stores accuracy. |
| `candidate_my_results` | candidate | Own lessons; bands and comments only for decided lessons; no observer names. |
| `upload_material` | boss | storage-put, then insert. |

A shared middleware rejects any caller whose `status` is `blocked`.
The Telegram bot token is a **secure** environment variable `TELEGRAM_BOT_TOKEN`.
A Telegram failure never blocks scheduling; it is logged and shown as a warning.

## 10. Pages

| Page | Role | Content |
|---|---|---|
| Login | all | Login + password; redirects by role. |
| Creator / Accounts | creator | Accounts table, create / edit dialog. |
| Boss / Dashboard | boss | Counts (active candidates, lessons awaiting decision, alerts), upcoming lessons, recent decisions, calibration accuracy per teacher. |
| Boss / Candidates | boss | List with stage and last result. |
| Boss / Candidate detail | boss | Stage control, mentor, lessons, journal. |
| Boss / Lesson (decision) | boss | Evidence, result, alerts, decide, print. |
| Boss / Report (print) | boss | Clean printable report. |
| Boss / Standard | boss | Rubric editor. |
| Boss / Materials | boss | Library management. |
| Boss / Calibration | boss | Calibration lessons and teacher accuracy. |
| Teacher / My lessons | teacher | Assigned lessons (to score / submitted), mentees. |
| Teacher / Score lesson | teacher | Mobile-first scoring form. |
| Teacher / Calibration | teacher | Score a reference lesson, see accuracy. |
| Teacher / Mentee journal | teacher | Read-only journal of own mentees. |
| Candidate / Home | candidate | Stage tracker and results list. |
| Candidate / Result detail | candidate | Bands and comments after decision. |
| Candidate / Materials | candidate | Browse and download. |
| Candidate / Journal | candidate | Write and read own entries. |

## 11. Visual design

Professional, calm, and suited to an education product:

- Layout: left sidebar per role (collapses to a top bar with a menu on phones); content max
  width ~1200 px; 8 pt spacing grid.
- Palette: neutral off-white surfaces, slate text, one accent (deep indigo) for primary
  actions; semantic green / amber / red only for Approved / Waiting / Declined and alerts.
- Type: Inter; clear hierarchy (page title, section title, body, caption).
- Components: cards with 1 px borders and soft shadows, status badges, data tables, empty
  states with a clear action, tooltips on the descriptors.
- The scoring form is designed for a 375 px wide phone with large tap targets.
- Design tokens and classes are created in the WeWeb design system and reused on every page.

## 12. Verification

WeWeb has no unit-test runner, so verification is:

1. Run every endpoint with test data through the backend workflow runner and check the
   execution logs, including the rule edge cases: rounding (6.24 → 6.0, 6.25 → 6.5,
   6.75 → 7.0), must-pass failure with a high overall band, a criterion below 4, a 3-band gap
   alert, deciding with only 1 submission (rejected), scoring by a non-assigned teacher
   (rejected), and a blocked user (rejected).
2. An end-to-end walk-through with seeded test accounts (1 creator, 1 boss, 3 teachers,
   2 candidates): create accounts → schedule → 2 teachers score → result → decide → candidate
   sees the result.
3. Screenshots at 375 px and 1280 px for every page.

## 13. Phases

- **Phase 1 (this spec, 1 month):** functions 1–13.
- **Phase 2:** student micro-feedback, method quiz, video upload, observer rewards in
  diamonds, analytics (time-to-ready, weakest criteria), regular observation of current
  teachers.
- **Phase 3:** integration into the main Edunest system; paid "Edunest Teacher Course" for
  outside teachers.

## Appendix A — Initial band descriptors

| Criterion | 9 | 7 | 5 | 3 |
|---|---|---|---|---|
| Preparation | Detailed written plan with aim, stages, timings; all materials ready; board planned; zero time lost. | Plan with stages and timings; materials ready; minor lost time. | Rough plan; some materials missing or improvised; noticeable lost time. | No plan; materials not ready; lesson visibly improvised. |
| Clear lesson aim | Aim stated; every activity serves it; students can say what they learned. | Aim clear; most activities serve it. | Aim vague; several activities unrelated. | No identifiable aim. |
| Confidence and flow | No hesitation; smooth transitions; handles surprises calmly. | Mostly confident; small pauses; transitions clear. | Frequent pauses; abrupt transitions; unsettled by questions. | Long hesitations; loses the thread; visibly uncomfortable. |
| Clear instructions | Short, demonstrated, checked with instruction-check questions; students start immediately. | Clear; usually demonstrated or checked; rare confusion. | Long or unchecked; several students confused. | Unclear; most students do not know what to do. |
| Accurate English model | Accurate, natural, graded to level; clear pronunciation. | Few minor errors; mostly well graded. | Noticeable errors or poorly graded language. | Frequent errors that students could copy. |
| Rapport and atmosphere | Warm, humorous, uses names; students relaxed and willing to make mistakes. | Friendly; most students comfortable. | Neutral; some students withdrawn. | Tense or cold; students afraid to speak. |
| Student talking time | Students talk much more than the teacher; everyone speaks in pairs or groups. | Students talk more than the teacher; most speak. | Roughly equal; mostly strong students speak. | Teacher dominates; few students speak. |
| Checking understanding and correcting errors | Concept-check questions used; errors corrected kindly at the right time; peer correction. | Understanding usually checked; errors corrected appropriately. | "Do you understand?" only; correction inconsistent. | Understanding not checked; errors ignored or corrected harshly. |
| Classroom management and pace | Calm control without shouting; no dead time; ends on time with summary and homework. | Good control; pace mostly right; ends near time. | Some disorder or dead time; rushed or unfinished ending. | Loses control; pace wrong; no proper ending. |
| Edunest systems | Attendance, diamonds and Journey used correctly and purposefully. | Used correctly with minor slips. | Used partly or late. | Not used or used wrongly. |
