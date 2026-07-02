import Link from 'next/link'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

import { PasswordUpdateForm } from './PasswordUpdateForm'

export default async function PasswordUpdatePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <main className="grid min-h-screen place-items-center bg-vault-950 px-5 py-12">
      <section className="panel w-full max-w-md p-7 sm:p-10">
        <div className="mb-10 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-3" aria-label="PriceVault Start">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-vault-100 font-black text-white">PV</span>
            <span className="text-lg font-bold">PriceVault</span>
          </Link>
        </div>
        <p className="eyebrow">Nutzerkonto</p>
        <h1 className="mt-3 text-3xl font-bold">Neues Passwort setzen</h1>
        <p className="mt-3 text-sm leading-6 text-vault-300">
          Lege ein neues Passwort für dein PriceVault Konto fest.
        </p>
        <PasswordUpdateForm />
      </section>
    </main>
  )
}
