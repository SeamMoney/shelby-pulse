import { useState, useEffect, useRef, memo } from 'react';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { backendApi, FarmingSession, FarmingOverview, UserDeposit } from '../api/backend';
import { useToast } from './Toast';

type FarmingState = 'idle' | 'starting' | 'running' | 'stopping';

// Number of bots to always deploy (max)
const DEFAULT_NUM_NODES = 10;

// Terminal-style ASCII progress bar
const AsciiProgressBar = memo(({ percent, width = 20, color = 'var(--green)', showPercent = true }: { percent: number; width?: number; color?: string; showPercent?: boolean }) => {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return (
    <span style={{ fontFamily: 'monospace', color, fontSize: '1rem' }}>
      [{bar}]{showPercent && ` ${percent}%`}
    </span>
  );
});
AsciiProgressBar.displayName = 'AsciiProgressBar';

// Animated ASCII spinner for terminal look
const AsciiSpinner = memo(({ color = 'var(--yellow)', size = '1rem' }: { color?: string; size?: string }) => {
  const [frame, setFrame] = useState(0);
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

  useEffect(() => {
    const interval = setInterval(() => setFrame(f => (f + 1) % frames.length), 80);
    return () => clearInterval(interval);
  }, []);

  return <span style={{ fontFamily: 'monospace', color, fontSize: size }}>{frames[frame]}</span>;
});
AsciiSpinner.displayName = 'AsciiSpinner';

// Boot time for droplets to come online and start the script
const BOT_BOOT_TIME_MS = 45 * 1000; // ~45 seconds to boot
// Each bot makes 50 requests with 2s delay = ~100s minting time
const BOT_MINTING_TIME_MS = 105 * 1000; // ~105 seconds to mint
// Total expected duration
const EXPECTED_BOT_DURATION_MS = BOT_BOOT_TIME_MS + BOT_MINTING_TIME_MS; // ~150 seconds total

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
    const interval = setInterval(fetchBalance, 30000);
    return () => clearInterval(interval);
  }, [connected, account?.address]);

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
      // Don't reset userStartedFarmingRef here - only reset on page reload
    }
  }, [farmingState]);

  // Progress timer - updates every second when farming is running
  useEffect(() => {
    if (farmingState !== 'running' || !sessionStartTime || !userStartedFarmingRef.current) {
      return;
    }

    const updateProgress = async () => {
      const elapsed = Date.now() - sessionStartTime;
      const percent = Math.min(100, Math.round((elapsed / EXPECTED_BOT_DURATION_MS) * 100));
      setProgressPercent(percent);

      // If we've exceeded expected time by 20+ seconds, auto-complete (only once!)
      if (elapsed > EXPECTED_BOT_DURATION_MS + 20000 && !completedRef.current) {
        completedRef.current = true; // Prevent duplicate toasts
        // Clean up backend sessions and complete
        try {
          await backendApi.clearSessions();
        } catch (e) {
          // Ignore cleanup errors
        }
        setFarmingState('idle');
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
  }, [farmingState, sessionStartTime, totalMinted, showToast]);

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
    userStartedFarmingRef.current = true; // Mark that user started farming in this session

    try {
      const session = await backendApi.startFarming(account.address.toString(), DEFAULT_NUM_NODES);
      if (session.droplets.length > 0) {
        const expectedMint = session.droplets.length * 50 * 10; // 50 requests × 10 ShelbyUSD each
        const failedCount = DEFAULT_NUM_NODES - session.droplets.length;
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

    try {
      await backendApi.cleanupFarming();
      await backendApi.clearSessions();

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

      setFarmingState('idle');
      userStartedFarmingRef.current = false;
      await fetchStatus();
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

  // Format balance for display
  const formatBalance = (balance: number) => {
    const shelbyUSD = balance / 100_000_000;
    if (shelbyUSD >= 1_000_000) return `${(shelbyUSD / 1_000_000).toFixed(2)}M`;
    if (shelbyUSD >= 1_000) return `${(shelbyUSD / 1_000).toFixed(1)}K`;
    return shelbyUSD.toFixed(2);
  };

  return (
    <column box-="double" shear-="top" pad-={isDesktop ? "0.5" : "0.75"} gap-="0.5">
      {/* Compact header row */}
      <row gap-="0.5" align-="between" style={{ flexWrap: 'wrap' }}>
        <row gap-="0.5" align-="center">
          <span is-="badge" variant-="pink" cap-="ribbon triangle" size-={isDesktop ? "half" : undefined}>FAUCET</span>
          {effectiveState === 'running' && <span is-="badge" variant-="success" cap-="round" size-="half">● LIVE</span>}
          {effectiveState === 'starting' && <span is-="badge" variant-="yellow" cap-="round" size-="half"><AsciiSpinner color="var(--background)" size="0.7rem" /> DEPLOY</span>}
          {effectiveState === 'stopping' && <span is-="badge" variant-="red" cap-="round" size-="half"><AsciiSpinner color="var(--background)" size="0.7rem" /> STOP</span>}
        </row>
        {/* Balance with logo */}
        {connected && userBalance !== null && (
          <row gap-="0.35" align-="center" style={{ fontFamily: 'monospace' }}>
            <img src="/shelby-token.png" alt="" style={{ width: 18, height: 18, borderRadius: '50%' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            <span style={{ color: 'var(--pink)', fontWeight: 700, fontSize: '0.9rem' }}>{formatBalance(userBalance)}</span>
          </row>
        )}
      </row>

      {/* Not Connected */}
      {!connected ? (
        <row gap-="0.5" align-="center" style={{ padding: '0.5rem', background: 'var(--background)', fontFamily: 'monospace', fontSize: '0.8rem' }}>
          <span style={{ color: 'var(--yellow)' }}>⚠</span>
          <span style={{ color: 'var(--foreground2)' }}>connect wallet to farm</span>
          <span style={{ color: 'var(--green)', animation: 'terminalBlink 1s step-end infinite' }}>█</span>
        </row>
      ) : (
        <>
          {/* IDLE - Compact inline layout */}
          {effectiveState === 'idle' && (
            <row gap-="0.5" align-="center" style={{ padding: '0.5rem', background: 'var(--background)', flexWrap: 'wrap' }}>
              <column gap-="0.15" style={{ flex: 1, minWidth: '200px' }}>
                <row style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--foreground2)', gap: '0.25rem' }}>
                  <span style={{ color: 'var(--accent)' }}>$</span>
                  <span>farm --yield=<span style={{ color: 'var(--green)' }}>~{DEFAULT_NUM_NODES * 500}</span> --time=<span style={{ color: 'var(--yellow)' }}>~{Math.ceil(EXPECTED_BOT_DURATION_MS / 1000 / 60)}m</span> --nodes=<span style={{ color: 'var(--blue)' }}>{DEFAULT_NUM_NODES}</span></span>
                  <span style={{ color: 'var(--green)', animation: 'terminalBlink 1s step-end infinite' }}>█</span>
                </row>
              </column>
              <button
                onClick={handleStartFarming}
                style={{
                  padding: '0.5rem 1rem',
                  background: 'linear-gradient(135deg, #FF1493, #FF69B4)',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'monospace',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
              >
                ▶ START
              </button>
            </row>
          )}

          {/* STARTING - Compact */}
          {effectiveState === 'starting' && (
            <column gap-="0.25" style={{ padding: '0.5rem', background: 'var(--background)', fontFamily: 'monospace', fontSize: '0.75rem' }}>
              <row style={{ color: 'var(--foreground2)', gap: '0.25rem' }}>
                <span style={{ color: 'var(--accent)' }}>$</span>
                <span>doctl create --count {DEFAULT_NUM_NODES}</span>
                <span style={{ color: 'var(--green)', animation: 'terminalBlink 1s step-end infinite' }}>█</span>
              </row>
              <row style={{ color: 'var(--foreground2)' }}>
                <span style={{ color: 'var(--yellow)' }}>{'>'}</span> provisioning... <span style={{ color: 'var(--foreground2)', marginLeft: 'auto' }}>ETA ~45s</span>
              </row>
            </column>
          )}

          {/* RUNNING - Compact with progress */}
          {effectiveState === 'running' && (() => {
            const elapsed = sessionStartTime ? Date.now() - sessionStartTime : 0;
            const isBooting = elapsed < BOT_BOOT_TIME_MS;
            const remainingSeconds = Math.max(0, Math.ceil((EXPECTED_BOT_DURATION_MS - elapsed) / 1000));

            return (
              <column gap-="0.35" style={{ padding: '0.5rem', background: 'var(--background)', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                <row align-="between">
                  <AsciiProgressBar percent={progressPercent} width={isDesktop ? 20 : 12} color={isBooting ? 'var(--yellow)' : 'var(--green)'} />
                  <span style={{ color: 'var(--foreground2)' }}>{progressPercent >= 100 ? 'done' : `${remainingSeconds}s`}</span>
                </row>
                <row align-="between">
                  <span style={{ color: 'var(--foreground2)' }}>
                    <span style={{ color: isBooting ? 'var(--yellow)' : 'var(--green)' }}>{'>'}</span> {isBooting ? 'booting...' : 'minting...'}
                    {userStartedFarmingRef.current && <span style={{ color: 'var(--pink)', marginLeft: '0.5rem' }}>+{(totalMinted / 1e8).toFixed(1)}</span>}
                  </span>
                  <button
                    onClick={handleStopFarming}
                    style={{
                      padding: '0.25rem 0.5rem',
                      background: 'transparent',
                      color: 'var(--red)',
                      border: '1px solid var(--red)',
                      cursor: 'pointer',
                      fontFamily: 'monospace',
                      fontSize: '0.7rem',
                    }}
                  >
                    STOP
                  </button>
                </row>
              </column>
            );
          })()}

          {/* STOPPING - Compact */}
          {effectiveState === 'stopping' && (
            <row gap-="0.5" style={{ padding: '0.5rem', background: 'var(--background)', fontFamily: 'monospace', fontSize: '0.75rem' }}>
              <span style={{ color: 'var(--accent)' }}>$</span>
              <span style={{ color: 'var(--foreground2)' }}>pkill faucet-bot</span>
              <span style={{ color: 'var(--green)', animation: 'terminalBlink 1s step-end infinite' }}>█</span>
              <span style={{ color: 'var(--red)', marginLeft: 'auto' }}>terminating...</span>
            </row>
          )}
        </>
      )}

      <style>{`
        @keyframes terminalBlink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </column>
  );
};

export const FarmingPanel = memo(FarmingPanelComponent);
