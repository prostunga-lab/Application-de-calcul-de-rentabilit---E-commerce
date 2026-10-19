const assert = require('assert');
const S = require('./sync');

// ---- Fusion ----
const A = { id: 'a', name: 'A', updated: 100 }, A2 = { id: 'a', name: 'A modifié', updated: 200 }, B = { id: 'b', name: 'B', updated: 50 };
let m = S.merge({ items: [A, B] }, { items: [A2] });
assert.equal(m.items.length, 2); assert.equal(m.items.find(x => x.id === 'a').name, 'A modifié', 'le plus récent gagne');
m = S.merge({ items: [A2] }, { items: [A] }); assert.equal(m.items[0].name, 'A modifié', 'local plus récent conservé');
// suppression plus récente que le produit
m = S.merge({ items: [A, B], deleted: { b: 60 } }, { items: [B] }); assert.deepEqual(m.items.map(x => x.id), ['a'], 'suppression propagée');
// produit modifié après la suppression : il revient
m = S.merge({ items: [], deleted: { a: 150 } }, { items: [A2] }); assert.deepEqual(m.items.map(x => x.id), ['a'], 'modification postérieure gagne');
m = S.merge(null, { items: [A] }); assert.equal(m.items.length, 1);
m = S.merge({ items: [A] }, null); assert.equal(m.items.length, 1);

// ---- Client contre un faux serveur Supabase ----
function fakeServer() {
  const st = { users: {}, row: null, calls: [], tokens: { good: 'u1' }, expired: false };
  const resp = (status, body) => Promise.resolve({ ok: status < 300, status, text: () => Promise.resolve(body === undefined ? '' : JSON.stringify(body)) });
  st.fetch = (url, o) => {
    const path = url.replace('https://x.supabase.co', ''), body = o.body ? JSON.parse(o.body) : null;
    st.calls.push([o.method, path, o.headers]);
    assert.equal(o.headers.apikey, 'anon');
    if (path === '/auth/v1/signup') {
      if (st.users[body.email]) return resp(422, { msg: 'User already registered' });
      if (body.password.length < 6) return resp(422, { msg: 'Password should be at least 6 characters.' });
      st.users[body.email] = { password: body.password, id: 'u1' };
      return st.confirm ? resp(200, { id: 'u1', email: body.email }) : resp(200, { access_token: 'good', refresh_token: 'r1', expires_in: 3600, user: { id: 'u1', email: body.email } });
    }
    if (path === '/auth/v1/token?grant_type=password') {
      const u = st.users[body.email];
      return u && u.password === body.password ? resp(200, { access_token: 'good', refresh_token: 'r1', expires_in: 3600, user: { id: u.id, email: body.email } }) : resp(400, { error_description: 'Invalid login credentials' });
    }
    if (path === '/auth/v1/token?grant_type=refresh_token') { st.expired = false; return body.refresh_token === 'r1' ? resp(200, { access_token: 'good', refresh_token: 'r1', expires_in: 3600, user: { id: 'u1', email: 'a@b.be' } }) : resp(400, { error_description: 'bad' }); }
    if (path === '/auth/v1/recover') return resp(200, {});
    if (path === '/auth/v1/logout') return resp(204);
    if (path.startsWith('/rest/v1/user_data')) {
      if (o.headers.Authorization !== 'Bearer good' || st.expired) return resp(401, { message: 'JWT expired' });
      if (o.method === 'GET') return resp(200, st.row ? [st.row] : []);
      st.row = { data: body.data, updated_at: body.updated_at, user_id: body.user_id, prefer: o.headers.Prefer }; return resp(201);
    }
    return resp(404, {});
  };
  return st;
}
const mem = () => { const d = {}; return { getItem: k => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = v; }, removeItem: k => { delete d[k]; } }; };

(async () => {
  assert(!S.client({}, mem(), null).configured);
  const srv = fakeServer(), store = mem(), c = S.client({ supabaseUrl: 'https://x.supabase.co/', supabaseAnonKey: 'anon' }, store, srv.fetch);
  assert(c.configured);
  // inscription : mot de passe trop court puis valide, doublon
  await assert.rejects(c.signUp('a@b.be', '123'), /6 caractères/);
  let r = await c.signUp('a@b.be', 'secret1'); assert(r.session && c.session().user.email === 'a@b.be');
  await assert.rejects(c.signUp('a@b.be', 'secret1'), /existe déjà/);
  // connexion
  await c.signOut(); assert.equal(c.session(), null);
  await assert.rejects(c.signIn('a@b.be', 'faux'), /incorrect/);
  await c.signIn('a@b.be', 'secret1'); assert.equal(c.session().user.id, 'u1');
  // pull vide puis push puis pull
  assert.equal(await c.pull(), null);
  await c.push({ items: [{ id: 'a' }], deleted: {} });
  assert.equal(srv.row.user_id, 'u1'); assert.match(srv.row.prefer, /merge-duplicates/);
  assert.deepEqual(await c.pull(), { items: [{ id: 'a' }], deleted: {} });
  // jeton expiré côté serveur : un rafraîchissement automatique puis nouvel essai
  srv.expired = true; const before = srv.calls.length;
  assert.deepEqual((await c.pull()).items[0].id, 'a');
  assert(srv.calls.slice(before).some(x => x[1].includes('refresh_token')), 'refresh utilisé');
  // jeton local périmé : rafraîchi avant l'appel
  const s = c.session(); s.expires_at = Date.now() - 1000; store.setItem('rentab.session', JSON.stringify(s));
  await c.pull(); assert(c.session().expires_at > Date.now());
  // inscription avec confirmation par e-mail
  const srv2 = fakeServer(); srv2.confirm = true; const c2 = S.client({ supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon' }, mem(), srv2.fetch);
  assert.deepEqual(await c2.signUp('n@b.be', 'secret1'), { confirm: true }); assert.equal(c2.session(), null);
  await c2.recover('n@b.be');
  // hors ligne
  const c3 = S.client({ supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon' }, mem(), () => Promise.reject(new TypeError('fail')));
  await assert.rejects(c3.signIn('a@b.be', 'x'), e => e.offline === true);
  console.log('OK sync');
})().catch(e => { console.error(e); process.exit(1); });
