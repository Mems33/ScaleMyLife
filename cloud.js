/* ScaleMyLife — cloud sync via Supabase (no SDK, no build step).
   Hand-rolled REST client for GoTrue (email/password auth) + PostgREST
   (a single `saves` row per user, protected by Row Level Security).

   The publishable/anon key is PUBLIC by design — all security lives in
   Postgres RLS (see supabase/schema.sql). Bake the key into PUBLISHABLE_KEY
   for production, or paste it once in ⚙️ Settings (stored in localStorage,
   never inside the exported save file).

   Browser: window.SMLCloud.  Node (tests): module.exports with injectable
   fetch/storage via configure(). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SMLCloud = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PROJECT_URL = 'https://rbhjqvfuvzpqrxmvfimd.supabase.co';
  var PUBLISHABLE_KEY = 'sb_publishable_TnkG6FAH-l78na_JJ6E4fg_lAIsm_Ww'; // public by design — security is Postgres RLS
  var SESSION_LS = 'sml.cloud.session.v1';
  var KEY_LS = 'sml.cloud.key.v1';
  var SYNC_LS = 'sml.cloud.lastsync.v1';

  var cfg = { url: PROJECT_URL, key: PUBLISHABLE_KEY, fetch: null, storage: null };

  function F() {
    if (cfg.fetch) return cfg.fetch;
    return (typeof fetch !== 'undefined') ? fetch : null;
  }
  function store() {
    if (cfg.storage) return cfg.storage;
    try { return (typeof localStorage !== 'undefined') ? localStorage : null; } catch (e) { return null; }
  }
  function apiKey() {
    if (cfg.key) return cfg.key;
    var s = store();
    return (s && s.getItem(KEY_LS)) || '';
  }

  function getSession() {
    var s = store(); if (!s) return null;
    try { var raw = s.getItem(SESSION_LS); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function setSession(sess) {
    var s = store(); if (!s) return;
    if (sess) s.setItem(SESSION_LS, JSON.stringify(sess)); else s.removeItem(SESSION_LS);
  }

  /* generic JSON request -> {status, ok, j} ; never throws */
  function req(url, opts) {
    var f = F();
    if (!f) return Promise.resolve({ status: 0, ok: false, j: { msg: 'no fetch available' } });
    return f(url, opts).then(function (r) {
      return r.text().then(function (t) {
        var j = {}; try { j = t ? JSON.parse(t) : {}; } catch (e) {}
        return { status: r.status, ok: r.ok, j: j };
      });
    }).catch(function (e) { return { status: 0, ok: false, j: { msg: String(e && e.message || e) } }; });
  }

  function authHeaders(extra) {
    var h = { 'apikey': apiKey(), 'Content-Type': 'application/json' };
    if (extra) for (var k in extra) h[k] = extra[k];
    return h;
  }
  function errMsg(j, fallback) {
    return (j && (j.error_description || j.msg || j.message || (j.error && j.error.message))) || fallback;
  }
  function sessionFromToken(j) {
    return { access_token: j.access_token, refresh_token: j.refresh_token,
      user: { id: j.user && j.user.id, email: j.user && j.user.email } };
  }

  var api = {
    /* tests + advanced use */
    configure: function (o) { o = o || {}; if (o.url) cfg.url = o.url; if ('key' in o) cfg.key = o.key; if ('fetch' in o) cfg.fetch = o.fetch; if ('storage' in o) cfg.storage = o.storage; },
    configured: function () { return !!(cfg.url && apiKey()); }, // fetch is only needed at call time (requests fail soft)
    setKey: function (k) { var s = store(); if (s) { if (k) s.setItem(KEY_LS, k.trim()); else s.removeItem(KEY_LS); } },
    hasBakedKey: function () { return !!cfg.key; },
    session: getSession,

    signUp: function (email, password) {
      return req(cfg.url + '/auth/v1/signup', { method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ email: email, password: password }) })
        .then(function (r) {
          if (!r.ok) return { ok: false, error: errMsg(r.j, 'sign-up failed') };
          if (r.j.access_token) { setSession(sessionFromToken(r.j)); return { ok: true, session: getSession() }; }
          return { ok: true, needsConfirm: true }; // email confirmation is on
        });
    },

    signIn: function (email, password) {
      return req(cfg.url + '/auth/v1/token?grant_type=password', { method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ email: email, password: password }) })
        .then(function (r) {
          if (!r.ok || !r.j.access_token) return { ok: false, error: errMsg(r.j, 'sign-in failed') };
          setSession(sessionFromToken(r.j));
          return { ok: true, session: getSession() };
        });
    },

    signOut: function () {
      var sess = getSession();
      setSession(null);
      var s = store(); if (s) s.removeItem(SYNC_LS);
      if (!sess) return Promise.resolve({ ok: true });
      return req(cfg.url + '/auth/v1/logout', { method: 'POST',
        headers: authHeaders({ 'Authorization': 'Bearer ' + sess.access_token }) })
        .then(function () { return { ok: true }; });
    },

    refresh: function () {
      var sess = getSession();
      if (!sess || !sess.refresh_token) return Promise.resolve({ ok: false, error: 'no session' });
      return req(cfg.url + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ refresh_token: sess.refresh_token }) })
        .then(function (r) {
          if (!r.ok || !r.j.access_token) { setSession(null); return { ok: false, error: 'session expired' }; }
          setSession(sessionFromToken(r.j));
          return { ok: true };
        });
    },

    /* run a REST call; on 401 refresh the token once and retry */
    _rest: function (method, path, body, prefer) {
      function once() {
        var sess = getSession();
        if (!sess) return Promise.resolve({ status: 401, ok: false, j: {} });
        var h = authHeaders({ 'Authorization': 'Bearer ' + sess.access_token });
        if (prefer) h['Prefer'] = prefer;
        return req(cfg.url + '/rest/v1/' + path, { method: method, headers: h, body: body ? JSON.stringify(body) : undefined });
      }
      return once().then(function (r) {
        if (r.status !== 401) return r;
        return api.refresh().then(function (rf) { return rf.ok ? once() : r; });
      });
    },

    /* fetch the user's cloud save -> {ok, exists, data, updatedAt} */
    pull: function () {
      if (!api.configured() || !getSession()) return Promise.resolve({ ok: false, error: 'not signed in' });
      return api._rest('GET', 'saves?select=data,updated_at&limit=1')
        .then(function (r) {
          if (!r.ok) return { ok: false, error: errMsg(r.j, 'pull failed (' + r.status + ')') };
          var row = Array.isArray(r.j) && r.j[0];
          if (!row) return { ok: true, exists: false };
          return { ok: true, exists: true, data: row.data, updatedAt: row.updated_at };
        });
    },

    /* upsert the full save -> {ok} */
    push: function (stateObj) {
      var sess = getSession();
      if (!api.configured() || !sess) return Promise.resolve({ ok: false, error: 'not signed in' });
      var row = { user_id: sess.user.id, data: stateObj,
        updated_at: stateObj.updatedAt || new Date().toISOString() };
      return api._rest('POST', 'saves?on_conflict=user_id', [row], 'resolution=merge-duplicates,return=minimal')
        .then(function (r) {
          if (!r.ok) return { ok: false, error: errMsg(r.j, 'push failed (' + r.status + ')') };
          var s = store(); if (s) s.setItem(SYNC_LS, new Date().toISOString());
          return { ok: true };
        });
    },

    lastSync: function () { var s = store(); return (s && s.getItem(SYNC_LS)) || null; }
  };

  return api;
});
