import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { createHmac, timingSafeEqual } from "node:crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BOT_TOKEN = Deno.env.get("BOT_TOKEN") ?? "";
const AUTH_MAX_AGE_SECONDS = 86400; // 24 hours

function verifyInitData(initData: string, botToken: string): { valid: boolean; data: Record<string, string> } {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { valid: false, data: {} };
  params.delete("hash");

  const sorted: string[] = [];
  const entries = Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b));
  for (const [key, value] of entries) {
    sorted.push(`${key}=${value}`);
  }
  const dataCheckString = sorted.join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const computedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const hashBuffer = Buffer.from(hash, "hex");
  const computedBuffer = Buffer.from(computedHash, "hex");
  if (hashBuffer.length !== computedBuffer.length) return { valid: false, data: {} };

  if (!timingSafeEqual(hashBuffer, computedBuffer)) return { valid: false, data: {} };

  const authDate = parseInt(params.get("auth_date") ?? "0", 10);
  const now = Math.floor(Date.now() / 1000);
  if (now - authDate > AUTH_MAX_AGE_SECONDS) return { valid: false, data: {} };

  const data: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    data[key] = value;
  }
  return { valid: true, data };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { initData, refStart } = body;

    if (!initData) {
      return new Response(JSON.stringify({ error: "Missing initData" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!BOT_TOKEN) {
      return new Response(JSON.stringify({ error: "Server not configured" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { valid, data } = verifyInitData(initData, BOT_TOKEN);
    if (!valid) {
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let telegramUser: { id: number; username?: string; first_name?: string; last_name?: string; photo_url?: string };
    try {
      telegramUser = JSON.parse(data.user);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid user data" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: result, error } = await supabase.rpc("upsert_telegram_user", {
      p_telegram_id: telegramUser.id,
      p_username: telegramUser.username ?? null,
      p_first_name: telegramUser.first_name ?? null,
      p_last_name: telegramUser.last_name ?? null,
      p_photo_url: telegramUser.photo_url ?? null,
      p_ref_start: refStart ?? null,
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = result as { user: Record<string, unknown>; is_new: boolean };

    return new Response(JSON.stringify({
      user: parsed.user,
      is_new: parsed.is_new,
      session_token: crypto.randomUUID(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
