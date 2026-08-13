import { useState, useCallback } from 'react';
import {
  ArrowUpRight, BarChart3, Bell, Check, ChevronRight, CircleDollarSign,
  Copy, Gift, History, LayoutDashboard, Settings as SettingsIcon, ShieldCheck,
  Sparkles, Target, Ticket, TrendingUp, Users, Wallet, X, Zap, LifeBuoy, Play,
} from 'lucide-react';
import { useTelegramAuth } from '@/hooks/useTelegramAuth';
import { ToastView, type ToastState } from '@/components/ui';
import { HomeView } from '@/views/HomeView';
import { MiningView } from '@/views/MiningView';
import { EarnView } from '@/views/EarnView';
import { ReferView } from '@/views/ReferView';
import { WalletView } from '@/views/WalletView';
import {
  DailyBonusView, RewardCodeView, LeaderboardView, TransactionsView,
  NotificationsView, SettingsView, SupportView,
} from '@/views/SecondaryViews';
import { AdminPanel } from '@/views/AdminPanel';

type Tab = 'home' | 'mine' | 'earn' | 'refer' | 'wallet';
type SubPage = 'daily' | 'code' | 'leaderboard' | 'transactions' | 'notifications' | 'settings' | 'support' | 'admin' | null;

const logo = '/file_00000000038081fb8a6316c73f265494.png';

const navItems: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'home', label: 'Home', icon: LayoutDashboard },
  { id: 'mine', label: 'Mine', icon: Zap },
  { id: 'earn', label: 'Earn', icon: Target },
  { id: 'refer', label: 'Refer', icon: Users },
  { id: 'wallet', label: 'Wallet', icon: Wallet },
];

function App() {
  const { user, settings, loading, error, isDemo, refreshUser, logout } = useTelegramAuth();
  const [tab, setTab] = useState<Tab>('home');
  const [subPage, setSubPage] = useState<SubPage>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [showMenu, setShowMenu] = useState(false);

  const notify = useCallback((title: string, message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ title, message, type });
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  if (loading) {
    return (
      <div className="app-shell">
        <div className="loading-screen">
          <div className="loading-logo">
            <img src={logo} alt="EarnPilot" />
          </div>
          <div className="loading-spinner" />
          <p>Initializing EarnPilot...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-shell">
        <div className="loading-screen">
          <div className="loading-logo"><img src={logo} alt="EarnPilot" /></div>
          <p className="loading-error">Connection failed: {error}</p>
          <button className="primary-action" onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app-shell">
        <div className="loading-screen">
          <div className="loading-logo"><img src={logo} alt="EarnPilot" /></div>
          <p>Please open this app via Telegram.</p>
        </div>
      </div>
    );
  }

  const usdtValue = user.balance * (settings?.pilot_usdt_rate ?? 0.0001);

  const initials = ((user.first_name ?? user.username ?? '?')[0] ?? '?').toUpperCase();

  const goSubPage = (page: SubPage) => {
    setSubPage(page);
    setShowMenu(false);
  };

  const backToMain = () => setSubPage(null);

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="topbar">
        <div className="brand-lockup">
          <img src={logo} alt="EarnPilot" className="brand-logo" />
          <div>
            <span className="brand-name">Earn<span>Pilot</span></span>
            <span className="brand-tagline">Task. Refer. Earn. Repeat.</span>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="icon-button notification-button" aria-label="Notifications" onClick={() => goSubPage('notifications')}>
            <Bell size={18} />
          </button>
          <button className="profile-chip" onClick={() => setShowMenu(!showMenu)}>
            <span className="profile-avatar">{initials}</span>
            <span className="profile-name">{user.first_name ?? user.username ?? 'Pilot'}</span>
            <ChevronRight size={15} className={showMenu ? 'rotate-90' : ''} />
          </button>
          {showMenu && (
            <div className="profile-menu">
              <strong>@{user.username ?? 'pilot'}</strong>
              <button onClick={() => goSubPage('settings')}><SettingsIcon size={15} /> Settings</button>
              <button onClick={() => goSubPage('support')}><LifeBuoy size={15} /> Support</button>
              <button onClick={() => goSubPage('transactions')}><History size={15} /> Transactions</button>
              <button onClick={() => goSubPage('admin')}><ShieldCheck size={15} /> Admin Panel</button>
              {!isDemo && <button onClick={() => { logout(); setShowMenu(false); }}><X size={15} /> Sign out</button>}
            </div>
          )}
        </div>
      </header>

      <main className="content-wrap">
        {subPage === 'admin' && <AdminPanel notify={notify} onBack={backToMain} />}
        {subPage === 'daily' && <DailyBonusView user={user} settings={settings} notify={notify} onRefresh={refreshUser} />}
        {subPage === 'code' && <RewardCodeView notify={notify} onRefresh={refreshUser} />}
        {subPage === 'leaderboard' && <LeaderboardView user={user} />}
        {subPage === 'transactions' && <TransactionsView user={user} />}
        {subPage === 'notifications' && <NotificationsView />}
        {subPage === 'settings' && <SettingsView user={user} settings={settings} onLogout={() => { logout(); setSubPage(null); }} />}
        {subPage === 'support' && <SupportView settings={settings} />}

        {subPage === null && (
          <>
            <section className="welcome-row">
              <div>
                <p className="eyebrow"><span className="pulse-dot" /> Mission control</p>
                <h1>Welcome back, {user.first_name ?? user.username ?? 'Pilot'} <span className="wave">&#10022;</span></h1>
                <p className="subcopy">Your next reward is closer than you think.</p>
              </div>
              <div className="streak-pill"><Gift size={17} /><span><strong>Day {user.daily_bonus_day}</strong> streak</span><Sparkles size={14} /></div>
            </section>

            <section className="balance-grid">
              <div className="balance-card primary-card">
                <div className="card-glow" />
                <div className="balance-top"><span className="card-label">Total balance</span><span className="live-pill"><span /> Live</span></div>
                <div className="balance-value">{Number(user.balance).toLocaleString()} <small>PILOT</small></div>
                <div className="balance-foot"><span>≈ ${usdtValue.toFixed(4)} USDT</span><span className="positive"><TrendingUp size={14} /> {user.mining_count} sessions</span></div>
              </div>
              <div className="stat-card"><div className="stat-icon cyan"><Users size={18} /></div><span className="stat-label">Total referrals</span><strong>{user.tasks_completed}</strong><span className="stat-meta">tasks done</span></div>
              <div className="stat-card"><div className="stat-icon green"><CircleDollarSign size={18} /></div><span className="stat-label">Total withdrawn</span><strong>${Number(user.total_withdrawn).toFixed(2)}</strong><span className="stat-meta">USDT</span></div>
            </section>

            <section className="main-grid">
              <div className="main-column">
                {tab === 'home' && <HomeView user={user} settings={settings} setTab={setTab} notify={notify} />}
                {tab === 'mine' && <MiningView user={user} settings={settings} notify={notify} onRefresh={refreshUser} />}
                {tab === 'earn' && <EarnView user={user} settings={settings} notify={notify} onRefresh={refreshUser} />}
                {tab === 'refer' && <ReferView user={user} settings={settings} notify={notify} />}
                {tab === 'wallet' && <WalletView user={user} settings={settings} notify={notify} onRefresh={refreshUser} />}
              </div>
              <aside className="side-column">
                <div className="section-heading"><div><span className="eyebrow">Quick access</span><h2>More</h2></div></div>
                <div className="side-shortcuts">
                  <button className="side-shortcut" onClick={() => goSubPage('daily')}>
                    <div className="shortcut-icon amber"><Gift size={18} /></div>
                    <div><strong>Daily Bonus</strong><span>Day {user.daily_bonus_day} streak</span></div>
                    <ChevronRight size={16} />
                  </button>
                  <button className="side-shortcut" onClick={() => goSubPage('code')}>
                    <div className="shortcut-icon blue"><Ticket size={18} /></div>
                    <div><strong>Reward Code</strong><span>Redeem a code</span></div>
                    <ChevronRight size={16} />
                  </button>
                  <button className="side-shortcut" onClick={() => goSubPage('leaderboard')}>
                    <div className="shortcut-icon cyan"><BarChart3 size={18} /></div>
                    <div><strong>Leaderboard</strong><span>Top pilots</span></div>
                    <ChevronRight size={16} />
                  </button>
                  <button className="side-shortcut" onClick={() => goSubPage('transactions')}>
                    <div className="shortcut-icon green"><History size={18} /></div>
                    <div><strong>Transactions</strong><span>Your history</span></div>
                    <ChevronRight size={16} />
                  </button>
                </div>
              </aside>
            </section>

            <section className="bottom-strip">
              <button className="shortcut-card" onClick={() => goSubPage('daily')}><div className="shortcut-icon amber"><Gift size={19} /></div><div><strong>Daily bonus</strong><span>Claim your reward</span></div><ChevronRight size={17} /></button>
              <button className="shortcut-card" onClick={() => goSubPage('leaderboard')}><div className="shortcut-icon blue"><BarChart3 size={19} /></div><div><strong>Leaderboard</strong><span>See top pilots</span></div><ChevronRight size={17} /></button>
              <button className="shortcut-card" onClick={() => goSubPage('code')}><div className="shortcut-icon green"><Ticket size={19} /></div><div><strong>Reward code</strong><span>Redeem here</span></div><ChevronRight size={17} /></button>
            </section>
          </>
        )}
      </main>

      {subPage === null && (
        <nav className="bottom-nav">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
              <Icon size={19} /><span>{label}</span>
            </button>
          ))}
        </nav>
      )}

      {subPage !== null && subPage !== 'admin' && (
        <nav className="bottom-nav">
          <button className="active" onClick={backToMain}>
            <ChevronRight size={19} style={{ transform: 'rotate(180deg)' }} /><span>Back</span>
          </button>
        </nav>
      )}

      <ToastView toast={toast} />
    </div>
  );
}

export default App;
