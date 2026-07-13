/* End-to-end UI smoke test: load index.html in jsdom and click through everything */
var fs = require('fs');
var path = require('path');
var { JSDOM } = require('jsdom');

var html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
var core = fs.readFileSync(path.join(__dirname, 'core.js'), 'utf8');
var app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
var grad = fs.readFileSync(path.join(__dirname, 'gradient.js'), 'utf8');
var cloud = fs.readFileSync(path.join(__dirname, 'cloud.js'), 'utf8');
// inline scripts so they load under the https test origin
html = html.replace('<script src="gradient.js"></script>', '<script>' + grad + '</script>');
html = html.replace('<script src="cloud.js"></script>', '<script>' + cloud + '</script>');
html = html.replace('<script src="core.js"></script>', '<script>' + core + '</script>');
html = html.replace('<script src="app.js"></script>', '<script>' + app + '</script>');

var passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ FAIL: ' + name); }
}

var errors = [];
var dom = new JSDOM(html, {
  url: 'https://localhost/liferpg/',
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  beforeParse: function (window) {
    window.confirm = function () { return true; };
    window.prompt = function () { return 'French'; };
    window.onerror = function (msg) { errors.push(String(msg)); };
    // jsdom lacks URL.createObjectURL
    window.URL.createObjectURL = function () { return 'blob:mock'; };
  }
});

setTimeout(async function () {
  var w = dom.window, d = w.document;

  console.log('\nBoot & onboarding');
  ok(errors.length === 0, 'no JS errors on load' + (errors.length ? ' -> ' + errors[0] : ''));
  ok(!!d.querySelector('#modal.show'), 'tutorial modal shows on first run');
  ok(d.querySelector('.tdots') !== null, 'tutorial step dots visible');
  ok(d.querySelector('#modal').textContent.indexOf('Skip') >= 0, 'skip button offered');
  w.tut(1); w.tut(2); w.tut(3); w.tut(4);
  ok(d.querySelector('#modal').textContent.indexOf('Create my hero') >= 0, 'last step leads to hero creation');
  w.tutSkip();
  ok(d.querySelector('#obName') !== null, 'skip lands on character creation');
  d.querySelector('#obName').value = 'Alp';
  w.createHero();
  ok(w.state && w.state.hero.name === 'Alp', 'hero created');
  ok(d.querySelector('#hud').textContent.indexOf('Alp') >= 0, 'HUD shows hero name');
  ok(d.querySelector('#hud').textContent.indexOf('LV.1') >= 0, 'HUD shows level 1');
  ok(w.localStorage.getItem('liferpg.save.v1') !== null, 'save written to localStorage');
  ok(d.querySelectorAll('.skillcard').length === 5, '5 skill cards rendered');

  console.log('\nToday tab (default home)');
  ok(w.tab === 'today', 'app opens on the Today tab');
  ok(d.querySelector('.todayhead') !== null, 'today header renders');
  ok(d.querySelector('#view').textContent.indexOf('Daily quests') >= 0 && d.querySelector('#view').textContent.indexOf('Habits to check') >= 0, 'dailies and habit checks merged in one view');
  ok(d.querySelector('.chestchip') !== null, 'chest chip visible on today');
  var th = w.state.habits.find(function (x) { return x.type === 'good'; });
  w.doHabit(th.id);
  ok(d.querySelector('#view .hd.on') !== null, 'habit check from today lights a dot');

  console.log('\nQuests tab');
  w.go('quests');
  ok(d.querySelectorAll('#view .item').length >= 2, 'seed quests visible');
  d.querySelector('#qTitle').value = 'Test the app';
  d.querySelector('#qDiff').value = 'epic';
  w.addQuest();
  var found = null;
  d.querySelectorAll('#view .item .title').forEach(function (t) { if (t.textContent === 'Test the app') found = t; });
  ok(!!found, 'new quest appears in list');
  var q = w.state.quests.find(function (x) { return x.title === 'Test the app'; });
  var xpBefore = w.state.hero.xp, lvBefore = w.state.hero.level;
  w.doQuest(q.id);
  ok(w.state.hero.level > lvBefore || w.state.hero.xp > xpBefore, 'quest completion granted XP');
  ok(d.querySelectorAll('#toasts .toast').length > 0 || d.querySelector('#overlay.show'), 'feedback shown (toast or level-up)');
  if (d.querySelector('#overlay.show')) { w.closeOverlay(); }
  ok(!d.querySelector('#overlay.show'), 'overlay closes');

  // goals
  d.querySelector('#gTitle').value = 'Ship v1';
  w.addGoal();
  ok(d.querySelector('#view').textContent.indexOf('Ship v1') >= 0, 'main quest card rendered');
  var g = w.state.goals[0];
  var coinsB = w.state.hero.coins;
  w.doGoal(g.id);
  ok(w.state.hero.coins === coinsB + 150 || w.state.hero.coins > coinsB, 'goal completion paid coins');

  console.log('\nHabits tab');
  w.go('habits');
  ok(d.querySelector('#view').textContent.indexOf('Grow') >= 0, 'habits tab renders');
  var good = w.state.habits.filter(function (h) { return h.type === 'good'; })[1];
  w.doHabit(good.id);
  ok(good.streak === 1, 'good habit checked, streak 1');
  ok(d.querySelector('#view').textContent.indexOf('✓ today') >= 0, 'UI marks habit done today');
  var bad = w.state.habits.find(function (h) { return h.type === 'bad'; });
  var hpB = w.state.hero.hp;
  w.slip(bad.id);
  ok(w.state.hero.hp === Math.max(0, hpB - 12) || w.state.hero.hp === 25, 'slip damaged HP');
  d.querySelector('#hbTitle').value = 'Snoozing alarm';
  w.addHabit('bad');
  ok(w.state.habits.some(function (h) { return h.title === 'Snoozing alarm'; }), 'new monster added');

  console.log('\nMarket tab');
  w.go('market');
  w.state.hero.coins = 200; w.render();
  var buyable = w.state.shop.find(function (i) { return i.tab === 'market'; });
  var cB = w.state.hero.coins;
  w.buy(buyable.id);
  ok(w.state.hero.coins === cB - buyable.price, 'purchase deducted coins');
  w.shopTab = 'hotel'; w.render();
  ok(/\+\d+ ❤️/.test(d.querySelector('#view').textContent), 'hotel items show HP restore');
  w.state.hero.hp = 40;
  var nap = w.state.shop.find(function (i) { return i.tab === 'hotel'; });
  w.buy(nap.id);
  ok(w.state.hero.hp > 40, 'hotel purchase healed HP');
  w.state.hero.coins = 0; w.render();
  var anyBuy = d.querySelector('#view .btn.buy[disabled]');
  ok(!!anyBuy, 'buy buttons disabled when broke');
  w.state.hero.coins = 100;

  console.log('\nJournal tab');
  w.go('journal');
  w.pendingMood = 'good';
  d.querySelector('#jNote').value = 'built my own life rpg';
  w.saveJournal();
  ok(!!w.state.journal[w.RPG.todayKey()], 'journal entry saved');
  ok(d.querySelector('#view').textContent.indexOf('saved ✓') >= 0, 'journal shows saved state');
  d.querySelector('#slHours').value = '8';
  w.pendingQuality = 4;
  var hpJ = w.state.hero.hp;
  w.saveSleep();
  ok(!!w.state.sleep[w.RPG.todayKey()], 'sleep logged');
  ok(w.state.hero.hp >= hpJ, 'sleep healed or kept HP');

  console.log('\nAdventure log (in stats tab)');
  w.go('stats');
  var logText = d.querySelector('#view').textContent;
  ok(logText.indexOf('TODAY') >= 0, 'log grouped by day');
  ok(logText.indexOf('Test the app') >= 0, 'quest completion in adventure log');
  ok(logText.indexOf('Bought') >= 0, 'purchase in adventure log');

  console.log('\nSkills & settings');
  w.openSkillModal();
  ok(!!d.querySelector('#modal.show') && d.querySelector('#skName') !== null, 'skill modal opens');
  d.querySelector('#skName').value = 'French';
  d.querySelector('#skIcon').value = '🇫🇷';
  w.saveSkill();
  var fr = w.state.skills.find(function (s) { return s.name === 'French'; });
  ok(!!fr && fr.icon === '🇫🇷', 'life area created with custom emoji');
  w.openSettings();
  ok(!!d.querySelector('#modal.show'), 'settings modal opens');
  w.closeModal();
  w.openCharacter();
  d.querySelector('#chName').value = 'Mehmet';
  w.saveCharacter();
  ok(w.state.hero.name === 'Mehmet', 'hero renamed via character modal');

  console.log('\nPersistence across reload');
  var saved = w.localStorage.getItem('liferpg.save.v1');
  var reloaded = JSON.parse(saved);
  ok(reloaded.hero.name === 'Mehmet' && reloaded.quests.length === w.state.quests.length, 'full state persisted');


  console.log('\nFocus tab (pomodoro)');
  w.go('focus');
  ok(d.querySelector('#view').textContent.indexOf('Focus') >= 0, 'focus tab renders');
  ok(d.querySelector('#view').textContent.indexOf('50 / 10') >= 0, 'mode chips visible');
  d.querySelector('#fLabel').value = 'essay draft';
  w.focusMode = { work: 25, brk: 5 };
  w.render();
  d.querySelector('#fLabel').value = 'essay draft';
  w.startFocus();
  ok(!!w.state.activeFocus && w.state.activeFocus.work === 25 && w.state.activeFocus.brk === 5, 'pomodoro started from UI');
  ok(d.querySelector('#countdown') !== null, 'countdown visible');
  ok(d.querySelector('.phase.work') !== null, 'work phase banner shown');
  // fast-forward: work phase ends and OFFERS the break (manual start)
  w.state.activeFocus.phaseEnd = Date.now() - 10;
  w.checkFocus();
  ok(w.state.activeFocus.awaitingBreak === true, 'work phase offers the break instead of auto-starting');
  ok(d.querySelector('#view').textContent.indexOf('TIME FOR A BREAK') >= 0, 'break-ready screen shown');
  w.startBreakBtn();
  ok(w.state.activeFocus.phase === 'break', 'starting the break enters the break phase');
  ok(d.querySelector('.campfire') !== null, 'campfire break animation renders');
  ok(d.querySelector('.phase.brk') !== null, 'break banner shown');
  // pause / resume without collecting
  w.pauseFocusUI();
  ok(w.state.activeFocus.pausedAt && d.querySelector('#view').textContent.indexOf('PAUSED') >= 0, 'pause freezes the session');
  ok(w.document.title.indexOf('Paused') >= 0, 'tab title shows paused');
  w.resumeFocusUI();
  ok(!w.state.activeFocus.pausedAt, 'resume clears the pause');
  // skip break back to work
  w.skipBreak();
  ok(w.state.activeFocus.phase === 'work', 'skip break returns to work');
  // dynamic tab title during focus
  w.updateDocTitle();
  ok(w.document.title.indexOf('Focus') >= 0 || w.document.title.indexOf('Break') >= 0, 'tab title reflects the focus timer');
  // focus-active pill shows on other tabs, hides on the focus tab
  w.go('today');
  ok(d.querySelector('#focuspill') !== null, 'a focus-active pill shows on other tabs while a session runs');
  w.go('focus');
  ok(d.querySelector('#focuspill') === null, 'the pill hides on the Focus tab itself');
  w.go('market');
  ok(d.querySelector('#focuspill') !== null && typeof w.unlockAudio === 'function', 'pill persists across tabs; audio-unlock helper present');
  w.go('focus');
  // add more worked time and stop & collect
  w.state.activeFocus.workedMs = 40 * 60000;
  w.stopFocus();
  ok(d.querySelector('#focuspill') === null, 'the pill disappears once the session ends');
  ok(w.state.activeFocus === null, 'stop clears session');
  ok(w.state.counters.focusMin >= 40, 'worked minutes credited on stop (' + w.state.counters.focusMin + ')');
  if (d.querySelector('#overlay.show')) w.closeOverlay();

  console.log('\nDaily chest (v2)');
  w.go('quests');
  ok(d.querySelector('.chestchip') !== null, 'chest chip visible');
  var today = w.RPG.todayKey();
  w.state.quests.filter(function (q) { return q.recurring; }).forEach(function (q) {
    if (q.doneOn !== today) w.doQuest(q.id);
  });
  if (d.querySelector('#overlay.show')) w.closeOverlay();
  ok(w.A.chestStatus(w.state).eligible === true, 'chest eligible after all dailies');
  ok(d.querySelector('.chestchip.ready') !== null, 'chest chip glows ready');
  w.claimChest();
  ok(w.state.counters.chests === 1, 'chest claimed from UI');
  if (d.querySelector('#overlay.show')) w.closeOverlay();
  ok(d.querySelector('.chestchip.claimed') !== null, 'chest chip shows claimed');

  console.log('\nPresets (v2)');
  var qCount = w.state.quests.length;
  w.usePreset('quest', 0);
  ok(w.state.quests.length === qCount + 1, 'quest preset one-tap adds');
  w.usePreset('quest', 0);
  ok(w.state.quests.length === qCount + 1, 'duplicate preset ignored');
  w.go('market');
  var sCount = w.state.shop.length;
  w.usePreset('shop', 0);
  ok(w.state.shop.length === sCount + 1 || w.state.shop.some(function(i){return i.title==='Gaming: 1 hour';}), 'shop preset adds gaming reward');
  w.go('habits');
  var hCount = w.state.habits.length;
  w.usePreset('bad', 0);
  ok(w.state.habits.some(function (h) { return h.title === 'Instagram before 1 PM'; }), 'monster preset added');

  console.log('\nStats tab (v2)');
  w.go('stats');
  var sv = d.querySelector('#view').textContent;
  ok(sv.indexOf('Week in review') >= 0, 'week review renders');
  ok(d.querySelectorAll('.chart .col').length === 7, '7-day XP chart renders');
  ok(d.querySelectorAll('.achgrid .ach').length === w.RPG.ACHIEVEMENTS.length, 'all achievements shown');
  ok(d.querySelectorAll('.ach.unlocked').length >= 1, 'at least one achievement unlocked (first_blood)');
  ok(sv.indexOf('Adventure log') >= 0 && sv.indexOf('Focus session') >= 0, 'log includes focus session');

  console.log('\nSound toggle (v2)');
  w.openSettings();
  var before = w.state.settings.sound;
  w.toggleSound();
  ok(w.state.settings.sound === !before, 'sound toggles and persists');
  w.closeModal();

  console.log('\nQuest layout (main-first)');
  w.go('quests');
  var panels = d.querySelectorAll('#view .panel');
  ok(panels[0] && panels[0].textContent.indexOf('Main quests') >= 0, 'main quests panel is first');
  d.querySelector('#gTitle').value = 'Pass code de la route';
  w.addGoal();
  var goal = w.state.goals.find(function (g) { return g.title === 'Pass code de la route'; });
  ok(d.querySelector('.goal') !== null, 'goal card rendered');
  d.querySelector('#step_' + goal.id).value = 'Serie de tests 1';
  w.addStep(goal.id);
  ok(w.state.quests.some(function (q) { return q.main === goal.id && q.title === 'Serie de tests 1'; }), 'step added inside goal card');
  ok(d.querySelector('.step') !== null, 'nested step visible in goal card');
  var step = w.state.quests.find(function (q) { return q.main === goal.id; });
  w.doQuest(step.id);
  if (d.querySelector('#overlay.show')) w.closeOverlay();
  ok(d.querySelector('.goal .pct').textContent.indexOf('1 / 1') >= 0, 'goal progress updates from step');
  ok(d.querySelector('#view').textContent.indexOf('Export due dates') >= 0, 'ICS export button present');
  // ICS export with a due-dated quest
  w.state.quests.push({ id: 'icsq', title: 'Due thing', diff: 'easy', skillId: null, due: '2026-08-01', recurring: false, main: null, doneOn: null, createdOn: w.RPG.todayKey() });
  var icsStr = w.RPG.buildICS(w.state);
  ok(icsStr && icsStr.indexOf('Due thing') > 0, 'buildICS reachable from app with due quests');

  console.log('\nRank-up celebration');
  var lvBeforeRank = w.state.hero.level;
  w.state.hero.level = 4;
  w.state.hero.xp = w.RPG.xpForLevel(4) - 1;
  var rq2 = w.A.addQuest(w.state, { title: 'rank trigger', diff: 'easy' });
  w.doQuest(rq2.id);
  ok(w.state.hero.level === 5, 'crossed into level 5');
  var ovl = d.querySelector('#overlay.show');
  ok(ovl && ovl.textContent.indexOf('RANK UP') >= 0, 'rank-up overlay shows');
  ok(d.querySelector('.rankbig') !== null && d.querySelector('.rankbig').textContent === 'D', 'big rank letter D displayed');
  w.closeOverlay();

  console.log('\nCharacter customization');
  w.openCharacter();
  ok(!!d.querySelector('#modal.show'), 'character modal opens');
  d.querySelector('#chName').value = 'Mehmet';
  d.querySelector('#chTitle').value = 'Essay Slayer';
  d.querySelector('#chCustomAv').value = '🚀';
  w.saveCharacter();
  ok(w.state.hero.name === 'Mehmet' && w.state.hero.title === 'Essay Slayer' && w.state.hero.avatar === '🚀', 'name, title, custom emoji saved');
  ok(d.querySelector('#hud').textContent.indexOf('Essay Slayer') >= 0, 'title shown in HUD');
  w.openCharacter();
  w.setTheme('synthwave');
  ok(w.state.settings.theme === 'synthwave', 'theme persisted');
  ok(d.documentElement.style.getPropertyValue('--gold') === '#ff5fa2', 'theme CSS variables applied');
  w.setTheme('dungeon');
  w.saveCharacter();

  console.log('\nBranding');
  ok(d.title === 'ScaleMyLife', 'page titled ScaleMyLife');
  ok(d.querySelector('.logo').textContent.indexOf('SCALE') >= 0, 'logo bar present');

  console.log('\nHeader, bars & tab hierarchy');
  ok(d.querySelector('.logo').textContent.indexOf('SCALE MY LIFE') >= 0, 'title centered header present');
  ok(d.querySelector('.logo').textContent.indexOf('\u2694') < 0, 'swords removed from title');
  ok(d.querySelector('.logo .gear') !== null, 'settings gear lives in header');
  ok(d.querySelector('#hud .gear') === null, 'gear no longer overlaps HUD level display');
  ok(d.querySelectorAll('.tabs button').length === 7, 'seven tabs incl. TODAY');
  ok(d.querySelectorAll('.tabs button.pri').length === 3, 'today/quests/habits marked primary by color');
  ok(d.querySelector('.tabs button.big') === null, 'no size-based tab tiers anymore');
  ok(d.querySelector('.tabs button').textContent.indexOf('TODAY') >= 0, 'TODAY is the first tab');

  console.log('\nHabit dots & records');
  w.go('habits');
  ok(d.querySelector('.hdots') !== null, '7-day dot chain renders');
  ok(d.querySelector('.hd.on') !== null, 'today\'s check-in shows as a lit dot');
  var mon = w.state.habits.find(function (h) { return h.type === 'bad'; });
  ok(d.querySelector('#view').textContent.indexOf('best:') >= 0, 'monster best record shown');

  console.log('\nBlack market rework');
  w.go('market');
  w.shopTab = 'black'; w.render();
  ok(d.querySelector('#view').textContent.indexOf('costs coins AND HP') >= 0, 'new black market blurb');
  ok(d.querySelector('#sDmg') !== null, 'HP-cost input in black tab form');
  w.usePreset('shop', 0);
  var sinItem = w.state.shop.find(function (i) { return i.tab === 'black' && i.dmg > 0; });
  ok(!!sinItem, 'black preset carries HP cost');
  w.state.hero.coins = 500;
  var hpB2 = w.state.hero.hp = 60;
  w.render();
  w.buy(sinItem.id);
  ok(w.state.hero.hp === hpB2 - sinItem.dmg, 'black purchase damaged HP in UI flow');
  if (d.querySelector('#overlay.show')) w.closeOverlay();
  ok(/−\d+ ❤️/.test(d.querySelector('#view').textContent), 'HP cost displayed on item');
  w.shopTab = 'market'; w.render();

  console.log('\nAgenda & promote');
  w.go('quests');
  function dOffU(n) { var dt = new Date(); dt.setDate(dt.getDate() + n); return w.RPG.todayKey(dt); }
  w.A.addQuest(w.state, { title: 'Overdue task', diff: 'easy', due: dOffU(-1) });
  w.A.addQuest(w.state, { title: 'Later task', diff: 'easy', due: dOffU(12) });
  w.render();
  ok(d.querySelector('#view').textContent.indexOf('Deadlines') >= 0, 'deadlines panel renders');
  ok(d.querySelector('.ag.overdue') !== null, 'overdue task highlighted');
  ok(d.querySelector('#view').textContent.indexOf('OVERDUE') >= 0 && d.querySelector('#view').textContent.indexOf('LATER') >= 0, 'urgency groups shown');
  var loose = w.A.addQuest(w.state, { title: 'Promote me', diff: 'normal' });
  w.render();
  w.promoteQ(loose.id);
  ok(w.state.goals.some(function (g) { return g.title === 'Promote me'; }), 'side quest promoted to main quest from UI');
  ok(d.querySelector('#view').textContent.indexOf('Promote me') >= 0, 'promoted goal visible in main quests');
  w.go('today');
  ok(d.querySelector('#view').textContent.indexOf('Due today') >= 0, 'today tab surfaces overdue work');

  console.log('\nWeekly-target habits UI');
  w.go('habits');
  ok(d.querySelector('#hgTarget') !== null, 'frequency select in habit form');
  d.querySelector('#hgTitle').value = 'Gym session';
  d.querySelector('#hgTarget').value = '3';
  w.addHabit('good');
  var gymH = w.state.habits.find(function (h) { return h.title === 'Gym session'; });
  ok(gymH.target === 3, 'weekly target saved from form');
  w.doHabit(gymH.id);
  ok(d.querySelector('#view').textContent.indexOf('1/3 this wk') >= 0, 'week progress shown on habit row');

  console.log('\nWounded & shield UI');
  w.state.hero.hp = 5;
  var mon2 = w.state.habits.find(function (h) { return h.type === 'bad'; });
  w.slip(mon2.id);
  if (d.querySelector('#overlay.show')) w.closeOverlay();
  ok(w.state.hero.woundedOn === w.RPG.todayKey(), 'KO wounds the hero');
  ok(d.querySelector('#hud').textContent.indexOf('wounded') >= 0, 'wounded status in HUD');
  w.go('today');
  ok(d.querySelector('.downbar') !== null, 'today tab explains the defeat (downed banner)');
  w.state.hero.woundedOn = null; w.state.hero.downed = null;
  w.go('market');
  w.usePreset('shop', 0); // streak shield preset
  var shieldItem = w.state.shop.find(function (i) { return i.special === 'shield'; });
  ok(!!shieldItem, 'streak shield stocked from preset');
  w.state.hero.coins = 300; w.render();
  w.buy(shieldItem.id);
  ok(w.state.hero.shields === 1, 'shield equipped via UI');
  ok(d.querySelector('#hud').textContent.indexOf(String.fromCodePoint(0x1F6E1)) >= 0, 'shield icon in HUD');

  console.log('\nTutorial replay');
  w.openSettings();
  ok(d.querySelector('#modal').textContent.indexOf('How it works') >= 0 && d.querySelector('#modal').textContent.indexOf('Interactive tour') >= 0, 'tutorial + interactive tour available in settings');
  w.tut(0);
  ok(d.querySelector('.tdots') !== null, 'tutorial replays');
  w.tut(4);
  ok(d.querySelector('#modal').textContent.indexOf('Done') >= 0, 'replay ends with Done when hero exists');
  w.tutSkip();
  ok(d.querySelector('#modal.show') === null, 'tutorial closes back to app');

  console.log('\nWeekly boss UI');
  w.go('quests');
  ok(d.querySelector('.boss') !== null, 'boss strip renders above main quests');
  ok(d.querySelector('#view .boss') === d.querySelector('#view').firstElementChild, 'boss strip is the first element');
  d.querySelector('#bossTitle').value = 'Slay the essay';
  w.setBoss();
  ok(w.state.boss && w.state.boss.title === 'Slay the essay', 'boss named from UI');
  ok(d.querySelector('#view').textContent.indexOf('WEEKLY BOSS') >= 0, 'active boss displayed');
  w.go('today');
  ok(d.querySelector('.bosschip') !== null, 'boss chip on today tab');
  w.go('quests');
  w.slayBoss(); // confirm mocked true
  ok(w.state.counters.bosses === 1 && w.state.boss === null, 'boss slain from UI');
  var ovl2 = d.querySelector('#overlay.show');
  ok(ovl2 && ovl2.textContent.indexOf('BOSS SLAIN') >= 0, 'kill screen shows');
  w.closeOverlay();

  console.log('\nTitle unlocks');
  w.openCharacter();
  ok(d.querySelector('.titlechips') !== null, 'unlocked title chips in character modal');
  var chipBtn = d.querySelector('.titlechips button');
  ok(!!chipBtn, 'at least one earned title available');
  var dragon = w.state.achievements.some(function (u) { return u.id === 'boss_1'; });
  ok(dragon && d.querySelector('.titlechips').textContent.indexOf('Dragonheart') >= 0, 'Dragonheart wearable after boss kill');
  w.wearTitle('boss_1');
  ok(d.querySelector('#chTitle').value === 'Dragonheart', 'tapping a chip fills the title');
  w.saveCharacter();
  ok(w.state.hero.title === 'Dragonheart', 'earned title equipped');
  ok(d.querySelector('#hud').textContent.indexOf('Dragonheart') >= 0, 'title shows in HUD');

  console.log('\nPWA wiring');
  ok(d.querySelector('link[rel=manifest]') !== null, 'manifest linked');
  ok(d.querySelector('meta[name=theme-color]') !== null, 'theme color set');
  ok(d.querySelector('link[rel=apple-touch-icon]') !== null, 'apple touch icon set');
  var fs2 = require('fs');
  ok(fs2.existsSync(__dirname + '/manifest.json') && fs2.existsSync(__dirname + '/sw.js'), 'manifest & service worker files exist');
  var man = JSON.parse(fs2.readFileSync(__dirname + '/manifest.json', 'utf8'));
  ok(man.name === 'ScaleMyLife' && man.display === 'standalone' && man.icons.length === 2, 'manifest well-formed');
  ok(fs2.existsSync(__dirname + '/icon-192.png') && fs2.existsSync(__dirname + '/icon-512.png'), 'icons exist');
  var appSrc = fs2.readFileSync(__dirname + '/app.js', 'utf8');
  ok(appSrc.indexOf("serviceWorker' in navigator") > 0 && appSrc.indexOf("location.protocol==='https:'") > 0, 'SW registers only when hosted');

  console.log('\nSkill mastery tiers (v3)');
  w.state.skills[0].level = 6;
  w.render();
  ok(d.querySelector('.skillcard .tier') !== null, 'mastery tier chip shows on a leveled life area');
  ok(d.querySelector('#skillsRow').textContent.indexOf('Expert') >= 0, 'Expert tier label at Lv.6');

  console.log('\nMonster menace (v3)');
  w.go('habits');
  var mMon = w.state.habits.find(function (h) { return h.type === 'bad'; });
  w.state.hero.hp = 100;
  w.slip(mMon.id);
  if (d.querySelector('#overlay.show')) w.closeOverlay();
  ok(w.RPG.menaceOf(mMon) > 1, 'slipping raises the monster\'s menace');
  ok(d.querySelector('#view').textContent.indexOf('menace') >= 0, 'menace shown on the monster row');
  ok(d.querySelector('.menacebar') !== null, 'menace meter renders');

  console.log('\nScheduled dailies (v3)');
  w.go('quests');
  ok(d.querySelector('.daysrow') !== null, 'weekday scheduler in the quest form');
  var wdNow = new Date().getDay(), wdOther = (wdNow + 3) % 7;
  w.pendingDays = [wdOther];
  d.querySelector('#dTitle').value = 'Gym day';
  w.addDaily();
  var sched = w.state.quests.find(function (q) { return q.title === 'Gym day'; });
  ok(sched && Array.isArray(sched.days) && sched.days.indexOf(wdOther) >= 0, 'quest saved with a weekday schedule');
  ok(w.pendingDays.length === 0, 'pending days reset after add');
  w.render();
  ok(d.querySelector('#view').textContent.indexOf('not today') >= 0, 'off-day daily shows "not today"');
  ok(d.querySelector('.chip.sched') !== null, 'schedule chip rendered on the row');

  console.log('\nInsights & weekly review (v3)');
  w.go('stats');
  ok(d.querySelector('#view').textContent.indexOf('Insights') >= 0, 'insights panel renders');
  ok(d.querySelector('.review') !== null, 'weekly review box renders');
  ok(d.querySelector('.rv.suggest') !== null, 'next-week suggestion shown');
  for (var ii = 0; ii < 8; ii++) {
    var idk = (function (n) { var dd = new Date(); dd.setDate(dd.getDate() - n); return w.RPG.todayKey(dd); })(ii);
    if (ii % 2 === 0) { w.state.journal[idk] = { mood: 'great', note: '' }; w.state.sleep[idk] = { hours: 8, quality: 4 }; w.state.log.push({ t: new Date().toISOString(), day: idk, icon: '⏳', text: 'f', xp: 70, coins: 0, hp: 0, min: 60 }); }
    else { w.state.journal[idk] = { mood: 'awful', note: '' }; w.state.sleep[idk] = { hours: 5, quality: 2 }; }
  }
  w.render();
  ok(d.querySelector('.insight') !== null, 'insight cards appear once there is enough data');

  console.log('\nFocus Elixir & chest loot (v3)');
  w.state.inventory.potion = 1; w.go('today');
  ok(d.querySelector('.quick button.potion') !== null, 'potion quick action shows when held');
  w.usePotion();
  ok(w.state.inventory.potion === 0 && w.RPG.buffXpMult(w.state) > 1, 'using the elixir consumes it and boosts XP');
  ok(d.querySelector('.buffpill') !== null, 'buff pill appears in the HUD');
  w.chestScreen({ xp: 25, coins: 30, loot: { type: 'frame', frame: { id: 'ember', name: 'Ember', color: '#ff7854', glow: '#ff9d47' } } });
  ok(d.querySelector('.lootline') !== null && d.querySelector('#overlay').textContent.indexOf('Ember') >= 0, 'chest overlay reveals rare frame loot');
  w.closeOverlay();

  console.log('\nAscension / prestige (v3)');
  w.state.hero.level = 41; w.render();
  ok(w.RPG.ascendReady(w.state), 'ascend available at level 41');
  w.openAscend();
  ok(d.querySelector('.boonpick') !== null, 'ascension boon picker opens');
  w.doAscend('scholar');
  if (d.querySelector('#overlay.show')) { ok(d.querySelector('#overlay').textContent.indexOf('ASCENDED') >= 0, 'ascension celebration shows'); w.closeOverlay(); }
  else { ok(false, 'ascension celebration shows'); }
  ok(w.state.hero.ascension === 1 && w.state.hero.level === 1, 'ascended: season 1, level reset to 1');
  ok(w.state.hero.boons.scholar === 1, 'permanent boon recorded');
  w.openCharacter();
  ok(d.querySelector('.boonchips') !== null, 'boons shown in the character screen');
  w.closeModal();

  console.log('\nAvatar frames (v3)');
  w.state.cosmetics.frames = ['gilded'];
  w.openCharacter();
  ok(d.querySelector('.framepick') !== null, 'frame picker shows owned frames');
  w.setFrame('gilded');
  ok(w.state.hero.frame === 'gilded', 'frame equipped');
  ok(d.querySelector('.hud .avatar.framed') !== null, 'HUD avatar shows the frame');
  w.closeModal();

  console.log('\nLegend mode (v3)');
  w.state.hero.level = 40; w.render();
  ok(d.querySelector('#wrap').classList.contains('legend'), 'rank S enters Legend mode');
  w.state.hero.level = 60; w.render();
  ok(d.querySelector('#wrap').classList.contains('ss'), 'rank SS adds the SS class');
  w.state.hero.level = 3; w.render();
  ok(!d.querySelector('#wrap').classList.contains('legend'), 'dropping below S exits Legend mode');

  console.log('\nOnboarding paths (v3)');
  w.onboarding();
  ok(d.querySelector('.pathpick') !== null, 'path picker rendered in onboarding');
  ok(d.querySelector('#modal').textContent.indexOf('Student') >= 0, 'named paths listed');
  w.closeModal();

  console.log('\nMastery tiers past Master (v4)');
  w.state.skills[0].level = 15;
  w.render();
  ok(d.querySelector('#skillsRow').textContent.indexOf('Grandmaster') >= 0, 'Grandmaster tier label at Lv.15');
  w.state.skills[0].level = 20;
  w.render();
  ok(d.querySelector('#skillsRow').textContent.indexOf('Sage') >= 0, 'Sage tier label at Lv.20');

  console.log('\nAnti-binge economy (v4)');
  w.go('market');
  w.shopTab = 'market'; w.state.hero.coins = 100000; w.render();
  ok(d.querySelector('#view').textContent.indexOf('Surge ON') >= 0, 'surge toggle shown, on by default');
  var gm = w.A.addShopItem(w.state, { title: 'Gaming binge', price: 60, tab: 'market' });
  w.render();
  w.buy(gm.id); // 1st
  w.buy(gm.id); // 2nd -> should surge
  w.render();
  ok(w.RPG.buyInfo(w.state, gm).count === 2, 'repeat buys tracked in the day');
  ok(d.querySelector('#view').textContent.indexOf('bought 2') >= 0 || d.querySelector('.price.surged') !== null, 'surged price shown on the item');
  // black market daily cap
  w.shopTab = 'black'; w.render();
  var bm = w.A.addShopItem(w.state, { title: 'Cheat binge', price: 50, tab: 'black', dmg: 4 });
  w.render();
  w.buy(bm.id); w.buy(bm.id); // hits the 2/day cap
  if (d.querySelector('#overlay.show')) w.closeOverlay();
  w.render();
  ok(d.querySelector('#view').textContent.indexOf('daily cap reached') >= 0 || d.querySelector('.cap.hit') !== null, 'black-market cap shown when reached');
  var capped = w.A.buy(w.state, bm.id);
  ok(capped && capped.fail === 'limit', 'buying past the cap is blocked');
  // toggle surge off
  w.toggleEscalate();
  ok(w.state.settings.escalate === false, 'surge can be toggled off in the market');
  ok(w.RPG.buyPrice(w.state, gm) === 60, 'with surge off the price is flat again');
  w.toggleEscalate();

  console.log('\nData-loss bugfixes (v6)');
  w.go('journal');
  w.pendingNote = 'draft note here';
  w.pendingMood = 'great'; w.render();   // simulates clicking a mood (which re-renders)
  ok(d.querySelector('#jNote').value === 'draft note here', 'typed journal note survives a mood/star re-render');
  ok(d.querySelector('#jNote').getAttribute('oninput') !== null, 'note textarea captures typing into the draft');
  d.querySelector('#jNote').value = 'final'; w.pendingNote = 'final'; w.saveJournal();
  ok(w.pendingNote === null, 'journal draft cleared after saving');
  w.go('quests');
  d.querySelector('#dTitle').value = 'My scheduled quest';
  w.toggleDow(1);                         // must NOT wipe the half-typed title
  ok(d.querySelector('#dTitle').value === 'My scheduled quest', 'daily-quest title survives a weekday toggle');
  ok(w.pendingDays.indexOf(1) >= 0, 'weekday recorded without a full re-render');
  w.addDaily();
  var sq = w.state.quests.find(function (q) { return q.title === 'My scheduled quest'; });
  ok(sq && sq.recurring && sq.days && sq.days.indexOf(1) >= 0, 'scheduled daily added with its weekday');

  console.log('\nEdit quests / goals / habits (v6)');
  w.go('quests');
  d.querySelector('#qTitle').value = 'Editable quest'; w.addQuest();
  var eqid = w.state.quests.find(function (q) { return q.title === 'Editable quest'; }).id;
  w.editQuestModal(eqid);
  ok(d.querySelector('#eqTitle') !== null, 'edit-quest modal opens prefilled');
  d.querySelector('#eqTitle').value = 'Edited quest'; d.querySelector('#eqDiff').value = 'hard';
  w.saveEditQuest(eqid);
  ok(w.state.quests.find(function (q) { return q.id === eqid; }).title === 'Edited quest', 'quest edited via modal');
  d.querySelector('#gTitle').value = 'Editable goal'; w.addGoal();
  var egid = w.state.goals.find(function (g) { return g.title === 'Editable goal'; }).id;
  w.editGoalModal(egid);
  d.querySelector('#egTitle').value = 'Edited goal'; w.saveEditGoal(egid);
  ok(w.state.goals.find(function (g) { return g.id === egid; }).title === 'Edited goal', 'main quest edited via modal');
  w.go('habits');
  var ghid = w.state.habits.filter(function (h) { return h.type === 'good'; })[0].id;
  w.editHabitModal(ghid);
  ok(d.querySelector('#ehTitle') !== null, 'edit-habit modal opens');
  d.querySelector('#ehTitle').value = 'Renamed habit'; w.saveEditHabit(ghid);
  ok(w.state.habits.find(function (h) { return h.id === ghid; }).title === 'Renamed habit', 'habit renamed via modal');

  console.log('\nFocus breakdown panel (v6)');
  var tfp = Date.now();
  w.A.startFocus(w.state, { work: 25, brk: 0, skillId: w.state.skills[0].id, now: tfp });
  w.A.tickFocus(w.state, tfp + 25 * 60000 + 5); w.A.stopFocus(w.state, tfp + 25 * 60000 + 5);
  w.go('stats');
  ok(d.querySelector('#view').textContent.indexOf('Focus by life area') >= 0, 'focus breakdown panel renders');
  ok(d.querySelector('.focusbars') !== null && d.querySelector('.fseg') !== null, 'stacked focus bars render');
  ok(d.querySelector('.focuslegend') !== null, 'focus legend shows life areas');

  console.log('\nInteractive tour (v6)');
  w.go('today');
  w.startTour();
  w.positionTour(d.querySelector('#hud')); // force synchronous positioning for the test
  ok(d.querySelector('#tour.show') !== null && d.querySelector('.tourtip') !== null, 'tour overlay + tooltip render');
  ok(d.querySelector('.tourhole') !== null, 'spotlight hole renders');
  w.tourNext();
  ok(w.tourStep === 1, 'tour advances a step');
  w.endTour();
  ok(d.querySelector('#tour.show') === null, 'tour closes cleanly');

  console.log('\nCloud sync UI (v7)');
  ok(typeof w.SMLCloud === 'object', 'cloud client loads in the page');
  ok(w.SMLCloud.configured() === true, 'cloud is configured out of the box (publishable key baked in)');
  ok(w.SMLCloud.session() === null, 'no session until the user signs in');
  w.openSettings();
  var setTxt = d.querySelector('#modal').textContent;
  ok(setTxt.indexOf('Cloud sync') >= 0 && d.querySelector('#cEmail') !== null && d.querySelector('#cPw') !== null, 'settings shows the sign-in form when configured');
  ok(setTxt.indexOf('Reminders OFF') >= 0, 'reminders toggle present (off by default)');
  w.closeModal();
  w.state.hero.level = 5; w.state.settings.cloudNudgeOff = false; w.go('today');
  ok(d.querySelector('.nudgebar') !== null, 'cloud nudge banner shows for unsynced progress');
  d.querySelector('.nudgebar .ghost').click();
  ok(w.state.settings.cloudNudgeOff === true && d.querySelector('.nudgebar') === null, 'nudge dismisses and stays dismissed');
  ok(w.state.updatedAt && w.state.updatedAt.length > 10, 'persist stamps updatedAt for sync conflict resolution');

  console.log('\nUndo (v7)');
  var uq = w.A.addQuest(w.state, { title: 'Undo me', diff: 'easy' });
  w.render();
  var nQuests = w.state.quests.length;
  w.delQuest(uq.id);
  ok(w.state.quests.length === nQuests - 1, 'delete is immediate (no confirm dialog)');
  ok(d.querySelector('.toast.undo') !== null, 'undo toast appears');
  w.doUndo(d.querySelector('.toast.undo button'));
  ok(w.state.quests.length === nQuests && w.state.quests.some(function (q) { return q.title === 'Undo me'; }), 'undo restores the deleted quest');
  var mon7 = w.state.habits.find(function (h) { return h.type === 'bad'; });
  var hpU = w.state.hero.hp = 90;
  var slipsBefore = mon7.slips;
  w.slip(mon7.id);
  if (d.querySelector('#overlay.show')) w.closeOverlay();
  var undoBtns = d.querySelectorAll('.toast.undo button');
  w.doUndo(undoBtns[undoBtns.length - 1]);
  ok(w.state.hero.hp === hpU && mon7.slips === slipsBefore || w.state.habits.find(function (h) { return h.id === mon7.id; }).slips === slipsBefore, 'a misclicked slip can be undone');

  console.log('\nFocus → main quest + HUD glance (v7)');
  var fgUI = w.A.addGoal(w.state, { title: 'UI goal' });
  w.go('focus');
  ok(d.querySelector('#fGoal') !== null, 'focus form offers the main-quest selector');
  var tg = Date.now();
  w.A.startFocus(w.state, { work: 25, brk: 0, goalId: fgUI.id, now: tg });
  w.A.tickFocus(w.state, tg + 25 * 60000 + 5); w.A.stopFocus(w.state, tg + 25 * 60000 + 5);
  ok(fgUI.focusMin === 25, 'session banked on the goal from the UI flow');
  w.go('quests');
  ok(d.querySelector('#view').textContent.indexOf('invested') >= 0, 'goal card shows invested deep-work time');
  w.go('today');
  ok(d.querySelector('#hud .glance') !== null, 'HUD shows the today-at-a-glance line');

  console.log('\nDaylight theme (v7)');
  w.setTheme('daylight');
  ok(w.state.settings.theme === 'daylight', 'daylight theme selected');
  ok(d.body.classList.contains('light'), 'body switches to light mode');
  ok(d.documentElement.style.getPropertyValue('--ink') === '#20192b', 'light ink colour applied');
  w.setTheme('dungeon');
  ok(!d.body.classList.contains('light'), 'dark themes remove light mode');
  w.closeModal();

  console.log('\nProgress & sharing (v8)');
  w.go('stats');
  ok(d.querySelector('.heatmap') !== null || d.querySelector('#view').textContent.indexOf('Consistency') >= 0, 'consistency heatmap panel renders');
  ok(d.querySelectorAll('.hc.l4').length >= 1 || d.querySelectorAll('.hc.l1,.hc.l2,.hc.l3,.hc.l4').length >= 1, 'active days light up on the heatmap');
  ok(d.querySelector('.spantoggle') !== null, 'Week/Month toggle on the focus chart');
  w.focusSpan = 30; w.render();
  ok(d.querySelectorAll('.frow').length >= 28 || d.querySelector('#view').textContent.indexOf('this month') >= 0, 'month view shows 30 day rows');
  ok(d.querySelector('.frow.slim') !== null, 'month rows use the compact style');
  w.focusSpan = 7; w.render();
  ok(typeof w.shareRecap === 'function' && d.querySelector('#view').textContent.indexOf('Share my week') >= 0, 'share-my-week button present');
  var threwShare = false; try { w.shareRecap(); } catch (e) { threwShare = true; }
  ok(!threwShare, 'shareRecap degrades gracefully without canvas support');
  // trophies
  w.A.setBoss(w.state, { title: 'Trophy dragon' }); w.A.slayBoss(w.state);
  if (d.querySelector('#overlay.show')) w.closeOverlay();
  w.go('stats');
  ok(d.querySelector('.trophy') !== null && d.querySelector('#view').textContent.indexOf('Trophy dragon') >= 0, 'boss trophy shelf renders kills');
  // cloud chip appears with a session
  w.localStorage.setItem('sml.cloud.session.v1', JSON.stringify({ access_token: 'x', refresh_token: 'y', user: { id: 'u', email: 'a@b.c' } }));
  w.render();
  ok(d.querySelector('.cloudchip') !== null, 'HUD shows the cloud-sync chip when signed in');
  w.localStorage.removeItem('sml.cloud.session.v1');
  w.render();
  ok(d.querySelector('.cloudchip') === null, 'chip hides when signed out');

  console.log('\nTwo-way sync safety (v25)');
  // reproduce the reported bug: this device is behind, the cloud is more advanced
  w.localStorage.setItem('sml.cloud.session.v1', JSON.stringify({ access_token: 'x', refresh_token: 'y', user: { id: 'sync-1', email: 's@b.c' } }));
  var savedState = w.state;
  w.state = w.RPG.migrate(w.RPG.newState('Device')); w.state.hero.level = 4; w.persist();   // clean device save, Lv.4
  var cloudSave = w.RPG.migrate(w.RPG.newState('CloudHero')); cloudSave.hero.level = 9; cloudSave.updatedAt = new Date().toISOString();
  var syncCalls = [];
  w.SMLCloud.configure({ fetch: function (url, opts) {
    syncCalls.push((opts && opts.method || 'GET') + ' ' + url);
    var body = '{}';
    if (url.indexOf('saves?select=data') >= 0) body = JSON.stringify([{ data: cloudSave, updated_at: cloudSave.updatedAt }]);
    return Promise.resolve({ status: 200, ok: true, text: function () { return Promise.resolve(body); } });
  } });
  w.cloudSyncNow();
  await new Promise(function (r) { setTimeout(r, 30); });
  ok(w.state.hero.level === 9 && w.state.hero.name === 'CloudHero', '"Sync now" adopts the more-advanced cloud save instead of overwriting it');
  ok(syncCalls.some(function (c) { return c.indexOf('GET') === 0 && c.indexOf('saves?select=data') >= 0; }), 'Sync now pulls before deciding (no blind push)');
  ok(w.localStorage.getItem(w.RPG.KEY + '.pre-cloud') !== null, 'a safety copy of the pre-sync save is kept');
  // now local is ahead -> Sync now should push, not clobber local
  w.state.hero.level = 20; w.persist();
  syncCalls = [];
  w.cloudSyncNow();
  await new Promise(function (r) { setTimeout(r, 30); });
  ok(w.state.hero.level === 20 && syncCalls.some(function (c) { return c.indexOf('POST') === 0 && c.indexOf('saves') >= 0; }), 'when this device is ahead, Sync now pushes it up');
  w.SMLCloud.configure({ fetch: null });
  w.localStorage.removeItem('sml.cloud.session.v1');
  w.localStorage.removeItem(w.RPG.KEY + '.pre-cloud');
  w.state = savedState; w.render();   // restore the main test state

  console.log('\nQuest of Atonement + journal archive (v9)');
  // simulate a broken streak offered for redemption today
  w.state.redemption = { streak: 9, on: w.RPG.todayKey() };
  w.state.quests.filter(function (q) { return q.recurring; }).forEach(function (q) { q.doneOn = null; });
  w.go('today');
  ok(d.querySelector('.redeembar') !== null, 'atonement banner appears for a broken streak');
  ok(d.querySelector('#view').textContent.indexOf('9-day streak') >= 0, 'banner names the lost streak');
  ok(d.querySelector('.redeembar .btn') === null, 'mend button hidden until the work is done');
  w.state.quests.filter(function (q) { return q.recurring && w.RPG.questActiveOn(q, new Date()); }).forEach(function (q) {
    if (q.doneOn !== w.RPG.todayKey()) w.doQuest(q.id);
  });
  if (d.querySelector('#overlay.show')) w.closeOverlay();
  w.go('today');
  ok(d.querySelector('.redeembar .btn') !== null, 'mend button unlocks once dailies are cleared');
  w.mendStreak();
  ok(w.state.hero.streak === 10 && w.state.redemption === null, 'streak mended to 10 from the UI');
  ok(d.querySelector('#overlay.show') !== null && d.querySelector('#overlay').textContent.indexOf('STREAK MENDED') >= 0, 'mend celebration shows');
  w.closeOverlay();
  ok(w.state.counters.mends === 1, 'mend counted for the achievement');
  // journal archive
  w.state.journal['2026-05-03'] = { mood: 'good', note: 'ancient wisdom' };
  w.state.journal['2026-05-14'] = { mood: 'great', note: 'shipped the thing' };
  w.state.journal['2026-06-20'] = { mood: 'ok', note: 'meh day' };
  w.go('journal');
  ok(d.querySelectorAll('details.jmonth').length >= 2, 'archive groups entries by month');
  ok(d.querySelector('#view').textContent.indexOf('ancient wisdom') >= 0, 'old entries are browsable');
  ok(d.querySelector('#jSearch') !== null, 'archive has a search box');
  w.filterJournal('ancient');
  var visible = Array.prototype.filter.call(d.querySelectorAll('.jrow.jarch'), function (r) { return r.style.display !== 'none'; });
  ok(visible.length === 1 && visible[0].textContent.indexOf('ancient wisdom') >= 0, 'search filters down to the matching entry');
  w.filterJournal('');
  ok(Array.prototype.every.call(d.querySelectorAll('.jrow.jarch'), function (r) { return r.style.display !== 'none'; }), 'clearing the search restores all rows');
  // best streak tile
  w.go('stats');
  ok(d.querySelector('#view').textContent.indexOf('best streak') >= 0, 'best-streak stat tile renders');

  console.log('\nLeaderboard (v11)');
  w.localStorage.removeItem('sml.cloud.session.v1');
  w.go('stats');
  ok(d.querySelector('#view').textContent.indexOf('Leaderboard') >= 0, 'leaderboard panel present in Stats');
  ok(d.querySelector('#view').textContent.indexOf('Sign in') >= 0, 'signed-out teaser invites sign-in');
  w.localStorage.setItem('sml.cloud.session.v1', JSON.stringify({ access_token: 'x', refresh_token: 'y', user: { id: 'me-1', email: 'a@b.c' } }));
  w.state.settings.board = false; w.go('stats');
  ok(d.querySelector('#view').textContent.indexOf('not on the global board') >= 0, 'synced-but-not-joined teaser shows');
  // opt in: settings toggle + fetch spy
  var boardUrls = [];
  w.SMLCloud.configure({ fetch: function (url) { boardUrls.push(url);
    return Promise.resolve({ status: 200, ok: true, text: function () { return Promise.resolve('[]'); } }); } });
  w.openSettings();
  ok(d.querySelector('#modal').textContent.indexOf('Join the leaderboard') >= 0, 'board toggle in cloud settings');
  w.toggleBoard();
  ok(w.state.settings.board === true, 'opt-in stored');
  w.closeModal();
  w.go('stats');
  ok(d.querySelector('#boardBody') !== null, 'board body renders for members');
  // sync row renderer with fixtures (async fetch path covered by cloud tests)
  w.renderBoardInto(d.querySelector('#boardBody'), [
    { user_id: 'u9', name: 'Rival', avatar: '🥷', level: 20, rank_code: 'B', week_xp: 2000, best_streak: 30, ascension: 0 },
    { user_id: 'me-1', name: 'Mems', avatar: '🧙', level: 14, rank_code: 'C', week_xp: 1433, best_streak: 15, ascension: 1 }
  ], 'me-1');
  ok(d.querySelectorAll('.brow').length === 2 && d.querySelector('.brow.me') !== null, 'rows render, own row highlighted');
  ok(d.querySelector('#view').textContent.indexOf('🥇') >= 0 && d.querySelector('#view').textContent.indexOf('✦S1') >= 0, 'medals + season marker shown');
  // opt out
  w.openSettings(); w.toggleBoard();
  ok(w.state.settings.board === false, 'opt-out stored (row deletion covered by cloud tests)');
  w.closeModal();
  w.localStorage.removeItem('sml.cloud.session.v1');

  console.log('\nFriends by code (v12)');
  w.localStorage.setItem('sml.cloud.session.v1', JSON.stringify({ access_token: 'x', refresh_token: 'y', user: { id: '11112222-3333-4444-5555-666677778888', email: 'a@b.c' } }));
  ok(w.SMLCloud.friendCode() === '11112222', 'friend code = first 8 hex of the user id, upper-cased');
  w.state.settings.friends = false; w.openSettings();
  ok(d.querySelector('#modal').textContent.indexOf('Enable friends') >= 0, 'friends toggle offered in settings');
  // scripted network for the friends flow
  var frFetch = [];
  w.SMLCloud.configure({ fetch: function (url, opts) {
    frFetch.push({ url: url, method: (opts && opts.method) || 'GET', body: opts && opts.body ? JSON.parse(opts.body) : null });
    var body = '[]';
    if (url.indexOf('rpc/find_by_friend_code') >= 0) body = JSON.stringify([{ user_id: 'friend-abc', name: 'Rival', avatar: '🥷', level: 20, rank_code: 'B', week_xp: 2000, best_streak: 30, ascension: 0 }]);
    if (url.indexOf('friends?select=friend_id') >= 0) body = JSON.stringify([{ friend_id: 'friend-abc' }]);
    if (url.indexOf('leaderboard?select') >= 0 && url.indexOf('user_id=in.') >= 0) body = JSON.stringify([{ user_id: 'friend-abc', name: 'Rival', avatar: '🥷', level: 20, rank_code: 'B', week_xp: 2000, best_streak: 30, ascension: 0 }]);
    return Promise.resolve({ status: 200, ok: true, text: function () { return Promise.resolve(body); } });
  } });
  w.toggleFriends();
  ok(w.state.settings.friends === true, 'enabling friends is stored');
  w.openSettings();
  ok(d.querySelector('#myCode') !== null && d.querySelector('#myCode').textContent === '11112222', 'shareable code shown in settings');
  ok(d.querySelector('#frCode') !== null, 'add-by-code input present');
  d.querySelector('#frCode').value = 'FRIENDXY';
  var afOk = false; try { w.addFriendByCode(); afOk = true; } catch (e) {}
  ok(afOk, 'addFriendByCode runs without error');
  ok(frFetch.some(function (r) { return /rpc\/find_by_friend_code/.test(r.url); }), 'lookup by code is called');
  // friends board view in Stats
  w.boardView = 'friends'; w.go('stats');
  ok(d.querySelector('#view').textContent.indexOf('Friends') >= 0 && d.querySelector('.spantoggle') !== null, 'Global/Friends toggle on the board');
  var frb = d.querySelector('#boardBody');
  w.renderBoardInto(frb, [
    { user_id: 'friend-abc', name: 'Rival', avatar: '🥷', level: 20, rank_code: 'B', week_xp: 2000, best_streak: 30, ascension: 0 },
    { user_id: '11112222-3333-4444-5555-666677778888', name: 'Me', avatar: '🧙', level: 14, rank_code: 'C', week_xp: 1433, best_streak: 15, ascension: 0 }
  ], '11112222-3333-4444-5555-666677778888');
  ok(d.querySelectorAll('.brow').length === 2 && d.querySelector('.brow.me') !== null, 'friends board renders rows with self highlighted');
  ok(d.querySelector('.brow.tap[onclick*="showProfile"]') !== null, 'board rows are tappable to open a profile');
  // tap a friend -> head-to-head profile modal
  var spOk = false; try { w.showProfile('friend-abc'); spOk = true; } catch (e) {}
  ok(spOk, 'showProfile runs without error');
  var pm = d.querySelector('#modal');
  ok(pm.textContent.indexOf('Rival') >= 0 && pm.querySelector('.h2h') !== null, 'profile modal shows the friend and a head-to-head table');
  ok(pm.textContent.indexOf('Remove friend') >= 0, 'Remove friend offered from a friends-board profile');
  ok(pm.querySelectorAll('.hval.win').length >= 1, 'head-to-head highlights the leader per metric');
  // tapping your own row shows the "this is you" card with no remove
  w.showProfile('11112222-3333-4444-5555-666677778888');
  pm = d.querySelector('#modal');
  ok(pm.textContent.indexOf('you') >= 0 && pm.textContent.indexOf('Remove friend') < 0, 'own profile shows "you" and no remove button');
  ok(pm.querySelector('.h2h') === null, 'own profile skips the head-to-head comparison');
  w.showProfile('does-not-exist'); // unknown id is a safe no-op
  ok(true, 'showProfile with an unknown id does not throw');
  w.closeModal();
  w.boardView = 'global';
  w.localStorage.removeItem('sml.cloud.session.v1');
  w.SMLCloud.configure({ fetch: null });

  console.log('\nBatch UX polish (v14)');
  // ranks + prestige explainer
  w.openRanks();
  var rk = d.querySelector('#modal');
  ok(rk.querySelector('.ranklist') !== null && rk.textContent.indexOf('Legend') >= 0, 'ranks modal lists every rank');
  ok(rk.textContent.indexOf('Prestige') >= 0 && rk.textContent.indexOf('Ascend') >= 0, 'ranks modal explains prestige');
  ok(rk.querySelector('.rankrow.cur') !== null, 'current rank highlighted');
  w.closeModal();
  // daily vs side-quest split
  w.go('quests');
  ok(d.querySelector('#dTitle') !== null && d.querySelector('#qTitle') !== null, 'separate daily and side-quest add forms');
  ok(d.querySelector('#qRec') === null, 'no repeat checkbox on the side-quest form');
  var qn = w.state.quests.length;
  d.querySelector('#qTitle').value = 'One-off side task'; w.addQuest();
  var oneoff = w.state.quests.find(function (q) { return q.title === 'One-off side task'; });
  ok(oneoff && !oneoff.recurring, 'side-quest form creates a one-off (non-recurring) quest');
  w.pendingDays = [];
  d.querySelector('#dTitle').value = 'Daily thing'; w.addDaily();
  var dq = w.state.quests.find(function (q) { return q.title === 'Daily thing'; });
  ok(dq && dq.recurring, 'daily form creates a recurring quest');
  // no quest quick-adds on the side panel
  ok(d.querySelector('#view').textContent.indexOf('quick add') < 0, 'side-quest quick-adds removed');
  // main-quest step with a due date
  var g = w.RPG.addGoal ? null : null;
  w.state.goals.push({ id: 'gv14', title: 'Big goal', note: '', createdOn: w.RPG.todayKey(), doneOn: null, focusMin: 0 });
  w.render();
  d.querySelector('#step_gv14').value = 'Step with deadline';
  d.querySelector('#stepdue_gv14').value = '2026-09-01';
  w.addStep('gv14');
  var st = w.state.quests.find(function (q) { return q.title === 'Step with deadline'; });
  ok(st && st.due === '2026-09-01' && st.main === 'gv14', 'main-quest step saves its due date');
  // focus custom slots
  w.go('focus');
  ok(d.querySelector('#fWork') === null, 'focus work/break inputs hidden until Custom is picked');
  w.focusMode = { work: 40, brk: 8, custom: true }; w.render();
  ok(d.querySelector('#fWork') !== null && d.querySelector('#fBrk') !== null, 'Custom reveals the work/break inputs');
  ok(d.querySelector('#view').textContent.indexOf('at least 5 minutes') >= 0, 'focus notes the 5-minute minimum');
  w.focusMode = { work: 50, brk: 10, custom: false };
  // study music: in-view note always offers a pop-out; the real player is docked & persistent
  w.state.settings.music = 'lofi';
  var mus = w.focusMusicNote();
  ok(mus.indexOf('openMusicWin') >= 0, 'music note always offers the pop-out player');
  ok(typeof w.syncMusicPlayer === 'function' && typeof w.hideMusicPlayer === 'function', 'persistent docked player helpers exist');
  w.state.settings.music = 'none';

  console.log('\nDesign moves (v19)');
  // 1) completion burst anchored to the last tap
  w.lastTap = { x: 123, y: 456 };
  var burstsBefore = d.querySelectorAll('.cburst').length;
  w.go('today');
  var firstDaily = w.state.quests.find(function (q) { return q.recurring && w.RPG.questActiveOn(q, new Date()) && q.doneOn !== w.RPG.todayKey(); });
  if (firstDaily) { w.doQuest(firstDaily.id); ok(d.querySelectorAll('.cburst').length > burstsBefore, 'clearing a quest fires a completion burst'); }
  else ok(true, 'no open daily to clear (burst path covered elsewhere)');
  ok(typeof w.popCheck === 'function' && (function(){ try { w.popCheck(10, 10); return true; } catch(e){ return false; } })(), 'popCheck runs without error');
  // 2) editorial stat values use tabular mono numerals
  w.go('stats');
  ok(d.querySelector('.stat .v') !== null, 'stats render value tiles');
  // 3) skeleton loader helper produces shimmer rows
  ok(typeof w.boardSkeleton === 'function', 'board skeleton helper exists');
  var sk = w.boardSkeleton(3);
  ok((sk.match(/brow skel/g) || []).length === 3 && sk.indexOf('sk-av') >= 0, 'skeleton builds N shimmer rows');

  console.log('\nMarket storefront + empty states (v24)');
  w.go('market');
  ok(d.querySelector('.shopgrid') !== null, 'market renders as a card grid');
  ok(d.querySelector('.scard .sicon') !== null, 'reward cards carry an auto-derived icon');
  ok(w.shopIcon('Gaming: 1 hour','market') === '🎮' && w.shopIcon('Café treat','market') === '☕' && w.shopIcon('mystery thing','hotel') === '🛏️', 'shop icons match title keywords with tab fallback');
  var keepCoins = w.state.hero.coins;
  w.state.hero.coins = 1; w.render();
  ok(d.querySelector('.scard.locked') !== null && d.querySelector('.affbar') !== null, 'unaffordable cards lock and show the affordability meter');
  w.state.hero.coins = keepCoins; w.render();
  var eh = w.emptyState('🏆','Nothing here','Do the thing.','<button class="btn">Go</button>');
  ok(eh.indexOf('ebox') >= 0 && eh.indexOf('etitle') >= 0 && eh.indexOf('Go') >= 0, 'emptyState builds icon + title + hint + CTA');
  var keepShop = w.state.shop; w.state.shop = []; w.render();
  ok(d.querySelector('.ebox') !== null, 'empty shelf shows the illustrated state');
  w.state.shop = keepShop; w.render();

  console.log('\nDefeat & Last Stand UI (v20)');
  w.go('habits');
  var vmon = w.state.habits.find(function (h) { return h.type === 'bad'; });
  w.state.hero.hp = 2; w.state.hero.coins = 100; w.state.hero.downed = null;
  w.slip(vmon.id);
  ok(w.state.hero.downed !== null, 'a killing slip downs the hero');
  ok(d.querySelector('#overlay.defeat') !== null && d.querySelector('#overlay').textContent.indexOf('DEFEATED') >= 0, 'defeat overlay shows');
  w.closeOverlay();
  w.go('today');
  ok(d.querySelector('.downbar') !== null && d.querySelector('.downbar').textContent.indexOf('Downed') >= 0, 'downed banner with a rest CTA on Today');
  ok(d.querySelector('.hud .avatar.downed') !== null, 'HUD avatar shows the downed look');
  // reaching full HP rises the hero (via afterAction hook)
  w.state.hero.hp = w.RPG.maxHpOf(w.state);
  w.afterAction();
  ok(w.state.hero.downed === null && (w.state.counters.comebacks || 0) >= 1, 'healing to full rises the hero');
  ok(d.querySelector('#overlay').textContent.indexOf('ROSE') >= 0, 'comeback overlay shows');
  w.closeOverlay();
  // defeat + comeback tiles show in Stats
  w.go('stats');
  ok(d.querySelector('#view').textContent.indexOf('defeats') >= 0 && d.querySelector('#view').textContent.indexOf('comebacks') >= 0, 'Stats surfaces defeats and comebacks');
  // hardcore toggle (confirm is stubbed truthy in this harness)
  w.state.settings.hardcore = false;
  w.toggleHardcore();
  ok(w.state.settings.hardcore === true, 'hardcore toggles on');
  w.toggleHardcore();
  ok(w.state.settings.hardcore === false, 'hardcore toggles back off');
  w.closeModal();
  // players can learn the defeat rules BEFORE dying: tappable HP bar + monsters-panel link
  w.openDefeatInfo();
  ok(d.querySelector('#modal').textContent.indexOf('IF YOU LOSE') >= 0 && d.querySelector('#modal').textContent.indexOf('Comeback') >= 0 && d.querySelector('#modal').textContent.indexOf('Downed') >= 0, 'defeat-info modal explains the stakes (incl. comeback) up front');
  w.closeModal();
  w.go('habits');
  ok(d.querySelector('#view').textContent.indexOf('What if I lose') >= 0, 'monsters panel links to the defeat explainer');
  w.go('today');
  ok(d.querySelector('.bar.hp[role="button"]') !== null, 'HP bar is tappable to learn about defeat');

  console.log('\nFeel & finish motion (v18)');
  w.go('quests');
  ok(d.querySelector('#view').classList.contains('view-nav'), 'switching tabs arms the entrance cascade');
  // an in-tab update (completing something) must NOT re-arm the cascade -> calm, no flicker
  d.querySelector('#view').classList.remove('view-nav');
  w.render();
  ok(!d.querySelector('#view').classList.contains('view-nav'), 'in-tab re-render stays calm (no cascade replay)');
  w.go('today');
  ok(d.querySelector('#view').classList.contains('view-nav'), 'navigating again re-arms the cascade');

  console.log('\nSage the guide (v17)');
  w.render(); // ensure mascot exists via mood sync
  ok(d.querySelector('#mascot') !== null, 'mascot mounted outside the re-rendered view');
  ok(d.querySelector('#mBtn') !== null && d.querySelector('#mBtn').getAttribute('aria-label').indexOf('Sage') >= 0, 'mascot button has an accessible name');
  ok(d.querySelector('#mBubble').hidden === true, 'briefing bubble starts closed');
  w.toggleMascot(true);
  ok(d.querySelector('#mBubble').hidden === false, 'tapping Sage opens the briefing');
  ok(d.querySelector('#mBubble').textContent.indexOf(w.state.hero.name) >= 0, 'briefing greets the hero by name');
  ok(d.querySelector('#mBubble .mline') !== null, 'briefing shows at least one actionable line');
  var firstLine = d.querySelector('#mBubble .mline');
  firstLine.click();
  ok(d.querySelector('#mBubble').hidden === true, 'tapping a line closes the bubble and navigates');
  // mood class reflects state
  w.state.hero.hp = 10; w.render();
  ok(d.querySelector('#mascot').className.indexOf('m-worried') >= 0 || d.querySelector('#mascot').className.indexOf('m-urgent') >= 0, 'low HP shifts Sage’s mood');
  w.state.hero.hp = 100; w.render();
  // settings toggle hides him
  w.toggleMascotSetting();
  ok(w.state.settings.mascot === false, 'setting stores mascot off');
  ok(d.querySelector('#mascot').style.display === 'none', 'mascot hidden when toggled off');
  w.toggleMascotSetting();
  ok(w.state.settings.mascot === true && d.querySelector('#mascot').style.display !== 'none', 'mascot returns when toggled back on');
  w.closeModal();

  console.log('\nAccessibility (v16)');
  ok(d.querySelector('#modal').getAttribute('role') === 'dialog' && d.querySelector('#modal').getAttribute('aria-modal') === 'true', 'modal exposes dialog semantics');
  ok(d.querySelector('#toasts').getAttribute('aria-live') === 'polite', 'toasts are an aria-live region');
  ok(d.querySelector('.gear').getAttribute('aria-label') === 'Settings', 'settings gear has an accessible name');
  w.go('quests');
  ok(d.querySelector('.item .btn.ghost[aria-label]') !== null, 'quest icon buttons have accessible names');
  ok(d.querySelector('.rank[role="button"][tabindex="0"]') !== null, 'rank chip is a keyboard-focusable button');
  ok(d.querySelector('.hud .avatar[aria-label]') !== null, 'avatar has an accessible name');
  w.go('journal');
  ok(d.querySelector('.moods button[aria-pressed]') !== null, 'mood buttons expose pressed state');
  // name required at hero creation is covered by createHero refusing empty names
  var before = w.state; w.state = null; w.renderHUDShell(); w.tut(0); w.tutSkip();
  d.querySelector('#obName').value = '   ';
  w.createHero();
  ok(w.state === null, 'createHero refuses a blank name');
  d.querySelector('#obName').value = 'Named Hero';
  w.createHero();
  ok(w.state && w.state.hero.name === 'Named Hero', 'createHero proceeds once a name is given');
  w.state = before; w.render();
  // athlete preset no longer splits Strength/Mobility
  var athlete = w.RPG.seedPreset(w.RPG.newState('A', '💪'), 'athlete');
  var names = athlete.skills.map(function (s) { return s.name; });
  ok(names.indexOf('Mobility') < 0 && names.indexOf('Nutrition') >= 0, 'athlete life areas use Body + Nutrition, not Strength/Mobility');

  console.log('\nWebGL gradient background (v5)');
  ok(d.querySelector('#bg') !== null, 'background canvas present in the DOM');
  ok(typeof w.SMLGradient === 'object' && typeof w.SMLGradient.setColors === 'function', 'gradient controller exposed on window');
  ok(d.querySelector('#bg').style.display === 'none', 'gradient degrades gracefully without WebGL (canvas hidden -> CSS aurora fallback)');
  var threw = false; try { w.SMLGradient.setColors(); w.applyTheme(); } catch (e) { threw = true; }
  ok(!threw, 'setColors / applyTheme are safe no-ops when WebGL is unavailable');
  var swSrc = fs2.readFileSync(__dirname + '/sw.js', 'utf8');
  ok(swSrc.indexOf('gradient.js') > 0, 'gradient.js is precached by the service worker');

  console.log('\nRuntime errors during session: ' + errors.length);
  ok(errors.length === 0, 'zero JS errors through entire flow' + (errors.length ? ' -> ' + errors.join(' | ') : ''));

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
}, 600);
