import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const ADMIN_TELEGRAM_ID = "5419054691";

interface AuthUser {
  id: string;
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  balance: number;
  total_withdrawn: number;
  ads_watched: number;
  tasks_completed: number;
  mining_count: number;
  usdt_wallet: string | null;
  referred_by: string | null;
  referral_code: string;
  status: string;
  balance_frozen: boolean;
  risk_score: number;
  last_mining_at: string | null;
  last_ad_at: string | null;
  last_daily_bonus_at: string | null;
  daily_bonus_day: number;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

async function authenticate(req: Request): Promise<AuthUser | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const token = authHeader.replace("Bearer ", "");
  if (!token) return null;

  const supabase = getSupabase();
  // Token is the user's UUID (from auth function)
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", token)
    .maybeSingle();

  if (error || !data) return null;
  return data as AuthUser;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api/, "") || "/";
  const method = req.method;

  try {
    // ---- Public routes ----
    if (path === "/settings" && method === "GET") {
      const supabase = getSupabase();
      const { data, error } = await supabase.from("system_settings").select("*").eq("id", 1).maybeSingle();
      if (error || !data) return json({ error: "Settings not found" }, 500);
      return json(data);
    }

    if (path === "/leaderboard" && method === "GET") {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("users")
        .select("id, username, first_name, photo_url, balance, mining_count, ads_watched, tasks_completed")
        .order("balance", { ascending: false })
        .limit(50);
      if (error) return json({ error: error.message }, 500);
      return json(data);
    }

    // ---- Authenticated routes ----
    const user = await authenticate(req);
    if (!user) return json({ error: "Unauthorized" }, 401);

    if (user.status === "banned") return json({ error: "Your account has been banned" }, 403);

    const supabase = getSupabase();

    // ---- User profile ----
    if (path === "/me" && method === "GET") {
      return json(user);
    }

    if (path === "/me/wallet" && method === "POST") {
      const body = await req.json();
      if (!body.wallet_address || typeof body.wallet_address !== "string") {
        return json({ error: "Wallet address required" }, 400);
      }
      const { error } = await supabase
        .from("users")
        .update({ usdt_wallet: body.wallet_address, updated_at: new Date().toISOString() })
        .eq("id", user.id);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    // ---- Mining ----
    if (path === "/mining/active" && method === "GET") {
      const { data, error } = await supabase
        .from("mining_sessions")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "ACTIVE")
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      return json(data ?? null);
    }

    if (path === "/mining/start" && method === "POST") {
      if (user.status === "suspended") return json({ error: "Account suspended" }, 403);
      const { data, error } = await supabase.rpc("start_mining", { p_user_id: user.id });
      if (error) return json({ error: error.message }, 500);
      const result = data as { error?: string; session?: Record<string, unknown> };
      if (result?.error) return json({ error: result.error }, 400);
      return json(result);
    }

    if (path === "/mining/claim" && method === "POST") {
      if (user.status === "suspended") return json({ error: "Account suspended" }, 403);
      const body = await req.json();
      if (!body.session_id) return json({ error: "Session ID required" }, 400);
      const { data, error } = await supabase.rpc("claim_mining", {
        p_user_id: user.id,
        p_session_id: body.session_id,
      });
      if (error) return json({ error: error.message }, 500);
      const result = data as { error?: string; reward?: number; new_balance?: number };
      if (result?.error) return json({ error: result.error }, 400);
      return json(result);
    }

    // ---- Ads ----
    if (path === "/ads" && method === "GET") {
      const { data, error } = await supabase
        .from("ads")
        .select("*")
        .eq("status", "active")
        .order("priority", { ascending: false });
      if (error) return json({ error: error.message }, 500);
      return json(data);
    }

    if (path === "/ads/complete" && method === "POST") {
      if (user.status === "suspended") return json({ error: "Account suspended" }, 403);
      const body = await req.json();
      if (!body.ad_id) return json({ error: "Ad ID required" }, 400);

      // Check daily limit
      const { data: ad } = await supabase.from("ads").select("*").eq("id", body.ad_id).maybeSingle();
      if (!ad) return json({ error: "Ad not found" }, 404);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { count } = await supabase
        .from("ad_views")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", today.toISOString());

      if (ad.daily_limit > 0 && (count ?? 0) >= ad.daily_limit) {
        return json({ error: "Daily ad limit reached" }, 400);
      }

      // Check cooldown
      if (user.last_ad_at) {
        const elapsed = (Date.now() - new Date(user.last_ad_at).getTime()) / 1000;
        if (elapsed < ad.cooldown_seconds) {
          return json({ error: `Cooldown: wait ${Math.ceil(ad.cooldown_seconds - elapsed)}s` }, 400);
        }
      }

      const verificationId = crypto.randomUUID();
      const { data, error } = await supabase.rpc("complete_ad_view", {
        p_user_id: user.id,
        p_ad_id: body.ad_id,
        p_network: ad.network,
        p_reward: ad.reward,
        p_verification_id: verificationId,
      });
      if (error) return json({ error: error.message }, 500);
      const result = data as { error?: string; reward?: number; new_balance?: number; milestones?: unknown[] };
      if (result?.error) return json({ error: result.error }, 400);
      return json(result);
    }

    // ---- Tasks ----
    if (path === "/tasks" && method === "GET") {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("enabled", true)
        .order("created_at", { ascending: true });
      if (error) return json({ error: error.message }, 500);
      // Also get user's completions
      const { data: completions } = await supabase
        .from("task_completions")
        .select("task_id")
        .eq("user_id", user.id);
      const completedIds = (completions ?? []).map((c: { task_id: string }) => c.task_id);
      return json({ tasks: data ?? [], completed: completedIds });
    }

    if (path === "/tasks/start" && method === "POST") {
      if (user.status === "suspended") return json({ error: "Account suspended" }, 403);
      const body = await req.json();
      if (!body.task_id) return json({ error: "Task ID required" }, 400);

      const { data: task } = await supabase.from("tasks").select("*").eq("id", body.task_id).maybeSingle();
      if (!task) return json({ error: "Task not found" }, 404);

      // Check if already completed
      const { data: existing } = await supabase
        .from("task_completions")
        .select("id")
        .eq("user_id", user.id)
        .eq("task_id", body.task_id)
        .maybeSingle();
      if (existing) return json({ error: "Task already completed" }, 400);

      const eligibleAt = new Date(Date.now() + task.duration_seconds * 1000);
      const { data: session, error } = await supabase
        .from("task_sessions")
        .insert({
          user_id: user.id,
          task_id: body.task_id,
          started_at: new Date().toISOString(),
          eligible_at: eligibleAt.toISOString(),
          status: "ACTIVE",
        })
        .select("*")
        .single();
      if (error) return json({ error: error.message }, 500);
      return json(session);
    }

    if (path === "/tasks/claim" && method === "POST") {
      if (user.status === "suspended") return json({ error: "Account suspended" }, 403);
      const body = await req.json();
      if (!body.session_id) return json({ error: "Session ID required" }, 400);

      const { data: session } = await supabase
        .from("task_sessions")
        .select("*")
        .eq("id", body.session_id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!session) return json({ error: "Session not found" }, 404);
      if (session.status === "CLAIMED") return json({ error: "Already claimed" }, 400);

      if (new Date() < new Date(session.eligible_at)) {
        return json({ error: "Timer not complete" }, 400);
      }

      const { data: task } = await supabase.from("tasks").select("*").eq("id", session.task_id).maybeSingle();
      if (!task) return json({ error: "Task not found" }, 404);

      const { data, error } = await supabase.rpc("complete_task", {
        p_user_id: user.id,
        p_task_id: session.task_id,
        p_reward: task.reward,
      });
      if (error) return json({ error: error.message }, 500);
      const result = data as { error?: string; reward?: number; new_balance?: number };
      if (result?.error) return json({ error: result.error }, 400);

      await supabase.from("task_sessions").update({ status: "CLAIMED" }).eq("id", session.id);

      return json(result);
    }

    // ---- Daily Bonus ----
    if (path === "/daily-bonus/claim" && method === "POST") {
      if (user.status === "suspended") return json({ error: "Account suspended" }, 403);
      const { data, error } = await supabase.rpc("claim_daily_bonus", { p_user_id: user.id });
      if (error) return json({ error: error.message }, 500);
      const result = data as { error?: string; day?: number; reward?: number; new_balance?: number };
      if (result?.error) return json({ error: result.error }, 400);
      return json(result);
    }

    // ---- Reward Code ----
    if (path === "/reward-code/redeem" && method === "POST") {
      if (user.status === "suspended") return json({ error: "Account suspended" }, 403);
      const body = await req.json();
      if (!body.code) return json({ error: "Code required" }, 400);
      const { data, error } = await supabase.rpc("redeem_reward_code", {
        p_user_id: user.id,
        p_code: body.code,
      });
      if (error) return json({ error: error.message }, 500);
      const result = data as { error?: string; reward?: number; new_balance?: number };
      if (result?.error) return json({ error: result.error }, 400);
      return json(result);
    }

    // ---- Withdrawals ----
    if (path === "/withdrawals" && method === "GET") {
      const { data, error } = await supabase
        .from("withdrawals")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) return json({ error: error.message }, 500);
      return json(data);
    }

    if (path === "/withdrawals/create" && method === "POST") {
      if (user.status === "suspended") return json({ error: "Account suspended" }, 403);
      const body = await req.json();
      if (!body.amount_pilot || !body.wallet_address) {
        return json({ error: "Amount and wallet address required" }, 400);
      }
      const amount = parseFloat(body.amount_pilot);
      if (isNaN(amount) || amount <= 0) return json({ error: "Invalid amount" }, 400);
      const { data, error } = await supabase.rpc("create_withdrawal", {
        p_user_id: user.id,
        p_amount_pilot: amount,
        p_wallet_address: body.wallet_address,
      });
      if (error) return json({ error: error.message }, 500);
      const result = data as { error?: string; withdrawal?: Record<string, unknown>; new_balance?: number };
      if (result?.error) return json({ error: result.error }, 400);
      return json(result);
    }

    // ---- Transactions ----
    if (path === "/transactions" && method === "GET") {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) return json({ error: error.message }, 500);
      return json(data);
    }

    // ---- Referrals ----
    if (path === "/referrals" && method === "GET") {
      const { data: referrals, error } = await supabase
        .from("referrals")
        .select(`
          id,
          created_at,
          join_reward_paid,
          day1_reward_paid,
          day2_reward_paid,
          referred:users!referrals_referred_id_fkey(id, username, first_name, photo_url, created_at)
        `)
        .eq("referrer_id", user.id)
        .order("created_at", { ascending: false });
      if (error) return json({ error: error.message }, 500);
      return json(referrals);
    }

    // ---- Notifications ----
    if (path === "/notifications" && method === "GET") {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) return json({ error: error.message }, 500);
      return json(data);
    }

    if (path === "/notifications/read" && method === "POST") {
      const { error } = await supabase
        .from("notifications")
        .update({ read: true })
        .eq("user_id", user.id)
        .eq("read", false);
      if (error) return json({ error: error.message }, 500);
      return json({ success: true });
    }

    return json({ error: "Not found" }, 404);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
});
