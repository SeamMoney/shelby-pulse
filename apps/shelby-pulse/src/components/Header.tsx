import { useState, useEffect } from 'react'
import type { NetworkStats } from '../api/shelby'

interface Props {
  stats: NetworkStats | undefined
}

export default function Header({ stats }: Props) {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  const getTimeAgo = () => {
    if (!stats) return '—'
    const seconds = Math.floor((Date.now() - stats.timestamp) / 1000)
    return `${seconds}s`
  }

  return (
    <header style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingBottom: '1lh',
      borderBottom: '0.2ch solid var(--box-border-color)',
      flexWrap: 'wrap',
      gap: '2ch'
    }}>
      {/* Logo */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '2ch'
      }}>
        <span is-="typography" variant-="h2" style={{
          fontSize: '2em',
          fontWeight: 'bold',
          margin: 0
        }}>
          <span style={{ color: 'var(--pink)' }}>[</span>
          <span style={{ color: 'var(--purple)' }}>SHELBY</span>
          <span style={{ color: 'var(--lilac)' }}>/</span>
          <span style={{ color: 'var(--pink)' }}>PULSE</span>
          <span style={{ color: 'var(--pink)' }}>]</span>
        </span>
        <span is-="badge" variant-="lime" className="pulse">
          ● LIVE
        </span>
      </div>

      {/* Status */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '2ch'
      }}>
        <span className="mono" style={{
          fontSize: '1em',
          color: 'var(--foreground1)'
        }}>
          {time.toLocaleTimeString('en-US', { hour12: false })}
        </span>
        <span is-="badge" variant-="lilac" style={{ fontSize: '0.9em' }}>
          Updated {getTimeAgo()} ago
        </span>
      </div>
    </header>
  )
}
