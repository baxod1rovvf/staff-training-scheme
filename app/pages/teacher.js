import { html, useState, useEffect, Button, Icon, PageHeader, CardHead, Loader, Empty, Badge, StageBadge, Chips, Dialog, ErrorBox,
  DateTile, BandPicker, useLoad, useAction, toast } from '../ui.js';
import { rpc, getViewAs } from '../api.js';
import { lessonType, lessonMeta, fmtDateTime } from '../util.js';
import { JournalEntry } from './boss.js';

// ---------------------------------------------------------------- My lessons
export function TeacherHome() {
  const w = useLoad(() => rpc('teacher_my_work'));
  const [tab, setTab] = useState('todo');
  if (w.loading && !w.data) return html`<${Loader} />`;
  if (w.error) return html`<${ErrorBox} error=${w.error} />`;
  const todo = w.data.assignments.filter(a => !a.submitted && !a.decided);
  const done = w.data.assignments.filter(a => a.submitted || a.decided);
  const shown = tab === 'todo' ? todo : done;
  return html`
    <${PageHeader} title="My lessons" subtitle="Trial lessons you observe. Score each one after the lesson; the boss sees the result once the observers have submitted." />
    <${Chips} options=${[['todo', `To score (${todo.length})`], ['done', `Submitted (${done.length})`]]} value=${tab} onChange=${setTab} />
    <div class="card flush">
      ${shown.length ? html`<div class="list">${shown.map(a => html`<a class="list-row" href=${'#/teacher/score/' + a.assignment_id}>
        <${DateTile} at=${a.scheduled_at} />
        <div class="grow"><span class="strong ellipsis">${a.candidate_name}</span><span class="caption ellipsis">${lessonType(a.type)} · ${lessonMeta(a)}</span></div>
        <${Badge} kind=${a.decided ? 'success' : a.submitted ? 'info' : 'warning'}>${a.decided ? 'Decided' : a.submitted ? 'Submitted' : 'Score now'}</${Badge}></a>`)}</div>`
        : html`<${Empty} icon="clipboard-check" title=${tab === 'todo' ? 'Nothing to score' : 'Nothing submitted yet'}
            text="When the boss schedules a lesson for you to observe, it appears here and you get a Telegram message." />`}
    </div>
    ${w.data.mentees.length ? html`<div class="card flush"><${CardHead} icon="users" title="My mentees" />
      <div class="list">${w.data.mentees.map(m => html`<a class="list-row" href=${'#/teacher/mentee/' + m.id}>
        <div class="grow"><span class="strong">${m.name}</span><span class="caption">${m.journal_count} journal entr${m.journal_count === 1 ? 'y' : 'ies'}</span></div>
        <${StageBadge} stage=${m.stage} /><${Icon} name="chevron-down" style=${{ transform: 'rotate(-90deg)' }} color="var(--muted)" /></a>`)}</div></div>` : null}
    <a class="card" href="#/teacher/calibration" style="flex-direction:row;align-items:center">
      <${Icon} name="target" size=${24} color="var(--indigo)" />
      <div class="stack sm" style="gap:2px"><span class="strong">Practise with calibration lessons</span>
        <span class="caption">Score a recorded lesson and see how close you are to the agreed bands.</span></div></a>`;
}

// ---------------------------------------------------------------- Shared band form
function CriteriaForm({ criteria, bands, setBand, comments, setComment, locked }) {
  const [open, setOpen] = useState('');
  return html`${criteria.map(c => html`<div class=${'card criterion' + (bands[c.id] ? ' done' : '')}>
    <div class="stack sm" style="gap:2px"><span class="strong">${c.sort_order}. ${c.name}</span>
      <span class="caption">${c.area}${c.must_pass ? ' · must pass' : ''}</span></div>
    <${BandPicker} label=${c.name} value=${bands[c.id]} disabled=${locked} onChange=${n => setBand(c.id, n)} />
    <button type="button" class="link-btn" aria-expanded=${open === c.id} onClick=${() => setOpen(open === c.id ? '' : c.id)}>
      <${Icon} name=${open === c.id ? 'chevron-up' : 'chevron-down'} size=${16} />${open === c.id ? 'Hide descriptors' : 'What do the bands look like?'}</button>
    ${open === c.id ? html`<div class="descriptors">${['9', '7', '5', '3'].map(b => html`<span><b>Band ${b}:</b> ${c['desc_' + b] || '—'}</span>`)}</div>` : null}
    ${setComment ? html`<input class="input" aria-label=${'Comment on ' + c.name} placeholder="Comment (optional)" readonly=${locked}
      value=${comments[c.id] || ''} onInput=${e => setComment(c.id, e.target.value)} />` : null}
  </div>`)}`;
}

// ---------------------------------------------------------------- Score a lesson
export function TeacherScore({ params }) {
  const d = useLoad(() => rpc('teacher_get_scoring_form', { p_assignment_id: params.id }), [params.id]);
  const [bands, setBands] = useState(null);
  const [comments, setComments] = useState({});
  const [overall, setOverall] = useState('');
  const [msg, setMsg] = useState('');
  const [ask, setAsk] = useState(false);
  const [restored, setRestored] = useState(false);
  const [run, busy, error] = useAction();
  const draftKey = 'edunest-draft-' + params.id;
  const canDraft = d.data && !d.data.locked && !getViewAs();

  // Keep a draft on this device while scoring, so nothing is lost if the page closes
  useEffect(() => {
    if (!canDraft || bands === null) return;
    try { localStorage.setItem(draftKey, JSON.stringify({ bands, comments, overall, at: Date.now() })); } catch (e) { /* storage full or blocked */ }
  }, [bands, comments, overall, canDraft]);

  if (d.loading && !d.data) return html`<${Loader} />`;
  if (d.error) return html`<${PageHeader} title="Score lesson" back=${{ href: '#/teacher', label: 'My lessons' }} />
    <${Empty} icon="file-question" title="Lesson not found" text="This lesson is not assigned to you. Go back to My lessons." />`;
  const f = d.data;
  if (bands === null) {
    const b = {}, c = {};
    f.my_scores.forEach(s => { b[s.criterion_id] = s.band; if (s.comment) c[s.criterion_id] = s.comment; });
    let draft = null;
    if (!f.locked && !getViewAs()) { try { draft = JSON.parse(localStorage.getItem(draftKey) || 'null'); } catch (e) { draft = null; } }
    if (f.locked) { try { localStorage.removeItem(draftKey); } catch (e) { /* ignore */ } }
    const ids = new Set(f.criteria.map(x => x.id));
    const keep = o => Object.fromEntries(Object.entries(o || {}).filter(([k]) => ids.has(k)));
    if (draft && (Object.keys(keep(draft.bands)).length || draft.overall)) {
      setBands({ ...b, ...keep(draft.bands) }); setComments({ ...c, ...keep(draft.comments) }); setOverall(draft.overall || f.overall_comment || ''); setRestored(true);
    } else { setBands(b); setComments(c); setOverall(f.overall_comment || ''); }
    return null;
  }
  const scored = f.criteria.filter(c => bands[c.id]).length;
  const check = () => {
    const left = f.criteria.length - scored;
    if (left) { setMsg(`Choose a band for every criterion. ${left} ${left === 1 ? 'is' : 'are'} still empty.`); return; }
    setMsg(''); setAsk(true);
  };
  const submit = () => run(async () => {
    await rpc('teacher_submit_scores', { p_assignment_id: f.assignment_id,
      p_scores: f.criteria.map(c => ({ criterion_id: c.id, band: bands[c.id], comment: (comments[c.id] || '').trim() || null })), p_overall_comment: overall });
    try { localStorage.removeItem(draftKey); } catch (e) { /* ignore */ }
    setAsk(false); setRestored(false); setBands(null); await d.reload(); toast('Scores submitted. Thank you!');
  });
  const l = f.lesson;
  return html`
    <${PageHeader} title=${'Score ' + f.candidate_name} subtitle=${[lessonType(l.type), fmtDateTime(l.scheduled_at), l.group_name, l.topic].filter(Boolean).join(' · ')}
      back=${{ href: '#/teacher', label: 'My lessons' }} />
    ${f.locked ? html`<p class="info-box"><${Icon} name="lock" size=${16} style=${{ verticalAlign: '-3px' }} /> ${f.submitted ? 'You submitted these scores. Ask the boss to reopen them if you need to change something.' : 'This lesson has been decided.'}</p>` : null}
    ${restored && !f.locked ? html`<p class="info-box">Your unsent scores from earlier were restored. They are kept on this device until you submit.</p>` : null}
    <${CriteriaForm} criteria=${f.criteria} bands=${bands} setBand=${(id, n) => { setBands({ ...bands, [id]: n }); setMsg(''); }}
      comments=${comments} setComment=${(id, v) => setComments({ ...comments, [id]: v })} locked=${f.locked} />
    <div class="card"><div class="field"><label for="overall">Overall comment</label>
      <textarea id="overall" class="input" rows="3" readonly=${f.locked} value=${overall} onInput=${e => setOverall(e.target.value)} placeholder="Strengths and one thing to improve (optional)"></textarea></div></div>
    ${f.locked ? null : html`<div class="card sticky-bar">
      <div class="stack sm" style="gap:0"><span class="strong">${scored} of ${f.criteria.length} criteria scored</span>
        ${getViewAs() ? null : html`<span class="caption">Draft saved on this device</span>`}</div>
      ${msg ? html`<span class="error-text" style="flex:1 1 100%">${msg}</span>` : null}
      <${Button} icon="send" onClick=${check}>Submit scores (${scored}/${f.criteria.length})</${Button}></div>`}
    ${ask ? html`<${Dialog} title="Submit your scores?" onClose=${() => setAsk(false)}
      footer=${html`<${Button} kind="secondary" onClick=${() => setAsk(false)}>Cancel</${Button}><${Button} busy=${busy} onClick=${submit}>Submit</${Button}>`}>
      <p class="muted">After submitting you cannot change them unless the boss reopens them. Other observers never see your scores.</p>
      <${ErrorBox} error=${error} /></${Dialog}>` : null}`;
}

// ---------------------------------------------------------------- Calibration
export function TeacherCalibration() {
  const cal = useLoad(() => rpc('calibration_overview'));
  const [active, setActive] = useState(null);
  const [bands, setBands] = useState({});
  const [result, setResult] = useState(null);
  const [msg, setMsg] = useState('');
  const [run, busy, error] = useAction();
  if (cal.loading && !cal.data) return html`<${Loader} />`;
  if (cal.error) return html`<${ErrorBox} error=${cal.error} />`;
  const accColor = a => (a >= 85 ? 'var(--em)' : a >= 70 ? 'var(--am)' : 'var(--ro)');

  if (result) {
    return html`<button class="link-btn" onClick=${() => { setResult(null); setActive(null); }}><${Icon} name="arrow-left" size=${16} />All calibration lessons</button>
      <div class="card" style="align-items:center;text-align:center">
        <span class="display" style=${{ color: accColor(result.accuracy) }}>${result.accuracy}%</span>
        <p class="muted">${result.accuracy >= 85 ? 'Great: you score like the team.' : result.accuracy >= 70 ? 'Close. Look at the criteria where you were 2 or more bands away.' : 'Quite far from the team. Read the descriptors again and try another lesson.'}</p></div>
      <div class="card flush"><${CardHead} icon="list-checks" title="You and the team" />
        <div class="list">${active.criteria.map(c => { const mine = result.my_bands[c.id], ref = result.reference_bands[c.id], gap = Math.abs((mine || 0) - (ref || 0));
          return html`<div class="list-row"><span class="grow strong">${c.sort_order}. ${c.name}</span>
            <span class="strong" style=${{ color: gap === 0 ? 'var(--em)' : gap === 1 ? 'var(--indigo)' : gap === 2 ? 'var(--am)' : 'var(--ro)' }}>You ${mine} · team ${ref}</span></div>`; })}</div></div>`;
  }
  if (active) {
    const scored = active.criteria.filter(c => bands[c.id]).length;
    const send = () => {
      const left = active.criteria.length - scored;
      if (left) { setMsg(`Choose a band for every criterion. ${left} ${left === 1 ? 'is' : 'are'} still empty.`); return; }
      run(async () => { const r = await rpc('teacher_submit_calibration', { p_calibration_lesson_id: active.id, p_bands: bands }); setResult(r); cal.reload(); });
    };
    return html`<button class="link-btn" onClick=${() => setActive(null)}><${Icon} name="arrow-left" size=${16} />All calibration lessons</button>
      <${PageHeader} title=${active.title} subtitle="Watch the video, then choose your bands.">
        <a class="btn secondary" href=${active.video_url} target="_blank" rel="noopener"><${Icon} name="external-link" />Watch video</a></${PageHeader}>
      <${CriteriaForm} criteria=${active.criteria} bands=${bands} setBand=${(id, n) => { setBands({ ...bands, [id]: n }); setMsg(''); }} />
      <div class="card sticky-bar"><span class="strong">${scored} of ${active.criteria.length} criteria scored</span>
        ${msg ? html`<span class="error-text" style="flex:1 1 100%">${msg}</span>` : null}
        <${ErrorBox} error=${error} />
        <${Button} icon="target" busy=${busy} onClick=${send}>Check my bands</${Button}></div>`;
  }
  return html`
    <${PageHeader} title="Calibration" subtitle="Score a recorded lesson, then compare your bands with the bands your team agreed on. Accuracy 85% or more means you score like the team." />
    ${cal.data.lessons.length ? cal.data.lessons.map(l => html`<div class="card" style="flex-direction:row;align-items:center;flex-wrap:wrap">
      <${Icon} name="play" size=${24} color="var(--indigo)" />
      <div class="stack sm spacer" style="gap:2px;min-width:200px"><span class="strong">${l.title}</span>
        <span class="caption" style=${l.my_latest ? { color: accColor(l.my_latest.accuracy) } : null}>${l.my_latest ? 'Your last accuracy: ' + l.my_latest.accuracy + '%' : 'Not scored yet'}</span></div>
      <a class="btn secondary" href=${l.video_url} target="_blank" rel="noopener"><${Icon} name="external-link" />Watch video</a>
      <${Button} icon="pencil" onClick=${() => { setActive(l); setBands({}); setMsg(''); }}>${l.my_latest ? 'Score again' : 'Score it'}</${Button}></div>`)
      : html`<div class="card"><${Empty} icon="video-off" title="No calibration lessons yet" text="The boss adds recorded lessons for practice. Check back later." /></div>`}`;
}

// ---------------------------------------------------------------- Mentee journal
export function TeacherMentee({ params }) {
  const w = useLoad(() => rpc('teacher_my_work'));
  const j = useLoad(() => rpc('journal_list', { p_candidate_id: params.id }), [params.id]);
  const m = (w.data?.mentees || []).find(x => x.id === params.id);
  return html`
    <${PageHeader} title=${m ? m.name : 'Mentee'} subtitle="Shadowing journal: what your mentee saw in lessons and what they will use." back=${{ href: '#/teacher', label: 'My lessons' }}>
      ${m ? html`<${StageBadge} stage=${m.stage} />` : null}</${PageHeader}>
    <div class="card flush">
      ${j.loading && !j.data ? html`<${Loader} />` : j.error ? html`<div style="padding:var(--md)"><${ErrorBox} error=${j.error} /></div>`
        : j.data.length ? html`<div class="list">${j.data.map(e => html`<${JournalEntry} j=${e} />`)}</div>`
        : html`<${Empty} icon="notebook" title="No journal entries yet" text="Entries appear here when your mentee writes them." />`}
    </div>`;
}
