import { AlertCircle, Check, Clock3, Plus, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { atualizarStatusOcorrencia, criarOcorrencia, listarOcorrencias, type Ocorrencia, type OcorrenciaInput, type StatusOcorrencia } from '../lib/api';

const inicial: OcorrenciaInput = { titulo: '', descricao: '', categoria: 'manutencao', prioridade: 'normal' };
const categorias = { manutencao: 'Manutenção', seguranca: 'Segurança', limpeza: 'Limpeza', barulho: 'Barulho', outro: 'Outro' } as const;
const prioridades = { normal: 'Normal', alta: 'Alta', urgente: 'Urgente' } as const;
const estados = {
  aberta: { nome: 'Aberta', icon: AlertCircle, cor: 'bg-amber-50 text-amber-900' },
  em_analise: { nome: 'Em análise', icon: Clock3, cor: 'bg-blue-50 text-blue-900' },
  resolvida: { nome: 'Resolvida', icon: Check, cor: 'bg-teal-50 text-teal-900' },
} satisfies Record<StatusOcorrencia, { nome: string; icon: typeof Check; cor: string }>;
const data = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export default function OccurrencesPage() {
  const { usuario } = useAuth();
  const podeCriar = usuario?.perfil === 'morador';
  const podeTratar = usuario?.perfil === 'portaria' || usuario?.perfil === 'sindico';
  const [lista, setLista] = useState<Ocorrencia[]>([]);
  const [filtro, setFiltro] = useState<StatusOcorrencia | 'todas'>('todas');
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState(inicial);

  useEffect(() => {
    const controller = new AbortController();
    listarOcorrencias(controller.signal)
      .then((itens) => { if (!controller.signal.aborted) setLista(itens); })
      .catch((error: Error) => { if (!controller.signal.aborted) setErro(error.message); })
      .finally(() => { if (!controller.signal.aborted) setCarregando(false); });
    return () => controller.abort();
  }, []);

  const fechar = () => { setAberto(false); setForm(inicial); setErro(''); };
  const criar = async (event: FormEvent) => {
    event.preventDefault();
    if (ocupado || !form.titulo.trim() || !form.descricao.trim()) return;
    setOcupado(true);
    setErro('');
    try {
      const novo = await criarOcorrencia({ ...form, titulo: form.titulo.trim(), descricao: form.descricao.trim() });
      setLista((itens) => [novo, ...itens]);
      setFiltro('aberta');
      fechar();
    } catch (error) {
      setErro((error as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  const alterar = async (item: Ocorrencia, status: StatusOcorrencia) => {
    if (ocupado || item.status === status) return;
    setOcupado(true);
    setErro('');
    try {
      const salvo = await atualizarStatusOcorrencia(item.id, status);
      setLista((itens) => itens.map((atual) => atual.id === salvo.id ? salvo : atual));
    } catch (error) {
      setErro((error as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  const filtradas = lista.filter(({ status }) => filtro === 'todas' || status === filtro);
  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Ocorrências</h1><p className="mt-2 text-sm text-slate-600">{podeCriar ? 'Registre um problema e acompanhe o atendimento.' : 'Organize e acompanhe o atendimento do condomínio.'}</p></div>
        {podeCriar && <button disabled={carregando || ocupado} onClick={() => { setErro(''); setAberto(true); }} className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white disabled:opacity-60"><Plus size={18} /> Nova ocorrência</button>}
      </header>
      <div className="flex flex-wrap gap-2" aria-label="Filtrar ocorrências">
        {(['todas', ...Object.keys(estados)] as const).map((chave) => {
          const status = chave as StatusOcorrencia | 'todas';
          const quantidade = status === 'todas' ? lista.length : lista.filter((item) => item.status === status).length;
          return <button key={status} type="button" aria-pressed={filtro === status} onClick={() => setFiltro(status)} className="rounded-xl border border-border bg-white px-3 py-2 text-sm font-semibold hover:bg-surface-hover aria-pressed:bg-[#125948] aria-pressed:text-white">{status === 'todas' ? 'Todas' : estados[status].nome} <span className="tabular-nums">· {quantidade}</span></button>;
        })}
      </div>
      {erro && !aberto && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{erro}</p>}
      {carregando && <p role="status" className="text-sm text-slate-600">Carregando ocorrências…</p>}
      {!carregando && !erro && !filtradas.length && <p className="glass rounded-2xl p-6 text-sm text-slate-600">Nenhuma ocorrência neste filtro.</p>}
      <div className="grid gap-3">
        {filtradas.map((item) => {
          const estado = estados[item.status];
          return (
            <article key={item.id} className="glass space-y-3 rounded-2xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="break-words text-lg font-bold">{item.titulo}</h2>
                  <p className="mt-1 text-xs text-slate-600">{categorias[item.categoria]} · <time dateTime={item.created_at}>{data.format(new Date(item.created_at))}</time></p>
                </div>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${estado.cor}`}><estado.icon size={14} aria-hidden="true" /> {estado.nome}</span>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{item.descricao}</p>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className={`text-xs font-semibold ${item.prioridade === 'urgente' ? 'text-red-800' : 'text-slate-700'}`}>Prioridade {prioridades[item.prioridade].toLowerCase()}</p>
                {podeTratar && <label className="text-xs font-semibold text-slate-700">Status<span className="sr-only"> de {item.titulo}</span><select value={item.status} disabled={ocupado} onChange={(event) => void alterar(item, event.target.value as StatusOcorrencia)} className="ml-2 rounded-lg border border-border bg-white px-2 py-2 text-sm">{Object.entries(estados).map(([status, dados]) => <option key={status} value={status}>{dados.nome}</option>)}</select></label>}
              </div>
            </article>
          );
        })}
      </div>
      {aberto && (
        <div className="fixed inset-0 z-30 grid place-items-center bg-slate-900/55 p-4">
          <form onSubmit={criar} aria-label="Nova ocorrência" className="glass max-h-[90dvh] w-full max-w-md space-y-4 overflow-y-auto rounded-2xl p-5">
            <div className="flex items-center justify-between"><h2 className="text-xl font-bold">Nova ocorrência</h2><button type="button" disabled={ocupado} onClick={fechar} aria-label="Fechar" className="rounded-lg p-2 hover:bg-surface-hover"><X size={18} /></button></div>
            {erro && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{erro}</p>}
            <fieldset disabled={ocupado} className="space-y-4">
              <label className="block text-sm font-semibold">Título<input required minLength={2} maxLength={180} value={form.titulo} onChange={(event) => setForm({ ...form, titulo: event.target.value })} className="mt-1 block w-full rounded-xl border border-border px-3 py-2.5" /></label>
              <label className="block text-sm font-semibold">Descrição<textarea required maxLength={20000} rows={4} value={form.descricao} onChange={(event) => setForm({ ...form, descricao: event.target.value })} className="mt-1 block w-full rounded-xl border border-border px-3 py-2.5" /></label>
              <label className="block text-sm font-semibold">Categoria<select value={form.categoria} onChange={(event) => setForm({ ...form, categoria: event.target.value as OcorrenciaInput['categoria'] })} className="mt-1 block w-full rounded-xl border border-border px-3 py-2.5">{Object.entries(categorias).map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}</select></label>
              <label className="block text-sm font-semibold">Prioridade<select value={form.prioridade} onChange={(event) => setForm({ ...form, prioridade: event.target.value as OcorrenciaInput['prioridade'] })} className="mt-1 block w-full rounded-xl border border-border px-3 py-2.5">{Object.entries(prioridades).map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}</select></label>
              <button className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white">{ocupado ? 'Enviando…' : 'Registrar ocorrência'}</button>
            </fieldset>
          </form>
        </div>
      )}
    </section>
  );
}
