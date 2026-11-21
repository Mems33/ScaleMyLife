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
  var HABITS_ALL_BONUS = 20;      // small coin bonus when every good habit is kept in one day
  /* Day bonus for finishing the whole plan Sage drafted (see dailyDraft and
     actions.claimDayWon). Paid once a day. Kept small on purpose: the plan is
     made of quests and habits that already pay, so this is a nudge to finish
     the list, not a second income. Raise it and a "solid day" drifts past the
     90-110 coin target above. */
  var PLAN_XP = 20, PLAN_COINS = 10;
  var SLIP_HP = 12, SLIP_COINS = 10;
  var JOURNAL_XP = 15, JOURNAL_COINS = 5;
  var SLEEP_XP = 10;
  var CHEST_XP = 25, CHEST_COIN_MIN = 20, CHEST_COIN_SPREAD = 30;
  var CHEST_JACKPOT_MIN = 40, CHEST_JACKPOT_SPREAD = 60; // rare "big coins" loot
  var BOSS_XP = 500, BOSS_COINS = 250;   // boss is due by the Sunday closing its week (bossSunday)
  var BREAK_HP = 3;               // completing a pomodoro break heals a little
  var FOCUS_MIN_PAY = 5;          // sessions under 5 worked minutes pay nothing
  var FOCUS_MAX_PAY_MIN = 240;    // cap payout at 4h per session
  var MAX_HP = 100;
  var MAX_SKILLS = 12;            // life-area cap - keeps the board focused
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

  /* ---------- quick-add phrase parsing ----------
     Turns a plain-English quick-add line into structured quest fields, e.g.
     "Read 20 pages every day easy" -> title "Read 20 pages", diff 'easy',
     recurring true, target 7. Pure (no Date.now(), no state) so it can be
     unit tested without touching the DOM - app.js just calls this and drops
     the result straight into the add-quest form.
     Every pattern below is wrapped in \b...\b word boundaries on purpose -
     remove one and a phrase starts matching inside unrelated words (e.g.
     "hard" inside "hardware", or "sun" inside "Sundance"). */
  var PT_WD_IDX = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
    sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6
  };
  // Full names listed before their abbreviations: PT_RE_EVERYLIST reuses this
  // string without \b anchors between tokens, so the first alternative that
  // fits at a given spot wins - "monday" must be offered before "mon" or a
  // typed "monday" would only ever match its first 3 letters.
  var PT_WD_SRC = '(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|fri|sat)';
  // A date is often typed "by friday" / "on friday" - the connector is
  // optional but, when present, must be removed together with the date word
  // so the title never ends with a dangling "by"/"on".
  var PT_CONNECT = '(?:\\b(?:by|on|due|before|until)\\s+)?';
  var PT_RE_DIFF = /\b(easy|normal|hard|epic)\b/i;
  var PT_RE_EVERY_WEEKDAY = /\bevery\s+weekdays?\b/i;
  var PT_RE_WEEKDAYS = /\bweekdays\b/i;
  var PT_RE_EVERY_WEEKEND = /\bevery\s+weekends?\b/i;
  var PT_RE_WEEKENDS = /\bweekends\b/i;
  var PT_RE_DAILY = /\b(?:every\s+day|everyday|daily|each\s+day)\b/i;
  var PT_RE_FREQ = /\b(\d+)\s*(?:x\s*(?:a\s*week|\/\s*week)|times\s+a\s+week)\b/i;
  var PT_RE_EVERYLIST = new RegExp('\\bevery\\s+(' + PT_WD_SRC + '(?:(?:\\s*,\\s*|\\s+and\\s+|\\s+)' + PT_WD_SRC + ')*)\\b', 'i');
  var PT_RE_TOKEN = new RegExp(PT_WD_SRC, 'gi');
  // Each due-date pattern repeats \b right after the (optional) connector:
  // PT_CONNECT can match zero characters, and without that second \b a
  // phrase like "in 3 days" could start matching mid-word (e.g. inside
  // "Skin 3 days"). Keep both boundaries even though that looks redundant.
  var PT_RE_INDAYS = new RegExp(PT_CONNECT + '\\bin\\s+(\\d{1,3})\\s+days?\\b', 'i');
  var PT_RE_NEXTWEEK = new RegExp(PT_CONNECT + '\\bnext\\s+week\\b', 'i');
  var PT_RE_TODAY = new RegExp(PT_CONNECT + '\\btoday\\b', 'i');
  var PT_RE_TOMORROW = new RegExp(PT_CONNECT + '\\btomorrow\\b', 'i');
  var PT_RE_WEEKDAY = new RegExp(PT_CONNECT + '\\b(' + PT_WD_SRC + ')\\b', 'i');

  function ptCloneDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function ptAddDays(d, n) { var r = ptCloneDay(d); r.setDate(r.getDate() + n); return r; }
  // Next time this weekday comes around AFTER today, never today itself -
  // typing "monday" on a Monday means next Monday (7 days out), matching how
  // people actually use the word in a quick-add box.
  function ptNextWeekday(now, idx) {
    var delta = (idx - now.getDay() + 7) % 7;
    if (delta === 0) delta = 7;
    return ptAddDays(now, delta);
  }
  // Cuts the first match of `re` out of `text`, replacing it with a single
  // space (never empty) so the words on either side don't get glued
  // together. Returns the match (with .remainder holding the new text) or
  // null when `re` doesn't occur at all - callers read the captured groups
  // off the returned match before switching `title` to `.remainder`.
  function ptTake(text, re) {
    var m = re.exec(text);
    if (!m) return null;
    m.remainder = text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length);
    return m;
  }

  function parseTask(text, now) {
    now = now || new Date();
    var out = { title: '', diff: null, due: null, recurring: false, days: null, target: null };
    if (typeof text !== 'string') return out;
    var original = text.trim();
    var title = text;

    var mDiff = ptTake(title, PT_RE_DIFF);
    if (mDiff) { out.diff = mDiff[1].toLowerCase(); title = mDiff.remainder; }

    // Recurring phrases are tried from most to least specific, and each one
    // is fully removed before the due-date pass below runs - that's what
    // stops e.g. "every monday" from also being re-read as a one-off due
    // date once its weekday would otherwise be sitting alone in the title.
    var mRec = ptTake(title, PT_RE_EVERY_WEEKDAY) || ptTake(title, PT_RE_WEEKDAYS);
    if (mRec) { out.recurring = true; out.days = [1, 2, 3, 4, 5]; title = mRec.remainder; }
    if (!out.recurring) {
      mRec = ptTake(title, PT_RE_EVERY_WEEKEND) || ptTake(title, PT_RE_WEEKENDS);
      if (mRec) { out.recurring = true; out.days = [0, 6]; title = mRec.remainder; }
    }
    if (!out.recurring) {
      mRec = ptTake(title, PT_RE_DAILY);
      if (mRec) { out.recurring = true; out.days = null; out.target = 7; title = mRec.remainder; }
    }
    if (!out.recurring) {
      mRec = ptTake(title, PT_RE_FREQ);
      if (mRec) { out.recurring = true; out.target = clamp(parseInt(mRec[1], 10), 1, 7); out.days = null; title = mRec.remainder; }
    }
    if (!out.recurring) {
      mRec = ptTake(title, PT_RE_EVERYLIST);
      if (mRec) {
        var tokens = mRec[1].toLowerCase().match(PT_RE_TOKEN) || [];
        var days = [];
        for (var i = 0; i < tokens.length; i++) {
          var idx = PT_WD_IDX[tokens[i]];
          if (days.indexOf(idx) === -1) days.push(idx);
        }
        days.sort(function (a, b) { return a - b; });
        out.recurring = true; out.days = days; title = mRec.remainder;
      }
    }

    // Due date: a single value, first recognised phrase wins. Runs after the
    // recurring block above on purpose - see the comment there.
    var mInDays = ptTake(title, PT_RE_INDAYS);
    if (mInDays) {
      var n = parseInt(mInDays[1], 10);
      if (n >= 1 && n <= 60) { out.due = todayKey(ptAddDays(now, n)); title = mInDays.remainder; }
    }
    if (!out.due) {
      var mNextWeek = ptTake(title, PT_RE_NEXTWEEK);
      if (mNextWeek) { out.due = todayKey(ptAddDays(now, 7)); title = mNextWeek.remainder; }
    }
    if (!out.due) {
      var mToday = ptTake(title, PT_RE_TODAY);
      if (mToday) { out.due = todayKey(now); title = mToday.remainder; }
    }
    if (!out.due) {
      var mTomorrow = ptTake(title, PT_RE_TOMORROW);
      if (mTomorrow) { out.due = todayKey(ptAddDays(now, 1)); title = mTomorrow.remainder; }
    }
    if (!out.due) {
      var mWeekday = ptTake(title, PT_RE_WEEKDAY);
      if (mWeekday) { out.due = todayKey(ptNextWeekday(now, PT_WD_IDX[mWeekday[1].toLowerCase()])); title = mWeekday.remainder; }
    }

    // Collapse the gaps left by every removal above; if that eats the whole
    // string, fall back to the original text so a recognised-but-only phrase
    // ("tomorrow" typed on its own) never leaves the title empty.
    title = title.replace(/\s+/g, ' ').trim();
    out.title = title || original;
    return out;
  }

  /* ---------- brain dump: several tasks in one go ----------
     parseDump turns a spoken or pasted paragraph into a list of ready-to-add
     items. This is what lets the Add button skip the old "which of six task
     types is this?" question: the app guesses the type, the difficulty, the
     life area and the date, shows the guess as chips, and the user only
     corrects what is wrong.

     It is deliberately a set of plain rules, not AI: it runs offline, costs
     nothing, and gives the same answer every time (so it can be unit tested).
     The rules are tuned to be SAFE rather than clever. When in doubt an item
     stays a normal side quest, because a wrong "side quest" costs the user one
     tap to fix while a wrongly split or wrongly merged sentence costs retyping.

     Pure like parseTask: no Date.now(), no state. `skills` is the hero's life
     areas (state.skills), only read to match an area by name. */
  var PD_MAX_ITEMS = 20, PD_MAX_TITLE = 120;
  /* Verbs a task usually starts with. Two jobs: (1) "call the bank and email
     the landlord" is split at " and " ONLY because "email" is in this list,
     which is what keeps "bread and butter" in one piece; (2) nothing else.
     Adding a verb makes splitting a little more eager, removing one a little
     less. Keep them lowercase and regex-safe (no special characters). */
  var PD_VERBS = 'call|email|text|message|reply|write|draft|finish|start|send|submit|buy|book|pay|order|read|study|revise|review|prepare|plan|clean|tidy|wash|cook|fix|update|schedule|cancel|renew|apply|register|sign|print|pick|drop|return|go|do|make|check|research|learn|practice|practise|organize|organise|file|upload|download|install|meet|visit|ask|tell|remind|get|take|bring|watch|listen|complete|build|ship|design|test|deploy|exercise|workout|run|walk|stretch|meditate|journal|sleep|drink|eat|stop|quit|avoid|cut|reduce|limit|pass|land|find|sort|set|open|close|move|pack|wake';
  // sentence ends, line breaks and semicolons always separate two tasks
  var PD_RE_HARD = /(?:[.!?]+\s+|\s*[\n\r]+\s*|\s*;+\s*)/;
  // softer joins only count when a task verb follows them (see PD_VERBS)
  /* Written so no two parts can match the same spaces: an earlier version
     began with \\s* in front of alternatives that also began with \\s+, and a
     line of 2000 spaces then took about 20 seconds to fail (the capture box
     runs this on every keystroke). pdSplit also collapses spaces first. */
  var PD_RE_SOFT = new RegExp('(?:\\s?,\\s?(?:and\\s)?(?:then\\s)?(?:also\\s)?|\\s(?:and\\s(?:then\\s)?(?:also\\s)?|then\\s(?:also\\s)?|also\\s))(?=(?:' + PD_VERBS + '|gym|yoga)\\b)', 'i');
  /* Abbreviations whose full stop is not the end of a sentence. pdSplit hides
     their dot before splitting on sentence ends and puts it back after. */
  var PD_RE_ABBR = /\b(dr|mr|mrs|ms|st|prof|etc|vs|e\.g|i\.e|a\.m|p\.m)\./gi;
  // list markers at the start of a pasted line: "- ", "* ", "1. ", "2) ", "[ ] "
  var PD_RE_BULLET = /^\s*(?:[-*\u2022\u00b7\u25aa\u25e6\u2013\u2014]+|\d{1,2}[.)]|\[\s?[xX]?\s?\])\s+/;
  // spoken filler in front of the real task: "and then I need to ...", "don't forget to ..."
  /* "and", "then", "um" are always filler. Ordinals, "next", "so", "ok" and
     friends only count with a comma after them ("First, call mom"), because
     "First draft of the intro" and "Next week submit the report" mean them. */
  var PD_RE_LEAD = /^(?:(?:(?:and|then|also|um|uh)\b[\s,]*)|(?:(?:so|ok|okay|oh|plus|first|second|third|next|finally|lastly)\s*,\s*))*(?:(?:i|we)\s+(?:really\s+|still\s+|also\s+)?(?:need|have|want|ought|got)\s+to\s+|(?:i|we)(?:'|’)?ve\s+got\s+to\s+|i(?:'|’)?d\s+like\s+to\s+|i\s+(?:really\s+|still\s+|also\s+)?(?:must|should|gotta|wanna)\s+|i(?:'|’)?m\s+going\s+to\s+(?!(?:the|a|an|my|your|our|his|her|their|this|that)\b)|(?:need|have|got)\s+to\s+|gotta\s+|remember\s+to\s+|don(?:'|’)?t\s+forget\s+to\s+|please\s+)?/i;
  /* A habit to fight, not an errand: "stop by the bank" and "quit my job" are
     errands, so stop and quit refuse the words that make them one. */
  var PD_RE_MONSTER = /^(?:stop(?!\s+(?:by|at|in|off|over|for|to)\b)|quit(?!\s+(?:my|the|your|our|this|that)\b)|no\s+more|avoid|less|cut\s+(?:down|back)\s+on|cut\s+out)\s+(.{2,})$/i;
  var PD_RE_HABIT = /\b(?:read|meditat\w*|stretch\w*|walk|run|jog|workout|work\s+out|gym|exercise|drink|water|sleep|bed\s+by|journal\w*|floss|vitamins?|practi[cs]e|pray|steps|yoga|push-?ups|flashcards?)\b/i;
  // a big noun plus a "campaign" verb at the start reads as a main quest
  /* "finals" only in the plural: "the final report" is not an exam. résumé
     sits outside \\b(...)\\b because JS word boundaries are ASCII-only and
     never match next to é. */
  var PD_RE_BIGNOUN = /\b(?:exams?|midterms?|finals|thesis|dissertation|essay|report|presentation|project|applications?|internships?|portfolio|certification|certificate|marathon|website|business\s+plan|cover\s+letter|cv|resume)\b|r\u00e9sum\u00e9/i;
  var PD_RE_BIGVERB = /^(?:prepare|pass|ace|finish|complete|write|land|get|find|ship|launch|learn|build|plan|organi[sz]e|study\s+for|revise\s+for|apply|create|make|master|start)\b/i;
  var PD_RE_LEARN = /^(?:learn|master|get\s+better\s+at|get\s+good\s+at)\b/i;
  /* Which step list a main quest gets. First match wins, so the order matters:
     "cover letter for my thesis internship" should plan like an application. */
  var PD_TEMPLATES = [
    { id: 'apply', re: /\b(?:internships?|applications?|job\s+hunt|cv|resume|cover\s+letter)\b|r\u00e9sum\u00e9/i },
    { id: 'exam',  re: /\b(?:exams?|midterms?|finals)\b/i },
    { id: 'essay', re: /\b(?:essay|report|thesis|dissertation|presentation|paper|business\s+plan)\b/i }
  ];
  /* Step lists. Each row is [title, difficulty]. The FIRST step of every list
     takes about five minutes: that is the whole point (a quest you can start
     right now gets started). `gap` is how many days before the deadline the
     last step lands: an exam's last step is the evening before, an essay's is
     the day it is due. */
  var PD_STEPS = {
    exam: { gap: 1, steps: [
      ['List every topic on the exam', 'easy'], ['Gather notes and past papers', 'easy'],
      ['Revise the first half of the topics', 'hard'], ['Revise the second half of the topics', 'hard'],
      ['Sit one timed past paper', 'hard'], ['Fix the weak spots it showed', 'normal'],
      ['Light review, then an early night', 'easy']] },
    essay: { gap: 0, steps: [
      ['Write the main point in one sentence', 'easy'], ['Outline it in five bullets', 'easy'],
      ['Write an ugly first draft', 'hard'], ['Rewrite and tighten', 'normal'],
      ['Proofread and hand it in', 'easy']] },
    apply: { gap: 0, steps: [
      ['Open your CV and fix one line', 'easy'], ['Get the CV down to one clean page', 'hard'],
      ['Write a base cover letter', 'normal'], ['List 10 targets with their deadlines', 'normal'],
      ['Send the first application', 'normal']] },
    kickoff: { gap: 0, steps: [['Kickoff: 5 minutes on it, then stop if you want', 'easy']] }
  };
  /* Keyword -> life area. `names` are area names to look for on the hero, best
     first, lowercase. The Student path calls its first area "Study", Balanced
     calls it "Mind": both are listed so either hero gets a match. First row
     that matches the text wins, so money sits above social ("call the bank"
     is about money). No match means no area, which is fine. */
  var PD_AREAS = [
    { re: /\b(?:pay|bills?|bank|budget|invoice|tax(?:es)?|rent|spending|savings?|invest\w*|insurance|refund|subscription)\b/i, names: ['money', 'finance'] },
    { re: /\b(?:cv|resume|cover\s+letter|internships?|applications?|interview|linkedin|portfolio|client|meeting|pitch|deploy|bug|feature|launch)\b|r\u00e9sum\u00e9/i, names: ['work', 'craft', 'build', 'code', 'career', 'study', 'mind'] },
    { re: /\b(?:stud(?:y|ying)|revis\w+|exams?|midterms?|finals|lectures?|course|homework|essay|report|presentation|flashcards?|class|thesis|dissertation|notes|read|reading|learn\w*|chapters?)\b/i, names: ['study', 'mind', 'learning', 'school', 'work', 'craft'] },
    { re: /\b(?:gym|workout|work\s+out|run|jog|walk|stretch\w*|yoga|swim\w*|training|exercise|steps|sport|football|lift\w*|sleep|bed|meal|protein|water|cook|diet|vitamins?)\b/i, names: ['body', 'health', 'fitness', 'nutrition'] },
    { re: /\b(?:friends?|family|mom|mum|dad|parents?|brother|sister|birthday|reach\s+out|coffee\s+with|network\w*|alumni|party)\b/i, names: ['social', 'network', 'audience', 'people'] }
  ];

  function pdCap(t) { return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; }
  function pdSkill(text, skills) {
    if (!Array.isArray(skills) || !skills.length) return null;
    for (var i = 0; i < PD_AREAS.length; i++) {
      if (!PD_AREAS[i].re.test(text)) continue;
      var names = PD_AREAS[i].names;
      for (var n = 0; n < names.length; n++) {
        for (var k = 0; k < skills.length; k++) {
          if (String(skills[k].name || '').toLowerCase() === names[n]) return skills[k].id;
        }
      }
    }
    return null;
  }
  /* Difficulty when the user did not say one. A stated duration wins, then a
     few tell-tale words; everything else is Normal. Erring toward Normal is
     the safe side: it is the middle payout. */
  function pdDiff(text) {
    var m = /\b(\d{1,3})\s*(?:min|mins|minutes)\b/i.exec(text);
    if (m) { var n = parseInt(m[1], 10); return n <= 15 ? 'easy' : n <= 45 ? 'normal' : 'hard'; }
    m = /\b(\d{1,2}(?:[.,]\d)?)\s*(?:hours?|hrs?|h)(?:\d{1,2})?(?![\w&])/i.exec(text);
    if (m) m[1] = m[1].replace(',', '.');
    if (m) return parseFloat(m[1]) >= 3 ? 'epic' : 'hard';
    if (/\b(?:quick|quickly|small|tiny|simple|short)\b/i.test(text)) return 'easy';
    if (/\b(?:exams?|essay|report|presentation|thesis|dissertation|deadline|tax(?:es)?)\b/i.test(text)) return 'hard';
    if (/^(?:call|email|text|message|reply|book|pay|buy|order|print|send|renew|cancel|schedule|pick|drop|return)\b/i.test(text)) return 'easy';
    return 'normal';
  }
  function pdDayDiff(aKey, bKey) {
    return Math.round((new Date(aKey + 'T00:00:00') - new Date(bKey + 'T00:00:00')) / 86400000);
  }
  /* The steps of a main quest, with dates. With a deadline the steps are spread
     evenly from tomorrow to the deadline (minus the template's gap), so the
     plan runs backward from the date the user gave. Without one the steps
     carry no date. Returns [{title, diff, due}]. */
  function pdSteps(templateId, dueKey, now) {
    var t = PD_STEPS[templateId] || PD_STEPS.kickoff, n = t.steps.length;
    var total = dueKey ? Math.max(0, pdDayDiff(dueKey, todayKey(now)) - t.gap) : null;
    return t.steps.map(function (row, i) {
      var due = null;
      if (total != null) due = todayKey(ptAddDays(now, n === 1 ? total : Math.round(total * (i + 1) / n)));
      return { title: row[0], diff: row[1], due: due };
    });
  }
  function pdTemplate(text) {
    for (var i = 0; i < PD_TEMPLATES.length; i++) if (PD_TEMPLATES[i].re.test(text)) return PD_TEMPLATES[i].id;
    return 'kickoff';
  }
  /* Cuts raw text into one string per task. Hard breaks (new line, full stop,
     semicolon) always split. Soft joins (", " / " and " / " then ") only
     split when a task verb follows, see PD_VERBS. */
  /* Order matters here, and each step fixes a real input that went wrong:
     1. lines first, so the bullet of "10. Call mom" is stripped before
        "10." could be read as the end of a sentence;
     2. runs of spaces collapsed, which keeps every regex below fast;
     3. abbreviations ("Dr. Smith", "5 p.m.") hidden from the sentence split;
     4. sentences, then the soft joins inside each sentence. */
  function pdSplit(text) {
    var out = [];
    String(text).split(/[\n\r]+/).forEach(function (rawLine) {
      var line = rawLine.replace(PD_RE_BULLET, '').replace(/\s+/g, ' ');
      line = line.replace(PD_RE_ABBR, function (m0, ab) { return ab.replace(/\./g, '\u0001') + '\u0001'; });
      line.split(PD_RE_HARD).forEach(function (sentence) {
        var rest = sentence.replace(/\u0001/g, '.'), guard = 0;
        while (rest && guard++ < 60) {
          var m = PD_RE_SOFT.exec(rest);
          if (!m) break;
          if (m.index > 0) out.push(rest.slice(0, m.index));
          rest = rest.slice(m.index + m[0].length);
        }
        if (rest) out.push(rest);
      });
    });
    return out;
  }
  /* One piece of text -> one item. `forceKind` is set when the user taps the
     type chip on a card: the same text is re-read as that type, so a habit
     turned into a main quest gains its steps and loses its weekly target. */
  function captureItem(text, now, skills, forceKind) {
    now = now || new Date();
    var raw = String(text == null ? '' : text).replace(PD_RE_BULLET, '').replace(PD_RE_LEAD, '').replace(PD_RE_TO_VERB, '');
    raw = raw.replace(/[\s.,;:!?]+$/, '').replace(/\s+/g, ' ').trim();
    if (raw.length < 2 || PD_RE_FILLER_ONLY.test(raw)) return null;
    var p = parseTask(raw, now);
    var title = p.title, kind = 'side', note = '';
    var mon = PD_RE_MONSTER.exec(title);
    if (mon && !p.recurring && !p.due) { kind = 'monster'; title = mon[1]; }
    else if (p.recurring) {
      if (p.target && p.target < 7) kind = 'habit';
      else if (p.days && p.days.length) kind = 'daily';
      else kind = PD_RE_HABIT.test(title) ? 'habit' : 'daily';
    }
    else if (PD_RE_LEARN.test(title) || (PD_RE_BIGNOUN.test(title) && PD_RE_BIGVERB.test(title))) kind = 'main';
    if (forceKind && CAPTURE_KINDS.indexOf(forceKind) >= 0) {
      if (forceKind !== 'monster' && kind === 'monster') title = p.title;   // put "Stop ..." back
      kind = forceKind;
    }
    title = pdClip(pdCap(title.replace(/\s+/g, ' ').trim()), PD_MAX_TITLE);
    var item = { title: title, kind: kind, diff: p.diff || pdDiff(title), skillId: kind === 'monster' ? null : pdSkill(title, skills),
      due: null, days: null, target: null, steps: null, note: note, text: raw };
    if (kind === 'side') item.due = p.due;
    else if (kind === 'daily') item.days = (p.days && p.days.length && p.days.length < 7) ? p.days.slice() : null;
    else if (kind === 'habit') item.target = (p.target && p.target >= 1 && p.target <= 7) ? p.target : (p.days && p.days.length ? Math.min(7, p.days.length) : 7);
    else if (kind === 'main') {
      var tpl = pdTemplate(title);
      item.due = p.due;
      item.steps = pdSteps(tpl, p.due, now);
      item.note = p.due && tpl !== 'kickoff' ? 'Planned backward from the date' : 'Starts with a 5-minute step';
    }
    return item;
  }
  var CAPTURE_KINDS = ['side', 'daily', 'habit', 'main', 'monster'];
  // "do" is left out on purpose: "To do list cleanup" is a task about a to-do list
  var PD_RE_TO_VERB = new RegExp('^to\\s+(?=(?:' + PD_VERBS.replace('|do|', '|') + ')\\b)', 'i');
  // a piece that is nothing but a filler word ("First" from "First, call mom")
  var PD_RE_FILLER_ONLY = /^(?:first|second|third|next|finally|lastly|so|ok|okay|oh|plus|and|then|also|um|uh)$/i;
  /* A title cut at a fixed length can split an emoji in half; a lone half
     (a "surrogate") is invalid text and can break saving the JSON. */
  function pdClip(t, n) { return String(t).slice(0, n).replace(/[\ud800-\udbff]$/, ''); }
  /* Change an item's date after the fact (the date chip on a capture card).
     A main quest is re-planned: its steps are spread again toward the new
     date, which is why this lives in the engine next to pdSteps and is not a
     one-line assignment in the UI. An invalid or empty date clears it. */
  function captureDue(item, dueKey, now) {
    if (!item) return item;
    now = now || new Date();
    var ok = /^\d{4}-\d{2}-\d{2}$/.test(dueKey || '') && dueKey >= todayKey(now) &&
      todayKey(new Date(dueKey + 'T00:00:00')) === dueKey;   // "2026-02-31" comes back as March 3rd and fails here
    item.due = ok ? dueKey : null;
    if (item.kind === 'main') item.steps = pdSteps(pdTemplate(item.title), item.due, now);
    return item;
  }
  function parseDump(text, now, skills) {
    if (typeof text !== 'string' || !text.trim()) return [];
    now = now || new Date();
    var items = [], seen = {};
    pdSplit(text).forEach(function (seg) {
      if (items.length >= PD_MAX_ITEMS) return;
      var it = captureItem(seg, now, skills);
      if (!it) return;
      var key = it.kind + ':' + it.title.toLowerCase();
      if (seen[key]) return;          // the same thing said twice is one task
      seen[key] = 1;
      items.push(it);
    });
    return items;
  }

  /* ---------- quest packs ----------
     Ready-made campaigns for the situations most people are actually in. A pack
     produces the same item shape as parseDump, so the capture sheet and the
     onboarding wizard show packs and typed tasks as the same cards and add
     them through the same action (actions.addCaptured).
     `ask` adds one text field to the pack's little form and `date` one date
     field; a pack with neither is added in a single tap. To add a pack: one
     row here, one branch in buildPack, one test. */
  var PACKS = [
    { id: 'exam',       icon: '📝', name: 'Exam coming',     blurb: 'A revision plan, backward from the date', ask: 'Which subject?', eg: 'Corporate Finance', date: 'Exam date' },
    { id: 'internship', icon: '💼', name: 'Internship hunt', blurb: 'CV, targets, applications, practice', date: 'Applications deadline (optional)' },
    { id: 'essay',      icon: '✍️', name: 'Essay or report', blurb: 'From one sentence to handed in', ask: 'What is it about?', eg: 'Marketing case study', date: 'Due date' },
    { id: 'fit',        icon: '💪', name: 'Get in shape',    blurb: 'Three sessions a week, starting small' },
    { id: 'project',    icon: '🚀', name: 'Side project',    blurb: 'A first version, in small steps', ask: 'What are you building?', eg: 'My portfolio site', date: 'Ready by (optional)' },
    { id: 'sleep',      icon: '🌙', name: 'Fix my sleep',    blurb: 'Two evening habits and one monster' },
    { id: 'admin',      icon: '🧹', name: 'Life admin',      blurb: 'The four errands everyone postpones' }
  ];
  function packById(id) { for (var i = 0; i < PACKS.length; i++) if (PACKS[i].id === id) return PACKS[i]; return null; }
  function buildPack(id, o, now, skills) {
    o = o || {}; now = now || new Date();
    var name = pdClip(String(o.name || '').replace(/\s+/g, ' ').trim(), 60);
    var date = /^\d{4}-\d{2}-\d{2}$/.test(o.date || '') && o.date >= todayKey(now) ? o.date : null;
    var out = [];
    function mk(kind, title, extra) {
      var it = { title: title, kind: kind, diff: 'normal', skillId: kind === 'monster' ? null : pdSkill(title, skills),
        due: null, days: null, target: null, steps: null, note: '', text: title };
      for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) it[k] = extra[k];
      out.push(it);
      return it;
    }
    if (id === 'exam') {
      var examDue = date || todayKey(ptAddDays(now, 14));
      mk('main', 'Pass the ' + (name ? name + ' exam' : 'exam'), { due: examDue, steps: pdSteps('exam', examDue, now), diff: 'hard',
        note: date ? 'Planned backward from the date' : 'Planned over two weeks, move the dates if needed' });
      mk('habit', 'Revise ' + (name || 'for the exam') + ' for 25 minutes', { target: 5 });
    } else if (id === 'internship') {
      var applyDue = date || todayKey(ptAddDays(now, 14));
      mk('main', 'Land an internship', { due: applyDue, steps: pdSteps('apply', applyDue, now), diff: 'hard', note: 'Starts with a 5-minute step' });
      mk('habit', 'Send one application', { target: 5 });
      mk('habit', 'Interview or case practice, 20 minutes', { target: 3 });
    } else if (id === 'essay') {
      var essayDue = date || todayKey(ptAddDays(now, 7));
      mk('main', 'Finish the ' + (name || 'essay'), { due: essayDue, steps: pdSteps('essay', essayDue, now), diff: 'hard',
        note: date ? 'Planned backward from the date' : 'Planned over one week, move the dates if needed' });
    } else if (id === 'fit') {
      mk('habit', 'Workout or a 30-minute walk', { target: 3 });
      mk('habit', 'Stretch for 5 minutes', { target: 7 });
      mk('side', 'Pick three workout slots for this week', { diff: 'easy', due: todayKey(ptAddDays(now, 1)) });
    } else if (id === 'project') {
      var proj = name || 'the side project';
      mk('main', 'Ship ' + proj + ' v1', { diff: 'hard', due: date, note: 'Starts with a 5-minute step', steps: [
        { title: 'Write what v1 does in three lines', diff: 'easy', due: null },
        { title: 'List the five smallest steps', diff: 'easy', due: null },
        { title: 'Build the first step', diff: 'hard', due: null },
        { title: 'Show it to one person', diff: 'normal', due: null }] });
      mk('habit', 'Work on ' + proj + ' for 25 minutes', { target: 4 });
    } else if (id === 'sleep') {
      mk('habit', 'In bed by 23:30', { target: 7 });
      mk('habit', 'No screens 30 minutes before bed', { target: 7 });
      mk('monster', 'Late-night scrolling', {});
    } else if (id === 'admin') {
      mk('side', 'Clear or archive the inbox', { diff: 'normal' });
      mk('side', 'Pay or schedule every open bill', { diff: 'easy' });
      mk('side', 'Tidy the desk for 10 minutes', { diff: 'easy' });
      mk('side', 'Book the appointment you keep putting off', { diff: 'easy' });
    }
    return out;
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
  /* Sunday that closes a boss week: this week's Sunday on Mon-Fri; naming a
     boss on Sat/Sun rolls to next week's Sunday. weeksAhead shifts further. */
  function bossSunday(now, weeksAhead) {
    var d = now ? new Date(now) : new Date();
    d.setHours(0, 0, 0, 0);
    var add = (7 - d.getDay()) % 7;          // days until Sunday (0 if today is Sunday)
    if (add <= 1) add += 7;                  // Sat (1) / Sun (0) → next week's Sunday
    d.setDate(d.getDate() + add + 7 * (weeksAhead || 0));
    return todayKey(d);
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
      counters: { quests: 0, focusMin: 0, purchases: 0, chests: 0, bosses: 0, ascensions: 0, mends: 0, deaths: 0, comebacks: 0, daysWon: 0 },
      achievements: [],           // [{id,on}]
      activeFocus: null,
      redemption: null,           // {streak,on} - offer to mend a freshly broken streak
      boss: null,                 // {title,setOn,due,doneOn}
      chestClaimedOn: null,
      plan: null,                 // {day,refs,wonOn,skipped} - today's plan, see dailyDraft / actions.setPlan
      /* Staged game systems. `on` is false here, which means "everything is
         open": that is what every save made before stages existed gets
         (through migrate), and what the engine tests assume. Only the
         onboarding wizard switches it on for a brand-new hero. `got` maps a
         stage id to the day it opened. */
      stage: { on: false, got: {} },
      settings: { sound: true, theme: 'dungeon', music: 'lofi', musicUrl: '', escalate: true, restDays: [], intensity: 'classic' },
      lastSeenDay: todayKey()
    };
  }

  function seed(state) {
    var mind = state.skills[0].id, body = state.skills[1].id, craft = state.skills[2].id;
    var social = state.skills[3] ? state.skills[3].id : null, money = state.skills[4] ? state.skills[4].id : null;
    state.quests.push(
      { id: uid(), title: 'Plan tomorrow in 10 minutes', diff: 'easy', skillId: mind, due: null, recurring: true, main: null, doneOn: null, createdOn: todayKey() },
      { id: uid(), title: 'Deep work session (50 min)', diff: 'normal', skillId: craft, due: null, recurring: true, main: null, doneOn: null, createdOn: todayKey() }
    );
    /* every default life area ships with one starter that shows its use case */
    state.habits.push(
      { id: uid(), title: 'Read 20 pages', type: 'good', skillId: mind, streak: 0, lastDoneOn: null, slips: 0, cleanSince: null, history: [], bestClean: 0, target: 7 },
      { id: uid(), title: 'Workout / walk 30 min', type: 'good', skillId: body, streak: 0, lastDoneOn: null, slips: 0, cleanSince: null, history: [], bestClean: 0, target: 3 },
      { id: uid(), title: 'Reach out to a friend', type: 'good', skillId: social, streak: 0, lastDoneOn: null, slips: 0, cleanSince: null, history: [], bestClean: 0, target: 3 },
      { id: uid(), title: 'Review spending 10 min', type: 'good', skillId: money, streak: 0, lastDoneOn: null, slips: 0, cleanSince: null, history: [], bestClean: 0, target: 1 },
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

  /* ---------- Sage as game master ----------
     Everything below is Sage "thinking": a proposed plan for the day, a
     one-line summary for the journal, a boss for the week and a recap of the
     week. All of it is plain arithmetic over the save, like briefing() further
     down: no AI, no network, the same answer for the same save. The UI only
     shows what these return and lets the user accept or change it. */

  /* Rough minutes per difficulty, used only to total up a draft ("about 1h 20m").
     They are estimates for display; nothing is paid or scheduled from them. */
  var DRAFT_MIN = { easy: 10, normal: 25, hard: 50, epic: 90 }, DRAFT_HABIT_MIN = 10;
  var DRAFT_MAX = 6;
  /* How many items a draft aims for, from the "time per day" picked in the
     wizard (15, 30 or 60 minutes). No answer on file means 4. */
  function draftTarget(state) {
    var m = state.settings && state.settings.onboard && state.settings.onboard.minutes;
    return m === 15 ? 3 : m === 60 ? 5 : 4;
  }
  /* Where a good habit stands this week (Monday start). `pressing` is true
     when it asks for today: a daily habit always does, a weekly one only once
     the days left in the week are no more than the times still needed (a 3x
     habit not done yet becomes pressing on Friday). The draft below and the
     Habits today panel on the Today screen both read it, so the two never
     disagree about what can wait. */
  function habitWeek(h, now) {
    now = now || new Date();
    var done = actions.weekCount(h, todayKey(now)), need = h.target - done;
    var daysLeft = 7 - (now.getDay() + 6) % 7;   // today included
    return { done: done, need: need, daysLeft: daysLeft, pressing: h.target >= 7 || (need > 0 && need >= daysLeft) };
  }
  /* The Daily Draft: the short list Sage proposes for today, most pressing
     first. Each candidate gets a score and a reason:
       100+  overdue          90  due today        70  next step of a main quest
        62   today's dailies  58- due within 3 days
        45   daily habits     40+ weekly habits (65 when today is the last
                                  chance to hit the weekly target)
        30   side quests waiting a week or more    20  everything else
     Anything left unfinished on the last plan gets +15, which is how "roll
     over to tomorrow" works without a button. The scores only decide the
     ORDER; change one and the draft reorders, nothing else moves.
     Returns { items:[{ref,kind,id,title,why,minutes,diff}], minutes, target, pool }.
     A ref is 'q:<quest id>' or 'h:<habit id>' and is what actions.setPlan stores. */
  function dailyDraft(state, now) {
    now = now || new Date();
    var today = todayKey(now), cands = [], byRef = {};
    var carried = (state.plan && state.plan.day && state.plan.day < today && Array.isArray(state.plan.refs)) ? state.plan.refs : [];
    function add(ref, o) {
      if (byRef[ref]) { if (o.score > byRef[ref].score) { byRef[ref].score = o.score; byRef[ref].why = o.why; } return; }
      o.ref = ref; byRef[ref] = o; cands.push(o);
    }
    var nextStepOf = {};   // goal id -> its first open step (earliest date first, then list order)
    (state.quests || []).forEach(function (q) {
      if (q.recurring || q.doneOn || !q.main) return;
      var g = (state.goals || []).find(function (x) { return x.id === q.main && !x.doneOn; });
      if (!g) return;
      var cur = nextStepOf[g.id];
      if (!cur || (q.due && (!cur.q.due || q.due < cur.q.due))) nextStepOf[g.id] = { q: q, g: g };
    });
    (state.quests || []).forEach(function (q) {
      var mins = DRAFT_MIN[q.diff] || 25;
      if (q.recurring) {
        if (q.doneOn === today || !questActiveOn(q, now)) return;
        add('q:' + q.id, { kind: 'quest', id: q.id, title: q.title, diff: q.diff, minutes: mins, score: 62, why: 'Daily, feeds the chest' });
        return;
      }
      if (q.doneOn) return;
      var ref = 'q:' + q.id;
      if (q.due) {
        var d = pdDayDiff(q.due, today);
        if (d < 0) add(ref, { kind: 'quest', id: q.id, title: q.title, diff: q.diff, minutes: mins, score: 100 + Math.min(20, -d), why: 'Overdue by ' + (-d) + ' day' + (d === -1 ? '' : 's') });
        else if (d === 0) add(ref, { kind: 'quest', id: q.id, title: q.title, diff: q.diff, minutes: mins, score: 90, why: 'Due today' });
        else if (d <= 3) add(ref, { kind: 'quest', id: q.id, title: q.title, diff: q.diff, minutes: mins, score: 58 - d, why: d === 1 ? 'Due tomorrow' : 'Due in ' + d + ' days' });
      }
      var ns = q.main ? nextStepOf[q.main] : null;
      if (ns && ns.q === q) add(ref, { kind: 'quest', id: q.id, title: q.title, diff: q.diff, minutes: mins, score: 70, why: '\ud83c\udfc6 ' + ns.g.title });
      else if (!q.main && !q.due) {
        var age = q.createdOn ? pdDayDiff(today, q.createdOn) : 0;
        add(ref, { kind: 'quest', id: q.id, title: q.title, diff: q.diff, minutes: mins,
          score: age >= 7 ? 30 : 20, why: age >= 7 ? 'Waiting ' + age + ' days' : 'On your list' });
      }
    });
    (state.habits || []).forEach(function (h) {
      if (h.type !== 'good' || h.lastDoneOn === today) return;
      var ref = 'h:' + h.id, o = { kind: 'habit', id: h.id, title: h.title, diff: null, minutes: DRAFT_HABIT_MIN };
      if (h.target >= 7) { o.score = 45; o.why = h.streak > 0 ? 'Keeps a ' + h.streak + '-day streak' : 'Daily habit'; }
      else {
        var wk = habitWeek(h, now);
        if (wk.need <= 0) return;                  // this week's target is already met
        o.score = wk.pressing ? 65 : 40;
        o.why = wk.pressing ? 'Needed today to hit ' + h.target + ' this week' : wk.done + ' of ' + h.target + ' this week';
      }
      add(ref, o);
    });
    cands.forEach(function (c) { if (carried.indexOf(c.ref) >= 0) { c.score += 15; c.why = 'Left from your last plan'; } });
    cands.forEach(function (c, i) { c.i = i; });
    cands.sort(function (a, b) { return b.score - a.score || a.i - b.i; });
    var target = draftTarget(state), must = cands.filter(function (c) { return c.score >= 90; }).length;
    var want = Math.min(DRAFT_MAX, Math.max(target, must)), picked = [], habits = 0;
    /* At most two habits in a draft while there are quests to offer: habits
       already have their own checklist under the plan, and a plan made of five
       habits is not a plan. The second pass fills up if quests ran out. */
    cands.forEach(function (c) {
      if (picked.length >= want) return;
      if (c.kind === 'habit') { if (habits >= 2) return; habits++; }
      picked.push(c);
    });
    cands.forEach(function (c) { if (picked.length < want && picked.indexOf(c) < 0) picked.push(c); });
    picked.sort(function (a, b) { return b.score - a.score || a.i - b.i; });
    var minutes = 0;
    var items = picked.map(function (c) {
      minutes += c.minutes;
      return { ref: c.ref, kind: c.kind, id: c.id, title: c.title, why: c.why, minutes: c.minutes, diff: c.diff };
    });
    return { items: items, minutes: minutes, target: target, pool: cands.length };
  }

  /* The Evening Debrief: one honest line about today, written from the log,
     that the user can drop into the journal instead of typing. Also returns
     the numbers behind it and the last sleep duration logged before today
     (the "same as usual" quick button). `empty` is true when nothing was done,
     so the UI can stay quiet instead of offering "A quiet day." */
  function debrief(state, now) {
    now = now || new Date();
    var today = todayKey(now), quests = 0, habits = 0, min = 0, xp = 0, slips = 0, best = null, bestXp = -1;
    (state.log || []).forEach(function (e) {
      if (e.day !== today) return;
      xp += e.xp || 0; min += e.min || 0;
      if (e.icon === '⚔️') { quests++; if ((e.xp || 0) > bestXp) { bestXp = e.xp || 0; best = String(e.text || '').replace('Quest cleared: ', ''); } }
      if (e.icon === '🌱') habits++;
      if (e.icon === '👾') slips++;
    });
    var parts = [];
    if (quests) parts.push('Cleared ' + quests + ' quest' + (quests === 1 ? '' : 's'));
    if (habits) parts.push((parts.length ? 'kept ' : 'Kept ') + habits + ' habit' + (habits === 1 ? '' : 's'));
    if (min) parts.push((min >= 60 ? Math.floor(min / 60) + 'h ' + (min % 60 ? (min % 60) + 'm' : '') : min + ' min').trim() + ' of focus');
    var line = parts.length ? parts.join(', ') + '.' : 'A quiet day.';
    if (best && quests > 1) line += ' Biggest win: ' + best + '.';
    var st = actions.planStatus(state, now);
    var open = st.items.filter(function (it) { return !it.done; }).map(function (it) { return it.title; });
    if (st.active && st.total) {
      line += st.complete ? ' Finished the whole plan.'
        : ' Left for tomorrow: ' + open[0] + (open.length > 1 ? ' and ' + (open.length - 1) + ' more' : '') + '.';
    }
    if (slips) line += ' ' + slips + ' slip' + (slips === 1 ? '' : 's') + ', logged honestly.';
    var sleepGuess = null, keys = Object.keys(state.sleep || {}).filter(function (k) { return k < today; }).sort();
    if (keys.length) sleepGuess = state.sleep[keys[keys.length - 1]].hours;
    return { line: line, quests: quests, habits: habits, focusMin: min, xp: xp, slips: slips, open: open,
      empty: !parts.length, sleepGuess: sleepGuess };
  }

  /* Sage's pick for the weekly boss: the hardest open one-off, with a deadline
     inside the boss week counting for more than raw difficulty. An Easy errand
     with no date is never proposed, since a boss is meant to be THE task of
     the week. Returns null when a boss is already named or nothing qualifies. */
  function suggestBoss(state, now) {
    if (state.boss && !state.boss.doneOn) return null;
    now = now || new Date();
    var today = todayKey(now), end = bossSunday(now), rank = { easy: 0, normal: 1, hard: 2, epic: 3 }, best = null;
    (state.quests || []).forEach(function (q) {
      if (q.recurring || q.doneOn) return;
      var r = rank[q.diff] || 0, s = r * 10, why;
      if (q.due && q.due <= end) { s += q.due < today ? 25 : 20; why = q.due < today ? 'It is already late' : 'Your biggest deadline this week'; }
      else if (r < 1) return;
      else if (q.main) { s += 8; why = 'The next push on a main quest'; }
      else why = 'The hardest thing on your list';
      if (!best || s > best.s) best = { s: s, title: q.title, why: why, due: end, questId: q.id };
    });
    return best ? { title: best.title, why: best.why, due: best.due, questId: best.questId } : null;
  }

  /* The weekly chronicle: last seven days as a titled recap for Progress. The
     title comes from how many days had any XP, so the same week always gets
     the same name. */
  var WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function chronicle(state) {
    var r = weeklyReview(state), w = r.week, t = w.tot;
    var active = w.days.filter(function (d) { return w.per[d].xp > 0; }).length;
    var monsters = (state.habits || []).some(function (h) { return h.type === 'bad'; });
    var title = active >= 6 ? 'The Unbroken Week' : active >= 4 ? 'The Steady Climb' : active >= 2 ? 'The Uneven Road'
      : active === 1 ? 'A Spark in the Dark' : 'The Quiet Week';
    if (active >= 4 && monsters && t.slips === 0) title = 'The Clean Week';
    var lines = [];
    if (!active) lines.push('Nothing was logged this week. The board is waiting.');
    else {
      lines.push((state.hero.name || 'The hero') + ' showed up on ' + active + ' of 7 days and earned ' + t.xp + ' XP.');
      if (t.quests || t.focusMin) {
        var fm = Math.round(t.focusMin), ft = fm >= 60 ? Math.floor(fm / 60) + 'h ' + (fm % 60) + 'm' : fm + ' min';
        lines.push((t.quests ? t.quests + ' quest' + (t.quests === 1 ? '' : 's') + ' cleared' : '') +
          (t.quests && fm ? ' and ' : '') + (fm ? ft + ' of focus banked' : '') + '.');
      }
      if (r.bestDay && r.bestXp > 0) lines.push('Best day: ' + WEEKDAY_NAMES[new Date(r.bestDay + 'T00:00:00').getDay()] + ' with ' + r.bestXp + ' XP.');
      if (r.worstMonster) lines.push('Toughest monster: ' + r.worstMonster + ' (' + r.worstN + ' slip' + (r.worstN === 1 ? '' : 's') + ').');
    }
    return { title: title, lines: lines, days: active, xp: t.xp };
  }

  /* ---------- game systems in stages ----------
     A brand-new hero does not get every system on day one. Each row below is a
     system that arrives later, as an event, at a level (the Market also opens
     with the first daily chest, whichever comes first). The UI asks
     isUnlocked(state, id) before drawing that system.

     Two rules that are easy to break by accident:
     1. A save with stage.on === false has EVERYTHING open. That covers
        every hero created before stages existed. Never make isUnlocked return
        false for those saves, or returning users lose features they had.
     2. Stages only hide screens. The engine keeps paying coins and tracking HP
        underneath, so the day the Market opens the purse is already full.
     `line` is what the now-open screen says once the system is open, `tease`
     describes it while it is still locked, `how` says what opens it, `tab` is
     where its button leads. */
  var STAGES = [
    { id: 'rewards', level: 2, icon: '🛍️', name: 'The Market',              tab: 'market', how: 'Opens at level 2, or with your first daily chest',
      line: 'Your coins buy real rewards now. You earned every one.', tease: 'Spend what you earn on real rewards you choose yourself.' },
    { id: 'stakes',  level: 3, icon: '❤️', name: 'HP and monsters',         tab: 'habits', how: 'Opens at level 3',
      line: 'Bad habits fight back now. Log slips honestly and rest to heal.', tease: 'Bad habits become monsters. A slip costs HP, rest heals it.' },
    { id: 'boss',    level: 4, icon: '🐲', name: 'The weekly boss',         tab: 'quests', how: 'Opens at level 4',
      line: 'Name the one task that matters this week. Slaying it pays 500 XP.', tease: 'One task that matters, named each week, worth 500 XP.' },
    { id: 'social',  level: 5, icon: '🏆', name: 'Leaderboard and friends', tab: 'stats',  how: 'Opens at level 5',
      line: 'Race your friends on weekly XP.', tease: 'A weekly XP race against your friends.' }
  ];
  function stageById(id) { for (var i = 0; i < STAGES.length; i++) if (STAGES[i].id === id) return STAGES[i]; return null; }
  function staged(state) { return !!(state && state.stage && state.stage.on); }
  /* Calm intensity: no HP, no monsters, ever. It overrides stages in both
     directions, so it also hides them on an old save that had them. */
  function calm(state) { return !!(state && state.settings && state.settings.intensity === 'calm'); }
  function isUnlocked(state, id) {
    if (id === 'stakes' && calm(state)) return false;
    if (!staged(state)) return true;
    return !!(state.stage.got && state.stage.got[id]);
  }
  function stageDue(state, st) {
    if (state.hero.level >= st.level || (state.hero.ascension || 0) > 0) return true;
    return st.id === 'rewards' && (state.counters.chests || 0) >= 1;
  }
  /* Opens every stage whose condition is now met and returns the ones that
     just opened, for the UI to celebrate. Safe to call after every action:
     a stage opens once. */
  function checkUnlocks(state) {
    if (!staged(state)) return [];
    if (!state.stage.got) state.stage.got = {};
    var fresh = [];
    STAGES.forEach(function (st) {
      if (state.stage.got[st.id] || !stageDue(state, st)) return;
      /* Calm has no HP and no monsters: not recorded, so a later switch back to
         Classic opens them with their own announcement */
      if (st.id === 'stakes' && calm(state)) return;
      state.stage.got[st.id] = todayKey();
      addLog(state, '🔓', 'Opened: ' + st.name);
      fresh.push(st);
    });
    return fresh;
  }
  function unlockAll(state) { state.stage = { on: false, got: (state.stage && state.stage.got) || {} }; return state; }
  /* the next system still locked, for the "what opens next" teaser; null when none */
  function nextUnlock(state) {
    if (!staged(state)) return null;
    for (var i = 0; i < STAGES.length; i++) {
      var st = STAGES[i];
      if (st.id === 'stakes' && calm(state)) continue;
      if (!state.stage.got || !state.stage.got[st.id]) return st;
    }
    return null;
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
      /* full garden bonus: checking off EVERY good habit in one day pays extra
         (needs 2+ good habits so a one-habit board can't farm it) */
      var goods = state.habits.filter(function (x) { return x.type === 'good'; });
      if (goods.length >= 2 && goods.every(function (x) { return x.lastDoneOn === todayKey(); })) {
        var extra = Math.round(HABITS_ALL_BONUS * coinBoonMult(state));
        if (!state.hero.downed) {
          state.hero.coins += extra;
          res.coins += extra;
          res.allHabits = true; res.bonusCoins = extra;
          addLog(state, '🌟', 'Every habit kept today - +' + extra + ' bonus coins!', { coins: extra });
        }
      }
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
        questId: o.questId || null,
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
      /* ...and the same for a linked side quest */
      if (f.questId) {
        var lq = state.quests.find(function (x) { return x.id === f.questId; });
        if (lq) { lq.focusMin = (lq.focusMin || 0) + paid; res.questTitle = lq.title; }
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

    /* ----- weekly boss: one big task, due by Sunday of its week -----
       A weekly boss ends when the week ends, not 7 floating days after you set
       it. Naming one on Saturday or Sunday targets NEXT week's Sunday, so it is
       never due in under two days. o.due (a bossSunday key) picks the week. */
    setBoss: function (state, o) {
      if (state.boss && !state.boss.doneOn) return null;
      state.boss = { title: o.title.trim(), setOn: todayKey(o.now), due: o.due || bossSunday(o.now), doneOn: null };
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
      if (state.skills.length >= MAX_SKILLS) return null;
      var s = { id: uid(), name: name.trim(), icon: icon || '✨', xp: 0, level: 1 };
      state.skills.push(s);
      return s;
    },

    deleteSkill: function (state, id) {
      state.skills = state.skills.filter(function (s) { return s.id !== id; });
      state.quests.forEach(function (q) { if (q.skillId === id) q.skillId = null; });
      state.habits.forEach(function (h) { if (h.skillId === id) h.skillId = null; });
    },

    /* ----- capture: add everything the capture sheet (or a pack) proposed -----
       `items` is what parseDump / buildPack return, after the user's edits.
       Each one goes through the same action a hand-typed entry uses, so
       nothing here can create a shape the rest of the engine does not know.
       An item whose title already exists in its own list is skipped, not
       doubled: tapping the same pack twice must not fill the board with twins.
       Returns counts per kind plus the ids created (the UI flashes those rows). */
    addCaptured: function (state, items) {
      var out = { side: 0, daily: 0, habit: 0, main: 0, monster: 0, steps: 0, skipped: 0, total: 0, ids: [] };
      (items || []).forEach(function (it) {
        if (!it || typeof it.title !== 'string' || !it.title.trim()) return;
        var t = pdClip(it.title.replace(/\s+/g, ' ').trim(), PD_MAX_TITLE), low = t.toLowerCase();
        var skillId = it.skillId && state.skills.some(function (k) { return k.id === it.skillId; }) ? it.skillId : null;
        if (it.kind === 'habit' || it.kind === 'monster') {
          var type = it.kind === 'monster' ? 'bad' : 'good';
          if (state.habits.some(function (h) { return h.type === type && h.title.toLowerCase() === low; })) { out.skipped++; return; }
          var h = actions.addHabit(state, { title: t, type: type, skillId: type === 'good' ? skillId : null, target: it.target || 7 });
          out[it.kind]++; out.ids.push(h.id);
        } else if (it.kind === 'main') {
          if (state.goals.some(function (g) { return !g.doneOn && g.title.toLowerCase() === low; })) { out.skipped++; return; }
          var g = actions.addGoal(state, { title: t, note: '' });
          out.main++; out.ids.push(g.id);
          (it.steps || []).forEach(function (st) {
            if (!st || typeof st.title !== 'string' || !st.title.trim()) return;
            var sq = actions.addQuest(state, { title: pdClip(st.title, PD_MAX_TITLE), diff: st.diff, skillId: skillId, due: st.due || null, main: g.id });
            out.steps++; out.ids.push(sq.id);
          });
        } else {
          var rec = it.kind === 'daily';
          if (state.quests.some(function (q) { return !!q.recurring === rec && !q.main && (rec || !q.doneOn) && q.title.toLowerCase() === low; })) { out.skipped++; return; }
          var q = actions.addQuest(state, { title: t, diff: it.diff, skillId: skillId, due: rec ? null : (it.due || null), recurring: rec, days: rec ? it.days : null });
          out[rec ? 'daily' : 'side']++; out.ids.push(q.id);
        }
      });
      out.total = out.side + out.daily + out.habit + out.main + out.monster;
      if (out.total) addLog(state, '🦉', 'Sage logged ' + out.total + ' new entr' + (out.total === 1 ? 'y' : 'ies') + ' on the board.');
      return out;
    },

    /* ----- the plan: today's short list, locked from the Daily Draft -----
       setPlan stores refs ('q:<id>' / 'h:<id>'), not copies, so a quest edited
       or cleared anywhere else in the app is the same quest in the plan. An
       empty list is a valid plan and means "not today": it stops the draft
       from being offered again until tomorrow. */
    setPlan: function (state, refs, now) {
      var today = todayKey(now), keep = [];
      (refs || []).forEach(function (ref) {
        if (typeof ref !== 'string' || keep.indexOf(ref) >= 0) return;
        var id = ref.slice(2);
        /* only what is still to do today: a quest already cleared, or a habit
           already kept, would make the plan "complete" the moment it is locked */
        if (ref.charAt(0) === 'q' && state.quests.some(function (q) { return q.id === id && (q.recurring ? q.doneOn !== today : !q.doneOn); })) keep.push(ref);
        if (ref.charAt(0) === 'h' && state.habits.some(function (h) { return h.id === id && h.type === 'good' && h.lastDoneOn !== today; })) keep.push(ref);
      });
      /* a day already won stays won: locking a second plan the same day must
         not open the day bonus a second time */
      var wonAlready = !!(state.plan && state.plan.day === today && state.plan.wonOn === today);
      state.plan = { day: today, refs: keep, wonOn: wonAlready ? today : null, skipped: !keep.length };
      if (keep.length) addLog(state, '🧭', 'Plan locked: ' + keep.length + ' for today.');
      return actions.planStatus(state, now);
    },

    /* Where today's plan stands. `active` is false when no plan was locked
       today (yesterday's plan is not today's). An item deleted since the plan
       was locked simply drops out, so the count never waits on something that
       no longer exists. */
    planStatus: function (state, now) {
      var today = todayKey(now), p = state.plan;
      if (!p || p.day !== today) return { active: false, skipped: false, items: [], done: 0, total: 0, complete: false, won: false };
      var items = [];
      (p.refs || []).forEach(function (ref) {
        if (typeof ref !== 'string') return;
        var id = ref.slice(2);
        if (ref.charAt(0) === 'q') {
          var q = state.quests.find(function (x) { return x.id === id; });
          if (q) items.push({ ref: ref, kind: 'quest', id: id, title: q.title, done: q.recurring ? q.doneOn === today : !!q.doneOn });
        } else {
          var h = state.habits.find(function (x) { return x.id === id && x.type === 'good'; });
          if (h) items.push({ ref: ref, kind: 'habit', id: id, title: h.title, done: h.lastDoneOn === today });
        }
      });
      var done = items.filter(function (it) { return it.done; }).length;
      return { active: true, skipped: !!p.skipped, items: items, done: done, total: items.length,
        complete: items.length > 0 && done === items.length, won: p.wonOn === today };
    },

    /* Pays the day bonus the moment the whole plan is done, once per day.
       Returns null when there is nothing to pay (plan unfinished, or already
       paid today), so callers can fire it after every action. */
    /* Throw today's plan away so the draft is offered again ("Change the
       plan"). Refused once the day bonus is paid: a won day stays won, and
       re-planning it would let the bonus be earned twice. */
    clearPlan: function (state, now) {
      var p = state.plan;
      if (!p || p.day !== todayKey(now)) return false;
      if (p.wonOn === todayKey(now)) return false;
      state.plan = null;
      return true;
    },

    claimDayWon: function (state, now) {
      var st = actions.planStatus(state, now);
      if (!st.complete || st.won) return null;
      /* items deleted after the lock drop out of the count, so without this
         check deleting what is left would "finish" the plan. "Change the
         plan" is the honest way to drop something. */
      if (st.total < (state.plan.refs || []).length) return null;
      state.plan.wonOn = todayKey(now);
      state.counters.daysWon = (state.counters.daysWon || 0) + 1;
      var res = grant(state, { xp: PLAN_XP, coins: PLAN_COINS }, null);
      addLog(state, '🏁', 'Day won: the whole plan is done (' + st.total + ' of ' + st.total + ').', { xp: res.xp, coins: res.coins });
      res.dayWon = true; res.total = st.total; res.streak = state.hero.streak; res.daysWon = state.counters.daysWon;
      return res;
    },

    /* Game intensity. 'hardcore' and the older settings.hardcore flag are kept
       in step here because damage() reads the flag: set one without the other
       and the Settings screen would say Hardcore while defeats stay soft. */
    setIntensity: function (state, v) {
      if (['calm', 'classic', 'hardcore'].indexOf(v) < 0) return null;
      state.settings.intensity = v;
      state.settings.hardcore = v === 'hardcore';
      /* Calm has no HP, so it cannot leave anyone Downed or Wounded: that
         would keep the half-XP, no-coin penalty with no screen left to heal on */
      if (v === 'calm') { state.hero.downed = null; state.hero.woundedOn = null; state.hero.hp = maxHpOf(state); }
      return v;
    }
  };

  /* ---------- persistence + migration ---------- */
  var KEY = 'liferpg.save.v1';

  function migrate(s) {
    if (!s.goals) s.goals = [];
    if (!s.sleep) s.sleep = {};
    if (!s.journal) s.journal = {};
    if (!s.counters) s.counters = { quests: 0, focusMin: 0, purchases: 0, chests: 0 };
    ['quests', 'focusMin', 'purchases', 'chests', 'bosses', 'ascensions', 'mends', 'deaths', 'comebacks', 'daysWon'].forEach(function (k) { if (typeof s.counters[k] !== 'number') s.counters[k] = 0; });
    /* Sage as game master: the plan, staged systems and game intensity. A save
       from before stages existed has no `stage` at all and gets on:false,
       which means everything stays open for it (see STAGES). */
    if (!('plan' in s) || (s.plan && typeof s.plan !== 'object')) s.plan = null;
    if (s.plan && !Array.isArray(s.plan.refs)) s.plan.refs = [];
    if (s.plan) s.plan.refs = s.plan.refs.filter(function (r) { return typeof r === 'string'; });
    if (!s.stage || typeof s.stage !== 'object') s.stage = { on: false, got: {} };
    if (typeof s.stage.on !== 'boolean') s.stage.on = false;
    if (!s.stage.got || typeof s.stage.got !== 'object') s.stage.got = {};
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
    (s.quests || []).forEach(function (q) { if (!('days' in q)) q.days = null; if (typeof q.focusMin !== 'number') q.focusMin = 0; });
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
    if (['calm', 'classic', 'hardcore'].indexOf(s.settings.intensity) < 0) s.settings.intensity = s.settings.hardcore ? 'hardcore' : 'classic';
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

    /* HP lines (0 and 2) only for heroes who have HP: not before it opens on
       the staged game, and never in Calm */
    var hpOn = isUnlocked(state, 'stakes');
    // 0) defeated: the single most urgent thing
    if (state.hero.downed && hpOn) {
      mood = 'urgent';
      lines.push({ icon: '💀', tab: 'market', text: 'You were defeated - half XP and no coins until you rest to full HP and rise. Heal at the 🛏️ Hotel or sleep well.' });
    }
    // 1) streak emergency: Quest of Atonement
    if (state.redemption && state.redemption.on === today) {
      mood = 'urgent';
      lines.push({ icon: '🕯', tab: 'today', text: 'Your ' + state.redemption.streak + '-day streak broke! Clear ALL of today’s dailies before midnight to mend it.' });
    }
    // 2) wounded / low HP
    if (!hpOn) { /* nothing to say about HP */ }
    else if (state.hero.woundedOn === today) {
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
      var quiet = ['All clear! A perfect moment for a focus run.',
        'Board’s clean. Want to bank some deep work in Focus?',
        'Nothing urgent. Check Stats to admire your progress.'];
      if (isUnlocked(state, 'boss')) quiet.push('Quiet day. Maybe plan the week’s boss?');   // the boss opens at level 4
      lines.push({ icon: '✨', tab: 'stats', text: pickByDay(quiet, now) });
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
    SCHEMA: SCHEMA, DIFF: DIFF, RANKS: RANKS, MOODS: MOODS, ACHIEVEMENTS: ACHIEVEMENTS, MAX_HP: MAX_HP, MAX_SKILLS: MAX_SKILLS, KEY: KEY,
    BOONS: BOONS, FRAMES: FRAMES, PATHS: PATHS, ASCEND_LEVEL: ASCEND_LEVEL, POTION_XP_MULT: POTION_XP_MULT,
    uid: uid, todayKey: todayKey, clamp: clamp, parseTask: parseTask,
    parseDump: parseDump, captureItem: captureItem, captureDue: captureDue, CAPTURE_KINDS: CAPTURE_KINDS, PACKS: PACKS, packById: packById, buildPack: buildPack,
    dailyDraft: dailyDraft, habitWeek: habitWeek, debrief: debrief, suggestBoss: suggestBoss, chronicle: chronicle, PLAN_XP: PLAN_XP, PLAN_COINS: PLAN_COINS,
    STAGES: STAGES, stageById: stageById, staged: staged, isUnlocked: isUnlocked, checkUnlocks: checkUnlocks, unlockAll: unlockAll, nextUnlock: nextUnlock,
    xpForLevel: xpForLevel, skillXpForLevel: skillXpForLevel, rankFor: rankFor, nextRank: nextRank, streakMult: streakMult, buildICS: buildICS,
    progressKey: progressKey, compareProgress: compareProgress,
    skillTier: skillTier, boonById: boonById, frameById: frameById, pathById: pathById,
    boonCount: boonCount, maxHpOf: maxHpOf, menaceOf: menaceOf, ascendReady: ascendReady, buffXpMult: buffXpMult, bossSunday: bossSunday,
    buyInfo: buyInfo, buyPrice: buyPrice, buyCount: buyCount,
    newState: newState, seed: seed, seedPreset: seedPreset, dailyReset: dailyReset, migrate: migrate,
    grant: grant, damage: damage, ascend: ascend, rise: rise, usePotion: usePotion, addLog: addLog,
    checkAchievements: checkAchievements, weekStats: weekStats, weeklyReview: weeklyReview,
    insights: insights, metricsByDay: metricsByDay, questActiveOn: questActiveOn, focusByDay: focusByDay,
    heatmap: heatmap, bossTrophies: bossTrophies, briefing: briefing,
    actions: actions, save: save, load: load
  };
});
