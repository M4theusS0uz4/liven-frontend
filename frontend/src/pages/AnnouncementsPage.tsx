import { Archive, Bell, Check, Plus, Send, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { listarComunicados, marcarComunicado, publicarComunicado, type Comunicado } from '../lib/api';

const data = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' });

export default function AnnouncementsPage() {
  const { usuario } = useAuth();
  const podePublicar = usuario?.perfil === 'sindico';
  const [comunicados, setComunicados] = useState<Comunicado[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [aberto, setAberto] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [mensagem, setMensagem] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    listarComunicados(controller.signal)
      .then((itens) => { if (!controller.signal.aborted) setComunicados(itens); })
      .catch((error: Error) => { if (!controller.signal.aborted) setErro(error.message); })
      .finally(() => { if (!controller.signal.aborted) setCarregando(false); });
    return () => controller.abort();
  }, []);

  const fechar = () => { setAberto(false); setTitulo(''); setMensagem(''); setErro(''); };
  const publicar = async (event: FormEvent) => {
    event.preventDefault();
    if (ocupado || !titulo.trim() || !mensagem.trim()) return;
    setOcupado(true);
    setErro('');
    try {
      const item = await publicarComunicado(titulo.trim(), mensagem.trim());
      setComunicados((lista) => [item, ...lista]);
      fechar();
    } catch (error) {
      setErro((error as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  const marcar = async (id: number, acao: 'ler' | 'arquivar') => {
    setOcupado(true);
    setErro('');
    try {
      const item = await marcarComunicado(id, acao);
      setComunicados((lista) => acao === 'arquivar' ? lista.filter((atual) => atual.id !== id) : lista.map((atual) => atual.id === id ? item : atual));
    } catch (error) {
      setErro((error as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Comunicados</h1>
          <p className="mt-2 text-sm text-slate-600">Avisos publicados para o seu condomínio.</p>
        </div>
        {podePublicar && <button disabled={carregando || ocupado} onClick={() => { setErro(''); setAberto(true); }} className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white disabled:opacity-60"><Plus size={18} /> Novo comunicado</button>}
      </header>
      {erro && !aberto && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{erro}</p>}
      {carregando && <p role="status" className="text-sm text-slate-600">Carregando comunicados…</p>}
      {!carregando && !erro && !comunicados.length && <p className="glass rounded-2xl p-6 text-sm text-slate-600">Nenhum comunicado publicado.</p>}
      <div className="grid gap-3">
        {comunicados.map((item) => (
          <article key={item.id} className="glass rounded-2xl p-5">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-brand"><Bell size={18} aria-hidden="true" /></span>
              <div className="min-w-0 flex-1">
                <h2 className="break-words text-lg font-bold">{item.titulo}</h2>
                <time dateTime={item.created_at} className="text-xs text-slate-600">{data.format(new Date(item.created_at))}</time>
              </div>
              {podePublicar && <button disabled={ocupado} onClick={() => void marcar(item.id, 'arquivar')} aria-label={`Arquivar ${item.titulo}`} className="rounded-xl p-2 text-slate-700 hover:bg-surface-hover"><Archive size={18} /></button>}
            </div>
            <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{item.mensagem}</p>
            {item.lido_em
              ? <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-teal-800"><Check size={15} aria-hidden="true" /> Lido</p>
              : <button disabled={ocupado} onClick={() => void marcar(item.id, 'ler')} className="mt-3 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-surface-hover">Marcar como lido</button>}
          </article>
        ))}
      </div>
      {aberto && (
        <div className="fixed inset-0 z-30 grid place-items-center bg-slate-900/55 p-4">
          <form onSubmit={publicar} aria-label="Novo comunicado" className="glass max-h-[90dvh] w-full max-w-md space-y-4 overflow-y-auto rounded-2xl p-5">
            <div className="flex items-center justify-between"><h2 className="text-xl font-bold">Novo comunicado</h2><button type="button" disabled={ocupado} onClick={fechar} aria-label="Fechar" className="rounded-lg p-2 hover:bg-surface-hover"><X size={18} /></button></div>
            {erro && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{erro}</p>}
            <fieldset disabled={ocupado} className="space-y-4">
              <label className="block text-sm font-semibold">Título<input required minLength={2} maxLength={180} value={titulo} onChange={(event) => setTitulo(event.target.value)} className="mt-1 block w-full rounded-xl border border-border px-3 py-2.5" /></label>
              <label className="block text-sm font-semibold">Mensagem<textarea required maxLength={20000} value={mensagem} onChange={(event) => setMensagem(event.target.value)} rows={5} className="mt-1 block w-full rounded-xl border border-border px-3 py-2.5" /></label>
              <button className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white"><Send size={17} /> {ocupado ? 'Publicando…' : 'Publicar para todos'}</button>
            </fieldset>
          </form>
        </div>
      )}
    </section>
  );
}
