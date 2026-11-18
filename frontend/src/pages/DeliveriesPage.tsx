import { Package, PackagePlus, Search, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import QrScanner from '../components/QrScanner';
import { atualizarStatusEntrega, criarEntrega, listarEntregas, listarMoradores, type Entrega, type Morador, type StatusEntrega } from '../lib/api';

const initial = { morador_id: '', codigo_retirada: '', transportadora: '', remetente: '', descricao: '' };
const statusEntrega: Record<StatusEntrega, { label: string; cor: string }> = {
  recebida: { label: 'Recebida', cor: 'bg-blue-50 text-blue-900' },
  notificada: { label: 'Notificada', cor: 'bg-amber-50 text-amber-900' },
  retirada: { label: 'Retirada', cor: 'bg-teal-50 text-teal-900' },
  devolvida: { label: 'Devolvida', cor: 'bg-slate-100 text-slate-700' },
};
const pendente = ({ status }: Entrega) => status === 'recebida' || status === 'notificada';

export default function DeliveriesPage() {
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [moradores, setMoradores] = useState<Morador[]>([]);
  const [busca, setBusca] = useState('');
  const [filtros, setFiltros] = useSearchParams();
  const [form, setForm] = useState(initial);
  const [aberto, setAberto] = useState(false);
  const [loading, setLoading] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let ativa = true;
    Promise.all([listarEntregas(), listarMoradores()])
      .then(([itens, pessoas]) => { if (ativa) { setEntregas(itens); setMoradores(pessoas); } })
      .catch((error: Error) => { if (ativa) setErro(error.message); })
      .finally(() => { if (ativa) setLoading(false); });
    return () => { ativa = false; };
  }, []);

  const pessoas = new Map(moradores.map(({ id, nome }) => [id, nome]));
  const apenasPendentes = filtros.get('status') === 'pendentes';
  const termo = busca.trim().toLowerCase();
  const filtradas = entregas.filter((entrega) => (
    (!apenasPendentes || pendente(entrega))
    && `${entrega.codigo_retirada} ${entrega.transportadora ?? ''} ${pessoas.get(entrega.morador_id) ?? ''}`.toLowerCase().includes(termo)
  ));

  const fechar = () => { setAberto(false); setForm(initial); setErro(''); };
  const salvar = async (event: FormEvent) => {
    event.preventDefault();
    if (ocupado) return;
    setOcupado(true);
    setErro('');
    try {
      const nova = await criarEntrega({
        morador_id: Number(form.morador_id), codigo_retirada: form.codigo_retirada.trim(),
        transportadora: form.transportadora || null, remetente: form.remetente || null, descricao: form.descricao || null,
      });
      setEntregas((lista) => [nova, ...lista]);
      fechar();
    } catch (error) {
      setErro((error as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  const alterar = async (id: number, status: StatusEntrega) => {
    if (ocupado) return;
    setOcupado(true);
    setErro('');
    try {
      const atualizada = await atualizarStatusEntrega(id, status);
      setEntregas((lista) => lista.map((entrega) => entrega.id === id ? atualizada : entrega));
    } catch (error) {
      setErro((error as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Gestão de entregas</h1><p className="mt-2 text-sm text-slate-600">Registre o recebimento e acompanhe a retirada de encomendas.</p></div>
        <button disabled={loading || ocupado} onClick={() => { setErro(''); setAberto(true); }} className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white disabled:opacity-60"><PackagePlus size={18} /> Nova entrega</button>
      </header>
      <div className="flex flex-wrap items-center gap-2" aria-label="Filtrar entregas">
        <button type="button" aria-pressed={!apenasPendentes} onClick={() => setFiltros({})} className="rounded-xl border border-border bg-white px-3 py-2 text-sm font-semibold aria-pressed:bg-[#125948] aria-pressed:text-white">Todas · {entregas.length}</button>
        <button type="button" aria-pressed={apenasPendentes} onClick={() => setFiltros({ status: 'pendentes' })} className="rounded-xl border border-border bg-white px-3 py-2 text-sm font-semibold aria-pressed:bg-[#125948] aria-pressed:text-white">Pendentes · {entregas.filter(pendente).length}</button>
      </div>
      <label className="glass flex items-center gap-3 rounded-xl px-4 py-3">
        <Search size={18} className="text-slate-600" aria-hidden="true" />
        <span className="sr-only">Buscar por código, morador ou transportadora</span>
        <input value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Código, morador ou transportadora" className="w-full bg-transparent placeholder:text-slate-600" />
      </label>
      {erro && !aberto && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{erro}</p>}
      {loading && <p role="status" className="text-sm text-slate-600">Carregando entregas…</p>}
      {!loading && !erro && !filtradas.length && <p className="glass rounded-2xl p-6 text-sm text-slate-600">Nenhuma entrega neste filtro.</p>}
      <div className="grid gap-3">
        {filtradas.map((entrega) => (
          <article key={entrega.id} className="glass rounded-2xl p-5">
            <div className="flex flex-wrap items-start gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-brand"><Package size={18} aria-hidden="true" /></span>
              <div className="flex-1">
                <h2 className="font-bold">{entrega.codigo_retirada}</h2>
                <p className="mt-1 text-sm text-slate-700">{pessoas.get(entrega.morador_id) ?? `Morador #${entrega.morador_id}`}{entrega.transportadora && ` · ${entrega.transportadora}`}</p>
                {entrega.descricao && <p className="mt-1 text-xs text-slate-600">{entrega.descricao}</p>}
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusEntrega[entrega.status].cor}`}>{statusEntrega[entrega.status].label}</span>
            </div>
            {pendente(entrega) && <div className="mt-4 flex flex-wrap gap-2">
              <button disabled={ocupado} onClick={() => void alterar(entrega.id, 'retirada')} className="rounded-lg bg-teal-50 px-3 py-2 text-xs font-bold text-teal-900 hover:bg-teal-100 disabled:opacity-60">Marcar retirada</button>
              <button disabled={ocupado} onClick={() => void alterar(entrega.id, 'devolvida')} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-surface-hover disabled:opacity-60">Marcar devolvida</button>
            </div>}
          </article>
        ))}
      </div>
      {aberto && (
        <div className="fixed inset-0 z-30 grid place-items-center bg-slate-900/55 p-4">
          <form onSubmit={salvar} aria-label="Nova entrega" className="glass max-h-[90dvh] w-full max-w-lg space-y-4 overflow-y-auto rounded-2xl p-5">
            <div className="flex items-center justify-between"><h2 className="text-xl font-bold">Nova entrega</h2><button type="button" disabled={ocupado} onClick={fechar} aria-label="Fechar" className="rounded-lg p-2 hover:bg-surface-hover"><X size={18} /></button></div>
            {erro && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{erro}</p>}
            <fieldset disabled={ocupado} className="space-y-4">
              <label className="block text-sm font-semibold">Morador<select required value={form.morador_id} onChange={(event) => setForm({ ...form, morador_id: event.target.value })} className="mt-1 block w-full rounded-xl border border-border px-3 py-2.5"><option value="">Selecione o morador</option>{moradores.filter(({ ativo }) => ativo).map(({ id, nome }) => <option key={id} value={id}>{nome}</option>)}</select></label>
              <label className="block text-sm font-semibold">Código de retirada<input required value={form.codigo_retirada} onChange={(event) => setForm({ ...form, codigo_retirada: event.target.value })} className="mt-1 block w-full rounded-xl border border-border px-3 py-2.5" /></label>
              <QrScanner onDetected={(codigo) => setForm((current) => ({ ...current, codigo_retirada: codigo }))} />
              {([['transportadora', 'Transportadora'], ['remetente', 'Remetente'], ['descricao', 'Descrição']] as const).map(([campo, label]) => (
                <label key={campo} className="block text-sm font-semibold">{label}<input value={form[campo]} onChange={(event) => setForm({ ...form, [campo]: event.target.value })} className="mt-1 block w-full rounded-xl border border-border px-3 py-2.5" /></label>
              ))}
              <button className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white">{ocupado ? 'Salvando…' : 'Registrar entrega'}</button>
            </fieldset>
          </form>
        </div>
      )}
    </section>
  );
}
