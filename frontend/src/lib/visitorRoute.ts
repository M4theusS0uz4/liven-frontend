import type { GuiaVisitante, Ponto } from './visitorGuide';

type Segmento = { inicio: Ponto; fim: Ponto; cortes: number[] };
const epsilon = 1e-7;
const distancia = (a: Ponto, b: Ponto) => Math.hypot(a.x - b.x, a.y - b.y);
const delta = (a: Ponto, b: Ponto) => ({ x: b.x - a.x, y: b.y - a.y });
const produto = (a: Ponto, b: Ponto) => a.x * b.x + a.y * b.y;
const cruzado = (a: Ponto, b: Ponto) => a.x * b.y - a.y * b.x;
const noSegmento = ({ inicio, fim }: Segmento, t: number) => ({
  x: inicio.x + (fim.x - inicio.x) * t,
  y: inicio.y + (fim.y - inicio.y) * t,
});
const dentro = (t: number) => t >= -epsilon && t <= 1 + epsilon;
const limitar = (t: number) => Math.max(0, Math.min(1, t));

function parametro(segmento: Segmento, ponto: Ponto) {
  const d = delta(segmento.inicio, segmento.fim);
  return produto(d, delta(segmento.inicio, ponto)) / produto(d, d);
}

function conectar(a: Segmento, b: Segmento) {
  const da = delta(a.inicio, a.fim);
  const db = delta(b.inicio, b.fim);
  const entre = delta(a.inicio, b.inicio);
  const determinante = cruzado(da, db);
  if (Math.abs(determinante) > epsilon) {
    const ta = cruzado(entre, db) / determinante;
    const tb = cruzado(entre, da) / determinante;
    if (dentro(ta) && dentro(tb)) {
      a.cortes.push(limitar(ta));
      b.cortes.push(limitar(tb));
    }
    return;
  }
  if (Math.abs(cruzado(entre, da)) > epsilon) return;
  // For overlapping collinear roads, both segments need the shared endpoints.
  for (const [origem, destino] of [[a, b], [b, a]]) {
    for (const ponta of [origem.inicio, origem.fim]) {
      const t = parametro(destino, ponta);
      if (dentro(t)) destino.cortes.push(limitar(t));
    }
  }
}

function pontoMaisProximo(ponto: Ponto, segmentos: Segmento[]) {
  return segmentos.reduce<{ segmento: Segmento; t: number; ponto: Ponto; distancia: number } | null>((melhor, segmento) => {
    const t = limitar(parametro(segmento, ponto));
    const projetado = noSegmento(segmento, t);
    const medida = distancia(ponto, projetado);
    return !melhor || medida < melhor.distancia ? { segmento, t, ponto: projetado, distancia: medida } : melhor;
  }, null);
}

function distanciaAoDestino(ponto: Ponto, destino: GuiaVisitante['destino']) {
  const deslocamento = delta(destino, ponto);
  const angulo = destino.rotacao * Math.PI / 180;
  const x = deslocamento.x * Math.cos(angulo) - deslocamento.y * Math.sin(angulo);
  const y = deslocamento.x * Math.sin(angulo) + deslocamento.y * Math.cos(angulo);
  return Math.hypot(Math.max(0, Math.abs(x) - destino.largura / 2), Math.max(0, Math.abs(y) - destino.altura / 2));
}

export function calcularTrajeto({ entrada, destino, vias }: GuiaVisitante) {
  const segmentos = vias.flatMap(({ pontos }) => pontos.slice(1).flatMap((fim, index) => {
    const inicio = pontos[index];
    return distancia(inicio, fim) > epsilon ? [{ inicio, fim, cortes: [0, 1] }] : [];
  }));
  if (segmentos.length > 256) return null;
  const origem = pontoMaisProximo(entrada, segmentos);
  const fim = pontoMaisProximo(destino, segmentos);
  if (!origem || !fim || origem.distancia > 6 || distanciaAoDestino(fim.ponto, destino) > 6) return null;
  origem.segmento.cortes.push(origem.t);
  fim.segmento.cortes.push(fim.t);
  segmentos.forEach((segmento, index) => {
    for (let proximo = index + 1; proximo < segmentos.length; proximo += 1) conectar(segmento, segmentos[proximo]);
  });

  type No = { ponto: Ponto; vizinhos: Map<No, number>; custo: number; anterior?: No };
  const nos = new Map<string, No>();
  const obterNo = (ponto: Ponto) => {
    const chave = `${ponto.x.toFixed(5)},${ponto.y.toFixed(5)}`;
    const existente = nos.get(chave);
    if (existente) return existente;
    const novo: No = { ponto, vizinhos: new Map(), custo: Infinity };
    nos.set(chave, novo);
    return novo;
  };
  for (const segmento of segmentos) {
    const cortes = segmento.cortes.sort((a, b) => a - b);
    let anterior = obterNo(segmento.inicio);
    for (const t of cortes.slice(1)) {
      const atual = obterNo(noSegmento(segmento, t));
      if (atual === anterior) continue;
      const metros = distancia(atual.ponto, anterior.ponto);
      anterior.vizinhos.set(atual, metros);
      atual.vizinhos.set(anterior, metros);
      anterior = atual;
    }
  }
  if (nos.size > 3000) return null;

  const inicio = obterNo(origem.ponto);
  const chegada = obterNo(fim.ponto);
  inicio.custo = 0;
  const pendentes = new Set([inicio]);
  while (pendentes.size) {
    let atual = pendentes.values().next().value as No;
    for (const candidato of pendentes) if (candidato.custo < atual.custo) atual = candidato;
    if (atual === chegada) {
      if (atual.custo <= epsilon) return null;
      const pontos: Ponto[] = [];
      for (let no: No | undefined = atual; no; no = no.anterior) pontos.push(no.ponto);
      return { pontos: pontos.reverse(), metros: atual.custo };
    }
    pendentes.delete(atual);
    for (const [vizinho, metros] of atual.vizinhos) {
      const custo = atual.custo + metros;
      if (custo >= vizinho.custo) continue;
      vizinho.custo = custo;
      vizinho.anterior = atual;
      pendentes.add(vizinho);
    }
  }
  return null;
}
