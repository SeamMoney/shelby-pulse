import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'

interface DataPoint {
  value: number
  timestamp: number
}

interface AnimatedLineChartProps {
  maxDataPoints?: number
  label: string
  color?: string
  height?: number
}

export function AnimatedLineChart({
  maxDataPoints = 20,
  label,
  color = 'var(--lime)',
  height = 200
}: AnimatedLineChartProps) {
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([])

  useEffect(() => {
    // Initial data
    const initial = Array.from({ length: maxDataPoints }, (_, i) => ({
      value: Math.random() * 100,
      timestamp: Date.now() - (maxDataPoints - i) * 1000
    }))
    setDataPoints(initial)

    // Add new data point every second
    const interval = setInterval(() => {
      setDataPoints(prev => {
        const newPoint: DataPoint = {
          value: Math.max(0, Math.min(100, prev[prev.length - 1]?.value + (Math.random() - 0.5) * 30)),
          timestamp: Date.now()
        }
        return [...prev.slice(1), newPoint]
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [maxDataPoints])

  const width = 100 // percentage
  const padding = 10

  // Calculate path
  const points = dataPoints.map((point, index) => {
    const x = (index / (maxDataPoints - 1)) * (width - padding * 2) + padding
    const y = height - (point.value / 100) * (height - padding * 2) - padding
    return `${x},${y}`
  }).join(' ')

  const pathD = `M ${points.split(' ').join(' L ')}`

  return (
    <div className="chart-container">
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        style={{ overflow: 'visible' }}
      >
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map(percent => (
          <line
            key={percent}
            x1={padding}
            x2={width - padding}
            y1={height - (percent / 100) * (height - padding * 2) - padding}
            y2={height - (percent / 100) * (height - padding * 2) - padding}
            stroke="var(--brown)"
            strokeWidth="0.5"
            opacity="0.3"
          />
        ))}

        {/* Animated line */}
        <motion.path
          d={pathD}
          fill="none"
          stroke={color}
          strokeWidth="2"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.5 }}
        />

        {/* Animated fill gradient */}
        <defs>
          <linearGradient id={`gradient-${label}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <motion.path
          d={`${pathD} L ${width - padding},${height - padding} L ${padding},${height - padding} Z`}
          fill={`url(#gradient-${label})`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        />

        {/* Animated dots */}
        {dataPoints.map((point, index) => {
          const x = (index / (maxDataPoints - 1)) * (width - padding * 2) + padding
          const y = height - (point.value / 100) * (height - padding * 2) - padding

          return (
            <motion.circle
              key={point.timestamp}
              cx={x}
              cy={y}
              r="2"
              fill={color}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.3 }}
            />
          )
        })}
      </svg>
      <p style={{ fontSize: 'var(--font-size-small)', color: 'var(--white-20)', marginTop: '0.5rem' }}>
        {label}: <span style={{ color }}>{dataPoints[dataPoints.length - 1]?.value.toFixed(1)}</span>
      </p>
    </div>
  )
}
