// My account (every role): password, Telegram, install the app on the phone.
import { html, useState, useEffect, Button, Icon, PageHeader, CardHead, Badge, Field, ErrorBox, useAction, toast } from '../ui.js';
import { rpc, getViewAs } from '../api.js';
import { roleLabel, stageLabel } from '../util.js';

export function MyAccount({ me, onChanged }) {
  const preview = !!getViewAs();
  return html`
    <${PageHeader} title="My account" subtitle="Your details, password and notifications." />
    <div class="grid c2">
      <div class="card"><${CardHead} icon="user-cog" title="Details" />
        <div class="stack sm">
          <div class="row-flex"><span class="muted spacer">Name</span><span class="strong">${me.full_name}</span></div>
          <div class="row-flex"><span class="muted spacer">Login</span><span class="strong">${me.login}</span></div>
          <div class="row-flex"><span class="muted spacer">Role</span><${Badge} kind="info">${roleLabel(me.role)}</${Badge}></div>
          ${me.role === 'candidate' ? html`<div class="row-flex"><span class="muted spacer">Stage</span><span>${stageLabel(me.stage)}</span></div>` : null}
          ${me.mentor_name ? html`<div class="row-flex"><span class="muted spacer">Mentor</span><span>${me.mentor_name}</span></div>` : null}
        </div>
        <p class="hint">To change your name or login, ask the administrator.</p></div>
      <${PasswordCard} preview=${preview} />
      <${TelegramCard} me=${me} preview=${preview} onChanged=${onChanged} />
      <${InstallCard} />
    </div>`;
}

function PasswordCard({ preview }) {
  const [f, setF] = useState({ current: '', next: '', again: '' });
  const [msg, setMsg] = useState('');
  const [run, busy, error] = useAction();
  const save = () => {
    if (!f.current || !f.next) { setMsg('Please fill in both passwords.'); return; }
    if (f.next.length < 8) { setMsg('The new password needs at least 8 characters.'); return; }
    if (f.next !== f.again) { setMsg('The new passwords are not the same.'); return; }
    setMsg('');
    run(async () => { await rpc('me_change_password', { p_current: f.current, p_new: f.next }); setF({ current: '', next: '', again: '' }); toast('Password changed. Use the new one next time you sign in.'); });
  };
  return html`<div class="card"><${CardHead} icon="key-round" title="Change password" />
    <${Field} label="Current password" id="pw-c"><input id="pw-c" class="input" type="password" autocomplete="current-password" value=${f.current} onInput=${e => setF({ ...f, current: e.target.value })} /></${Field}>
    <${Field} label="New password" id="pw-n" hint="At least 8 characters."><input id="pw-n" class="input" type="password" autocomplete="new-password" value=${f.next} onInput=${e => setF({ ...f, next: e.target.value })} /></${Field}>
    <${Field} label="New password again" id="pw-a"><input id="pw-a" class="input" type="password" autocomplete="new-password" value=${f.again} onInput=${e => setF({ ...f, again: e.target.value })} /></${Field}>
    ${msg ? html`<p class="error-text">${msg}</p>` : null}<${ErrorBox} error=${error} />
    <div><${Button} busy=${busy} disabled=${preview} onClick=${save}>Change password</${Button}></div></div>`;
}

function TelegramCard({ me, preview, onChanged }) {
  const [v, setV] = useState(me.telegram_chat_id || '');
  const [run, busy, error] = useAction();
  const save = () => run(async () => { await rpc('me_set_telegram', { p_chat_id: v }); toast(v.trim() ? 'Telegram chat id saved' : 'Telegram messages switched off'); onChanged && onChanged(); });
  return html`<div class="card"><${CardHead} icon="send" title="Telegram messages" />
    <p class="muted">${me.role === 'teacher' ? 'Get a message when you are asked to observe a lesson, when it moves, and reminders to score.' : 'Lesson messages are sent to this chat.'}</p>
    <ol class="muted" style="margin:0;padding-left:20px">
      <li>Open the Edunest bot in Telegram and press <b>Start</b> (ask the boss for the bot's name).</li>
      <li>Open <b>@userinfobot</b>; it replies with your Id.</li>
      <li>Paste that number here.</li></ol>
    <${Field} label="Telegram chat id" id="tg"><input id="tg" class="input" inputmode="numeric" value=${v} onInput=${e => setV(e.target.value)} placeholder="e.g. 123456789" /></${Field}>
    <${ErrorBox} error=${error} />
    <div><${Button} kind="secondary" busy=${busy} disabled=${preview} onClick=${save}>Save</${Button}></div></div>`;
}

function InstallCard() {
  const [prompt, setPrompt] = useState(window.__installPrompt || null);
  const installed = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  useEffect(() => {
    const h = () => setPrompt(window.__installPrompt || null);
    window.addEventListener('edunest-install-ready', h);
    return () => window.removeEventListener('edunest-install-ready', h);
  }, []);
  const install = async () => { prompt.prompt(); await prompt.userChoice.catch(() => {}); window.__installPrompt = null; setPrompt(null); };
  return html`<div class="card"><${CardHead} icon="download" title="Install on your phone" />
    ${installed ? html`<p class="row-flex ok"><${Icon} name="circle-check" />The app is installed on this device.</p>`
      : html`<p class="muted">Open Edunest like an app: its own icon on the home screen, full screen, quick to start.</p>
        ${prompt ? html`<div><${Button} icon="download" onClick=${install}>Install app</${Button}></div>`
          : ios ? html`<p class="muted">On iPhone: tap the <b>Share</b> button in Safari, then <b>Add to Home Screen</b>.</p>`
          : html`<p class="muted">On Android (Chrome): open the menu <b>⋮</b> and tap <b>Install app</b> or <b>Add to Home screen</b>.</p>`}`}
  </div>`;
}
