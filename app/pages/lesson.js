// Boss: one lesson (scores, result, decision) and its printable report.
import { html, useState, Button, Icon, PageHeader, CardHead, Loader, Empty, Badge, Chips, SlideOver, Dialog, ErrorBox,
  useLoad, useAction, toast } from '../ui.js';
import { rpc } from '../api.js';
import { fmtDateTime, fmtDate, band1, bandColor, lessonType, LESSON_STATUS } from '../util.js';

const recLabel = r => (r === 'ready' ? 'Ready' : 'Not ready yet');

export function BossLesson({ params }) {
  const d = useLoad(() => rpc('boss_get_lesson', { p_lesson_id: params.id }), [params.id]);
  const [outcome, setOutcome] = useState('');
  const [note, setNote] = useState('');
  const [ask, setAsk] = useState(false);
  const [adding, setAdding] = useState(false);
  const [reopen, setReopen] = useState(null);
  const [run, busy, error, setError] = useAction();

  if (d.loading && !d.data) return html`<${Loader} />`;
  if (d.error) return html`<${PageHeader} title="Lesson" back=${{ href: '#/boss/lessons', label: 'Trial lessons' }} /><${ErrorBox} error=${d.error} />`;
  const { lesson: l, candidate: c, observers, result: r, decision } = d.data;
  const submitted = observers.filter(o => o.submitted);
  const override = outcome && ((outcome === 'approved') !== (r.recommendation === 'ready'));

  const openDecide = () => {
    setError(null);
    if (!outcome) { setError('Choose Approve or Decline first.'); return; }
    if (r.submitted_count < 2) { setError('At least 2 observers must submit their scores before deciding.'); return; }
    if (override && !note.trim()) { setError('Please write a note: your decision differs from the calculated result.'); return; }
    setAsk(true);
  };
  const decide = () => run(async () => {
    const x = await rpc('boss_decide', { p_lesson_id: l.id, p_outcome: outcome, p_note: note });
    setAsk(false); await d.reload();
    toast((x.outcome === 'approved' ? 'Lesson approved.' : 'Lesson declined.') + (x.to_probation ? ' The candidate is now on probation.' : '') + ' The candidate can see the result.');
  });
  const doReopen = () => run(async () => {
    await rpc('boss_reopen_score', { p_assignment_id: reopen.assignment_id });
    setReopen(null); await d.reload(); toast(reopen.name + ' can change their scores again.');
  });
  const [statusText, statusKind] = LESSON_STATUS[l.status] || [l.status, ''];

  return html`
    <${PageHeader} title=${c.full_name} subtitle=${[lessonType(l.type), fmtDateTime(l.scheduled_at), l.group_name, l.topic].filter(Boolean).join(' · ')}
      back=${{ href: '#/boss/lessons', label: 'Trial lessons' }}>
      <${Badge} kind=${statusKind}>${statusText}</${Badge}>
      <${Button} kind="secondary" icon="printer" href=${'#/boss/report/' + l.id}>Report</${Button}>
    </${PageHeader}>
    ${r.disagreements.length ? html`<p class="warn-box"><${Icon} name="triangle-alert" size=${16} style=${{ verticalAlign: '-3px' }} /> Observers disagree by 3 or more bands on: ${r.disagreements.join(', ')}. You can add another observer.</p>` : null}
    <div class="split">
      <div class="stack">
        <div class="card flush"><${CardHead} icon="list-checks" title="Bands by criterion" />
          <div class="table-wrap"><table class="table"><thead><tr><th>Criterion</th>${submitted.map(o => html`<th>${o.name.split(' ')[0]}</th>`)}<th>Band</th></tr></thead>
            <tbody>${r.criteria.map(cr => html`<tr>
              <td><div class="strong">${cr.sort_order}. ${cr.name}${cr.must_pass ? html` <${Badge} kind="warning">Must pass</${Badge}>` : null}</div><div class="caption">${cr.area}</div></td>
              ${submitted.map(o => { const s = o.scores.find(x => x.criterion_id === cr.criterion_id); return html`<td title=${s?.comment || ''}>${s ? s.band : '—'}${s?.comment ? html` <${Icon} name="message-square" size=${12} color="var(--muted)" />` : null}</td>`; })}
              <td><span class="strong" style=${{ color: cr.band_avg != null ? bandColor(cr.band_avg) : 'var(--muted)' }}>${band1(cr.band_avg)}</span>
                ${cr.disagreement ? html` <${Icon} name="triangle-alert" size=${14} color="var(--am)" />` : null}</td></tr>`)}</tbody></table></div></div>
        <div class="card flush"><${CardHead} icon="users" title="Observers">${decision ? null : html`<${Button} kind="secondary" small icon="user-plus" onClick=${() => setAdding(true)}>Add observer</${Button}>`}</${CardHead}>
          <div class="list">${observers.map(o => html`<div class="list-row" style="align-items:flex-start">
            <div class="grow"><span class="strong">${o.name}</span>
              <span class="caption">${o.submitted ? 'Submitted ' + fmtDateTime(o.submitted_at) : 'Not submitted yet'}${o.telegram_sent ? '' : ' · not notified by Telegram'}</span>
              ${o.overall_comment ? html`<span class="pre" style="margin-top:4px">“${o.overall_comment}”</span>` : null}
              ${o.scores.filter(s => s.comment).map(s => html`<span class="caption">${(r.criteria.find(x => x.criterion_id === s.criterion_id) || {}).name}: ${s.comment}</span>`)}</div>
            ${o.submitted ? html`<${Badge} kind="success">Submitted</${Badge}>` : html`<${Badge} kind="warning">Waiting</${Badge}>`}
            ${o.submitted && !decision ? html`<${Button} kind="ghost" small icon="undo-2" onClick=${() => setReopen(o)}>Reopen</${Button}>` : null}
          </div>`)}</div></div>
      </div>
      <div class="stack">
        <div class="card"><${CardHead} icon="scale" title="Result" />
          <div class="row-flex"><span class="display" style=${{ color: r.overall != null ? bandColor(r.overall) : 'var(--muted)' }}>${r.overall != null ? Number(r.overall).toFixed(1) : '—'}</span>
            <div class="stack sm" style="gap:2px"><span class="caption">Overall band${r.overall_raw != null ? ' (average ' + Number(r.overall_raw).toFixed(2) + ')' : ''}</span>
              <${Badge} kind=${r.recommendation === 'ready' ? 'success' : 'warning'}>${recLabel(r.recommendation)}</${Badge}></div></div>
          <div class="stack sm">
            <${Check} ok=${r.overall != null && r.overall >= 6} text="Overall band 6.0 or more" />
            <${Check} ok=${r.must_pass_ok} text="Every must-pass criterion 6.0 or more" />
            <${Check} ok=${r.none_below_4} text="No criterion below 4.0" />
            <${Check} ok=${r.submitted_count >= 2} text=${`${r.submitted_count} of ${observers.length} observers submitted (2 needed)`} />
          </div></div>
        ${decision ? html`<div class="card"><${CardHead} icon="shield-check" title="Decision" />
            <div class="row-flex"><${Badge} kind=${decision.outcome === 'approved' ? 'success' : 'danger'}>${decision.outcome === 'approved' ? 'Approved' : 'Declined'}</${Badge}>
              <span class="strong">Band ${Number(decision.overall_band).toFixed(1)}</span></div>
            <p class="caption">By ${decision.boss_name || 'the boss'} on ${fmtDateTime(decision.created_at)} · calculated: ${recLabel(decision.recommended)}</p>
            ${decision.note ? html`<p class="pre">${decision.note}</p>` : null}</div>`
          : html`<div class="card"><${CardHead} icon="shield-check" title="Your decision" />
            <${Chips} square options=${[['approved', 'Approve'], ['declined', 'Decline']]} value=${outcome} onChange=${v => { setOutcome(v); setError(null); }} />
            <div class="field"><label for="note">Note for the candidate${override ? ' (required)' : ' (optional)'}</label>
              <textarea id="note" class="input" rows="3" value=${note} onInput=${e => setNote(e.target.value)} placeholder="Strengths and the next step"></textarea>
              ${override ? html`<p class="hint">Your decision differs from the calculated result, so a note is needed.</p>` : null}</div>
            <${ErrorBox} error=${error} />
            <${Button} onClick=${openDecide}>Decide</${Button}></div>`}
      </div>
    </div>
    ${ask ? html`<${Dialog} title=${outcome === 'approved' ? 'Approve this lesson?' : 'Decline this lesson?'} onClose=${() => setAsk(false)}
      footer=${html`<${Button} kind="secondary" onClick=${() => setAsk(false)}>Cancel</${Button}><${Button} kind=${outcome === 'approved' ? 'success' : 'danger'} busy=${busy} onClick=${decide}>${outcome === 'approved' ? 'Approve' : 'Decline'}</${Button}>`}>
      <p class="muted">The decision cannot be changed. ${c.full_name} will see the bands, the comments and your note${outcome === 'approved' && l.type === 'full' ? ', and moves to Probation' : ''}.</p>
      <${ErrorBox} error=${error} /></${Dialog}>` : null}
    ${reopen ? html`<${Dialog} title=${'Reopen ' + reopen.name + "'s scores?"} onClose=${() => setReopen(null)}
      footer=${html`<${Button} kind="secondary" onClick=${() => setReopen(null)}>Cancel</${Button}><${Button} busy=${busy} onClick=${doReopen}>Reopen</${Button}>`}>
      <p class="muted">Their bands stay as they are, but they no longer count until they submit again.</p><${ErrorBox} error=${error} /></${Dialog}>` : null}
    ${adding ? html`<${AddObserver} lesson=${l} candidate=${c} observers=${observers} onClose=${() => setAdding(false)} onSaved=${() => { setAdding(false); d.reload(); }} />` : null}`;
}

const Check = ({ ok, text }) => html`<div class="row-flex"><${Icon} name=${ok ? 'circle-check' : 'x'} size=${16} color=${ok ? 'var(--em)' : 'var(--ro)'} /><span>${text}</span></div>`;

function AddObserver({ lesson, candidate, observers, onClose, onSaved }) {
  const teachers = useLoad(() => rpc('boss_list_people', { p_role: 'teacher' }));
  const [pick, setPick] = useState('');
  const [run, busy, error] = useAction();
  const used = observers.map(o => o.observer_id);
  const list = (teachers.data || []).filter(t => !used.includes(t.id) && t.id !== candidate.mentor_id);
  const save = () => run(async () => {
    const r = await rpc('boss_add_observer', { p_lesson_id: lesson.id, p_observer_id: pick || null });
    toast(r.telegram_sent ? 'Observer added and notified.' : 'Observer added. They were not notified by Telegram.'); onSaved();
  });
  return html`<${SlideOver} title="Add an observer" onClose=${onClose}
    footer=${html`<${Button} kind="secondary" onClick=${onClose}>Cancel</${Button}><${Button} busy=${busy} disabled=${!pick} onClick=${save}>Add observer</${Button}>`}>
    <p class="muted">The teacher scores the lesson like the others. The candidate's mentor and current observers are not listed.</p>
    ${teachers.loading && !teachers.data ? html`<${Loader} />` : list.length ? html`<${Chips} options=${list.map(t => [t.id, t.name + (t.telegram_linked ? '' : ' · no Telegram')])} value=${pick} onChange=${setPick} />`
      : html`<${Empty} icon="users" title="Nobody else to add" text="Every active teacher already observes this lesson or is the candidate's mentor." />`}
    <${ErrorBox} error=${error} />
  </${SlideOver}>`;
}

export function BossReport({ params }) {
  const d = useLoad(() => rpc('boss_get_lesson', { p_lesson_id: params.id }), [params.id]);
  if (d.loading && !d.data) return html`<${Loader} />`;
  if (d.error) return html`<div class="report"><${ErrorBox} error=${d.error} /></div>`;
  const { lesson: l, candidate: c, observers, result: r, decision } = d.data;
  const submitted = observers.filter(o => o.submitted);
  const comments = submitted.flatMap(o => [...(o.overall_comment ? [['Overall', o.overall_comment]] : []),
    ...o.scores.filter(s => s.comment).map(s => [(r.criteria.find(x => x.criterion_id === s.criterion_id) || {}).name, s.comment])]);
  return html`<div class="report">
    <div class="row-flex no-print"><a class="back" href=${'#/boss/lesson/' + l.id}><${Icon} name="arrow-left" size=${16} />Back to the lesson</a><span class="spacer"></span>
      <${Button} icon="printer" onClick=${() => window.print()}>Print</${Button}></div>
    <div class="row-flex"><span class="brand-mark"><${Icon} name="graduation-cap" /></span><div><div class="section-title">Edunest — Trial lesson report</div>
      <div class="caption">Printed ${fmtDate(new Date())}</div></div></div>
    <table><tbody>
      <tr><th>Candidate</th><td>${c.full_name}</td><th>Lesson</th><td>${lessonType(l.type)}</td></tr>
      <tr><th>Date</th><td>${fmtDateTime(l.scheduled_at)}</td><th>Group</th><td>${l.group_name || '—'}</td></tr>
      <tr><th>Topic</th><td>${l.topic || '—'}</td><th>Observers</th><td>${submitted.length} submitted</td></tr>
    </tbody></table>
    <div class="row-flex"><span class="display">${r.overall != null ? Number(r.overall).toFixed(1) : '—'}</span>
      <div><div class="strong">Overall band · ${recLabel(r.recommendation)}</div><div class="caption">Must-pass criteria ${r.must_pass_ok ? 'met' : 'not met'} · ${r.none_below_4 ? 'no criterion below 4' : 'a criterion is below 4'}</div></div></div>
    <table><thead><tr><th>Area</th><th>Criterion</th><th>Bands</th><th>Average</th></tr></thead>
      <tbody>${r.criteria.map(cr => html`<tr><td>${cr.area}</td><td>${cr.name}${cr.must_pass ? ' *' : ''}</td><td>${cr.bands.join(', ') || '—'}</td><td><b>${band1(cr.band_avg)}</b></td></tr>`)}</tbody></table>
    <p class="caption">* must-pass criterion</p>
    ${comments.length ? html`<div class="stack sm"><div class="card-title">Comments</div>${comments.map(([k, v]) => html`<p><b>${k}:</b> ${v}</p>`)}</div>` : null}
    <div class="stack sm"><div class="card-title">Decision</div>
      ${decision ? html`<p><b>${decision.outcome === 'approved' ? 'Approved' : 'Declined'}</b>, band ${Number(decision.overall_band).toFixed(1)}, ${fmtDate(decision.created_at)}${decision.note ? ' — ' + decision.note : ''}</p>` : html`<p class="muted">Not decided yet.</p>`}</div>
    <div class="sign"><div>Boss</div><div>Candidate</div></div>
  </div>`;
}
