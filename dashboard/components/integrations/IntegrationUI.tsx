import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { ArrowLeft, ArrowUpRight, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export type IntegrationTone = 'green' | 'violet' | 'amber' | 'blue' | 'slate'

const toneStyles: Record<IntegrationTone, {
  icon: string
  soft: string
  border: string
  dot: string
}> = {
  green: {
    icon: 'bg-emerald-950 text-emerald-50',
    soft: 'bg-emerald-50 text-emerald-900',
    border: 'border-emerald-200',
    dot: 'bg-emerald-500',
  },
  violet: {
    icon: 'bg-violet-950 text-violet-50',
    soft: 'bg-violet-50 text-violet-900',
    border: 'border-violet-200',
    dot: 'bg-violet-500',
  },
  amber: {
    icon: 'bg-amber-950 text-amber-50',
    soft: 'bg-amber-50 text-amber-900',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
  },
  blue: {
    icon: 'bg-sky-950 text-sky-50',
    soft: 'bg-sky-50 text-sky-900',
    border: 'border-sky-200',
    dot: 'bg-sky-500',
  },
  slate: {
    icon: 'bg-vault-100 text-white',
    soft: 'bg-vault-950 text-vault-100',
    border: 'border-vault-700',
    dot: 'bg-vault-500',
  },
}

export function IntegrationHero({
  eyebrow,
  title,
  description,
  icon: Icon,
  children,
  backHref,
  backLabel,
}: {
  eyebrow: string
  title: string
  description: ReactNode
  icon: LucideIcon
  children?: ReactNode
  backHref?: string
  backLabel?: string
}) {
  return (
    <div className="mb-6">
    <header className="relative overflow-hidden rounded-3xl border border-vault-700 bg-vault-100 text-white shadow-[0_22px_60px_rgba(48,48,48,0.16)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_8%_0%,rgba(52,211,153,0.2),transparent_26%),radial-gradient(circle_at_92%_8%,rgba(56,189,248,0.18),transparent_27%),radial-gradient(circle_at_72%_100%,rgba(167,139,250,0.15),transparent_30%)]" aria-hidden="true" />
      <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] [background-size:36px_36px]" aria-hidden="true" />
      <div className="relative p-5 sm:p-7 lg:p-8">
        {backHref && backLabel ? (
          <Link href={backHref} className="mb-6 inline-flex min-h-10 items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 text-xs font-semibold text-white/70 transition hover:border-white/30 hover:bg-white/10 hover:text-white">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {backLabel}
          </Link>
        ) : null}
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl border border-white/15 bg-white/10 shadow-inner">
                <Icon className="h-5 w-5 text-emerald-300" aria-hidden="true" />
              </span>
              <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white/55">
                <Sparkles className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
                {eyebrow}
              </p>
            </div>
            <h1 className="mt-5 text-3xl font-bold tracking-[-0.045em] text-white sm:text-4xl lg:text-5xl">{title}</h1>
            <div className="mt-4 max-w-2xl text-sm leading-6 text-white/65 sm:text-base">{description}</div>
          </div>
          {children ? <div className="grid min-w-[260px] grid-cols-2 gap-2">{children}</div> : null}
        </div>
      </div>
      <div className="relative flex h-1.5" aria-hidden="true">
        <span className="flex-1 bg-emerald-400" />
        <span className="flex-1 bg-violet-400" />
        <span className="flex-1 bg-amber-400" />
        <span className="flex-1 bg-sky-400" />
      </div>
    </header>
    </div>
  )
}

export function HeroStat({ label, value, tone = 'slate' }: { label: string; value: ReactNode; tone?: IntegrationTone }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-3 backdrop-blur-sm">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-white/45">
        <span className={cn('h-2 w-2 rounded-full', toneStyles[tone].dot)} aria-hidden="true" />
        {label}
      </div>
      <p className="mt-2 truncate text-lg font-bold text-white">{value}</p>
    </div>
  )
}

export function IntegrationIcon({ icon: Icon, tone, className }: { icon: LucideIcon; tone: IntegrationTone; className?: string }) {
  return (
    <span className={cn('grid h-12 w-12 shrink-0 place-items-center rounded-2xl shadow-sm', toneStyles[tone].icon, className)}>
      <Icon className="h-5 w-5" aria-hidden="true" />
    </span>
  )
}

export function IntegrationBadge({ children, tone = 'slate' }: { children: ReactNode; tone?: IntegrationTone }) {
  return (
    <span className={cn('inline-flex min-h-7 items-center gap-2 rounded-full border px-2.5 text-[10px] font-bold uppercase tracking-[0.1em]', toneStyles[tone].soft, toneStyles[tone].border)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', toneStyles[tone].dot)} aria-hidden="true" />
      {children}
    </span>
  )
}

export function IntegrationLinkCard({
  href,
  icon,
  tone,
  eyebrow,
  title,
  description,
  meta,
  className,
}: {
  href: string
  icon: LucideIcon
  tone: IntegrationTone
  eyebrow: string
  title: string
  description: string
  meta: string
  className?: string
}) {
  return (
    <Link href={href} className={cn('group relative overflow-hidden rounded-3xl border border-vault-700 bg-white p-5 shadow-panel transition duration-300 hover:-translate-y-1 hover:border-vault-500 hover:shadow-[0_20px_55px_rgba(48,48,48,0.12)] sm:p-6', className)}>
      <div className={cn('absolute -right-16 -top-16 h-40 w-40 rounded-full opacity-60 blur-3xl', toneStyles[tone].soft)} aria-hidden="true" />
      <div className="relative flex items-start justify-between gap-4">
        <IntegrationIcon icon={icon} tone={tone} />
        <ArrowUpRight className="h-5 w-5 text-vault-500 transition duration-300 group-hover:translate-x-1 group-hover:-translate-y-1 group-hover:text-vault-100" aria-hidden="true" />
      </div>
      <div className="relative mt-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-vault-500">{eyebrow}</p>
        <h2 className="mt-2 text-xl font-bold tracking-[-0.025em] text-vault-100">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-vault-500">{description}</p>
        <div className="mt-6 flex items-center justify-between border-t border-vault-800 pt-4">
          <span className="font-mono text-[11px] text-vault-500">{meta}</span>
          <span className="text-xs font-bold text-vault-100">Öffnen</span>
        </div>
      </div>
    </Link>
  )
}

export function IntegrationSectionHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-vault-500">{eyebrow}</p>
        <h2 className="mt-2 text-xl font-bold tracking-[-0.025em] text-vault-100 sm:text-2xl">{title}</h2>
        {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-vault-500">{description}</p> : null}
      </div>
      {action}
    </div>
  )
}
