import { html, useState, Button, Icon, PageHeader, CardHead, Loader, Empty, Badge, ErrorBox, DateTile, useLoad, useAction, toast } from '../ui.js';
import { rpc } from '../api.js';
import { STAGES, lessonType, lessonMeta, fmtDateTime, fmtDate, band1, bandColor, todayISO } from '../util.js';
import { MaterialList, JournalEntry } from './boss.js';
import { FB_QUESTIONS } from './lesson.js';

const EXPECT = {
  micro: 'Teach a short part of a lesson (about 15–20 minutes). Bring a plan with the aim, the stages and their timings, and all your materials.',
  full: 'Teach a full lesson. Bring a written plan (aim, stages, timings) and all materials. 2–3 observers score it with the Edunest lesson standard.'
};
function NextLesson({ lessons }) {
  const now = Date.now() - 2 * 3600 * 1000;
  const next = lessons.filter(l => l.status === 'Waiting' && new Date(l.scheduled_at).getTime() >= now)
    .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))[0];
  if (!next) return null;
  const at = new Date(next.scheduled_at);
  const days = Math.round((new Date(at.toDateString()) - new Date(new Date().toDateString())) / 86400000);
  const when = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days > 1 ? 'In ' + days + ' days' : '';
  return html`<div class="card" style="border-color:var(--indigo)"><${CardHead} icon="calendar" title="Your next lesson">${when ? html`<${Badge} kind="info">${when}</${Badge}>` : null}</${CardHead}>
    <div class="row-flex" style="gap:var(--md);align-items:flex-start;flex-wrap:nowrap">
      <${DateTile} at=${next.scheduled_at} />
      <div class="stack sm" style="gap:2px"><span class="strong">${lessonType(next.type)} · ${at.toLocaleString('en-GB', { weekday: 'long', hour: '2-digit', minute: '2-digit' })}</span>
        <span class="muted">${[fmtDate(next.scheduled_at), next.group_name && 'group ' + next.group_name, next.topic && 'topic: ' + next.topic].filter(Boolean).join(' · ')}</span></div></div>
    <p class="descriptors" style="font-size:14px">${EXPECT[next.type]}</p></div>`;
}

const STEPS = STAGES.filter(s => s[0] !== 'declined');
const HINTS = {
  shadowing: 'Watch lessons by experienced teachers and write a journal entry after each one.',
  micro_teaching: 'Teach short parts of a lesson while observers score you.',
  full_trial: 'Teach a full trial lesson. At least two observers score it.',
  decision: 'Your lessons are scored. The boss is making the decision.',
  probation: "You passed the trial. Keep teaching with your mentor's support.",
  certified: 'You are a certified Edunest teacher. Congratulations!'
};
const statusKind = s => (s === 'Approved' ? 'success' : s === 'Declined' ? 'danger' : 'warning');

export function CandidateHome({ me }) {
  const r = useLoad(() => rpc('candidate_my_results'));
  const stage = r.data?.stage || me.stage;
  const cur = STEPS.findIndex(s => s[0] === stage);
  return html`
    <${PageHeader} title="My progress" subtitle=${'Hello, ' + me.full_name.split(' ')[0] + '. This is your way to becoming an Edunest teacher.'} />
    <div class="card"><${CardHead} icon="route" title="My stage" />
      ${stage === 'declined' ? html`<p class="error-box">Your trial was not approved this time. Talk to the boss about the next steps.</p>`
        : html`<div class="steps">${STEPS.map(([k, l], i) => html`<div class=${'step' + (i < cur ? ' done' : i === cur ? ' now' : '')}>
            <i>${i < cur ? '✓' : i + 1}</i><span>${l}</span></div>`)}</div>
          <p class="muted">${HINTS[stage] || ''}</p>`}</div>
    ${r.data ? html`<${NextLesson} lessons=${r.data.lessons} />` : null}
    <div class="card flush"><${CardHead} icon="calendar" title="My lessons" />
      ${r.loading && !r.data ? html`<${Loader} />` : r.error ? html`<div style="padding:var(--md)"><${ErrorBox} error=${r.error} /></div>`
        : r.data.lessons.length ? html`<div class="list">${r.data.lessons.map(l => html`<a class="list-row" href=${'#/candidate/result/' + l.lesson_id}>
          <${DateTile} at=${l.scheduled_at} />
          <div class="grow"><span class="strong">${lessonType(l.type)}</span><span class="caption ellipsis">${lessonMeta(l)}</span></div>
          ${l.overall != null ? html`<span class="strong" style=${{ fontSize: '20px', color: bandColor(l.overall) }}>${band1(l.overall)}</span>` : null}
          <${Badge} kind=${statusKind(l.status)}>${l.status}</${Badge}></a>`)}</div>`
        : html`<${Empty} icon="calendar-x" title="No lessons yet" text="When the boss schedules your micro-teaching or trial lesson, it appears here." />`}</div>
    <div class="grid c3">
      <a class="card" href="#/candidate/quiz" style="flex-direction:row;align-items:center"><${Icon} name="list-checks" size=${24} color="var(--indigo)" />
        <div class="stack sm" style="gap:2px"><span class="strong">Methods quiz</span><span class="caption">Check what you know about teaching methods.</span></div></a>
      <a class="card" href="#/candidate/materials" style="flex-direction:row;align-items:center"><${Icon} name="folder-open" size=${24} color="var(--indigo)" />
        <div class="stack sm" style="gap:2px"><span class="strong">Lesson materials</span><span class="caption">Slides, exercises and pairwork games.</span></div></a>
      <a class="card" href="#/candidate/journal" style="flex-direction:row;align-items:center"><${Icon} name="notebook-pen" size=${24} color="var(--indigo)" />
        <div class="stack sm" style="gap:2px"><span class="strong">My journal</span><span class="caption">Write what you learned from each lesson you watch.</span></div></a>
    </div>`;
}

export function CandidateResult({ params }) {
  const r = useLoad(() => rpc('candidate_my_results'));
  const back = { href: '#/candidate', label: 'My progress' };
  if (r.loading && !r.data) return html`<${Loader} />`;
  if (r.error) return html`<${PageHeader} title="Result" back=${back} /><${ErrorBox} error=${r.error} />`;
  const l = r.data.lessons.find(x => x.lesson_id === params.id);
  if (!l) return html`<${PageHeader} title="Result" back=${back} /><div class="card"><${Empty} icon="file-question" title="Lesson not found" text="Open a lesson from My progress." /></div>`;
  return html`
    <${PageHeader} title=${lessonType(l.type)} subtitle=${[fmtDateTime(l.scheduled_at), l.group_name, l.topic].filter(Boolean).join(' · ')} back=${back} />
    ${l.overall == null ? html`<div class="card"><${Empty} icon="hourglass" title="Waiting for the result"
        text="Observers are scoring your lesson. Your bands and comments appear here once the boss has decided." /></div>`
    : html`
      <div class="card"><div class="row-flex" style="gap:var(--lg)">
          <div class="stack sm" style="gap:4px"><span class="display" style=${{ color: bandColor(l.overall) }}>${band1(l.overall)}</span><span class="caption">Overall band (1–9)</span></div>
          <${Badge} kind=${statusKind(l.status)}>${l.status}</${Badge}></div>
        ${l.boss_note ? html`<div class="descriptors"><span class="label">Boss's note</span><span class="pre">${l.boss_note}</span></div>` : null}</div>
      <div class="card flush"><${CardHead} icon="list-checks" title="Bands by criterion" />
        <div class="list">${l.criteria.map(c => html`<div class="list-row">
          <div class="grow"><span class="strong">${c.name}</span><span class="caption">${c.area}</span></div>
          <div class="bar" style="flex:0 1 200px;min-width:80px"><i style=${{ width: Math.max(0, Math.min(100, (Number(c.band) || 0) / 9 * 100)) + '%', background: bandColor(c.band) }}></i></div>
          <span class="strong" style=${{ width: '40px', textAlign: 'right', color: bandColor(c.band) }}>${band1(c.band)}</span></div>`)}</div></div>
      ${l.comments.length ? html`<div class="card"><${CardHead} icon="message-square" title="Comments from observers" /><p class="caption">Observers stay anonymous.</p>
        ${l.comments.map(c => html`<div style="border-left:3px solid var(--indigo);padding-left:var(--sm)"><div class="caption accent strong">${c.criterion || 'Overall'}</div><div class="pre">${c.comment}</div></div>`)}</div>` : null}
      ${l.student_feedback && l.student_feedback.count ? html`<div class="card"><${CardHead} icon="users" title="What the students said" />
        <p class="caption">${l.student_feedback.count} student${l.student_feedback.count === 1 ? '' : 's'} answered, from 1 to 5.</p>
        ${FB_QUESTIONS.map(([k, label]) => html`<div class="row-flex"><span class="spacer">${label}</span><span class="strong">${Number(l.student_feedback[k]).toFixed(1)}</span></div>`)}
        ${l.student_feedback.comments.map(c => html`<p class="pre" style="border-left:3px solid var(--indigo);padding-left:var(--sm)">${c}</p>`)}</div>` : null}`}`;
}

export function CandidateMaterials() {
  const [type, setType] = useState('');
  const [level, setLevel] = useState('');
  const data = useLoad(() => rpc('materials_list', { p_type: type, p_level: level }), [type, level]);
  return html`<${PageHeader} title="Lesson materials" subtitle="Slides, exercises and pairwork games for your lessons. Open a file or a link to use it." />
    <${MaterialList} data=${data} type=${type} level=${level} setType=${setType} setLevel=${setLevel} />`;
}

const EMPTY_ENTRY = () => ({ date: todayISO(), teacher: '', group: '', techniques: '', will_use: '' });

export function CandidateJournal() {
  const j = useLoad(() => rpc('journal_list', { p_candidate_id: null }));
  const [f, setF] = useState(EMPTY_ENTRY());
  const [msg, setMsg] = useState('');
  const [run, busy, error] = useAction();
  const save = () => {
    const miss = [[f.date, 'lesson date'], [f.teacher, 'teacher you watched'], [f.techniques, 'techniques you saw'], [f.will_use, 'what you will use']]
      .filter(([v]) => !String(v).trim()).map(([, n]) => n);
    if (miss.length) { setMsg('Please fill in: ' + miss.join(', ') + '.'); return; }
    setMsg('');
    run(async () => {
      await rpc('candidate_add_journal', { p_lesson_date: f.date, p_observed_teacher: f.teacher, p_group_name: f.group, p_techniques: f.techniques, p_will_use: f.will_use });
      setF({ ...EMPTY_ENTRY(), date: f.date }); await j.reload(); toast('Entry saved. Your mentor can read it now.');
    });
  };
  const set = (k, v) => { setF({ ...f, [k]: v }); setMsg(''); };
  return html`
    <${PageHeader} title="My journal" subtitle="After each lesson you watch, write what the teacher did and what you will use in your own lessons. Your mentor reads it." />
    <div class="card"><${CardHead} icon="pencil" title="New entry" />
      <div class="grid c3">
        <div class="field"><label for="j-d">Lesson date</label><input id="j-d" class="input" type="date" value=${f.date} onInput=${e => set('date', e.target.value)} /></div>
        <div class="field"><label for="j-t">Teacher you watched</label><input id="j-t" class="input" value=${f.teacher} onInput=${e => set('teacher', e.target.value)} placeholder="e.g. Malika Karimova" /></div>
        <div class="field"><label for="j-g">Group (optional)</label><input id="j-g" class="input" value=${f.group} onInput=${e => set('group', e.target.value)} placeholder="e.g. Elementary 2" /></div>
      </div>
      <div class="field"><label for="j-x">Techniques I saw</label><textarea id="j-x" class="input" rows="3" value=${f.techniques} onInput=${e => set('techniques', e.target.value)}
        placeholder="What did the teacher do that worked? e.g. concept-check questions after each new word"></textarea></div>
      <div class="field"><label for="j-u">What I will use</label><textarea id="j-u" class="input" rows="3" value=${f.will_use} onInput=${e => set('will_use', e.target.value)}
        placeholder="Which idea will you try in your own lesson, and how?"></textarea></div>
      ${msg ? html`<p class="error-text">${msg}</p>` : null}<${ErrorBox} error=${error} />
      <div class="actions" style="justify-content:flex-end"><${Button} icon="check" busy=${busy} onClick=${save}>Save entry</${Button}></div>
    </div>
    <div class="card flush"><${CardHead} icon="book-open" title="My entries" />
      ${j.loading && !j.data ? html`<${Loader} />` : j.error ? html`<div style="padding:var(--md)"><${ErrorBox} error=${j.error} /></div>`
        : j.data.length ? html`<div class="list">${j.data.map(e => html`<${JournalEntry} j=${e} />`)}</div>`
        : html`<${Empty} icon="notebook" title="No entries yet" text="Watch a lesson, then write your first entry above." />`}</div>`;
}

// ---------------------------------------------------------------- Methods quiz
export function CandidateQuiz() {
  const q = useLoad(() => rpc('candidate_quiz'));
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [msg, setMsg] = useState('');
  const [run, busy, error] = useAction();
  if (q.loading && !q.data) return html`<${Loader} />`;
  if (q.error) return html`<${ErrorBox} error=${q.error} />`;
  const qs = q.data.questions;
  const submit = () => {
    const left = qs.filter(x => answers[x.id] === undefined).length;
    if (left) { setMsg(`Please answer every question. ${left} ${left === 1 ? 'is' : 'are'} still open.`); return; }
    setMsg('');
    run(async () => { const r = await rpc('candidate_submit_quiz', { p_answers: answers }); setResult(r); q.reload(); window.scrollTo(0, 0); });
  };
  const res = id => result && result.results.find(r => r.question_id === id);
  return html`
    <${PageHeader} title="Methods quiz" subtitle="Short questions about teaching methods used at Edunest. You can take it as often as you like.">
      ${result ? html`<${Button} kind="secondary" icon="refresh-cw" onClick=${() => { setResult(null); setAnswers({}); }}>Try again</${Button}>` : null}
    </${PageHeader}>
    ${result ? html`<div class="card" style="align-items:center;text-align:center">
      <span class="display" style=${{ color: result.score / result.total >= 0.8 ? 'var(--em)' : result.score / result.total >= 0.5 ? 'var(--am)' : 'var(--ro)' }}>${result.score} / ${result.total}</span>
      <p class="muted">${result.score === result.total ? 'Excellent: every answer is right.' : 'Read the explanations below, then try again.'}</p></div>` : null}
    ${!qs.length ? html`<div class="card"><${Empty} icon="list-checks" title="No questions yet" text="The boss has not added quiz questions yet." /></div>`
      : qs.map((x, i) => { const r = res(x.id); return html`<div class=${'card criterion' + (r ? (r.correct ? ' done' : '') : answers[x.id] !== undefined ? ' done' : '')} style=${r && !r.correct ? { borderLeftColor: 'var(--ro)' } : null}>
        <span class="strong">${i + 1}. ${x.question}</span>
        <div class="stack sm">${x.options.map((o, k) => {
          const chosen = answers[x.id] === k;
          const mark = r ? (k === r.correct_index ? 'ok' : chosen ? 'bad' : '') : '';
          return html`<label class="check" style=${{ alignItems: 'flex-start', padding: '8px 10px', borderRadius: '8px', border: '1px solid ' + (mark === 'ok' ? 'var(--em)' : mark === 'bad' ? 'var(--ro)' : chosen ? 'var(--indigo)' : 'var(--border)'), background: mark === 'ok' ? 'var(--em-s)' : mark === 'bad' ? 'var(--ro-s)' : chosen ? 'var(--indigo-s)' : 'var(--surface)' }}>
            <input type="radio" name=${'q' + x.id} checked=${chosen} disabled=${!!result} onChange=${() => { setAnswers({ ...answers, [x.id]: k }); setMsg(''); }} /><span>${o}</span></label>`;
        })}</div>
        ${r && r.explanation ? html`<p class="descriptors" style="font-size:14px"><span><b>${r.correct ? 'Right.' : 'Not quite.'}</b> ${r.explanation}</span></p>` : null}
      </div>`; })}
    ${qs.length && !result ? html`<div class="card sticky-bar"><span class="strong">${Object.keys(answers).length} of ${qs.length} answered</span>
      ${msg ? html`<span class="error-text" style="flex:1 1 100%">${msg}</span>` : null}<${ErrorBox} error=${error} />
      <${Button} icon="check" busy=${busy} onClick=${submit}>Check my answers</${Button}></div>` : null}
    ${q.data.attempts.length ? html`<div class="card"><${CardHead} icon="list-checks" title="My attempts" />
      <div class="stack sm">${q.data.attempts.slice(0, 10).map(a => html`<div class="row-flex"><span class="spacer">${fmtDateTime(a.created_at)}</span><span class="strong">${a.score} / ${a.total}</span></div>`)}</div></div>` : null}`;
}
