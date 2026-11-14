import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthActions } from '@convex-dev/auth/react';
import { useConvexAuth, useQuery } from 'convex/react';
import { Bell, ChevronDown, LogOut, UserRound } from 'lucide-react';
import { api } from '../../convex/_generated/api';

/** Sóng public header: sign-in link, or the guest's bell + account menu. */
export function GuestAccountMenu() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const location = useLocation();
  if (isLoading) return null;
  if (!isAuthenticated) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return (
      <Link to={`/dang-nhap?next=${next}`} className="rounded-full border border-[#0b7e9f]/25 px-4 py-2.5 text-sm font-bold text-[#087795] transition hover:border-[#0b7e9f] hover:bg-cyan-50">
        Đăng nhập
      </Link>
    );
  }
  return <SignedInMenu />;
}

function SignedInMenu() {
  const me = useQuery(api.guestAccount.me, {});
  const pending = useQuery(api.guestAccount.pendingDeclarations, {});
  const { signOut } = useAuthActions();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const count = pending?.count ?? 0;
  const bellTarget = count === 1 && pending ? `/tai-khoan/luu-tru/${pending.bookingIds[0]}` : '/tai-khoan/luu-tru';

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const firstName = (me?.name || me?.email || 'Tài khoản').split(' ').slice(-1)[0];

  return (
    <div className="flex items-center gap-1">
      <Link
        to={bellTarget}
        className="relative grid h-10 w-10 place-items-center rounded-full text-[#087795] transition hover:bg-cyan-50"
        aria-label={count ? `${count} đơn cần khai báo lưu trú` : 'Thông báo'}
        title={count ? `${count} đơn cần khai báo lưu trú` : 'Không có thông báo mới'}
      >
        <Bell className="h-5 w-5" />
        {count ? <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">{count}</span> : null}
      </Link>
      <div className="relative" ref={menuRef}>
        <button type="button" className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-[#073b59] hover:bg-cyan-50" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <UserRound className="h-4 w-4" />
          <span className="hidden max-w-24 truncate xl:inline">{firstName}</span>
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        {open ? (
          <div className="absolute right-0 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white text-sm shadow-lg">
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="font-semibold text-slate-900">{me?.name || 'Khách'}</p>
              <p className="truncate text-xs text-slate-500">{me?.email}</p>
            </div>
            <Link to="/tai-khoan/luu-tru" className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50" onClick={() => setOpen(false)}>
              Đơn đặt phòng & khai báo lưu trú
              {count ? <span className="rounded-full bg-red-500 px-2 text-xs font-bold text-white">{count}</span> : null}
            </Link>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-red-700 hover:bg-red-50"
              onClick={() => void signOut().then(() => { setOpen(false); navigate('/p/song-homestay'); })}
            >
              <LogOut className="h-4 w-4" />Đăng xuất
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
