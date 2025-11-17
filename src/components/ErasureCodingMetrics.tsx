import { useState, useEffect } from 'react';
import { getErasureCodingStats } from '../api/mockData';
import { calculateShardBalance } from '../api/erasureCoding';

export function ErasureCodingMetrics() {
  const [stats, setStats] = useState(getErasureCodingStats());
  const [shardBalance] = useState(() => calculateShardBalance(14));

  useEffect(() => {
    const interval = setInterval(() => {
      setStats(getErasureCodingStats());
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <column box-="round" pad-="2">
      <column style={{ marginBottom: '1lh' }}>
        <span style={{ fontSize: '1.2em', fontWeight: 'bold', color: 'var(--pink)', letterSpacing: '0.05em' }}>
          ▸ ERASURE CODING EFFICIENCY
        </span>
        <span style={{ fontSize: '0.95em', color: 'var(--foreground2)', marginTop: '0.3lh' }}>
          Clay encoding overhead analysis
        </span>
      </column>

      <div is-="separator">━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>

      <row gap-="4" align-="center around" style={{ padding: '1.5lh 0', fontSize: '1.1em' }}>
        <column align-="center center">
          <span style={{ color: 'var(--foreground2)', textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.9em' }}>Theoretical</span>
          <span style={{ fontSize: '2em', fontWeight: 'bold', fontFamily: 'monospace', marginTop: '0.3lh' }}>
            {stats.theoreticalOverhead.toFixed(2)}x
          </span>
        </column>

        <span style={{ fontSize: '2em', color: 'var(--pink)' }}>│</span>

        <column align-="center center">
          <span style={{ color: 'var(--foreground2)', textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.9em' }}>Actual</span>
          <span style={{ fontSize: '2em', fontWeight: 'bold', color: stats.actualOverhead > stats.theoreticalOverhead + 0.05 ? 'var(--orange)' : 'var(--lime)', fontFamily: 'monospace', marginTop: '0.3lh' }}>
            {stats.actualOverhead.toFixed(2)}x
          </span>
        </column>

        <span style={{ fontSize: '2em', color: 'var(--pink)' }}>│</span>

        <column align-="center center">
          <span style={{ color: 'var(--foreground2)', textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.9em' }}>Efficiency</span>
          <span style={{ fontSize: '2em', fontWeight: 'bold', color: 'var(--lime)', fontFamily: 'monospace', marginTop: '0.3lh' }}>
            {stats.efficiency.toFixed(0)}%
          </span>
        </column>
      </row>

      <div is-="separator">━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>

      <column gap-="1" style={{ marginTop: '1lh' }}>
        <row align-="center between" style={{ fontSize: '1em' }}>
          <span style={{ color: 'var(--foreground2)' }}>Logical Data:</span>
          <span style={{ fontWeight: 'bold', fontFamily: 'monospace', fontSize: '1.1em' }}>{stats.totalLogicalData.toFixed(2)} TB</span>
        </row>
        <row align-="center between" style={{ fontSize: '1em' }}>
          <span style={{ color: 'var(--foreground2)' }}>Physical Storage:</span>
          <span style={{ fontWeight: 'bold', fontFamily: 'monospace', fontSize: '1.1em' }}>{stats.totalPhysicalStorage.toFixed(2)} TB</span>
        </row>
        <row align-="center between" style={{ fontSize: '1em' }}>
          <span style={{ color: 'var(--foreground2)' }}>Waste:</span>
          <span style={{ color: 'var(--orange)', fontWeight: 'bold', fontFamily: 'monospace', fontSize: '1.1em' }}>{stats.wastedStorage.toFixed(2)} GB</span>
        </row>
      </column>

      <div is-="separator" style={{ margin: '1.5lh 0' }}>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>

      <column align-="center center" gap-="0.8" style={{ padding: '1lh 0' }}>
        <span style={{ fontSize: '0.95em', color: 'var(--foreground2)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5lh' }}>
          Example Shard Distribution
        </span>
        <row style={{ fontSize: '1.5em', fontFamily: 'monospace' }}>
          <span style={{ color: 'var(--lime)' }}>{'●'.repeat(shardBalance.activeShards)}</span>
          <span style={{ color: 'var(--background3)' }}>
            {'○'.repeat(shardBalance.totalShards - shardBalance.activeShards)}
          </span>
        </row>
        <span style={{ fontSize: '0.9em', color: 'var(--foreground2)', fontFamily: 'monospace', marginTop: '0.5lh' }}>
          {shardBalance.activeShards} active / {shardBalance.totalShards} total (k={shardBalance.requiredShards} min)
        </span>
        <span
          is-="badge"
          variant-={
            shardBalance.health === 'EXCELLENT' ? 'green' :
            shardBalance.health === 'GOOD' ? 'blue' : 'orange'
          }
          style={{ fontSize: '1em', marginTop: '0.8lh', padding: '0.3em 0.8em' }}
        >
          {shardBalance.health}
        </span>
      </column>
    </column>
  );
}
