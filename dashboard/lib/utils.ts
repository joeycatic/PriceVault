import { formatDistanceToNow } from 'date-fns'
import { de } from 'date-fns/locale'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPrice(value: number | null, currency = 'EUR') {
  if (value === null) return '—'
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency,
  }).format(Number(value))
}

export function formatDelta(value: number | null) {
  if (value === null) return '—'
  const numeric = Number(value)
  return `${numeric > 0 ? '+' : ''}${numeric.toLocaleString('de-DE', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} %`
}

export function formatRelativeTime(value: string | null) {
  if (!value) return 'Noch nie'
  return formatDistanceToNow(new Date(value), { addSuffix: true, locale: de })
}

