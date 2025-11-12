import { useEffect, useState } from 'react'
import type { NetworkStats } from '../api/shelby'

interface Props {
  stats: NetworkStats | undefined
  isLoading: boolean
}

// Animated counter component
function AnimatedNumber({ value, suffix = '' }: { value: number, suffix?: string }) {
  const [displayValue, setDisplayValue] = useState(value)

  useEffect(() => {
    const duration = 500
    const steps = 30
    const increment = (value - displayValue) / steps
    let current = displayValue
    let step = 0

    const timer = setInterval(() => {
      step++
      current += increment
      setDisplayValue(current)

      if (step >= steps) {
        setDisplayValue(value)
        clearInterval(timer)
      }
    }, duration / steps)

    return () => clearInterval(timer)
  }, [value])

  return (
    <span className="mono big-number">
      {Math.floor(displayValue).toLocaleString()}{suffix}
    </span>
  )
}

export default function StatsOverview({ stats, isLoading }: Props) {
  if (isLoading || !stats) {
    return (
      <column
        box-="double"
        shear-="top"
        pad-="2 1"
        style={{
          background: 'var(--background1)',
          minHeight: '30lh'
        }}
      >
        <h3 style={{ color: 'var(--purple)', marginBottom: '2lh' }}>
          ╔══════════════════════╗<br/>
          ║ NETWORK OVERVIEW    ║<br/>
          ╚══════════════════════╝
        </h3>
        <span style={{ color: 'var(--foreground1)' }}>⟳ Loading data...</span>
      </column>
    )
  }

  return (
    <column
      box-="double"
      shear-="top"
      pad-="2 1"
      gap-="2"
      style={{ background: 'var(--background1)' }}
    >
      <h3 style={{ color: 'var(--purple)', fontSize: '1.2em', margin: 0 }}>
        ╔══════════════════════╗<br/>
        ║ NETWORK OVERVIEW    ║<br/>
        ╚══════════════════════╝
      </h3>

      {/* Total Blobs */}
      <column gap-="0">
        <span className="mono" style={{ fontSize: '3em', fontWeight: 'bold', lineHeight: 1 }}>
          [<AnimatedNumber value={stats.totalBlobs} />]
        </span>
        <span className="mono" style={{
          fontSize: '0.9em',
          color: 'var(--foreground2)',
          marginTop: '0.5lh'
        }}>
          ▸ TOTAL BLOBS
        </span>
        <row style={{ marginTop: '1lh' }}>
          <span is-="badge" variant-="lime">
            ▲ +1,247 today
          </span>
        </row>
      </column>

      {/* Storage */}
      <column gap-="0">
        <span className="mono" style={{ fontSize: '2em', fontWeight: 'bold', lineHeight: 1 }}>
          [{stats.totalStorage}]
        </span>
        <span className="mono" style={{
          fontSize: '0.9em',
          color: 'var(--foreground2)',
          marginTop: '0.5lh'
        }}>
          ▸ STORAGE USED
        </span>
        <div style={{
          marginTop: '1lh',
          height: '1lh',
          background: 'var(--background3)',
          position: 'relative'
        }}>
          <div style={{
            height: '100%',
            width: '68%',
            background: 'linear-gradient(90deg, var(--lime), var(--purple))',
            transition: 'width 0.5s ease'
          }} />
        </div>
        <span style={{ fontSize: '0.75em', color: 'var(--foreground2)', marginTop: '0.5lh' }}>{'█'.repeat(14)}{'░'.repeat(6)} 68%</span>
      </column>

      {/* Upload Rate */}
      <column gap-="0">
        <span className="mono" style={{ fontSize: '1.5em', fontWeight: 'bold', lineHeight: 1 }}>
          [<AnimatedNumber value={stats.uploadRate} />]
          <span style={{ fontSize: '0.7em', color: 'var(--foreground2)' }}> /min</span>
        </span>
        <span className="mono" style={{
          fontSize: '0.9em',
          color: 'var(--foreground2)',
          marginTop: '0.5lh'
        }}>
          ▸ UPLOAD RATE
        </span>
      </column>

      {/* Quick Stats */}
      <row gap-="1" style={{
        paddingTop: '1lh',
        borderTop: '0.1ch solid var(--box-border-color)'
      }}>
        <span is-="badge" variant-="purple">
          ◉ Active: 23
        </span>
        <span is-="badge" variant-="orange">
          ▲ Peak: 89
        </span>
      </row>
    </column>
  )
}
