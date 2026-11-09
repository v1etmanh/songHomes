import { useState, type FormEvent } from 'react';
import { useMutation } from 'convex/react';
import { Mail, MapPin, Phone } from 'lucide-react';
import { api } from '../../convex/_generated/api';
import { extractErrorMessage } from '../components/ErrorMessage';

export function SongContactPage() {
  const submitContact = useMutation(api.contacts.submit);
  const [form, setForm] = useState({ name: '', phone: '', email: '', message: '' });
  const [state, setState] = useState<'idle'|'working'|'success'|'error'>('idle');
  const [feedback, setFeedback] = useState('');
  async function submit(event: FormEvent) { event.preventDefault(); setState('working'); try { await submitContact({ propertySlug: 'song-homestay', ...form }); setState('success'); setFeedback('Sóng Homestay đã nhận được lời nhắn và sẽ liên hệ với bạn sớm nhất.'); setForm({ name: '', phone: '', email: '', message: '' }); } catch (error) { setState('error'); setFeedback(extractErrorMessage(error)); } }
  return <div className="-mx-4 -my-8 bg-[#f4fafc] px-4 py-16 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"><div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[.8fr_1.2fr]">
    <div><p className="text-sm font-bold uppercase tracking-[.22em] text-cyan-700">Liên hệ</p><h1 className="mt-3 text-4xl font-extrabold text-[#073b59]">Sóng luôn sẵn sàng hỗ trợ</h1><p className="mt-5 leading-7 text-slate-600">Hãy liên hệ nếu bạn cần tư vấn chỗ nghỉ, xác nhận sức chứa hoặc đăng ký dịch vụ bổ sung.</p><div className="mt-8 space-y-4 text-slate-700"><a className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm" href="tel:0911388703"><Phone className="h-5 w-5 text-cyan-700" /> 0911.388.703</a><a className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm" href="mailto:Songhomestay@gmail.com"><Mail className="h-5 w-5 text-cyan-700" /> Songhomestay@gmail.com</a><p className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm"><MapPin className="h-5 w-5 text-cyan-700" /> Đà Nẵng, Việt Nam</p></div></div>
    <form onSubmit={submit} className="rounded-3xl bg-white p-7 shadow-xl shadow-sky-950/5 sm:p-9"><h2 className="text-2xl font-extrabold text-[#073b59]">Gửi lời nhắn</h2><div className="mt-6 grid gap-4 sm:grid-cols-2"><label><span className="field-label">Họ và tên</span><input className="field-input" required value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})} /></label><label><span className="field-label">Số điện thoại</span><input className="field-input" required value={form.phone} onChange={(e)=>setForm({...form,phone:e.target.value})} /></label><label className="sm:col-span-2"><span className="field-label">Email</span><input className="field-input" type="email" required value={form.email} onChange={(e)=>setForm({...form,email:e.target.value})} /></label><label className="sm:col-span-2"><span className="field-label">Nội dung cần hỗ trợ</span><textarea className="field-input min-h-36" required value={form.message} onChange={(e)=>setForm({...form,message:e.target.value})} /></label></div>{feedback ? <p role="status" className={`mt-4 rounded-xl p-3 text-sm ${state==='success'?'bg-emerald-50 text-emerald-800':'bg-red-50 text-red-700'}`}>{feedback}</p>:null}<button className="btn-primary mt-6 w-full justify-center" disabled={state==='working'}>{state==='working'?'Đang gửi…':'Gửi yêu cầu hỗ trợ'}</button></form>
  </div></div>;
}
