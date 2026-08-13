import { useState, useEffect } from 'react';
import { Users, Copy, Sparkles, ChevronRight, Check, Gift } from 'lucide-react';
import { useToast, GuideCard } from '@/components/ui';
import { getReferrals, type Referral, type TelegramUser, type SystemSettings } from '@/lib/api';

export function ReferView({
  user,
  settings,
  notify,
}: {
  user: TelegramUser;
  settings: SystemSettings | null;
  notify: (title: string, msg: string, type?: 'success' | 'error' | 'info') => void;
}) {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await getReferrals();
        setReferrals(data);
      } catch { /* ignore */ }
    })();
  }, []);

  const botUsername = settings?.bot_username ?? 'Earn_pilot_1bot';
  const referralLink = `https://t.me/${botUsername}/earnpilot?startapp=${user.referral_code}`;

  const copyLink = () => {
    navigator.clipboard?.writeText(referralLink).then(() => {
      setCopied(true);
      notify('Referral link copied', 'Share it with your friends to earn Pilot rewards.', 'success');
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const joinReward = settings?.referral_join_reward ?? 25;
  const day1Reward = settings?.referral_day1_reward ?? 50;
  const day2Reward = settings?.referral_day2_reward ?? 75;
  const day1Ads = settings?.referral_day1_ads ?? 10;
  const day2Ads = settings?.referral_day2_ads ?? 15;

  const totalEarned = referrals.length * joinReward +
    referrals.filter(r => r.day1_reward_paid).length * day1Reward +
    referrals.filter(r => r.day2_reward_paid).length * day2Reward;

  return (
    <>
      <div className="section-heading">
        <div>
          <span className="eyebrow">Grow your crew</span>
          <h2>Refer & earn</h2>
        </div>
        <span className="date-label">{referrals.length} FRIENDS</span>
      </div>

      <GuideCard
        title="How referrals work"
        steps={[
          `Share your referral link with friends.`,
          `When they join EarnPilot, you get +${joinReward} Pilot instantly.`,
          `When they watch ${day1Ads} verified ads on Day 1, you get +${day1Reward} Pilot.`,
          `When they watch ${day2Ads} verified ads on Day 2, you get +${day2Reward} Pilot.`,
          `Each milestone is paid only once per referral.`,
        ]}
      />

      <div className="referral-card">
        <div className="referral-stars"><Sparkles size={20} /><Sparkles size={12} /><Sparkles size={15} /></div>
        <span className="eyebrow">Your referral reward</span>
        <strong>+{joinReward} <small>Pilot</small></strong>
        <p>For every new pilot who joins with your link.</p>
        <button onClick={copyLink}>
          {copied ? <><Check size={16} /> Copied!</> : <><Copy size={16} /> Copy referral link</>}
        </button>
        <div className="referral-link-display">{referralLink}</div>
      </div>

      <div className="referral-steps">
        <div><span>01</span><strong>Share link</strong><small>Invite friends</small></div>
        <ChevronRight size={18} />
        <div><span>02</span><strong>They join</strong><small>+{joinReward} Pilot for you</small></div>
        <ChevronRight size={18} />
        <div><span>03</span><strong>They earn</strong><small>+{day1Reward} +{day2Reward} more</small></div>
      </div>

      <div className="referral-summary">
        <div className="referral-summary-stat">
          <Users size={18} />
          <strong>{referrals.length}</strong>
          <span>Total referrals</span>
        </div>
        <div className="referral-summary-stat">
          <Gift size={18} />
          <strong>{totalEarned}</strong>
          <span>Pilot earned</span>
        </div>
      </div>

      {referrals.length > 0 && (
        <div className="referral-list">
          <h3>Your referrals</h3>
          {referrals.map((ref) => (
            <div className="referral-row" key={ref.id}>
              <div className="referral-avatar">
                {ref.referred?.photo_url ? <img src={ref.referred.photo_url} alt="" /> : <Users size={16} />}
              </div>
              <div className="referral-info">
                <strong>{ref.referred?.username || ref.referred?.first_name || 'Anonymous'}</strong>
                <span>{new Date(ref.created_at).toLocaleDateString()}</span>
              </div>
              <div className="referral-badges">
                {ref.join_reward_paid && <span className="ref-badge paid">+{joinReward}</span>}
                {ref.day1_reward_paid && <span className="ref-badge paid">+{day1Reward}</span>}
                {ref.day2_reward_paid && <span className="ref-badge paid">+{day2Reward}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
