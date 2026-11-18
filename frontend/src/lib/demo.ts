import type { Comunicado, Entrega, Morador, Ocorrencia, PainelSindico, Porteiro, Unidade, Veiculo } from './api';
import type { VisitAccess } from './visits';

const agora = () => new Date().toISOString();
const criadoEm = agora();

const unidades: Unidade[] = ['Ipê', 'Araucária'].flatMap((torre, bloco) =>
  [101, 102, 201].map((numero, andar) => ({
    id: bloco * 3 + andar + 1, bloco: `Torre ${torre}`, numero: String(numero),
    andar: Math.floor(numero / 100), tipo_residencia: 'apartamento', ativa: true, created_at: criadoEm,
  })),
);

const moradores: Morador[] = ['Marina Costa', 'João Rocha', 'Rosa Lima', 'Lia Santos', 'Hugo Nunes'].map((nome, index) => ({
  id: index + 1, unidade_id: index % 4 + 1, nome, email: null, cpf: null, telefone: null,
  foto_facial_path: null, ativo: true, created_at: criadoEm,
}));

const veiculos: Veiculo[] = [
  { id: 1, morador_id: 1, placa: 'LIV2A01', marca: 'Fiat', modelo: 'Pulse', cor: 'Cinza', vaga: '01', ativo: true, created_at: criadoEm },
  { id: 2, morador_id: 2, placa: 'LIV2A02', marca: 'Honda', modelo: 'City', cor: 'Branco', vaga: '02', ativo: true, created_at: criadoEm },
];

const equipeInicial: Porteiro[] = [
  { id: 1, nome: 'Carlos Almeida', telefone: '(11) 98888-1212', turno: 'Manhã', ativo: true },
  { id: 2, nome: 'Alice Rocha', telefone: '(11) 98888-1213', turno: 'Noite', ativo: true },
];

const entregasIniciais: Entrega[] = [
  { id: 1, morador_id: 1, codigo_retirada: 'LIV-210', transportadora: 'Correios', remetente: null, descricao: 'Envelope', recebido_por: 'Carlos', status: 'recebida', recebida_em: criadoEm, retirada_em: null },
  { id: 2, morador_id: 2, codigo_retirada: 'LIV-211', transportadora: 'Entrega expressa', remetente: null, descricao: 'Caixa média', recebido_por: 'Carlos', status: 'notificada', recebida_em: criadoEm, retirada_em: null },
  { id: 3, morador_id: 3, codigo_retirada: 'LIV-212', transportadora: 'Correios', remetente: null, descricao: 'Caixa pequena', recebido_por: 'Alice', status: 'retirada', recebida_em: criadoEm, retirada_em: criadoEm },
];

const ocorrenciasIniciais: Ocorrencia[] = [
  { id: 1, titulo: 'Iluminação da via interna', descricao: 'A luminária próxima ao jardim precisa de manutenção.', categoria: 'manutencao', prioridade: 'alta', status: 'aberta', unidade_id: 1, created_at: criadoEm },
  { id: 2, titulo: 'Limpeza da praça', descricao: 'Há folhas acumuladas no acesso à praça.', categoria: 'limpeza', prioridade: 'normal', status: 'em_analise', unidade_id: 2, created_at: criadoEm },
];

const comunicadosIniciais: Comunicado[] = [
  { id: 1, titulo: 'Manutenção programada', mensagem: 'A praça terá manutenção neste sábado, das 8h às 12h.', created_at: criadoEm, lido_em: null },
];

const visitasIniciais: VisitAccess[] = [
  { id: 1, nome: 'Helena Duarte', telefone: '', codigo: 'liven-visita-helena', tipo: 'qr', ativa: true, status: 'authorized', unidade: 'Torre Ipê · 101', createdAt: criadoEm },
  { id: 2, nome: 'Diego Souza', telefone: '', codigo: 'liven-visita-diego', tipo: 'manual', ativa: true, status: 'inside', unidade: 'Torre Araucária · 101', createdAt: criadoEm },
];

type PorteiroDemo = Porteiro & { fotoDemo?: string };
let equipe: PorteiroDemo[] = equipeInicial;
let entregas = entregasIniciais;
let ocorrencias = ocorrenciasIniciais;
let comunicados = comunicadosIniciais;
let visitas = visitasIniciais;

export function reiniciarDemo() {
  equipe = equipeInicial;
  entregas = entregasIniciais;
  ocorrencias = ocorrenciasIniciais;
  comunicados = comunicadosIniciais;
  visitas = visitasIniciais;
}

export const lerEquipeDemo = () => equipe;
export const salvarEquipeDemo = (lista: PorteiroDemo[]) => { equipe = lista; };

export const lerVisitasDemo = () => visitas;
export const salvarVisitasDemo = (lista: VisitAccess[]) => { visitas = lista; };

export function responderDemo(path: string, method: string, body?: string) {
  if (method === 'GET') {
    const painel: PainelSindico = {
      total_unidades: unidades.length,
      unidades_ocupadas: new Set(moradores.map(({ unidade_id }) => unidade_id)).size,
      moradores_ativos: moradores.length,
      porteiros_ativos: equipe.filter(({ ativo }) => ativo).length,
      entregas_pendentes: entregas.filter(({ status }) => status === 'recebida' || status === 'notificada').length,
      ocorrencias_abertas: ocorrencias.filter(({ status }) => status === 'aberta').length,
      ocorrencias_em_analise: ocorrencias.filter(({ status }) => status === 'em_analise').length,
      ocorrencias_resolvidas: ocorrencias.filter(({ status }) => status === 'resolvida').length,
      comunicados_ativos: comunicados.length,
      acessos_hoje: visitas.filter(({ status }) => status === 'inside' || status === 'exited').length,
    };
    const recursos: Record<string, unknown> = {
      '/unidades': unidades, '/moradores': moradores, '/veiculos': veiculos, '/entregas': entregas,
      '/ocorrencias': ocorrencias, '/comunicados': comunicados, '/dashboard/sindico': painel,
    };
    return recursos[path];
  }

  const dados = body ? JSON.parse(body) : {};
  const [_, colecao, idTexto, acao] = path.split('/');
  const id = Number(idTexto);
  if (method === 'PATCH' && acao === 'status') {
    if (colecao === 'entregas') {
      const item = entregas.find((entrega) => entrega.id === id);
      if (!item) return;
      const atualizado = { ...item, status: dados.status, retirada_em: dados.status === 'retirada' ? agora() : item.retirada_em };
      entregas = entregas.map((entrega) => entrega.id === id ? atualizado : entrega);
      return atualizado;
    }
    if (colecao === 'ocorrencias') {
      const item = ocorrencias.find((ocorrencia) => ocorrencia.id === id);
      if (!item) return;
      const atualizado = { ...item, status: dados.status };
      ocorrencias = ocorrencias.map((ocorrencia) => ocorrencia.id === id ? atualizado : ocorrencia);
      return atualizado;
    }
  }
  if (method === 'POST' && colecao === 'comunicados') {
    if (!idTexto) {
      const novo: Comunicado = { id: Date.now(), titulo: dados.titulo, mensagem: dados.mensagem, created_at: agora(), lido_em: null };
      comunicados = [novo, ...comunicados];
      return novo;
    }
    const item = comunicados.find((comunicado) => comunicado.id === id);
    if (item && acao === 'arquivar') {
      comunicados = comunicados.filter((comunicado) => comunicado.id !== id);
      return item;
    }
    if (item && acao === 'ler') {
      const atualizado = { ...item, lido_em: item.lido_em ?? agora() };
      comunicados = comunicados.map((comunicado) => comunicado.id === id ? atualizado : comunicado);
      return atualizado;
    }
  }
  if (method === 'POST' && path === '/entregas') {
    const nova: Entrega = { ...dados, id: Date.now(), status: 'recebida', recebido_por: 'Portaria', recebida_em: agora(), retirada_em: null };
    entregas = [nova, ...entregas];
    return nova;
  }
}
