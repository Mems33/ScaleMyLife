/* Node tests for cloud.js — Supabase REST client with a mocked network. */
var Cloud = require('./cloud.js');

var passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ FAIL: ' + name); }
}
function section(t) { console.log('\n' + t); }

function mockStorage() {
  var m = {};
  return { setItem: function (k, v) { m[k] = String(v); }, getItem: function (k) { return (k in m) ? m[k] : null; }, removeItem: function (k) { delete m[k]; } };
}
/* scriptable fetch: routes[] of {match, status, body} consumed in order per match */
function mockFetch(log) {
  var routes = [];
  var f = function (url, opts) {
    log.push({ url: url, method: (opts && opts.method) || 'GET', headers: (opts && opts.headers) || {}, body: opts && opts.body ? JSON.parse(opts.body) : null });
    for (var i = 0; i < routes.length; i++) {
      if (url.indexOf(routes[i].match) >= 0) {
        var r = routes[i];
        if (!r.sticky) routes.splice(i, 1);
        return Promise.resolve({ status: r.status, ok: r.status >= 200 && r.status < 300, text: function () { return Promise.resolve(JSON.stringify(r.body)); } });
      }
    }
    return Promise.resolve({ status: 404, ok: false, text: function () { return Promise.resolve('{}'); } });
  };
  f.route = function (match, status, body, sticky) { routes.push({ match: match, status: status, body: body, sticky: sticky }); };
  return f;
}

var URL0 = 'https://unit.test.supabase.co';
var SESS = { access_token: 'at1', refresh_token: 'rt1', user: { id: 'uid-1', email: 'a@b.c' } };

(async function () {
  section('Configuration gating');
  var st = mockStorage(), log = [], fx = mockFetch(log);
  Cloud.configure({ url: URL0, key: '', fetch: fx, storage: st });
  ok(Cloud.configured() === false, 'not configured without a key');
  Cloud.setKey('  sb_publishable_abc  ');
  ok(Cloud.configured() === true, 'runtime key (trimmed) enables the client');
  ok(st.getItem('sml.cloud.key.v1') === 'sb_publishable_abc', 'runtime key persisted outside the save file');
  var r0 = await Cloud.pull();
  ok(r0.ok === false, 'pull refuses when signed out');

  section('Sign up / sign in');
  fx.route('/auth/v1/signup', 200, { user: { id: 'uid-1', email: 'a@b.c' } });
  var su = await Cloud.signUp('a@b.c', 'pw123456');
  ok(su.ok === true && su.needsConfirm === true, 'signup without instant session reports needsConfirm');
  fx.route('/auth/v1/signup', 200, { access_token: 'at1', refresh_token: 'rt1', user: { id: 'uid-1', email: 'a@b.c' } });
  var su2 = await Cloud.signUp('a@b.c', 'pw123456');
  ok(su2.ok === true && Cloud.session().user.email === 'a@b.c', 'signup with instant session stores it');
  await Cloud.signOut();
  ok(Cloud.session() === null, 'sign-out clears the session');
  fx.route('grant_type=password', 400, { error_description: 'Invalid login credentials' });
  var si = await Cloud.signIn('a@b.c', 'wrong');
  ok(si.ok === false && /Invalid login/.test(si.error), 'bad password surfaces the server message');
  fx.route('grant_type=password', 200, { access_token: 'at1', refresh_token: 'rt1', user: SESS.user });
  var si2 = await Cloud.signIn('a@b.c', 'pw123456');
  ok(si2.ok === true && Cloud.session().access_token === 'at1', 'sign-in stores tokens');
  var last = log[log.length - 1];
  ok(last.headers.apikey === 'sb_publishable_abc', 'requests carry the apikey header');

  section('Pull');
  fx.route('/rest/v1/saves?select', 200, [{ data: { hero: { name: 'Cloudy' }, updatedAt: '2026-07-09T10:00:00Z' }, updated_at: '2026-07-09T10:00:00Z' }]);
  var p1 = await Cloud.pull();
  ok(p1.ok && p1.exists && p1.data.hero.name === 'Cloudy', 'pull returns the cloud save');
  ok(log[log.length - 1].headers.Authorization === 'Bearer at1', 'pull is authenticated');
  fx.route('/rest/v1/saves?select', 200, []);
  var p2 = await Cloud.pull();
  ok(p2.ok && p2.exists === false, 'empty cloud reports exists:false');

  section('Push (upsert)');
  fx.route('/rest/v1/saves?on_conflict', 201, {});
  var stt = { hero: { name: 'X' }, updatedAt: '2026-07-09T11:00:00Z' };
  var pu = await Cloud.push(stt);
  ok(pu.ok === true, 'push succeeds');
  var pushReq = log[log.length - 1];
  ok(pushReq.method === 'POST' && /on_conflict=user_id/.test(pushReq.url), 'push upserts on user_id');
  ok(/merge-duplicates/.test(pushReq.headers.Prefer), 'push uses merge-duplicates');
  ok(pushReq.body[0].user_id === 'uid-1' && pushReq.body[0].updated_at === '2026-07-09T11:00:00Z', 'row carries user id + save timestamp');
  ok(Cloud.lastSync() !== null, 'successful push records last-sync time');

  section('Token refresh on 401');
  fx.route('/rest/v1/saves?select', 401, { message: 'JWT expired' });
  fx.route('grant_type=refresh_token', 200, { access_token: 'at2', refresh_token: 'rt2', user: SESS.user });
  fx.route('/rest/v1/saves?select', 200, [{ data: { hero: { name: 'Back' } }, updated_at: '2026-07-09T12:00:00Z' }]);
  var p3 = await Cloud.pull();
  ok(p3.ok && p3.data.hero.name === 'Back', 'expired token refreshes once and retries');
  ok(Cloud.session().access_token === 'at2', 'new tokens stored after refresh');
  fx.route('/rest/v1/saves?select', 401, {});
  fx.route('grant_type=refresh_token', 400, { error_description: 'refresh revoked' });
  var p4 = await Cloud.pull();
  ok(p4.ok === false && Cloud.session() === null, 'dead refresh token signs the user out cleanly');

  section('Network failure resilience');
  Cloud.configure({ fetch: function () { return Promise.reject(new Error('offline')); } });
  st.setItem('sml.cloud.session.v1', JSON.stringify(SESS));
  var off = await Cloud.push({ hero: {}, updatedAt: 'x' });
  ok(off.ok === false && /offline/.test(off.error), 'offline push fails soft with a message, never throws');

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
