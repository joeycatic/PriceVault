'use client'

import {
  Activity,
  BarChart3,
  Bell,
  Building2,
  BadgeEuro,
  ChevronDown,
  CreditCard,
  Gauge,
  HeartPulse,
  LifeBuoy,
  Mail,
  Menu,
  Package,
  Plug,
  Radio,
  Shield,
  Store,
  Users,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { useSupabase } from '@/components/providers/SupabaseProvider'
import { cn } from '@/lib/utils'

const primaryLinks = [
  { href: '/dashboard', label: 'Übersicht', icon: Gauge },
  { href: '/dashboard/products', label: 'Produkte', icon: Package },
  { href: '/dashboard/competitors', label: 'Mitbewerber', icon: Users },
  { href: '/dashboard/company', label: 'Unternehmen', icon: Building2 },
]

const monitorLinks = [
  { href: '/dashboard/source-health', label: 'Quellenstatus', icon: HeartPulse },
  { href: '/dashboard/alerts', label: 'Preisalarme', icon: Bell },
  { href: '/dashboard/repricing', label: 'Preisvorschläge', icon: BadgeEuro },
  { href: '/dashboard/alerts/channels', label: 'Kanäle', icon: Radio },
  { href: '/dashboard/reports', label: 'Reports', icon: BarChart3 },
  { href: '/dashboard/scrapes', label: 'Scrape-Jobs', icon: Activity },
  { href: '/dashboard/usage', label: 'Nutzung', icon: Gauge },
]

const supportLinks = [{ href: '/dashboard/support', label: 'Support', icon: LifeBuoy }]
const systemLinks = [
  { href: '/dashboard/admin', label: 'Support-Konsole', icon: Shield },
  { href: '/dashboard/settings/integrations', label: 'Integrationen', icon: Plug },
  { href: '/dashboard/settings/notifications', label: 'Tagesübersicht', icon: Mail },
  { href: '/dashboard/settings/team', label: 'Team', icon: Users },
  { href: '/dashboard/settings/billing', label: 'Plan & Abrechnung', icon: CreditCard },
]
const allLinks = [...primaryLinks, ...monitorLinks, ...systemLinks, ...supportLinks]

function activeHref(pathname: string) {
  return allLinks
    .filter((link) => pathname === link.href || pathname.startsWith(`${link.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href
}

function NavigationLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const current = activeHref(pathname)
  const groups = [
    { label: 'Shop', links: primaryLinks },
    { label: 'Monitoring', links: monitorLinks },
    { label: 'System', links: systemLinks },
    { label: 'Hilfe', links: supportLinks },
  ]

  return (
    <nav className="space-y-6" aria-label="Hauptnavigation">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase text-vault-500">{group.label}</p>
          <div className="space-y-1">
            {group.links.map((link) => {
              const Icon = link.icon
              const active = current === link.href
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  prefetch={false}
                  onClick={onNavigate}
                  className={cn(
                    'flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm transition',
                    active
                      ? 'bg-white font-semibold text-vault-100 shadow-sm'
                      : 'text-vault-300 hover:bg-white/65 hover:text-vault-100',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
                  {link.label}
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}

export function Sidebar({ shopName }: { shopName: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const { supabase } = useSupabase()
  const [open, setOpen] = useState(false)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const workspaceMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function close(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', close)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', close)
      document.body.style.overflow = ''
    }
  }, [open])

  useEffect(() => {
    if (!workspaceOpen) return

    function close(event: KeyboardEvent) {
      if (event.key === 'Escape') setWorkspaceOpen(false)
    }

    function closeOnOutsideClick(event: MouseEvent) {
      if (!workspaceMenuRef.current?.contains(event.target as Node)) {
        setWorkspaceOpen(false)
      }
    }

    document.addEventListener('keydown', close)
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => {
      document.removeEventListener('keydown', close)
      document.removeEventListener('mousedown', closeOnOutsideClick)
    }
  }, [workspaceOpen])

  async function logout() {
    await supabase.auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-vault-700 bg-white px-4 lg:hidden">
        <Link href="/dashboard" prefetch={false} className="flex items-center gap-3" aria-label="PriceVault Startseite">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-vault-100 text-xs font-black text-white">PV</span>
          <span className="text-sm font-bold">PriceVault</span>
        </Link>
        <button
          type="button"
          className="grid h-10 w-10 place-items-center rounded-lg border border-vault-700 bg-white"
          onClick={() => setOpen(true)}
          aria-label="Navigation öffnen"
          aria-expanded={open}
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
      </header>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-vault-700 bg-[#ebebeb] lg:flex">
        <div className="flex h-16 items-center border-b border-vault-700 px-5">
          <Link href="/dashboard" prefetch={false} className="flex items-center gap-3" aria-label="PriceVault Startseite">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-vault-100 text-xs font-black text-white">PV</span>
            <span className="font-bold">PriceVault</span>
          </Link>
        </div>
        <div ref={workspaceMenuRef} className="relative mx-3 mt-3">
          <button
            type="button"
            className={cn(
              'flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left transition',
              workspaceOpen ? 'bg-white text-vault-100 shadow-sm' : 'hover:bg-white/70',
            )}
            onClick={() => setWorkspaceOpen((current) => !current)}
            aria-haspopup="menu"
            aria-expanded={workspaceOpen}
            aria-controls="workspace-menu"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white text-vault-100 shadow-sm">
              <Store className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{shopName}</span>
              <span className="block text-[10px] font-medium uppercase tracking-[0.08em] text-vault-500">Workspace</span>
            </span>
            <ChevronDown className={cn('h-4 w-4 text-vault-500 transition-transform', workspaceOpen && 'rotate-180')} aria-hidden="true" />
          </button>

          {workspaceOpen && (
            <div
              id="workspace-menu"
              role="menu"
              className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 overflow-hidden rounded-xl border border-vault-700 bg-white shadow-xl animate-in fade-in-0 zoom-in-95 duration-150"
            >
              <div className="border-b border-vault-700 bg-vault-950/70 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-vault-500">Aktiver Workspace</p>
                <p className="mt-1 truncate text-sm font-bold text-vault-100">{shopName}</p>
              </div>
              <div className="p-1.5">
                {[
                  { href: '/dashboard', label: 'Übersicht öffnen', icon: Gauge },
                  { href: '/dashboard/company', label: 'Unternehmen bearbeiten', icon: Building2 },
                  { href: '/onboarding', label: 'Einrichtung fortsetzen', icon: Store },
                  { href: '/dashboard/settings/billing', label: 'Plan & Abrechnung', icon: CreditCard },
                ].map((item) => {
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch={false}
                      role="menuitem"
                      onClick={() => setWorkspaceOpen(false)}
                      className="flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-vault-300 transition hover:bg-vault-950 hover:text-vault-100 focus:bg-vault-950 focus:text-vault-100 focus:outline-none"
                    >
                      <Icon className="h-4 w-4 text-vault-500" aria-hidden="true" />
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            </div>
          )}
        </div>
        <div className="no-scrollbar flex-1 overflow-y-auto px-3 py-5">
          <NavigationLinks pathname={pathname} />
        </div>
        <div className="border-t border-vault-700 p-3">
          <Link href="/onboarding" prefetch={false} className="flex min-h-10 items-center rounded-lg px-3 text-sm text-vault-300 hover:bg-white/70 hover:text-vault-100">
            Einrichtung öffnen
          </Link>
          <button onClick={logout} className="mt-1 flex min-h-10 w-full items-center rounded-lg px-3 text-sm text-vault-300 hover:bg-white/70 hover:text-vault-100" type="button">
            Abmelden
          </button>
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button className="absolute inset-0 bg-black/25" type="button" onClick={() => setOpen(false)} aria-label="Navigation schließen" />
          <aside className="relative flex h-full w-[min(88vw,340px)] flex-col border-r border-vault-700 bg-[#ebebeb] shadow-2xl">
            <div className="flex h-16 items-center justify-between border-b border-vault-700 px-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-vault-100 text-xs font-black text-white">PV</span>
                <span className="truncate text-sm font-semibold">{shopName}</span>
              </div>
              <button type="button" className="grid h-10 w-10 place-items-center rounded-lg" onClick={() => setOpen(false)} aria-label="Navigation schließen">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div className="no-scrollbar flex-1 overflow-y-auto px-3 py-5">
              <NavigationLinks pathname={pathname} onNavigate={() => setOpen(false)} />
            </div>
            <div className="border-t border-vault-700 p-4 text-sm text-vault-300">
              <Link href="/dashboard/account" prefetch={false} onClick={() => setOpen(false)} className="block py-2">Mein Konto</Link>
              <Link href="/dashboard/settings" prefetch={false} onClick={() => setOpen(false)} className="block py-2">Einstellungen</Link>
              <Link href="/dashboard/wiki" prefetch={false} onClick={() => setOpen(false)} className="block py-2">Referenz</Link>
              <button onClick={logout} className="mt-2 w-full rounded-lg border border-vault-700 bg-white px-4 py-2.5 text-left font-semibold">Abmelden</button>
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
