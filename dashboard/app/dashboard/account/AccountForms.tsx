'use client'

import { useActionState } from 'react'

import { signOut, updateAccountPassword, updateAccountProfile } from './actions'

const initialState = { ok: true, message: '' }

export function ProfileForm({ fullName }: { fullName: string }) {
  const [state, formAction, pending] = useActionState(updateAccountProfile, initialState)

  return (
    <form action={formAction} className="panel p-5">
      <h2 className="text-base font-semibold">Profil</h2>
      <label className="mt-5 block">
        <span className="field-label">Name</span>
        <input className="field" name="full_name" autoComplete="name" required defaultValue={fullName} />
      </label>
      {state.message && <p className={state.ok ? 'mt-3 text-sm text-vault-lime' : 'mt-3 text-sm text-red-300'}>{state.message}</p>}
      <button className="button-primary mt-5" disabled={pending}>
        {pending ? 'Speichert ...' : 'Profil speichern'}
      </button>
    </form>
  )
}

export function PasswordForm() {
  const [state, formAction, pending] = useActionState(updateAccountPassword, initialState)

  return (
    <form action={formAction} className="panel p-5">
      <h2 className="text-base font-semibold">Passwort</h2>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label>
          <span className="field-label">Neues Passwort</span>
          <input className="field" type="password" name="password" autoComplete="new-password" required minLength={8} />
        </label>
        <label>
          <span className="field-label">Bestätigen</span>
          <input className="field" type="password" name="confirm_password" autoComplete="new-password" required minLength={8} />
        </label>
      </div>
      {state.message && <p className={state.ok ? 'mt-3 text-sm text-vault-lime' : 'mt-3 text-sm text-red-300'}>{state.message}</p>}
      <button className="button-primary mt-5" disabled={pending}>
        {pending ? 'Speichert ...' : 'Passwort speichern'}
      </button>
    </form>
  )
}

export function SignOutButton() {
  return (
    <form action={signOut}>
      <button className="button-secondary w-full" type="submit">Abmelden</button>
    </form>
  )
}
