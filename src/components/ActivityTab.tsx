import { useEffect, useState, useRef } from 'react'
import { backendApi } from '../api/backend'

interface ActivityTabProps {
  currentTime: Date
}

export function ActivityTab({ currentTime }: ActivityTabProps) {
  // Load initial latency data from localStorage
  const [latencyData, setLatencyData] = useState<number[]>(() => {
    try {
      const stored = localStorage.getItem('shelby-latency-history')
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })
  const [currentLatency, setCurrentLatency] = useState<number>(0)
  const [eventCount, setEventCount] = useState<number>(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>()

  // Interactive state
  const [isInteracting, setIsInteracting] = useState(false)
  const [pointerX, setPointerX] = useState<number | null>(null)
  const [targetPointerX, setTargetPointerX] = useState<number | null>(null)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  // Measure API latency every 1 second
  useEffect(() => {
    const measureLatency = async () => {
      const start = performance.now()
      try {
        await backendApi.health()
        const latency = performance.now() - start
        setCurrentLatency(latency)
        setLatencyData(prev => {
          const newData = [...prev, latency].slice(-600) // 10 minutes of history
          // Persist to localStorage
          localStorage.setItem('shelby-latency-history', JSON.stringify(newData))
          return newData
        })
      } catch (error) {
        console.error('Latency check failed:', error)
      }
    }
    measureLatency()
    const interval = setInterval(measureLatency, 1000)
    return () => clearInterval(interval)
  }, [])

  // Fetch event count
  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const events = await backendApi.getRecentEvents(50)
        setEventCount(events.length)
      } catch (error) {
        console.error('Failed to fetch events:', error)
      }
    }
    fetchEvents()
    const interval = setInterval(fetchEvents, 5000)
    return () => clearInterval(interval)
  }, [])

  // Smooth interpolation for pointer position
  useEffect(() => {
    if (targetPointerX === null || pointerX === null) {
      if (targetPointerX !== null && pointerX === null) {
        setPointerX(targetPointerX)
      }
      return
    }

    const smoothing = 0.15
    const diff = targetPointerX - pointerX
    if (Math.abs(diff) > 0.5) {
      setPointerX(pointerX + diff * smoothing)
    } else {
      setPointerX(targetPointerX)
    }
  }, [targetPointerX, pointerX])

  // Chart rendering
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const animate = () => {
      const width = canvas.width = canvas.offsetWidth * 2
      const height = canvas.height = 600 * 2  // Bigger chart!
      canvas.style.width = `${width / 2}px`
      canvas.style.height = `${height / 2}px`

      ctx.clearRect(0, 0, width, height)

      // Chart line with smooth curves
      if (latencyData.length > 1) {
        const maxLatency = Math.max(...latencyData, 100)
        const pointSpacing = width / latencyData.length
        const chartHeight = height - 80

        // Glowing pink aesthetic
        const pinkGlow = '#FF69B4'  // Hot pink
        const pinkBright = '#FF1493'  // Deep pink

        // Build path for the line
        const buildPath = () => {
          ctx.beginPath()
          latencyData.forEach((latency, i) => {
            const x = i * pointSpacing
            const y = 40 + chartHeight - ((latency / maxLatency) * chartHeight)

            if (i === 0) {
              ctx.moveTo(x, y)
            } else {
              const prevLatency = latencyData[i - 1]
              const prevX = (i - 1) * pointSpacing
              const prevY = 40 + chartHeight - ((prevLatency / maxLatency) * chartHeight)
              const cpX = prevX + (x - prevX) / 2
              const cpY = prevY + (y - prevY) / 2
              ctx.quadraticCurveTo(prevX, prevY, cpX, cpY)
            }
          })

          if (latencyData.length > 0) {
            const lastLatency = latencyData[latencyData.length - 1]
            const lastX = (latencyData.length - 1) * pointSpacing
            const lastY = 40 + chartHeight - ((lastLatency / maxLatency) * chartHeight)
            ctx.lineTo(lastX, lastY)
          }
        }

        // Layer 1: Outer glow (widest)
        buildPath()
        ctx.strokeStyle = pinkGlow
        ctx.lineWidth = 12
        ctx.globalAlpha = 0.15
        ctx.shadowBlur = 40
        ctx.shadowColor = pinkBright
        ctx.lineJoin = 'round'
        ctx.lineCap = 'round'
        ctx.stroke()

        // Layer 2: Mid glow
        buildPath()
        ctx.lineWidth = 8
        ctx.globalAlpha = 0.3
        ctx.shadowBlur = 30
        ctx.shadowColor = pinkBright
        ctx.stroke()

        // Layer 3: Inner glow
        buildPath()
        ctx.lineWidth = 5
        ctx.globalAlpha = 0.6
        ctx.shadowBlur = 20
        ctx.shadowColor = pinkBright
        ctx.stroke()

        // Layer 4: Core line (brightest)
        buildPath()
        ctx.strokeStyle = pinkBright
        ctx.lineWidth = 3
        ctx.globalAlpha = 1
        ctx.shadowBlur = 15
        ctx.shadowColor = '#FF69B4'
        ctx.stroke()

        // Reset
        ctx.shadowBlur = 0
        ctx.globalAlpha = 1

        // Draw interactive crosshair
        if (isInteracting && pointerX !== null && latencyData.length > 1) {
          const pointSpacing = width / latencyData.length
          const chartHeight = height - 80
          const index = Math.min(
            Math.max(0, Math.floor(pointerX / pointSpacing)),
            latencyData.length - 1
          )
          const latency = latencyData[index]
          const x = index * pointSpacing
          const y = 40 + chartHeight - ((latency / maxLatency) * chartHeight)

          // Vertical line with glow
          ctx.beginPath()
          ctx.moveTo(x, 40)
          ctx.lineTo(x, height - 40)
          ctx.strokeStyle = '#FF1493'
          ctx.lineWidth = 3
          ctx.globalAlpha = 0.6
          ctx.shadowBlur = 20
          ctx.shadowColor = '#FF69B4'
          ctx.stroke()

          // Crosshair circle at data point
          ctx.beginPath()
          ctx.arc(x, y, 12, 0, Math.PI * 2)
          ctx.fillStyle = '#FF1493'
          ctx.globalAlpha = 0.3
          ctx.shadowBlur = 30
          ctx.fill()

          ctx.beginPath()
          ctx.arc(x, y, 8, 0, Math.PI * 2)
          ctx.fillStyle = '#FF1493'
          ctx.globalAlpha = 1
          ctx.shadowBlur = 15
          ctx.fill()

          // Value label
          ctx.font = 'bold 28px Cascadia Code, monospace'
          ctx.fillStyle = '#FF1493'
          ctx.textAlign = 'center'
          ctx.globalAlpha = 1
          ctx.shadowBlur = 10
          ctx.fillText(`${Math.round(latency)}ms`, x, y - 30)

          ctx.shadowBlur = 0
          ctx.globalAlpha = 1

          // Update selected index
          if (index !== selectedIndex) {
            setSelectedIndex(index)
            // Haptic feedback on mobile
            if ('vibrate' in navigator) {
              navigator.vibrate(1)
            }
          }
        }
      }

      animationRef.current = requestAnimationFrame(animate)
    }

    animate()
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [latencyData, isInteracting, pointerX, selectedIndex])

  const avgLatency = latencyData.length > 0
    ? latencyData.reduce((a, b) => a + b, 0) / latencyData.length
    : 0

  const maxLatency = latencyData.length > 0 ? Math.max(...latencyData) : 0
  const minLatency = latencyData.length > 0 ? Math.min(...latencyData) : 0

  // Event handlers for interactivity
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    setIsInteracting(true)
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) * 2 // Account for 2x pixel ratio
    setTargetPointerX(x)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isInteracting) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left) * 2
    setTargetPointerX(x)
  }

  const handlePointerUp = () => {
    setIsInteracting(false)
    setPointerX(null)
    setTargetPointerX(null)
    setSelectedIndex(null)
  }

  const handlePointerLeave = () => {
    setIsInteracting(false)
    setPointerX(null)
    setTargetPointerX(null)
    setSelectedIndex(null)
  }

  return (
    <column gap-="1">
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '600px',
          marginBottom: '2rem',
          cursor: isInteracting ? 'grabbing' : 'grab',
          touchAction: 'none'
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={handlePointerUp}
      />

      <row style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '2rem', padding: '1rem 0' }}>
        <column style={{ gap: '0.5rem' }}>
          <small style={{ color: 'var(--foreground2)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 600 }}>
            {isInteracting && selectedIndex !== null ? 'Selected' : 'Current'}
          </small>
          <h2 style={{
            color: '#FF1493',
            fontSize: '2.25rem',
            fontWeight: 700,
            margin: 0,
            fontVariantNumeric: 'tabular-nums',
            transition: 'transform 0.2s ease',
            transform: isInteracting ? 'scale(1.05)' : 'scale(1)'
          }}>
            {isInteracting && selectedIndex !== null
              ? latencyData[selectedIndex].toFixed(0)
              : currentLatency.toFixed(0)}ms
          </h2>
        </column>
        <column style={{ gap: '0.5rem' }}>
          <small style={{ color: 'var(--foreground2)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 600 }}>Average</small>
          <h2 style={{ fontSize: '2.25rem', fontWeight: 700, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{avgLatency.toFixed(0)}ms</h2>
        </column>
        <column style={{ gap: '0.5rem' }}>
          <small style={{ color: 'var(--foreground2)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 600 }}>Min</small>
          <h2 style={{ color: '#00C896', fontSize: '2.25rem', fontWeight: 700, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{minLatency.toFixed(0)}ms</h2>
        </column>
        <column style={{ gap: '0.5rem' }}>
          <small style={{ color: 'var(--foreground2)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 600 }}>Max</small>
          <h2 style={{ color: '#FF6B6B', fontSize: '2.25rem', fontWeight: 700, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{maxLatency.toFixed(0)}ms</h2>
        </column>
        <column style={{ gap: '0.5rem' }}>
          <small style={{ color: 'var(--foreground2)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 600 }}>Events</small>
          <h2 style={{ color: '#4A90E2', fontSize: '2.25rem', fontWeight: 700, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{eventCount}</h2>
        </column>
        <column style={{ gap: '0.5rem' }}>
          <small style={{ color: 'var(--foreground2)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: 600 }}>History</small>
          <h2 style={{ fontSize: '2.25rem', fontWeight: 700, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{(latencyData.length / 60).toFixed(1)}min</h2>
        </column>
      </row>
    </column>
  )
}
