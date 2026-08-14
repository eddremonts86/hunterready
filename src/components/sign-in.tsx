/**
 * Sign in, or make an account — the door v0.5 was built behind.
 *
 * One form for both, because "sign in / sign up" as two tabs asks a question the person cannot answer
 * on their first visit: they do not remember whether they made an account here. The form tries to sign
 * in, and if there is no such account it offers to create one with what they already typed.
 *
 * The copy says what an account is *for* before asking for anything. Somebody who does not want their
 * CV stored should be able to tell from this panel that they can simply not use it — the whole product
 * works without an account, and saying so here is what keeps that true rather than technically true.
 */
import { useState } from 'react'
import { signIn, signUp } from '@/lib/auth-client'
import { RETENTION_DAYS } from '@/db/retention-policy'

type Mode = 'signIn' | 'signUp'

export function SignIn({ onSignedIn }: { onSignedIn?: () => void }) {
  const [mode, setMode] = useState<Mode>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      const result =
        mode === 'signIn'
          ? await signIn.email({ email, password })
          : await signUp.email({ email, password, name: '' })

      if (result.error !== null && result.error !== undefined) {
        /**
         * "No such account" becomes an offer, not a dead end.
         *
         * Better Auth returns 401 for both a wrong password and an unknown address, on purpose — it
         * will not confirm whether an email is registered. So this cannot say "that account does not
         * exist"; it offers the next step and lets the person decide which case they are in.
         */
        if (mode === 'signIn') {
          setMode('signUp')
          setError(
            'That did not sign you in. If you have not made an account yet, the button now creates one with this email.',
          )
        } else {
          setError(
            result.error.message ??
              'We could not create that account. Try a different email, or a longer password.',
          )
        }
        return
      }
      onSignedIn?.()
    } catch {
      setError('We could not reach the server. Nothing was changed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="rim bench mx-auto flex w-full max-w-md flex-col gap-4 p-5"
    >
      <div className="flex flex-col gap-2">
        <h2 className="stencil text-[11px] text-safelight">
          {mode === 'signIn' ? 'Come back to your CV' : 'Keep your CV here'}
        </h2>
        <p className="text-[12px] leading-relaxed text-tray-enamel">
          An account means we remember your CV between visits, so you can come
          back to it and keep a version of what you sent to each employer.
        </p>
        <p className="text-[11px] leading-relaxed text-developer-gray">
          We keep it for {RETENTION_DAYS} days after your last visit, then
          delete it — and you can delete it yourself at any time.{' '}
          <a
            href="/privacy"
            className="text-safelight underline underline-offset-4"
          >
            What we do with your data
          </a>
        </p>
        {/* The exit, said plainly. An account the person did not need is data we did not need. */}
        <p className="text-[10px] leading-relaxed text-developer-gray">
          You do not need one. Everything except remembering works without an
          account, and nothing is stored if you skip this.
        </p>
      </div>

      <label className="flex flex-col gap-1">
        <span className="stencil text-[9px] text-safelight/70">Email</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="rim bg-print-black/40 px-2 py-2 text-[12px] text-tray-enamel"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="stencil text-[9px] text-safelight/70">Password</span>
        <input
          type="password"
          required
          minLength={10}
          autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="rim bg-print-black/40 px-2 py-2 text-[12px] text-tray-enamel"
        />
        {mode === 'signUp' && (
          <span className="text-[9px] text-developer-gray">
            At least 10 characters.
          </span>
        )}
      </label>

      <button
        type="submit"
        disabled={busy}
        className="rim stencil px-4 py-2.5 text-[10px] text-tray-enamel transition-colors hover:bg-amber-shadow/25 disabled:opacity-50"
      >
        {busy
          ? 'Working…'
          : mode === 'signIn'
            ? 'Sign in'
            : 'Create my account'}
      </button>

      {error !== undefined && (
        <p
          role="status"
          className="text-[10px] leading-relaxed text-tray-enamel/80"
        >
          {error}
        </p>
      )}

      {mode === 'signUp' && (
        <button
          type="button"
          onClick={() => {
            setMode('signIn')
            setError(undefined)
          }}
          className="stencil self-start text-[9px] text-safelight/70 underline underline-offset-4 hover:text-safelight"
        >
          I already have an account
        </button>
      )}
    </form>
  )
}
