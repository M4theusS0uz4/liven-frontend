import { useAuth } from '../context/AuthContext';
import { useRef, useState } from 'react';

export default function WelcomePage() {
  const { contaGlobal, vinculos, escolherCondominio, erroSessao } = useAuth();
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const enviando = useRef(false);
  const selecionar = async (usuarioId: number) => {
    if (enviando.current) return;
    enviando.current = true;
    setOcupado(true); setErro('');
    try { await escolherCondominio(usuarioId); }
    catch (error) { setErro((error as Error).message); }
    finally { enviando.current = false; setOcupado(false); }
  };
  return <section className="space-y-6 sm:space-y-8">
    <header><h1 className="mobile-compact-heading text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Visão geral</h1>
      <p className="mt-2 break-all text-sm text-slate-500 sm:text-base">{contaGlobal?.email}</p></header>
    <div className="glass space-y-5 rounded-xl p-5 sm:p-7">
        {vinculos.length ? <div className="space-y-3">
          <p>Escolha o condomínio que deseja acessar:</p>
          {vinculos.map((vinculo) => <button key={vinculo.usuario_id} disabled={ocupado} onClick={() => void selecionar(vinculo.usuario_id)} className="block w-full rounded-xl border border-border p-4 text-left font-semibold text-brand disabled:opacity-50">{vinculo.condominio_nome} — {vinculo.perfil}</button>)}
        </div> : <div className="rounded-xl bg-surface-hover p-4 text-sm leading-relaxed text-slate-600">Para acessar as funcionalidades de um condomínio, solicite um vínculo autorizado à administração. Sua conta não recebe um perfil ou condomínio automaticamente.</div>}
        {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
        {erroSessao && <p role="alert" className="text-sm text-amber-800">{erroSessao}</p>}
    </div>
  </section>;
}
