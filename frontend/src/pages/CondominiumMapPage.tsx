import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Building2, Trash2, X, LocateFixed, MousePointer2, MapPinned, Rotate3D, Search, ExternalLink, Crosshair, Home, Route, DoorOpen, Blocks, Move, Scaling, Check, Ruler, Grid3X3, Pencil } from 'lucide-react';
import CondominiumMap, { type AlvoMapa, type EixoMapa, type FerramentaMapa, type UnidadeMapa } from '../components/condominium/CondominiumMap';
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
type FormConstrucao = { nome: string; tipo: 'edificio' | 'setor'; x: string; y: string; largura: string; altura: string; andares: string };
type MapDraft = { mapa: Mapa; pendente: boolean };

function ajustarTerrenoAoConteudo(mapa: Mapa, manterDimensoesAtuais = true): Mapa {
  let larguraNecessaria = 20;
  let profundidadeNecessaria = 20;
  const incluir = (x: number, y: number, semiLargura: number, semiAltura: number, margem = 5) => {
    larguraNecessaria = Math.max(larguraNecessaria, x + semiLargura + margem);
    profundidadeNecessaria = Math.max(profundidadeNecessaria, y + semiAltura + margem);
  };
  mapa.blocos.forEach((item) => {
    const radianos = ((item.rotacao ?? 0) * Math.PI) / 180;
    incluir(item.x, item.y, Math.abs(Math.cos(radianos)) * item.largura / 2 + Math.abs(Math.sin(radianos)) * item.altura / 2, Math.abs(Math.sin(radianos)) * item.largura / 2 + Math.abs(Math.cos(radianos)) * item.altura / 2);
  });
  mapa.unidades.filter((item) => !item.oculta).forEach((item) => {
    const radianos = ((item.rotacao ?? 0) * Math.PI) / 180;
    incluir(item.x, item.y, Math.abs(Math.cos(radianos)) * item.largura / 2 + Math.abs(Math.sin(radianos)) * item.altura / 2, Math.abs(Math.sin(radianos)) * item.largura / 2 + Math.abs(Math.cos(radianos)) * item.altura / 2);
  });
  mapa.areas_comuns.forEach((item) => {
    const radianos = ((item.rotacao ?? 0) * Math.PI) / 180;
    incluir(item.x, item.y, Math.abs(Math.cos(radianos)) * item.largura / 2 + Math.abs(Math.sin(radianos)) * item.altura / 2, Math.abs(Math.sin(radianos)) * item.largura / 2 + Math.abs(Math.cos(radianos)) * item.altura / 2);
  });
  mapa.ruas.forEach((rua) => rua.pontos.forEach((ponto) => incluir(ponto.x, ponto.y, rua.largura / 2, rua.largura / 2)));
  mapa.portarias.forEach((item) => incluir(item.x, item.y, 3, 3));
  return { ...mapa, largura: Math.max(20, manterDimensoesAtuais ? mapa.largura : 20, Math.ceil(larguraNecessaria)), altura: Math.max(20, manterDimensoesAtuais ? mapa.altura : 20, Math.ceil(profundidadeNecessaria)) };
}

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
  const [localEncontrado, setLocalEncontrado] = useState<{ nome: string; latitude: number; longitude: number } | null>(null);
  const [carregandoBaseMapa, setCarregandoBaseMapa] = useState(false);
  const [erroBaseMapa, setErroBaseMapa] = useState('');
  const [erroBusca, setErroBusca] = useState('');
  const [buscandoLocal, setBuscandoLocal] = useState(false);
  const [construcaoAberta, setConstrucaoAberta] = useState(false);
  const [formConstrucao, setFormConstrucao] = useState<FormConstrucao>({ nome: '', tipo: 'edificio', x: '', y: '', largura: '24', altura: '20', andares: '5' });
  const [editMode, setEditMode] = useState(false);
  const [editTool, setEditTool] = useState<FerramentaMapa>('select');
  const [axisLock, setAxisLock] = useState<EixoMapa>('free');
  const [selectedTarget, setSelectedTarget] = useState<AlvoMapa | null>(null);
  const [houseToPlace, setHouseToPlace] = useState('');
  const [roadStart, setRoadStart] = useState<{ x: number; y: number } | null>(null);
  const [terrainWidth, setTerrainWidth] = useState(mapa.largura);
  const [terrainHeight, setTerrainHeight] = useState(mapa.altura);
  const ultimaBuscaLocal = useRef(0);

  useEffect(() => {
    if (!editMode) return;
    const keyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      const key = event.key.toLowerCase();
      if (key === 'g') setEditTool('move');
      else if (key === 's') setEditTool('scale');
      else if (key === 'r') setEditTool('rotate');
      else if (key === 'x' || key === 'y') setAxisLock((current) => current === key ? 'free' : key);
      else if (key === 'escape') { setEditTool('select'); setAxisLock('free'); setRoadStart(null); }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [editMode]);

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
        const mapaCarregado = rascunho?.pendente
          ? { ...mapaResult.value, ...rascunho.mapa, id: mapaResult.value.id }
          : { ...mapaResult.value, tipo_condominio: mapaResult.value.tipo_condominio ?? 'vertical' };
        setMapa(ajustarTerrenoAoConteudo(mapaCarregado));
        if (rascunho?.pendente) setAviso('Há alterações do mapa não sincronizadas neste navegador. Salve para enviá-las ao banco.');
      } else {
        setMapa(ajustarTerrenoAoConteudo(mapaRecebido));
          if (mapaResult.reason instanceof Error && !mapaResult.reason.message.includes('recurso solicitado não foi encontrado')) {
            setErro('Não foi possível carregar o mapa salvo no servidor. Você ainda pode editar a cópia disponível neste navegador.');
          }
      }
      if (unidadesResult.status === 'rejected') setErro('Não foi possível carregar as residências do condomínio.');
      if (moradoresResult.status === 'rejected') setAviso('Status de ocupação indisponível; exibindo as unidades sem atualização de moradores.');
    }).finally(() => { if (ativo) setLoading(false); });
    return () => { ativo = false; };
  }, []);

  const totalBlocos = mapa.blocos.length || new Set(unidades.map((unidade) => unidade.bloco)).size;
  const areas = mapa.areas_comuns;
  const resumo = (status: UnidadeMapa['status']) => unidades.filter((unidade) => unidade.status === status).length;

  const persistirMapa = async (novoMapa: Mapa) => {
    const mapaFinal = ajustarTerrenoAoConteudo(novoMapa);
    setMapa(mapaFinal);
    setTerrainWidth(mapaFinal.largura);
    setTerrainHeight(mapaFinal.altura);
    setSalvando(true);
    setAviso('');
    try {
      const salvo = await atualizarMapa(mapaFinal);
      if (salvo.tipo_condominio !== mapaFinal.tipo_condominio) throw new Error('O backend ainda não persiste a tipologia do condomínio.');
      const preservouRotacoes = (mapaFinal.blocos ?? []).every((item) => (item.rotacao ?? 0) === ((salvo.blocos ?? []).find((saved) => saved.id === item.id)?.rotacao ?? 0))
        && (mapaFinal.unidades ?? []).every((item) => (item.rotacao ?? 0) === ((salvo.unidades ?? []).find((saved) => saved.unidade_id === item.unidade_id)?.rotacao ?? 0))
        && (mapaFinal.unidades ?? []).every((item) => Boolean(item.oculta) === Boolean((salvo.unidades ?? []).find((saved) => saved.unidade_id === item.unidade_id)?.oculta))
        && (mapaFinal.areas_comuns ?? []).every((item) => (item.rotacao ?? 0) === ((salvo.areas_comuns ?? []).find((saved) => saved.id === item.id)?.rotacao ?? 0))
        && (mapaFinal.portarias ?? []).every((item) => (item.rotacao ?? 0) === ((salvo.portarias ?? []).find((saved) => saved.id === item.id)?.rotacao ?? 0));
      if (!preservouRotacoes) throw new Error('O backend não persiste a rotação dos elementos.');
      setMapa({ ...salvo, tipo_condominio: salvo.tipo_condominio ?? mapaFinal.tipo_condominio ?? 'vertical' });
      setErro('');
      localStorage.removeItem(MAP_DRAFT_KEY);
      setAviso('Alterações do mapa salvas no banco de dados.');
    } catch (error) {
      localStorage.setItem(MAP_DRAFT_KEY, JSON.stringify({ mapa: mapaFinal, pendente: true } satisfies MapDraft));
      setAviso(error instanceof Error && error.message.includes('rotação')
        ? 'Rotações salvas neste navegador. Para sincronizá-las entre dispositivos, o backend precisa suportar a orientação dos objetos.'
        : 'Alterações salvas neste navegador. O backend não confirmou todos os dados do mapa.');
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
  const posicionarElemento = (x: number, y: number, tool?: FerramentaMapa) => {
    if (modoPosicionamento && editorAberto) { posicionarArea(x, y); return; }
    if (!editMode) return;
    if (tool === 'house') {
      const casa = unidades.find((item) => item.id === houseToPlace && item.tipoResidencia === 'casa');
      if (!casa) { setAviso('Cadastre ou selecione uma unidade do tipo casa antes de posicioná-la.'); return; }
      const anterior = mapa.unidades.find((item) => item.unidade_id === Number(casa.id));
      const posicao = { id: anterior?.id ?? Date.now(), unidade_id: Number(casa.id), bloco: casa.bloco, numero: casa.numero, x: Math.round(x), y: Math.round(y), largura: anterior?.largura ?? 8, altura: anterior?.altura ?? 7, rotacao: anterior?.rotacao ?? 0, oculta: false, tipo_residencia: 'casa' as const, status: casa.status };
      void persistirMapa({ ...mapa, tipo_condominio: mapa.tipo_condominio === 'vertical' ? 'misto' : mapa.tipo_condominio ?? 'horizontal', unidades: anterior ? mapa.unidades.map((item) => item.unidade_id === posicao.unidade_id ? posicao : item) : [...mapa.unidades, posicao] });
      setAviso(`Casa ${casa.bloco} · ${casa.numero} posicionada na planta.`);
      return;
    }
    if (tool === 'road') {
      if (!roadStart) { setRoadStart({ x, y }); setAviso('Ponto inicial da rua marcado. Clique novamente no mapa para definir o final.'); return; }
      const points = [{ x: Math.round(roadStart.x), y: Math.round(roadStart.y) }, { x: Math.round(x), y: Math.round(y) }];
      if (Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y) < 3) { setAviso('A rua precisa ter pelo menos 3 metros. Clique em outro ponto.'); return; }
      const rua = { id: Date.now(), nome: `Rua ${mapa.ruas.length + 1}`, pontos: points, largura: 6 };
      void persistirMapa({ ...mapa, ruas: [...mapa.ruas, rua] });
      setRoadStart(null); setAviso('Rua adicionada à planta.');
    }
  };
  const transformarElemento = (target: AlvoMapa, x: number, y: number, scaleX: number, scaleY: number, rotationDelta = 0) => {
    let novoMapa = { ...mapa };
    if (target.kind === 'bloco') {
      const item = mapa.blocos.find((bloco) => bloco.id === target.id);
      if (!item) return;
      const largura = Math.max(6, Math.round(item.largura * scaleX)); const altura = Math.max(6, Math.round(item.altura * scaleY));
      novoMapa = { ...novoMapa, largura: Math.max(mapa.largura, x + largura / 2 + 5), altura: Math.max(mapa.altura, y + altura / 2 + 5), blocos: mapa.blocos.map((bloco) => bloco.id === target.id ? { ...bloco, x, y, largura, altura, rotacao: (bloco.rotacao ?? 0) + rotationDelta } : bloco) };
    } else if (target.kind === 'unidade') {
      const item = mapa.unidades.find((unidade) => unidade.unidade_id === target.id);
      const casa = unidades.find((unidade) => Number(unidade.id) === target.id);
      if (!casa) return;
      const posicao = { id: item?.id ?? Date.now(), unidade_id: target.id, bloco: casa.bloco, numero: casa.numero, x, y, largura: Math.max(4, Math.round((item?.largura ?? 8) * scaleX)), altura: Math.max(4, Math.round((item?.altura ?? 7) * scaleY)), rotacao: (item?.rotacao ?? 0) + rotationDelta, oculta: false, tipo_residencia: casa.tipoResidencia ?? 'casa', status: casa.status };
      novoMapa = { ...novoMapa, largura: Math.max(mapa.largura, x + posicao.largura / 2 + 5), altura: Math.max(mapa.altura, y + posicao.altura / 2 + 5), unidades: item ? mapa.unidades.map((unidade) => unidade.unidade_id === target.id ? posicao : unidade) : [...mapa.unidades, posicao] };
    } else if (target.kind === 'area') {
      const item = mapa.areas_comuns.find((area) => area.id === target.id);
      if (!item) return;
      const largura = Math.max(6, Math.round(item.largura * scaleX)); const altura = Math.max(6, Math.round(item.altura * scaleY));
      novoMapa = { ...novoMapa, largura: Math.max(mapa.largura, x + largura / 2 + 5), altura: Math.max(mapa.altura, y + altura / 2 + 5), areas_comuns: mapa.areas_comuns.map((area) => area.id === target.id ? { ...area, x, y, largura, altura, rotacao: (area.rotacao ?? 0) + rotationDelta } : area) };
    } else if (target.kind === 'rua') {
      const rua = mapa.ruas.find((item) => item.id === target.id);
      if (!rua) return;
      const cx = rua.pontos.reduce((sum, point) => sum + point.x, 0) / rua.pontos.length;
      const cy = rua.pontos.reduce((sum, point) => sum + point.y, 0) / rua.pontos.length;
      const radians = rotationDelta * (Math.PI / 180);
      novoMapa = { ...novoMapa, ruas: mapa.ruas.map((item) => item.id === target.id ? { ...item, largura: Math.max(3, item.largura * scaleY), pontos: item.pontos.map((point) => { const dx = (point.x - cx) * scaleX; const dy = (point.y - cy) * scaleY; return { x: x + dx * Math.cos(radians) + dy * Math.sin(radians), y: y - dx * Math.sin(radians) + dy * Math.cos(radians) }; }) } : item) };
    } else {
      novoMapa = { ...novoMapa, portarias: mapa.portarias.map((item) => item.id === target.id ? { ...item, x, y, rotacao: (item.rotacao ?? 0) + rotationDelta } : item) };
    }
    void persistirMapa(novoMapa);
  };
  const aplicarTamanhoTerreno = () => {
    const solicitado = { ...mapa, largura: Math.max(20, Number(terrainWidth) || mapa.largura), altura: Math.max(20, Number(terrainHeight) || mapa.altura) };
    const ajustado = ajustarTerrenoAoConteudo(solicitado, false);
    void persistirMapa(ajustado);
    setTerrainWidth(ajustado.largura); setTerrainHeight(ajustado.altura);
    setAviso(ajustado.largura !== solicitado.largura || ajustado.altura !== solicitado.altura
      ? `O terreno foi ampliado para ${ajustado.largura} × ${ajustado.altura} m para manter todos os elementos dentro dele.`
      : `Terreno ajustado para ${ajustado.largura} × ${ajustado.altura} metros.`);
  };
  const buscarLocal = async (event: FormEvent) => {
    event.preventDefault();
    const consulta = endereco.trim();
    if (consulta.length < 3) { setErroBusca('Digite um endereço ou local com pelo menos 3 caracteres.'); return; }
    if (Date.now() - ultimaBuscaLocal.current < 1000) { setErroBusca('Aguarde um segundo antes de fazer outra busca.'); return; }
    ultimaBuscaLocal.current = Date.now();
    setBuscandoLocal(true); setErroBusca(''); setLocalEncontrado(null);
    try {
      const params = new URLSearchParams({ q: consulta, format: 'jsonv2', limit: '1', 'accept-language': 'pt-BR' });
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('A busca de endereço está indisponível. Tente novamente em instantes.');
      const results = await response.json() as Array<{ display_name: string; lat: string; lon: string }>;
      const result = results[0];
      if (!result || !Number.isFinite(Number(result.lat)) || !Number.isFinite(Number(result.lon))) {
        setErroBusca('Não encontramos esse local. Tente informar rua, cidade e estado.');
        return;
      }
      setLocalEncontrado({ nome: result.display_name, latitude: Number(result.lat), longitude: Number(result.lon) });
      setErroBaseMapa('');
      setCarregandoBaseMapa(true);
      setCameraAction({ id: Date.now(), action: 'top' });
    } catch (error) {
      setErroBusca(error instanceof Error ? error.message : 'Não foi possível pesquisar esse local.');
    } finally { setBuscandoLocal(false); }
  };
  const abrirMapillaryNoLocal = () => {
    if (!localEncontrado) return;
    const { latitude, longitude } = localEncontrado;
    window.open(`https://www.mapillary.com/app/?lat=${latitude}&lng=${longitude}&z=17`, '_blank', 'noopener,noreferrer');
  };
  const salvarConstrucao = async (event: FormEvent) => {
    event.preventDefault();
    const index = mapa.blocos.length;
    const largura = Math.max(6, Number(formConstrucao.largura) || 24);
    const altura = Math.max(6, Number(formConstrucao.altura) || 20);
    const x = formConstrucao.x === '' ? 18 + (index % 3) * 30 : Math.max(0, Number(formConstrucao.x));
    const y = formConstrucao.y === '' ? 18 + Math.floor(index / 3) * 26 : Math.max(0, Number(formConstrucao.y));
    const andares = formConstrucao.tipo === 'setor' ? 1 : Math.max(2, Number(formConstrucao.andares) || 5);
    const tipo_condominio: TipoCondominio = formConstrucao.tipo === 'setor'
      ? mapa.tipo_condominio === 'vertical' ? 'misto' : mapa.tipo_condominio ?? 'horizontal'
      : mapa.tipo_condominio === 'horizontal' ? 'misto' : mapa.tipo_condominio ?? 'vertical';
    const bloco = { id: Date.now(), nome: formConstrucao.nome.trim(), x, y, largura, altura, andares };
    const novoMapa = { ...mapa, tipo_condominio, largura: Math.max(mapa.largura, x + largura / 2 + 10), altura: Math.max(mapa.altura, y + altura / 2 + 10), blocos: [...mapa.blocos, bloco] };
    await persistirMapa(novoMapa);
    setFormConstrucao({ nome: '', tipo: 'edificio', x: '', y: '', largura: '24', altura: '20', andares: '5' });
    setConstrucaoAberta(false);
  };
  const adicionarRua = () => {
    const y = mapa.altura / 2;
    const novaRua = { id: Date.now(), nome: `Rua interna ${mapa.ruas.length + 1}`, pontos: [{ x: 5, y }, { x: Math.max(10, mapa.largura - 5), y }], largura: 6 };
    void persistirMapa({ ...mapa, ruas: [...mapa.ruas, novaRua] });
  };
  const adicionarPortaria = () => {
    const novaPortaria = { id: Date.now(), nome: `Portaria ${mapa.portarias.length + 1}`, x: mapa.largura / 2, y: Math.max(5, mapa.altura - 8) };
    void persistirMapa({ ...mapa, portarias: [...mapa.portarias, novaPortaria] });
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
  const removerBloco = (id: number) => void persistirMapa({ ...mapa, blocos: mapa.blocos.filter((item) => item.id !== id) });
  const removerRua = (id: number) => void persistirMapa({ ...mapa, ruas: mapa.ruas.filter((item) => item.id !== id) });
  const removerPortaria = (id: number) => void persistirMapa({ ...mapa, portarias: mapa.portarias.filter((item) => item.id !== id) });
  const removerSelecionado = () => {
    if (!selectedTarget || !window.confirm('Remover este item da planta?')) return;
    let novoMapa = { ...mapa };
    if (selectedTarget.kind === 'bloco') novoMapa = { ...novoMapa, blocos: mapa.blocos.filter((item) => item.id !== selectedTarget.id) };
    else if (selectedTarget.kind === 'rua') novoMapa = { ...novoMapa, ruas: mapa.ruas.filter((item) => item.id !== selectedTarget.id) };
    else if (selectedTarget.kind === 'area') novoMapa = { ...novoMapa, areas_comuns: mapa.areas_comuns.filter((item) => item.id !== selectedTarget.id) };
    else if (selectedTarget.kind === 'portaria') novoMapa = { ...novoMapa, portarias: mapa.portarias.filter((item) => item.id !== selectedTarget.id) };
    else {
      const casa = unidades.find((item) => Number(item.id) === selectedTarget.id);
      if (!casa) return;
      const anterior = mapa.unidades.find((item) => item.unidade_id === selectedTarget.id);
      const oculto = { id: anterior?.id ?? Date.now(), unidade_id: selectedTarget.id, bloco: casa.bloco, numero: casa.numero, x: anterior?.x ?? mapa.largura / 2, y: anterior?.y ?? mapa.altura / 2, largura: anterior?.largura ?? 8, altura: anterior?.altura ?? 7, rotacao: anterior?.rotacao ?? 0, oculta: true, tipo_residencia: casa.tipoResidencia ?? 'casa', status: casa.status };
      novoMapa = { ...novoMapa, unidades: anterior ? mapa.unidades.map((item) => item.unidade_id === selectedTarget.id ? oculto : item) : [...mapa.unidades, oculto] };
    }
    setSelectedTarget(null);
    void persistirMapa(novoMapa);
  };

  return <section className="space-y-7">
    <header className="rounded-2xl border border-border bg-white px-5 py-6 shadow-sm sm:px-7 sm:py-7">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div><p className="text-xs font-black tracking-[.22em] text-brand">PLANTA DO CONDOMÍNIO</p><h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">Mapa do condomínio</h1><p className="mt-2 max-w-2xl text-sm text-slate-500 sm:text-base">Visualize e organize as construções, residências, vias e áreas comuns.</p></div>
        <label className="text-xs font-bold text-slate-500">Tipo de condomínio<select value={mapa.tipo_condominio ?? 'vertical'} disabled={salvando} onChange={(event) => alterarTipoCondominio(event.target.value as TipoCondominio)} className="mt-1 block w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-slate-800 sm:w-60"><option value="vertical">Vertical · edifícios</option><option value="horizontal">Horizontal · casas</option><option value="misto">Misto · casas e edifícios</option></select></label>
      </div>
    </header>

    {erro && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{erro}</p>}
    {aviso && <p role="status" className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">{salvando ? 'Salvando alterações...' : aviso}</p>}
    {loading ? <p className="text-slate-500">Carregando mapa...</p> : <>
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4"><div className="glass rounded-xl p-4"><span className="flex items-center gap-2 text-xs font-bold text-slate-500"><Building2 size={15}/>{mapa.tipo_condominio === 'horizontal' ? 'Ruas e setores' : mapa.tipo_condominio === 'misto' ? 'Edifícios e setores' : 'Edifícios'}</span><strong className="mt-2 block text-2xl">{totalBlocos}</strong></div><div className="glass rounded-xl p-4"><span className="text-xs font-bold text-emerald-700">● Ocupadas</span><strong className="mt-2 block text-2xl">{resumo('ocupada')}</strong></div><div className="glass rounded-xl p-4"><span className="text-xs font-bold text-slate-500">● Vazias</span><strong className="mt-2 block text-2xl">{resumo('vazia')}</strong></div><div className="glass rounded-xl p-4"><span className="text-xs font-bold text-teal-700">Áreas comuns</span><strong className="mt-2 block text-2xl">{areas.length}</strong></div></div>

      {unidades.length === 0 && <div className="flex flex-col gap-3 rounded-xl border border-border bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-slate-600">Ainda não há residências cadastradas. Você pode montar as construções e áreas comuns da planta.</p><button type="button" onClick={() => { setEditMode(true); setEditTool('select'); setAxisLock('free'); setSelectedTarget(null); setTerrainWidth(mapa.largura); setTerrainHeight(mapa.altura); setCameraAction({ id: Date.now(), action: 'top' }); }} className="shrink-0 text-sm font-bold text-brand hover:underline">Começar a editar</button></div>}
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
            <p className="mt-1 text-xs leading-relaxed text-slate-600">Use a roda para aproximar. No modo editar, selecione uma peça para mover, girar ou redimensionar.</p>
          </div>
          <CondominiumMap unidades={unidades} mapa={mapa} localReferencia={localEncontrado} onReferenceLoaded={() => { setCarregandoBaseMapa(false); setErroBaseMapa(''); }} onReferenceError={() => { setCarregandoBaseMapa(false); setErroBaseMapa('O endereço foi encontrado, mas não foi possível carregar a imagem cartográfica agora.'); }} onSelect={setSelecionada} onPlace={posicionarElemento} placementMode={modoPosicionamento || (editMode && (editTool === 'house' || editTool === 'road'))} editMode={editMode} editTool={editTool} axisLock={axisLock} selectedTarget={selectedTarget} onSelectTarget={setSelectedTarget} onTransformTarget={transformarElemento} cameraAction={cameraAction}/>
          {localEncontrado && <div className="absolute bottom-3 left-3 z-10 max-w-[calc(100%-24px)] rounded-lg border border-white/80 bg-white/95 px-3 py-2 text-[11px] shadow backdrop-blur"><p className="font-bold text-slate-800">{carregandoBaseMapa ? 'Carregando mapa do local…' : erroBaseMapa ? 'Mapa de referência indisponível' : 'Mapa do local no terreno'}</p><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="text-slate-500 underline">© OpenStreetMap contributors</a></div>}
          {modoPosicionamento && <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-xl"><Crosshair size={17}/>Clique na planta para posicionar a área<button type="button" onClick={() => setModoPosicionamento(false)} className="rounded-md p-1 text-slate-300 hover:bg-white/10" aria-label="Cancelar posicionamento"><X size={16}/></button></div>}
          <div className="absolute bottom-3 right-3 rounded-lg border border-white/70 bg-white/90 px-3 py-2 text-[11px] font-semibold text-slate-500 shadow backdrop-blur">{mapa.largura} × {mapa.altura} m · {unidades.length} residências</div>
        </div>
        {!editMode ? <div className="flex flex-col gap-3 border-t border-border bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div><p className="text-sm font-black text-slate-800">Quer alterar a planta?</p><p className="mt-1 text-xs text-slate-500">Adicione edifícios, setores, ruas e áreas comuns; ajuste cada peça no mapa 3D.</p></div><button type="button" onClick={() => { setEditMode(true); setEditTool('select'); setAxisLock('free'); setSelectedTarget(null); setTerrainWidth(mapa.largura); setTerrainHeight(mapa.altura); setCameraAction({ id: Date.now(), action: 'top' }); }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-black text-white hover:bg-brand-dark"><Pencil size={17}/>Editar</button></div> : <div className="space-y-4 border-t border-border bg-slate-50/80 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-black tracking-[.16em] text-brand">MODO DE EDIÇÃO · VISTA SUPERIOR</p><p className="mt-1 text-xs text-slate-600">G move · R gira · S redimensiona · X/Y restringem o eixo · Esc seleciona. A rotação encaixa em 15°; segure Shift para movimento livre.</p></div><button type="button" onClick={() => { setEditMode(false); setEditTool('select'); setAxisLock('free'); setSelectedTarget(null); setRoadStart(null); }} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white"><Check size={16}/>Concluir edição</button></div>
          <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Ferramentas do mapa"><button type="button" aria-pressed={editTool === 'select'} onClick={() => { setEditTool('select'); setRoadStart(null); }} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold ${editTool === 'select' ? 'bg-slate-900 text-white' : 'border border-border bg-white text-slate-700'}`}><MousePointer2 size={16}/>Selecionar</button><button type="button" aria-pressed={editTool === 'move'} onClick={() => { setEditTool('move'); setRoadStart(null); }} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold ${editTool === 'move' ? 'bg-brand text-white' : 'border border-border bg-white text-slate-700'}`}><Move size={16}/>Mover <kbd className="rounded bg-white/20 px-1 text-[10px]">G</kbd></button><button type="button" aria-pressed={editTool === 'scale'} onClick={() => { setEditTool('scale'); setRoadStart(null); }} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold ${editTool === 'scale' ? 'bg-brand text-white' : 'border border-border bg-white text-slate-700'}`}><Scaling size={16}/>Redimensionar <kbd className="rounded bg-white/20 px-1 text-[10px]">S</kbd></button><button type="button" aria-pressed={editTool === 'rotate'} onClick={() => { setEditTool('rotate'); setRoadStart(null); }} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold ${editTool === 'rotate' ? 'bg-brand text-white' : 'border border-border bg-white text-slate-700'}`}><Rotate3D size={16}/>Girar <kbd className="rounded bg-white/20 px-1 text-[10px]">R</kbd></button><button type="button" aria-pressed={editTool === 'house'} onClick={() => { setEditTool('house'); setRoadStart(null); }} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold ${editTool === 'house' ? 'bg-brand text-white' : 'border border-border bg-white text-slate-700'}`}><Home size={16}/>Adicionar casa</button><button type="button" aria-pressed={editTool === 'road'} onClick={() => { setEditTool('road'); setRoadStart(null); }} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold ${editTool === 'road' ? 'bg-brand text-white' : 'border border-border bg-white text-slate-700'}`}><Route size={16}/>Desenhar rua</button></div>
          <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-bold text-slate-600">Eixo:</span>{(['free', 'x', 'y'] as const).map((axis) => <button key={axis} type="button" aria-pressed={axisLock === axis} onClick={() => setAxisLock(axis)} className={`rounded-md px-3 py-1.5 text-xs font-black uppercase ${axisLock === axis ? 'bg-slate-900 text-white' : 'border border-border bg-white text-slate-600'}`}>{axis === 'free' ? 'Livre' : axis}</button>)}<span className="text-xs text-slate-500">X/Y restringem mover e redimensionar; girar atua no eixo vertical.</span></div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"><button type="button" onClick={() => { setFormConstrucao({ nome: '', tipo: 'edificio', x: '', y: '', largura: '24', altura: '20', andares: '5' }); setConstrucaoAberta(true); }} className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2.5 text-sm font-bold text-slate-700 hover:border-brand/40 hover:text-brand"><Building2 size={16}/>Criar edifício</button><button type="button" onClick={() => { setFormConstrucao({ nome: '', tipo: 'setor', x: '', y: '', largura: '24', altura: '20', andares: '1' }); setConstrucaoAberta(true); }} className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2.5 text-sm font-bold text-slate-700 hover:border-brand/40 hover:text-brand"><Home size={16}/>Criar setor de casas</button><button type="button" onClick={adicionarRua} disabled={salvando} className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2.5 text-sm font-bold text-slate-700 hover:border-brand/40 hover:text-brand"><Route size={16}/>Adicionar rua</button><button type="button" onClick={adicionarPortaria} disabled={salvando} className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2.5 text-sm font-bold text-slate-700 hover:border-brand/40 hover:text-brand"><DoorOpen size={16}/>Adicionar portaria</button><button type="button" onClick={() => setEditorAberto(true)} className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2.5 text-sm font-bold text-slate-700 hover:border-brand/40 hover:text-brand"><Blocks size={16}/>Adicionar área comum</button></div><p className="text-xs text-slate-500">Arraste a peça selecionada para mover. Para girar, use R e arraste ao redor do centro; segure Shift para desativar o encaixe de 15°.</p>
          {editTool === 'house' && <div className="flex flex-col gap-2 rounded-xl border border-border bg-white p-3 sm:flex-row sm:items-center"><label className="text-xs font-bold text-slate-600">Casa registrada<select value={houseToPlace} onChange={(event) => setHouseToPlace(event.target.value)} className="mt-1 block w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-slate-800 sm:min-w-72"><option value="">Selecione a casa</option>{unidades.filter((unit) => unit.tipoResidencia === 'casa').map((unit) => <option key={unit.id} value={unit.id}>{unit.bloco} · {unit.numero}</option>)}</select></label><p className="text-xs text-slate-500">Depois, clique dentro do terreno para posicionar ou reposicionar a casa.</p>{!unidades.some((unit) => unit.tipoResidencia === 'casa') && <p className="text-xs font-semibold text-amber-800">Cadastre uma unidade do tipo casa antes de adicioná-la ao mapa.</p>}</div>}
          {editTool === 'road' && <p className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">{roadStart ? 'Ponto inicial marcado. Clique no mapa para terminar a rua.' : 'Clique em dois pontos do terreno para desenhar a rua.'}<button type="button" onClick={() => setRoadStart(null)} className="ml-2 font-bold underline">Recomeçar</button></p>}
          {selectedTarget && <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand/10 bg-white px-3 py-2"><p className="text-xs font-semibold text-slate-700">Peça selecionada: {selectedTarget.kind === 'bloco' ? 'edifício ou setor' : selectedTarget.kind === 'unidade' ? 'casa' : selectedTarget.kind === 'area' ? 'área comum' : selectedTarget.kind === 'rua' ? 'rua' : 'portaria'} · arraste no mapa para aplicar a ferramenta ativa.</p><button type="button" onClick={removerSelecionado} disabled={salvando} className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"><Trash2 size={14}/>Remover item</button></div>}
          <div className="grid gap-4 rounded-xl border border-border bg-white p-4 md:grid-cols-2">
            <div><label className="flex items-center justify-between text-xs font-bold text-slate-600">Largura do terreno <span>{terrainWidth} m</span></label><div className="mt-2 flex items-center gap-3"><input type="range" min="20" max={Math.max(10000, mapa.largura * 2, terrainWidth)} step="10" value={terrainWidth} onChange={(event) => setTerrainWidth(Number(event.target.value))} className="w-full accent-emerald-700" aria-label="Ajustar largura do terreno"/><input type="number" min="20" step="1" value={terrainWidth} onChange={(event) => setTerrainWidth(Number(event.target.value) || 20)} className="w-28 rounded-lg border border-border px-2 py-2 text-sm" aria-label="Largura do terreno em metros"/></div></div>
            <div><label className="flex items-center justify-between text-xs font-bold text-slate-600">Profundidade do terreno <span>{terrainHeight} m</span></label><div className="mt-2 flex items-center gap-3"><input type="range" min="20" max={Math.max(10000, mapa.altura * 2, terrainHeight)} step="10" value={terrainHeight} onChange={(event) => setTerrainHeight(Number(event.target.value))} className="w-full accent-emerald-700" aria-label="Ajustar profundidade do terreno"/><input type="number" min="20" step="1" value={terrainHeight} onChange={(event) => setTerrainHeight(Number(event.target.value) || 20)} className="w-28 rounded-lg border border-border px-2 py-2 text-sm" aria-label="Profundidade do terreno em metros"/></div></div>
            <div className="md:col-span-2"><button type="button" onClick={aplicarTamanhoTerreno} disabled={salvando} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-brand/20 px-4 py-2.5 text-sm font-bold text-brand disabled:opacity-50 md:w-auto"><Ruler size={16}/>Aplicar dimensões</button><p className="mt-2 text-xs text-slate-500">O terreno cresce automaticamente quando novos elementos ultrapassam as bordas. As dimensões também aceitam valores grandes digitados.</p></div>
          </div>
          <p className="flex items-center gap-2 text-[11px] text-slate-500"><Grid3X3 size={14}/>As alterações são salvas automaticamente ao soltar as peças. Se o backend estiver offline, ficam no rascunho deste navegador.</p>
        </div>}
        <div className="grid gap-3 border-t border-border bg-slate-50/70 p-4 sm:grid-cols-[1fr_auto] sm:items-center sm:px-5">
          <div><p className="text-sm font-black">Referência visual com Mapillary</p><p className="mt-0.5 text-xs text-slate-500">Consulte imagens públicas de ruas para orientar a composição. A planta continua sendo montada aqui.</p></div>
          <form onSubmit={buscarLocal} className="flex flex-col gap-2 sm:flex-row"><label className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input required minLength={3} maxLength={180} value={endereco} onChange={(event) => setEndereco(event.target.value)} placeholder="Endereço, bairro ou cidade" className="w-full rounded-lg border border-border bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand sm:w-64" aria-label="Pesquisar endereço para o Mapillary"/></label><button type="submit" disabled={buscandoLocal} className="inline-flex items-center justify-center gap-2 rounded-lg border border-brand/20 bg-white px-3 py-2.5 text-xs font-bold text-brand hover:bg-brand/5 disabled:opacity-50"><Search size={15}/>{buscandoLocal ? 'Buscando...' : 'Buscar local'}</button></form>
          <p className="text-[11px] text-slate-400 sm:col-span-2">Busca de endereço © OpenStreetMap contributors. Imagens no Mapillary aparecem somente onde houver cobertura.</p>
          {erroBusca && <p role="alert" className="text-xs text-red-700 sm:col-span-2">{erroBusca}</p>}
          {localEncontrado && <div className="flex flex-col gap-2 rounded-xl border border-brand/15 bg-brand/5 p-3 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between"><p className="min-w-0 text-xs text-slate-600"><strong className="block text-slate-800">{erroBaseMapa ? 'Local encontrado' : 'Mapa do entorno adicionado ao editor'}</strong><span className="mt-1 block truncate" title={localEncontrado.nome}>{localEncontrado.nome}</span><span className="mt-1 block text-slate-400">{erroBaseMapa || `${localEncontrado.latitude.toFixed(5)}, ${localEncontrado.longitude.toFixed(5)}`}</span></p><button type="button" onClick={abrirMapillaryNoLocal} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-brand px-3 py-2.5 text-xs font-bold text-white hover:bg-brand-dark"><ExternalLink size={15}/>Ver no Mapillary</button></div>}
        </div>
      </div>

        <div className="space-y-3"><div className="flex items-end justify-between"><div><h2 className="text-lg font-black">Elementos da planta</h2><p className="mt-1 text-sm text-slate-500">Edifícios, setores, vias, acessos e áreas comuns.</p></div></div>{!mapa.blocos.length && !mapa.ruas.length && !mapa.portarias.length && !areas.length ? <div className="glass rounded-xl p-5 text-sm text-slate-500">A planta ainda não tem construções manuais. Entre em “Editar mapa” para adicionar os primeiros elementos.</div> : <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{mapa.blocos.map((bloco) => <article key={`bloco-${bloco.id}`} className="glass flex items-center justify-between gap-3 rounded-xl p-3"><div className="min-w-0"><p className="truncate font-bold">{bloco.nome}</p><p className="mt-1 text-xs text-slate-500">{bloco.andares <= 1 ? 'Setor de casas' : `Edifício · ${bloco.andares} andares`} · {bloco.largura} × {bloco.altura} m</p><p className="mt-1 text-[11px] text-slate-400">X {Math.round(bloco.x)} · Y {Math.round(bloco.y)} m</p></div><button type="button" title={`Remover ${bloco.nome}`} onClick={() => removerBloco(bloco.id)} disabled={salvando} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"><Trash2 size={16}/></button></article>)}{mapa.ruas.map((rua) => <article key={`rua-${rua.id}`} className="glass flex items-center justify-between gap-3 rounded-xl p-3"><div className="min-w-0"><p className="truncate font-bold">{rua.nome}</p><p className="mt-1 text-xs text-slate-500">Rua · largura {rua.largura} m</p></div><button type="button" title={`Remover ${rua.nome}`} onClick={() => removerRua(rua.id)} disabled={salvando} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"><Trash2 size={16}/></button></article>)}{mapa.portarias.map((portaria) => <article key={`portaria-${portaria.id}`} className="glass flex items-center justify-between gap-3 rounded-xl p-3"><div className="min-w-0"><p className="truncate font-bold">{portaria.nome}</p><p className="mt-1 text-xs text-slate-500">Acesso · X {Math.round(portaria.x)} · Y {Math.round(portaria.y)} m</p></div><button type="button" title={`Remover ${portaria.nome}`} onClick={() => removerPortaria(portaria.id)} disabled={salvando} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"><Trash2 size={16}/></button></article>)}{areas.map((area) => <article key={`area-${area.id}`} className="glass flex items-center justify-between gap-3 rounded-xl p-3"><div className="min-w-0"><p className="truncate font-bold">{area.nome}</p><p className="mt-1 text-xs capitalize text-slate-500">{area.tipo} · {area.largura} × {area.altura} m</p><p className="mt-1 text-[11px] text-slate-400">Posição X {Math.round(area.x)} · Y {Math.round(area.y)} m</p></div><button type="button" title={`Remover ${area.nome}`} onClick={() => removerArea(area.id)} disabled={salvando} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"><Trash2 size={16}/></button></article>)}</div>}</div>
    </>}

    {selecionada && <div className="glass rounded-xl p-4 text-sm"><strong>{selecionada.bloco} · {selecionada.numero}</strong> · {selecionada.tipoResidencia === 'casa' ? 'Casa' : 'Apartamento'} · status <strong className="capitalize">{selecionada.status}</strong>.</div>}

    {construcaoAberta && <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/50 p-4"><form onSubmit={salvarConstrucao} className="glass w-full max-w-lg space-y-4 rounded-xl p-5 sm:p-6"><div className="flex items-start justify-between"><div><p className="text-xs font-black tracking-widest text-brand">CONSTRUÇÃO MANUAL</p><h2 className="mt-1 text-xl font-black">{formConstrucao.tipo === 'setor' ? 'Novo setor de casas' : 'Novo edifício'}</h2></div><button type="button" aria-label="Fechar" onClick={() => setConstrucaoAberta(false)} className="rounded-lg p-2 text-slate-500 hover:bg-surface-hover"><X size={18}/></button></div><label className="block text-sm font-bold text-slate-700">Nome da construção<input autoFocus required maxLength={100} value={formConstrucao.nome} onChange={(event) => setFormConstrucao({ ...formConstrucao, nome: event.target.value })} placeholder={formConstrucao.tipo === 'setor' ? 'Ex.: Alameda das casas' : 'Ex.: Bloco A'} className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2.5 outline-none focus:border-brand"/></label><div className="grid grid-cols-2 gap-3"><label className="text-sm font-bold text-slate-700">Tipo<select value={formConstrucao.tipo} onChange={(event) => setFormConstrucao({ ...formConstrucao, tipo: event.target.value as FormConstrucao['tipo'], andares: event.target.value === 'setor' ? '1' : '5' })} className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2.5"><option value="edificio">Edifício</option><option value="setor">Setor de casas</option></select></label><label className="text-sm font-bold text-slate-700">Andares<input type="number" min={formConstrucao.tipo === 'setor' ? 1 : 2} max="100" disabled={formConstrucao.tipo === 'setor'} value={formConstrucao.andares} onChange={(event) => setFormConstrucao({ ...formConstrucao, andares: event.target.value })} className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2.5 disabled:opacity-60"/></label></div><div className="grid grid-cols-2 gap-3"><label className="text-sm font-bold text-slate-700">Largura (m)<input type="number" min="6" max="500" required value={formConstrucao.largura} onChange={(event) => setFormConstrucao({ ...formConstrucao, largura: event.target.value })} className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2.5"/></label><label className="text-sm font-bold text-slate-700">Profundidade (m)<input type="number" min="6" max="500" required value={formConstrucao.altura} onChange={(event) => setFormConstrucao({ ...formConstrucao, altura: event.target.value })} className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2.5"/></label></div><div className="grid grid-cols-2 gap-3"><label className="text-sm font-bold text-slate-700">Posição X (m)<input type="number" min="0" value={formConstrucao.x} onChange={(event) => setFormConstrucao({ ...formConstrucao, x: event.target.value })} placeholder="Automática" className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2.5"/></label><label className="text-sm font-bold text-slate-700">Posição Y (m)<input type="number" min="0" value={formConstrucao.y} onChange={(event) => setFormConstrucao({ ...formConstrucao, y: event.target.value })} placeholder="Automática" className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2.5"/></label></div><p className="text-xs text-slate-500">Deixe X e Y vazios para distribuir automaticamente. X e Y definem o centro da construção em metros.</p><div className="flex gap-2"><button type="button" onClick={() => setConstrucaoAberta(false)} className="w-1/3 rounded-lg border border-border px-4 py-3 text-sm font-bold text-slate-600">Cancelar</button><button disabled={salvando} className="gradient-brand flex-1 rounded-lg px-4 py-3 font-black text-white disabled:opacity-50">{salvando ? 'Salvando...' : 'Adicionar à planta 3D'}</button></div></form></div>}

    {editorAberto && <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/50 p-4"><form onSubmit={salvarArea} className="glass w-full max-w-md space-y-4 rounded-xl p-5 sm:p-6"><div className="flex items-start justify-between"><div><p className="text-xs font-black tracking-widest text-brand">COMPOSIÇÃO DA PLANTA</p><h2 className="mt-1 text-xl font-black">Adicionar área comum</h2></div><button type="button" aria-label="Fechar" onClick={() => { setEditorAberto(false); setModoPosicionamento(false); }} className="rounded-lg p-2 text-slate-500 hover:bg-surface-hover"><X size={18}/></button></div><label className="block text-sm font-bold text-slate-700">Nome da área<input autoFocus required maxLength={60} value={formArea.nome} onChange={(event) => setFormArea({ ...formArea, nome: event.target.value })} placeholder="Ex.: Quadra do bloco B" className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2.5 outline-none focus:border-brand"/></label><label className="block text-sm font-bold text-slate-700">Tipo<select value={formArea.tipo} onChange={(event) => setFormArea({ ...formArea, tipo: event.target.value })} className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2.5">{tiposArea.map((item) => <option key={item.tipo} value={item.tipo}>{item.nome}</option>)}</select></label><div className="rounded-xl border border-brand/15 bg-brand/5 p-3"><div className="flex items-center justify-between gap-2"><div><p className="text-sm font-bold text-slate-800">Posição na planta</p><p className="mt-0.5 text-xs text-slate-500">{formArea.x && formArea.y ? `Coordenadas: ${formArea.x}, ${formArea.y}` : 'Escolha no mapa ou informe coordenadas.'}</p></div><button type="button" onClick={() => setModoPosicionamento(true)} className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold ${modoPosicionamento ? 'bg-brand text-white' : 'border border-brand/20 bg-white text-brand'}`}><Crosshair size={15}/>{modoPosicionamento ? 'Clique no mapa' : 'Marcar no mapa'}</button></div><div className="mt-3 grid grid-cols-2 gap-3"><label className="text-xs font-bold text-slate-600">X (m)<input type="number" min="0" value={formArea.x} onChange={(event) => setFormArea({ ...formArea, x: event.target.value })} placeholder="Automática" className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-normal"/></label><label className="text-xs font-bold text-slate-600">Y (m)<input type="number" min="0" value={formArea.y} onChange={(event) => setFormArea({ ...formArea, y: event.target.value })} placeholder="Automática" className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-normal"/></label></div></div><p className="text-xs text-slate-500">Área comum com dimensão padrão para o tipo escolhido. Você pode ajustar a posição depois na planta.</p><div className="flex gap-2"><button type="button" onClick={() => { setEditorAberto(false); setModoPosicionamento(false); }} className="w-1/3 rounded-lg border border-border px-4 py-3 text-sm font-bold text-slate-600">Cancelar</button><button disabled={salvando} className="gradient-brand flex-1 rounded-lg px-4 py-3 font-black text-white disabled:opacity-50">{salvando ? 'Salvando...' : 'Adicionar à planta'}</button></div></form></div>}
  </section>;
}
