import { cn, formatDelta } from '@/lib/utils'

export function DeltaBadge({ value }: { value: number | null }) {
  const numeric = value === null ? null : Number(value)
  const label =
    numeric === null ? '—' : numeric > 0 ? `▲ ${formatDelta(numeric)}` : numeric < 0 ? `▼ ${formatDelta(numeric)}` : '= 0 %'

  return (
    <span
      className={cn(
        'inline-flex min-w-20 justify-center rounded-full px-2.5 py-1 text-xs font-semibold',
        numeric === null || numeric === 0
          ? 'bg-vault-800 text-vault-300'
        : numeric > 0
            ? 'bg-emerald-100 text-emerald-800'
            : 'bg-red-100 text-red-700',
      )}
    >
      {label}
    </span>
  )
}
