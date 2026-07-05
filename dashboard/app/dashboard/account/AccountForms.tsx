'use client'

import { CheckCircle2, KeyRound, LogOut, Save, UserRound, XCircle } from 'lucide-react'
import { useActionState } from 'react'

import { signOut, updateAccountPassword, updateAccountProfile } from './actions'

const initialState = { ok: true, message: '' }

function FormStateMessage({ ok, message }: { ok: boolean; message: string }) {
  if (!message) return null
  return (
    <div className={`mt-4 flex gap-3 rounded-xl border px-4 py-3 text-sm ${ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
      <p className="font-semibold">{message}</p>
    </div>
  )
}

export function ProfileForm({ fullName }: { fullName: string }) {
  const [state, formAction, pending] = useActionState(updateAccountProfile, initialState)

  return (
    <form action={formAction} className="panel overflow-hidden">
      <div className="border-b border-vault-700 bg-white px-5 py-4">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-vault-500"><UserRound className="h-4 w-4" aria-hidden="true" />Profil</p>
        <h2 className="mt-2 text-base font-semibold">Persönliche Angaben</h2>
      </div>
      <div className="p-5">
      <label className="mt-5 block">
        <span className="field-label">Name</span>
        <input className="field" name="full_name" autoComplete="name" required defaultValue={fullName} />
      </label>
      <FormStateMessage ok={state.ok} message={state.message} />
      <button className="button-primary mt-5 gap-2" disabled={pending}>
        <Save className="h-4 w-4" aria-hidden="true" />
        {pending ? 'Speichert ...' : 'Profil speichern'}
      </button>
      </div>
    </form>
  )
}

export function PasswordForm() {
  const [state, formAction, pending] = useActionState(updateAccountPassword, initialState)

  return (
    <form action={formAction} className="panel overflow-hidden">
      <div className="border-b border-vault-700 bg-vault-100 px-5 py-4 text-white">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-white/55"><KeyRound className="h-4 w-4" aria-hidden="true" />Sicherheit</p>
        <h2 className="mt-2 text-base font-semibold">Passwort erstellen oder ändern</h2>
      </div>
      <div className="p-5">
      <p className="mt-2 text-sm leading-6 text-vault-300">
        Wenn du bisher Magic Links genutzt hast, legst du hier dein Passwort für den normalen Login fest.
      </p>
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
      <FormStateMessage ok={state.ok} message={state.message} />
      <button className="button-primary mt-5 gap-2" disabled={pending}>
        <Save className="h-4 w-4" aria-hidden="true" />
        {pending ? 'Speichert ...' : 'Passwort speichern'}
      </button>
      </div>
    </form>
  )
}

export function SignOutButton() {
  return (
    <form action={signOut}>
      <button className="button-secondary w-full gap-2" type="submit"><LogOut className="h-4 w-4" aria-hidden="true" />Abmelden</button>
    </form>
  )
}
