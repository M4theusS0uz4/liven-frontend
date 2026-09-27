import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { atualizarUnidade, criarUnidade, excluirUnidade, listarMapa, listarMoradores, listarUnidades, type Morador, type TipoCondominio, type Unidade, type UnidadeInput } from '../lib/api';

const initial = { agrupamento: '', numero: '', tipo: 'apartamento' as 'casa' | 'apartamento', andar: '', ativa: true };
type FormState = typeof initial;

export default function UnitsPage() {
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [moradores, setMoradores] = useState<Morador[]>([]);
  const [tipoCondominio, setTipoCondominio] = useState<TipoCondominio>('vertical');
  const [form, setForm] = useState<FormState>(initial);
  const [editando, setEditando] = useState<Unidade | null>(null);
  const [aberto, setAberto] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = () => {
    setLoading(true);
    Promise.all([listarUnidades(), listarMoradores()])
      .then(([unidadesApi, moradoresApi]) => { setUnidades(unidadesApi); setMoradores(moradoresApi); })
      .catch((error) => setErro(error.message))
      .finally(() => setLoading(false));
    void listarMapa().then((mapa) => setTipoCondominio(mapa.tipo_condominio ?? 'vertical')).catch(() => {});
  };
    useEffect(carregar, []);

  const tipoDaUnidade = (unidade: Unidade) => unidade.tipo_residencia ?? (tipoCondominio === 'horizontal' || (tipoCondominio === 'misto' && unidade.andar === null) ? 'casa' : 'apartamento');

  const abrir = (unidade?: Unidade) => {
    setEditando(unidade ?? null);
    setForm(unidade ? {
      agrupamento: unidade.bloco,
      numero: unidade.numero,
      tipo: tipoDaUnidade(unidade),
      andar: unidade.andar === null ? '' : String(unidade.andar),
      ativa: unidade.ativa,
    } : initial);
    setAberto(true);
    setErro('');
  };

  const salvar = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setErro('');
    const payload: UnidadeInput = {
      bloco: form.agrupamento.trim(),
      numero: form.numero.trim(),
      tipo_residencia: form.tipo,
      andar: form.tipo === 'casa' || form.andar === '' ? null : Number(form.andar),
      ativa: form.ativa,
    };
    try {
      const salvo = editando ? await atualizarUnidade(editando.id, payload) : await criarUnidade(payload);
      setUnidades((lista) => editando ? lista.map((item) => item.id === salvo.id ? salvo : item) : [salvo, ...lista]);
      setAberto(false);
    } catch (error) {
      setErro((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remover = async (id: number) => {
    if (!window.confirm('Excluir esta residência ou unidade?')) return;
    try {
      await excluirUnidade(id);
      setUnidades((lista) => lista.filter((unidade) => unidade.id !== id));
    } catch (error) {
      setErro((error as Error).message);
    }
  };

  return <section className="space-y-8">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-brand text-xs font-black tracking-[.25em]">ESTRUTURA</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">Residências e unidades</h1><p className="mt-2 text-slate-500">Casas, apartamentos e outras unidades do condomínio.</p></div><button onClick={() => abrir()} className="gradient-brand inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-black"><Plus size={18}/>Nova residência</button></header>
    {erro && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
    {loading ? <p className="text-slate-500">Carregando residências...</p> : unidades.length === 0 ? <p className="glass rounded-2xl p-8 text-center text-slate-500">Nenhuma residência cadastrada.</p> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{unidades.map((unidade) => {
      const moradoresUnidade = moradores.filter((morador) => morador.unidade_id === unidade.id);
      return <article key={unidade.id} className="glass rounded-xl p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-xs font-bold text-brand">{unidade.bloco || 'Sem rua ou setor'}</p><h2 className="mt-1 truncate text-2xl font-black">{unidade.numero}</h2><p className="mt-1 text-xs text-slate-500">{tipoDaUnidade(unidade) === 'casa' ? 'Casa' : `Apartamento · ${unidade.andar === null ? 'pavimento não informado' : unidade.andar === 0 ? 'térreo' : `${unidade.andar}º andar`}`}</p></div><div className="flex shrink-0 gap-1"><button title="Editar" onClick={() => abrir(unidade)} className="rounded-lg p-2 text-slate-500 hover:bg-surface-hover"><Pencil size={16}/></button><button title="Excluir" onClick={() => void remover(unidade.id)} className="rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 size={16}/></button></div></div><div className="mt-4 border-t border-border pt-3 text-sm"><strong>{moradoresUnidade.length}</strong> morador(es){moradoresUnidade.map((morador) => <p key={morador.id} className="mt-1 text-slate-500">{morador.nome}</p>)}</div><span className={`mt-3 inline-block rounded-full px-2 py-1 text-xs font-bold ${unidade.ativa ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{unidade.ativa ? 'Ativa' : 'Inativa'}</span></article>;
    })}</div>}

    {aberto && <div className="fixed inset-0 z-20 flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4"><form onSubmit={salvar} className="glass my-auto w-full max-w-md space-y-4 rounded-2xl p-5 sm:p-6"><div className="flex items-start justify-between"><div><p className="text-xs font-black tracking-widest text-brand">CADASTRO DO CONDOMÍNIO</p><h2 className="mt-1 text-xl font-black">{editando ? 'Editar residência' : 'Nova residência'}</h2></div><button type="button" aria-label="Fechar" onClick={() => setAberto(false)} className="rounded-lg p-2 text-slate-500 hover:bg-surface-hover"><X size={18}/></button></div><label className="block text-sm font-bold text-slate-700">Rua, setor ou edifício<input required maxLength={60} value={form.agrupamento} onChange={(event) => setForm({ ...form, agrupamento: event.target.value })} placeholder="Ex.: Rua das Palmeiras, setor 1 ou Torre A" className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2.5 outline-none focus:border-brand"/></label><label className="block text-sm font-bold text-slate-700">Identificação da residência ou unidade<input required maxLength={30} value={form.numero} onChange={(event) => setForm({ ...form, numero: event.target.value })} placeholder="Ex.: Casa 12 ou apartamento 302" className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2.5 outline-none focus:border-brand"/></label><div className="grid grid-cols-2 gap-2"><button type="button" aria-pressed={form.tipo === 'casa'} onClick={() => setForm({ ...form, tipo: 'casa', andar: '' })} className={`rounded-lg border p-3 text-left text-sm font-bold ${form.tipo === 'casa' ? 'border-brand bg-brand/10 text-brand' : 'border-border text-slate-600'}`}>Casa<span className="mt-1 block text-xs font-normal">Sem pavimento</span></button><button type="button" aria-pressed={form.tipo === 'apartamento'} onClick={() => setForm({ ...form, tipo: 'apartamento' })} className={`rounded-lg border p-3 text-left text-sm font-bold ${form.tipo === 'apartamento' ? 'border-brand bg-brand/10 text-brand' : 'border-border text-slate-600'}`}>Apartamento<span className="mt-1 block text-xs font-normal">Informe o andar</span></button></div>{form.tipo === 'apartamento' && <label className="block text-sm font-bold text-slate-700">Andar<input type="number" required min="0" value={form.andar} onChange={(event) => setForm({ ...form, andar: event.target.value })} placeholder="0 para térreo" className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2.5 outline-none focus:border-brand"/></label>}<label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={form.ativa} onChange={(event) => setForm({ ...form, ativa: event.target.checked })}/> Acesso ativo</label><button disabled={saving} className="gradient-brand w-full rounded-lg p-3 font-black text-white disabled:opacity-50">{saving ? 'Salvando...' : 'Salvar residência'}</button></form></div>}
  </section>;
}
