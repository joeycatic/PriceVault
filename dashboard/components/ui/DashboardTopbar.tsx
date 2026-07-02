'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'

const utilityLinks = [
  { href: '/dashboard/wiki', label: 'Referenz', icon: 'reference' },
  { href: '/dashboard/account', label: 'Mein Konto', icon: 'account' },
  { href: '/dashboard/settings', label: 'Einstellungen', icon: 'settings' },
]

type UtilityIconName = (typeof utilityLinks)[number]['icon']

function UtilityIcon({ name }: { name: UtilityIconName }) {
  const common = {
    className: 'h-4 w-4',
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.8,
    viewBox: '0 0 24 24',
    'aria-hidden': true,
  }

  switch (name) {
    case 'reference':
      return <svg {...common}><path d="M6 4h9a3 3 0 0 1 3 3v13H8a2 2 0 0 1-2-2V4Z" /><path d="M8 16h10" /><path d="M9 8h5" /></svg>
    case 'account':
      return <svg {...common}><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
    case 'settings':
      return <svg {...common}><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" /><path d="M4 12h2" /><path d="M18 12h2" /><path d="M12 4v2" /><path d="M12 18v2" /><path d="M6.3 6.3l1.4 1.4" /><path d="M16.3 16.3l1.4 1.4" /><path d="M17.7 6.3l-1.4 1.4" /><path d="M7.7 16.3l-1.4 1.4" /></svg>
  }
}

export function DashboardTopbar() {
  const pathname = usePathname()

  return (
    <div className="sticky top-0 z-10 mb-6 flex justify-end border-b border-vault-700/70 bg-vault-950/90 px-4 py-3 backdrop-blur sm:px-7 lg:ml-64 lg:px-10 xl:px-14">
      <nav className="flex min-w-0 items-center gap-2 overflow-x-auto no-scrollbar" aria-label="Kontonavigation">
        {utilityLinks.map((link) => {
          const active = pathname === link.href || pathname.startsWith(`${link.href}/`)
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'flex min-h-9 items-center gap-2 border px-3 py-2 text-xs font-semibold transition',
                active
                  ? 'border-vault-lime/40 bg-vault-lime/10 text-vault-lime'
                  : 'border-vault-700 bg-vault-900/80 text-vault-300 hover:border-vault-lime/40 hover:text-vault-100',
              )}
            >
              <UtilityIcon name={link.icon} />
              <span>{link.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
