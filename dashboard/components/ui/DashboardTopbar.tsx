'use client'

import { BookOpen, Search, Settings } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'

const utilityLinks = [
  { href: '/dashboard/wiki', label: 'Referenz', icon: BookOpen },
  { href: '/dashboard/settings', label: 'Einstellungen', icon: Settings },
]

export function DashboardTopbar({
  accountInitials,
  accountLabel,
}: {
  accountInitials: string
  accountLabel: string
}) {
  const pathname = usePathname()
  const accountActive = pathname === '/dashboard/account' || pathname.startsWith('/dashboard/account/')

  return (
    <div className="sticky top-0 z-20 mb-6 hidden min-h-14 items-center justify-between border-b border-vault-700 bg-white px-8 lg:ml-60 lg:flex xl:px-10">
      <button type="button" className="flex min-h-9 w-full max-w-sm items-center gap-2 rounded-lg bg-vault-800 px-3 text-left text-sm text-vault-500">
        <Search className="h-4 w-4" aria-hidden="true" />
        Suchen
      </button>
      <nav className="flex items-center gap-1" aria-label="Kontonavigation">
        {utilityLinks.map((link) => {
          const active = pathname === link.href || pathname.startsWith(`${link.href}/`)
          const Icon = link.icon
          return (
            <Link
              key={link.href}
              href={link.href}
              prefetch={false}
              className={cn(
                'flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold transition',
                active ? 'bg-vault-800 text-vault-100' : 'text-vault-300 hover:bg-vault-800 hover:text-vault-100',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {link.label}
            </Link>
          )
        })}
        <Link
          href="/dashboard/account"
          prefetch={false}
          className={cn(
            'ml-1 grid h-9 w-9 place-items-center rounded-full border text-xs font-bold tracking-[-0.02em] transition',
            accountActive
              ? 'border-vault-100 bg-vault-100 text-white shadow-sm'
              : 'border-vault-700 bg-vault-800 text-vault-100 hover:border-vault-500 hover:bg-white',
          )}
          aria-label={`Mein Konto öffnen: ${accountLabel}`}
          title={`Mein Konto · ${accountLabel}`}
        >
          {accountInitials}
        </Link>
      </nav>
    </div>
  )
}
