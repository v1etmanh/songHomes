import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation } from 'convex/react';
import { Link } from 'react-router-dom';
import {
  Bike,
  CarFront,
  Check,
  ClipboardList,
  Landmark,
  MessageCircle,
  Mountain,
  Plus,
  Sailboat,
  Sparkles,
  Trash2,
  Waves,
  X,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../../convex/_generated/api';
import { extractErrorMessage } from '../components/ErrorMessage';
import { chatWithSong } from '../lib/songLinks';

const vnd = (amount: number) => `${amount.toLocaleString('vi-VN')}đ`;

const BIKE_PRICE = 150_000;
const BIKE_MODELS = ['Honda Vision', 'Honda Air Blade', 'Honda Lead 125'];
const CARS = [
  { id: '7', label: 'Xe 7 chỗ', price: 150_000 },
  { id: '16', label: 'Xe 16 chỗ', price: 300_000 },
] as const;
const TRIPS = [
  { id: 'pickup', label: 'Chỉ đón sân bay (1 lượt)', pickups: 1, dropoffs: 0 },
  { id: 'dropoff', label: 'Chỉ tiễn ra sân bay (1 lượt)', pickups: 0, dropoffs: 1 },
  { id: 'round', label: 'Khứ hồi (Đón + Tiễn)', pickups: 1, dropoffs: 1 },
] as const;

/** Tours are arranged over chat: dates, group size and pickup vary too much for a fixed price. */
const TOURS: Array<{ name: string; tag: string; text: string; icon: LucideIcon; tone: string; image?: string }> = [
  { name: 'Bà Nà Hills – Đường lên tiên cảnh', tag: '1 ngày • Đón tận nơi', icon: Mountain, tone: 'from-[#0b2e4f] to-[#1565a8]',
    text: 'Trải nghiệm tuyến cáp treo kỷ lục thế giới, check-in Cầu Vàng biểu tượng, dạo bước Làng Pháp và vui chơi tại Fantasy Park. Hỗ trợ đặt vé lẻ hoặc combo xe đưa đón + buffet trưa.' },
  { name: 'Đảo Cù Lao Chàm – Thiên đường biển xanh', tag: '07:30 – 15:00 • Cano cao tốc', icon: Sailboat, tone: 'from-[#087795] to-[#3bb3cf]',
    text: 'Đi cano cao tốc ra đảo, lặn ngắm san hô tự nhiên, tham quan giếng cổ Chăm, chùa Hải Tạng và thưởng thức hải sản tươi sống ngay tại làng chài.' },
  { name: 'Bán đảo Sơn Trà – Viên ngọc quý giữa lòng Đà Nẵng', tag: 'Nửa ngày • Sáng hoặc chiều', icon: Landmark, tone: 'from-[#1565a8] to-[#4a9ee0]',
    text: 'Viếng chùa Linh Ứng Bãi Bụt, săn hoàng hôn tại đỉnh Bàn Cờ, khám phá cây đa ngàn năm và ngắm voọc chà vá chân nâu quý hiếm.' },
  { name: 'Show Ký Ức Hội An & Phố cổ về đêm', tag: '15:30 – 21:30 • Buổi tối', icon: Sparkles, tone: 'from-[#082c4f] to-[#087795]',
    text: 'Thả đèn hoa đăng trên sông Hoài, dạo phố cổ đèn lồng lung linh và thưởng thức màn trình diễn nghệ thuật thực cảnh ngoài trời quy mô lớn nhất Việt Nam.' },
];

type Selection = { id: string; title: string; detail: string; estimate: number };

const STORAGE_KEY = 'song-selected-services';

function loadSelections(): Selection[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Selection[]) : [];
  } catch {
    return [];
  }
}

function Modal({ title, subtitle, icon: Icon, onClose, children }: { title: string; subtitle: string; icon: LucideIcon; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} onCancel={onClose} aria-labelledby="service-modal-title" className="w-[min(94vw,34rem)] overflow-hidden rounded-3xl p-0 shadow-2xl backdrop:bg-[#082c4f]/60">
      <div className="flex items-start gap-3 bg-[#eef4fa] px-6 py-5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white text-[#1565a8]"><Icon className="h-5 w-5" aria-hidden="true" /></span>
        <div className="flex-1">
          <h2 id="service-modal-title" className="font-accent text-2xl text-[#0b2e4f]">{title}</h2>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Đóng" className="rounded-full p-1 text-slate-500 hover:bg-white"><X className="h-5 w-5" /></button>
      </div>
      <div className="px-6 py-5">{children}</div>
    </dialog>
  );
}

function ModalActions({ onClose }: { onClose: () => void }) {
  return (
    <div className="mt-6 flex justify-end gap-2">
      <button type="button" className="btn-secondary" onClick={onClose}>Hủy</button>
      <button type="submit" className="btn-primary"><Check className="h-4 w-4" aria-hidden="true" /> Thêm vào danh sách</button>
    </div>
  );
}

const label = 'mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500';

function BikeModal({ onClose, onAdd }: { onClose: () => void; onAdd: (selection: Selection) => void }) {
  const [model, setModel] = useState(BIKE_MODELS[0]);
  const [bikes, setBikes] = useState(1);
  const [days, setDays] = useState(2);
  const [pickup, setPickup] = useState('08:30 sáng ngày nhận phòng');
  const estimate = BIKE_PRICE * bikes * days;
  function submit(event: FormEvent) {
    event.preventDefault();
    onAdd({ id: `bike-${Date.now()}`, title: 'Thuê xe máy', detail: `${model} · ${bikes} xe × ${days} ngày · nhận xe ${pickup}`, estimate });
  }
  return (
    <Modal title="Chọn dịch vụ Thuê xe máy" subtitle="Giao xe tận homestay • Kèm 2 mũ bảo hiểm & áo mưa" icon={Bike} onClose={onClose}>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className={label}>Chọn dòng xe tay ga (đồng giá {vnd(BIKE_PRICE)} / ngày)</span>
          <select className="field-input" value={model} onChange={(e) => setModel(e.target.value)}>
            {BIKE_MODELS.map((m) => <option key={m} value={m}>{m} (Xe tay ga — {vnd(BIKE_PRICE)} / ngày)</option>)}
          </select>
        </label>
        <label><span className={label}>Số lượng xe</span><input className="field-input" type="number" min={1} max={10} value={bikes} onChange={(e) => setBikes(Math.max(1, Math.min(10, Number(e.target.value) || 1)))} /></label>
        <label><span className={label}>Số ngày thuê</span><input className="field-input" type="number" min={1} max={60} value={days} onChange={(e) => setDays(Math.max(1, Math.min(60, Number(e.target.value) || 1)))} /></label>
        <label className="sm:col-span-2"><span className={label}>Thời gian nhận xe dự kiến</span><input className="field-input" value={pickup} onChange={(e) => setPickup(e.target.value)} maxLength={80} /></label>
        <div className="flex items-center justify-between rounded-2xl bg-[#eef4fa] px-5 py-4 sm:col-span-2">
          <div><p className="font-semibold text-[#0b2e4f]">Tạm tính chi phí thuê xe</p><p className="text-xs text-slate-500">Đồng giá {vnd(BIKE_PRICE)} × số xe × số ngày</p></div>
          <p className="text-2xl font-bold text-[#087795]">{vnd(estimate)}</p>
        </div>
        <div className="sm:col-span-2"><ModalActions onClose={onClose} /></div>
      </form>
    </Modal>
  );
}

function AirportModal({ onClose, onAdd }: { onClose: () => void; onAdd: (selection: Selection) => void }) {
  const [longStay, setLongStay] = useState(true);
  const [car, setCar] = useState<(typeof CARS)[number]['id']>('7');
  const [trip, setTrip] = useState<(typeof TRIPS)[number]['id']>('round');
  const [when, setWhen] = useState('');
  const carInfo = CARS.find((c) => c.id === car)!;
  const tripInfo = TRIPS.find((t) => t.id === trip)!;
  const paidPickups = longStay ? 0 : tripInfo.pickups;
  const estimate = carInfo.price * (paidPickups + tripInfo.dropoffs);
  const note = [
    tripInfo.pickups ? (longStay ? 'Miễn phí chiều đón (từ 3 đêm)' : `1 lượt đón (${vnd(carInfo.price)})`) : null,
    tripInfo.dropoffs ? `1 lượt tiễn (${vnd(carInfo.price)})` : null,
  ].filter(Boolean).join(' + ');
  function submit(event: FormEvent) {
    event.preventDefault();
    onAdd({ id: `airport-${Date.now()}`, title: 'Đưa đón sân bay', detail: `${carInfo.label} · ${tripInfo.label}${when ? ` · ${when}` : ''}${longStay ? ' · booking từ 3 đêm' : ''}`, estimate });
  }
  return (
    <Modal title="Chọn dịch vụ Đưa đón sân bay" subtitle="Sân bay Quốc tế Đà Nẵng ↔ Sóng Homestay" icon={CarFront} onClose={onClose}>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <label className="flex items-start gap-3 rounded-2xl border border-[#1565a8]/20 bg-[#eef4fa] p-4 sm:col-span-2">
          <input type="checkbox" className="mt-1 h-4 w-4 accent-[#1565a8]" checked={longStay} onChange={(e) => setLongStay(e.target.checked)} />
          <span><span className="block font-semibold text-[#0b2e4f]">Tôi đặt phòng từ 3 đêm trở lên (Miễn phí chiều đón sân bay)</span><span className="text-sm text-slate-500">Áp dụng 0đ cho lượt đón từ sân bay Đà Nẵng về homestay.</span></span>
        </label>
        <label><span className={label}>Loại xe riêng</span>
          <select className="field-input" value={car} onChange={(e) => setCar(e.target.value as typeof car)}>
            {CARS.map((c) => <option key={c.id} value={c.id}>{c.label} ({vnd(c.price)} / lượt)</option>)}
          </select>
        </label>
        <label><span className={label}>Hành trình</span>
          <select className="field-input" value={trip} onChange={(e) => setTrip(e.target.value as typeof trip)}>
            {TRIPS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
        <label className="sm:col-span-2"><span className={label}>Giờ hạ cánh / khởi hành</span><input className="field-input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></label>
        <div className="flex items-center justify-between gap-4 rounded-2xl bg-[#eef4fa] px-5 py-4 sm:col-span-2">
          <div><p className="font-semibold text-[#0b2e4f]">Chi phí đưa đón</p><p className="text-xs text-[#087795]">{note}</p></div>
          <p className="text-2xl font-bold text-[#087795]">{vnd(estimate)}</p>
        </div>
        <div className="sm:col-span-2"><ModalActions onClose={onClose} /></div>
      </form>
    </Modal>
  );
}

function RequestPanel({ selections, onRemove, onSent }: { selections: Selection[]; onRemove: (id: string) => void; onSent: () => void }) {
  const submitContact = useMutation(api.contacts.submit);
  const [form, setForm] = useState({ name: '', phone: '', email: '', dates: '' });
  const [state, setState] = useState<'idle' | 'working' | 'sent'>('idle');
  const [error, setError] = useState('');
  const total = selections.reduce((sum, s) => sum + s.estimate, 0);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setState('working');
    setError('');
    const lines = selections.map((s, i) => `${i + 1}. ${s.title}: ${s.detail} — tạm tính ${vnd(s.estimate)}`);
    try {
      await submitContact({
        propertySlug: 'song-homestay',
        name: form.name,
        phone: form.phone,
        email: form.email,
        message: ['Yêu cầu dịch vụ từ trang Khám phá Đà Nẵng', form.dates ? `Thời gian lưu trú: ${form.dates}` : '', ...lines, `Tổng tạm tính: ${vnd(total)}`].filter(Boolean).join('\n'),
      });
      setState('sent');
      onSent();
    } catch (err) {
      setError(extractErrorMessage(err));
      setState('idle');
    }
  }
  if (state === 'sent') {
    return <div id="selected-services" className="rounded-3xl bg-white p-6 text-center shadow-lg"><Check className="mx-auto h-8 w-8 text-[#087795]" /><p className="mt-2 font-semibold text-[#0b2e4f]">Sóng đã nhận yêu cầu và sẽ liên hệ xác nhận sớm nhất.</p></div>;
  }
  if (!selections.length) return null;
  return (
    <section id="selected-services" className="scroll-mt-28 rounded-3xl bg-white p-6 shadow-lg shadow-sky-950/5 sm:p-8">
      <h2 className="flex items-center gap-2 text-xl font-bold text-[#0b2e4f]"><ClipboardList className="h-5 w-5 text-[#1565a8]" /> Dịch vụ đã chọn</h2>
      <ul className="mt-4 divide-y divide-slate-100">
        {selections.map((s) => (
          <li key={s.id} className="flex items-start justify-between gap-4 py-3">
            <div><p className="font-semibold text-[#0b2e4f]">{s.title}</p><p className="text-sm text-slate-500">{s.detail}</p></div>
            <div className="flex items-center gap-3"><span className="font-bold text-[#087795]">{vnd(s.estimate)}</span><button type="button" onClick={() => onRemove(s.id)} aria-label={`Bỏ ${s.title}`} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></div>
          </li>
        ))}
      </ul>
      <p className="mt-2 flex justify-between border-t border-slate-200 pt-3 font-bold text-[#0b2e4f]"><span>Tổng tạm tính</span><span>{vnd(total)}</span></p>
      <form onSubmit={submit} className="mt-6 grid gap-3 sm:grid-cols-2">
        <label><span className="field-label">Họ và tên</span><input className="field-input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label><span className="field-label">Số điện thoại</span><input className="field-input" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
        <label><span className="field-label">Email</span><input className="field-input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label><span className="field-label">Thời gian lưu trú (nếu có)</span><input className="field-input" placeholder="VD: 20/11 – 24/11" value={form.dates} onChange={(e) => setForm({ ...form, dates: e.target.value })} /></label>
        {error ? <p role="alert" className="text-sm text-red-700 sm:col-span-2">{error}</p> : null}
        <p className="text-xs text-slate-500 sm:col-span-2">Đây là yêu cầu, chưa phải thanh toán. Sóng xác nhận lịch và chi phí trước khi phục vụ.</p>
        <button className="btn-primary sm:col-span-2" disabled={state === 'working'}>{state === 'working' ? 'Đang gửi…' : 'Gửi yêu cầu cho Sóng'}</button>
      </form>
    </section>
  );
}

function ServiceCard({ icon: Icon, badge, title, priceHint, price, children, footer, onChoose }: { icon: LucideIcon; badge: string; title: string; priceHint: string; price: ReactNode; children: ReactNode; footer: string; onChoose: () => void }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-[1.75rem] bg-white shadow-[0_14px_40px_rgba(8,47,85,0.09)]">
      <div className="relative grid h-48 place-items-center bg-gradient-to-br from-[#0b2e4f] via-[#1565a8] to-[#4a9ee0]">
        <Icon className="h-20 w-20 text-white/90" strokeWidth={1.25} aria-hidden="true" />
        <span className="absolute left-4 top-4 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-[#0b2e4f] shadow-sm">{badge}</span>
      </div>
      <div className="flex flex-1 flex-col p-6">
        <div className="flex items-start justify-between gap-4">
          <h3 className="font-accent text-2xl text-[#0b2e4f]">{title}</h3>
          <div className="text-right"><p className="text-xs text-slate-500">{priceHint}</p>{price}</div>
        </div>
        <div className="mt-3 flex-1 text-sm leading-6 text-slate-600">{children}</div>
        <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-100 pt-5">
          <p className="text-xs font-semibold text-[#087795]">{footer}</p>
          <button type="button" onClick={onChoose} className="btn-primary"><Plus className="h-4 w-4" aria-hidden="true" /> Chọn dịch vụ</button>
        </div>
      </div>
    </article>
  );
}

export function SongExperiencesPage() {
  const [selections, setSelections] = useState<Selection[]>(loadSelections);
  const [modal, setModal] = useState<'bike' | 'airport' | null>(null);
  const [toast, setToast] = useState('');
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selections));
    } catch {
      // Selections still work for this visit.
    }
  }, [selections]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  function add(selection: Selection) {
    setSelections((current) => [...current, selection]);
    setModal(null);
    setToast(`Đã thêm ${selection.title} vào danh sách dịch vụ.`);
  }
  function chat(message: string) {
    chatWithSong(message);
    setToast('Đã sao chép lời nhắn — dán vào Zalo để Sóng tư vấn nhanh nhất.');
  }

  return (
    <div className="-mx-4 -my-8 bg-[#f4fafc] px-4 py-14 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-16">
        <header className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#1565a8]">Trải nghiệm tại Sóng</p>
            <h1 className="mt-3 text-4xl font-bold leading-tight text-[#0b2e4f] sm:text-5xl">Đà Nẵng theo <span className="font-accent font-normal italic">nhịp sống của bạn</span></h1>
            <p className="mt-5 text-lg leading-8 text-slate-600">Tắm biển buổi sớm, thư giãn trong sân vườn, tổ chức BBQ trên sân thượng và khám phá thành phố như một người địa phương.</p>
          </div>
          <a href="#selected-services" className="btn-secondary"><ClipboardList className="h-4 w-4" /> Dịch vụ đã chọn <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#1565a8] px-1.5 text-xs text-white">{selections.length}</span></a>
        </header>

        <section aria-labelledby="transport-title">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="transport-title" className="text-2xl font-bold text-[#0b2e4f] sm:text-3xl">Chủ động hành trình từ lúc hạ cánh</h2>
            <p className="text-sm text-slate-500">Chọn dịch vụ trực tiếp · Xác nhận nhanh cùng lễ tân Sóng</p>
          </div>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <ServiceCard icon={Bike} badge="Giao xe tận cửa homestay" title="Thuê xe máy" priceHint="Đồng giá xe tay ga" price={<p className="text-xl font-bold text-[#087795]">{vnd(BIKE_PRICE)} <span className="text-xs font-medium text-slate-500">/ ngày</span></p>} footer="Tiếp nhận yêu cầu · Xác nhận thủ công" onChoose={() => setModal('bike')}>
              <p>Xe tay ga giao tận nơi, kèm <strong>2 mũ bảo hiểm và áo mưa</strong>, giúp bạn tự do vi vu bán đảo Sơn Trà, biển Mỹ Khê và khám phá ẩm thực địa phương.</p>
              <p className="mt-4 flex items-center justify-between rounded-xl bg-[#eef4fa] px-4 py-3"><span><span className="block font-semibold text-[#0b2e4f]">Honda Vision • Air Blade • Lead 125</span><span className="text-xs text-slate-500">Tất cả dòng xe tay ga đều áp dụng chung một mức giá</span></span><span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#1565a8]">{vnd(BIKE_PRICE)}/ngày</span></p>
            </ServiceCard>
            <ServiceCard icon={CarFront} badge="MIỄN PHÍ đón sân bay cho booking từ 3 đêm" title="Đưa đón sân bay" priceHint="Ưu đãi từ 3 đêm" price={<p className="text-xl font-bold text-[#087795]">0đ <span className="text-xs font-medium text-slate-500">chiều đón</span></p>} footer="Miễn phí chiều đón khi ở từ 3 đêm" onChoose={() => setModal('airport')}>
              <p>Tài xế đón đúng giờ tại sảnh sân bay Đà Nẵng (cách Sóng chỉ ~10–15 phút di chuyển), đưa bạn về tận cửa homestay an toàn, không lo chờ đợi.</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {CARS.map((c) => <p key={c.id} className="rounded-xl bg-[#eef4fa] px-4 py-3"><span className="block font-semibold text-[#0b2e4f]">{c.label}</span><span className="text-sm font-bold text-[#1565a8]">{vnd(c.price)} / lượt</span></p>)}
              </div>
              <p className="mt-2 text-xs text-slate-500">Bảng giá cho khách dưới 3 đêm hoặc chiều tiễn.</p>
            </ServiceCard>
          </div>
        </section>

        <RequestPanel selections={selections} onRemove={(id) => setSelections((current) => current.filter((s) => s.id !== id))} onSent={() => setSelections([])} />

        <section aria-labelledby="tours-title">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#1565a8]">Gợi ý hành trình bản địa</p>
          <h2 id="tours-title" className="mt-3 text-3xl font-bold text-[#0b2e4f] sm:text-4xl">Gợi ý hành trình <span className="font-accent font-normal italic">khám phá địa phương</span></h2>
          <p className="mt-3 max-w-2xl text-slate-600">Tour ghép hoặc tour riêng linh hoạt theo nhóm khách. Nhấn <strong>“Chat với Sóng”</strong> để được tư vấn khung giờ đẹp và báo giá ưu đãi nhất — hoàn toàn miễn phí.</p>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {TOURS.map((tour) => (
              <article key={tour.name} className="flex flex-col overflow-hidden rounded-[1.5rem] bg-white shadow-[0_10px_30px_rgba(8,47,85,0.08)]">
                <div className={`relative grid h-40 place-items-center bg-gradient-to-br ${tour.tone}`}>
                  {tour.image ? <img src={tour.image} alt={tour.name} className="absolute inset-0 h-full w-full object-cover" loading="lazy" /> : <tour.icon className="h-14 w-14 text-white/90" strokeWidth={1.25} aria-hidden="true" />}
                  <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-[#0b2e4f]">{tour.tag}</span>
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <h3 className="font-bold leading-snug text-[#0b2e4f]">{tour.name}</h3>
                  <p className="mt-2 line-clamp-4 flex-1 text-sm leading-6 text-slate-600">{tour.text}</p>
                  <button type="button" onClick={() => chat(`Chào Sóng, mình muốn tư vấn tour ${tour.name}...`)} className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl border border-[#1565a8]/20 bg-[#eef4fa] px-4 py-2.5 text-sm font-bold text-[#1565a8] transition hover:bg-[#1565a8] hover:text-white"><MessageCircle className="h-4 w-4" aria-hidden="true" /> Chat với Sóng</button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="overflow-hidden rounded-[2rem] bg-gradient-to-r from-[#0b2e4f] to-[#1565a8] px-7 py-12 text-white shadow-xl sm:px-12">
          <Waves className="h-10 w-10 text-sky-200" aria-hidden="true" />
          <h2 className="mt-4 text-3xl font-bold sm:text-4xl">Feel at home — <span className="font-accent font-normal italic">Live like a local</span></h2>
          <p className="mt-3 max-w-2xl text-white/80">Đặt phòng từ 3 đêm để được miễn phí đón sân bay, hoặc nhắn Sóng để thiết kế lịch trình riêng cho gia đình và nhóm bạn.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/p/song-homestay/stays" className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-bold text-[#0b2e4f] transition hover:-translate-y-0.5">Chọn chỗ nghỉ ngay</Link>
            <button type="button" onClick={() => chat('Chào Sóng, mình muốn tư vấn lịch trình riêng...')} className="inline-flex items-center gap-2 rounded-full border border-white/40 px-6 py-3 font-bold text-white transition hover:bg-white/10"><MessageCircle className="h-4 w-4" aria-hidden="true" /> Chat tư vấn lịch trình riêng</button>
          </div>
        </section>
      </div>

      {modal === 'bike' ? <BikeModal onClose={() => setModal(null)} onAdd={add} /> : null}
      {modal === 'airport' ? <AirportModal onClose={() => setModal(null)} onAdd={add} /> : null}
      {toast ? <p role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-[#0b2e4f] px-5 py-3 text-sm font-semibold text-white shadow-xl">{toast}</p> : null}
    </div>
  );
}
