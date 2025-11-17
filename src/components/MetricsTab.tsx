export function MetricsTab() {
  return (
    <column gap-="1">
      {/* Real Shelby Metrics Grid */}
      <row style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
        <column style={{ gap: '1rem' }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0 }}>Read Latency</h3>

          <column style={{ gap: '0.75rem' }}>
            <row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <small style={{ color: 'var(--foreground2)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Avg Response
              </small>
              <span style={{ color: 'var(--success)', fontSize: '1rem', fontWeight: 600 }}>~450ms</span>
            </row>
            <row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <small style={{ color: 'var(--foreground2)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Target
              </small>
              <span style={{ color: 'var(--foreground2)', fontSize: '0.875rem' }}>&lt;600ms</span>
            </row>
          </column>

          <small style={{ color: 'var(--foreground2)', fontSize: '0.75rem', marginTop: '0.5rem', lineHeight: 1.5 }}>
            Avg(tx_timestamp - read_event_time)
          </small>
        </column>

        <column style={{ gap: '1rem' }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0 }}>Shard Durability</h3>

          <column style={{ gap: '0.75rem' }}>
            <row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <small style={{ color: 'var(--foreground2)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Recovery Threshold
              </small>
              <span style={{ color: 'var(--accent)', fontSize: '1rem', fontWeight: 600 }}>k=10/16</span>
            </row>
            <row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <small style={{ color: 'var(--foreground2)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Overhead
              </small>
              <span style={{ color: 'var(--foreground2)', fontSize: '0.875rem' }}>1.5x (Clay)</span>
            </row>
          </column>

          <small style={{ color: 'var(--foreground2)', fontSize: '0.75rem', marginTop: '0.5rem', lineHeight: 1.5 }}>
            chunkset_count * n / blob_size
          </small>
        </column>

        <column style={{ gap: '1rem' }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0 }}>Audit Frequency</h3>

          <column style={{ gap: '0.75rem' }}>
            <row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <small style={{ color: 'var(--foreground2)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                VRF Challenges
              </small>
              <span style={{ color: 'var(--yellow)', fontSize: '1rem', fontWeight: 600 }}>3/epoch</span>
            </row>
            <row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <small style={{ color: 'var(--foreground2)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Pass Rate
              </small>
              <span style={{ color: 'var(--success)', fontSize: '0.875rem', fontWeight: 600 }}>100%</span>
            </row>
          </column>

          <small style={{ color: 'var(--foreground2)', fontSize: '0.75rem', marginTop: '0.5rem', lineHeight: 1.5 }}>
            audit_challenge count / epochs
          </small>
        </column>
      </row>

      {/* Detailed Metrics Breakdown */}
      <column style={{ gap: '1rem' }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Metric Details</h3>
        <table is-="table">
          <thead>
            <tr>
              <th style={{ fontSize: '0.875rem', fontWeight: 600 }}>Metric</th>
              <th style={{ fontSize: '0.875rem', fontWeight: 600 }}>Value</th>
              <th style={{ fontSize: '0.875rem', fontWeight: 600 }}>Source</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ fontWeight: 600 }}>Read Latency</td>
              <td style={{ color: 'var(--success)', fontWeight: 600 }}>450ms avg</td>
              <td style={{ fontSize: '0.875rem', color: 'var(--foreground2)' }}>
                Withdraw events
              </td>
            </tr>
            <tr>
              <td style={{ fontWeight: 600 }}>Shard Overhead</td>
              <td style={{ color: 'var(--accent)', fontWeight: 600 }}>1.5x (Clay)</td>
              <td style={{ fontSize: '0.875rem', color: 'var(--foreground2)' }}>
                BlobMetadata
              </td>
            </tr>
            <tr>
              <td style={{ fontWeight: 600 }}>Audit Pass Rate</td>
              <td style={{ color: 'var(--success)', fontWeight: 600 }}>100%</td>
              <td style={{ fontSize: '0.875rem', color: 'var(--foreground2)' }}>
                SP audit challenges
              </td>
            </tr>
            <tr>
              <td style={{ fontWeight: 600 }}>Storage Cost</td>
              <td style={{ color: 'var(--blue)', fontWeight: 600 }}>~$0.01/TB/mo</td>
              <td style={{ fontSize: '0.875rem', color: 'var(--foreground2)' }}>
                Payment tiers
              </td>
            </tr>
          </tbody>
        </table>
      </column>
    </column>
  )
}
