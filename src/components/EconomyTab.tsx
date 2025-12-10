import { useEffect, useState, memo } from 'react';
import { backendApi } from '../api/backend';
import { AsciiBar } from './AsciiBar';
import { FarmingPanel } from './FarmingPanel';

// Skeleton placeholder component
const Skeleton = memo(({ width = '100%', height = '1rem' }: { width?: string; height?: string }) => (
  <div
    style={{
      width,
      height,
      background: 'linear-gradient(90deg, var(--background) 25%, var(--background2) 50%, var(--background) 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s infinite',
      borderRadius: '2px',
    }}
  />
));
Skeleton.displayName = 'Skeleton';

interface LeaderboardEntry {
  address: string;
  balance: number;
  barWidth: number;
}

interface VolumeData {
  volume24h: number;
  transferCount24h: number;
  velocity: number;
}

interface AllTimeStats {
  totalSupply: number;
  totalHolders: number;
  totalTransactions: number;
  totalVolume: number;
  averageTransactionSize: number;
  firstTransactionVersion: string;
  lastTransactionVersion: string;
}

interface ActivityEntry {
  address: string;
  txCount: number;
  barWidth: number;
}

interface SpenderEntry {
  address: string;
  totalSpent: number;
  barWidth: number;
}

interface RecentTransaction {
  address: string;
  type: 'deposit' | 'withdraw' | 'mint' | 'burn';
  amount: number;
  version: number;
}

interface EconomyData {
  leaderboard: LeaderboardEntry[];
  volume: VolumeData;
  allTimeStats: AllTimeStats;
  mostActive: ActivityEntry[];
  topSpenders: SpenderEntry[];
  recentTransactions: RecentTransaction[];
  timestamp: number;
}

const EconomyTabComponent = () => {
  const [data, setData] = useState<EconomyData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchEconomy = async (forceRefresh = false) => {
      try {
        const economyData = await backendApi.getEconomy(forceRefresh);
        setData(economyData);
        setIsLoading(false);
      } catch (error) {
        console.error('Failed to fetch economy data:', error);
        setIsLoading(false);
      }
    };

    fetchEconomy();
    const interval = setInterval(() => fetchEconomy(false), 60000); // Refresh every 60s

    // Listen for farming completion to force-refresh leaderboard
    const handleFarmingComplete = () => {
      console.log('Farming complete - refreshing leaderboard');
      fetchEconomy(true);
    };
    window.addEventListener('farming-complete', handleFarmingComplete);

    return () => {
      clearInterval(interval);
      window.removeEventListener('farming-complete', handleFarmingComplete);
    };
  }, []);

  const shortenAddress = (address: string) => {
    if (address.length <= 12) return address;
    return `${address.slice(0, 6)}...${address.slice(-5)}`;
  };

  const formatAmount = (amount: number) => {
    // ShelbyUSD has 8 decimals, so convert from smallest units first
    const shelbyUSD = amount / 100_000_000;

    if (shelbyUSD >= 1_000_000) {
      return `${(shelbyUSD / 1_000_000).toFixed(2)}M`;
    }
    if (shelbyUSD >= 1_000) {
      return `${(shelbyUSD / 1_000).toFixed(2)}K`;
    }
    if (shelbyUSD >= 1) {
      return shelbyUSD.toFixed(2);
    }
    return shelbyUSD.toFixed(4);
  };

  const getTransactionLabel = (type: RecentTransaction['type']) => {
    switch (type) {
      case 'mint':
        return { icon: '✨', label: 'Minted', color: '#00C896' };
      case 'deposit':
        return { icon: '↓', label: 'Received', color: '#4A90E2' };
      case 'withdraw':
        return { icon: '↑', label: 'Sent', color: '#FFA500' };
      case 'burn':
        return { icon: '🔥', label: 'Burned', color: '#FF1493' };
      default:
        return { icon: '•', label: type, color: 'var(--foreground2)' };
    }
  };

  // Helper to check if an entry is a placeholder
  const isPlaceholder = (address: string) => address.startsWith('placeholder-');

  // Use placeholder data while loading - each item needs unique key
  const placeholderData: EconomyData = {
    leaderboard: Array.from({ length: 10 }, (_, i) => ({ address: `placeholder-${i}`, balance: 0, barWidth: 50 })),
    volume: { volume24h: 0, transferCount24h: 0, velocity: 0 },
    allTimeStats: { totalSupply: 0, totalHolders: 0, totalTransactions: 0, totalVolume: 0, averageTransactionSize: 0, firstTransactionVersion: '0', lastTransactionVersion: '0' },
    mostActive: Array.from({ length: 10 }, (_, i) => ({ address: `placeholder-${i}`, txCount: 0, barWidth: 50 })),
    topSpenders: Array.from({ length: 10 }, (_, i) => ({ address: `placeholder-${i}`, totalSpent: 0, barWidth: 50 })),
    recentTransactions: Array.from({ length: 10 }, (_, i) => ({ address: `placeholder-${i}`, type: 'deposit' as const, amount: 0, version: i })),
    timestamp: Date.now(),
  };
  const displayData = data || placeholderData;

  const isDesktop = window.innerWidth >= 1024;
  const maxEntries = isDesktop ? 8 : 10;

  return (
    <column gap-={isDesktop ? "0.5" : "2"} pad-={isDesktop ? "0.5" : "1"} style={{ overflowY: 'auto', height: '100%' }}>
      {/* Header */}
      <column box-="double round" shear-="top" pad-={isDesktop ? "0.5" : "1"} gap-="0.5">
        <row gap-="1" align-="between" style={{ marginTop: isDesktop ? '0' : '0' }}>
          <span is-="badge" variant-="pink" cap-="ribbon triangle">SHELBYUSD ECONOMY</span>
          <row gap-="0.5">
            <span is-="badge" variant-="background2" cap-="round" size-="half">ShelbyNet (Devnet)</span>
            {isLoading ? (
              <span is-="badge" variant-="yellow" cap-="round" size-="half" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <span is-="spinner" style={{ fontSize: '0.7rem' }}></span> Loading
              </span>
            ) : (
              <span is-="badge" variant-="success" cap-="round" size-="half">◉ LIVE</span>
            )}
          </row>
        </row>
        {!isDesktop && (
          <small style={{ color: 'var(--foreground2)' }}>
            All-time ShelbyUSD statistics since network inception • Value accrual preview for future $Shelby token
          </small>
        )}
      </column>

      {/* Compact Combined Stats */}
      <column box-="round" shear-="top" pad-={isDesktop ? "1" : "1"}>
        <row style={{
          display: 'grid',
          gridTemplateColumns: isDesktop ? 'repeat(7, 1fr)' : 'repeat(auto-fit, minmax(100px, 1fr))',
          gap: isDesktop ? '0.5rem' : '0.75rem',
          fontSize: isDesktop ? '0.7rem' : '0.85rem',
          width: '100%',
          boxSizing: 'border-box'
        }}>
          <column gap-="0" style={{ textAlign: 'center', minWidth: 0, overflow: 'hidden' }}>
            <small style={{ color: 'var(--foreground2)', fontSize: isDesktop ? '0.65rem' : '0.7rem', textTransform: 'uppercase' }}>Supply</small>
            {isLoading ? <Skeleton width="4rem" height={isDesktop ? '1.1rem' : '1.5rem'} /> : (
              <span style={{ color: '#4A90E2', fontSize: isDesktop ? '1.1rem' : '1.5rem', fontWeight: 700 }}>{formatAmount(displayData.allTimeStats.totalSupply)}</span>
            )}
          </column>
          <column gap-="0" style={{ textAlign: 'center', minWidth: 0, overflow: 'hidden' }}>
            <small style={{ color: 'var(--foreground2)', fontSize: isDesktop ? '0.65rem' : '0.7rem', textTransform: 'uppercase' }}>Holders</small>
            {isLoading ? <Skeleton width="3rem" height={isDesktop ? '1.1rem' : '1.5rem'} /> : (
              <span style={{ color: '#00C896', fontSize: isDesktop ? '1.1rem' : '1.5rem', fontWeight: 700 }}>{displayData.allTimeStats.totalHolders}</span>
            )}
          </column>
          <column gap-="0" style={{ textAlign: 'center', minWidth: 0, overflow: 'hidden' }}>
            <small style={{ color: 'var(--foreground2)', fontSize: isDesktop ? '0.65rem' : '0.7rem', textTransform: 'uppercase' }}>All-Time Vol</small>
            {isLoading ? <Skeleton width="4rem" height={isDesktop ? '1.1rem' : '1.5rem'} /> : (
              <span style={{ color: '#FFA500', fontSize: isDesktop ? '1.1rem' : '1.5rem', fontWeight: 700 }}>{formatAmount(displayData.allTimeStats.totalVolume)}</span>
            )}
          </column>
          <column gap-="0" style={{ textAlign: 'center', minWidth: 0, overflow: 'hidden' }}>
            <small style={{ color: 'var(--foreground2)', fontSize: isDesktop ? '0.65rem' : '0.7rem', textTransform: 'uppercase' }}>Total Txs</small>
            {isLoading ? <Skeleton width="3rem" height={isDesktop ? '1.1rem' : '1.5rem'} /> : (
              <span style={{ color: '#FF1493', fontSize: isDesktop ? '1.1rem' : '1.5rem', fontWeight: 700 }}>{displayData.allTimeStats.totalTransactions}</span>
            )}
          </column>
          <column gap-="0" style={{ textAlign: 'center', minWidth: 0, overflow: 'hidden' }}>
            <small style={{ color: 'var(--foreground2)', fontSize: isDesktop ? '0.65rem' : '0.7rem', textTransform: 'uppercase' }}>24h Vol</small>
            {isLoading ? <Skeleton width="3rem" height={isDesktop ? '1.1rem' : '1.5rem'} /> : (
              <span style={{ color: '#4A90E2', fontSize: isDesktop ? '1.1rem' : '1.5rem', fontWeight: 700 }}>{formatAmount(displayData.volume.volume24h)}</span>
            )}
          </column>
          <column gap-="0" style={{ textAlign: 'center', minWidth: 0, overflow: 'hidden' }}>
            <small style={{ color: 'var(--foreground2)', fontSize: isDesktop ? '0.65rem' : '0.7rem', textTransform: 'uppercase' }}>24h Txs</small>
            {isLoading ? <Skeleton width="2rem" height={isDesktop ? '1.1rem' : '1.5rem'} /> : (
              <span style={{ color: '#00C896', fontSize: isDesktop ? '1.1rem' : '1.5rem', fontWeight: 700 }}>{displayData.volume.transferCount24h}</span>
            )}
          </column>
          <column gap-="0" style={{ textAlign: 'center', minWidth: 0, overflow: 'hidden' }}>
            <small style={{ color: 'var(--foreground2)', fontSize: isDesktop ? '0.65rem' : '0.7rem', textTransform: 'uppercase' }}>Velocity</small>
            {isLoading ? <Skeleton width="3rem" height={isDesktop ? '1.1rem' : '1.5rem'} /> : (
              <span style={{ color: '#FFA500', fontSize: isDesktop ? '1.1rem' : '1.5rem', fontWeight: 700 }}>{displayData.volume.velocity.toFixed(1)}/hr</span>
            )}
          </column>
        </row>
      </column>

      {/* 2-column layout on desktop */}
      <row style={{ display: isDesktop ? 'grid' : 'flex', gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr', gap: isDesktop ? '0.5rem' : '2rem', flexDirection: 'column' }}>
        {/* Top Holders Leaderboard */}
        <column box-="double" shear-="top" pad-={isDesktop ? "0.5" : "1"} gap-={isDesktop ? "0.5" : "1"}>
          <row gap-="1" align-="between" style={{ marginBottom: isDesktop ? '0.25rem' : '0.5rem' }}>
            <span is-="badge" variant-="accent" cap-="triangle ribbon" size-={isDesktop ? "half" : undefined}>💎 Top Holders</span>
            {!isDesktop && (
              <span is-="badge" variant-="green" cap-="round" size-="half">
                $SHELBY airdrop eligible
              </span>
            )}
          </row>
          <column gap-="0" style={{ fontSize: isDesktop ? '0.75rem' : '0.9rem', overflow: 'hidden' }}>
            {displayData.leaderboard.slice(0, maxEntries).map((entry, i) => (
            <column key={`leaderboard-${i}-${entry.address}`} gap-="0">
              <row
                style={{
                  padding: isDesktop ? '0.3rem 0.5rem' : '0.5rem 0.75rem',
                  gap: '0.5rem',
                  alignItems: 'center',
                  maxWidth: '100%',
                  overflow: 'hidden',
                }}
              >
                <span style={{ color: 'var(--foreground2)', minWidth: '1.2rem', flexShrink: 0 }}>
                  {i + 1}.
                </span>
                {isPlaceholder(entry.address) ? (
                  <>
                    <Skeleton width="6rem" height="0.85rem" />
                    <span style={{ flex: 1 }}><Skeleton width="100%" height="0.5rem" /></span>
                    <Skeleton width="3rem" height="0.85rem" />
                  </>
                ) : (
                  <>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: isDesktop ? '0.7rem' : '0.85rem',
                        flexShrink: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        minWidth: 0,
                      }}
                    >
                      {shortenAddress(entry.address)}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                      <AsciiBar width={entry.barWidth} />
                    </span>
                    <span
                      style={{
                        color: 'var(--accent)',
                        fontWeight: 600,
                        textAlign: 'right',
                        flexShrink: 0,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatAmount(entry.balance)}
                    </span>
                  </>
                )}
              </row>
              {i < maxEntries - 1 && (
                <div style={{
                  height: '1px',
                  background: 'var(--background2)',
                  margin: '0 0.75rem',
                }} />
              )}
            </column>
          ))}
        </column>
      </column>

        {/* Most Active Users */}
        <column box-="round" shear-="top" pad-={isDesktop ? "0.5" : "1"} gap-={isDesktop ? "0.5" : "1"}>
          <row gap-="1" style={{ marginBottom: isDesktop ? '0.25rem' : '0.5rem' }}>
            <span is-="badge" variant-="blue" cap-="slant-bottom triangle" size-={isDesktop ? "half" : undefined}>⚡ Most Active</span>
            {!isDesktop && <span is-="badge" variant-="background2" cap-="round" size-="half">by tx count</span>}
          </row>
          <column gap-="0" style={{ fontSize: isDesktop ? '0.75rem' : '0.9rem', overflow: 'hidden' }}>
          {displayData.mostActive.slice(0, maxEntries).map((entry, i) => (
            <column key={`active-${i}-${entry.address}`} gap-="0">
              <row
                style={{
                  padding: isDesktop ? '0.3rem 0.5rem' : '0.5rem 0.75rem',
                  gap: '0.5rem',
                  alignItems: 'center',
                  maxWidth: '100%',
                  overflow: 'hidden',
                }}
              >
                <span style={{ color: 'var(--foreground2)', minWidth: '1.2rem', flexShrink: 0 }}>
                  {i + 1}.
                </span>
                {isPlaceholder(entry.address) ? (
                  <>
                    <Skeleton width="6rem" height="0.85rem" />
                    <span style={{ flex: 1 }}><Skeleton width="100%" height="0.5rem" /></span>
                    <Skeleton width="3rem" height="0.85rem" />
                  </>
                ) : (
                  <>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: isDesktop ? '0.7rem' : '0.85rem',
                        flexShrink: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        minWidth: 0,
                      }}
                    >
                      {shortenAddress(entry.address)}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                      <AsciiBar width={entry.barWidth} />
                    </span>
                    <span
                      style={{
                        color: '#4A90E2',
                        fontWeight: 600,
                        textAlign: 'right',
                        flexShrink: 0,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {entry.txCount} txs
                    </span>
                  </>
                )}
              </row>
              {i < maxEntries - 1 && (
                <div style={{
                  height: '1px',
                  background: 'var(--background2)',
                  margin: '0 0.75rem',
                }} />
              )}
            </column>
          ))}
        </column>
      </column>
      </row>

      {/* Farming Panel */}
      <FarmingPanel />

      {/* Second row: Top Spenders & Recent Transactions */}
      <row style={{ display: isDesktop ? 'grid' : 'flex', gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr', gap: isDesktop ? '0.5rem' : '2rem', flexDirection: 'column' }}>
        {/* Top Spenders */}
        <column box-="double round" shear-="top" pad-={isDesktop ? "0.5" : "1"} gap-={isDesktop ? "0.5" : "1"}>
          <row gap-="1" style={{ marginBottom: isDesktop ? '0.25rem' : '0.5rem' }}>
            <span is-="badge" variant-="yellow" cap-="ribbon slant-top" size-={isDesktop ? "half" : undefined}>💸 Biggest Spenders</span>
            {!isDesktop && <span is-="badge" variant-="background2" cap-="round" size-="half">total withdrawn</span>}
          </row>
          <column gap-="0" style={{ fontSize: isDesktop ? '0.75rem' : '0.9rem', overflow: 'hidden' }}>
          {displayData.topSpenders.slice(0, maxEntries).map((entry, i) => (
            <column key={`spender-${i}-${entry.address}`} gap-="0">
              <row
                style={{
                  padding: isDesktop ? '0.3rem 0.5rem' : '0.5rem 0.75rem',
                  gap: '0.5rem',
                  alignItems: 'center',
                  maxWidth: '100%',
                  overflow: 'hidden',
                }}
              >
                <span style={{ color: 'var(--foreground2)', minWidth: '1.2rem', flexShrink: 0 }}>
                  {i + 1}.
                </span>
                {isPlaceholder(entry.address) ? (
                  <>
                    <Skeleton width="6rem" height="0.85rem" />
                    <span style={{ flex: 1 }}><Skeleton width="100%" height="0.5rem" /></span>
                    <Skeleton width="3rem" height="0.85rem" />
                  </>
                ) : (
                  <>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: isDesktop ? '0.7rem' : '0.85rem',
                        flexShrink: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        minWidth: 0,
                      }}
                    >
                      {shortenAddress(entry.address)}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                      <AsciiBar width={entry.barWidth} />
                    </span>
                    <span
                      style={{
                        color: '#FFA500',
                        fontWeight: 600,
                        textAlign: 'right',
                        flexShrink: 0,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatAmount(entry.totalSpent)}
                    </span>
                  </>
                )}
              </row>
              {i < maxEntries - 1 && (
                <div style={{
                  height: '1px',
                  background: 'var(--background2)',
                  margin: '0 0.75rem',
                }} />
              )}
            </column>
          ))}
        </column>
      </column>

        {/* Recent Transactions */}
        <column box-="round" shear-="both" pad-={isDesktop ? "0.5" : "1"} gap-={isDesktop ? "0.5" : "1"}>
          <row gap-="1" align-="between" style={{ marginBottom: isDesktop ? '0.25rem' : '0.5rem' }}>
            <span is-="badge" variant-="green" cap-="triangle triangle" size-={isDesktop ? "half" : undefined}>📊 Recent Activity</span>
            {!isDesktop && <span is-="badge" variant-="background2" cap-="round" size-="half">live feed</span>}
          </row>
          <column gap-="0" style={{ fontSize: isDesktop ? '0.7rem' : '0.85rem', fontFamily: 'monospace', overflow: 'hidden' }}>
            {displayData.recentTransactions.slice(0, maxEntries).map((tx, i) => {
            const txInfo = getTransactionLabel(tx.type);
            return (
              <column key={`tx-${i}-${tx.version}`} gap-="0">
                <row
                  style={{
                    padding: isDesktop ? '0.25rem 0.5rem' : '0.4rem 0.75rem',
                    gap: '0.5rem',
                    alignItems: 'center',
                    maxWidth: '100%',
                    overflow: 'hidden',
                  }}
                >
                  {isPlaceholder(tx.address) ? (
                    <>
                      <Skeleton width="4rem" height="0.75rem" />
                      <Skeleton width="6rem" height="0.75rem" />
                      <span style={{ flex: 1 }} />
                      <Skeleton width="3rem" height="0.75rem" />
                      <Skeleton width="3rem" height="0.7rem" />
                    </>
                  ) : (
                    <>
                      <span
                        style={{
                          color: txInfo.color,
                          fontSize: '0.75rem',
                          flexShrink: 0,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {txInfo.icon} {txInfo.label}
                      </span>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          flexShrink: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {shortenAddress(tx.address)}
                      </span>
                      <span
                        style={{
                          color: 'var(--foreground)',
                          fontWeight: 500,
                          textAlign: 'right',
                          fontSize: '0.75rem',
                          flexShrink: 0,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {formatAmount(tx.amount)}
                      </span>
                      <span
                        style={{
                          color: 'var(--foreground2)',
                          fontSize: '0.7rem',
                          textAlign: 'right',
                          flexShrink: 0,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        #{tx.version}
                      </span>
                    </>
                  )}
                </row>
                {i < maxEntries - 1 && (
                  <div style={{
                    height: '1px',
                    background: 'var(--background2)',
                    margin: '0 0.75rem',
                  }} />
                )}
              </column>
            );
          })}
        </column>
      </column>
      </row>

      {/* Shimmer animation for skeleton loading */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </column>
  );
}

export const EconomyTab = memo(EconomyTabComponent);
