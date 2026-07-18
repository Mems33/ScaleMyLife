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

  section('Leaderboard (opt-in)');
  fx.route('grant_type=password', 200, { access_token: 'at3', refresh_token: 'rt3', user: SESS.user });
  await Cloud.signIn('a@b.c', 'pw123456');
  fx.route('/rest/v1/leaderboard?on_conflict', 201, {});
  var pb = await Cloud.pushBoard({ name: 'A-very-long-hero-name-that-overflows', avatar: '🧙', level: 14, rank: 'C', weekXp: 1432.7, bestStreak: 15, ascension: 1 });
  ok(pb.ok === true, 'board push succeeds');
  var pbReq = log[log.length - 1];
  ok(/on_conflict=user_id/.test(pbReq.url) && /merge-duplicates/.test(pbReq.headers.Prefer), 'board push is an upsert');
  ok(pbReq.body[0].name.length <= 24 && pbReq.body[0].week_xp === 1433, 'profile snapshot is clamped and rounded');
  ok(!('data' in pbReq.body[0]) && !('coins' in pbReq.body[0]), 'only the tiny public profile is shared — never the save');
  fx.route('/rest/v1/leaderboard?select', 200, [
    { user_id: 'u9', name: 'Rival', avatar: '🥷', level: 20, rank_code: 'B', week_xp: 2000, best_streak: 30, ascension: 0 },
    { user_id: 'uid-1', name: 'Me', avatar: '🧙', level: 14, rank_code: 'C', week_xp: 1433, best_streak: 15, ascension: 1 }
  ]);
  var fb = await Cloud.fetchBoard(25);
  ok(fb.ok && fb.rows.length === 2 && fb.me === 'uid-1', 'board fetch returns rows + own id for highlighting');
  ok(/order=week_xp.desc/.test(log[log.length - 1].url) && /limit=25/.test(log[log.length - 1].url), 'board is ranked by weekly XP with a limit');
  fx.route('/rest/v1/leaderboard?user_id=eq.uid-1', 204, {});
  var lb = await Cloud.leaveBoard();
  ok(lb.ok === true && log[log.length - 1].method === 'DELETE', 'opting out deletes own row');
  fx.route('/rest/v1/leaderboard?select', 404, { message: 'relation "public.leaderboard" does not exist' });
  var fb404 = await Cloud.fetchBoard(25);
  ok(fb404.ok === false && /does not exist/.test(fb404.error), 'missing table fails soft with the server message');

  section('Friends by code');
  ok(Cloud.friendCode() === 'UID1', 'friend code derived from the user id (real uuids yield 8 hex chars)');
  fx.route('/rest/v1/leaderboard?on_conflict', 201, {});
  var pf = await Cloud.pushBoard({ name: 'Me', avatar: '🧙', level: 14, rank: 'C', weekXp: 1433, bestStreak: 15, ascension: 1 }, false);
  ok(pf.ok === true, 'profile push (friends-visible, off the global board) succeeds');
  var pfReq = log[log.length - 1];
  ok(pfReq.body[0].on_board === false && pfReq.body[0].friend_code === 'UID1', 'row carries on_board flag + friend_code');
  fx.route('/rest/v1/rpc/find_by_friend_code', 200, [{ user_id: 'friend-9', name: 'Rival', avatar: '🥷', level: 20, rank_code: 'B', week_xp: 2000, best_streak: 30, ascension: 0 }]);
  var fc = await Cloud.findByCode('a1b2c3d4');
  ok(fc.ok && fc.found && fc.profile.user_id === 'friend-9', 'lookup by code resolves a hero');
  ok(log[log.length - 1].body.code === 'A1B2C3D4', 'code is upper-cased before lookup');
  fx.route('/rest/v1/rpc/find_by_friend_code', 200, []);
  ok((await Cloud.findByCode('ZZZZZZZZ')).found === false, 'unknown code returns found:false');
  fx.route('/rest/v1/friends?on_conflict', 201, {});
  var af = await Cloud.addFriend('friend-9');
  ok(af.ok === true && log[log.length - 1].body[0].friend_id === 'friend-9', 'add friend inserts a follow row');
  ok((await Cloud.addFriend('uid-1')).error === 'that is your own code', 'cannot add yourself');
  fx.route('/rest/v1/friends?select=friend_id', 200, [{ friend_id: 'friend-9' }]);
  fx.route('/rest/v1/leaderboard?select', 200, [{ user_id: 'friend-9', name: 'Rival', avatar: '🥷', level: 20, rank_code: 'B', week_xp: 2000, best_streak: 30, ascension: 0 }]);
  var fbrd = await Cloud.fetchFriendsBoard({ name: 'Me', avatar: '🧙', level: 14, rank: 'C', weekXp: 1433, bestStreak: 15, ascension: 1 });
  ok(fbrd.ok && fbrd.rows.length === 2, 'friends board = me + everyone I follow');
  ok(fbrd.rows[0].user_id === 'friend-9' && fbrd.rows[1].user_id === 'uid-1', 'ranked by weekly XP (rival above me)');
  fx.route('/rest/v1/friends?user_id=eq.uid-1&friend_id=eq.friend-9', 204, {});
  ok((await Cloud.removeFriend('friend-9')).ok === true && log[log.length - 1].method === 'DELETE', 'unfollow deletes the row');
  fx.route('/rest/v1/leaderboard?select', 200, []);
  ok((await Cloud.fetchBoard(25)).ok === true && /on_board=eq.true/.test(log[log.length - 1].url), 'global board only lists opted-in profiles');

  section('Friend invites (one-sided add shows up for the other person)');
  fx.route('friends?select=user_id&friend_id=eq.uid-1', 200, [{ user_id: 'friend-9' }, { user_id: 'friend-7' }]);
  fx.route('friends?select=friend_id&user_id=eq.uid-1', 200, [{ friend_id: 'friend-9' }]);
  fx.route('/rest/v1/leaderboard?select', 200, [{ user_id: 'friend-7', name: 'Newbie', avatar: '🦊', level: 3, rank_code: 'E', week_xp: 90, best_streak: 2, ascension: 0 }]);
  var inv = await Cloud.listInvites();
  ok(inv.ok && inv.rows.length === 1 && inv.rows[0].user_id === 'friend-7', 'invites = followers I have not followed back');
  fx.route('friends?select=user_id&friend_id=eq.uid-1', 200, []);
  ok((await Cloud.listInvites()).rows.length === 0, 'no followers means no invites');
  fx.route('friends?user_id=eq.friend-7&friend_id=eq.uid-1', 204, {});
  var dec = await Cloud.declineInvite('friend-7');
  ok(dec.ok === true && log[log.length - 1].method === 'DELETE', 'decline deletes THEIR follow of me');
  ok(/user_id=eq\.friend-7&friend_id=eq\.uid-1/.test(log[log.length - 1].url), 'decline targets the follower row, not my own');
  fx.route('friends?select=friend_id&user_id=eq.uid-1', 200, [{ friend_id: 'friend-9' }]);
  await Cloud.listFriendIds();
  ok(/user_id=eq\.uid-1/.test(log[log.length - 1].url), 'listFriendIds filters to my own follows (RLS now also shows followers)');

  section('Password reset');
  fx.route('/auth/v1/recover', 200, {});
  var rp = await Cloud.resetPassword('a@b.c', 'https://app.example/');
  ok(rp.ok === true, 'reset email request succeeds');
  ok(/redirect_to=https%3A%2F%2Fapp.example%2F/.test(log[log.length - 1].url) && log[log.length - 1].body.email === 'a@b.c', 'redirect goes as a query param, email in the body');
  fx.route('/auth/v1/recover', 429, { msg: 'rate limited' });
  ok((await Cloud.resetPassword('a@b.c')).ok === false, 'recover failure is surfaced, not thrown');
  ok(Cloud.recoverFromHash('#/nothing').recovery === false, 'no token in hash -> no recovery');
  var rh = Cloud.recoverFromHash('#access_token=at9&refresh_token=rt9&type=recovery');
  ok(rh.recovery === true && rh.signedIn === true, 'recovery hash adopts the emailed session');
  fx.route('/auth/v1/user', 200, { id: 'uid-1', email: 'a@b.c' });
  var who = await Cloud.whoAmI();
  ok(who.ok && Cloud.session().user.id === 'uid-1', 'whoAmI fills in the user behind the recovery token');
  fx.route('/auth/v1/user', 200, { id: 'uid-1', email: 'a@b.c' });
  var up = await Cloud.updatePassword('newpass99');
  ok(up.ok === true && log[log.length - 1].method === 'PUT' && log[log.length - 1].body.password === 'newpass99', 'new password is PUT to /auth/v1/user');

  section('Network failure resilience');
  Cloud.configure({ fetch: function () { return Promise.reject(new Error('offline')); } });
  st.setItem('sml.cloud.session.v1', JSON.stringify(SESS));
  var off = await Cloud.push({ hero: {}, updatedAt: 'x' });
  ok(off.ok === false && /offline/.test(off.error), 'offline push fails soft with a message, never throws');

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
