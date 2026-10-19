/* Comptes et synchronisation via Supabase (API REST, sans bibliothèque). Fusion des données par produit : le plus récent gagne. */
(function (root) {
  function sig(it) { return JSON.stringify([it.name, it.inputs, it.log]); }

  // Fusionne deux jeux de données : union des produits par id, version la plus récente conservée,
  // suppressions (« deleted ») respectées si plus récentes que le produit.
  function merge(local, remote) {
    var dead = {}, byId = {}, order = [];
    [local, remote].forEach(function (db) {
      var d = (db && db.deleted) || {};
      Object.keys(d).forEach(function (id) { dead[id] = Math.max(dead[id] || 0, d[id] || 0); });
    });
    [local, remote].forEach(function (db) {
      ((db && db.items) || []).forEach(function (it) {
        if (!it || !it.id) return;
        if (!byId[it.id]) { byId[it.id] = it; order.push(it.id); }
        else if ((it.updated || 0) > (byId[it.id].updated || 0)) byId[it.id] = it;
      });
    });
    var items = order.map(function (id) { return byId[id]; }).filter(function (it) { return !(dead[it.id] >= (it.updated || 0) && dead[it.id] > 0); });
    return { items: items, deleted: dead };
  }

  var MESSAGES = [
    [/invalid login credentials/i, 'E-mail ou mot de passe incorrect.'],
    [/already registered|already been registered/i, 'Un compte existe déjà avec cet e-mail. Connectez-vous.'],
    [/email not confirmed/i, 'Confirmez d’abord votre e-mail avec le lien reçu, puis connectez-vous.'],
    [/at least \d+ characters/i, 'Mot de passe trop court (6 caractères minimum).'],
    [/valid email|invalid.*email|email.*invalid/i, 'Adresse e-mail invalide.'],
    [/rate limit|too many/i, 'Trop de tentatives. Réessayez dans quelques minutes.']
  ];
  function friendly(msg) {
    for (var i = 0; i < MESSAGES.length; i++) if (MESSAGES[i][0].test(msg)) return MESSAGES[i][1];
    return msg || 'Erreur inconnue.';
  }

  function client(cfg, store, fetchFn) {
    cfg = cfg || {};
    var base = String(cfg.supabaseUrl || '').replace(/\/+$/, ''), key = cfg.supabaseAnonKey || '', SKEY = 'rentab.session';
    var api = { configured: !!(base && key) };

    function getS() { try { return JSON.parse(store.getItem(SKEY)); } catch (e) { return null; } }
    function setS(s) { try { if (s) store.setItem(SKEY, JSON.stringify(s)); else store.removeItem(SKEY); } catch (e) {} }
    function toSession(r) {
      return { access_token: r.access_token, refresh_token: r.refresh_token,
        expires_at: r.expires_at ? r.expires_at * 1000 : Date.now() + (r.expires_in || 3600) * 1000,
        user: { id: r.user && r.user.id, email: r.user && r.user.email } };
    }
    function call(method, path, body, token, extra) {
      var headers = Object.assign({ apikey: key, 'Content-Type': 'application/json', Authorization: 'Bearer ' + (token || key) }, extra || {});
      return fetchFn(base + path, { method: method, headers: headers, body: body === undefined ? undefined : JSON.stringify(body) })
        .then(function (res) {
          return res.text().then(function (t) {
            var json = null; try { json = t ? JSON.parse(t) : null; } catch (e) {}
            if (!res.ok) {
              var e = new Error(friendly((json && (json.error_description || json.msg || json.message || json.error)) || ('Erreur ' + res.status)));
              e.status = res.status; throw e;
            }
            return json;
          });
        }, function () { var e = new Error('Hors ligne : impossible de joindre le serveur.'); e.offline = true; throw e; });
    }

    api.session = function () { return getS(); };

    api.signIn = function (email, password) {
      return call('POST', '/auth/v1/token?grant_type=password', { email: email, password: password }).then(function (r) { var s = toSession(r); setS(s); return s; });
    };
    api.signUp = function (email, password) {
      return call('POST', '/auth/v1/signup', { email: email, password: password }).then(function (r) {
        if (r && r.access_token) { var s = toSession(r); setS(s); return { session: s }; }
        return { confirm: true };
      });
    };
    api.recover = function (email) { return call('POST', '/auth/v1/recover', { email: email }); };
    api.signOut = function () {
      var s = getS(); setS(null);
      if (s) return call('POST', '/auth/v1/logout', undefined, s.access_token).catch(function () {});
      return Promise.resolve();
    };

    function refresh() {
      var s = getS(); if (!s || !s.refresh_token) { setS(null); return Promise.reject(new Error('Session expirée : reconnectez-vous.')); }
      return call('POST', '/auth/v1/token?grant_type=refresh_token', { refresh_token: s.refresh_token }).then(function (r) { var n = toSession(r); setS(n); return n; },
        function (e) { if (!e.offline) setS(null); throw e.offline ? e : new Error('Session expirée : reconnectez-vous.'); });
    }
    function authed(fn) {
      var s = getS(); if (!s) return Promise.reject(new Error('Non connecté.'));
      var ready = s.expires_at - Date.now() < 60000 ? refresh() : Promise.resolve(s);
      return ready.then(function (cur) {
        return fn(cur).catch(function (e) { if (e.status === 401) return refresh().then(fn); throw e; });
      });
    }

    api.pull = function () {
      return authed(function (s) { return call('GET', '/rest/v1/user_data?select=data,updated_at', undefined, s.access_token); })
        .then(function (rows) { return rows && rows[0] ? rows[0].data : null; });
    };
    api.push = function (data) {
      return authed(function (s) {
        return call('POST', '/rest/v1/user_data', { user_id: s.user.id, data: data, updated_at: new Date().toISOString() }, s.access_token,
          { Prefer: 'resolution=merge-duplicates,return=minimal' });
      });
    };
    return api;
  }

  var api = { merge: merge, client: client, friendly: friendly, sig: sig };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.DropSync = api;
})(typeof window !== 'undefined' ? window : this);
