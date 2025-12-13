import { useState, useEffect, memo } from 'react';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { backendApi, ContinuousFarmingStatus, ContinuousFarmingWave } from '../api/backend';
import { useToast } from './Toast';

// Animated spinner
const Spinner = memo(({ color = 'var(--yellow)', size = '1rem' }: { color?: string; size?: string }) => {
  const [frame, setFrame] = useState(0);
  const frames = ['|', '/', '-', '\\'];

  useEffect(() => {
    const interval = setInterval(() => setFrame(f => (f + 1) % frames.length), 150);
    return () => clearInterval(interval);
  }, []);

  return <span style={{ fontFamily: 'monospace', color, fontSize: size }}>{frames[frame]}</span>;
});
Spinner.displayName = 'Spinner';

// Format numbers with commas
const formatNumber = (num: number) => num.toLocaleString('en-US');

// Format duration
const formatDuration = (ms: number) => {
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

// Format relative time
const formatRelativeTime = (timestamp: number) => {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m ago`;
};

const ContinuousFarmingPanelComponent = () => {
  const { connected, account } = useWallet();
  const { showToast } = useToast();
  const [status, setStatus] = useState<ContinuousFarmingStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [userBalance, setUserBalance] = useState<number | null>(null);

  // Fetch continuous farming status
  useEffect(() => {
    if (!connected || !account?.address) {
      setStatus(null);
      return;
    }

    const fetchStatus = async () => {
      try {
        const data = await backendApi.getContinuousFarmingStatus(account.address.toString());
        setStatus(data);
      } catch (err) {
        // Silently fail
      }
    };

    fetchStatus();
    // Poll every 30 seconds (continuous farming has longer cycles)
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [connected, account?.address]);

  // Fetch user balance
  useEffect(() => {
    if (!connected || !account?.address) {
      setUserBalance(null);
      return;
    }

    const fetchBalance = async () => {
      try {
        const economy = await backendApi.getEconomy();
        const userEntry = economy.leaderboard.find(
          e => e.address.toLowerCase() === account.address.toString().toLowerCase()
        );
        setUserBalance(userEntry?.balance || 0);
      } catch (err) {
        // Silently fail
      }
    };

    fetchBalance();
    // Poll more frequently when farming is active
    const pollInterval = status?.active ? 30000 : 60000;
    const interval = setInterval(fetchBalance, pollInterval);
    return () => clearInterval(interval);
  }, [connected, account?.address, status?.active]);

  const handleStart = async () => {
    if (!connected || !account?.address) {
      showToast({ type: 'error', message: 'Please connect your wallet first' });
      return;
    }

    setIsStarting(true);
    try {
      const job = await backendApi.startContinuousFarming(account.address.toString());
      showToast({
        type: 'success',
        message: `Continuous farming started! First wave deploying to ${job.config.regions.length} regions...`,
        duration: 6000,
      });
      // Refresh status
      const newStatus = await backendApi.getContinuousFarmingStatus(account.address.toString());
      setStatus(newStatus);
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to start continuous farming',
      });
    } finally {
      setIsStarting(false);
    }
  };

  const handleStop = async () => {
    if (!status?.job) return;

    setIsStopping(true);
    try {
      await backendApi.stopContinuousFarming(status.job.id);
      showToast({
        type: 'success',
        message: `Farming stopped. Total minted: ${formatNumber(status.job.total_minted / 1e8)} ShelbyUSD`,
        duration: 6000,
      });
      // Refresh status
      const newStatus = await backendApi.getContinuousFarmingStatus(account!.address.toString());
      setStatus(newStatus);
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to stop farming',
      });
    } finally {
      setIsStopping(false);
    }
  };

  const formatBalance = (balance: number) => {
    const shelbyUSD = balance / 100_000_000;
    return shelbyUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const job = status?.job;
  const waves = status?.waves || [];

  return (
    <column box-="round" pad-="1" gap-="1" style={{ marginBottom: '1rem' }}>
      {/* Header */}
      <row align-="between" style={{ flexWrap: 'wrap', gap: '0.75rem', marginLeft: '-0.25rem' }}>
        <column gap-="0.25">
          <row gap-="0.5" align-="center">
            <span is-="badge" variant-="blue" cap-="round">AUTO FARMING</span>
            {status?.active && <span is-="badge" variant-="success" cap-="round" size-="half">ACTIVE</span>}
            {isStopping && <span is-="badge" variant-="red" cap-="round" size-="half">STOPPING</span>}
          </row>
          <small style={{ color: 'var(--foreground2)' }}>
            Set and forget - farms continuously across multiple regions
          </small>
        </column>

        {/* Balance display */}
        {connected && userBalance !== null && (
          <column gap-="0.15" style={{ textAlign: 'right' }}>
            <small style={{ color: 'var(--foreground2)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Your Balance</small>
            <row gap-="0.35" align-="center" style={{ justifyContent: 'flex-end' }}>
              <img
                src="/shelby-token.png"
                alt=""
                style={{ width: 18, height: 18, borderRadius: '50%' }}
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
              <span style={{ color: 'var(--pink)', fontWeight: 700, fontSize: '1.1rem', fontFamily: 'monospace' }}>
                {formatBalance(userBalance)}
              </span>
            </row>
          </column>
        )}
      </row>

      <hr style={{ border: 'none', borderTop: '1px solid var(--background2)', margin: 0 }} />

      {/* Not Connected */}
      {!connected ? (
        <column gap-="0.5" style={{ padding: '1rem', background: 'var(--background)', borderRadius: '4px' }}>
          <row gap-="0.5" align-="center">
            <span style={{ color: 'var(--yellow)', fontSize: '1.25rem', fontFamily: 'monospace' }}>!</span>
            <span style={{ fontWeight: 600 }}>Wallet Not Connected</span>
          </row>
          <small style={{ color: 'var(--foreground2)' }}>
            Connect your wallet to start continuous farming.
          </small>
        </column>
      ) : !status?.active ? (
        /* IDLE - Ready to start */
        <column gap-="1">
          {/* How it works */}
          <column gap-="0.5">
            <small style={{ color: 'var(--foreground2)', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.7rem' }}>
              How Continuous Farming Works
            </small>
            <column gap-="0.35" style={{ fontSize: '0.85rem', color: 'var(--foreground2)' }}>
              <row gap-="0.5">
                <span style={{ color: 'var(--blue)' }}>1.</span>
                <span>Deploys waves of bots across <strong style={{ color: 'var(--foreground)' }}>4 global regions</strong></span>
              </row>
              <row gap-="0.5">
                <span style={{ color: 'var(--blue)' }}>2.</span>
                <span>New wave every <strong style={{ color: 'var(--foreground)' }}>5 minutes</strong> automatically</span>
              </row>
              <row gap-="0.5">
                <span style={{ color: 'var(--blue)' }}>3.</span>
                <span>Runs until you stop it - <strong style={{ color: 'var(--foreground)' }}>no browser needed</strong></span>
              </row>
              <row gap-="0.5">
                <span style={{ color: 'var(--blue)' }}>4.</span>
                <span>Come back anytime to check progress</span>
              </row>
            </column>
          </column>

          {/* Stats grid */}
          <row style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
            <column gap-="0.15" style={{ padding: '0.75rem', background: 'var(--background)', borderRadius: '4px', textAlign: 'center' }}>
              <small style={{ color: 'var(--foreground2)', fontSize: '0.65rem', textTransform: 'uppercase' }}>Est. Per Wave</small>
              <span style={{ fontWeight: 700, color: 'var(--green)', fontFamily: 'monospace', fontSize: '1rem' }}>
                ~4,000
              </span>
              <small style={{ color: 'var(--foreground2)', fontSize: '0.65rem' }}>ShelbyUSD</small>
            </column>
            <column gap-="0.15" style={{ padding: '0.75rem', background: 'var(--background)', borderRadius: '4px', textAlign: 'center' }}>
              <small style={{ color: 'var(--foreground2)', fontSize: '0.65rem', textTransform: 'uppercase' }}>Wave Interval</small>
              <span style={{ fontWeight: 700, color: 'var(--yellow)', fontFamily: 'monospace', fontSize: '1.1rem' }}>
                5
              </span>
              <small style={{ color: 'var(--foreground2)', fontSize: '0.65rem' }}>minutes</small>
            </column>
            <column gap-="0.15" style={{ padding: '0.75rem', background: 'var(--background)', borderRadius: '4px', textAlign: 'center' }}>
              <small style={{ color: 'var(--foreground2)', fontSize: '0.65rem', textTransform: 'uppercase' }}>Regions</small>
              <span style={{ fontWeight: 700, color: 'var(--blue)', fontFamily: 'monospace', fontSize: '1.1rem' }}>
                4
              </span>
              <small style={{ color: 'var(--foreground2)', fontSize: '0.65rem' }}>global</small>
            </column>
          </row>

          <small style={{ color: 'var(--foreground2)', fontSize: '0.75rem', fontStyle: 'italic' }}>
            * Yields vary based on faucet rate limiting. Each region gets different IPs.
          </small>

          {/* Start button */}
          <button
            onClick={handleStart}
            disabled={isStarting}
            style={{
              width: '100%',
              padding: '0.85rem 1.5rem',
              background: isStarting ? 'var(--background2)' : 'linear-gradient(135deg, #3B82F6, #60A5FA)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: isStarting ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              fontSize: '1rem',
              fontWeight: 700,
            }}
          >
            {isStarting ? (
              <row gap-="0.5" align-="center" style={{ justifyContent: 'center' }}>
                <Spinner color="white" />
                <span>Starting...</span>
              </row>
            ) : (
              '>> START CONTINUOUS FARMING'
            )}
          </button>
        </column>
      ) : (
        /* ACTIVE - Show job status */
        <column gap-="0.75">
          {/* Active indicator */}
          <column gap-="0.5" style={{ padding: '1rem', background: 'var(--background)', borderRadius: '4px' }}>
            <row gap-="0.5" align-="center">
              <Spinner color="var(--green)" size="1rem" />
              <span style={{ fontWeight: 600, color: 'var(--green)' }}>Farming Active</span>
              <span style={{ color: 'var(--foreground2)', fontSize: '0.85rem', marginLeft: 'auto' }}>
                {status.runningTime}
              </span>
            </row>
            <small style={{ color: 'var(--foreground2)' }}>
              Next wave in {job?.config.waveIntervalMs ? Math.ceil((job.config.waveIntervalMs - (Date.now() - (job.last_wave_at || job.started_at))) / 60000) : 5} min
            </small>
          </column>

          {/* Stats grid */}
          <row style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
            <column gap-="0.15" style={{ padding: '0.75rem', background: 'var(--background)', borderRadius: '4px' }}>
              <small style={{ color: 'var(--foreground2)', fontSize: '0.65rem', textTransform: 'uppercase' }}>Total Minted</small>
              <span style={{ fontWeight: 700, color: 'var(--pink)', fontFamily: 'monospace', fontSize: '1.25rem' }}>
                {formatNumber(Math.round((job?.total_minted || 0) / 1e8))}
              </span>
              <small style={{ color: 'var(--foreground2)', fontSize: '0.65rem' }}>ShelbyUSD</small>
            </column>
            <column gap-="0.15" style={{ padding: '0.75rem', background: 'var(--background)', borderRadius: '4px' }}>
              <small style={{ color: 'var(--foreground2)', fontSize: '0.65rem', textTransform: 'uppercase' }}>Waves Completed</small>
              <span style={{ fontWeight: 700, color: 'var(--blue)', fontFamily: 'monospace', fontSize: '1.25rem' }}>
                {job?.waves_completed || 0}
              </span>
              <small style={{ color: 'var(--foreground2)', fontSize: '0.65rem' }}>
                {job?.droplets_created || 0} droplets total
              </small>
            </column>
          </row>

          {/* Recent waves */}
          {waves.length > 0 && (
            <column gap-="0.5">
              <small style={{ color: 'var(--foreground2)', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.7rem' }}>
                Recent Waves
              </small>
              <column gap-="0.25" style={{ maxHeight: '120px', overflow: 'auto' }}>
                {waves.slice(0, 5).map((wave) => (
                  <row
                    key={wave.id}
                    align-="between"
                    style={{
                      padding: '0.5rem',
                      background: 'var(--background)',
                      borderRadius: '4px',
                      fontSize: '0.8rem',
                    }}
                  >
                    <span style={{ color: 'var(--foreground2)' }}>Wave #{wave.wave_number}</span>
                    <span style={{ color: 'var(--green)', fontFamily: 'monospace' }}>
                      +{formatNumber(Math.round(wave.estimated_minted / 1e8))} ShelbyUSD
                    </span>
                    <span style={{ color: 'var(--foreground2)', fontSize: '0.75rem' }}>
                      {wave.droplets_succeeded}/{wave.total_droplets} bots
                    </span>
                  </row>
                ))}
              </column>
            </column>
          )}

          {/* Stop button */}
          <button
            onClick={handleStop}
            disabled={isStopping}
            style={{
              width: '100%',
              padding: '0.75rem 1.5rem',
              background: 'transparent',
              color: 'var(--red)',
              border: '1px solid var(--red)',
              borderRadius: '6px',
              cursor: isStopping ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              fontSize: '0.9rem',
              fontWeight: 600,
            }}
          >
            {isStopping ? (
              <row gap-="0.5" align-="center" style={{ justifyContent: 'center' }}>
                <Spinner color="var(--red)" />
                <span>Stopping...</span>
              </row>
            ) : (
              '|| STOP FARMING'
            )}
          </button>
        </column>
      )}
    </column>
  );
};

export const ContinuousFarmingPanel = memo(ContinuousFarmingPanelComponent);
