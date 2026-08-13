import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const API_BASE = `${supabaseUrl}/functions/v1/api`;
const AUTH_BASE = `${supabaseUrl}/functions/v1/auth`;
const ADMIN_BASE = `${supabaseUrl}/functions/v1/admin`;

export interface TelegramUser {
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

export interface SystemSettings {
  mining_reward_per_hour: number;
  mining_duration_minutes: number;
  mining_daily_limit: number;
  ad_reward: number;
  ad_cooldown_seconds: number;
  ad_daily_limit: number;
  task_timer_seconds: number;
  referral_join_reward: number;
  referral_day1_reward: number;
  referral_day2_reward: number;
  referral_day1_ads: number;
  referral_day2_ads: number;
  daily_bonus_rewards: number[];
  pilot_usdt_rate: number;
  usdt_min_withdraw: number;
  usdt_max_withdraw: number;
  usdt_fee_percent: number;
  usdt_fee_fixed: number;
  usdt_network: string;
  maintenance_mode: boolean;
  community_channel: string;
  payment_channel: string;
  bot_username: string;
  support_username: string;
}

export interface AdItem {
  id: string;
  name: string;
  network: string;
  zone_id: string;
  reward: number;
  daily_limit: number;
  cooldown_seconds: number;
  priority: number;
  status: string;
}

export interface TaskItem {
  id: string;
  title: string;
  description: string;
  type: string;
  url: string;
  chat_username: string | null;
  reward: number;
  image_url: string | null;
  verification_method: string;
  duration_seconds: number;
  total_limit: number;
  enabled: boolean;
}

export interface Transaction {
  id: string;
  type: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  reference_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Withdrawal {
  id: string;
  amount_pilot: number;
  amount_usdt: number;
  fee_usdt: number;
  network: string;
  wallet_address: string;
  tx_hash: string | null;
  explorer_url: string | null;
  status: string;
  created_at: string;
  processed_at: string | null;
}

export interface Referral {
  id: string;
  created_at: string;
  join_reward_paid: boolean;
  day1_reward_paid: boolean;
  day2_reward_paid: boolean;
  referred: { id: string; username: string | null; first_name: string | null; photo_url: string | null; created_at: string };
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}

export interface MiningSession {
  id: string;
  user_id: string;
  started_at: string;
  expires_at: string;
  reward: number;
  claimed_at: string | null;
  status: string;
}

export interface LeaderboardEntry {
  id: string;
  username: string | null;
  first_name: string | null;
  photo_url: string | null;
  balance: number;
  mining_count: number;
  ads_watched: number;
  tasks_completed: number;
}

function getToken(): string | null {
  return localStorage.getItem('earnpilot_token');
}

function setToken(token: string) {
  localStorage.setItem('earnpilot_token', token);
}

export function clearToken() {
  localStorage.removeItem('earnpilot_token');
}

async function apiCall<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers as Record<string, string>,
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error: string }).error || 'Request failed');
  return data as T;
}

async function adminCall<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('earnpilot_admin_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers as Record<string, string>,
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${ADMIN_BASE}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error: string }).error || 'Request failed');
  return data as T;
}

// ---- Auth ----
export async function authenticateWithTelegram(initData: string, refStart?: string): Promise<{ user: TelegramUser; is_new: boolean; session_token: string }> {
  const res = await fetch(AUTH_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData, refStart }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error: string }).error || 'Auth failed');
  const result = data as { user: TelegramUser; is_new: boolean; session_token: string };
  setToken(result.user.id);
  return result;
}

export async function adminAuth(telegramId: number): Promise<{ admin: boolean; user: TelegramUser; token: string }> {
  const res = await fetch(`${ADMIN_BASE}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ telegram_id: telegramId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error: string }).error || 'Admin auth failed');
  const result = data as { admin: boolean; user: TelegramUser; token: string };
  localStorage.setItem('earnpilot_admin_token', result.token);
  return result;
}

// ---- Public ----
export const getSettings = () => apiCall<SystemSettings>('/settings');
export const getLeaderboard = () => apiCall<LeaderboardEntry[]>('/leaderboard');

// ---- User ----
export const getMe = () => apiCall<TelegramUser>('/me');
export const updateWallet = (address: string) => apiCall('/me/wallet', { method: 'POST', body: JSON.stringify({ wallet_address: address }) });

// ---- Mining ----
export const getActiveMining = () => apiCall<MiningSession | null>('/mining/active');
export const startMining = () => apiCall<{ session: MiningSession }>('/mining/start', { method: 'POST' });
export const claimMining = (sessionId: string) => apiCall('/mining/claim', { method: 'POST', body: JSON.stringify({ session_id: sessionId }) });

// ---- Ads ----
export const getAds = () => apiCall<AdItem[]>('/ads');
export const completeAd = (adId: string) => apiCall('/ads/complete', { method: 'POST', body: JSON.stringify({ ad_id: adId }) });

// ---- Tasks ----
export const getTasks = () => apiCall<{ tasks: TaskItem[]; completed: string[] }>('/tasks');
export const startTask = (taskId: string) => apiCall<{ id: string; eligible_at: string }>('/tasks/start', { method: 'POST', body: JSON.stringify({ task_id: taskId }) });
export const claimTask = (sessionId: string) => apiCall('/tasks/claim', { method: 'POST', body: JSON.stringify({ session_id: sessionId }) });

// ---- Daily Bonus ----
export const claimDailyBonus = () => apiCall('/daily-bonus/claim', { method: 'POST' });

// ---- Reward Code ----
export const redeemCode = (code: string) => apiCall('/reward-code/redeem', { method: 'POST', body: JSON.stringify({ code }) });

// ---- Withdrawals ----
export const getWithdrawals = () => apiCall<Withdrawal[]>('/withdrawals');
export const createWithdrawal = (amountPilot: number, walletAddress: string) =>
  apiCall('/withdrawals/create', { method: 'POST', body: JSON.stringify({ amount_pilot: amountPilot, wallet_address: walletAddress }) });

// ---- Transactions ----
export const getTransactions = () => apiCall<Transaction[]>('/transactions');

// ---- Referrals ----
export const getReferrals = () => apiCall<Referral[]>('/referrals');

// ---- Notifications ----
export const getNotifications = () => apiCall<Notification[]>('/notifications');
export const markNotificationsRead = () => apiCall('/notifications/read', { method: 'POST' });

// ---- Admin ----
export const admin = {
  getStats: () => adminCall('/stats'),
  getUsers: (search?: string) => adminCall(`/users${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  updateUser: (userId: string, updates: Record<string, unknown>) => adminCall('/users/update', { method: 'POST', body: JSON.stringify({ user_id: userId, updates }) }),
  adjustBalance: (userId: string, amount: number, type: 'add' | 'subtract') => adminCall('/users/balance', { method: 'POST', body: JSON.stringify({ user_id: userId, amount, type }) }),
  getWithdrawals: (status?: string) => adminCall(`/withdrawals${status ? `?status=${status}` : ''}`),
  updateWithdrawal: (withdrawalId: string, status: string, txHash?: string, explorerUrl?: string, note?: string) =>
    adminCall('/withdrawals/update', { method: 'POST', body: JSON.stringify({ withdrawal_id: withdrawalId, status, tx_hash: txHash, explorer_url: explorerUrl, note }) }),
  getTasks: () => adminCall('/tasks'),
  createTask: (task: Record<string, unknown>) => adminCall('/tasks/create', { method: 'POST', body: JSON.stringify(task) }),
  updateTask: (taskId: string, updates: Record<string, unknown>) => adminCall('/tasks/update', { method: 'POST', body: JSON.stringify({ task_id: taskId, updates }) }),
  deleteTask: (taskId: string) => adminCall('/tasks/delete', { method: 'POST', body: JSON.stringify({ task_id: taskId }) }),
  getAds: () => adminCall('/ads'),
  createAd: (ad: Record<string, unknown>) => adminCall('/ads/create', { method: 'POST', body: JSON.stringify(ad) }),
  updateAd: (adId: string, updates: Record<string, unknown>) => adminCall('/ads/update', { method: 'POST', body: JSON.stringify({ ad_id: adId, updates }) }),
  deleteAd: (adId: string) => adminCall('/ads/delete', { method: 'POST', body: JSON.stringify({ ad_id: adId }) }),
  getRewardCodes: () => adminCall('/reward-codes'),
  createRewardCode: (code: string, reward: number, maxUses: number, perUserLimit: number, expiresAt?: string) =>
    adminCall('/reward-codes/create', { method: 'POST', body: JSON.stringify({ code, reward, max_uses: maxUses, per_user_limit: perUserLimit, expires_at: expiresAt }) }),
  deleteRewardCode: (codeId: string) => adminCall('/reward-codes/delete', { method: 'POST', body: JSON.stringify({ code_id: codeId }) }),
  getSettings: () => adminCall('/settings'),
  updateSettings: (updates: Record<string, unknown>) => adminCall('/settings/update', { method: 'POST', body: JSON.stringify({ updates }) }),
  getTransactions: () => adminCall('/transactions'),
  getAuditLogs: () => adminCall('/audit-logs'),
  broadcast: (message: string, audience: string) => adminCall('/broadcast', { method: 'POST', body: JSON.stringify({ message, audience }) }),
};
