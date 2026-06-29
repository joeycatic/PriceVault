import type { Metadata } from 'next'

import { SupabaseProvider } from '@/components/providers/SupabaseProvider'
import { createClient } from '@/lib/supabase/server'

import './globals.css'

export const metadata: Metadata = {
  title: 'PriceVault',
  description: 'Behalte den Überblick über deine Mitbewerberpreise.',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  return (
    <html lang="de">
      <body>
        <SupabaseProvider initialSession={session}>{children}</SupabaseProvider>
      </body>
    </html>
  )
}

