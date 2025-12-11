import { useState, useEffect, useRef, memo } from 'react';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { backendApi, FarmingSession, FarmingOverview, UserDeposit } from '../api/backend';
import { useToast } from './Toast';

type FarmingState = 'idle' | 'starting' | 'running' | 'stopping';

// Terminal-style ASCII progress bar
const AsciiProgressBar = memo(({ percent, width = 20, color = 'var(--green)' }: { percent: number; width?: number; color?: string }) => {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return (
    <span style={{ fontFamily: 'monospace', color }}>
      [{bar}] {percent}%
    </span>
  );
});
AsciiProgressBar.displayName = 'AsciiProgressBar';

// Animated ASCII spinner for terminal look
const AsciiSpinner = memo(({ color = 'var(--yellow)' }: { color?: string }) => {
  const [frame, setFrame] = useState(0);
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

  useEffect(() => {
    const interval = setInterval(() => setFrame(f => (f + 1) % frames.length), 80);
    return () => clearInterval(interval);
  }, []);

  return <span style={{ fontFamily: 'monospace', color }}>{frames[frame]}</span>;
});
AsciiSpinner.displayName = 'AsciiSpinner';

// Terminal command line
const TerminalPrompt = memo(({ command, status = 'running' }: { command: string; status?: 'running' | 'success' | 'error' }) => (
  <row style={{ fontFamily: 'monospace', fontSize: '0.8rem', gap: '0.5rem', alignItems: 'center' }}>
    <span style={{ color: 'var(--accent)' }}>$</span>
    <span style={{ color: 'var(--foreground)' }}>{command}</span>
    {status === 'running' && <span style={{ color: 'var(--green)', animation: 'terminalBlink 1s step-end infinite' }}>█</span>}
    {status === 'success' && <span style={{ color: 'var(--green)' }}>[OK]</span>}
    {status === 'error' && <span style={{ color: 'var(--red)' }}>[FAIL]</span>}
  </row>
));
TerminalPrompt.displayName = 'TerminalPrompt';

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

      {/* Not Connected State - Terminal Style */}
      {!connected ? (
        <column gap-="0.5" style={{ padding: '0.75rem', background: 'var(--background)', fontFamily: 'monospace' }}>
          <row style={{ color: 'var(--yellow)', fontSize: '0.8rem', gap: '0.5rem' }}>
            <span>⚠</span>
            <span>WALLET_NOT_CONNECTED</span>
          </row>
          <column gap-="0.25" style={{ marginLeft: '1rem', fontSize: '0.75rem' }}>
            <row style={{ color: 'var(--foreground2)' }}>
              <span style={{ color: 'var(--foreground2)' }}>{'>'} </span>
              <span>awaiting wallet connection...</span>
              <span style={{ color: 'var(--green)', animation: 'terminalBlink 1s step-end infinite' }}>█</span>
            </row>
            <row style={{ color: 'var(--foreground2)' }}>
              <span>{'>'} ShelbyUSD will mint to connected address</span>
            </row>
          </column>
          {isDesktop && (
            <column gap-="0.5" style={{ marginTop: '0.5rem' }}>
              <row style={{ color: 'var(--foreground2)', fontSize: '0.7rem' }}>
                <span style={{ color: 'var(--accent)' }}>$</span>
                <span style={{ marginLeft: '0.5rem' }}>select_wallet --provider</span>
              </row>
              <row gap-="0.5" style={{ flexWrap: 'wrap', marginLeft: '1rem' }}>
                {wallets?.filter(w => w.readyState === 'Installed').map((wallet, i) => (
                  <button
                    key={wallet.name}
                    onClick={() => connect(wallet.name)}
                    style={{
                      padding: '0.4rem 0.75rem',
                      background: 'transparent',
                      color: 'var(--green)',
                      border: '1px solid var(--green)',
                      cursor: 'pointer',
                      fontFamily: 'monospace',
                      fontSize: '0.75rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    <span style={{ color: 'var(--yellow)' }}>[{i + 1}]</span>
                    {wallet.icon && <img src={wallet.icon} alt="" style={{ width: 16, height: 16 }} />}
                    {wallet.name}
                  </button>
                ))}
                {wallets?.filter(w => w.readyState === 'Installed').length === 0 && (
                  <span style={{ color: 'var(--red)', fontSize: '0.75rem' }}>
                    ERROR: No Aptos wallet detected
                  </span>
                )}
              </row>
            </column>
          )}
        </column>
      ) : (
        <>
          {/* Connected - Show farming controls */}
          <column gap-="0.5" style={{ fontFamily: 'monospace' }}>
            {/* Wallet address - terminal style */}
            <row gap-="0.5" align-="center" style={{
              padding: '0.4rem 0.6rem',
              background: 'var(--background)',
              fontSize: '0.75rem',
            }}>
              <span style={{ color: 'var(--green)' }}>✓</span>
              <span style={{ color: 'var(--foreground2)' }}>WALLET:</span>
              <span style={{ color: 'var(--accent)' }}>
                {shortenAddress(account?.address?.toString() || '')}
              </span>
            </row>

            {/* IDLE STATE - Terminal style start controls */}
            {effectiveState === 'idle' && (
              <column gap-="0.5" style={{ padding: '0.5rem', background: 'var(--background)' }}>
                <row style={{ fontSize: '0.75rem', color: 'var(--foreground2)' }}>
                  <span style={{ color: 'var(--accent)' }}>$</span>
                  <span style={{ marginLeft: '0.5rem' }}>./farm.sh --nodes=</span>
                  <select
                    value={numNodes}
                    onChange={(e) => setNumNodes(Number(e.target.value))}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      borderBottom: '1px solid var(--accent)',
                      padding: '0 0.25rem',
                      color: 'var(--accent)',
                      fontSize: '0.75rem',
                      fontFamily: 'monospace',
                      cursor: 'pointer',
                    }}
                  >
                    {[1, 2, 3, 5, 10].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                  <span style={{ color: 'var(--green)', animation: 'terminalBlink 1s step-end infinite' }}>█</span>
                </row>
                <column gap-="0.25" style={{ marginLeft: '1rem', fontSize: '0.7rem', color: 'var(--foreground2)' }}>
                  <span>{'>'} expected yield: ~{numNodes * 500} ShelbyUSD</span>
                  <span>{'>'} estimated time: ~{Math.ceil((BOT_BOOT_TIME_MS + BOT_MINTING_TIME_MS) / 1000 / 60)} min</span>
                </column>
                <button
                  onClick={handleStartFarming}
                  style={{
                    marginTop: '0.5rem',
                    padding: '0.5rem 1rem',
                    background: 'transparent',
                    color: 'var(--green)',
                    border: '1px solid var(--green)',
                    cursor: 'pointer',
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                  }}
                >
                  {'>'} EXECUTE
                </button>
              </column>
            )}

            {/* STARTING STATE - Terminal boot sequence */}
            {effectiveState === 'starting' && (
              <column gap-="0.25" style={{
                padding: '0.75rem',
                background: 'var(--background)',
                border: '1px dashed var(--yellow)',
              }}>
                <row style={{ fontSize: '0.8rem', color: 'var(--yellow)', gap: '0.5rem' }}>
                  <AsciiSpinner color="var(--yellow)" />
                  <span>DEPLOYING INFRASTRUCTURE</span>
                </row>
                <column gap-="0.15" style={{ marginLeft: '1.5rem', fontSize: '0.7rem' }}>
                  <TerminalPrompt command={`doctl compute droplet create --count ${numNodes}`} status="running" />
                  <row style={{ color: 'var(--foreground2)' }}>
                    <span>{'>'} provisioning {numNodes} droplet{numNodes > 1 ? 's' : ''}...</span>
                  </row>
                  <row style={{ color: 'var(--foreground2)' }}>
                    <span>{'>'} installing dependencies...</span>
                  </row>
                  <row style={{ color: 'var(--foreground2)' }}>
                    <span>{'>'} configuring faucet scripts...</span>
                  </row>
                </column>
                <row style={{ marginTop: '0.5rem', fontSize: '0.65rem', color: 'var(--foreground2)' }}>
                  <span>ETA: 30-60 seconds</span>
                </row>
              </column>
            )}

            {/* RUNNING STATE - Terminal process monitor */}
            {effectiveState === 'running' && (
              <column gap-="0.5" style={{
                padding: '0.75rem',
                background: 'var(--background)',
                border: '1px solid var(--green)',
              }}>
                {/* Status header */}
                <row gap-="0.5" align-="between" style={{ fontSize: '0.8rem' }}>
                  <row gap-="0.5" align-="center">
                    <span style={{ color: 'var(--green)' }}>●</span>
                    <span style={{ color: 'var(--green)' }}>PROCESS ACTIVE</span>
                  </row>
                  <span style={{ color: 'var(--accent)' }}>
                    [{overview?.totalDroplets || totalActiveBots} NODES]
                  </span>
                </row>

                {/* ASCII Progress bar */}
                {userStartedFarmingRef.current && sessionStartTime && (() => {
                  const elapsed = Date.now() - sessionStartTime;
                  const isBooting = elapsed < BOT_BOOT_TIME_MS;
                  const remainingSeconds = Math.max(0, Math.ceil((EXPECTED_BOT_DURATION_MS - elapsed) / 1000));

                  return (
                    <column gap-="0.25" style={{ marginTop: '0.25rem' }}>
                      <row style={{ fontSize: '0.75rem' }}>
                        <AsciiProgressBar
                          percent={progressPercent}
                          width={isDesktop ? 20 : 15}
                          color={isBooting ? 'var(--yellow)' : progressPercent >= 100 ? 'var(--accent)' : 'var(--green)'}
                        />
                      </row>
                      <column gap-="0.15" style={{ fontSize: '0.7rem', color: 'var(--foreground2)' }}>
                        {isBooting ? (
                          <>
                            <row><span style={{ color: 'var(--yellow)' }}>{'>'}</span> booting droplets...</row>
                            <row><span style={{ color: 'var(--yellow)' }}>{'>'}</span> starting faucet daemon...</row>
                          </>
                        ) : (
                          <>
                            <row><span style={{ color: 'var(--green)' }}>{'>'}</span> minting in progress...</row>
                            <row><span style={{ color: 'var(--foreground2)' }}>{'>'}</span> ETA: {progressPercent >= 100 ? 'completing...' : `${remainingSeconds}s`}</row>
                          </>
                        )}
                      </column>
                    </column>
                  );
                })()}

                {!userStartedFarmingRef.current && (
                  <row style={{ color: 'var(--foreground2)', fontSize: '0.7rem' }}>
                    <span style={{ color: 'var(--yellow)' }}>⚠</span>
                    <span style={{ marginLeft: '0.5rem' }}>orphaned session detected</span>
                  </row>
                )}

                {/* Session stats - terminal style */}
                {userStartedFarmingRef.current && (
                  <row style={{
                    padding: '0.4rem 0.6rem',
                    background: 'rgba(0,0,0,0.2)',
                    marginTop: '0.25rem',
                    fontSize: '0.75rem',
                    gap: '1rem',
                  }}>
                    <span style={{ color: 'var(--foreground2)' }}>MINTED:</span>
                    <span style={{ color: 'var(--accent)' }}>
                      {(totalMinted / 1e8).toFixed(2)} ShelbyUSD
                    </span>
                  </row>
                )}

                <button
                  onClick={handleStopFarming}
                  style={{
                    marginTop: '0.5rem',
                    padding: '0.4rem 0.75rem',
                    background: 'transparent',
                    color: 'var(--red)',
                    border: '1px solid var(--red)',
                    cursor: 'pointer',
                    fontFamily: 'monospace',
                    fontSize: '0.75rem',
                  }}
                >
                  {'>'} KILL -9 ALL
                </button>
              </column>
            )}

            {/* STOPPING STATE - Terminal shutdown sequence */}
            {effectiveState === 'stopping' && (
              <column gap-="0.25" style={{
                padding: '0.75rem',
                background: 'var(--background)',
                border: '1px dashed var(--red)',
              }}>
                <row style={{ fontSize: '0.8rem', color: 'var(--red)', gap: '0.5rem' }}>
                  <AsciiSpinner color="var(--red)" />
                  <span>TERMINATING PROCESSES</span>
                </row>
                <column gap-="0.15" style={{ marginLeft: '1.5rem', fontSize: '0.7rem' }}>
                  <TerminalPrompt command="pkill -f faucet-bot" status="running" />
                  <row style={{ color: 'var(--foreground2)' }}>
                    <span>{'>'} sending SIGTERM to all nodes...</span>
                  </row>
                  <row style={{ color: 'var(--foreground2)' }}>
                    <span>{'>'} destroying droplets...</span>
                  </row>
                  <row style={{ color: 'var(--foreground2)' }}>
                    <span>{'>'} cleaning up resources...</span>
                  </row>
                </column>
              </column>
            )}
          </column>
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
