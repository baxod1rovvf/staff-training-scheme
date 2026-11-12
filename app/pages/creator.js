import { html, useState, Button, Icon, PageHeader, Loader, Empty, Badge, StageBadge, Chips, Field, SlideOver, Dialog, ErrorBox,
  Person, useLoad, useAction, toast } from '../ui.js';
import { rpc } from '../api.js';
import { ROLES, roleLabel, fmtDate } from '../util.js';

const EMPTY = { id: null, full_name: '', login: '', password: '', role: 'teacher', status: 'active', telegram_chat_id: '', mentor_id: '' };

export function CreatorAccounts({ me }) {
  const users = useLoad(() => rpc('creator_list_users'));
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('active');
  const [form, setForm] = useState(null);
  const [pw, setPw] = useState(null);

  const list = (users.data || []).filter(u => (!role || u.role === role) && (!status || u.status === status) &&
    (!q.trim() || (u.full_name + ' ' + u.login).toLowerCase().includes(q.trim().toLowerCase())));
  const teachers = (users.data || []).filter(u => u.role === 'teacher' && u.status === 'active');

  return html`
    <${PageHeader} title="Accounts" subtitle="Create the logins for the boss, teachers and candidates. Everyone signs in with the login and password you give them.">
      <${Button} icon="user-plus" onClick=${() => setForm({ ...EMPTY })}>Create account</${Button}>
    </${PageHeader}>
    <div class="card" style="padding:var(--md)">
      <div class="row-flex">
        <div style="position:relative;flex:1 1 260px">
          <span style="position:absolute;left:12px;top:12px;color:var(--muted)"><${Icon} name="search" /></span>
          <input class="input" style="padding-left:40px" placeholder="Search by name or login" aria-label="Search accounts" value=${q} onInput=${e => setQ(e.target.value)} />
        </div>
        <${Chips} options=${[['', 'All'], ...ROLES.map(([k, l]) => [k, l])]} value=${role} onChange=${setRole} />
        <${Chips} options=${[['active', 'Active'], ['blocked', 'Blocked'], ['', 'All statuses']]} value=${status} onChange=${setStatus} />
      </div>
    </div>
    <div class="card flush">
      ${users.loading && !users.data ? html`<${Loader} />` : users.error ? html`<div style="padding:var(--md)"><${ErrorBox} error=${users.error} /></div>`
        : list.length === 0 ? html`<${Empty} icon="users" title=${users.data.length ? 'No accounts match' : 'No accounts yet'}
            text=${users.data.length ? 'Try another search, role or status.' : 'Create the first boss, teacher or candidate account.'} />`
        : html`<div class="table-wrap"><table class="table">
          <thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Telegram</th><th>Created</th><th></th></tr></thead>
          <tbody>${list.map(u => html`<tr class="click" onClick=${() => setForm({ ...EMPTY, ...u, password: '', telegram_chat_id: u.telegram_chat_id || '', mentor_id: u.mentor_id || '' })}>
            <td><${Person} name=${u.full_name} sub=${'@' + u.login + (u.id === me.id ? ' · you' : '')} /></td>
            <td><${Badge} kind="info">${roleLabel(u.role)}</${Badge}>${u.role === 'candidate' && u.stage ? html` <${StageBadge} stage=${u.stage} />` : null}</td>
            <td><${Badge} kind=${u.status === 'active' ? 'success' : 'danger'}>${u.status === 'active' ? 'Active' : 'Blocked'}</${Badge}></td>
            <td class="muted">${u.telegram_chat_id || '—'}</td>
            <td class="muted nowrap">${fmtDate(u.created_at)}</td>
            <td style="text-align:right"><${Button} kind="secondary" small icon="key-round" onClick=${e => { e.stopPropagation(); setPw(u); }}>Password</${Button}></td>
          </tr>`)}</tbody></table></div>`}
    </div>
    ${form ? html`<${AccountForm} form=${form} me=${me} teachers=${teachers} onClose=${() => setForm(null)}
      onSaved=${msg => { setForm(null); users.reload(); toast(msg); }} />` : null}
    ${pw ? html`<${PasswordDialog} user=${pw} onClose=${() => setPw(null)} />` : null}`;
}

function AccountForm({ form, me, teachers, onClose, onSaved }) {
  const [f, setF] = useState(form);
  const [run, busy, error] = useAction();
  const [del, setDel] = useState(false);
  const remove = () => run(async () => {
    await rpc('creator_delete_user', { p_user_id: f.id });
    setDel(false); onSaved('Account deleted: ' + form.full_name);
  });
  const editing = !!f.id;
  const self = f.id === me.id;
  const set = (k, v) => setF({ ...f, [k]: v });

  const save = () => run(async () => {
    if (editing) {
      await rpc('creator_update_user', { p_user_id: f.id, p_full_name: f.full_name, p_login: f.login, p_role: f.role, p_status: f.status,
        p_telegram_chat_id: f.telegram_chat_id, p_mentor_id: f.role === 'candidate' && f.mentor_id ? f.mentor_id : null });
      onSaved('Changes saved');
    } else {
      await rpc('creator_create_user', { p_full_name: f.full_name, p_login: f.login, p_password: f.password, p_role: f.role, p_status: f.status,
        p_telegram_chat_id: f.telegram_chat_id, p_mentor_id: f.role === 'candidate' && f.mentor_id ? f.mentor_id : null });
      onSaved('Account created for ' + f.full_name.trim());
    }
  });

  return html`<${SlideOver} title=${editing ? 'Edit account' : 'Create account'} onClose=${onClose}
    footer=${html`<${Button} kind="secondary" onClick=${onClose}>Cancel</${Button}><${Button} busy=${busy} onClick=${save}>${editing ? 'Save changes' : 'Create account'}</${Button}>`}>
    <${Field} label="Full name" id="f-name"><input id="f-name" class="input" value=${f.full_name} onInput=${e => set('full_name', e.target.value)} placeholder="e.g. Ali Karimov" /></${Field}>
    <${Field} label="Login" id="f-login" hint="3–32 characters: letters, numbers, dot, dash or underscore. Saved in lower case.">
      <input id="f-login" class="input" autocapitalize="none" spellcheck="false" value=${f.login} onInput=${e => set('login', e.target.value)} placeholder="e.g. ali.karimov" /></${Field}>
    ${editing ? null : html`<${Field} label="Password" id="f-pw" hint="At least 8 characters. Give it to the person in private; you can set a new one later with “Password”.">
      <input id="f-pw" class="input" value=${f.password} onInput=${e => set('password', e.target.value)} autocomplete="new-password" /></${Field}>`}
    <div class="field"><span class="label">Role</span>
      <${Chips} square options=${ROLES} value=${f.role} onChange=${v => set('role', v)} disabled=${self} />
      ${self ? html`<p class="hint">You cannot change your own role.</p>` : null}</div>
    <div class="field"><span class="label">Status</span>
      <${Chips} square options=${[['active', 'Active'], ['blocked', 'Blocked']]} value=${f.status} onChange=${v => set('status', v)} disabled=${self} />
      <p class="hint">A blocked person cannot sign in.</p></div>
    ${f.role === 'candidate' ? html`<${Field} label="Mentor (optional)" id="f-mentor" hint="The mentor reads the candidate's journal and cannot observe their lessons.">
      <select id="f-mentor" class="input" value=${f.mentor_id} onChange=${e => set('mentor_id', e.target.value)}>
        <option value="">No mentor</option>${teachers.map(t => html`<option value=${t.id}>${t.full_name}</option>`)}</select></${Field}>` : null}
    <${Field} label="Telegram chat id (optional)" id="f-tg" hint="Needed only for lesson messages by Telegram. The person gets it from @userinfobot.">
      <input id="f-tg" class="input" inputmode="numeric" value=${f.telegram_chat_id} onInput=${e => set('telegram_chat_id', e.target.value)} placeholder="e.g. 123456789" /></${Field}>
    ${editing && !self ? html`<div class="stack sm" style="border-top:1px solid var(--border);padding-top:var(--md)">
      <span class="label">Delete account</span>
      <p class="hint">Only for accounts made by mistake. People with lessons, scores or journal entries are blocked instead, so the records stay.</p>
      <div><${Button} kind="secondary" small icon="trash-2" onClick=${() => setDel(true)}>Delete account</${Button}></div></div>` : null}
    <${ErrorBox} error=${error} />
    ${del ? html`<${Dialog} title=${'Delete ' + form.full_name + '?'} onClose=${() => setDel(false)}
      footer=${html`<${Button} kind="secondary" onClick=${() => setDel(false)}>Cancel</${Button}><${Button} kind="danger" busy=${busy} onClick=${remove}>Delete account</${Button}>`}>
      <p class="muted">The login @${form.login} stops working and the account disappears. This cannot be undone.</p><${ErrorBox} error=${error} /></${Dialog}>` : null}
  </${SlideOver}>`;
}

function PasswordDialog({ user, onClose }) {
  const [pw, setPw] = useState('');
  const [run, busy, error] = useAction();
  const save = () => run(async () => {
    await rpc('creator_reset_password', { p_user_id: user.id, p_password: pw });
    toast('New password set for ' + user.full_name);
    onClose();
  });
  return html`<${Dialog} title=${'New password for ' + user.full_name} onClose=${onClose}
    footer=${html`<${Button} kind="secondary" onClick=${onClose}>Cancel</${Button}><${Button} busy=${busy} onClick=${save}>Set password</${Button}>`}>
    <${Field} label="New password" id="np" hint="At least 8 characters. Their current sessions stay signed in until they sign out.">
      <input id="np" class="input" value=${pw} onInput=${e => setPw(e.target.value)} autocomplete="new-password" /></${Field}>
    <${ErrorBox} error=${error} />
  </${Dialog}>`;
}
