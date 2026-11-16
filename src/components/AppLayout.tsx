import { useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Facebook, Instagram, Mail, MapPin, Mountain, Phone, Waves } from 'lucide-react';
import { SONG_LINKS } from '../lib/songLinks';
import { PUBLIC_SHOWCASE } from '../lib/publicShowcase';
import { GuestAccountMenu } from './GuestAccountMenu';

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

  // A new page always opens at its top (links from deep in the landing page used to land mid-page).
  useEffect(() => {
    if (location.hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname, location.hash]);

  const navItems = [
    { to: '/p/song-homestay', label: 'Trang chủ', active: isSongLanding && !location.hash },
    { to: '/p/song-homestay/stays', label: 'Chỗ nghỉ', active: location.pathname.startsWith('/p/song-homestay/stay') },
    { to: '/p/song-homestay/experiences', label: 'Khám phá Đà Nẵng', active: location.pathname.startsWith('/p/song-homestay/experiences') },
    { to: '/p/song-homestay/about', label: 'Về Sóng', active: location.pathname.startsWith('/p/song-homestay/about') },
    { to: '/p/song-homestay/contact', label: 'Liên hệ', active: location.pathname.startsWith('/p/song-homestay/contact') },
  ];

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
        {/* Floating pill header: overlays the landing hero, sticks above content on the other Sóng pages. */}
        <header className={`${isSongLanding ? 'fixed inset-x-0 top-0' : 'sticky top-0'} z-50 px-3 pt-3 sm:px-5 sm:pt-4`}>
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 rounded-full bg-white/90 pl-3 pr-2 shadow-[0_12px_40px_rgba(8,47,85,0.16)] ring-1 ring-[#0b2e4f]/5 backdrop-blur-md sm:pl-4">
            <Link to="/p/song-homestay" className="flex shrink-0 items-center gap-2.5 text-[#0b2e4f]">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-[#1565a8] to-[#4a9ee0] text-white shadow-md shadow-blue-900/20">
                <Waves className="h-5 w-5" strokeWidth={2.25} aria-hidden="true" />
              </span>
              <span className="hidden font-sans text-base font-extrabold tracking-tight sm:inline sm:text-lg">Sóng Homestay</span>
            </Link>
            <nav aria-label="Điều hướng chính" className="hidden items-center gap-0.5 whitespace-nowrap text-sm font-semibold text-slate-600 lg:flex">
              {navItems.map((item) => (
                <Link key={item.to} to={item.to} aria-current={item.active ? 'page' : undefined} className={`rounded-full px-3 py-2 transition hover:bg-[#e8f1fb] hover:text-[#1565a8] ${item.active ? 'bg-[#e3eefa] text-[#1565a8]' : ''}`}>{item.label}</Link>
              ))}
            </nav>
            <div className="flex items-center gap-2 whitespace-nowrap"><GuestAccountMenu /><Link to="/p/song-homestay/booking" className="whitespace-nowrap rounded-full bg-[#0b2e4f] px-4 py-2.5 text-sm font-bold text-white sm:px-5 transition hover:bg-[#1565a8]">Đặt phòng ngay</Link>{PUBLIC_SHOWCASE.allowStaffRoutes ? <Link to="/admin" className="hidden rounded-full border border-[#1565a8]/25 px-4 py-2.5 text-sm font-bold text-[#1565a8] transition hover:border-[#1565a8] hover:bg-[#1565a8] hover:text-white xl:inline">Quản trị</Link> : null}</div>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className={isSongPublic ? (isSongLanding ? 'w-full flex-1' : 'mx-auto w-full max-w-6xl flex-1 px-4 py-8') : 'mx-auto w-full max-w-5xl flex-1 px-4 py-8'}>
          <Outlet />
        </main>
        <footer className="relative bg-[#082c4f] px-5 pb-14 pt-20 text-sm text-white/70 sm:px-8">
          {/* Wave edge: the footer rises out of the page like a breaking wave. */}
          <svg aria-hidden="true" viewBox="0 0 1440 120" preserveAspectRatio="none" className="absolute inset-x-0 -top-px h-12 w-full rotate-180 text-[#f4fafc] sm:h-16">
            <path fill="currentColor" d="M0 64c120 32 240 48 360 40s240-48 360-48 240 40 360 48 240-8 360-40v56H0Z" />
            <path fill="currentColor" opacity=".45" d="M0 40c160 40 320 60 480 44s320-60 480-60 320 40 480 56v40H0Z" />
          </svg>
          <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-[1.2fr_.8fr_.8fr]">
            <div>
              <Link to="/p/song-homestay" className="flex items-center gap-3 text-white">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-white/10"><Waves className="h-5 w-5" /></span>
                <span className="font-sans text-xl font-extrabold">Sóng Homestay</span>
              </Link>
              <p className="mt-4 max-w-sm leading-7">Không gian nghỉ dưỡng gần biển Mỹ Khê, nơi bạn chạm vào nhịp sống dịu dàng của Đà Nẵng.</p>
              <div className="mt-6 flex gap-3">
                <a href={SONG_LINKS.facebook} target="_blank" rel="noopener noreferrer" aria-label="Facebook Sóng Homestay" className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white hover:text-[#082c4f]"><Facebook className="h-5 w-5" /></a>
                <a href={SONG_LINKS.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram Sóng Homestay" className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white hover:text-[#082c4f]"><Instagram className="h-5 w-5" /></a>
              </div>
            </div>
            <div>
              <h2 className="font-sans font-bold text-white">Liên hệ</h2>
              <div className="mt-4 space-y-3">
                <p className="flex gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" /> Đà Nẵng, Việt Nam</p>
                <a href={SONG_LINKS.phoneHref} className="flex gap-2 hover:text-white"><Phone className="h-4 w-4 shrink-0 text-sky-300" /> {SONG_LINKS.phone}</a>
                <a href={`mailto:${SONG_LINKS.email}`} className="flex gap-2 hover:text-white"><Mail className="h-4 w-4 shrink-0 text-sky-300" /> {SONG_LINKS.email}</a>
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
