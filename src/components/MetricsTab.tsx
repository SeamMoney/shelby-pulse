import { useEffect, useState, useRef } from 'react'
import { backendApi, type AnalyticsData, type StorageLeader } from '../api/backend'

// Color mapping for file type categories
const categoryColors: Record<string, string> = {
  'Images': '#FF69B4',
  'Documents': '#4A90E2',
  'Data': '#00C896',
  'Media': '#9B59B6',
  'Archives': '#E67E22',
  'Code': '#1ABC9C',
  'Ebooks': '#F39C12',
  'Binary': '#95A5A6',
  'Other': '#7F8C8D',
}

// Animated counter component
function AnimatedCounter({
  value,
  suffix = '',
  decimals = 0,
  color = 'var(--foreground1)'
}: {
  value: number
  suffix?: string
  decimals?: number
  color?: string
}) {
  const [displayValue, setDisplayValue] = useState(0)
  const prevValue = useRef(0)

  useEffect(() => {
    const startValue = prevValue.current
    const endValue = value
    const duration = 1000 // 1 second animation
    const startTime = Date.now()

    const animate = () => {
      const now = Date.now()
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)

      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      const current = startValue + (endValue - startValue) * eased

      setDisplayValue(current)

      if (progress < 1) {
        requestAnimationFrame(animate)
      } else {
        prevValue.current = endValue
      }
    }

    requestAnimationFrame(animate)
  }, [value])

  return (
    <span style={{
      color,
      fontVariantNumeric: 'tabular-nums',
      fontWeight: 700,
      fontSize: '2.5rem',
      lineHeight: 1
    }}>
      {decimals > 0 ? displayValue.toFixed(decimals) : Math.floor(displayValue).toLocaleString()}{suffix}
    </span>
  )
}

// Donut chart component using canvas
function DonutChart({
  data,
  size = 200
}: {
  data: Array<{ label: string; value: number; color: string }>
  size?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hoveredSegment, setHoveredSegment] = useState<number | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx.scale(dpr, dpr)

    const centerX = size / 2
    const centerY = size / 2
    const outerRadius = size / 2 - 10
    const innerRadius = outerRadius * 0.6

    const total = data.reduce((sum, d) => sum + d.value, 0)
    if (total === 0) return

    ctx.clearRect(0, 0, size, size)

    let startAngle = -Math.PI / 2 // Start from top

    data.forEach((segment, index) => {
      const sliceAngle = (segment.value / total) * 2 * Math.PI
      const isHovered = hoveredSegment === index

      ctx.beginPath()
      ctx.arc(centerX, centerY, isHovered ? outerRadius + 5 : outerRadius, startAngle, startAngle + sliceAngle)
      ctx.arc(centerX, centerY, innerRadius, startAngle + sliceAngle, startAngle, true)
      ctx.closePath()

      ctx.fillStyle = segment.color
      ctx.globalAlpha = isHovered ? 1 : 0.85
      ctx.fill()

      // Add subtle border
      ctx.strokeStyle = 'var(--background1)'
      ctx.lineWidth = 2
      ctx.stroke()

      startAngle += sliceAngle
    })

    ctx.globalAlpha = 1
  }, [data, size, hoveredSegment])

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left - size / 2
    const y = e.clientY - rect.top - size / 2
    const distance = Math.sqrt(x * x + y * y)
    const outerRadius = size / 2 - 10
    const innerRadius = outerRadius * 0.6

    if (distance < innerRadius || distance > outerRadius + 5) {
      setHoveredSegment(null)
      return
    }

    let angle = Math.atan2(y, x) + Math.PI / 2
    if (angle < 0) angle += 2 * Math.PI

    const total = data.reduce((sum, d) => sum + d.value, 0)
    let cumulative = 0

    for (let i = 0; i < data.length; i++) {
      cumulative += data[i].value / total
      if (angle / (2 * Math.PI) <= cumulative) {
        setHoveredSegment(i)
        return
      }
    }
  }

  return (
    <div style={{
      position: 'relative',
      width: size,
      height: size,
      minWidth: size,
      minHeight: size,
      flexShrink: 0,
      aspectRatio: '1 / 1'
    }}>
      <canvas
        ref={canvasRef}
        style={{
          width: size,
          height: size,
          cursor: 'pointer',
          aspectRatio: '1 / 1',
          display: 'block'
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredSegment(null)}
      />
      {hoveredSegment !== null && data[hoveredSegment] && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          pointerEvents: 'none'
        }}>
          <div style={{
            color: data[hoveredSegment].color,
            fontWeight: 700,
            fontSize: '1rem'
          }}>
            {data[hoveredSegment].label}
          </div>
          <div style={{
            color: 'var(--foreground2)',
            fontSize: '0.75rem'
          }}>
            {((data[hoveredSegment].value / data.reduce((s, d) => s + d.value, 0)) * 100).toFixed(1)}%
          </div>
        </div>
      )}
    </div>
  )
}

// Legend for donut chart
function DonutLegend({ data }: { data: Array<{ label: string; value: number; color: string; size: string }> }) {
  const total = data.reduce((sum, d) => sum + d.value, 0)

  return (
    <column gap-="0.5" style={{ minWidth: '160px' }}>
      {data.map((item) => (
        <row key={item.label} gap-="0.5" align-="center">
          <div style={{
            width: '12px',
            height: '12px',
            borderRadius: '3px',
            background: item.color,
            flexShrink: 0
          }} />
          <small style={{
            flex: 1,
            color: 'var(--foreground1)',
            fontSize: '0.75rem'
          }}>
            {item.label}
          </small>
          <small style={{
            color: 'var(--foreground2)',
            fontVariantNumeric: 'tabular-nums',
            fontSize: '0.7rem'
          }}>
            {((item.value / total) * 100).toFixed(0)}%
          </small>
          <small style={{
            color: 'var(--foreground2)',
            fontVariantNumeric: 'tabular-nums',
            fontSize: '0.7rem',
            width: '50px',
            textAlign: 'right'
          }}>
            {item.size}
          </small>
        </row>
      ))}
    </column>
  )
}

function StorageLeaderboard({ leaders }: { leaders: StorageLeader[] }) {
  const maxSize = Math.max(...leaders.map(l => l.totalSize), 1)

  return (
    <column gap-="0.5">
      {leaders.slice(0, 10).map((leader, index) => (
        <row key={leader.address} gap-="1" align-="center" style={{ minHeight: '36px' }}>
          <span style={{
            width: '20px',
            flexShrink: 0,
            color: index < 3 ? '#FF69B4' : 'var(--foreground2)',
            fontWeight: index < 3 ? 700 : 400,
            fontSize: '0.75rem'
          }}>
            #{index + 1}
          </span>
          <column style={{ flex: 1, minWidth: 0 }}>
            <row gap-="0.5" align-="center">
              <a
                href={`https://explorer.aptoslabs.com/account/${leader.address}?network=shelbynet`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: 'var(--foreground1)',
                  textDecoration: 'none',
                  fontFamily: 'monospace',
                  fontSize: '0.75rem'
                }}
              >
                {leader.addressShort}
              </a>
              <span is-="badge" variant-="background2" size-="half" style={{ fontSize: '0.6rem' }}>
                {leader.blobCount} blobs
              </span>
            </row>
            <div style={{
              height: '6px',
              background: 'var(--background2)',
              borderRadius: '3px',
              overflow: 'hidden',
              marginTop: '3px'
            }}>
              <div style={{
                width: `${(leader.totalSize / maxSize) * 100}%`,
                height: '100%',
                background: index < 3 ? '#FF69B4' : '#4A90E2',
                opacity: 0.7,
                transition: 'width 0.5s ease',
                borderRadius: '3px',
              }} />
            </div>
          </column>
          <small style={{
            width: '60px',
            flexShrink: 0,
            textAlign: 'right',
            color: 'var(--foreground1)',
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
            fontSize: '0.7rem'
          }}>
            {leader.totalSizeFormatted}
          </small>
        </row>
      ))}
    </column>
  )
}

export function MetricsTab() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const data = await backendApi.getAnalytics()
        setAnalytics(data)
      } catch (err) {
        // Silently fail - metrics will show without analytics
      } finally {
        setLoading(false)
      }
    }

    fetchAnalytics()
    const interval = setInterval(fetchAnalytics, 2 * 60 * 1000) // Refresh every 2 minutes
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <column pad-="2" style={{ alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
        <row gap-="1" style={{ alignItems: 'center' }}>
          <span is-="spinner" style={{ color: 'var(--accent)' }}></span>
          <h3 style={{ margin: 0 }}>Loading Network Metrics...</h3>
        </row>
      </column>
    )
  }

  if (!analytics) {
    return (
      <column pad-="2" style={{ alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
        <small style={{ color: 'var(--foreground2)' }}>Failed to load analytics data</small>
      </column>
    )
  }

  // Show syncing state when no data yet
  const isSyncing = analytics.totalBlobs === 0

  // Prepare donut chart data
  const donutData = analytics.fileTypes.map(ft => ({
    label: ft.extension,
    value: ft.count,
    color: categoryColors[ft.extension] || '#7F8C8D',
    size: ft.totalSizeFormatted
  }))

  // Parse storage value for animated counter
  const storageMatch = analytics.totalSizeFormatted.match(/([\d.]+)\s*(\w+)/)
  const storageValue = storageMatch ? parseFloat(storageMatch[1]) : 0
  const storageSuffix = storageMatch ? ` ${storageMatch[2]}` : ''

  return (
    <column gap-="1.5">
      {/* Syncing Banner */}
      {isSyncing && (
        <row box-="round" pad-="1" gap-="1" style={{
          background: 'linear-gradient(90deg, #4A90E2 0%, #9B59B6 100%)',
          alignItems: 'center'
        }}>
          <span is-="spinner" style={{ color: 'white' }}></span>
          <column style={{ flex: 1 }}>
            <strong style={{ color: 'white', fontSize: '0.85rem' }}>
              Syncing blob data...
            </strong>
            <small style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.7rem' }}>
              Data is being synced from the blockchain. This may take a few minutes.
              {/* Tip: Add APTOS_API_KEY to .env for faster syncing */}
            </small>
          </column>
        </row>
      )}

      {/* Hero Section - Big Numbers */}
      <row gap-="1" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        marginBottom: '0.5rem'
      }}>
        <column box-="square" pad-="1.5" gap-="0.5" style={{
          background: 'linear-gradient(135deg, var(--background1) 0%, var(--background2) 100%)',
          borderColor: '#FF69B4'
        }}>
          <small style={{
            color: 'var(--foreground2)',
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.1em'
          }}>
            Total Storage
          </small>
          <AnimatedCounter
            value={storageValue}
            suffix={storageSuffix}
            decimals={2}
            color="#FF69B4"
          />
          {analytics.bytesPerHour > 0 && (
            <small style={{ color: 'var(--success)', fontSize: '0.7rem' }}>
              ↑ {analytics.bytesPerHourFormatted}/hour
            </small>
          )}
        </column>

        <column box-="square" pad-="1.5" gap-="0.5" style={{
          background: 'linear-gradient(135deg, var(--background1) 0%, var(--background2) 100%)',
          borderColor: '#4A90E2'
        }}>
          <small style={{
            color: 'var(--foreground2)',
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.1em'
          }}>
            Total Blobs
          </small>
          <AnimatedCounter
            value={analytics.totalBlobs}
            color="#4A90E2"
          />
          {analytics.blobsPerHour > 0 && (
            <small style={{ color: 'var(--success)', fontSize: '0.7rem' }}>
              ↑ {analytics.blobsPerHour.toLocaleString()}/hour
            </small>
          )}
        </column>

        <column box-="square" pad-="1.5" gap-="0.5" style={{
          background: 'linear-gradient(135deg, var(--background1) 0%, var(--background2) 100%)',
          borderColor: '#00C896'
        }}>
          <small style={{
            color: 'var(--foreground2)',
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.1em'
          }}>
            Unique Uploaders
          </small>
          <AnimatedCounter
            value={analytics.uniqueOwners}
            color="#00C896"
          />
          <small style={{ color: 'var(--foreground2)', fontSize: '0.7rem' }}>
            Active accounts
          </small>
        </column>
      </row>

      {/* File Types Distribution - Donut Chart + Leaderboard */}
      <row gap-="1" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))'
      }}>
        {/* Donut Chart Section */}
        <column box-="round" shear-="top" pad-="1" gap-="1">
          <row gap-="1" style={{ marginTop: '-0.5rem', marginBottom: '0.5rem' }}>
            <span is-="badge" variant-="pink" cap-="ribbon slant-bottom">File Types</span>
          </row>
          <row gap-="1" style={{
            justifyContent: 'center',
            alignItems: 'center',
            flexWrap: 'wrap'
          }}>
            <DonutChart data={donutData} size={180} />
            <DonutLegend data={donutData} />
          </row>
        </column>

        {/* Top Storage Users */}
        <column box-="round" shear-="top" pad-="1" gap-="0.5">
          <row gap-="1" style={{ marginTop: '-0.5rem', marginBottom: '0.5rem' }}>
            <span is-="badge" variant-="blue" cap-="ribbon slant-bottom">Top Storage Users</span>
          </row>
          <StorageLeaderboard leaders={analytics.storageLeaders} />
        </column>
      </row>

      {/* Network Stats Footer */}
      <row gap-="1" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        marginTop: '0.5rem'
      }}>
        <column box-="square" pad-="1" gap-="0.25" style={{ textAlign: 'center' }}>
          <small style={{ color: 'var(--foreground2)', fontSize: '0.7rem' }}>File Categories</small>
          <h4 style={{ color: '#9B59B6', margin: 0 }}>{analytics.fileTypes.length}</h4>
        </column>
        <column box-="square" pad-="1" gap-="0.25" style={{ textAlign: 'center' }}>
          <small style={{ color: 'var(--foreground2)', fontSize: '0.7rem' }}>Avg Blob Size</small>
          <h4 style={{ color: '#E67E22', margin: 0 }}>
            {analytics.totalBlobs > 0
              ? formatBytes(analytics.totalSize / analytics.totalBlobs)
              : '0 B'
            }
          </h4>
        </column>
        <column box-="square" pad-="1" gap-="0.25" style={{ textAlign: 'center' }}>
          <small style={{ color: 'var(--foreground2)', fontSize: '0.7rem' }}>Data Updated</small>
          <h4 style={{ color: 'var(--foreground1)', margin: 0, fontSize: '0.9rem' }}>
            {new Date(analytics.timestamp).toLocaleTimeString()}
          </h4>
        </column>
      </row>
    </column>
  )
}

// Helper function for formatting bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}
