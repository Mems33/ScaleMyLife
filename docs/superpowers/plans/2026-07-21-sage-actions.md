# Sage Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Sage (the in-app owl chat assistant) actually perform five actions on the user's behalf via chat — complete a quest, complete a habit, log mood, add a quest, add a habit — using Claude tool-use in the existing `sage-chat` Supabase Edge Function.

**Architecture:** The Edge Function gains a fixed 5-tool whitelist passed to the Anthropic Messages API. If Claude's reply contains a tool call, the function returns `{reply, action, remaining}` instead of executing anything itself — it never touches the user's save data. The client (`app.js`) applies "auto" actions immediately through the existing `RPG.actions` functions and existing UI wrapper functions (`doQuest`, `doHabit`), and shows "confirm" actions as an inline chat card that only mutates state when the user taps Yes.

**Tech Stack:** Deno Edge Function (TypeScript) on Supabase, Anthropic Messages API tool-use, plain-JS client (`app.js`/`cloud.js`/`core.js`, no build step), Node test suites (`test.js`, `test-cloud.js`, `test-ui.js` with jsdom) run via `npm test`.

## Global Constraints

- No build step, no bundler, no framework — all edits are to the existing plain files (`index.html`, `styles.css`, `app.js`, `core.js`, `cloud.js`) plus the Edge Function source.
- The engine (`core.js` / `RPG.actions`, aliased as `A` in `app.js`) is the only place game state is mutated. Nothing in this plan adds mutation logic to the Edge Function.
- `core.js` needs **no changes** — `RPG.actions.addQuest`, `addHabit`, `completeQuest`, `doHabit`, `logJournal` already exist with the signatures used below.
- Daily rate limit (30 chats/user/day via `sage_usage` RPC) and message-length caps are unchanged.
- Action set is exactly 5 tools: `complete_quest`, `complete_habit`, `log_mood` (auto-apply), `add_quest`, `add_habit` (confirm-first). No delete/edit/purchase actions in this plan.
- Run `npm test` before and after every task — all three suites (`test.js`, `test-cloud.js`, `test-ui.js`) must report `0 failed`.
- Edge Function project: `rbhjqvfuvzpqrxmvfimd`, function slug `sage-chat`, deployed via the Supabase MCP's edge-function-deploy tool (no local Supabase CLI link in this repo) — if that tool isn't already loaded in your session, use ToolSearch with a query like `"select:deploy_edge_function"` or `"supabase deploy edge function"` to find it.

---

### Task 1: Edge Function — tool definitions & action passthrough

**Files:**
- Modify: `supabase/functions/sage-chat/index.ts` (deployed via Supabase MCP, not committed-then-CI'd — editing the local copy AND deploying it are both required)
- No local automated test exists for this function (no Supabase CLI link in this repo). Verification is manual curl, matching how CORS was verified earlier in this project.

**Interfaces:**
- Consumes: nothing new from earlier tasks (this is the first task).
- Produces: an Edge Function that accepts an optional `today` string in the POST body, and returns `{reply: string|null, action: {type: string, params: object}|null, remaining: number}` on success (previously it only returned `{reply, remaining}`). Task 2 (`cloud.js`) consumes this exact response shape.

- [ ] **Step 1: Read the current deployed source and confirm the file matches local**

Run: `cat /Users/mems/Documents/ScaleMyLife/supabase/functions/sage-chat/index.ts`

Expected: matches the version already in this repo (the CORS fix from the earlier `apikey` header bug, version 3 on the dashboard).

- [ ] **Step 2: Edit the constants and body-parsing section**

In `supabase/functions/sage-chat/index.ts`, replace:

```ts
const DAILY_LIMIT = 30;
const MAX_MESSAGE_LEN = 500;
const MAX_BRIEF_LEN = 800;
const MODEL = "claude-haiku-4-5-20251001";
```

with:

```ts
const DAILY_LIMIT = 30;
const MAX_MESSAGE_LEN = 500;
const MAX_BRIEF_LEN = 800;
const MAX_TODAY_LEN = 1200;
const MODEL = "claude-haiku-4-5-20251001";

const TOOLS = [
  {
    name: "complete_quest",
    description: "Mark one of today's existing quests as done. Only call this with a quest id that appears in the Today list given this turn. Never invent an id.",
    input_schema: {
      type: "object",
      properties: { quest_id: { type: "string", description: "id of an existing quest from today's list" } },
      required: ["quest_id"],
    },
  },
  {
    name: "complete_habit",
    description: "Mark one of today's existing good habits as checked off for today. Only call this with a habit id that appears in the Today list given this turn. Never invent an id.",
    input_schema: {
      type: "object",
      properties: { habit_id: { type: "string", description: "id of an existing habit from today's list" } },
      required: ["habit_id"],
    },
  },
  {
    name: "log_mood",
    description: "Log the user's mood for today's journal entry, when they tell you how they're feeling and it reads as wanting that logged.",
    input_schema: {
      type: "object",
      properties: { mood: { type: "string", enum: ["awful", "bad", "ok", "good", "great"] } },
      required: ["mood"],
    },
  },
  {
    name: "add_quest",
    description: "Propose a brand new quest for the user. This always requires the user's confirmation before anything is saved, so propose one whenever the user clearly asks you to create a quest for them.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        difficulty: { type: "string", enum: ["easy", "normal", "hard", "epic"] },
        due: { type: "string", description: "ISO date YYYY-MM-DD, optional" },
      },
      required: ["title"],
    },
  },
  {
    name: "add_habit",
    description: "Propose a brand new habit for the user. This always requires the user's confirmation before anything is saved, so propose one whenever the user clearly asks you to create a habit for them.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        target: { type: "number", description: "weekly target, 1-7 days, optional (defaults to 7 if omitted)" },
      },
      required: ["title"],
    },
  },
];
```

- [ ] **Step 3: Update the system prompt with tool-use rules**

Replace the closing backtick line of `SYSTEM_PROMPT`:

```ts
- You are a supportive companion for their real habits and goals, not a
  general-purpose assistant - gently redirect anything far outside that
  (e.g. don't give financial, legal or medical advice; suggest they talk to
  a real professional for that, then bring it back to something concrete
  they can do in the app or their day).`;
```

with:

```ts
- You are a supportive companion for their real habits and goals, not a
  general-purpose assistant - gently redirect anything far outside that
  (e.g. don't give financial, legal or medical advice; suggest they talk to
  a real professional for that, then bring it back to something concrete
  they can do in the app or their day).

Tool use rules (non-negotiable):
- Only call complete_quest or complete_habit with an id that appears in the
  Today list you were given this turn. Never invent an id.
- Call add_quest or add_habit whenever the user clearly asks you to create
  something new for them - these always require the user's own confirmation
  before anything is saved, so proposing one is safe.
- Call log_mood when the user tells you how they're feeling today in a way
  that reads as wanting it logged.
- Call at most one tool per reply. If nothing the user said calls for an
  action, just reply normally with no tool call.`;
```

- [ ] **Step 4: Extract `today` from the request body and build the context block**

Replace:

```ts
    const message = String(body.message || "").trim().slice(0, MAX_MESSAGE_LEN);
    const brief = String(body.brief || "").trim().slice(0, MAX_BRIEF_LEN);
    if (!message) {
      return new Response(JSON.stringify({ error: "empty message" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }
```

with:

```ts
    const message = String(body.message || "").trim().slice(0, MAX_MESSAGE_LEN);
    const brief = String(body.brief || "").trim().slice(0, MAX_BRIEF_LEN);
    const today = String(body.today || "").trim().slice(0, MAX_TODAY_LEN);
    if (!message) {
      return new Response(JSON.stringify({ error: "empty message" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }
```

And update the `body` type declaration a few lines above from:

```ts
    let body: { message?: string; brief?: string };
```

to:

```ts
    let body: { message?: string; brief?: string; today?: string };
```

- [ ] **Step 5: Build the context block and pass `tools` to the Anthropic call**

Replace:

```ts
    const userContent = brief ? `[Current state: ${brief}]\n\n${message}` : message;
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 350,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
      }),
    });
```

with:

```ts
    const context = [
      brief ? `Current state: ${brief}` : "",
      today ? `Today (ids you may act on): ${today}` : "",
    ].filter(Boolean).join("\n");
    const userContent = context ? `[${context}]\n\n${message}` : message;
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 350,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages: [{ role: "user", content: userContent }],
      }),
    });
```

- [ ] **Step 6: Parse tool_use blocks and return `action` alongside `reply`**

Replace:

```ts
    const aiJson = await aiRes.json();
    const reply = aiJson?.content?.[0]?.text || "Hoo? I lost my train of thought - ask me again?";
    return new Response(JSON.stringify({ reply, remaining: Math.max(0, DAILY_LIMIT - count) }), { headers: { ...cors, "Content-Type": "application/json" } });
```

with:

```ts
    const aiJson = await aiRes.json();
    const blocks: Array<Record<string, unknown>> = aiJson?.content || [];
    const textBlock = blocks.find((b) => b.type === "text") as { text?: string } | undefined;
    const toolBlock = blocks.find((b) => b.type === "tool_use") as { name?: string; input?: unknown } | undefined;
    const reply = typeof textBlock?.text === "string" ? textBlock.text : null;
    const action = toolBlock?.name ? { type: toolBlock.name, params: toolBlock.input || {} } : null;
    if (!reply && !action) {
      return new Response(JSON.stringify({ reply: "Hoo? I lost my train of thought - ask me again?", action: null, remaining: Math.max(0, DAILY_LIMIT - count) }), { headers: { ...cors, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ reply, action, remaining: Math.max(0, DAILY_LIMIT - count) }), { headers: { ...cors, "Content-Type": "application/json" } });
```

- [ ] **Step 7: Deploy and sanity-check with curl**

Deploy the updated `index.ts` via the Supabase MCP's edge-function-deploy tool (project `rbhjqvfuvzpqrxmvfimd`, function name `sage-chat`, entrypoint `index.ts`, `verify_jwt: true`, file content = the full updated file).

Then confirm CORS/auth behavior is unchanged:

Run:
```bash
curl -sv -X OPTIONS "https://rbhjqvfuvzpqrxmvfimd.supabase.co/functions/v1/sage-chat" \
  -H "Origin: http://localhost:8123" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,content-type,apikey" 2>&1 | grep -i "access-control"
```
Expected: same three `access-control-*` lines as before (`allow-origin: http://localhost:8123`, `allow-headers: authorization, content-type, apikey`, `allow-methods: POST, OPTIONS`).

Run:
```bash
curl -s -X POST "https://rbhjqvfuvzpqrxmvfimd.supabase.co/functions/v1/sage-chat" \
  -H "Origin: http://localhost:8123" -H "Authorization: Bearer invalidtoken123" \
  -H "Content-Type: application/json" -d '{"message":"hi","brief":"","today":""}'
```
Expected: `{"code":"UNAUTHORIZED_INVALID_JWT_FORMAT","message":"Invalid JWT"}` (same as before — confirms the deploy didn't break basic request handling). Full tool-call behavior needs a real signed-in session and is verified live in Task 5, once the client can render `action` responses.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/sage-chat/index.ts
git commit -m "Sage: add tool-use for complete/add quest, complete/add habit, log mood"
```

---

### Task 2: `cloud.js` — send `today`, return `action`

**Files:**
- Modify: `cloud.js:226-242` (the `chatSage` function)
- Test: `test-cloud.js` (add cases inside the existing `section('Sage Phase 2: chat via the sage-chat Edge Function')` block, currently starting at line 182)

**Interfaces:**
- Consumes: the Edge Function response shape from Task 1: `{reply: string|null, action: {type, params}|null, remaining: number}` on success, `{error: string}` on failure.
- Produces: `SMLCloud.chatSage(message, brief, today)` returning `{ok: true, reply, action, remaining}` or `{ok: false, error}`. Task 3 (`app.js`) calls this with the new third argument and reads `.action` off the result.

- [ ] **Step 1: Write the failing tests**

In `test-cloud.js`, inside the existing `section('Sage Phase 2: chat via the sage-chat Edge Function')` block, immediately after the existing line:

```js
  ok(scReq.body.message === 'how am I doing?' && scReq.body.brief === 'level 5, streak 3d', 'message + brief context sent as JSON, nothing else');
```

add:

```js
  fx.route('/functions/v1/sage-chat', 200, { reply: 'On it!', action: { type: 'complete_quest', params: { quest_id: 'q1' } }, remaining: 11 });
  var scAction = await Cloud.chatSage('mark my workout done', 'level 5, streak 3d', 'quest q1: Workout');
  ok(scAction.ok === true && scAction.action && scAction.action.type === 'complete_quest' && scAction.action.params.quest_id === 'q1', 'a tool-call response surfaces action.type and action.params');
  var scActionReq = log[log.length - 1];
  ok(scActionReq.body.today === 'quest q1: Workout', 'the today payload rides along as a third field');
  fx.route('/functions/v1/sage-chat', 200, { reply: 'Sounds good.', action: null, remaining: 10 });
  var scNoAction = await Cloud.chatSage('how am I doing?', '', '');
  ok(scNoAction.ok === true && scNoAction.action === null, 'a plain-text reply has action: null, not undefined');
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node test-cloud.js`
Expected: `FAIL` — `scAction.action` is `undefined` (current `chatSage` doesn't read or return `action`, and doesn't send `today`).

- [ ] **Step 3: Implement the minimal change**

In `cloud.js`, replace:

```js
    chatSage: function (message, brief) {
      function once() {
        var sess = getSession();
        if (!sess) return Promise.resolve({ status: 401, ok: false, j: {} });
        var h = authHeaders({ 'Authorization': 'Bearer ' + sess.access_token });
        return req(cfg.url + '/functions/v1/sage-chat', { method: 'POST', headers: h,
          body: JSON.stringify({ message: message, brief: brief || '' }) });
      }
      if (!api.configured() || !getSession()) return Promise.resolve({ ok: false, error: 'not signed in' });
      return once().then(function (r) {
        if (r.status !== 401) return r;
        return api.refresh().then(function (rf) { return rf.ok ? once() : r; });
      }).then(function (r) {
        if (!r.ok) return { ok: false, error: errMsg(r.j, 'Sage could not reply (' + r.status + ')') };
        return { ok: true, reply: r.j.reply, remaining: r.j.remaining };
      });
    },
```

with:

```js
    chatSage: function (message, brief, today) {
      function once() {
        var sess = getSession();
        if (!sess) return Promise.resolve({ status: 401, ok: false, j: {} });
        var h = authHeaders({ 'Authorization': 'Bearer ' + sess.access_token });
        return req(cfg.url + '/functions/v1/sage-chat', { method: 'POST', headers: h,
          body: JSON.stringify({ message: message, brief: brief || '', today: today || '' }) });
      }
      if (!api.configured() || !getSession()) return Promise.resolve({ ok: false, error: 'not signed in' });
      return once().then(function (r) {
        if (r.status !== 401) return r;
        return api.refresh().then(function (rf) { return rf.ok ? once() : r; });
      }).then(function (r) {
        if (!r.ok) return { ok: false, error: errMsg(r.j, 'Sage could not reply (' + r.status + ')') };
        return { ok: true, reply: r.j.reply, action: r.j.action || null, remaining: r.j.remaining };
      });
    },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node test-cloud.js`
Expected: all cases in the file pass, `0 failed`.

- [ ] **Step 5: Commit**

```bash
git add cloud.js test-cloud.js
git commit -m "cloud.js: chatSage sends today context, surfaces action from Sage"
```

---

### Task 3: `app.js` — auto-apply actions (complete_quest, complete_habit, log_mood)

**Files:**
- Modify: `app.js:2544-2589` (the `mascotChatLog`/`sageBrief`/`sageSend` block)
- Test: `test-ui.js` (add cases after the existing Sage Phase 2 block, which ends around line 1207)

**Interfaces:**
- Consumes: `SMLCloud.chatSage(message, brief, today)` from Task 2, returning `{ok, reply, action, remaining}` / `{ok:false, error}`. Also consumes existing `A.logJournal(state, moodKey, note)`, `doQuest(id)`, `doHabit(id)`, `persist()`, `render()`, `fx(res)`, `RPG.todayKey()`, `RPG.MOODS` (all pre-existing, unchanged).
- Produces: `sageToday(state)` (a compact string of today's quest/habit ids+titles), `SAGE_ACTION_TIERS` (a `{type: 'auto'|'confirm'}` map covering all 5 tool names), `sageApplyAction(type, params)` (returns `true`/`false`, mutates state for a recognized+valid action, no-ops otherwise). Task 4 extends `SAGE_ACTION_TIERS`' `'confirm'` entries with card rendering and calls `sageApplyAction` from the confirm button.

- [ ] **Step 1: Write the failing tests**

In `test-ui.js`, immediately after the existing line (around 1206-1207):

```js
  w.mascotChatLog = []; w.mascotChatBusy = false;
  w.toggleMascot(false);
```

add:

```js
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
  ok(d.querySelector('.mchat-row.sage').textContent.indexOf('Nice work') >= 0, 'accompanying reply text still renders as a normal Sage bubble');

  w.SMLCloud.configure({ fetch: function () {
    return Promise.resolve({ status: 200, ok: true, text: function () { return Promise.resolve(JSON.stringify({ reply: null, action: { type: 'log_mood', params: { mood: 'great' } }, remaining: 18 })); } });
  } });
  d.querySelector('#mChatInput').value = 'log that I feel great today';
  w.sageSend();
  await new Promise(function (r) { setTimeout(r, 20); });
  ok(w.state.journal[w.RPG.todayKey()] && w.state.journal[w.RPG.todayKey()].mood === 'great', 'log_mood writes today\'s journal entry');

  w.SMLCloud.configure({ fetch: function () {
    return Promise.resolve({ status: 200, ok: true, text: function () { return Promise.resolve(JSON.stringify({ reply: 'Sure!', action: { type: 'delete_everything', params: {} }, remaining: 17 })); } });
  } });
  var questsBefore = w.state.quests.length, habitsBefore = w.state.habits.length;
  d.querySelector('#mChatInput').value = 'do something unsupported';
  w.sageSend();
  await new Promise(function (r) { setTimeout(r, 20); });
  ok(w.state.quests.length === questsBefore && w.state.habits.length === habitsBefore, 'an unrecognized action.type is silently ignored, no crash, no state change');
  ok(d.querySelector('.mchat-row.sage').textContent.indexOf('Sure') >= 0, 'the accompanying reply still renders even when the action itself is ignored');

  w.SMLCloud.configure({ fetch: null });
  w.localStorage.removeItem('sml.cloud.session.v1');
  w.mascotChatLog = []; w.mascotChatBusy = false;
  w.toggleMascot(false);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node test-ui.js`
Expected: `FAIL` — `sageToday` and `sageApplyAction` don't exist yet, `SMLCloud.chatSage` is only called with 2 arguments so `todayCalls[0].today` is `undefined`, and no action handling exists so quests/habits/journal are never touched.

- [ ] **Step 3: Implement `sageToday`, `SAGE_ACTION_TIERS`, `sageApplyAction`, and wire them into `sageSend`**

In `app.js`, replace:

```js
function sageBrief(){
  var h=state.hero, today=RPG.todayKey();
  var chest=A.chestStatus(state);
  var bits=['name '+h.name,'level '+h.level,'streak '+h.streak+'d',
    'HP '+h.hp+'/'+RPG.maxHpOf(state),'coins '+h.coins,
    'dailies '+chest.done+'/'+chest.total+' today'];
  if(state.boss&&!state.boss.doneOn) bits.push('weekly boss "'+state.boss.title+'" active');
  if(state.hero.downed) bits.push('currently downed');
  return bits.join(', ');
}
```

with:

```js
function sageBrief(){
  var h=state.hero, today=RPG.todayKey();
  var chest=A.chestStatus(state);
  var bits=['name '+h.name,'level '+h.level,'streak '+h.streak+'d',
    'HP '+h.hp+'/'+RPG.maxHpOf(state),'coins '+h.coins,
    'dailies '+chest.done+'/'+chest.total+' today'];
  if(state.boss&&!state.boss.doneOn) bits.push('weekly boss "'+state.boss.title+'" active');
  if(state.hero.downed) bits.push('currently downed');
  return bits.join(', ');
}
function sageToday(state){
  var today=RPG.todayKey();
  var qs=(state.quests||[]).filter(function(q){ return !q.doneOn || q.doneOn===today; }).slice(0,15)
    .map(function(q){ return 'quest '+q.id+': '+String(q.title||'').replace(/[":;]/g,' '); });
  var hs=(state.habits||[]).filter(function(h){ return h.type==='good'; }).slice(0,15)
    .map(function(h){ return 'habit '+h.id+': '+String(h.title||'').replace(/[":;]/g,' '); });
  return qs.concat(hs).join('; ').slice(0,1200);
}
var SAGE_ACTION_TIERS={complete_quest:'auto',complete_habit:'auto',log_mood:'auto',add_quest:'confirm',add_habit:'confirm'};
function sageApplyAction(type, params){
  params=params||{};
  if(type==='complete_quest'){
    if(!state.quests.some(function(q){ return q.id===params.quest_id; })) return false;
    doQuest(params.quest_id); return true;
  }
  if(type==='complete_habit'){
    if(!state.habits.some(function(h){ return h.id===params.habit_id; })) return false;
    doHabit(params.habit_id); return true;
  }
  if(type==='log_mood'){
    if(!RPG.MOODS.some(function(m){ return m.key===params.mood; })) return false;
    var r=A.logJournal(state, params.mood, ''); persist(); render(); fx(r); return true;
  }
  if(type==='add_quest'){
    var t=String(params.title||'').trim(); if(!t) return false;
    var diff=['easy','normal','hard','epic'].indexOf(params.difficulty)>=0?params.difficulty:'normal';
    A.addQuest(state,{title:t,diff:diff,skillId:null,due:params.due||null,recurring:false,days:null,main:null});
    persist(); render(); return true;
  }
  if(type==='add_habit'){
    var t2=String(params.title||'').trim(); if(!t2) return false;
    A.addHabit(state,{title:t2,type:'good',skillId:null,target:Number(params.target)||7});
    persist(); render(); return true;
  }
  return false;
}
```

Then replace the `sageSend` function:

```js
function sageSend(){
  var inp=document.getElementById('mChatInput'); if(!inp||mascotChatBusy) return;
  var text=inp.value.trim(); if(!text) return;
  mascotChatLog.push({who:'you',text:text});
  mascotChatBusy=true;
  var bub=document.getElementById('mBubble'); if(bub) bub.innerHTML=mascotChatHtml();
  var log=document.getElementById('mChatLog'); if(log) log.scrollTop=log.scrollHeight;
  SMLCloud.chatSage(text, sageBrief()).then(function(r){
    mascotChatBusy=false;
    if(r.ok) mascotChatLog.push({who:'sage',text:r.reply});
    else mascotChatLog.push({who:'sage',text:r.error||'Sage could not reply just now.'});
    if(mascotView==='chat'){
      var b=document.getElementById('mBubble'); if(b) b.innerHTML=mascotChatHtml();
      var l=document.getElementById('mChatLog'); if(l) l.scrollTop=l.scrollHeight;
      var i=document.getElementById('mChatInput'); if(i) i.focus();
    }
  });
}
```

with:

```js
function sageSend(){
  var inp=document.getElementById('mChatInput'); if(!inp||mascotChatBusy) return;
  var text=inp.value.trim(); if(!text) return;
  mascotChatLog.push({who:'you',text:text});
  mascotChatBusy=true;
  var bub=document.getElementById('mBubble'); if(bub) bub.innerHTML=mascotChatHtml();
  var log=document.getElementById('mChatLog'); if(log) log.scrollTop=log.scrollHeight;
  SMLCloud.chatSage(text, sageBrief(), sageToday(state)).then(function(r){
    mascotChatBusy=false;
    if(r.ok){
      var tier=r.action && SAGE_ACTION_TIERS[r.action.type];
      if(tier==='auto'){
        sageApplyAction(r.action.type, r.action.params);
        if(r.reply) mascotChatLog.push({who:'sage',text:r.reply});
      } else if(tier==='confirm'){
        mascotChatLog.push({who:'sage',text:r.reply||'',pendingAction:{type:r.action.type,params:r.action.params}});
      } else if(r.reply){
        mascotChatLog.push({who:'sage',text:r.reply});
      }
    } else {
      mascotChatLog.push({who:'sage',text:r.error||'Sage could not reply just now.'});
    }
    if(mascotView==='chat'){
      var b=document.getElementById('mBubble'); if(b) b.innerHTML=mascotChatHtml();
      var l=document.getElementById('mChatLog'); if(l) l.scrollTop=l.scrollHeight;
      var i=document.getElementById('mChatInput'); if(i) i.focus();
    }
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node test-ui.js`
Expected: all cases pass, `0 failed`. (The `pendingAction`/`.mchat-action` card itself isn't rendered yet — that's Task 4 — but the auto-apply tests above don't depend on it, and `ok(d.querySelector('.mchat-action') === null, ...)` should already pass since nothing renders cards yet.)

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: `0 failed` across `test.js`, `test-cloud.js`, `test-ui.js`.

- [ ] **Step 6: Commit**

```bash
git add app.js test-ui.js
git commit -m "Sage: auto-apply complete_quest/complete_habit/log_mood actions"
```

---

### Task 4: `app.js` — confirm-first actions (add_quest, add_habit)

**Files:**
- Modify: `app.js:2563-2571` (`mascotChatHtml`), add two new functions `sageConfirmAction`/`sageCancelAction`
- Test: `test-ui.js` (add cases after Task 3's block)

**Interfaces:**
- Consumes: `mascotChatLog` entries that may carry `pendingAction:{type,params}` (produced by Task 3's `sageSend`), `SAGE_ACTION_TIERS`, `sageApplyAction(type,params)`, `esc()` (pre-existing HTML-escape helper).
- Produces: `sageConfirmAction(rowIndex)`, `sageCancelAction(rowIndex)` — both resolve the pending action on `mascotChatLog[rowIndex]` and re-render the chat bubble. No other task depends on these (they're wired directly to onclick handlers in the rendered HTML).

- [ ] **Step 1: Write the failing tests**

In `test-ui.js`, immediately after Task 3's block (after the `w.toggleMascot(false);` line added in Task 3), add:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node test-ui.js`
Expected: `FAIL` — `document.querySelector('.mchat-action')` is `null` because `mascotChatHtml` doesn't render pending-action cards yet, and `sageConfirmAction`/`sageCancelAction` don't exist.

- [ ] **Step 3: Implement the card rendering and confirm/cancel handlers**

In `app.js`, replace:

```js
function mascotChatHtml(){
  var rows=mascotChatLog.map(function(m){
    return '<div class="mchat-row '+m.who+'">'+esc(m.text)+'</div>';
  }).join('') || '<div class="hint" style="text-align:center;margin-top:10px">Ask Sage about your quests, habits, or how to catch up today.</div>';
  return '<div class="mhead"><button class="btn ghost small" aria-label="Back" onclick="toggleMascot(true)">◀</button><b>🦉 Sage</b><button class="btn ghost small" aria-label="Close" onclick="toggleMascot(false)">✕</button></div>'+
    '<div class="mchat-log" id="mChatLog">'+rows+(mascotChatBusy?'<div class="mchat-row sage typing">…</div>':'')+'</div>'+
    '<div class="mchat-input"><input id="mChatInput" maxlength="500" placeholder="Ask Sage…" '+(mascotChatBusy?'disabled':'')+' onkeydown="if(event.key===\'Enter\')sageSend()">'+
    '<button class="btn go small" '+(mascotChatBusy?'disabled':'')+' onclick="sageSend()">Send</button></div>';
}
```

with:

```js
function mascotChatHtml(){
  var rows=mascotChatLog.map(function(m,i){
    var body=m.text?esc(m.text):'';
    if(m.pendingAction){
      var p=m.pendingAction, label=(p.type==='add_quest'?'Add quest: "':'Add habit: "')+esc(String(p.params.title||''))+'"';
      body+='<div class="mchat-action"><div>'+label+'</div>'+
        '<button class="btn go small" onclick="sageConfirmAction('+i+')">Yes, add it</button>'+
        '<button class="btn ghost small" onclick="sageCancelAction('+i+')">Cancel</button></div>';
    }
    return '<div class="mchat-row '+m.who+'">'+body+'</div>';
  }).join('') || '<div class="hint" style="text-align:center;margin-top:10px">Ask Sage about your quests, habits, or how to catch up today.</div>';
  return '<div class="mhead"><button class="btn ghost small" aria-label="Back" onclick="toggleMascot(true)">◀</button><b>🦉 Sage</b><button class="btn ghost small" aria-label="Close" onclick="toggleMascot(false)">✕</button></div>'+
    '<div class="mchat-log" id="mChatLog">'+rows+(mascotChatBusy?'<div class="mchat-row sage typing">…</div>':'')+'</div>'+
    '<div class="mchat-input"><input id="mChatInput" maxlength="500" placeholder="Ask Sage…" '+(mascotChatBusy?'disabled':'')+' onkeydown="if(event.key===\'Enter\')sageSend()">'+
    '<button class="btn go small" '+(mascotChatBusy?'disabled':'')+' onclick="sageSend()">Send</button></div>';
}
function sageConfirmAction(i){
  var m=mascotChatLog[i]; if(!m||!m.pendingAction) return;
  var applied=sageApplyAction(m.pendingAction.type, m.pendingAction.params);
  m.pendingAction=null;
  m.text=(m.text?m.text+'\n\n':'')+(applied?'Done!':'Could not add that.');
  var b=document.getElementById('mBubble'); if(b) b.innerHTML=mascotChatHtml();
}
function sageCancelAction(i){
  var m=mascotChatLog[i]; if(!m||!m.pendingAction) return;
  m.pendingAction=null;
  m.text=(m.text?m.text+'\n\n':'')+'Cancelled.';
  var b=document.getElementById('mBubble'); if(b) b.innerHTML=mascotChatHtml();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node test-ui.js`
Expected: all cases pass, `0 failed`.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: `0 failed` across all three suites.

- [ ] **Step 6: Commit**

```bash
git add app.js test-ui.js
git commit -m "Sage: confirm-first cards for add_quest/add_habit"
```

---

### Task 5: End-to-end live verification

**Files:** none (verification only, no code changes expected unless a bug surfaces — if one does, fix it in the relevant file from Tasks 1-4 and re-run this task's checks).

**Interfaces:**
- Consumes: everything from Tasks 1-4 running together against the real deployed Edge Function.
- Produces: nothing — this is the final confirmation that closes out the plan.

- [ ] **Step 1: Run the full automated suite one more time**

Run: `npm test`
Expected: `0 failed` across `test.js`, `test-cloud.js`, `test-ui.js`.

- [ ] **Step 2: Start the local static server and open the app**

Start the `scalemylife-static` preview server (or equivalent local static server serving this repo on port 8123) and open `http://localhost:8123` in a browser, signed in to cloud sync.

- [ ] **Step 3: Manually verify each action live against the real Edge Function**

Open Sage and, one at a time, send messages designed to trigger each action, confirming against the actual app UI (not just the chat bubble) that the underlying state changed:

- "Mark [an actual quest title from today's list] as done" → the quest's Clear button disappears / it shows completed in the Today view, with no confirm card shown in chat.
- "I checked off [an actual habit title]" → the habit shows done for today in the Habits view.
- "I'm feeling great today, log that" → the Journal shows today's mood as Great.
- "Add a quest to [something new]" → a confirm card appears in chat; tapping **Yes, add it** makes it appear in the Quests view; tapping **Cancel** on a second attempt confirms nothing is added.
- "Add a habit to [something new]" → same confirm/cancel check, verified in the Habits view.

Expected: all five behave as described, and a normal question with no action intent (e.g. "how am I doing today?") still gets a plain text reply with no action attempted.

- [ ] **Step 4: Check Edge Function logs for errors**

Load the Supabase edge-function logs tool for project `rbhjqvfuvzpqrxmvfimd`, service `edge-function` (via ToolSearch if not already loaded), covering the time window of the manual test above.
Expected: no unhandled errors (a 400/401/429 from intentionally testing edge cases is fine; an uncaught exception is not — if found, fix it in `supabase/functions/sage-chat/index.ts` and redeploy before considering this task done).
