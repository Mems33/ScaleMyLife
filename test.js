/* Node tests for LiFE RPG core */
var RPG = require('./core.js');
var A = RPG.actions;

var passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ FAIL: ' + name); }
}
function section(t) { console.log('\n' + t); }

/* mock storage */
function mockStorage() {
  var m = {};
  return { setItem: function (k, v) { m[k] = v; }, getItem: function (k) { return m[k] || null; } };
}

section('Level math');
ok(RPG.xpForLevel(1) === 100, 'level 1 needs 100 XP');
ok(RPG.xpForLevel(2) > RPG.xpForLevel(1), 'XP curve grows');
ok(RPG.rankFor(1).code === 'E', 'level 1 = rank E');
ok(RPG.rankFor(12).code === 'C', 'level 12 = rank C');
ok(RPG.rankFor(99).code === 'SS', 'level 99 = rank SS');
ok(Math.abs(RPG.streakMult(1) - 1) < 1e-9, 'streak 1 = x1.0');
ok(Math.abs(RPG.streakMult(3) - 1.10) < 1e-9, 'streak 3 = x1.10');
ok(Math.abs(RPG.streakMult(50) - 1.5) < 1e-9, 'streak mult capped at x1.5');

section('New state + seed');
var s = RPG.seed(RPG.newState('Alp', '🧙'));
ok(s.hero.name === 'Alp' && s.hero.level === 1 && s.hero.coins === 50, 'hero initialized');
ok(s.skills.length === 5, '5 default skills');
ok(s.quests.length === 2 && s.habits.length === 3 && s.shop.length === 6, 'seed content present');

section('Quests');
var q = A.addQuest(s, { title: 'Write essay outline', diff: 'hard', skillId: s.skills[0].id });
var xpBefore = s.hero.xp, coinsBefore = s.hero.coins;
var res = A.completeQuest(s, q.id);
ok(res && res.xp === RPG.DIFF.hard.xp && res.coins === 30, 'hard quest pays 60 XP / 30 coins at streak 1');
ok(s.hero.coins === coinsBefore + 30, 'coins credited');
ok(A.completeQuest(s, q.id) === null, 'cannot complete same quest twice today');
ok(s.log[0].text.indexOf('Write essay outline') >= 0, 'quest logged');
ok(s.skills[0].xp === Math.round(60 * 0.8), 'skill got 80% of XP');
ok(s.hero.streak === 1 && s.hero.lastActiveDay === RPG.todayKey(), 'streak started');

section('Level up');
var s2 = RPG.newState('T');
for (var i = 0; i < 3; i++) { var qq = A.addQuest(s2, { title: 'epic ' + i, diff: 'epic' }); A.completeQuest(s2, qq.id); }
ok(s2.hero.level >= 3, 'chained level-ups from overflow XP (level ' + s2.hero.level + ')');
ok(s2.hero.hp === RPG.MAX_HP, 'level-up full heal');
ok(s2.hero.xp >= 0 && s2.hero.xp < RPG.xpForLevel(s2.hero.level), 'leftover XP within current level');

section('Rank badge');
var s3 = RPG.newState('R');
while (s3.hero.level < 5) { var qz = A.addQuest(s3, { title: 'x', diff: 'epic' }); A.completeQuest(s3, qz.id); }
ok(s3.hero.badges.some(function (b) { return b.code === 'D'; }), 'rank D badge awarded at level 5');

section('Goals (main quests)');
var g = A.addGoal(s, { title: 'Pass code de la route' });
var sub1 = A.addQuest(s, { title: 'Do 2 test series', diff: 'normal', main: g.id });
var sub2 = A.addQuest(s, { title: 'Review road signs', diff: 'easy', main: g.id });
var p = A.goalProgress(s, g.id);
ok(p.total === 2 && p.done === 0, 'goal progress 0/2');
A.completeQuest(s, sub1.id);
p = A.goalProgress(s, g.id);
ok(p.done === 1, 'goal progress 1/2 after sub-quest');
var gres = A.completeGoal(s, g.id);
ok(gres && gres.coins === 150, 'goal completion pays 150 coins');
ok(A.completeGoal(s, g.id) === null, 'goal cannot complete twice');

section('Good habits');
var h = s.habits[0];
var hres = A.doHabit(s, h.id);
ok(hres && hres.streak === 1, 'habit check-in starts streak');
ok(A.doHabit(s, h.id) === null, 'habit only once per day');

section('Bad habits');
var bad = s.habits.find(function (x) { return x.type === 'bad'; });
var hpBefore = s.hero.hp, cBefore = s.hero.coins;
var slip = A.slipHabit(s, bad.id);
ok(slip.hp === -12 && s.hero.hp === Math.max(0, hpBefore - 12), 'slip costs 12 HP');
ok(s.hero.coins === Math.max(0, cBefore - 10), 'slip costs 10 coins');
ok(bad.slips === 1, 'slip counted');
ok(A.cleanDays(bad) === 0, 'clean streak reset to 0 today');

section('KO behavior');
var s4 = RPG.newState('K');
s4.hero.hp = 10;
var b4 = A.addHabit(s4, { title: 'x', type: 'bad' });
var ko = A.slipHabit(s4, b4.id);
ok(ko.ko === true && s4.hero.hp === 25, 'KO at 0 HP respawns at 25 HP');

section('Shop');
var s5 = RPG.seed(RPG.newState('S'));
s5.hero.coins = 30; s5.hero.hp = 50;
var nap = s5.shop.find(function (x) { return x.tab === 'hotel' && x.price === 25; });
var buy = A.buy(s5, nap.id);
ok(buy.hp === 15 && s5.hero.hp === 65, 'hotel item heals HP');
ok(s5.hero.coins === 5, 'price deducted');
var expensive = s5.shop.find(function (x) { return x.price > 5; });
ok(A.buy(s5, expensive.id).fail === 'coins', 'cannot buy without coins');
s5.hero.hp = 95;
s5.hero.coins = 100;
var buy2 = A.buy(s5, nap.id);
ok(s5.hero.hp === 100 && buy2.hp === 5, 'HP heal capped at max');

section('Journal & sleep');
var s6 = RPG.newState('J');
var j1 = A.logJournal(s6, 'good', 'solid day');
ok(j1.xp > 0, 'first journal entry pays XP');
var j2 = A.logJournal(s6, 'great', 'edited');
ok(j2.updated === true && s6.journal[RPG.todayKey()].mood === 'great', 'same-day journal edit pays nothing but updates');
s6.hero.hp = 40;
var sl = A.logSleep(s6, 8, 4);
ok(sl.hp > 0 && s6.hero.hp === 40 + sl.hp, 'sleep restores HP (' + sl.hp + ')');
ok(A.logSleep(s6, 9, 5).updated === true, 'sleep only rewards once per day');

section('Daily reset');
var s7 = RPG.newState('D');
var rq = A.addQuest(s7, { title: 'daily', diff: 'easy', recurring: true });
A.completeQuest(s7, rq.id);
ok(rq.doneOn === RPG.todayKey(), 'recurring quest done today');
s7.lastSeenDay = '2000-01-01';
rq.doneOn = '2000-01-01'; // simulate it was done on a previous day
s7.hero.lastActiveDay = '2000-01-01';
s7.hero.streak = 9;
var changed = RPG.dailyReset(s7);
ok(changed === true, 'daily reset ran on new day');
ok(rq.doneOn === null, 'recurring quest reopened');
ok(s7.hero.streak === 0, 'streak broken after skipped day');
ok(RPG.dailyReset(s7) === false, 'reset is idempotent same day');

section('Skills management');
var s8 = RPG.newState('X');
var sk = A.addSkill(s8, 'French', '🇫🇷');
var qf = A.addQuest(s8, { title: 'verbes', diff: 'easy', skillId: sk.id });
A.deleteSkill(s8, sk.id);
ok(s8.skills.every(function (k) { return k.id !== sk.id; }), 'skill deleted');
ok(s8.quests.find(function (x) { return x.id === qf.id; }).skillId === null, 'quest untagged after skill delete');

section('Persistence');
var store = mockStorage();
RPG.save(s, store);
var loaded = RPG.load(store);
ok(loaded && loaded.hero.name === 'Alp', 'save/load round-trip');
ok(loaded.quests.length === s.quests.length && loaded.log.length === s.log.length, 'collections intact');
ok(RPG.load(mockStorage()) === null, 'empty storage loads null');
store.setItem(RPG.KEY, '{broken json');
ok(RPG.load(store) === null, 'corrupted save loads null instead of crashing');


section('Pomodoro focus engine');
var sf = RPG.newState('F');
var t0 = Date.now();
var run = A.startFocus(sf, { work: 25, brk: 5, skillId: sf.skills[0].id, label: 'essay', now: t0 });
ok(run && run.work === 25 && run.brk === 5 && run.phase === 'work', 'pomodoro starts in work phase');
ok(A.startFocus(sf, { work: 25, brk: 5 }) === null, 'cannot start a second session');
ok(A.tickFocus(sf, t0 + 10 * 60000) === null, 'no phase flip mid-work');
var e1 = A.tickFocus(sf, t0 + 25 * 60000 + 5);
ok(e1 && e1.event === 'break', 'work phase flips to break');
ok(sf.activeFocus.workedMs === 25 * 60000, '25 min banked as worked');
sf.hero.hp = 50;
var e2 = A.tickFocus(sf, t0 + 30 * 60000 + 10);
ok(e2 && e2.event === 'work' && e2.healed === 3, 'break end heals +3 HP and resumes work');
ok(sf.activeFocus.cycles === 1, 'cycle counted');
var worked = A.focusWorkedMs(sf, t0 + 30 * 60000 + 12 * 60000);
ok(Math.floor(worked / 60000) === 37, 'worked time includes partial current work phase (37 min)');
var r = A.stopFocus(sf, t0 + 30 * 60000 + 12 * 60000);
ok(r && r.minutes === 37 && r.xp === Math.round(37 * 1.2 * RPG.streakMult(sf.hero.streak)) || r.minutes === 37, 'stop pays for 37 worked minutes');
ok(r.coins === Math.round(37 * 0.6), 'coins = worked min x 0.6');
ok(sf.counters.focusMin === 37, 'focus minutes counted');
ok(sf.activeFocus === null, 'session cleared after stop');
ok(sf.skills[0].xp > 0, 'focus feeds tagged skill');

// too-short session pays nothing
var t1 = Date.now();
A.startFocus(sf, { work: 25, brk: 5, now: t1 });
var short = A.stopFocus(sf, t1 + 3 * 60000);
ok(short.tooShort === true && sf.counters.focusMin === 37, 'under 5 worked min pays nothing');

// free run (no breaks) chains work phases
var t2 = Date.now();
A.startFocus(sf, { work: 50, brk: 0, now: t2 });
var eFree = A.tickFocus(sf, t2 + 50 * 60000 + 5);
ok(eFree.event === 'work' && sf.activeFocus.workedMs === 50 * 60000, 'free run rolls straight into next work phase');
var rFree = A.stopFocus(sf, t2 + 70 * 60000);
ok(rFree.minutes === 70, 'free run pays all 70 worked minutes');

// overnight cap
var t3 = Date.now();
A.startFocus(sf, { work: 50, brk: 0, now: t3 });
A.tickFocus(sf, t3 + 9 * 3600000); // left running 9 hours
var rCap = A.stopFocus(sf, t3 + 9 * 3600000);
ok(rCap.minutes === 240, 'payout capped at 240 min (' + rCap.minutes + ')');

// skip break
var t4 = Date.now();
A.startFocus(sf, { work: 25, brk: 5, now: t4 });
A.tickFocus(sf, t4 + 25 * 60000 + 5);
ok(sf.activeFocus.phase === 'break', 'in break');
var sk = A.skipBreak(sf, t4 + 26 * 60000);
ok(sk && sk.event === 'work' && sf.activeFocus.phase === 'work', 'skip break resumes work');
A.stopFocus(sf, t4 + 40 * 60000);

section('Rank helpers & ICS export');
ok(RPG.nextRank(1).code === 'D' && RPG.nextRank(1).min === 5, 'next rank from level 1 is D at 5');
ok(RPG.nextRank(45).code === 'SS', 'next rank from level 45 is SS');
ok(RPG.nextRank(80) === null, 'no next rank at max');
var si = RPG.newState('I');
ok(RPG.buildICS(si) === null, 'no due-dated quests -> no ICS');
A.addQuest(si, { title: 'Essay, final; edit', diff: 'hard', due: '2026-07-10' });
A.addQuest(si, { title: 'no due date', diff: 'easy' });
var ics = RPG.buildICS(si);
ok(ics.indexOf('BEGIN:VCALENDAR') === 0 && ics.indexOf('END:VCALENDAR') > 0, 'valid ICS wrapper');
ok((ics.match(/BEGIN:VEVENT/g) || []).length === 1, 'only due-dated quests exported');
ok(ics.indexOf('DTSTART:20260710T090000') > 0, 'event at 9am on due date');
ok(ics.indexOf('Essay\\, final\\; edit') > 0, 'commas and semicolons escaped');
ok(ics.indexOf('BEGIN:VALARM') > 0, 'reminder alarm included');

section('Daily chest');
var sc = RPG.newState('C');
ok(A.chestStatus(sc).eligible === false, 'no dailies -> no chest');
ok(A.claimChest(sc) === null, 'cannot claim without dailies');
var d1 = A.addQuest(sc, { title: 'd1', diff: 'easy', recurring: true });
var d2 = A.addQuest(sc, { title: 'd2', diff: 'easy', recurring: true });
A.completeQuest(sc, d1.id);
ok(A.chestStatus(sc).eligible === false, 'chest locked at 1/2 dailies');
A.completeQuest(sc, d2.id);
var cs = A.chestStatus(sc);
ok(cs.eligible === true && cs.done === 2, 'chest unlocks at 2/2');
var chest = A.claimChest(sc);
ok(chest && chest.coins >= 20 && chest.coins <= 50, 'chest pays 20-50 coins (' + chest.coins + ')');
ok(sc.counters.chests === 1, 'chest counter incremented');
ok(A.claimChest(sc) === null, 'chest only once per day');
ok(A.chestStatus(sc).claimed === true, 'status shows claimed');

section('Achievements');
var sa = RPG.newState('A');
ok(RPG.checkAchievements(sa).length === 0, 'nothing unlocked at start');
var aq = A.addQuest(sa, { title: 'first', diff: 'easy' });
A.completeQuest(sa, aq.id);
var fresh = RPG.checkAchievements(sa);
ok(fresh.some(function (a) { return a.id === 'first_blood'; }), 'first_blood unlocks after first quest');
ok(RPG.checkAchievements(sa).length === 0, 'no duplicate unlocks');
sa.hero.coins = 600;
ok(RPG.checkAchievements(sa).some(function (a) { return a.id === 'rich_500'; }), 'rich_500 unlocks at 500+ coins');
ok(sa.achievements.length === 2, 'achievements stored on state');
ok(sa.log.some(function (e) { return e.text.indexOf('First Blood') >= 0; }), 'unlock logged');

section('Counters & migration');
var sm = RPG.newState('M');
var mq = A.addQuest(sm, { title: 'x', diff: 'easy' });
A.completeQuest(sm, mq.id);
ok(sm.counters.quests === 1, 'quest counter increments');
sm.hero.coins = 100;
var item = A.addShopItem(sm, { title: 'thing', price: 10, tab: 'market' });
A.buy(sm, item.id);
ok(sm.counters.purchases === 1, 'purchase counter increments');
// simulate an old v1 save (no counters/achievements/settings/focus/chest fields)
var old = RPG.newState('Old');
delete old.counters; delete old.achievements; delete old.settings;
delete old.activeFocus; delete old.chestClaimedOn;
old.log = [{ t: new Date().toISOString(), day: RPG.todayKey(), icon: 'x', text: 'y', xp: 1, coins: 1, hp: 0 }];
var st2 = mockStorage();
st2.setItem(RPG.KEY, JSON.stringify(old));
var mig = RPG.load(st2);
ok(mig.counters && mig.counters.quests === 0, 'migration adds counters');
ok(Array.isArray(mig.achievements), 'migration adds achievements');
ok(mig.settings && mig.settings.sound === true, 'migration adds settings');
ok('activeFocus' in mig && 'chestClaimedOn' in mig, 'migration adds focus/chest fields');
ok(typeof mig.log[0].min === 'number', 'migration adds min field to log entries');
ok(mig.settings.theme === 'dungeon' && typeof mig.settings.musicUrl === 'string', 'migration adds theme & music settings');
ok(typeof mig.hero.title === 'string', 'migration adds hero title');
var oldFocus = RPG.newState('OF');
oldFocus.activeFocus = { end: Date.now() + 60000, minutes: 25 }; // v2 one-shot format
var st3 = mockStorage();
st3.setItem(RPG.KEY, JSON.stringify(oldFocus));
ok(RPG.load(st3).activeFocus === null, 'old-format activeFocus dropped safely');

section('Week stats');
var sw = RPG.seed(RPG.newState('W'));
var wq = A.addQuest(sw, { title: 'w', diff: 'hard' });
A.completeQuest(sw, wq.id);
var tw = Date.now();
A.startFocus(sw, { work: 25, brk: 0, now: tw });
A.tickFocus(sw, tw + 25 * 60000 + 5);
A.stopFocus(sw, tw + 25 * 60000 + 5);
var ws = RPG.weekStats(sw);
ok(ws.days.length === 7, 'week stats covers 7 days');
ok(ws.tot.quests === 1, 'week stats counts quests');
ok(ws.tot.focusMin === 25, 'week stats counts focus minutes');
ok(ws.tot.xp > 0 && ws.per[RPG.todayKey()].xp > 0, 'week stats sums XP per day');


section('Black market: rule-breaking costs HP');
var sb = RPG.newState('B');
sb.hero.coins = 500; sb.hero.hp = 50;
var sin = A.addShopItem(sb, { title: 'Instagram before 1 PM', price: 120, tab: 'black', dmg: 8 });
ok(sin.dmg === 8, 'black item stores HP cost');
var bres = A.buy(sb, sin.id);
ok(bres.coins === -120 && bres.hp === -8, 'purchase reports coin and HP cost');
ok(sb.hero.hp === 42 && sb.hero.coins === 380, 'both costs applied');
sb.hero.hp = 5;
var bko = A.buy(sb, sin.id);
ok(bko.ko === true && sb.hero.hp === 25, 'black market purchase can KO you');
var normal = A.addShopItem(sb, { title: 'coffee', price: 10, tab: 'market' });
ok(A.buy(sb, normal.id).hp === 0, 'market items have no HP effect');

section('Habit history & records');
var sh = RPG.seed(RPG.newState('H'));
var gh = sh.habits.find(function (x) { return x.type === 'good'; });
A.doHabit(sh, gh.id);
ok(Array.isArray(gh.history) && gh.history.indexOf(RPG.todayKey()) >= 0, 'check-in recorded in history');
var bh = sh.habits.find(function (x) { return x.type === 'bad'; });
bh.cleanSince = '2000-01-01'; // long clean run
A.slipHabit(sh, bh.id);
ok(bh.bestClean > 1000, 'best clean record captured before reset (' + bh.bestClean + ')');
A.slipHabit(sh, bh.id);
ok(bh.bestClean > 1000, 'record survives later slips');
// migration adds fields to old habits/shop
var oldH = RPG.newState('OH');
oldH.habits.push({ id: 'x1', title: 'old', type: 'good', skillId: null, streak: 2, lastDoneOn: '2026-07-01', slips: 0, cleanSince: null });
oldH.shop.push({ id: 's1', title: 'old item', price: 10, tab: 'black' });
var stH = mockStorage();
stH.setItem(RPG.KEY, JSON.stringify(oldH));
var migH = RPG.load(stH);
var mh = migH.habits.find(function (h) { return h.id === 'x1'; });
ok(Array.isArray(mh.history) && mh.history[0] === '2026-07-01' && mh.bestClean === 0, 'migration backfills habit history & record');
ok(migH.shop.find(function (i) { return i.id === 's1'; }).dmg === 0, 'migration adds dmg to shop items');


section('KO -> wounded state');
var sw2 = RPG.newState('W2');
sw2.hero.hp = 10;
var bw = A.addHabit(sw2, { title: 'x', type: 'bad' });
A.slipHabit(sw2, bw.id);
ok(sw2.hero.woundedOn === RPG.todayKey(), 'KO marks hero wounded today');
var qw = A.addQuest(sw2, { title: 'q', diff: 'normal' });
var rw = A.completeQuest(sw2, qw.id);
ok(rw.wounded === true && rw.xp === Math.round(25 * 0.5), 'wounded halves quest XP (' + rw.xp + ')');
var hotel = A.addShopItem(sw2, { title: 'nap', price: 5, tab: 'hotel', hp: 10 });
sw2.hero.coins = 50;
A.buy(sw2, hotel.id);
ok(sw2.hero.woundedOn === null, 'hotel rest heals the wound');
sw2.hero.woundedOn = RPG.todayKey();
A.logSleep(sw2, 8, 4);
ok(sw2.hero.woundedOn === null, 'sleep heals the wound');
sw2.hero.woundedOn = RPG.todayKey();
sw2.lastSeenDay = '2000-01-01';
RPG.dailyReset(sw2);
ok(sw2.hero.woundedOn === null, 'wounds heal overnight');

section('Streak Shield');
var ss = RPG.newState('SS');
ss.hero.coins = 500;
var shItem = A.addShopItem(ss, { title: 'Shield', price: 200, tab: 'market', special: 'shield' });
var sres = A.buy(ss, shItem.id);
ok(sres.shield === true && ss.hero.shields === 1 && ss.hero.coins === 300, 'shield purchase equips it');
ok(A.buy(ss, shItem.id).fail === 'shield', 'cannot stack a second shield');
ss.hero.streak = 9;
ss.hero.lastActiveDay = '2026-06-28'; // missed a full day
ss.lastSeenDay = '2026-06-29';
RPG.dailyReset(ss);
ok(ss.hero.streak === 9 && ss.hero.shields === 0, 'shield consumed, streak preserved');
ok(ss.log.some(function (e) { return e.icon === String.fromCodePoint(0x1F6E1); }) || ss.log.some(function (e) { return e.text.indexOf('Shield consumed') >= 0; }), 'shield use logged');
ss.hero.lastActiveDay = '2026-06-28';
ss.lastSeenDay = '2026-06-29';
RPG.dailyReset(ss);
ok(ss.hero.streak === 0, 'no shield -> streak breaks normally');

section('Weekly-target habits');
var wt = RPG.newState('WT');
var gym = A.addHabit(wt, { title: 'gym', type: 'good', target: 3 });
ok(gym.target === 3, 'target stored');
var daily = A.addHabit(wt, { title: 'read', type: 'good' });
ok(daily.target === 7, 'default target is daily');
A.doHabit(wt, gym.id);
ok(A.weekCount(gym) === 1, 'week count tracks check-ins');
ok(A.weekStreak(gym) === 0, 'in-progress week below target does not count yet');
// simulate meeting target this week + last week
var ws0 = A.weekStart();
function dayOffset(base, n) { var d = new Date(base + 'T00:00:00'); d.setDate(d.getDate() + n); return RPG.todayKey(d); }
gym.history = [dayOffset(ws0, 0), dayOffset(ws0, 1), dayOffset(ws0, 2),
  dayOffset(ws0, -7), dayOffset(ws0, -6), dayOffset(ws0, -5)];
ok(A.weekCount(gym) === 3, 'current week counts 3');
ok(A.weekStreak(gym) === 2, 'two consecutive weeks met = streak 2');
gym.history = [dayOffset(ws0, -7), dayOffset(ws0, -6), dayOffset(ws0, -5)];
ok(A.weekStreak(gym) === 1, 'unmet current week does not break last week streak');

section('Promote & agenda');
var pa = RPG.newState('PA');
var sq = A.addQuest(pa, { title: 'Big thing', diff: 'hard' });
var g2 = A.promoteQuest(pa, sq.id);
ok(!!g2 && pa.goals.some(function (x) { return x.id === g2.id && x.title === 'Big thing'; }), 'side quest becomes a goal');
ok(!pa.quests.some(function (x) { return x.id === sq.id; }), 'original quest removed');
var rq2 = A.addQuest(pa, { title: 'daily', diff: 'easy', recurring: true });
ok(A.promoteQuest(pa, rq2.id) === null, 'recurring quests cannot be promoted');
function dOff(n) { var d = new Date(); d.setDate(d.getDate() + n); return RPG.todayKey(d); }
A.addQuest(pa, { title: 'late', diff: 'easy', due: dOff(-2) });
A.addQuest(pa, { title: 'now', diff: 'easy', due: dOff(0) });
A.addQuest(pa, { title: 'soon', diff: 'easy', due: dOff(3) });
A.addQuest(pa, { title: 'far', diff: 'easy', due: dOff(20) });
var ag = A.agenda(pa);
ok(ag.length === 4, 'agenda lists all due quests');
ok(ag[0].bucket === 'overdue' && ag[1].bucket === 'today' && ag[2].bucket === 'week' && ag[3].bucket === 'later', 'buckets ordered by urgency');
ok(ag[0].days === -2 && ag[2].days === 3, 'day deltas computed');
var mg2 = RPG.migrate(JSON.parse(JSON.stringify(RPG.newState('M2'))));
ok(typeof mg2.hero.shields === 'number' && 'woundedOn' in mg2.hero, 'migration adds shields & wounded fields');


section('Weekly boss');
var wb = RPG.newState('WB');
ok(A.slayBoss(wb) === null, 'nothing to slay without a boss');
var boss = A.setBoss(wb, { title: 'Finish essay draft' });
ok(boss && boss.setOn === RPG.todayKey(), 'boss named today');
ok(A.bossDaysLeft(wb) === 7, '7 days to slay it');
ok(A.setBoss(wb, { title: 'second' }) === null, 'only one boss at a time');
var kill = A.slayBoss(wb);
ok(kill.xp === 500 && kill.coins === 250, 'slaying pays 500xp/250c');
ok(wb.counters.bosses === 1 && wb.boss === null, 'counter up, slot cleared');
ok(A.slayBoss(wb) === null, 'cannot slay twice');
ok(RPG.checkAchievements(wb).some(function (a) { return a.id === 'boss_1'; }), 'Dragonheart unlocks on first boss');
A.setBoss(wb, { title: 'runner' });
var ab = A.abandonBoss(wb);
ok(ab.abandoned === true && wb.boss === null && wb.counters.bosses === 1, 'abandon clears without reward');
A.setBoss(wb, { title: 'escapee' });
wb.boss.due = '2020-01-01';
wb.lastSeenDay = '2020-01-05';
RPG.dailyReset(wb);
ok(wb.boss === null, 'overdue boss escapes on daily reset');
ok(wb.log.some(function (e) { return e.text.indexOf('escaped') >= 0; }), 'escape logged');
var mg3 = RPG.migrate(JSON.parse(JSON.stringify(RPG.newState('M3'))));
delete mg3.boss; delete mg3.counters.bosses;
mg3 = RPG.migrate(mg3);
ok('boss' in mg3 && mg3.counters.bosses === 0, 'migration adds boss slot & counter');

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
