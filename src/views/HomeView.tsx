import { Zap, Play, Check, Users, Wallet, ArrowUpRight, TrendingUp, Gift, Sparkles } from 'lucide-react';
import { GuideCard } from '@/components/ui';
import type { TelegramUser, SystemSettings } from '@/lib/api';

export function HomeView({
  user,
  settings,
  setTab,
  notify,
}: {
  user: TelegramUser;
  settings: SystemSettings | null;
  setTab: (tab: 'home' | 'mine' | 'earn' | 'refer' | 'wallet') => void;
  notify: (title: string, msg: string, type?: 'success' | 'error' | 'info') => void;
}) {
  const usdtValue = user.balance * (settings?.pilot_usdt_rate ?? 0.0001);
  const hourlyRate = settings?.mining_reward_per_hour ?? 10;

  return (
    <>
      <div className="section-heading">
        <div>
          <span className="eyebrow">Today's mission</span>
          <h2>Welcome back</h2>
        </div>
        <span className="date-label">{new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}</span>
      </div>

      <GuideCard
        title="Getting started with EarnPilot"
        steps={[
          'Mine: Start an hourly mining session to earn Pilot passively.',
          'Earn: Watch ads and complete tasks to boost your Pilot balance.',
          'Refer: Share your referral link to earn 25 + 50 + 75 Pilot per friend.',
          'Wallet: Withdraw your Pilot as USDT on BEP20 when you reach the minimum.',
          'Check in daily for your daily bonus with increasing rewards.',
        ]}
      />

      <div className="home-stats-grid">
        <div className="home-stat-tile primary-tile">
          <div className="home-stat-top"><span>Pilot Balance</span><Wallet size={16} /></div>
          <strong>{Number(user.balance).toLocaleString()} <small>PILOT</small></strong>
          <span className="home-stat-sub"><TrendingUp size={12} /> ≈ ${usdtValue.toFixed(4)} USDT</span>
        </div>
        <div className="home-stat-tile">
          <div className="home-stat-top"><span>Mining</span><Zap size={16} /></div>
          <strong>{user.mining_count}</strong>
          <span className="home-stat-sub">total sessions</span>
        </div>
        <div className="home-stat-tile">
          <div className="home-stat-top"><span>Ads watched</span><Play size={16} /></div>
          <strong>{user.ads_watched}</strong>
          <span className="home-stat-sub">lifetime</span>
        </div>
        <div className="home-stat-tile">
          <div className="home-stat-top"><span>Tasks done</span><Check size={16} /></div>
          <strong>{user.tasks_completed}</strong>
          <span className="home-stat-sub">completed</span>
        </div>
        <div className="home-stat-tile">
          <div className="home-stat-top"><span>Referrals</span><Users size={16} /></div>
          <strong>—</strong>
          <span className="home-stat-sub">total friends</span>
        </div>
        <div className="home-stat-tile">
          <div className="home-stat-top"><span>Withdrawn</span><Gift size={16} /></div>
          <strong>${Number(user.total_withdrawn).toFixed(2)}</strong>
          <span className="home-stat-sub">USDT total</span>
        </div>
      </div>

      <div className="quick-actions">
        <button onClick={() => setTab('mine')}>
          <span className="quick-icon cyan"><Zap size={17} /></span>
          <span><strong>Start mining</strong><small>Earn {hourlyRate} P / hour</small></span>
          <ArrowUpRight size={15} />
        </button>
        <button onClick={() => setTab('earn')}>
          <span className="quick-icon green"><Play size={17} /></span>
          <span><strong>Watch ads</strong><small>Earn up to {settings?.ad_daily_limit ?? 30}/day</small></span>
          <ArrowUpRight size={15} />
        </button>
        <button onClick={() => setTab('earn')}>
          <span className="quick-icon blue"><Check size={17} /></span>
          <span><strong>Complete tasks</strong><small>New tasks available</small></span>
          <ArrowUpRight size={15} />
        </button>
        <button onClick={() => setTab('refer')}>
          <span className="quick-icon violet"><Users size={17} /></span>
          <span><strong>Refer & earn</strong><small>+{settings?.referral_join_reward ?? 25} P per friend</small></span>
          <ArrowUpRight size={15} />
        </button>
        <button onClick={() => setTab('wallet')}>
          <span className="quick-icon amber"><Wallet size={17} /></span>
          <span><strong>Withdraw</strong><small>USDT · BEP20</small></span>
          <ArrowUpRight size={15} />
        </button>
        <button onClick={() => notify('Daily bonus', 'Visit the Daily Bonus page to claim!', 'info')}>
          <span className="quick-icon green"><Gift size={17} /></span>
          <span><strong>Daily bonus</strong><small>Day {user.daily_bonus_day} streak</small></span>
          <Sparkles size={15} className="quick-arrow" />
        </button>
      </div>

      <div className="banner-card">
        <img src="/file_00000000ec38820b85ce3e08a9d81126.png" alt="EarnPilot" />
        <div className="banner-overlay">
          <span className="eyebrow">EarnPilot community</span>
          <h3>Stay in the loop.</h3>
          <p>New tasks, bonuses and pilot updates land here first.</p>
          <button onClick={() => {
            const tg = window.Telegram?.WebApp;
            if (tg) tg.openTelegramLink('https://t.me/earnpilotcommunity');
            else window.open('https://t.me/earnpilotcommunity', '_blank');
          }}>Join community <ArrowUpRight size={15} /></button>
        </div>
      </div>
    </>
  );
}
