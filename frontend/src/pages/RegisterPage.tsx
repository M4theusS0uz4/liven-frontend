import { Mail } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PasswordInput from '../components/PasswordInput';
import OtpCodeInput from '../components/OtpCodeInput';
import { ApiError, solicitarCadastroOtp, reenviarCadastroOtp, solicitarDefinicaoSenha } from '../lib/api';
import { mascararEmail, normalizarEmail } from '../lib/otp';

// UI fallback only; the backend remains responsible for enforcing its limits.
let resendAt = 0;

export default function RegisterPage({ definirSenha = false }: { definirSenha?: boolean }) {
  const { autenticarCadastro } = useAuth();
  const navigate = useNavigate();
  const [etapa, setEtapa] = useState<'email' | 'codigo'>('email');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [destino, setDestino] = useState('');
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [loading, setLoading] = useState(false);
  const [agora, setAgora] = useState(Date.now);
  const [verificarEm, setVerificarEm] = useState(0);
  const ocupado = useRef(false);
  const ativo = useRef(true);
  const segundos = Math.max(0, Math.ceil((resendAt - agora) / 1000));

  useEffect(() => {
    ativo.current = true;
    const timer = setInterval(() => setAgora(Date.now()), 1000);
    return () => { ativo.current = false; clearInterval(timer); };
  }, []);

  const executar = async (verificar: boolean) => {
    if (ocupado.current || (verificar ? Date.now() < verificarEm : Date.now() < resendAt)) return;
    setErro(''); setAviso('');
    let normalizado: string;
    try {
      normalizado = normalizarEmail(verificar || etapa === 'codigo' ? destino : email);
      if (senha.length < 8 || senha.length > 128) throw new Error('A senha deve ter entre 8 e 128 caracteres.');
      if (senha !== confirmacao) throw new Error('As senhas não coincidem.');
      if (verificar && !/^\d{6}$/.test(codigo)) throw new Error('Informe o código de seis dígitos.');
    } catch (error) { setErro((error as Error).message); return; }
    ocupado.current = true; setLoading(true);
    try {
      if (verificar) {
        await autenticarCadastro(normalizado, codigo, senha, definirSenha);
        setSenha(''); setConfirmacao('');
        navigate('/', { replace: true });
      } else {
        const response = definirSenha ? await solicitarDefinicaoSenha(normalizado, senha)
          : etapa === 'codigo' ? await reenviarCadastroOtp(normalizado) : await solicitarCadastroOtp(normalizado, senha);
        resendAt = Math.max(resendAt, Date.now() + (response.retryAfter ?? 60) * 1000);
        if (ativo.current) {
          setDestino(normalizado); setCodigo(''); setAgora(Date.now()); setEtapa('codigo');
          setAviso(definirSenha ? 'Se esta conta puder definir uma senha, você receberá um código de verificação.' : 'Solicitação recebida. O código é enviado apenas para cadastro novo ou pendente. Se você já confirmou este e-mail, entre com sua senha. Uma solicitação aceita não confirma a entrega do e-mail.');
        }
      }
    } catch (error) {
      if (!ativo.current) return;
      if (error instanceof ApiError && error.status === 429) {
        const deadline = Date.now() + (error.retryAfter ?? 60) * 1000;
        resendAt = Math.max(resendAt, deadline);
        setVerificarEm(deadline); setAgora(Date.now());
      }
      setErro((error as Error).message);
    } finally { ocupado.current = false; if (ativo.current) setLoading(false); }
  };
  const enviar = (event: FormEvent) => { event.preventDefault(); void executar(etapa === 'codigo'); };
  const button = 'gradient-brand w-full rounded-xl px-4 py-3 font-black text-white transition-opacity disabled:opacity-50';

  return <main className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
    <section className="w-full max-w-md">
      <header className="mb-8"><h1 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">{etapa === 'codigo' ? 'Verifique seu e-mail' : definirSenha ? 'Definir senha' : 'Criar conta'}</h1>
        <p className="mt-2 text-slate-500">{etapa === 'email' ? 'Use seu e-mail e uma senha de pelo menos 8 caracteres.' : etapa === 'codigo' ? 'Informe o código de seis dígitos recebido.' : ''}</p></header>
      <div key={etapa} className="registration-step glass rounded-2xl p-6 sm:p-8" aria-busy={loading}>
          <form onSubmit={enviar} className="space-y-5">
            {etapa === 'email' ? <><label className="block text-sm font-bold text-slate-700">E-mail
              <input required autoFocus type="email" autoComplete="email" maxLength={255} value={email} disabled={loading}
                onChange={(event) => setEmail(event.target.value)} placeholder="voce@seu-dominio.com"
                className="mt-2 w-full rounded-xl border border-border bg-surface px-4 py-3 outline-none transition focus:border-brand disabled:opacity-50"/>
            </label>
              <PasswordInput label="Senha" value={senha} onChange={setSenha} disabled={loading}/>
              <PasswordInput label="Confirmar senha" value={confirmacao} onChange={setConfirmacao} disabled={loading}/>
            </> : <>
              <p className="flex items-center gap-3 rounded-xl bg-surface-hover p-3 text-sm text-slate-600"><Mail size={18} className="shrink-0 text-brand"/><span className="min-w-0 break-all">Verificação para {mascararEmail(destino)}</span></p>
              <OtpCodeInput value={codigo} onChange={setCodigo} disabled={loading}/>
            </>}
            <button className={button} disabled={loading || (etapa === 'email' ? segundos > 0 : agora < verificarEm)}>
              {loading ? 'Aguarde...' : etapa === 'email' ? segundos > 0 ? `Enviar código em ${segundos}s` : 'Enviar código de verificação' : 'Confirmar código'}
            </button>
          </form>
          {etapa === 'codigo' && <div className="mt-4 space-y-3 text-center">
            <button type="button" disabled={loading || segundos > 0} onClick={() => void executar(false)} className="block w-full text-sm font-bold text-brand disabled:opacity-50">{segundos > 0 ? `Reenviar código em ${segundos}s` : 'Reenviar código'}</button>
            <button type="button" disabled={loading} onClick={() => { setEtapa('email'); setCodigo(''); setErro(''); setAviso(''); }} className="block w-full text-sm font-bold text-brand disabled:opacity-50">Corrigir e-mail</button>
          </div>}
          {aviso && <p role="status" className="mt-4 text-sm text-slate-600">{aviso}</p>}
          {etapa === 'codigo' && !definirSenha && <p className="mt-3 text-sm text-slate-600">Conta antiga sem senha? <Link to="/password/setup" className="font-bold text-brand hover:underline">Definir senha com verificação de e-mail</Link></p>}
          {erro && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
      </div>
      <Link to="/login" className="mt-5 block text-center text-sm font-bold text-brand hover:underline">Já tenho uma conta — Entrar</Link>
    </section>
  </main>;
}
