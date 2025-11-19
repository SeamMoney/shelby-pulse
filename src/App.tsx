import { useState, useEffect } from 'react'
import { backendApi } from './api/backend'
import { MetricsTab } from './components/MetricsTab'
import { ProvidersTab } from './components/ProvidersTab'
import { ActivityTab } from './components/ActivityTab'

type Tab = 'activity' | 'metrics' | 'providers'

interface NetworkStats {
  totalBlobs: number
  totalStorage: number
  totalStorageFormatted: string
  uploadRate: number
  timestamp: number
}

function App() {
  const [networkStats, setNetworkStats] = useState<NetworkStats | null>(null)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [activeTab, setActiveTab] = useState<Tab>('activity')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  useEffect(() => {
    // Initial fetch
    fetchNetworkStats()

    // Poll for updates every 5 seconds
    const statsInterval = setInterval(() => {
      fetchNetworkStats()
    }, 5000)

    const timeInterval = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)

    return () => {
      clearInterval(statsInterval)
      clearInterval(timeInterval)
    }
  }, [])

  async function fetchNetworkStats() {
    try {
      const stats = await backendApi.getNetworkStats()
      setNetworkStats(stats)
      setLastUpdate(new Date())
      setError(null)
      setIsLoading(false)
    } catch (err) {
      console.error('Failed to fetch network stats:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch data')
      setIsLoading(false)
    }
  }

  function getTimeSinceUpdate() {
    if (!lastUpdate) return 'never'
    const seconds = Math.floor((Date.now() - lastUpdate.getTime()) / 1000)
    if (seconds < 10) return 'just now'
    if (seconds < 60) return `${seconds}s ago`
    const minutes = Math.floor(seconds / 60)
    return `${minutes}m ago`
  }

  if (isLoading) {
    return (
      <column className="terminal-emulator">
        <column className="terminal" box-="square" pad-="2">
          <h2>Loading Network Data...</h2>
          <small style={{ color: 'var(--foreground2)' }}>
            Fetching real data from Shelby Protocol via Aptos blockchain
          </small>
        </column>
      </column>
    )
  }

  if (error) {
    return (
      <column className="terminal-emulator">
        <column className="terminal" box-="square" pad-="2">
          <h2 style={{ color: 'var(--error)' }}>Failed to Connect to Shelby Protocol</h2>
          <small style={{ color: 'var(--foreground2)' }}>{error}</small>
          <small style={{ color: 'var(--foreground2)', marginTop: '1rem' }}>
            Make sure the pulse-api service is running:
          </small>
          <pre is-="pre" size-="half" style={{ marginTop: '0.5rem' }}>
            cd services/pulse-api{'\n'}
            pnpm dev
          </pre>
          <button
            is-="button"
            variant-="accent"
            size-="half"
            onClick={fetchNetworkStats}
            style={{ marginTop: '1rem' }}
          >
            Retry Connection
          </button>
        </column>
      </column>
    )
  }

  if (!networkStats) {
    return null
  }

  return (
    <column className="terminal-emulator">
      <column className="terminal">
        {/* Terminal Header */}
        <row className="terminal-header">
          <row gap-="1" style={{ padding: '0 1rem' }}>
            <span className="dot-red">●</span>
            <span className="dot-yellow">●</span>
            <span className="dot-green">●</span>
          </row>
          <span is-="badge" variant-="root">Shelby Pulse</span>
          <row className="tab-nav">
            <button
              onClick={() => setActiveTab('activity')}
              className={activeTab === 'activity' ? 'active' : ''}
            >
              Activity
            </button>
            <button
              onClick={() => setActiveTab('metrics')}
              className={activeTab === 'metrics' ? 'active' : ''}
            >
              Metrics
            </button>
            <button
              onClick={() => setActiveTab('providers')}
              className={activeTab === 'providers' ? 'active' : ''}
            >
              Providers
            </button>
          </row>
        </row>

        {/* Status Bar */}
        <row
          style={{
            padding: '0.5rem 1rem',
            background: 'var(--background0)',
            borderBottom: '1px solid var(--background2)',
            gap: '1rem',
            fontSize: '0.85rem',
            flexWrap: 'wrap'
          }}
        >
          <span is-="badge" variant-="success">● LIVE</span>
          <span style={{ color: 'var(--foreground2)' }}>
            Aptos Devnet
          </span>
          <span style={{ color: 'var(--foreground2)' }}>|</span>
          <span style={{ color: 'var(--foreground2)' }}>
            Updated: {getTimeSinceUpdate()}
          </span>
          <span style={{ color: 'var(--foreground2)' }}>|</span>
          <span style={{ color: 'var(--foreground2)' }}>
            {networkStats.totalBlobs} blobs indexed
          </span>
        </row>

        {/* Content */}
        <column className="terminal-content" pad-="1">
          {activeTab === 'activity' && <ActivityTab currentTime={currentTime} />}
          {activeTab === 'metrics' && <MetricsTab />}
          {activeTab === 'providers' && <ProvidersTab />}
        </column>
      </column>
    </column>
  )
}

export default App
