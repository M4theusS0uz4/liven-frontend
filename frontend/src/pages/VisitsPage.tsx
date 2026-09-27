import { Check, Link2, Plus, ShieldCheck, Trash2, UserRound, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import FacialCapture from '../components/FacialCapture';
import { carregarVisitas, salvarVisitas, type VisitAccess } from '../lib/visits';

type TipoAcesso = 'qr' | 'facial';

const inicial: VisitAccess[] = [{ id: 1, nome: 'Entregador autorizado', telefone: '', tipo: 'qr', codigo: 'liven-visit-demo-1', ativa: true, status: 'authorized', unidade: 'Unidade do morador', createdAt: new Date().toISOString() }];

export default function VisitsPage() {
  const [visitas, setVisitas] = useState<VisitAccess[]>(() => carregarVisitas() ?? inicial);
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [tipo, setTipo] = useState<TipoAcesso>('qr');
  const [facialPronta, setFacialPronta] = useState(false);
  const [fotoNome, setFotoNome] = useState('');
  const [fotoArquivo, setFotoArquivo] = useState<File | null>(null);

  useEffect(() => salvarVisitas(visitas), [visitas]);

  const limpar = () => {
    setNome('');
    setTelefone('');
    setTipo('qr');
    setFacialPronta(false);
    setFotoNome('');
    setFotoArquivo(null);
    setAberto(false);
  };

  const salvar = async (event: FormEvent) => {
    event.preventDefault();
    if (!nome.trim() || (tipo === 'facial' && !facialPronta)) return;
    const id = Date.now();
    const fotoPreview = tipo === 'facial' && fotoArquivo ? await criarMiniatura(fotoArquivo) : undefined;
    setVisitas((lista) => [{ id, nome: nome.trim(), telefone, tipo, codigo: `liven-visit-${id}`, ativa: true, status: 'authorized', unidade: 'Unidade do morador', createdAt: new Date().toISOString(), fotoNome: tipo === 'facial' ? fotoNome : undefined, fotoPreview }, ...lista]);
    limpar();
  };

  return <section className="space-y-8">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-brand text-xs font-black tracking-[.25em]">ACESSOS</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">Minhas visitas</h1><p className="mt-2 text-slate-500">Gerencie quem pode entrar na sua unidade.</p></div>
      <button onClick={() => setAberto(true)} className="gradient-brand inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-black text-white"><Plus size={18}/>Autorizar visita</button>
    </header>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="glass rounded-2xl p-5"><ShieldCheck className="text-brand"/><strong className="mt-4 block text-2xl">{visitas.filter((visita) => visita.ativa).length}</strong><span className="text-sm text-slate-500">acessos ativos</span></div>
      <div className="glass rounded-2xl p-5"><Link2 className="text-brand"/><strong className="mt-4 block text-2xl">{visitas.filter((visita) => visita.tipo === 'qr').length}</strong><span className="text-sm text-slate-500">convites por QR Code</span></div>
    </div>
    <div className="space-y-3">{visitas.map((visita) => <article key={visita.id} className="glass flex flex-col gap-4 rounded-2xl p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">{visita.fotoPreview ? <img src={visita.fotoPreview} alt={`Foto de ${visita.nome}`} className="h-14 w-14 rounded-xl object-cover"/> : <div className="rounded-xl bg-brand/10 p-3 text-brand">{visita.tipo === 'qr' ? <Link2 size={20}/> : <UserRound size={20}/>}</div>}<div><h2 className="font-black">{visita.nome}</h2><p className="mt-1 text-sm text-slate-500">{visita.tipo === 'qr' ? 'Entrada por QR Code' : 'Entrada por reconhecimento facial'}{visita.telefone && ` · ${visita.telefone}`}</p>{visita.fotoNome && <p className="mt-1 text-xs text-slate-500">Foto cadastrada: {visita.fotoNome}</p>}<span className={`mt-3 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold ${visita.ativa ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{visita.ativa ? <><Check size={13}/>Ativa</> : 'Revogada'}</span></div></div>
      <div className="flex items-center gap-2">{visita.tipo === 'qr' && visita.ativa && <QRCodeSVG value={visita.codigo} size={72} includeMargin/>}{visita.ativa && <button title="Revogar acesso" onClick={() => setVisitas((lista) => lista.map((item) => item.id === visita.id ? { ...item, ativa: false } : item))} className="rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 size={18}/></button>}</div>
    </article>)}</div>
    {aberto && <div className="fixed inset-0 z-20 flex items-center justify-center overflow-y-auto bg-slate-900/50 p-5"><form onSubmit={salvar} className="glass my-auto w-full max-w-md space-y-5 rounded-2xl p-6">
      <div className="flex items-center justify-between"><div><h2 className="text-xl font-black">Autorizar visita</h2><p className="mt-1 text-sm text-slate-500">Escolha como a pessoa será identificada.</p></div><button type="button" onClick={limpar} aria-label="Fechar" className="rounded-lg p-2 text-slate-500 hover:bg-surface-hover"><X size={18}/></button></div>
      <label className="block text-sm font-bold text-slate-700">Nome<input required value={nome} onChange={(event) => setNome(event.target.value)} className="mt-2 w-full rounded-xl border border-border bg-surface px-4 py-3 outline-none focus:border-brand" placeholder="Nome da visita"/></label>
      <label className="block text-sm font-bold text-slate-700">Telefone <span className="font-normal text-slate-400">(opcional)</span><input value={telefone} onChange={(event) => setTelefone(event.target.value)} className="mt-2 w-full rounded-xl border border-border bg-surface px-4 py-3 outline-none focus:border-brand" placeholder="(11) 99999-9999"/></label>
      <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setTipo('qr')} className={`rounded-xl border p-3 text-left ${tipo === 'qr' ? 'border-brand bg-brand/10 text-brand' : 'border-border text-slate-500'}`}><Link2 size={18}/><strong className="mt-2 block text-sm">QR Code</strong><span className="text-xs">A pessoa apresenta na portaria.</span></button><button type="button" onClick={() => setTipo('facial')} className={`rounded-xl border p-3 text-left ${tipo === 'facial' ? 'border-brand bg-brand/10 text-brand' : 'border-border text-slate-500'}`}><UserRound size={18}/><strong className="mt-2 block text-sm">Facial</strong><span className="text-xs">Acesso vinculado ao rosto.</span></button></div>
      {tipo === 'facial' && <><FacialCapture onReady={(file) => { setFacialPronta(Boolean(file)); setFotoArquivo(file); setFotoNome(file?.name ?? ''); }}/>{!facialPronta && <p className="text-xs text-amber-700">Tire uma foto agora ou anexe uma imagem da visita para continuar.</p>}</>}
      <button disabled={tipo === 'facial' && !facialPronta} className="gradient-brand w-full rounded-xl px-4 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-50">Salvar autorização</button>
    </form></div>}
  </section>;
}

async function criarMiniatura(arquivo: File) {
  const imagem = await createImageBitmap(arquivo);
  const escala = Math.min(1, 256 / Math.max(imagem.width, imagem.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(imagem.width * escala));
  canvas.height = Math.max(1, Math.round(imagem.height * escala));
  canvas.getContext('2d')?.drawImage(imagem, 0, 0, canvas.width, canvas.height);
  imagem.close();
  return canvas.toDataURL('image/jpeg', 0.72);
}
