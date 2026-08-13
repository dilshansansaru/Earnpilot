import { useState, useEffect } from 'react';
import { Gift, Ticket, BarChart3, History, Bell, Settings as SettingsIcon, LifeBuoy, Check, Trophy, ArrowUpRight, X } from 'lucide-react';
import { GuideCard } from '@/components/ui';
import {
  claimDailyBonus, redeemCode, getLeaderboard, getTransactions, getNotifications, markNotificationsRead,
  type TelegramUser, type SystemSettings, type LeaderboardEntry, type Transaction, type Notification,
} from '@/lib/api';

type Notifier = (title: string, msg: string, type?: 'success' | 'error' | 'info') => void;

// ---- Daily Bonus ----
export function DailyBonusView({ user, settings, notify, onRefresh }: { user: TelegramUser; settings: SystemSettings | null; notify: Notifier; onRefresh: () => void }) {
  const [loading, setLoading] = useState(false);
  const rewards = settings?.daily_bonus_rewards ?? [10, 15, 20, 25, 30, 40, 100];
  const currentDay = user.daily_bonus_day;

  const handleClaim = async () => {
    setLoading(true);
    try {
      const result = await claimDailyBonus() as { day: number; reward: number };
      notify('Bonus claimed!', `Day ${result.day}: +${result.reward} Pilot added to your balance.`, 'success');
      onRefresh();
    } catch (err) {
      notify('Cannot claim', err instanceof Error ? err.message : 'Failed to claim bonus', 'error');
    }
    setLoading(false);
  };

  const canClaim = user.status === 'active';

  return (
    <>
      <div className="section-heading"><div><span className="eyebrow">Daily reward</span><h2>Daily Bonus</h2></div></div>
      <GuideCard title="How daily bonus works" steps={[
        'Claim your bonus every day to build a streak.',
        'Rewards increase each day: Day 1 = 10 P, Day 7 = 100 P.',
        'Miss a day and your streak resets to Day 1.',
        'You can only claim once per day.',
      ]} />
      <div className="bonus-track">
        {rewards.map((reward, i) => {
          const day = i + 1;
          const isClaimed = day <= currentDay;
          const isToday = day === currentDay + 1 || (day === 1 && currentDay === 0);
          return (
            <div key={i} className={`bonus-day ${isClaimed ? 'claimed' : ''} ${isToday ? 'today' : ''}`}>
              <span className="bonus-day-num">{day === 7 ? '7' : day}</span>
              <div className="bonus-day-icon"><Gift size={day === 7 ? 24 : 18} /></div>
              <strong>+{reward}</strong>
              {isClaimed && <Check size={14} className="bonus-check" />}
            </div>
          );
        })}
      </div>
      <button className="primary-action" onClick={handleClaim} disabled={loading || !canClaim} style={{ marginTop: 20 }}>
        <Gift size={17} /> {loading ? 'Claiming...' : 'Claim today\'s bonus'}
      </button>
    </>
  );
}

// ---- Reward Code ----
export function RewardCodeView({ notify, onRefresh }: { notify: Notifier; onRefresh: () => void }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const handleRedeem = async () => {
    if (!code.trim()) { notify('Enter code', 'Please enter a reward code.', 'error'); return; }
    setLoading(true);
    try {
      const result = await redeemCode(code.trim()) as { reward: number };
      notify('Code redeemed!', `+${result.reward} Pilot added to your balance.`, 'success');
      setCode('');
      onRefresh();
    } catch (err) {
      notify('Invalid code', err instanceof Error ? err.message : 'Could not redeem code', 'error');
    }
    setLoading(false);
  };
  return (
    <>
      <div className="section-heading"><div><span className="eyebrow">Redeem</span><h2>Reward Code</h2></div></div>
      <GuideCard title="How reward codes work" steps={[
        'Enter a code provided by EarnPilot to instantly receive Pilot.',
        'Each code has a maximum number of uses and a per-user limit.',
        'Codes expire — use them before the deadline.',
        'You cannot redeem the same code twice.',
      ]} />
      <div className="code-redeem-card">
        <div className="code-icon"><Ticket size={28} /></div>
        <h3>Have a code?</h3>
        <p>Enter your reward code below to add Pilot to your balance.</p>
        <input className="wd-input code-input" type="text" placeholder="e.g. PILOT2026" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        <button className="primary-action" onClick={handleRedeem} disabled={loading}>
          {loading ? 'Redeeming...' : <>Redeem code <ArrowUpRight size={16} /></>}
        </button>
      </div>
    </>
  );
}

// ---- Leaderboard ----
export function LeaderboardView({ user }: { user: TelegramUser }) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  useEffect(() => {
    (async () => {
      try { setEntries(await getLeaderboard()); } catch { /* ignore */ }
    })();
  }, []);
  return (
    <>
      <div className="section-heading"><div><span className="eyebrow">Top pilots</span><h2>Leaderboard</h2></div></div>
      <GuideCard title="How the leaderboard works" steps={[
        'Pilots are ranked by their total Pilot balance.',
        'Earn more through mining, ads, tasks, and referrals to climb.',
        'The top 50 pilots are shown here.',
      ]} />
      <div className="leaderboard-list">
        {entries.length === 0 ? (
          <div className="wd-empty">No data yet. Be the first!</div>
        ) : entries.map((entry, i) => {
          const isMe = entry.id === user.id;
          return (
            <div key={entry.id} className={`leaderboard-row ${isMe ? 'me' : ''}`}>
              <span className={`lb-rank ${i < 3 ? `top-${i + 1}` : ''}`}>{i + 1}</span>
              <div className="lb-avatar">
                {entry.photo_url ? <img src={entry.photo_url} alt="" /> : <span>{(entry.first_name ?? entry.username ?? '?')[0]}</span>}
              </div>
              <div className="lb-info"><strong>{entry.first_name ?? entry.username ?? 'Anonymous'}</strong><span>{entry.mining_count} mines · {entry.ads_watched} ads</span></div>
              <strong className="lb-balance">{Number(entry.balance).toLocaleString()} <small>P</small></strong>
              {i < 3 && <Trophy size={16} className={`lb-trophy top-${i + 1}`} />}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ---- Transactions ----
export function TransactionsView({ user }: { user: TelegramUser }) {
  const [txs, setTxs] = useState<Transaction[]>([]);
  useEffect(() => {
    (async () => {
      try { setTxs(await getTransactions()); } catch { /* ignore */ }
    })();
  }, []);
  const typeLabels: Record<string, string> = {
    MINING: 'Mining reward', AD_REWARD: 'Ad reward', TASK_REWARD: 'Task reward',
    DAILY_BONUS: 'Daily bonus', REWARD_CODE: 'Reward code',
    REFERRAL_JOIN: 'Referral bonus', REFERRAL_DAY1: 'Day 1 referral', REFERRAL_DAY2: 'Day 2 referral',
    WITHDRAWAL: 'Withdrawal', WITHDRAWAL_FEE: 'Withdrawal fee', ADMIN_ADJUSTMENT: 'Admin adjustment',
  };
  return (
    <>
      <div className="section-heading"><div><span className="eyebrow">History</span><h2>Transactions</h2></div></div>
      <GuideCard title="How transactions work" steps={[
        'Every Pilot balance change is recorded here as a transaction.',
        'Positive amounts are credits (rewards earned).',
        'Negative amounts are debits (withdrawals, fees).',
        'Your full transaction history is private to you.',
      ]} />
      <div className="tx-list">
        {txs.length === 0 ? (
          <div className="wd-empty">No transactions yet. Start earning!</div>
        ) : txs.map((tx) => (
          <div className="tx-row" key={tx.id}>
            <div className={`tx-icon ${Number(tx.amount) > 0 ? 'positive' : 'negative'}`}>
              {Number(tx.amount) > 0 ? <ArrowUpRight size={16} /> : <X size={16} />}
            </div>
            <div className="tx-info"><strong>{typeLabels[tx.type] ?? tx.type}</strong><span>{new Date(tx.created_at).toLocaleString()}</span></div>
            <strong className={`tx-amount ${Number(tx.amount) > 0 ? 'positive' : 'negative'}`}>{Number(tx.amount) > 0 ? '+' : ''}{Number(tx.amount).toLocaleString()} P</strong>
          </div>
        ))}
      </div>
    </>
  );
}

// ---- Notifications ----
export function NotificationsView() {
  const [notifs, setNotifs] = useState<Notification[]>([]);
  useEffect(() => {
    (async () => {
      try {
        const data = await getNotifications();
        setNotifs(data);
        if (data.some(n => !n.read)) await markNotificationsRead();
      } catch { /* ignore */ }
    })();
  }, []);
  return (
    <>
      <div className="section-heading"><div><span className="eyebrow">Inbox</span><h2>Notifications</h2></div></div>
      <div className="notif-list">
        {notifs.length === 0 ? (
          <div className="wd-empty">No notifications yet.</div>
        ) : notifs.map((n) => (
          <div className="notif-row" key={n.id}>
            <div className="notif-icon"><Bell size={16} /></div>
            <div className="notif-info"><strong>{n.title}</strong><span>{n.message}</span><small>{new Date(n.created_at).toLocaleString()}</small></div>
          </div>
        ))}
      </div>
    </>
  );
}

// ---- Settings ----
export function SettingsView({ user, settings, onLogout }: { user: TelegramUser; settings: SystemSettings | null; onLogout: () => void }) {
  const tg = window.Telegram?.WebApp;
  return (
    <>
      <div className="section-heading"><div><span className="eyebrow">Account</span><h2>Settings</h2></div></div>
      <GuideCard title="Your account" steps={[
        'Your account is linked to your Telegram ID.',
        'You can save your BEP20 wallet address for withdrawals.',
        'Your balance and activity are always synced to the server.',
      ]} />
      <div className="settings-card">
        <div className="settings-row"><span>Telegram ID</span><strong>{user.telegram_id}</strong></div>
        <div className="settings-row"><span>Username</span><strong>@{user.username ?? 'N/A'}</strong></div>
        <div className="settings-row"><span>Referral code</span><strong>{user.referral_code}</strong></div>
        <div className="settings-row"><span>Account status</span><strong style={{ color: user.status === 'active' ? '#34d399' : '#fbbf24' }}>{user.status}</strong></div>
        <div className="settings-row"><span>Wallet address</span><strong>{user.usdt_wallet ? `${user.usdt_wallet.slice(0, 8)}...${user.usdt_wallet.slice(-6)}` : 'Not set'}</strong></div>
      </div>
      <div className="settings-links">
        {settings?.community_channel && (
          <button onClick={() => tg ? tg.openTelegramLink(settings.community_channel) : window.open(settings.community_channel, '_blank')}>
            Community Channel <ArrowUpRight size={15} />
          </button>
        )}
        {settings?.payment_channel && (
          <button onClick={() => tg ? tg.openTelegramLink(settings.payment_channel) : window.open(settings.payment_channel, '_blank')}>
            Payment Channel <ArrowUpRight size={15} />
          </button>
        )}
        {settings?.support_username && (
          <button onClick={() => tg ? tg.openTelegramLink(`https://t.me/${settings.support_username}`) : window.open(`https://t.me/${settings.support_username}`, '_blank')}>
            Support <ArrowUpRight size={15} />
          </button>
        )}
      </div>
      <button className="logout-btn" onClick={onLogout}>Sign out</button>
    </>
  );
}

// ---- Support ----
export function SupportView({ settings }: { settings: SystemSettings | null }) {
  const tg = window.Telegram?.WebApp;
  const support = settings?.support_username ?? '';
  return (
    <>
      <div className="section-heading"><div><span className="eyebrow">Help</span><h2>Support</h2></div></div>
      <GuideCard title="Need help?" steps={[
        'Contact our support team via Telegram for any issues.',
        'Include your Telegram ID and a description of the problem.',
        'We typically respond within 24 hours.',
      ]} />
      <div className="support-card">
        <div className="support-icon"><LifeBuoy size={28} /></div>
        <h3>Get Support</h3>
        <p>Having trouble? Our team is here to help you.</p>
        {support ? (
          <button className="primary-action" onClick={() => tg ? tg.openTelegramLink(`https://t.me/${support}`) : window.open(`https://t.me/${support}`, '_blank')}>
            Contact Support <ArrowUpRight size={16} />
          </button>
        ) : (
          <p className="wd-empty">Support contact will be available soon.</p>
        )}
      </div>
    </>
  );
}
