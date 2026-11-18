import { Building2, DoorOpen, Map, Package, Play } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PasswordInput from '../components/PasswordInput';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api';
import { normalizarEmail } from '../lib/otp';

export default function LoginPage() {
  const { autenticarSenha, erroSessao, entrarModoDemonstracao } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);
  const ocupado = useRef(false);
  const podeDemonstrar = import.meta.env.DEV && ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const tentarEm = useRef(0);
  const lifetime = useRef(new AbortController());
  useEffect(() => {
    if (lifetime.current.signal.aborted) lifetime.current = new AbortController();
    return () => lifetime.current.abort();
  }, []);
  const entrar = async (event: FormEvent) => {
    event.preventDefault();
    if (ocupado.current) return;
    if (Date.now() < tentarEm.current) { setErro('Muitas tentativas. Aguarde antes de tentar novamente.'); return; }
    const signal = lifetime.current.signal;
    setErro('');
    let normalizado: string;
    try {
      normalizado = normalizarEmail(email);
      if (!senha || senha.length > 128) throw new Error('Informe sua senha.');
    } catch (error) { setErro((error as Error).message); return; }
    ocupado.current = true; setLoading(true);
    try {
      await autenticarSenha(normalizado, senha, signal);
      if (signal.aborted) return;
      setSenha(''); navigate('/', { replace: true });
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ApiError && error.status === 429) tentarEm.current = Date.now() + (error.retryAfter ?? 60) * 1000;
      setErro((error as Error).message);
    } finally { ocupado.current = false; if (!signal.aborted) setLoading(false); }
  };

  return (
    <main className="grid min-h-dvh bg-white lg:grid-cols-[minmax(0,1fr)_minmax(450px,.88fr)]">
      <aside className="login-showcase hidden flex-col justify-between gap-16 overflow-hidden px-12 py-11 text-white lg:flex xl:px-16">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-white text-[#10263d]"><Building2 size={21} aria-hidden="true" /></span>
          <span className="text-2xl font-bold tracking-tight">Liven</span>
        </div>

        <div>
          <p className="max-w-xl text-5xl font-bold leading-[1.08] tracking-tight xl:text-6xl">A operação do condomínio em um só lugar.</p>
          <ul className="mt-10 grid max-w-lg divide-y divide-white/15 border-y border-white/15">
            {[
              { icon: Map, label: 'Mapa interativo em 3D' },
              { icon: DoorOpen, label: 'Controle de acessos e visitantes' },
              { icon: Package, label: 'Recebimento e acompanhamento de entregas' },
            ].map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-4 py-4 text-sm font-medium text-sky-50">
                <Icon size={20} className="text-sky-300" aria-hidden="true" />
                {label}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <section className="mx-auto flex w-full max-w-[31rem] flex-col justify-center px-5 py-10 sm:px-9">
        <div className="mb-8 flex items-center gap-2 text-lg font-bold text-brand lg:hidden">
          <Building2 size={22} aria-hidden="true" /> Liven
        </div>
        <header className="mb-7">
          <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">Entrar no Liven</h1>
          <p className="mt-2 text-sm text-slate-600">Acesse sua conta com e-mail e senha.</p>
        </header>
        <div aria-busy={loading}>
          {(erro || erroSessao) && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro || erroSessao}</p>}
          <form onSubmit={entrar} className="space-y-5">
            <label className="block text-sm font-bold text-slate-700">
              E-mail
              <input required autoFocus type="email" autoComplete="username" maxLength={255} value={email} disabled={loading} onChange={(event) => setEmail(event.target.value)} placeholder="voce@seu-dominio.com" className="mt-2 block w-full rounded-xl border border-border bg-surface px-4 py-3 outline-none focus:border-brand" />
            </label>
            <PasswordInput label="Senha" value={senha} onChange={setSenha} disabled={loading} autoComplete="current-password" minLength={1} />
            <button disabled={loading} className="w-full rounded-xl bg-brand px-4 py-3 font-bold text-white transition hover:bg-[#115786] disabled:opacity-50">
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
          <p className="mt-5 text-center text-sm text-slate-600">
            Ainda não tem conta? <Link to="/register" className="font-bold text-brand hover:underline">Criar conta</Link>
          </p>
          <Link to="/password/setup" className="mt-3 block text-center text-sm font-semibold text-brand hover:underline">Já tinha uma conta sem senha? Definir senha</Link>
          {podeDemonstrar && (
            <button type="button" disabled={loading} onClick={() => { entrarModoDemonstracao(); navigate('/', { replace: true }); }} className="mt-8 flex w-full items-center gap-3 rounded-2xl border border-border bg-surface-hover p-4 text-left transition hover:border-brand/50 disabled:opacity-50">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-brand"><Play size={17} aria-hidden="true" /></span>
              <span className="min-w-0">
                <strong className="block text-sm font-bold text-slate-900">Acessar modo demonstração</strong>
                <span className="mt-0.5 block text-xs text-slate-600">Explore o painel e o mapa 3D com exemplos locais.</span>
              </span>
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
