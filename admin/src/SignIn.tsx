import { useState, type FormEvent } from 'react';
import { supabase } from './supabase';

/**
 * Agent sign-in.
 *
 * Password auth against the same Supabase project the app uses. There is no
 * sign-up here and there must not be one: agent accounts are created by hand in
 * the Supabase dashboard and then granted access by a row in `support_agents`.
 * A self-service path into this console would be a self-service path into every
 * user's support history.
 */
export function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setBusy(false);
    // Deliberately one message for every failure mode. Distinguishing "no such
    // account" from "wrong password" would confirm which addresses have agent
    // accounts to anyone who asks.
    if (signInError) setError("That didn't work. Check the address and password.");
  }

  return (
    <div className="signin">
      <form onSubmit={handleSubmit}>
        <h1>PlanNplate support</h1>
        <p>Sign in to read and answer messages.</p>

        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@plannplate.com.au"
          autoComplete="username"
          required
          aria-label="Email"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoComplete="current-password"
          required
          aria-label="Password"
        />

        <button className="primary" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        {error && <p className="error">{error}</p>}
      </form>
    </div>
  );
}
