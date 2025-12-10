import { useState, useEffect, useRef, memo } from 'react';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { backendApi, FarmingSession, FarmingOverview, UserDeposit } from '../api/backend';
import { useToast } from './Toast';

type FarmingState = 'idle' | 'starting' | 'running' | 'stopping';

// Boot time for droplets to come online and start the script
const BOT_BOOT_TIME_MS = 45 * 1000; // ~45 seconds to boot
// Each bot makes 50 requests with 2s delay = ~100s minting time
const BOT_MINTING_TIME_MS = 105 * 1000; // ~105 seconds to mint
// Total expected duration
const EXPECTED_BOT_DURATION_MS = BOT_BOOT_TIME_MS + BOT_MINTING_TIME_MS; // ~150 seconds total

const FarmingPanelComponent = () => {
  const { connected, account, connect, wallets } = useWallet();
  const { showToast } = useToast();
  const [numNodes, setNumNodes] = useState(3);
  const [farmingState, setFarmingState] = useState<FarmingState>('idle');
  const [sessions, setSessions] = useState<FarmingSession[]>([]);
  const [overview, setOverview] = useState<FarmingOverview | null>(null);
  const [totalMinted, setTotalMinted] = useState(0);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [progressPercent, setProgressPercent] = useState(0);
  const lastSeenVersionRef = useRef<string | null>(null);
  // Track if user manually started farming in this browser session
  const userStartedFarmingRef = useRef(false);
  // Prevent duplicate completion toasts
  const completedRef = useRef(false);

  const isDesktop = window.innerWidth >= 1024;

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
    const interval = setInterval(fetchStatus, 5000);
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
      const session = await backendApi.startFarming(account.address.toString(), numNodes);
      if (session.droplets.length > 0) {
        const expectedMint = session.droplets.length * 50 * 10; // 50 requests × 10 ShelbyUSD each
        const failedCount = numNodes - session.droplets.length;
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

  return (
    <column box-="double round" shear-="top" pad-={isDesktop ? "0.75" : "1"} gap-="0.75">
      {/* Header */}
      <row gap-="1" align-="between">
        <column gap-="0.25">
          <span is-="badge" variant-="pink" cap-="ribbon triangle">FAUCET FARMING</span>
          <small style={{ color: 'var(--foreground2)', fontSize: '0.65rem' }}>
            Automated ShelbyUSD minting on ShelbyNet
          </small>
        </column>
      </row>

      {/* Not Connected State */}
      {!connected ? (
        <column gap-="0.5" style={{ padding: '1rem', background: 'var(--background)' }}>
          <row gap-="0.5" align-="center" style={{ flexWrap: 'wrap' }}>
            <span style={{ fontSize: '1.25rem' }}>&#128274;</span>
            <column gap-="0" style={{ flex: 1, minWidth: '200px' }}>
              <span style={{ fontWeight: 600, fontSize: isDesktop ? '1rem' : '0.9rem' }}>
                Connect Wallet to Farm
              </span>
              <small style={{ color: 'var(--foreground2)', fontSize: isDesktop ? '0.8rem' : '0.7rem' }}>
                {isDesktop ? 'ShelbyUSD will be minted directly to your wallet' : 'Use the Connect button above'}
              </small>
            </column>
          </row>
          {isDesktop && (
            <row gap-="0.5" style={{ flexWrap: 'wrap' }}>
              {wallets?.filter(w => w.readyState === 'Installed').map((wallet) => (
                <button
                  key={wallet.name}
                  onClick={() => connect(wallet.name)}
                  style={{
                    padding: '0.5rem 1rem',
                    background: 'var(--accent)',
                    color: 'var(--background)',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  {wallet.icon && <img src={wallet.icon} alt="" style={{ width: 20, height: 20 }} />}
                  {wallet.name}
                </button>
              ))}
              {wallets?.filter(w => w.readyState === 'Installed').length === 0 && (
                <small style={{ color: 'var(--foreground2)' }}>
                  No Aptos wallet detected. Install Petra or another Aptos wallet.
                </small>
              )}
            </row>
          )}
        </column>
      ) : (
        <>
          {/* Connected - Show farming controls */}
          <column gap-="0.75">
            {/* Wallet address */}
            <row gap-="0.5" align-="center" style={{
              padding: '0.4rem 0.6rem',
              background: 'var(--background)',
              fontSize: '0.75rem',
            }}>
              <span style={{ color: 'var(--success)' }}>●</span>
              <span style={{ fontFamily: 'monospace' }}>
                {shortenAddress(account?.address?.toString() || '')}
              </span>
            </row>

            {/* IDLE STATE - Show start controls */}
            {effectiveState === 'idle' && (
              <column gap-="0.5">
                <row gap-="0.5" align-="center">
                  <small style={{ color: 'var(--foreground2)' }}>Bots to deploy:</small>
                  <select
                    value={numNodes}
                    onChange={(e) => setNumNodes(Number(e.target.value))}
                    style={{
                      background: 'var(--background)',
                      border: '1px solid var(--background2)',
                      padding: '0.25rem 0.5rem',
                      color: 'var(--foreground)',
                      fontSize: '0.8rem',
                    }}
                  >
                    {[1, 2, 3, 5, 10].map((n) => (
                      <option key={n} value={n}>
                        {n} {n === 1 ? 'bot' : 'bots'}
                      </option>
                    ))}
                  </select>
                </row>
                <button
                  onClick={handleStartFarming}
                  style={{
                    padding: '0.75rem 1rem',
                    background: 'linear-gradient(135deg, #FF1493, #FF69B4)',
                    color: 'white',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    textTransform: 'uppercase',
                  }}
                >
                  Start Farming
                </button>
                <small style={{ color: 'var(--foreground2)', fontSize: '0.7rem', textAlign: 'center' }}>
                  Each bot mints ~500 ShelbyUSD (50 requests × 10 ShelbyUSD)
                </small>
              </column>
            )}

            {/* STARTING STATE */}
            {effectiveState === 'starting' && (
              <column gap-="0.5" style={{
                padding: '1rem',
                background: 'rgba(255, 165, 0, 0.1)',
                border: '1px solid var(--yellow)',
              }}>
                <row gap-="0.5" align-="center">
                  <span style={{ animation: 'spin 1s linear infinite', fontSize: '1rem' }}>⟳</span>
                  <span style={{ color: 'var(--yellow)', fontWeight: 700 }}>DEPLOYING BOTS...</span>
                </row>
                <small style={{ color: 'var(--foreground2)' }}>
                  Creating {numNodes} cloud instances. This may take 30-60 seconds.
                </small>
              </column>
            )}

            {/* RUNNING STATE */}
            {effectiveState === 'running' && (
              <column gap-="0.5" style={{
                padding: '1rem',
                background: 'rgba(0, 200, 150, 0.1)',
                border: '1px solid var(--success)',
              }}>
                <row gap-="0.5" align-="between">
                  <row gap-="0.5" align-="center">
                    <span style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: 'var(--success)',
                      animation: 'pulse 2s infinite',
                    }} />
                    <span style={{ color: 'var(--success)', fontWeight: 700 }}>
                      FARMING ACTIVE
                    </span>
                  </row>
                  <span style={{
                    background: 'var(--success)',
                    color: 'white',
                    padding: '0.2rem 0.5rem',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                  }}>
                    {overview?.totalDroplets || totalActiveBots} BOTS
                  </span>
                </row>

                {/* Progress bar */}
                {userStartedFarmingRef.current && sessionStartTime && (() => {
                  const elapsed = Date.now() - sessionStartTime;
                  const isBooting = elapsed < BOT_BOOT_TIME_MS;
                  const remainingSeconds = Math.max(0, Math.ceil((EXPECTED_BOT_DURATION_MS - elapsed) / 1000));

                  return (
                    <column gap-="0.25" style={{ marginTop: '0.25rem' }}>
                      <row gap-="0.5" align-="between">
                        <small style={{ color: 'var(--foreground2)', fontSize: '0.7rem' }}>
                          {isBooting ? 'Booting bots...' : `Minting: ${progressPercent}%`}
                        </small>
                        <small style={{ color: 'var(--foreground2)', fontSize: '0.7rem' }}>
                          {progressPercent >= 100
                            ? 'Completing...'
                            : `~${remainingSeconds}s remaining`}
                        </small>
                      </row>
                      <div style={{
                        width: '100%',
                        height: 6,
                        background: 'var(--background)',
                        borderRadius: 3,
                        overflow: 'hidden',
                      }}>
                        <div style={{
                          width: `${progressPercent}%`,
                          height: '100%',
                          background: isBooting ? 'var(--yellow)' : progressPercent >= 100 ? 'var(--accent)' : 'var(--success)',
                          transition: 'width 0.5s ease-out',
                        }} />
                      </div>
                      {isBooting && (
                        <small style={{ color: 'var(--yellow)', fontSize: '0.65rem' }}>
                          Bots are starting up. Minting will begin shortly...
                        </small>
                      )}
                    </column>
                  );
                })()}

                {!userStartedFarmingRef.current && (
                  <small style={{ color: 'var(--foreground2)', fontSize: '0.75rem' }}>
                    Bots from a previous session are still registered.
                  </small>
                )}

                {/* Session stats */}
                {userStartedFarmingRef.current && (
                  <row gap-="0.5" align-="center" style={{
                    padding: '0.4rem 0.6rem',
                    background: 'var(--background)',
                    marginTop: '0.25rem',
                  }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--foreground2)' }}>Session minted:</span>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--accent)' }}>
                      {(totalMinted / 1e8).toFixed(2)} ShelbyUSD
                    </span>
                  </row>
                )}

                <button
                  onClick={handleStopFarming}
                  style={{
                    marginTop: '0.5rem',
                    padding: '0.5rem 1rem',
                    background: 'transparent',
                    color: '#FF4444',
                    border: '1px solid #FF4444',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '0.8rem',
                  }}
                >
                  Stop All Bots
                </button>
              </column>
            )}

            {/* STOPPING STATE */}
            {effectiveState === 'stopping' && (
              <column gap-="0.5" style={{
                padding: '1rem',
                background: 'rgba(255, 68, 68, 0.1)',
                border: '1px solid var(--red)',
              }}>
                <row gap-="0.5" align-="center">
                  <span style={{ animation: 'spin 1s linear infinite', fontSize: '1rem' }}>⟳</span>
                  <span style={{ color: 'var(--red)', fontWeight: 700 }}>STOPPING BOTS...</span>
                </row>
                <small style={{ color: 'var(--foreground2)' }}>
                  Terminating all farming instances...
                </small>
              </column>
            )}
          </column>
        </>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </column>
  );
};

export const FarmingPanel = memo(FarmingPanelComponent);
