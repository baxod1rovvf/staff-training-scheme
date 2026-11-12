// Talking to Supabase: sign in/out, calling the database functions, files.
const cfg = window.EDUNEST_CONFIG || {};
export const configured = !!(cfg.supabaseUrl && cfg.supabaseAnonKey);

// "View as" (creator only): every database call carries the person's id; the database then
// answers as that person and refuses any change. Kept for this browser tab only.
let viewAs = null;
try { viewAs = JSON.parse(sessionStorage.getItem('edunest-view-as') || 'null'); } catch (e) { viewAs = null; }
export const getViewAs = () => viewAs;
export function setViewAs(v) {
  viewAs = v;
  try { v ? sessionStorage.setItem('edunest-view-as', JSON.stringify(v)) : sessionStorage.removeItem('edunest-view-as'); } catch (e) { /* private mode */ }
}
const fetchWithViewAs = (input, init = {}) => {
  if (!viewAs || !String(input?.url || input).includes('/rest/v1/')) return fetch(input, init);
  const headers = new Headers(init.headers || {});
  headers.set('x-view-as', viewAs.id);
  return fetch(input, { ...init, headers });
};
export const sb = configured ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { global: { fetch: fetchWithViewAs } }) : null;

// QR codes (loaded only when needed)
let qrLib = null;
export function loadQr() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  if (!qrLib) qrLib = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'assets/vendor/qrcode-generator-1.4.4.js';
    s.onload = () => res(window.qrcode); s.onerror = rej;
    document.head.appendChild(s);
  });
  return qrLib;
}

export const LOGIN_DOMAIN = '@users.edunest.local';
export const loginToEmail = login => String(login || '').trim().toLowerCase() + LOGIN_DOMAIN;

let onSessionLost = () => {};
export function setSessionLostHandler(fn) { onSessionLost = fn; }

// Database functions raise an UPPER_CASE code; turn it into an Error with that code.
export async function rpc(name, args = {}) {
  const { data, error } = await sb.rpc(name, args);
  if (error) {
    const err = new Error(error.message || 'ERROR');
    err.code = (String(error.message || '').match(/[A-Z][A-Z_]{3,}/) || [''])[0];
    if (err.code === 'BLOCKED' || err.code === 'NOT_AUTHENTICATED' || error.code === 'PGRST301' || /JWT/i.test(error.message || '')) {
      onSessionLost(err.code === 'BLOCKED' ? 'BLOCKED' : 'NOT_AUTHENTICATED');
    }
    throw err;
  }
  return data;
}

export async function signIn(login, password) {
  const { error } = await sb.auth.signInWithPassword({ email: loginToEmail(login), password });
  if (error) {
    const e = new Error(error.message);
    e.code = /banned/i.test(error.message) ? 'BLOCKED' : /invalid/i.test(error.message) ? 'WRONG_LOGIN' : 'SIGN_IN_FAILED';
    throw e;
  }
}
export const signOut = () => sb.auth.signOut();

export const fileUrl = path => (path ? sb.storage.from('materials').getPublicUrl(path).data.publicUrl : '');
export async function uploadMaterial(file) {
  const safe = String(file.name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = Date.now() + '-' + safe;
  const { error } = await sb.storage.from('materials').upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (error) { const e = new Error(error.message); e.code = 'UPLOAD_FAILED'; throw e; }
  return { path, name: file.name };
}
export async function removeMaterialFile(path) {
  if (path) await sb.storage.from('materials').remove([path]);
}

const MESSAGES = {
  WRONG_LOGIN: 'Wrong login or password.',
  SIGN_IN_FAILED: 'Could not sign in. Please try again.',
  BLOCKED: 'Your account is blocked. Contact the administrator.',
  NOT_AUTHENTICATED: 'Your session has ended. Please sign in again.',
  FORBIDDEN: 'You do not have access to this.',
  INVALID_LOGIN: 'Login must be 3–32 characters: letters, numbers, dot, dash or underscore.',
  LOGIN_TAKEN: 'This login is already taken.',
  PASSWORD_TOO_SHORT: 'The password needs at least 8 characters.',
  NAME_REQUIRED: 'Please enter the name.',
  INVALID_ROLE: 'Please choose a role.',
  INVALID_STATUS: 'Please choose a status.',
  INVALID_STAGE: 'Please choose a valid stage.',
  USER_NOT_FOUND: 'This account no longer exists.',
  CANNOT_BLOCK_SELF: 'You cannot block your own account.',
  CANNOT_CHANGE_OWN_ROLE: 'You cannot change your own role.',
  OBSERVERS_COUNT: 'Choose 1 to 3 teachers to observe.',
  NOT_A_CANDIDATE: 'Please choose a candidate.',
  CANDIDATE_NOT_FOUND: 'This candidate does not exist.',
  NOT_A_TEACHER: 'Only active teachers can be chosen.',
  MENTOR_AS_OBSERVER: "The candidate's mentor cannot observe their own mentee.",
  INVALID_DATE: 'Please choose a valid date and time.',
  INVALID_TYPE: 'Please choose the type.',
  INVALID_LEVEL: 'Please choose a valid level.',
  NO_ACTIVE_STANDARD: 'There is no active lesson standard. Publish one first.',
  LESSON_NOT_FOUND: 'This lesson no longer exists.',
  ASSIGNMENT_NOT_FOUND: 'This observer assignment no longer exists.',
  ALREADY_OBSERVER: 'This teacher already observes this lesson.',
  ALREADY_DECIDED: 'This lesson has already been decided.',
  ALREADY_SUBMITTED: 'Your scores were already submitted.',
  INCOMPLETE_SCORES: 'Please give a band for every criterion.',
  INVALID_BAND: 'Bands must be whole numbers from 1 to 9.',
  INVALID_OUTCOME: 'Please choose approve or decline.',
  NOT_YOUR_ASSIGNMENT: 'This lesson is not assigned to you.',
  NOT_ENOUGH_SCORES: 'Wait for the observers: 2 must submit their scores (or 1, when only one teacher observes).',
  LAST_OBSERVER: 'A lesson needs at least one observer. Add another teacher first, then remove this one.',
  NOTE_REQUIRED: 'Please write a note: your decision differs from the calculated result.',
  JOURNAL_FIELDS_REQUIRED: 'Please fill in the date, teacher, techniques and what you will use.',
  FILE_OR_LINK_REQUIRED: 'Add a file or a link.',
  MATERIAL_NOT_FOUND: 'This material no longer exists.',
  TITLE_REQUIRED: 'Please enter a title.',
  VIDEO_REQUIRED: 'Please add the video link.',
  REFERENCE_INCOMPLETE: 'Give a reference band for every criterion.',
  NO_CRITERIA: 'Add at least one criterion.',
  AREA_REQUIRED: 'Every criterion needs an area.',
  DUPLICATE_ORDER: 'Two criteria have the same position. Please reload and try again.',
  DRAFT_EMPTY: 'The draft has no criteria.',
  NO_DRAFT: 'There are no unpublished changes.',
  NOT_FOUND: 'This item no longer exists.',
  NOT_YOUR_MENTEE: 'You can only read the journals of your mentees.',
  UPLOAD_FAILED: 'The file could not be uploaded. Please try again.',
  PREVIEW_READ_ONLY: 'This is a preview: changes are switched off while you view the site as someone else.',
  LESSON_CANCELLED: 'This lesson was cancelled.',
  WRONG_PASSWORD: 'Your current password is not right.',
  INVALID_CHAT_ID: 'A Telegram chat id is a number, for example 123456789.',
  CANNOT_DELETE_SELF: 'You cannot delete your own account.',
  HAS_HISTORY: 'This person already has lessons, scores or journal entries. Block the account instead, so the records stay.',
  FEEDBACK_NOT_FOUND: 'This feedback link is not valid.',
  FEEDBACK_CLOSED: 'Feedback for this lesson is closed.',
  FEEDBACK_INCOMPLETE: 'Please answer all four questions.',
  FEEDBACK_FULL: 'This lesson already has enough answers. Thank you!',
  QUIZ_INCOMPLETE: 'Please answer every question.',
  QUIZ_EMPTY: 'There are no questions yet.',
  QUESTION_REQUIRED: 'Please write the question.',
  OPTIONS_COUNT: 'Give 2 to 6 answer options.',
  CORRECT_REQUIRED: 'Choose which answer is correct.'
};
// Friendly text for any error; unknown errors keep the server's own words so they can be reported.
export function errorText(err) {
  const code = err?.code || (String(err?.message || '').match(/[A-Z][A-Z_]{3,}/) || [''])[0];
  if (MESSAGES[code]) return MESSAGES[code];
  if (/Failed to fetch|NetworkError|network/i.test(err?.message || '')) return 'No connection to the server. Check the internet and try again.';
  return 'Something went wrong. Please try again.' + (err?.message ? ' Details: ' + String(err.message).slice(0, 160) : '');
}
