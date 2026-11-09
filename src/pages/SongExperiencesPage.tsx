import { Bike, CarFront, Mountain, Waves } from 'lucide-react';
import { Link } from 'react-router-dom';

const experiences = [
  { icon: Bike, title: 'Thuê xe máy', text: 'Xe tay ga giao tận nơi, giúp bạn chủ động khám phá bán đảo Sơn Trà, phố cổ và ẩm thực Đà Nẵng.' },
  { icon: CarFront, title: 'Đưa đón sân bay', text: 'Xe riêng 4–7 chỗ đón tại sân bay Đà Nẵng và đưa bạn đến đúng chỗ nghỉ.' },
  { icon: Mountain, title: 'Vé Bà Nà Hills', text: 'Hỗ trợ thông tin và đăng ký vé tham quan Bà Nà Hills theo nhu cầu của khách.' },
];

export function SongExperiencesPage() {
  return <div className="-mx-4 -my-8 bg-[#f4fafc] px-4 py-16 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"><div className="mx-auto max-w-6xl">
    <div className="max-w-3xl"><p className="text-sm font-bold uppercase tracking-[.22em] text-cyan-700">Trải nghiệm tại Sóng</p><h1 className="mt-3 text-4xl font-extrabold text-[#073b59]">Đà Nẵng theo nhịp sống của bạn</h1><p className="mt-5 text-lg leading-8 text-slate-600">Tắm biển buổi sớm, thư giãn trong sân vườn, tổ chức BBQ trên sân thượng và khám phá thành phố như một người địa phương.</p></div>
    <div className="mt-10 grid gap-6 md:grid-cols-3">{experiences.map(({ icon: Icon, title, text }) => <article key={title} className="rounded-3xl bg-white p-7 shadow-lg shadow-sky-950/5"><span className="grid h-14 w-14 place-items-center rounded-2xl bg-cyan-50 text-cyan-700"><Icon className="h-7 w-7" /></span><h2 className="mt-5 text-xl font-extrabold text-[#073b59]">{title}</h2><p className="mt-3 leading-7 text-slate-600">{text}</p><p className="mt-5 text-sm font-bold text-cyan-700">Tiếp nhận yêu cầu · Xác nhận thủ công</p></article>)}</div>
    <section className="mt-12 overflow-hidden rounded-3xl bg-[#075779] text-white md:grid md:grid-cols-2"><img src="/song-homestay/hero.webp" alt="Biển Mỹ Khê" className="h-full min-h-72 w-full object-cover" /><div className="p-8 sm:p-12"><Waves className="h-10 w-10 text-cyan-200" /><h2 className="mt-5 text-3xl font-extrabold">Feel at home — Live like a local</h2><p className="mt-4 leading-7 text-white/80">Chọn dịch vụ trong quá trình đặt phòng hoặc gửi yêu cầu để đội ngũ Sóng hỗ trợ.</p><Link to="/p/song-homestay/stays" className="mt-8 inline-flex rounded-full bg-white px-6 py-3 font-bold text-cyan-800">Chọn chỗ nghỉ</Link></div></section>
  </div></div>;
}
