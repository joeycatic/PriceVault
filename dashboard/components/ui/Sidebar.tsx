'use client'

import {
  Activity,
  BarChart3,
  Bell,
  Building2,
  ChevronDown,
  Gauge,
  Menu,
  Package,
  Radio,
  ShieldCheck,
  Store,
  Users,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { useSupabase } from '@/components/providers/SupabaseProvider'
import { cn } from '@/lib/utils'

const primaryLinks = [
  { href: '/dashboard', label: 'Übersicht', icon: Gauge },
  { href: '/dashboard/products', label: 'Produkte', icon: Package },
  { href: '/dashboard/competitors', label: 'Mitbewerber', icon: Users },
  { href: '/dashboard/company', label: 'Unternehmen', icon: Building2 },
]

const monitorLinks = [
  { href: '/dashboard/alerts', label: 'Preisalarme', icon: Bell },
  { href: '/dashboard/alerts/channels', label: 'Kanäle', icon: Radio },
  { href: '/dashboard/reports', label: 'Reports', icon: BarChart3 },
  { href: '/dashboard/scrapes', label: 'Scrape-Jobs', icon: Activity },
  { href: '/dashboard/usage', label: 'Nutzung', icon: Gauge },
]

const supportLinks = [{ href: '/dashboard/admin', label: 'Support', icon: ShieldCheck }]
const allLinks = [...primaryLinks, ...monitorLinks, ...supportLinks]

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
    { label: 'Intern', links: supportLinks },
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

  async function logout() {
    await supabase.auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-vault-700 bg-white px-4 lg:hidden">
        <Link href="/dashboard" className="flex items-center gap-3" aria-label="PriceVault Startseite">
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
          <Link href="/dashboard" className="flex items-center gap-3" aria-label="PriceVault Startseite">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-vault-100 text-xs font-black text-white">PV</span>
            <span className="font-bold">PriceVault</span>
          </Link>
        </div>
        <button type="button" className="mx-3 mt-3 flex min-h-11 items-center gap-3 rounded-lg px-3 text-left hover:bg-white/70">
          <Store className="h-4 w-4" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{shopName}</span>
          <ChevronDown className="h-4 w-4 text-vault-500" aria-hidden="true" />
        </button>
        <div className="no-scrollbar flex-1 overflow-y-auto px-3 py-5">
          <NavigationLinks pathname={pathname} />
        </div>
        <div className="border-t border-vault-700 p-3">
          <Link href="/onboarding" className="flex min-h-10 items-center rounded-lg px-3 text-sm text-vault-300 hover:bg-white/70 hover:text-vault-100">
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
              <Link href="/dashboard/account" onClick={() => setOpen(false)} className="block py-2">Mein Konto</Link>
              <Link href="/dashboard/settings" onClick={() => setOpen(false)} className="block py-2">Einstellungen</Link>
              <Link href="/dashboard/wiki" onClick={() => setOpen(false)} className="block py-2">Referenz</Link>
              <button onClick={logout} className="mt-2 w-full rounded-lg border border-vault-700 bg-white px-4 py-2.5 text-left font-semibold">Abmelden</button>
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
