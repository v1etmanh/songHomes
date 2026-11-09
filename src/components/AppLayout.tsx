import { useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Mail, MapPin, Mountain, Phone, Waves } from 'lucide-react';
import { PUBLIC_SHOWCASE } from '../lib/publicShowcase';

/** Shared chrome (header/footer) for every route, rendered via <Outlet />. */
export function AppLayout() {
  const location = useLocation();
  const isSongLanding = location.pathname === '/p/song-homestay';
  const isSongPublic = location.pathname.startsWith('/p/song-homestay');
  const isAdmin = location.pathname.startsWith('/admin');

  useEffect(() => {
    if (!isSongLanding || !location.hash) return;
    requestAnimationFrame(() => document.querySelector(location.hash)?.scrollIntoView({ behavior: 'smooth' }));
  }, [isSongLanding, location.hash]);

  if (!PUBLIC_SHOWCASE.enabled) {
    if (isAdmin) {
      return (
        <div className="min-h-screen bg-[#f1f7ff]">
          <a href="#main-content" className="skip-link">Skip to main content</a>
          <main id="main-content" tabIndex={-1} className="min-h-screen w-full">
            <Outlet />
          </main>
        </div>
      );
    }
    return (
      <div className="flex min-h-screen flex-col bg-[#f4fafc]">
        <a href="#main-content" className="skip-link">Skip to main content</a>
        <header className="sticky top-0 z-50 border-b border-sky-950/5 bg-[#f6fbfd]/95 shadow-[0_4px_24px_rgba(7,59,89,0.05)] backdrop-blur">
          <div className="mx-auto flex h-[82px] max-w-6xl items-center justify-between gap-5 px-5 sm:px-8">
            <Link to="/p/song-homestay" className="flex shrink-0 items-center gap-3 text-[#073b59]">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-[#0784aa] to-[#32b8bd] text-white shadow-lg shadow-cyan-900/15">
                <Waves className="h-6 w-6" strokeWidth={2.25} aria-hidden="true" />
              </span>
              <span className="font-sans text-lg font-extrabold tracking-tight sm:text-xl">Sóng Homestay</span>
            </Link>
            <nav aria-label="Điều hướng chính" className="hidden items-center gap-1 text-sm font-semibold text-slate-600 md:flex">
              <Link to="/p/song-homestay" className={`rounded-full px-4 py-2.5 transition hover:bg-cyan-50 hover:text-[#087795] ${isSongLanding && !location.hash ? 'bg-[#dff6fb] text-[#087795]' : ''}`}>Trang chủ</Link>
              <Link to="/p/song-homestay/stays" className="rounded-full px-3 py-2.5 transition hover:bg-cyan-50 hover:text-[#087795]">Chỗ nghỉ</Link>
              <Link to="/p/song-homestay/experiences" className="rounded-full px-3 py-2.5 transition hover:bg-cyan-50 hover:text-[#087795]">Trải nghiệm</Link>
              <Link to="/p/song-homestay/about" className="rounded-full px-3 py-2.5 transition hover:bg-cyan-50 hover:text-[#087795]">Giới thiệu</Link>
              <Link to="/p/song-homestay/contact" className="rounded-full px-3 py-2.5 transition hover:bg-cyan-50 hover:text-[#087795]">Liên hệ</Link>
            </nav>
            <div className="flex items-center gap-2"><Link to="/p/song-homestay/booking" className="rounded-full bg-[#087795] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#065f78]">Đặt phòng</Link>{PUBLIC_SHOWCASE.allowStaffRoutes ? <Link to="/admin" className="hidden rounded-full border border-[#0b7e9f]/25 px-4 py-2.5 text-sm font-bold text-[#087795] transition hover:border-[#0b7e9f] hover:bg-[#087795] hover:text-white sm:inline">Quản trị</Link> : null}</div>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className={isSongPublic ? (isSongLanding ? 'w-full flex-1' : 'mx-auto w-full max-w-6xl flex-1 px-4 py-8') : 'mx-auto w-full max-w-5xl flex-1 px-4 py-8'}>
          <Outlet />
        </main>
        <footer className="bg-[#05344d] px-5 py-14 text-sm text-white/70 sm:px-8">
          <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-[1.2fr_.8fr_.8fr]">
            <div>
              <Link to="/p/song-homestay" className="flex items-center gap-3 text-white">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-white/10"><Waves className="h-5 w-5" /></span>
                <span className="font-sans text-xl font-extrabold">Sóng Homestay</span>
              </Link>
              <p className="mt-4 max-w-sm leading-7">Không gian nghỉ dưỡng gần biển Mỹ Khê, nơi bạn chạm vào nhịp sống dịu dàng của Đà Nẵng.</p>
            </div>
            <div>
              <h2 className="font-sans font-bold text-white">Liên hệ</h2>
              <div className="mt-4 space-y-3">
                <p className="flex gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" /> Đà Nẵng, Việt Nam</p>
                <p className="flex gap-2"><Phone className="h-4 w-4 shrink-0 text-cyan-300" /> 0911.388.703</p>
                <p className="flex gap-2"><Mail className="h-4 w-4 shrink-0 text-cyan-300" /> Songhomestay@gmail.com</p>
              </div>
            </div>
            <div>
              <h2 className="font-sans font-bold text-white">Giờ nhận / trả phòng</h2>
              <p className="mt-4">Nhận phòng: từ 14:00</p>
              <p className="mt-2">Trả phòng: trước 12:00</p>
              <p className="mt-6 text-xs text-white/45">© 2026 Sóng Homestay · Powered by OpenStays</p>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <div className="bg-amber-100 px-4 py-2 text-center text-xs font-semibold text-amber-950">
        Public showcase · fictional data · signet test sats
      </div>
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2 text-stone-900">
            <Mountain className="h-6 w-6 text-emerald-700" strokeWidth={2} aria-hidden="true" />
            <span className="font-display text-lg font-semibold">OpenStays</span>
            <span className="hidden rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-800 sm:inline">Consensus Commons</span>
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link to="/tour/operations" className="rounded-full bg-emerald-700 px-3 py-2 font-semibold text-white hover:bg-emerald-800">Explore the backend</Link>
            {PUBLIC_SHOWCASE.allowStaffRoutes ? <Link to="/admin/login" className="hidden text-xs text-stone-500 hover:text-stone-800 sm:inline">Staff sign in</Link> : <Link to="/" className="text-sm font-medium text-emerald-700 hover:text-emerald-800">How it works</Link>}
          </nav>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-5xl flex-1 px-4 py-8"><Outlet /></main>
      <footer className="border-t border-stone-200 py-6 text-center text-xs text-stone-400">
        <p>Powered by <span className="font-semibold text-stone-500">OpenStays</span> — an open-source booking engine built by <a href="https://www.sebahub.com" target="_blank" rel="noreferrer" className="font-semibold text-emerald-700 hover:text-emerald-800">SebaHub</a></p>
        <p className="mt-1.5 space-x-3"><Link to="/about" className="hover:text-stone-600">About</Link><a href="https://github.com/murdawkmedia/openstays" target="_blank" rel="noreferrer" className="hover:text-stone-600">GitHub</a><a href="https://murdawkmedia.github.io/openstays/" target="_blank" rel="noreferrer" className="hover:text-stone-600">Docs</a></p>
      </footer>
    </div>
  );
}
