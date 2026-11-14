import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthActions } from '@convex-dev/auth/react';
import { useConvexAuth } from 'convex/react';
import { Eye, EyeOff, LogIn, UserPlus } from 'lucide-react';
import { ErrorMessage, extractErrorMessage } from '../components/ErrorMessage';

type Flow = 'signIn' | 'signUp';

const ACCOUNT_CREATION_DISABLED = import.meta.env.VITE_PUBLIC_SHOWCASE === 'true'
  || import.meta.env.VITE_OPENSTAYS_PROFILE === 'production';

/** Only same-site paths may be used as a post-login destination. */
export function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/admin')) return '/tai-khoan/luu-tru';
  return raw;
}

function friendlyAuthError(error: unknown, flow: Flow): string {
  const raw = extractErrorMessage(error);
  if (/INVALID_EMAIL/.test(raw)) return 'Email không hợp lệ.';
  if (/Invalid password|password/i.test(raw) && flow === 'signUp') return 'Mật khẩu cần tối thiểu 8 ký tự.';
  if (/already exists/i.test(raw)) return 'Email này đã có tài khoản. Hãy chuyển sang Đăng nhập.';
  if (/InvalidSecret|InvalidAccountId|Invalid credentials/i.test(raw)) return 'Email hoặc mật khẩu không đúng.';
  if (/TooManyFailedAttempts/i.test(raw)) return 'Bạn đã thử quá nhiều lần. Vui lòng thử lại sau.';
  return flow === 'signIn' ? 'Không đăng nhập được. Kiểm tra lại email và mật khẩu.' : raw;
}

/** /dang-nhap — guest sign-in / sign-up (required before booking Sóng Homestay). */
export function GuestLoginPage() {
  const { signIn } = useAuthActions();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [flow, setFlow] = useState<Flow>(params.get('tab') === 'register' && !ACCOUNT_CREATION_DISABLED ? 'signUp' : 'signIn');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSignUp = !ACCOUNT_CREATION_DISABLED && flow === 'signUp';

  useEffect(() => {
    if (!isLoading && isAuthenticated) navigate(next, { replace: true });
  }, [isAuthenticated, isLoading, navigate, next]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (isSignUp) {
      if (name.trim().length < 2) return setError('Vui lòng nhập họ và tên.');
      if (phone.replace(/\D/g, '').length < 9) return setError('Vui lòng nhập số điện thoại hợp lệ.');
      if (password.length < 8) return setError('Mật khẩu cần tối thiểu 8 ký tự.');
      if (password !== confirm) return setError('Mật khẩu nhập lại không khớp.');
    }
    setSubmitting(true);
    try {
      await signIn('password', isSignUp
        ? { email: email.trim(), password, name: name.trim(), phone: phone.trim(), flow: 'signUp' }
        : { email: email.trim(), password, flow: 'signIn' });
      navigate(next, { replace: true });
    } catch (err) {
      setError(friendlyAuthError(err, isSignUp ? 'signUp' : 'signIn'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="card p-7">
        <h1 className="text-2xl font-extrabold text-[#073b59]">{isSignUp ? 'Tạo tài khoản' : 'Đăng nhập'}</h1>
        <p className="mt-1 text-sm text-slate-500">Tài khoản giúp bạn đặt phòng, theo dõi đơn và khai báo lưu trú.</p>
        {!ACCOUNT_CREATION_DISABLED ? (
          <div className="mt-5 grid grid-cols-2 rounded-full bg-slate-100 p-1 text-sm font-semibold" role="tablist">
            <button type="button" role="tab" aria-selected={!isSignUp} className={`rounded-full py-2 ${!isSignUp ? 'bg-white text-[#087795] shadow-sm' : 'text-slate-500'}`} onClick={() => { setFlow('signIn'); setError(null); }}>Đăng nhập</button>
            <button type="button" role="tab" aria-selected={isSignUp} className={`rounded-full py-2 ${isSignUp ? 'bg-white text-[#087795] shadow-sm' : 'text-slate-500'}`} onClick={() => { setFlow('signUp'); setError(null); }}>Đăng ký</button>
          </div>
        ) : null}
        <form className="mt-5 space-y-4" onSubmit={submit}>
          {isSignUp ? (
            <>
              <label className="block"><span className="field-label">Họ và tên</span><input className="field-input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required /></label>
              <label className="block"><span className="field-label">Số điện thoại</span><input className="field-input" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required /></label>
            </>
          ) : null}
          <label className="block"><span className="field-label">Email</span><input className="field-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label className="block">
            <span className="field-label">Mật khẩu</span>
            <span className="relative block">
              <input className="field-input pr-10" type={showPassword ? 'text' : 'password'} autoComplete={isSignUp ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={isSignUp ? 8 : undefined} />
              <button type="button" className="absolute inset-y-0 right-2 text-slate-400" aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} onClick={() => setShowPassword((v) => !v)}>
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </span>
          </label>
          {isSignUp ? <label className="block"><span className="field-label">Nhập lại mật khẩu</span><input className="field-input" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></label> : null}
          {error ? <ErrorMessage message={error} /> : null}
          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {isSignUp ? <UserPlus className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
            {submitting ? 'Đang xử lý…' : isSignUp ? 'Tạo tài khoản' : 'Đăng nhập'}
          </button>
        </form>
        <p className="mt-5 text-center text-xs text-slate-500">
          <Link className="font-semibold text-[#087795] underline" to="/p/song-homestay">Về trang chủ</Link>
        </p>
      </div>
    </div>
  );
}
