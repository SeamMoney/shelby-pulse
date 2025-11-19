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

interface EarnerEntry {
  address: string;
  totalEarned: number;
  barWidth: number;
}

interface SpenderEntry {
  address: string;
  totalSpent: number;
  barWidth: number;
}

interface EconomyData {
  leaderboard: LeaderboardEntry[];
  volume: VolumeData;
  topEarners: EarnerEntry[];
  topSpenders: SpenderEntry[];
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
    if (amount >= 1_000_000) {
      return `${(amount / 1_000_000).toFixed(2)}M`;
    }
    if (amount >= 1_000) {
      return `${(amount / 1_000).toFixed(2)}K`;
    }
    return amount.toFixed(0);
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
      <column gap-="1">
        <h2 style={{ color: 'var(--accent)', margin: 0 }}>
          ╔═══════════════════════════╗
          <br />
          ║  SHELBYUSD ECONOMY       ║
          <br />
          ╚═══════════════════════════╝
        </h2>
        <small style={{ color: 'var(--foreground2)' }}>
          Network-wide ShelbyUSD statistics and leaderboards
        </small>
      </column>

      {/* Volume Stats */}
      <column gap-="1" style={{ padding: '1rem', background: 'var(--background1)' }}>
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
      <column gap-="1">
        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>
          ┌─── Top Holders ───┐
        </h3>
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

      {/* Top Earners & Spenders */}
      <row
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '1.5rem',
        }}
      >
        {/* Top Earners */}
        <column gap-="1">
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>
            ┌─── Top Earners ───┐
          </h3>
          <small style={{ color: 'var(--foreground2)', fontSize: '0.75rem' }}>
            Accounts earning most from read rewards
          </small>
          <column gap-="0" style={{ fontSize: '0.85rem' }}>
            {data.topEarners.map((entry, i) => (
              <row
                key={entry.address}
                style={{
                  padding: '0.4rem 0',
                  borderBottom: i < data.topEarners.length - 1 ? '1px solid var(--background2)' : 'none',
                  gap: '0.75rem',
                  alignItems: 'center',
                }}
              >
                <span style={{ color: 'var(--foreground2)', minWidth: '1.5rem' }}>
                  {i + 1}.
                </span>
                <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', minWidth: '120px' }}>
                  {shortenAddress(entry.address)}
                </span>
                <span style={{ flex: 1 }}>
                  <AsciiBar width={entry.barWidth} color="#00C896" />
                </span>
                <span style={{ color: '#00C896', fontWeight: 600, minWidth: '60px', textAlign: 'right' }}>
                  {formatAmount(entry.totalEarned)}
                </span>
              </row>
            ))}
          </column>
        </column>

        {/* Top Spenders */}
        <column gap-="1">
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>
            ┌─── Top Spenders ───┐
          </h3>
          <small style={{ color: 'var(--foreground2)', fontSize: '0.75rem' }}>
            Accounts spending most on upload costs
          </small>
          <column gap-="0" style={{ fontSize: '0.85rem' }}>
            {data.topSpenders.map((entry, i) => (
              <row
                key={entry.address}
                style={{
                  padding: '0.4rem 0',
                  borderBottom: i < data.topSpenders.length - 1 ? '1px solid var(--background2)' : 'none',
                  gap: '0.75rem',
                  alignItems: 'center',
                }}
              >
                <span style={{ color: 'var(--foreground2)', minWidth: '1.5rem' }}>
                  {i + 1}.
                </span>
                <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', minWidth: '120px' }}>
                  {shortenAddress(entry.address)}
                </span>
                <span style={{ flex: 1 }}>
                  <AsciiBar width={entry.barWidth} color="#FF6B6B" />
                </span>
                <span style={{ color: '#FF6B6B', fontWeight: 600, minWidth: '60px', textAlign: 'right' }}>
                  {formatAmount(entry.totalSpent)}
                </span>
              </row>
            ))}
          </column>
        </column>
      </row>
    </column>
  );
}
