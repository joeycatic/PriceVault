import type { LucideIcon } from 'lucide-react'
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
    <header className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        {eyebrow && <p className="text-sm text-vault-500">{eyebrow}</p>}
        <h1 className="mt-1 text-2xl font-bold text-vault-100">{title}</h1>
        {description && <div className="mt-2 max-w-2xl text-sm leading-6 text-vault-500">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
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
    <section className="grid overflow-hidden rounded-lg border border-vault-700 bg-white shadow-panel sm:grid-cols-2 xl:grid-cols-4" aria-label="Kennzahlen">
      {items.map((item, index) => (
        <article key={item.label} className={cn('p-5', index < items.length - 1 && 'border-b border-vault-700 sm:border-r xl:border-b-0')}>
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-vault-500">{item.label}</p>
            <span className={cn('h-2 w-2 rounded-full', dot[item.tone ?? 'neutral'])} />
          </div>
          <p className="mt-5 text-2xl font-bold text-vault-100">{item.value}</p>
          {item.detail && <p className="mt-2 text-xs text-vault-500">{item.detail}</p>}
        </article>
      ))}
    </section>
  )
}

export function SectionHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col justify-between gap-3 border-b border-vault-700 px-5 py-4 sm:flex-row sm:items-center">
      <div>
        <h2 className="text-sm font-semibold text-vault-100">{title}</h2>
        {description && <p className="mt-1 text-xs text-vault-500">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-vault-700 bg-white px-6 py-10 text-center">
      <Icon className="mx-auto h-6 w-6 text-vault-500" aria-hidden="true" />
      <h2 className="mt-4 text-base font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-vault-500">{description}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  )
}
