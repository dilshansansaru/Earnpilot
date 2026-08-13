import { useEffect, useState, useCallback, useRef } from 'react';
import {
  authenticateWithTelegram,
  getMe,
  clearToken,
  type TelegramUser,
  type SystemSettings,
  getSettings,
} from '@/lib/api';

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    user?: {
      id: number;
      username?: string;
      first_name?: string;
      last_name?: string;
      photo_url?: string;
    };
    start_param?: string;
  };
  ready: () => void;
  expand: () => void;
  close: () => void;
  themeParams: Record<string, string>;
  setHeaderColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  openTelegramLink: (url: string) => void;
  openLink: (url: string) => void;
  HapticFeedback: {
    impactOccurred: (style: string) => void;
    notificationOccurred: (type: string) => void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}

export function useTelegramAuth() {
  const [user, setUser] = useState<TelegramUser | null>(null);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const authAttempted = useRef(false);

  const refreshUser = useCallback(async () => {
    if (isDemo) return;
    try {
      const me = await getMe();
      setUser(me);
    } catch {
      // ignore
    }
  }, [isDemo]);

  useEffect(() => {
    if (authAttempted.current) return;
    authAttempted.current = true;

    (async () => {
      try {
        const tg = window.Telegram?.WebApp;
        if (tg) {
          tg.ready();
          tg.expand();
          try { tg.setHeaderColor('#050914'); } catch { /* not supported */ }
          try { tg.setBackgroundColor('#050914'); } catch { /* not supported */ }
        }

        // Load settings (always available)
        try {
          const s = await getSettings();
          setSettings(s);
        } catch { /* settings may not be ready */ }

        // Try real Telegram auth
        if (tg?.initData && tg.initData.length > 10) {
          const refStart = tg.initDataUnsafe?.start_param ?? undefined;
          const result = await authenticateWithTelegram(tg.initData, refStart);
          setUser(result.user);
          setLoading(false);
          return;
        }

        // No Telegram initData — use demo mode for browser preview
        setIsDemo(true);
        setUser({
          id: 'demo',
          telegram_id: 0,
          username: 'demo_pilot',
          first_name: 'Demo',
          last_name: 'Pilot',
          photo_url: null,
          balance: 12450,
          total_withdrawn: 8.4,
          ads_watched: 42,
          tasks_completed: 8,
          mining_count: 15,
          usdt_wallet: null,
          referred_by: null,
          referral_code: 'ref_demo',
          status: 'active',
          balance_frozen: false,
          risk_score: 0,
          last_mining_at: null,
          last_ad_at: null,
          last_daily_bonus_at: null,
          daily_bonus_day: 3,
        });
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Authentication failed');
        setLoading(false);
      }
    })();
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    setIsDemo(false);
  }, []);

  return { user, settings, loading, error, isDemo, refreshUser, logout };
}
