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
const MODEL = "claude-haiku-4-5-20251001";

function corsHeaders(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://scale-my-life.vercel.app";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, content-type",
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
  they can do in the app or their day).`;

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

    let body: { message?: string; brief?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "invalid request body" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const message = String(body.message || "").trim().slice(0, MAX_MESSAGE_LEN);
    const brief = String(body.brief || "").trim().slice(0, MAX_BRIEF_LEN);
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
    if (!aiRes.ok) {
      return new Response(JSON.stringify({ error: "Sage is dozing - try again in a moment" }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const aiJson = await aiRes.json();
    const reply = aiJson?.content?.[0]?.text || "Hoo? I lost my train of thought - ask me again?";
    return new Response(JSON.stringify({ reply, remaining: Math.max(0, DAILY_LIMIT - count) }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: "something went wrong" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
