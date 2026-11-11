import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Building2, Plus, Trash2, X, LocateFixed, MousePointer2, MapPinned, Rotate3D, Search, ExternalLink, Check, Crosshair } from 'lucide-react';
import CondominiumMap, { type UnidadeMapa } from '../components/condominium/CondominiumMap';
import { atualizarMapa, listarMapa, listarMoradores, listarUnidades, type AreaComum, type Mapa, type TipoCondominio } from '../lib/api';

const MAP_DRAFT_KEY = 'liven-mapa-rascunho';
const tiposArea = [
  { tipo: 'lazer', nome: 'Área de lazer', largura: 18, altura: 14 },
  { tipo: 'quadra', nome: 'Quadra esportiva', largura: 24, altura: 16 },
  { tipo: 'piscina', nome: 'Piscina', largura: 18, altura: 12 },
  { tipo: 'playground', nome: 'Playground', largura: 15, altura: 12 },
  { tipo: 'churrasqueira', nome: 'Churrasqueira', largura: 14, altura: 11 },
  { tipo: 'salao', nome: 'Salão de festas', largura: 18, altura: 13 },
  { tipo: 'academia', nome: 'Academia', largura: 14, altura: 12 },
  { tipo: 'jardim', nome: 'Jardim', largura: 16, altura: 14 },
];

type FormArea = { nome: string; tipo: string; x: string; y: string };
type MapDraft = { mapa: Mapa; pendente: boolean };

function lerRascunho(): MapDraft | null {
  try {
    const saved = localStorage.getItem(MAP_DRAFT_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved) as MapDraft | Mapa;
    if ('mapa' in parsed && parsed.mapa) return parsed as MapDraft;
    return { mapa: parsed as Mapa, pendente: false };
  } catch {
    return null;
  }
}

function mapaVazio(): Mapa {
  return { id: 0, nome: 'Condomínio', tipo_condominio: 'vertical', largura: 100, altura: 70, unidades: [], blocos: [], ruas: [], areas_comuns: [], portarias: [] };
}

export default function CondominiumMapPage() {
  const [unidades, setUnidades] = useState<UnidadeMapa[]>([]);
  const [mapa, setMapa] = useState<Mapa>(mapaVazio);
  const [selecionada, setSelecionada] = useState<UnidadeMapa | null>(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [editorAberto, setEditorAberto] = useState(false);
  const [formArea, setFormArea] = useState<FormArea>({ nome: '', tipo: 'lazer', x: '', y: '' });
  const [modoPosicionamento, setModoPosicionamento] = useState(false);
  const [cameraAction, setCameraAction] = useState<{ id: number; action: 'fit' | 'top' | 'rotate' } | null>(null);
  const [endereco, setEndereco] = useState('');
  const [referenciaAberta, setReferenciaAberta] = useState(false);

  useEffect(() => {
    let ativo = true;
    Promise.allSettled([listarUnidades(), listarMoradores(), listarMapa()]).then(([unidadesResult, moradoresResult, mapaResult]) => {
      if (!ativo) return;
      const unidadesApi = unidadesResult.status === 'fulfilled' ? unidadesResult.value : [];
      const moradores = moradoresResult.status === 'fulfilled' ? moradoresResult.value : [];
      const rascunho = lerRascunho();
      const mapaRecebido = mapaResult.status === 'fulfilled' ? mapaResult.value : rascunho?.mapa ?? mapaVazio();
      const tipoCondominio = mapaRecebido.tipo_condominio ?? 'vertical';
      const unidadesMapa = unidadesApi.map((unidade) => ({
        id: String(unidade.id),
        bloco: unidade.bloco,
        numero: unidade.numero,
        andar: unidade.andar,
        tipoResidencia: unidade.tipo_residencia ?? mapaRecebido.unidades.find((item) => item.unidade_id === unidade.id)?.tipo_residencia ?? (tipoCondominio === 'horizontal' || (tipoCondominio === 'misto' && unidade.andar === null) ? 'casa' as const : 'apartamento' as const),
        status: moradores.some((morador) => morador.unidade_id === unidade.id && morador.ativo) ? 'ocupada' as const : 'vazia' as const,
      }));
      setUnidades(unidadesMapa);

      if (mapaResult.status === 'fulfilled') {
        setMapa(rascunho?.pendente ? { ...mapaResult.value, areas_comuns: rascunho.mapa.areas_comuns, tipo_condominio: rascunho.mapa.tipo_condominio ?? mapaResult.value.tipo_condominio ?? 'vertical' } : { ...mapaResult.value, tipo_condominio: mapaResult.value.tipo_condominio ?? 'vertical' });
        if (rascunho?.pendente) setAviso('Há áreas não sincronizadas neste navegador. Salve novamente para enviá-las ao banco.');
      } else {
        setMapa(mapaRecebido);
        if (mapaResult.reason instanceof Error && !mapaResult.reason.message.includes('recurso solicitado não foi encontrado')) {
          setErro(mapaResult.reason.message);
        }
      }
      if (unidadesResult.status === 'rejected') setErro((unidadesResult.reason as Error).message);
      if (moradoresResult.status === 'rejected') setAviso('Status de ocupação indisponível; exibindo as unidades sem atualização de moradores.');
    }).finally(() => { if (ativo) setLoading(false); });
    return () => { ativo = false; };
  }, []);

  const totalBlocos = mapa.blocos.length || new Set(unidades.map((unidade) => unidade.bloco)).size;
  const areas = mapa.areas_comuns;
  const resumo = (status: UnidadeMapa['status']) => unidades.filter((unidade) => unidade.status === status).length;

  const persistirMapa = async (novoMapa: Mapa) => {
    setMapa(novoMapa);
    setSalvando(true);
    setAviso('');
    try {
      const salvo = await atualizarMapa(novoMapa);
      if (salvo.tipo_condominio !== novoMapa.tipo_condominio) throw new Error('O backend ainda não persiste a tipologia do condomínio.');
      setMapa({ ...salvo, tipo_condominio: salvo.tipo_condominio ?? novoMapa.tipo_condominio ?? 'vertical' });
      localStorage.removeItem(MAP_DRAFT_KEY);
      setAviso('Alterações do mapa salvas no banco de dados.');
    } catch {
      localStorage.setItem(MAP_DRAFT_KEY, JSON.stringify({ mapa: novoMapa, pendente: true } satisfies MapDraft));
      setAviso('Alteração mantida neste navegador. O backend precisa persistir tipo_condominio e áreas comuns para sincronizar a planta.');
    } finally {
      setSalvando(false);
    }
  };

  const adicionarArea = async (event: FormEvent) => {
    event.preventDefault();
    const configuracao = tiposArea.find((item) => item.tipo === formArea.tipo) ?? tiposArea[0];
    const index = areas.length;
    const x = formArea.x === '' ? 15 + (index % 3) * 25 : Math.max(0, Number(formArea.x));
    const y = formArea.y === '' ? 12 + Math.floor(index / 3) * 19 : Math.max(0, Number(formArea.y));
    const novaArea: AreaComum = { id: Date.now(), nome: formArea.nome.trim(), tipo: configuracao.tipo, x, y, largura: configuracao.largura, altura: configuracao.altura };
    const novoMapa = { ...mapa, largura: Math.max(mapa.largura, x + configuracao.largura / 2 + 10), altura: Math.max(mapa.altura, y + configuracao.altura / 2 + 10), areas_comuns: [...areas, novaArea] };
    await persistirMapa(novoMapa);
    setFormArea({ nome: '', tipo: 'lazer', x: '', y: '' });
    setEditorAberto(false);
  };

  const posicionarArea = (x: number, y: number) => {
    if (!modoPosicionamento || !editorAberto) return;
    setFormArea((current) => ({ ...current, x: String(Math.round(x)), y: String(Math.round(y)) }));
    setModoPosicionamento(false);
  };
  const abrirReferenciaMapillary = () => {
    const query = endereco.trim() || mapa.nome || 'condomínio';
    window.open(`https://www.mapillary.com/app/?q=${encodeURIComponent(query)}`, '_blank', 'noopener,noreferrer');
    setReferenciaAberta(true);
  };
  const salvarArea = async (event: FormEvent) => {
    setModoPosicionamento(false);
    await adicionarArea(event);
  };

  const removerArea = (areaId: number) => {
    void persistirMapa({ ...mapa, areas_comuns: areas.filter((area) => area.id !== areaId) });
  };
  const alterarTipoCondominio = (tipo_condominio: TipoCondominio) => {
    void persistirMapa({ ...mapa, tipo_condominio });
  };

  return <section className="space-y-7">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-brand text-xs font-black tracking-[.25em]">PLANTA DO CONDOMÍNIO</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">Mapa do condomínio</h1><p className="mt-2 text-slate-500">Visualize casas, edifícios e áreas comuns.</p></div><div className="flex flex-col gap-2 sm:flex-row sm:items-end"><label className="text-xs font-bold text-slate-500">Tipo de condomínio<select value={mapa.tipo_condominio ?? 'vertical'} disabled={salvando} onChange={(event) => alterarTipoCondominio(event.target.value as TipoCondominio)} className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-slate-800 sm:w-52"><option value="vertical">Vertical · edifícios</option><option value="horizontal">Horizontal · casas</option><option value="misto">Misto · casas e edifícios</option></select></label><button onClick={() => setEditorAberto(true)} className="gradient-brand inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-black text-white"><Plus size={18}/>Adicionar área</button></div></header>

    {erro && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
    {aviso && <p role="status" className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">{salvando ? 'Salvando alterações...' : aviso}</p>}
    {loading ? <p className="text-slate-500">Carregando mapa...</p> : <>
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4"><div className="glass rounded-xl p-4"><span className="flex items-center gap-2 text-xs font-bold text-slate-500"><Building2 size={15}/>{mapa.tipo_condominio === 'horizontal' ? 'Ruas e setores' : mapa.tipo_condominio === 'misto' ? 'Edifícios e setores' : 'Edifícios'}</span><strong className="mt-2 block text-2xl">{totalBlocos}</strong></div><div className="glass rounded-xl p-4"><span className="text-xs font-bold text-emerald-700">● Ocupadas</span><strong className="mt-2 block text-2xl">{resumo('ocupada')}</strong></div><div className="glass rounded-xl p-4"><span className="text-xs font-bold text-slate-500">● Vazias</span><strong className="mt-2 block text-2xl">{resumo('vazia')}</strong></div><div className="glass rounded-xl p-4"><span className="text-xs font-bold text-teal-700">Áreas comuns</span><strong className="mt-2 block text-2xl">{areas.length}</strong></div></div>

      {unidades.length === 0 && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Cadastre residências e unidades para visualizar sua distribuição. Você já pode preparar as áreas comuns.</p>}
      <div className="glass overflow-hidden rounded-2xl">
        <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
          <div><div className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/10 text-brand"><MapPinned size={18}/></span><div><h2 className="font-black">Editor da planta 3D</h2><p className="text-xs text-slate-500">Organize residências e áreas comuns visualmente.</p></div></div></div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setCameraAction({ id: Date.now(), action: 'fit' })} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-bold text-slate-700 hover:bg-surface-hover"><LocateFixed size={15}/>Enquadrar</button>
            <button type="button" onClick={() => setCameraAction({ id: Date.now(), action: 'top' })} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-bold text-slate-700 hover:bg-surface-hover"><Crosshair size={15}/>Vista superior</button>
            <button type="button" onClick={() => setCameraAction({ id: Date.now(), action: 'rotate' })} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-bold text-slate-700 hover:bg-surface-hover"><Rotate3D size={15}/>Isométrica</button>
            <span className="hidden h-7 border-l border-border lg:block"/>
            <div className="flex flex-wrap gap-3 px-1 text-xs font-bold"><span className="text-emerald-700">● Ocupada</span><span className="text-slate-500">● Vazia</span><span className="text-sky-700">● Área comum</span></div>
          </div>
        </div>
        <div className="relative">
          <div className="absolute left-3 top-3 z-10 max-w-[calc(100%-24px)] rounded-xl border border-white/70 bg-white/90 p-3 shadow-lg backdrop-blur sm:left-4 sm:top-4 sm:max-w-64">
            <p className="flex items-center gap-2 text-xs font-black text-slate-800"><MousePointer2 size={15} className="text-brand"/>Como editar</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">Arraste para girar, use a roda para aproximar e clique numa unidade para ver os detalhes.</p>
          </div>
          <CondominiumMap unidades={unidades} mapa={mapa} onSelect={setSelecionada} onPlace={posicionarArea} placementMode={modoPosicionamento} cameraAction={cameraAction}/>
          {modoPosicionamento && <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-xl"><Crosshair size={17}/>Clique na planta para posicionar a área<button type="button" onClick={() => setModoPosicionamento(false)} className="rounded-md p-1 text-slate-300 hover:bg-white/10" aria-label="Cancelar posicionamento"><X size={16}/></button></div>}
          <div className="absolute bottom-3 right-3 rounded-lg border border-white/70 bg-white/90 px-3 py-2 text-[11px] font-semibold text-slate-500 shadow backdrop-blur">{mapa.largura} × {mapa.altura} m · {unidades.length} residências</div>
        </div>
        <div className="grid gap-3 border-t border-border bg-slate-50/70 p-4 sm:grid-cols-[1fr_auto] sm:items-center sm:px-5">
          <div><p className="text-sm font-black">Referência visual com Mapillary</p><p className="mt-0.5 text-xs text-slate-500">Consulte imagens públicas de ruas para orientar a composição. A planta continua sendo montada aqui.</p></div>
          <div className="flex flex-col gap-2 sm:flex-row"><label className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={endereco} onChange={(event) => setEndereco(event.target.value)} placeholder="Endereço ou nome do condomínio" className="w-full rounded-lg border border-border bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand sm:w-64" aria-label="Buscar referência no Mapillary"/></label><button type="button" onClick={abrirReferenciaMapillary} className="inline-flex items-center justify-center gap-2 rounded-lg border border-brand/20 bg-white px-3 py-2.5 text-xs font-bold text-brand hover:bg-brand/5"><ExternalLink size={15}/>Abrir Mapillary</button></div>
          {referenciaAberta && <p className="text-xs text-slate-500 sm:col-span-2">Mapillary aberto em outra aba. A disponibilidade de imagens depende da cobertura do local.</p>}
        </div>
      </div>

        <div className="space-y-3"><div className="flex items-end justify-between"><div><h2 className="text-lg font-black">Áreas comuns</h2><p className="mt-1 text-sm text-slate-500">Espaços exibidos na planta do condomínio.</p></div><span className="text-sm font-bold text-slate-500">{areas.length} {areas.length === 1 ? 'área' : 'áreas'}</span></div>{areas.length === 0 ? <div className="glass rounded-xl p-5 text-sm text-slate-500">Nenhuma área cadastrada. Adicione quadra, piscina, lazer, academia e outros espaços.</div> : <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{areas.map((area) => <article key={area.id} className="glass flex items-center justify-between gap-3 rounded-xl p-3"><div className="min-w-0"><p className="truncate font-bold">{area.nome}</p><p className="mt-1 text-xs capitalize text-slate-500">{area.tipo} · {area.largura} × {area.altura}</p><p className="mt-1 text-[11px] text-slate-400">Posição X {Math.round(area.x)} · Y {Math.round(area.y)} m</p></div><button type="button" title={`Remover ${area.nome}`} onClick={() => removerArea(area.id)} disabled={salvando} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"><Trash2 size={16}/></button></article>)}</div>}</div>
    </>}

    {selecionada && <div className="glass rounded-xl p-4 text-sm"><strong>{selecionada.bloco} · {selecionada.numero}</strong> · {selecionada.tipoResidencia === 'casa' ? 'Casa' : 'Apartamento'} · status <strong className="capitalize">{selecionada.status}</strong>.</div>}

    {editorAberto && <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/50 p-4"><form onSubmit={salvarArea} className="glass w-full max-w-md space-y-4 rounded-xl p-5 sm:p-6"><div className="flex items-start justify-between"><div><p className="text-xs font-black tracking-widest text-brand">COMPOSIÇÃO DA PLANTA</p><h2 className="mt-1 text-xl font-black">Adicionar área comum</h2></div><button type="button" aria-label="Fechar" onClick={() => { setEditorAberto(false); setModoPosicionamento(false); }} className="rounded-lg p-2 text-slate-500 hover:bg-surface-hover"><X size={18}/></button></div><label className="block text-sm font-bold text-slate-700">Nome da área<input autoFocus required maxLength={60} value={formArea.nome} onChange={(event) => setFormArea({ ...formArea, nome: event.target.value })} placeholder="Ex.: Quadra do bloco B" className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2.5 outline-none focus:border-brand"/></label><label className="block text-sm font-bold text-slate-700">Tipo<select value={formArea.tipo} onChange={(event) => setFormArea({ ...formArea, tipo: event.target.value })} className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2.5">{tiposArea.map((item) => <option key={item.tipo} value={item.tipo}>{item.nome}</option>)}</select></label><div className="rounded-xl border border-brand/15 bg-brand/5 p-3"><div className="flex items-center justify-between gap-2"><div><p className="text-sm font-bold text-slate-800">Posição na planta</p><p className="mt-0.5 text-xs text-slate-500">{formArea.x && formArea.y ? `Coordenadas: ${formArea.x}, ${formArea.y}` : 'Escolha no mapa ou informe coordenadas.'}</p></div><button type="button" onClick={() => setModoPosicionamento(true)} className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold ${modoPosicionamento ? 'bg-brand text-white' : 'border border-brand/20 bg-white text-brand'}`}><Crosshair size={15}/>{modoPosicionamento ? 'Clique no mapa' : 'Marcar no mapa'}</button></div><div className="mt-3 grid grid-cols-2 gap-3"><label className="text-xs font-bold text-slate-600">X (m)<input type="number" min="0" value={formArea.x} onChange={(event) => setFormArea({ ...formArea, x: event.target.value })} placeholder="Automática" className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-normal"/></label><label className="text-xs font-bold text-slate-600">Y (m)<input type="number" min="0" value={formArea.y} onChange={(event) => setFormArea({ ...formArea, y: event.target.value })} placeholder="Automática" className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-normal"/></label></div></div><p className="text-xs text-slate-500">Área comum com dimensão padrão para o tipo escolhido. Você pode ajustar a posição depois na planta.</p><div className="flex gap-2"><button type="button" onClick={() => { setEditorAberto(false); setModoPosicionamento(false); }} className="w-1/3 rounded-lg border border-border px-4 py-3 text-sm font-bold text-slate-600">Cancelar</button><button disabled={salvando} className="gradient-brand flex-1 rounded-lg px-4 py-3 font-black text-white disabled:opacity-50">{salvando ? 'Salvando...' : 'Adicionar à planta'}</button></div></form></div>}
  </section>;
}
