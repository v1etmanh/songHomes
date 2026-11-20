import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Landmark, MessageCircle, Mountain, Sailboat, Sparkles, Waves, type LucideIcon } from 'lucide-react';
import { chatWithSong } from '../lib/songLinks';

const vnd = (amount: number) => `${amount.toLocaleString('vi-VN')}đ`;

const BIKE_PRICE = 150_000;
const CARS = [
  { id: '7', label: 'Xe 7 chỗ', price: 150_000 },
  { id: '16', label: 'Xe 16 chỗ', price: 300_000 },
] as const;
/** Tours are arranged over chat: dates, group size and pickup vary too much for a fixed price. */
const TOURS: Array<{ name: string; tag: string; text: string; icon: LucideIcon; tone: string; image: string; alt: string }> = [
  { name: 'Bà Nà Hills - Đường lên tiên cảnh', tag: '1 ngày • Đón tận nơi', icon: Mountain, tone: 'from-[#0b2e4f] to-[#1565a8]', image: '/song-homestay/experiences/ba-na.webp', alt: 'Cầu Vàng với đôi bàn tay khổng lồ giữa núi rừng Bà Nà Hills lúc hoàng hôn',
    text: 'Trải nghiệm tuyến cáp treo kỷ lục thế giới, check-in Cầu Vàng biểu tượng, dạo bước Làng Pháp và vui chơi tại Fantasy Park. Hỗ trợ đặt vé lẻ hoặc combo xe đưa đón + buffet trưa.' },
  { name: 'Đảo Cù Lao Chàm - Thiên đường biển xanh', tag: '07:30 - 15:00 • Cano cao tốc', icon: Sailboat, tone: 'from-[#087795] to-[#3bb3cf]', image: '/song-homestay/experiences/cu-lao-cham.webp', alt: 'Bãi biển nước trong xanh ngọc và cát trắng ở đảo Cù Lao Chàm',
    text: 'Đi cano cao tốc ra đảo, lặn ngắm san hô tự nhiên, tham quan giếng cổ Chăm, chùa Hải Tạng và thưởng thức hải sản tươi sống ngay tại làng chài.' },
  { name: 'Bán đảo Sơn Trà - Viên ngọc quý giữa lòng Đà Nẵng', tag: 'Nửa ngày • Sáng hoặc chiều', icon: Landmark, tone: 'from-[#1565a8] to-[#4a9ee0]', image: '/song-homestay/experiences/son-tra.webp', alt: 'Tượng Quan Âm chùa Linh Ứng Bãi Bụt nhìn từ trên cao, bán đảo Sơn Trà',
    text: 'Viếng chùa Linh Ứng Bãi Bụt, săn hoàng hôn tại đỉnh Bàn Cờ, khám phá cây đa ngàn năm và ngắm voọc chà vá chân nâu quý hiếm.' },
  { name: 'Show Ký Ức Hội An & Phố cổ về đêm', tag: '15:30 - 21:30 • Buổi tối', icon: Sparkles, tone: 'from-[#082c4f] to-[#087795]', image: '/song-homestay/experiences/hoi-an.webp', alt: 'Sân khấu thực cảnh Ký Ức Hội An rực rỡ ánh đèn trên mặt nước về đêm',
    text: 'Thả đèn hoa đăng trên sông Hoài, dạo phố cổ đèn lồng lung linh và thưởng thức màn trình diễn nghệ thuật thực cảnh ngoài trời quy mô lớn nhất Việt Nam.' },
];

/** Intro card only: services are chosen while booking a stay, not here. */
function ServiceCard({ media, title, children, footer }: { media: ReactNode; title: string; children: ReactNode; footer: string }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-[1.75rem] bg-white shadow-[0_14px_40px_rgba(8,47,85,0.09)]">
      <div className="relative h-56 overflow-hidden">{media}</div>
      <div className="flex flex-1 flex-col p-6">
        <h3 className="font-accent text-2xl text-[#0b2e4f]">{title}</h3>
        <div className="mt-3 flex-1 text-sm leading-6 text-slate-600">{children}</div>
        <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-100 pt-5">
          <p className="text-xs font-semibold text-[#087795]">{footer}</p>
          <Link to="/p/song-homestay/stays" className="btn-primary whitespace-nowrap">Đặt phòng kèm dịch vụ</Link>
        </div>
      </div>
    </article>
  );
}

export function SongExperiencesPage() {
  const [toast, setToast] = useState('');
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  function chat(message: string) {
    chatWithSong(message);
    setToast('Đã sao chép lời nhắn - dán vào Zalo để Sóng tư vấn nhanh nhất.');
  }

  return (
    <div className="-mx-4 -my-8 bg-[#f4fafc] px-4 py-14 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-16">
        <header className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-bold leading-tight text-[#0b2e4f] sm:text-5xl">Khám phá Đà Nẵng <span className="block font-accent font-normal">theo cách của bạn</span></h1>
            <p className="mt-5 text-lg leading-8 text-slate-600">Sẵn sàng phương tiện di chuyển tận cửa cùng loạt gợi ý tour và điểm đến hấp dẫn được thiết kế riêng cho kỳ nghỉ của bạn tại Sóng Homestay.</p>
          </div>
        </header>

        <section aria-labelledby="transport-title">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="transport-title" className="text-2xl font-bold text-[#0b2e4f] sm:text-3xl">Chủ động hành trình từ lúc hạ cánh</h2>
          </div>
          <p className="mt-3 max-w-2xl text-slate-600">Thuê xe máy và đưa đón sân bay được chọn ngay trong bước đặt phòng — chọn chỗ nghỉ, rồi thêm dịch vụ vào đơn.</p>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <ServiceCard
              title="Thuê xe máy"
              footer="Giao xe tận cửa homestay"
              media={
                <div className="relative h-full">
                  <img src="/song-homestay/experiences/motorbike.svg" alt="Xe tay ga chạy dọc đường biển Mỹ Khê, phía xa là bán đảo Sơn Trà" className="h-full w-full object-cover" loading="lazy" />
                  <div className="absolute left-0 top-0 p-6 text-white">
                    <p className="font-accent text-2xl leading-tight drop-shadow">Tự do vi vu Đà Nẵng</p>
                    <p className="mt-1 text-sm text-white/80">Sơn Trà · Biển Mỹ Khê · Phố ẩm thực</p>
                  </div>
                </div>
              }
            >
              <p>Xe tay ga giao tận nơi, kèm <strong>2 mũ bảo hiểm và áo mưa</strong>, giúp bạn tự do vi vu bán đảo Sơn Trà, biển Mỹ Khê và khám phá ẩm thực địa phương.</p>
              <p className="mt-4 flex items-center justify-between rounded-xl bg-[#eef4fa] px-4 py-3"><span><span className="block font-semibold text-[#0b2e4f]">Honda Vision • Air Blade • Lead 125</span><span className="text-xs text-slate-500">Tất cả dòng xe tay ga đều áp dụng chung một mức giá</span></span><span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[#1565a8]">{vnd(BIKE_PRICE)}/ngày</span></p>
            </ServiceCard>
            <ServiceCard
              title="Đưa đón sân bay"
              footer="Miễn phí chiều đón khi ở từ 3 đêm"
              media={<img src="/song-homestay/experiences/airport.svg" alt="Máy bay cất cánh trên sân bay Đà Nẵng, xe riêng của Sóng Homestay chờ đón khách" className="h-full w-full object-cover" loading="lazy" />}
            >
              <p>Tài xế đón đúng giờ tại sảnh sân bay Đà Nẵng (cách Sóng chỉ ~10-15 phút di chuyển), đưa bạn về tận cửa homestay an toàn, không lo chờ đợi.</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {CARS.map((c) => <p key={c.id} className="rounded-xl bg-[#eef4fa] px-4 py-3"><span className="block font-semibold text-[#0b2e4f]">{c.label}</span><span className="text-sm font-bold text-[#1565a8]">{vnd(c.price)} / lượt</span></p>)}
              </div>
            </ServiceCard>
          </div>
        </section>


        <section aria-labelledby="tours-title">
          <h2 id="tours-title" className="text-3xl font-bold text-[#0b2e4f] sm:text-4xl">Gợi ý hành trình <span className="font-accent font-normal">khám phá địa phương</span></h2>
          <p className="mt-3 max-w-2xl text-slate-600">Tour ghép hoặc tour riêng linh hoạt theo nhóm khách. Nhấn <strong>“Chat với Sóng”</strong> để được tư vấn khung giờ đẹp và báo giá ưu đãi nhất - hoàn toàn miễn phí.</p>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {TOURS.map((tour) => (
              <article key={tour.name} className="flex flex-col overflow-hidden rounded-[1.5rem] bg-white shadow-[0_10px_30px_rgba(8,47,85,0.08)]">
                <div className={`relative grid h-40 place-items-center bg-gradient-to-br ${tour.tone}`}>
                  {tour.image ? <img src={tour.image} alt={tour.alt} className="absolute inset-0 h-full w-full object-cover" loading="lazy" /> : <tour.icon className="h-14 w-14 text-white/90" strokeWidth={1.25} aria-hidden="true" />}
                  <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-[#0b2e4f]">{tour.tag}</span>
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <h3 className="font-bold leading-snug text-[#0b2e4f]">{tour.name}</h3>
                  <p className="mt-2 line-clamp-4 flex-1 text-sm leading-6 text-slate-600">{tour.text}</p>
                  <button type="button" onClick={() => chat(`Chào Sóng, mình muốn tư vấn tour ${tour.name}...`)} className="mt-4 inline-flex items-center justify-center gap-2 rounded-full border border-[#087795]/40 bg-white px-4 py-2.5 text-sm font-bold text-[#087795] transition hover:bg-[#087795] hover:text-white"><MessageCircle className="h-4 w-4" aria-hidden="true" /> Chat với Sóng</button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-4xl overflow-hidden rounded-[1.5rem] bg-gradient-to-r from-[#0b2e4f] to-[#1565a8] px-6 py-7 text-white shadow-lg sm:px-9">
          <Waves className="h-7 w-7 text-sky-200" aria-hidden="true" />
          <h2 className="mt-2 text-2xl font-bold sm:text-3xl">Feel at home - <span className="font-accent font-normal">Live like a local</span></h2>
          <p className="mt-2 max-w-2xl text-sm text-white/80">Đặt phòng từ 3 đêm để được miễn phí đón sân bay, hoặc nhắn Sóng để thiết kế lịch trình riêng cho gia đình và nhóm bạn.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link to="/p/song-homestay/stays" className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold text-[#0b2e4f] transition hover:-translate-y-0.5">Chọn chỗ nghỉ ngay</Link>
            <button type="button" onClick={() => chat('Chào Sóng, mình muốn tư vấn lịch trình riêng...')} className="inline-flex items-center gap-2 rounded-full border border-white/40 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-white/10"><MessageCircle className="h-4 w-4" aria-hidden="true" /> Chat tư vấn lịch trình riêng</button>
          </div>
        </section>
      </div>

      {toast ? <p role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-[#0b2e4f] px-5 py-3 text-sm font-semibold text-white shadow-xl">{toast}</p> : null}
    </div>
  );
}
