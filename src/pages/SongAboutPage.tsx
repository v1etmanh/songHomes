import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Compass, HeartHandshake, Phone, Search } from 'lucide-react';
import { SONG_LINKS } from '../lib/songLinks';
import { todayIso } from '../lib/dates';

export function SongAboutPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState({ checkIn: '', checkOut: '', guests: 2 });
  function check(event: FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams({ guests: String(search.guests) });
    if (search.checkIn && search.checkOut && search.checkOut > search.checkIn) {
      params.set('checkIn', search.checkIn);
      params.set('checkOut', search.checkOut);
    }
    navigate(`/p/song-homestay/stays?${params.toString()}`);
  }
  const field = 'h-12 w-full rounded-xl border border-white/20 bg-white/10 px-4 text-white outline-none transition [color-scheme:dark] placeholder:text-white/50 focus:border-white focus:bg-white/15';

  return (
    <div className="-mx-4 -my-8 bg-[#f4fafc] sm:-mx-6 lg:-mx-8">
      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1fr_1.05fr]">
          <figure className="relative">
            <img src="/song-homestay/stays/rooftop-house/05-bedroom-desk.webp" alt="Phòng ngủ sáng sủa với bàn làm việc cạnh cửa sổ lớn nhìn ra cây xanh" className="aspect-[4/3.4] w-full rounded-[2rem] object-cover shadow-[0_30px_70px_rgba(8,47,85,0.18)]" />
            <figcaption className="absolute -bottom-8 left-5 right-5 rounded-2xl bg-white p-5 shadow-xl sm:left-8 sm:right-auto sm:max-w-sm">
              <p className="font-accent text-xl leading-snug text-[#0b2e4f]">“Chữa lành từ không gian - chạm trong từng khoảnh khắc”</p>
              <p className="mt-2 text-sm text-slate-500">- Nguyễn Phát, Người sáng lập Sóng Homestay</p>
            </figcaption>
          </figure>
          <div className="pt-8 lg:pt-0">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#1565a8]">Câu chuyện của chúng tôi</p>
            <h1 className="mt-3 font-accent text-5xl leading-tight text-[#0b2e4f]">Ở lại. Chữa lành. Kết nối.</h1>
            <span className="mt-6 block h-px w-16 bg-[#1565a8]/40" aria-hidden="true" />
            <p className="mt-6 text-lg leading-8 text-slate-600">
              Trong tiếng Việt, “Sóng” là những con sóng biển. Các ngôi nhà của chúng tôi đều nằm trong quãng đi bộ ra biển Mỹ Khê. Ngày bắt đầu bằng một lần tắm biển sớm và khép lại trên một sân thượng yên tĩnh. Mỗi ngôi nhà là của riêng bạn: căn bếp của bạn, không gian của bạn, nhịp sống của bạn.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <article className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-[#0b2e4f]/5">
                <HeartHandshake className="h-6 w-6 text-[#1565a8]" aria-hidden="true" />
                <h2 className="mt-3 font-bold text-[#0b2e4f]">Sứ mệnh của chúng tôi</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">Mang đến cho mỗi vị khách một ngôi nhà để nghỉ ngơi, một khu phố để khám phá và một người chủ nhà chỉ cách một tin nhắn.</p>
              </article>
              <article className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-[#0b2e4f]/5">
                <Compass className="h-6 w-6 text-[#1565a8]" aria-hidden="true" />
                <h2 className="mt-3 font-bold text-[#0b2e4f]">Tầm nhìn</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">Một vài ngôi nhà nhỏ ở Đà Nẵng, nơi khách đến để Ở lại (STAY), Chữa lành (HEAL) và Kết nối (CONNECT): với nơi chốn, với nhau và với khu phố quanh mình.</p>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#0b2e4f] px-4 py-20 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="font-accent text-4xl leading-tight sm:text-5xl">Sẵn sàng trải nghiệm Sóng chưa?</h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-white/80">Cho chúng tôi biết ngày đi và số người trong nhóm. Chúng tôi sẽ giúp bạn chọn ngôi nhà phù hợp.</p>
          <form onSubmit={check} className="mx-auto mt-10 grid max-w-3xl gap-3 text-left sm:grid-cols-3">
            <label className="text-sm font-semibold text-white/80">Ngày nhận phòng<input type="date" min={todayIso()} value={search.checkIn} onChange={(e) => setSearch({ ...search, checkIn: e.target.value })} className={`mt-1.5 ${field}`} /></label>
            <label className="text-sm font-semibold text-white/80">Ngày trả phòng<input type="date" min={search.checkIn || todayIso()} value={search.checkOut} onChange={(e) => setSearch({ ...search, checkOut: e.target.value })} className={`mt-1.5 ${field}`} /></label>
            <label className="text-sm font-semibold text-white/80">Số khách<input type="number" min={1} max={12} value={search.guests} onChange={(e) => setSearch({ ...search, guests: Math.max(1, Math.min(12, Number(e.target.value) || 1)) })} className={`mt-1.5 ${field}`} /></label>
            <div className="mt-4 flex flex-wrap justify-center gap-3 sm:col-span-3">
              <button type="submit" className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 font-bold text-[#087795] transition hover:-translate-y-0.5"><Search className="h-4 w-4" aria-hidden="true" /> Kiểm tra phòng trống</button>
              <a href={SONG_LINKS.phoneHref} className="inline-flex items-center gap-2 rounded-full border border-white/40 px-7 py-3.5 font-bold text-white transition hover:bg-white/10"><Phone className="h-4 w-4" aria-hidden="true" /> Gọi ngay</a>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
