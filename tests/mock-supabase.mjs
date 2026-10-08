// Minimal in-memory Supabase stand-in (auth OTP + PostgREST events/settings) for sync tests.
import http from 'node:http';
export function startMock() {
  const state = { events: new Map(), settings: new Map(), seq: 0, offline: false, calls: [] };
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    let body = ''; for await (const c of req) body += c;
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
    const json = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', ...cors }); res.end(JSON.stringify(obj)); };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    state.calls.push(`${req.method} ${u.pathname}`);
    if (state.offline) return req.socket.destroy();
    const auth = (req.headers.authorization || '').replace('Bearer ', '');
    const email = auth.startsWith('tok-') ? auth.slice(4) : null;
    const session = (em) => ({ access_token: 'tok-' + em, refresh_token: 'ref-' + em, expires_in: 3600, user: { id: 'u-' + em, email: em } });
    if (u.pathname === '/auth/v1/otp') return json(200, {});
    if (u.pathname === '/auth/v1/verify') { const b = JSON.parse(body); return b.token === '123456' ? json(200, session(b.email)) : json(403, { msg: 'Token has expired or is invalid' }); }
    if (u.pathname === '/auth/v1/token') { const b = JSON.parse(body); return json(200, session(b.refresh_token.slice(4))); }
    if (!email) return json(401, { message: 'JWT required' });
    const uid = 'u-' + email;
    if (u.pathname === '/rest/v1/events') {
      if (req.method === 'POST') {
        for (const r of JSON.parse(body)) { const k = uid + '/' + r.id; if (!state.events.has(k)) state.events.set(k, { seq: ++state.seq, uid, ...r }); }
        res.writeHead(201, cors); return res.end();
      }
      const gt = Number((u.searchParams.get('seq') || 'gt.0').slice(3)), limit = Number(u.searchParams.get('limit') || 1000);
      const rows = [...state.events.values()].filter((r) => r.uid === uid && r.seq > gt).sort((a, b) => a.seq - b.seq).slice(0, limit).map((r) => ({ seq: r.seq, data: r.data }));
      return json(200, rows);
    }
    if (u.pathname === '/rest/v1/settings') {
      if (req.method === 'POST') { const b = JSON.parse(body); state.settings.set(uid, b.data); res.writeHead(201, cors); return res.end(); }
      return json(200, state.settings.has(uid) ? [{ data: state.settings.get(uid) }] : []);
    }
    json(404, {});
  });
  return new Promise((r) => server.listen(0, () => r({ state, url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })));
}
