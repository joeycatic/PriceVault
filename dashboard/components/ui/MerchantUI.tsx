import type { LucideIcon } from 'lucide-react'
import { ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: string
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="mb-6 overflow-hidden rounded-2xl border border-vault-700 bg-white shadow-panel">
      <div className="relative flex flex-col justify-between gap-5 p-5 sm:p-6 lg:flex-row lg:items-end">
        <div className="absolute -right-10 -top-16 h-36 w-36 rounded-full bg-merchant-success/10 blur-3xl" aria-hidden="true" />
        <div className="relative min-w-0">
          {eyebrow && (
            <p className="inline-flex items-center gap-2 rounded-full border border-vault-700 bg-vault-950 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-vault-500">
              <span className="h-1.5 w-1.5 rounded-full bg-merchant-success" aria-hidden="true" />
              {eyebrow}
            </p>
          )}
          <h1 className="mt-3 text-3xl font-bold tracking-[-0.035em] text-vault-100 sm:text-4xl">{title}</h1>
          {description && <div className="mt-3 max-w-3xl text-sm leading-6 text-vault-500">{description}</div>}
        </div>
        {actions && <div className="relative flex flex-wrap gap-2">{actions}</div>}
      </div>
      <div className="h-1 bg-gradient-to-r from-vault-100 via-merchant-success to-vault-700" aria-hidden="true" />
    </header>
  )
}

export function MetricGrid({
  items,
}: {
  items: Array<{ label: string; value: ReactNode; detail?: ReactNode; tone?: 'success' | 'warning' | 'danger' | 'neutral' }>
}) {
  const dot = {
    success: 'bg-merchant-success',
    warning: 'bg-amber-500',
    danger: 'bg-red-500',
    neutral: 'bg-vault-500',
  }
  return (
    <section
      className={cn(
        'grid overflow-hidden rounded-2xl border border-vault-700 bg-white shadow-panel sm:grid-cols-2',
        items.length === 5 ? 'xl:grid-cols-5' : 'xl:grid-cols-4',
      )}
      aria-label="Kennzahlen"
    >
      {items.map((item, index) => (
        <article
          key={item.label}
          className={cn(
            'group relative overflow-hidden p-5 transition hover:bg-vault-950/70',
            index < items.length - 1 && 'border-b border-vault-700 sm:border-r xl:border-b-0',
          )}
        >
          <div className={cn('absolute inset-x-0 top-0 h-0.5 opacity-0 transition group-hover:opacity-100', dot[item.tone ?? 'neutral'])} aria-hidden="true" />
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-vault-500">{item.label}</p>
            <span className={cn('h-2.5 w-2.5 rounded-full shadow-sm', dot[item.tone ?? 'neutral'])} />
          </div>
          <p className="mt-5 truncate text-3xl font-bold tracking-[-0.03em] text-vault-100">{item.value}</p>
          {item.detail && <p className="mt-2 text-xs text-vault-500">{item.detail}</p>}
        </article>
      ))}
    </section>
  )
}

export function SectionHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col justify-between gap-3 border-b border-vault-700 bg-white px-5 py-4 sm:flex-row sm:items-center">
      <div>
        <h2 className="text-base font-semibold text-vault-100">{title}</h2>
        {description && <p className="mt-1 text-xs text-vault-500">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-vault-700 bg-vault-950 px-6 py-10 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white shadow-sm">
        <Icon className="h-6 w-6 text-vault-100" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-base font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-vault-500">{description}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  )
}

export function FeatureLinkCard({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string
  icon: LucideIcon
  title: string
  description: string
}) {
  return (
    <Link href={href} className="group relative overflow-hidden rounded-2xl border border-vault-700 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-vault-500 hover:shadow-[0_16px_40px_rgba(26,26,26,.10)]">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-vault-100 via-merchant-success to-vault-700 opacity-70" aria-hidden="true" />
      <div className="flex items-start justify-between gap-4">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-vault-950 text-vault-100">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <ArrowUpRight className="h-4 w-4 text-vault-500 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-vault-100" aria-hidden="true" />
      </div>
      <h2 className="mt-5 text-base font-bold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-vault-500">{description}</p>
    </Link>
  )
}
