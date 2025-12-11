import { useState, useEffect, useRef, memo } from 'react';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { backendApi, FarmingSession, FarmingOverview, UserDeposit } from '../api/backend';
import { useToast } from './Toast';

type FarmingState = 'idle' | 'starting' | 'running' | 'stopping' | 'complete';

// Number of bots to always deploy (max)
const DEFAULT_NUM_NODES = 10;

// Simple progress bar component
const ProgressBar = memo(({ percent, color = 'var(--green)' }: { percent: number; color?: string }) => {
  return (
    <div style={{
      width: '100%',
      height: '8px',
      background: 'var(--background2)',
      borderRadius: '4px',
      overflow: 'hidden',
    }}>
      <div style={{
        width: `${Math.min(100, percent)}%`,
        height: '100%',
        background: color,
        transition: 'width 0.3s ease',
      }} />
    </div>
  );
});
ProgressBar.displayName = 'ProgressBar';

// Animated spinner
const Spinner = memo(({ color = 'var(--yellow)', size = '1rem' }: { color?: string; size?: string }) => {
  const [frame, setFrame] = useState(0);
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

  useEffect(() => {
    const interval = setInterval(() => setFrame(f => (f + 1) % frames.length), 80);
    return () => clearInterval(interval);
  }, []);

  return <span style={{ fontFamily: 'monospace', color, fontSize: size }}>{frames[frame]}</span>;
});
Spinner.displayName = 'Spinner';

// Boot time for droplets to come online and start the script
const BOT_BOOT_TIME_MS = 45 * 1000; // ~45 seconds to boot
// Each bot makes 50 requests with 2s delay = ~100s minting time
const BOT_MINTING_TIME_MS = 105 * 1000; // ~105 seconds to mint
// Total expected duration
const EXPECTED_BOT_DURATION_MS = BOT_BOOT_TIME_MS + BOT_MINTING_TIME_MS; // ~150 seconds total

// Session summary data
interface SessionSummary {
  minted: number;
  duration: number;
  bots: number;
}

const FarmingPanelComponent = () => {
  const { connected, account, connect, wallets } = useWallet();
  const { showToast } = useToast();
  const [farmingState, setFarmingState] = useState<FarmingState>('idle');
  const [sessions, setSessions] = useState<FarmingSession[]>([]);
  const [overview, setOverview] = useState<FarmingOverview | null>(null);
  const [totalMinted, setTotalMinted] = useState(0);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [progressPercent, setProgressPercent] = useState(0);
  const [userBalance, setUserBalance] = useState<number | null>(null);
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  const [activeBots, setActiveBots] = useState(0);
  const lastSeenVersionRef = useRef<string | null>(null);
  // Track if user manually started farming in this browser session
  const userStartedFarmingRef = useRef(false);
  // Prevent duplicate completion toasts
  const completedRef = useRef(false);

  const isDesktop = window.innerWidth >= 1024;

  // Fetch user balance from economy data
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
    // Poll every 10s during farming, 30s otherwise
    const pollInterval = farmingState === 'running' ? 10000 : 30000;
    const interval = setInterval(fetchBalance, pollInterval);
    return () => clearInterval(interval);
  }, [connected, account?.address, farmingState]);

  // Only enable deposit tracking if user started farming in this session
  useEffect(() => {
    if (farmingState === 'running' && userStartedFarmingRef.current && !lastSeenVersionRef.current) {
      lastSeenVersionRef.current = 'pending';
    } else if (farmingState === 'idle') {
      lastSeenVersionRef.current = null;
      setTotalMinted(0);
      setSessionStartTime(null);
      setProgressPercent(0);
      completedRef.current = false;
      setActiveBots(0);
      // Don't reset userStartedFarmingRef here - only reset on page reload
      // Don't reset sessionSummary - keep it showing until next session starts
    }
  }, [farmingState]);

  // Progress timer - updates every second when farming is running
  useEffect(() => {
    if (farmingState !== 'running' || !sessionStartTime || !userStartedFarmingRef.current) {
      return;
    }

    const updateProgress = async () => {
      const elapsed = Date.now() - sessionStartTime;
      // Cap progress at 95% until we actually confirm completion
      // This prevents showing 100% while still minting
      const percent = Math.min(95, Math.round((elapsed / EXPECTED_BOT_DURATION_MS) * 100));
      setProgressPercent(percent);

      // If we've exceeded expected time by 20+ seconds, auto-complete (only once!)
      if (elapsed > EXPECTED_BOT_DURATION_MS + 20000 && !completedRef.current) {
        completedRef.current = true; // Prevent duplicate toasts

        // Save session summary before cleanup
        const duration = Math.round(elapsed / 1000);
        setSessionSummary({
          minted: totalMinted,
          duration,
          bots: activeBots || DEFAULT_NUM_NODES,
        });

        // Clean up backend sessions
        try {
          await backendApi.clearSessions();
        } catch (e) {
          // Ignore cleanup errors
        }

        // Transition to complete state (not idle) to show summary
        setFarmingState('complete');
        showToast({
          type: 'success',
          message: `Farming complete! Minted ${(totalMinted / 1e8).toFixed(0)} ShelbyUSD`,
          duration: 8000,
        });
        userStartedFarmingRef.current = false;

        // Dispatch event to refresh leaderboard immediately
        window.dispatchEvent(new CustomEvent('farming-complete'));
      }
    };

    updateProgress();
    const interval = setInterval(updateProgress, 1000);
    return () => clearInterval(interval);
  }, [farmingState, sessionStartTime, totalMinted, activeBots, showToast]);

  const fetchStatus = async () => {
    try {
      const [sessionsData, overviewData] = await Promise.all([
        backendApi.getFarmingStatus() as Promise<FarmingSession[]>,
        backendApi.getFarmingOverview(),
      ]);
      setSessions(sessionsData);
      setOverview(overviewData);

      // Only update farming state if user started farming in THIS browser session
      // This prevents stale backend sessions from hijacking the UI
      if (connected && account?.address && userStartedFarmingRef.current) {
        const userActiveSessions = sessionsData.filter(
          s => s.walletAddress === account.address.toString() &&
               (s.status === 'running' || s.status === 'starting')
        );
        // Only transition to idle if sessions are gone (don't auto-set to running)
        if (farmingState === 'running' && userActiveSessions.length === 0) {
          setFarmingState('idle');
        }
      }
    } catch (err) {
      // Silently fail - farming might not be enabled
    }
  };

  useEffect(() => {
    fetchStatus();
    // Poll every 10s (was 5s) - farming sessions are long-running, don't need rapid updates
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [connected, account?.address]);

  // On mount, clear stale sessions if user didn't start farming
  useEffect(() => {
    // If user didn't start farming in this browser session,
    // any detected sessions are stale and should be cleared
    const clearStaleOnLoad = async () => {
      if (!userStartedFarmingRef.current) {
        try {
          await backendApi.clearSessions();
        } catch (e) {
          // Ignore errors
        }
      }
    };
    // Small delay to let initial fetch happen first
    const timeout = setTimeout(clearStaleOnLoad, 2000);
    return () => clearTimeout(timeout);
  }, []);

  // Poll for new deposits when farming is running AND user started it in this session
  // Delay polling until after bot boot phase (45s) since no mints happen during boot
  useEffect(() => {
    if (!connected || !account?.address || farmingState !== 'running' || !userStartedFarmingRef.current || !sessionStartTime) {
      return;
    }

    const pollDeposits = async () => {
      // Don't poll during boot phase - no mints yet
      const elapsed = Date.now() - sessionStartTime;
      if (elapsed < BOT_BOOT_TIME_MS) {
        return;
      }

      try {
        const isFirstPoll = lastSeenVersionRef.current === 'pending';

        // On first poll, get latest deposit to establish baseline (don't show toasts)
        // On subsequent polls, get up to 50 to catch all mints from multiple bots
        const deposits = await backendApi.getUserDeposits(
          account.address.toString(),
          isFirstPoll ? undefined : lastSeenVersionRef.current || undefined,
          isFirstPoll ? 1 : 50  // Get 1 on first poll, up to 50 on subsequent
        );

        if (deposits.length > 0) {
          // Get the max version
          const maxVersion = deposits.reduce(
            (max, d) => (BigInt(d.version) > BigInt(max) ? d.version : max),
            deposits[0].version
          );

          if (isFirstPoll) {
            // First poll - just set the baseline, don't show toasts
            lastSeenVersionRef.current = maxVersion;
          } else {
            // Subsequent polls - show ONE summary toast for all new deposits
            const totalNewAmount = deposits.reduce((sum, d) => sum + d.amount, 0);
            const latestTxHash = deposits.find(d => d.txHash)?.txHash;

            if (totalNewAmount > 0) {
              const amountFormatted = (totalNewAmount / 1e8).toFixed(2); // ShelbyUSD has 8 decimals
              showToast({
                type: 'success',
                message: `+${amountFormatted} ShelbyUSD minted (${deposits.length} txs)`,
                txHash: latestTxHash,
                duration: 6000,
              });
              setTotalMinted(prev => prev + totalNewAmount);
            }
            lastSeenVersionRef.current = maxVersion;
          }
        } else if (isFirstPoll) {
          // No deposits yet, but mark as initialized
          lastSeenVersionRef.current = '0';
        }
      } catch (err) {
        // Silently fail - don't spam errors for deposit polling
      }
    };

    // Poll every 8 seconds for faster feedback (each bot mints every ~2s)
    pollDeposits();
    const interval = setInterval(pollDeposits, 8000);
    return () => clearInterval(interval);
  }, [connected, account?.address, farmingState, sessionStartTime, showToast]);

  // Find user's sessions
  const userSessions = connected && account?.address
    ? sessions.filter(s => s.walletAddress === account.address.toString())
    : [];

  const activeUserSessions = userSessions.filter(
    s => s.status === 'running' || s.status === 'starting'
  );

  const totalActiveBots = activeUserSessions.reduce((sum, s) => sum + s.droplets.length, 0);

  const handleStartFarming = async () => {
    if (!connected || !account?.address) {
      showToast({ type: 'error', message: 'Please connect your wallet first' });
      return;
    }

    setFarmingState('starting');
    setSessionSummary(null); // Clear previous session summary
    userStartedFarmingRef.current = true; // Mark that user started farming in this session

    try {
      const session = await backendApi.startFarming(account.address.toString(), DEFAULT_NUM_NODES);
      if (session.droplets.length > 0) {
        const expectedMint = session.droplets.length * 50 * 10; // 50 requests × 10 ShelbyUSD each
        const failedCount = DEFAULT_NUM_NODES - session.droplets.length;
        setActiveBots(session.droplets.length);
        let message = `${session.droplets.length} bots deployed. Expected: ~${expectedMint} ShelbyUSD (~2 min)`;
        if (failedCount > 0) {
          message += ` (${failedCount} failed to start)`;
        }
        showToast({
          type: failedCount > 0 ? 'warning' : 'success',
          message,
          duration: 8000,
        });
        setSessionStartTime(Date.now());
        setFarmingState('running');
      } else {
        showToast({
          type: 'error',
          message: 'Failed to deploy bots. Server may have reached capacity.',
          duration: 8000,
        });
        setFarmingState('idle');
        userStartedFarmingRef.current = false;
      }
      await fetchStatus();
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to start farming',
      });
      setFarmingState('idle');
      userStartedFarmingRef.current = false;
    }
  };

  const handleStopFarming = async () => {
    setFarmingState('stopping');
    const sessionMinted = totalMinted; // Capture before reset
    const elapsed = sessionStartTime ? Date.now() - sessionStartTime : 0;

    try {
      await backendApi.cleanupFarming();
      await backendApi.clearSessions();

      // Save session summary
      setSessionSummary({
        minted: sessionMinted,
        duration: Math.round(elapsed / 1000),
        bots: activeBots || DEFAULT_NUM_NODES,
      });

      // Show session summary
      if (sessionMinted > 0) {
        showToast({
          type: 'success',
          message: `Session ended. Total minted: ${(sessionMinted / 1e8).toFixed(2)} ShelbyUSD`,
          duration: 6000,
        });
      } else {
        showToast({
          type: 'info',
          message: 'Farming session ended. Bots terminated.',
          duration: 4000,
        });
      }

      setFarmingState('complete'); // Go to complete state to show summary
      userStartedFarmingRef.current = false;
      await fetchStatus();

      // Refresh balance
      window.dispatchEvent(new CustomEvent('farming-complete'));
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to stop farming',
      });
      setFarmingState('running'); // Revert if failed
    }
  };

  const shortenAddress = (address: string) => {
    if (address.length <= 16) return address;
    return `${address.slice(0, 8)}...${address.slice(-6)}`;
  };

  // Use the actual farmingState - don't override based on backend data
  // Backend sessions are cleared on page load if user didn't start farming
  const effectiveState = farmingState;

  // Format balance for display - show exact value with commas
  const formatBalance = (balance: number) => {
    const shelbyUSD = balance / 100_000_000;
    return shelbyUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Format duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  return (
    <column box-="double" shear-="top" pad-="1" gap-="0.75" style={{ overflow: 'hidden' }}>
      {/* Header row */}
      <row gap-="0.75" align-="between" style={{ flexWrap: 'wrap' }}>
        <row gap-="0.5" align-="center">
          <span is-="badge" variant-="pink" cap-="ribbon triangle">FAUCET</span>
          {effectiveState === 'running' && <span is-="badge" variant-="success" cap-="round" size-="half">● LIVE</span>}
          {effectiveState === 'starting' && <span is-="badge" variant-="yellow" cap-="round" size-="half"><Spinner color="var(--background)" size="0.7rem" /> DEPLOYING</span>}
          {effectiveState === 'stopping' && <span is-="badge" variant-="red" cap-="round" size-="half"><Spinner color="var(--background)" size="0.7rem" /> STOPPING</span>}
          {effectiveState === 'complete' && <span is-="badge" variant-="success" cap-="round" size-="half">✓ COMPLETE</span>}
        </row>
        {/* Balance with label */}
        {connected && userBalance !== null && (
          <row gap-="0.5" align-="center" style={{
            padding: '0.35rem 0.75rem',
            background: 'var(--background)',
            border: '1px solid var(--pink)',
            borderRadius: '4px',
          }}>
            <img
              src="/shelby-token.png"
              alt=""
              style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0 }}
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
            <column gap-="0" style={{ lineHeight: 1.2 }}>
              <small style={{ color: 'var(--foreground2)', fontSize: '0.65rem', textTransform: 'uppercase' }}>Balance</small>
              <span style={{ color: 'var(--pink)', fontWeight: 700, fontSize: '0.9rem', fontFamily: 'monospace' }}>
                {formatBalance(userBalance)} <span style={{ fontSize: '0.7rem', color: 'var(--foreground2)' }}>ShelbyUSD</span>
              </span>
            </column>
          </row>
        )}
      </row>

      {/* Not Connected */}
      {!connected ? (
        <row gap-="0.75" align-="center" style={{ padding: '1rem', background: 'var(--background)' }}>
          <span style={{ color: 'var(--yellow)', fontSize: '1.25rem' }}>⚠</span>
          <column gap-="0.25">
            <span style={{ fontWeight: 600 }}>Wallet Not Connected</span>
            <small style={{ color: 'var(--foreground2)' }}>Connect your wallet to start farming ShelbyUSD</small>
          </column>
        </row>
      ) : (
        <>
          {/* IDLE - Ready to farm */}
          {effectiveState === 'idle' && (
            <row gap-="1" align-="center" style={{ padding: '0.75rem', background: 'var(--background)', flexWrap: 'wrap' }}>
              {/* Info grid */}
              <row style={{ flex: 1, gap: '1.5rem', flexWrap: 'wrap' }}>
                <column gap-="0.15">
                  <small style={{ color: 'var(--foreground2)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Est. Yield</small>
                  <span style={{ fontWeight: 600, color: 'var(--green)', fontFamily: 'monospace' }}>~{(DEFAULT_NUM_NODES * 500).toLocaleString()}</span>
                </column>
                <column gap-="0.15">
                  <small style={{ color: 'var(--foreground2)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Duration</small>
                  <span style={{ fontWeight: 600, color: 'var(--yellow)', fontFamily: 'monospace' }}>~{Math.ceil(EXPECTED_BOT_DURATION_MS / 1000 / 60)} min</span>
                </column>
                <column gap-="0.15">
                  <small style={{ color: 'var(--foreground2)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Bots</small>
                  <span style={{ fontWeight: 600, color: 'var(--blue)', fontFamily: 'monospace' }}>{DEFAULT_NUM_NODES}</span>
                </column>
              </row>
              <button
                onClick={handleStartFarming}
                style={{
                  padding: '0.65rem 1.5rem',
                  background: 'linear-gradient(135deg, #FF1493, #FF69B4)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
              >
                ▶ START FARMING
              </button>
            </row>
          )}

          {/* STARTING - Deploying bots */}
          {effectiveState === 'starting' && (
            <column gap-="0.5" style={{ padding: '0.75rem', background: 'var(--background)' }}>
              <row gap-="0.5" align-="center">
                <Spinner color="var(--yellow)" />
                <span style={{ fontWeight: 600 }}>Deploying {DEFAULT_NUM_NODES} farming bots...</span>
              </row>
              <small style={{ color: 'var(--foreground2)' }}>Creating cloud servers. This takes ~45 seconds.</small>
            </column>
          )}

          {/* RUNNING - Active farming */}
          {effectiveState === 'running' && (() => {
            const elapsed = sessionStartTime ? Date.now() - sessionStartTime : 0;
            const isBooting = elapsed < BOT_BOOT_TIME_MS;
            const remainingSeconds = Math.max(0, Math.ceil((EXPECTED_BOT_DURATION_MS - elapsed) / 1000));
            const mintedDisplay = (totalMinted / 1e8).toFixed(2);

            return (
              <column gap-="0.75" style={{ padding: '0.75rem', background: 'var(--background)' }}>
                {/* Progress bar */}
                <column gap-="0.35">
                  <row align-="between" style={{ fontSize: '0.85rem' }}>
                    <span style={{ color: isBooting ? 'var(--yellow)' : 'var(--green)', fontWeight: 600 }}>
                      {isBooting ? 'Booting bots...' : 'Minting ShelbyUSD...'}
                    </span>
                    <span style={{ color: 'var(--foreground2)', fontFamily: 'monospace' }}>
                      {remainingSeconds > 0 ? `${remainingSeconds}s remaining` : 'Finishing...'}
                    </span>
                  </row>
                  <ProgressBar percent={progressPercent} color={isBooting ? 'var(--yellow)' : 'var(--green)'} />
                </column>

                {/* Stats row */}
                <row gap-="1.5rem" align-="center" style={{ flexWrap: 'wrap' }}>
                  <column gap-="0.15">
                    <small style={{ color: 'var(--foreground2)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Minted</small>
                    <span style={{ fontWeight: 600, color: 'var(--pink)', fontFamily: 'monospace' }}>+{mintedDisplay}</span>
                  </column>
                  <column gap-="0.15">
                    <small style={{ color: 'var(--foreground2)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Bots Active</small>
                    <span style={{ fontWeight: 600, color: 'var(--green)', fontFamily: 'monospace' }}>{activeBots || DEFAULT_NUM_NODES}</span>
                  </column>
                  <column gap-="0.15">
                    <small style={{ color: 'var(--foreground2)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Progress</small>
                    <span style={{ fontWeight: 600, color: 'var(--foreground)', fontFamily: 'monospace' }}>{progressPercent}%</span>
                  </column>
                  <button
                    onClick={handleStopFarming}
                    style={{
                      marginLeft: 'auto',
                      padding: '0.5rem 1rem',
                      background: 'transparent',
                      color: 'var(--red)',
                      border: '2px solid var(--red)',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                    }}
                  >
                    ■ STOP
                  </button>
                </row>
              </column>
            );
          })()}

          {/* STOPPING */}
          {effectiveState === 'stopping' && (
            <column gap-="0.5" style={{ padding: '0.75rem', background: 'var(--background)' }}>
              <row gap-="0.5" align-="center">
                <Spinner color="var(--red)" />
                <span style={{ fontWeight: 600, color: 'var(--red)' }}>Stopping farming bots...</span>
              </row>
              <small style={{ color: 'var(--foreground2)' }}>Terminating servers and cleaning up.</small>
            </column>
          )}

          {/* COMPLETE - Session summary */}
          {effectiveState === 'complete' && sessionSummary && (
            <column gap-="0.75" style={{ padding: '0.75rem', background: 'var(--background)' }}>
              <row gap-="0.75" align-="center">
                <span style={{ color: 'var(--green)', fontSize: '1.5rem' }}>✓</span>
                <column gap-="0.15">
                  <span style={{ fontWeight: 600, color: 'var(--green)' }}>Farming Session Complete</span>
                  <small style={{ color: 'var(--foreground2)' }}>Your ShelbyUSD has been minted to your wallet</small>
                </column>
              </row>

              {/* Session stats */}
              <row gap-="1.5rem" style={{ flexWrap: 'wrap', paddingTop: '0.5rem', borderTop: '1px solid var(--background2)' }}>
                <column gap-="0.15">
                  <small style={{ color: 'var(--foreground2)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Total Minted</small>
                  <span style={{ fontWeight: 700, color: 'var(--pink)', fontFamily: 'monospace', fontSize: '1.1rem' }}>
                    +{(sessionSummary.minted / 1e8).toFixed(2)} ShelbyUSD
                  </span>
                </column>
                <column gap-="0.15">
                  <small style={{ color: 'var(--foreground2)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Duration</small>
                  <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{formatDuration(sessionSummary.duration)}</span>
                </column>
                <column gap-="0.15">
                  <small style={{ color: 'var(--foreground2)', fontSize: '0.7rem', textTransform: 'uppercase' }}>Bots Used</small>
                  <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{sessionSummary.bots}</span>
                </column>
              </row>

              {/* Start new session button */}
              <button
                onClick={() => {
                  setSessionSummary(null);
                  setFarmingState('idle');
                }}
                style={{
                  marginTop: '0.5rem',
                  padding: '0.65rem 1.5rem',
                  background: 'linear-gradient(135deg, #FF1493, #FF69B4)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  alignSelf: 'flex-start',
                }}
              >
                ▶ START NEW SESSION
              </button>
            </column>
          )}
        </>
      )}
    </column>
  );
};

export const FarmingPanel = memo(FarmingPanelComponent);
