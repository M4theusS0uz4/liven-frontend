import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Run the real handlers and AuthProvider with deterministic hook scheduling.
// HTTP is always mocked; this does not replace browser interaction tests.
const result = await build({
  stdin: { contents: `export { AuthProvider } from './src/context/AuthContext';
    export { default as RegisterPage } from './src/pages/RegisterPage';
    export { default as LoginPage } from './src/pages/LoginPage';
    export { default as OtpCodeInput } from './src/components/OtpCodeInput';
    export * from './src/lib/session'; export * from './src/lib/api'; export * from './src/lib/otp';`, resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic',
  define: { 'import.meta.env': JSON.stringify({ VITE_API_URL: 'http://api.test/api/v1' }) },
  plugins: [{ name: 'hook-scheduler', setup(b) {
    b.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'jsx', namespace: 'fixture' }));
    b.onResolve({ filter: /^react$/ }, () => ({ path: 'hooks', namespace: 'fixture' }));
    b.onResolve({ filter: /^react-router-dom$/ }, () => ({ path: 'router', namespace: 'fixture' }));
    b.onResolve({ filter: /^lucide-react$/ }, () => ({ path: 'icons', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ contents: path === 'jsx' ? `export const jsx = (type, props) => ({type, props}); export const jsxs = jsx; export const Fragment = 'fragment';` : path === 'hooks' ? `
      export const createContext = () => ({ Provider: 'provider' });
      export const useContext = () => globalThis.scheduler.auth;
      export const useState = value => globalThis.scheduler.state(value);
      export const useRef = value => globalThis.scheduler.ref(value);
      export const useEffect = (fn, deps) => globalThis.scheduler.effect(fn, deps);
      export const useMemo = fn => fn();
      export const useCallback = fn => fn;
    ` : path === 'router' ? `export const useNavigate = () => path => globalThis.scheduler.paths.push(path); export const Link = 'a';`
      : `export const Mail = 'mail'; export const Eye = 'eye'; export const EyeOff = 'eyeoff';` }));
  } }],
});
const lib = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const originalFetch = globalThis.fetch;
const storage = () => { const map = new Map(); return { getItem: k => map.get(k) ?? null, setItem: (k,v) => map.set(k,v), removeItem: k => map.delete(k) }; };
Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: storage() });
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage() });
const instances = [];
beforeEach(() => { globalThis.fetch = async () => { throw new TypeError('Unexpected mocked HTTP request'); }; });
function harness(component, props = {}) {
  const h = { slots: [], cursor: 0, effects: [], paths: [], auth: null, dead: false, lateWrites: 0,
    state(initial) { const i = this.cursor++; if (!(i in this.slots)) this.slots[i] = typeof initial === 'function' ? initial() : initial;
      return [this.slots[i], value => { if (this.dead) this.lateWrites++; this.slots[i] = typeof value === 'function' ? value(this.slots[i]) : value; }]; },
    ref(initial) { const i = this.cursor++; return this.slots[i] ??= { current: initial }; },
    effect(fn, deps) { const i = this.cursor++; const old = this.slots[i]; if (!old || deps.some((v,j) => v !== old.deps[j])) { this.effects.push(() => { old?.cleanup?.(); this.slots[i] = { deps, cleanup: fn() }; }); } },
    render() { globalThis.scheduler = this; this.cursor = 0; const tree = component(props); this.effects.splice(0).forEach(fn => fn()); return tree; },
    unmount() { this.slots.forEach(slot => slot?.cleanup?.()); this.dead = true; },
  }; instances.push(h); return h;
}
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers });
const email = 'novo@example.com', senha = ' senha-original-123 ';
const response = () => ({ access_token: 'access', refresh_token: 'r'.repeat(48), token_type: 'bearer', expires_in: 900,
  scope: 'global', conta: { id: 1, email, ativo: true, email_verificado_em: '2026-11-11T12:00:00Z' }, vinculos: [] });
const settle = () => new Promise(resolve => setImmediate(resolve));
function nodes(tree) { if (!tree || typeof tree !== 'object') return []; return [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)]; }
const find = (tree, predicate) => nodes(tree).find(predicate);
function provider() { const h = harness(lib.AuthProvider, { children: null }); h.render(); return h; }
afterEach(() => { instances.splice(0).forEach(h => { if (!h.dead) h.unmount(); }); lib.setSession(null); globalThis.fetch = originalFetch; delete globalThis.scheduler; });

test('real AuthProvider confirms a new account, preserves tokens and logs out', async () => {
  lib.setSession(null); const h = provider(); let auth = h.render().props.value;
  globalThis.fetch = async (url, options) => {
    if (url.endsWith('/auth/register/verify-otp')) { assert.deepEqual(JSON.parse(options.body), { email, codigo: '012345', senha }); return json(response(), 201); }
    assert.ok(url.endsWith('/auth/global/logout')); return new Response(null, { status: 204 });
  };
  await auth.autenticarCadastro(email, '012345', senha);
  auth = h.render().props.value;
  assert.equal(auth.contaGlobal.email, email); assert.equal(auth.usuario, null);
  assert.equal(JSON.parse(sessionStorage.getItem('liven-session-v1')).scope, 'global');
  await auth.sair(); assert.equal(lib.getSession(), null);
  assert.equal(h.render().props.value.contaGlobal, null);
});

for (const action of ['unmount', 'logout', 'cancel']) test(`late login after ${action} cannot create a session and revokes returned tokens`, async () => {
  lib.setSession(null); const h = provider(); const auth = h.render().props.value;
  let resolve; let revoked = 0;
  globalThis.fetch = (url) => url.endsWith('/auth/login') ? new Promise(r => { resolve = r; }) : (revoked++, Promise.resolve(new Response(null, { status: 204 })));
  const controller = new AbortController();
  const pending = auth.autenticarSenha(email, senha, controller.signal);
  const rejected = assert.rejects(pending, /sessão foi alterada/);
  if (action === 'unmount') h.unmount(); else if (action === 'logout') await auth.sair(); else controller.abort();
  resolve(json(response())); await rejected;
  assert.equal(lib.getSession(), null); assert.equal(revoked, 1);
});

test('membership selection rejects malformed tokens without granting a role', async () => {
  lib.setSession(null); const h = provider(); const auth = h.render().props.value;
  lib.setSession({ ...response(), scope: 'global' });
  globalThis.fetch = async () => json({ scope: 'global', conta: response().conta });
  await assert.rejects(auth.escolherCondominio(7), /autenticação inválida/);
  assert.equal(lib.getSession(), null);
});

test('OTP field accepts pasted separators and preserves leading zeros', () => {
  let code; const tree = lib.OtpCodeInput({ value: '', onChange: value => { code = value; } });
  const input = find(tree, n => n.type === 'input'); let prevented = false;
  input.props.onPaste({ preventDefault() { prevented = true; }, clipboardData: { getData: () => '01 23-45' } });
  assert.equal(prevented, true); assert.equal(code, '012345');
  input.props.onChange({ target: { value: 'a01234567' } }); assert.equal(code, '012345');
});

test('registration handlers preserve password, release resend, isolate verification limits and ignore late completion', async () => {
  const realInterval = globalThis.setInterval; let tick;
  globalThis.setInterval = (fn, ms) => { tick = fn; return realInterval(fn, ms); };
  const realNow = Date.now; let now = realNow() + 1_000_000; Date.now = () => now;
  try {
    const h = harness(lib.RegisterPage); h.auth = { autenticarCadastro: async () => {} };
    let tree = h.render();
    find(tree, n => n.type === 'input').props.onChange({ target: { value: email } });
    const passwords = nodes(tree).filter(n => n.props?.label === 'Senha' || n.props?.label === 'Confirmar senha');
    passwords.forEach(n => n.props.onChange(senha)); tree = h.render();
    const calls = []; globalThis.fetch = async (url, options) => { calls.push([url, JSON.parse(options.body)]); return json({ detail: 'Solicitação recebida.' }, 200, { 'Retry-After': '2' }); };
    find(tree, n => n.type === 'form').props.onSubmit({ preventDefault() {} }); await settle(); tree = h.render();
    assert.deepEqual(calls[0][1], { email, senha });
    assert.ok(nodes(tree).some(n => String(n.props?.children).includes('não confirma a entrega')));
    let resend = find(tree, n => n.type === 'button' && String(n.props.children).startsWith('Reenviar'));
    assert.equal(resend.props.disabled, true);
    now += 2100; tick(); tree = h.render(); resend = find(tree, n => n.type === 'button' && n.props.children === 'Reenviar código');
    assert.equal(resend.props.disabled, false); resend.props.onClick(); await settle(); tree = h.render();
    assert.ok(calls[1][0].endsWith('/register/resend-otp')); assert.deepEqual(calls[1][1], { email });
    find(tree, n => n.props?.onChange && n.props?.value === '').props.onChange('012345'); tree = h.render();
    h.auth.autenticarCadastro = async (...args) => { assert.deepEqual(args.slice(0,4), [email, '012345', senha, false]); throw new lib.ApiError('Muitas tentativas.', 429, 5); };
    tree = h.render(); find(tree, n => n.type === 'form').props.onSubmit({ preventDefault() {} }); await settle();
    now += 2100; tick(); tree = h.render();
    assert.equal(find(tree, n => n.type === 'button' && n.props.children === 'Reenviar código').props.disabled, false);
    assert.equal(find(tree, n => n.type === 'button' && n.props.children === 'Confirmar código').props.disabled, true);
    now += 5100; tick(); let finish;
    h.auth.autenticarCadastro = () => new Promise(r => { finish = r; }); tree = h.render();
    find(tree, n => n.type === 'form').props.onSubmit({ preventDefault() {} }); h.unmount(); finish(); await settle();
    assert.equal(h.lateWrites, 0); assert.deepEqual(h.paths, []);
  } finally { Date.now = realNow; globalThis.setInterval = realInterval; }
});

test('membership response is validated at runtime', async () => {
  globalThis.fetch = async () => json({ vinculos: [] });
  await assert.rejects(lib.obterVinculos(), /vínculos inválida/);
});

test('password login handler redirects only while mounted', async () => {
  const h = harness(lib.LoginPage); let finish;
  h.auth = { erroSessao: '', autenticarSenha: (...args) => { assert.deepEqual(args.slice(0,2), [email, senha]); return new Promise(r => { finish = r; }); } };
  let tree = h.render();
  find(tree, n => n.type === 'input').props.onChange({ target: { value: email } });
  find(tree, n => n.props?.label === 'Senha').props.onChange(senha);
  tree = h.render(); const pending = find(tree, n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  finish(); await pending; assert.deepEqual(h.paths, ['/']);
  tree = h.render(); find(tree, n => n.props?.label === 'Senha').props.onChange(senha); tree = h.render();
  const late = find(tree, n => n.type === 'form').props.onSubmit({ preventDefault() {} });
  h.unmount(); finish(); await late; assert.equal(h.lateWrites, 0); assert.deepEqual(h.paths, ['/']);
});

for (const reason of ['inválido', 'expirado']) test(`registration ${reason} OTP never creates a session`, async () => {
  lib.setSession(null); const h = provider(); const auth = h.render().props.value;
  globalThis.fetch = async () => json({ detail: 'Código inválido ou expirado.' }, 401);
  await assert.rejects(auth.autenticarCadastro(email, '000000', senha), /Código inválido ou expirado/);
  assert.equal(lib.getSession(), null);
});

test('authorized tenant response establishes the original dashboard user after /me validation', async () => {
  lib.setSession(null); const h = provider(); const auth = h.render().props.value;
  const usuario = { id: 7, condominio_id: 42, email, telefone: '', nome: 'Pessoa autorizada', perfil: 'morador', ativo: true, unidade_id: null, created_at: '2026-11-11T12:00:00Z' };
  globalThis.fetch = async url => url.endsWith('/me') ? json(usuario) : json({ ...response(), scope: 'condominio', usuario });
  await auth.autenticarSenha(email, senha);
  assert.equal(h.render().props.value.usuario.id, 7); assert.equal(lib.getSession().scope, 'condominio');
  await settle();
});

test('request rejection is not mislabeled as an invalid OTP or expired session', async () => {
  globalThis.fetch = async () => json({ detail: 'Unauthorized' }, 401);
  await assert.rejects(lib.solicitarCadastroOtp(email, senha), error => error.status === 401 && /solicitar a verificação/.test(error.message));
});
