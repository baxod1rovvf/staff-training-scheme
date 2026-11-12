import { html, useState, Button, Icon, PageHeader, CardHead, Loader, Empty, Badge, StageBadge, Chips, Field, SlideOver, Dialog, ErrorBox,
  Person, LessonRow, BandPicker, useLoad, useAction, toast } from '../ui.js';
import { rpc, fileUrl, uploadMaterial, removeMaterialFile } from '../api.js';
import { STAGES, stageLabel, TYPES, typeLabel, typeIcon, LEVELS, fmtDate, fmtDateTime, band1, lessonType } from '../util.js';

// ---------------------------------------------------------------- Dashboard
export function BossDashboard() {
  const d = useLoad(() => rpc('boss_dashboard'));
  const [run, busy] = useAction();
  const [rem, setRem] = useState(null);
  const send = () => run(async () => {
    const r = await rpc('boss_send_reminders');
    setRem(r);
  }).catch(() => {});

  if (d.loading && !d.data) return html`<${Loader} />`;
  if (d.error) return html`<${ErrorBox} error=${d.error} />`;
  const x = d.data;
  const stat = (label, value, icon, href, tone) => html`<a class="card" href=${href} style="padding:var(--md)">
    <div class="row-flex"><${Icon} name=${icon} color=${tone || 'var(--indigo)'} /><span class="caption">${label}</span></div>
    <span class="stat" style=${tone ? { color: tone } : null}>${value}</span></a>`;
  return html`
    <${PageHeader} title="Dashboard" subtitle="What needs your attention today.">
      <${Button} kind="secondary" icon="calendar-check" href="#/boss/lessons?new=1">Schedule lesson</${Button}>
    </${PageHeader}>
    <div class="grid c4">
      ${stat('Active candidates', x.candidates, 'graduation-cap', '#/boss/candidates')}
      ${stat('Teachers', x.teachers, 'users', '#/boss/calibration')}
      ${stat('Awaiting your decision', x.awaiting.length, 'hourglass', '#/boss/lessons', x.awaiting.length ? 'var(--am)' : null)}
      ${stat('Late scores', x.overdue, 'bell', '#/boss/lessons', x.overdue ? 'var(--ro)' : null)}
    </div>
    <div class="split">
      <div class="stack">
        <div class="card flush"><${CardHead} icon="hourglass" title="Awaiting your decision" />
          ${x.awaiting.length ? html`<div class="list">${x.awaiting.map(l => html`<${LessonRow} l=${l} href=${'#/boss/lesson/' + l.id} />`)}</div>`
            : html`<${Empty} icon="circle-check" title="Nothing to decide" text="Lessons appear here when at least 2 observers have submitted their scores." />`}</div>
        <div class="card flush"><${CardHead} icon="calendar" title="Being scored"><a class="back" href="#/boss/lessons">All lessons</a></${CardHead}>
          ${x.upcoming.length ? html`<div class="list">${x.upcoming.map(l => html`<${LessonRow} l=${l} href=${'#/boss/lesson/' + l.id} />`)}</div>`
            : html`<${Empty} icon="calendar-x" title="No lessons being scored" text="Schedule a micro-teaching or full trial lesson for a candidate." />`}</div>
      </div>
      <div class="stack">
        <div class="card"><${CardHead} icon="route" title="Candidates by stage" />
          <div class="stack sm">${STAGES.map(([k, l]) => html`<div class="row-flex"><span class="spacer">${l}</span><span class="strong">${x.stages[k] || 0}</span></div>`)}</div></div>
        <div class="card"><${CardHead} icon="bell" title="Score reminders" />
          <p class="muted">Sends a Telegram reminder to every observer whose scores are more than a day late.</p>
          ${x.telegram_configured ? null : html`<p class="warn-box">Telegram is not set up yet, so nothing can be sent. See “Telegram setup” in the README.</p>`}
          <${Button} kind="secondary" icon="send" busy=${busy} onClick=${send}>Send reminders</${Button}>
          ${rem ? html`<p class=${rem.overdue.length ? 'info-box' : 'muted'}>${rem.overdue.length
            ? `${rem.overdue.filter(o => o.sent).length} of ${rem.overdue.length} late observers reminded.` + (rem.overdue.some(o => !o.sent) ? ' Not reached: ' + rem.overdue.filter(o => !o.sent).map(o => o.observer_name).join(', ') + '.' : '')
            : 'No late scores. Nobody needed a reminder.'}</p>` : null}
        </div>
      </div>
    </div>`;
}

// ---------------------------------------------------------------- Candidates
export function BossCandidates() {
  const c = useLoad(() => rpc('boss_list_candidates'));
  const [q, setQ] = useState('');
  const [stage, setStage] = useState('');
  const list = (c.data || []).filter(x => (!stage || x.stage === stage) && (!q.trim() || (x.name + ' ' + x.login).toLowerCase().includes(q.trim().toLowerCase())));
  return html`
    <${PageHeader} title="Candidates" subtitle="Everyone on the way to becoming an Edunest teacher. Accounts are created by the creator." />
    <div class="card" style="padding:var(--md)"><div class="stack sm">
      <div style="position:relative"><span style="position:absolute;left:12px;top:12px;color:var(--muted)"><${Icon} name="search" /></span>
        <input class="input" style="padding-left:40px" placeholder="Search by name or login" aria-label="Search candidates" value=${q} onInput=${e => setQ(e.target.value)} /></div>
      <${Chips} options=${[['', 'All stages'], ...STAGES]} value=${stage} onChange=${setStage} /></div></div>
    <div class="card flush">
      ${c.loading && !c.data ? html`<${Loader} />` : c.error ? html`<div style="padding:var(--md)"><${ErrorBox} error=${c.error} /></div>`
        : !list.length ? html`<${Empty} icon="graduation-cap" title=${c.data.length ? 'No candidates match' : 'No candidates yet'}
            text=${c.data.length ? 'Try another search or stage.' : 'The creator adds candidate accounts on the Accounts page.'} />`
        : html`<div class="table-wrap"><table class="table"><thead><tr><th>Candidate</th><th>Stage</th><th>Mentor</th><th>Lessons</th><th>Last lesson</th><th>Journal</th></tr></thead>
          <tbody>${list.map(x => html`<tr class="click" onClick=${() => { location.hash = '#/boss/candidate/' + x.id; }}>
            <td><a href=${'#/boss/candidate/' + x.id} style="text-decoration:none"><${Person} name=${x.name} sub=${'@' + x.login + (x.status === 'blocked' ? ' · blocked' : '')} /></a></td>
            <td><${StageBadge} stage=${x.stage} /></td>
            <td class="muted">${x.mentor_name || '—'}</td>
            <td>${x.lessons}</td>
            <td class="muted nowrap">${x.last_lesson ? fmtDate(x.last_lesson.scheduled_at) + (x.last_lesson.overall_band != null ? ' · ' + band1(x.last_lesson.overall_band) : '') : '—'}</td>
            <td>${x.journal_count}</td></tr>`)}</tbody></table></div>`}
    </div>`;
}

export function BossCandidate({ params }) {
  const d = useLoad(() => rpc('boss_get_candidate', { p_candidate_id: params.id }), [params.id]);
  const teachers = useLoad(() => rpc('boss_list_people', { p_role: 'teacher' }));
  const [run, busy, error] = useAction();
  const [schedule, setSchedule] = useState(false);
  if (d.loading && !d.data) return html`<${Loader} />`;
  if (d.error) return html`<${PageHeader} title="Candidate" back=${{ href: '#/boss/candidates', label: 'Candidates' }} /><${ErrorBox} error=${d.error} />`;
  const c = d.data.candidate;
  const setStage = s => run(async () => { await rpc('boss_set_stage', { p_candidate_id: c.id, p_stage: s }); await d.reload(); toast('Stage set to ' + stageLabel(s)); });
  const setMentor = id => run(async () => { await rpc('boss_set_mentor', { p_candidate_id: c.id, p_mentor_id: id || null }); await d.reload(); toast(id ? 'Mentor saved' : 'Mentor removed'); });
  return html`
    <${PageHeader} title=${c.full_name} subtitle=${'@' + c.login + ' · candidate since ' + fmtDate(c.created_at)} back=${{ href: '#/boss/candidates', label: 'Candidates' }}>
      <${Button} icon="calendar-check" onClick=${() => setSchedule(true)}>Schedule lesson</${Button}>
    </${PageHeader}>
    <${ErrorBox} error=${error} />
    <div class="split">
      <div class="stack">
        <div class="card flush"><${CardHead} icon="calendar" title="Trial lessons" />
          ${d.data.lessons.length ? html`<div class="list">${d.data.lessons.map(l => html`<${LessonRow} l=${l} showCandidate=${false} href=${'#/boss/lesson/' + l.id} />`)}</div>`
            : html`<${Empty} icon="calendar-x" title="No lessons yet" text="Schedule a micro-teaching or a full trial lesson." />`}</div>
        <div class="card flush"><${CardHead} icon="notebook-pen" title="Shadowing journal" />
          ${d.data.journal.length ? html`<div class="list">${d.data.journal.map(j => html`<${JournalEntry} j=${j} />`)}</div>`
            : html`<${Empty} icon="notebook" title="No journal entries" text="The candidate writes an entry after each lesson they watch." />`}</div>
      </div>
      <div class="stack">
        <div class="card"><${CardHead} icon="route" title="Stage" />
          <${Chips} square options=${STAGES} value=${c.stage} onChange=${setStage} disabled=${busy} />
          <p class="hint">Approving a full trial lesson moves the candidate to Probation automatically.</p></div>
        <div class="card"><${CardHead} icon="users" title="Mentor" />
          <select class="input" aria-label="Mentor" value=${c.mentor_id || ''} disabled=${busy} onChange=${e => setMentor(e.target.value)}>
            <option value="">No mentor</option>${(teachers.data || []).map(t => html`<option value=${t.id}>${t.name}</option>`)}</select>
          <p class="hint">The mentor reads this candidate's journal and cannot observe their lessons.</p></div>
      </div>
    </div>
    ${schedule ? html`<${ScheduleForm} candidateId=${c.id} onClose=${() => setSchedule(false)} onSaved=${() => { setSchedule(false); d.reload(); }} />` : null}`;
}

export const JournalEntry = ({ j }) => html`<div class="list-row" style="align-items:flex-start">
  <div class="date-tile"><b>${new Date(j.lesson_date).getDate()}</b><span>${new Date(j.lesson_date).toLocaleDateString('en-GB', { month: 'short' })}</span></div>
  <div class="grow" style="gap:4px"><span class="strong">${[j.observed_teacher, j.group_name].filter(Boolean).join(' · ')}</span>
    <span class="caption">Techniques seen</span><span class="pre">${j.techniques}</span>
    <span class="caption">Will use</span><span class="pre">${j.will_use}</span></div></div>`;

// ---------------------------------------------------------------- Lessons
export function BossLessons() {
  const wantNew = /new=1/.test(location.hash);
  const lessons = useLoad(() => rpc('boss_list_lessons', { p_candidate_id: null }));
  const [filter, setFilter] = useState('');
  const [schedule, setSchedule] = useState(wantNew);
  const list = (lessons.data || []).filter(l => !filter || (filter === 'decided' ? ['approved', 'declined'].includes(l.status) : l.status === filter));
  return html`
    <${PageHeader} title="Trial lessons" subtitle="Micro-teaching and full trial lessons. Each one is scored by 2–3 observers; you decide when at least 2 have submitted.">
      <${Button} icon="plus" onClick=${() => setSchedule(true)}>Schedule lesson</${Button}>
    </${PageHeader}>
    <${Chips} options=${[['', 'All'], ['scheduled', 'Being scored'], ['awaiting_decision', 'Awaiting decision'], ['decided', 'Decided']]} value=${filter} onChange=${setFilter} />
    <div class="card flush">
      ${lessons.loading && !lessons.data ? html`<${Loader} />` : lessons.error ? html`<div style="padding:var(--md)"><${ErrorBox} error=${lessons.error} /></div>`
        : list.length ? html`<div class="list">${list.map(l => html`<${LessonRow} l=${l} href=${'#/boss/lesson/' + l.id} />`)}</div>`
        : html`<${Empty} icon="calendar-x" title=${lessons.data.length ? 'No lessons here' : 'No lessons yet'} text=${lessons.data.length ? 'Pick another filter.' : 'Schedule the first lesson for a candidate.'} />`}
    </div>
    ${schedule ? html`<${ScheduleForm} onClose=${() => { setSchedule(false); if (wantNew) history.replaceState(null, '', '#/boss/lessons'); }}
      onSaved=${() => { setSchedule(false); lessons.reload(); }} />` : null}`;
}

function ScheduleForm({ candidateId, onClose, onSaved }) {
  const cands = useLoad(() => rpc('boss_list_people', { p_role: 'candidate' }));
  const teachers = useLoad(() => rpc('boss_list_people', { p_role: 'teacher' }));
  const [f, setF] = useState({ candidate: candidateId || '', type: 'micro', when: '', group: '', topic: '', observers: [] });
  const [run, busy, error] = useAction();
  const cand = (cands.data || []).find(c => c.id === f.candidate);
  const toggle = id => setF({ ...f, observers: f.observers.includes(id) ? f.observers.filter(x => x !== id) : f.observers.length < 3 ? [...f.observers, id] : f.observers });
  const save = () => run(async () => {
    const at = f.when ? new Date(f.when) : null;
    const r = await rpc('boss_schedule_lesson', { p_candidate_id: f.candidate || null, p_type: f.type, p_scheduled_at: at && !isNaN(at) ? at.toISOString() : '',
      p_group_name: f.group, p_topic: f.topic, p_observer_ids: f.observers });
    const failed = (r.telegram_failed || []).length;
    toast('Lesson scheduled.' + (failed ? ` ${failed} observer${failed > 1 ? 's were' : ' was'} not notified by Telegram.` : ' Observers were notified.'));
    onSaved(r);
  });
  return html`<${SlideOver} title="Schedule a lesson" onClose=${onClose}
    footer=${html`<${Button} kind="secondary" onClick=${onClose}>Cancel</${Button}><${Button} busy=${busy} onClick=${save}>Schedule</${Button}>`}>
    <${Field} label="Candidate" id="s-c"><select id="s-c" class="input" value=${f.candidate} onChange=${e => setF({ ...f, candidate: e.target.value, observers: [] })}>
      <option value="">Choose a candidate</option>${(cands.data || []).map(c => html`<option value=${c.id}>${c.name}</option>`)}</select></${Field}>
    <div class="field"><span class="label">Type</span><${Chips} square options=${[['micro', 'Micro-teaching'], ['full', 'Full trial lesson']]} value=${f.type} onChange=${v => setF({ ...f, type: v })} /></div>
    <${Field} label="Date and time" id="s-w"><input id="s-w" class="input" type="datetime-local" value=${f.when} onInput=${e => setF({ ...f, when: e.target.value })} /></${Field}>
    <div class="grid c2"><${Field} label="Group (optional)" id="s-g"><input id="s-g" class="input" value=${f.group} onInput=${e => setF({ ...f, group: e.target.value })} placeholder="e.g. Elementary 2" /></${Field}>
      <${Field} label="Topic (optional)" id="s-t"><input id="s-t" class="input" value=${f.topic} onInput=${e => setF({ ...f, topic: e.target.value })} placeholder="e.g. Past simple" /></${Field}></div>
    <div class="field"><span class="label">Observers (${f.observers.length} of 2–3)</span>
      ${teachers.loading && !teachers.data ? html`<${Loader} />` : html`<div class="chips">${(teachers.data || []).map(t => {
        const mentor = cand && cand.mentor_id === t.id;
        return html`<button type="button" class=${'chip' + (f.observers.includes(t.id) ? ' on' : '')} disabled=${mentor} aria-pressed=${f.observers.includes(t.id)}
          title=${mentor ? "The candidate's mentor cannot observe" : ''} onClick=${() => toggle(t.id)}>${t.name}${mentor ? ' · mentor' : t.telegram_linked ? '' : ' · no Telegram'}</button>`;
      })}</div>`}
      <p class="hint">Each observer scores on their own; nobody sees the others' scores.</p></div>
    <${ErrorBox} error=${error} />
  </${SlideOver}>`;
}

// ---------------------------------------------------------------- Lesson standard
const blank = n => ({ area: '', name: '', sort_order: n, must_pass: false, desc_9: '', desc_7: '', desc_5: '', desc_3: '' });

export function BossStandard() {
  const s = useLoad(() => rpc('boss_get_standard'));
  const [edit, setEdit] = useState(null);
  const [run, busy, error, setError] = useAction();
  const [ask, setAsk] = useState(false);
  if (s.loading && !s.data) return html`<${Loader} />`;
  if (s.error) return html`<${ErrorBox} error=${s.error} />`;
  const { active, draft, versions } = s.data;
  const shown = draft || active;

  const saveDraft = () => run(async () => {
    await rpc('boss_save_draft_criteria', { p_criteria: edit.map((c, i) => ({ ...c, sort_order: i + 1 })) });
    setEdit(null); await s.reload(); toast('Draft saved. Publish it when it is ready.');
  });
  const publish = () => run(async () => {
    const r = await rpc('boss_publish_rubric');
    setAsk(false); await s.reload(); toast(`Version ${r.version_no} is now the active standard.`);
  });

  if (edit) {
    const upd = (i, k, v) => setEdit(edit.map((c, j) => (j === i ? { ...c, [k]: v } : c)));
    const move = i => { const n = [...edit]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setEdit(n); };
    return html`
      <${PageHeader} title="Edit the standard" subtitle="Changes are saved as a draft. Lessons already scheduled keep the version they started with.">
        <${Button} kind="secondary" onClick=${() => { setEdit(null); setError(null); }}>Cancel</${Button}>
        <${Button} icon="check" busy=${busy} onClick=${saveDraft}>Save draft</${Button}>
      </${PageHeader}>
      <${ErrorBox} error=${error} />
      ${edit.map((c, i) => html`<div class="card">
        <div class="row-flex"><span class="card-title spacer">Criterion ${i + 1}</span>
          <label class="check"><input type="checkbox" checked=${c.must_pass} onChange=${e => upd(i, 'must_pass', e.target.checked)} />Must pass</label>
          <${Button} kind="ghost" small icon="arrow-up" disabled=${i === 0} onClick=${() => move(i)} title="Move up">Up</${Button}>
          <${Button} kind="ghost" small icon="trash-2" onClick=${() => setEdit(edit.filter((_, j) => j !== i))} title="Remove">Remove</${Button}></div>
        <div class="grid c2"><${Field} label="Area" id=${'a' + i}><input id=${'a' + i} class="input" value=${c.area} onInput=${e => upd(i, 'area', e.target.value)} /></${Field}>
          <${Field} label="Name" id=${'n' + i}><input id=${'n' + i} class="input" value=${c.name} onInput=${e => upd(i, 'name', e.target.value)} /></${Field}></div>
        <div class="grid c2">${['9', '7', '5', '3'].map(b => html`<${Field} label=${'Band ' + b} id=${'d' + b + i}>
          <textarea id=${'d' + b + i} class="input" rows="2" value=${c['desc_' + b] || ''} onInput=${e => upd(i, 'desc_' + b, e.target.value)}></textarea></${Field}>`)}</div>
      </div>`)}
      <${Button} kind="secondary" icon="plus" onClick=${() => setEdit([...edit, blank(edit.length + 1)])}>Add criterion</${Button}>`;
  }

  return html`
    <${PageHeader} title="Lesson standard" subtitle="4 areas, scored with bands 1–9 like IELTS. Even bands sit between the written descriptors.">
      ${draft ? html`<${Button} kind="success" icon="shield-check" onClick=${() => setAsk(true)}>Publish version ${draft.version_no}</${Button}>` : null}
      <${Button} icon="pencil" onClick=${() => setEdit((shown?.criteria || []).map(c => ({ ...c })))}>${draft ? 'Edit draft' : 'Edit'}</${Button}>
    </${PageHeader}>
    ${draft ? html`<p class="info-box">You are looking at draft version ${draft.version_no}. Version ${active?.version_no} stays active until you publish.</p>` : null}
    <${ErrorBox} error=${error} />
    ${(shown?.criteria || []).map(c => html`<div class="card">
      <div class="row-flex"><span class="card-title spacer">${c.sort_order}. ${c.name}</span><span class="caption">${c.area}</span>${c.must_pass ? html`<${Badge} kind="warning">Must pass</${Badge}>` : null}</div>
      <div class="grid c2">${['9', '7', '5', '3'].map(b => html`<div class="stack sm" style="gap:2px"><span class="caption">Band ${b}</span><span>${c['desc_' + b] || '—'}</span></div>`)}</div>
    </div>`)}
    <div class="card"><${CardHead} icon="list-checks" title="Versions" />
      <div class="stack sm">${versions.map(v => html`<div class="row-flex"><span class="spacer">Version ${v.version_no}</span><span class="caption">${fmtDate(v.created_at)}</span>
        ${v.is_active ? html`<${Badge} kind="success">Active</${Badge}>` : draft && v.id === draft.id ? html`<${Badge} kind="info">Draft</${Badge}>` : html`<${Badge}>Old</${Badge}>`}</div>`)}</div></div>
    ${ask ? html`<${Dialog} title=${'Publish version ' + draft.version_no + '?'} onClose=${() => setAsk(false)}
      footer=${html`<${Button} kind="secondary" onClick=${() => setAsk(false)}>Cancel</${Button}><${Button} kind="success" busy=${busy} onClick=${publish}>Publish</${Button}>`}>
      <p class="muted">New lessons and calibration lessons will use it. Lessons already scheduled keep their version.</p><${ErrorBox} error=${error} /></${Dialog}>` : null}`;
}

// ---------------------------------------------------------------- Materials
export function MaterialList({ boss, onEdit, onDelete, type, level, setType, setLevel, data }) {
  return html`
    <div class="card" style="padding:var(--md)"><div class="stack sm">
      <${Chips} options=${[['', 'All types'], ...TYPES.map(t => [t[0], t[1]])]} value=${type} onChange=${setType} />
      <${Chips} options=${[['', 'All levels'], ...LEVELS.map(l => [l, l])]} value=${level} onChange=${setLevel} /></div></div>
    <div class="card flush">
      ${data.loading && !data.data ? html`<${Loader} />` : data.error ? html`<div style="padding:var(--md)"><${ErrorBox} error=${data.error} /></div>`
        : !data.data.length ? html`<${Empty} icon="folder-open" title="No materials here" text=${boss ? 'Add slides, exercises or pairwork games, or pick another filter.' : 'Try another type or level.'} />`
        : html`<div class="list">${data.data.map(m => html`<div class="list-row">
          <div class="date-tile" style="width:44px;height:44px"><${Icon} name=${typeIcon(m.type)} /></div>
          <div class="grow"><span class="strong">${m.title}</span>${m.description ? html`<span class="caption">${m.description}</span>` : null}
            <span class="caption" style="color:var(--muted)">${[typeLabel(m.type), m.level || 'All levels', m.file_name].filter(Boolean).join(' · ')}</span></div>
          <div class="actions">
            ${m.file_path ? html`<${Button} kind="secondary" small icon="download" href=${fileUrl(m.file_path)}>Open file</${Button}>` : null}
            ${m.link_url ? html`<a class="btn secondary sm" href=${m.link_url} target="_blank" rel="noopener"><${Icon} name="external-link" size=${16} />Open link</a>` : null}
            ${boss ? html`<${Button} kind="ghost" small icon="pencil" onClick=${() => onEdit(m)} title="Edit">Edit</${Button}>
              <${Button} kind="ghost" small icon="trash-2" onClick=${() => onDelete(m)} title="Delete">Delete</${Button}>` : null}
          </div></div>`)}</div>`}
    </div>`;
}

export function BossMaterials() {
  const [type, setType] = useState('');
  const [level, setLevel] = useState('');
  const data = useLoad(() => rpc('materials_list', { p_type: type, p_level: level }), [type, level]);
  const [form, setForm] = useState(null);
  const [del, setDel] = useState(null);
  const [run, busy, error] = useAction();
  const remove = () => run(async () => {
    const r = await rpc('boss_delete_material', { p_id: del.id });
    await removeMaterialFile(r.file_path).catch(() => {});
    setDel(null); data.reload(); toast('Material deleted');
  });
  return html`
    <${PageHeader} title="Lesson materials" subtitle="Slides, exercises and pairwork games candidates can open before their lessons.">
      <${Button} icon="plus" onClick=${() => setForm({ id: null, title: '', description: '', type: 'slides', level: '', link_url: '', file_name: '' })}>Add material</${Button}>
    </${PageHeader}>
    <${MaterialList} boss data=${data} type=${type} level=${level} setType=${setType} setLevel=${setLevel} onEdit=${m => setForm({ ...m, description: m.description || '', level: m.level || '', link_url: m.link_url || '' })} onDelete=${setDel} />
    ${form ? html`<${MaterialForm} form=${form} onClose=${() => setForm(null)} onSaved=${() => { setForm(null); data.reload(); }} />` : null}
    ${del ? html`<${Dialog} title=${'Delete “' + del.title + '”?'} onClose=${() => setDel(null)}
      footer=${html`<${Button} kind="secondary" onClick=${() => setDel(null)}>Cancel</${Button}><${Button} kind="danger" busy=${busy} onClick=${remove}>Delete material</${Button}>`}>
      <p class="muted">Candidates will no longer see it${del.file_path ? ', and the file is removed' : ''}. This cannot be undone.</p><${ErrorBox} error=${error} /></${Dialog}>` : null}`;
}

function MaterialForm({ form, onClose, onSaved }) {
  const [f, setF] = useState(form);
  const [file, setFile] = useState(null);
  const [run, busy, error] = useAction();
  const save = () => run(async () => {
    let up = null;
    if (file) up = await uploadMaterial(file);
    try {
      const r = await rpc('boss_save_material', { p_id: f.id, p_title: f.title, p_description: f.description, p_type: f.type, p_level: f.level,
        p_link_url: f.link_url, p_file_path: up ? up.path : null, p_file_name: up ? up.name : null });
      if (r.replaced_file) removeMaterialFile(r.replaced_file).catch(() => {});
    } catch (e) { if (up) removeMaterialFile(up.path).catch(() => {}); throw e; }
    toast(f.id ? 'Material saved' : 'Material added');
    onSaved();
  });
  return html`<${SlideOver} title=${f.id ? 'Edit material' : 'Add material'} onClose=${onClose}
    footer=${html`<${Button} kind="secondary" onClick=${onClose}>Cancel</${Button}><${Button} busy=${busy} onClick=${save}>Save</${Button}>`}>
    <${Field} label="Title" id="m-t"><input id="m-t" class="input" value=${f.title} onInput=${e => setF({ ...f, title: e.target.value })} placeholder="e.g. Present perfect warmers" /></${Field}>
    <${Field} label="Description (optional)" id="m-d"><textarea id="m-d" class="input" rows="3" value=${f.description} onInput=${e => setF({ ...f, description: e.target.value })} placeholder="When to use it, timing, tips"></textarea></${Field}>
    <div class="field"><span class="label">Type</span><${Chips} square options=${TYPES.map(t => [t[0], t[1]])} value=${f.type} onChange=${v => setF({ ...f, type: v })} /></div>
    <div class="field"><span class="label">Level</span><${Chips} square options=${[['', 'All levels'], ...LEVELS.map(l => [l, l])]} value=${f.level} onChange=${v => setF({ ...f, level: v })} /></div>
    <${Field} label="Link (optional)" id="m-l"><input id="m-l" class="input" type="url" value=${f.link_url} onInput=${e => setF({ ...f, link_url: e.target.value })} placeholder="https://…" /></${Field}>
    <${Field} label=${f.file_name ? 'Replace file (optional)' : 'File (optional)'} id="m-f" hint=${f.file_name ? 'Current file: ' + f.file_name : 'PDF, slides or documents. A material needs a file or a link.'}>
      <input id="m-f" class="input" type="file" onChange=${e => setFile(e.target.files[0] || null)} /></${Field}>
    <${ErrorBox} error=${error} />
  </${SlideOver}>`;
}

// ---------------------------------------------------------------- Calibration
export function BossCalibration() {
  const cal = useLoad(() => rpc('calibration_overview'));
  const std = useLoad(() => rpc('boss_get_standard'));
  const [form, setForm] = useState(null);
  if (cal.loading && !cal.data) return html`<${Loader} />`;
  if (cal.error) return html`<${ErrorBox} error=${cal.error} />`;
  const acc = a => (a == null ? html`<span class="muted">Not yet</span>` : html`<span class="strong" style=${{ color: a >= 85 ? 'var(--em)' : a >= 70 ? 'var(--am)' : 'var(--ro)' }}>${a}%</span>`);
  return html`
    <${PageHeader} title="Calibration" subtitle="Teachers score a recorded lesson and compare with the bands your team agreed on. 85% or more means they score like the team.">
      <${Button} icon="plus" onClick=${() => setForm({ id: null, title: '', video_url: '', is_active: true, reference_bands: {} })}>Add calibration lesson</${Button}>
    </${PageHeader}>
    <div class="card flush"><${CardHead} icon="users" title="Teachers' accuracy" />
      ${cal.data.teachers.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>Teacher</th><th>Latest accuracy</th><th>Lesson</th><th>Attempts</th></tr></thead>
        <tbody>${cal.data.teachers.map(t => html`<tr><td><${Person} name=${t.name} sub=${t.status === 'blocked' ? 'blocked' : ''} /></td><td>${acc(t.latest_accuracy)}</td>
          <td class="muted">${t.latest_lesson ? t.latest_lesson + ' · ' + fmtDate(t.latest_at) : '—'}</td><td>${t.attempts}</td></tr>`)}</tbody></table></div>`
        : html`<${Empty} icon="users" title="No teachers yet" text="The creator adds teacher accounts." />`}</div>
    <div class="card flush"><${CardHead} icon="video-off" title="Calibration lessons" />
      ${cal.data.lessons.length ? html`<div class="list">${cal.data.lessons.map(l => html`<div class="list-row">
        <${Icon} name="play" color="var(--indigo)" size=${22} />
        <div class="grow"><span class="strong">${l.title}</span><span class="caption">${l.attempts} attempt${l.attempts === 1 ? '' : 's'} · added ${fmtDate(l.created_at)}</span></div>
        ${l.is_active ? html`<${Badge} kind="success">Visible</${Badge}>` : html`<${Badge}>Hidden</${Badge}>`}
        <a class="btn secondary sm" href=${l.video_url} target="_blank" rel="noopener"><${Icon} name="external-link" size=${16} />Video</a>
        <${Button} kind="ghost" small icon="pencil" onClick=${() => setForm({ ...l })}>Edit</${Button}></div>`)}</div>`
        : html`<${Empty} icon="video-off" title="No calibration lessons" text="Add a recorded lesson with the reference bands your team agreed on." />`}</div>
    ${form ? html`<${CalibrationForm} form=${form} criteria=${std.data?.active?.criteria || []} onClose=${() => setForm(null)} onSaved=${() => { setForm(null); cal.reload(); }} />` : null}`;
}

function CalibrationForm({ form, criteria, onClose, onSaved }) {
  const [f, setF] = useState({ ...form, reference_bands: { ...(form.reference_bands || {}) } });
  const [run, busy, error] = useAction();
  const setBand = (id, n) => setF({ ...f, reference_bands: { ...f.reference_bands, [id]: n } });
  const missing = criteria.filter(c => !f.reference_bands[c.id]);
  const save = () => run(async () => {
    await rpc('boss_save_calibration_lesson', { p_id: f.id, p_title: f.title, p_video_url: f.video_url, p_reference_bands: f.reference_bands, p_is_active: f.is_active });
    toast(f.id ? 'Calibration lesson saved' : 'Calibration lesson added'); onSaved();
  });
  return html`<${SlideOver} title=${f.id ? 'Edit calibration lesson' : 'Add calibration lesson'} onClose=${onClose}
    footer=${html`<${Button} kind="secondary" onClick=${onClose}>Cancel</${Button}><${Button} busy=${busy} onClick=${save}>Save</${Button}>`}>
    <${Field} label="Title" id="c-t"><input id="c-t" class="input" value=${f.title} onInput=${e => setF({ ...f, title: e.target.value })} placeholder="e.g. Elementary speaking lesson" /></${Field}>
    <${Field} label="Video link" id="c-v" hint="YouTube, Google Drive or any link teachers can open."><input id="c-v" class="input" type="url" value=${f.video_url} onInput=${e => setF({ ...f, video_url: e.target.value })} placeholder="https://…" /></${Field}>
    <label class="check"><input type="checkbox" checked=${f.is_active} onChange=${e => setF({ ...f, is_active: e.target.checked })} />Visible to teachers</label>
    <div class="stack sm"><span class="label">Reference bands (${criteria.length - missing.length} of ${criteria.length})</span>
      ${criteria.map(c => html`<div class="stack sm" style="gap:4px"><span>${c.sort_order}. ${c.name}</span>
        <${BandPicker} label=${c.name} value=${f.reference_bands[c.id]} onChange=${n => setBand(c.id, n)} /></div>`)}</div>
    ${missing.length && error ? html`<p class="hint">Still missing: ${missing.map(c => c.name).join(', ')}.</p>` : null}
    <${ErrorBox} error=${error} />
  </${SlideOver}>`;
}
