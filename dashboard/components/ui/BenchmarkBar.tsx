import { formatPrice } from '@/lib/utils'

export function BenchmarkBar({
  lowest,
  highest,
  ourPrice,
}: {
  lowest: number
  highest: number
  ourPrice: number
}) {
  const width = 220
  const height = 38
  const padding = 16
  const range = Math.max(1, highest - lowest)
  const marker = padding + Math.min(1.15, Math.max(-0.15, (ourPrice - lowest) / range)) * (width - padding * 2)

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-10 w-full min-w-[180px]" role="img" aria-label={`Benchmark von ${formatPrice(lowest)} bis ${formatPrice(highest)}`}>
      <line x1={padding} x2={width - padding} y1="19" y2="19" stroke="#D7D7D7" strokeWidth="8" strokeLinecap="round" />
      <line x1={padding} x2={width - padding} y1="19" y2="19" stroke="#176B5B" strokeWidth="2" strokeLinecap="round" />
      <circle cx={marker} cy="19" r="7" fill="#1A1A1A">
        <title>{`Dein Preis: ${formatPrice(ourPrice)}`}</title>
      </circle>
      <text x={padding} y="35" className="fill-vault-500 text-[9px]">{formatPrice(lowest)}</text>
      <text x={width - padding} y="35" textAnchor="end" className="fill-vault-500 text-[9px]">{formatPrice(highest)}</text>
    </svg>
  )
}
