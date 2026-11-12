// Shared components (Preact + htm, no build step).
import { html, useState, useEffect, useCallback, useRef } from '../assets/vendor/preact-htm-3.1.1.js';
import { ICONS } from './icons.js';
import { errorText } from './api.js';
import { stageLabel, stageKind, dayNum, monthShort, lessonType, lessonMeta, LESSON_STATUS, initials } from './util.js';

export { html, useState, useEffect, useCallback, useRef };

export function Icon({ name, size = 18, color, style }) {
  return html`<svg xmlns="http://www.w3.org/2000/svg" width=${size} height=${size} viewBox="0 0 24 24" fill="none"
    stroke=${color || 'currentColor'} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
    style=${{ flex: 'none', ...(style || {}) }} dangerouslySetInnerHTML=${{ __html: ICONS[name] || '' }}></svg>`;
}

export function Button({ kind = 'primary', icon, busy, disabled, onClick, type = 'button', small, block, href, title, children }) {
  const cls = `btn ${kind}${small ? ' sm' : ''}${block ? ' block' : ''}`;
  const inner = html`${busy ? html`<span class="spinner"></span>` : icon ? html`<${Icon} name=${icon} size=${small ? 16 : 18} />` : null}${children}`;
  if (href) return html`<a class=${cls} href=${href} title=${title}>${inner}</a>`;
  return html`<button class=${cls} type=${type} disabled=${disabled || busy} onClick=${onClick} title=${title} aria-busy=${busy ? 'true' : null}>${inner}</button>`;
}

export function PageHeader({ title, subtitle, back, children }) {
  return html`
    ${back ? html`<a class="back" href=${back.href}><${Icon} name="arrow-left" size=${16} />${back.label}</a>` : null}
    <div class="page-header">
      <div class="text"><h1 class="page-title">${title}</h1>${subtitle ? html`<p class="muted">${subtitle}</p>` : null}</div>
      ${children ? html`<div class="actions">${children}</div>` : null}
    </div>`;
}

export const CardHead = ({ icon, title, children }) => html`
  <div class="card-head"><div class="title">${icon ? html`<${Icon} name=${icon} color="var(--indigo)" />` : null}<h2 class="card-title">${title}</h2></div>${children}</div>`;
export const Loader = () => html`<div class="loader"><span class="spinner lg"></span></div>`;
export const Empty = ({ icon = 'info', title, text, children }) => html`
  <div class="empty"><${Icon} name=${icon} size=${28} color="var(--muted)" /><p class="card-title">${title}</p>${text ? html`<p>${text}</p>` : null}${children}</div>`;
export const Badge = ({ kind = '', children }) => html`<span class=${'badge ' + kind}>${children}</span>`;
export const StageBadge = ({ stage }) => html`<${Badge} kind=${stageKind(stage)}>${stageLabel(stage)}</${Badge}>`;
export const ErrorBox = ({ error }) => (error ? html`<p class="error-box" role="alert">${typeof error === 'string' ? error : errorText(error)}</p>` : null);

export function Chips({ options, value, onChange, square, disabled }) {
  return html`<div class="chips" role="group">${options.map(([k, l]) => html`
    <button type="button" class=${'chip' + (square ? ' square' : '') + (value === k ? ' on' : '')} aria-pressed=${value === k}
      disabled=${disabled} onClick=${() => onChange(k)}>${l}</button>`)}</div>`;
}

export function BandPicker({ value, onChange, disabled, label }) {
  return html`<div class="bands" role="group" aria-label=${label || 'Band'}>${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => html`
    <button type="button" class=${'band' + (value === n ? ' on' : '')} aria-pressed=${value === n} disabled=${disabled}
      onClick=${() => onChange(n)}>${n}</button>`)}</div>`;
}

export function Field({ label, hint, children, id }) {
  return html`<div class="field"><label for=${id}>${label}</label>${children}${hint ? html`<p class="hint">${hint}</p>` : null}</div>`;
}

export function SlideOver({ title, onClose, footer, children }) {
  useEscape(onClose);
  return html`<div class="backdrop" onClick=${onClose}></div>
    <aside class="slideover" role="dialog" aria-modal="true" aria-label=${title}>
      <div class="slideover-head"><h2 class="section-title">${title}</h2>
        <button class="btn ghost" onClick=${onClose} aria-label="Close"><${Icon} name="x" /></button></div>
      <div class="slideover-body">${children}</div>
      ${footer ? html`<div class="slideover-foot">${footer}</div>` : null}
    </aside>`;
}

export function Dialog({ title, onClose, children, footer }) {
  useEscape(onClose);
  return html`<div class="backdrop" onClick=${onClose}></div>
    <div class="dialog" role="dialog" aria-modal="true" aria-label=${title}>
      <h2 class="section-title">${title}</h2>${children}
      <div class="actions" style="justify-content:flex-end">${footer}</div>
    </div>`;
}

function useEscape(fn) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') fn && fn(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [fn]);
}

// Toasts: toast('Saved') from anywhere; <ToastHost/> shows them.
let pushToast = () => {};
export const toast = (text, bad = false) => pushToast({ text, bad, id: Math.random() });
export function ToastHost() {
  const [t, setT] = useState(null);
  useEffect(() => { pushToast = setT; }, []);
  useEffect(() => { if (!t) return; const h = setTimeout(() => setT(null), t.bad ? 6000 : 3500); return () => clearTimeout(h); }, [t]);
  return t ? html`<div class=${'toast' + (t.bad ? ' bad' : '')} role="status"><${Icon} name=${t.bad ? 'triangle-alert' : 'circle-check'} color=${t.bad ? '#fff' : '#34D399'} />${t.text}</div>` : null;
}

// Loads data with a function; gives { data, error, loading, reload, setData }.
export function useLoad(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const seq = useRef(0);
  const reload = useCallback(async () => {
    const n = ++seq.current;
    setState(s => ({ ...s, loading: true, error: null }));
    try { const data = await fn(); if (n === seq.current) setState({ data, error: null, loading: false }); }
    catch (error) { if (n === seq.current) setState(s => ({ ...s, error, loading: false })); }
  }, deps);
  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload, setData: data => setState(s => ({ ...s, data })) };
}

// Runs an action once at a time; gives [run, busy, error, setError].
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = async fn => {
    if (busy) return;
    setBusy(true); setError(null);
    try { return await fn(); } catch (e) { setError(e); return undefined; } finally { setBusy(false); }
  };
  return [run, busy, error, setError];
}

export const DateTile = ({ at }) => html`<div class="date-tile"><b>${dayNum(at)}</b><span>${monthShort(at)}</span></div>`;
export const Person = ({ name, sub }) => html`<div class="person"><span class="avatar">${initials(name)}</span>
  <div style="min-width:0"><div class="strong ellipsis">${name}</div>${sub ? html`<div class="caption ellipsis">${sub}</div>` : null}</div></div>`;

export function LessonStatus({ l }) {
  if (l.decision) return html`<${Badge} kind=${l.decision.outcome === 'approved' ? 'success' : 'danger'}>${l.decision.outcome === 'approved' ? 'Approved' : 'Declined'} · ${Number(l.decision.overall_band).toFixed(1)}</${Badge}>`;
  const [label, kind] = LESSON_STATUS[l.status] || [l.status, ''];
  return html`<${Badge} kind=${kind}>${l.status === 'scheduled' ? `Scoring ${l.observers_submitted || 0}/${l.observers_total || 0}` : label}</${Badge}>`;
}

export function LessonRow({ l, href, showCandidate = true }) {
  return html`<a class="list-row" href=${href}>
    <${DateTile} at=${l.scheduled_at} />
    <div class="grow"><span class="strong ellipsis">${showCandidate ? l.candidate_name : lessonType(l.type)}</span>
      <span class="caption ellipsis">${[showCandidate ? lessonType(l.type) : null, lessonMeta(l)].filter(Boolean).join(' · ')}</span></div>
    ${l.has_disagreement ? html`<${Badge} kind="warning"><${Icon} name="triangle-alert" size=${12} />Disagreement</${Badge}>` : null}
    <${LessonStatus} l=${l} />
  </a>`;
}
