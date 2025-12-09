import { useState, useEffect, memo } from 'react';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { backendApi, FarmingSession, FarmingOverview } from '../api/backend';
import { useToast } from './Toast';

interface FarmingPanelProps {
  compact?: boolean; // For mobile header wallet button
}

const FarmingPanelComponent = ({ compact = false }: FarmingPanelProps) => {
  const { connected, account, connect, disconnect, wallets } = useWallet();
  const { showToast } = useToast();
  const [numNodes, setNumNodes] = useState(3);
  const [isStarting, setIsStarting] = useState(false);
  const [isRequestingFaucet, setIsRequestingFaucet] = useState(false);
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
    } catch (err) {
      // Silently fail - farming might not be enabled
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleStartFarming = async () => {
    if (!connected || !account?.address) {
      showToast({ type: 'error', message: 'Please connect your wallet first' });
      return;
    }

    setIsStarting(true);

    try {
      const session = await backendApi.startFarming(account.address.toString(), numNodes);
      if (session.droplets.length > 0) {
        showToast({
          type: 'success',
          message: `Farming started! ${session.droplets.length} bots deploying...`,
          duration: 6000,
        });
      } else {
        showToast({
          type: 'error',
          message: 'Failed to deploy bots. Check if droplet limit is reached.',
          duration: 8000,
        });
      }
      await fetchStatus();
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to start farming',
      });
    } finally {
      setIsStarting(false);
    }
  };

  const handleQuickFaucet = async () => {
    if (!connected || !account?.address) {
      showToast({ type: 'error', message: 'Please connect your wallet first' });
      return;
    }

    setIsRequestingFaucet(true);

    try {
      const result = await backendApi.requestFaucet(account.address.toString());
      if (result.txn_hashes && result.txn_hashes.length > 0) {
        showToast({
          type: 'success',
          message: '+10 ShelbyUSD minted to your wallet!',
          txHash: result.txn_hashes[0],
          duration: 8000,
        });
      } else {
        showToast({
          type: 'info',
          message: 'Faucet request sent but no transaction returned. Rate limit may be reached.',
          duration: 6000,
        });
      }
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to request faucet',
      });
    } finally {
      setIsRequestingFaucet(false);
    }
  };

  const handleStopSession = async (sessionId: string) => {
    try {
      await backendApi.stopFarming(sessionId);
      showToast({ type: 'success', message: 'Farming session stopped' });
      await fetchStatus();
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to stop session',
      });
    }
  };

  const handleCleanupAll = async () => {
    if (!confirm('Stop all farming bots and clear old sessions?')) return;

    try {
      // First cleanup droplets
      const result = await backendApi.cleanupFarming();
      // Then clear sessions from memory
      await backendApi.clearSessions();
      showToast({ type: 'success', message: result.message });
      await fetchStatus();
    } catch (err) {
      showToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to cleanup',
      });
    }
  };

  const shortenAddress = (address: string) => {
    if (address.length <= 16) return address;
    return `${address.slice(0, 8)}...${address.slice(-6)}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return '#00C896';
      case 'completed': return '#4A90E2';
      case 'failed': return '#FF4444';
      case 'starting': return '#FFA500';
      default: return 'var(--foreground2)';
    }
  };

  // Find user's active sessions
  const userSessions = connected && account?.address
    ? sessions.filter(s => s.walletAddress === account.address.toString())
    : [];

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
        {overview && overview.activeSessions > 0 && (
          <span is-="badge" variant-="success" cap-="round" size-="half">
            {overview.totalDroplets} BOTS ACTIVE
          </span>
        )}
      </row>

      {/* Wallet Connection */}
      {!connected ? (
        <column gap-="0.5" style={{ padding: '1rem', background: 'var(--background)', borderRadius: '8px' }}>
          <row gap-="0.5" align-="center" style={{ flexWrap: 'wrap' }}>
            <span style={{ fontSize: '1.25rem' }}>&#128274;</span>
            <column gap-="0" style={{ flex: 1, minWidth: '200px' }}>
              <span style={{ fontWeight: 600, fontSize: isDesktop ? '1rem' : '0.9rem' }}>Connect Wallet to Farm</span>
              <small style={{ color: 'var(--foreground2)', fontSize: isDesktop ? '0.8rem' : '0.7rem' }}>
                {isDesktop ? 'ShelbyUSD will be minted directly to your wallet' : 'Use the Connect button in the header'}
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
                    borderRadius: '4px',
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
          {/* Connected Wallet Info */}
          <row style={{
            padding: '0.5rem 0.75rem',
            background: 'var(--background)',
            borderRadius: '6px',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <row gap-="0.5" align-="center">
              <span style={{ color: '#00C896', fontSize: '0.9rem' }}>&#9679;</span>
              <span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                {shortenAddress(account?.address?.toString() || '')}
              </span>
            </row>
            <button
              onClick={disconnect}
              style={{
                padding: '0.25rem 0.5rem',
                background: 'transparent',
                color: 'var(--foreground2)',
                border: '1px solid var(--background2)',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.7rem',
              }}
            >
              Disconnect
            </button>
          </row>

          {/* Farming Controls */}
          <column gap-="0.5">
            <row gap-="0.5" align-="center">
              <small style={{ color: 'var(--foreground2)' }}>Farming Bots:</small>
              <select
                value={numNodes}
                onChange={(e) => setNumNodes(Number(e.target.value))}
                style={{
                  background: 'var(--background)',
                  border: '1px solid var(--background2)',
                  padding: '0.25rem 0.5rem',
                  borderRadius: '4px',
                  color: 'var(--foreground)',
                  fontSize: '0.8rem',
                }}
              >
                {[1, 2, 3, 5, 10].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? 'bot' : 'bots'} (up to {n * 500} SHELBY_USD/day)
                  </option>
                ))}
              </select>
            </row>
            {/* Quick Faucet - instant single request */}
            <row gap-="0.5">
              <button
                is-="button"
                variant-="background3"
                onClick={handleQuickFaucet}
                disabled={isRequestingFaucet}
                style={{
                  flex: 1,
                  opacity: isRequestingFaucet ? 0.6 : 1,
                  cursor: isRequestingFaucet ? 'not-allowed' : 'pointer',
                }}
              >
                {isRequestingFaucet ? 'Requesting...' : 'Quick Faucet (+10 SHELBY)'}
              </button>
            </row>

            {/* Auto-farming with cloud VMs (disabled for now due to droplet limits) */}
            {isDesktop && (
              <>
                <div style={{
                  height: '1px',
                  background: 'var(--background2)',
                  margin: '0.5rem 0',
                }} />
                <small style={{ color: 'var(--foreground2)', fontSize: '0.65rem' }}>
                  Auto-farming (cloud VMs):
                </small>
                <row gap-="0.5">
                  <button
                    onClick={handleStartFarming}
                    disabled={isStarting}
                    style={{
                      flex: 1,
                      padding: '0.5rem 0.75rem',
                      background: isStarting ? 'var(--background2)' : 'var(--background3)',
                      color: isStarting ? 'var(--foreground2)' : 'var(--foreground0)',
                      border: 'none',
                      cursor: isStarting ? 'not-allowed' : 'pointer',
                      fontWeight: 600,
                      fontSize: '0.75rem',
                    }}
                  >
                    {isStarting ? 'Deploying...' : `Deploy ${numNodes} Bots`}
                  </button>
                  {sessions.length > 0 && (
                    <button
                      onClick={handleCleanupAll}
                      style={{
                        padding: '0.5rem 0.75rem',
                        background: 'transparent',
                        color: '#FF4444',
                        border: '1px solid #FF4444',
                        cursor: 'pointer',
                        fontSize: '0.7rem',
                      }}
                    >
                      Clear All
                    </button>
                  )}
                </row>
              </>
            )}
          </column>

          {/* Active Sessions for this user */}
          {userSessions.length > 0 && (
            <column gap-="0.5">
              <small style={{ color: 'var(--foreground2)', textTransform: 'uppercase', fontWeight: 600 }}>
                Your Active Farming Sessions
              </small>
              {userSessions.map((session) => (
                <column
                  key={session.id}
                  gap-="0.5"
                  style={{
                    padding: '0.75rem',
                    background: 'var(--background)',
                    borderRadius: '6px',
                    border: `1px solid ${getStatusColor(session.status)}22`,
                  }}
                >
                  <row align-="between">
                    <row gap-="0.5" align-="center">
                      <span style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: getStatusColor(session.status),
                        animation: session.status === 'running' ? 'pulse 2s infinite' : 'none',
                      }} />
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: getStatusColor(session.status) }}>
                        {session.status.toUpperCase()}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--foreground2)' }}>
                        {session.droplets.length} bots
                      </span>
                    </row>
                    {session.status === 'running' && (
                      <button
                        onClick={() => handleStopSession(session.id)}
                        style={{
                          padding: '0.2rem 0.5rem',
                          background: 'transparent',
                          color: '#FF4444',
                          border: '1px solid #FF4444',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.65rem',
                        }}
                      >
                        Stop
                      </button>
                    )}
                  </row>

                  {/* Bot status indicators */}
                  <row gap-="0.25" style={{ flexWrap: 'wrap' }}>
                    {session.droplets.map((bot, i) => (
                      <span
                        key={bot.id}
                        title={`Bot ${i + 1}: ${bot.farmingStatus}`}
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: '4px',
                          background: bot.farmingStatus === 'running' ? '#00C89622' :
                                     bot.farmingStatus === 'completed' ? '#4A90E222' :
                                     bot.farmingStatus === 'failed' ? '#FF444422' : 'var(--background2)',
                          border: `1px solid ${
                            bot.farmingStatus === 'running' ? '#00C896' :
                            bot.farmingStatus === 'completed' ? '#4A90E2' :
                            bot.farmingStatus === 'failed' ? '#FF4444' : 'var(--background2)'
                          }`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.65rem',
                          color: bot.farmingStatus === 'running' ? '#00C896' :
                                 bot.farmingStatus === 'completed' ? '#4A90E2' :
                                 bot.farmingStatus === 'failed' ? '#FF4444' : 'var(--foreground2)',
                        }}
                      >
                        {bot.farmingStatus === 'running' ? '⚡' :
                         bot.farmingStatus === 'completed' ? '✓' :
                         bot.farmingStatus === 'failed' ? '✗' : '...'}
                      </span>
                    ))}
                  </row>
                </column>
              ))}
            </column>
          )}
        </>
      )}

      {/* Info footer */}
      <small style={{ color: 'var(--foreground2)', fontSize: '0.6rem', opacity: 0.7, lineHeight: 1.4 }}>
        Each bot mints up to 500 SHELBY_USD/day via the ShelbyNet faucet.
        Tokens are minted directly to your connected wallet address.
      </small>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </column>
  );
};

export const FarmingPanel = memo(FarmingPanelComponent);
