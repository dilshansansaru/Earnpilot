import { useState, useEffect } from 'react';
import {
  Play, Check, Target, ExternalLink, Clock, ShieldCheck, Loader2,
  Users, Gift, Star, Globe,
} from 'lucide-react';
import { GuideCard } from '@/components/ui';
import { getAds, completeAd, getTasks, startTask, claimTask, type AdItem, type TaskItem, type TelegramUser, type SystemSettings } from '@/lib/api';

const typeIcons: Record<string, typeof Target> = {
  telegram_channel: Users,
  telegram_group: Users,
  website: Globe,
  youtube: Play,
  instagram: Target,
  miniapp: Target,
  custom: Target,
};

const typeLabels: Record<string, string> = {
  telegram_channel: 'Telegram Channel',
  telegram_group: 'Telegram Group',
  website: 'Website Visit',
  youtube: 'YouTube',
  instagram: 'Instagram',
  miniapp: 'Mini App',
  custom: 'Custom Task',
};

function categorizeTask(task: TaskItem): 'main' | 'partner' | 'other' {
  if (task.type === 'website' || task.type === 'youtube' || task.type === 'miniapp') return 'main';
  if (task.type === 'telegram_channel' || task.type === 'telegram_group') return 'partner';
  return 'other';
}

export function EarnView({
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
  const [ads, setAds] = useState<AdItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [completedTaskIds, setCompletedTaskIds] = useState<string[]>([]);
  const [watchingAd, setWatchingAd] = useState<string | null>(null);
  const [adCooldown, setAdCooldown] = useState<Record<string, number>>({});
  const [taskTimers, setTaskTimers] = useState<Record<string, { sessionId: string; remaining: number }>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [adData, taskData] = await Promise.all([getAds(), getTasks()]);
        setAds(adData);
        setTasks(taskData.tasks);
        setCompletedTaskIds(taskData.completed);
      } catch { /* ignore */ }
    })();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setTaskTimers((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          if (next[key].remaining > 0) {
            next[key] = { ...next[key], remaining: next[key].remaining - 1 };
          }
        }
        return next;
      });
      setAdCooldown((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          if (next[key] > 0) next[key] = next[key] - 1;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleWatchAd = async (ad: AdItem) => {
    if (adCooldown[ad.id]) return;
    setWatchingAd(ad.id);
    setTimeout(async () => {
      try {
        const result = await completeAd(ad.id);
        notify('Ad verified', `+${(result as { reward: number }).reward} Pilot added to your balance.`, 'success');
        setAdCooldown((prev) => ({ ...prev, [ad.id]: ad.cooldown_seconds }));
        onRefresh();
      } catch (err) {
        notify('Ad failed', err instanceof Error ? err.message : 'Could not verify ad', 'error');
        setAdCooldown((prev) => ({ ...prev, [ad.id]: ad.cooldown_seconds }));
      }
      setWatchingAd(null);
    }, 3000);
  };

  const handleStartTask = async (task: TaskItem) => {
    if (completedTaskIds.includes(task.id) || taskTimers[task.id]) return;
    setLoading(true);
    try {
      if (task.url) {
        const tg = window.Telegram?.WebApp;
        if (tg && (task.type === 'telegram_channel' || task.type === 'telegram_group')) {
          tg.openTelegramLink(task.url);
        } else if (tg) {
          tg.openLink(task.url);
        } else {
          window.open(task.url, '_blank');
        }
      }
      const session = await startTask(task.id);
      setTaskTimers((prev) => ({ ...prev, [task.id]: { sessionId: session.id, remaining: task.duration_seconds } }));
    } catch (err) {
      notify('Cannot start', err instanceof Error ? err.message : 'Failed to start task', 'error');
    }
    setLoading(false);
  };

  const handleClaimTask = async (taskId: string) => {
    const timer = taskTimers[taskId];
    if (!timer || timer.remaining > 0) return;
    setLoading(true);
    try {
      const result = await claimTask(timer.sessionId);
      notify('Task completed', `+${(result as { reward: number }).reward} Pilot added to your balance.`, 'success');
      setCompletedTaskIds((prev) => [...prev, taskId]);
      setTaskTimers((prev) => {
        const next = { ...prev };
        delete next[taskId];
        return next;
      });
      onRefresh();
    } catch (err) {
      notify('Cannot claim', err instanceof Error ? err.message : 'Failed to claim task', 'error');
    }
    setLoading(false);
  };

  const renderAd = (ad: AdItem) => {
    const cd = adCooldown[ad.id] ?? 0;
    const isWatching = watchingAd === ad.id;
    return (
      <div className="task-card" key={ad.id}>
        <div className="task-icon cyan"><Play size={19} /></div>
        <div className="task-copy">
          <span>{ad.network.toUpperCase()}</span>
          <h3>{ad.name}</h3>
          <p>{ad.daily_limit > 0 ? `Limit: ${ad.daily_limit}/day` : 'Unlimited'} · {ad.cooldown_seconds}s cooldown</p>
        </div>
        <button
          className={cd > 0 || isWatching ? 'task-button-disabled' : 'task-button'}
          onClick={() => handleWatchAd(ad)}
          disabled={cd > 0 || isWatching}
        >
          {isWatching ? <><Loader2 size={14} className="spin" /> Watching...</> : cd > 0 ? <>{cd}s</> : <>+{ad.reward} <span>Pilot</span></>}
        </button>
      </div>
    );
  };

  const renderTask = (task: TaskItem) => {
    const Icon = typeIcons[task.type] ?? Target;
    const isCompleted = completedTaskIds.includes(task.id);
    const timer = taskTimers[task.id];
    const canClaim = timer && timer.remaining === 0;
    return (
      <div className="task-card" key={task.id}>
        <div className={`task-icon ${task.type === 'website' ? 'green' : 'blue'}`}><Icon size={19} /></div>
        <div className="task-copy">
          <span>{typeLabels[task.type] ?? 'Task'}</span>
          <h3>{task.title}</h3>
          <p>{task.description}</p>
        </div>
        {isCompleted ? (
          <button className="complete-button"><Check size={15} /> Done</button>
        ) : canClaim ? (
          <button className="task-button" onClick={() => handleClaimTask(task.id)} disabled={loading}>
            <Gift size={14} /> Claim +{task.reward}
          </button>
        ) : timer ? (
          <button className="task-button-disabled" disabled>{timer.remaining}s</button>
        ) : (
          <button className="task-button" onClick={() => handleStartTask(task)} disabled={loading}>
            Start <span>+{task.reward}</span>
          </button>
        )}
      </div>
    );
  };

  const mainTasks = tasks.filter(t => categorizeTask(t) === 'main');
  const partnerTasks = tasks.filter(t => categorizeTask(t) === 'partner');
  const otherTasks = tasks.filter(t => categorizeTask(t) === 'other');

  return (
    <>
      <div className="section-heading">
        <div>
          <span className="eyebrow">Available rewards</span>
          <h2>Earn Pilot</h2>
        </div>
        <span className="date-label">{ads.length + tasks.length} AVAILABLE</span>
      </div>

      <GuideCard
        title="How to earn Pilot"
        steps={[
          'Watch Ads: Click an ad, wait for it to finish, and your reward is verified automatically.',
          'Main Tasks: Visit websites and apps to earn Pilot rewards.',
          'Partner Tasks: Join Telegram channels and groups from our partners.',
          'Other Tasks: Special campaigns and custom tasks.',
          'All rewards are verified server-side before being credited to your balance.',
        ]}
      />

      {ads.length > 0 && (
        <>
          <h3 className="earn-section-title"><Play size={16} /> Watch Ads</h3>
          <div className="task-list">
            {ads.map(renderAd)}
          </div>
        </>
      )}

      {mainTasks.length > 0 && (
        <>
          <h3 className="earn-section-title"><Globe size={16} /> Main Tasks</h3>
          <div className="task-list">
            {mainTasks.map(renderTask)}
          </div>
        </>
      )}

      {partnerTasks.length > 0 && (
        <>
          <h3 className="earn-section-title"><Users size={16} /> Partner Tasks</h3>
          <div className="task-list">
            {partnerTasks.map(renderTask)}
          </div>
        </>
      )}

      {otherTasks.length > 0 && (
        <>
          <h3 className="earn-section-title"><Star size={16} /> Other Tasks</h3>
          <div className="task-list">
            {otherTasks.map(renderTask)}
          </div>
        </>
      )}

      {ads.length === 0 && tasks.length === 0 && (
        <div className="wd-empty" style={{ marginTop: 20 }}>No earning opportunities available right now. Check back soon!</div>
      )}

      <div className="verification-note">
        <ShieldCheck size={18} />
        <div>
          <strong>Rewards are verified</strong>
          <span>Every ad and task is checked server-side before Pilot is credited to your account.</span>
        </div>
      </div>

      <div className="earn-stats">
        <div className="mining-stat"><Play size={16} /><span>Ads watched</span><strong>{user.ads_watched}</strong></div>
        <div className="mining-stat"><Check size={16} /><span>Tasks completed</span><strong>{user.tasks_completed}</strong></div>
      </div>
    </>
  );
}
