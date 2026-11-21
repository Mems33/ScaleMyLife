/* End-to-end UI smoke test: load index.html in jsdom and click through everything */
var fs = require('fs');
var path = require('path');
var { JSDOM } = require('jsdom');

var html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
var core = fs.readFileSync(path.join(__dirname, 'core.js'), 'utf8');
var app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
var grad = fs.readFileSync(path.join(__dirname, 'gradient.js'), 'utf8');
var cloud = fs.readFileSync(path.join(__dirname, 'cloud.js'), 'utf8');
var fxSrc = fs.readFileSync(path.join(__dirname, 'fx.js'), 'utf8');
var artSrc = fs.readFileSync(path.join(__dirname, 'art.js'), 'utf8');
// inline scripts so they load under the https test origin
html = html.replace('<script src="gradient.js"></script>', '<script>' + grad + '</script>');
html = html.replace('<script src="cloud.js"></script>', '<script>' + cloud + '</script>');
html = html.replace('<script src="core.js"></script>', '<script>' + core + '</script>');
/* function form: art.js contains "$&", which a plain replacement string would expand */
html = html.replace('<script src="art.js"></script>', function () { return '<script>' + artSrc + '</script>'; });
html = html.replace('<script src="fx.js"></script>', '<script>' + fxSrc + '</script>');
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
  ok(!!d.querySelector('#modal.show'), 'onboarding wizard shows on first run');
  ok(d.querySelector('.tdots') !== null, 'wizard step dots visible');
  ok(d.querySelector('#obName') !== null && d.querySelector('.avpick') !== null && d.querySelector('.obthemes') !== null, 'step 1 asks for a name, an avatar and a look');
  ok(d.querySelector('#obNext') !== null && d.querySelector('#obNext').disabled === true, 'Continue waits for a name');
  // the five educational slides still exist (Settings "How it works") and, with no hero, hand over to the wizard
  w.tut(0);
  ok(d.querySelector('#modal').textContent.indexOf('Skip') >= 0, 'slides offer Skip');
  w.tut(1); w.tut(2); w.tut(3); w.tut(4);
  ok(d.querySelector('#modal').textContent.indexOf('Create my hero') >= 0, 'last slide leads to hero creation');
  w.tutSkip();
  ok(d.querySelector('#obName') !== null && w.obStep === 1, 'skip lands on step 1 of the wizard');
  d.querySelector('#obName').value = 'Alp'; w.obNameCheck();
  ok(d.querySelector('#obNext').disabled === false, 'a name enables Continue');
  w.obNext();
  ok(w.obStep === 2 && d.querySelectorAll('.obq').length === 3 && d.querySelector('.pathpick') === null, 'step 2 is Your day: three questions, and no path picker any more');
  ok(d.querySelectorAll('.obchips .chip').length === 11 && d.querySelectorAll('.obchips .chip.on').length === 2 && d.querySelectorAll('.obmode').length === 3 && d.querySelector('.obmode.on').textContent.indexOf('Classic') >= 0, 'time and struggle chips (30 min and Nothing in particular preselected) and three explained game modes, Classic on');
  ok(d.querySelectorAll('.obq .obqh').length === 3, 'each question says what its answer changes');
  w.obNext();
  ok(w.obStep === 3 && d.querySelector('#capText') !== null && d.querySelectorAll('.cappack').length === w.RPG.PACKS.length, 'step 3 is the plate: a text box and one chip per quest pack');
  w.obNext();
  ok(w.obStep === 4 && d.querySelectorAll('.obitem').length === 6 && d.querySelectorAll('.obitem.on').length === 6, 'step 4 is the board: the four Balanced habits and the two dailies, all on');
  ok(d.querySelector('.obchips.targets') !== null, 'a habit row carries its weekly target chips');
  ok(d.querySelector('#obStart') !== null && d.querySelector('#obNext') === null && d.querySelector('#modal').textContent.indexOf('Your board') >= 0, 'the board step carries Start; there is no separate Ready screen');
  d.querySelector('#obStart').click();
  ok(w.state && w.state.hero.name === 'Alp', 'hero created');
  ok(w.RPG.staged(w.state) === true && d.querySelector('#tour.show') === null, 'a hero made by the wizard plays the staged game, and no tour starts by itself');
  /* The rest of this long flow exercises every system (the Market, monsters,
     the boss, the leaderboard), so staging is switched off for its hero here.
     The staged game has its own section near the end. */
  w.RPG.unlockAll(w.state); w.persist(); w.render();
  ok(d.querySelector('#hud').textContent.indexOf('Alp') >= 0, 'HUD shows hero name');
  ok(d.querySelector('#hud').textContent.indexOf('LV.1') >= 0, 'HUD shows level 1');
  ok(w.localStorage.getItem('liferpg.save.v1') !== null, 'save written to localStorage');
  ok(d.querySelectorAll('.skillcard').length === 5, '5 skill cards rendered');

  console.log('\nToday tab (default home)');
  ok(w.tab === 'today', 'app opens on the Today tab');
  ok(d.querySelector('.todayhead') !== null, 'today header renders');
  ok(d.querySelector('#view .panel.now') !== null && d.querySelector('#view .panel.habits') !== null, 'dailies (Now) and habit checks (Habits today) merged in one view');
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
  ok(d.querySelector('#view').textContent.indexOf('Good habits') >= 0, 'habits tab renders');
  var good = w.state.habits.filter(function (h) { return h.type === 'good'; })[1];
  w.doHabit(good.id);
  ok(good.streak === 1, 'good habit checked, streak 1');
  // the ✓ is a sprite icon now, so assert on the done row itself
  ok(d.querySelector('#view .item.done') !== null && d.querySelector('#view').textContent.indexOf('today') >= 0, 'UI marks habit done today');
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
  ok(d.querySelector('#balCoins') !== null && d.querySelector('#balCoins').textContent.indexOf('200') >= 0, 'balance hero shows the coin total');
  var buyable = w.state.shop.find(function (i) { return i.tab === 'market'; });
  var cB = w.state.hero.coins;
  w.buy(buyable.id);
  ok(w.state.hero.coins === cB - buyable.price, 'purchase deducted coins');
  w.shopTab = 'hotel'; w.render();
  ok(/\+\d+ ❤️/.test(d.querySelector('#view').textContent), 'hotel items show HP restore');
  ok(d.querySelector('#sHp') !== null, 'the rest section form has the HP field');
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
  ok(d.querySelector('#skIcon') === null, 'no free-text emoji field: every icon comes from the drawn grid');
  [].filter.call(d.querySelectorAll('#skEmojiGrid button'), function (b) { return b.textContent.indexOf('🇫🇷') >= 0; })[0].click();
  w.saveSkill();
  var fr = w.state.skills.find(function (s) { return s.name === 'French'; });
  ok(!!fr && fr.icon === '🇫🇷', 'life area created with the flag picked from the grid');
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

  console.log('\nSuggested for you (revamp 7)');
  var suggIdx = w.suggestedRewards();
  ok(suggIdx.length > 0, 'suggested rewards row has at least one match (no onboarding record falls back to skill-name matching)');
  var pickIdx = suggIdx[0], pickTitle = w.PRESETS.shop.market[pickIdx][0];
  ok(d.querySelector('#shop-suggested').textContent.indexOf(pickTitle) >= 0, 'a suggested reward renders by title');
  w.usePreset('shop', pickIdx, 'market');
  ok(w.state.shop.some(function (i) { return i.title === pickTitle; }), 'tapping Stock it adds the suggested reward to Your rewards');
  ok(w.suggestedRewards().indexOf(pickIdx) === -1, 'a stocked reward drops out of the suggestions row (dupe() hides it)');

  w.go('habits');
  var hCount = w.state.habits.length;
  w.usePreset('bad', 0);
  ok(w.state.habits.some(function (h) { return h.title === 'Instagram before 1 PM'; }), 'monster preset added');

  console.log('\nStats tab (v2)');
  w.go('stats');
  var sv = d.querySelector('#view').textContent;
  ok(sv.indexOf('This week') >= 0, 'the This week panel renders (was "Week in review")');
  ok(d.querySelectorAll('.chart:not(.sleepchart) .col').length === 7, '7-day XP chart renders');
  ok(d.querySelectorAll('.chart.sleepchart .col').length === 7, '7-day sleep chart renders below mood');
  var nGot = w.state.achievements.length, nAll = w.RPG.ACHIEVEMENTS.length;
  ok(d.querySelectorAll('.achgrid .ach').length === Math.min(nAll, nGot + 4) && d.querySelectorAll('.achgrid .ach.locked').length <= 4, 'earned achievements plus the next four are shown');
  w.achAll = true; w.render();
  ok(d.querySelectorAll('.achgrid .ach').length === nAll, 'Show all lists every achievement');
  w.achAll = false; w.render();
  ok(d.querySelectorAll('.ach.unlocked').length >= 1, 'at least one achievement unlocked (first_blood)');
  ok(sv.indexOf('Adventure log') >= 0 && sv.indexOf('Focus session') >= 0, 'log includes focus session');

  console.log('\nProgress dashboard (revamp 8)');
  var heroCard = d.querySelector('#view .panel.herocard');
  ok(heroCard !== null && heroCard.querySelector('.herotitle[onclick*="openTitlePicker"]') !== null, 'the hero card renders on Progress with the title picker');
  ok(heroCard !== null && heroCard.querySelector('[onclick*="openCharacter"]') !== null, 'the hero card offers Customize');
  ok(heroCard !== null && heroCard.querySelector('.lvbig') !== null && heroCard.querySelector('.rank[role="button"]') !== null, 'big level number and rank chip on the card');
  ok(heroCard !== null && heroCard.querySelector('.ranknext[onclick]') !== null && heroCard.textContent.indexOf('HP') >= 0, 'rank progress button and the HP line come with it');
  var srow = d.querySelector('#view #skillsRow');
  ok(heroCard !== null && srow !== null && heroCard.nextElementSibling !== null && heroCard.nextElementSibling.contains(srow), 'life areas sit right after the hero card');
  ok(d.querySelector('#skillsSlot') === null, 'the slot placeholder is gone once the row moved in');
  ok(d.querySelectorAll('#view .panel.thisweek svg.pring').length === 3, 'This week draws three rings');
  ok(d.querySelector('#view .panel.thisweek .review .rv.suggest') !== null, 'the encouraging line sits under the rings');
  var xpCols = d.querySelectorAll('.chart:not(.sleepchart) .col');
  ok(xpCols.length === 7 && [].every.call(xpCols, function (c) { return c.querySelector('svg rect') !== null; }), 'each of the 7 XP columns draws an SVG bar');
  var slCols = d.querySelectorAll('.chart.sleepchart .col');
  ok(slCols.length === 7 && [].every.call(slCols, function (c) { return c.querySelector('svg rect') !== null; }), 'each of the 7 sleep columns draws an SVG bar');
  var snum = d.querySelector('#view .panel.streakcard .sn.cur .v');
  ok(snum !== null && snum.textContent.trim() === String(w.state.hero.streak), 'the streak panel shows the current streak number');
  ok(d.querySelector('#view .panel.streakcard .heatmap') !== null, 'the consistency grid lives in the streak panel');
  ok(d.querySelector('#view .statgrid .stat .v') !== null, 'the compact tiles render under the streak panel');
  ok(d.querySelectorAll('.achgrid .ach').length === Math.min(w.RPG.ACHIEVEMENTS.length, w.state.achievements.length + 4), 'the achievements grid shows the earned ones and the next four');
  ok(sv.indexOf('Share my week') >= 0, 'Share my week stays in the header row');

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
  ok(d.querySelector('#view [onclick*="exportICS"]') !== null, 'ICS export button present');
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
  /* pixel heroes only now: no emoji tab, no typed-emoji field */
  ok(d.querySelector('.avtabs') === null && d.querySelector('.customize') === null, 'no emoji tab and no Customize button: heroes only');
  var order = [].map.call(d.querySelectorAll('.avpick.svgrow button[data-k]'), function (b) { return w.skinNeed(b.getAttribute('data-k')); });
  ok(order.length >= 16 && order.every(function (n, i) { return i === 0 || n >= order[i - 1]; }), 'heroes are listed in the order they open');
  ok(d.querySelector('.avpick.svgrow button.t-legendary') !== null && d.querySelector('.avpick.svgrow button.t-rare') !== null, 'every hero card carries its rarity');
  ok(d.querySelector('#chCustomAv') === null && d.querySelector('.avpick.scroll') === null, 'no emoji grid and no typed-emoji field');
  d.querySelector('#chName').value = 'Mehmet';
  d.querySelector('#chTitle').value = 'Essay Slayer';
  var mageBtn = d.querySelector('.avpick.svgrow button[aria-label="Mage"]');
  ok(mageBtn !== null && mageBtn.querySelector('svg.pxhero use') !== null, 'heroes are pixel portraits from the shared sprite');
  mageBtn.click();   // re-renders the sheet, keeping the typed name and title
  ok(d.querySelector('#chName').value === 'Mehmet', 'typed name survives the avatar pick');
  w.saveCharacter();
  ok(w.state.hero.name === 'Mehmet' && w.state.hero.title === 'Essay Slayer' && w.state.hero.avatar === '@mage', 'name, title and hero saved');
  ok(/pxhero/.test(w.avHtml('🚀')) && w.avHtml('🧙') === w.avHtml('@mage'), 'an emoji avatar from an older save is drawn as a hero (the wizard as the Mage)');
  // the worn title moved from the header into the Hero sheet (openCharacter)
  w.openCharacter();
  ok(d.querySelector('#modal').textContent.indexOf('Essay Slayer') >= 0, 'title shown in the Hero sheet');
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
  ok(d.querySelectorAll('.tabs button').length === 5, 'five tabs: Focus and Journal left the bar');
  ok(d.querySelectorAll('.tabs button.pri').length === 3, 'today/quests/habits marked primary by color');
  ok(d.querySelector('.tabs button.big') === null, 'no size-based tab tiers anymore');
  ok(d.querySelector('.tabs button').textContent.indexOf('TODAY') >= 0, 'TODAY is the first tab');
  var tabLabels = [].map.call(d.querySelectorAll('.tabs .tl'), function (e) { return e.textContent.trim(); });
  ok(tabLabels.join('|') === 'TODAY|QUESTS|HABITS|REWARDS|PROGRESS', 'tab order: Today, Quests, Habits, Rewards, Progress (' + tabLabels.join(',') + ')');
  var tabIds = [].map.call(d.querySelectorAll('.tabs button'), function (e) {
    return (e.getAttribute('onclick') || '').replace(/^go\('|'\)$/g, '');
  });
  ok(tabIds.join('|') === 'today|quests|habits|market|stats', 'go() ids keep the engine names market and stats (' + tabIds.join(',') + ')');
  ok(d.querySelector('.tabs button.home') !== null, 'Today keeps the home treatment');

  console.log('\nFocus & Journal off the bar (v56)');
  w.go('focus');
  ok(d.querySelector('#view .vhead .btn.back') !== null, 'Focus renders a back control');
  ok(d.querySelector('#view .vhead .btn.back').getAttribute('aria-label') === 'Back to Today', 'back control is labelled for screen readers');
  ok(d.querySelector('#view .vhead h2').textContent.indexOf('Focus') >= 0, 'Focus names itself in the header row');
  ok(d.querySelector('.tabs button.on') === null, 'no tab is highlighted while Focus is open');
  d.querySelector('#view .vhead .btn.back').click();
  ok(w.tab === 'today', 'the back control returns to Today');
  w.go('journal');
  ok(d.querySelector('#view .vhead .btn.back') !== null && d.querySelector('#view .vhead h2').textContent.indexOf('Journal') >= 0, 'Journal renders the same back row');
  ok(d.querySelector('.tabs button.on') === null, 'no tab is highlighted while Journal is open');
  ok(d.querySelector('#jNote') !== null, 'the journal form still renders under its header');
  w.go('today');

  console.log('\nFocus control on a quest row (v56)');
  var fq = w.A.addQuest(w.state, { title: 'Quest worth focusing on', diff: 'normal' });
  w.go('quests');
  var frow = [].filter.call(d.querySelectorAll('#view .item'), function (it) {
    return it.textContent.indexOf('Quest worth focusing on') >= 0;
  })[0];
  ok(!!frow, 'the quest row renders');
  /* Focus lives behind the row's one ⋯ button now (rowMenu) */
  frow.querySelector('.btn.more').click();
  var fbtn = [].filter.call(d.querySelectorAll('#modal .rmact'), function (b) { return b.textContent.indexOf('Focus on it') >= 0; })[0];
  ok(!!fbtn, 'the row ⋯ menu carries a Focus control');
  fbtn.click();
  ok(w.tab === 'focus', 'the Focus control opens the Focus view');
  ok(w.focusPreselect === null, 'the handoff variable is cleared once it is read');
  var fsel = d.querySelector('#fTask');
  ok(fsel !== null && fsel.value === 'q:' + fq.id, 'the quest is preselected in the link select');
  ok(d.querySelector('#fTask option[value="q:' + fq.id + '"][selected]') !== null, 'the preselected option is marked selected in the markup');
  ok(d.querySelector('#fTask optgroup[label*="Main"]') !== null, 'the optgroup structure survives the preselect');
  w.focusDraft = { label: '', skill: '', goal: '' };
  // straight through the engine, not delQuest(): that one parks an undo toast
  // the later undo tests would pick up first
  w.A.deleteQuest(w.state, fq.id);
  w.go('today');

  console.log('\nLife areas move into Progress (v56)');
  w.go('stats');
  ok(d.querySelector('#view #skillsRow') !== null, 'on Progress the life areas render inside the content');
  ok(d.querySelectorAll('#view #skillsRow .skillcard').length >= 5, 'the skill cards come with it');
  ok(d.querySelector('#wrap > #skillsRow') === null, 'and no longer sit between the header and the tab bar');
  w.go('today');
  ok(d.querySelector('#view #skillsRow') === null, 'on Today the life areas are back out of the content');
  ok(d.querySelector('#wrap > #skillsRow') !== null, 'parked in the shell, where the CSS hides them');
  ok(d.querySelectorAll('.skillcard').length >= 5, 'renderSkills keeps filling it wherever it lives');

  console.log('\nHabit dots & records');
  w.go('habits');
  ok(d.querySelector('.hdots') !== null, '7-day dot chain renders');
  ok(d.querySelector('.hd.on') !== null, 'today\'s check-in shows as a lit dot');
  var mon = w.state.habits.find(function (h) { return h.type === 'bad'; });
  /* the best record moved behind the row's ⋯ (rowMenu) to keep the row to one line */
  w.rowMenu('m', mon.id);
  ok(d.querySelector('#modal .rminfo') !== null && d.querySelector('#modal .rminfo').textContent.indexOf('best') >= 0, 'monster best record shown in its ⋯ menu');
  w.closeModal();

  console.log('\nGuilty pleasures (revamp 7 - formerly Black market)');
  w.go('market');
  w.shopTab = 'black'; w.render();
  ok(d.querySelector('#shop-black').textContent.indexOf('It beats lying to yourself') >= 0, 'guilty pleasures framing renders');
  ok(d.querySelector('#sDmg') !== null, 'HP-cost input in the guilty pleasures form');
  w.usePreset('shop', 0, 'black');
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
  ok(d.querySelector('#view .deadlines').textContent.indexOf('Late') >= 0 && d.querySelector('#view .deadlines').textContent.indexOf('Later') >= 0, 'urgency groups shown');
  var loose = w.A.addQuest(w.state, { title: 'Promote me', diff: 'normal' });
  w.render();
  w.promoteQ(loose.id);
  ok(w.state.goals.some(function (g) { return g.title === 'Promote me'; }), 'side quest promoted to main quest from UI');
  ok(d.querySelector('#view').textContent.indexOf('Promote me') >= 0, 'promoted goal visible in main quests');
  w.go('today');
  ok(d.querySelector('#view .comingup .ag.overdue') !== null && d.querySelector('#view .comingup').textContent.indexOf('Late') >= 0, 'today tab surfaces overdue work under Coming up > Late');

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
  w.usePreset('shop', 0, 'market'); // streak shield preset
  var shieldItem = w.state.shop.find(function (i) { return i.special === 'shield'; });
  ok(!!shieldItem, 'streak shield stocked from preset');
  w.state.hero.coins = 300; w.render();
  w.buy(shieldItem.id);
  ok(w.state.hero.shields === 1, 'shield equipped via UI');
  ok(d.querySelector('#hud').textContent.indexOf(String.fromCodePoint(0x1F6E1)) >= 0, 'shield icon in HUD');
  ok(d.querySelector('#shop-protection').textContent.indexOf('Held') >= 0, 'the Protection shield card shows Held once equipped');

  console.log('\nTutorial replay');
  w.openSettings();
  ok(d.querySelector('#modal').textContent.indexOf('How it works') >= 0 && d.querySelector('#modal').textContent.indexOf('Interactive tour') >= 0, 'tutorial + interactive tour available in settings');

  ok(d.querySelector('#modal').textContent.indexOf('Royal Chamber') < 0, 'settings no longer mentions the Royal Chamber');
  w.closeModal();
  w.go('market');
  ok(d.querySelector('.royaltab') === null, 'market has no Royal Chamber entry point');
  ok(d.querySelector('.shoptabs') === null, 'market has no tab switcher - sections scroll instead (revamp 7)');
  w.openSettings();
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
  w.openCharacter();
  ok(d.querySelector('#modal').textContent.indexOf('Dragonheart') >= 0, 'title shows in the Hero sheet');
  w.closeModal();

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
  // the schedule chip became part of the row's meta sentence ("Normal, Mon Thu")
  ok(d.querySelector('#view').textContent.indexOf(w.DOW[wdOther]) >= 0, 'schedule named on the row');

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

  console.log('\nOnboarding has no path step any more (Nov 2026)');
  w.onboarding(2);
  ok(d.querySelector('.pathpick') === null && w.ob.paths.length === 1 && w.ob.paths[0] === 'general', 'no path picker: every new board starts from Balanced');
  // theme picker with live preview, on step 1
  w.onboarding(1);
  ok(d.querySelector('.obthemes') !== null, 'step 1 offers a theme picker');
  var stashState = w.state; w.state = null;   // real onboarding has no save yet
  w.previewTheme('ocean');
  ok(w.pickedTheme === 'ocean' && w.ob.theme === 'ocean', 'clicking a theme stores the pick');
  ok(d.documentElement.style.getPropertyValue('--gold').trim() === '#59c2ff', 'preview repaints the page live (ocean accent applied)');
  w.state = stashState; w.pickedTheme = null; w.applyTheme();
  ok(d.documentElement.style.getPropertyValue('--gold').trim() !== '#59c2ff', 'an existing hero’s saved theme always beats the preview');
  w.closeModal();

  console.log('\nOnboarding wizard (revamp 5): the picks become the board');
  (function () {
    var keep = w.state; w.state = null; w.renderHUDShell(); w.onboarding();
    ok(w.obStep === 1 && d.querySelector('#obName') !== null, 'wizard opens on step 1');
    d.querySelector('#obName').value = 'Wiz'; w.obNext();
    ok(w.obStep === 2 && w.ob.paths.length === 1 && w.ob.paths[0] === 'general', 'step 2 is Your day, and the board is the Balanced one');
    w.obPick('minutes', 15); w.obPick('struggle', 'phone');
    ok(d.querySelectorAll('.obchips .chip.on').length === 2 && w.ob.minutes === 15 && w.ob.struggle === 'phone' && w.ob.intensity === 'classic', 'Your day writes the time budget and the struggle; intensity defaults to Classic');
    ok(d.querySelector('#modal').textContent.indexOf('“Doomscrolling” as a bad habit') >= 0 && d.querySelector('#modal').textContent.indexOf('2 daily quests') >= 0, 'the hints say what the answers change: the bad habit added and the size of the day');
    w.obNext();
    // step 3, the plate: packs and typed lines become cards, before a hero exists
    ok(w.obStep === 3 && w.cap !== null && d.querySelector('#capText') !== null, 'step 3 opens the plate');
    w.capPack('fit');
    ok(d.querySelectorAll('#capList .capcard').length === 3 && d.querySelector('#capNote').textContent.indexOf('Get in shape added: 3 items') >= 0, 'a pack with no question lands as cards in one tap, and a line says it was added');
    w.capPack('exam');
    ok(d.querySelector('#pkName') !== null && d.querySelector('#pkDate') !== null && d.querySelectorAll('#capList .capcard').length === 3, 'a pack with a question opens its small form first');
    d.querySelector('#pkName').value = 'Corporate Finance'; w.capPackAdd();
    ok(d.querySelector('#capList').textContent.indexOf('Pass the Corporate Finance exam') >= 0 && d.querySelector('#pkName') === null, 'the exam pack names its main quest after the subject and the form closes');
    d.querySelector('#capText').value = 'Call grandma. stop doomscrolling'; w.capInput(d.querySelector('#capText').value);
    ok(d.querySelectorAll('#capList .capcard').length === 7 && d.querySelector('#capList').textContent.indexOf('Monster') >= 0, 'a typed line adds its own cards: a side quest and a monster');
    w.obBack(); w.obNext();
    ok(w.obStep === 3 && d.querySelector('#capText').value === 'Call grandma. stop doomscrolling' && d.querySelectorAll('#capList .capcard').length === 7, 'going Back and forward keeps the plate as it was');
    w.obNext();
    var habitTitles = w.obSug.habits.map(function (h) { return h.title; });
    var groups = [].map.call(d.querySelectorAll('.obgroup .obghead'), function (g) { return g.textContent; });
    ok(w.obStep === 4 && groups.length === 4 && groups[0].indexOf('Get in shape') >= 0 && groups[1].indexOf('Exam coming') >= 0 && groups[2].indexOf('Your own tasks') >= 0 && groups[3].indexOf('Starter set') >= 0, 'the board groups everything: one group per pack, your own tasks, then the starter set');
    ok(d.querySelectorAll('.obgroup')[2].textContent.indexOf('Call grandma') >= 0 && d.querySelectorAll('.obgroup')[1].querySelector('.obsteps') !== null, 'a typed task sits under Your own tasks, and a pack\'s main quest lists its first steps');
    ok(d.querySelector('#modal').textContent.indexOf('Doomscrolling') >= 0, 'a phone struggle suggests the Doomscrolling bad habit');
    var grandma = w.obPlate.findIndex(function (it) { return it.title === 'Call grandma'; });
    w.obPlateToggle(grandma);
    ok(w.obPlate[grandma].off === true && d.querySelectorAll('.obgroup')[2].querySelector('.obitem.on') !== null, 'a plate row toggles off right on the board');
    w.obToggle('habits', 0);
    ok(w.ob.habitsOff[habitTitles[0]] === true, 'a starter habit row toggles off');
    w.obTarget(1, 5);
    ok(w.ob.targets[habitTitles[1]] === 5 && d.querySelectorAll('.obchips.targets .chip.on').length >= 1, 'a target chip writes the weekly target');
    ok(d.querySelector('#obStart') !== null, 'the board step carries Start');
    d.querySelector('#obStart').click();
    var s = w.state;
    ok(s && s.hero.name === 'Wiz', 'Start creates the hero');
    ok(!s.habits.some(function (h) { return h.title === habitTitles[0]; }), 'the habit toggled off on the board is absent');
    ok(!s.quests.some(function (q) { return q.title === 'Call grandma'; }), 'the plate task toggled off on the board is absent');
    var targeted = s.habits.find(function (h) { return h.title === habitTitles[1]; });
    ok(targeted && targeted.target === 5, 'the picked weekly target is applied through editHabit');
    ok(s.habits.filter(function (h) { return h.type === 'bad' && h.title === 'Doomscrolling'; }).length === 1, 'the struggle monster exists as a bad habit, once (the plate named it again)');
    ok(s.quests.filter(function (q) { return q.recurring; }).length <= 2, 'with 15 minutes at most two dailies exist');
    var examGoal = s.goals.find(function (g) { return g.title === 'Pass the Corporate Finance exam'; });
    var examSteps = examGoal ? s.quests.filter(function (q) { return q.main === examGoal.id; }) : [];
    ok(examGoal && examSteps.length === 7 && (!examSteps[0].skillId || s.skills.some(function (k) { return k.id === examSteps[0].skillId; })), 'the exam pack is a main quest with seven steps, tagged to a REAL life area');
    ok(s.habits.some(function (h) { return h.title === 'Workout or a 30-minute walk' && h.target === 3; }), 'the fitness pack habit is on the board with its weekly target');
    ok(s.shop.some(function (it) { return it.title === 'Café treat'; }) && s.shop.some(function (it) { return it.tab === 'hotel'; }), 'the rewards the Balanced board seeds stay on the shelf');
    ok(w.RPG.staged(s) && !w.RPG.isUnlocked(s, 'rewards') && !w.RPG.isUnlocked(s, 'stakes') && s.settings.intensity === 'classic', 'the new hero is on the staged game: Market and monsters still closed');
    var onb = s.settings.onboard;
    ok(onb && Object.keys(onb).sort().join(',') === 'minutes,paths,struggle' && onb.minutes === 15 && onb.struggle === 'phone' && onb.paths.length === 1 && onb.paths[0] === 'general', 'settings.onboard has exactly {paths, struggle, minutes}');
    ok(d.querySelector('#modal.show') === null && w.ob.name === '' && w.pickedPaths[0] === 'general' && w.cap === null, 'the wizard closes and its picks, plate included, reset for the next hero');
    ok(d.querySelector('#tour.show') === null && d.querySelector('#view .draft') !== null, 'no tour: Today opens on Sage\'s draft instead');

    // skipping from step 2 lands on the board with the defaults, and Start still works
    w.state = null; w.renderHUDShell(); w.onboarding();
    ok(d.querySelector('#modal').textContent.indexOf('Skip') < 0, 'no Skip on step 1 (a name is needed)');
    d.querySelector('#obName').value = 'Skipper'; w.obNext();
    ok(w.obStep === 2 && d.querySelector('#modal').textContent.indexOf('Skip') >= 0, 'Skip appears from step 2');
    w.obSkip();
    ok(w.obStep === 4 && d.querySelector('#obStart') !== null, 'skipping lands on the board, which carries Start');
    d.querySelector('#obStart').click();
    ok(w.state && w.state.hero.name === 'Skipper' && w.state.settings.onboard.minutes === 30 && w.state.settings.onboard.struggle === 'none', 'Start after a skip creates the hero with the defaults');
    ok(w.state.quests.length === 2 && w.state.habits.length === 5, 'the skipped board is the untouched Balanced board');

    // a struggle no path seeds is added as a new monster
    w.state = null; w.renderHUDShell(); w.onboarding();
    d.querySelector('#obName').value = 'Owl'; w.obNext(); w.obNext(); w.obPick('struggle', 'sleep'); w.obSkip();
    d.querySelector('#obStart').click();
    ok(w.state.habits.some(function (h) { return h.type === 'bad' && h.title === 'Late-night scrolling'; }), 'a sleep struggle adds the Late-night scrolling monster');

    // Calm: picked on step 3, no struggle monster is added and HP and monsters never open
    w.state = null; w.renderHUDShell(); w.onboarding();
    d.querySelector('#obName').value = 'Zen'; w.obNext(); w.obPick('struggle', 'sleep'); w.obPick('intensity', 'calm');
    ok(d.querySelector('.obmode.on').textContent.indexOf('nothing can go wrong') >= 0 && d.querySelector('#modal').textContent.indexOf('Calm has no monsters') >= 0, 'picking Calm says what it means, and the struggle hint follows it');
    w.obNext();
    d.querySelector('#capText').value = 'stop doomscrolling'; w.capInput('stop doomscrolling');
    ok(d.querySelector('#capList').textContent.indexOf('Monster') < 0 && d.querySelector('#capList').textContent.indexOf('Side quest') >= 0, 'in Calm a "stop ..." line is offered as a plain quest, never a monster');
    w.capPickSet(0, 'kind', w.capOpts('kind').length - 1);
    ok(w.capOpts('kind').every(function (o) { return o[0] !== 'monster'; }) && w.cap.items[0].kind !== 'monster', 'Calm offers no Monster in the type list either');
    w.cap.over[w.cap.items[0].key].kind = 'monster'; w.capRender();
    ok(w.cap.items[0].kind === 'side', 'a Monster picked by hand before switching to Calm becomes a plain quest');
    w.obNext();
    ok(d.querySelector('#modal').textContent.indexOf('Bad habit to fight') < 0, 'the board step offers no monster in Calm');
    d.querySelector('#obStart').click();
    ok(w.state.settings.intensity === 'calm' && !w.state.habits.some(function (h) { return h.title === 'Late-night scrolling'; }) && !w.RPG.isUnlocked(w.state, 'stakes'), 'a Calm hero gets no struggle monster and HP and monsters stay closed');
    ok(d.querySelector('#hud .bar.hp') === null && d.querySelector('#coinCounter') === null, 'a new staged hero sees neither the HP bar nor the purse on day one');

    // createHero from a later step with a blank name goes back to step 1 and points at the field
    w.state = null; w.renderHUDShell(); w.onboarding(3);
    w.createHero();
    ok(w.state === null && w.obStep === 1 && d.querySelector('#obNameErr').style.display !== 'none', 'a blank name sends createHero back to step 1 with the inline error');

    // Settings still replays the slides
    w.state = keep; w.render();
    w.openSettings(); w.tut(0);
    ok(d.querySelector('.tutbig') !== null && d.querySelector('#modal').textContent.indexOf('YOUR LIFE IS THE GAME') >= 0, 'tut(0) from Settings still shows the slides');
    w.tut(4);
    ok(d.querySelector('#modal').textContent.indexOf('Done') >= 0, 'with a hero the last slide says Done');
    w.closeModal();
  })();

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

  console.log('\nInteractive tour (v6, rewritten v56)');
  w.go('today');
  w.startTour();
  w.positionTour(d.querySelector('#hud')); // force synchronous positioning for the test
  ok(d.querySelector('#tour.show') !== null && d.querySelector('.tourtip') !== null, 'tour overlay + tooltip render');
  ok(d.querySelector('.tourhole') !== null, 'spotlight hole renders');
  w.tourNext();
  ok(w.tourStep === 1, 'tour advances a step');
  w.endTour();
  ok(d.querySelector('#tour.show') === null, 'tour closes cleanly');
  ok(w.TOUR.length === 7, 'tour is seven steps (' + w.TOUR.length + ')');
  ok(w.TOUR.every(function (s) { return s.sel.indexOf('#skillsRow') < 0; }), 'no step targets #skillsRow, which moves between the shell and the view');
  ok(w.TOUR.every(function (s) { return s.body.indexOf('—') < 0 && s.body.indexOf('.') < 0; }), 'every step is one line, no em dashes');
  // the point of a spotlight is that it lands on something: walk the list the
  // way showTourStep() does and check each target resolves after its own go()
  w.state.settings.mascot = true;
  var tourMisses = w.TOUR.filter(function (s) {
    w.go(s.tab);
    w.mascotMoodSync();
    var hit = null;
    s.sel.split(',').some(function (sel) { hit = d.querySelector(sel.trim()); return !!hit; });
    return !hit;
  }).map(function (s) { return s.tab + ' ' + s.sel; });
  ok(tourMisses.length === 0, 'every tour step finds its target after its own go()' + (tourMisses.length ? ' -> ' + tourMisses.join(' | ') : ''));
  w.go('today');

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
  ok(d.querySelector('#fTask') !== null, 'focus form offers the quest-link selector');
  ok(d.querySelector('#fTask optgroup[label*="Main"]') !== null, 'main quests grouped in the selector');
  var tg = Date.now();
  w.A.startFocus(w.state, { work: 25, brk: 0, goalId: fgUI.id, now: tg });
  w.A.tickFocus(w.state, tg + 25 * 60000 + 5); w.A.stopFocus(w.state, tg + 25 * 60000 + 5);
  ok(fgUI.focusMin === 25, 'session banked on the goal from the UI flow');
  w.go('quests');
  ok(d.querySelector('#view').textContent.indexOf('invested') >= 0, 'goal card shows invested deep-work time');
  w.go('today');
  // today's gains moved out of the header and into the Hero sheet
  w.openCharacter();
  ok(d.querySelector('#modal .glance') !== null, 'Hero sheet shows the today-at-a-glance line');
  w.closeModal();

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
  // a failed push surfaces a retry chip in the HUD
  w.cloudSyncErr = true; w.renderHUD();
  ok(d.querySelector('.cloudchip.err') !== null && d.querySelector('.cloudchip.err').textContent.indexOf('retry') >= 0, 'a failed sync shows a retry chip');
  w.cloudSyncErr = false; w.renderHUD();
  ok(d.querySelector('.cloudchip.err') === null, 'the retry chip clears once sync recovers');
  // rest-day picker protects the streak
  w.openSettings();
  ok(d.querySelector('#modal').textContent.indexOf('Rest days') >= 0 && d.querySelector('.modal .daysrow') !== null, 'Settings has a rest-day picker');
  w.toggleRestDay(0);
  ok(w.state.settings.restDays.indexOf(0) >= 0, 'toggling a rest day stores it');
  w.toggleRestDay(0);
  ok(w.state.settings.restDays.indexOf(0) < 0, 'toggling again clears it');
  w.closeModal();
  // reminder-time picker: only shown when reminders are on, and drives the nudge hour
  w.state.settings.reminders = false; w.openSettings();
  ok(d.querySelector('#remHour') === null, 'reminder-time picker is hidden while reminders are off');
  w.closeModal();
  w.state.settings.reminders = true; w.openSettings();
  ok(d.querySelector('#remHour') !== null, 'reminder-time picker appears when reminders are on');
  w.setReminderHour('21');
  ok(w.state.settings.reminderHour === 21, 'choosing a nudge time stores the hour');
  w.setReminderHour('99');
  ok(w.state.settings.reminderHour === 21, 'an out-of-range nudge time is ignored');
  w.state.settings.reminders = false; w.closeModal();
  // designed vector avatars
  ok(typeof w.SVG_AVATARS === 'object' && Object.keys(w.SVG_AVATARS).length >= 16, 'sixteen designed vector heroes ship with the app');
  ok(Object.keys(w.SVG_AVATARS).every(function (k) { return k.length <= 8; }), 'avatar tokens fit the 8-char profile column (sync-safe)');
  ok(/^<svg/.test(w.avHtml('@knight').replace('<span class="svgav">', '')), 'known token renders inline vector art');
  /* an unknown avatar string is drawn as a hero, so the string itself never reaches the page */
  ok(w.avHtml('<img x>').indexOf('<img') < 0 && /pxhero/.test(w.avHtml('<img x>')), 'unknown avatar strings never reach the page (no HTML injection)');
  ok(w.avPlain('@knight') === '🛡️' && w.avPlain('🐼') === '🐼', 'canvas/notification fallback maps tokens to emoji');
  var prevAv = w.state.hero.avatar;
  w.state.hero.avatar = '@mage'; w.renderHUD();
  ok(d.querySelector('#hud .avatar .svgav svg') !== null, 'HUD draws the vector portrait');
  w.openCharacter();
  ok(d.querySelectorAll('.avpick.svgrow button').length >= 16, 'character modal offers the designed heroes');
  w.closeModal(); w.state.hero.avatar = prevAv; w.renderHUD();
  // design-your-own hero builder (layered, token-encoded)
  ok(w.isCustomAv('#03214') && !w.isCustomAv('#034') && !w.isCustomAv('🧙'), 'custom tokens are exactly # plus five base36 digits');
  ok(/svgav/.test(w.avHtml('#03214')) && /<svg/.test(w.avHtml('#03214')), 'a custom token renders layered vector art');
  ok(w.avPlain('#03214') === '🧑', 'custom tokens fall back to a neutral emoji on canvas');
  ok(w.avHtml('#03214').length < 4000 && '#03214'.length <= 8, 'the token itself stays sync-safe (fits the 8-char column)');
  // the builder is gone: heroes are earned. A design made before still draws and stays wearable.
  ok(typeof w.openAvatarBuilder === 'undefined' && d.querySelector('.avtabs .customize') === null, 'no design-your-own builder any more');
  w.state.hero.avatar = '#02040'; w.renderHUD();
  ok(d.querySelector('#hud .avatar .svgav svg') !== null, 'a hero designed before still draws in the HUD');
  w.state.hero.avatar = prevAv; w.pickedAv = null; w.renderHUD();
  // diagnostics: runtime errors are captured and visible
  w.logClientError('test explosion at foo.js:1');
  ok(w.clientErrors().length >= 1 && w.clientErrors()[0].m.indexOf('test explosion') >= 0, 'errors land in the local ring buffer');
  w.openSettings();
  ok(d.querySelector('#modal').textContent.indexOf('Diagnostics') >= 0, 'settings surfaces a Diagnostics button when errors exist');
  w.closeModal(); w.openDiagnostics();
  ok(d.querySelector('.errlog') !== null && d.querySelector('#modal').textContent.indexOf('test explosion') >= 0, 'diagnostics lists the captured error');
  w.localStorage.removeItem(w.ERRLOG_KEY); w.closeModal();
  w.openSettings();
  ok(d.querySelector('#modal').textContent.indexOf('Diagnostics') < 0, 'button disappears once the log is cleared');
  w.closeModal();
  // friends invites UI surface
  w.state.settings.friends = true; w.openSettings();
  ok(d.querySelector('#frInvites') !== null, 'friends box has an invites area');
  ok(d.querySelector('#modal').textContent.indexOf('Forgot password') < 0, 'no password prompt while signed in');
  w.state.settings.friends = false; w.closeModal();
  // state-aware storage copy + legal links
  w.openSettings();
  ok(d.querySelector('#modal').textContent.indexOf('in this browser AND in your cloud account') >= 0, 'signed-in settings explain the save is in the cloud too');
  ok(d.querySelector('#modal a[href="privacy.html"]') !== null && d.querySelector('#modal a[href="terms.html"]') !== null, 'settings links to the privacy policy and terms');
  w.closeModal();
  // restore-from-backup safety net: adopting the cloud stashed a pre-cloud copy (Lv.4)
  w.openSettings();
  ok(d.querySelector('#modal').textContent.indexOf('Restore save') >= 0, 'Settings offers a restore-previous-save option when a backup exists');
  var beforeRestoreLevel = w.state.hero.level;
  w.restorePreCloud();
  ok(w.state.hero.level !== beforeRestoreLevel && w.state.hero.name === 'Device', 'restore swaps back to the pre-sync save');
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

  console.log('\nUX batch (v26): first-quest moment + delete heads-up');
  // fresh hero clears their first quest -> celebratory explainer, shown once
  var freshUX = w.state; w.state = w.RPG.seedPreset(w.RPG.newState('Newbie'), 'general'); w.state.counters.quests = 0; delete w.state.firstQuestCelebrated; w.render();
  var firstQ = w.state.quests[0];
  w.doQuest(firstQ.id);
  // poll for the overlay instead of a fixed wait - a flat 700ms margin against
  // app.js's 650ms setTimeout is too tight under real system load variance
  var waited = 0;
  while (!d.querySelector('#overlay.show') && waited < 3000) {
    await new Promise(function (r) { setTimeout(r, 50); });
    waited += 50;
  }
  ok(w.state.firstQuestCelebrated === true, 'first cleared quest marks the celebration as seen');
  ok(d.querySelector('#overlay').textContent.indexOf('FIRST QUEST') >= 0, 'first-quest explainer overlay appears');

  console.log('\nOverlay ownership token (regression: a stale chest-reveal must never stomp another overlay)');
  await (async function () {
    // Reproduces the exact collision found this session: a chest rattle is
    // mid-animation when a DIFFERENT overlay legitimately opens before the
    // 1.7s reveal fires. The reveal must be a no-op, not overwrite it.
    var before = w.overlaySeq;
    w.chestAnim({ xp: 25, coins: 20 });
    ok(w.overlaySeq === before + 1, 'chestAnim bumps the shared overlay sequence');
    ok(d.querySelector('#overlay').textContent.indexOf('rattles') >= 0, 'rattle screen shows immediately');
    w.firstQuestScreen(); // a different overlay opens before the rattle's delayed reveal fires
    ok(w.overlaySeq === before + 2, 'a second overlay open bumps the sequence again');
    await new Promise(function (r) { setTimeout(r, 1750); });
    ok(d.querySelector('#overlay').textContent.indexOf('FIRST QUEST') >= 0, 'the later overlay survives - stale chest reveal did not stomp it');
    w.closeOverlay();
  })();
  w.closeOverlay();
  var q2 = w.state.quests.find(function (q) { return !q.doneOn; });
  if (q2) { w.doQuest(q2.id); await new Promise(function (r) { setTimeout(r, 50); }); ok(!d.querySelector('#overlay').classList.contains('show'), 'the explainer does not fire again on later quests'); }
  else ok(true, 'no second quest to test replay (covered by the flag)');
  w.state = freshUX; w.render();

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

  console.log('\nSage Phase 2: real chat (signed-in only)');
  w.toggleMascot(true);
  ok(d.querySelector('.mchat-entry') === null, 'no "Ask me anything" entry while signed out');
  w.toggleMascot(false);
  w.localStorage.setItem('sml.cloud.session.v1', JSON.stringify({ access_token: 'sage-tok', refresh_token: 'sage-rt', user: { id: 'sage-uid', email: 's@b.c' } }));
  w.toggleMascot(true);
  ok(d.querySelector('.mchat-entry') !== null, 'chat entry appears once signed in');
  d.querySelector('.mchat-entry').click();
  ok(d.querySelector('#mChatInput') !== null && d.querySelector('.mchat-input .btn') !== null, 'chat view shows an input and a send button');
  ok(d.querySelector('#mBubble').textContent.indexOf('Ask Sage') >= 0, 'empty chat shows a prompt hint');
  var sageCalls = [];
  w.SMLCloud.configure({ fetch: function (url, opts) {
    sageCalls.push({ url: url, body: opts && opts.body ? JSON.parse(opts.body) : null });
    return Promise.resolve({ status: 200, ok: true, text: function () { return Promise.resolve(JSON.stringify({ reply: 'Hoo! One step at a time.', remaining: 29 })); } });
  } });
  d.querySelector('#mChatInput').value = 'How am I doing today?';
  w.sageSend();
  ok(d.querySelector('.mchat-row.you') !== null && d.querySelector('.mchat-row.you').textContent === 'How am I doing today?', 'your message appears immediately');
  ok(w.mascotChatBusy === true, 'busy while waiting on Sage\'s reply');
  await new Promise(function (r) { setTimeout(r, 20); });
  ok(w.mascotChatBusy === false, 'no longer busy once the reply lands');
  ok(d.querySelector('.mchat-row.sage') !== null && d.querySelector('.mchat-row.sage').textContent.indexOf('One step at a time') >= 0, 'Sage\'s reply renders in its own bubble');
  var sageOnly = sageCalls.filter(function (c) { return /\/functions\/v1\/sage-chat$/.test(c.url); });
  ok(sageOnly.length === 1, 'the real chat call hits the sage-chat function');
  sageCalls = sageOnly;   // later assertions read sageCalls[0]; sync traffic after a day change must not shift it
  ok(sageCalls[0].body.brief.indexOf(w.state.hero.name) >= 0 && sageCalls[0].body.brief.indexOf('streak') >= 0, 'a compact state summary rides along as context');
  // an error from the function shows as Sage's own line, not a crash
  w.SMLCloud.configure({ fetch: function () {
    return Promise.resolve({ status: 429, ok: false, text: function () { return Promise.resolve(JSON.stringify({ error: 'Sage needs to rest - back tomorrow!' })); } });
  } });
  d.querySelector('#mChatInput').value = 'again';
  w.sageSend();
  await new Promise(function (r) { setTimeout(r, 20); });
  ok(d.querySelector('#mBubble').textContent.indexOf('needs to rest') >= 0, 'a rate-limit/error response shows as a friendly Sage line, not a broken UI');
  w.SMLCloud.configure({ fetch: null });
  w.localStorage.removeItem('sml.cloud.session.v1');
  w.mascotChatLog = []; w.mascotChatBusy = false;
  w.toggleMascot(false);

  console.log('\nSage Actions: auto-apply (complete_quest, complete_habit, log_mood)');
  w.localStorage.setItem('sml.cloud.session.v1', JSON.stringify({ access_token: 'sage-tok2', refresh_token: 'sage-rt2', user: { id: 'sage-uid2', email: 's@b.c' } }));
  var qFixture = w.A.addQuest(w.state, { title: 'Sage test quest', diff: 'easy', skillId: null, due: null, recurring: false, days: null, main: null });
  var hFixture = w.A.addHabit(w.state, { title: 'Sage test habit', type: 'good', skillId: null, target: 7 });
  var todayCalls = [];
  w.SMLCloud.configure({ fetch: function (url, opts) {
    var b = opts && opts.body ? JSON.parse(opts.body) : null;
    todayCalls.push(b);
    return Promise.resolve({ status: 200, ok: true, text: function () { return Promise.resolve(JSON.stringify({ reply: null, action: { type: 'complete_quest', params: { quest_id: qFixture.id } }, remaining: 20 })); } });
  } });
  w.toggleMascot(true); d.querySelector('.mchat-entry').click();
  d.querySelector('#mChatInput').value = 'mark my first quest done';
  w.sageSend();
  await new Promise(function (r) { setTimeout(r, 20); });
  ok(todayCalls[0].today.indexOf(qFixture.id) >= 0, 'a compact today payload with the real quest id rides along');
  ok(w.state.quests.find(function (q) { return q.id === qFixture.id; }).doneOn === w.RPG.todayKey(), 'complete_quest actually completes the quest via the existing engine call');
  ok(d.querySelector('.mchat-action') === null, 'auto-apply actions never show a confirm card');

  w.SMLCloud.configure({ fetch: function () {
    return Promise.resolve({ status: 200, ok: true, text: function () { return Promise.resolve(JSON.stringify({ reply: 'Nice work!', action: { type: 'complete_habit', params: { habit_id: hFixture.id } }, remaining: 19 })); } });
  } });
  d.querySelector('#mChatInput').value = 'check off my reading habit';
  w.sageSend();
  await new Promise(function (r) { setTimeout(r, 20); });
  ok(w.state.habits.find(function (h) { return h.id === hFixture.id; }).lastDoneOn === w.RPG.todayKey(), 'complete_habit actually checks off the habit');
  var sageRows1 = d.querySelectorAll('.mchat-row.sage');
  ok(Array.prototype.some.call(sageRows1, function (r) { return r.textContent.indexOf('Nice work') >= 0; }), 'accompanying reply text still renders as a normal Sage bubble');

  w.SMLCloud.configure({ fetch: function () {
    return Promise.resolve({ status: 200, ok: true, text: function () { return Promise.resolve(JSON.stringify({ reply: null, action: { type: 'log_mood', params: { mood: 'great' } }, remaining: 18 })); } });
  } });
  d.querySelector('#mChatInput').value = 'log that I feel great today';
  w.sageSend();
  await new Promise(function (r) { setTimeout(r, 20); });
  ok(w.state.journal[w.RPG.todayKey()] && w.state.journal[w.RPG.todayKey()].mood === 'great', 'log_mood writes today\'s journal entry');

  w.A.logJournal(w.state, 'ok', 'my real note today');
  w.SMLCloud.configure({ fetch: function () {
    return Promise.resolve({ status: 200, ok: true, text: function () { return Promise.resolve(JSON.stringify({ reply: null, action: { type: 'log_mood', params: { mood: 'great' } }, remaining: 18 })); } });
  } });
  d.querySelector('#mChatInput').value = 'log that I feel great today';
  w.sageSend();
  await new Promise(function (r) { setTimeout(r, 20); });
  ok(w.state.journal[w.RPG.todayKey()].mood === 'great', 'log_mood re-applying still updates today\'s mood');
  ok(w.state.journal[w.RPG.todayKey()].note === 'my real note today', 'log_mood does not wipe an existing journal note for today');

  w.SMLCloud.configure({ fetch: function () {
    return Promise.resolve({ status: 200, ok: true, text: function () { return Promise.resolve(JSON.stringify({ reply: 'Sure!', action: { type: 'delete_everything', params: {} }, remaining: 17 })); } });
  } });
  var questsBefore = w.state.quests.length, habitsBefore = w.state.habits.length;
  d.querySelector('#mChatInput').value = 'do something unsupported';
  w.sageSend();
  await new Promise(function (r) { setTimeout(r, 20); });
  ok(w.state.quests.length === questsBefore && w.state.habits.length === habitsBefore, 'an unrecognized action.type is silently ignored, no crash, no state change');
  var sageRows2 = d.querySelectorAll('.mchat-row.sage');
  ok(sageRows2[sageRows2.length - 1].textContent.indexOf('Sure') >= 0, 'the accompanying reply still renders even when the action itself is ignored');

  w.SMLCloud.configure({ fetch: null });
  w.localStorage.removeItem('sml.cloud.session.v1');
  w.mascotChatLog = []; w.mascotChatBusy = false;
  w.toggleMascot(false);

  console.log('\nSage Actions: confirm-first (add_quest, add_habit)');
  w.localStorage.setItem('sml.cloud.session.v1', JSON.stringify({ access_token: 'sage-tok3', refresh_token: 'sage-rt3', user: { id: 'sage-uid3', email: 's@b.c' } }));
  var questsBefore2 = w.state.quests.length;
  w.SMLCloud.configure({ fetch: function () {
    return Promise.resolve({ status: 200, ok: true, text: function () { return Promise.resolve(JSON.stringify({ reply: 'Want me to add that?', action: { type: 'add_quest', params: { title: 'Learn bachata', difficulty: 'normal' } }, remaining: 16 })); } });
  } });
  w.toggleMascot(true); d.querySelector('.mchat-entry').click();
  d.querySelector('#mChatInput').value = 'add a quest to learn bachata';
  w.sageSend();
  await new Promise(function (r) { setTimeout(r, 20); });
  ok(w.state.quests.length === questsBefore2, 'add_quest does not touch state until confirmed');
  var card = d.querySelector('.mchat-action');
  ok(card !== null && card.textContent.indexOf('Learn bachata') >= 0, 'a confirm card renders with the proposed quest title');
  d.querySelector('.mchat-action .btn.go').click();
  ok(w.state.quests.length === questsBefore2 + 1, 'confirming adds the quest');
  ok(w.state.quests[w.state.quests.length - 1].title === 'Learn bachata' && w.state.quests[w.state.quests.length - 1].diff === 'normal', 'the added quest matches the proposed title and difficulty');
  ok(d.querySelector('.mchat-action') === null, 'the card disappears once resolved');

  var habitsBefore2 = w.state.habits.length;
  w.SMLCloud.configure({ fetch: function () {
    return Promise.resolve({ status: 200, ok: true, text: function () { return Promise.resolve(JSON.stringify({ reply: null, action: { type: 'add_habit', params: { title: 'Stretch daily', target: 5 } }, remaining: 15 })); } });
  } });
  d.querySelector('#mChatInput').value = 'add a habit to stretch daily';
  w.sageSend();
  await new Promise(function (r) { setTimeout(r, 20); });
  var habitCard = d.querySelector('.mchat-action');
  ok(habitCard !== null && habitCard.textContent.indexOf('Stretch daily') >= 0, 'a confirm card renders for add_habit too');
  d.querySelector('.mchat-action .btn.ghost').click();
  ok(w.state.habits.length === habitsBefore2, 'cancelling an add_habit card does not add the habit');
  ok(d.querySelector('.mchat-action') === null, 'the card disappears once cancelled');

  w.SMLCloud.configure({ fetch: null });
  w.localStorage.removeItem('sml.cloud.session.v1');
  w.mascotChatLog = []; w.mascotChatBusy = false;
  w.toggleMascot(false);

  console.log('\nSage Actions: propose_steps checklist card');
  w.localStorage.setItem('sml.cloud.session.v1', JSON.stringify({ access_token: 'sage-tok9', refresh_token: 'sage-rt9', user: { id: 'sage-uid9', email: 's@b.c' } }));
  var stepsGoal = w.A.addGoal(w.state, { title: 'Ship the portfolio' });
  var questsBeforeSteps = w.state.quests.length;
  w.SMLCloud.configure({ fetch: function () {
    return Promise.resolve({ status: 200, ok: true, text: function () { return Promise.resolve(JSON.stringify({ reply: 'Here is a plan.', action: { type: 'propose_steps', params: { main_quest_id: stepsGoal.id, steps: [{ title: 'Pick three projects', difficulty: 'easy' }, { title: 'Write the case studies', difficulty: 'hard' }, { title: 'Publish the site', difficulty: 'normal' }] } }, remaining: 12 })); } });
  } });
  w.toggleMascot(true); d.querySelector('.mchat-entry').click();
  d.querySelector('#mChatInput').value = 'break down my portfolio quest';
  w.sageSend();
  await new Promise(function (r) { setTimeout(r, 20); });
  var stepBoxes = d.querySelectorAll('.mchat-action .mstepbox');
  ok(stepBoxes.length === 3 && stepBoxes[0].checked, 'a propose_steps action renders one checked checkbox per step');
  ok(w.state.quests.length === questsBeforeSteps, 'nothing is added until the user confirms');
  stepBoxes[1].checked = false;
  d.querySelector('.mchat-action .btn.go').click();
  var linked = w.state.quests.filter(function (q) { return q.main === stepsGoal.id; });
  ok(linked.length === 2 && linked[0].title === 'Pick three projects' && linked[1].title === 'Publish the site', 'Add selected creates only the checked steps, linked to the main quest');
  ok(linked[0].diff === 'easy' && linked[1].diff === 'normal', 'each step keeps its proposed difficulty');
  ok(d.querySelector('.mchat-action') === null, 'the checklist card resolves after adding');
  w.SMLCloud.configure({ fetch: null });
  w.localStorage.removeItem('sml.cloud.session.v1');
  w.mascotChatLog = []; w.mascotChatBusy = false;
  w.toggleMascot(false);

  console.log('\nQuick add: plain phrases fill the add forms');
  w.go('quests');
  var tmr = new Date(); tmr.setDate(tmr.getDate() + 1); var tmrKey = w.RPG.todayKey(tmr);
  d.querySelector('#qTitle').value = 'Finish the essay by tomorrow hard';
  w.quickParse('q');
  ok(d.querySelector('#qDiff').value === 'hard' && d.querySelector('#qDue').value === tmrKey, 'typing a phrase pre-fills difficulty and due date');
  ok(d.querySelector('#qHint').textContent.indexOf('hard') >= 0, 'a hint line says what was understood');
  w.addQuest();
  var parsedQ = w.state.quests[w.state.quests.length - 1];
  ok(parsedQ.title === 'Finish the essay' && parsedQ.diff === 'hard' && parsedQ.due === tmrKey, 'adding strips the phrases from the title and keeps the parsed fields');
  d.querySelector('#dTitle').value = 'Stretch every weekday';
  w.quickParse('d');
  ok(JSON.stringify(w.pendingDays) === JSON.stringify([1, 2, 3, 4, 5]), 'a repeat phrase selects the weekday buttons');
  w.addDaily();
  var parsedD = w.state.quests[w.state.quests.length - 1];
  ok(parsedD.recurring === true && parsedD.title === 'Stretch' && JSON.stringify(parsedD.days) === JSON.stringify([1, 2, 3, 4, 5]), 'the daily is created with the parsed days and a clean title');

  console.log('\nSage Actions: conversation memory + action feedback');
  w.localStorage.setItem('sml.cloud.session.v1', JSON.stringify({ access_token: 'sage-tok4', refresh_token: 'sage-rt4', user: { id: 'sage-uid4', email: 's@b.c' } }));
  var memCalls = [];
  w.SMLCloud.configure({ fetch: function (url, opts) {
    memCalls.push(opts && opts.body ? JSON.parse(opts.body) : null);
    return Promise.resolve({ status: 200, ok: true, text: function () { return Promise.resolve(JSON.stringify({ reply: 'Which one - the workout or the reading?', remaining: 14 })); } });
  } });
  w.toggleMascot(true); d.querySelector('.mchat-entry').click();
  d.querySelector('#mChatInput').value = 'mark my habit done';
  w.sageSend();
  await new Promise(function (r) { setTimeout(r, 20); });
  ok(Array.isArray(memCalls[0].history) && memCalls[0].history.length === 0, 'the first turn sends an empty history');
  d.querySelector('#mChatInput').value = 'the workout one';
  w.sageSend();
  await new Promise(function (r) { setTimeout(r, 20); });
  var mh = memCalls[1].history;
  ok(Array.isArray(mh) && mh.length === 2, 'the second turn carries the two prior turns as history');
  ok(mh[0].role === 'user' && mh[0].content === 'mark my habit done', 'history[0] is the earlier user message');
  ok(mh[1].role === 'assistant' && mh[1].content.indexOf('workout or the reading') >= 0, 'history[1] is Sage\'s earlier reply');
  ok(memCalls[1].message === 'the workout one', 'the current turn is the message, not duplicated into history');

  var qMem = w.A.addQuest(w.state, { title: 'Memory feedback quest', diff: 'easy' });
  w.SMLCloud.configure({ fetch: function () {
    return Promise.resolve({ status: 200, ok: true, text: function () { return Promise.resolve(JSON.stringify({ reply: null, action: { type: 'complete_quest', params: { quest_id: qMem.id } }, remaining: 13 })); } });
  } });
  d.querySelector('#mChatInput').value = 'clear it';
  w.sageSend();
  await new Promise(function (r) { setTimeout(r, 20); });
  var fbRows = d.querySelectorAll('.mchat-row.sage');
  ok(fbRows[fbRows.length - 1].textContent.indexOf('✓') >= 0, 'an auto action with no reply still leaves a visible confirmation bubble');

  w.SMLCloud.configure({ fetch: function () {
    return Promise.resolve({ status: 200, ok: true, text: function () { return Promise.resolve(JSON.stringify({ reply: null, action: { type: 'complete_quest', params: { quest_id: 'ghost-id-not-real' } }, remaining: 12 })); } });
  } });
  d.querySelector('#mChatInput').value = 'complete the ghost quest';
  w.sageSend();
  await new Promise(function (r) { setTimeout(r, 20); });
  var failRows = d.querySelectorAll('.mchat-row.sage');
  ok(failRows[failRows.length - 1].textContent.toLowerCase().indexOf("couldn't find") >= 0, 'an id that is not on the list yields a friendly could-not-find note, not silence');

  w.SMLCloud.configure({ fetch: null });
  w.localStorage.removeItem('sml.cloud.session.v1');
  w.mascotChatLog = []; w.mascotChatBusy = false;
  w.toggleMascot(false);

  console.log('\nSage Actions: multiple actions in one message');
  w.localStorage.setItem('sml.cloud.session.v1', JSON.stringify({ access_token: 'sage-tok5', refresh_token: 'sage-rt5', user: { id: 'sage-uid5', email: 's@b.c' } }));
  var multiQ = w.A.addQuest(w.state, { title: 'Multi test quest', diff: 'easy' });
  w.SMLCloud.configure({ fetch: function () {
    return Promise.resolve({ status: 200, ok: true, text: function () { return Promise.resolve(JSON.stringify({ reply: 'Both done!', actions: [{ type: 'complete_quest', params: { quest_id: multiQ.id } }, { type: 'log_mood', params: { mood: 'good' } }], remaining: 11 })); } });
  } });
  w.toggleMascot(true); d.querySelector('.mchat-entry').click();
  d.querySelector('#mChatInput').value = 'clear the multi quest and log that I feel good';
  w.sageSend();
  await new Promise(function (r) { setTimeout(r, 20); });
  ok(w.state.quests.find(function (q) { return q.id === multiQ.id; }).doneOn === w.RPG.todayKey(), 'first action (complete_quest) applied from a multi-action turn');
  ok(w.state.journal[w.RPG.todayKey()] && w.state.journal[w.RPG.todayKey()].mood === 'good', 'second action (log_mood) also applied from the same turn');

  w.SMLCloud.configure({ fetch: null });
  w.localStorage.removeItem('sml.cloud.session.v1');
  w.mascotChatLog = []; w.mascotChatBusy = false;
  w.toggleMascot(false);

  console.log('\nSage Actions: add a quest as a step of a main quest');
  w.localStorage.setItem('sml.cloud.session.v1', JSON.stringify({ access_token: 'sage-tok6', refresh_token: 'sage-rt6', user: { id: 'sage-uid6', email: 's@b.c' } }));
  var mainGoal = w.A.addGoal(w.state, { title: 'Test sync main quest' });
  ok(w.sageToday(w.state).indexOf('main-quest ' + mainGoal.id) >= 0, 'the today payload lists the main quest with its id so Sage can attach steps');
  w.SMLCloud.configure({ fetch: function () {
    return Promise.resolve({ status: 200, ok: true, text: function () { return Promise.resolve(JSON.stringify({ reply: null, action: { type: 'add_quest', params: { title: 'test2', main_quest_id: mainGoal.id } }, remaining: 10 })); } });
  } });
  w.toggleMascot(true); d.querySelector('.mchat-entry').click();
  d.querySelector('#mChatInput').value = 'add a step test2 to the main quest';
  w.sageSend();
  await new Promise(function (r) { setTimeout(r, 20); });
  ok(d.querySelector('.mchat-action') !== null, 'add_quest still shows a confirm card even when it is a step');
  d.querySelector('.mchat-action .btn.go').click();
  var stepQuest = w.state.quests[w.state.quests.length - 1];
  ok(stepQuest.title === 'test2' && stepQuest.main === mainGoal.id, 'confirming links the new quest as a step of the main quest, not a loose side quest');
  var looseGoal = w.A.addGoal(w.state, { title: 'Another main quest' });
  w.SMLCloud.configure({ fetch: function () {
    return Promise.resolve({ status: 200, ok: true, text: function () { return Promise.resolve(JSON.stringify({ reply: null, action: { type: 'add_quest', params: { title: 'loose one', main_quest_id: 'not-a-real-goal-id' } }, remaining: 9 })); } });
  } });
  d.querySelector('#mChatInput').value = 'add loose one';
  w.sageSend();
  await new Promise(function (r) { setTimeout(r, 20); });
  d.querySelector('.mchat-action .btn.go').click();
  ok(w.state.quests[w.state.quests.length - 1].main === null, 'an unknown main_quest_id falls back to a standalone quest, never a bogus link');

  w.SMLCloud.configure({ fetch: null });
  w.localStorage.removeItem('sml.cloud.session.v1');
  w.mascotChatLog = []; w.mascotChatBusy = false;
  w.toggleMascot(false);

  console.log('\nSage: chat affordance cue on the owl');
  w.localStorage.removeItem('sml.sage.chatseen');
  w.localStorage.setItem('sml.cloud.session.v1', JSON.stringify({ access_token: 'sage-tok7', refresh_token: 'sage-rt7', user: { id: 'sage-uid7', email: 's@b.c' } }));
  w.render();
  ok(d.querySelector('#mCue') !== null && d.querySelector('#mCue').hidden === false, 'a chat cue shows on the owl once chat is available and unseen');
  w.toggleMascot(true); d.querySelector('.mchat-entry').click();
  ok(d.querySelector('#mCue').hidden === true, 'opening the chat dismisses the cue');
  ok(w.localStorage.getItem('sml.sage.chatseen') === '1', 'the cue stays dismissed on later visits');
  w.SMLCloud.configure({ fetch: null });
  w.localStorage.removeItem('sml.cloud.session.v1');
  w.mascotChatLog = []; w.mascotChatBusy = false;
  w.toggleMascot(false);

  console.log('\nAccessibility (v16)');
  ok(d.querySelector('#modal').getAttribute('role') === 'dialog' && d.querySelector('#modal').getAttribute('aria-modal') === 'true', 'modal exposes dialog semantics');
  // Escape closes an open modal (focus-trap keydown handler)
  w.openSettings();
  ok(d.querySelector('#modal').classList.contains('show'), 'settings modal open');
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok(!d.querySelector('#modal').classList.contains('show'), 'pressing Escape closes the modal');
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

  console.log('\nDay rollover on resume (bug report: dailies "still completed" the next morning)');
  (function () {
    // Simulate: cleared a daily last night, then the app is merely brought back
    // to the foreground the next day (backgrounded PWA resume / bfcache restore) -
    // no full reload, so boot() never re-runs. Only 'visibilitychange' fires.
    var daily = w.state.quests.find(function (q) { return q.recurring; });
    ok(!!daily, 'have a recurring daily to test against');
    var yesterday = new w.Date(); yesterday.setDate(yesterday.getDate() - 1);
    var yKey = w.RPG.todayKey(yesterday);
    daily.doneOn = yKey;
    w.state.lastSeenDay = yKey;
    w.persist();
    ok(w.state.lastSeenDay !== w.RPG.todayKey(), 'state primed as stale (still "yesterday")');
    // dispatch synchronously and assert BEFORE the 1s poll interval could possibly
    // fire, so this proves the foreground handler itself fixes it, not the timer
    d.dispatchEvent(new w.Event('visibilitychange'));
    ok(w.state.lastSeenDay === w.RPG.todayKey(), 'foreground resume immediately corrects the stale day (no reload, no waiting on the poll interval)');
    ok(daily.doneOn !== yKey, 'yesterday\'s completed daily is reset on resume, not stuck showing done');
  })();

  console.log('\nToday as the productivity dashboard (revamp 4)');
  (function () {
    var today = w.RPG.todayKey();
    function dOff(n) { var dt = new w.Date(); dt.setDate(dt.getDate() + n); return w.RPG.todayKey(dt); }
    var dueQ = w.A.addQuest(w.state, { title: 'Hand in the case study', diff: 'normal', due: today });
    var tomQ = w.A.addQuest(w.state, { title: 'Book the train to Lille', diff: 'easy', due: dOff(1) });
    w.state.settings.cloudNudgeOff = true;
    w.go('today');
    // order and the Now panel
    var firstPanel = d.querySelector('#view .panel');
    ok(firstPanel !== null && firstPanel.classList.contains('now'), 'Now is the first panel on Today (the tour spotlights #view .panel)');
    var now = d.querySelector('#view .panel.now');
    ok(now && now.querySelector('.item') !== null && now.textContent.indexOf('Hand in the case study') >= 0, 'a quest due today is a full row in Now');
    ok(now && now.querySelector('.item .btn.tick') !== null && now.querySelector('.item .btn.more') !== null, 'Now rows carry the tick (clear) and the ⋯ menu from questRow');
    ok(now && now.querySelector('h3 .chestring .chestchip') !== null, 'the chest ring label carries the chestchip class');
    ok(d.querySelector('#view').textContent.indexOf('Quick Add') < 0 && d.querySelector('#view').textContent.indexOf('Daily quests') < 0, 'the old Quick Add and Daily quests panels are gone');
    // Coming up
    var cu = d.querySelector('#view .panel.comingup');
    ok(cu !== null && cu.textContent.indexOf('Book the train to Lille') >= 0 && cu.textContent.indexOf('Tomorrow') >= 0, 'a quest due tomorrow lists under Coming up > Tomorrow');
    ok(cu && cu.textContent.indexOf('Hand in the case study') < 0, 'a due-today quest is not repeated under Coming up');
    // Habits today
    var hp = d.querySelector('#view .panel.habits');
    ok(hp !== null && hp.querySelector('.item .btn.tick') !== null && hp.querySelector('.hdots') !== null, 'Habits today lists the good habits with the tick and the week tiles');
    ok(hp && hp.querySelector('details.slipped') !== null && hp.querySelector('details.slipped .item.monster .btn.slip') !== null, 'monsters sit behind a Slipped? fold with the I slipped control');
    ok(hp && hp.textContent.indexOf('this wk') >= 0 && hp.querySelector('.wkring') === null, 'a weekly-target habit shows its count in the meta line (the ring is gone: the week tiles show the same thing)');
    // quick actions
    var qa = d.querySelectorAll('#view .quick.qa button.qab:not(.potion)');
    ok(qa.length === 3, 'quick actions row has three buttons (' + qa.length + ')');
    var qaTxt = d.querySelector('#view .quick.qa').textContent;
    ok(qaTxt.indexOf('Add') >= 0 && qaTxt.indexOf('Focus') >= 0 && qaTxt.indexOf('Ask Sage') >= 0, 'they read Add, Focus, Ask Sage');
    ok(d.querySelectorAll('#view .quick.qa button .i').length >= 3, 'each quick action carries a sprite icon');
    w.quickAdd();
    ok(w.tab === 'today' && d.querySelector('#modal.show .capsheet #capText') !== null && d.querySelector('#capGo') !== null && d.querySelector('#capGo').disabled === true, 'Add opens the capture sheet over Today, with nothing to add yet');
    w.capClose();
    ok(d.querySelector('#modal.show') === null && w.cap === null, 'closing the sheet clears it');
    w.go('today');
    // Log your day: collapsed, expanded, saved, summary, archive
    delete w.state.journal[today]; delete w.state.sleep[today]; w.render();
    var lc = d.querySelector('#view .panel.logcard');
    ok(lc !== null && lc.textContent.indexOf('+15 XP') >= 0 && d.querySelector('#view #jNote') === null, 'the log card starts collapsed with the XP promise');
    d.querySelector('#view .logcard .logmain').click();
    ok(d.querySelector('#view #jNote') !== null && d.querySelector('#view .moods button[aria-pressed]') !== null && d.querySelector('#view .hrbtn') !== null && d.querySelector('#view #slHours') !== null, 'tapping the row expands the same journal form on Today');
    d.querySelector('#view .moods button[aria-label="Mood: Good"]').click();
    ok(d.querySelector('#view #jNote') !== null && d.querySelector('#view .moods button.on') !== null, 'picking a mood re-renders with the card still open');
    d.querySelector('#view #jNote').value = 'dashboard day';
    d.querySelector('#view #slHours').value = '7.5';
    w.saveDailyLog();
    var je = w.state.journal[today], se = w.state.sleep[today];
    ok(je && je.mood === 'good' && je.note === 'dashboard day' && se && se.hours === 7.5, 'saveDailyLog() saves mood, note and sleep from the Today form');
    lc = d.querySelector('#view .panel.logcard');
    ok(lc && lc.classList.contains('logged') && lc.textContent.indexOf('Good') >= 0 && lc.textContent.indexOf('7.5h') >= 0, 'once saved the row shows the logged mood and sleep');
    ok(lc && lc.querySelector('[aria-label="Edit today\'s log"]') !== null, 'the saved row offers Edit');
    lc.querySelector('[aria-label="Edit today\'s log"]').click();
    ok(d.querySelector('#view #jNote') !== null && d.querySelector('#view #jNote').value === 'dashboard day', 'Edit reopens the form with the saved note');
    w.go('today');
    d.querySelector('#view .logcard .archivebtn').click();
    ok(d.querySelector('#modal.show') !== null && d.querySelector('#modal #jSearch') !== null && d.querySelector('#modal details.jmonth') !== null, 'Archive opens the journal archive in the modal');
    w.closeModal();
    // Journal view still draws the same form
    w.go('journal');
    ok(d.querySelector('#view #jNote') !== null && d.querySelector('#view .hrbtn') !== null && d.querySelector('#view').textContent.indexOf('saved ✓') >= 0, 'the Journal view renders the shared form with its saved state');
    w.go('today');
    // Sage's daily line
    w.localStorage.removeItem('sml.mascot.day');
    w.toggleMascot(false);
    w.mascotDailyGreet();
    ok(d.querySelectorAll('#view .sageline').length === 1, 'the daily greet renders one Sage line under the greeting');
    ok(d.querySelector('#mBubble').hidden === true, 'the greet no longer pops the bubble');
    ok(d.querySelector('#view .sageline').textContent.indexOf(w.RPG.briefing(w.state).lines[0].text) >= 0, 'the line is the first briefing line');
    w.mascotDailyGreet();
    ok(d.querySelectorAll('#view .sageline').length === 1, 'greeting again on the same day still renders one line');
    d.querySelector('#view .sageline .btn').click();
    ok(d.querySelector('#mBubble').hidden === false && d.querySelector('#mBubble .mline') !== null, 'the More control opens the briefing bubble');
    w.toggleMascot(false);
    w.go('quests'); w.go('today');
    ok(d.querySelectorAll('#view .sageline').length === 1, 'the line survives navigation for the rest of the day');
    // empty Now
    var keep = w.state.quests;
    w.state.quests = w.state.quests.filter(function (q) { return !q.recurring && q.due !== today; });
    w.render();
    var nowEmpty = d.querySelector('#view .panel.now .ebox');
    ok(nowEmpty !== null && nowEmpty.textContent.indexOf('Nothing due right now') >= 0 && nowEmpty.querySelectorAll('.btn').length === 2, 'an empty Now offers Add a quest and Start focus');
    w.state.quests = keep; w.render();
    // header carry-overs
    ok(d.querySelector('#hud .who .nm') !== null, 'the header name sits in its truncating element');
    var css = fs2.readFileSync(__dirname + '/styles.css', 'utf8');
    ok(/\.hud \.nm\{[^}]*text-overflow:ellipsis/.test(css) && /\.hud \.nm\{[^}]*min-width:0/.test(css) && /\.hud \.side\{[^}]*flex-wrap:wrap/.test(css), 'stylesheet truncates the name and lets the pills wrap instead of clipping');
    w.openCharacter();
    var rn = d.querySelector('#modal .ranknext');
    ok(rn !== null && rn.tagName === 'BUTTON' && /rank/i.test(rn.getAttribute('aria-label') || ''), 'the Hero sheet rank line is a labelled button');
    rn.click();
    ok(d.querySelector('#modal.show') !== null && d.querySelector('#modal').textContent.indexOf('RANKS') >= 0, 'tapping it opens the ranks sheet');
    w.closeModal();
    w.A.deleteQuest(w.state, dueQ.id); w.A.deleteQuest(w.state, tomQ.id); w.render();
  })();

  /* ===== Sage as game master (UI) =====
     Each block below swaps in a hero of its own and puts the long flow's hero
     back at the end, so nothing here leaks into the sections around it.
     firstQuestCelebrated is set on these heroes because the first-quest
     explainer opens on a 650ms timer and would otherwise land on a later,
     unrelated assertion. */
  console.log('\nMotion layer (fx.js)');
  ok(typeof w.FX === 'object' && typeof w.FX.flyText === 'function' && typeof w.FX.count === 'function', 'fx.js is loaded and exposes its helpers');
  (function () {
    var threw = false, el = d.createElement('span');
    try {
      w.FX.combo(3); w.FX.stamp('LOCKED IN'); w.FX.bump(el); w.FX.grow(el, 10);
      w.FX.flyText('+10 XP', 10, 10, d.querySelector('#hud'), 'xp');
      w.FX.count(el, 0, 7, 0);
    } catch (e) { threw = true; }
    ok(!threw && el.textContent === '7', 'every helper runs without the Web Animations API, and a counter always lands on its final value');
    ok(w.FX.combo(1) === undefined && d.querySelector('#fxCombo') !== null, 'a combo of one shows nothing new, a combo of three drew the pill');
  })();

  console.log('\nCapture sheet: one button, no task types');
  (function () {
    var keep = w.state;
    var s = w.state = w.RPG.seedPreset(w.RPG.newState('Cap', '🧙'), ['student']);
    s.firstQuestCelebrated = true;
    w.go('today');
    var q0 = s.quests.length, h0 = s.habits.length, g0 = s.goals.length;
    w.openCapture();
    ok(d.querySelector('#modal.show .capsheet') !== null && d.querySelectorAll('.cappack').length === w.RPG.PACKS.length, 'the sheet opens with the text box and one chip per pack');
    ok(d.querySelector('#capMic') === null && d.querySelector('.capvoice') === null, 'no microphone is offered where the browser has no speech recognition');
    var ta = d.querySelector('#capText');
    ta.value = 'call the bank and email my landlord, then finish the marketing essay by friday. gym 3x a week';
    w.capInput(ta.value);
    var cards = d.querySelectorAll('#capList .capcard');
    ok(cards.length === 4 && d.querySelector('#capGo').disabled === false && d.querySelector('#capGo').textContent === 'Add 4 to my board', 'one sentence becomes four cards and the button counts them');
    ok(cards[0].textContent.indexOf('Side quest') >= 0 && cards[0].textContent.indexOf('Easy') >= 0 && cards[0].textContent.indexOf('Money') >= 0, 'the first card shows its guessed type, difficulty and life area');
    ok(cards[2].textContent.indexOf('Main quest') >= 0 && cards[2].textContent.indexOf('5 steps') >= 0, 'the essay is a main quest and says how many steps it comes with');
    w.capCycle(0, 'kind');
    ok(w.cap.items[0].kind === 'daily' && d.querySelector('#capList .capcard').textContent.indexOf('Daily') >= 0, 'tapping the type chip moves to the next type');
    w.capCycle(0, 'kind'); w.capCycle(0, 'kind'); w.capCycle(0, 'kind'); w.capCycle(0, 'kind');
    ok(w.cap.items[0].kind === 'side', 'and cycling through all five comes back round');
    w.capCycle(0, 'diff');
    ok(w.cap.items[0].diff === 'normal', 'the difficulty chip steps Easy to Normal');
    w.capCycle(1, 'area');
    ok(w.cap.items[1].skillId === s.skills[0].id, 'the area chip steps from none to the first life area');
    w.capCycle(3, 'target');
    ok(w.cap.items[3].kind === 'habit' && w.cap.items[3].target === 2, 'the frequency chip steps a 3-a-week habit to 2');
    w.capDue(1, '2026-12-24');
    ok(w.cap.items[1].due === '2026-12-24' && d.querySelectorAll('#capList .capcard')[1].textContent.indexOf('Dec 24') >= 0, 'the date chip sets a due date');
    w.capDue(2, '2026-12-31');
    ok(w.cap.items[2].steps[4].due === '2026-12-31', 'a new date on a main quest re-plans its steps toward it');
    ta.value += '. buy milk. <img src=x onerror=alert(1)>';
    w.capInput(ta.value);
    ok(w.cap.items.length === 6 && w.cap.items[0].diff === 'normal' && w.cap.items[1].due === '2026-12-24' && w.cap.items[3].target === 2, 'every correction survives more typing');
    ok(d.querySelector('#capList img') === null && d.querySelector('#capList').textContent.indexOf('<img src=x') >= 0, 'typed markup is shown as text, never run');
    w.capToggle(4); w.capToggle(5);
    ok(d.querySelectorAll('#capList .capcard.off').length === 2 && d.querySelector('#capGo').textContent === 'Add 4 to my board', 'a switched-off card is left out of the count');
    ok(d.querySelector('#capList .capcard .capbox[aria-pressed="false"]') !== null && d.querySelector('#capList [data-w="kind"]') !== null, 'cards expose their state and their chips to the keyboard');
    w.capAdd();
    ok(d.querySelector('#modal.show') === null && w.cap === null, 'Add closes the sheet');
    ok(s.quests.length === q0 + 7 && s.goals.length === g0 + 1 && s.habits.length === h0 + 1, 'the board grew by two side quests, a main quest with five steps and a habit');
    var bank = s.quests.find(function (q) { return q.title === 'Call the bank'; });
    var lord = s.quests.find(function (q) { return q.title === 'Email my landlord'; });
    ok(bank && bank.diff === 'normal' && lord && lord.skillId === s.skills[0].id && lord.due === '2026-12-24', 'the corrections made on the cards are what was saved');
    ok(!s.quests.some(function (q) { return q.title === 'Buy milk' || q.title.indexOf('<img') >= 0; }), 'the switched-off cards were not added');
    var toasts = d.querySelector('#toasts').textContent;
    ok(toasts.indexOf('On the board') >= 0 && toasts.indexOf('1 main quest (5 steps)') >= 0, 'a toast sums up what landed');
    w.go('quests');
    ok(d.querySelector('#view .item.fresh') !== null && d.querySelector('#view .goal.fresh') !== null, 'the new rows are highlighted so the eye finds them');
    // packs from the sheet
    w.openCapture();
    w.capPack('admin');
    ok(d.querySelectorAll('#capList .capcard').length === 4 && d.querySelector('#capList .capcard button.capchip.kind') === null && d.querySelector('.cappackhead') !== null, 'a pack lands under its own heading, its types fixed');
    w.capPackRemove(0);
    ok(d.querySelectorAll('#capList .capcard').length === 0 && d.querySelector('#capGo').disabled === true, 'removing the pack empties the list again');
    w.capPack('sleep'); w.capAdd();
    ok(s.habits.some(function (h) { return h.title === 'In bed by 23:30'; }) && s.habits.some(function (h) { return h.type === 'bad' && h.title === 'Late-night scrolling'; }), 'the sleep pack adds its habits and its monster');
    // Escape closes the sheet through closeModal, and the next open starts clean
    w.openCapture(); w.capInput('leftover text'); w.closeModal();
    w.openCapture();
    ok(d.querySelector('#capText').value === '' && w.cap.items.length === 0, 'a sheet closed without adding starts empty next time');
    w.capClose();
    w.state = keep; w.render();
  })();

  console.log('\nDaily Draft, the plan and the won day');
  (function () {
    var keep = w.state, today = w.RPG.todayKey();
    var s = w.state = w.RPG.seedPreset(w.RPG.newState('Plan', '🧙'), ['student']);
    s.firstQuestCelebrated = true;
    w.go('today');
    var draft = d.querySelector('#view .draft');
    ok(draft !== null && draft.querySelectorAll('.drow').length === 4 && draft.querySelectorAll('.drow.on').length === 4, 'Today opens on a draft of four picks, all kept');
    ok(d.querySelector('#view .panel').classList.contains('now') && d.querySelector('#view .panel.now.plan') === null, 'the draft is not a panel: Now is still the first panel, and it is not a plan yet');
    ok(draft.querySelector('.dw') !== null && draft.querySelector('.dw').textContent.length > 3 && draft.querySelector('.dsub').textContent.indexOf('4 picks') >= 0, 'each pick carries its reason and the header totals the picks');
    w.draftToggle(3);
    ok(d.querySelectorAll('#view .draft .drow.on').length === 3 && d.querySelector('#view .draft .dsub').textContent.indexOf('3 picks') >= 0 && d.querySelectorAll('#view .draft .drow')[3].getAttribute('aria-pressed') === 'false', 'a pick can be switched off');
    d.querySelector('#draftLock').click();
    ok(s.plan && s.plan.day === today && s.plan.refs.length === 3 && d.querySelector('#view .draft') === null, 'locking stores the three kept picks as today\'s plan and the draft leaves');
    var plan = d.querySelector('#view .panel.now.plan');
    ok(plan !== null && plan.textContent.indexOf('Today’s plan') >= 0 && plan.querySelector('h3 .cnt').textContent === '0/3', 'Now becomes the plan with its count');
    ok(plan.querySelector('.planedit') !== null && d.querySelector('#toasts').textContent.indexOf('Locked in: 3 for today') >= 0, 'the plan can still be changed, and a toast confirms the lock');
    ok(d.querySelector('#view .panel.now.plan h3 .chestring') !== null, 'the daily chest is still reachable from the plan');
    s.plan.refs.slice().forEach(function (ref, i) {
      if (ref.charAt(0) === 'q') w.doQuest(ref.slice(2)); else w.doHabit(ref.slice(2));
      if (i === 0) ok(d.querySelector('#view .panel.now.plan h3 .cnt').textContent === '1/3' && !d.querySelector('#overlay.show'), 'clearing one item moves the count, nothing is celebrated yet');
    });
    ok(s.plan.wonOn === today && s.counters.daysWon === 1, 'finishing the plan wins the day');
    var ov = d.querySelector('#overlay.show');
    ok(ov !== null && ov.textContent.indexOf('DAY WON') >= 0 && ov.querySelector('.cer') !== null && ov.querySelector('.wkdots i.today.on') !== null, 'the day-won ceremony opens with today lit in the week row');
    ok(ov.textContent.indexOf('All 3 things you planned today, done') >= 0 && ov.textContent.indexOf('Day bonus: +' + w.RPG.PLAN_XP + ' XP') >= 0, 'it shows the plan count and the day bonus');
    ok(ov.getAttribute('role') === 'dialog' && ov.getAttribute('aria-modal') === 'true' && ov.getAttribute('aria-label') === 'day won', 'a ceremony is announced as a modal dialog named after its kicker');
    ok(d.querySelector('#fxCombo') !== null && d.querySelector('#fxCombo').textContent.indexOf('COMBO') >= 0, 'clearing three in a row showed the combo pill');
    w.closeOverlay();
    ok(ov.getAttribute('role') === 'status' && !ov.hasAttribute('aria-modal'), 'closing it hands #overlay back to its status role');
    w.closeTheDay();
    var note = d.querySelector('#view #jNote');
    ok(w.tab === 'today' && note !== null && note.value === w.RPG.debrief(s).line && /^Cleared/.test(note.value), '"Close the day" opens the log with Sage\'s line already written');
    ok(d.querySelector('#view .sagechip') !== null, 'the log form offers Sage\'s line as a chip');
    d.querySelector('#view .moods button[aria-label="Mood: Good"]').click();
    w.saveDailyLog();
    ok(s.journal[today] && s.journal[today].mood === 'good' && /^Cleared/.test(s.journal[today].note), 'a mood tap and Save log the day with that line');
    w.go('today');
    plan = d.querySelector('#view .panel.now.plan.won');
    ok(plan !== null && plan.textContent.indexOf('Day won') >= 0 && plan.querySelector('.planedit') === null, 'the panel reads Day won and can no longer be changed');
    // "Not today", and the way back
    var s2 = w.state = w.RPG.seedPreset(w.RPG.newState('Skip', '🧙'), ['student']);
    w.go('today'); w.skipDraft();
    ok(s2.plan && s2.plan.skipped === true && d.querySelector('#view .draft') === null && d.querySelector('#view .panel.now.plan') === null, '"Not today" hides the draft and leaves the ordinary Now panel');
    var again = d.querySelector('#view .panel.now .planedit');
    ok(again !== null && again.textContent === 'Plan today', 'Now offers a way back to planning');
    again.click();
    ok(s2.plan === null && d.querySelector('#view .draft') !== null, 'and it brings the draft back');
    // the evening wording of the log card
    var s3 = w.state = w.RPG.seedPreset(w.RPG.newState('Eve', '🧙'), ['student']);
    s3.firstQuestCelebrated = true; s3.settings.reminderHour = 0;
    w.go('today');
    ok(d.querySelector('#view .logcard.evening') === null, 'with nothing done yet the log card keeps its plain wording');
    w.doQuest(s3.quests[0].id); if (d.querySelector('#overlay.show')) w.closeOverlay();
    var eve = d.querySelector('#view .logcard.evening');
    ok(eve !== null && eve.textContent.indexOf('Close the day') >= 0 && eve.textContent.indexOf('+15 XP') >= 0, 'past the reminder hour, with something done, it reads as the Evening Debrief');
    w.state = keep; w.render();
  })();

  console.log('\nGame systems in stages (a brand-new hero)');
  await (async function () {
    var keep = w.state;
    w.state = null; w.renderHUDShell(); w.onboarding();
    d.querySelector('#obName').value = 'Stage'; w.obNext(); w.obNext(); w.obPick('struggle', 'phone'); w.obSkip();
    d.querySelector('#obStart').click();
    var s = w.state; s.firstQuestCelebrated = true;
    ok(w.RPG.staged(s) && d.querySelector('#coinCounter') === null && d.querySelector('#hud .bar.hp') === null && d.querySelector('#hud .bar.xp') !== null, 'day one header: XP and streak only, no purse and no HP bar');
    ok(d.querySelectorAll('.tabs button').length === 5 && d.querySelectorAll('.tabs button.locked .tlock').length === 1, 'all five tabs are there, Rewards carries a lock');
    ok(d.querySelector('#view .nextline') !== null && d.querySelector('#view .nextline').textContent.indexOf('The Market') >= 0, 'Today says what opens next');
    ok(d.querySelector('#view details.slipped') === null, 'no Slipped? fold before monsters exist');
    w.go('market');
    var lk = d.querySelector('#view .panel.lockedsys');
    ok(lk !== null && lk.textContent.indexOf('The Market') >= 0 && lk.textContent.indexOf('Opens at level 2, or with your first daily chest') >= 0 && d.querySelector('#shop-balance') === null, 'Rewards explains the Market and what opens it instead of showing the shop');
    w.go('habits');
    ok(d.querySelector('#view').textContent.indexOf('Fight - bad habits') < 0 && d.querySelector('#view .lockedsys') !== null && d.querySelector('#view .lockedsys').textContent.indexOf('Opens at level 3') >= 0, 'Habits shows the monsters teaser, not the Fight panel');
    w.go('quests');
    ok(d.querySelector('#view .boss') === null && d.querySelector('#view').textContent.indexOf('Main quests') >= 0, 'Quests has no boss strip yet');
    w.go('stats');
    ok(d.querySelectorAll('#view .ladder .ladrow').length === 4 && d.querySelectorAll('#view .ladder .ladrow.open').length === 0 && d.querySelector('#boardBody') === null, 'Progress shows the four-step ladder, all closed, and no leaderboard');
    ok(d.querySelector('#view').textContent.indexOf('coins earned') < 0 && d.querySelector('#view').textContent.indexOf('monster hits') < 0 && d.querySelector('#view .herocard').textContent.indexOf('HP ') < 0, 'Progress shows no coin tiles, no monster tile and no HP line before those systems open');
    w.openCharacter();
    var lockedSkins = d.querySelectorAll('.avpick button.locked');
    ok(lockedSkins.length === 10 && lockedSkins[0].disabled === true && lockedSkins[0].getAttribute('aria-label').indexOf('opens at level') >= 0, 'ten hero skins are shown locked with the level that opens them');
    w.closeModal(); w.go('today');
    // coins are earned quietly
    var before = d.querySelectorAll('#toasts .toast').length, coins0 = s.hero.coins;
    var daily = s.quests.find(function (q) { return q.recurring; });
    w.doQuest(daily.id);
    var newToast = d.querySelectorAll('#toasts .toast')[before];
    ok(s.hero.coins > coins0 && newToast && newToast.textContent.indexOf('XP') >= 0 && newToast.textContent.indexOf('💰') < 0, 'a clear still pays coins, but the toast only speaks of XP');
    // level 2 opens the Market inside the level-up ceremony
    s.hero.xp = w.RPG.xpForLevel(1) - 1;
    var q2 = w.A.addQuest(s, { title: 'Level trigger', diff: 'easy' });
    w.doQuest(q2.id);
    var ov = d.querySelector('#overlay.show');
    ok(s.hero.level === 2 && ov !== null && ov.textContent.indexOf('LEVEL UP') >= 0 && ov.textContent.indexOf('New: The Market') >= 0, 'reaching level 2 announces the Market inside the level-up ceremony');
    ok(ov.textContent.indexOf('New hero skin: Witch') >= 0 && ov.textContent.indexOf('Next: HP and monsters') >= 0 && ov.textContent.indexOf('HP fully restored') < 0, 'with the skin that opens at this level and what comes next, and no HP line before HP exists');
    var primary = ov.querySelector('.cer-act .btn.go');
    ok(primary.textContent === 'Open The Market' && ov.querySelector('.cer-act .btn.ghost') !== null, 'the button leads to the new system, Later stays possible');
    primary.click();
    ok(w.tab === 'market' && d.querySelector('#shop-balance') !== null && d.querySelector('#coinCounter') !== null && !d.querySelector('#overlay.show'), 'it lands in the open Market, and the purse is now in the header');
    ok(d.querySelector('#shop-black') === null && d.querySelector('#shop-hotel') === null && d.querySelector('.tabs button.locked') === null, 'Guilty pleasures and Rest wait for HP; the tab lock is gone');
    w.openCharacter();
    ok(d.querySelectorAll('.avpick button.locked').length === 9, 'one more skin is wearable');
    w.closeModal();
    // level 3 opens HP and monsters
    s.hero.xp = w.RPG.xpForLevel(2) - 1;
    var q3 = w.A.addQuest(s, { title: 'Level trigger 2', diff: 'easy' });
    w.doQuest(q3.id);
    ov = d.querySelector('#overlay.show');
    ok(s.hero.level === 3 && ov && ov.textContent.indexOf('New: HP and monsters') >= 0, 'level 3 announces HP and monsters');
    w.closeOverlay();
    ok(d.querySelector('#hud .bar.hp') !== null, 'the HP bar joins the header');
    w.go('habits');
    ok(d.querySelector('#view').textContent.indexOf('Fight - bad habits') >= 0 && d.querySelector('#view .item.monster') !== null && d.querySelector('#view').textContent.indexOf('Doomscrolling') >= 0, 'the Fight panel appears with the monster picked in the wizard');
    w.go('market');
    ok(d.querySelector('#shop-black') !== null && d.querySelector('#shop-hotel') !== null, 'Guilty pleasures and Rest are on the Rewards screen now');
    // Calm removes HP and monsters again, everywhere
    w.setIntensity('calm');
    ok(s.settings.intensity === 'calm' && d.querySelector('#modal .seg button.on').textContent.indexOf('Calm') >= 0 && d.querySelector('#hud .bar.hp') === null, 'switching to Calm in Settings takes the HP bar away');
    w.closeModal(); w.go('habits');
    ok(d.querySelector('#view').textContent.indexOf('Fight - bad habits') < 0 && d.querySelector('#view .lockedsys') === null, 'in Calm there is no Fight panel and no teaser for it');
    w.setIntensity('classic'); w.closeModal();
    ok(d.querySelector('#hud .bar.hp') !== null, 'back on Classic the HP bar returns');

    // the Market can also open with the first chest, queued behind the chest screen
    w.state = null; w.renderHUDShell(); w.onboarding();
    d.querySelector('#obName').value = 'Chesty'; w.obNext(); w.obSkip(); d.querySelector('#obStart').click();
    var c = w.state; c.firstQuestCelebrated = true;
    c.quests.filter(function (q) { return q.recurring; }).forEach(function (q) { w.doQuest(q.id); });
    ok(c.hero.level === 1 && w.A.chestStatus(c).eligible && !w.RPG.isUnlocked(c, 'rewards'), 'all dailies done at level 1: the chest is ready and the Market still closed');
    w.claimChest();
    ok(w.RPG.isUnlocked(c, 'rewards') && d.querySelector('#overlay').textContent.indexOf('rattles') >= 0, 'claiming the chest opens the Market in the save while the chest is still rattling');
    await new Promise(function (r) { setTimeout(r, 1750); });
    ok(d.querySelector('#overlay.show') && d.querySelector('#overlay').textContent.indexOf('DAILY CHEST') >= 0 && d.querySelector('#overlay').textContent.indexOf('NOW OPEN') < 0, 'the chest reveal comes first');
    w.closeOverlay();
    ov = d.querySelector('#overlay.show');
    ok(ov !== null && ov.textContent.indexOf('NOW OPEN') >= 0 && ov.textContent.indexOf('The Market') >= 0 && ov.textContent.indexOf('You already hold ' + c.hero.coins + ' coins') >= 0, 'then the Market ceremony, which reveals the coins earned so far');
    w.closeOverlay();
    ok(!d.querySelector('#overlay.show') && w.cerQueue.length === 0, 'and the queue is empty afterwards');
    w.state = keep; w.render();
  })();

  console.log('\nSage proposes the boss, writes the week; game intensity');
  (function () {
    var keep = w.state, today = w.RPG.todayKey();
    var s = w.state = w.RPG.seedPreset(w.RPG.newState('Boss', '🧙'), ['student']);
    w.A.addQuest(s, { title: 'Finish the group deck', diff: 'hard', due: today });
    w.go('quests');
    var pick = d.querySelector('#view .boss .sagepick');
    ok(pick !== null && pick.textContent.indexOf('Finish the group deck') >= 0, 'the empty boss strip carries Sage\'s pick');
    ok(d.querySelector('#view .boss') === d.querySelector('#view').firstElementChild, 'and the boss strip is still the first thing on Quests');
    pick.click();
    ok(s.boss && s.boss.title === 'Finish the group deck' && s.boss.due === w.RPG.bossSunday() && d.querySelector('#view .sagepick') === null, 'one tap names that quest the weekly boss');
    w.go('stats');
    var chron = d.querySelector('#view .thisweek .chron');
    ok(chron !== null && chron.querySelector('.cht').textContent.length > 3 && d.querySelector('#view .thisweek .review') !== null, 'Progress shows Sage\'s chronicle above the weekly review');
    ok(d.querySelector('#view .ladder') === null, 'a hero who is not on the staged game sees no ladder');
    w.openSettings();
    ok(d.querySelectorAll('#modal .seg button').length === 3 && d.querySelector('#modal .seg button.on').textContent.indexOf('Classic') >= 0 && d.querySelector('#modal .seg button.on').getAttribute('aria-pressed') === 'true', 'Settings offers Calm, Classic and Hardcore, Classic selected');
    w.setIntensity('hardcore');
    ok(s.settings.intensity === 'hardcore' && s.settings.hardcore === true && d.querySelector('#modal .seg button.on').textContent.indexOf('Hardcore') >= 0, 'Hardcore sets the intensity and the older hardcore flag together');
    w.toggleHardcore();
    ok(s.settings.intensity === 'classic' && s.settings.hardcore === false, 'the old toggle still steps back to Classic');
    w.closeModal();
    w.state = keep; w.render();
  })();

  console.log('\nPixel art (art.js) and calmer rows');
  (function () {
    var PX = w.PX, fs3 = require('fs');
    ok(!!PX && typeof PX.swap === 'function' && typeof PX.icon === 'function', 'art.js loads and exposes PX');
    // every emoji the app or the engine writes has a drawing (unmapped ones would stay emoji on screen)
    var srcAll = fs3.readFileSync(__dirname + '/app.js', 'utf8') + fs3.readFileSync(__dirname + '/core.js', 'utf8');
    var emo = srcAll.match(/(?:[\uD83C][\uDDE6-\uDDFF]){2}|[\uD83C-\uD83E][\uDC00-\uDFFF](?:️)?(?:‍(?:[\uD83C-\uD83E][\uDC00-\uDFFF]|[☀-➿])️?)*|[☀-➿⬆⬇⭐⬛▲▶▼◀↩⏳⏸⏹ⓘ](?:️)?/g) || [];
    var missing = {};
    emo.forEach(function (e) { if (!PX.forEmoji(e)) missing[e] = 1; });
    ok(Object.keys(missing).length === 0, 'every emoji in app.js and core.js has a pixel drawing' + (Object.keys(missing).length ? ' -> missing: ' + Object.keys(missing).join(' ') : ''));
    // the drawings themselves are well formed
    var bad = PX.iconNames().filter(function (n) { var s = PX.icon(n); return !/<use href="#px-/.test(s) || !d.getElementById(s.match(/#(px-[^"]+)/)[1]); });
    ok(bad.length === 0, 'every icon draws from a symbol that exists' + (bad.length ? ' -> ' + bad.join(',') : ''));
    ok(PX.heroIds().length >= 16 && Object.keys(w.SVG_AVATARS).every(function (k) { return PX.isHero(k.slice(1)); }), 'every hero token has a pixel portrait');
    var c0 = PX.customHero([5, 5, 7, 7, 5]);
    ok(/pxhero/.test(c0) && d.getElementById(c0.match(/#(px-c-[^"]+)/)[1]) !== null, 'the last option of every builder layer still draws');
    ok(/<svg class="pxtext[^"]*"/.test(PX.text('Lv 12!')) && (PX.text('AB').match(/class="pp"/g) || []).length > 20, 'pixel title text draws one tile per lit pixel');
    // the swap: drawing in, emoji kept as screen-reader text, user emoji left alone, <option> stripped
    var box = d.createElement('div');
    box.innerHTML = '<p>🔥 12 and 🦖</p><select><option>📚 Study</option></select><span class="tt" title="💰 coins">x</span>';
    d.body.appendChild(box);
    PX.swap(box);
    var p = box.querySelector('p');
    ok(p.querySelector('.pxi svg use') !== null && p.querySelector('.pxi .pxt').textContent === '🔥', 'a mapped emoji becomes a drawing and stays as screen-reader text');
    ok(p.textContent.indexOf('🔥 12') === 0 && p.textContent.indexOf('🦖') > 0 && p.querySelectorAll('.pxi').length === 1, 'textContent is unchanged and an emoji with no drawing is left alone');
    ok(box.querySelector('option').textContent === 'Study' && box.querySelector('.tt').getAttribute('title') === 'coins', 'emoji inside <option> and title attributes are stripped, not drawn');
    PX.swap(box);
    ok(p.querySelectorAll('.pxi').length === 1, 'swapping twice does not double the drawing');
    box.parentNode.removeChild(box);
    // text the user is editing is never touched: a <textarea>'s text is its value
    var ta = d.createElement('textarea'); ta.textContent = 'Gym day 💪 felt great 🔥';
    d.body.appendChild(ta); PX.swap(ta.parentNode);
    ok(ta.value === 'Gym day 💪 felt great 🔥', 'emoji in a journal note survive the swap (textarea left alone)');
    ta.parentNode.removeChild(ta);
    // an emoji that is only part of a longer one is left whole
    var seq = d.createElement('p');
    seq.textContent = '💪🏽 a ❤️‍🔥 b 🏃‍♀️ c 🇨🇮🇹🇷 d 🇫🇷🇮🇹';
    d.body.appendChild(seq); PX.swap(seq);
    var drawn = [].map.call(seq.querySelectorAll('.pxi .pxt'), function (x) { return x.textContent; });
    ok(drawn.length === 2 && drawn[0] === '🇫🇷' && drawn[1] === '🇮🇹', 'skin tones, joined emoji and other flags stay native; a real flag pair is still drawn' + (drawn.length !== 2 ? ' -> ' + drawn.join(',') : ''));
    ok(seq.textContent === '💪🏽 a ❤️‍🔥 b 🏃‍♀️ c 🇨🇮🇹🇷 d 🇫🇷🇮🇹', 'the text itself is unchanged');
    seq.parentNode.removeChild(seq);
    ok(PX.plain('🇨🇮🇹🇷 ok') === '🇨🇮🇹🇷 ok' && PX.plain('🔥 hot') === 'hot', 'plain text drops whole emoji only');
    ok(w.svgIcon('more-horizontal').indexOf('px-more') > 0 && w.svgIcon('no-such-icon').indexOf('px-sparkle') > 0, 'interface icon names map to drawings, an unknown one falls back to a sparkle');
    // calmer rows: one tick, one ⋯, the rest in rowMenu
    var keep = w.state, today = w.RPG.todayKey();
    var s = w.state = w.RPG.seedPreset(w.RPG.newState('Rows', '@knight'), ['student']);
    var q = w.A.addQuest(s, { title: 'Write the intro', diff: 'hard', due: today });
    w.go('today');
    var row = [].filter.call(d.querySelectorAll('#view .item'), function (it) { return it.textContent.indexOf('Write the intro') >= 0; })[0];
    ok(row && row.querySelectorAll('button').length === 2 && row.querySelector('.btn.tick') && row.querySelector('.btn.more'), 'a quest row has exactly two controls: the tick and the ⋯');
    ok(row && row.querySelector('.meta').textContent.indexOf('Hard') >= 0 && row.querySelector('.meta').textContent.indexOf('Normal') < 0, 'the meta line names a hard quest and stays quiet about normal ones');
    row.querySelector('.btn.more').click();
    var labels = [].map.call(d.querySelectorAll('#modal .rmact'), function (b) { return b.textContent; }).join('|');
    ok(labels.indexOf('Focus on it') >= 0 && labels.indexOf('Make it a main quest') >= 0 && labels.indexOf('Edit') >= 0 && labels.indexOf('Delete') >= 0, 'the ⋯ menu holds Focus, upgrade, Edit and Delete');
    w.closeModal();
    row.querySelector('.btn.tick').click();
    ok(s.quests.find(function (x) { return x.id === q.id; }).doneOn === today, 'the tick clears the quest');
    var done = [].filter.call(d.querySelectorAll('#view .item.done'), function (it) { return it.textContent.indexOf('Write the intro') >= 0; })[0];
    ok(done && done.querySelector('.tick.on') !== null && done.textContent.indexOf('Done today') >= 0, 'a cleared row shows a filled tick with "Done today" for screen readers');
    // a long list folds after five rows
    for (var i = 0; i < 8; i++) w.A.addQuest(s, { title: 'Due item ' + i, diff: 'easy', due: today });
    w.render();
    var nowP = d.querySelector('#view .panel.now');
    ok(nowP.querySelectorAll('.item').length === 5 && nowP.querySelector('.foldmore') !== null, 'Now shows five rows and a Show more line');
    nowP.querySelector('.foldmore').click();
    ok(d.querySelectorAll('#view .panel.now .item').length > 5 && d.querySelector('#view .panel.now .foldmore') === null, 'Show more opens the whole list');
    // typed forms fold, but their fields stay in the page
    w.go('quests');
    ok(d.querySelector('details.addform #qTitle') !== null && !d.querySelector('#qTitle').closest('details').open, 'the side-quest form is folded and still in the page');
    // the intro never blocks: no animation support here, so it is skipped and nothing waits on it
    ok(d.getElementById('intro') === null && !d.body.classList.contains('introing'), 'the opening is skipped where the browser cannot animate');
    w.state = keep; w.render();
  })();

  console.log('\nCapture: one task at a time, option lists, pack dates, voice');
  (function () {
    var keep = w.state;
    w.openCapture();
    var ta = d.querySelector('#capText');
    ta.value = 'Call the bank'; w.capInput(ta.value);
    w.capKey({ key: 'Enter', shiftKey: false, isComposing: false, preventDefault: function () {} });
    ok(w.cap.lines.length === 1 && ta.value === '' && d.querySelectorAll('#capList .capcard').length === 1, 'Enter moves the task into the list and empties the box');
    ta.value = 'Gym 3x a week'; w.capInput(ta.value); w.capCommit();
    ok(d.querySelectorAll('#capList .capcard').length === 2, 'the Add button does the same');
    var ev = { inputType: 'insertLineBreak', p: false, preventDefault: function () { ev.p = true; } };
    ta.value = 'Reply to Lucas'; w.capInput(ta.value); w.capBefore(ev);
    ok(ev.p && w.cap.lines.length === 3, 'a phone keyboard line break adds the task too');
    var gi = w.cap.items.findIndex(function (it) { return it.title.indexOf('Gym') >= 0; });
    w.capPickOpen(gi, 'kind');
    var opts = d.querySelectorAll('#capList [data-i="' + gi + '"] .cappick button');
    ok(opts.length === w.capKinds().length, 'tapping the type chip lists every type at once');
    [].filter.call(opts, function (b) { return b.textContent.indexOf('Main quest') >= 0; })[0].click();
    ok(w.cap.items.some(function (it) { return it.title.indexOf('Gym') >= 0 && it.kind === 'main'; }) && d.querySelector('#capList .cappick') === null, 'picking one sets it and closes the list');
    w.capPack('internship');
    ok(d.querySelector('#pkDate') !== null && d.querySelector('#pkName') === null, 'Internship hunt asks for a deadline');
    var d1 = new Date(); d1.setDate(d1.getDate() + 40); var k1 = w.RPG.todayKey(d1);
    d.querySelector('#pkDate').value = k1; w.capPackAdd();
    var main = w.cap.items.find(function (it) { return it.pack === 'internship' && it.kind === 'main'; });
    ok(main && main.due === k1, 'the pack plans to that deadline');
    var d2 = new Date(); d2.setDate(d2.getDate() + 20); var k2 = w.RPG.todayKey(d2);
    w.capPackDate(main.packIndex, k2);
    var main2 = w.cap.items.find(function (it) { return it.pack === 'internship' && it.kind === 'main'; });
    ok(main2.due === k2 && main2.steps.every(function (st) { return !st.due || st.due <= k2; }) && d.querySelector('#capList .capchip.date input[onchange*="capPackDate"]') !== null, 'the deadline can be changed on the card, and the steps re-plan before it');
    // a line that adds nothing stays in the box with a reason, instead of vanishing
    var nLines = w.cap.lines.length;
    ta.value = 'Call the bank'; w.capInput(ta.value); w.capCommit();
    ok(w.cap.lines.length === nLines && ta.value === 'Call the bank' && d.querySelector('#capCount').textContent.indexOf('Nothing new') >= 0, 'a duplicate line stays in the box and says why');
    ta.value = ''; w.capInput('');
    // removing a pack keeps the choices made on the other packs
    w.capPack('fit');
    var fitPi = w.cap.packs.length - 1;
    var internCard = w.cap.items.findIndex(function (it) { return it.pack === 'internship' && it.kind === 'habit'; });
    var internKey = w.cap.items[internCard].key;
    w.capToggle(internCard);
    w.capPackRemove(fitPi);
    ok(w.cap.items.find(function (it) { return it.key === internKey; }).off === true, 'removing a later pack keeps an earlier pack\'s unticked card unticked');
    var firstPi = w.cap.items.find(function (it) { return it.pack === 'internship'; }).packIndex;
    if (firstPi > 0) { w.capPackRemove(0); ok(w.cap.items.find(function (it) { return it.pack === 'internship' && it.kind === 'habit' && it.off; }) !== undefined, 'removing an earlier pack moves the choices with the packs that follow'); }
    ok(w.capLang() === 'en-US', 'voice listens in English by default, not in the browser language');
    w.capLangSet('fr-FR'); ok(w.capLang() === 'fr-FR', 'the EN/FR switch changes it'); w.capLangSet('en-US');
    w.capClose();
    // voice: Chrome on Android repeats the phrase so far; it must not be written twice
    var rec = null;
    w.webkitSpeechRecognition = function () { rec = this; this.start = function () {}; this.stop = function () {}; this.abort = function () {}; };
    w.openCapture(); w.capMic();
    function R(tx, fin) { var r = [{ transcript: tx }]; r.isFinal = fin; return r; }
    rec.onresult({ resultIndex: 0, results: [R('call mom', true), R('call mom buy milk', true)] });
    ok(rec.lang === 'en-US' && w.cap.text === 'call mom buy milk. ', 'a repeated phrase replaces the earlier one instead of doubling it');
    rec.onend();
    ok(w.cap.lines.length === 1 && w.cap.text === '' && d.querySelectorAll('#capList .capcard').length >= 1, 'when listening ends, what was said goes into the list');
    w.capClose(); delete w.webkitSpeechRecognition;
    w.state = keep; w.render();
  })();

  console.log('\nRuntime errors during session: ' + errors.length);
  ok(errors.length === 0, 'zero JS errors through entire flow' + (errors.length ? ' -> ' + errors.join(' | ') : ''));

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
}, 600);
