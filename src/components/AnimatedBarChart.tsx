import { motion } from 'framer-motion'

interface BarData {
  label: string
  value: number
  color?: string
}

interface AnimatedBarChartProps {
  data: BarData[]
  maxValue?: number
}

export function AnimatedBarChart({ data, maxValue }: AnimatedBarChartProps) {
  const max = maxValue || Math.max(...data.map(d => d.value))

  return (
    <column
      gap-="1"
      style={{
        width: '100%',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
        touchAction: 'pan-y',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {data.map((item, index) => (
        <motion.div
          key={item.label}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.1, duration: 0.3 }}
        >
          <row gap-="1" align-="center start">
            <span style={{ minWidth: '80px', fontSize: 'var(--font-size-small)', color: 'var(--white-20)' }}>
              {item.label}
            </span>
            <div style={{ flex: 1, height: '20px', background: 'var(--brown)', borderRadius: '2px', overflow: 'hidden', position: 'relative' }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(item.value / max) * 100}%` }}
                transition={{ duration: 1, ease: 'easeOut', delay: index * 0.1 }}
                style={{
                  height: '100%',
                  background: item.color || 'var(--lime)',
                  position: 'relative'
                }}
              >
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 1, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity, delay: index * 0.1 }}
                  style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    width: '30%',
                    height: '100%',
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3))'
                  }}
                />
              </motion.div>
            </div>
            <span style={{ minWidth: '50px', textAlign: 'right', fontSize: 'var(--font-size)', fontWeight: 600, color: item.color || 'var(--lime)' }}>
              {item.value}
            </span>
          </row>
        </motion.div>
      ))}
    </column>
  )
}
