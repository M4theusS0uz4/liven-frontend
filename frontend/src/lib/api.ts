export const API_URL = (import.meta.env.VITE_API_URL ?? '/api/v1').replace(/\/$/, '');
const API_TIMEOUT_MS = 10000;

export type TipoResidencia = 'casa' | 'apartamento';
export type Unidade = { bloco: string; numero: string; andar: number | null; tipo_residencia?: TipoResidencia; ativa: boolean; id: number; created_at: string };
export type UnidadeInput = { bloco: string; numero: string; andar?: number | null; tipo_residencia?: TipoResidencia; ativa?: boolean };
export type Morador = { unidade_id: number; nome: string; cpf: string | null; email: string | null; telefone: string | null; foto_facial_path: string | null; ativo: boolean; id: number; created_at: string };
export type MoradorInput = { unidade_id: number; nome: string; cpf?: string | null; email?: string | null; telefone?: string | null; foto_facial_path?: string | null; ativo?: boolean };
export type Veiculo = { id: number; morador_id: number; placa: string; marca: string | null; modelo: string; cor: string | null; vaga: string | null; ativo: boolean; created_at: string };
export type VeiculoInput = { morador_id: number; placa: string; marca?: string | null; modelo: string; cor?: string | null; vaga?: string | null; ativo?: boolean };
export type StatusEntrega = 'recebida' | 'notificada' | 'retirada' | 'devolvida';
export type Entrega = { morador_id: number; codigo_retirada: string; transportadora: string | null; remetente: string | null; descricao: string | null; recebido_por: string | null; id: number; status: StatusEntrega; recebida_em: string; retirada_em: string | null };
export type EntregaInput = { morador_id: number; codigo_retirada: string; transportadora?: string | null; remetente?: string | null; descricao?: string | null; recebido_por?: string | null };
export type MapaUnidade = { id: number; unidade_id: number; bloco: string; numero: string; x: number; y: number; largura: number; altura: number; rotacao: number; tipo_residencia?: TipoResidencia; status: 'ocupada' | 'vazia' | 'alerta' };
export type TipoCondominio = 'vertical' | 'horizontal' | 'misto';
export type BlocoMapa = { id: number; nome: string; x: number; y: number; largura: number; altura: number; andares: number };
export type AreaComum = { id: number; nome: string; tipo: string; x: number; y: number; largura: number; altura: number };
export type Mapa = { id: number; nome: string; tipo_condominio?: TipoCondominio; largura: number; altura: number; unidades: MapaUnidade[]; blocos: BlocoMapa[]; ruas: { id: number; nome: string; pontos: { x: number; y: number }[]; largura: number }[]; areas_comuns: AreaComum[]; portarias: { id: number; nome: string; x: number; y: number }[] };
export type LoginInput = { telefone: string; perfil: 'morador' | 'portaria' | 'sindico'; codigo: string };
export type LoginResponse = { access_token: string; token_type: string; usuario: { telefone: string; nome: string; perfil: LoginInput['perfil'] } };

export async function apiRequest(path: string, options: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  const usuario = lerUsuarioLocal();
  const accessToken = localStorage.getItem('liven-access-token');

  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: options.signal ?? controller.signal,
      headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...(usuario ? { 'X-User-Profile': usuario.perfil, 'X-User-Phone': usuario.telefone } : {}), ...options.headers },
    });
    if (!response.ok) {
      throw new Error(`${mensagemSegura(response.status)} (${response.status}: ${API_URL}${path})`);
    }
    return response.status === 204 ? undefined : response.json();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`A API não respondeu em ${API_TIMEOUT_MS / 1000}s. Verifique o backend e o banco de dados.`);
    }
    if (error instanceof TypeError) {
      const destino = API_URL.startsWith('/') ? 'o backend local' : API_URL;
      throw new Error(`Não foi possível conectar à API em ${destino}. Verifique se o backend está ativo.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function mensagemSegura(status: number) {
  if (status === 400 || status === 422) return 'Revise os dados informados e tente novamente.';
  if (status === 401) return 'Sua sessão não foi reconhecida pelo backend. Entre novamente.';
  if (status === 403) return 'Seu perfil não tem permissão para realizar esta ação.';
  if (status === 404) return 'O recurso solicitado não foi encontrado.';
  if (status >= 500) return 'O servidor encontrou um problema. Tente novamente mais tarde.';
  return `A API respondeu com erro ${status}.`;
}

function lerUsuarioLocal(): { perfil: string; telefone: string } | null {
  try {
    const valor = localStorage.getItem('liven-usuario');
    if (!valor) return null;
    const usuario = JSON.parse(valor) as { perfil?: string; telefone?: string };
    return usuario.perfil && usuario.telefone ? { perfil: usuario.perfil, telefone: usuario.telefone } : null;
  } catch {
    return null;
  }
}

export const listarUnidades = () => apiRequest('/unidades') as Promise<Unidade[]>;
export const autenticar = (payload: LoginInput) => apiRequest('/auth/login', { method: 'POST', body: JSON.stringify(payload) }) as Promise<LoginResponse>;
export const listarMoradores = () => apiRequest('/moradores') as Promise<Morador[]>;
export const listarEntregas = () => apiRequest('/entregas') as Promise<Entrega[]>;
export const listarMapa = () => apiRequest('/condominio/mapa') as Promise<Mapa>;
export const atualizarMapa = (payload: Mapa) => apiRequest('/condominio/mapa', { method: 'PUT', body: JSON.stringify(payload) }) as Promise<Mapa>;
export const criarUnidade = (payload: UnidadeInput) => apiRequest('/unidades', { method: 'POST', body: JSON.stringify(payload) }) as Promise<Unidade>;
export const atualizarUnidade = (id: number, payload: UnidadeInput) => apiRequest(`/unidades/${id}`, { method: 'PUT', body: JSON.stringify(payload) }) as Promise<Unidade>;
export const excluirUnidade = (id: number) => apiRequest(`/unidades/${id}`, { method: 'DELETE' }) as Promise<void>;
export const criarMorador = (payload: MoradorInput) => apiRequest('/moradores', { method: 'POST', body: JSON.stringify(payload) }) as Promise<Morador>;
export const atualizarMorador = (id: number, payload: MoradorInput) => apiRequest(`/moradores/${id}`, { method: 'PUT', body: JSON.stringify(payload) }) as Promise<Morador>;
export const excluirMorador = (id: number) => apiRequest(`/moradores/${id}`, { method: 'DELETE' }) as Promise<void>;
export const listarVeiculos = () => apiRequest('/veiculos') as Promise<Veiculo[]>;
export const criarVeiculo = (payload: VeiculoInput) => apiRequest('/veiculos', { method: 'POST', body: JSON.stringify(payload) }) as Promise<Veiculo>;
export const atualizarVeiculo = (id: number, payload: VeiculoInput) => apiRequest(`/veiculos/${id}`, { method: 'PUT', body: JSON.stringify(payload) }) as Promise<Veiculo>;
export const excluirVeiculo = (id: number) => apiRequest(`/veiculos/${id}`, { method: 'DELETE' }) as Promise<void>;
export const criarEntrega = (payload: EntregaInput) => apiRequest('/entregas', { method: 'POST', body: JSON.stringify(payload) }) as Promise<Entrega>;
export const atualizarStatusEntrega = (id: number, status: StatusEntrega) => apiRequest(`/entregas/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }) as Promise<Entrega>;
