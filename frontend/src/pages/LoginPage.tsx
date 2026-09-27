import { ArrowRight, Check, KeyRound, Phone } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { useAuth, type Perfil } from '../context/AuthContext';
import { autenticar } from '../lib/api';

const perfis: { valor: Perfil; titulo: string; descricao: string }[] = [
  { valor: 'morador', titulo: 'Morador', descricao: 'Acompanhe sua unidade e suas entregas.' },
  { valor: 'portaria', titulo: 'Portaria', descricao: 'Opere o condomínio e edite cadastros.' },
  { valor: 'sindico', titulo: 'Síndico', descricao: 'Administre moradores, unidades e entregas.' },
];

export default function LoginPage() {
  const { autenticar: salvarSessao } = useAuth();
  const [telefone, setTelefone] = useState('');
  const [codigo, setCodigo] = useState('');
  const [etapa, setEtapa] = useState<'telefone' | 'codigo'>('telefone');
  const [perfil, setPerfil] = useState<Perfil>('morador');
  const [erro, setErro] = useState('');
  const enviarTelefone = (event: FormEvent) => { event.preventDefault(); if (telefone.replace(/\D/g, '').length < 10) { setErro('Informe um telefone válido com DDD.'); return; } setErro(''); setEtapa('codigo'); };
  const confirmarCodigo = async (event: FormEvent) => { event.preventDefault(); setErro(''); try { const resposta = await autenticar({ telefone: telefone.replace(/\D/g, ''), perfil, codigo }); salvarSessao({ accessToken: resposta.access_token, usuario: resposta.usuario }); } catch (error) { setErro((error as Error).message); } };
  return <main className="flex min-h-screen items-center justify-center bg-background px-5 py-10"><section className="w-full max-w-md"><div className="mb-8"><h1 className="text-4xl font-black tracking-tight text-slate-900">Acesso ao condomínio</h1><p className="mt-2 text-slate-500">Entre com seu telefone para continuar.</p></div><div className="glass rounded-2xl p-6 sm:p-8"><div className="mb-6 grid grid-cols-3 gap-2">{perfis.map((item) => <button key={item.valor} type="button" onClick={() => setPerfil(item.valor)} className={`rounded-xl border px-2 py-3 text-left transition ${perfil === item.valor ? 'border-brand bg-brand/10 text-brand' : 'border-border text-slate-500 hover:bg-surface-hover'}`}><span className="block text-sm font-black">{item.titulo}</span><span className="mt-1 block text-[11px] leading-tight">{item.descricao}</span></button>)}</div>{etapa === 'telefone' ? <form onSubmit={enviarTelefone} className="space-y-4"><label className="block text-sm font-bold text-slate-700">Telefone<input autoFocus value={telefone} onChange={(event) => setTelefone(event.target.value)} placeholder="(11) 99999-9999" className="mt-2 w-full rounded-xl border border-border bg-surface px-4 py-3 outline-none transition focus:border-brand" /></label><button className="gradient-brand flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-black text-white">Receber código <ArrowRight size={18}/></button></form> : <form onSubmit={confirmarCodigo} className="space-y-4"><div className="flex items-center gap-3 rounded-xl bg-surface-hover p-3 text-sm text-slate-600"><Phone size={18} className="text-brand"/>Código enviado para {telefone}</div><label className="block text-sm font-bold text-slate-700">Código de acesso<input autoFocus inputMode="numeric" maxLength={6} value={codigo} onChange={(event) => setCodigo(event.target.value.replace(/\D/g, ''))} placeholder="000000" className="mt-2 w-full rounded-xl border border-border bg-surface px-4 py-3 text-center text-2xl tracking-[.4em] outline-none focus:border-brand" /></label><button className="gradient-brand flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-black text-white"><KeyRound size={18}/>Entrar</button><button type="button" onClick={() => { setEtapa('telefone'); setErro(''); }} className="w-full text-sm font-bold text-brand">Alterar telefone</button></form>}{erro && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</p>}<p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-slate-400"><Check size={15} className="mt-0.5 shrink-0 text-brand"/>O código é temporário e não precisa de senha.</p></div></section></main>;
}