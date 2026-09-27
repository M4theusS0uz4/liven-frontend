import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Perfil = 'morador' | 'portaria' | 'sindico';

export type Usuario = {
  telefone: string;
  nome: string;
  perfil: Perfil;
};

export type Sessao = { usuario: Usuario; accessToken: string };

type AuthContextValue = {
  usuario: Usuario | null;
  accessToken: string | null;
  entrar: (usuario: Usuario) => void;
  autenticar: (sessao: Sessao) => void;
  sair: () => void;
};

const STORAGE_KEY = 'liven-usuario';
const TOKEN_KEY = 'liven-access-token';
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(() => {
    const salvo = localStorage.getItem(STORAGE_KEY);
    return salvo ? JSON.parse(salvo) : null;
  });
  const [accessToken, setAccessToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));

  const entrar = (novoUsuario: Usuario) => {
    setUsuario(novoUsuario);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(novoUsuario));
  };

  const autenticar = (sessao: Sessao) => {
    setUsuario(sessao.usuario);
    setAccessToken(sessao.accessToken);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessao.usuario));
    localStorage.setItem(TOKEN_KEY, sessao.accessToken);
  };

  const sair = () => {
    setUsuario(null);
    setAccessToken(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(TOKEN_KEY);
  };

  useEffect(() => {
    if (usuario) localStorage.setItem(STORAGE_KEY, JSON.stringify(usuario));
  }, [usuario]);

  const valor = useMemo(() => ({ usuario, accessToken, entrar, autenticar, sair }), [usuario, accessToken]);
  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const contexto = useContext(AuthContext);
  if (!contexto) throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  return contexto;
}