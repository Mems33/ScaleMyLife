/* LiFE RPG v2 — core game logic (no DOM). Browser: window.RPG. Node: module.exports. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RPG = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SCHEMA = 4;

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
  var BOSS_XP = 500, BOSS_COINS = 250, BOSS_DAYS = 7;
  var BREAK_HP = 3;               // completing a pomodoro break heals a little
  var FOCUS_MIN_PAY = 5;          // sessions under 5 worked minutes pay nothing
  var FOCUS_MAX_PAY_MIN = 240;    // cap payout at 4h per session
  var MAX_HP = 100;

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
    { id: 'boss_5',      icon: '🔱', name: 'Serial Slayer',   desc: 'Slay 5 weekly bosses',          cond: function (s) { return s.counters.bosses >= 5; } }
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
  function nextRank(level) {
    for (var i = 0; i < RANKS.length; i++) if (RANKS[i].min > level) return RANKS[i];
    return null;
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
      { id: uid(), name: 'Craft',  icon: '🔨', xp: 0, level: 1 },
      { id: uid(), name: 'Social', icon: '🤝', xp: 0, level: 1 },
      { id: uid(), name: 'Wealth', icon: '💎', xp: 0, level: 1 }
    ];
  }

  function newState(heroName, avatar) {
    return {
      schema: SCHEMA,
      hero: { name: heroName || 'Hero', avatar: avatar || '🧙', title: '', level: 1, xp: 0, coins: 50, hp: MAX_HP, streak: 0, lastActiveDay: null, badges: [], shields: 0, woundedOn: null },
      skills: defaultSkills(),
      quests: [], goals: [], habits: [], shop: [],
      journal: {}, sleep: {}, log: [],
      counters: { quests: 0, focusMin: 0, purchases: 0, chests: 0, bosses: 0 },
      achievements: [],           // [{id,on}]
      activeFocus: null,
      boss: null,                 // {title,setOn,due,doneOn}
      chestClaimedOn: null,
      settings: { sound: true, theme: 'dungeon', music: 'lofi', musicUrl: '' },
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

  /* ---------- log ---------- */
  function addLog(state, icon, text, d) {
    d = d || {};
    state.log.unshift({
      t: new Date().toISOString(), day: todayKey(), icon: icon, text: text,
      xp: d.xp || 0, coins: d.coins || 0, hp: d.hp || 0, min: d.min || 0
    });
    if (state.log.length > 1000) state.log.length = 1000;
  }

  /* ---------- rewards engine ---------- */
  function touchStreak(state) {
    var today = todayKey();
    if (state.hero.lastActiveDay === today) return;
    var y = new Date(); y.setDate(y.getDate() - 1);
    state.hero.streak = (state.hero.lastActiveDay === todayKey(y)) ? state.hero.streak + 1 : 1;
    state.hero.lastActiveDay = today;
  }

  function grant(state, base, skillId) {
    touchStreak(state);
    var mult = streakMult(state.hero.streak);
    var xp = Math.round((base.xp || 0) * mult);
    var res = { xp: xp, coins: base.coins || 0, levelUps: [], skillUps: [], mult: mult };
    if (state.hero.woundedOn === todayKey()) { xp = Math.round(xp * 0.5); res.xp = xp; res.wounded = true; }
    var coins = res.coins;
    state.hero.coins += coins;
    state.hero.xp += xp;
    while (state.hero.xp >= xpForLevel(state.hero.level)) {
      state.hero.xp -= xpForLevel(state.hero.level);
      state.hero.level++;
      state.hero.hp = MAX_HP;
      res.levelUps.push(state.hero.level);
      var r = rankFor(state.hero.level);
      if (r.min === state.hero.level) {
        state.hero.badges.push({ code: r.code, name: r.name, on: todayKey() });
        res.newRank = r;
      }
    }
    if (skillId && xp > 0) {
      var s = state.skills.find(function (k) { return k.id === skillId; });
      if (s) {
        s.xp += Math.round(xp * 0.8);
        while (s.xp >= skillXpForLevel(s.level)) { s.xp -= skillXpForLevel(s.level); s.level++; res.skillUps.push({ name: s.name, icon: s.icon, level: s.level }); }
      }
    }
    return res;
  }

  function damage(state, hp, coins) {
    state.hero.hp = clamp(state.hero.hp - hp, 0, MAX_HP);
    state.hero.coins = Math.max(0, state.hero.coins - (coins || 0));
    var ko = state.hero.hp === 0;
    if (ko) { state.hero.hp = 25; state.hero.woundedOn = todayKey(); }
    return { ko: ko };
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

  /* ---------- daily maintenance ---------- */
  function dailyReset(state) {
    var today = todayKey();
    if (state.lastSeenDay === today) return false;
    state.quests.forEach(function (q) {
      if (q.recurring && q.doneOn && q.doneOn !== today) q.doneOn = null;
    });
    var y = new Date(); y.setDate(y.getDate() - 1);
    if (state.hero.lastActiveDay && state.hero.lastActiveDay !== today && state.hero.lastActiveDay !== todayKey(y)) {
      if ((state.hero.shields || 0) > 0 && state.hero.streak > 0) {
        state.hero.shields--;
        state.hero.lastActiveDay = todayKey(y); // shield bridges the gap: next action continues the streak
        addLog(state, '🛡', 'Streak Shield consumed — your ' + state.hero.streak + '-day streak survives!');
      } else {
        state.hero.streak = 0;
      }
    }
    if (state.boss && !state.boss.doneOn && today > state.boss.due) {
      addLog(state, '💀', 'The boss escaped: ' + state.boss.title + '. Name a new one on Friday.');
      state.boss = null;
    }
    state.hero.woundedOn = null; // wounds heal overnight
    state.lastSeenDay = today;
    addLog(state, '🌅', 'A new day begins — dailies and habits are fresh.');
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

  /* ---------- actions ---------- */
  var actions = {

    addQuest: function (state, o) {
      var q = { id: uid(), title: o.title.trim(), diff: DIFF[o.diff] ? o.diff : 'normal',
        skillId: o.skillId || null, due: o.due || null, recurring: !!o.recurring,
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

    addHabit: function (state, o) {
      var h = { id: uid(), title: o.title.trim(), type: o.type === 'bad' ? 'bad' : 'good',
        skillId: o.skillId || null, streak: 0, lastDoneOn: null, slips: 0,
        cleanSince: o.type === 'bad' ? todayKey() : null, history: [], bestClean: 0,
        target: clamp(Math.round(o.target) || 7, 1, 7) };
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

    /* bad habit: log a slip — the monster hits you */
    slipHabit: function (state, id) {
      var h = state.habits.find(function (x) { return x.id === id; });
      if (!h || h.type !== 'bad') return null;
      h.bestClean = Math.max(h.bestClean || 0, cleanDaysOf(h));
      h.slips++;
      h.lastDoneOn = todayKey();
      h.cleanSince = todayKey();
      var hit = damage(state, SLIP_HP, SLIP_COINS);
      addLog(state, '👾', 'Monster hit: ' + h.title, { hp: -SLIP_HP, coins: -SLIP_COINS });
      return { hp: -SLIP_HP, coins: -SLIP_COINS, ko: hit.ko, title: h.title };
    },

    cleanDays: function (h) { return cleanDaysOf(h); },

    deleteHabit: function (state, id) {
      state.habits = state.habits.filter(function (h) { return h.id !== id; });
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
        workedMs: 0, cycles: 0, skillId: o.skillId || null, label: (o.label || '').trim(),
        startedAt: new Date(now).toISOString() };
      return state.activeFocus;
    },

    /* advance phases; returns {event:'break'|'work', healed} when a phase flips, else null */
    tickFocus: function (state, now) {
      var f = state.activeFocus;
      now = now || Date.now();
      if (!f || now < f.phaseEnd) return null;
      var last = null, healed = 0, guard = 0;
      while (f && now >= f.phaseEnd && guard++ < 500) {
        if (f.phase === 'work') {
          f.workedMs += f.work * 60000;
          if (f.brk > 0) { f.phase = 'break'; f.phaseEnd += f.brk * 60000; last = 'break'; }
          else { f.cycles++; f.phaseEnd += f.work * 60000; last = 'work'; }
        } else {
          f.phase = 'work'; f.cycles++; f.phaseEnd += f.work * 60000; last = 'work';
          var before = state.hero.hp;
          state.hero.hp = clamp(state.hero.hp + BREAK_HP, 0, MAX_HP);
          healed += state.hero.hp - before;
        }
      }
      return last ? { event: last, healed: healed } : null;
    },

    /* worked ms right now, including the running part of a work phase */
    focusWorkedMs: function (state, now) {
      var f = state.activeFocus;
      if (!f) return 0;
      now = now || Date.now();
      var ms = f.workedMs;
      if (f.phase === 'work') ms += clamp(f.work * 60000 - (f.phaseEnd - now), 0, f.work * 60000);
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
        addLog(state, '🏳️', 'Focus session stopped at ' + minutes + ' min (under ' + FOCUS_MIN_PAY + ' — no reward)');
        return { minutes: minutes, tooShort: true };
      }
      state.counters.focusMin += paid;
      var res = grant(state, { xp: Math.round(paid * FOCUS_XP_PER_MIN), coins: Math.round(paid * FOCUS_COIN_PER_MIN) }, skillId);
      addLog(state, '⏳', 'Focus session: ' + paid + ' min' + (label ? ' — ' + label : ''), { xp: res.xp, coins: res.coins, min: paid });
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

    /* ----- daily chest ----- */
    chestStatus: function (state) {
      var today = todayKey();
      var dailies = state.quests.filter(function (q) { return q.recurring; });
      var done = dailies.filter(function (q) { return q.doneOn === today; }).length;
      return { total: dailies.length, done: done,
        claimed: state.chestClaimedOn === today,
        eligible: dailies.length > 0 && done === dailies.length && state.chestClaimedOn !== today };
    },

    claimChest: function (state) {
      var st = actions.chestStatus(state);
      if (!st.eligible) return null;
      state.chestClaimedOn = todayKey();
      state.counters.chests++;
      var coins = CHEST_COIN_MIN + Math.floor(Math.random() * (CHEST_COIN_SPREAD + 1));
      var res = grant(state, { xp: CHEST_XP, coins: coins }, null);
      addLog(state, '🎁', 'Daily chest opened!', { xp: res.xp, coins: res.coins });
      return res;
    },

    /* ----- shop ----- */
    addShopItem: function (state, o) {
      var it = { id: uid(), title: o.title.trim(), price: Math.max(1, Math.round(o.price || 10)),
        tab: ['market', 'hotel', 'black'].indexOf(o.tab) >= 0 ? o.tab : 'market',
        hp: Math.max(0, Math.round(o.hp || 0)), dmg: Math.max(0, Math.round(o.dmg || 0)),
        special: o.special || null };
      state.shop.push(it);
      return it;
    },

    buy: function (state, id) {
      var it = state.shop.find(function (x) { return x.id === id; });
      if (!it) return null;
      if (it.special === 'shield' && (state.hero.shields || 0) >= 1) return { fail: 'shield' };
      if (state.hero.coins < it.price) return { fail: 'coins' };
      state.hero.coins -= it.price;
      state.counters.purchases++;
      if (it.special === 'shield') {
        state.hero.shields = (state.hero.shields || 0) + 1;
        addLog(state, '🛡', 'Bought: ' + it.title, { coins: -it.price });
        return { title: it.title, coins: -it.price, shield: true };
      }
      var healed = 0, ko = false;
      if (it.hp > 0) {
        var before = state.hero.hp;
        state.hero.hp = clamp(state.hero.hp + it.hp, 0, MAX_HP);
        healed = state.hero.hp - before;
        state.hero.woundedOn = null; // real rest heals wounds
      }
      if (it.dmg > 0) {
        var hit = damage(state, it.dmg, 0);
        healed = -it.dmg;
        ko = hit.ko;
      }
      addLog(state, it.tab === 'black' ? '🕶️' : it.tab === 'hotel' ? '🛏️' : '🛒',
        'Bought: ' + it.title, { coins: -it.price, hp: healed });
      return { title: it.title, coins: -it.price, hp: healed, ko: ko };
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
      state.hero.hp = clamp(state.hero.hp + heal, 0, MAX_HP);
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
    ['quests', 'focusMin', 'purchases', 'chests', 'bosses'].forEach(function (k) { if (typeof s.counters[k] !== 'number') s.counters[k] = 0; });
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
    if (typeof s.hero.title !== 'string') s.hero.title = '';
    if (typeof s.hero.shields !== 'number') s.hero.shields = 0;
    if (!('woundedOn' in s.hero)) s.hero.woundedOn = null;
    (s.habits || []).forEach(function (h) {
      if (!Array.isArray(h.history)) h.history = h.lastDoneOn ? [h.lastDoneOn] : [];
      if (typeof h.bestClean !== 'number') h.bestClean = 0;
      if (typeof h.target !== 'number') h.target = 7;
    });
    (s.shop || []).forEach(function (it) {
      if (typeof it.dmg !== 'number') it.dmg = 0;
      if (!('special' in it)) it.special = null;
    });
    var iconFix = { '⚒️': '🔨', '🗣️': '🤝', '💰': '💎' };
    (s.skills || []).forEach(function (k) { if (iconFix[k.icon]) k.icon = iconFix[k.icon]; });
    s.log = (s.log || []).map(function (e) { if (typeof e.min !== 'number') e.min = 0; return e; });
    s.schema = SCHEMA;
    return s;
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
    uid: uid, todayKey: todayKey, clamp: clamp,
    xpForLevel: xpForLevel, skillXpForLevel: skillXpForLevel, rankFor: rankFor, nextRank: nextRank, streakMult: streakMult, buildICS: buildICS,
    newState: newState, seed: seed, dailyReset: dailyReset, migrate: migrate,
    grant: grant, damage: damage, addLog: addLog, checkAchievements: checkAchievements, weekStats: weekStats,
    actions: actions, save: save, load: load
  };
});
