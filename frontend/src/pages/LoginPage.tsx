import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PasswordInput from '../components/PasswordInput';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api';
import { normalizarEmail } from '../lib/otp';

export default function LoginPage() {
  const { autenticarSenha, erroSessao } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);
  const ocupado = useRef(false);
  const tentarEm = useRef(0);
  const entrar = async (event: FormEvent) => {
    event.preventDefault();
    if (ocupado.current) return;
    if (Date.now() < tentarEm.current) { setErro('Muitas tentativas. Aguarde antes de tentar novamente.'); return; }
    setErro('');
    let normalizado: string;
    try {
      normalizado = normalizarEmail(email);
      if (!senha || senha.length > 128) throw new Error('Informe sua senha.');
    } catch (error) { setErro((error as Error).message); return; }
    ocupado.current = true; setLoading(true);
    try {
      await autenticarSenha(normalizado, senha);
      setSenha(''); navigate('/', { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) tentarEm.current = Date.now() + (error.retryAfter ?? 60) * 1000;
      setErro((error as Error).message);
    } finally { ocupado.current = false; setLoading(false); }
  };
  return <main className="flex min-h-screen items-center justify-center bg-background px-5 py-10"><section className="w-full max-w-md">
    <header className="mb-8"><h1 className="text-4xl font-black tracking-tight text-slate-900">Entrar no Liven</h1><p className="mt-2 text-slate-500">Entre com seu e-mail e senha.</p></header>
    <div className="glass rounded-2xl p-6 sm:p-8" aria-busy={loading}>
      <form onSubmit={entrar} className="space-y-5">
        <label className="block text-sm font-bold text-slate-700">E-mail<input required autoFocus type="email" autoComplete="username" maxLength={255} value={email} disabled={loading} onChange={(event) => setEmail(event.target.value)} placeholder="voce@seu-dominio.com" className="mt-2 block w-full rounded-xl border border-border bg-surface px-4 py-3 outline-none focus:border-brand"/></label>
        <PasswordInput label="Senha" value={senha} onChange={setSenha} disabled={loading} autoComplete="current-password" minLength={1}/>
        <button disabled={loading} className="gradient-brand w-full rounded-xl px-4 py-3 font-black text-white disabled:opacity-50">{loading ? 'Entrando...' : 'Entrar'}</button>
      </form>
      {(erro || erroSessao) && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro || erroSessao}</p>}
      <Link to="/password/setup" className="mt-5 block text-center text-sm font-bold text-brand hover:underline">Já tinha uma conta sem senha? Definir senha</Link>
    </div>
    <p className="mt-5 text-center text-sm text-slate-500">Ainda não tem conta? <Link to="/register" className="font-bold text-brand hover:underline">Criar conta</Link></p>
  </section></main>;
}
