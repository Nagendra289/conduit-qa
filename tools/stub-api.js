/**
 * Minimal in-memory stand-in for the Conduit/RealWorld API (users + articles only).
 *
 * Purpose: verify the suite's OWN logic offline and demonstrate that its
 * assertions catch real bugs. It is NOT a substitute for the real backend.
 *
 *   node tools/stub-api.js                 # correct behaviour
 *   BUG=ownership node tools/stub-api.js   # anyone may edit/delete any article
 *   BUG=fake-delete node tools/stub-api.js # DELETE returns 204 but keeps the article
 *
 * Then, in another terminal:
 *   API_URL=http://127.0.0.1:3999/api npm run test:api
 */

const http = require('http');
const users = new Map(); // email -> user
const tokens = new Map(); // token -> email
const articles = new Map(); // slug -> article
let n = 0;
const send = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(body === undefined ? '' : JSON.stringify(body)); };
const slugify = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + (++n);
http.createServer((req, res) => {
  let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => {
    const body = raw ? JSON.parse(raw) : {};
    const auth = (req.headers.authorization || '').replace('Token ', '');
    const me = tokens.has(auth) ? users.get(tokens.get(auth)) : null;
    const url = req.url.replace(/^\/api/, ''); const m = req.method;
    const view = (u, tok) => ({ user: { username: u.username, email: u.email, token: tok, bio: null, image: null } });
    if (m === 'POST' && url === '/users') {
      const u = body.user; if ([...users.values()].some((x) => x.email === u.email || x.username === u.username)) return send(res, 422, { errors: { email: ['has already been taken'] } });
      users.set(u.email, u); const t = `a.${Buffer.from(u.email).toString('base64url')}.${++n}`; tokens.set(t, u.email); return send(res, 201, view(u, t));
    }
    if (m === 'POST' && url === '/users/login') {
      const u = users.get(body.user.email); if (!u || u.password !== body.user.password) return send(res, 401, { errors: { credentials: ['invalid'] } });
      const t = `a.${Buffer.from(u.email).toString('base64url')}.${++n}`; tokens.set(t, u.email); return send(res, 200, view(u, t));
    }
    if (m === 'GET' && url === '/user') return me ? send(res, 200, view(me, auth)) : send(res, 401, {});
    if (m === 'POST' && url === '/articles') {
      if (!me) return send(res, 401, {}); const a = { ...body.article, slug: slugify(body.article.title), author: { username: me.username } };
      articles.set(a.slug, a); return send(res, 201, { article: a });
    }
    const am = url.match(/^\/articles\/([^/]+)$/);
    if (am) {
      const a = articles.get(am[1]); if (!a) return send(res, 404, {});
      if (m === 'GET') return send(res, 200, { article: a });
      if (!me) return send(res, 401, {}); if (process.env.BUG !== 'ownership' && a.author.username !== me.username) return send(res, 403, {});
      if (m === 'DELETE') { if (process.env.BUG !== 'fake-delete') articles.delete(a.slug); return send(res, 204); }
      if (m === 'PUT') { Object.assign(a, body.article); if (body.article.title) { articles.delete(a.slug); a.slug = slugify(a.title); articles.set(a.slug, a); } return send(res, 200, { article: a }); }
    }
    send(res, 404, {});
  });
}).listen(process.env.PORT || 3999, () => console.log('stub API on http://127.0.0.1:' + (process.env.PORT || 3999) + '/api', process.env.BUG ? '(BUG=' + process.env.BUG + ')' : ''));
