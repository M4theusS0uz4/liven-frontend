import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Compile the actual TypeScript modules in memory; no additional test dependency.
const result = await build({
  stdin: { contents: "export * from './src/lib/api'; export * from './src/lib/session'; export * from './src/lib/otp';", resolveDir: process.cwd() },
  bundle: true, write: false, format: 'esm', platform: 'node',
  define: { 'import.meta.env': JSON.stringify({ VITE_API_URL: 'http://api.test/api/v1' }) },
});
const lib = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const storage = () => {
  const values = new Map();
  return { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: (k) => values.delete(k), clear: () => values.clear() };
};
globalThis.sessionStorage = storage();
globalThis.localStorage = storage();
const originalFetch = globalThis.fetch;
const tokens = (access = 'access') => ({ access_token: access, refresh_token: `refresh-${access}-${'x'.repeat(40)}`, token_type: 'bearer', expires_in: 900 });
const otp = { email: 'morador@example.com', condominio_id: 1 };
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const headers = (options) => new Headers(options.headers);
beforeEach(() => { lib.setSession(null); sessionStorage.clear(); localStorage.clear(); });
after(() => { globalThis.fetch = originalFetch; });

test('normalizes email without removing aliases', () => {
  assert.equal(lib.normalizarEmail(' MORADOR@EXAMPLE.COM '), otp.email);
  assert.equal(lib.normalizarEmail('a.b+alias@example.com'), 'a.b+alias@example.com');
  for (const value of ['', 'abc', 'a@', 'a b@example.com']) assert.throws(() => lib.normalizarEmail(value));
});

test('masks the email destination including short local parts and aliases', () => {
  assert.equal(lib.mascararEmail('morador@example.com'), 'm***@example.com');
  assert.equal(lib.mascararEmail('a@example.com'), '***@example.com');
  assert.equal(lib.mascararEmail('a.b+alias@example.com'), 'a***@example.com');
  assert.equal(lib.mascararEmail(''), '***');
});

test('OTP service unavailability differs from internal errors without exposing server details', async () => {
  globalThis.fetch = async () => json({ detail: 'private diagnostic' }, 503);
  await assert.rejects(lib.solicitarOtp(otp), (error) => error.status === 503
    && error.message === 'O serviço de verificação está temporariamente indisponível. Tente novamente mais tarde.');
  await assert.rejects(lib.verificarOtp({ ...otp, codigo: '123456' }), /temporariamente indisponível/);
  globalThis.fetch = async () => json({ detail: 'private diagnostic' }, 500);
  await assert.rejects(lib.solicitarOtp(otp), (error) => error.status === 500
    && error.message === 'O servidor encontrou um problema. Tente novamente mais tarde.');
  assert.equal(lib.getSession(), null);
});

test('tenant is required, positive and configured rather than guessed', () => {
  assert.equal(lib.obterCondominioId('1'), 1);
  for (const value of [undefined, '', '0', '-1', '1.5', 'abc', '1e3']) assert.equal(lib.obterCondominioId(value), null);
});

test('mock code is backend supplied, development only, and six digits', () => {
  assert.equal(lib.codigoDemonstrativo({ codigo_mock: '093751' }, true), '093751');
  assert.equal(lib.codigoDemonstrativo({ codigo_mock: '093751' }, false), null);
  assert.equal(lib.codigoDemonstrativo({}, true), null);
  assert.equal(lib.codigoDemonstrativo({ codigo_mock: '123' }, true), null);
});

test('OTP request uses confirmed payload and no identity or Authorization headers', async () => {
  lib.setSession(tokens());
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://api.test/api/v1/auth/request-otp');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), otp);
    assert.equal(headers(options).get('Authorization'), null);
    assert.equal(headers(options).get('X-User-Profile'), null);
    assert.equal(headers(options).get('X-User-Phone'), null);
    return json({ detail: 'Solicitação recebida.', codigo_mock: '093751' });
  };
  assert.equal((await lib.solicitarOtp(otp)).codigo_mock, '093751');
});

test('unknown email returns generic accepted response without authenticating', async () => {
  globalThis.fetch = async () => json({ detail: 'Se o e-mail estiver cadastrado, um código será enviado.' });
  assert.equal((await lib.solicitarOtp(otp)).codigo_mock, undefined);
  assert.equal(lib.getSession(), null);
});

test('verification sends no profile, accepts server tokens, and does not persist before /me', async () => {
  globalThis.fetch = async (url, options) => {
    assert.ok(url.endsWith('/auth/verify-otp'));
    assert.deepEqual(JSON.parse(options.body), { ...otp, codigo: '093751' });
    assert.equal(headers(options).get('Authorization'), null);
    return json(tokens());
  };
  assert.equal((await lib.verificarOtp({ ...otp, codigo: '093751' })).access_token, 'access');
  assert.equal(lib.getSession(), null);
});

for (const description of ['incorrect code', 'expired code', 'inactive or unknown user']) {
  test(`${description}: OTP 401 never refreshes an existing session`, async () => {
    lib.setSession(tokens()); let calls = 0;
    globalThis.fetch = async (url) => { calls++; assert.ok(url.endsWith('/auth/verify-otp')); return json({ detail: 'Código inválido ou expirado.' }, 401); };
    await assert.rejects(lib.verificarOtp({ ...otp, codigo: '093751' }), (error) => error.status === 401 && error.message === 'Código inválido ou expirado.');
    assert.equal(calls, 1);
    assert.equal(lib.getSession().access_token, 'access');
  });
}

test('429 preserves Retry-After and a clear message', async () => {
  globalThis.fetch = async () => json({ detail: 'Tente novamente mais tarde.' }, 429, { 'Retry-After': '120' });
  await assert.rejects(lib.solicitarOtp(otp), (error) => error.status === 429 && error.retryAfter === 120 && /Muitas tentativas/.test(error.message));
});

test('changing UI flow cannot shorten the existing resend deadline', () => {
  const until = lib.adiarReenvio(120);
  assert.equal(lib.adiarReenvio(1), until);
  assert.equal(lib.proximoReenvio(), until);
});

for (const status of [400, 403, 422, 500]) {
  test(`HTTP ${status} is rejected and never creates a session`, async () => {
    globalThis.fetch = async () => json({ detail: 'Falha de validação.' }, status);
    await assert.rejects(lib.solicitarOtp(otp), (error) => error.status === status);
    assert.equal(lib.getSession(), null);
  });
}

test('safe backend errors are preserved but validation inputs and server traces are not rendered', async () => {
  globalThis.fetch = async () => json({ detail: 'Telefone inválido.' }, 400);
  await assert.rejects(lib.solicitarOtp(otp), /Telefone inválido/);
  globalThis.fetch = async () => json({ detail: [{ msg: 'invalid', input: 'private-value' }] }, 422);
  await assert.rejects(lib.solicitarOtp(otp), (error) => !error.message.includes('private-value'));
  globalThis.fetch = async () => json({ detail: 'Traceback SQLAlchemy password=private-value' }, 500);
  await assert.rejects(lib.solicitarOtp(otp), (error) => !error.message.includes('private-value'));
});

test('network failure remains a connection error', async () => {
  globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
  await assert.rejects(lib.solicitarOtp(otp), /Não foi possível conectar ao servidor/);
});

test('timeout also cancels requests with a caller-supplied signal', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  globalThis.fetch = async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  });
  const pending = assert.rejects(lib.apiRequest('/slow', { signal: new AbortController().signal }), /não respondeu a tempo/);
  t.mock.timers.tick(10000);
  await pending;
});

test('parallel protected 401s rotate refresh once and retry with the new Bearer token', async () => {
  lib.setSession(tokens('old')); let refreshes = 0;
  globalThis.fetch = async (url, options) => {
    if (url.endsWith('/auth/refresh')) {
      refreshes++;
      assert.equal(headers(options).get('Authorization'), null);
      assert.equal(JSON.parse(options.body).refresh_token, tokens('old').refresh_token);
      await new Promise((resolve) => setImmediate(resolve));
      return json(tokens('new'));
    }
    return headers(options).get('Authorization') === 'Bearer new' ? json([]) : json({}, 401);
  };
  await Promise.all([lib.listarUnidades(), lib.listarMoradores(), lib.listarEntregas()]);
  assert.equal(refreshes, 1);
  assert.equal(lib.getSession().access_token, 'new');
});

test('second 401 clears session with no refresh loop', async () => {
  lib.setSession(tokens('old')); let refreshes = 0;
  globalThis.fetch = async (url) => {
    if (url.endsWith('/auth/refresh')) { refreshes++; return json(tokens('new')); }
    return json({}, 401);
  };
  await assert.rejects(lib.listarUnidades());
  assert.equal(refreshes, 1); assert.equal(lib.getSession(), null);
});

test('invalid refresh removes session', async () => {
  lib.setSession(tokens());
  globalThis.fetch = async () => json({}, 401);
  await assert.rejects(lib.renovarSessao());
  assert.equal(lib.getSession(), null);
});

test('refresh network failure keeps tokens available for controlled retry', async () => {
  lib.setSession(tokens());
  globalThis.fetch = async () => { throw new TypeError('offline'); };
  await assert.rejects(lib.renovarSessao());
  assert.equal(lib.getSession().access_token, 'access');
});

test('logout sends Bearer and refresh token and accepts 204', async () => {
  lib.setSession(tokens());
  const saved = lib.getSession(); lib.setSession(null);
  globalThis.fetch = async (url, options) => {
    assert.ok(url.endsWith('/auth/logout'));
    assert.equal(headers(options).get('Authorization'), 'Bearer access');
    assert.equal(JSON.parse(options.body).refresh_token, tokens().refresh_token);
    return new Response(null, { status: 204 });
  };
  await lib.encerrarSessao(saved); assert.equal(lib.getSession(), null);
});

test('logout with expired access rotates then revokes without restoring local session', async () => {
  const saved = { ...tokens('old'), expires_at: 1 }; const paths = [];
  globalThis.fetch = async (url, options) => {
    paths.push(url.split('/').at(-1));
    if (url.endsWith('/refresh')) return json(tokens('new'));
    return headers(options).get('Authorization') === 'Bearer new' ? new Response(null, { status: 204 }) : json({}, 401);
  };
  await lib.encerrarSessao(saved);
  assert.deepEqual(paths, ['logout', 'refresh', 'logout']); assert.equal(lib.getSession(), null);
});

test('late refresh after logout cannot resurrect session and revokes its rotated token', async () => {
  lib.setSession(tokens('old')); let release; let revoked = false;
  globalThis.fetch = async (url) => {
    if (url.endsWith('/refresh')) return new Promise((resolve) => { release = () => resolve(json(tokens('new'))); });
    revoked = true; return new Response(null, { status: 204 });
  };
  const pending = assert.rejects(lib.renovarSessao(), /sessão foi alterada/);
  lib.setSession(null); release(); await pending;
  assert.equal(lib.getSession(), null); assert.equal(revoked, true);
});

for (const perfil of ['morador', 'portaria', 'sindico']) {
  test(`/me is the source of profile ${perfil}, requiring an active user and Bearer`, async () => {
    globalThis.fetch = async (url, options) => {
      assert.ok(url.endsWith('/me')); assert.equal(headers(options).get('Authorization'), 'Bearer verified-token');
      return json({ id: 1, ...otp, telefone: '5511999999901', nome: 'Usuário', perfil, ativo: true, unidade_id: null, created_at: '2026-11-04T00:00:00Z' });
    };
    const user = await lib.obterUsuarioAtual('verified-token');
    assert.equal(user.perfil, perfil); assert.ok(lib.validarUsuario(user));
    assert.equal(lib.validarUsuario({ ...user, ativo: false }), false);
    assert.equal(lib.validarUsuario({ ...user, perfil: 'admin' }), false);
  });
}

test('corrupted persisted session and legacy user JSON never authenticate', async () => {
  sessionStorage.setItem('liven-session-v1', '{broken');
  localStorage.setItem('liven-usuario', '{broken');
  const fresh = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text + '\n// fresh module').toString('base64')}`);
  assert.equal(fresh.getSession(), null);
  assert.equal(localStorage.getItem('liven-usuario'), null);
  assert.equal(sessionStorage.getItem('liven-session-v1'), null);
});

test('blocked storage safely falls back to in-memory tokens', () => {
  const previous = globalThis.sessionStorage;
  globalThis.sessionStorage = { setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  lib.setSession(tokens()); assert.equal(lib.getSession().access_token, 'access');
  lib.setSession(null); globalThis.sessionStorage = previous;
});


test('malformed refresh response cannot keep an invalid session alive', async () => {
  lib.setSession(tokens());
  globalThis.fetch = async () => json({ access_token: '', expires_in: -1 });
  await assert.rejects(lib.renovarSessao(), /Resposta de sessão inválida/);
  assert.equal(lib.getSession(), null);
});
