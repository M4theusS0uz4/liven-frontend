import type { Mapa } from './api';

type Ponto = { x: number; y: number };
type Entrada = Ponto & { nome: string };
type Destino = Entrada & { tipo: 'bloco' | 'casa' | 'area'; largura: number; altura: number; andares: number; rotacao: number };
export type GuiaVisitante = {
  largura: number;
  altura: number;
  entrada: Entrada;
  destino: Destino;
  vias: { largura: number; pontos: Ponto[] }[];
};

const tamanhoMaximo = 8000;
const dimensao = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 10000;
const coordenada = (value: unknown): value is number => value === 0 || dimensao(value);
const objeto = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object';
const ponto = (value: unknown): value is Ponto => objeto(value) && coordenada(value.x) && coordenada(value.y);
const nome = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 120;

export function destinosVisitante(mapa: Mapa): (Destino & { chave: string })[] {
  return [
    ...mapa.blocos.map(({ id, nome, x, y, largura, altura, andares, rotacao }) =>
      ({ chave: `bloco-${id}`, nome, x, y, largura, altura, andares, rotacao: rotacao ?? 0, tipo: 'bloco' as const })),
    ...mapa.unidades.filter((unidade) => !unidade.oculta && unidade.tipo_residencia === 'casa')
      .map(({ unidade_id, numero, x, y, largura, altura, rotacao }) =>
        ({ chave: `casa-${unidade_id}`, nome: `Casa ${numero}`, x, y, largura, altura, andares: 1, rotacao, tipo: 'casa' as const })),
    ...mapa.areas_comuns.map(({ id, nome, x, y, largura, altura, rotacao }) =>
      ({ chave: `area-${id}`, nome, x, y, largura, altura, andares: 1, rotacao: rotacao ?? 0, tipo: 'area' as const })),
  ];
}

export function gerarFragmentoGuia(mapa: Mapa, entrada: Entrada, destino: Destino) {
  const { nome, x, y, tipo, largura, altura, andares, rotacao } = destino;
  const guia: GuiaVisitante = {
    largura: mapa.largura,
    altura: mapa.altura,
    entrada: { nome: entrada.nome, x: entrada.x, y: entrada.y },
    destino: { nome, x, y, tipo, largura, altura, andares, rotacao },
    vias: mapa.ruas.map(({ largura, pontos }) => ({ largura, pontos: pontos.map(({ x, y }) => ({ x, y })) })),
  };
  const fragmento = '#' + encodeURIComponent(JSON.stringify(guia));
  return lerFragmentoGuia(fragmento) ? fragmento : null;
}

export function lerFragmentoGuia(fragmento: string): GuiaVisitante | null {
  if (!fragmento.startsWith('#') || fragmento.length > tamanhoMaximo) return null;
  try {
    const guia: unknown = JSON.parse(decodeURIComponent(fragmento.slice(1)));
    if (!objeto(guia) || !dimensao(guia.largura) || !dimensao(guia.altura)) return null;
    const { entrada, destino, vias } = guia;
    if (!objeto(entrada) || !nome(entrada.nome) || !ponto(entrada)) return null;
    if (!objeto(destino) || !nome(destino.nome)
      || (destino.tipo !== 'bloco' && destino.tipo !== 'casa' && destino.tipo !== 'area')
      || !dimensao(destino.largura) || !dimensao(destino.altura)
      || typeof destino.andares !== 'number' || !Number.isInteger(destino.andares) || destino.andares < 1 || destino.andares > 100
      || typeof destino.rotacao !== 'number' || Math.abs(destino.rotacao) > 360 || !ponto(destino)) return null;
    if (!Array.isArray(vias) || vias.length > 64 || !vias.every((via) =>
      objeto(via) && dimensao(via.largura) && Array.isArray(via.pontos) && via.pontos.every(ponto))) return null;
    return guia as GuiaVisitante;
  } catch {
    return null;
  }
}
