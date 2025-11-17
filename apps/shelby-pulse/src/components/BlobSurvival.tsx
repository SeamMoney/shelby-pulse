import { useState, useEffect } from 'react';
import { calculateRealisticSurvival } from '../api/mockData';
import { calculateSurvivalProbability } from '../api/blobs';

export function BlobSurvival() {
  const [survival, setSurvival] = useState(() => {
    const realistic = calculateRealisticSurvival();
    return {
      ...calculateSurvivalProbability(realistic.activeShards),
      description: realistic.description
    };
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const realistic = calculateRealisticSurvival();
      setSurvival({
        ...calculateSurvivalProbability(realistic.activeShards),
        description: realistic.description
      });
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  const riskBadge = survival.riskLevel === 'LOW' ? 'green' : survival.riskLevel === 'MEDIUM' ? 'blue' : 'orange';

  return (
    <column box-="round" pad-="2">
      <row align-="center between" style={{ marginBottom: '1lh' }}>
        <column>
          <span style={{ fontSize: '1.2em', fontWeight: 'bold', color: 'var(--pink)', letterSpacing: '0.05em' }}>
            ▸ DATA DURABILITY
          </span>
          <span style={{ fontSize: '0.95em', color: 'var(--foreground2)', marginTop: '0.3lh' }}>
            Erasure-coded blob survival probability
          </span>
        </column>
        <span is-="badge" variant-={riskBadge} style={{ fontSize: '1em', padding: '0.3em 0.8em' }}>
          {survival.riskLevel} RISK
        </span>
      </row>

      <div is-="separator">━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>

      <column gap-="1.5" style={{ marginTop: '1lh' }}>
        <column align-="center center">
          <span style={{ fontSize: '3.5em', fontWeight: 'bold', fontFamily: 'monospace', letterSpacing: '0.1em', color: 'var(--lime)' }}>
            {survival.activeShards}/{survival.totalShards}
          </span>
          <span style={{ fontSize: '1em', color: 'var(--foreground2)', marginTop: '0.5lh' }}>
            active shards (minimum required: {survival.requiredShards})
          </span>
        </column>

        <div is-="separator" style={{ margin: '1lh 0' }}>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>

        <column gap-="0.5">
          <span style={{ fontSize: '1.1em', marginBottom: '1lh', color: 'var(--foreground1)', fontWeight: 'bold' }}>
            ▸ Survival if providers fail:
          </span>
          {survival.survivalProbabilities.slice(0, 3).map(prob => {
            const barLength = Math.floor(prob.probability / 5);
            const color = prob.probability > 95 ? 'var(--lime)' : prob.probability > 80 ? 'var(--yellow)' : 'var(--orange)';

            return (
              <column key={prob.failures} gap-="0.5" style={{ marginTop: '1lh' }}>
                <row align-="center between">
                  <span style={{ fontFamily: 'monospace', fontSize: '1em', color: 'var(--foreground1)' }}>
                    ◆ {prob.failures} {prob.failures === 1 ? 'failure' : 'failures'}
                  </span>
                  <span style={{ fontWeight: 'bold', color, fontSize: '1.3em' }}>{prob.probability.toFixed(1)}%</span>
                </row>
                <span style={{ fontSize: '0.9em', fontFamily: 'monospace', color }}>
                  {'█'.repeat(barLength)}{'░'.repeat(20 - barLength)}
                </span>
              </column>
            );
          })}
        </column>
      </column>

      <div is-="separator" style={{ margin: '1.5lh 0' }}>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>

      <row align-="center center">
        <span style={{ fontSize: '0.95em', color: 'var(--foreground2)', textAlign: 'center' }}>
          {survival.description}
        </span>
      </row>
    </column>
  );
}
