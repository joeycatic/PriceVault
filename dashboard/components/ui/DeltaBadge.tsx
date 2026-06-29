import { cn, formatDelta } from '@/lib/utils'

export function DeltaBadge({ value }: { value: number | null }) {
  const numeric = value === null ? null : Number(value)
  const label =
    numeric === null ? '—' : numeric > 0 ? `▲ ${formatDelta(numeric)}` : numeric < 0 ? `▼ ${formatDelta(numeric)}` : '= 0 %'

  return (
    <span
      className={cn(
        'inline-flex min-w-20 justify-center border px-2.5 py-1 font-mono text-xs font-bold',
        numeric === null || numeric === 0
          ? 'border-vault-700 bg-vault-800 text-vault-300'
          : numeric > 0
            ? 'border-red-400/25 bg-red-400/10 text-red-300'
            : 'border-vault-lime/25 bg-vault-lime/10 text-vault-lime',
      )}
    >
      {label}
    </span>
  )
}

