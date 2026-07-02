import { redirect } from 'next/navigation'

import { currentTenant } from '@/lib/backend'
import { createClient } from '@/lib/supabase/server'
import { MetricGrid, PageHeader } from '@/components/ui/MerchantUI'

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
      <PageHeader eyebrow="Nutzerkonto" title="Mein Konto" description="Login-Daten, Profil und Sitzung für dein PriceVault Nutzerkonto." />

      {passwordUpdated && (
        <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-vault-100">
          Passwort aktualisiert. Du bist jetzt angemeldet.
        </div>
      )}

      {completeAccount && (
        <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-5">
          <p className="font-semibold text-vault-100">Account vervollständigen</p>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-vault-300">
            Dein Magic-Link Login ist aktiv. Erstelle unten ein Passwort, damit du dich künftig auch mit E-Mail und Passwort anmelden kannst.
          </p>
        </div>
      )}

      <div className="mb-6"><MetricGrid items={[
        { label: 'E-Mail', value: user.email ?? '-' },
        { label: 'Rolle', value: tenant?.membership_role ?? 'owner' },
        { label: 'Plan', value: tenant?.plan ?? '-' },
        { label: 'Mandant', value: tenant?.shop_name ?? '-' },
      ]} /></div>

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
