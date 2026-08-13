import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const ADMIN_TELEGRAM_ID = "5419054691";

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

async function authenticateAdmin(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  if (!token) return false;

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("users")
    .select("telegram_id, status")
    .eq("id", token)
    .maybeSingle();

  if (error || !data) return false;
  return String(data.telegram_id) === ADMIN_TELEGRAM_ID;
}

function logAudit(supabase: ReturnType<typeof getSupabase>, action: string, adminId: string, details: Record<string, unknown>, targetUser?: string) {
  return supabase.from("audit_logs").insert({
    admin_id: adminId,
    action,
    target_user: targetUser ?? null,
    details,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/admin/, "") || "/";
    const method = req.method;

    // ---- Admin auth ----
    if (path === "/auth" && method === "POST") {
      const body = await req.json();
      const { telegram_id } = body;
      if (String(telegram_id) !== ADMIN_TELEGRAM_ID) {
        return json({ error: "Forbidden" }, 403);
      }
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("telegram_id", telegram_id)
        .maybeSingle();
      if (error || !data) return json({ error: "Admin user not found. Please open the Mini App first." }, 404);
      return json({ admin: true, user: data, token: data.id });
    }

    const isAdmin = await authenticateAdmin(req);
    if (!isAdmin) return json({ error: "Forbidden" }, 403);

    const supabase = getSupabase();
    const adminId = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";

    // ---- Dashboard stats ----
    if (path === "/stats" && method === "GET") {
      const { count: totalUsers } = await supabase.from("users").select("*", { count: "exact", head: true });
      const { count: activeUsers } = await supabase.from("users").select("*", { count: "exact", head: true }).eq("status", "active");
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const { count: newToday } = await supabase.from("users").select("*", { count: "exact", head: true }).gte("created_at", today.toISOString());
      const { count: activeMining } = await supabase.from("mining_sessions").select("*", { count: "exact", head: true }).eq("status", "ACTIVE");
      const { count: adsToday } = await supabase.from("ad_views").select("*", { count: "exact", head: true }).gte("created_at", today.toISOString());
      const { count: tasksToday } = await supabase.from("task_completions").select("*", { count: "exact", head: true }).gte("created_at", today.toISOString());
      const { count: referralsToday } = await supabase.from("referrals").select("*", { count: "exact", head: true }).gte("created_at", today.toISOString());
      const { count: pendingWd } = await supabase.from("withdrawals").select("*", { count: "exact", head: true }).eq("status", "PENDING");
      const { count: suspended } = await supabase.from("users").select("*", { count: "exact", head: true }).eq("status", "suspended");
      const { data: totalWithdrawnData } = await supabase.from("withdrawals").select("amount_usdt").eq("status", "PAID");
      const totalWithdrawn = (totalWithdrawnData ?? []).reduce((sum: number, w: { amount_usdt: number }) => sum + Number(w.amount_usdt), 0);
      const { data: pilotIssuedData } = await supabase.from("transactions").select("amount").gte("created_at", today.toISOString());
      const pilotIssued = (pilotIssuedData ?? []).filter((t: { amount: number }) => Number(t.amount) > 0).reduce((sum: number, t: { amount: number }) => sum + Number(t.amount), 0);
      const { count: suspicious } = await supabase.from("users").select("*", { count: "exact", head: true }).gte("risk_score", 61);

      return json({
        total_users: totalUsers ?? 0,
        active_users: activeUsers ?? 0,
        new_users_today: newToday ?? 0,
        active_mining: activeMining ?? 0,
        ads_today: adsToday ?? 0,
        tasks_today: tasksToday ?? 0,
        referrals_today: referralsToday ?? 0,
        pending_withdrawals: pendingWd ?? 0,
        suspended_users: suspended ?? 0,
        suspicious_users: suspicious ?? 0,
        total_withdrawn: totalWithdrawn,
        pilot_issued_today: pilotIssued,
      });
    }

    // ---- Users ----
    if (path === "/users" && method === "GET") {
      const search = url.searchParams.get("search");
      let query = supabase.from("users").select("*").order("created_at", { ascending: false }).limit(100);
      if (search) {
        query = query.or(`username.ilike.%${search}%,first_name.ilike.%${search}%,referral_code.ilike.%${search}%,telegram_id.eq.${search}`);
      }
      const { data, error } = await query;
      if (error) return json({ error: error.message }, 500);
      return json(data);
    }

    if (path === "/users/update" && method === "POST") {
      const body = await req.json();
      const { user_id, updates } = body;
      const { data, error } = await supabase.from("users").update(updates).eq("id", user_id).select("*").maybeSingle();
      if (error) return json({ error: error.message }, 500);
      await logAudit(supabase, "ADMIN_UPDATE_USER", adminId, { user_id, updates }, user_id);
      return json(data);
    }

    if (path === "/users/balance" && method === "POST") {
      const body = await req.json();
      const { user_id, amount, type } = body;
      if (type === "add") {
        const { error } = await supabase.rpc("credit_balance", {
          p_user_id: user_id, p_type: "ADMIN_ADJUSTMENT", p_amount: amount, p_metadata: { admin: adminId },
        });
        if (error) return json({ error: error.message }, 500);
      } else {
        const { error } = await supabase.rpc("debit_balance", {
          p_user_id: user_id, p_type: "ADMIN_ADJUSTMENT", p_amount: amount, p_metadata: { admin: adminId },
        });
        if (error) return json({ error: error.message }, 500);
      }
      await logAudit(supabase, "ADMIN_ADJUST_BALANCE", adminId, { user_id, amount, type }, user_id);
      return json({ success: true });
    }

    // ---- Withdrawals ----
    if (path === "/withdrawals" && method === "GET") {
      const status = url.searchParams.get("status");
      let query = supabase.from("withdrawals").select("*, user:users!withdrawals_user_id_fkey(username, first_name, telegram_id)").order("created_at", { ascending: false });
      if (status) query = query.eq("status", status);
      const { data, error } = await query;
      if (error) return json({ error: error.message }, 500);
      return json(data);
    }

    if (path === "/withdrawals/update" && method === "POST") {
      const body = await req.json();
      const { withdrawal_id, status, tx_hash, explorer_url, note } = body;
      const { data, error } = await supabase.rpc("update_withdrawal_status", {
        p_withdrawal_id: withdrawal_id,
        p_status: status,
        p_admin_id: adminId,
        p_tx_hash: tx_hash ?? null,
        p_explorer_url: explorer_url ?? null,
        p_note: note ?? null,
      });
      if (error) return json({ error: error.message }, 500);
      const result = data as { error?: string };
      if (result?.error) return json({ error: result.error }, 400);
      await logAudit(supabase, `ADMIN_WITHDRAWAL_${status}`, adminId, { withdrawal_id, tx_hash, note });
      return json(result);
    }

    // ---- Tasks management ----
    if (path === "/tasks" && method === "GET") {
      const { data, error } = await supabase.from("tasks").select("*").order("created_at", { ascending: false });
      if (error) return json({ error: error.message }, 500);
      return json(data);
    }

    if (path === "/tasks/create" && method === "POST") {
      const body = await req.json();
      const { data, error } = await supabase.from("tasks").insert(body).select("*").single();
      if (error) return json({ error: error.message }, 500);
      await logAudit(supabase, "ADMIN_CREATE_TASK", adminId, { task: body });
      return json(data);
    }

    if (path === "/tasks/update" && method === "POST") {
      const body = await req.json();
      const { task_id, updates } = body;
      const { data, error } = await supabase.from("tasks").update(updates).eq("id", task_id).select("*").maybeSingle();
      if (error) return json({ error: error.message }, 500);
      await logAudit(supabase, "ADMIN_EDIT_TASK", adminId, { task_id, updates });
      return json(data);
    }

    if (path === "/tasks/delete" && method === "POST") {
      const body = await req.json();
      const { error } = await supabase.from("tasks").delete().eq("id", body.task_id);
      if (error) return json({ error: error.message }, 500);
      await logAudit(supabase, "ADMIN_DELETE_TASK", adminId, { task_id: body.task_id });
      return json({ success: true });
    }

    // ---- Ads management ----
    if (path === "/ads" && method === "GET") {
      const { data, error } = await supabase.from("ads").select("*").order("created_at", { ascending: false });
      if (error) return json({ error: error.message }, 500);
      return json(data);
    }

    if (path === "/ads/create" && method === "POST") {
      const body = await req.json();
      const { data, error } = await supabase.from("ads").insert(body).select("*").single();
      if (error) return json({ error: error.message }, 500);
      await logAudit(supabase, "ADMIN_CREATE_AD", adminId, { ad: body });
      return json(data);
    }

    if (path === "/ads/update" && method === "POST") {
      const body = await req.json();
      const { ad_id, updates } = body;
      const { data, error } = await supabase.from("ads").update(updates).eq("id", ad_id).select("*").maybeSingle();
      if (error) return json({ error: error.message }, 500);
      await logAudit(supabase, "ADMIN_EDIT_AD", adminId, { ad_id, updates });
      return json(data);
    }

    if (path === "/ads/delete" && method === "POST") {
      const body = await req.json();
      const { error } = await supabase.from("ads").delete().eq("id", body.ad_id);
      if (error) return json({ error: error.message }, 500);
      await logAudit(supabase, "ADMIN_DELETE_AD", adminId, { ad_id: body.ad_id });
      return json({ success: true });
    }

    // ---- Reward codes ----
    if (path === "/reward-codes" && method === "GET") {
      const { data, error } = await supabase.from("reward_codes").select("*").order("created_at", { ascending: false });
      if (error) return json({ error: error.message }, 500);
      return json(data);
    }

    if (path === "/reward-codes/create" && method === "POST") {
      const body = await req.json();
      const { data, error } = await supabase.from("reward_codes").insert({
        code: body.code.toUpperCase(),
        reward: body.reward,
        max_uses: body.max_uses ?? 0,
        per_user_limit: body.per_user_limit ?? 1,
        expires_at: body.expires_at ?? null,
        status: "active",
      }).select("*").single();
      if (error) return json({ error: error.message }, 500);
      await logAudit(supabase, "ADMIN_CREATE_REWARD_CODE", adminId, { code: body.code });
      return json(data);
    }

    if (path === "/reward-codes/delete" && method === "POST") {
      const body = await req.json();
      const { error } = await supabase.from("reward_codes").delete().eq("id", body.code_id);
      if (error) return json({ error: error.message }, 500);
      await logAudit(supabase, "ADMIN_DELETE_REWARD_CODE", adminId, { code_id: body.code_id });
      return json({ success: true });
    }

    // ---- Settings ----
    if (path === "/settings" && method === "GET") {
      const { data, error } = await supabase.from("system_settings").select("*").eq("id", 1).maybeSingle();
      if (error) return json({ error: error.message }, 500);
      return json(data);
    }

    if (path === "/settings/update" && method === "POST") {
      const body = await req.json();
      const { updates } = body;
      updates.updated_at = new Date().toISOString();
      const { data, error } = await supabase.from("system_settings").update(updates).eq("id", 1).select("*").maybeSingle();
      if (error) return json({ error: error.message }, 500);
      await logAudit(supabase, "ADMIN_CHANGE_SETTINGS", adminId, { updates });
      return json(data);
    }

    // ---- Transactions ----
    if (path === "/transactions" && method === "GET") {
      const { data, error } = await supabase.from("transactions").select("*, user:users!transactions_user_id_fkey(username, first_name)").order("created_at", { ascending: false }).limit(100);
      if (error) return json({ error: error.message }, 500);
      return json(data);
    }

    // ---- Audit logs ----
    if (path === "/audit-logs" && method === "GET") {
      const { data, error } = await supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(100);
      if (error) return json({ error: error.message }, 500);
      return json(data);
    }

    // ---- Broadcast ----
    if (path === "/broadcast" && method === "POST") {
      const body = await req.json();
      const { message, audience } = body;
      let query = supabase.from("users").select("id");
      if (audience === "active") query = query.eq("status", "active");
      if (audience === "mining") {
        const { data: miningUsers } = await supabase.from("mining_sessions").select("user_id").eq("status", "ACTIVE");
        const userIds = [...new Set((miningUsers ?? []).map((m: { user_id: string }) => m.user_id))];
        if (userIds.length === 0) return json({ sent: 0 });
        const { data: users } = await supabase.from("users").select("id").in("id", userIds);
        for (const u of users ?? []) {
          await supabase.from("notifications").insert({ user_id: u.id, type: "SYSTEM_ANNOUNCEMENT", title: "Broadcast", message });
        }
        await logAudit(supabase, "ADMIN_BROADCAST", adminId, { audience, message });
        return json({ sent: (users ?? []).length });
      }
      const { data: users } = await query;
      for (const u of users ?? []) {
        await supabase.from("notifications").insert({ user_id: u.id, type: "SYSTEM_ANNOUNCEMENT", title: "Broadcast", message });
      }
      await logAudit(supabase, "ADMIN_BROADCAST", adminId, { audience, message });
      return json({ sent: (users ?? []).length });
    }

    return json({ error: "Not found" }, 404);
  } catch (err) {
    return json({ error: err.message }, 500);
  }
});
