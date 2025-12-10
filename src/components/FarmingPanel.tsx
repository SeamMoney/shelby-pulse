import { useState, useEffect, memo } from 'react';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { backendApi, FarmingSession, FarmingOverview } from '../api/backend';
import { useToast } from './Toast';

type FarmingState = 'idle' | 'starting' | 'running' | 'stopping';

const FarmingPanelComponent = () => {
  const { connected, account, connect, wallets } = useWallet();
  const { showToast } = useToast();
  const [numNodes, setNumNodes] = useState(3);
  const [farmingState, setFarmingState] = useState<FarmingState>('idle');
  const [sessions, setSessions] = useState<FarmingSession[]>([]);
  const [overview, setOverview] = useState<FarmingOverview | null>(null);

  const isDesktop = window.innerWidth >= 1024;

  const fetchStatus = async () => {
    try {
      const [sessionsData, overviewData] = await Promise.all([
        backendApi.getFarmingStatus() as Promise<FarmingSession[]>,
        backendApi.getFarmingOverview(),
      ]);
      setSessions(sessionsData);
      setOverview(overviewData);

      // Update farming state based on sessions
      if (connected && account?.address) {
        const userActiveSessions = sessionsData.filter(
          s => s.walletAddress === account.address.toString() &&
               (s.status === 'running' || s.status === 'starting')
        );
        if (userActiveSessions.length > 0 && farmingState !== 'stopping') {
          setFarmingState('running');
        } else if (farmingState === 'running' && userActiveSessions.length === 0) {
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

    try {
      const session = await backendApi.startFarming(account.address.toString(), numNodes);
      if (session.droplets.length > 0) {
        showToast({
          type: 'success',
          message: `${session.droplets.length} farming bots deployed! They will start minting shortly.`,
          duration: 6000,
        });
        setFarmingState('running');
      } else {
        showToast({
          type: 'error',
          message: 'Failed to deploy bots. Server may have reached capacity.',
          duration: 8000,
        });
        setFarmingState('idle');
      }
      await fetchStatus();
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to start farming',
      });
      setFarmingState('idle');
    }
  };

  const handleStopFarming = async () => {
    setFarmingState('stopping');

    try {
      const result = await backendApi.cleanupFarming();
      await backendApi.clearSessions();
      showToast({
        type: 'success',
        message: 'All farming bots stopped.',
        duration: 4000,
      });
      setFarmingState('idle');
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

  // Determine actual farming state from data
  const isActuallyRunning = totalActiveBots > 0 || (overview?.totalDroplets || 0) > 0;
  const effectiveState = isActuallyRunning && farmingState === 'idle' ? 'running' : farmingState;

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
                  Each bot mints ~500 SHELBY/day (50 requests × 10 SHELBY)
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
                <small style={{ color: 'var(--foreground2)', fontSize: '0.75rem' }}>
                  Bots are automatically minting ShelbyUSD to your wallet.
                  Each bot makes ~50 faucet requests per day.
                </small>
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
