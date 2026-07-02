'use client'

export function UsageBar({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
  return (
    <div className="space-y-3" aria-label={`Nutzung ${pct} Prozent`}>
      <div className="h-2 overflow-hidden rounded-full bg-vault-800">
        <div className="h-full rounded-full bg-merchant-success transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between font-mono text-xs text-vault-500">
        <span>{used} Abrufe</span>
        <span>{limit} Limit</span>
      </div>
    </div>
  )
}
