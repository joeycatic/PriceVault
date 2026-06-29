import type { Metadata } from 'next'

import { SupabaseProvider } from '@/components/providers/SupabaseProvider'

import './globals.css'

export const metadata: Metadata = {
  title: 'PriceVault',
  description: 'Behalte den Überblick über deine Mitbewerberpreise.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <SupabaseProvider>{children}</SupabaseProvider>
      </body>
    </html>
  )
}
