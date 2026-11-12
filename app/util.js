// Shared constants and formatting.
export const STAGES = [
  ['shadowing', 'Shadowing'], ['micro_teaching', 'Micro-teaching'], ['full_trial', 'Full trial'],
  ['decision', 'Decision'], ['probation', 'Probation'], ['certified', 'Certified'], ['declined', 'Declined']
];
export const stageLabel = s => (STAGES.find(x => x[0] === s) || [s, '—'])[1];
export const stageKind = s => ({ shadowing: '', micro_teaching: 'info', full_trial: 'info', decision: 'warning', probation: 'success', certified: 'success', declined: 'danger' }[s] || '');
export const ROLES = [['boss', 'Boss'], ['teacher', 'Teacher'], ['candidate', 'Candidate'], ['creator', 'Creator']];
export const roleLabel = r => (ROLES.find(x => x[0] === r) || [r, r])[1];
export const TYPES = [['slides', 'Slides', 'presentation'], ['exercises', 'Exercises', 'file-text'], ['pairwork_games', 'Pairwork games', 'users']];
export const typeLabel = t => (TYPES.find(x => x[0] === t) || [t, 'Material'])[1];
export const typeIcon = t => (TYPES.find(x => x[0] === t) || [t, '', 'file-text'])[2];
export const LEVELS = ['Beginner', 'Elementary', 'Pre-Intermediate', 'Intermediate', 'Upper-Intermediate', 'Advanced'];
export const lessonType = t => (t === 'full' ? 'Full trial lesson' : 'Micro-teaching');

const d = v => (v ? new Date(v) : null);
const ok = x => x && !isNaN(x);
export const fmtDate = v => { const x = d(v); return ok(x) ? x.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; };
export const fmtDateTime = v => { const x = d(v); return ok(x) ? x.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''; };
export const fmtTime = v => { const x = d(v); return ok(x) ? x.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''; };
export const dayNum = v => { const x = d(v); return ok(x) ? String(x.getDate()) : ''; };
export const monthShort = v => { const x = d(v); return ok(x) ? x.toLocaleDateString('en-GB', { month: 'short' }) : ''; };
export const band1 = v => (v === null || v === undefined || v === '' ? '—' : Number(v).toFixed(1));
export const bandColor = v => { const b = Number(v); return b >= 7 ? 'var(--em)' : b >= 5 ? 'var(--indigo)' : 'var(--ro)'; };
export const initials = name => String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
export const lessonMeta = l => [fmtTime(l.scheduled_at), l.group_name, l.topic].filter(Boolean).join(' · ');
export const todayISO = () => { const x = new Date(); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };

export const LESSON_STATUS = {
  scheduled: ['Scoring', 'info'], awaiting_decision: ['Awaiting decision', 'warning'],
  approved: ['Approved', 'success'], declined: ['Declined', 'danger'], cancelled: ['Cancelled', '']
};
// <input type="datetime-local"> value for a date, in the browser's time zone
export const toLocalInput = v => { const x = new Date(v); if (isNaN(x)) return ''; x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };
export const appUrl = () => location.origin + location.pathname.replace(/index\.html$/, '');
