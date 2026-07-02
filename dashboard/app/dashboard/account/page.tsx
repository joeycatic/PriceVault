import { redirect } from 'next/navigation'

import { currentTenant } from '@/lib/backend'
import { createClient } from '@/lib/supabase/server'

import { PasswordForm, ProfileForm, SignOutButton } from './AccountForms'

export default async function AccountPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const tenant = await currentTenant()
  const params = searchParams ? await searchParams : {}
  const passwordUpdated = params.password === 'updated'
  const completeAccount = params.complete === '1'
  const fullName = String(user.user_metadata?.full_name ?? '')

  return (
    <>
      <header className="mb-8 border-b border-vault-700 pb-7">
        <p className="eyebrow">Account / User</p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] sm:text-4xl">Mein Konto</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-vault-300">
          Login-Daten, Profil und Sitzung für dein PriceVault Nutzerkonto.
        </p>
      </header>

      {passwordUpdated && (
        <div className="mb-6 border-l-2 border-vault-lime bg-vault-lime/5 p-4 text-sm text-vault-100">
          Passwort aktualisiert. Du bist jetzt angemeldet.
        </div>
      )}

      {completeAccount && (
        <div className="mb-6 border-l-2 border-vault-lime bg-vault-lime/5 p-5">
          <p className="font-semibold text-vault-100">Account vervollständigen</p>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-vault-300">
            Dein Magic-Link Login ist aktiv. Erstelle unten ein Passwort, damit du dich künftig auch mit E-Mail und Passwort anmelden kannst.
          </p>
        </div>
      )}

      <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['E-Mail', user.email ?? '-'],
          ['Rolle', tenant?.membership_role ?? 'owner'],
          ['Plan', tenant?.plan ?? '-'],
          ['Mandant', tenant?.shop_name ?? '-'],
        ].map(([label, value]) => (
          <div key={label} className="border border-vault-700 bg-vault-900/70 px-5 py-4">
            <p className="text-[10px] uppercase tracking-[0.14em] text-vault-500">{label}</p>
            <p className="mt-2 truncate font-mono text-xl font-bold">{value}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <ProfileForm fullName={fullName} />
          <PasswordForm />
        </div>
        <aside className="panel h-fit p-5">
          <h2 className="text-base font-semibold">Sitzung</h2>
          <p className="mt-3 text-sm leading-6 text-vault-300">
            Melde dich auf diesem Gerät ab. Aktive Supabase Sessions werden serverseitig beendet.
          </p>
          <div className="mt-5">
            <SignOutButton />
          </div>
        </aside>
      </div>
    </>
  )
}
