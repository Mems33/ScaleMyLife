/* LiFE RPG v2 - core game logic (no DOM). Browser: window.RPG. Node: module.exports. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RPG = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SCHEMA = 5;

  /* ---------- economy constants ----------
     Balance target: a solid day (2 dailies + 3 habits + 2 focus blocks + journal/sleep)
     earns ~90-110 coins -> funds 1-2 pleasures. Gaming 1h = 60. */
  var DIFF = {
    easy:   { label: 'Easy',   xp: 10,  coins: 5,  color: 'green'  },
    normal: { label: 'Normal', xp: 25,  coins: 12, color: 'blue'   },
    hard:   { label: 'Hard',   xp: 60,  coins: 30, color: 'purple' },
    epic:   { label: 'Epic',   xp: 150, coins: 80, color: 'gold'   }
  };
  var FOCUS_XP_PER_MIN = 1.2, FOCUS_COIN_PER_MIN = 0.6; // 50 min = 60xp/30c (a Hard quest)
  var GOAL_XP = 300, GOAL_COINS = 150;
  var HABIT_XP = 12, HABIT_COINS = 6;
  var SLIP_HP = 12, SLIP_COINS = 10;
  var JOURNAL_XP = 15, JOURNAL_COINS = 5;
  var SLEEP_XP = 10;
  var CHEST_XP = 25, CHEST_COIN_MIN = 20, CHEST_COIN_SPREAD = 30;
  var CHEST_JACKPOT_MIN = 40, CHEST_JACKPOT_SPREAD = 60; // rare "big coins" loot
  var BOSS_XP = 500, BOSS_COINS = 250, BOSS_DAYS = 7;
  var BREAK_HP = 3;               // completing a pomodoro break heals a little
  var FOCUS_MIN_PAY = 5;          // sessions under 5 worked minutes pay nothing
  var FOCUS_MAX_PAY_MIN = 240;    // cap payout at 4h per session
  var MAX_HP = 100;
  /* ---------- defeat / Last Stand ----------
     Dropping to 0 HP knocks you DOWN, not out for good. Death must sting enough
     to matter but never destroy honest progress (you never lose levels/XP), and
     always has a clear way back - otherwise people stop logging slips honestly.
     Downed = half XP and zero coin earnings until you rest back to full HP.
     Hardcore mode (opt-in) makes the sting bigger for players who want stakes. */
  var DEATH_COST_SOFT = 0.25;     // lose 25% of coins on defeat (a real but survivable sting)
  var DEATH_COST_HARD = 0.5;      // hardcore: half your purse
  var DEATH_COST_CAP = 150;       // never bill more than this in one defeat
  var REVIVE_HP_SOFT = 25, REVIVE_HP_HARD = 10;
  var COMEBACK_XP = 60;           // reward for rising from defeat
  var ASCEND_LEVEL = 40;          // rank S - the gate for a new season (prestige)
  var POTION_XP_MULT = 2;         // Focus Elixir doubles XP for the rest of the day
  var POTION_XP_MULT = 2;         // Focus Elixir doubles XP for the rest of the day
  var MENACE_STEP = 0.2, MENACE_MAX = 2.5, MENACE_DECAY = 0.1; // bad-habit scaling
  /* anti-binge economy: repeat same-day buys of a reward get pricier, so a coin
     hoard can't buy unlimited "cheat" indulgences. Black-market rule-breaking is
     also hard-capped per day. Overridable per item; toggle off in settings. */
  var SURGE_DEFAULT = { market: 0.4, black: 0.6, hotel: 0 };
  var LIMIT_DEFAULT = { market: 0, black: 2, hotel: 0 };

  /* ---------- prestige boons ---------- permanent buffs chosen when you ascend */
  var BOONS = [
    { id: 'scholar',  icon: '📖', name: 'Scholar',    desc: '+8% XP from everything, forever' },
    { id: 'coinfind', icon: '🪙', name: 'Coinfinder', desc: '+8% coins from everything, forever' },
    { id: 'vigor',    icon: '❤️', name: 'Vigor',      desc: '+20 max HP, forever' },
    { id: 'warden',   icon: '🛡️', name: 'Warden',     desc: 'Monsters hit 20% softer, forever' },
    { id: 'fortune',  icon: '🍀', name: 'Fortune',    desc: 'Better chest loot & bigger coin drops' }
  ];
  function boonById(id) { for (var i = 0; i < BOONS.length; i++) if (BOONS[i].id === id) return BOONS[i]; return null; }

  /* ---------- cosmetic avatar frames ---------- unlocked as rare chest loot */
  var FRAMES = [
    { id: 'ember',   name: 'Ember',   color: '#ff7854', glow: '#ff9d47' },
    { id: 'frost',   name: 'Frost',   color: '#59c2ff', glow: '#aee6ff' },
    { id: 'jade',    name: 'Jade',    color: '#3ddc84', glow: '#a6f7c8' },
    { id: 'amethyst',name: 'Amethyst',color: '#b07bff', glow: '#e0c9ff' },
    { id: 'gilded',  name: 'Gilded',  color: '#f5c542', glow: '#fff2c4' },
    { id: 'rose',    name: 'Rose',    color: '#ff5fa2', glow: '#ffc4de' }
  ];
  function frameById(id) { for (var i = 0; i < FRAMES.length; i++) if (FRAMES[i].id === id) return FRAMES[i]; return null; }

  /* ---------- skill mastery tiers ----------
     Leveling a life area boosts its own actions. Skill level itself is UNCAPPED -
     XP keeps accumulating and the level keeps rising; these tiers just define the
     bonus, which plateaus at Sage so a maxed area can't run away with the economy. */
  function skillTier(level) {
    if (level >= 20) return { name: 'Sage',        roman: 'V',   icon: '🌌', xp: 1.50, coins: 1.20 };
    if (level >= 15) return { name: 'Grandmaster', roman: 'IV',  icon: '👑', xp: 1.40, coins: 1.15 };
    if (level >= 10) return { name: 'Master',      roman: 'III', icon: '🎓', xp: 1.30, coins: 1.10 };
    if (level >= 6)  return { name: 'Expert',      roman: 'II',  icon: '⭐', xp: 1.20, coins: 1.00 };
    if (level >= 3)  return { name: 'Adept',       roman: 'I',   icon: '✦',  xp: 1.10, coins: 1.00 };
    return { name: null, roman: '', icon: '', xp: 1, coins: 1 };
  }

  var RANKS = [
    { min: 1,  code: 'E',  name: 'Novice'     },
    { min: 5,  code: 'D',  name: 'Apprentice' },
    { min: 10, code: 'C',  name: 'Adventurer' },
    { min: 18, code: 'B',  name: 'Veteran'    },
    { min: 28, code: 'A',  name: 'Elite'      },
    { min: 40, code: 'S',  name: 'Master'     },
    { min: 60, code: 'SS', name: 'Legend'     }
  ];

  var MOODS = [
    { key: 'awful', emoji: '😖', label: 'Awful' },
    { key: 'bad',   emoji: '😕', label: 'Bad'   },
    { key: 'ok',    emoji: '😐', label: 'Okay'  },
    { key: 'good',  emoji: '🙂', label: 'Good'  },
    { key: 'great', emoji: '😄', label: 'Great' }
  ];

  /* ---------- achievements ---------- */
  var ACHIEVEMENTS = [
    { id: 'first_blood', icon: '⚔️', name: 'First Blood',     desc: 'Clear your first quest',        cond: function (s) { return s.counters.quests >= 1; } },
    { id: 'quest_25',    icon: '🗡️', name: 'Quest Grinder',   desc: 'Clear 25 quests',               cond: function (s) { return s.counters.quests >= 25; } },
    { id: 'quest_100',   icon: '🏹', name: 'Centurion',       desc: 'Clear 100 quests',              cond: function (s) { return s.counters.quests >= 100; } },
    { id: 'streak_7',    icon: '🔥', name: 'On Fire',         desc: '7-day streak',                  cond: function (s) { return s.hero.streak >= 7; } },
    { id: 'streak_30',   icon: '🌋', name: 'Unstoppable',     desc: '30-day streak',                 cond: function (s) { return s.hero.streak >= 30; } },
    { id: 'focus_5h',    icon: '⏳', name: 'Deep Diver',      desc: '5 hours of focus time',         cond: function (s) { return s.counters.focusMin >= 300; } },
    { id: 'focus_25h',   icon: '🧠', name: 'Monk Mode',       desc: '25 hours of focus time',        cond: function (s) { return s.counters.focusMin >= 1500; } },
    { id: 'level_5',     icon: '🎖️', name: 'Apprentice',      desc: 'Reach level 5',                 cond: function (s) { return s.hero.level >= 5; } },
    { id: 'level_10',    icon: '🏅', name: 'Double Digits',   desc: 'Reach level 10',                cond: function (s) { return s.hero.level >= 10; } },
    { id: 'level_25',    icon: '👑', name: 'Crowned',         desc: 'Reach level 25',                cond: function (s) { return s.hero.level >= 25; } },
    { id: 'rich_500',    icon: '💰', name: "Dragon's Hoard",  desc: 'Hold 500 coins at once',        cond: function (s) { return s.hero.coins >= 500; } },
    { id: 'spender_10',  icon: '🛍️', name: 'Treat Yourself',  desc: 'Buy 10 rewards',                cond: function (s) { return s.counters.purchases >= 10; } },
    { id: 'chest_7',     icon: '🎁', name: 'Chest Hunter',    desc: 'Claim 7 daily chests',          cond: function (s) { return s.counters.chests >= 7; } },
    { id: 'journal_7',   icon: '📔', name: 'Self-Aware',      desc: 'Write 7 journal entries',       cond: function (s) { return Object.keys(s.journal).length >= 7; } },
    { id: 'clean_14',    icon: '🛡️', name: 'Monster Slayer',  desc: 'Keep a monster 14 days clean',  cond: function (s) { return s.habits.some(function (h) { return h.type === 'bad' && cleanDaysOf(h) >= 14; }); } },
    { id: 'sleep_7',     icon: '🌙', name: 'Well Rested',     desc: 'Log sleep 7 times',             cond: function (s) { return Object.keys(s.sleep).length >= 7; } },
    { id: 'boss_1',      icon: '🐲', name: 'Dragonheart',     desc: 'Slay your first weekly boss',   cond: function (s) { return s.counters.bosses >= 1; } },
    { id: 'boss_5',      icon: '🔱', name: 'Serial Slayer',   desc: 'Slay 5 weekly bosses',          cond: function (s) { return s.counters.bosses >= 5; } },
    { id: 'skill_master',icon: '🎓', name: 'Master Mind',      desc: 'Take a life area to Lv.10',     cond: function (s) { return s.skills.some(function (k) { return k.level >= 10; }); } },
    { id: 'skill_sage',  icon: '🌌', name: 'Sage',             desc: 'Take a life area to Lv.20',     cond: function (s) { return s.skills.some(function (k) { return k.level >= 20; }); } },
    { id: 'ascend_1',    icon: '♻️', name: 'Reborn',          desc: 'Ascend into a new season',      cond: function (s) { return (s.hero.ascension || 0) >= 1; } },
    { id: 'legend',      icon: '🌟', name: 'Living Legend',   desc: 'Reach rank SS',                 cond: function (s) { return s.hero.level >= 60; } },
    { id: 'mended',      icon: '🕯️', name: 'Keeper of the Flame', desc: 'Mend a broken streak',      cond: function (s) { return (s.counters.mends || 0) >= 1; } },
    { id: 'phoenix',     icon: '🔥', name: 'Phoenix',          desc: 'Rise from a defeat',            cond: function (s) { return (s.counters.comebacks || 0) >= 1; } }
  ];

  /* ---------- helpers ---------- */
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function todayKey(d) {
    d = d || new Date();
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function xpForLevel(level) { return Math.round(100 * Math.pow(level, 1.35)); }
  function skillXpForLevel(level) { return Math.round(60 * Math.pow(level, 1.3)); }
  function rankFor(level) {
    var r = RANKS[0];
    for (var i = 0; i < RANKS.length; i++) if (level >= RANKS[i].min) r = RANKS[i];
    return r;
  }
  function streakMult(streak) { return 1 + Math.min(0.5, Math.max(0, streak - 1) * 0.05); }

  /* A monotonic "how far along is this save" key, compared lexicographically.
     Everything in it only ever grows (ascension seasons, level, xp, and
     lifetime counters), so it survives clock skew and tells us which of two
     saves is genuinely more advanced - the safe one to keep when syncing. */
  function progressKey(s) {
    if (!s || !s.hero) return [-1];
    var c = s.counters || {};
    var lifetime = (c.quests || 0) + (c.focusMin || 0) + (c.chests || 0) + (c.bosses || 0) +
      (c.purchases || 0) + (c.ascensions || 0) + (c.mends || 0) + (c.deaths || 0) + (c.comebacks || 0);
    return [ (s.hero.ascension || 0), (s.hero.level || 1), (s.hero.xp || 0), lifetime ];
  }
  /* >0 if a is more advanced, <0 if b is, 0 if tied */
  function compareProgress(a, b) {
    var ka = progressKey(a), kb = progressKey(b);
    for (var i = 0; i < Math.max(ka.length, kb.length); i++) {
      var d = (ka[i] || 0) - (kb[i] || 0);
      if (d) return d > 0 ? 1 : -1;
    }
    return 0;
  }
  function nextRank(level) {
    for (var i = 0; i < RANKS.length; i++) if (RANKS[i].min > level) return RANKS[i];
    return null;
  }

  /* ---------- prestige / buff multipliers ----------
     Everything defaults to 1.0 on a fresh hero, so base payouts are unchanged. */
  function boonCount(state, id) { return (state.hero && state.hero.boons && state.hero.boons[id]) || 0; }
  function xpBoonMult(state) { return 1 + 0.08 * boonCount(state, 'scholar'); }
  function coinBoonMult(state) { return 1 + 0.08 * boonCount(state, 'coinfind'); }
  function maxHpOf(state) { return MAX_HP + 20 * boonCount(state, 'vigor'); }
  function slipDampen(state) { return Math.max(0.5, 1 - 0.2 * boonCount(state, 'warden')); }
  function ascendReady(state) { return state.hero.level >= ASCEND_LEVEL; }
  /* active temporary XP buffs (e.g. Focus Elixir), keyed to the current day */
  function buffXpMult(state) {
    var m = 1, today = todayKey();
    (state.hero.buffs || []).forEach(function (b) { if (b.stat === 'xp' && b.until >= today) m *= b.mult; });
    return m;
  }
  function menaceOf(h) { return (h && typeof h.menace === 'number') ? h.menace : 1; }

  /* ---------- shop pricing ---------- surge + daily cap, with tab-based fallbacks */
  function itemSurge(state, it) {
    if (state.settings && state.settings.escalate === false) return 0;
    if (it.special) return 0;
    return (typeof it.surge === 'number') ? it.surge : (SURGE_DEFAULT[it.tab] || 0);
  }
  function itemLimit(it) {
    if (it.special) return 0;
    return (typeof it.limit === 'number') ? it.limit : (LIMIT_DEFAULT[it.tab] || 0);
  }
  function buyCount(state, it) { return (it.dayBuysOn === todayKey()) ? (it.dayBuys || 0) : 0; }
  function buyPrice(state, it) { return Math.round(it.price * (1 + itemSurge(state, it) * buyCount(state, it))); }
  function buyInfo(state, it) {
    var n = buyCount(state, it), lim = itemLimit(it);
    return { price: buyPrice(state, it), count: n, limit: lim, capped: lim > 0 && n >= lim, surge: itemSurge(state, it) };
  }

  /* iCalendar export: quests with due dates -> events at 09:00 with an alert.
     Importable into Apple Calendar / Google Calendar. */
  function buildICS(state) {
    var qs = state.quests.filter(function (q) { return q.due && !(q.doneOn && !q.recurring); });
    if (!qs.length) return null;
    function escIcs(t) { return String(t).replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\n/g, '\\n'); }
    var L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ScaleMyLife//EN', 'CALSCALE:GREGORIAN'];
    qs.forEach(function (q) {
      var d = q.due.replace(/-/g, '');
      L.push('BEGIN:VEVENT',
        'UID:' + q.id + '@scalemylife',
        'DTSTAMP:' + d + 'T080000',
        'DTSTART:' + d + 'T090000',
        'DTEND:' + d + 'T093000',
        'SUMMARY:' + escIcs('⚔ ' + q.title + ' (ScaleMyLife)'),
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + escIcs(q.title), 'TRIGGER:-PT0M', 'END:VALARM',
        'END:VEVENT');
    });
    L.push('END:VCALENDAR');
    return L.join('\r\n');
  }
  function cleanDaysOf(h) {
    if (!h.cleanSince) return 0;
    var a = new Date(h.cleanSince + 'T00:00:00'), b = new Date(todayKey() + 'T00:00:00');
    return Math.max(0, Math.round((b - a) / 86400000));
  }

  /* ---------- state ---------- */
  function defaultSkills() {
    return [
      { id: uid(), name: 'Mind',   icon: '🧠', xp: 0, level: 1 },
      { id: uid(), name: 'Body',   icon: '💪', xp: 0, level: 1 },
      { id: uid(), name: 'Work',   icon: '💼', xp: 0, level: 1 },
      { id: uid(), name: 'Social', icon: '🤝', xp: 0, level: 1 },
      { id: uid(), name: 'Money',  icon: '💎', xp: 0, level: 1 }
    ];
  }

  function newState(heroName, avatar) {
    return {
      schema: SCHEMA,
      hero: { name: heroName || 'Hero', avatar: avatar || '🧙', title: '', level: 1, xp: 0, coins: 50, hp: MAX_HP, streak: 0, bestStreak: 0, lastActiveDay: null, badges: [], shields: 0, woundedOn: null,
        boons: {}, ascension: 0, buffs: [], frame: '', downed: null },
      skills: defaultSkills(),
      quests: [], goals: [], habits: [], shop: [],
      journal: {}, sleep: {}, log: [],
      inventory: { potion: 0 },
      cosmetics: { frames: [] },
      counters: { quests: 0, focusMin: 0, purchases: 0, chests: 0, bosses: 0, ascensions: 0, mends: 0, deaths: 0, comebacks: 0 },
      achievements: [],           // [{id,on}]
      activeFocus: null,
      redemption: null,           // {streak,on} - offer to mend a freshly broken streak
      boss: null,                 // {title,setOn,due,doneOn}
      chestClaimedOn: null,
      settings: { sound: true, theme: 'dungeon', music: 'lofi', musicUrl: '', escalate: true, restDays: [] },
      lastSeenDay: todayKey()
    };
  }

  function seed(state) {
    var mind = state.skills[0].id, body = state.skills[1].id, craft = state.skills[2].id;
    state.quests.push(
      { id: uid(), title: 'Plan tomorrow in 10 minutes', diff: 'easy', skillId: mind, due: null, recurring: true, main: null, doneOn: null, createdOn: todayKey() },
      { id: uid(), title: 'Deep work session (50 min)', diff: 'normal', skillId: craft, due: null, recurring: true, main: null, doneOn: null, createdOn: todayKey() }
    );
    state.habits.push(
      { id: uid(), title: 'Read 20 pages', type: 'good', skillId: mind, streak: 0, lastDoneOn: null, slips: 0, cleanSince: null, history: [], bestClean: 0, target: 7 },
      { id: uid(), title: 'Workout / walk 30 min', type: 'good', skillId: body, streak: 0, lastDoneOn: null, slips: 0, cleanSince: null, history: [], bestClean: 0, target: 3 },
      { id: uid(), title: 'Doomscrolling', type: 'bad', skillId: mind, streak: 0, lastDoneOn: null, slips: 0, cleanSince: todayKey(), history: [], bestClean: 0, target: 7 }
    );
    state.shop.push(
      { id: uid(), title: 'Gaming: 1 hour', price: 60, tab: 'market', hp: 0, dmg: 0 },
      { id: uid(), title: '1 episode of a series', price: 40, tab: 'market', hp: 0, dmg: 0 },
      { id: uid(), title: 'Café treat', price: 35, tab: 'market', hp: 0, dmg: 0 },
      { id: uid(), title: 'Power nap (20 min)', price: 25, tab: 'hotel', hp: 15, dmg: 0 },
      { id: uid(), title: 'Full rest evening', price: 90, tab: 'hotel', hp: 40, dmg: 0 },
      { id: uid(), title: 'Instagram before 1 PM (1h)', price: 120, tab: 'black', hp: 0, dmg: 8 }
    );
    return state;
  }

  /* ---------- onboarding paths ----------
     Each path tailors the starting board to a real situation. Rewards common to
     every path (Streak Shield, rest items, treats) are appended by seedPreset.
     Skill names are renamed to match the path so tagging feels personal. */
  var PATHS = [
    { id: 'general', icon: '🧭', name: 'Balanced', blurb: 'A bit of everything - the classic starter board.' },
    { id: 'student', icon: '📚', name: 'Student', blurb: 'Exams, essays, revision and focus sessions.',
      skills: ['Study', 'Body', 'Craft', 'Social', 'Money'],
      quests: [['Plan tomorrow in 10 minutes', 'easy', 0, true], ['Deep work session (50 min)', 'normal', 2, true], ['Review today\'s lecture notes', 'normal', 0, true]],
      goodHabits: [['Read 20 pages', 0, 7], ['Flashcards / revision', 0, 7], ['Workout / walk 30 min', 1, 3]],
      badHabits: ['Doomscrolling', 'Late-night YouTube'],
      market: [['Gaming: 1 hour', 60], ['1 episode of a series', 40], ['Night out with friends', 150]] },
    { id: 'athlete', icon: '💪', name: 'Athlete', blurb: 'Training, nutrition, sleep and recovery.',
      skills: ['Mind', 'Body', 'Nutrition', 'Social', 'Money'],
      quests: [['Complete today\'s training', 'hard', 1, true], ['Hit protein & water target', 'easy', 2, true], ['Mobility / stretch 10 min', 'easy', 1, true]],
      goodHabits: [['Workout', 1, 5], ['8h sleep', 1, 7], ['Meal prep', 2, 2]],
      badHabits: ['Skipping warm-up', 'Junk food'],
      market: [['Cheat meal', 90], ['Rest day movie', 60], ['New training gear (save up)', 400]] },
    { id: 'founder', icon: '🚀', name: 'Founder', blurb: 'Shipping, outreach, deep work and momentum.',
      skills: ['Mind', 'Body', 'Build', 'Network', 'Money'],
      quests: [['Ship one improvement', 'hard', 2, true], ['Reach out to 3 people', 'normal', 3, true], ['Review metrics for 10 min', 'easy', 4, true]],
      goodHabits: [['Deep work block', 2, 5], ['Workout / walk 30 min', 1, 4], ['Read / learn 20 min', 0, 7]],
      badHabits: ['Doomscrolling', 'Context-switching'],
      market: [['Gaming: 1 hour', 60], ['Nice dinner out', 120], ['Weekend fully off', 300]] },
    { id: 'coder', icon: '💻', name: 'Coder', blurb: 'Ship code, learn deeper, keep the body running.',
      skills: ['Mind', 'Body', 'Code', 'Social', 'Money'],
      quests: [['Code for 1 focused hour', 'hard', 2, true], ['Solve one practice problem', 'normal', 2, true], ['Read docs / learn 20 min', 'easy', 0, true]],
      goodHabits: [['Commit something daily', 2, 5], ['Workout / walk 30 min', 1, 4], ['In bed by 23:30', 1, 7]],
      badHabits: ['Doomscrolling', 'Late-night YouTube'],
      market: [['Gaming: 1 hour', 60], ['1 episode of a series', 40], ['New gadget (save up!)', 500]] },
    { id: 'gamer', icon: '🎮', name: 'Gamer', blurb: 'Handle real life first - then game guilt-free.',
      skills: ['Mind', 'Body', 'Work', 'Social', 'Money'],
      quests: [['Clear the day\'s must-do task', 'normal', 2, true], ['Tidy desk / space 10 min', 'easy', 0, true]],
      goodHabits: [['Workout / walk 30 min', 1, 4], ['In bed by midnight', 0, 7], ['Read 20 pages', 0, 3]],
      badHabits: ['Gaming before work is done', 'Energy drink binge'],
      market: [['Gaming: 1 hour', 40], ['Gaming: full evening', 120], ['New game (save up!)', 600]] },
    { id: 'creative', icon: '🎨', name: 'Creative', blurb: 'Making, publishing and building a body of work.',
      skills: ['Mind', 'Body', 'Craft', 'Audience', 'Money'],
      quests: [['Create for 1 focused hour', 'hard', 2, true], ['Publish / share one thing', 'normal', 3, true], ['Collect one reference / idea', 'easy', 0, true]],
      goodHabits: [['Make something daily', 2, 7], ['Workout / walk 30 min', 1, 3], ['Read / study craft', 0, 5]],
      badHabits: ['Perfectionism spiral', 'Endless scrolling for "research"'],
      market: [['Gaming: 1 hour', 60], ['Cinema night', 80], ['Buy that art supply (save up)', 250]] }
  ];
  function pathById(id) { for (var i = 0; i < PATHS.length; i++) if (PATHS[i].id === id) return PATHS[i]; return null; }

  var SKILL_ICONS = { Mind: '🧠', Body: '💪', Work: '💼', Social: '🤝', Money: '💎',
    Study: '📚', Craft: '🛠️', Nutrition: '🥗', Build: '🏗️', Network: '🌐', Audience: '📣', Code: '💻' };

  /* build a starting board from one path id or an array of them (you can be a
     student AND an athlete AND a founder - the board merges all of it) */
  function seedPreset(state, pathIds) {
    var ids = (Array.isArray(pathIds) ? pathIds : [pathIds]).filter(function (id, i, a) { return a.indexOf(id) === i; });
    var paths = [];
    ids.forEach(function (id) { var p = pathById(id); if (p && p.skills) paths.push(p); });
    if (!paths.length) return seed(state);

    /* life areas: shared ones first (they're every identity's foundation),
       then each path's signature areas, taking turns; 5 slots, +1 per extra path, max 7 */
    var want = Math.min(5 + (paths.length - 1), 7), names = [], count = {};
    paths.forEach(function (p) { p.skills.forEach(function (n) { count[n] = (count[n] || 0) + 1; }); });
    if (paths.length > 1) paths[0].skills.forEach(function (n) { if (count[n] > 1 && names.length < want) names.push(n); });
    var cursors = paths.map(function () { return 0; }), moved = true;
    while (names.length < want && moved) {
      moved = false;
      for (var pi = 0; pi < paths.length && names.length < want; pi++) {
        var list = paths[pi].skills;
        while (cursors[pi] < list.length && names.indexOf(list[cursors[pi]]) >= 0) cursors[pi]++;
        if (cursors[pi] < list.length) { names.push(list[cursors[pi]++]); moved = true; }
      }
    }
    while (state.skills.length < names.length) state.skills.push({ id: uid(), name: '', icon: '✨', xp: 0, level: 1 });
    state.skills.forEach(function (k, i) { if (names[i]) { k.name = names[i]; if (SKILL_ICONS[names[i]]) k.icon = SKILL_ICONS[names[i]]; } });

    var sk = state.skills;
    function skillFor(p, idx) {  /* a path's local skill index -> merged area id (null if that area was cut) */
      var n = (p.skills || [])[idx]; if (!n) return null;
      for (var i = 0; i < sk.length; i++) if (sk[i].name === n) return sk[i].id;
      return null;
    }
    var nq = 0, nh = 0, nb = 0, nm = 0, seen = {};
    paths.forEach(function (p) {
      (p.quests || []).forEach(function (q) {
        var key = 'q:' + q[0].toLowerCase(); if (seen[key] || nq >= 7) return; seen[key] = 1; nq++;
        state.quests.push({ id: uid(), title: q[0], diff: DIFF[q[1]] ? q[1] : 'normal',
          skillId: skillFor(p, q[2]), due: null, recurring: !!q[3], days: null,
          main: null, doneOn: null, createdOn: todayKey() });
      });
      (p.goodHabits || []).forEach(function (h) {
        var key = 'h:' + h[0].toLowerCase(); if (seen[key] || nh >= 7) return; seen[key] = 1; nh++;
        state.habits.push({ id: uid(), title: h[0], type: 'good', skillId: skillFor(p, h[1]),
          streak: 0, lastDoneOn: null, slips: 0, cleanSince: null, history: [], bestClean: 0, target: h[2] || 7 });
      });
      (p.badHabits || []).forEach(function (t) {
        var key = 'b:' + t.toLowerCase(); if (seen[key] || nb >= 4) return; seen[key] = 1; nb++;
        state.habits.push({ id: uid(), title: t, type: 'bad', skillId: null, streak: 0, lastDoneOn: null,
          slips: 0, cleanSince: todayKey(), history: [], bestClean: 0, target: 7, menace: 1 });
      });
      (p.market || []).forEach(function (m) {
        var key = 'm:' + m[0].toLowerCase(); if (seen[key] || nm >= 8) return; seen[key] = 1; nm++;
        state.shop.push({ id: uid(), title: m[0], price: m[1], tab: 'market', hp: 0, dmg: 0, special: null });
      });
    });
    state.shop.push(
      { id: uid(), title: 'Power nap (20 min)', price: 25, tab: 'hotel', hp: 15, dmg: 0, special: null },
      { id: uid(), title: 'Full rest evening', price: 90, tab: 'hotel', hp: 40, dmg: 0, special: null },
      { id: uid(), title: '🛡 Streak Shield', price: 200, tab: 'market', hp: 0, dmg: 0, special: 'shield' }
    );
    return state;
  }

  /* ---------- log ---------- */
  function addLog(state, icon, text, d) {
    d = d || {};
    var e = { t: new Date().toISOString(), day: todayKey(), icon: icon, text: text,
      xp: d.xp || 0, coins: d.coins || 0, hp: d.hp || 0, min: d.min || 0 };
    if (d.sk) e.sk = d.sk;       // life area a focus session belonged to (for the breakdown chart)
    if (d.label) e.label = d.label;
    state.log.unshift(e);
    if (state.log.length > 1000) state.log.length = 1000;
  }

  /* ---------- rewards engine ---------- */
  function touchStreak(state) {
    var today = todayKey();
    if (state.hero.lastActiveDay === today) return;
    var y = new Date(); y.setDate(y.getDate() - 1);
    state.hero.streak = (state.hero.lastActiveDay === todayKey(y)) ? state.hero.streak + 1 : 1;
    if (state.hero.streak > (state.hero.bestStreak || 0)) state.hero.bestStreak = state.hero.streak;
    state.hero.lastActiveDay = today;
  }

  function grant(state, base, skillId) {
    touchStreak(state);
    /* the skill this action is tagged to gives a mastery bonus based on its current level */
    var sObj = skillId ? state.skills.find(function (k) { return k.id === skillId; }) : null;
    var tier = sObj ? skillTier(sObj.level) : { xp: 1, coins: 1 };
    var mult = streakMult(state.hero.streak) * xpBoonMult(state) * buffXpMult(state);
    var xp = Math.round((base.xp || 0) * mult * tier.xp);
    var coins = Math.round((base.coins || 0) * coinBoonMult(state) * tier.coins);
    var res = { xp: xp, coins: coins, levelUps: [], skillUps: [], mult: mult };
    if (state.hero.woundedOn === todayKey()) { xp = Math.round(xp * 0.5); res.xp = xp; res.wounded = true; }
    /* Downed: half XP and no coins until you rest back to full and Rise. */
    if (state.hero.downed) { xp = Math.round(xp * 0.5); coins = 0; res.xp = xp; res.coins = 0; res.downed = true; }
    state.hero.coins += coins;
    state.hero.xp += xp;
    var cap = maxHpOf(state);
    while (state.hero.xp >= xpForLevel(state.hero.level)) {
      state.hero.xp -= xpForLevel(state.hero.level);
      state.hero.level++;
      state.hero.hp = cap;
      res.levelUps.push(state.hero.level);
      var r = rankFor(state.hero.level);
      if (r.min === state.hero.level) {
        state.hero.badges.push({ code: r.code, name: r.name, on: todayKey() });
        res.newRank = r;
      }
    }
    if (sObj && xp > 0) {
      sObj.xp += Math.round(xp * 0.8);
      while (sObj.xp >= skillXpForLevel(sObj.level)) {
        sObj.xp -= skillXpForLevel(sObj.level); sObj.level++;
        res.skillUps.push({ name: sObj.name, icon: sObj.icon, level: sObj.level });
        var nt = skillTier(sObj.level);
        if (nt.name && skillTier(sObj.level - 1).name !== nt.name) res.skillUps[res.skillUps.length - 1].perk = nt;
      }
    }
    return res;
  }

  function damage(state, hp, coins) {
    state.hero.hp = clamp(state.hero.hp - hp, 0, maxHpOf(state));
    state.hero.coins = Math.max(0, state.hero.coins - (coins || 0));
    if (state.hero.hp > 0) return { ko: false };
    // HP hit zero. If already downed from an earlier defeat, don't re-KO - just
    // hold at 1 HP (no second bill, no death spiral in a single bad day).
    if (state.hero.downed) { state.hero.hp = 1; return { ko: false, alreadyDowned: true }; }
    var hard = !!(state.settings && state.settings.hardcore);
    var cost = Math.min(DEATH_COST_CAP, Math.round(state.hero.coins * (hard ? DEATH_COST_HARD : DEATH_COST_SOFT)));
    state.hero.coins = Math.max(0, state.hero.coins - cost);
    state.hero.hp = hard ? REVIVE_HP_HARD : REVIVE_HP_SOFT;
    state.hero.woundedOn = todayKey();
    state.hero.downed = { on: todayKey(), cost: cost };
    state.counters.deaths = (state.counters.deaths || 0) + 1;
    addLog(state, '💀', 'Defeated by the monsters' + (cost > 0 ? ' - lost ' + cost + ' coins' : ''), { coins: -cost });
    return { ko: true, downed: true, cost: cost, hp: state.hero.hp, hardcore: hard };
  }
  /* Rise from defeat: only possible once you've rested back to full HP. Clears
     the Downed state, heals fully and pays a comeback bonus. */
  function rise(state) {
    if (!state.hero.downed) return null;
    if (state.hero.hp < maxHpOf(state)) return { notYet: true, hp: state.hero.hp, need: maxHpOf(state) };
    state.hero.downed = null;
    state.hero.woundedOn = null;
    state.counters.comebacks = (state.counters.comebacks || 0) + 1;
    var res = grant(state, { xp: COMEBACK_XP, coins: 0 }, null); // downed cleared -> full reward
    addLog(state, '🔥', 'Rose from defeat - comeback #' + state.counters.comebacks, { xp: res.xp });
    res.comeback = true; res.comebacks = state.counters.comebacks;
    return res;
  }

  /* ---------- prestige: ascend into a new season ----------
     Resets the level/rank climb for a permanent boon. Keeps everything that is
     "your real life" (quests, habits, journal, streak, coins) and your legacy
     (titles, badges, achievements, cosmetics). */
  function ascend(state, boonId) {
    if (!ascendReady(state)) return null;
    if (!boonById(boonId)) return null;
    var reachedLevel = state.hero.level;
    state.hero.boons[boonId] = (state.hero.boons[boonId] || 0) + 1;
    state.hero.ascension = (state.hero.ascension || 0) + 1;
    state.counters.ascensions = (state.counters.ascensions || 0) + 1;
    state.hero.level = 1;
    state.hero.xp = 0;
    state.hero.hp = maxHpOf(state);
    addLog(state, '♻️', 'Season ' + (state.hero.ascension) + ' begins - Ascended from Lv.' + reachedLevel + ', chose ' + boonById(boonId).name + '.');
    return { ascension: state.hero.ascension, boon: boonById(boonId), fromLevel: reachedLevel };
  }

  /* drink a Focus Elixir: XP doubles for the rest of today */
  function usePotion(state) {
    if (!state.inventory || (state.inventory.potion || 0) <= 0) return null;
    state.inventory.potion--;
    state.hero.buffs = state.hero.buffs || [];
    state.hero.buffs.push({ stat: 'xp', mult: POTION_XP_MULT, until: todayKey(), since: todayKey() });
    addLog(state, '🧪', 'Focus Elixir quaffed - XP ×' + POTION_XP_MULT + ' for the rest of today.');
    return { buff: true, mult: POTION_XP_MULT };
  }

  function checkAchievements(state) {
    var fresh = [];
    ACHIEVEMENTS.forEach(function (a) {
      if (state.achievements.some(function (u) { return u.id === a.id; })) return;
      var got = false;
      try { got = !!a.cond(state); } catch (e) {}
      if (got) {
        state.achievements.push({ id: a.id, on: todayKey() });
        addLog(state, '🏆', 'Achievement unlocked: ' + a.name);
        fresh.push(a);
      }
    });
    return fresh;
  }

  /* Streak protection: were ALL the fully-missed days (between your last active
     day and yesterday, inclusive) scheduled rest days? Then the streak survives. */
  function missedDaysAllRest(state) {
    var rest = (state.settings && state.settings.restDays) || [];
    if (!rest.length) return false;
    var last = state.hero.lastActiveDay;
    var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 1); // start at yesterday
    var guard = 0;
    while (guard++ < 90) {
      var key = todayKey(d);
      if (key <= last) break;                     // reached (or passed) the last active day
      if (rest.indexOf(d.getDay()) < 0) return false; // a non-rest day was missed -> streak breaks
      d.setDate(d.getDate() - 1);
    }
    return true;
  }

  /* ---------- daily maintenance ---------- */
  function dailyReset(state) {
    var today = todayKey();
    if (state.lastSeenDay === today) return false;
    state.quests.forEach(function (q) {
      if (q.recurring && q.doneOn && q.doneOn !== today) q.doneOn = null;
    });
    var y = new Date(); y.setDate(y.getDate() - 1);
    var yKey = todayKey(y);
    /* expire temporary buffs (Focus Elixir etc.) that ran out */
    if (state.hero.buffs && state.hero.buffs.length) {
      state.hero.buffs = state.hero.buffs.filter(function (b) { return b.until >= today; });
    }
    /* monsters you didn't feed yesterday grow calmer (menace decays toward 1) */
    (state.habits || []).forEach(function (h) {
      if (h.type === 'bad' && menaceOf(h) > 1 && h.lastDoneOn !== yKey) {
        h.menace = Math.max(1, menaceOf(h) - MENACE_DECAY);
      }
    });
    if (state.redemption && state.redemption.on !== today) state.redemption = null; // yesterday's offer expired
    if (state.hero.lastActiveDay && state.hero.lastActiveDay !== today && state.hero.lastActiveDay !== todayKey(y)) {
      if (missedDaysAllRest(state)) {
        state.hero.lastActiveDay = todayKey(y); // scheduled rest days bridge the gap - streak protected
        addLog(state, '🌙', 'Rest day - your ' + state.hero.streak + '-day streak is protected.');
      } else if ((state.hero.shields || 0) > 0 && state.hero.streak > 0) {
        state.hero.shields--;
        state.hero.lastActiveDay = todayKey(y); // shield bridges the gap: next action continues the streak
        addLog(state, '🛡', 'Streak Shield consumed - your ' + state.hero.streak + '-day streak survives!');
      } else {
        /* a real streak deserves a second chance: clear ALL of today's dailies to mend it */
        if (state.hero.streak >= 3) {
          state.redemption = { streak: state.hero.streak, on: today };
          addLog(state, '🕯', 'Your ' + state.hero.streak + '-day streak broke - a Quest of Atonement is open until midnight.');
        }
        state.hero.streak = 0;
      }
    }
    if (state.boss && !state.boss.doneOn && today > state.boss.due) {
      addLog(state, '💀', 'The boss escaped: ' + state.boss.title + '. Name a new one when you’re ready.');
      state.boss = null;
    }
    state.hero.woundedOn = null; // wounds heal overnight
    state.lastSeenDay = today;
    addLog(state, '🌅', 'A new day begins - dailies and habits are fresh.');
    return true;
  }

  /* ---------- weekly stats (for Friday review) ---------- */
  function weekStats(state) {
    var days = [];
    for (var i = 6; i >= 0; i--) { var d = new Date(); d.setDate(d.getDate() - i); days.push(todayKey(d)); }
    var per = {}, tot = { xp: 0, earned: 0, spent: 0, quests: 0, habits: 0, slips: 0, focusMin: 0 };
    days.forEach(function (d) { per[d] = { xp: 0 }; });
    state.log.forEach(function (e) {
      if (!per[e.day]) return;
      per[e.day].xp += e.xp || 0;
      tot.xp += e.xp || 0;
      if (e.coins > 0) tot.earned += e.coins;
      if (e.coins < 0) tot.spent += -e.coins;
      if (e.icon === '⚔️') tot.quests++;
      if (e.icon === '🌱') tot.habits++;
      if (e.icon === '👾') tot.slips++;
      tot.focusMin += e.min || 0;
    });
    var moods = days.map(function (d) {
      var j = state.journal[d];
      var m = j && MOODS.find(function (x) { return x.key === j.mood; });
      return { day: d, emoji: m ? m.emoji : '·' };
    });
    return { days: days, per: per, tot: tot, moods: moods };
  }

  /* is a recurring quest scheduled to run on this weekday?  null/[] days = every day */
  function questActiveOn(q, d) {
    if (!q.recurring) return true;
    if (!q.days || !q.days.length) return true;
    var wd = (d || new Date()).getDay();
    return q.days.indexOf(wd) >= 0;
  }

  /* ---------- focus breakdown ----------
     Per-day focus minutes, split by the life area each session was tagged to,
     for a stacked "what did I work on" chart. Untagged time bucketed as '__none'. */
  function focusByDay(state, span) {
    span = span || 7;
    var days = [], per = {}, used = {};
    for (var i = span - 1; i >= 0; i--) { var d = new Date(); d.setDate(d.getDate() - i); var k = todayKey(d); days.push(k); per[k] = { total: 0, bySkill: {} }; }
    (state.log || []).forEach(function (e) {
      if (e.icon !== '⏳' || !per[e.day] || !e.min) return;
      var key = e.sk || '__none';
      per[e.day].bySkill[key] = (per[e.day].bySkill[key] || 0) + e.min;
      per[e.day].total += e.min;
      used[key] = true;
    });
    var order = [];
    (state.skills || []).forEach(function (s) { if (used[s.id]) order.push(s.id); });
    if (used['__none']) order.push('__none');
    var maxMin = 1, totalMin = 0;
    days.forEach(function (k) { if (per[k].total > maxMin) maxMin = per[k].total; totalMin += per[k].total; });
    return { days: days, per: per, skills: order, maxMin: maxMin, totalMin: totalMin };
  }

  /* ---------- insight layer ----------
     Pure math over data the app already collects (mood, sleep, focus, log).
     metricsByDay -> per-day numbers; insights -> plain-language findings. */
  function moodScore(key) { for (var i = 0; i < MOODS.length; i++) if (MOODS[i].key === key) return i + 1; return 0; }
  function metricsByDay(state, span) {
    span = span || 30;
    var out = {}, days = [];
    for (var i = span - 1; i >= 0; i--) { var d = new Date(); d.setDate(d.getDate() - i); var k = todayKey(d); days.push(k); out[k] = { mood: 0, sleep: null, focus: 0, xp: 0, quests: 0, habits: 0, slips: 0 }; }
    days.forEach(function (k) {
      var j = state.journal[k]; if (j) out[k].mood = moodScore(j.mood);
      var s = state.sleep[k]; if (s) out[k].sleep = s.hours;
    });
    (state.log || []).forEach(function (e) {
      if (!out[e.day]) return;
      out[e.day].focus += e.min || 0;
      out[e.day].xp += e.xp || 0;
      if (e.icon === '⚔️') out[e.day].quests++;
      if (e.icon === '🌱') out[e.day].habits++;
      if (e.icon === '👾') out[e.day].slips++;
    });
    return { days: days, per: out };
  }
  function avg(arr) { return arr.length ? arr.reduce(function (a, b) { return a + b; }, 0) / arr.length : 0; }
  function insights(state) {
    var m = metricsByDay(state, 30);
    var moodDays = m.days.filter(function (k) { return m.per[k].mood > 0; });
    var findings = [];
    var enough = moodDays.length >= 6;
    if (enough) {
      var hi = moodDays.filter(function (k) { return m.per[k].mood >= 4; });
      var lo = moodDays.filter(function (k) { return m.per[k].mood <= 2; });
      /* sleep vs mood */
      var hiSleep = hi.map(function (k) { return m.per[k].sleep; }).filter(function (v) { return v != null; });
      var loSleep = lo.map(function (k) { return m.per[k].sleep; }).filter(function (v) { return v != null; });
      if (hiSleep.length >= 2 && loSleep.length >= 2) {
        var ds = avg(hiSleep) - avg(loSleep);
        if (Math.abs(ds) >= 0.4) findings.push({ icon: '🌙', kind: 'sleep',
          text: 'On your best-mood days you sleep ' + Math.abs(ds).toFixed(1) + 'h ' + (ds > 0 ? 'more' : 'less') + ' (' + avg(hiSleep).toFixed(1) + 'h vs ' + avg(loSleep).toFixed(1) + 'h).' });
      }
      /* focus vs mood */
      if (hi.length >= 2 && lo.length >= 2) {
        var hf = avg(hi.map(function (k) { return m.per[k].focus; }));
        var lf = avg(lo.map(function (k) { return m.per[k].focus; }));
        if (Math.abs(hf - lf) >= 10) findings.push({ icon: '⏳', kind: 'focus',
          text: 'Good days average ' + Math.round(hf) + ' min of focus vs ' + Math.round(lf) + ' on low days - deep work tracks with how you feel.' });
        var hq = avg(hi.map(function (k) { return m.per[k].quests; }));
        var lq = avg(lo.map(function (k) { return m.per[k].quests; }));
        if (hq - lq >= 0.5) findings.push({ icon: '⚔️', kind: 'quests',
          text: 'You clear ' + hq.toFixed(1) + ' quests on good days vs ' + lq.toFixed(1) + ' on low ones.' });
      }
      /* slips vs mood */
      var hiSlips = avg(hi.map(function (k) { return m.per[k].slips; }));
      var loSlips = avg(lo.map(function (k) { return m.per[k].slips; }));
      if (loSlips - hiSlips >= 0.4) findings.push({ icon: '👾', kind: 'slips',
        text: 'Monster slips cluster on low-mood days (' + loSlips.toFixed(1) + ' vs ' + hiSlips.toFixed(1) + ') - mood and slips feed each other.' });
    }
    /* best sleep target: mood-weighted sleep */
    var withBoth = m.days.filter(function (k) { return m.per[k].mood > 0 && m.per[k].sleep != null; });
    var bestSleep = null;
    if (withBoth.length >= 6) {
      var top = withBoth.slice().sort(function (a, b) { return m.per[b].mood - m.per[a].mood; }).slice(0, Math.max(3, Math.round(withBoth.length / 3)));
      bestSleep = avg(top.map(function (k) { return m.per[k].sleep; }));
    }
    return { enough: enough, sampleSize: moodDays.length, findings: findings, bestSleep: bestSleep };
  }

  /* ---------- activity heatmap ----------
     GitHub-style grid of daily XP for the last `weeks` weeks, padded to full
     Sun-Sat columns. Cells carry a 0-4 intensity level for the UI. */
  function heatmap(state, weeks) {
    weeks = weeks || 12;
    var xpBy = {};
    (state.log || []).forEach(function (e) { if (e.xp > 0) xpBy[e.day] = (xpBy[e.day] || 0) + e.xp; });
    var start = new Date(); start.setDate(start.getDate() - (weeks * 7 - 1));
    start.setDate(start.getDate() - start.getDay());       // align to Sunday
    var todayK = todayKey();
    var cells = [], max = 0, total = 0, active = 0, streakGuard = weeks * 7 + 14;
    var d = new Date(start);
    while (streakGuard-- > 0) {
      var k = todayKey(d);
      var future = k > todayK;
      var xp = future ? 0 : (xpBy[k] || 0);
      cells.push({ day: k, xp: xp, future: future });
      if (!future) { if (xp > max) max = xp; total += xp; if (xp > 0) active++; }
      if (k >= todayK && d.getDay() === 6) break;          // finish the current column
      d.setDate(d.getDate() + 1);
    }
    max = max || 1;
    cells.forEach(function (c) {
      c.level = c.future || !c.xp ? 0 : Math.min(4, 1 + Math.floor(c.xp / max * 3.999));
    });
    return { cells: cells, max: max, total: total, activeDays: active };
  }

  /* trophy shelf: every weekly boss ever slain, newest first (from the log) */
  function bossTrophies(state) {
    var TAG = 'WEEKLY BOSS SLAIN: ';
    var out = [];
    (state.log || []).forEach(function (e) {
      if (e.icon === '🐲' && e.text && e.text.indexOf(TAG) === 0) out.push({ title: e.text.slice(TAG.length), day: e.day });
    });
    return out;
  }

  /* upgraded Friday review: the one win, the worst monster, a suggested focus */
  function weeklyReview(state) {
    var w = weekStats(state);
    var bestDay = null, bestXp = -1;
    w.days.forEach(function (d) { if (w.per[d].xp > bestXp) { bestXp = w.per[d].xp; bestDay = d; } });
    /* worst monster: most slips logged in the last 7 days */
    var since = w.days[0];
    var slipCount = {};
    (state.log || []).forEach(function (e) {
      if (e.icon === '👾' && e.day >= since) { var t = e.text.replace('Monster hit: ', ''); slipCount[t] = (slipCount[t] || 0) + 1; }
    });
    var worstMonster = null, worstN = 0;
    Object.keys(slipCount).forEach(function (t) { if (slipCount[t] > worstN) { worstN = slipCount[t]; worstMonster = t; } });
    /* suggestion */
    var ins = insights(state);
    var suggestion;
    if (worstMonster && worstN >= 2) suggestion = 'Your toughest monster this week was “' + worstMonster + '” (' + worstN + ' slips). Make beating it your weekly boss.';
    else if (ins.bestSleep) suggestion = 'You feel best around ' + ins.bestSleep.toFixed(1) + 'h of sleep - protect that this week.';
    else if (w.tot.focusMin < 120) suggestion = 'Only ' + Math.round(w.tot.focusMin) + ' min of focus this week - book two deep-work blocks.';
    else suggestion = 'Strong week. Name a weekly boss and keep the streak alive.';
    return { week: w, bestDay: bestDay, bestXp: Math.max(0, bestXp), worstMonster: worstMonster, worstN: worstN, insights: ins, suggestion: suggestion };
  }

  /* ---------- actions ---------- */
  var actions = {

    addQuest: function (state, o) {
      var days = null;
      if (o.recurring && Array.isArray(o.days) && o.days.length && o.days.length < 7) {
        days = o.days.map(Number).filter(function (n) { return n >= 0 && n <= 6; });
        if (!days.length) days = null;
      }
      var q = { id: uid(), title: o.title.trim(), diff: DIFF[o.diff] ? o.diff : 'normal',
        skillId: o.skillId || null, due: o.due || null, recurring: !!o.recurring, days: days,
        main: o.main || null, doneOn: null, createdOn: todayKey() };
      state.quests.push(q);
      return q;
    },

    completeQuest: function (state, id) {
      var q = state.quests.find(function (x) { return x.id === id; });
      if (!q || q.doneOn === todayKey() || (!q.recurring && q.doneOn)) return null;
      q.doneOn = todayKey();
      state.counters.quests++;
      var res = grant(state, DIFF[q.diff], q.skillId);
      addLog(state, '⚔️', 'Quest cleared: ' + q.title, { xp: res.xp, coins: res.coins });
      res.title = q.title;
      return res;
    },

    deleteQuest: function (state, id) {
      state.quests = state.quests.filter(function (q) { return q.id !== id; });
    },

    /* edit a quest in place (title/diff/skill/due/schedule) - does not touch progress */
    editQuest: function (state, id, o) {
      var q = state.quests.find(function (x) { return x.id === id; });
      if (!q) return null;
      if (o.title != null && o.title.trim()) q.title = o.title.trim();
      if (o.diff && DIFF[o.diff]) q.diff = o.diff;
      if ('skillId' in o) q.skillId = o.skillId || null;
      if ('due' in o) q.due = o.due || null;
      if ('days' in o) {
        var days = null;
        if (q.recurring && Array.isArray(o.days) && o.days.length && o.days.length < 7) {
          days = o.days.map(Number).filter(function (n) { return n >= 0 && n <= 6; });
          if (!days.length) days = null;
        }
        q.days = days;
      }
      return q;
    },

    addGoal: function (state, o) {
      var g = { id: uid(), title: o.title.trim(), note: o.note || '', doneOn: null, createdOn: todayKey() };
      state.goals.push(g);
      return g;
    },

    goalProgress: function (state, goalId) {
      var qs = state.quests.filter(function (q) { return q.main === goalId && !q.recurring; });
      return { done: qs.filter(function (q) { return !!q.doneOn; }).length, total: qs.length };
    },

    completeGoal: function (state, id) {
      var g = state.goals.find(function (x) { return x.id === id; });
      if (!g || g.doneOn) return null;
      g.doneOn = todayKey();
      var res = grant(state, { xp: GOAL_XP, coins: GOAL_COINS }, null);
      addLog(state, '🏆', 'MAIN QUEST complete: ' + g.title, { xp: res.xp, coins: res.coins });
      return res;
    },

    deleteGoal: function (state, id) {
      state.goals = state.goals.filter(function (g) { return g.id !== id; });
      state.quests.forEach(function (q) { if (q.main === id) q.main = null; });
    },

    editGoal: function (state, id, o) {
      var g = state.goals.find(function (x) { return x.id === id; });
      if (!g) return null;
      if (o.title != null && o.title.trim()) g.title = o.title.trim();
      if ('note' in o) g.note = o.note || '';
      return g;
    },

    addHabit: function (state, o) {
      var h = { id: uid(), title: o.title.trim(), type: o.type === 'bad' ? 'bad' : 'good',
        skillId: o.skillId || null, streak: 0, lastDoneOn: null, slips: 0,
        cleanSince: o.type === 'bad' ? todayKey() : null, history: [], bestClean: 0,
        target: clamp(Math.round(o.target) || 7, 1, 7), menace: 1 };
      state.habits.push(h);
      return h;
    },

    /* Monday-start week helpers for weekly-target habits */
    weekStart: function (d) {
      d = d ? new Date(d + 'T00:00:00') : new Date();
      var day = (d.getDay() + 6) % 7;
      d.setDate(d.getDate() - day);
      return todayKey(d);
    },
    weekCount: function (h, ref) {
      var ws = actions.weekStart(ref);
      return (h.history || []).filter(function (k) { return actions.weekStart(k) === ws; }).length;
    },
    /* consecutive weeks the target was met; the in-progress current week never breaks it */
    weekStreak: function (h) {
      var streak = 0;
      var cur = new Date(actions.weekStart() + 'T00:00:00');
      if (actions.weekCount(h, todayKey(cur)) >= h.target) streak++;
      for (var w = 1; w <= 52; w++) {
        var d = new Date(cur); d.setDate(d.getDate() - 7 * w);
        if (actions.weekCount(h, todayKey(d)) >= h.target) streak++;
        else break;
      }
      return streak;
    },

    /* upgrade a side quest into a main quest */
    promoteQuest: function (state, id) {
      var q = state.quests.find(function (x) { return x.id === id; });
      if (!q || q.recurring || q.doneOn) return null;
      var g = { id: uid(), title: q.title, note: '', doneOn: null, createdOn: todayKey() };
      state.goals.push(g);
      state.quests = state.quests.filter(function (x) { return x.id !== id; });
      addLog(state, '⬆️', 'Side quest promoted to MAIN QUEST: ' + q.title);
      return g;
    },

    /* deadline agenda: due quests grouped by urgency */
    agenda: function (state) {
      var today = todayKey();
      var qs = state.quests.filter(function (q) { return q.due && !q.recurring && !q.doneOn; })
        .sort(function (a, b) { return a.due < b.due ? -1 : 1; });
      return qs.map(function (q) {
        var days = Math.round((new Date(q.due + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
        var bucket = days < 0 ? 'overdue' : days === 0 ? 'today' : days <= 7 ? 'week' : 'later';
        return { q: q, days: days, bucket: bucket };
      });
    },

    doHabit: function (state, id) {
      var h = state.habits.find(function (x) { return x.id === id; });
      if (!h || h.type !== 'good' || h.lastDoneOn === todayKey()) return null;
      var y = new Date(); y.setDate(y.getDate() - 1);
      h.streak = (h.lastDoneOn === todayKey(y)) ? h.streak + 1 : 1;
      h.lastDoneOn = todayKey();
      h.history = h.history || [];
      h.history.push(todayKey());
      if (h.history.length > 60) h.history = h.history.slice(-60);
      var bonus = Math.min(10, h.streak);
      var res = grant(state, { xp: HABIT_XP + bonus, coins: HABIT_COINS }, h.skillId);
      addLog(state, '🌱', 'Habit kept: ' + h.title + ' (streak ' + h.streak + ')', { xp: res.xp, coins: res.coins });
      res.streak = h.streak;
      return res;
    },

    /* bad habit: log a slip - the monster hits you. The more you feed it, the
       harder it hits (menace grows per slip, decays on clean days). Warden softens it. */
    slipHabit: function (state, id) {
      var h = state.habits.find(function (x) { return x.id === id; });
      if (!h || h.type !== 'bad') return null;
      h.bestClean = Math.max(h.bestClean || 0, cleanDaysOf(h));
      h.slips++;
      h.lastDoneOn = todayKey();
      h.cleanSince = todayKey();
      var men = menaceOf(h);
      var dmgHp = Math.round(SLIP_HP * men * slipDampen(state));
      var hit = damage(state, dmgHp, SLIP_COINS);
      h.menace = clamp(men + MENACE_STEP, 1, MENACE_MAX);
      addLog(state, '👾', 'Monster hit: ' + h.title, { hp: -dmgHp, coins: -SLIP_COINS });
      return { hp: -dmgHp, coins: -SLIP_COINS, ko: hit.ko, downed: hit.downed, cost: hit.cost, hardcore: hit.hardcore, title: h.title, menace: h.menace };
    },

    cleanDays: function (h) { return cleanDaysOf(h); },

    deleteHabit: function (state, id) {
      state.habits = state.habits.filter(function (h) { return h.id !== id; });
    },

    /* edit a habit's title (and, for good habits, its life area + weekly target) */
    editHabit: function (state, id, o) {
      var h = state.habits.find(function (x) { return x.id === id; });
      if (!h) return null;
      if (o.title != null && o.title.trim()) h.title = o.title.trim();
      if (h.type === 'good') {
        if ('skillId' in o) h.skillId = o.skillId || null;
        if (o.target != null) h.target = clamp(Math.round(o.target) || 7, 1, 7);
      }
      return h;
    },

    /* ----- pomodoro focus engine -----
       Runs work/break cycles forever until stopped. Payment = worked minutes
       (full work phases + elapsed part of the current one), not all-or-nothing. */
    startFocus: function (state, o) {
      if (state.activeFocus) return null;
      var work = clamp(Math.round(o.work) || 25, 5, 180);
      var brk = clamp(Math.round(o.brk) || 0, 0, 60);
      var now = o.now || Date.now();
      state.activeFocus = { work: work, brk: brk, phase: 'work', phaseEnd: now + work * 60000,
        workedMs: 0, cycles: 0, skillId: o.skillId || null, goalId: o.goalId || null,
        label: (o.label || '').trim(), startedAt: new Date(now).toISOString(),
        pausedAt: null, awaitingBreak: false };
      return state.activeFocus;
    },

    /* advance phases; returns {event:'breakReady'|'work', healed} when something
       flips, else null. A finished work phase does NOT auto-start the break -
       it waits (awaitingBreak) for the user to begin it. Paused = frozen. */
    tickFocus: function (state, now) {
      var f = state.activeFocus;
      now = now || Date.now();
      if (!f || f.pausedAt || f.awaitingBreak || now < f.phaseEnd) return null;
      var last = null, healed = 0, guard = 0;
      while (f && !f.pausedAt && !f.awaitingBreak && now >= f.phaseEnd && guard++ < 500) {
        if (f.phase === 'work') {
          f.workedMs += f.work * 60000;
          if (f.brk > 0) { f.awaitingBreak = true; last = 'breakReady'; } // stop; wait for the user
          else { f.cycles++; f.phaseEnd += f.work * 60000; last = 'work'; }
        } else {
          f.phase = 'work'; f.cycles++; f.phaseEnd += f.work * 60000; last = 'work';
          var before = state.hero.hp;
          state.hero.hp = clamp(state.hero.hp + BREAK_HP, 0, maxHpOf(state));
          healed += state.hero.hp - before;
        }
      }
      return last ? { event: last, healed: healed } : null;
    },

    /* begin the break the user was offered */
    startBreak: function (state, now) {
      var f = state.activeFocus;
      if (!f || !f.awaitingBreak) return null;
      now = now || Date.now();
      f.awaitingBreak = false; f.phase = 'break'; f.phaseEnd = now + f.brk * 60000;
      return { started: true };
    },

    /* pause / resume the running timer without collecting (worked time freezes) */
    pauseFocus: function (state, now) {
      var f = state.activeFocus;
      if (!f || f.pausedAt || f.awaitingBreak) return null;
      f.pausedAt = now || Date.now();
      return { paused: true };
    },
    resumeFocus: function (state, now) {
      var f = state.activeFocus;
      if (!f || !f.pausedAt) return null;
      now = now || Date.now();
      f.phaseEnd += (now - f.pausedAt); // push the deadline out by the paused span
      f.pausedAt = null;
      return { resumed: true };
    },

    /* worked ms right now, including the running part of a work phase (frozen
       while paused; a full work phase awaiting its break is already banked) */
    focusWorkedMs: function (state, now) {
      var f = state.activeFocus;
      if (!f) return 0;
      now = f.pausedAt || now || Date.now();
      var ms = f.workedMs;
      if (f.phase === 'work' && !f.awaitingBreak) ms += clamp(f.work * 60000 - (f.phaseEnd - now), 0, f.work * 60000);
      return ms;
    },

    /* stop & collect: pays for accumulated work time */
    stopFocus: function (state, now) {
      var f = state.activeFocus;
      if (!f) return null;
      now = now || Date.now();
      var minutes = Math.floor(actions.focusWorkedMs(state, now) / 60000);
      var paid = Math.min(FOCUS_MAX_PAY_MIN, minutes);
      var label = f.label;
      var skillId = f.skillId;
      state.activeFocus = null;
      if (paid < FOCUS_MIN_PAY) {
        addLog(state, '🏳️', 'Focus session stopped at ' + minutes + ' min (under ' + FOCUS_MIN_PAY + ' - no reward)');
        return { minutes: minutes, tooShort: true };
      }
      state.counters.focusMin += paid;
      var res = grant(state, { xp: Math.round(paid * FOCUS_XP_PER_MIN), coins: Math.round(paid * FOCUS_COIN_PER_MIN) }, skillId);
      /* deep work attached to a main quest banks invested time on it */
      if (f.goalId) {
        var g = state.goals.find(function (x) { return x.id === f.goalId && !x.doneOn; });
        if (g) { g.focusMin = (g.focusMin || 0) + paid; res.goalTitle = g.title; }
      }
      addLog(state, '⏳', 'Focus session: ' + paid + ' min' + (label ? ' - ' + label : ''), { xp: res.xp, coins: res.coins, min: paid, sk: skillId, label: label });
      res.minutes = paid;
      return res;
    },

    /* skip the rest of a break */
    skipBreak: function (state, now) {
      var f = state.activeFocus;
      if (!f || f.phase !== 'break') return null;
      f.phaseEnd = now || Date.now();
      return actions.tickFocus(state, now);
    },

    /* ----- weekly boss: one big task, 7 days to slay it ----- */
    setBoss: function (state, o) {
      if (state.boss && !state.boss.doneOn) return null;
      var d = new Date(); d.setDate(d.getDate() + BOSS_DAYS);
      state.boss = { title: o.title.trim(), setOn: todayKey(), due: todayKey(d), doneOn: null };
      addLog(state, '🐲', 'Weekly boss appears: ' + state.boss.title);
      return state.boss;
    },

    slayBoss: function (state) {
      var b = state.boss;
      if (!b || b.doneOn) return null;
      b.doneOn = todayKey();
      state.counters.bosses = (state.counters.bosses || 0) + 1;
      var res = grant(state, { xp: BOSS_XP, coins: BOSS_COINS }, null);
      addLog(state, '🐲', 'WEEKLY BOSS SLAIN: ' + b.title, { xp: res.xp, coins: res.coins });
      res.title = b.title;
      state.boss = null;
      return res;
    },

    abandonBoss: function (state) {
      if (!state.boss || state.boss.doneOn) return null;
      addLog(state, '🏳️', 'Boss abandoned: ' + state.boss.title);
      state.boss = null;
      return { abandoned: true };
    },

    bossDaysLeft: function (state) {
      if (!state.boss) return null;
      return Math.round((new Date(state.boss.due + 'T00:00:00') - new Date(todayKey() + 'T00:00:00')) / 86400000);
    },

    /* ----- daily chest ----- only dailies scheduled for today count ----- */
    chestStatus: function (state) {
      var today = todayKey(), now = new Date();
      var dailies = state.quests.filter(function (q) { return q.recurring && questActiveOn(q, now); });
      var done = dailies.filter(function (q) { return q.doneOn === today; }).length;
      return { total: dailies.length, done: done,
        claimed: state.chestClaimedOn === today,
        eligible: dailies.length > 0 && done === dailies.length && state.chestClaimedOn !== today };
    },

    /* loot table: mostly coins, sometimes a jackpot / potion / cosmetic frame.
       Fortune boon tilts the odds toward the good stuff. rng() is injectable for tests. */
    rollChestLoot: function (state, roll) {
      var lucky = boonCount(state, 'fortune') > 0;
      var jack = lucky ? 0.20 : 0.14, pot = lucky ? 0.18 : 0.12, fr = lucky ? 0.12 : 0.08;
      var pFrame = 1 - fr, pPot = pFrame - pot, pJack = pPot - jack; // thresholds from the top
      if (roll >= pFrame) {
        var owned = (state.cosmetics && state.cosmetics.frames) || [];
        var avail = FRAMES.filter(function (f) { return owned.indexOf(f.id) < 0; });
        if (avail.length) return { type: 'frame', frame: avail[Math.floor((roll - pFrame) / (1 - pFrame) * avail.length) % avail.length] };
        return { type: 'jackpot' }; // all frames owned -> coins instead
      }
      if (roll >= pPot) return { type: 'potion' };
      if (roll >= pJack) return { type: 'jackpot' };
      return { type: 'coins' };
    },

    claimChest: function (state, rng) {
      var st = actions.chestStatus(state);
      if (!st.eligible) return null;
      rng = rng || Math.random;
      state.chestClaimedOn = todayKey();
      state.counters.chests++;
      var coins = CHEST_COIN_MIN + Math.floor(rng() * (CHEST_COIN_SPREAD + 1));
      var res = grant(state, { xp: CHEST_XP, coins: coins }, null);
      /* bonus loot roll - reported under res.loot so res.coins stays the base drop */
      var loot = actions.rollChestLoot(state, rng());
      if (loot.type === 'jackpot') {
        var extra = CHEST_JACKPOT_MIN + Math.floor(rng() * (CHEST_JACKPOT_SPREAD + 1));
        if (boonCount(state, 'fortune') > 0) extra = Math.round(extra * 1.25);
        state.hero.coins += extra;
        res.loot = { type: 'jackpot', coins: extra };
      } else if (loot.type === 'potion') {
        state.inventory.potion = (state.inventory.potion || 0) + 1;
        res.loot = { type: 'potion' };
      } else if (loot.type === 'frame') {
        state.cosmetics.frames = state.cosmetics.frames || [];
        state.cosmetics.frames.push(loot.frame.id);
        res.loot = { type: 'frame', frame: loot.frame };
      } else {
        res.loot = null;
      }
      addLog(state, '🎁', 'Daily chest opened!' + (res.loot ? ' Rare drop: ' + (res.loot.type === 'frame' ? res.loot.frame.name + ' frame' : res.loot.type === 'potion' ? 'Focus Elixir' : '+' + res.loot.coins + ' 💰 jackpot') : ''), { xp: res.xp, coins: res.coins });
      return res;
    },

    /* ----- quest of atonement: mend a streak broken this very day -----
       Eligible once ALL of today's scheduled dailies are done (or, with no
       dailies on the board, once any XP was earned today). Restores the old
       streak +1 so the chain continues as if unbroken. */
    redeemEligible: function (state) {
      var r = state.redemption;
      if (!r || r.on !== todayKey()) return { active: false };
      var st = actions.chestStatus(state);
      var done = st.total > 0
        ? st.done === st.total
        : state.log.some(function (e) { return e.day === todayKey() && e.xp > 0; });
      return { active: true, eligible: done, streak: r.streak, done: st.done, total: st.total };
    },

    redeemStreak: function (state) {
      var e = actions.redeemEligible(state);
      if (!e.active) return null;
      if (!e.eligible) return { fail: 'work', done: e.done, total: e.total };
      state.hero.streak = e.streak + 1;
      if (state.hero.streak > (state.hero.bestStreak || 0)) state.hero.bestStreak = state.hero.streak;
      state.hero.lastActiveDay = todayKey();
      state.redemption = null;
      state.counters.mends = (state.counters.mends || 0) + 1;
      addLog(state, '🕯', 'Streak mended - the flame burns again at ' + state.hero.streak + ' days.');
      return { streak: state.hero.streak };
    },

    /* ----- shop ----- */
    addShopItem: function (state, o) {
      var tab = ['market', 'hotel', 'black'].indexOf(o.tab) >= 0 ? o.tab : 'market';
      var special = o.special || null;
      var it = { id: uid(), title: o.title.trim(), price: Math.max(1, Math.round(o.price || 10)),
        tab: tab, hp: Math.max(0, Math.round(o.hp || 0)), dmg: Math.max(0, Math.round(o.dmg || 0)),
        special: special,
        surge: special ? 0 : (typeof o.surge === 'number' ? Math.max(0, o.surge) : SURGE_DEFAULT[tab]),
        limit: special ? 0 : (typeof o.limit === 'number' ? Math.max(0, Math.round(o.limit)) : LIMIT_DEFAULT[tab]),
        dayBuys: 0, dayBuysOn: null };
      state.shop.push(it);
      return it;
    },

    buyInfo: function (state, it) { return buyInfo(state, it); },

    buy: function (state, id) {
      var it = state.shop.find(function (x) { return x.id === id; });
      if (!it) return null;
      /* Streak Shield: one-at-a-time, never surges/caps */
      if (it.special === 'shield') {
        if ((state.hero.shields || 0) >= 1) return { fail: 'shield' };
        if (state.hero.coins < it.price) return { fail: 'coins' };
        state.hero.coins -= it.price;
        state.counters.purchases++;
        state.hero.shields = (state.hero.shields || 0) + 1;
        addLog(state, '🛡', 'Bought: ' + it.title, { coins: -it.price });
        return { title: it.title, coins: -it.price, shield: true };
      }
      var info = buyInfo(state, it);
      if (info.capped) return { fail: 'limit', limit: it.limit, count: info.count };
      var price = info.price;
      if (state.hero.coins < price) return { fail: 'coins', price: price };
      state.hero.coins -= price;
      state.counters.purchases++;
      if (it.dayBuysOn !== todayKey()) { it.dayBuysOn = todayKey(); it.dayBuys = 0; }
      it.dayBuys++;
      var healed = 0, ko = false;
      if (it.hp > 0) {
        var before = state.hero.hp;
        state.hero.hp = clamp(state.hero.hp + it.hp, 0, maxHpOf(state));
        healed = state.hero.hp - before;
        state.hero.woundedOn = null; // real rest heals wounds
      }
      if (it.dmg > 0) {
        var hit = damage(state, it.dmg, 0);
        healed = -it.dmg;
        ko = hit.ko;
      }
      var surged = price > it.price;
      addLog(state, it.tab === 'black' ? '🕶️' : it.tab === 'hotel' ? '🛏️' : '🛒',
        'Bought: ' + it.title + (surged ? ' (×' + it.dayBuys + ' today · surged to ' + price + ')' : ''), { coins: -price, hp: healed });
      return { title: it.title, coins: -price, hp: healed, ko: ko, price: price, count: it.dayBuys, surged: surged };
    },

    deleteShopItem: function (state, id) {
      state.shop = state.shop.filter(function (s) { return s.id !== id; });
    },

    logJournal: function (state, moodKey, note) {
      var day = todayKey();
      var first = !state.journal[day];
      state.journal[day] = { mood: moodKey, note: note || '' };
      if (!first) return { updated: true };
      var res = grant(state, { xp: JOURNAL_XP, coins: JOURNAL_COINS }, null);
      var m = MOODS.find(function (x) { return x.key === moodKey; });
      addLog(state, m ? m.emoji : '📔', 'Journal entry logged', { xp: res.xp, coins: res.coins });
      return res;
    },

    logSleep: function (state, hours, quality) {
      var day = todayKey();
      var first = !state.sleep[day];
      hours = clamp(Number(hours) || 0, 0, 16);
      quality = clamp(Math.round(quality) || 3, 1, 5);
      state.sleep[day] = { hours: hours, quality: quality };
      if (!first) return { updated: true };
      var heal = Math.round(clamp(hours / 8, 0, 1.2) * quality * 6);
      var before = state.hero.hp;
      state.hero.hp = clamp(state.hero.hp + heal, 0, maxHpOf(state));
      state.hero.woundedOn = null; // sleep heals wounds
      var res = grant(state, { xp: SLEEP_XP, coins: 0 }, null);
      res.hp = state.hero.hp - before;
      addLog(state, '🌙', 'Sleep logged: ' + hours + 'h, quality ' + quality + '/5', { xp: res.xp, hp: res.hp });
      return res;
    },

    addSkill: function (state, name, icon) {
      var s = { id: uid(), name: name.trim(), icon: icon || '✨', xp: 0, level: 1 };
      state.skills.push(s);
      return s;
    },

    deleteSkill: function (state, id) {
      state.skills = state.skills.filter(function (s) { return s.id !== id; });
      state.quests.forEach(function (q) { if (q.skillId === id) q.skillId = null; });
      state.habits.forEach(function (h) { if (h.skillId === id) h.skillId = null; });
    }
  };

  /* ---------- persistence + migration ---------- */
  var KEY = 'liferpg.save.v1';

  function migrate(s) {
    if (!s.goals) s.goals = [];
    if (!s.sleep) s.sleep = {};
    if (!s.journal) s.journal = {};
    if (!s.counters) s.counters = { quests: 0, focusMin: 0, purchases: 0, chests: 0 };
    ['quests', 'focusMin', 'purchases', 'chests', 'bosses', 'ascensions', 'mends', 'deaths', 'comebacks'].forEach(function (k) { if (typeof s.counters[k] !== 'number') s.counters[k] = 0; });
    if (!('downed' in s.hero)) s.hero.downed = null;
    /* v5: prestige, inventory, cosmetics, buffs, menace, scheduled dailies */
    if (!s.hero.boons || typeof s.hero.boons !== 'object') s.hero.boons = {};
    if (typeof s.hero.ascension !== 'number') s.hero.ascension = 0;
    if (!Array.isArray(s.hero.buffs)) s.hero.buffs = [];
    if (typeof s.hero.frame !== 'string') s.hero.frame = '';
    if (!s.inventory || typeof s.inventory !== 'object') s.inventory = { potion: 0 };
    if (typeof s.inventory.potion !== 'number') s.inventory.potion = 0;
    if (!s.cosmetics || typeof s.cosmetics !== 'object') s.cosmetics = { frames: [] };
    if (!Array.isArray(s.cosmetics.frames)) s.cosmetics.frames = [];
    (s.quests || []).forEach(function (q) { if (!('days' in q)) q.days = null; });
    (s.goals || []).forEach(function (g) { if (typeof g.focusMin !== 'number') g.focusMin = 0; });
    if (!('redemption' in s)) s.redemption = null;
    if (typeof s.hero.bestStreak !== 'number') s.hero.bestStreak = Math.max(0, s.hero.streak || 0);
    if (!s.achievements) s.achievements = [];
    if (!('activeFocus' in s)) s.activeFocus = null;
    if (s.activeFocus && !s.activeFocus.phase) s.activeFocus = null; // old one-shot format
    if (!('chestClaimedOn' in s)) s.chestClaimedOn = null;
    if (!('boss' in s)) s.boss = null;
    if (!s.settings) s.settings = { sound: true };
    if (typeof s.settings.sound !== 'boolean') s.settings.sound = true;
    if (!s.settings.theme) s.settings.theme = 'dungeon';
    if (!s.settings.music) s.settings.music = 'lofi';
    if (typeof s.settings.musicUrl !== 'string') s.settings.musicUrl = '';
    if (typeof s.settings.escalate !== 'boolean') s.settings.escalate = true;
    if (typeof s.settings.reminders !== 'boolean') s.settings.reminders = false;
    if (typeof s.settings.board !== 'boolean') s.settings.board = false;
    if (typeof s.settings.friends !== 'boolean') s.settings.friends = false;
    if (typeof s.settings.mascot !== 'boolean') s.settings.mascot = true;
    if (typeof s.settings.hardcore !== 'boolean') s.settings.hardcore = false;
    if (!Array.isArray(s.settings.restDays)) s.settings.restDays = [];
    if (typeof s.settings.reminderHour !== 'number' || s.settings.reminderHour < 0 || s.settings.reminderHour > 23) s.settings.reminderHour = 18;
    if (typeof s.hero.title !== 'string') s.hero.title = '';
    if (typeof s.hero.shields !== 'number') s.hero.shields = 0;
    if (!('woundedOn' in s.hero)) s.hero.woundedOn = null;
    (s.habits || []).forEach(function (h) {
      if (!Array.isArray(h.history)) h.history = h.lastDoneOn ? [h.lastDoneOn] : [];
      if (typeof h.bestClean !== 'number') h.bestClean = 0;
      if (typeof h.target !== 'number') h.target = 7;
      if (h.type === 'bad' && typeof h.menace !== 'number') h.menace = 1;
    });
    (s.shop || []).forEach(function (it) {
      if (typeof it.dmg !== 'number') it.dmg = 0;
      if (!('special' in it)) it.special = null;
      /* v5: anti-binge surge + daily cap (tab defaults; shields never surge) */
      if (typeof it.surge !== 'number') it.surge = it.special ? 0 : (SURGE_DEFAULT[it.tab] != null ? SURGE_DEFAULT[it.tab] : 0.4);
      if (typeof it.limit !== 'number') it.limit = it.special ? 0 : (LIMIT_DEFAULT[it.tab] != null ? LIMIT_DEFAULT[it.tab] : 0);
      if (typeof it.dayBuys !== 'number') it.dayBuys = 0;
      if (!('dayBuysOn' in it)) it.dayBuysOn = null;
    });
    var iconFix = { '⚒️': '🔨', '🗣️': '🤝', '💰': '💎' };
    (s.skills || []).forEach(function (k) { if (iconFix[k.icon]) k.icon = iconFix[k.icon]; });
    s.log = (s.log || []).map(function (e) { if (typeof e.min !== 'number') e.min = 0; return e; });
    s.schema = SCHEMA;
    return s;
  }

  /* ---------- mascot briefing ----------
     A deterministic "daily update" the guide mascot can speak: what matters most
     right now, in priority order, capped at 5 lines. No LLM required - phrasing
     variety comes from a per-day pick so it doesn't feel copy-pasted. */
  function pickByDay(arr, now) {
    var k = todayKey(now), h = 0;
    for (var i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
    return arr[h % arr.length];
  }
  function briefing(state, now) {
    now = now || new Date();
    var today = todayKey(now), lines = [], mood = 'happy';
    var hour = now.getHours();
    var hello = pickByDay(hour < 12
      ? ['Rise and shine', 'Good morning', 'A new day of adventure', 'Morning, hero']
      : hour < 18
      ? ['Good afternoon', 'Welcome back', 'Still fighting the good fight', 'Afternoon, hero']
      : ['Good evening', 'Evening, hero', 'One last push today', 'The day is almost won'], now);
    var greeting = hello + ', ' + (state.hero.name || 'Hero') + '!';

    // 0) defeated: the single most urgent thing
    if (state.hero.downed) {
      mood = 'urgent';
      lines.push({ icon: '💀', tab: 'market', text: 'You were defeated - half XP and no coins until you rest to full HP and rise. Heal at the 🛏️ Hotel or sleep well.' });
    }
    // 1) streak emergency: Quest of Atonement
    if (state.redemption && state.redemption.on === today) {
      mood = 'urgent';
      lines.push({ icon: '🕯', tab: 'today', text: 'Your ' + state.redemption.streak + '-day streak broke! Clear ALL of today’s dailies before midnight to mend it.' });
    }
    // 2) wounded / low HP
    if (state.hero.woundedOn === today) {
      if (mood === 'happy') mood = 'worried';
      lines.push({ icon: '🩸', tab: 'market', text: 'You’re wounded - XP is halved today. Rest at the Hotel or log good sleep.' });
    } else if (state.hero.hp <= maxHpOf(state) * 0.3) {
      if (mood === 'happy') mood = 'worried';
      lines.push({ icon: '❤️', tab: 'market', text: 'HP is low (' + state.hero.hp + '/' + maxHpOf(state) + '). A visit to the Hotel would do you good.' });
    }
    // 3) boss deadline
    if (state.boss && !state.boss.doneOn) {
      var dl = actions.bossDaysLeft(state);
      if (dl <= 1) { if (mood === 'happy') mood = 'worried'; lines.push({ icon: '🐲', tab: 'quests', text: 'The boss "' + state.boss.title + '" escapes ' + (dl <= 0 ? 'TODAY' : 'tomorrow') + '! Slay it!' }); }
      else if (dl <= 3) lines.push({ icon: '🐲', tab: 'quests', text: dl + ' days left to slay "' + state.boss.title + '".' });
    }
    // 4) overdue / due-today quests
    var due = actions.agenda(state).filter(function (it) { return it.bucket === 'overdue' || it.bucket === 'today'; });
    if (due.length) lines.push({ icon: '🔥', tab: 'today', text: due.length === 1 ? '"' + due[0].q.title + '" is due' + (due[0].days < 0 ? ' - it’s late!' : ' today.') : due.length + ' quests are due (or overdue).' });
    // 5) dailies / chest
    var chest = actions.chestStatus(state);
    if (chest.eligible) lines.push({ icon: '🎁', tab: 'today', text: 'All dailies cleared - your chest is ready to open!' });
    else if (chest.total > 0 && chest.done < chest.total) lines.push({ icon: '🔁', tab: 'today', text: (chest.total - chest.done) + ' of ' + chest.total + ' dailies left. Clear them all to open the chest.' });
    // 6) habits to check
    var habitsLeft = state.habits.filter(function (h) { return h.type === 'good' && h.lastDoneOn !== today; }).length;
    if (habitsLeft) lines.push({ icon: '🌱', tab: 'habits', text: habitsLeft + ' habit' + (habitsLeft === 1 ? '' : 's') + ' to check off today.' });
    // 7) journal / sleep in the evening
    if (hour >= 18 && !state.journal[today]) lines.push({ icon: '📔', tab: 'journal', text: 'No journal entry yet - one honest line pays 15 XP.' });
    // 8) streak flex when things are calm
    if (!lines.length) {
      lines.push({ icon: '✨', tab: 'stats', text: pickByDay([
        'All clear! A perfect moment for a focus run.',
        'Board’s clean. Want to bank some deep work in Focus?',
        'Nothing urgent. Check Stats to admire your progress.',
        'Quiet day. Maybe plan the week’s boss?'], now) });
      mood = 'proud';
    }
    if (state.hero.streak >= 3 && mood === 'happy') mood = 'fired';
    return { greeting: greeting, mood: mood, lines: lines.slice(0, 5),
      streak: state.hero.streak, level: state.hero.level };
  }

  function save(state, storage) { storage.setItem(KEY, JSON.stringify(state)); }
  function load(storage) {
    var raw = storage.getItem(KEY);
    if (!raw) return null;
    try {
      var s = JSON.parse(raw);
      if (!s || !s.hero) return null;
      return migrate(s);
    } catch (e) { return null; }
  }

  return {
    SCHEMA: SCHEMA, DIFF: DIFF, RANKS: RANKS, MOODS: MOODS, ACHIEVEMENTS: ACHIEVEMENTS, MAX_HP: MAX_HP, KEY: KEY,
    BOONS: BOONS, FRAMES: FRAMES, PATHS: PATHS, ASCEND_LEVEL: ASCEND_LEVEL, POTION_XP_MULT: POTION_XP_MULT,
    uid: uid, todayKey: todayKey, clamp: clamp,
    xpForLevel: xpForLevel, skillXpForLevel: skillXpForLevel, rankFor: rankFor, nextRank: nextRank, streakMult: streakMult, buildICS: buildICS,
    progressKey: progressKey, compareProgress: compareProgress,
    skillTier: skillTier, boonById: boonById, frameById: frameById, pathById: pathById,
    boonCount: boonCount, maxHpOf: maxHpOf, menaceOf: menaceOf, ascendReady: ascendReady, buffXpMult: buffXpMult,
    buyInfo: buyInfo, buyPrice: buyPrice, buyCount: buyCount,
    newState: newState, seed: seed, seedPreset: seedPreset, dailyReset: dailyReset, migrate: migrate,
    grant: grant, damage: damage, ascend: ascend, rise: rise, usePotion: usePotion, addLog: addLog,
    checkAchievements: checkAchievements, weekStats: weekStats, weeklyReview: weeklyReview,
    insights: insights, metricsByDay: metricsByDay, questActiveOn: questActiveOn, focusByDay: focusByDay,
    heatmap: heatmap, bossTrophies: bossTrophies, briefing: briefing,
    actions: actions, save: save, load: load
  };
});
