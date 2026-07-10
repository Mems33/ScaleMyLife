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

setTimeout(function () {
  var w = dom.window, d = w.document;

  console.log('\nBoot & onboarding');
  ok(errors.length === 0, 'no JS errors on load' + (errors.length ? ' -> ' + errors[0] : ''));
  ok(!!d.querySelector('#modal.show'), 'tutorial modal shows on first run');
  ok(d.querySelector('.tdots') !== null, 'tutorial step dots visible');
  ok(d.querySelector('#modal').textContent.indexOf('Skip') >= 0, 'skip button offered');
  w.tut(1); w.tut(2); w.tut(3);
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
  ok(d.querySelector('#view').textContent.indexOf('restores') >= 0, 'hotel items show HP restore');
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
  // fast-forward into break
  w.state.activeFocus.phaseEnd = Date.now() - 10;
  w.checkFocus();
  ok(w.state.activeFocus.phase === 'break', 'ticker flipped to break');
  ok(d.querySelector('.campfire') !== null, 'campfire break animation renders');
  ok(d.querySelector('.phase.brk') !== null, 'break banner shown');
  // skip break back to work
  w.skipBreak();
  ok(w.state.activeFocus.phase === 'work', 'skip break returns to work');
  // add more worked time and stop & collect
  w.state.activeFocus.workedMs = 40 * 60000;
  w.stopFocus();
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
  ok(d.querySelector('#view').textContent.indexOf('costs −') >= 0, 'HP cost displayed on item');
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
  ok(d.querySelector('#view').textContent.indexOf('Due now') >= 0, 'today tab surfaces overdue work');

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
  ok(d.querySelector('.woundbar') !== null, 'today tab explains the wound');
  w.state.hero.woundedOn = null;
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
  w.tut(3);
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
  d.querySelector('#qTitle').value = 'Gym day';
  d.querySelector('#qRec').checked = true;
  w.addQuest();
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
  d.querySelector('#qTitle').value = 'My scheduled quest';
  d.querySelector('#qRec').checked = true;
  w.toggleDow(1);                         // must NOT wipe the half-typed title
  ok(d.querySelector('#qTitle').value === 'My scheduled quest', 'side-quest title survives a weekday toggle');
  ok(w.pendingDays.indexOf(1) >= 0, 'weekday recorded without a full re-render');
  w.addQuest();
  var sq = w.state.quests.find(function (q) { return q.title === 'My scheduled quest'; });
  ok(sq && sq.recurring && sq.days && sq.days.indexOf(1) >= 0, 'scheduled quest added with its weekday');

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
  ok(d.documentElement.style.getPropertyValue('--ink') === '#2c2536', 'light ink colour applied');
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
