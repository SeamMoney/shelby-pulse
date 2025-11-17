import { useState, useEffect } from 'react';
import { generatePaymentTiers } from '../api/mockData';

export function PaymentTierROI() {
  const [tiers, setTiers] = useState(generatePaymentTiers());

  useEffect(() => {
    const interval = setInterval(() => {
      setTiers(generatePaymentTiers());
    }, 12000);
    return () => clearInterval(interval);
  }, []);

  return (
    <column box-="round" pad-="2">
      <column style={{ marginBottom: '1lh' }}>
        <span style={{ fontSize: '1.2em', fontWeight: 'bold', color: 'var(--pink)', letterSpacing: '0.05em' }}>
          ▸ PAYMENT TIER COMPARISON
        </span>
        <span style={{ fontSize: '0.95em', color: 'var(--foreground2)', marginTop: '0.3lh' }}>
          ROI analysis for storage tiers
        </span>
      </column>

      <div is-="separator">━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>

      <column gap-="2" style={{ marginTop: '1lh' }}>
        {tiers.map((tier, i) => {
          const roiColor =
            tier.netROI > 15 ? 'var(--lime)' :
            tier.netROI > 5 ? 'var(--yellow)' :
            'var(--orange)';

          const barLength = Math.floor((tier.netROI + 50) / 5); // Offset for negative ROI

          return (
            <>
              <column key={tier.tier} gap-="0.8">
                <row align-="center between" style={{ fontSize: '1em' }}>
                  <row gap-="2" align-="center start">
                    <span style={{ fontWeight: 'bold', minWidth: '10ch', fontFamily: 'monospace', color: 'var(--lime)' }}>
                      ◆ TIER {tier.tier}
                    </span>
                    {tier.recommended && (
                      <span is-="badge" variant-="green" style={{ fontSize: '0.9em', padding: '0.2em 0.6em' }}>
                        ✓ BEST
                      </span>
                    )}
                  </row>
                  <span style={{ fontWeight: 'bold', color: roiColor, fontSize: '1.4em', fontFamily: 'monospace' }}>
                    {tier.netROI > 0 ? '+' : ''}{tier.netROI.toFixed(1)}%
                  </span>
                </row>

                <row align-="center between" style={{ fontSize: '0.9em', color: 'var(--foreground2)', marginTop: '0.5lh', fontFamily: 'monospace' }}>
                  <span>${tier.costPerGB.toFixed(3)}/GB</span>
                  <span style={{ color: 'var(--pink)' }}>•</span>
                  <span>{tier.readsPerDay.toFixed(0)} reads/day</span>
                  <span style={{ color: 'var(--pink)' }}>•</span>
                  <span>${tier.earnings.toFixed(4)}/day</span>
                </row>

                <span style={{ fontSize: '0.9em', fontFamily: 'monospace', color: roiColor, marginTop: '0.5lh' }}>
                  {'█'.repeat(Math.max(1, barLength))}{'░'.repeat(Math.max(0, 20 - barLength))}
                </span>

                {tier.recommended && (
                  <span style={{ fontSize: '0.9em', color: 'var(--lime)', marginTop: '0.5lh' }}>
                    {tier.description}
                  </span>
                )}
              </column>
              {i < tiers.length - 1 && <div is-="separator">- - - - - - - - - - - - - - - - - - - - - - -</div>}
            </>
          );
        })}
      </column>
    </column>
  );
}
