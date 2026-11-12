import { getSession, sessionRevision, setSession, validTokens } from './session';
import { normalizarEmail } from './otp';
export const API_URL = (import.meta.env?.VITE_API_URL ?? '/api/v1').replace(/\/$/, '');
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
export type Perfil = 'morador' | 'portaria' | 'sindico';
export type Usuario = { id: number; condominio_id: number; telefone: string; email?: string | null; nome: string; perfil: Perfil; ativo: boolean; unidade_id: number | null; created_at: string };
export type OtpInput = { email: string; condominio_id: number };
export type OtpVerifyInput = OtpInput & { codigo: string };
export type OtpResponse = { detail: string; codigo_mock?: string };
export type AuthResponse = { access_token: string; refresh_token: string; token_type: string; expires_in: number };
export type ContaGlobal = { id: number; email: string; ativo: boolean; email_verificado_em: string; created_at: string };
export type Vinculo = { usuario_id: number; condominio_id: number; condominio_nome: string; perfil: Perfil };
export type GlobalAuthResponse = AuthResponse & { conta: ContaGlobal; scope?: 'global' | 'condominio'; usuario?: Usuario | null; vinculos?: Vinculo[] };

export function validarVinculos(value: unknown): value is Vinculo[] {
  return Array.isArray(value) && value.every((item) => item && Number.isInteger(item.usuario_id)
    && item.usuario_id > 0 && Number.isInteger(item.condominio_id) && item.condominio_id > 0
    && typeof item.condominio_nome === 'string' && ['morador', 'portaria', 'sindico'].includes(item.perfil));
}

export function validarAutenticacao(value: unknown): value is GlobalAuthResponse {
  if (!value || typeof value !== 'object') return false;
  const response = value as GlobalAuthResponse;
  return validTokens(response) && response.token_type === 'bearer' && validarContaGlobal(response.conta)
    && validarContexto(response) && (response.vinculos === undefined || validarVinculos(response.vinculos));
}

export function validarContexto(response: GlobalAuthResponse): boolean {
  if (response.scope === 'condominio') return validarUsuario(response.usuario)
    && response.usuario.email === response.conta.email;
  return (response.scope === undefined || response.scope === 'global') && !response.usuario;
}

export function validarContaGlobal(value: unknown): value is ContaGlobal {
  if (!value || typeof value !== 'object') return false;
  const conta = value as ContaGlobal;
  return Number.isInteger(conta.id) && conta.id > 0 && typeof conta.email === 'string'
    && conta.email.length > 0 && conta.ativo === true && typeof conta.email_verificado_em === 'string'
    && Number.isFinite(Date.parse(conta.email_verificado_em));
}
type RequestOptions = RequestInit & { authenticated?: boolean; retryAuth?: boolean };

export class ApiError extends Error {
  constructor(message: string, public status: number, public retryAfter: number | null = null) {
    super(message);
    this.name = 'ApiError';
  }
}

function retryDelay(value: string | null) {
  if (!value) return null;
  const seconds = Number(value);
  const delay = Number.isFinite(seconds) ? seconds : (Date.parse(value) - Date.now()) / 1000;
  return Number.isFinite(delay) && delay > 0 ? Math.ceil(delay) : null;
}

function errorMessage(status: number, path: string, body: unknown) {
  if (path === '/auth/login' && status === 401) return 'E-mail ou senha inválidos.';
  if (path.startsWith('/auth/register/') || path.startsWith('/auth/password/setup/')) {
    if ((status === 401 || status === 410) && path.endsWith('/verify-otp')) return 'Código inválido ou expirado. Confira o código ou solicite outro.';
    if (status === 401 || status === 410) return 'Não foi possível solicitar a verificação. Tente novamente mais tarde.';
    if (status === 503) return 'O serviço de verificação está temporariamente indisponível. Tente novamente mais tarde.';
    if (status === 409) return 'Não foi possível concluir o cadastro. Tente entrar ou solicite um novo código.';
  }
  if (status === 503 && (path === '/auth/request-otp' || path === '/auth/verify-otp')) return 'O serviço de verificação está temporariamente indisponível. Tente novamente mais tarde.';
  if (status >= 500) return 'O servidor encontrou um problema. Tente novamente mais tarde.';
  if (status === 429) return 'Muitas tentativas. Tente novamente mais tarde.';
  if (status === 401) return path === '/auth/verify-otp'
    ? 'Código inválido ou expirado.' : 'Sessão expirada. Faça login novamente.';
  const detail = body && typeof body === 'object' ? (body as { detail?: unknown }).detail : null;
  // Do not render validation inputs, tracebacks or arbitrary response objects.
  if (typeof detail === 'string' && detail.length <= 300
    && !/[<>\n\r]|traceback|sqlalchemy|password|secret|token[=:]/i.test(detail)) return detail;
  if (status === 422 && Array.isArray(detail)) {
    const messages = detail.slice(0, 3).flatMap((item: unknown) => {
      if (!item || typeof item !== 'object') return [];
      const { msg } = item as { msg?: unknown };
      return typeof msg === 'string' && msg.length <= 150
        && !/[<>\n\r]|traceback|password|secret|token[=:]/i.test(msg) ? [msg] : [];
    });
    if (messages.length) return `Revise os dados informados: ${messages.join('; ')}`;
  }
  if (status === 400 || status === 422) return 'Revise os dados informados e tente novamente.';
  if (status === 403) return 'Seu usuário não tem permissão ou está inativo.';
  if (status === 404) return 'O recurso solicitado não foi encontrado.';
  return `A API respondeu com erro ${status}.`;
}

async function sendRequest(path: string, options: RequestInit, token: string | null, rawResponse = false) {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onAbort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  const headers = new Headers(options.headers);
  if (options.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  else headers.delete('Authorization');
  headers.delete('X-User-Profile');
  headers.delete('X-User-Phone');
  try {
    const response = await fetch(`${API_URL}${path}`, { ...options, headers, signal: controller.signal });
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      throw new ApiError(errorMessage(response.status, path, body), response.status, retryDelay(response.headers.get('Retry-After')));
    }
    if (rawResponse) return response;
    return response.status === 204 ? undefined : await response.json();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(options.signal?.aborted ? 'Solicitação cancelada.' : 'O servidor não respondeu a tempo. Tente novamente.');
    }
    if (error instanceof TypeError) throw new Error('Não foi possível conectar ao servidor.');
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', onAbort);
  }
}

let refreshing: { revision: number; promise: Promise<AuthResponse> } | null = null;

export function renovarSessao(): Promise<AuthResponse> {
  const session = getSession();
  const revision = sessionRevision();
  if (!session) return Promise.reject(new ApiError('Sessão expirada. Faça login novamente.', 401));
  if (refreshing?.revision === revision) return refreshing.promise;
  const promise = (async () => {
    try {
      const prefix = session.scope === 'global' ? '/auth/global' : '/auth';
      const response = await sendRequest(`${prefix}/refresh`, { method: 'POST', body: JSON.stringify({ refresh_token: session.refresh_token }) }, null) as GlobalAuthResponse;
      if (!validTokens(response) || response.token_type !== 'bearer' || (session.scope && (!validarContaGlobal(response.conta) || !validarContexto(response)))) {
        if (sessionRevision() === revision) setSession(null);
        throw new Error('Resposta de sessão inválida.');
      }
      if (sessionRevision() !== revision) {
        await sendRequest(`${prefix}/logout`, { method: 'POST', body: JSON.stringify({ refresh_token: response.refresh_token }) }, response.access_token).catch(() => {});
        throw new Error('A sessão foi alterada. Faça login novamente.');
      }
      setSession({ ...response, scope: response.scope ?? session.scope });
      return response;
    } catch (error) {
      if (sessionRevision() === revision && error instanceof ApiError && (error.status === 401 || error.status === 403)) setSession(null);
      throw error;
    } finally {
      if (refreshing?.revision === revision) refreshing = null;
    }
  })();
  refreshing = { revision, promise };
  return promise;
}

export async function apiRequest(path: string, options: RequestOptions = {}) {
  const { authenticated = true, retryAuth = true, ...init } = options;
  const session = authenticated ? getSession() : null;
  if (session?.scope === 'global' && !path.startsWith('/auth/global/')) throw new ApiError('É necessário um vínculo autorizado com um condomínio.', 403);
  try {
    return await sendRequest(path, init, session?.access_token ?? null);
  } catch (error) {
    if (!authenticated || !(error instanceof ApiError) || error.status !== 401) throw error;
    if (!session || !retryAuth) throw error;
    // A concurrent request may already have rotated the tokens.
    const latest = getSession();
    if (!latest) throw error;
    const token = latest.access_token !== session.access_token ? latest.access_token : (await renovarSessao()).access_token;
    if (getSession()?.scope === 'global' && !path.startsWith('/auth/global/'))
      throw new ApiError('É necessário um vínculo autorizado com um condomínio.', 403);
    try {
      return await sendRequest(path, init, token);
    } catch (retryError) {
      if (retryError instanceof ApiError && retryError.status === 401 && getSession()?.access_token === token) setSession(null);
      throw retryError;
    }
  }
}

export const solicitarOtp = (payload: OtpInput) => apiRequest('/auth/request-otp', { method: 'POST', authenticated: false, body: JSON.stringify(payload) }) as Promise<OtpResponse>;
export const verificarOtp = (payload: OtpVerifyInput) => apiRequest('/auth/verify-otp', { method: 'POST', authenticated: false, body: JSON.stringify(payload) }) as Promise<AuthResponse>;

// Registration has no tenant or profile; AuthContext establishes the global session.
// The backend keeps duplicate requests generic and creates accounts only on HTTP 201.
export async function solicitarCadastroOtp(email: string, senha: string, signal?: AbortSignal): Promise<{ retryAfter: number | null; codigo_mock?: string }> {
  const response = await sendRequest('/auth/register/request-otp', {
    method: 'POST', signal, body: JSON.stringify({ email: normalizarEmail(email), senha }),
  }, null, true) as Response;
  const body = await response.json().catch(() => null) as OtpResponse | null;
  return { retryAfter: retryDelay(response.headers.get('Retry-After')),
    ...(typeof body?.codigo_mock === 'string' ? { codigo_mock: body.codigo_mock } : {}) };
}

export async function verificarCadastroOtp(email: string, codigo: string, senha: string, definirSenha = false): Promise<GlobalAuthResponse> {
  const normalizado = normalizarEmail(email);
  const response = await sendRequest(definirSenha ? '/auth/password/setup/verify-otp' : '/auth/register/verify-otp', {
    method: 'POST', body: JSON.stringify({ email: normalizado, codigo, senha }),
  }, null, true) as Response;
  if (response.status === 202) throw new Error('A confirmação ainda está em processamento. Aguarde e tente novamente.');
  if (response.status !== (definirSenha ? 200 : 201)) throw new Error('Não foi possível confirmar a criação da conta. Tente entrar ou solicite um novo código.');
  const body = await response.json().catch(() => null);
  const conta = body?.conta;
  if (body?.token_type !== 'bearer' || !validTokens(body) || !conta
    || !Number.isInteger(conta.id) || conta.id <= 0 || conta.email !== normalizado
    || conta.ativo !== true || typeof conta.email_verificado_em !== 'string'
    || !Number.isFinite(Date.parse(conta.email_verificado_em))) {
    throw new Error('Não foi possível confirmar a criação da conta. Tente entrar ou solicite um novo código.');
  }
  if (!validarAutenticacao(body)) throw new Error('Contexto de autenticação inválido.');
  return body as GlobalAuthResponse;
}
export async function entrarComSenha(email: string, senha: string): Promise<GlobalAuthResponse> {
  const response = await sendRequest('/auth/login', { method: 'POST',
    body: JSON.stringify({ email: normalizarEmail(email), senha }) }, null) as GlobalAuthResponse;
  if (!response || response.token_type !== 'bearer' || !validTokens(response)
    || !validarAutenticacao(response) || response.conta.email !== normalizarEmail(email)) {
    throw new Error('Resposta de autenticação inválida.');
  }
  return response;
}

export async function reenviarCadastroOtp(email: string, signal?: AbortSignal): Promise<{ retryAfter: number | null; codigo_mock?: string }> {
  const response = await sendRequest('/auth/register/resend-otp', { method: 'POST', signal,
    body: JSON.stringify({ email: normalizarEmail(email) }) }, null, true) as Response;
  const body = await response.json().catch(() => null) as OtpResponse | null;
  return { retryAfter: retryDelay(response.headers.get('Retry-After')),
    ...(typeof body?.codigo_mock === 'string' ? { codigo_mock: body.codigo_mock } : {}) };
}

export async function solicitarDefinicaoSenha(email: string, senha: string, signal?: AbortSignal): Promise<{ retryAfter: number | null; codigo_mock?: string }> {
  const response = await sendRequest('/auth/password/setup/request-otp', { method: 'POST', signal,
    body: JSON.stringify({ email: normalizarEmail(email), senha }) }, null, true) as Response;
  const body = await response.json().catch(() => null) as OtpResponse | null;
  return { retryAfter: retryDelay(response.headers.get('Retry-After')),
    ...(typeof body?.codigo_mock === 'string' ? { codigo_mock: body.codigo_mock } : {}) };
}

export const obterContaGlobalAtual = () => apiRequest('/auth/global/me') as Promise<ContaGlobal>;
export const obterVinculos = async (): Promise<Vinculo[]> => {
  const response = await apiRequest('/auth/global/condominios');
  if (!validarVinculos(response)) throw new Error('Resposta de vínculos inválida. Tente novamente.');
  return response;
};
export const selecionarCondominio = (usuario_id: number) => apiRequest('/auth/global/select-condominio', {
  method: 'POST', retryAuth: false, body: JSON.stringify({ usuario_id }),
}) as Promise<GlobalAuthResponse>;
export const obterUsuarioAtual = (accessToken?: string) => (accessToken
  ? sendRequest('/me', {}, accessToken) : apiRequest('/me')) as Promise<Usuario>;
export async function encerrarSessao(session = getSession()): Promise<void> {
  if (!session) return;
  const prefix = session.scope === 'global' ? '/auth/global' : '/auth';
  const logout = (tokens: { access_token: string; refresh_token: string }) => sendRequest(`${prefix}/logout`, {
    method: 'POST', body: JSON.stringify({ refresh_token: tokens.refresh_token }),
  }, tokens.access_token);
  try { await logout(session); }
  catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    // Logout must revoke the refresh token even when its access token expired.
    // Never restore the local session while doing this cleanup.
    const tokens = await sendRequest(`${prefix}/refresh`, { method: 'POST', body: JSON.stringify({ refresh_token: session.refresh_token }) }, null) as AuthResponse;
    if (!validTokens(tokens) || tokens.token_type !== 'bearer') throw new Error('Resposta de sessão inválida.');
    await logout(tokens);
  }
}

export function validarUsuario(value: unknown): value is Usuario {
  if (!value || typeof value !== 'object') return false;
  const user = value as Usuario;
  return Number.isInteger(user.id) && user.id > 0 && Number.isInteger(user.condominio_id) && user.condominio_id > 0
    && typeof user.nome === 'string' && typeof user.telefone === 'string'
    && ['morador', 'portaria', 'sindico'].includes(user.perfil) && user.ativo === true;
}

export const listarUnidades = () => apiRequest('/unidades') as Promise<Unidade[]>;
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
