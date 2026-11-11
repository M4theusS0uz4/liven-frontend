import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError, encerrarSessao, obterUsuarioAtual, renovarSessao, validarUsuario, verificarOtp, type OtpVerifyInput, type Usuario } from '../lib/api';
import { getSession, sessionRevision, setSession, subscribeSession, validTokens } from '../lib/session';
import { entrarComSenha, obterContaGlobalAtual, obterVinculos, selecionarCondominio, validarContaGlobal, validarContexto, verificarCadastroOtp, type ContaGlobal, type GlobalAuthResponse, type Vinculo } from '../lib/api';

export type { Perfil, Usuario } from '../lib/api';

type AuthContextValue = {
  usuario: Usuario | null;
  contaGlobal: ContaGlobal | null;
  vinculos: Vinculo[];
  escolherCondominio: (usuarioId: number) => Promise<void>;
  accessToken: string | null;
  carregando: boolean;
  erroSessao: string;
  revalidar: () => Promise<void>;
  autenticar: (payload: OtpVerifyInput) => Promise<void>;
  autenticarSenha: (email: string, senha: string) => Promise<void>;
  autenticarCadastro: (email: string, codigo: string, senha: string, definirSenha?: boolean) => Promise<void>;
  sair: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [contaGlobal, setContaGlobal] = useState<ContaGlobal | null>(null);
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const [session, updateSession] = useState(getSession);
  const [carregando, setCarregando] = useState(true);
  const [erroSessao, setErroSessao] = useState('');
  const operation = useRef(false);
  const mounted = useRef(true);
  const epoch = useRef(0);

  useEffect(() => subscribeSession(() => {
    const next = getSession();
    updateSession(next);
    if (!next) {
      setUsuario(null);
      setContaGlobal(null);
      setVinculos([]);
      setErroSessao('Sessão expirada. Faça login novamente.');
    }
  }), []);

  const revalidar = useCallback(async () => {
    if (operation.current) return;
    operation.current = true;
    const attempt = epoch.current;
    const startingScope = getSession()?.scope;
    setCarregando(true);
    setErroSessao('');
    try {
      const saved = getSession();
      if (!saved) return;
      if (saved.expires_at <= Date.now()) await renovarSessao();
      if (getSession()?.scope === 'global') {
        const conta = await obterContaGlobalAtual();
        if (!validarContaGlobal(conta)) {
          setSession(null);
          throw new Error('Conta inválida ou inativa. Faça login novamente.');
        }
        const choices = await obterVinculos();
        if (mounted.current && epoch.current === attempt && getSession()?.scope === 'global') {
          setUsuario(null); setContaGlobal(conta); setVinculos(choices);
        }
        return;
      }
      const user = await obterUsuarioAtual();
      if (!validarUsuario(user)) {
        setSession(null);
        throw new Error('Usuário inválido ou inativo. Faça login novamente.');
      }
      if (mounted.current && epoch.current === attempt && getSession()) {
        setUsuario(user); setContaGlobal(null); setVinculos([]);
      }
    } catch (error) {
      // Refresh may have removed a revoked tenant context while retaining the identity.
      if (startingScope !== 'global' && getSession()?.scope === 'global') {
        try {
          const conta = await obterContaGlobalAtual();
          const choices = await obterVinculos();
          if (validarContaGlobal(conta) && mounted.current && epoch.current === attempt && getSession()?.scope === 'global') {
            setUsuario(null); setContaGlobal(conta); setVinculos(choices); setErroSessao('');
            return;
          }
        } catch { /* Preserve the original error and offer a controlled retry. */ }
      }
      if (mounted.current && epoch.current === attempt) {
        setUsuario(null);
        setContaGlobal(null);
        setErroSessao((error as Error).message);
      }
    } finally {
      operation.current = false;
      if (mounted.current && epoch.current === attempt) setCarregando(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void revalidar();
    return () => { mounted.current = false; };
  }, [revalidar]);

  const checkedToken = useRef(session?.access_token);
  useEffect(() => {
    if (checkedToken.current !== session?.access_token) {
      checkedToken.current = session?.access_token;
      if (session) void revalidar();
    }
  }, [session, revalidar]);

  useEffect(() => {
    if (!session || (!usuario && !contaGlobal)) return;
    let canceled = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try { await renovarSessao(); if (!canceled) setErroSessao(''); }
      catch (error) {
        if (canceled) return;
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return;
        setErroSessao('Não foi possível renovar a sessão. Tentaremos novamente.');
        timer = setTimeout(() => void refresh(), 30000);
      }
    };
    timer = setTimeout(() => void refresh(), Math.max(1000, session.expires_at - Date.now() - 30000));
    return () => { canceled = true; clearTimeout(timer); };
  }, [session, usuario, contaGlobal]);

  const autenticarGlobal = useCallback(async (solicitar: () => Promise<GlobalAuthResponse>) => {
    if (operation.current) throw new Error('Aguarde a solicitação atual.');
    operation.current = true;
    const revision = sessionRevision();
    try {
      const response = await solicitar();
      try {
        if (!validarContexto(response)) throw new Error('Contexto de autenticação inválido.');
        const user = response.scope === 'condominio' ? await obterUsuarioAtual(response.access_token) : null;
        if (user && (!validarUsuario(user) || user.id !== response.usuario?.id || user.condominio_id !== response.usuario.condominio_id || user.perfil !== response.usuario.perfil))
          throw new Error('Vínculo inválido ou revogado.');
        if (!mounted.current || revision !== sessionRevision()) throw new Error('A sessão foi alterada. Faça login novamente.');
        setSession({ ...response, scope: response.scope ?? 'global' });
        setUsuario(user);
        setContaGlobal(user ? null : response.conta);
        setVinculos(response.vinculos ?? []);
        setErroSessao('');
      } catch (error) {
        await encerrarSessao({ ...response, scope: response.scope ?? 'global', expires_at: Date.now() + response.expires_in * 1000 }).catch(() => {});
        if (revision === sessionRevision()) setSession(null);
        throw error;
      }
    } finally { operation.current = false; }
  }, []);

  const autenticarCadastro = useCallback((email: string, codigo: string, senha: string, definirSenha = false) =>
    autenticarGlobal(() => verificarCadastroOtp(email, codigo, senha, definirSenha)), [autenticarGlobal]);
  const autenticarSenha = useCallback((email: string, senha: string) =>
    autenticarGlobal(() => entrarComSenha(email, senha)), [autenticarGlobal]);
  const escolherCondominio = useCallback((usuarioId: number) =>
    autenticarGlobal(() => selecionarCondominio(usuarioId)), [autenticarGlobal]);

  const autenticar = useCallback(async (payload: OtpVerifyInput) => {
    if (operation.current) throw new Error('Aguarde a solicitação atual.');
    operation.current = true;
    const revision = sessionRevision();
    try {
      const tokens = await verificarOtp(payload);
      if (!validTokens(tokens) || tokens.token_type !== 'bearer') throw new Error('Resposta de sessão inválida.');
      try {
        const user = await obterUsuarioAtual(tokens.access_token);
        if (!validarUsuario(user) || user.condominio_id !== payload.condominio_id) throw new Error('Usuário inválido, inativo ou de outro condomínio.');
        if (!mounted.current || revision !== sessionRevision()) throw new Error('A sessão foi alterada. Solicite um novo código.');
        setSession(tokens);
        setUsuario(user);
        setContaGlobal(null);
        setErroSessao('');
      } catch (error) {
        // Verification consumed the OTP, but /me did not establish a valid session.
        await encerrarSessao({ ...tokens, expires_at: Date.now() + tokens.expires_in * 1000 }).catch(() => {});
        throw error;
      }
    } finally { operation.current = false; }
  }, []);

  const sair = useCallback(async () => {
    epoch.current += 1;
    const saved = getSession();
    setSession(null);
    setUsuario(null);
    setContaGlobal(null);
    setVinculos([]);
    setCarregando(false);
    setErroSessao('');
    try { await encerrarSessao(saved); }
    catch { setErroSessao('Sessão removida deste navegador. Não foi possível confirmar a revogação no servidor.'); }
  }, []);

  const valor = useMemo(() => ({ usuario, contaGlobal, vinculos, escolherCondominio, accessToken: session?.access_token ?? null, carregando, erroSessao, revalidar, autenticar, autenticarCadastro, autenticarSenha, sair }), [usuario, contaGlobal, vinculos, escolherCondominio, session, carregando, erroSessao, revalidar, autenticar, autenticarCadastro, autenticarSenha, sair]);
  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const contexto = useContext(AuthContext);
  if (!contexto) throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  return contexto;
}
