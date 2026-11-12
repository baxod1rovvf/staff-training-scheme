// Public page students open from the QR code: 4 quick questions, no sign-in.
import { html, useState, Button, Icon, Loader, ErrorBox, useLoad, useAction } from '../ui.js';
import { rpc } from '../api.js';
import { fmtDate } from '../util.js';
import { FB_QUESTIONS } from './lesson.js';

const FACES = ['😞', '🙁', '😐', '🙂', '😄'];

export function FeedbackPage({ token }) {
  const form = useLoad(() => rpc('feedback_form', { p_token: token }), [token]);
  const doneKey = 'edunest-feedback-' + token;
  let already = false;
  try { already = !!localStorage.getItem(doneKey); } catch (e) { already = false; }
  const [a, setA] = useState({});
  const [comment, setComment] = useState('');
  const [sent, setSent] = useState(already);
  const [msg, setMsg] = useState('');
  const [run, busy, error] = useAction();

  const send = () => {
    if (FB_QUESTIONS.some(([k]) => !a[k])) { setMsg('Please answer all four questions.'); return; }
    setMsg('');
    run(async () => {
      await rpc('feedback_submit', { p_token: token, p_understood: a.understood, p_clear: a.clear, p_spoke: a.spoke, p_enjoyed: a.enjoyed, p_comment: comment });
      try { localStorage.setItem(doneKey, '1'); } catch (e) { /* private mode */ }
      setSent(true);
    });
  };

  return html`<div class="report" style="max-width:520px">
    <div class="row-flex"><span class="brand-mark"><${Icon} name="graduation-cap" /></span><span class="section-title">Edunest</span></div>
    ${form.loading && !form.data ? html`<${Loader} />`
      : form.error ? html`<${ErrorBox} error=${form.error} />`
      : sent ? html`<div class="card" style="align-items:center;text-align:center"><span style="font-size:48px">🙏</span>
          <h1 class="section-title">Thank you!</h1><p class="muted">Your answers help your teacher get better. They are anonymous.</p></div>`
      : !form.data.open ? html`<div class="card"><p class="muted">Feedback for this lesson is closed. Thank you!</p></div>`
      : html`<div class="stack">
        <div class="stack sm"><h1 class="page-title">How was the lesson with ${form.data.teacher}?</h1>
          <p class="muted">${[fmtDate(form.data.scheduled_at), form.data.group_name].filter(Boolean).join(' · ')} · anonymous, takes 30 seconds</p></div>
        ${FB_QUESTIONS.map(([k, label]) => html`<div class="card" style="padding:var(--md)"><span class="strong">${label}</span>
          <div class="chips" role="group" aria-label=${label} style="justify-content:space-between;flex-wrap:nowrap">${FACES.map((f, i) => html`
            <button type="button" class=${'chip square' + (a[k] === i + 1 ? ' on' : '')} aria-pressed=${a[k] === i + 1} aria-label=${String(i + 1) + ' of 5'}
              style="flex:1;min-height:52px;font-size:24px;padding:0" onClick=${() => { setA({ ...a, [k]: i + 1 }); setMsg(''); }}>${f}</button>`)}</div>
          <div class="row-flex caption"><span class="spacer">No</span><span>Yes, very</span></div></div>`)}
        <div class="field"><label for="fb-c">Anything else? (optional)</label>
          <textarea id="fb-c" class="input" rows="3" maxlength="500" value=${comment} onInput=${e => setComment(e.target.value)} placeholder="What did you like? What was difficult?"></textarea></div>
        ${msg ? html`<p class="error-text">${msg}</p>` : null}<${ErrorBox} error=${error} />
        <${Button} block busy=${busy} onClick=${send}>Send</${Button}>
      </div>`}
  </div>`;
}
