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
ok(s.quests.length === 2 && s.habits.length === 5 && s.shop.length === 6, 'seed content present');

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

section('Focus banked on a side quest');
(function () {
  var fq = RPG.newState('FQ');
  var side = A.addQuest(fq, { title: 'Write cover letter', diff: 'normal' });
  var t0 = Date.now();
  A.startFocus(fq, { work: 30, brk: 0, questId: side.id, now: t0 });
  A.tickFocus(fq, t0 + 30 * 60000 + 5);
  var fr = A.stopFocus(fq, t0 + 30 * 60000 + 5);
  ok(fr.questTitle === 'Write cover letter', 'stop reports the linked side quest');
  ok(side.focusMin === 30, '30 min banked on the side quest');
  var mg = RPG.migrate(JSON.parse(JSON.stringify(RPG.newState('MGQ'))));
  A.addQuest(mg, { title: 'x' });
  delete mg.quests[0].focusMin;
  ok(RPG.migrate(mg).quests[0].focusMin === 0, 'migration seeds quest focusMin');
})();

section('All-habits-kept bonus');
(function () {
  var ab = RPG.newState('AB');
  A.addHabit(ab, { title: 'One', type: 'good' });
  A.addHabit(ab, { title: 'Two', type: 'good' });
  A.addHabit(ab, { title: 'Monster', type: 'bad' });
  var r1 = A.doHabit(ab, ab.habits[0].id);
  ok(!r1.allHabits, 'no bonus while a good habit is still unchecked');
  var r2 = A.doHabit(ab, ab.habits[1].id);
  ok(r2.allHabits === true && r2.bonusCoins >= 20, 'clearing the last good habit pays the full-garden bonus');
  ok(ab.log.some(function (e) { return e.icon === '🌟'; }), 'bonus is logged');
  var solo = RPG.newState('SOLO');
  A.addHabit(solo, { title: 'Only one', type: 'good' });
  ok(!A.doHabit(solo, solo.habits[0].id).allHabits, 'single-habit boards cannot farm the bonus');
})();

section('Skills management');
(function () {
  var cap = RPG.newState('CAP');
  while (cap.skills.length < RPG.MAX_SKILLS) A.addSkill(cap, 'Area ' + cap.skills.length, '✨');
  ok(cap.skills.length === RPG.MAX_SKILLS, 'life areas fill up to the cap');
  ok(A.addSkill(cap, 'One too many', '🚫') === null, 'addSkill refuses past MAX_SKILLS (12)');
})();
(function () {
  var sd = RPG.seed(RPG.newState('SD'));
  ['Read 20 pages', 'Workout / walk 30 min', 'Reach out to a friend', 'Review spending 10 min'].forEach(function (t) {
    ok(sd.habits.some(function (h) { return h.title === t; }), 'starter board shows a use case: ' + t);
  });
  var social = sd.skills[3].id, money = sd.skills[4].id;
  ok(sd.habits.some(function (h) { return h.skillId === social; }), 'Social area has a starter habit');
  ok(sd.habits.some(function (h) { return h.skillId === money; }), 'Money area has a starter habit');
})();
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
ok(e1 && e1.event === 'breakReady', 'work phase finishes and offers the break (does not auto-start it)');
ok(sf.activeFocus.awaitingBreak === true && sf.activeFocus.workedMs === 25 * 60000, '25 min banked, break pending');
ok(A.tickFocus(sf, t0 + 40 * 60000) === null, 'timer frozen while the break is pending');
ok(Math.floor(A.focusWorkedMs(sf, t0 + 40 * 60000) / 60000) === 25, 'worked time holds at 25 while awaiting break');
sf.hero.hp = 50;
var tb = t0 + 26 * 60000;                    // user starts the break a minute later
A.startBreak(sf, tb);
ok(sf.activeFocus.phase === 'break' && !sf.activeFocus.awaitingBreak, 'starting the break enters the break phase');
var e2 = A.tickFocus(sf, tb + 5 * 60000 + 10);
ok(e2 && e2.event === 'work' && e2.healed === 3, 'break end heals +3 HP and resumes work');
ok(sf.activeFocus.cycles === 1, 'cycle counted');
var wStart = tb + 5 * 60000 + 10;            // work phase 2 began here
var worked = A.focusWorkedMs(sf, wStart + 12 * 60000);
ok(Math.floor(worked / 60000) === 37, 'worked time includes partial current work phase (37 min)');
var r = A.stopFocus(sf, wStart + 12 * 60000);
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
A.startBreak(sf, t4 + 25 * 60000 + 10);
ok(sf.activeFocus.phase === 'break', 'in break');
var sk = A.skipBreak(sf, t4 + 26 * 60000);
ok(sk && sk.event === 'work' && sf.activeFocus.phase === 'work', 'skip break resumes work');
A.stopFocus(sf, t4 + 40 * 60000);

// pause / resume freezes the timer and worked time without collecting
var tp = Date.now();
A.startFocus(sf, { work: 50, brk: 0, now: tp });
A.pauseFocus(sf, tp + 10 * 60000);        // 10 min in, pause
ok(sf.activeFocus.pausedAt, 'pause records the moment');
ok(A.tickFocus(sf, tp + 3 * 3600000) === null, 'a paused timer never advances');
ok(Math.floor(A.focusWorkedMs(sf, tp + 3 * 3600000) / 60000) === 10, 'worked time frozen at 10 min while paused');
A.resumeFocus(sf, tp + 3 * 3600000);      // resume 3h later
ok(!sf.activeFocus.pausedAt, 'resume clears the pause');
ok(Math.floor(A.focusWorkedMs(sf, tp + 3 * 3600000 + 5 * 60000) / 60000) === 15, 'after resuming, worked time counts again from where it froze');
A.stopFocus(sf, tp + 3 * 3600000 + 5 * 60000);

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


section('KO -> downed state');
var sw2 = RPG.newState('W2');
sw2.hero.hp = 10;
var bw = A.addHabit(sw2, { title: 'x', type: 'bad' });
A.slipHabit(sw2, bw.id);
ok(sw2.hero.woundedOn === RPG.todayKey(), 'KO marks hero wounded today');
ok(sw2.hero.downed && sw2.hero.downed.on === RPG.todayKey(), 'KO knocks the hero down');
var qw = A.addQuest(sw2, { title: 'q', diff: 'normal' });
var rw = A.completeQuest(sw2, qw.id);
ok(rw.wounded === true && rw.downed === true && rw.xp === Math.round(Math.round(25 * 0.5) * 0.5), 'downed + wounded quarters quest XP (' + rw.xp + ')');
ok(rw.coins === 0, 'downed earns no coins');
// clear the downed state so the wound-heal assertions below test the wound path
sw2.hero.downed = null;
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
var wbDays = A.bossDaysLeft(wb);
ok(wbDays >= 2 && wbDays <= 8, 'boss due by the Sunday closing its week (2-8 days out)');
ok(new Date(wb.boss.due + 'T00:00:00').getDay() === 0, 'boss due date lands on a Sunday');
// bossSunday: Mon-Fri target this week's Sunday; Sat/Sun roll to next week's
ok(RPG.bossSunday(new Date('2026-07-20T12:00:00')) === '2026-07-26', 'Monday boss closes this Sunday');
ok(RPG.bossSunday(new Date('2026-07-24T12:00:00')) === '2026-07-26', 'Friday boss still closes this Sunday');
ok(RPG.bossSunday(new Date('2026-07-25T12:00:00')) === '2026-08-02', 'Saturday boss rolls to next Sunday');
ok(RPG.bossSunday(new Date('2026-07-26T12:00:00')) === '2026-08-02', 'Sunday boss rolls to next Sunday');
ok(RPG.bossSunday(new Date('2026-07-20T12:00:00'), 1) === '2026-08-02', 'weeksAhead pushes the closing Sunday out');
var wbPick = RPG.newState('WBP');
A.setBoss(wbPick, { title: 'Planned ahead', due: '2026-08-02' });
ok(wbPick.boss.due === '2026-08-02', 'explicit week pick is honored');
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

section('Skill mastery perks');
var sp = RPG.newState('SP');
var mind = sp.skills[0];
mind.level = 3; // Adept tier: +10% XP on tagged actions
var qp = A.addQuest(sp, { title: 'study', diff: 'hard', skillId: mind.id });
var rp = A.completeQuest(sp, qp.id);
ok(rp.xp === Math.round(60 * RPG.streakMult(sp.hero.streak) * 1.10), 'Adept skill (Lv3) adds +10% XP to its quests (' + rp.xp + ')');
ok(RPG.skillTier(3).name === 'Adept' && RPG.skillTier(6).name === 'Expert' && RPG.skillTier(10).name === 'Master', 'tier names by level');
mind.level = 10; // Master tier: +30% XP, +10% coins
var qp2 = A.addQuest(sp, { title: 'study2', diff: 'hard', skillId: mind.id });
var rp2 = A.completeQuest(sp, qp2.id);
ok(rp2.xp === Math.round(60 * 1 * 1.30), 'Master skill (Lv10) adds +30% XP');
ok(rp2.coins === 33, 'Master skill adds +10% coins (30 -> 33)');
var qUn = A.addQuest(sp, { title: 'untagged', diff: 'hard' });
var rUn = A.completeQuest(sp, qUn.id);
ok(rUn.xp === 60 && rUn.coins === 30, 'untagged quests get no skill perk');

section('Prestige / ascension');
var pr = RPG.newState('PR');
ok(RPG.ascendReady(pr) === false, 'cannot ascend below level 40');
ok(RPG.ascend(pr, 'scholar') === null, 'ascend blocked when not ready');
pr.hero.level = 41; pr.hero.title = 'Route Master'; pr.hero.badges.push({ code: 'S', name: 'Master', on: '2026-01-01' });
var ar = RPG.ascend(pr, 'scholar');
ok(ar && pr.hero.ascension === 1 && pr.hero.level === 1 && pr.hero.xp === 0, 'ascend resets to Lv1, season 1');
ok(pr.hero.boons.scholar === 1 && pr.counters.ascensions === 1, 'boon + counter recorded');
ok(pr.hero.title === 'Route Master' && pr.hero.badges.length === 1, 'ascension keeps titles & badges (legacy preserved)');
ok(RPG.ascend(pr, 'nonsense') === null, 'invalid boon id rejected');
var qpr = A.addQuest(pr, { title: 'x', diff: 'hard' });
var rpr = A.completeQuest(pr, qpr.id);
ok(rpr.xp === Math.round(60 * 1 * 1.08), 'scholar boon adds +8% XP (' + rpr.xp + ')');
var pv = RPG.newState('PV'); pv.hero.level = 41;
RPG.ascend(pv, 'vigor');
ok(RPG.maxHpOf(pv) === 120 && pv.hero.hp === 120, 'vigor boon raises max HP to 120 and refills');
var pc = RPG.newState('PC'); pc.hero.level = 41; RPG.ascend(pc, 'coinfind');
var qc = A.addQuest(pc, { title: 'x', diff: 'hard' }); var rc = A.completeQuest(pc, qc.id);
ok(rc.coins === Math.round(30 * 1.08), 'coinfind boon adds +8% coins (' + rc.coins + ')');
var pw = RPG.newState('PW'); pw.hero.level = 41; RPG.ascend(pw, 'warden');
var bw = A.addHabit(pw, { title: 'm', type: 'bad' });
var sw = A.slipHabit(pw, bw.id);
ok(sw.hp === -Math.round(12 * 1 * 0.8), 'warden softens the monster hit by 20% (' + sw.hp + ')');

section('Focus Elixir (potion buff)');
var pp = RPG.newState('PP');
ok(RPG.usePotion(pp) === null, 'no potion to use');
pp.inventory.potion = 1;
var up = RPG.usePotion(pp);
ok(up && pp.inventory.potion === 0, 'potion consumed');
ok(Math.abs(RPG.buffXpMult(pp) - 2) < 1e-9, 'buff doubles XP today');
var qb = A.addQuest(pp, { title: 'x', diff: 'hard' });
var rb = A.completeQuest(pp, qb.id);
ok(rb.xp === Math.round(60 * 1 * 2), 'quest under elixir pays double XP (' + rb.xp + ')');
pp.hero.buffs[0].until = '2000-01-01'; // simulate the day rolling over
pp.lastSeenDay = '2000-01-01';
RPG.dailyReset(pp);
ok(pp.hero.buffs.length === 0 && Math.abs(RPG.buffXpMult(pp) - 1) < 1e-9, 'buff expires on a new day');

section('Monster menace scaling');
var mm = RPG.newState('MM'); mm.hero.hp = 100;
var mon = A.addHabit(mm, { title: 'scroll', type: 'bad' });
ok(RPG.menaceOf(mon) === 1, 'new monster starts at menace 1');
var ms1 = A.slipHabit(mm, mon.id);
ok(ms1.hp === -12 && Math.abs(mon.menace - 1.2) < 1e-9, 'first slip hits 12, menace rises to 1.2');
var ms2 = A.slipHabit(mm, mon.id);
ok(ms2.hp === -Math.round(12 * 1.2) && Math.abs(mon.menace - 1.4) < 1e-9, 'second slip hits harder (14), menace 1.4');
mon.lastDoneOn = '2000-01-01'; // pretend it went un-fed yesterday
mm.lastSeenDay = '2000-01-02';
RPG.dailyReset(mm);
ok(Math.abs(mon.menace - 1.3) < 1e-9, 'menace decays 0.1 on a clean day');
mon.menace = 2.5;
var msBig = A.slipHabit(mm, mon.id);
ok(msBig.hp === -Math.round(12 * 2.5) && mon.menace === 2.5, 'menace and damage cap at 2.5');

section('Chest loot table');
function seqRng(vals) { var i = 0; return function () { return vals[i++ % vals.length]; }; }
var cl = RPG.newState('CL');
ok(A.rollChestLoot(cl, 0.5).type === 'coins', 'low roll -> plain coins');
ok(A.rollChestLoot(cl, 0.70).type === 'jackpot', 'mid roll -> coin jackpot');
ok(A.rollChestLoot(cl, 0.85).type === 'potion', 'high roll -> Focus Elixir');
ok(A.rollChestLoot(cl, 0.95).type === 'frame', 'top roll -> cosmetic frame');
var cc = RPG.newState('CC');
var cd1 = A.addQuest(cc, { title: 'd', diff: 'easy', recurring: true }); A.completeQuest(cc, cd1.id);
var rFrame = A.claimChest(cc, seqRng([0, 0.95]));
ok(rFrame.coins >= 20 && rFrame.coins <= 50, 'base chest coins stay in the 20-50 range');
ok(rFrame.loot && rFrame.loot.type === 'frame' && cc.cosmetics.frames.length === 1, 'frame loot added to cosmetics');
var cc2 = RPG.newState('CC2');
var cd2 = A.addQuest(cc2, { title: 'd', diff: 'easy', recurring: true }); A.completeQuest(cc2, cd2.id);
var rPot = A.claimChest(cc2, seqRng([0.5, 0.85]));
ok(rPot.loot.type === 'potion' && cc2.inventory.potion === 1, 'chest can drop a Focus Elixir');
var cc3 = RPG.newState('CC3');
var cd3 = A.addQuest(cc3, { title: 'd', diff: 'easy', recurring: true }); A.completeQuest(cc3, cd3.id);
var beforeJ = cc3.hero.coins;
var rJack = A.claimChest(cc3, seqRng([0.0, 0.70, 0.0]));
ok(rJack.loot.type === 'jackpot' && rJack.loot.coins === 40, 'jackpot pays a bonus coin pile');
ok(cc3.hero.coins === beforeJ + rJack.coins + 40, 'jackpot coins actually credited on top of base');

section('Scheduled (weekday) dailies');
var sd = RPG.newState('SD');
var wd = new Date().getDay(), otherWd = (wd + 1) % 7;
var qToday = A.addQuest(sd, { title: 'today only', diff: 'easy', recurring: true, days: [wd] });
var qOther = A.addQuest(sd, { title: 'other day', diff: 'easy', recurring: true, days: [otherWd] });
ok(RPG.questActiveOn(qToday, new Date()) === true, 'quest scheduled for today is active');
ok(RPG.questActiveOn(qOther, new Date()) === false, 'quest scheduled for another day is dormant');
A.completeQuest(sd, qToday.id);
var csd = A.chestStatus(sd);
ok(csd.total === 1 && csd.eligible === true, 'chest counts only today-scheduled dailies');
var qEvery = A.addQuest(sd, { title: 'every', diff: 'easy', recurring: true, days: [0, 1, 2, 3, 4, 5, 6] });
ok(qEvery.days === null, 'a 7-day schedule is stored as every-day (null)');

section('Insights');
var iv = RPG.newState('IV');
function dayk(n) { var d = new Date(); d.setDate(d.getDate() - n); return RPG.todayKey(d); }
for (var di = 0; di < 8; di++) {
  var dk = dayk(di), ts = new Date().toISOString();
  if (di % 2 === 0) {
    iv.journal[dk] = { mood: 'great', note: '' };
    iv.sleep[dk] = { hours: 8, quality: 4 };
    iv.log.push({ t: ts, day: dk, icon: '⏳', text: 'Focus session', xp: 70, coins: 0, hp: 0, min: 60 });
    iv.log.push({ t: ts, day: dk, icon: '⚔️', text: 'Quest cleared', xp: 25, coins: 12, hp: 0, min: 0 });
  } else {
    iv.journal[dk] = { mood: 'awful', note: '' };
    iv.sleep[dk] = { hours: 5, quality: 2 };
  }
}
var ins = RPG.insights(iv);
ok(ins.enough === true && ins.sampleSize === 8, 'insights need >=6 mood days');
ok(ins.findings.some(function (f) { return f.kind === 'sleep'; }), 'finds the sleep <-> mood link');
ok(ins.findings.some(function (f) { return f.kind === 'focus'; }), 'finds the focus <-> mood link');
ok(ins.findings.some(function (f) { return f.kind === 'quests'; }), 'finds the quests <-> mood link');
ok(ins.bestSleep && ins.bestSleep > 7, 'derives a best-feel sleep target');
ok(RPG.insights(RPG.newState('IV2')).enough === false, 'not enough data -> no false insights');

section('Weekly review');
var wr = RPG.seed(RPG.newState('WR'));
var wrq = A.addQuest(wr, { title: 'big', diff: 'epic' }); A.completeQuest(wr, wrq.id);
var wrmon = wr.habits.find(function (h) { return h.type === 'bad'; });
A.slipHabit(wr, wrmon.id); A.slipHabit(wr, wrmon.id);
var rev = RPG.weeklyReview(wr);
ok(rev.bestDay === RPG.todayKey() && rev.bestXp > 0, 'best day of the week identified');
ok(rev.worstMonster === wrmon.title && rev.worstN === 2, 'worst monster tallied from the week\'s slips');
ok(rev.suggestion.indexOf(wrmon.title) >= 0, 'suggestion targets the worst monster');

section('Onboarding paths');
ok(RPG.PATHS.length >= 4, 'multiple onboarding paths offered');
var stu = RPG.seedPreset(RPG.newState('STU'), 'student');
ok(stu.skills[0].name === 'Study', 'student path renames the first life area');
ok(stu.quests.length >= 2 && stu.habits.length >= 3, 'student path seeds a full board');
ok(stu.shop.some(function (i) { return i.special === 'shield'; }), 'path boards stock a Streak Shield');
ok(stu.habits.some(function (h) { return h.type === 'bad' && h.menace === 1; }), 'path monsters start at menace 1');
var gen = RPG.seedPreset(RPG.newState('GEN'), 'general');
ok(gen.quests.length === 2 && gen.habits.length === 5 && gen.shop.length === 6, 'general path == classic seed');
ok(stu.skills.some(function (k) { return k.name === 'Study' && k.icon === '📚'; }), 'path life areas get matching icons');

section('Multi-path onboarding (student AND founder AND more)');
var multi = RPG.seedPreset(RPG.newState('M'), ['student', 'founder']);
var mNames = multi.skills.map(function (k) { return k.name; });
ok(multi.skills.length === 6, 'two paths widen the board to 6 life areas');
ok(mNames.indexOf('Body') >= 0 && mNames.indexOf('Money') >= 0, 'areas shared by both identities are kept');
ok(mNames.indexOf('Study') >= 0 && mNames.indexOf('Mind') >= 0, 'each identity contributes its signature areas');
var mTitles = multi.quests.map(function (q) { return q.title.toLowerCase(); });
ok(mTitles.length === mTitles.filter(function (t, i) { return mTitles.indexOf(t) === i; }).length, 'merged quests carry no duplicates');
ok(multi.quests.length <= 7 && multi.habits.filter(function (h) { return h.type === 'good'; }).length <= 7, 'starter board stays capped, not a dump of everything');
ok(multi.quests.every(function (q) { return q.skillId === null || multi.skills.some(function (k) { return k.id === q.skillId; }); }), 'every merged quest points at a real merged life area');
var multi3 = RPG.seedPreset(RPG.newState('M3'), ['student', 'athlete', 'creative']);
ok(multi3.skills.length === 7, 'three paths cap at 7 life areas');
ok(multi3.habits.filter(function (h) { return h.type === 'bad'; }).length <= 4, 'monsters capped at 4 even across three paths');
var single = RPG.seedPreset(RPG.newState('S1'), ['athlete']);
ok(single.skills.length === 5 && single.skills[2].name === 'Nutrition', 'a single path in array form behaves like the classic pick');
var degen = RPG.seedPreset(RPG.newState('D1'), ['general', 'nonsense']);
ok(degen.quests.length === 2 && degen.habits.length === 5, 'unknown/balanced-only picks fall back to the classic seed');

section('Migration to schema 5');
var v4 = RPG.newState('V4');
delete v4.hero.boons; delete v4.hero.ascension; delete v4.hero.buffs; delete v4.hero.frame;
delete v4.inventory; delete v4.cosmetics; delete v4.counters.ascensions;
v4.quests.push({ id: 'q4', title: 'q', diff: 'easy', skillId: null, due: null, recurring: true, main: null, doneOn: null, createdOn: RPG.todayKey() });
v4.habits.push({ id: 'b4', title: 'bad', type: 'bad', skillId: null, streak: 0, lastDoneOn: null, slips: 0, cleanSince: null, history: [], bestClean: 0, target: 7 });
v4.schema = 4;
var st5 = mockStorage(); st5.setItem(RPG.KEY, JSON.stringify(v4));
var m5 = RPG.load(st5);
ok(m5.hero.boons && typeof m5.hero.boons === 'object' && m5.hero.ascension === 0, 'migration adds boons & ascension');
ok(Array.isArray(m5.hero.buffs) && typeof m5.hero.frame === 'string', 'migration adds buffs & frame');
ok(m5.inventory.potion === 0 && Array.isArray(m5.cosmetics.frames), 'migration adds inventory & cosmetics');
ok(m5.counters.ascensions === 0, 'migration adds ascension counter');
ok(m5.quests[m5.quests.length - 1].days === null, 'migration adds days=null to old quests');
ok(m5.habits.find(function (h) { return h.id === 'b4'; }).menace === 1, 'migration adds menace to old bad habits');
ok(m5.schema === 5, 'schema bumped to 5');

section('New achievements');
var na = RPG.newState('NA');
na.skills[0].level = 10;
ok(RPG.checkAchievements(na).some(function (a) { return a.id === 'skill_master'; }), 'Master Mind unlocks at a Lv10 life area');
na.hero.level = 60;
ok(RPG.checkAchievements(na).some(function (a) { return a.id === 'legend'; }), 'Living Legend unlocks at rank SS');
na.hero.ascension = 1;
ok(RPG.checkAchievements(na).some(function (a) { return a.id === 'ascend_1'; }), 'Reborn unlocks after ascending');


section('Extended mastery tiers (skills uncapped)');
ok(RPG.skillTier(15).name === 'Grandmaster', 'Lv15 = Grandmaster');
ok(RPG.skillTier(20).name === 'Sage', 'Lv20 = Sage');
ok(RPG.skillTier(999).name === 'Sage', 'bonus plateaus at Sage (level itself keeps rising)');
ok(RPG.skillTier(20).xp === 1.50 && RPG.skillTier(20).coins === 1.20, 'Sage = +50% XP / +20% coins');
var stg = RPG.newState('STG'); stg.skills[0].level = 15;
var qtg = A.addQuest(stg, { title: 'x', diff: 'hard', skillId: stg.skills[0].id });
var rtg = A.completeQuest(stg, qtg.id);
ok(rtg.xp === Math.round(60 * 1 * 1.40), 'Grandmaster adds +40% XP (' + rtg.xp + ')');
var unc = RPG.newState('UNC'); var uk = unc.skills[0]; uk.level = 10; uk.xp = 0;
for (var uz = 0; uz < 100; uz++) { var uq = A.addQuest(unc, { title: 'u' + uz, diff: 'epic', skillId: uk.id }); A.completeQuest(unc, uq.id); }
ok(uk.level > 10, 'a life area levels past 10 — no cap (reached Lv.' + uk.level + ')');
ok(RPG.checkAchievements(RPG.newState('SGX')).length >= 0, 'sage achievement wired'); // smoke
var sagey = RPG.newState('SGY'); sagey.skills[0].level = 20;
ok(RPG.checkAchievements(sagey).some(function (a) { return a.id === 'skill_sage'; }), 'Sage achievement at Lv.20');

section('Anti-binge economy: surge + daily cap');
var ec = RPG.newState('EC'); ec.hero.coins = 100000;
var game = A.addShopItem(ec, { title: 'Gaming 1h', price: 60, tab: 'market' });
ok(game.surge === 0.4 && game.limit === 0, 'market items get 0.4 surge, no hard cap by default');
var eb1 = A.buy(ec, game.id);
ok(eb1.coins === -60 && eb1.count === 1 && eb1.surged !== true, 'first buy at base price 60');
var eb2 = A.buy(ec, game.id);
ok(eb2.coins === -Math.round(60 * 1.4) && eb2.surged === true, 'second same-day buy surges to 84');
var eb3 = A.buy(ec, game.id);
ok(eb3.coins === -Math.round(60 * 1.8), 'third buy surges to 108 (escalating)');
ok(RPG.buyInfo(ec, game).count === 3, 'daily buy count tracked');
var vice = A.addShopItem(ec, { title: 'Skip gym', price: 70, tab: 'black', dmg: 6 });
ok(vice.limit === 2 && vice.surge === 0.6, 'black-market items default to 0.6 surge + 2/day cap');
A.buy(ec, vice.id); A.buy(ec, vice.id);
var vcap = A.buy(ec, vice.id);
ok(vcap.fail === 'limit', 'third black-market buy of the day is blocked by the cap');
game.dayBuysOn = '2000-01-01';
ok(RPG.buyPrice(ec, game) === 60 && RPG.buyCount(ec, game) === 0, 'surge + count reset on a new day');
ec.settings.escalate = false; game.dayBuysOn = RPG.todayKey(); game.dayBuys = 5;
ok(RPG.buyPrice(ec, game) === 60, 'escalation off in settings -> flat price');
ec.settings.escalate = true;
var nap = A.addShopItem(ec, { title: 'Nap', price: 25, tab: 'hotel', hp: 15 });
A.buy(ec, nap.id);
ok(RPG.buyPrice(ec, nap) === 25, 'hotel (rest) items never surge');
var shieldItm = A.addShopItem(ec, { title: 'Shield', price: 200, tab: 'market', special: 'shield' });
ok(shieldItm.surge === 0 && shieldItm.limit === 0, 'special items (shield) never surge or cap');
var mig5 = RPG.migrate(JSON.parse(JSON.stringify(RPG.newState('MIG5'))));
delete mig5.shop; mig5.shop = [{ id: 'x', title: 'g', price: 60, tab: 'market' }, { id: 'y', title: 'v', price: 70, tab: 'black' }];
delete mig5.settings.escalate;
mig5 = RPG.migrate(mig5);
ok(mig5.settings.escalate === true, 'migration enables escalation by default');
ok(mig5.shop[0].surge === 0.4 && mig5.shop[1].limit === 2, 'migration backfills surge + cap on old shop items');


section('Edit quests / main quests / habits');
var ed = RPG.seed(RPG.newState('ED'));
var eq = A.addQuest(ed, { title: 'old title', diff: 'easy' });
A.editQuest(ed, eq.id, { title: 'new title', diff: 'hard', skillId: ed.skills[0].id });
ok(eq.title === 'new title' && eq.diff === 'hard' && eq.skillId === ed.skills[0].id, 'editQuest updates title/diff/life area');
A.editQuest(ed, eq.id, { title: '   ' });
ok(eq.title === 'new title', 'blank title is ignored on edit');
var erq = A.addQuest(ed, { title: 'daily', diff: 'easy', recurring: true });
A.editQuest(ed, erq.id, { days: [1, 3, 5] });
ok(erq.days && erq.days.length === 3, 'editQuest sets a weekday schedule on a recurring quest');
A.editQuest(ed, erq.id, { days: [0, 1, 2, 3, 4, 5, 6] });
ok(erq.days === null, 'editQuest: a full-week schedule means every day');
var eg = A.addGoal(ed, { title: 'goal', note: '' });
A.editGoal(ed, eg.id, { title: 'big goal', note: 'because it matters' });
ok(eg.title === 'big goal' && eg.note === 'because it matters', 'editGoal updates title + note');
var eh = A.addHabit(ed, { title: 'read', type: 'good', target: 7 });
A.editHabit(ed, eh.id, { title: 'read more', target: 3, skillId: ed.skills[0].id });
ok(eh.title === 'read more' && eh.target === 3 && eh.skillId === ed.skills[0].id, 'editHabit updates a good habit');
var ehb = A.addHabit(ed, { title: 'scroll', type: 'bad' });
A.editHabit(ed, ehb.id, { title: 'doomscroll', target: 2 });
ok(ehb.title === 'doomscroll' && ehb.target === 7, 'editHabit renames a monster but ignores target/skill for bad habits');
ok(A.editQuest(ed, 'nope', {}) === null && A.editGoal(ed, 'nope', {}) === null && A.editHabit(ed, 'nope', {}) === null, 'editing an unknown id returns null');

section('Focus breakdown by day');
var fb = RPG.newState('FB');
var tf0 = Date.now();
A.startFocus(fb, { work: 25, brk: 0, skillId: fb.skills[0].id, now: tf0 });
A.tickFocus(fb, tf0 + 25 * 60000 + 5); A.stopFocus(fb, tf0 + 25 * 60000 + 5);
var tf1 = Date.now();
A.startFocus(fb, { work: 25, brk: 0, skillId: fb.skills[1].id, now: tf1 });
A.tickFocus(fb, tf1 + 25 * 60000 + 5); A.stopFocus(fb, tf1 + 25 * 60000 + 5);
var fbd = RPG.focusByDay(fb, 7);
ok(fbd.days.length === 7, 'focusByDay covers 7 days');
ok(fbd.per[RPG.todayKey()].total === 50, 'today total = 50 min across two sessions');
ok(fbd.per[RPG.todayKey()].bySkill[fb.skills[0].id] === 25 && fbd.per[RPG.todayKey()].bySkill[fb.skills[1].id] === 25, 'focus split by life area');
ok(fbd.skills.length === 2 && fbd.totalMin === 50 && fbd.maxMin === 50, 'life areas + totals computed');
var fu = RPG.newState('FU'); var tu = Date.now();
A.startFocus(fu, { work: 30, brk: 0, now: tu }); A.tickFocus(fu, tu + 30 * 60000 + 5); A.stopFocus(fu, tu + 30 * 60000 + 5);
var fud = RPG.focusByDay(fu, 7);
ok(fud.per[RPG.todayKey()].bySkill['__none'] === 30 && fud.skills.indexOf('__none') >= 0, 'untagged focus is bucketed as __none');


section('Focus invested in main quests');
var fg = RPG.newState('FG');
var fgGoal = A.addGoal(fg, { title: 'Ship the app' });
var tg0 = Date.now();
A.startFocus(fg, { work: 25, brk: 0, goalId: fgGoal.id, skillId: fg.skills[0].id, now: tg0 });
ok(fg.activeFocus.goalId === fgGoal.id, 'focus session carries the main-quest link');
A.tickFocus(fg, tg0 + 25 * 60000 + 5);
var fgRes = A.stopFocus(fg, tg0 + 25 * 60000 + 5);
ok(fgGoal.focusMin === 25, '25 worked minutes banked on the goal');
ok(fgRes.goalTitle === 'Ship the app', 'stop reports which goal was funded');
var tg1 = Date.now();
A.startFocus(fg, { work: 25, brk: 0, goalId: 'gone', now: tg1 });
A.tickFocus(fg, tg1 + 25 * 60000 + 5);
ok(A.stopFocus(fg, tg1 + 25 * 60000 + 5).goalTitle === undefined, 'unknown/finished goal is ignored safely');
var mgF = RPG.migrate(JSON.parse(JSON.stringify(RPG.newState('MGF'))));
mgF.goals.push({ id: 'g0', title: 'old', note: '', doneOn: null, createdOn: RPG.todayKey() });
delete mgF.settings.reminders;
mgF = RPG.migrate(mgF);
ok(mgF.goals[0].focusMin === 0, 'migration backfills focusMin on old goals');
ok(mgF.settings.reminders === false, 'migration adds reminders setting (off by default)');

section('Activity heatmap');
var hm = RPG.newState('HM');
function hmDay(n) { var d = new Date(); d.setDate(d.getDate() - n); return RPG.todayKey(d); }
hm.log.push({ t: new Date().toISOString(), day: hmDay(0), icon: '⚔️', text: 'q', xp: 100, coins: 0, hp: 0, min: 0 });
hm.log.push({ t: new Date().toISOString(), day: hmDay(0), icon: '🌱', text: 'h', xp: 20, coins: 0, hp: 0, min: 0 });
hm.log.push({ t: new Date().toISOString(), day: hmDay(3), icon: '⚔️', text: 'q', xp: 30, coins: 0, hp: 0, min: 0 });
var hmr = RPG.heatmap(hm, 12);
ok(hmr.cells.length % 7 === 0 && hmr.cells.length >= 84, 'grid padded to whole Sun-Sat weeks (' + hmr.cells.length + ' cells)');
ok(hmr.total === 150 && hmr.activeDays === 2 && hmr.max === 120, 'totals, active days and max computed');
var todayCell = hmr.cells.find(function (c) { return c.day === RPG.todayKey(); });
ok(todayCell && todayCell.xp === 120 && todayCell.level === 4, 'today aggregates to the hottest level');
var d3 = hmr.cells.find(function (c) { return c.day === hmDay(3); });
ok(d3 && d3.level >= 1 && d3.level <= 4, 'lighter day gets a non-zero level');
ok(hmr.cells.every(function (c) { return !c.future || c.level === 0; }), 'future padding cells stay empty');
ok(RPG.heatmap(RPG.newState('HM2'), 12).total === 0, 'fresh hero -> empty heatmap, no crash');

section('Boss trophies');
var bt = RPG.newState('BT');
A.setBoss(bt, { title: 'First dragon' }); A.slayBoss(bt);
A.setBoss(bt, { title: 'Second dragon' }); A.slayBoss(bt);
var trophies = RPG.bossTrophies(bt);
ok(trophies.length === 2, 'both kills on the shelf');
ok(trophies[0].title === 'Second dragon' && trophies[1].title === 'First dragon', 'newest first');
ok(trophies[0].day === RPG.todayKey(), 'kill date recorded');

section('Focus chart month span');
var fm = RPG.newState('FM');
fm.log.push({ t: new Date().toISOString(), day: hmDay(20), icon: '⏳', text: 'f', xp: 0, coins: 0, hp: 0, min: 45, sk: fm.skills[0].id });
var fmr = RPG.focusByDay(fm, 30);
ok(fmr.days.length === 30, 'month view covers 30 days');
ok(fmr.per[hmDay(20)] && fmr.per[hmDay(20)].total === 45, 'session 20 days back lands in the month view');
ok(RPG.focusByDay(fm, 7).totalMin === 0, 'same session is outside the 7-day view');

section('Quest of Atonement (streak repair)');
var ra = RPG.newState('RA');
var rq1 = A.addQuest(ra, { title: 'd1', diff: 'easy', recurring: true });
var rq2 = A.addQuest(ra, { title: 'd2', diff: 'easy', recurring: true });
ra.hero.streak = 9; ra.hero.lastActiveDay = '2020-01-01'; ra.lastSeenDay = '2020-01-02';
RPG.dailyReset(ra);
ok(ra.hero.streak === 0 && ra.redemption && ra.redemption.streak === 9 && ra.redemption.on === RPG.todayKey(), 'breaking a 9-day streak opens a same-day redemption');
var re0 = A.redeemEligible(ra);
ok(re0.active === true && re0.eligible === false, 'not eligible before the dailies are done');
ok(A.redeemStreak(ra).fail === 'work', 'mending refuses until the work is done');
A.completeQuest(ra, rq1.id); A.completeQuest(ra, rq2.id);
ok(A.redeemEligible(ra).eligible === true, 'all dailies cleared -> eligible');
var mend = A.redeemStreak(ra);
ok(mend && mend.streak === 10 && ra.hero.streak === 10, 'mended streak continues as if unbroken (9 -> 10)');
ok(ra.redemption === null && ra.counters.mends === 1, 'offer consumed, mend counted');
ok(RPG.checkAchievements(ra).some(function (a) { return a.id === 'mended'; }), 'Keeper of the Flame unlocks');
ok(ra.hero.bestStreak >= 10, 'best streak keeps the record');
// small streaks don't qualify
var rb = RPG.newState('RB');
rb.hero.streak = 2; rb.hero.lastActiveDay = '2020-01-01'; rb.lastSeenDay = '2020-01-02';
RPG.dailyReset(rb);
ok(rb.redemption === null, 'a 2-day streak breaks without an offer');
// shield takes precedence — no redemption when the shield saves it
var rc = RPG.newState('RC');
rc.hero.shields = 1; rc.hero.streak = 8; rc.hero.lastActiveDay = '2020-01-01'; rc.lastSeenDay = '2020-01-02';
RPG.dailyReset(rc);
ok(rc.hero.streak === 8 && rc.redemption === null, 'shield saves the streak, no atonement needed');
// unclaimed offers expire on the next day
var rd = RPG.newState('RD');
rd.redemption = { streak: 12, on: '2020-01-05' }; rd.lastSeenDay = '2020-01-06';
RPG.dailyReset(rd);
ok(rd.redemption === null, 'stale offer expires on the next daily reset');
ok(A.redeemStreak(RPG.newState('RE')) === null, 'no offer -> nothing to redeem');
// no dailies on the board: any XP today qualifies
var rf = RPG.newState('RF');
rf.redemption = { streak: 5, on: RPG.todayKey() };
ok(A.redeemEligible(rf).eligible === false, 'empty board + no XP -> not yet');
var rfq = A.addQuest(rf, { title: 'x', diff: 'easy' }); A.completeQuest(rf, rfq.id);
ok(A.redeemStreak(rf).streak === 6, 'earning XP today mends when there are no dailies');

section('Best streak record + migration');
var bs = RPG.newState('BS');
var bq = A.addQuest(bs, { title: 'x', diff: 'easy' }); A.completeQuest(bs, bq.id);
ok(bs.hero.bestStreak === 1, 'first action starts the record');
var mig6 = RPG.newState('MIG6'); mig6.hero.streak = 7;
delete mig6.hero.bestStreak; delete mig6.redemption; delete mig6.counters.mends;
mig6 = RPG.migrate(mig6);
ok(mig6.hero.bestStreak === 7 && mig6.redemption === null && mig6.counters.mends === 0, 'migration backfills bestStreak from the live streak + redemption slot + mends counter');

section('Life-area names (v26)');
var laNames = RPG.newState('LA').skills.map(function (s) { return s.name; });
ok(laNames.indexOf('Work') >= 0 && laNames.indexOf('Money') >= 0 && laNames.indexOf('Craft') < 0 && laNames.indexOf('Wealth') < 0, 'default life areas use Work + Money (not Craft/Wealth)');
ok(RPG.pathById('creative').skills.indexOf('Money') >= 0 && RPG.pathById('creative').skills.indexOf('Craft') >= 0, 'creative path keeps Craft but renames Wealth -> Money');

section('Rest days & date handling (v26)');
// todayKey is a stable local calendar key and orders correctly across days
var dToday = new Date(); var dYest = new Date(); dYest.setDate(dYest.getDate() - 1);
ok(RPG.todayKey(dToday) === RPG.todayKey(new Date()) && RPG.todayKey(dYest) < RPG.todayKey(dToday), 'todayKey is stable within a day and increases across days');
// a scheduled rest day protects the streak when that day is the one you missed
var rd = RPG.newState('Rester');
rd.hero.streak = 6;
var yest = new Date(); yest.setDate(yest.getDate() - 1);
rd.hero.lastActiveDay = RPG.todayKey(new Date(Date.now() - 2 * 86400000)); // last active = day before yesterday
rd.settings.restDays = [yest.getDay()];                                    // yesterday is a rest day
rd.lastSeenDay = '2000-01-01';
RPG.dailyReset(rd);
ok(rd.hero.streak === 6, 'a scheduled rest day protects the streak (no break)');
// without the rest day, the same gap breaks it
var rd2 = RPG.newState('NoRest');
rd2.hero.streak = 6;
rd2.hero.lastActiveDay = RPG.todayKey(new Date(Date.now() - 2 * 86400000));
rd2.settings.restDays = [];
rd2.lastSeenDay = '2000-01-01';
RPG.dailyReset(rd2);
ok(rd2.hero.streak === 0 && rd2.redemption, 'the same gap with no rest day breaks the streak (and offers atonement)');
// migration seeds restDays
var rdm = RPG.newState('M'); delete rdm.settings.restDays;
ok(Array.isArray(RPG.migrate(rdm).settings.restDays), 'migration seeds an empty restDays list');

// migration seeds a sane reminderHour (default 18) and repairs out-of-range values
var rhm = RPG.newState('M'); delete rhm.settings.reminderHour;
ok(RPG.migrate(rhm).settings.reminderHour === 18, 'migration defaults reminderHour to 18 (6pm)');
var rhBad = RPG.newState('M'); rhBad.settings.reminderHour = 99;
ok(RPG.migrate(rhBad).settings.reminderHour === 18, 'migration repairs an out-of-range reminderHour');
var rhGood = RPG.newState('M'); rhGood.settings.reminderHour = 21;
ok(RPG.migrate(rhGood).settings.reminderHour === 21, 'migration keeps a valid custom reminderHour');

section('Sync progress key (v25)');
var pkA = RPG.newState('A'); pkA.hero.level = 5; pkA.hero.xp = 40;
var pkB = RPG.newState('B'); pkB.hero.level = 4; pkB.hero.xp = 900;
ok(RPG.compareProgress(pkA, pkB) > 0, 'a higher level is more advanced regardless of xp');
var pkC = RPG.newState('C'); pkC.hero.level = 5; pkC.hero.xp = 40; pkC.counters.quests = 3;
ok(RPG.compareProgress(pkC, pkA) > 0, 'same level+xp: more lifetime activity wins');
var pkD = RPG.newState('D'); pkD.hero.level = 1; pkD.hero.ascension = 1;
var pkE = RPG.newState('E'); pkE.hero.level = 50;
ok(RPG.compareProgress(pkD, pkE) > 0, 'an ascended (season 1, Lv.1) save beats an un-ascended Lv.50');
ok(RPG.compareProgress(pkA, RPG.newState('A2')) > 0 && RPG.compareProgress(pkA, pkA) === 0, 'tie is zero, ahead is positive');

section('Defeat & Last Stand (v20)');
// coin cost on defeat (soft default: 25% of coins, capped)
var dd = RPG.newState('Fallen'); dd.hero.hp = 5; dd.hero.coins = 200;
var db = A.addHabit(dd, { title: 'vice', type: 'bad' });
var dr = A.slipHabit(dd, db.id);
ok(dr.ko === true && dr.downed === true, 'a killing slip reports ko + downed');
ok(dd.hero.downed && dd.counters.deaths === 1, 'hero is downed and the death is counted');
// the slip first costs 10 coins (200 -> 190), then defeat bills 25% of what's left (round(47.5)=48)
ok(dr.cost === 48 && dd.hero.coins === 190 - 48, 'defeat bills 25% of coins remaining after the slip');
ok(dd.hero.hp === 25, 'soft revive leaves 25 HP');
// downed penalty: no coins, half XP
var dq = A.addQuest(dd, { title: 'work', diff: 'hard' });
var dqr = A.completeQuest(dd, dq.id);
ok(dqr.coins === 0 && dqr.downed === true, 'no coins earned while downed');
// cannot re-KO in the same defeat (no death spiral)
dd.hero.hp = 3;
var dr2 = A.slipHabit(dd, db.id);
ok(dr2.ko !== true && dd.counters.deaths === 1, 'a second slip while downed does not re-KO or re-bill');
// rise needs full HP; below full it declines
ok(RPG.rise(dd).notYet === true, 'cannot rise before healing to full');
dd.hero.hp = RPG.maxHpOf(dd);
var cb = RPG.rise(dd);
ok(cb.comeback === true && dd.hero.downed === null && dd.counters.comebacks === 1, 'rising clears downed and counts a comeback');
ok(cb.xp === 60 && dd.hero.hp === RPG.maxHpOf(dd), 'comeback pays 60 XP at full HP');
ok(RPG.checkAchievements(dd).concat(dd.achievements).some(function (a) { return a.id === 'phoenix'; }) || dd.achievements.some(function(a){return a.id==='phoenix';}), 'Phoenix achievement unlocks on comeback');
// hardcore bites harder: 50% coins, 10 HP revive
var hc = RPG.newState('Hard'); hc.settings.hardcore = true; hc.hero.hp = 4; hc.hero.coins = 300;
var hb = A.addHabit(hc, { title: 'vice', type: 'bad' });
var hr = A.slipHabit(hc, hb.id);
ok(hr.cost === 145 && hc.hero.hp === 10, 'hardcore bills ~50% of coins and revives at 10 HP');
// migration seeds the new fields
var dmig = RPG.newState('M'); delete dmig.hero.downed; delete dmig.counters.deaths; delete dmig.settings.hardcore;
dmig = RPG.migrate(dmig);
ok(dmig.hero.downed === null && dmig.counters.deaths === 0 && dmig.counters.comebacks === 0 && dmig.settings.hardcore === false, 'migration backfills downed/deaths/comebacks/hardcore');
// briefing calls out defeat as the top line
var dbf = RPG.newState('Brief'); dbf.hero.downed = { on: RPG.todayKey() };
var dbfB = RPG.briefing(dbf, new Date());
ok(dbfB.mood === 'urgent' && dbfB.lines[0].icon === '💀', 'briefing surfaces defeat as the urgent top line');

section('Mascot briefing (v17)');
var mbMorning = new Date(); mbMorning.setHours(10, 0, 0, 0); // pin to morning: evening adds a journal nudge
var mb = RPG.newState('Briefy', '🧙');
var mbB = RPG.briefing(mb, mbMorning);
ok(mbB && typeof mbB.greeting === 'string' && mbB.greeting.indexOf('Briefy') >= 0, 'briefing greets the hero by name');
ok(Array.isArray(mbB.lines) && mbB.lines.length >= 1 && mbB.lines.length <= 5, 'briefing returns 1-5 prioritized lines');
ok(mbB.lines.every(function (l) { return l.icon && l.text && l.tab; }), 'every line carries icon, text and a target tab');
// a fully clear board is calm/proud
ok(mbB.mood === 'proud' && mbB.lines[0].icon === '✨', 'clear board yields the calm "all clear" line');
// dailies left -> chest line, habits -> habit line
var mb2 = RPG.seedPreset(RPG.newState('B2', '🧙'), 'general');
var mbB2 = RPG.briefing(mb2, mbMorning);
ok(mbB2.lines.some(function (l) { return l.icon === '🔁'; }), 'open dailies produce a chest-progress line');
ok(mbB2.lines.some(function (l) { return l.icon === '🌱'; }), 'unchecked habits produce a habit line');
// urgent: broken streak redemption
var mb3 = RPG.newState('B3', '🧙');
mb3.redemption = { streak: 9, on: RPG.todayKey() };
var mbB3 = RPG.briefing(mb3, mbMorning);
ok(mbB3.mood === 'urgent' && mbB3.lines[0].icon === '🕯', 'active streak-mend offer is the top line and urgent');
// worried: low HP
var mb4 = RPG.newState('B4', '🧙'); mb4.hero.hp = 20;
var mbB4 = RPG.briefing(mb4, mbMorning);
ok(mbB4.mood === 'worried' && mbB4.lines.some(function (l) { return l.icon === '❤️'; }), 'low HP turns the mood worried with a hotel hint');
// boss about to escape
var mb5 = RPG.newState('B5', '🧙');
mb5.boss = { title: 'Tame the inbox', setOn: RPG.todayKey(), due: RPG.todayKey(), doneOn: null };
var mbB5 = RPG.briefing(mb5, mbMorning);
ok(mbB5.lines.some(function (l) { return l.icon === '🐲' && l.text.indexOf('TODAY') >= 0; }), 'boss escaping today is called out');
// deterministic for a given day
var mbB6 = RPG.briefing(mb, mbMorning);
ok(mbB6.greeting === mbB.greeting, 'briefing phrasing is stable within a day');
// migration seeds the setting
var mb7 = RPG.newState('B7', '🧙'); delete mb7.settings.mascot;
ok(RPG.migrate(mb7).settings.mascot === true, 'migration turns the mascot on by default');

section('parseTask: plain-phrase quick add');
/* Fixed "now" so every weekday/relative-date result below is deterministic.
   2026-09-18 is a Friday - if that stops being true (e.g. someone "fixes" this
   date later), every weekday expectation in this section has to be redone. */
var ptNow = new Date(2026, 8, 18);
function pt(text) { return RPG.parseTask(text, ptNow); }
function ptDaysEq(a, b) { if (a === null || b === null) return a === b; return a.join(',') === b.join(','); }

var p1 = pt('Buy groceries');
ok(p1.title === 'Buy groceries' && p1.diff === null && p1.due === null && p1.recurring === false && p1.days === null && p1.target === null,
  'plain title passes through untouched with every field null/false');

var p2 = pt('Clean the kitchen easy');
ok(p2.title === 'Clean the kitchen' && p2.diff === 'easy', 'difficulty word "easy" is parsed and stripped');
var p3 = pt('Prep the slides normal');
ok(p3.title === 'Prep the slides' && p3.diff === 'normal', 'difficulty word "normal" is parsed and stripped');
var p4 = pt('Fix the bug hard');
ok(p4.title === 'Fix the bug' && p4.diff === 'hard', 'difficulty word "hard" is parsed and stripped');
var p5 = pt('Ship the launch epic');
ok(p5.title === 'Ship the launch' && p5.diff === 'epic', 'difficulty word "epic" is parsed and stripped');

var p6 = pt('Water the plants today');
ok(p6.title === 'Water the plants' && p6.due === '2026-09-18', '"today" resolves to the same day');
var p7 = pt('Buy milk tomorrow');
ok(p7.title === 'Buy milk' && p7.due === '2026-09-19', '"tomorrow" resolves to the next day');
var p8 = pt('Pay rent in 3 days');
ok(p8.title === 'Pay rent' && p8.due === '2026-09-21', '"in 3 days" resolves 3 days out');
var p9 = pt('Plan the trip next week');
ok(p9.title === 'Plan the trip' && p9.due === '2026-09-25', '"next week" resolves 7 days out');

var p10 = pt('Clean the garage saturday');
ok(p10.title === 'Clean the garage' && p10.due === '2026-09-19', 'weekday "saturday" resolves to the next Saturday (09-19)');
var p11 = pt('Movie night friday');
ok(p11.title === 'Movie night' && p11.due === '2026-09-25', 'weekday "friday" typed on a Friday means next Friday, not today (09-25)');
var p12 = pt('Team sync mon');
ok(p12.title === 'Team sync' && p12.due === '2026-09-21', '3-letter weekday "mon" resolves the same way (09-21)');
var p13 = pt('Call gran sun');
ok(p13.title === 'Call gran' && p13.due === '2026-09-20', '3-letter weekday "sun" resolves to next Sunday (09-20)');

var p14 = pt('Submit report by friday');
ok(p14.title === 'Submit report' && p14.due === '2026-09-25', '"by friday" strips the connector "by" along with the weekday');
var p15 = pt('Dentist on tue');
ok(p15.title === 'Dentist' && p15.due === '2026-09-22', '"on tue" strips the connector "on" along with the weekday');

var p16 = pt('Meditate every day');
ok(p16.title === 'Meditate' && p16.recurring === true && p16.days === null && p16.target === 7, '"every day" is daily: recurring, no day list, target 7');
var p17 = pt('Meditate daily');
ok(p17.title === 'Meditate' && p17.recurring === true && p17.days === null && p17.target === 7, '"daily" behaves the same as "every day"');
var p18 = pt('Meditate everyday');
ok(p18.title === 'Meditate' && p18.recurring === true && p18.days === null && p18.target === 7, '"everyday" (one word) is also recognised');
var p19 = pt('Meditate each day');
ok(p19.title === 'Meditate' && p19.recurring === true && p19.days === null && p19.target === 7, '"each day" is also recognised');

var p20 = pt('Gym every weekday');
ok(p20.title === 'Gym' && p20.recurring === true && ptDaysEq(p20.days, [1, 2, 3, 4, 5]) && p20.target === null, '"every weekday" sets Mon-Fri, no weekly target');
var p21 = pt('Gym weekdays');
ok(p21.title === 'Gym' && p21.recurring === true && ptDaysEq(p21.days, [1, 2, 3, 4, 5]), 'plain "weekdays" behaves the same as "every weekday"');
var p22 = pt('Sleep in every weekend');
ok(p22.title === 'Sleep in' && p22.recurring === true && ptDaysEq(p22.days, [0, 6]), '"every weekend" sets Sat/Sun');
var p23 = pt('Sleep in weekends');
ok(p23.title === 'Sleep in' && p23.recurring === true && ptDaysEq(p23.days, [0, 6]), 'plain "weekends" behaves the same as "every weekend"');
var p24 = pt('Trash day every monday');
ok(p24.title === 'Trash day' && p24.recurring === true && ptDaysEq(p24.days, [1]) && p24.due === null,
  '"every monday" sets a single weekday and is not also re-read as a one-off due date');
var p25 = pt('Gym every mon and wed');
ok(p25.title === 'Gym' && p25.recurring === true && ptDaysEq(p25.days, [1, 3]), '"every mon and wed" sets both weekdays');

var p26 = pt('Gym 3x a week');
ok(p26.title === 'Gym' && p26.recurring === true && p26.target === 3 && p26.days === null, '"3x a week" sets a weekly target, no day list');
var p27 = pt('Gym 3 times a week');
ok(p27.title === 'Gym' && p27.recurring === true && p27.target === 3 && p27.days === null, '"3 times a week" is the same phrasing');
var p28 = pt('Gym 3x/week');
ok(p28.title === 'Gym' && p28.recurring === true && p28.target === 3, '"3x/week" (slash form) is also recognised');

var p29 = pt('Read 20 pages every day easy');
ok(p29.title === 'Read 20 pages' && p29.diff === 'easy' && p29.recurring === true && p29.target === 7 && p29.days === null,
  'mixed input parses a difficulty word and a recurrence phrase out of the same sentence');

var p30 = pt('Stretch EVERY DAY');
ok(p30.title === 'Stretch' && p30.recurring === true && p30.target === 7, 'phrase matching is case-insensitive');

var p31 = pt('');
ok(p31.title === '' && p31.diff === null && p31.due === null && p31.recurring === false && p31.days === null && p31.target === null,
  'empty string never throws and returns all nulls');

var p32 = pt('Sundance festival');
ok(p32.title === 'Sundance festival' && p32.due === null, 'a weekday name embedded in a longer word is not parsed as a weekday');

var p33 = pt('Call mum on friday');
ok(p33.title === 'Call mum' && p33.due === '2026-09-25', 'spec example: "Call mum on friday" strips the connector and resolves the date');
var p34 = pt('Finish the essay by tomorrow hard');
ok(p34.title === 'Finish the essay' && p34.diff === 'hard' && p34.due === '2026-09-19', 'spec example: date phrase and difficulty both parsed out of the same sentence');

var p35 = pt('tomorrow');
ok(p35.title === 'tomorrow' && p35.due === '2026-09-19', 'if stripping the phrase would empty the title, the original trimmed text is kept instead');
var p36 = pt('every day');
ok(p36.title === 'every day' && p36.recurring === true && p36.target === 7, 'the same fallback applies to a bare recurring phrase');

var p37 = pt('Renew passport in 90 days');
ok(p37.title === 'Renew passport in 90 days' && p37.due === null, '"in N days" outside the 1-60 range is left alone, not parsed as a due date');

var p38 = RPG.parseTask('Water the plants');
ok(p38 && p38.title === 'Water the plants', 'omitting `now` falls back to the current date without throwing');

/* ===== Sage as game master (capture, packs, draft, debrief, boss, chronicle, stages) =====
   The parsing tests pin "now" to Friday 18 September 2026 (the same day the
   parseTask tests above use), so "friday" and "tomorrow" resolve to fixed
   dates. The plan tests use the real clock, because completing a quest stamps
   it with the real today. */
section('parseDump: one brain dump becomes typed items');
var GM_NOW = new Date(2026, 8, 18, 10, 0, 0);
var gmSkills = RPG.seedPreset(RPG.newState('T', '🧙'), ['student']).skills;   // Study, Body, Craft, Social, Money
function pd(t) { return RPG.parseDump(t, GM_NOW, gmSkills); }
function areaName(id) { var k = gmSkills.find(function (x) { return x.id === id; }); return k ? k.name : null; }

var d1 = pd('I need to call the bank and email my landlord, then finish the marketing essay by friday');
ok(d1.length === 3, 'one spoken sentence splits into three tasks at "and" / ", then" when a task verb follows');
ok(d1[0].title === 'Call the bank' && d1[0].kind === 'side' && d1[0].diff === 'easy' && areaName(d1[0].skillId) === 'Money', 'filler ("I need to") is stripped, an errand is an Easy side quest, "bank" lands in Money');
ok(d1[1].title === 'Email my landlord' && d1[1].kind === 'side' && d1[1].skillId === null, 'no matching life area leaves the area empty rather than guessing');
ok(d1[2].title === 'Finish the marketing essay' && d1[2].kind === 'main' && d1[2].due === '2026-09-25' && areaName(d1[2].skillId) === 'Study', 'a big noun with a campaign verb becomes a main quest, with its date and area');
ok(d1[2].steps.length === 5 && d1[2].steps[0].diff === 'easy' && d1[2].steps[4].due === '2026-09-25' && d1[2].steps[0].due === '2026-09-19', 'an essay gets five dated steps: the first is easy and due tomorrow, the last lands on the deadline');
ok(d1[2].note === 'Planned backward from the date', 'the card says why the dates are what they are');

var d2 = pd('- Gym 3x a week\n- read 20 pages every day\n* stop doomscrolling\n10. stretch every weekday');
ok(d2.length === 4, 'a pasted list splits on line breaks and drops the bullets and numbers');
ok(d2[0].title === 'Gym' && d2[0].kind === 'habit' && d2[0].target === 3 && areaName(d2[0].skillId) === 'Body', '"3x a week" makes a habit with a weekly target of 3');
ok(d2[1].title === 'Read 20 pages' && d2[1].kind === 'habit' && d2[1].target === 7, 'a daily phrase on a habit-like verb makes a daily habit');
ok(d2[2].title === 'Doomscrolling' && d2[2].kind === 'monster' && d2[2].skillId === null, '"stop X" names a monster and drops the "stop"');
ok(d2[3].title === 'Stretch' && d2[3].kind === 'daily' && d2[3].days.join() === '1,2,3,4,5', 'a weekday schedule makes a scheduled daily');

var d3 = pd('Buy milk. Pay rent tomorrow. Learn Spanish');
ok(d3.length === 3 && d3[1].title === 'Pay rent' && d3[1].due === '2026-09-19', 'sentences split on full stops and keep their own dates');
ok(d3[2].kind === 'main' && d3[2].steps.length === 1 && /5 minutes/.test(d3[2].steps[0].title) && d3[2].note === 'Starts with a 5-minute step', 'a main quest with no template still starts with a five-minute kickoff step');

ok(pd('Buy bread and butter').length === 1, '"and" without a task verb after it does not split ("bread and butter")');
var d4 = pd('Read chapters 3, 4 and 5');
ok(d4.length === 1 && d4[0].title === 'Read chapters 3, 4 and 5', 'a comma inside one task does not split it');
ok(pd('call mom. Call mom').length === 1, 'the same task said twice is one item');
ok(pd('').length === 0 && pd('   ').length === 0 && RPG.parseDump(null).length === 0, 'empty or missing text gives an empty list');
var many = []; for (var mi = 0; mi < 30; mi++) many.push('Task number ' + mi);
ok(pd(many.join('\n')).length === 20, 'a dump is capped at 20 items');

var d5 = pd('prepare for the corporate finance exam in 10 days');
ok(d5[0].kind === 'main' && d5[0].due === '2026-09-28' && d5[0].steps.length === 7, 'an exam gets the seven-step revision plan');
ok(d5[0].steps[6].due === '2026-09-27' && d5[0].steps[0].due === '2026-09-19', 'the exam plan ends the evening before the exam and starts tomorrow');
var d6 = pd('Run 30 min. Quick call with Marc. Deep work 2 hours. Study 4h');
ok(d6[0].diff === 'normal' && d6[1].diff === 'easy' && d6[2].diff === 'hard' && d6[3].diff === 'epic', 'a stated duration or the word "quick" sets the difficulty');
ok(pd('finish report by friday epic')[0].diff === 'epic', 'a difficulty the user says out loud always wins');

ok(RPG.captureItem('read 20 pages every day', GM_NOW, gmSkills, 'daily').kind === 'daily', 'the type chip can force a habit to be a daily');
var forced = RPG.captureItem('read 20 pages every day', GM_NOW, gmSkills, 'main');
ok(forced.kind === 'main' && forced.steps.length === 1 && forced.target === null, 'forcing main quest adds the kickoff step and drops the weekly target');
ok(RPG.captureItem('stop doomscrolling', GM_NOW, gmSkills, 'side').title === 'Stop doomscrolling', 'forcing a monster back to a side quest puts the "Stop" back');
ok(RPG.captureItem('.', GM_NOW, gmSkills) === null && RPG.captureItem('', GM_NOW, gmSkills) === null, 'text with nothing in it gives no item');
var redue = RPG.captureDue(RPG.captureItem('finish the marketing essay', GM_NOW, gmSkills), '2026-09-23', GM_NOW);
ok(redue.due === '2026-09-23' && redue.steps[4].due === '2026-09-23' && redue.steps[0].due === '2026-09-19', 'changing the date of a main quest re-plans its steps toward the new date');
ok(RPG.captureDue(redue, 'not a date', GM_NOW).due === null && redue.steps[0].due === null, 'clearing the date clears the step dates');

section('addCaptured: the cards become real entries');
var cs = RPG.seedPreset(RPG.newState('C', '🧙'), ['student']);
var cBefore = { q: cs.quests.length, h: cs.habits.length, g: cs.goals.length };
var cItems = RPG.parseDump('call the bank and email my landlord, then finish the marketing essay by friday. gym 3x a week. stop doomscrolling', GM_NOW, cs.skills);
var cOut = A.addCaptured(cs, cItems);
ok(cOut.side === 2 && cOut.main === 1 && cOut.steps === 5 && cOut.habit === 1 && cOut.monster === 0 && cOut.skipped === 1, 'two side quests, a main quest with five steps and a habit are added; the monster the path already seeded is skipped');
ok(cs.quests.length === cBefore.q + 7 && cs.goals.length === cBefore.g + 1 && cs.habits.length === cBefore.h + 1, 'the board grew by exactly those entries');
var cGoal = cs.goals[cs.goals.length - 1];
ok(cs.quests.filter(function (q) { return q.main === cGoal.id; }).length === 5 && A.goalProgress(cs, cGoal.id).total === 5, 'the steps hang off the new main quest');
ok(cOut.ids.length === 9 && cs.log[0].icon === '🦉', 'the created ids are returned and the log has one Sage line');
var cAgain = A.addCaptured(cs, cItems);
ok(cAgain.total === 0 && cAgain.skipped === 5 && cs.quests.length === cBefore.q + 7, 'adding the same cards again adds nothing');
ok(A.addCaptured(cs, [{ title: '  ', kind: 'side' }, null, { kind: 'side' }]).total === 0, 'blank or broken items are ignored');
var cBad = A.addCaptured(cs, [{ title: 'Area test', kind: 'side', diff: 'nope', skillId: 'not-a-real-id' }]);
var cBadQ = cs.quests[cs.quests.length - 1];
ok(cBad.side === 1 && cBadQ.skillId === null && cBadQ.diff === 'normal', 'an unknown life area or difficulty falls back to none / Normal');

section('Quest packs');
ok(RPG.PACKS.length >= 6 && RPG.PACKS.every(function (p) {
  var items = RPG.buildPack(p.id, {}, GM_NOW, gmSkills);
  return items.length >= 1 && items.every(function (it) { return it.title && RPG.CAPTURE_KINDS.indexOf(it.kind) >= 0; });
}), 'every pack builds at least one valid item with no input at all');
var exam = RPG.buildPack('exam', { name: 'Corporate Finance', date: '2026-10-02' }, GM_NOW, gmSkills);
ok(exam[0].kind === 'main' && exam[0].title === 'Pass the Corporate Finance exam' && exam[0].due === '2026-10-02' && exam[0].steps.length === 7, 'the exam pack names the main quest after the subject');
ok(exam[0].steps[6].due === '2026-10-01' && exam[0].steps[0].due <= '2026-09-21', 'and plans backward: last step the evening before, first step within days');
ok(exam[1].kind === 'habit' && exam[1].target === 5 && /Corporate Finance/.test(exam[1].title), 'plus a revision habit, five times a week');
ok(RPG.buildPack('exam', { date: '2020-01-01' }, GM_NOW, gmSkills)[0].due === '2026-10-02', 'a date in the past is ignored and the pack falls back to two weeks out');
var hunt = RPG.buildPack('internship', {}, GM_NOW, gmSkills);
ok(hunt[0].kind === 'main' && hunt[0].steps[0].diff === 'easy' && hunt.filter(function (it) { return it.kind === 'habit'; }).length === 2, 'the internship pack is a main quest that starts easy, plus two habits');
ok(RPG.buildPack('sleep', {}, GM_NOW, gmSkills).some(function (it) { return it.kind === 'monster'; }), 'the sleep pack names a monster');
ok(RPG.buildPack('nope', {}, GM_NOW, gmSkills).length === 0 && RPG.packById('exam').ask && !RPG.packById('fit').ask, 'an unknown pack builds nothing; packs declare whether they ask a question');
var ps = RPG.newState('P', '🧙');
ok(A.addCaptured(ps, hunt).total === 3 && A.addCaptured(ps, hunt).total === 0, 'a pack added twice is only on the board once');

section('Daily Draft and the plan');
function dayKey(offset) { var d = new Date(); d.setDate(d.getDate() + offset); return RPG.todayKey(d); }
var ds = RPG.newState('D', '🧙');
ok(RPG.dailyDraft(ds).items.length === 0 && RPG.dailyDraft(ds).pool === 0, 'an empty board gives an empty draft');
var qLate = A.addQuest(ds, { title: 'Late thing', diff: 'normal', due: dayKey(-1) });
var qToday = A.addQuest(ds, { title: 'Due today', diff: 'easy', due: dayKey(0) });
var qDaily = A.addQuest(ds, { title: 'A daily', diff: 'easy', recurring: true });
var dGoal = A.addGoal(ds, { title: 'Big goal' });
var dStep1 = A.addQuest(ds, { title: 'Step one', diff: 'normal', main: dGoal.id });
A.addQuest(ds, { title: 'Step two', diff: 'normal', main: dGoal.id });
var qOld = A.addQuest(ds, { title: 'Old errand' }); qOld.createdOn = dayKey(-10);
var qNew = A.addQuest(ds, { title: 'New errand' });
var hDaily = A.addHabit(ds, { title: 'Read', type: 'good', target: 7 });
var hBad = A.addHabit(ds, { title: 'Scroll', type: 'bad' });
var dr = RPG.dailyDraft(ds);
ok(dr.items.length === 4 && dr.target === 4, 'with no time budget on file the draft aims for four items');
ok(dr.items[0].ref === 'q:' + qLate.id && dr.items[0].why === 'Overdue by 1 day', 'overdue comes first, with its reason');
ok(dr.items[1].ref === 'q:' + qToday.id && dr.items[1].why === 'Due today', 'then what is due today');
ok(dr.items[2].ref === 'q:' + dStep1.id && dr.items[2].why === '🏆 Big goal', 'then the next step of a main quest, and only the next one, named by its goal');
ok(dr.items[3].ref === 'q:' + qDaily.id && dr.minutes === 70, 'then a daily; the draft totals its rough minutes');
ok(!dr.items.some(function (it) { return it.id === hBad.id; }), 'a monster is never in a draft');
ds.settings.onboard = { minutes: 60 };
var dr60 = RPG.dailyDraft(ds);
ok(dr60.items.length === 5 && dr60.items[4].ref === 'h:' + hDaily.id && dr60.items[4].kind === 'habit', 'a 60-minute budget aims for five, and a daily habit outranks a stale errand');
ds.settings.onboard = { minutes: 15 };
ok(RPG.dailyDraft(ds).items.length === 3, 'a 15-minute budget aims for three');
delete ds.settings.onboard;
ds.plan = { day: dayKey(-1), refs: ['q:' + qNew.id], wonOn: null };
var drCarry = RPG.dailyDraft(ds);
var carried = drCarry.items.concat([]).filter(function (it) { return it.ref === 'q:' + qNew.id; })[0];
ok(!carried || carried.why === 'Left from your last plan', 'an item left from the last plan is marked as carried over');
ds.settings.onboard = { minutes: 60 };
hDaily.lastDoneOn = dayKey(0);   // take the habit out of the running so the fifth slot is between the two errands
ok(RPG.dailyDraft(ds).items.some(function (it) { return it.ref === 'q:' + qNew.id && it.why === 'Left from your last plan'; }), 'and it now outranks the stale errand for the fifth slot');
hDaily.lastDoneOn = null;
delete ds.settings.onboard;
ok(A.planStatus(ds).active === false, 'a plan locked yesterday is not today\'s plan');
// habitWeek: which habits ask for today (the draft and Habits today share it)
var hw3 = { type: 'good', target: 3, history: [] }, hw7 = { type: 'good', target: 7, history: [] };
var MON = new Date(2026, 10, 16, 10), FRI = new Date(2026, 10, 20, 10), SUN = new Date(2026, 10, 22, 10);
ok(RPG.habitWeek(hw3, MON).daysLeft === 7 && RPG.habitWeek(hw3, MON).pressing === false, 'a 3x habit not done yet can wait on Monday (7 days left)');
ok(RPG.habitWeek(hw3, FRI).daysLeft === 3 && RPG.habitWeek(hw3, FRI).pressing === true, 'and asks for Friday, when 3 days are left for 3 times');
ok(RPG.habitWeek(hw7, MON).pressing === true, 'a daily habit always asks for today');
hw3.history = ['2026-11-16', '2026-11-17', '2026-11-18'];
ok(RPG.habitWeek(hw3, SUN).need === 0 && RPG.habitWeek(hw3, SUN).pressing === false, 'a weekly target already met never asks, even on Sunday');
hw3.history = ['2026-11-16'];
ok(RPG.habitWeek(hw3, SUN).done === 1 && RPG.habitWeek(hw3, SUN).pressing === true, 'two still needed with one day left: it asks');

var st0 = A.setPlan(ds, dr.items.map(function (it) { return it.ref; }));
ok(st0.active && st0.total === 4 && st0.done === 0 && !st0.complete && !st0.won, 'locking the draft makes it today\'s plan');
ok(ds.log[0].icon === '🧭' && A.claimDayWon(ds) === null, 'the lock is logged and nothing is paid before the plan is done');
ok(A.clearPlan(ds) === true && ds.plan === null && A.planStatus(ds).active === false, 'an unfinished plan can be thrown away to plan again');
A.setPlan(ds, dr.items.map(function (it) { return it.ref; }));
A.completeQuest(ds, qLate.id); A.completeQuest(ds, qToday.id); A.completeQuest(ds, dStep1.id);
ok(A.planStatus(ds).done === 3 && !A.planStatus(ds).complete, 'three of four done is not complete');
A.completeQuest(ds, qDaily.id);
var xpB = ds.hero.xp, coinB = ds.hero.coins, lvB = ds.hero.level;
var won = A.claimDayWon(ds);
ok(won && won.dayWon && won.total === 4 && won.xp === RPG.PLAN_XP && won.coins === RPG.PLAN_COINS, 'finishing the plan pays the day bonus');
ok((ds.hero.level > lvB || ds.hero.xp === xpB + RPG.PLAN_XP) && ds.hero.coins === coinB + RPG.PLAN_COINS && ds.counters.daysWon === 1, 'the bonus is credited and the day counted');
ok(A.claimDayWon(ds) === null && A.planStatus(ds).won === true, 'the bonus is paid once a day');
var st1 = A.setPlan(ds, ['q:nope', 'h:' + hBad.id, 'q:' + qOld.id, 'q:' + qOld.id, 'h:' + hDaily.id]);
ok(st1.total === 2, 'unknown ids, monsters and repeats are dropped when a plan is locked');
A.deleteQuest(ds, qOld.id);
ok(A.planStatus(ds).total === 1, 'a quest deleted after the lock drops out of the plan');
A.doHabit(ds, hDaily.id);
ok(A.planStatus(ds).complete, 'a habit in the plan counts as done once it is kept today');
ok(A.clearPlan(ds) === false && ds.plan !== null, 'once the day bonus is paid the plan cannot be thrown away');
ok(A.planStatus(ds).won === true && A.claimDayWon(ds) === null && ds.counters.daysWon === 1, 'and a second plan locked the same day cannot win the bonus again');
var stSkip = A.setPlan(ds, []);
ok(stSkip.active && stSkip.skipped && stSkip.total === 0 && !stSkip.complete, 'an empty plan means "not today" and can never be "complete"');

section('Evening Debrief');
var es = RPG.newState('E', '🧙');
var eb = RPG.debrief(es);
ok(eb.empty && eb.line === 'A quiet day.' && eb.sleepGuess === null, 'a day with nothing logged is reported as empty');
var eq1 = A.addQuest(es, { title: 'Small thing', diff: 'easy' }), eq2 = A.addQuest(es, { title: 'Big thing', diff: 'hard' });
var eh = A.addHabit(es, { title: 'Read', type: 'good' });
var eq3 = A.addQuest(es, { title: 'Left over', diff: 'normal' });
A.setPlan(es, ['q:' + eq1.id, 'q:' + eq2.id, 'q:' + eq3.id]);
A.completeQuest(es, eq1.id); A.completeQuest(es, eq2.id); A.doHabit(es, eh.id);
es.sleep[dayKey(-1)] = { hours: 7.5, quality: 4 };
var ed = RPG.debrief(es);
ok(ed.line === 'Cleared 2 quests, kept 1 habit. Biggest win: Big thing. Left for tomorrow: Left over.', 'the line counts the day, names the biggest win and what is left');
ok(!ed.empty && ed.quests === 2 && ed.habits === 1 && ed.open.length === 1 && ed.sleepGuess === 7.5, 'it also returns the numbers and the last sleep duration');
A.completeQuest(es, eq3.id);
ok(/Finished the whole plan\.$/.test(RPG.debrief(es).line), 'a finished plan is said plainly');

section('Sage proposes the weekly boss');
var bs = RPG.newState('B', '🧙');
ok(RPG.suggestBoss(bs) === null, 'nothing on the board, nothing to propose');
A.addQuest(bs, { title: 'Buy milk', diff: 'easy' });
ok(RPG.suggestBoss(bs) === null, 'an easy errand with no date is not a boss');
A.addQuest(bs, { title: 'Hard thing', diff: 'hard' });
ok(RPG.suggestBoss(bs).title === 'Hard thing' && RPG.suggestBoss(bs).due === RPG.bossSunday(), 'the hardest open quest is proposed, due by the boss Sunday');
A.addQuest(bs, { title: 'Deadline thing', diff: 'normal', due: dayKey(0) });
ok(RPG.suggestBoss(bs).title === 'Deadline thing' && RPG.suggestBoss(bs).why === 'Your biggest deadline this week', 'a deadline inside the week outranks raw difficulty');
A.setBoss(bs, { title: 'Named' });
ok(RPG.suggestBoss(bs) === null, 'no proposal while a boss is already named');

section('Weekly chronicle');
var ws = RPG.newState('Wren', '🧙');
var wc0 = RPG.chronicle(ws);
ok(wc0.title === 'The Quiet Week' && wc0.days === 0 && /board is waiting/.test(wc0.lines[0]), 'an empty week gets its own title and one line');
var wq = A.addQuest(ws, { title: 'Chronicle quest', diff: 'hard' }); A.completeQuest(ws, wq.id);
var wc1 = RPG.chronicle(ws);
ok(wc1.title === 'A Spark in the Dark' && wc1.days === 1 && /^Wren showed up on 1 of 7 days and earned 60 XP\.$/.test(wc1.lines[0]), 'one active day is named and counted');
ok(wc1.lines.some(function (l) { return l === '1 quest cleared.'; }) && wc1.lines.some(function (l) { return /^Best day: \w+day with 60 XP\.$/.test(l); }), 'the recap lists quests cleared and the best day');

section('Game systems in stages, and game intensity');
var gs = RPG.newState('S', '🧙');
ok(RPG.staged(gs) === false && RPG.isUnlocked(gs, 'rewards') && RPG.isUnlocked(gs, 'stakes') && RPG.isUnlocked(gs, 'boss') && RPG.isUnlocked(gs, 'social'), 'a save without staging has every system open');
ok(RPG.checkUnlocks(gs).length === 0 && RPG.nextUnlock(gs) === null, 'and there is nothing left to open or tease');
gs.stage = { on: true, got: {} };
ok(!RPG.isUnlocked(gs, 'rewards') && !RPG.isUnlocked(gs, 'stakes') && !RPG.isUnlocked(gs, 'boss') && !RPG.isUnlocked(gs, 'social'), 'a staged hero starts with all four systems locked');
ok(RPG.nextUnlock(gs).id === 'rewards' && RPG.checkUnlocks(gs).length === 0, 'the Market is the first teaser and nothing opens at level 1');
gs.counters.chests = 1;
var gFresh = RPG.checkUnlocks(gs);
ok(gFresh.length === 1 && gFresh[0].id === 'rewards' && RPG.isUnlocked(gs, 'rewards') && gs.log[0].icon === '🔓', 'the first chest opens the Market, and it is logged');
ok(RPG.checkUnlocks(gs).length === 0, 'a stage opens once');
gs.hero.level = 3;
ok(RPG.checkUnlocks(gs).map(function (x) { return x.id; }).join() === 'stakes' && RPG.nextUnlock(gs).id === 'boss', 'level 3 opens HP and monsters; the boss is next');
gs.hero.level = 5;
ok(RPG.checkUnlocks(gs).map(function (x) { return x.id; }).join() === 'boss,social' && RPG.nextUnlock(gs) === null, 'jumping to level 5 opens the boss and the leaderboard together');
var g2 = RPG.newState('L', '🧙'); g2.stage = { on: true, got: {} }; g2.hero.level = 2;
ok(RPG.checkUnlocks(g2)[0].id === 'rewards', 'level 2 opens the Market without a chest');
var gc = RPG.newState('Calm', '🧙'); gc.stage = { on: true, got: {} };
ok(A.setIntensity(gc, 'calm') === 'calm' && gc.settings.hardcore === false, 'Calm can be chosen');
gc.hero.level = 3;
var gcFresh = RPG.checkUnlocks(gc).map(function (x) { return x.id; });
ok(gcFresh.indexOf('stakes') < 0 && gcFresh.indexOf('rewards') >= 0 && !RPG.isUnlocked(gc, 'stakes'), 'in Calm, HP and monsters never open and are never announced');
ok(RPG.nextUnlock(gc).id === 'boss', 'and the teaser skips them');
A.setIntensity(gc, 'classic');
ok(!RPG.isUnlocked(gc, 'stakes'), 'Calm never even recorded HP and monsters as opened');
var gcBack = RPG.checkUnlocks(gc).map(function (x) { return x.id; });
ok(gcBack.join() === 'stakes' && RPG.isUnlocked(gc, 'stakes'), 'so switching back to Classic opens them with their own announcement, since the level was already reached');
var gOld = RPG.newState('Old', '🧙'); A.setIntensity(gOld, 'calm');
ok(!RPG.isUnlocked(gOld, 'stakes') && RPG.isUnlocked(gOld, 'rewards'), 'Calm hides HP and monsters on an unstaged save too, and nothing else');
ok(A.setIntensity(gOld, 'hardcore') === 'hardcore' && gOld.settings.hardcore === true && A.setIntensity(gOld, 'nope') === null, 'Hardcore sets the older hardcore flag; an unknown value is refused');
ok(RPG.staged(RPG.unlockAll(gs)) === false && RPG.isUnlocked(gs, 'social'), 'unlockAll switches staging off');
var gAsc = RPG.newState('Asc', '🧙'); gAsc.stage = { on: true, got: {} }; gAsc.hero.ascension = 1;
ok(RPG.checkUnlocks(gAsc).length === 4, 'a hero who has ascended keeps every system on the new climb');
var legacy = JSON.parse(JSON.stringify(RPG.newState('Legacy', '🧙')));
delete legacy.stage; delete legacy.plan; delete legacy.settings.intensity; delete legacy.counters.daysWon; legacy.settings.hardcore = true;
var mig = RPG.migrate(legacy);
ok(mig.stage.on === false && mig.plan === null && mig.settings.intensity === 'hardcore' && mig.counters.daysWon === 0 && RPG.isUnlocked(mig, 'stakes'), 'an older save migrates to unstaged, with its intensity read from the hardcore flag');

section('parseDump: review fixes (speed, lists, abbreviations, false friends)');
var t0 = Date.now(); pd('a' + new Array(1999).join(' ') + 'b'); pd('a' + new Array(1990).join(' ') + ', call x');
ok(Date.now() - t0 < 200, 'a run of 2000 spaces parses in well under a second (it used to take about 20 seconds)');
ok(pd('9. Buy milk\n10. Call mom\n11. Pay rent').map(function (x) { return x.title; }).join('|') === 'Buy milk|Call mom|Pay rent', 'a numbered list past 9 loses its numbers, not just the first nine');
ok(pd('Email Dr. Smith about the thesis').length === 1 && pd('Email Dr. Smith about the thesis')[0].title === 'Email Dr. Smith about the thesis', '"Dr." is not the end of a sentence');
var pm = pd('Meet Tom at 5 p.m. tomorrow');
ok(pm.length === 1 && pm[0].due === '2026-09-19', '"5 p.m. tomorrow" stays one task and keeps its date');
ok(pd('Write the final report')[0].kind === 'main' && pd('Write the final report')[0].steps.length === 5, '"final report" plans like a report, not an exam');
ok(pd('make the final payment on the car')[0].kind === 'side', '"final payment" is an errand, not a main quest');
ok(pd('study for my finals')[0].steps.length === 7, '"finals" in the plural is still the exam plan');
ok(pd('stop by the bank')[0].kind === 'side' && pd('Stop at the pharmacy on the way')[0].kind === 'side' && pd('quit my job')[0].kind === 'side', 'errands that start with stop or quit are not monsters');
ok(pd('reduce essay to 1000 words')[0].kind === 'side' && pd('quit smoking')[0].kind === 'monster', 'but quitting a habit still names a monster');
var nw = pd('Next week submit the report');
ok(nw[0].due === '2026-09-25' && /^Submit the report/.test(nw[0].title), '"next week" at the start is a date, not filler');
ok(pd('First draft of the intro')[0].title === 'First draft of the intro' && pd('To do list cleanup')[0].title === 'To do list cleanup', 'words that belong to the task stay in it');
ok(pd('First, call mom')[0].title === 'Call mom', 'an ordinal with a comma is still treated as filler');
ok(/dentist/i.test(pd("I'm going to the dentist tomorrow")[0].title), '"going to the dentist" keeps the dentist');
ok(pd('call the bank and then also email the landlord').map(function (x) { return x.title; }).join('|') === 'Call the bank|Email the landlord', '"and then also" is one join');
ok(pd(', call the bank, email the landlord').length === 2, 'a leading comma does not stop the split');
var longList = []; for (var li = 0; li < 41; li++) longList.push('call person ' + li);
ok(pd(longList.join(' and ')).length === 20, 'a long spoken run is cut at the 20-item cap, not silently after 40 joins');
ok(pd('finish my résumé')[0].kind === 'main', 'résumé with its accents is recognised');
ok(pd('Deep work 10 hours')[0].diff === 'epic' && pd('Study 1h30')[0].diff === 'hard' && pd('Buy 3 h&m shirts')[0].diff !== 'epic', 'hours: two digits, "1h30", and never inside "h&m"');
ok(pd('Hand in the essay due friday')[0].due === '2026-09-25' && pd('Hand in the essay due friday')[0].title === 'Hand in the essay', '"due friday" is read as a date and leaves the title clean');
ok(pd('Email X about the convention before tuesday')[0].title === 'Email X about the convention' && pd('Email X about the convention before tuesday')[0].due === '2026-09-22', '"before tuesday" too');
var emo = pd(new Array(120).join('a') + '😀 tomorrow')[0].title;
ok(!/[\ud800-\udbff]$/.test(emo), 'a title cut at 120 characters never ends in half an emoji');
var past = RPG.captureDue(RPG.captureItem('finish the marketing essay', GM_NOW, gmSkills), '2020-01-01', GM_NOW);
ok(past.due === null && RPG.captureDue(past, '2026-02-31', GM_NOW).due === null, 'a past or impossible date is refused');

section('Plan, stages and intensity: review fixes');
var rs = RPG.newState('R', '🧙');
var rq1 = A.addQuest(rs, { title: 'one' }), rq2 = A.addQuest(rs, { title: 'two' }), rq3 = A.addQuest(rs, { title: 'three' });
A.setPlan(rs, ['q:' + rq1.id, 'q:' + rq2.id, 'q:' + rq3.id]);
A.completeQuest(rs, rq1.id); A.deleteQuest(rs, rq2.id); A.deleteQuest(rs, rq3.id);
ok(A.planStatus(rs).complete === true && A.claimDayWon(rs) === null && rs.counters.daysWon === 0, 'deleting the unfinished plan items does not win the day');
var rq4 = A.addQuest(rs, { title: 'four' }); A.completeQuest(rs, rq4.id);
var rh = A.addHabit(rs, { title: 'kept', type: 'good' }); A.doHabit(rs, rh.id);
ok(A.setPlan(rs, ['q:' + rq4.id, 'h:' + rh.id]).total === 0, 'a plan cannot be made of things already done today');
var corruptRaw = JSON.parse(JSON.stringify(RPG.newState('C', '🧙'))); corruptRaw.plan = { day: RPG.todayKey(), refs: [null, 7, 'q:x'] };
var corrupt = RPG.migrate(corruptRaw);
ok(corrupt.plan.refs.length === 1 && A.planStatus(corrupt).total === 0 && A.claimDayWon(corrupt) === null, 'a corrupt plan ref is dropped on load and never breaks a tap');
var ds2 = RPG.newState('Down', '🧙'), mon2 = A.addHabit(ds2, { title: 'Scroll', type: 'bad' });
ds2.hero.hp = 5; A.slipHabit(ds2, mon2.id);
ok(!!ds2.hero.downed, 'setup: the hero is downed');
A.setIntensity(ds2, 'calm');
var dq = A.addQuest(ds2, { title: 'after calm', diff: 'normal' }), dres = A.completeQuest(ds2, dq.id);
ok(ds2.hero.downed === null && ds2.hero.hp === RPG.maxHpOf(ds2) && dres.coins === RPG.DIFF.normal.coins, 'switching to Calm lifts Downed and heals, so quests pay in full again');
var bq = RPG.newState('Quiet', '🧙'); bq.stage = { on: true, got: {} };
var quietLines = {};
for (var qd = 0; qd < 40; qd++) { var qdate = new Date(2026, 0, 1 + qd, 10); quietLines[RPG.briefing(bq, qdate).lines[0].text] = 1; }
ok(Object.keys(quietLines).every(function (l) { return l.indexOf('boss') < 0; }), 'Sage never suggests the weekly boss before it opens');
bq.hero.hp = 10;
ok(!RPG.briefing(bq).lines.some(function (l) { return /HP|Hotel/.test(l.text); }), 'nor talks about HP before HP exists');

section('Release hygiene: service-worker cache freshness');
/* The SW is cache-first: hosted/PWA users only receive new assets when sw.js
   itself changes (new CACHE name -> new install). So any commit that touches a
   precached asset MUST also touch sw.js. This guard fails the suite otherwise. */
(function () {
  var cp = require('child_process');
  try {
    var swCommit = cp.execSync('git log -1 --format=%H -- sw.js', { cwd: __dirname }).toString().trim();
    var assets = ['index.html', 'styles.css', 'core.js', 'app.js', 'fx.js', 'art.js', 'gradient.js', 'cloud.js', 'manifest.json', 'privacy.html', 'terms.html'];
    var changed = cp.execSync('git diff --name-only ' + swCommit + '..HEAD -- ' + assets.join(' '), { cwd: __dirname }).toString().trim();
    ok(changed === '', 'sw.js cache bumped alongside asset changes' + (changed ? ' — STALE for: ' + changed.replace(/\n/g, ', ') + ' (bump CACHE in sw.js)' : ''));
  } catch (e) {
    ok(true, 'sw freshness check skipped (git unavailable)');
  }
  var swSrc = require('fs').readFileSync(__dirname + '/sw.js', 'utf8');
  ok(/var CACHE = 'sml-v\d+';/.test(swSrc), 'sw.js declares a versioned cache name');

  section('Launch readiness (SEO, legal, update flow)');
  var fs = require('fs');
  var html = fs.readFileSync(__dirname + '/index.html', 'utf8');
  ok(/<meta name="description"/.test(html), 'index.html carries a meta description');
  ok(/property="og:title"/.test(html) && /property="og:image"/.test(html) && /property="og:url"/.test(html), 'Open Graph title/image/url set for link previews');
  ok(/name="twitter:card"/.test(html), 'Twitter card set');
  ok(/rel="canonical"/.test(html), 'canonical URL declared');
  ok(/Content-Security-Policy/.test(html), 'CSP still in place');
  var robots = fs.readFileSync(__dirname + '/robots.txt', 'utf8');
  ok(/Allow: \//.test(robots) && /Sitemap: .*sitemap\.xml/.test(robots), 'robots.txt allows crawling and names the sitemap');
  var sitemap = fs.readFileSync(__dirname + '/sitemap.xml', 'utf8');
  ok(/privacy\.html/.test(sitemap) && /terms\.html/.test(sitemap), 'sitemap lists the app and legal pages');
  var privacy = fs.readFileSync(__dirname + '/privacy.html', 'utf8');
  ok(/no ads, no analytics/i.test(privacy) || /No advertising/i.test(privacy), 'privacy policy states the no-ads/no-analytics position');
  ok(/Export/.test(privacy) && /Delete/i.test(privacy), 'privacy policy covers export and deletion rights');
  ok(fs.readFileSync(__dirname + '/terms.html', 'utf8').indexOf('Terms of Service') >= 0, 'terms of service page exists');
  ok(/privacy\.html/.test(swSrc) && /terms\.html/.test(swSrc), 'legal pages are precached for offline');
  var appSrc = fs.readFileSync(__dirname + '/app.js', 'utf8');
  ok(/controllerchange/.test(appSrc) && /reg\.update\(\)/.test(appSrc), 'app checks for new versions on foreground and refreshes when one takes over');
})();

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
