import { html, useState, Button, Icon, ErrorBox } from '../ui.js';
import { signIn, errorText } from '../api.js';

export function LoginPage({ notice, onNotice }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async e => {
    e.preventDefault();
    if (busy) return;
    if (!login.trim() || !password) { setError('Please enter your login and password.'); return; }
    setBusy(true); setError(''); onNotice('');
    try { await signIn(login, password); }
    catch (err) { setError(errorText(err)); setBusy(false); }
  };

  return html`<div class="login">
    <div class="login-art">
      <div class="brand"><span class="brand-mark"><${Icon} name="graduation-cap" /></span><span class="brand-name">Edunest</span></div>
      <div class="stack">
        <h1 class="page-title" style="color:#fff">Teacher certification</h1>
        <p>Trial lessons scored against one shared standard. Observers score, the boss decides, candidates see their progress.</p>
      </div>
      <p class="caption" style="color:var(--sb-text)">© Edunest — staff training</p>
    </div>
    <div class="login-form">
      <form onSubmit=${submit} novalidate>
        <div class="stack sm"><h1 class="page-title">Sign in</h1>
          <p class="muted">Use the login and password you got from the administrator.</p></div>
        ${notice ? html`<p class="warn-box">${notice}</p>` : null}
        <div class="field"><label for="login">Login</label>
          <input id="login" class="input" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="e.g. ali.karimov"
            value=${login} onInput=${e => { setLogin(e.target.value); setError(''); }} /></div>
        <div class="field"><label for="password">Password</label>
          <div style="position:relative">
            <input id="password" class="input" type=${show ? 'text' : 'password'} autocomplete="current-password" placeholder="Your password"
              value=${password} onInput=${e => { setPassword(e.target.value); setError(''); }} style="padding-right:44px" />
            <button type="button" class="btn ghost" style="position:absolute;right:2px;top:3px" aria-label=${show ? 'Hide password' : 'Show password'}
              onClick=${() => setShow(!show)}><${Icon} name=${show ? 'eye-off' : 'eye'} /></button>
          </div></div>
        <${ErrorBox} error=${error} />
        <${Button} type="submit" busy=${busy} block>Sign in</${Button}>
        <p class="caption">Forgot your password? Ask the administrator to set a new one.</p>
      </form>
    </div>
  </div>`;
}
