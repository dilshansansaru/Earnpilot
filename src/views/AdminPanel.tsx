import { useState, useEffect } from 'react';
import {
  LayoutDashboard, Users, Wallet, Target, Ticket, Settings as SettingsIcon,
  ShieldCheck, ArrowLeft, Search, Check, X, Gift, Play, ChevronRight, History, Bell,
} from 'lucide-react';
import {
  admin, adminAuth, type TelegramUser, type SystemSettings, type Withdrawal,
} from '@/lib/api';

type Notifier = (title: string, msg: string, type?: 'success' | 'error' | 'info') => void;
type AdminTab = 'dashboard' | 'users' | 'withdrawals' | 'tasks' | 'ads' | 'codes' | 'settings' | 'logs';

interface AdminStats {
  total_users: number;
  active_users: number;
  new_users_today: number;
  active_mining: number;
  ads_today: number;
  tasks_today: number;
  referrals_today: number;
  pending_withdrawals: number;
  suspended_users: number;
  suspicious_users: number;
  total_withdrawn: number;
  pilot_issued_today: number;
}

export function AdminPanel({ notify, onBack }: { notify: Notifier; onBack: () => void }) {
  const [authed, setAuthed] = useState(false);
  const [adminUser, setAdminUser] = useState<TelegramUser | null>(null);
  const [tgIdInput, setTgIdInput] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [tab, setTab] = useState<AdminTab>('dashboard');

  const handleAuth = async () => {
    const id = parseInt(tgIdInput);
    if (!id) { notify('Enter ID', 'Please enter your Telegram ID.', 'error'); return; }
    setAuthLoading(true);
    try {
      const result = await adminAuth(id);
      setAuthed(true);
      setAdminUser(result.user);
      notify('Admin access', 'Welcome to the admin panel.', 'success');
    } catch (err) {
      notify('Access denied', err instanceof Error ? err.message : 'Not an admin account.', 'error');
    }
    setAuthLoading(false);
  };

  if (!authed) {
    return (
      <>
        <div className="section-heading">
          <div><span className="eyebrow">Admin access</span><h2>Admin Panel</h2></div>
          <button className="text-button" onClick={onBack}><ArrowLeft size={14} /> Back</button>
        </div>
        <div className="admin-auth-card">
          <div className="support-icon"><ShieldCheck size={28} /></div>
          <h3>Admin Login</h3>
          <p>Enter your Telegram ID to access the admin panel.</p>
          <input
            className="wd-input"
            type="number"
            placeholder="e.g. 5419054691"
            value={tgIdInput}
            onChange={(e) => setTgIdInput(e.target.value)}
          />
          <button className="primary-action" onClick={handleAuth} disabled={authLoading}>
            {authLoading ? 'Verifying...' : <>Login <ChevronRight size={16} /></>}
          </button>
        </div>
      </>
    );
  }

  const tabs: { id: AdminTab; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'withdrawals', label: 'Withdrawals', icon: Wallet },
    { id: 'tasks', label: 'Tasks', icon: Target },
    { id: 'ads', label: 'Ads', icon: Play },
    { id: 'codes', label: 'Codes', icon: Ticket },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
    { id: 'logs', label: 'Logs', icon: History },
  ];

  return (
    <>
      <div className="section-heading">
        <div><span className="eyebrow">Admin Panel</span><h2>Management</h2></div>
        <button className="text-button" onClick={onBack}><ArrowLeft size={14} /> Exit</button>
      </div>

      <div className="admin-tabs">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      <div className="admin-content">
        {tab === 'dashboard' && <DashboardTab />}
        {tab === 'users' && <UsersTab notify={notify} />}
        {tab === 'withdrawals' && <WithdrawalsTab notify={notify} />}
        {tab === 'tasks' && <TasksTab notify={notify} />}
        {tab === 'ads' && <AdsTab notify={notify} />}
        {tab === 'codes' && <CodesTab notify={notify} />}
        {tab === 'settings' && <SettingsTab notify={notify} />}
        {tab === 'logs' && <LogsTab />}
      </div>
    </>
  );
}

function DashboardTab() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  useEffect(() => {
    (async () => {
      try { setStats(await admin.getStats() as AdminStats); } catch { /* ignore */ }
    })();
  }, []);

  if (!stats) return <div className="wd-empty">Loading stats...</div>;

  const cards = [
    { label: 'Total users', value: stats.total_users, icon: Users, color: 'cyan' },
    { label: 'Active users', value: stats.active_users, icon: ShieldCheck, color: 'green' },
    { label: 'New today', value: stats.new_users_today, icon: Gift, color: 'blue' },
    { label: 'Active mining', value: stats.active_mining, icon: LayoutDashboard, color: 'cyan' },
    { label: 'Ads today', value: stats.ads_today, icon: Play, color: 'green' },
    { label: 'Tasks today', value: stats.tasks_today, icon: Target, color: 'blue' },
    { label: 'Pending WD', value: stats.pending_withdrawals, icon: Wallet, color: 'amber' },
    { label: 'Suspended', value: stats.suspended_users, icon: X, color: 'amber' },
    { label: 'Total withdrawn', value: `$${stats.total_withdrawn.toFixed(2)}`, icon: Wallet, color: 'green' },
    { label: 'Pilot issued today', value: stats.pilot_issued_today, icon: Ticket, color: 'cyan' },
  ];

  return (
    <div className="admin-stats-grid">
      {cards.map(({ label, value, icon: Icon, color }) => (
        <div className="admin-stat-card" key={label}>
          <div className={`stat-icon ${color}`}><Icon size={16} /></div>
          <strong>{value}</strong>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function UsersTab({ notify }: { notify: Notifier }) {
  const [users, setUsers] = useState<TelegramUser[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<TelegramUser | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustType, setAdjustType] = useState<'add' | 'subtract'>('add');

  const load = async () => {
    try { setUsers(await admin.getUsers(search || undefined) as TelegramUser[]); } catch { /* ignore */ }
  };
  useEffect(() => { load(); }, []);

  const handleAdjust = async () => {
    if (!selected || !adjustAmount) return;
    const amt = parseFloat(adjustAmount);
    if (isNaN(amt)) { notify('Invalid', 'Enter a valid number.', 'error'); return; }
    try {
      await admin.adjustBalance(selected.id, amt, adjustType);
      notify('Balance adjusted', `${adjustType === 'add' ? '+' : '-'}${amt} Pilot for ${selected.username ?? selected.first_name}.`, 'success');
      setAdjustAmount('');
      load();
    } catch (err) {
      notify('Failed', err instanceof Error ? err.message : 'Adjustment failed.', 'error');
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!selected) return;
    try {
      await admin.updateUser(selected.id, { status: newStatus });
      notify('Status updated', `User is now ${newStatus}.`, 'success');
      setSelected({ ...selected, status: newStatus });
      load();
    } catch (err) {
      notify('Failed', err instanceof Error ? err.message : 'Update failed.', 'error');
    }
  };

  return (
    <>
      <div className="admin-search-bar">
        <input className="wd-input" placeholder="Search by username, name, or Telegram ID..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="primary-action" onClick={load}><Search size={15} /> Search</button>
      </div>
      <div className="admin-user-list">
        {users.map((u) => (
          <div className="admin-user-row" key={u.id} onClick={() => setSelected(u)}>
            <div className="referral-avatar">{u.first_name?.[0] ?? '?'}</div>
            <div className="admin-user-info">
              <strong>{u.first_name ?? u.username ?? 'Unknown'} <small>@{u.username ?? 'n/a'}</small></strong>
              <span>ID: {u.telegram_id} · {Number(u.balance).toLocaleString()} P · {u.status}</span>
            </div>
            <ChevronRight size={16} />
          </div>
        ))}
      </div>
      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div className="code-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelected(null)}><X size={18} /></button>
            <h2>User Details</h2>
            <div className="admin-user-detail">
              <div className="settings-row"><span>Name</span><strong>{selected.first_name ?? 'N/A'}</strong></div>
              <div className="settings-row"><span>Username</span><strong>@{selected.username ?? 'N/A'}</strong></div>
              <div className="settings-row"><span>Telegram ID</span><strong>{selected.telegram_id}</strong></div>
              <div className="settings-row"><span>Balance</span><strong>{Number(selected.balance).toLocaleString()} P</strong></div>
              <div className="settings-row"><span>Withdrawn</span><strong>${Number(selected.total_withdrawn).toFixed(2)}</strong></div>
              <div className="settings-row"><span>Status</span><strong style={{ color: selected.status === 'active' ? '#34d399' : '#fbbf24' }}>{selected.status}</strong></div>
              <div className="settings-row"><span>Mining count</span><strong>{selected.mining_count}</strong></div>
              <div className="settings-row"><span>Ads watched</span><strong>{selected.ads_watched}</strong></div>
              <div className="settings-row"><span>Tasks done</span><strong>{selected.tasks_completed}</strong></div>
              <div className="settings-row"><span>Referral code</span><strong>{selected.referral_code}</strong></div>
            </div>
            <div className="admin-adjust-section">
              <h3>Adjust Balance</h3>
              <div className="admin-adjust-row">
                <select className="wd-input" value={adjustType} onChange={(e) => setAdjustType(e.target.value as 'add' | 'subtract')}>
                  <option value="add">Add</option>
                  <option value="subtract">Subtract</option>
                </select>
                <input className="wd-input" type="number" placeholder="Amount" value={adjustAmount} onChange={(e) => setAdjustAmount(e.target.value)} />
                <button className="primary-action" onClick={handleAdjust}>Apply</button>
              </div>
            </div>
            <div className="admin-status-section">
              <h3>Change Status</h3>
              <div className="admin-status-buttons">
                <button onClick={() => handleStatusChange('active')}>Active</button>
                <button onClick={() => handleStatusChange('suspended')}>Suspend</button>
                <button onClick={() => handleStatusChange('banned')}>Ban</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function WithdrawalsTab({ notify }: { notify: Notifier }) {
  const [withdrawals, setWithdrawals] = useState<(Withdrawal & { user?: { username: string; first_name: string; telegram_id: number } })[]>([]);
  const [filter, setFilter] = useState('PENDING');
  const [selected, setSelected] = useState<typeof withdrawals[0] | null>(null);
  const [txHash, setTxHash] = useState('');
  const [explorerUrl, setExplorerUrl] = useState('');

  const load = async () => {
    try { setWithdrawals(await admin.getWithdrawals(filter) as typeof withdrawals); } catch { /* ignore */ }
  };
  useEffect(() => { load(); }, [filter]);

  const handleUpdate = async (status: string) => {
    if (!selected) return;
    try {
      await admin.updateWithdrawal(selected.id, status, txHash || undefined, explorerUrl || undefined);
      notify('Updated', `Withdrawal marked as ${status}.`, 'success');
      setSelected(null);
      setTxHash('');
      setExplorerUrl('');
      load();
    } catch (err) {
      notify('Failed', err instanceof Error ? err.message : 'Update failed.', 'error');
    }
  };

  const statusColors: Record<string, string> = {
    PENDING: '#fbbf24', PROCESSING: '#60a5fa', PAID: '#34d399', REJECTED: '#f87171', CANCELLED: '#94a3b8',
  };

  return (
    <>
      <div className="admin-filter-bar">
        {['PENDING', 'PROCESSING', 'PAID', 'REJECTED', 'CANCELLED'].map((s) => (
          <button key={s} className={filter === s ? 'active' : ''} onClick={() => setFilter(s)}>{s}</button>
        ))}
      </div>
      <div className="admin-wd-list">
        {withdrawals.length === 0 ? (
          <div className="wd-empty">No withdrawals with status {filter}.</div>
        ) : withdrawals.map((w) => (
          <div className="admin-wd-row" key={w.id} onClick={() => setSelected(w)}>
            <div className="admin-wd-left">
              <strong>{Number(w.amount_pilot).toLocaleString()} Pilot</strong>
              <span>${Number(w.amount_usdt).toFixed(4)} USDT · {w.user?.first_name ?? w.user?.username ?? 'Unknown'}</span>
              <small>{w.wallet_address.slice(0, 10)}...{w.wallet_address.slice(-6)}</small>
            </div>
            <b style={{ color: statusColors[w.status] ?? '#94a3b8' }}>{w.status}</b>
            <ChevronRight size={16} />
          </div>
        ))}
      </div>
      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div className="code-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelected(null)}><X size={18} /></button>
            <h2>Withdrawal Details</h2>
            <div className="admin-user-detail">
              <div className="settings-row"><span>User</span><strong>{selected.user?.first_name ?? selected.user?.username ?? 'Unknown'} (ID: {selected.user?.telegram_id})</strong></div>
              <div className="settings-row"><span>Amount</span><strong>{Number(selected.amount_pilot).toLocaleString()} Pilot = ${Number(selected.amount_usdt).toFixed(4)} USDT</strong></div>
              <div className="settings-row"><span>Fee</span><strong>${Number(selected.fee_usdt).toFixed(4)}</strong></div>
              <div className="settings-row"><span>Network</span><strong>{selected.network}</strong></div>
              <div className="settings-row"><span>Wallet</span><strong style={{ fontSize: 10, wordBreak: 'break-all' }}>{selected.wallet_address}</strong></div>
              <div className="settings-row"><span>Status</span><strong style={{ color: statusColors[selected.status] }}>{selected.status}</strong></div>
              <div className="settings-row"><span>Created</span><strong>{new Date(selected.created_at).toLocaleString()}</strong></div>
            </div>
            {selected.status === 'PENDING' && (
              <div className="admin-wd-actions">
                <input className="wd-input" placeholder="TX Hash (optional)" value={txHash} onChange={(e) => setTxHash(e.target.value)} />
                <input className="wd-input" placeholder="Explorer URL (optional)" value={explorerUrl} onChange={(e) => setExplorerUrl(e.target.value)} />
                <div className="admin-status-buttons">
                  <button onClick={() => handleUpdate('PAID')} className="approve-btn"><Check size={15} /> Mark Paid</button>
                  <button onClick={() => handleUpdate('PROCESSING')}>Processing</button>
                  <button onClick={() => handleUpdate('REJECTED')} className="reject-btn"><X size={15} /> Reject</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function TasksTab({ notify }: { notify: Notifier }) {
  const [tasks, setTasks] = useState<Record<string, unknown>[]>([]);
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    try { setTasks(await admin.getTasks()); } catch { /* ignore */ }
  };
  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string) => {
    try { await admin.deleteTask(id); notify('Deleted', 'Task removed.', 'success'); load(); }
    catch (err) { notify('Failed', err instanceof Error ? err.message : 'Delete failed.', 'error'); }
  };

  const handleToggle = async (task: Record<string, unknown>) => {
    try { await admin.updateTask(task.id as string, { enabled: !task.enabled }); load(); }
    catch (err) { notify('Failed', err instanceof Error ? err.message : 'Toggle failed.', 'error'); }
  };

  return (
    <>
      <button className="primary-action" onClick={() => setShowForm(!showForm)} style={{ marginBottom: 14 }}>
        {showForm ? 'Close' : '+ Create Task'}
      </button>
      {showForm && <TaskForm notify={notify} onDone={() => { setShowForm(false); load(); }} />}
      <div className="admin-list">
        {tasks.map((t) => (
          <div className="admin-list-row" key={t.id as string}>
            <div className="admin-list-info">
              <strong>{t.title as string}</strong>
              <span>{t.type as string} · +{t.reward as number} P · {t.enabled ? 'Enabled' : 'Disabled'}</span>
            </div>
            <div className="admin-list-actions">
              <button onClick={() => handleToggle(t)}>{t.enabled ? 'Disable' : 'Enable'}</button>
              <button onClick={() => handleDelete(t.id as string)} className="reject-btn"><X size={14} /></button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function TaskForm({ notify, onDone }: { notify: Notifier; onDone: () => void }) {
  const [form, setForm] = useState({ title: '', description: '', type: 'website', url: '', reward: '10', duration_seconds: '5' });
  const handleSubmit = async () => {
    try {
      await admin.createTask({
        title: form.title, description: form.description, type: form.type, url: form.url,
        reward: parseFloat(form.reward), duration_seconds: parseInt(form.duration_seconds),
        verification_method: 'timer', enabled: true,
      });
      notify('Created', 'Task created successfully.', 'success');
      onDone();
    } catch (err) {
      notify('Failed', err instanceof Error ? err.message : 'Create failed.', 'error');
    }
  };
  return (
    <div className="code-modal" style={{ position: 'static', marginBottom: 16 }}>
      <h2>Create Task</h2>
      <input className="wd-input" placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <input className="wd-input" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ marginTop: 8 }} />
      <select className="wd-input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} style={{ marginTop: 8 }}>
        <option value="website">Website</option>
        <option value="telegram_channel">Telegram Channel</option>
        <option value="telegram_group">Telegram Group</option>
        <option value="youtube">YouTube</option>
        <option value="custom">Custom</option>
      </select>
      <input className="wd-input" placeholder="URL" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} style={{ marginTop: 8 }} />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input className="wd-input" type="number" placeholder="Reward" value={form.reward} onChange={(e) => setForm({ ...form, reward: e.target.value })} />
        <input className="wd-input" type="number" placeholder="Duration (sec)" value={form.duration_seconds} onChange={(e) => setForm({ ...form, duration_seconds: e.target.value })} />
      </div>
      <button className="primary-action" onClick={handleSubmit} style={{ marginTop: 12, width: '100%' }}>Create Task</button>
    </div>
  );
}

function AdsTab({ notify }: { notify: Notifier }) {
  const [ads, setAds] = useState<Record<string, unknown>[]>([]);
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    try { setAds(await admin.getAds()); } catch { /* ignore */ }
  };
  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string) => {
    try { await admin.deleteAd(id); notify('Deleted', 'Ad removed.', 'success'); load(); }
    catch (err) { notify('Failed', err instanceof Error ? err.message : 'Delete failed.', 'error'); }
  };

  const handleToggle = async (ad: Record<string, unknown>) => {
    const newStatus = ad.status === 'active' ? 'paused' : 'active';
    try { await admin.updateAd(ad.id as string, { status: newStatus }); load(); }
    catch (err) { notify('Failed', err instanceof Error ? err.message : 'Toggle failed.', 'error'); }
  };

  return (
    <>
      <button className="primary-action" onClick={() => setShowForm(!showForm)} style={{ marginBottom: 14 }}>
        {showForm ? 'Close' : '+ Create Ad'}
      </button>
      {showForm && <AdForm notify={notify} onDone={() => { setShowForm(false); load(); }} />}
      <div className="admin-list">
        {ads.map((a) => (
          <div className="admin-list-row" key={a.id as string}>
            <div className="admin-list-info">
              <strong>{a.name as string}</strong>
              <span>{a.network as string} · +{a.reward as number} P · {a.status as string}</span>
            </div>
            <div className="admin-list-actions">
              <button onClick={() => handleToggle(a)}>{a.status === 'active' ? 'Pause' : 'Activate'}</button>
              <button onClick={() => handleDelete(a.id as string)} className="reject-btn"><X size={14} /></button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function AdForm({ notify, onDone }: { notify: Notifier; onDone: () => void }) {
  const [form, setForm] = useState({ name: '', network: 'adnetwork', zone_id: '', reward: '5', daily_limit: '30', cooldown_seconds: '30' });
  const handleSubmit = async () => {
    try {
      await admin.createAd({
        name: form.name, network: form.network, zone_id: form.zone_id,
        reward: parseFloat(form.reward), daily_limit: parseInt(form.daily_limit),
        cooldown_seconds: parseInt(form.cooldown_seconds), priority: 1, status: 'active',
      });
      notify('Created', 'Ad created successfully.', 'success');
      onDone();
    } catch (err) {
      notify('Failed', err instanceof Error ? err.message : 'Create failed.', 'error');
    }
  };
  return (
    <div className="code-modal" style={{ position: 'static', marginBottom: 16 }}>
      <h2>Create Ad</h2>
      <input className="wd-input" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <input className="wd-input" placeholder="Network" value={form.network} onChange={(e) => setForm({ ...form, network: e.target.value })} style={{ marginTop: 8 }} />
      <input className="wd-input" placeholder="Zone ID" value={form.zone_id} onChange={(e) => setForm({ ...form, zone_id: e.target.value })} style={{ marginTop: 8 }} />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input className="wd-input" type="number" placeholder="Reward" value={form.reward} onChange={(e) => setForm({ ...form, reward: e.target.value })} />
        <input className="wd-input" type="number" placeholder="Daily limit" value={form.daily_limit} onChange={(e) => setForm({ ...form, daily_limit: e.target.value })} />
      </div>
      <input className="wd-input" type="number" placeholder="Cooldown (sec)" value={form.cooldown_seconds} onChange={(e) => setForm({ ...form, cooldown_seconds: e.target.value })} style={{ marginTop: 8 }} />
      <button className="primary-action" onClick={handleSubmit} style={{ marginTop: 12, width: '100%' }}>Create Ad</button>
    </div>
  );
}

function CodesTab({ notify }: { notify: Notifier }) {
  const [codes, setCodes] = useState<Record<string, unknown>[]>([]);
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    try { setCodes(await admin.getRewardCodes()); } catch { /* ignore */ }
  };
  useEffect(() => { load(); }, []);

  const handleDelete = async (id: string) => {
    try { await admin.deleteRewardCode(id); notify('Deleted', 'Code removed.', 'success'); load(); }
    catch (err) { notify('Failed', err instanceof Error ? err.message : 'Delete failed.', 'error'); }
  };

  return (
    <>
      <button className="primary-action" onClick={() => setShowForm(!showForm)} style={{ marginBottom: 14 }}>
        {showForm ? 'Close' : '+ Create Code' }
      </button>
      {showForm && <CodeForm notify={notify} onDone={() => { setShowForm(false); load(); }} />}
      <div className="admin-list">
        {codes.map((c) => (
          <div className="admin-list-row" key={c.id as string}>
            <div className="admin-list-info">
              <strong>{c.code as string}</strong>
              <span>+{c.reward as number} P · {c.uses_count as number}/{c.max_uses as number} used · {c.status as string}</span>
            </div>
            <button onClick={() => handleDelete(c.id as string)} className="reject-btn"><X size={14} /></button>
          </div>
        ))}
      </div>
    </>
  );
}

function CodeForm({ notify, onDone }: { notify: Notifier; onDone: () => void }) {
  const [form, setForm] = useState({ code: '', reward: '100', max_uses: '100', per_user_limit: '1' });
  const handleSubmit = async () => {
    try {
      await admin.createRewardCode(form.code, parseFloat(form.reward), parseInt(form.max_uses), parseInt(form.per_user_limit));
      notify('Created', 'Reward code created.', 'success');
      onDone();
    } catch (err) {
      notify('Failed', err instanceof Error ? err.message : 'Create failed.', 'error');
    }
  };
  return (
    <div className="code-modal" style={{ position: 'static', marginBottom: 16 }}>
      <h2>Create Reward Code</h2>
      <input className="wd-input" placeholder="Code (e.g. PILOT2026)" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input className="wd-input" type="number" placeholder="Reward" value={form.reward} onChange={(e) => setForm({ ...form, reward: e.target.value })} />
        <input className="wd-input" type="number" placeholder="Max uses" value={form.max_uses} onChange={(e) => setForm({ ...form, max_uses: e.target.value })} />
      </div>
      <input className="wd-input" type="number" placeholder="Per user limit" value={form.per_user_limit} onChange={(e) => setForm({ ...form, per_user_limit: e.target.value })} style={{ marginTop: 8 }} />
      <button className="primary-action" onClick={handleSubmit} style={{ marginTop: 12, width: '100%' }}>Create Code</button>
    </div>
  );
}

function SettingsTab({ notify }: { notify: Notifier }) {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [updates, setUpdates] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      try {
        const s = await admin.getSettings() as SystemSettings;
        setSettings(s);
      } catch { /* ignore */ }
    })();
  }, []);

  const handleSave = async () => {
    const parsed: Record<string, number | string | boolean> = {};
    for (const [key, val] of Object.entries(updates)) {
      if (val === '' || val === undefined) continue;
      if (['mining_reward_per_hour', 'mining_duration_minutes', 'mining_daily_limit', 'ad_reward', 'ad_cooldown_seconds', 'ad_daily_limit', 'task_timer_seconds', 'referral_join_reward', 'referral_day1_reward', 'referral_day2_reward', 'referral_day1_ads', 'referral_day2_ads'].includes(key)) {
        parsed[key] = parseFloat(val);
      } else if (['pilot_usdt_rate', 'usdt_min_withdraw', 'usdt_max_withdraw', 'usdt_fee_percent', 'usdt_fee_fixed'].includes(key)) {
        parsed[key] = parseFloat(val);
      } else if (key === 'maintenance_mode') {
        parsed[key] = val === 'true';
      } else {
        parsed[key] = val;
      }
    }
    if (Object.keys(parsed).length === 0) { notify('No changes', 'Nothing to save.', 'info'); return; }
    try {
      await admin.updateSettings(parsed);
      notify('Settings saved', 'System settings updated successfully.', 'success');
      setUpdates({});
    } catch (err) {
      notify('Failed', err instanceof Error ? err.message : 'Save failed.', 'error');
    }
  };

  if (!settings) return <div className="wd-empty">Loading settings...</div>;

  const fields: { key: keyof SystemSettings; label: string; type: string }[] = [
    { key: 'mining_reward_per_hour', label: 'Mining reward per hour', type: 'number' },
    { key: 'mining_duration_minutes', label: 'Mining duration (minutes)', type: 'number' },
    { key: 'mining_daily_limit', label: 'Mining daily limit', type: 'number' },
    { key: 'ad_reward', label: 'Ad reward', type: 'number' },
    { key: 'ad_cooldown_seconds', label: 'Ad cooldown (seconds)', type: 'number' },
    { key: 'ad_daily_limit', label: 'Ad daily limit', type: 'number' },
    { key: 'task_timer_seconds', label: 'Task timer (seconds)', type: 'number' },
    { key: 'referral_join_reward', label: 'Referral join reward', type: 'number' },
    { key: 'referral_day1_reward', label: 'Referral Day 1 reward', type: 'number' },
    { key: 'referral_day2_reward', label: 'Referral Day 2 reward', type: 'number' },
    { key: 'pilot_usdt_rate', label: 'Pilot to USDT rate (100 P = rate×100 USDT)', type: 'number' },
    { key: 'usdt_min_withdraw', label: 'Min withdrawal (USDT)', type: 'number' },
    { key: 'usdt_max_withdraw', label: 'Max withdrawal (USDT)', type: 'number' },
    { key: 'usdt_fee_percent', label: 'Withdrawal fee (%)', type: 'number' },
    { key: 'usdt_fee_fixed', label: 'Withdrawal fixed fee (USDT)', type: 'number' },
    { key: 'usdt_network', label: 'USDT network', type: 'text' },
    { key: 'bot_username', label: 'Bot username', type: 'text' },
    { key: 'community_channel', label: 'Community channel URL', type: 'text' },
    { key: 'payment_channel', label: 'Payment channel URL', type: 'text' },
    { key: 'support_username', label: 'Support username', type: 'text' },
  ];

  return (
    <>
      <div className="admin-settings-grid">
        {fields.map(({ key, label, type }) => (
          <div className="admin-setting-row" key={key}>
            <label>{label}</label>
            <input
              className="wd-input"
              type={type}
              placeholder={String(settings[key] ?? '')}
              value={updates[key] ?? ''}
              onChange={(e) => setUpdates({ ...updates, [key]: e.target.value })}
            />
          </div>
        ))}
      </div>
      <button className="primary-action" onClick={handleSave} style={{ marginTop: 16, width: '100%' }}>
        <Check size={16} /> Save Settings
      </button>
    </>
  );
}

function LogsTab() {
  const [logs, setLogs] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    (async () => {
      try { setLogs(await admin.getAuditLogs()); } catch { /* ignore */ }
    })();
  }, []);
  return (
    <div className="admin-list">
      {logs.length === 0 ? (
        <div className="wd-empty">No audit logs yet.</div>
      ) : logs.map((log) => (
        <div className="admin-list-row" key={log.id as string}>
          <div className="admin-list-info">
            <strong>{log.action as string}</strong>
            <span>{new Date(log.created_at as string).toLocaleString()}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
