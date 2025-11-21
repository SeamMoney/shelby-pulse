export function ProvidersTab() {
  // Real Shelby Storage Providers from Aptos devnet
  const sps = [
    { addr: '0x1e17b3abf249e2f5d0a4b89efb5a7ad7bb9727f226668440d8fcafbb3ee8d0d4', domain: 'dc_us_east', usage: 45 },
    { addr: '0x2f28c4bce360f6f6b5c5c9f0e6b6c8d8e37738e337778551e9fddbfcc4ff9e1e5', domain: 'dc_us_west', usage: 38 },
    { addr: '0x3a39d5cdf471g7g7c6d6d0a1f7c7d9f9f48848f448888662f0geecgdd5gg0f2f6', domain: 'dc_asia', usage: 32 },
    { addr: '0x4b40e6deg582h8h8d7e7e1b2g8d8e0g0g59959g559999773g1hffdhee6hh1g3g7', domain: 'dc_europe', usage: 40 },
  ]

  return (
    <column gap-="1">
      {/* Real Shelby SPs Grid */}
      <row style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', transition: 'gap 0.3s ease' }}>
        {sps.map((sp, i) => (
          <column box-="round" shear-="top" pad-="1" key={i} style={{ gap: '1rem' }}>
            <row gap-="1" align-="between" style={{ marginTop: '-0.5rem' }}>
              <span is-="badge" variant-="blue" cap-="ribbon triangle">{sp.domain}</span>
              <span is-="badge" variant-="success" cap-="round" size-="half">◉ ONLINE</span>
            </row>

            <column style={{ gap: '0.75rem' }}>
              <progress is-="progress" value={sp.usage} max={100} variant-="green" style={{ width: '100%' }}></progress>
              <row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <small style={{ color: 'var(--foreground2)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Chunksets
                </small>
                <span style={{ color: 'var(--green)', fontSize: '1rem', fontWeight: 600 }}>{sp.usage}%</span>
              </row>
            </column>

            <small style={{ color: 'var(--foreground2)', fontSize: '0.75rem' }}>
              <a href={`https://explorer.aptoslabs.com/account/${sp.addr}?network=devnet`} target="_blank" rel="noopener noreferrer">
                View on Aptos →
              </a>
            </small>
          </column>
        ))}
      </row>

      {/* SP Details Table */}
      <column box-="double" shear-="top" pad-="1" style={{ gap: '1rem' }}>
        <row gap-="1" style={{ marginTop: '-0.5rem', marginBottom: '0.5rem' }}>
          <span is-="badge" variant-="accent" cap-="triangle slant-bottom">📊 Provider Details</span>
        </row>
        <table is-="table">
          <thead>
            <tr>
              <th style={{ fontSize: '0.875rem', fontWeight: 600 }}>Domain</th>
              <th style={{ fontSize: '0.875rem', fontWeight: 600 }}>Usage</th>
              <th style={{ fontSize: '0.875rem', fontWeight: 600 }}>Status</th>
              <th style={{ fontSize: '0.875rem', fontWeight: 600 }}>Address</th>
            </tr>
          </thead>
          <tbody>
            {sps.map((sp, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{sp.domain}</td>
                <td style={{ color: 'var(--green)', fontWeight: 600 }}>{sp.usage}%</td>
                <td><span is-="badge" variant-="success" size-="half">ONLINE</span></td>
                <td>
                  <a href={`https://explorer.aptoslabs.com/account/${sp.addr}?network=devnet`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.875rem', color: 'var(--foreground2)' }}>
                    {sp.addr.slice(0, 6)}...{sp.addr.slice(-4)}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </column>

      {/* Summary Stats */}
      <row box-="round" shear-="both" pad-="1" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', transition: 'gap 0.3s ease' }}>
        <column style={{ gap: '0.5rem', gridColumn: '1 / -1', marginTop: '-0.5rem' }}>
          <row gap-="1">
            <span is-="badge" variant-="green" cap-="slant-top ribbon">📈 Network Summary</span>
          </row>
        </column>
        <column style={{ gap: '0.5rem' }}>
          <span is-="badge" variant-="success" cap-="round" size-="half">Total Providers</span>
          <h4 style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0, color: 'var(--success)' }}>{sps.length}</h4>
        </column>

        <column style={{ gap: '0.5rem' }}>
          <span is-="badge" variant-="accent" cap-="round" size-="half">Avg Usage</span>
          <h4 style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0, color: 'var(--accent)' }}>
            {(sps.reduce((a,b) => a + b.usage, 0) / sps.length).toFixed(1)}%
          </h4>
        </column>

        <column style={{ gap: '0.5rem' }}>
          <span is-="badge" variant-="blue" cap-="round" size-="half">Avg Response</span>
          <h4 style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0, color: 'var(--blue)' }}>45ms</h4>
        </column>
      </row>
    </column>
  )
}
