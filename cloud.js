/* ScaleMyLife - cloud sync via Supabase (no SDK, no build step).
   Hand-rolled REST client for GoTrue (email/password auth) + PostgREST
   (a single `saves` row per user, protected by Row Level Security).

   The publishable/anon key is PUBLIC by design - all security lives in
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
  var PUBLISHABLE_KEY = 'sb_publishable_TnkG6FAH-l78na_JJ6E4fg_lAIsm_Ww'; // public by design - security is Postgres RLS
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

    lastSync: function () { var s = store(); return (s && s.getItem(SYNC_LS)) || null; },

    /* ---------- opt-in leaderboard ----------
       Having a row IS the opt-in; deleting it is the opt-out. Only the tiny
       profile snapshot below is ever shared - never the save itself. */

    /* a short, shareable code derived from the (immutable) user id - no storage race */
    friendCode: function () {
      var s = getSession();
      return s ? s.user.id.replace(/-/g, '').slice(0, 8).toUpperCase() : '';
    },

    /* upsert the public profile row. onBoard=true lists you on the GLOBAL board;
       even with onBoard=false the row exists so friends (and only friends) can see you. */
    pushBoard: function (profile, onBoard) {
      var sess = getSession();
      if (!api.configured() || !sess) return Promise.resolve({ ok: false, error: 'not signed in' });
      var row = {
        user_id: sess.user.id,
        friend_code: api.friendCode(),
        on_board: !!onBoard,
        name: String(profile.name || 'Hero').slice(0, 24),
        avatar: String(profile.avatar || '🧙').slice(0, 8),
        level: profile.level || 1,
        rank_code: String(profile.rank || 'E').slice(0, 3),
        week_xp: Math.max(0, Math.min(100000, Math.round(profile.weekXp || 0))),
        best_streak: Math.max(0, profile.bestStreak || 0),
        ascension: Math.max(0, profile.ascension || 0),
        updated_at: new Date().toISOString()
      };
      return api._rest('POST', 'leaderboard?on_conflict=user_id', [row], 'resolution=merge-duplicates,return=minimal')
        .then(function (r) { return r.ok ? { ok: true } : { ok: false, error: errMsg(r.j, 'profile push failed (' + r.status + ')') }; });
    },

    /* look up a hero by their exact friend code (RLS-bypassing RPC) */
    findByCode: function (code) {
      if (!api.configured()) return Promise.resolve({ ok: false, error: 'not configured' });
      var sess = getSession();
      var h = authHeaders(sess ? { 'Authorization': 'Bearer ' + sess.access_token } : null);
      return req(cfg.url + '/rest/v1/rpc/find_by_friend_code', { method: 'POST', headers: h, body: JSON.stringify({ code: String(code || '').toUpperCase().trim() }) })
        .then(function (r) {
          if (!r.ok || !Array.isArray(r.j)) return { ok: false, error: errMsg(r.j, 'lookup failed (' + r.status + ')') };
          if (!r.j.length) return { ok: true, found: false };
          return { ok: true, found: true, profile: r.j[0] };
        });
    },

    addFriend: function (friendId) {
      var sess = getSession();
      if (!api.configured() || !sess) return Promise.resolve({ ok: false, error: 'not signed in' });
      if (friendId === sess.user.id) return Promise.resolve({ ok: false, error: 'that is your own code' });
      return api._rest('POST', 'friends?on_conflict=user_id,friend_id', [{ user_id: sess.user.id, friend_id: friendId }], 'resolution=ignore-duplicates,return=minimal')
        .then(function (r) { return r.ok ? { ok: true } : { ok: false, error: errMsg(r.j, 'add failed (' + r.status + ')') }; });
    },
    removeFriend: function (friendId) {
      var sess = getSession();
      if (!api.configured() || !sess) return Promise.resolve({ ok: false, error: 'not signed in' });
      return api._rest('DELETE', 'friends?user_id=eq.' + sess.user.id + '&friend_id=eq.' + friendId, null, 'return=minimal')
        .then(function (r) { return r.ok ? { ok: true } : { ok: false, error: errMsg(r.j, 'remove failed (' + r.status + ')') }; });
    },
    listFriendIds: function () {
      if (!api.configured() || !getSession()) return Promise.resolve({ ok: false, error: 'not signed in' });
      return api._rest('GET', 'friends?select=friend_id')
        .then(function (r) { return (r.ok && Array.isArray(r.j)) ? { ok: true, ids: r.j.map(function (x) { return x.friend_id; }) } : { ok: false, error: errMsg(r.j, 'list failed (' + r.status + ')') }; });
    },
    fetchProfiles: function (ids) {
      if (!api.configured() || !getSession()) return Promise.resolve({ ok: false, error: 'not signed in' });
      if (!ids || !ids.length) return Promise.resolve({ ok: true, rows: [] });
      var inList = '(' + ids.map(function (i) { return '"' + i + '"'; }).join(',') + ')';
      return api._rest('GET', 'leaderboard?select=user_id,name,avatar,level,rank_code,week_xp,best_streak,ascension&user_id=in.' + inList + '&order=week_xp.desc,level.desc')
        .then(function (r) { return (r.ok && Array.isArray(r.j)) ? { ok: true, rows: r.j } : { ok: false, error: errMsg(r.j, 'profiles fetch failed (' + r.status + ')') }; });
    },
    /* composed Friends board: me + everyone I follow, ranked */
    fetchFriendsBoard: function (myProfile) {
      var sess = getSession();
      if (!api.configured() || !sess) return Promise.resolve({ ok: false, error: 'not signed in' });
      return api.listFriendIds().then(function (lf) {
        if (!lf.ok) return lf;
        return api.fetchProfiles(lf.ids).then(function (fp) {
          if (!fp.ok) return fp;
          var rows = fp.rows.slice();
          if (!rows.some(function (r) { return r.user_id === sess.user.id; }) && myProfile) {
            rows.push({ user_id: sess.user.id, name: myProfile.name, avatar: myProfile.avatar, level: myProfile.level,
              rank_code: myProfile.rank, week_xp: Math.round(myProfile.weekXp || 0), best_streak: myProfile.bestStreak || 0, ascension: myProfile.ascension || 0 });
          }
          rows.sort(function (a, b) { return (b.week_xp || 0) - (a.week_xp || 0) || (b.level || 0) - (a.level || 0); });
          return { ok: true, rows: rows, me: sess.user.id };
        });
      });
    },

    /* reads are public: works with just the apikey, auth attached when present */
    fetchBoard: function (limit) {
      if (!api.configured()) return Promise.resolve({ ok: false, error: 'not configured' });
      var path = 'leaderboard?select=user_id,name,avatar,level,rank_code,week_xp,best_streak,ascension&on_board=eq.true&order=week_xp.desc,level.desc&limit=' + (limit || 25);
      var sess = getSession();
      var h = authHeaders(sess ? { 'Authorization': 'Bearer ' + sess.access_token } : null);
      return req(cfg.url + '/rest/v1/' + path, { method: 'GET', headers: h })
        .then(function (r) {
          if (!r.ok || !Array.isArray(r.j)) return { ok: false, error: errMsg(r.j, 'board fetch failed (' + r.status + ')') };
          return { ok: true, rows: r.j, me: sess ? sess.user.id : null };
        });
    },

    leaveBoard: function () {
      var sess = getSession();
      if (!api.configured() || !sess) return Promise.resolve({ ok: false, error: 'not signed in' });
      return api._rest('DELETE', 'leaderboard?user_id=eq.' + sess.user.id, null, 'return=minimal')
        .then(function (r) { return r.ok ? { ok: true } : { ok: false, error: errMsg(r.j, 'leave failed (' + r.status + ')') }; });
    }
  };

  return api;
});
