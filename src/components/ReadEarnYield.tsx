import { useState, useEffect } from 'react';
import { calculateRealisticEarnings } from '../api/mockData';

export function ReadEarnYield() {
  const [earnings, setEarnings] = useState(calculateRealisticEarnings());

  useEffect(() => {
    const interval = setInterval(() => {
      setEarnings(calculateRealisticEarnings());
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const isProfitable = earnings.netProfit > 0;

  return (
    <column box-="round" pad-="2">
      <column style={{ marginBottom: '1lh' }}>
        <span style={{ fontSize: '1.2em', fontWeight: 'bold', color: 'var(--pink)', letterSpacing: '0.05em' }}>
          ▸ READ-TO-EARN ECONOMICS
        </span>
        <span style={{ fontSize: '0.95em', color: 'var(--foreground2)', marginTop: '0.3lh' }}>
          Passive income from hot storage
        </span>
      </column>

      <div is-="separator">━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>

      <column align-="center center" style={{ padding: '1.5lh 0' }}>
        <span style={{ fontSize: '0.9em', color: 'var(--foreground2)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.8lh' }}>Daily Earnings</span>
        <span style={{ fontSize: '3.5em', fontWeight: 'bold', color: 'var(--lime)', fontFamily: 'monospace', letterSpacing: '0.05em' }}>
          ${earnings.dailyEarnings.toFixed(4)}
        </span>
        <span style={{ fontSize: '1em', color: 'var(--foreground2)', marginTop: '0.8lh' }}>
          from {earnings.dailyReads} reads/day
        </span>
      </column>

      <div is-="separator">━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>

      <row gap-="4" align-="center around" style={{ padding: '1.5lh 0', fontSize: '1.1em' }}>
        <column align-="center center">
          <span style={{ color: 'var(--foreground2)', textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.9em' }}>Weekly</span>
          <span style={{ fontSize: '1.5em', fontWeight: 'bold', color: 'var(--yellow)', fontFamily: 'monospace', marginTop: '0.3lh' }}>
            ${earnings.weeklyEarnings.toFixed(3)}
          </span>
        </column>

        <span style={{ fontSize: '2em', color: 'var(--pink)' }}>│</span>

        <column align-="center center">
          <span style={{ color: 'var(--foreground2)', textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.9em' }}>Monthly</span>
          <span style={{ fontSize: '1.5em', fontWeight: 'bold', color: 'var(--lime)', fontFamily: 'monospace', marginTop: '0.3lh' }}>
            ${earnings.monthlyEarnings.toFixed(2)}
          </span>
        </column>
      </row>

      <div is-="separator">━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>

      <column gap-="1" style={{ padding: '1lh 0' }}>
        <row align-="center between" style={{ fontSize: '1em' }}>
          <span style={{ color: 'var(--foreground2)' }}>Storage Cost (1GB):</span>
          <span style={{ color: 'var(--orange)', fontFamily: 'monospace', fontWeight: 'bold', fontSize: '1.1em' }}>-${earnings.storageCost.toFixed(3)}/mo</span>
        </row>
        <row align-="center between" style={{ fontSize: '1em', marginTop: '0.5lh' }}>
          <span style={{ fontWeight: 'bold' }}>Net Profit:</span>
          <span style={{ fontWeight: 'bold', color: isProfitable ? 'var(--lime)' : 'var(--red)', fontFamily: 'monospace', fontSize: '1.3em' }}>
            {isProfitable ? '+' : ''}${earnings.netProfit.toFixed(3)}/mo
          </span>
        </row>
      </column>

      <div is-="separator">━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>

      <row align-="center center" style={{ padding: '1lh 0' }}>
        <span is-="badge" variant-={isProfitable ? 'green' : 'orange'} style={{ fontSize: '1em', padding: '0.3em 1em' }}>
          {isProfitable ? '✓ PROFITABLE' : 'NEEDS MORE TRAFFIC'}
        </span>
      </row>
    </column>
  );
}
