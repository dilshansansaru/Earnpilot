import { useState, useEffect, useRef } from 'react';
import { Zap, Play, Pause, Clock, Gift, Check, ArrowUpRight, Users, Target } from 'lucide-react';
import { useToast, GuideCard } from '@/components/ui';
import { startMining, claimMining, getActiveMining, type MiningSession, type SystemSettings, type TelegramUser } from '@/lib/api';

export function MiningView({
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
  const [session, setSession] = useState<MiningSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const duration = settings?.mining_duration_minutes ?? 60;
  const reward = settings?.mining_reward_per_hour ?? 10;

  useEffect(() => {
    (async () => {
      try {
        const active = await getActiveMining();
        setSession(active);
      } catch { /* ignore */ }
    })();
  }, []);

  useEffect(() => {
    if (session && session.status === 'ACTIVE') {
      const update = () => {
        const now = Date.now();
        const start = new Date(session.started_at).getTime();
        const expire = new Date(session.expires_at).getTime();
        const elapsedSec = Math.floor((now - start) / 1000);
        const totalSec = Math.floor((expire - start) / 1000);
        setElapsed(elapsedSec);
        setIsComplete(now >= expire);

        if (now >= expire && timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      };
      update();
      timerRef.current = setInterval(update, 1000);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
  }, [session]);

  const handleStart = async () => {
    setLoading(true);
    try {
      const result = await startMining();
      setSession(result.session);
      setIsComplete(false);
      notify('Mining started', `Your ${duration}-minute session is now active. Earn +${reward} Pilot.`, 'success');
    } catch (err) {
      notify('Cannot start', err instanceof Error ? err.message : 'Failed to start mining', 'error');
    }
    setLoading(false);
  };

  const handleClaim = async () => {
    if (!session) return;
    setLoading(true);
    try {
      await claimMining(session.id);
      notify('Mining reward claimed', `+${reward} Pilot added to your balance.`, 'success');
      setSession(null);
      setIsComplete(false);
      setElapsed(0);
      onRefresh();
    } catch (err) {
      notify('Cannot claim', err instanceof Error ? err.message : 'Failed to claim', 'error');
    }
    setLoading(false);
  };

  const totalSec = session ? Math.floor((new Date(session.expires_at).getTime() - new Date(session.started_at).getTime()) / 1000) : duration * 60;
  const progress = totalSec > 0 ? Math.min(100, (elapsed / totalSec) * 100) : 0;
  const remainingSec = Math.max(0, totalSec - elapsed);
  const mins = Math.floor(remainingSec / 60);
  const secs = remainingSec % 60;

  return (
    <>
      <div className="section-heading">
        <div>
          <span className="eyebrow">Pilot engine</span>
          <h2>Hourly mining</h2>
        </div>
        <span className={`status-badge ${session ? 'active-status' : ''}`}>{session ? 'Active' : 'Idle'}</span>
      </div>

      <GuideCard
        title="How mining works"
        steps={[
          'Click Start Mining to begin a session.',
          `Each session lasts ${duration} minutes and earns ${reward} Pilot.`,
          'Mining does NOT restart automatically.',
          'When the timer reaches zero, click Claim Reward.',
          'Then start a new session to keep earning.',
        ]}
      />

      <div className="mining-panel">
        <div className="mining-ring">
          <div>
            <Zap size={28} />
            <strong>{session ? `${mins}:${secs.toString().padStart(2, '0')}` : `${duration}:00`}</strong>
            <span>{session ? (isComplete ? 'complete' : 'remaining') : 'per session'}</span>
          </div>
          {session && (
            <svg className="ring-progress" width="188" height="188" viewBox="0 0 188 188">
              <circle cx="94" cy="94" r="90" fill="none" stroke="rgba(37,224,191,0.1)" strokeWidth="2" />
              <circle
                cx="94" cy="94" r="90" fill="none" stroke="url(#ringGrad)" strokeWidth="2"
                strokeDasharray={2 * Math.PI * 90}
                strokeDashoffset={2 * Math.PI * 90 * (1 - progress / 100)}
                strokeLinecap="round"
                transform="rotate(-90 94 94)"
              />
              <defs>
                <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#23e4a7" />
                  <stop offset="100%" stopColor="#31d5d3" />
                </linearGradient>
              </defs>
            </svg>
          )}
        </div>

        <h3>{session ? (isComplete ? 'Mining complete!' : 'Mining in progress...') : 'Ready for takeoff?'}</h3>
        <p>
          {session
            ? isComplete
              ? 'Your session is complete. Claim your reward now to add Pilot to your balance.'
              : 'Keep this page open. Your engine is collecting Pilot passively.'
            : `Start a ${duration}-minute mining session and earn ${reward} Pilot. You must claim manually when done.`}
        </p>

        {!session && (
          <button className="primary-action" onClick={handleStart} disabled={loading}>
            <Play size={17} /> Start mining
          </button>
        )}
        {session && !isComplete && (
          <button className="pause-button" onClick={() => notify('Mining running', 'Your session is still active.', 'info')}>
            <Pause size={16} /> Mining active
          </button>
        )}
        {session && isComplete && (
          <button className="primary-action" onClick={handleClaim} disabled={loading}>
            <Gift size={17} /> Claim +{reward} Pilot
          </button>
        )}

        <div className="mining-rules">
          <span><Check size={14} /> No auto restart</span>
          <span><Check size={14} /> One session at a time</span>
          <span><Check size={14} /> +{reward} Pilot reward</span>
        </div>
      </div>

      <div className="mining-stats">
        <div className="mining-stat"><Clock size={16} /><span>Total sessions</span><strong>{user.mining_count}</strong></div>
        <div className="mining-stat"><Zap size={16} /><span>Current reward</span><strong>{reward} P/hr</strong></div>
        <div className="mining-stat"><Target size={16} /><span>Session length</span><strong>{duration} min</strong></div>
      </div>
    </>
  );
}
