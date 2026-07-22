// Sage Phase 2: real conversational chat, server-side only.
// The Anthropic key never reaches the client - this function holds it as a
// Supabase secret, validates the caller's Supabase session, rate-limits per
// user/day via public.sage_usage, then proxies one turn to Claude.
//
// Deployed via the Supabase MCP / dashboard, not the Supabase CLI (this repo
// has no local Supabase project link - see supabase/sage.sql for the schema
// this depends on). Kept here for version control; redeploy after any edit.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://scale-my-life.vercel.app",
  "http://localhost:8123",
  "http://127.0.0.1:8123",
]);
const DAILY_LIMIT = 30;
const MAX_MESSAGE_LEN = 500;
const MAX_BRIEF_LEN = 800;
const MAX_TODAY_LEN = 1200;
const MAX_HISTORY = 20;
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

function corsHeaders(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://scale-my-life.vercel.app";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, content-type, apikey",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

const SYSTEM_PROMPT = `You are Sage, an owl mentor inside ScaleMyLife - a free app that turns real
life into an RPG. The user earns XP and coins for real quests, habits and
focus sessions; a broken streak can be mended before midnight; being downed
from bad habits is a temporary setback, never a permanent loss.

Voice rules (non-negotiable):
- Never use an em-dash (—) anywhere in your reply.
- Never use the sword emoji (⚔).
- Warm, brief, second person, a little playful. 2-4 sentences unless the
  user clearly wants more detail.
- You may reference the user's current state (given below) but do not
  invent numbers you were not given.
- You are a supportive companion for their real habits and goals, not a
  general-purpose assistant - gently redirect anything far outside that
  (e.g. don't give financial, legal or medical advice; suggest they talk to
  a real professional for that, then bring it back to something concrete
  they can do in the app or their day).

Acting on the user's list (non-negotiable):
- The user's current quests and habits for today are given to you each turn in
  the context block under "Today", each as "quest <id>: <title>" or
  "habit <id>: <title>". That IS the list you can see - treat it as
  authoritative and never say you cannot see their list.
- Match the user's wording to that list flexibly: case-insensitive, partial and
  fuzzy matches count (e.g. "workout" matches "Workout / walk 30 min"). If
  exactly one item is a reasonable match, act on it using its id rather than
  asking which one.
- Prefer taking the action over asking a clarifying question. Only ask when you
  genuinely cannot tell which item the user means or a required detail is
  missing.
- The conversation so far is included above - use it. If you asked something
  last turn and the user answers briefly ("check it off", "yes", "1",
  "create it", "looks good"), apply that answer in context. Do not start over
  or ask the same thing again.

Tool use rules (non-negotiable):
- Only call complete_quest or complete_habit with an id that appears in the
  Today list this turn. Never invent an id.
- To create something new, CALL add_quest or add_habit - do not describe a
  proposal in prose and ask "does this look good?". Calling the tool shows the
  user a confirm card with Yes/Cancel, which IS the confirmation step. Fill in
  a sensible title (plus difficulty for a quest, or weekly target for a habit)
  from what the user said.
- Call log_mood when the user tells you how they're feeling today in a way that
  reads as wanting it logged.
- Call at most one tool per reply. If nothing the user said calls for an
  action, just reply normally with no tool call.`;

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405, headers: { ...cors, "Content-Type": "application/json" } });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: "Sage is not configured yet - missing ANTHROPIC_API_KEY" }), { status: 503, headers: { ...cors, "Content-Type": "application/json" } });
    }

    // identify the caller from their own JWT (verify_jwt=true already gated
    // access; this recovers the user id/email for rate limiting)
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "not signed in" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const userId = userData.user.id;

    let body: { message?: string; brief?: string; today?: string; history?: unknown };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "invalid request body" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const message = String(body.message || "").trim().slice(0, MAX_MESSAGE_LEN);
    const brief = String(body.brief || "").trim().slice(0, MAX_BRIEF_LEN);
    const todayIds = String(body.today || "").trim().slice(0, MAX_TODAY_LEN);
    if (!message) {
      return new Response(JSON.stringify({ error: "empty message" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    // rate limit: one atomic increment via service role, no read-then-write race
    const admin = createClient(supabaseUrl, serviceKey);
    const today = new Date().toISOString().slice(0, 10);
    const { data: count, error: usageErr } = await admin.rpc("increment_sage_usage", { p_user_id: userId, p_day: today });
    if (usageErr) {
      return new Response(JSON.stringify({ error: "could not check today's chat limit" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    }
    if (count > DAILY_LIMIT) {
      return new Response(JSON.stringify({ error: "Sage needs to rest - you have reached today's chat limit. Back tomorrow!" }), { status: 429, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const context = [
      brief ? `Current state: ${brief}` : "",
      todayIds ? `Today (ids you may act on): ${todayIds}` : "",
    ].filter(Boolean).join("\n");
    const userContent = context ? `[${context}]\n\n${message}` : message;

    // Prior turns give Sage conversational memory across a multi-step request
    // (e.g. it asks which quest, the user answers "the workout one"). Sanitize
    // hard: only user/assistant roles, non-empty string content, enforce
    // alternation, cap length. The client sends plain-text turns only (no
    // tool_use blocks), so there is never an orphaned tool_use to satisfy.
    const rawHistory = Array.isArray(body.history) ? body.history : [];
    const history: Array<{ role: "user" | "assistant"; content: string }> = [];
    for (const h of rawHistory) {
      const role = h && (h.role === "user" || h.role === "assistant") ? h.role : null;
      const content = h && typeof h.content === "string" ? h.content.trim().slice(0, MAX_MESSAGE_LEN) : "";
      if (!role || !content) continue;
      if (history.length && history[history.length - 1].role === role) continue; // keep alternation
      history.push({ role, content });
    }
    const trimmed = history.slice(-MAX_HISTORY);
    while (trimmed.length && trimmed[0].role !== "user") trimmed.shift(); // must start with a user turn
    if (trimmed.length && trimmed[trimmed.length - 1].role === "user") trimmed.pop(); // this turn's message is the user turn we append
    const messages = [...trimmed, { role: "user", content: userContent }];

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
        messages,
      }),
    });
    if (!aiRes.ok) {
      return new Response(JSON.stringify({ error: "Sage is dozing - try again in a moment" }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
    }
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
  } catch (e) {
    return new Response(JSON.stringify({ error: "something went wrong" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
