// Local stand-in for Supabase, for testing the site without a Supabase project.
// Serves the site, answers sign-in like Supabase Auth, and runs the real database functions
// from schema.sql on a local Postgres (with supabase_stubs.sql loaded).
//   NODE_PATH=<folder with the "pg" package> node supabase/test/local_api.cjs
// Env: PORT (8787), PGHOST (/tmp/pgtest), PGPORT (54329), PGDATABASE (edunest_test), PGUSER (postgres)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const ROOT = path.resolve(__dirname, '../..');
const PORT = Number(process.env.PORT || 8787);
const pool = new Pool({ host: process.env.PGHOST || '/tmp/pgtest', port: Number(process.env.PGPORT || 54329),
  database: process.env.PGDATABASE || 'edunest_test', user: process.env.PGUSER || 'postgres' });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const files = new Map(); // fake storage

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', ...headers });
  res.end(body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body));
};
const readBody = req => new Promise(r => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });
const userFromToken = req => { const m = String(req.headers.authorization || '').match(/^Bearer local-(.+)$/); return m ? m[1] : ''; };
// Lists of plain values become Postgres arrays (uuid[]); lists of objects and objects become JSON.
const pgValue = v => (v === null || v === undefined ? null
  : Array.isArray(v) && v.every(x => x === null || typeof x !== 'object') ? '{' + v.map(x => '"' + x + '"').join(',') + '}'
  : typeof v === 'object' ? JSON.stringify(v) : String(v));

async function rpc(name, args, uid, headers = {}) {
  if (!/^[a-z][a-z0-9_]*$/.test(name) || name.startsWith('_') || name === 'setup_first_creator') return [404, { message: 'not found' }];
  const keys = Object.keys(args || {});
  const sql = `select public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`;
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('test.uid', $1, true)", [uid]);
    await client.query("select set_config('request.headers', $1, true)", [JSON.stringify(headers)]);
    const r = await client.query(sql, keys.map(k => pgValue(args[k])));
    await client.query('commit');
    return [200, r.rows[0].r];
  } catch (e) {
    await client.query('rollback').catch(() => {});
    return [400, { code: e.code, message: e.message, details: null, hint: null }];
  } finally { client.release(); }
}

async function signIn(body) {
  const { email, password } = JSON.parse(body.toString() || '{}');
  const r = await pool.query(`select id, email, banned_until > now() as banned,
    encrypted_password = extensions.crypt($2, encrypted_password) as ok from auth.users where email = lower($1)`, [email, password]);
  const u = r.rows[0];
  if (!u || !u.ok) return [400, { error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' }];
  if (u.banned) return [400, { error: 'user_banned', error_description: 'User is banned', msg: 'User is banned' }];
  const now = Math.floor(Date.now() / 1000);
  return [200, { access_token: 'local-' + u.id, token_type: 'bearer', expires_in: 86400, expires_at: now + 86400, refresh_token: 'r-' + u.id,
    user: { id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, app_metadata: { provider: 'email' }, user_metadata: {}, created_at: new Date().toISOString() } }];
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'OPTIONS') return send(res, 204);
    if (url.pathname === '/config.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript' });
      return res.end(`window.EDUNEST_CONFIG = { supabaseUrl: 'http://localhost:${PORT}', supabaseAnonKey: 'local-anon-key' };`);
    }
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const [s, b] = await rpc(url.pathname.slice(13), JSON.parse((await readBody(req)).toString() || '{}'), userFromToken(req), req.headers);
      return send(res, s, b);
    }
    if (url.pathname === '/auth/v1/token') { const [s, b] = await signIn(await readBody(req)); return send(res, s, b); }
    if (url.pathname === '/auth/v1/logout') return send(res, 204);
    if (url.pathname === '/auth/v1/user') return send(res, 200, { id: userFromToken(req), aud: 'authenticated' });
    if (url.pathname.startsWith('/storage/v1/object/public/materials/')) { const f = files.get(url.pathname.slice(36)); return f ? send(res, 200, f, { 'Content-Type': 'application/octet-stream' }) : send(res, 404, {}); }
    if (url.pathname.startsWith('/storage/v1/object/materials')) {
      if (req.method === 'DELETE') { const b = JSON.parse((await readBody(req)).toString() || '{}'); (b.prefixes || []).forEach(p => files.delete(p)); return send(res, 200, []); }
      const key = url.pathname.slice('/storage/v1/object/materials/'.length); files.set(key, await readBody(req)); return send(res, 200, { Key: 'materials/' + key });
    }
    // static files
    let p = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    if (p.endsWith('/')) p += 'index.html';
    const fp = path.join(ROOT, p);
    if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) return send(res, 404, { message: 'not found' });
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(fp)] || 'application/octet-stream' });
    fs.createReadStream(fp).pipe(res);
  } catch (e) { send(res, 500, { message: e.message }); }
}).listen(PORT, () => console.log('Local site + API on http://localhost:' + PORT));
