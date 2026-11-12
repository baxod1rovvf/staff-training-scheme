// App entry: sign-in state, hash router (#/boss/lessons), layout with the role's navigation.
import { html, render, useState, useEffect } from '../assets/vendor/preact-htm-3.1.1.js';
import { sb, configured, rpc, signOut, setSessionLostHandler } from './api.js';
import { Icon, ToastHost, Loader, toast } from './ui.js';
import { initials, roleLabel } from './util.js';
import { LoginPage } from './pages/login.js';
import { CreatorAccounts } from './pages/creator.js';
import { BossDashboard, BossCandidates, BossCandidate, BossLessons, BossStandard, BossMaterials, BossCalibration } from './pages/boss.js';
import { BossLesson, BossReport } from './pages/lesson.js';
import { TeacherHome, TeacherScore, TeacherCalibration, TeacherMentee } from './pages/teacher.js';
import { CandidateHome, CandidateResult, CandidateMaterials, CandidateJournal } from './pages/candidate.js';

const NAV = {
  creator: [['creator', 'Accounts', 'user-cog']],
  boss: [['boss', 'Dashboard', 'layout-dashboard'], ['boss/candidates', 'Candidates', 'users'], ['boss/lessons', 'Trial lessons', 'calendar-check'],
    ['boss/standard', 'Lesson standard', 'scale'], ['boss/materials', 'Materials', 'folder-open'], ['boss/calibration', 'Calibration', 'target']],
  teacher: [['teacher', 'My lessons', 'clipboard-check'], ['teacher/calibration', 'Calibration', 'target']],
  candidate: [['candidate', 'My progress', 'graduation-cap'], ['candidate/materials', 'Materials', 'book-open'], ['candidate/journal', 'Shadowing journal', 'notebook-pen']]
};

const ROUTES = [
  ['creator', 'creator', CreatorAccounts],
  ['boss', 'boss', BossDashboard], ['boss/candidates', 'boss', BossCandidates], ['boss/candidate/:id', 'boss', BossCandidate],
  ['boss/lessons', 'boss', BossLessons], ['boss/lesson/:id', 'boss', BossLesson], ['boss/report/:id', 'boss', BossReport, 'bare'],
  ['boss/standard', 'boss', BossStandard], ['boss/materials', 'boss', BossMaterials], ['boss/calibration', 'boss', BossCalibration],
  ['teacher', 'teacher', TeacherHome], ['teacher/score/:id', 'teacher', TeacherScore], ['teacher/calibration', 'teacher', TeacherCalibration],
  ['teacher/mentee/:id', 'teacher', TeacherMentee],
  ['candidate', 'candidate', CandidateHome], ['candidate/result/:id', 'candidate', CandidateResult],
  ['candidate/materials', 'candidate', CandidateMaterials], ['candidate/journal', 'candidate', CandidateJournal]
];

const currentPath = () => location.hash.replace(/^#\/?/, '').split('?')[0].replace(/\/$/, '');
function match(path) {
  const parts = path.split('/');
  for (const [pattern, role, Page, mode] of ROUTES) {
    const p = pattern.split('/');
    if (p.length !== parts.length) continue;
    const params = {};
    if (p.every((seg, i) => (seg.startsWith(':') ? (params[seg.slice(1)] = decodeURIComponent(parts[i]), true) : seg === parts[i]))) {
      return { role, Page, mode, params, pattern };
    }
  }
  return null;
}

function Sidebar({ me, path }) {
  const items = NAV[me.role] || [];
  const isActive = target => path === target || (target !== me.role && path.startsWith(target + '/')) ||
    (target === 'boss/lessons' && path.startsWith('boss/lesson/')) || (target === 'boss/candidates' && path.startsWith('boss/candidate/'));
  return html`<header class="sidebar">
    <div class="sidebar-top">
      <a class="brand" href=${'#/' + me.role}><span class="brand-mark"><${Icon} name="graduation-cap" /></span>
        <span><span class="brand-name">Edunest</span><br/><span class="caption" style="color:var(--sb-text)">${me.role === 'creator' ? 'Creator panel' : roleLabel(me.role)}</span></span></a>
      <nav class="nav" aria-label="Main">${items.map(([href, label, icon]) => html`
        <a href=${'#/' + href} class=${isActive(href) ? 'active' : ''} aria-current=${isActive(href) ? 'page' : null}><${Icon} name=${icon} />${label}</a>`)}</nav>
    </div>
    <div class="user-box">
      <span class="avatar">${initials(me.full_name)}</span>
      <div class="user-text" style="flex:1;min-width:0"><div class="user-name">${me.full_name}</div><div class="user-login">@${me.login}</div></div>
      <button class="icon-btn" title="Sign out" aria-label="Sign out" onClick=${() => signOut()}><${Icon} name="log-out" /></button>
    </div>
  </header>`;
}

function SetupNotice() {
  return html`<div class="setup card"><h1 class="page-title">Almost ready</h1>
    <p>The app is not connected to its database yet. Open <code>config.js</code> in the repository and fill in
    <code>supabaseUrl</code> and <code>supabaseAnonKey</code> from Supabase → Project Settings → API. See the README for all steps.</p></div>`;
}

function App() {
  const [path, setPath] = useState(currentPath());
  const [me, setMe] = useState(undefined); // undefined = loading, null = signed out
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const h = () => { setPath(currentPath()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);

  useEffect(() => {
    if (!configured) return;
    setSessionLostHandler(code => { setNotice(code === 'BLOCKED' ? 'Your account is blocked. Contact the administrator.' : 'Your session has ended. Please sign in again.'); signOut(); });
    const load = async session => {
      if (!session) { setMe(null); return; }
      try { setMe(await rpc('me')); } catch (e) { setMe(null); }
    };
    sb.auth.getSession().then(({ data }) => load(data.session));
    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') load(session);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!configured) return html`<${SetupNotice} />`;
  if (me === undefined) return html`<div class="boot"><${Loader} /></div>`;
  if (!me) return html`<${LoginPage} notice=${notice} onNotice=${setNotice} /><${ToastHost} />`;

  const m = match(path);
  if (!m || m.role !== me.role) {
    // Unknown address or another role's page: go to this role's start page
    if (path !== me.role) { location.replace('#/' + me.role); }
    return html`<div class="boot"><${Loader} /></div>`;
  }
  const { Page, params, mode } = m;
  if (mode === 'bare') return html`<${Page} me=${me} params=${params} /><${ToastHost} />`;
  return html`<div class="shell"><${Sidebar} me=${me} path=${path} />
    <main class="main" id="main"><${Page} me=${me} params=${params} key=${path} /></main><${ToastHost} /></div>`;
}

window.addEventListener('unhandledrejection', e => { console.error(e.reason); });
render(html`<${App} />`, document.getElementById('app'));
export { toast };
