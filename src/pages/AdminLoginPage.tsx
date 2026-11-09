import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthActions } from '@convex-dev/auth/react';
import { useQuery } from 'convex/react';
import { Eye, EyeOff, LogIn, ShieldCheck, UserPlus } from 'lucide-react';

import { api } from '../../convex/_generated/api';
import { ErrorMessage, extractErrorMessage } from '../components/ErrorMessage';
import { OAuthButtons } from '../components/OAuthButtons';

type Flow = 'signIn' | 'signUp';

/**
 * Staff sign-in / sign-up (M1). A successful sign-up (password OR OAuth)
 * creates a Convex Auth `users` row but grants NO staff rights — an owner must
 * grant access via /admin/settings (staff.grantStaff) before the admin area
 * unlocks. See convex/staff.ts requireStaff — the single chokepoint regardless
 * of how a user signed in.
 */
export function AdminLoginPage() {
  const { signIn } = useAuthActions();
  const navigate = useNavigate();

  // Which sign-in methods this deployment offers (env-gated OAuth providers +
  // password). `undefined` while loading — render password-only until it
  // resolves so the OAuth buttons never flash then disappear.
  const methods = useQuery(api.auth.availableAuthMethods, {});
  const accountCreationDisabled = import.meta.env.VITE_PUBLIC_SHOWCASE === 'true'
    || import.meta.env.VITE_OPENSTAYS_PROFILE === 'production';
  const hasOAuth = !accountCreationDisabled
    && Boolean(methods && (methods.github || methods.google || methods.microsoft));

  const [flow, setFlow] = useState<Flow>('signIn');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignUp = !accountCreationDisabled && flow === 'signUp';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn('password', {
        email,
        password,
        name,
        flow: accountCreationDisabled ? 'signIn' : flow,
      });
      navigate('/admin');
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6 py-8">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-6 w-6 text-emerald-700" aria-hidden="true" />
        <div><p className="text-xs font-bold uppercase tracking-[.18em] text-cyan-700">Sóng Homestay</p><h1 className="font-display text-2xl font-semibold text-stone-900">Đăng nhập quản trị</h1></div>
      </div>

      <div className="card p-6">
        {hasOAuth && methods ? (
          <>
            <OAuthButtons methods={methods} />
            <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wide text-stone-400">
              <span className="h-px flex-1 bg-stone-200" />
              or use email + password
              <span className="h-px flex-1 bg-stone-200" />
            </div>
          </>
        ) : null}

        {accountCreationDisabled ? (
          <p className="mb-5 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-600">
            Chỉ tài khoản nhân viên đã được cấp quyền mới có thể truy cập hệ thống.
          </p>
        ) : (
          <div className="mb-5 flex rounded-lg bg-stone-100 p-1 text-sm font-medium">
            <button
              type="button"
              className={`flex-1 rounded-md py-1.5 transition ${
                flow === 'signIn' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-800'
              }`}
              onClick={() => setFlow('signIn')}
            >
              Sign in
            </button>
            <button
              type="button"
              className={`flex-1 rounded-md py-1.5 transition ${
                flow === 'signUp' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-800'
              }`}
              onClick={() => setFlow('signUp')}
            >
              Create account
            </button>
          </div>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
          {isSignUp ? (
            <div>
              <label className="field-label" htmlFor="staff-name">
                Full name
              </label>
              <input
                id="staff-name"
                className="field-input"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          ) : null}

          <div>
            <label className="field-label" htmlFor="staff-email">
              Email hoặc tên đăng nhập
            </label>
            <input
              id="staff-email"
              className="field-input"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="staff-password">
              Mật khẩu
            </label>
            <div className="relative"><input
              id="staff-password"
              className="field-input"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            /><button type="button" aria-label={showPassword?'Ẩn mật khẩu':'Hiện mật khẩu'} className="absolute right-3 top-2.5 text-stone-500" onClick={()=>setShowPassword((value)=>!value)}>{showPassword?<EyeOff className="h-4 w-4"/>:<Eye className="h-4 w-4"/>}</button></div>
          </div>

          {error ? <ErrorMessage message={error} /> : null}

          <button type="submit" className="btn-primary w-full justify-center" disabled={submitting}>
            {isSignUp ? (
              <>
                <UserPlus className="h-4 w-4" aria-hidden="true" />
                {submitting ? 'Creating account…' : 'Create account'}
              </>
            ) : (
              <>
                <LogIn className="h-4 w-4" aria-hidden="true" />
                {submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
              </>
            )}
          </button>
        </form>

        {isSignUp || hasOAuth ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            New account? An owner must grant you staff access before the admin area unlocks — this
            applies to social sign-ins too. Signing in with GitHub, Google, or Microsoft creates an
            account but grants no access on its own.
          </p>
        ) : null}
      </div>
    </div>
  );
}
