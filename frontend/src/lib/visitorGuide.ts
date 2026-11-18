import type { Mapa, TipoCondominio } from './api';

export type Ponto = { x: number; y: number };
type Entrada = Ponto & { nome: string };
type Construcao = Entrada & { largura: number; altura: number; rotacao: number };
type Bloco = Construcao & { andares: number };
type Area = Construcao & { tipo: string };
type Destino = Bloco & { tipo: 'bloco' | 'casa' | 'area'; tipoArea?: string };
export type GuiaVisitante = {
  largura: number;
  altura: number;
  entrada: Entrada;
  destino: Destino;
  vias: { largura: number; pontos: Ponto[] }[];
  entorno?: { tipo: TipoCondominio; blocos: Bloco[]; areas: Area[] };
};

const tamanhoMaximo = 16000;
const dimensao = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 10000;
const coordenada = (value: unknown): value is number => value === 0 || dimensao(value);
const objeto = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object';
const ponto = (value: unknown): value is Ponto => objeto(value) && coordenada(value.x) && coordenada(value.y);
const nome = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 120;
const andaresValidos = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 100;
const tipoCondominioValido = (value: unknown) => value === 'vertical' || value === 'horizontal' || value === 'misto';
const construcaoValida = (value: unknown): boolean =>
  objeto(value) && nome(value.nome) && dimensao(value.largura) && dimensao(value.altura)
  && typeof value.rotacao === 'number' && Math.abs(value.rotacao) <= 360 && ponto(value);

export function destinosVisitante(mapa: Mapa): (Destino & { chave: string })[] {
  return [
    ...mapa.blocos.map(({ id, nome, x, y, largura, altura, andares, rotacao }) =>
      ({ chave: `bloco-${id}`, nome, x, y, largura, altura, andares, rotacao: rotacao ?? 0, tipo: 'bloco' as const })),
    ...mapa.unidades.filter((unidade) => !unidade.oculta && unidade.tipo_residencia === 'casa')
      .map(({ unidade_id, numero, x, y, largura, altura, rotacao }) =>
        ({ chave: `casa-${unidade_id}`, nome: `Casa ${numero}`, x, y, largura, altura, andares: 1, rotacao, tipo: 'casa' as const })),
    ...mapa.areas_comuns.map(({ id, nome, x, y, largura, altura, rotacao, tipo }) =>
      ({ chave: `area-${id}`, nome, x, y, largura, altura, andares: 1, rotacao: rotacao ?? 0, tipo: 'area' as const, tipoArea: tipo })),
  ];
}

export function gerarFragmentoGuia(mapa: Mapa, entrada: Entrada, destino: Destino & { chave: string }) {
  const { nome, x, y, tipo, largura, altura, andares, rotacao, tipoArea } = destino;
  const guia: GuiaVisitante = {
    largura: mapa.largura,
    altura: mapa.altura,
    entrada: { nome: entrada.nome, x: entrada.x, y: entrada.y },
    destino: { nome, x, y, tipo, largura, altura, andares, rotacao, tipoArea },
    vias: mapa.ruas.map(({ largura, pontos }) => ({ largura, pontos: pontos.map(({ x, y }) => ({ x, y })) })),
    entorno: {
      tipo: mapa.tipo_condominio ?? 'vertical',
      blocos: mapa.blocos.filter(({ id }) => `bloco-${id}` !== destino.chave)
        .map(({ nome, x, y, largura, altura, andares, rotacao }) => ({ nome, x, y, largura, altura, andares, rotacao: rotacao ?? 0 })),
      areas: mapa.areas_comuns.filter(({ id }) => `area-${id}` !== destino.chave)
        .map(({ nome, tipo, x, y, largura, altura, rotacao }) => ({ nome, tipo, x, y, largura, altura, rotacao: rotacao ?? 0 })),
    },
  };
  const bytes = new TextEncoder().encode(JSON.stringify(guia));
  if (bytes.length > tamanhoMaximo * 0.75) return null;
  const fragmento = '#v2.' + btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return lerFragmentoGuia(fragmento) ? fragmento : null;
}

export function lerFragmentoGuia(fragmento: string): GuiaVisitante | null {
  if (!fragmento.startsWith('#') || fragmento.length > tamanhoMaximo) return null;
  try {
    const json = fragmento.startsWith('#v2.')
      ? new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(fragmento.slice(4).replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0)))
      : decodeURIComponent(fragmento.slice(1));
    const guia: unknown = JSON.parse(json);
    if (!objeto(guia) || !dimensao(guia.largura) || !dimensao(guia.altura)) return null;
    const { entrada, destino, vias, entorno } = guia;
    if (!objeto(entrada) || !nome(entrada.nome) || !ponto(entrada)) return null;
    if (!objeto(destino) || !construcaoValida(destino) || !andaresValidos(destino.andares)
      || (destino.tipo !== 'bloco' && destino.tipo !== 'casa' && destino.tipo !== 'area')
      || (destino.tipoArea !== undefined && !nome(destino.tipoArea))) return null;
    if (!Array.isArray(vias) || vias.length > 128 || !vias.every((via) =>
      objeto(via) && dimensao(via.largura) && Array.isArray(via.pontos) && via.pontos.every(ponto))) return null;
    if (entorno !== undefined && (!objeto(entorno) || !tipoCondominioValido(entorno.tipo)
      || !Array.isArray(entorno.blocos) || !Array.isArray(entorno.areas)
      || entorno.blocos.length + entorno.areas.length > 160
      || !entorno.blocos.every((bloco) => objeto(bloco) && construcaoValida(bloco) && andaresValidos(bloco.andares))
      || !entorno.areas.every((area) => objeto(area) && construcaoValida(area) && nome(area.tipo)))) return null;
    return guia as GuiaVisitante;
  } catch {
    return null;
  }
}
