import { formatPrice } from '@/lib/utils'

type Snapshot = {
  competitor_product_id: string
  price: number | null
  scraped_at: string
  scrape_ok: boolean
}

type Source = {
  id: string
  label: string
}

const palette = ['#176B5B', '#B7791F', '#B91C1C', '#2563EB', '#6D28D9']

function pathFor(points: Array<{ x: number; y: number }>) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ')
}

export function PriceTrendChart({ snapshots, sources }: { snapshots: Snapshot[]; sources: Source[] }) {
  const valid = snapshots
    .filter((snapshot) => snapshot.scrape_ok && snapshot.price !== null)
    .map((snapshot) => ({
      ...snapshot,
      price: Number(snapshot.price),
      time: Date.parse(snapshot.scraped_at),
    }))
    .filter((snapshot) => Number.isFinite(snapshot.time))

  if (!valid.length) {
    return (
      <div className="grid min-h-64 place-items-center rounded-lg border border-vault-800 bg-vault-900/40 px-6 text-center">
        <div>
          <h2 className="text-base font-semibold">Noch kein Preisverlauf</h2>
          <p className="mt-2 text-sm text-vault-400">Nach mehreren Abrufen erscheint hier die Entwicklung je Preisquelle.</p>
        </div>
      </div>
    )
  }

  const width = 760
  const height = 280
  const padding = { top: 24, right: 28, bottom: 36, left: 58 }
  const minTime = Math.min(...valid.map((snapshot) => snapshot.time))
  const maxTime = Math.max(...valid.map((snapshot) => snapshot.time))
  const minPrice = Math.min(...valid.map((snapshot) => snapshot.price))
  const maxPrice = Math.max(...valid.map((snapshot) => snapshot.price))
  const timeRange = Math.max(1, maxTime - minTime)
  const priceRange = Math.max(1, maxPrice - minPrice)
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom
  const yTicks = [maxPrice, minPrice + priceRange / 2, minPrice]

  const grouped = sources.map((source, index) => {
    const points = valid
      .filter((snapshot) => snapshot.competitor_product_id === source.id)
      .sort((a, b) => a.time - b.time)
      .map((snapshot) => ({
        x: padding.left + ((snapshot.time - minTime) / timeRange) * plotWidth,
        y: padding.top + (1 - (snapshot.price - minPrice) / priceRange) * plotHeight,
        price: snapshot.price,
      }))
    return { ...source, points, color: palette[index % palette.length] }
  }).filter((source) => source.points.length)

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="trend-title trend-desc" className="min-w-[720px]">
        <title id="trend-title">Preisverlauf je Quelle</title>
        <desc id="trend-desc">Linienchart mit historischen Preisen pro Mitbewerberquelle.</desc>
        <rect width={width} height={height} rx="8" className="fill-vault-900" />
        {yTicks.map((tick) => {
          const y = padding.top + (1 - (tick - minPrice) / priceRange) * plotHeight
          return (
            <g key={tick}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="stroke-vault-800" strokeDasharray="4 6" />
              <text x={padding.left - 10} y={y + 4} textAnchor="end" className="fill-vault-500 text-[11px]">
                {formatPrice(tick)}
              </text>
            </g>
          )
        })}
        {grouped.map((source) => (
          <g key={source.id}>
            <path d={pathFor(source.points)} fill="none" stroke={source.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            {source.points.map((point, index) => (
              <circle key={`${source.id}-${index}`} cx={point.x} cy={point.y} r="3.5" fill={source.color}>
                <title>{`${source.label}: ${formatPrice(point.price)}`}</title>
              </circle>
            ))}
          </g>
        ))}
        <line x1={padding.left} x2={width - padding.right} y1={height - padding.bottom} y2={height - padding.bottom} className="stroke-vault-700" />
      </svg>
      <div className="mt-4 flex flex-wrap gap-3">
        {grouped.map((source) => (
          <span key={source.id} className="inline-flex items-center gap-2 text-xs text-vault-300">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: source.color }} />
            {source.label}
          </span>
        ))}
      </div>
    </div>
  )
}
