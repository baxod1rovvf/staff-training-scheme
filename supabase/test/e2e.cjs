// Browser test of the whole flow against local_api.cjs (real SQL functions on a local Postgres).
//   node supabase/test/e2e.cjs [outDir]    — needs local_api.cjs running and a fresh database with the creator set up.
const { chromium } = require('playwright');
const OUT = process.argv[2] || '/tmp/edunest-shots';
const BASE = process.env.BASE || 'http://localhost:8787/';
require('fs').mkdirSync(OUT, { recursive: true });

const errors = [];
let step = 0;
const ok = msg => console.log('ok  ' + msg);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error' && !/status of 400/.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));

  const shot = async name => {
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}/${String(++step).padStart(2, '0')}-${name}-1280.png`, fullPage: true });
    await page.setViewportSize({ width: 375, height: 760 });
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}/${String(step).padStart(2, '0')}-${name}-375.png`, fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1) errors.push(`${name}: page scrolls sideways by ${overflow}px at 375px`);
    await page.setViewportSize({ width: 1280, height: 860 });
  };
  const go = async hash => { await page.goto(BASE + '#/' + hash); await page.waitForLoadState('networkidle'); await page.waitForTimeout(300); };
  const login = async (l, p) => {
    await page.goto(BASE); await page.waitForLoadState('networkidle');
    if (await page.locator('[aria-label="Sign out"]').count()) { await page.click('[aria-label="Sign out"]'); }
    await page.fill('#login', l); await page.fill('#password', p); await page.click('button[type=submit]');
    await page.waitForSelector('.sidebar', { timeout: 8000 }); await page.waitForLoadState('networkidle');
  };
  const waitToast = async text => page.waitForSelector(`.toast:has-text(${JSON.stringify(text)})`, { timeout: 8000 });
  const toastText = async () => (await page.waitForSelector('.toast', { timeout: 8000 })).innerText();
  const expect = (cond, msg) => { if (!cond) throw new Error('FAIL: ' + msg); ok(msg); };

  try {
    // Login page and a wrong password
    await page.goto(BASE); await page.waitForSelector('#login');
    await shot('login');
    await page.fill('#login', 'creator'); await page.fill('#password', 'wrong-pass'); await page.click('button[type=submit]');
    expect((await (await page.waitForSelector('.error-box')).innerText()).includes('Wrong login or password'), 'wrong password message');

    // Creator: accounts
    await login('creator', 'creator-pass-1');
    expect(page.url().includes('#/creator'), 'creator lands on Accounts');
    const create = async (name, lg, pw, role, mentor) => {
      await page.click('text=Create account');
      await page.fill('#f-name', name); await page.fill('#f-login', lg); await page.fill('#f-pw', pw);
      await page.click(`.slideover .chip:text-is("${role}")`);
      if (mentor) await page.selectOption('#f-mentor', { label: mentor });
      await page.click('.slideover-foot >> text=Create account');
      const t = await toastText();
      expect(t.includes('Account created for ' + name), 'created ' + lg);
      await page.waitForSelector('.slideover', { state: 'detached' });
    };
    await create('Jasurbek Abduraximov', 'jasurbek', 'boss-pass-1', 'Boss');
    await create('Toxirjon Baxodirov', 'TOXIRJON', '22222222', 'Teacher');
    await create('Teacher Two', 'teach2', 'teach-2-pass', 'Teacher');
    await create('Mentor Three', 'mentor3', 'mentor-3-pass', 'Teacher');
    await create('Candidate One', 'cand1', 'cand-1-pass', 'Candidate', 'Mentor Three');
    // duplicate login error inside the form
    await page.click('text=Create account');
    await page.fill('#f-name', 'Dup'); await page.fill('#f-login', 'toxirjon'); await page.fill('#f-pw', '12345678');
    await page.click('.slideover-foot >> text=Create account');
    expect((await (await page.waitForSelector('.slideover .error-box')).innerText()).includes('already taken'), 'duplicate login is refused');
    await page.click('.slideover-foot >> text=Cancel');
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 6, null, { timeout: 8000 }); ok('accounts table lists 6 accounts');
    await shot('creator-accounts');

    // Boss: schedule a full lesson
    await login('jasurbek', 'boss-pass-1');
    expect(page.url().includes('#/boss'), 'boss lands on dashboard');
    expect((await page.locator('.nav a').count()) === 9, 'boss sees 9 navigation links (incl. Analytics, Methods quiz, My account)');
    await shot('boss-dashboard');
    await go('boss/lessons');
    await page.click('text=Schedule lesson');
    await page.selectOption('#s-c', { label: 'Candidate One' });
    await page.click('.slideover .chip:text-is("Full trial lesson")');
    await page.fill('#s-w', '2026-11-10T14:00');
    await page.fill('#s-g', 'Elementary 3'); await page.fill('#s-t', 'Food');
    expect(await page.locator('.slideover .chip:has-text("Mentor Three")').isDisabled(), 'mentor cannot be picked as observer');
    await page.click('.slideover .chip:has-text("Toxirjon Baxodirov")');
    await page.click('.slideover .chip:has-text("Teacher Two")');
    await shot('boss-schedule');
    await page.click('.slideover-foot >> text=Schedule');
    await waitToast('Lesson scheduled'); ok('lesson scheduled');
    await page.waitForSelector('.slideover', { state: 'detached' });
    await shot('boss-lessons');

    // Teachers score
    const score = async (lg, pw, pick) => {
      await login(lg, pw);
      await page.click('.list-row:has-text("Candidate One")');
      await page.waitForSelector('.bands');
      const groups = page.locator('.bands');
      const n = await groups.count();
      for (let i = 0; i < n; i++) await groups.nth(i).locator(`button:text-is("${pick(i)}")`).click();
      await page.locator('input[aria-label^="Comment on"]').first().fill('Clear plan');
      await page.fill('#overall', 'Good lesson.');
      await page.click('text=/Submit scores/');
      await page.click('.dialog button:text-is("Submit")');
      await waitToast('Scores submitted'); ok(lg + ' submitted scores');
    };
    await login('toxirjon', '22222222');
    await shot('teacher-home');
    await page.click('.list-row:has-text("Candidate One")'); await page.waitForSelector('.bands');
    await page.click('text=/Submit scores/');
    expect((await page.locator('.sticky-bar .error-text').innerText()).includes('10 are still empty'), 'empty bands are named before submitting');
    await page.click('text=What do the bands look like?');
    await shot('teacher-score');
    await score('toxirjon', '22222222', i => (i === 6 ? 6 : 7));
    await score('teach2', 'teach-2-pass', i => ([0, 3, 5, 8].includes(i) ? 8 : i === 6 ? 6 : 7));
    await shot('teacher-score-locked');

    // Boss decides
    await login('jasurbek', 'boss-pass-1');
    await page.waitForSelector('.list-row:has-text("Candidate One")', { timeout: 8000 }); ok('dashboard shows the lesson awaiting decision');
    await page.click('.list-row:has-text("Candidate One")');
    await page.waitForSelector('.display');
    expect((await page.locator('.display').innerText()) === '7.0', 'boss sees overall band 7.0');
    await shot('boss-lesson');
    await page.click('.chip:text-is("Decline")'); await page.click('text=Decide');
    expect((await page.locator('.error-box').innerText()).includes('write a note'), 'declining a ready lesson needs a note');
    await page.click('.chip:text-is("Approve")'); await page.fill('#note', 'Well done. More pair work next time.');
    await page.click('text=Decide'); await page.click('.dialog button:text-is("Approve")');
    await waitToast('now on probation'); ok('approved; candidate on probation');
    await page.click('text=Report'); await page.waitForSelector('.report table');
    await shot('boss-report');
    await page.click('text=Back to the lesson');

    // Boss: other pages
    for (const [h, name] of [['boss/candidates', 'boss-candidates'], ['boss/standard', 'boss-standard'], ['boss/materials', 'boss-materials'], ['boss/calibration', 'boss-calibration']]) {
      await go(h); await page.waitForSelector('.page-title'); await shot(name);
    }
    await go('boss/materials');
    await page.click('text=Add material');
    await page.fill('#m-t', 'Past simple drills'); await page.click('.slideover .chip:text-is("Exercises")');
    await page.fill('#m-l', 'https://example.com/drills');
    await page.click('.slideover-foot >> text=Save');
    await waitToast('Material added'); ok('material added');
    await go('boss/calibration');
    await page.click('text=Add calibration lesson');
    await page.fill('#c-t', 'Sample lesson'); await page.fill('#c-v', 'https://example.com/video');
    const rb = page.locator('.slideover .bands'); for (let i = 0; i < await rb.count(); i++) await rb.nth(i).locator('button:text-is("5")').click();
    await page.click('.slideover-foot >> text=Save');
    await waitToast('Calibration lesson added'); ok('calibration lesson added');
    await go('boss/candidates'); await page.click('tbody tr:has-text("Candidate One")'); await page.waitForSelector('.steps, .chips');
    await shot('boss-candidate');
    await go('boss/standard'); await page.click('.page-header >> text=Edit'); await page.waitForSelector('#n0');
    await page.fill('#n1', 'Lesson aim'); await page.click('text=Save draft');
    await waitToast('Draft saved'); ok('standard draft saved');
    await page.click('text=/Publish version 2/'); await page.click('.dialog button:text-is("Publish")');
    await waitToast('Version 2 is now the active standard'); ok('standard v2 published');

    // Teacher calibration
    await login('toxirjon', '22222222');
    await go('teacher/calibration'); await page.click('text=Score it');
    const cb = page.locator('.bands'); for (let i = 0; i < await cb.count(); i++) await cb.nth(i).locator('button:text-is("7")').click();
    await page.click('text=Check my bands');
    await page.waitForSelector('.display');
    expect((await page.locator('.display').innerText()) === '75%', 'calibration accuracy 75%');
    await shot('teacher-calibration-result');

    // Candidate
    await login('cand1', 'cand-1-pass');
    expect((await page.locator('.step.now span').innerText()) === 'Probation', 'candidate stage tracker at Probation');
    await shot('candidate-home');
    await page.click('.list-row:has-text("Full trial lesson")'); await page.waitForSelector('.display');
    expect((await page.locator('.display').innerText()) === '7.0', 'candidate sees 7.0');
    const body = await page.locator('#main').innerText();
    expect(!/Toxirjon|Teacher Two/.test(body), 'candidate result shows no observer names');
    await shot('candidate-result');
    await go('candidate/materials'); await page.waitForSelector('.list-row'); await shot('candidate-materials');
    await go('candidate/journal');
    await page.fill('#j-t', 'Mentor Three'); await page.click('text=Save entry');
    expect((await page.locator('.error-text').innerText()).includes('techniques you saw'), 'journal names missing fields');
    await page.fill('#j-x', 'Concept-check questions.'); await page.fill('#j-u', 'CCQs before tasks.'); await page.click('text=Save entry');
    await waitToast('Entry saved'); ok('journal entry saved');
    await shot('candidate-journal');

    // Mentor reads it
    await login('mentor3', 'mentor-3-pass');
    await page.waitForSelector('a.list-row:has-text("Candidate One")'); await page.click('a.list-row:has-text("Candidate One")');
    await page.waitForURL(/teacher\/mentee\//); await page.waitForSelector('#main :text("CCQs before tasks.")', { timeout: 8000 }); ok('mentor reads the journal');
    await shot('teacher-mentee');


    // ===================== New features =====================
    const pad = n => String(n).padStart(2, '0');
    const inDays = d => { const f = new Date(Date.now() + d * 86400000); return `${f.getFullYear()}-${pad(f.getMonth() + 1)}-${pad(f.getDate())}T10:00`; };
    const schedule = async (type, days) => {
      await go('boss/lessons'); await page.click('text=Schedule lesson');
      await page.selectOption('#s-c', { label: 'Candidate One' });
      await page.click(`.slideover .chip:text-is("${type}")`);
      await page.fill('#s-w', inDays(days));
      await page.click('.slideover .chip:has-text("Toxirjon Baxodirov")'); await page.click('.slideover .chip:has-text("Teacher Two")');
      await page.click('.slideover-foot >> text=Schedule'); await waitToast('Lesson scheduled');
      await page.waitForSelector('.slideover', { state: 'detached' });
    };

    // Student feedback by QR code (on the decided lesson)
    await login('jasurbek', 'boss-pass-1');
    await go('boss/lessons'); await page.click('.list-row:has-text("Approved")'); await page.waitForSelector('text=Student feedback');
    await page.click('text=Show QR code'); await page.waitForSelector('[aria-label="QR code for student feedback"] svg');
    const fbLink = await page.locator('code').innerText();
    expect(fbLink.includes('#/feedback/'), 'QR code and feedback link shown');
    await shot('boss-lesson-qr');
    const student = await browser.newContext({ viewport: { width: 390, height: 844 } }); const sp = await student.newPage();
    await sp.goto(fbLink); await sp.waitForSelector('text=How was the lesson');
    await sp.click('text=Send');
    expect((await sp.locator('.error-text').innerText()).includes('all four'), 'feedback asks for all four answers');
    for (let i = 0; i < 4; i++) await sp.locator('.chips').nth(i).locator('button').nth(i === 2 ? 2 : 4).click();
    await sp.screenshot({ path: `${OUT}/${String(++step).padStart(2, '0')}-student-feedback-390.png`, fullPage: true });
    await sp.fill('#fb-c', 'Very fun lesson!'); await sp.click('text=Send'); await sp.waitForSelector('text=Thank you!');
    ok('student sends feedback without signing in');
    await student.close();
    await page.reload(); await page.waitForSelector('text=1 student answered'); ok('boss sees the student feedback');

    // Edit, then (later) cancel a lesson; remove an observer
    await schedule('Micro-teaching', 2);
    await page.click('.list-row:has-text("Scoring 0/2")'); await page.waitForSelector('text=Cancel lesson');
    await page.click('.page-header >> text=Edit'); await page.fill('#e-g', 'Pre-Int 2'); await page.fill('#e-t', 'Holidays');
    await page.fill('#e-w', inDays(3)); await page.click('.slideover-foot >> text=Save');
    await waitToast('Lesson moved'); ok('lesson moved and edited');
    const lessonUrl = page.url();

    // Teacher: drafts survive a reload
    await login('toxirjon', '22222222');
    await page.click('a.list-row:has-text("Candidate One")'); await page.waitForSelector('.bands');
    for (let i = 0; i < 3; i++) await page.locator('.bands').nth(i).locator('button:text-is("8")').click();
    await page.fill('#overall', 'Half way through');
    await page.reload(); await page.waitForSelector('text=were restored');
    expect((await page.locator('.band.on').count()) === 3 && (await page.inputValue('#overall')) === 'Half way through', 'score draft restored after reload');
    await shot('teacher-score-draft');

    // Boss removes an observer, then cancels the lesson
    await login('jasurbek', 'boss-pass-1');
    await page.goto(lessonUrl); await page.waitForSelector('text=Cancel lesson');
    await page.click('.list-row:has-text("Teacher Two") >> text=Remove'); await page.click('.dialog button:text-is("Remove observer")');
    await waitToast('no longer observes'); ok('observer removed');
    await page.click('.page-header >> text=Cancel lesson'); await page.fill('#cr', 'Candidate is ill');
    await page.click('.dialog button:text-is("Cancel lesson")'); await waitToast('Lesson cancelled');
    await page.waitForSelector('.warn-box:has-text("Candidate is ill")'); ok('lesson cancelled with reason');
    await shot('boss-lesson-cancelled');
    await schedule('Full trial lesson', 4);

    // Boss: analytics and quiz pages
    await go('boss/analytics'); await page.waitForSelector('text=Criteria, weakest first'); ok('analytics page');
    await shot('boss-analytics');
    await go('boss/quiz'); await page.waitForSelector('.card:has-text("concept-check")'); ok('quiz page lists the starter questions');
    await shot('boss-quiz');

    // Candidate: next lesson card and the quiz
    await login('cand1', 'cand-1-pass');
    await page.waitForSelector('text=Your next lesson'); ok('candidate sees the next lesson card');
    expect(!(await page.locator('#main').innerText()).includes('Holidays'), 'cancelled lesson is not shown to the candidate');
    await shot('candidate-home-next');
    await go('candidate/quiz'); await page.waitForSelector('input[type=radio]');
    await page.click('text=Check my answers');
    expect((await page.locator('.sticky-bar .error-text').innerText()).includes('still open'), 'quiz asks for every answer');
    const qcards = page.locator('.card.criterion'); for (let i = 0; i < await qcards.count(); i++) await qcards.nth(i).locator('input[type=radio]').nth(1).check();
    await page.click('text=Check my answers'); await page.waitForSelector('.display:has-text("/ 8")');
    ok('quiz scored: ' + await page.locator('.display').innerText());
    await shot('candidate-quiz-result');

    // My account: change own password, then sign in with it
    await login('toxirjon', '22222222');
    expect(!(await page.locator('#main').innerText()).includes('Holidays'), 'cancelled lesson gone from the teacher list');
    await go('account');
    await page.fill('#pw-c', 'wrong-one'); await page.fill('#pw-n', 'toxirjon-new-1'); await page.fill('#pw-a', 'toxirjon-new-1');
    await page.click('button:has-text("Change password")');
    expect((await (await page.waitForSelector('.error-box')).innerText()).includes('current password is not right'), 'wrong current password refused');
    await page.fill('#pw-c', '22222222'); await page.click('button:has-text("Change password")'); await waitToast('Password changed');
    await shot('my-account');
    await login('toxirjon', 'toxirjon-new-1'); ok('signed in with the new password');

    // Creator: view the site as a teacher and as a candidate (read-only)
    await login('creator', 'creator-pass-1');
    await page.click('.view-as a:has-text("Teacher")'); await page.click('.dialog .list-row:has-text("Toxirjon Baxodirov")');
    await page.waitForSelector('.preview-banner:has-text("Toxirjon Baxodirov")');
    expect((await page.locator('.nav a:has-text("My lessons")').count()) === 1, 'creator sees the teacher navigation');
    await shot('creator-view-as-teacher');
    await go('account'); expect(await page.locator('button:has-text("Change password")').isDisabled(), 'changes are switched off in View as');
    await page.click('text=Exit view'); await page.waitForURL(/#\/creator/); await page.waitForSelector('tbody tr'); ok('exit view returns to Accounts');
    await page.click('.view-as a:has-text("Candidate")'); await page.click('.dialog .list-row:has-text("Candidate One")');
    await page.waitForSelector('text=My stage'); ok('creator sees the candidate home');
    await shot('creator-view-as-candidate');
    await page.click('text=Exit view'); await page.waitForURL(/#\/creator/);

    // Creator: delete an account made by mistake; people with history cannot be deleted
    await page.click('text=Create account');
    await page.fill('#f-name', 'Typo Person'); await page.fill('#f-login', 'typo1'); await page.fill('#f-pw', 'typo-pass-1');
    await page.click('.slideover-foot >> text=Create account'); await waitToast('Account created');
    await page.waitForSelector('.slideover', { state: 'detached' });
    await page.click('tbody tr:has-text("Typo Person")'); await page.click('.slideover button:has-text("Delete account")');
    await page.click('.dialog button:text-is("Delete account")'); await waitToast('Account deleted'); ok('account deleted');
    await page.click('tbody tr:has-text("Toxirjon Baxodirov")'); await page.click('.slideover button:has-text("Delete account")');
    await page.click('.dialog button:text-is("Delete account")');
    expect((await (await page.waitForSelector('.dialog .error-box')).innerText()).includes('Block the account instead'), 'accounts with history cannot be deleted');
    await page.click('.dialog button:text-is("Cancel")'); await page.click('.slideover-foot >> text=Cancel');

    // Installable app
    const pwa = await page.evaluate(async () => ({ sw: !!(await navigator.serviceWorker.getRegistration()), manifest: (await fetch('manifest.webmanifest')).ok }));
    expect(pwa.sw && pwa.manifest, 'manifest served and service worker registered');

    // Blocked user cannot sign in
    await login('creator', 'creator-pass-1');
    await page.click('tbody tr:has-text("Teacher Two")'); await page.click('.slideover .chip:text-is("Blocked")');
    await page.click('.slideover-foot >> text=Save changes'); await toastText();
    await page.click('[aria-label="Sign out"]'); await page.waitForSelector('#login');
    await page.fill('#login', 'teach2'); await page.fill('#password', 'teach-2-pass'); await page.click('button[type=submit]');
    expect((await (await page.waitForSelector('.error-box')).innerText()).includes('blocked'), 'blocked user cannot sign in');
  } catch (e) {
    errors.push(String(e.message || e));
    await page.screenshot({ path: `${OUT}/zz-failure.png`, fullPage: true }).catch(() => {});
  }
  await browser.close();
  if (errors.length) { console.log('\nPROBLEMS:\n' + errors.join('\n')); process.exit(1); }
  console.log('\nALL BROWSER CHECKS PASSED');
})();
