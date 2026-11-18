import { Link, useLocation, useSearchParams } from 'react-router-dom';

/**
 * Owner / front-desk dashboard switch, shown in the admin top bar for owners
 * and managers. Both views are canonical URLs (convention #12):
 * /admin/dashboard and /admin/dashboard?view=desk.
 */
export function SongViewSwitch({ role }: { role: string }) {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  if (!['owner', 'manager'].includes(role)) return null;
  const onDashboard = pathname === '/admin' || pathname === '/admin/' || pathname.startsWith('/admin/dashboard');
  const desk = onDashboard && params.get('view') === 'desk';
  const item = (active: boolean) => `whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold transition ${active ? 'bg-[#0b2e4f] text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`;
  return (
    <nav aria-label="Góc nhìn dashboard" className="flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
      <Link to="/admin/dashboard" aria-current={onDashboard && !desk ? 'page' : undefined} className={item(onDashboard && !desk)}>Chủ nhà</Link>
      <Link to="/admin/dashboard?view=desk" aria-current={desk ? 'page' : undefined} className={item(desk)}>Lễ tân</Link>
    </nav>
  );
}
