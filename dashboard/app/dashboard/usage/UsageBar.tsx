'use client'

export function UsageBar({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
  return (
    <div className="space-y-3" aria-label={`Nutzung ${pct} Prozent`}>
      <div className="h-3 overflow-hidden border border-vault-700 bg-vault-950">
        <div className="h-full bg-vault-lime transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between font-mono text-xs text-vault-500">
        <span>{used} Abrufe</span>
        <span>{limit} Limit</span>
      </div>
    </div>
  )
}
