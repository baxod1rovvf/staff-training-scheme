// App entry: sign-in state, hash router (#/boss/lessons), layout with the role's navigation,
// and the creator's read-only "View as" mode.
import { html, render, useState, useEffect } from '../assets/vendor/preact-htm-3.1.1.js';
import { sb, configured, rpc, signOut, setSessionLostHandler, getViewAs, setViewAs } from './api.js';
import { Icon, ToastHost, Loader, Button, Dialog, ErrorBox, toast } from './ui.js';
import { initials, roleLabel } from './util.js';
import { LoginPage } from './pages/login.js';
import { CreatorAccounts } from './pages/creator.js';
import { BossDashboard, BossCandidates, BossCandidate, BossLessons, BossStandard, BossMaterials, BossCalibration, BossAnalytics, BossQuiz } from './pages/boss.js';
import { BossLesson, BossReport } from './pages/lesson.js';
import { TeacherHome, TeacherScore, TeacherCalibration, TeacherMentee } from './pages/teacher.js';
import { CandidateHome, CandidateResult, CandidateMaterials, CandidateJournal, CandidateQuiz } from './pages/candidate.js';
import { MyAccount } from './pages/account.js';
import { FeedbackPage } from './pages/feedback.js';

const NAV = {
  creator: [['creator', 'Accounts', 'user-cog']],
  boss: [['boss', 'Dashboard', 'layout-dashboard'], ['boss/candidates', 'Candidates', 'users'], ['boss/lessons', 'Trial lessons', 'calendar-check'],
    ['boss/analytics', 'Analytics', 'list-checks'], ['boss/standard', 'Lesson standard', 'scale'], ['boss/materials', 'Materials', 'folder-open'],
    ['boss/calibration', 'Calibration', 'target'], ['boss/quiz', 'Methods quiz', 'notebook']],
  teacher: [['teacher', 'My lessons', 'clipboard-check'], ['teacher/calibration', 'Calibration', 'target']],
  candidate: [['candidate', 'My progress', 'graduation-cap'], ['candidate/materials', 'Materials', 'book-open'],
    ['candidate/journal', 'Shadowing journal', 'notebook-pen'], ['candidate/quiz', 'Methods quiz', 'list-checks']]
};

const ROUTES = [
  ['creator', 'creator', CreatorAccounts],
  ['boss', 'boss', BossDashboard], ['boss/candidates', 'boss', BossCandidates], ['boss/candidate/:id', 'boss', BossCandidate],
  ['boss/lessons', 'boss', BossLessons], ['boss/lesson/:id', 'boss', BossLesson], ['boss/report/:id', 'boss', BossReport, 'bare'],
  ['boss/standard', 'boss', BossStandard], ['boss/materials', 'boss', BossMaterials], ['boss/calibration', 'boss', BossCalibration],
  ['boss/analytics', 'boss', BossAnalytics], ['boss/quiz', 'boss', BossQuiz],
  ['teacher', 'teacher', TeacherHome], ['teacher/score/:id', 'teacher', TeacherScore], ['teacher/calibration', 'teacher', TeacherCalibration],
  ['teacher/mentee/:id', 'teacher', TeacherMentee],
  ['candidate', 'candidate', CandidateHome], ['candidate/result/:id', 'candidate', CandidateResult],
  ['candidate/materials', 'candidate', CandidateMaterials], ['candidate/journal', 'candidate', CandidateJournal], ['candidate/quiz', 'candidate', CandidateQuiz],
  ['account', '*', MyAccount]
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

function Sidebar({ me, realMe, path, onViewAs }) {
  const items = [...(NAV[me.role] || []), ['account', 'My account', 'key-round']];
  const isActive = target => path === target || (target !== me.role && path.startsWith(target + '/')) ||
    (target === 'boss/lessons' && path.startsWith('boss/lesson/')) || (target === 'boss/candidates' && path.startsWith('boss/candidate/'));
  const viewing = getViewAs();
  return html`<header class="sidebar">
    <div class="sidebar-top">
      <a class="brand" href=${'#/' + me.role}><span class="brand-mark"><${Icon} name="graduation-cap" /></span>
        <span><span class="brand-name">Edunest</span><br/><span class="caption" style="color:var(--sb-text)">${me.role === 'creator' ? 'Creator panel' : roleLabel(me.role)}</span></span></a>
      <nav class="nav" aria-label="Main">${items.map(([href, label, icon]) => html`
        <a href=${'#/' + href} class=${isActive(href) ? 'active' : ''} aria-current=${isActive(href) ? 'page' : null}><${Icon} name=${icon} />${label}</a>`)}</nav>
      ${realMe.role === 'creator' ? html`<div class="nav view-as" aria-label="View the site as">
        <span class="nav-title">View the site as</span>
        ${[['boss', 'Boss', 'layout-dashboard'], ['teacher', 'Teacher', 'clipboard-check'], ['candidate', 'Candidate', 'graduation-cap']].map(([r, l, i]) => html`
          <a href="#" class=${viewing && viewing.role === r ? 'active' : ''} onClick=${e => { e.preventDefault(); onViewAs(r); }}><${Icon} name=${i} />${l}</a>`)}
      </div>` : null}
    </div>
    <div class="user-box">
      <span class="avatar">${initials(realMe.full_name)}</span>
      <div class="user-text" style="flex:1;min-width:0"><div class="user-name">${realMe.full_name}</div><div class="user-login">@${realMe.login}</div></div>
      <button class="icon-btn" title="Sign out" aria-label="Sign out" onClick=${() => { setViewAs(null); signOut(); }}><${Icon} name="log-out" /></button>
    </div>
  </header>`;
}

// Creator picks whose site to look at
function ViewAsPicker({ role, onPick, onClose }) {
  const [people, setPeople] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { rpc('creator_list_users').then(u => setPeople(u.filter(x => x.role === role))).catch(setError); }, [role]);
  return html`<${Dialog} title=${'View the site as a ' + roleLabel(role).toLowerCase()} onClose=${onClose}
    footer=${html`<${Button} kind="secondary" onClick=${onClose}>Cancel</${Button}>`}>
    <p class="muted">You see exactly what this person sees, with their data. Nothing can be changed while viewing.</p>
    <${ErrorBox} error=${error} />
    ${!people ? html`<${Loader} />` : !people.length ? html`<p class="muted">There is no ${roleLabel(role).toLowerCase()} account yet. Create one on the Accounts page.</p>`
      : html`<div class="list" style="max-height:50vh;overflow:auto;border:1px solid var(--border);border-radius:var(--r-sm)">${people.map(p => html`
        <button type="button" class="list-row" onClick=${() => onPick(p)}><span class="avatar" style="width:32px;height:32px;background:var(--indigo-s);color:var(--indigo);font-size:13px">${initials(p.full_name)}</span>
          <span class="grow"><span class="strong">${p.full_name}</span><span class="caption">@${p.login}${p.status === 'blocked' ? ' · blocked' : ''}</span></span></button>`)}</div>`}
  </${Dialog}>`;
}

function SetupNotice() {
  return html`<div class="setup card"><h1 class="page-title">Almost ready</h1>
    <p>The app is not connected to its database yet. Open <code>config.js</code> in the repository and fill in
    <code>supabaseUrl</code> and <code>supabaseAnonKey</code> from Supabase → Project Settings → API. See the README for all steps.</p></div>`;
}

function App() {
  const [path, setPath] = useState(currentPath());
  const [realMe, setRealMe] = useState(undefined); // undefined = loading, null = signed out
  const [me, setMe] = useState(null);              // the person whose pages are shown (differs in View as)
  const [notice, setNotice] = useState('');
  const [picking, setPicking] = useState(null);

  useEffect(() => {
    const h = () => { setPath(currentPath()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);

  const loadMe = async () => {
    const va = getViewAs();
    setViewAs(null);
    const real = await rpc('me');
    let shown = real;
    if (va && real.role === 'creator') {
      setViewAs(va);
      try { shown = await rpc('me'); } catch (e) { setViewAs(null); shown = real; }
    }
    setRealMe(real); setMe(shown);
  };

  useEffect(() => {
    if (!configured) return;
    setSessionLostHandler(code => { setViewAs(null); setNotice(code === 'BLOCKED' ? 'Your account is blocked. Contact the administrator.' : 'Your session has ended. Please sign in again.'); signOut(); });
    const load = async session => {
      if (!session) { setRealMe(null); setMe(null); return; }
      try { await loadMe(); } catch (e) { setRealMe(null); }
    };
    sb.auth.getSession().then(({ data }) => load(data.session));
    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') load(session);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const startViewAs = async person => {
    setPicking(null);
    setViewAs({ id: person.id, role: person.role, name: person.full_name });
    try { setMe(await rpc('me')); location.hash = '#/' + person.role; toast('Viewing as ' + person.full_name + ' (read-only)'); }
    catch (e) { setViewAs(null); toast('Could not open the view: ' + (e.message || ''), true); }
  };
  const exitViewAs = () => { setViewAs(null); setMe(realMe); location.hash = '#/creator'; };

  // Students' feedback page works without signing in
  if (path.startsWith('feedback/')) return html`<${FeedbackPage} token=${path.slice(9)} />`;
  if (!configured) return html`<${SetupNotice} />`;
  if (realMe === undefined) return html`<div class="boot"><${Loader} /></div>`;
  if (!realMe || !me) return html`<${LoginPage} notice=${notice} onNotice=${setNotice} /><${ToastHost} />`;

  const m = match(path);
  if (!m || (m.role !== me.role && m.role !== '*')) {
    if (path !== me.role) location.replace('#/' + me.role);
    return html`<div class="boot"><${Loader} /></div>`;
  }
  const { Page, params, mode } = m;
  const viewing = getViewAs();
  if (mode === 'bare') return html`<${Page} me=${me} params=${params} /><${ToastHost} />`;
  return html`<div class="shell"><${Sidebar} me=${me} realMe=${realMe} path=${path} onViewAs=${setPicking} />
    <main class="main" id="main">
      ${viewing ? html`<div class="preview-banner" role="status"><${Icon} name="eye" />
        <span class="spacer">Viewing as <b>${me.full_name}</b> (${roleLabel(me.role).toLowerCase()}). Read-only: nothing can be changed.</span>
        <${Button} small kind="secondary" icon="x" onClick=${exitViewAs}>Exit view</${Button}></div>` : null}
      <${Page} me=${me} params=${params} key=${path + (viewing ? viewing.id : '')} onChanged=${loadMe} />
    </main>
    ${picking ? html`<${ViewAsPicker} role=${picking} onPick=${startViewAs} onClose=${() => setPicking(null)} />` : null}
    <${ToastHost} /></div>`;
}

// Install on the phone: remember the browser's install offer for the My account page
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); window.__installPrompt = e; window.dispatchEvent(new Event('edunest-install-ready')); });
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
window.addEventListener('unhandledrejection', e => { console.error(e.reason); });
render(html`<${App} />`, document.getElementById('app'));
