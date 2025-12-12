import { useState, useEffect } from 'react';
import { generateExpiringBlobs } from '../api/mockData';

export function ExpirationTimeline() {
  const [expiring, setExpiring] = useState(generateExpiringBlobs());

  useEffect(() => {
    const interval = setInterval(() => {
      setExpiring(generateExpiringBlobs());
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }

  const windows = [
    { label: 'Next 24h', data: expiring.next24h, color: 'var(--red)' },
    { label: 'Next Week', data: expiring.nextWeek, color: 'var(--orange)' },
    { label: 'Next Month', data: expiring.nextMonth, color: 'var(--yellow)' }
  ];

  return (
    <column box-="round" pad-="2">
      <column style={{ marginBottom: '1lh' }}>
        <span style={{ fontSize: '1.2em', fontWeight: 'bold', color: 'var(--pink)', letterSpacing: '0.05em' }}>
          ▸ EXPIRATION TIMELINE
        </span>
        <span style={{ fontSize: '0.95em', color: 'var(--foreground2)', marginTop: '0.3lh' }}>
          Blobs approaching expiration deadlines
        </span>
      </column>

      <div is-="separator">━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>

      <column gap-="1.5" style={{ marginTop: '1lh' }}>
        {windows.map(window => {
          const barLength = Math.floor((window.data.count / 150) * 20);

          return (
            <column key={window.label} gap-="0.5">
              <row align-="center between" style={{ fontSize: '1em' }}>
                <span style={{ fontWeight: 'bold', fontFamily: 'monospace', color: 'var(--lime)' }}>◆ {window.label}</span>
                <row gap-="2">
                  <span style={{ color: window.color, fontWeight: 'bold', fontSize: '1.1em' }}>
                    {window.data.count} blobs
                  </span>
                  <span style={{ color: 'var(--foreground2)' }}>
                    ({formatBytes(window.data.totalSize)})
                  </span>
                </row>
              </row>
              <span style={{ fontSize: '0.9em', fontFamily: 'monospace', color: window.color }}>
                {'█'.repeat(Math.max(1, barLength))}{'░'.repeat(20 - Math.max(1, barLength))}
              </span>
            </column>
          );
        })}
      </column>

      {expiring.next24h.count > 0 && (
        <>
          <div is-="separator" style={{ margin: '1.5lh 0' }}>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>
          <span is-="badge" variant-="red" style={{ fontSize: '1em', padding: '0.3em 0.8em', alignSelf: 'flex-start' }}>
            {expiring.next24h.count} urgent - renew soon!
          </span>
        </>
      )}

      <div is-="separator" style={{ margin: '1.5lh 0' }}>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>

      <row align-="center between" style={{ fontSize: '1em' }}>
        <span style={{ color: 'var(--foreground2)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Total at Risk:</span>
        <span style={{ fontWeight: 'bold', color: 'var(--orange)', fontFamily: 'monospace', fontSize: '1.3em' }}>
          {formatBytes(expiring.next24h.totalSize + expiring.nextWeek.totalSize + expiring.nextMonth.totalSize)}
        </span>
      </row>
    </column>
  );
}
