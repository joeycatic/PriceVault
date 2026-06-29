'use client'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createContext, useContext, useState } from 'react'

import { createClient } from '@/lib/supabase/client'

type SupabaseContextValue = {
  supabase: SupabaseClient
}

const SupabaseContext = createContext<SupabaseContextValue | undefined>(undefined)

export function SupabaseProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [supabase] = useState(() => createClient())

  return (
    <SupabaseContext.Provider value={{ supabase }}>
      {children}
    </SupabaseContext.Provider>
  )
}

export function useSupabase() {
  const context = useContext(SupabaseContext)
  if (!context) throw new Error('useSupabase muss innerhalb des SupabaseProvider verwendet werden')
  return context
}
