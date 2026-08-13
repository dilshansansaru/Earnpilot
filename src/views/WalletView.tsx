import { useState, useEffect } from 'react';
import { Wallet, ShieldCheck, ArrowUpRight, CircleDollarSign, Clock, Check, X, ExternalLink } from 'lucide-react';
import { GuideCard } from '@/components/ui';
import { getWithdrawals, createWithdrawal, updateWallet, type Withdrawal, type TelegramUser, type SystemSettings } from '@/lib/api';

export function WalletView({
  user,
  settings,
  notify,
  onRefresh,
}: {
  user: TelegramUser;
  settings: SystemSettings | null;
  notify: (title: string, msg: string, type?: 'success' | 'error' | 'info') => void;
  onRefresh: () => void;
}) {
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [amount, setAmount] = useState('');
  const [walletAddr, setWalletAddr] = useState(user.usdt_wallet ?? '');
  const [loading, setLoading] = useState(false);

  const rate = settings?.pilot_usdt_rate ?? 0.0001;
  const minPilot = Math.ceil((settings?.usdt_min_withdraw ?? 0.1) / rate);
  const maxPilot = Math.ceil((settings?.usdt_max_withdraw ?? 100) / rate);
  const feePercent = settings?.usdt_fee_percent ?? 7;
  const feeFixed = settings?.usdt_fee_fixed ?? 0.01;

  useEffect(() => {
    (async () => {
      try {
        const data = await getWithdrawals();
        setWithdrawals(data);
      } catch { /* ignore */ }
    })();
  }, []);

  const pilotAmount = parseFloat(amount) || 0;
  const usdtValue = pilotAmount * rate;
  const feeUsdt = feeFixed + (usdtValue * feePercent / 100);
  const netUsdt = usdtValue - feeUsdt;

  const handleWithdraw = async () => {
    if (pilotAmount < minPilot) {
      notify('Too low', `Minimum withdrawal is ${minPilot} Pilot.`, 'error');
      return;
    }
    if (pilotAmount > maxPilot) {
      notify('Too high', `Maximum withdrawal is ${maxPilot} Pilot.`, 'error');
      return;
    }
    if (!walletAddr || walletAddr.length < 10) {
      notify('Invalid wallet', 'Please enter a valid BEP20 wallet address.', 'error');
      return;
    }
    setLoading(true);
    try {
      await updateWallet(walletAddr);
      const result = await createWithdrawal(pilotAmount, walletAddr);
      notify('Withdrawal requested', `${pilotAmount} Pilot → $${(result as { withdrawal: { amount_usdt: number } }).withdrawal.amount_usdt.toFixed(4)} USDT pending review.`, 'success');
      setAmount('');
      onRefresh();
      const data = await getWithdrawals();
      setWithdrawals(data);
    } catch (err) {
      notify('Withdrawal failed', err instanceof Error ? err.message : 'Could not process withdrawal', 'error');
    }
    setLoading(false);
  };

  const statusColors: Record<string, string> = {
    PENDING: '#fbbf24',
    PROCESSING: '#60a5fa',
    PAID: '#34d399',
    REJECTED: '#f87171',
    CANCELLED: '#94a3b8',
  };

  return (
    <>
      <div className="section-heading">
        <div>
          <span className="eyebrow">Your earnings</span>
          <h2>Wallet</h2>
        </div>
        <span className="secure-label"><ShieldCheck size={14} /> Secure</span>
      </div>

      <GuideCard
        title="How withdrawals work"
        steps={[
          `100 Pilot = $${(100 * rate).toFixed(4)} USDT on BEP20 network.`,
          `Minimum withdrawal is ${minPilot} Pilot ($${(minPilot * rate).toFixed(4)} USDT).`,
          `Fee: $${feeFixed.toFixed(2)} fixed + ${feePercent}% of the withdrawal amount.`,
          'Enter your BEP20 wallet address and the Pilot amount.',
          'Your request goes to admin review, then payment is sent to your wallet.',
        ]}
      />

      <div className="wallet-card">
        <div>
          <span>Available balance</span>
          <strong>{Number(user.balance).toLocaleString()} <small>PILOT</small></strong>
          <p>≈ ${(Number(user.balance) * rate).toFixed(4)} USDT · BEP20</p>
        </div>
        <CircleDollarSign size={37} />
      </div>

      <div className="withdrawal-form-card">
        <h3><Wallet size={18} /> Withdraw USDT</h3>
        <div className="wd-warning">
          <ShieldCheck size={14} /> Only send USDT to a BEP20-compatible wallet. Other networks may cause permanent loss.
        </div>

        <label className="wd-label">Wallet Address (BEP20)</label>
        <input
          className="wd-input"
          type="text"
          placeholder="0x... BEP20 address"
          value={walletAddr}
          onChange={(e) => setWalletAddr(e.target.value)}
        />

        <label className="wd-label">Amount (Pilot)</label>
        <input
          className="wd-input"
          type="number"
          placeholder={`Min: ${minPilot} Pilot`}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />

        <div className="wd-summary">
          <div><span>Pilot amount</span><strong>{pilotAmount || 0} P</strong></div>
          <div><span>USDT value</span><strong>${usdtValue.toFixed(4)}</strong></div>
          <div><span>Fee ({feePercent}% + ${feeFixed})</span><strong>-${feeUsdt.toFixed(4)}</strong></div>
          <div className="wd-net"><span>You receive</span><strong>${netUsdt.toFixed(4)}</strong></div>
        </div>

        <button className="primary-action wd-submit" onClick={handleWithdraw} disabled={loading || pilotAmount < minPilot}>
          {loading ? 'Processing...' : <>Request withdrawal <ArrowUpRight size={16} /></>}
        </button>
      </div>

      <div className="wallet-history">
        <span className="eyebrow">Withdrawal history</span>
        {withdrawals.length === 0 ? (
          <div className="wd-empty">No withdrawals yet.</div>
        ) : (
          withdrawals.map((w) => (
            <div className="wd-row" key={w.id}>
              <div className="wd-row-left">
                <strong>{Number(w.amount_pilot).toLocaleString()} Pilot</strong>
                <span>${Number(w.amount_usdt).toFixed(4)} USDT · {w.network}</span>
                <small>{new Date(w.created_at).toLocaleDateString()}</small>
              </div>
              <div className="wd-row-right">
                <b style={{ color: statusColors[w.status] ?? '#94a3b8' }}>{w.status}</b>
                {w.explorer_url && (
                  <a href={w.explorer_url} target="_blank" rel="noopener noreferrer" className="wd-tx-link">
                    <ExternalLink size={13} /> View TX
                  </a>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
