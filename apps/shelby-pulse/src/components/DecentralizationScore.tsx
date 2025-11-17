import { useState, useEffect } from 'react';
import { generateMockStorageProviders } from '../api/mockData';
import { calculateDecentralizationScore } from '../api/storageProviders';

export function DecentralizationScore() {
  const [metrics, setMetrics] = useState(() => {
    const providers = generateMockStorageProviders();
    return calculateDecentralizationScore(providers);
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const providers = generateMockStorageProviders();
      setMetrics(calculateDecentralizationScore(providers));
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const scoreColor = metrics.score > 0.7 ? '#22c55e' : metrics.score > 0.5 ? '#eab308' : '#f59e0b';
  const scoreRating = metrics.score > 0.7 ? 'Excellent' : metrics.score > 0.5 ? 'Good' : 'Fair';

  return (
    <column box-="round" pad-="2.5" gap-="1.8">
      {/* Header */}
      <row align-="center between">
        <column gap-="0.3">
          <span className="glow" style={{ fontSize: '1.2em', fontWeight: '600', letterSpacing: '0.15em' }}>
            NETWORK DECENTRALIZATION
          </span>
          <span style={{ fontSize: '0.85em', opacity: 0.6 }}>
            Data distribution across global data centers
          </span>
        </column>
        <column align-="end center" gap-="0.5">
          <span className="metric-value" style={{ fontSize: '2.8em', color: scoreColor, textShadow: `0 0 15px ${scoreColor}` }}>
            {(metrics.score * 100).toFixed(0)}
          </span>
          <span is-="badge" variant-={scoreRating === 'Excellent' ? 'green' : scoreRating === 'Good' ? 'blue' : 'orange'}>
            {scoreRating.toUpperCase()}
          </span>
        </column>
      </row>

      <div is-="separator"></div>

      {/* Domain Distribution */}
      <column gap-="1.3">
        {metrics.domainStats.slice(0, 4).map(domain => {
          const percentage = domain.percentage;
          const domainName = domain.domain.replace('dc_', '').replace('_', ' ').toUpperCase();

          return (
            <column key={domain.domain} gap-="0.6">
              <row align-="center between" style={{ fontSize: '0.95em' }}>
                <row gap-="1.2" align-="center start">
                  <span style={{ fontWeight: '600', color: '#7dd3fc' }}>
                    {domainName}
                  </span>
                  <span style={{ opacity: 0.6 }}>
                    {domain.providers} providers
                  </span>
                </row>
                <span className="metric-value" style={{ fontSize: '1.2em' }}>
                  {percentage.toFixed(0)}%
                </span>
              </row>
              <div className="stat-bar-fill" style={{ height: '8px' }}>
                <div className="stat-bar-progress" style={{ width: `${percentage}%`, height: '100%' }}></div>
              </div>
            </column>
          );
        })}
      </column>

      <div is-="separator"></div>

      {/* Summary Stats */}
      <row gap-="3" align-="center around" style={{ padding: '0.8rem 0' }}>
        <column align-="center center" gap-="0.5">
          <span className="metric-label" style={{ fontSize: '0.75em' }}>TOTAL CHUNKS</span>
          <span className="metric-value glow" style={{ fontSize: '1.8em' }}>
            {(metrics.totalChunksets / 1000).toFixed(0)}k
          </span>
        </column>
        <div style={{ width: '1px', height: '2.5rem', background: '#0ea5e9', opacity: 0.3 }}></div>
        <column align-="center center" gap-="0.5">
          <span className="metric-label" style={{ fontSize: '0.75em' }}>PROVIDERS</span>
          <span className="metric-value glow" style={{ fontSize: '1.8em' }}>
            {metrics.totalProviders}
          </span>
        </column>
      </row>
    </column>
  );
}
