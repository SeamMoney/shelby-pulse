import { useQuery } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { fetchNetworkStats } from './api/shelby'

interface Transaction {
  id: string
  time: string
  type: 'UPLOAD' | 'DOWNLOAD' | 'DELETE'
  account: string
  size: string
  status: '✓' | '✗'
  gasUsed: string
}

function App() {
  const { data: stats } = useQuery({
    queryKey: ['networkStats'],
    queryFn: fetchNetworkStats,
    refetchInterval: 3000,
  })

  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [liveCounter, setLiveCounter] = useState(208658)
  const [networkHealth, setNetworkHealth] = useState(89)
  const [uploadRate, setUploadRate] = useState(4.2)
  const [downloadRate, setDownloadRate] = useState(8.7)
  const [gasPrice, setGasPrice] = useState(0.00034)
  const [queueSize, setQueueSize] = useState(12)
  const [bandwidthUsage, setBandwidthUsage] = useState(67)
  const [storageUsage, setStorageUsage] = useState(58)
  const [activeNodes, setActiveNodes] = useState(23)

  useEffect(() => {
    const addTransaction = () => {
      const types: ('UPLOAD' | 'DOWNLOAD' | 'DELETE')[] = ['UPLOAD', 'UPLOAD', 'UPLOAD', 'DOWNLOAD', 'DELETE']
      const sizes = ['2.4KB', '156KB', '1.2MB', '89KB', '3.7MB', '45KB', '234KB', '1.8MB', '523KB']
      const accounts = ['0x7730...46ef', '0x9a23...1bc4', '0x4f12...8a7d', '0xb2a5...e9a0', '0x1cd4...92fe']

      const newTx: Transaction = {
        id: Math.random().toString(36),
        time: new Date().toLocaleTimeString('en-US', { hour12: false }),
        type: types[Math.floor(Math.random() * types.length)],
        account: accounts[Math.floor(Math.random() * accounts.length)],
        size: sizes[Math.floor(Math.random() * sizes.length)],
        status: Math.random() > 0.12 ? '✓' : '✗',
        gasUsed: (Math.random() * 0.001).toFixed(5) + ' APT'
      }

      setTransactions(prev => [newTx, ...prev].slice(0, 10))

      if (newTx.type === 'UPLOAD' && newTx.status === '✓') {
        setLiveCounter(prev => prev + 1)
      }
    }

    const interval = setInterval(addTransaction, 2000 + Math.random() * 3000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setNetworkHealth(prev => Math.max(75, Math.min(98, prev + (Math.random() - 0.5) * 3)))
      setUploadRate(prev => Math.max(2, Math.min(8, prev + (Math.random() - 0.5) * 1)))
      setDownloadRate(prev => Math.max(5, Math.min(15, prev + (Math.random() - 0.5) * 2)))
      setGasPrice(prev => Math.max(0.0002, Math.min(0.0008, prev + (Math.random() - 0.5) * 0.0001)))
      setQueueSize(prev => Math.max(0, Math.min(50, Math.floor(prev + (Math.random() - 0.5) * 5))))
      setBandwidthUsage(prev => Math.max(30, Math.min(95, prev + (Math.random() - 0.5) * 8)))
      setStorageUsage(prev => Math.max(45, Math.min(85, prev + (Math.random() - 0.5) * 3)))
      setActiveNodes(prev => Math.max(15, Math.min(40, Math.floor(prev + (Math.random() - 0.5) * 3))))
    }, 4000)
    return () => clearInterval(interval)
  }, [])

  const currentTime = new Date().toLocaleTimeString('en-US', { hour12: false })
  const successRate = Math.floor((transactions.filter(t => t.status === '✓').length / Math.max(transactions.length, 1)) * 100)

  return (
    <column style={{ minHeight: '100vh', padding: '2ch', gap: '2lh' }}>
      {/* Header */}
      <row box-="double" pad-="2 1" align-="center between">
        <column gap-="1">
          <h1 style={{ margin: 0, fontSize: '2em', color: 'var(--pink)', fontFamily: 'monospace' }}>
            ╔═══════════════════════════╗<br/>
            ║   SHELBY/PULSE v1.0.0    ║<br/>
            ╚═══════════════════════════╝
          </h1>
          <row gap-="1" align-="center start">
            <span style={{ color: 'var(--foreground1)' }}>→ shelbynet:prod</span>
            <div is-="separator" direction-="vertical" style={{ height: '1lh', '--separator-color': 'var(--pink)' } as any}></div>
            <span style={{ color: 'var(--foreground1)' }}>⏰ {currentTime} UTC</span>
            <span is-="badge" variant-="green" style={{ marginLeft: '0.5ch' }}>◉ LIVE</span>
          </row>
        </column>
      </row>

      {/* Main Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gridAutoRows: 'minmax(12lh, auto)',
        gap: '1ch 1ch',
        flexGrow: 1
      }}>
        {/* Network Health Chart Widget */}
        <column
          box-="round"
          shear-="top"
          align-="stretch end"
          pad-="2 1"
          style={{ gridColumn: '1 / 2', gridRow: '1 / 2' }}>
          <span style={{ marginBottom: '1lh', color: 'var(--pink)', fontWeight: 'bold' }}>
            ╭─────────────────╮<br/>
            │ NETWORK HEALTH │<br/>
            ╰─────────────────╯
          </span>
          <row self-="grow">
            <column gap-="0" style={{ fontSize: '0.8em', color: 'var(--foreground2)', marginRight: '1ch' }}>
              <span>100</span>
              <span style={{ marginTop: 'auto' }}>50</span>
              <span>0</span>
            </column>
            <div is-="separator" direction-="vertical" style={{ '--separator-color': 'var(--background3)' } as any}></div>
            <column self-="grow" style={{ marginLeft: '1ch' }}>
              <row self-="grow" gap-="1" align-="end start">
                <div style={{ height: `${networkHealth / 100 * 4}lh`, width: '1ch', background: 'var(--lime)' }}></div>
                <div style={{ height: `${successRate / 100 * 4}lh`, width: '1ch', background: 'var(--lime)' }}></div>
                <div style={{ height: `${(100 - storageUsage) / 100 * 4}lh`, width: '1ch', background: 'var(--lime)' }}></div>
                <div style={{ height: `${(100 - bandwidthUsage) / 100 * 4}lh`, width: '1ch', background: 'var(--lime)' }}></div>
                <div style={{ height: `${networkHealth / 100 * 4}lh`, width: '1ch', background: 'var(--lime)' }}></div>
                <div style={{ height: `${successRate / 100 * 4}lh`, width: '1ch', background: 'var(--lime)' }}></div>
              </row>
              <div is-="separator" style={{ '--separator-color': 'var(--background3)' } as any}></div>
            </column>
          </row>
          <span style={{ fontSize: '0.8em', color: 'var(--foreground2)', marginTop: '0.5lh' }}>
            Health: {networkHealth.toFixed(0)}% | Success: {successRate}%
          </span>
        </column>

        {/* Live Metrics Widget */}
        <column
          box-="double"
          shear-="top"
          gap-="1"
          pad-="2 1"
          style={{ gridColumn: '2 / 4', gridRow: '1 / 3' }}>
          <row align-="center between">
            <span style={{ color: 'var(--pink)', fontWeight: 'bold' }}>
              ╔══════════════╗<br/>
              ║ LIVE METRICS ║<br/>
              ╚══════════════╝
            </span>
            <span is-="badge" variant-="pink">⚡ Real-time</span>
          </row>
          <column gap-="1" self-="grow">
            <row gap-="2" align-="center between" style={{ padding: '0.5lh 0' }}>
              <span style={{ color: 'var(--foreground1)' }}>▸ Total Blobs:</span>
              <row gap-="1" align-="center end">
                <span style={{ fontWeight: 'bold', fontSize: '1.2em', color: 'var(--pink)' }}>[{liveCounter.toLocaleString()}]</span>
                <span is-="badge" variant-="green" style={{ fontSize: '0.8em' }}>↑ +{Math.floor(uploadRate)}/min</span>
              </row>
            </row>
            <div is-="separator" style={{ '--separator-color': 'var(--pink-10)' } as any}>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>

            <row gap-="2" align-="center between" style={{ padding: '0.5lh 0' }}>
              <span style={{ color: 'var(--foreground1)' }}>▸ Total Storage:</span>
              <row gap-="1" align-="center end">
                <span style={{ fontWeight: 'bold' }}>[{stats?.totalStorage || '2.89 TB'}]</span>
                <span is-="badge" variant-="blue" style={{ fontSize: '0.8em' }}>↑ +14 GB today</span>
              </row>
            </row>
            <div is-="separator" style={{ '--separator-color': 'var(--pink-10)' } as any}>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>

            <row gap-="2" align-="center between" style={{ padding: '0.5lh 0' }}>
              <span style={{ color: 'var(--foreground1)' }}>▸ Upload Rate:</span>
              <row gap-="1" align-="center end">
                <span style={{ fontWeight: 'bold' }}>[{uploadRate.toFixed(1)}/min]</span>
                <span is-="badge" variant-="green" style={{ fontSize: '0.8em' }}>▲ Active</span>
              </row>
            </row>
            <div is-="separator" style={{ '--separator-color': 'var(--pink-10)' } as any}>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>

            <row gap-="2" align-="center between" style={{ padding: '0.5lh 0' }}>
              <span style={{ color: 'var(--foreground1)' }}>▸ Download Rate:</span>
              <row gap-="1" align-="center end">
                <span style={{ fontWeight: 'bold' }}>[{downloadRate.toFixed(1)}/min]</span>
                <span is-="badge" variant-="blue" style={{ fontSize: '0.8em' }}>▼ Active</span>
              </row>
            </row>
            <div is-="separator" style={{ '--separator-color': 'var(--pink-10)' } as any}>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>

            <row gap-="2" align-="center between" style={{ padding: '0.5lh 0' }}>
              <span style={{ color: 'var(--foreground1)' }}>▸ Gas Price (avg):</span>
              <row gap-="1" align-="center end">
                <span style={{ fontWeight: 'bold' }}>[{gasPrice.toFixed(5)} APT]</span>
                <span is-="badge" variant-={gasPrice < 0.0005 ? 'green' : 'orange'} style={{ fontSize: '0.8em' }}>
                  {gasPrice < 0.0005 ? '● Low' : '● Normal'}
                </span>
              </row>
            </row>
            <div is-="separator" style={{ '--separator-color': 'var(--pink-10)' } as any}>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>

            <row gap-="2" align-="center between" style={{ padding: '0.5lh 0' }}>
              <span style={{ color: 'var(--foreground1)' }}>▸ Transaction Queue:</span>
              <row gap-="1" align-="center end">
                <span style={{ fontWeight: 'bold' }}>[{queueSize} pending]</span>
                <span is-="badge" variant-={queueSize < 20 ? 'green' : 'orange'} style={{ fontSize: '0.8em' }}>
                  {queueSize < 20 ? '✓ Healthy' : '⚠ Busy'}
                </span>
              </row>
            </row>
            <div is-="separator" style={{ '--separator-color': 'var(--pink-10)' } as any}>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>

            <row gap-="2" align-="center between" style={{ padding: '0.5lh 0' }}>
              <span style={{ color: 'var(--foreground1)' }}>▸ Active Uploaders:</span>
              <row gap-="1" align-="center end">
                <span style={{ fontWeight: 'bold' }}>[{activeNodes}]</span>
                <span is-="badge" variant-="green" style={{ fontSize: '0.8em' }}>◉ Online</span>
              </row>
            </row>
          </column>
        </column>

        {/* Storage & Bandwidth Widget */}
        <column
          box-="round"
          shear-="bottom"
          gap-="1"
          pad-="2 1"
          style={{ gridColumn: '1 / 2', gridRow: '2 / 4' }}>
          <span style={{ color: 'var(--pink)', fontWeight: 'bold' }}>
            ┏━━━━━━━━━━━┓<br/>
            ┃ CAPACITY ┃<br/>
            ┗━━━━━━━━━━━┛
          </span>
          <column gap-="2" self-="grow">
            <column gap-="1">
              <row align-="center between">
                <span style={{ fontSize: '0.9em' }}>▸ Storage</span>
                <span style={{ fontSize: '0.9em', fontWeight: 'bold', color: storageUsage > 80 ? 'var(--orange)' : 'var(--lime)' }}>[{storageUsage.toFixed(1)}%]</span>
              </row>
              <span style={{ fontSize: '0.75em', color: 'var(--foreground2)', fontFamily: 'monospace', lineHeight: 1.5 }}>
                {'█'.repeat(Math.floor(storageUsage/5))}{'░'.repeat(20-Math.floor(storageUsage/5))}
              </span>
            </column>

            <column gap-="1">
              <row align-="center between">
                <span style={{ fontSize: '0.9em' }}>▸ Bandwidth</span>
                <span style={{ fontSize: '0.9em', fontWeight: 'bold', color: bandwidthUsage > 80 ? 'var(--orange)' : 'var(--lime)' }}>[{bandwidthUsage.toFixed(1)}%]</span>
              </row>
              <span style={{ fontSize: '0.75em', color: 'var(--foreground2)', fontFamily: 'monospace', lineHeight: 1.5 }}>
                {'█'.repeat(Math.floor(bandwidthUsage/5))}{'░'.repeat(20-Math.floor(bandwidthUsage/5))}
              </span>
            </column>

            <column gap-="1">
              <row align-="center between">
                <span style={{ fontSize: '0.9em' }}>▸ Network Health</span>
                <span style={{ fontSize: '0.9em', fontWeight: 'bold', color: networkHealth > 85 ? 'var(--lime)' : 'var(--orange)' }}>[{networkHealth.toFixed(1)}%]</span>
              </row>
              <span style={{ fontSize: '0.75em', color: 'var(--foreground2)', fontFamily: 'monospace', lineHeight: 1.5 }}>
                {'█'.repeat(Math.floor(networkHealth/5))}{'░'.repeat(20-Math.floor(networkHealth/5))}
              </span>
            </column>

            <column gap-="1">
              <row align-="center between">
                <span style={{ fontSize: '0.9em' }}>▸ Success Rate</span>
                <span style={{ fontSize: '0.9em', fontWeight: 'bold', color: successRate > 85 ? 'var(--lime)' : 'var(--orange)' }}>[{successRate}%]</span>
              </row>
              <span style={{ fontSize: '0.75em', color: 'var(--foreground2)', fontFamily: 'monospace', lineHeight: 1.5 }}>
                {'█'.repeat(Math.floor(successRate/5))}{'░'.repeat(20-Math.floor(successRate/5))}
              </span>
            </column>
          </column>
        </column>

        {/* Live Transaction Feed Widget */}
        <column
          box-="double"
          shear-="bottom"
          gap-="1"
          pad-="2 1"
          style={{ gridColumn: '2 / 4', gridRow: '3 / 5' }}>
          <row align-="center between">
            <span style={{ color: 'var(--pink)', fontWeight: 'bold' }}>
              ╔═════════════════════════╗<br/>
              ║ LIVE TRANSACTION FEED ║<br/>
              ╚═════════════════════════╝
            </span>
            <span is-="badge" variant-="pink" style={{ fontSize: '0.8em' }}>⟳ Updates every 2-5s</span>
          </row>

          {transactions.length === 0 ? (
            <column align-="center center" self-="grow">
              <div is-="spinner" variant-="dots"></div>
              <span style={{ color: 'var(--foreground2)' }}>⌛ Waiting for transactions...</span>
            </column>
          ) : (
            <column gap-="0" self-="grow" style={{ overflow: 'hidden' }}>
              {transactions.map((tx, i) => (
                <column key={tx.id}>
                  <row gap-="1" align-="center between" style={{ padding: '0.5lh 0.5ch' }}>
                    <span style={{ fontSize: '0.8em', color: 'var(--foreground2)', minWidth: '8ch' }}>⏱ {tx.time}</span>
                    <span is-="badge" variant-={
                      tx.type === 'UPLOAD' ? 'green' :
                      tx.type === 'DOWNLOAD' ? 'blue' : 'orange'
                    } style={{ fontSize: '0.7em', minWidth: '10ch', textAlign: 'center' }}>
                      {tx.type === 'UPLOAD' ? '▲ UPLOAD' : tx.type === 'DOWNLOAD' ? '▼ DOWNLOAD' : '✕ DELETE'}
                    </span>
                    <span style={{ fontSize: '0.8em', minWidth: '14ch' }}>{tx.account}</span>
                    <span style={{ fontSize: '0.8em', minWidth: '8ch', textAlign: 'right' }}>[{tx.size}]</span>
                    <span style={{ fontSize: '0.7em', minWidth: '10ch', textAlign: 'right', color: 'var(--foreground2)' }}>⛽ {tx.gasUsed}</span>
                    <span is-="badge" variant-={tx.status === '✓' ? 'green' : 'red'} style={{ fontSize: '0.7em', minWidth: '8ch', textAlign: 'center' }}>
                      {tx.status === '✓' ? '✓ SUCCESS' : '✗ FAILED'}
                    </span>
                  </row>
                  {i < transactions.length - 1 && (
                    <div is-="separator" style={{ '--separator-color': 'var(--background2)' } as any}>- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -</div>
                  )}
                </column>
              ))}
            </column>
          )}
        </column>

        {/* Network Info Widget */}
        <column
          box-="round"
          shear-="top"
          gap-="1"
          pad-="2 1"
          style={{ gridColumn: '1 / 2', gridRow: '4 / 5' }}>
          <span style={{ color: 'var(--pink)', fontWeight: 'bold' }}>
            ┌───────────┐<br/>
            │ NETWORK  │<br/>
            └───────────┘
          </span>
          <column gap-="1">
            <row gap-="1" align-="center start">
              <span style={{ fontSize: '1.5em' }}>◉</span>
              <column>
                <span style={{ fontWeight: 'bold' }}>⚡ Aptos Mainnet</span>
                <span style={{ fontSize: '0.8em', color: 'var(--foreground2)' }}>» Production</span>
              </column>
            </row>
            <div is-="separator" style={{ '--separator-color': 'var(--background2)' } as any}>━━━━━━━━━━━━━━━━━━━</div>
            <row gap-="1" align-="center start">
              <span style={{ fontSize: '1.5em', color: 'var(--lime)' }}>◈</span>
              <column>
                <span style={{ fontWeight: 'bold' }}>[{activeNodes}] Nodes</span>
                <span style={{ fontSize: '0.8em', color: 'var(--foreground2)' }}>» Active</span>
              </column>
            </row>
            <div is-="separator" style={{ '--separator-color': 'var(--background2)' } as any}>━━━━━━━━━━━━━━━━━━━</div>
            <row gap-="1" align-="center start">
              <span style={{ fontSize: '1.5em', color: 'var(--pink)' }}>▲</span>
              <column>
                <span style={{ fontWeight: 'bold' }}>v1.0.0</span>
                <span style={{ fontSize: '0.8em', color: 'var(--foreground2)' }}>» Protocol</span>
              </column>
            </row>
          </column>
        </column>
      </div>
    </column>
  )
}

export default App
