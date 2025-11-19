import { useEffect, useState } from 'react';
import { backendApi } from '../api/backend';
import { AsciiBar } from './AsciiBar';

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
  type: 'deposit' | 'withdraw';
  amount: number;
  version: number;
}

interface EconomyData {
  leaderboard: LeaderboardEntry[];
  volume: VolumeData;
  mostActive: ActivityEntry[];
  topSpenders: SpenderEntry[];
  recentTransactions: RecentTransaction[];
  timestamp: number;
}

export function EconomyTab() {
  const [data, setData] = useState<EconomyData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchEconomy = async () => {
      try {
        const economyData = await backendApi.getEconomy();
        setData(economyData);
        setIsLoading(false);
      } catch (error) {
        console.error('Failed to fetch economy data:', error);
        setIsLoading(false);
      }
    };

    fetchEconomy();
    const interval = setInterval(fetchEconomy, 30000); // Refresh every 30s

    return () => clearInterval(interval);
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

  if (isLoading || !data) {
    return (
      <column gap-="1" pad-="1">
        <h2 style={{ color: 'var(--accent)' }}>ShelbyUSD Economy</h2>
        <small style={{ color: 'var(--foreground2)' }}>Loading economy data...</small>
      </column>
    );
  }

  const totalSupply = data.leaderboard.reduce((sum, entry) => sum + entry.balance, 0);

  return (
    <column gap-="2" pad-="1" style={{ overflowY: 'auto', height: '100%' }}>
      {/* Header */}
      <column box-="square" pad-="1" gap-="1">
        <h2 style={{ color: 'var(--accent)', margin: 0 }}>ShelbyUSD Economy</h2>
        <small style={{ color: 'var(--foreground2)' }}>
          Network-wide ShelbyUSD statistics and leaderboards
        </small>
      </column>

      {/* Volume Stats */}
      <column box-="square" pad-="1" gap-="1">
        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>24-Hour Activity</h3>
        <row style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
          <column gap-="0">
            <small style={{ color: 'var(--foreground2)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
              Volume
            </small>
            <h2 style={{ color: '#4A90E2', fontSize: '1.75rem', fontWeight: 700, margin: 0 }}>
              {formatAmount(data.volume.volume24h)}
            </h2>
          </column>
          <column gap-="0">
            <small style={{ color: 'var(--foreground2)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
              Transfers
            </small>
            <h2 style={{ color: '#00C896', fontSize: '1.75rem', fontWeight: 700, margin: 0 }}>
              {data.volume.transferCount24h}
            </h2>
          </column>
          <column gap-="0">
            <small style={{ color: 'var(--foreground2)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
              Velocity
            </small>
            <h2 style={{ color: '#FFA500', fontSize: '1.75rem', fontWeight: 700, margin: 0 }}>
              {data.volume.velocity.toFixed(1)}/hr
            </h2>
          </column>
        </row>
      </column>

      {/* Top Holders Leaderboard */}
      <column box-="square" pad-="1" gap-="1">
        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Top Holders</h3>
        <small style={{ color: 'var(--foreground2)', fontSize: '0.75rem' }}>
          Total Supply: {formatAmount(totalSupply)} ShelbyUSD
        </small>
        <column gap-="0" style={{ fontSize: '0.9rem' }}>
          {data.leaderboard.slice(0, 10).map((entry, i) => (
            <row
              key={entry.address}
              style={{
                padding: '0.5rem 0',
                borderBottom: i < 9 ? '1px solid var(--background2)' : 'none',
                gap: '1rem',
                alignItems: 'center',
              }}
            >
              <span style={{ color: 'var(--foreground2)', minWidth: '1.5rem' }}>
                {i + 1}.
              </span>
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: '0.85rem',
                  minWidth: '140px',
                }}
              >
                {shortenAddress(entry.address)}
              </span>
              <span style={{ flex: 1 }}>
                <AsciiBar width={entry.barWidth} />
              </span>
              <span
                style={{
                  color: 'var(--accent)',
                  fontWeight: 600,
                  minWidth: '80px',
                  textAlign: 'right',
                }}
              >
                {formatAmount(entry.balance)}
              </span>
            </row>
          ))}
        </column>
      </column>

      {/* Most Active Users */}
      <column box-="square" pad-="1" gap-="1">
        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Most Active Users</h3>
        <small style={{ color: 'var(--foreground2)', fontSize: '0.75rem' }}>
          By transaction count
        </small>
        <column gap-="0" style={{ fontSize: '0.9rem' }}>
          {data.mostActive.slice(0, 10).map((entry, i) => (
            <row
              key={entry.address}
              style={{
                padding: '0.5rem 0',
                borderBottom: i < 9 ? '1px solid var(--background2)' : 'none',
                gap: '1rem',
                alignItems: 'center',
              }}
            >
              <span style={{ color: 'var(--foreground2)', minWidth: '1.5rem' }}>
                {i + 1}.
              </span>
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: '0.85rem',
                  minWidth: '140px',
                }}
              >
                {shortenAddress(entry.address)}
              </span>
              <span style={{ flex: 1 }}>
                <AsciiBar width={entry.barWidth} />
              </span>
              <span
                style={{
                  color: '#4A90E2',
                  fontWeight: 600,
                  minWidth: '80px',
                  textAlign: 'right',
                }}
              >
                {entry.txCount} txs
              </span>
            </row>
          ))}
        </column>
      </column>

      {/* Top Spenders */}
      <column box-="square" pad-="1" gap-="1">
        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Biggest Spenders</h3>
        <small style={{ color: 'var(--foreground2)', fontSize: '0.75rem' }}>
          By total withdraw amount
        </small>
        <column gap-="0" style={{ fontSize: '0.9rem' }}>
          {data.topSpenders.slice(0, 10).map((entry, i) => (
            <row
              key={entry.address}
              style={{
                padding: '0.5rem 0',
                borderBottom: i < 9 ? '1px solid var(--background2)' : 'none',
                gap: '1rem',
                alignItems: 'center',
              }}
            >
              <span style={{ color: 'var(--foreground2)', minWidth: '1.5rem' }}>
                {i + 1}.
              </span>
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: '0.85rem',
                  minWidth: '140px',
                }}
              >
                {shortenAddress(entry.address)}
              </span>
              <span style={{ flex: 1 }}>
                <AsciiBar width={entry.barWidth} />
              </span>
              <span
                style={{
                  color: '#FFA500',
                  fontWeight: 600,
                  minWidth: '80px',
                  textAlign: 'right',
                }}
              >
                {formatAmount(entry.totalSpent)}
              </span>
            </row>
          ))}
        </column>
      </column>

      {/* Recent Transactions */}
      <column box-="square" pad-="1" gap-="1">
        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Recent Transactions</h3>
        <small style={{ color: 'var(--foreground2)', fontSize: '0.75rem' }}>
          Latest ShelbyUSD activity
        </small>
        <column gap-="0" style={{ fontSize: '0.85rem', fontFamily: 'monospace' }}>
          {data.recentTransactions.slice(0, 15).map((tx, i) => (
            <row
              key={`${tx.version}-${i}`}
              style={{
                padding: '0.4rem 0',
                borderBottom: i < 14 ? '1px solid var(--background2)' : 'none',
                gap: '0.75rem',
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  color: tx.type === 'withdraw' ? '#FFA500' : '#00C896',
                  minWidth: '60px',
                  fontSize: '0.75rem',
                }}
              >
                {tx.type === 'withdraw' ? '↓ WDRW' : '↑ DPST'}
              </span>
              <span style={{ minWidth: '120px', fontSize: '0.75rem' }}>
                {shortenAddress(tx.address)}
              </span>
              <span
                style={{
                  color: 'var(--foreground)',
                  fontWeight: 500,
                  textAlign: 'right',
                  flex: 1,
                  fontSize: '0.75rem',
                }}
              >
                {formatAmount(tx.amount)}
              </span>
              <span
                style={{
                  color: 'var(--foreground2)',
                  fontSize: '0.7rem',
                  minWidth: '60px',
                  textAlign: 'right',
                }}
              >
                #{tx.version}
              </span>
            </row>
          ))}
        </column>
      </column>
    </column>
  );
}
