import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const result = await build({
  stdin: { contents: "export * from './src/lib/api'; export * from './src/lib/session';", resolveDir: process.cwd() },
  bundle: true, write: false, format: 'esm', platform: 'node',
  define: { 'import.meta.env': JSON.stringify({ VITE_API_URL: 'http://api.test/api/v1' }) },
});
const lib = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });
const email = 'novo@example.com';
const senha = 'senha-de-teste-123';

test('password login returns original authorized user and tenant context', async () => {
  const usuario = { id: 7, email, nome: 'Morador autorizado', telefone: '5511999999999',
    condominio_id: 42, perfil: 'morador', ativo: true, unidade_id: 8, created_at: '2026-11-11T12:00:00Z' };
  globalThis.fetch = async () => new Response(JSON.stringify({
    access_token: 'tenant-context', refresh_token: 'x'.repeat(48), token_type: 'bearer', expires_in: 900,
    scope: 'condominio', usuario, vinculos: [{ usuario_id: 7, condominio_id: 42, condominio_nome: 'Autorizado', perfil: 'morador' }],
    conta: { id: 99, email, ativo: true, email_verificado_em: '2026-11-11T12:00:00Z' },
  }));
  const response = await lib.entrarComSenha(email, senha);
  assert.equal(response.usuario.id, 7);
  assert.equal(response.scope, 'condominio');
  assert.equal(response.usuario.condominio_id, 42);
  assert.equal(lib.validarContexto(response), true);
  assert.equal(lib.validarContexto({ ...response, usuario: null }), false);
  assert.equal(lib.validarContexto({ ...response, usuario: { ...usuario, perfil: 'admin' } }), false);
  assert.equal(lib.validarContexto({ ...response, scope: 'global' }), false);
});

test('tenant session permits /me and retains context during refresh', async () => {
  const usuario = { id: 7, email, nome: 'Morador autorizado', telefone: '5511999999999',
    condominio_id: 42, perfil: 'morador', ativo: true, unidade_id: 8, created_at: '2026-11-11T12:00:00Z' };
  lib.setSession({ access_token: 'tenant-context', refresh_token: 'x'.repeat(48), expires_in: 900, scope: 'condominio' });
  globalThis.fetch = async (url) => {
    if (url.endsWith('/auth/refresh')) return new Response(JSON.stringify({
      access_token: 'rotated', refresh_token: 'r'.repeat(48), expires_in: 900, token_type: 'bearer', scope: 'condominio', usuario,
      conta: { id: 99, email, ativo: true, email_verificado_em: '2026-11-11T12:00:00Z' },
    }));
    assert.ok(url.endsWith('/me'));
    return new Response(JSON.stringify(usuario));
  };
  assert.equal((await lib.obterUsuarioAtual()).id, 7);
  await lib.renovarSessao();
  assert.equal(lib.getSession().scope, 'condominio');
  lib.setSession(null);
});

test('tenant selection sends only server-authorized user identifier', async () => {
  lib.setSession({ access_token: 'global-context', refresh_token: 'x'.repeat(48), expires_in: 900, scope: 'global' });
  globalThis.fetch = async (url, options) => {
    assert.ok(url.endsWith('/auth/global/select-condominio'));
    assert.deepEqual(JSON.parse(options.body), { usuario_id: 7 });
    assert.equal(new Headers(options.headers).get('Authorization'), 'Bearer global-context');
    return new Response(JSON.stringify({ accepted: true }));
  };
  assert.equal((await lib.selecionarCondominio(7)).accepted, true);
  lib.setSession(null);
});

test('registration sends email and password without tenant, profile or Bearer and reads cooldown', async () => {
  lib.setSession({ access_token: 'existing', refresh_token: 'x'.repeat(48), expires_in: 900 });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://api.test/api/v1/auth/register/request-otp');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { email, senha });
    assert.equal(new Headers(options.headers).has('Authorization'), false);
    return new Response(null, { status: 204, headers: { 'Retry-After': '120' } });
  };
  assert.deepEqual(await lib.solicitarCadastroOtp(`  ${email.toUpperCase()}  `, senha), { retryAfter: 120 });
  assert.equal(lib.getSession().access_token, 'existing');
  lib.setSession(null);
});

test('registration does not invent response fields or require a JSON body', async () => {
  globalThis.fetch = async () => new Response(null, { status: 204 });
  assert.deepEqual(await lib.solicitarCadastroOtp(email, senha), { retryAfter: null });
});

test('verification returns the global session for AuthContext without persisting it in the HTTP service', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://api.test/api/v1/auth/register/verify-otp');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { email, codigo: '012345', senha });
    assert.equal(new Headers(options.headers).has('Authorization'), false);
    return new Response(JSON.stringify({ access_token: 'new', refresh_token: 'x'.repeat(48),
      token_type: 'bearer', expires_in: 900,
      conta: { id: 1, email, ativo: true, email_verificado_em: '2026-11-11T12:00:00Z' },
    }), { status: 201 });
  };
  const response = await lib.verificarCadastroOtp(email, '012345', senha);
  assert.equal(response.conta.email, email);
  assert.equal(response.access_token, 'new');
  assert.equal(lib.getSession(), null);
});

const globalResponse = () => ({ access_token: 'global-access', refresh_token: 'g'.repeat(48),
  token_type: 'bearer', expires_in: 900,
  conta: { id: 1, email, ativo: true, email_verificado_em: '2026-11-11T12:00:00Z' },
});

test('password login calls the real login endpoint without OTP, preserving password whitespace', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'http://api.test/api/v1/auth/login');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { email, senha: ` ${senha} ` });
    assert.equal(new Headers(options.headers).has('Authorization'), false);
    return new Response(JSON.stringify(globalResponse()));
  };
  const response = await lib.entrarComSenha(` ${email.toUpperCase()} `, ` ${senha} `);
  assert.equal(response.conta.email, email);
  assert.equal(lib.getSession(), null);
});

for (const status of [400, 401, 409, 422, 429]) {
  test(`password login handles HTTP ${status} without creating a session`, async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ detail: 'Revise os dados.' }), { status, headers: { 'Retry-After': '120' } });
    await assert.rejects(lib.entrarComSenha(email, senha), (error) => {
      assert.equal(error.status, status);
      if (status === 401) assert.equal(error.message, 'E-mail ou senha inválidos.');
      if (status === 429) assert.equal(error.retryAfter, 120);
      return true;
    });
    assert.equal(lib.getSession(), null);
  });
}

test('registration resend sends only email to the separate endpoint', async () => {
  globalThis.fetch = async (url, options) => {
    assert.ok(url.endsWith('/auth/register/resend-otp'));
    assert.deepEqual(JSON.parse(options.body), { email });
    return new Response(JSON.stringify({ detail: 'Solicitação recebida.' }));
  };
  await lib.reenviarCadastroOtp(email);
});

test('initial password setup uses its real request and verify contracts', async () => {
  globalThis.fetch = async (url, options) => {
    assert.ok(url.endsWith('/auth/password/setup/request-otp'));
    assert.deepEqual(JSON.parse(options.body), { email, senha });
    return new Response(JSON.stringify({ detail: 'Solicitação recebida.' }));
  };
  await lib.solicitarDefinicaoSenha(email, senha);
  globalThis.fetch = async (url, options) => {
    assert.ok(url.endsWith('/auth/password/setup/verify-otp'));
    assert.deepEqual(JSON.parse(options.body), { email, senha, codigo: '012345' });
    return new Response(JSON.stringify(globalResponse()), { status: 200 });
  };
  assert.equal((await lib.verificarCadastroOtp(email, '012345', senha, true)).conta.email, email);
  assert.equal(lib.getSession(), null);
});

test('global tokens survive reload without persisting an identity or tenant permissions', async () => {
  const values = new Map();
  globalThis.sessionStorage = { getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  lib.setSession({ ...globalResponse(), scope: 'global' });
  const persisted = JSON.parse(values.get('liven-session-v1'));
  assert.equal(persisted.scope, 'global');
  assert.equal(persisted.conta, undefined);
  assert.equal(persisted.condominio_id, undefined);
  assert.equal(persisted.perfil, undefined);
  const fresh = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text + '\n// reload').toString('base64')}`);
  assert.equal(fresh.getSession().scope, 'global');
  globalThis.fetch = async (url, options) => {
    assert.ok(url.endsWith('/auth/global/me'));
    assert.equal(new Headers(options.headers).get('Authorization'), 'Bearer global-access');
    return new Response(JSON.stringify(globalResponse().conta));
  };
  assert.equal((await fresh.obterContaGlobalAtual()).email, email);
  lib.setSession(null);
});

test('global account cannot send authenticated requests to condominium modules', async () => {
  lib.setSession({ ...globalResponse(), scope: 'global' });
  globalThis.fetch = async () => { assert.fail('Condominium API must not be called'); };
  await assert.rejects(lib.listarUnidades(), (error) => error.status === 403);
  lib.setSession(null);
});

test('global session rotates once on 401 and uses global refresh and logout', async () => {
  lib.setSession({ ...globalResponse(), access_token: 'old', scope: 'global' });
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push(url);
    if (url.endsWith('/auth/global/refresh')) return new Response(JSON.stringify(globalResponse()));
    if (url.endsWith('/auth/global/logout')) return new Response(null, { status: 204 });
    assert.ok(url.endsWith('/auth/global/me'));
    return new Headers(options.headers).get('Authorization') === 'Bearer old'
      ? new Response('{}', { status: 401 }) : new Response(JSON.stringify(globalResponse().conta));
  };
  assert.equal((await lib.obterContaGlobalAtual()).email, email);
  assert.equal(lib.getSession().scope, 'global');
  await lib.encerrarSessao();
  assert.equal(calls.filter((url) => url.endsWith('/auth/global/refresh')).length, 1);
  assert.ok(calls.at(-1).endsWith('/auth/global/logout'));
  lib.setSession(null);
});

test('expired global refresh clears the session', async () => {
  lib.setSession({ ...globalResponse(), scope: 'global' });
  globalThis.fetch = async (url) => {
    assert.ok(url.endsWith('/auth/global/refresh'));
    return new Response('{}', { status: 401 });
  };
  await assert.rejects(lib.renovarSessao());
  assert.equal(lib.getSession(), null);
});

for (const status of [401, 409, 410, 422, 429, 500, 503]) {
  test(`registration handles HTTP ${status} without authentication`, async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ detail: 'Revise os dados.' }), {
      status, headers: { 'Retry-After': '90' },
    });
    await assert.rejects(lib.verificarCadastroOtp(email, '012345', senha), (error) => {
      assert.equal(error.status, status);
      if (status === 401 || status === 410) assert.match(error.message, /Código inválido ou expirado/);
      if (status === 429) { assert.equal(error.retryAfter, 90); assert.match(error.message, /Muitas tentativas/); }
      if (status === 503) assert.match(error.message, /temporariamente indisponível/);
      return true;
    });
    assert.equal(lib.getSession(), null);
  });
}

test('generic request response permits OTP verification without claiming account creation', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ detail: 'Solicitação recebida.' }), { status: 200 });
  assert.deepEqual(await lib.solicitarCadastroOtp(email, senha), { retryAfter: null });
  assert.equal(lib.getSession(), null);
});

test('duplicate registration rejected by backend never completes or creates a session', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ detail: 'Código inválido ou expirado.' }), { status: 401 });
  await assert.rejects(lib.verificarCadastroOtp(email, '012345', senha), /Código inválido ou expirado/);
  assert.equal(lib.getSession(), null);
});

for (const status of [200, 204, 201]) {
  test(`HTTP ${status} without valid creation response cannot report success`, async () => {
    globalThis.fetch = async () => new Response(null, { status });
    await assert.rejects(lib.verificarCadastroOtp(email, '012345', senha), /Não foi possível confirmar/);
    assert.equal(lib.getSession(), null);
  });
}

test('pending verification does not report account creation', async () => {
  globalThis.fetch = async () => new Response(null, { status: 202 });
  await assert.rejects(lib.verificarCadastroOtp(email, '012345', senha), /em processamento/);
});

test('connection failure remains actionable and does not authenticate', async () => {
  globalThis.fetch = async () => { throw new TypeError('offline'); };
  await assert.rejects(lib.solicitarCadastroOtp(email, senha), /Não foi possível conectar/);
  assert.equal(lib.getSession(), null);
});


const globalAccount = { id: 1, email, ativo: true, email_verificado_em: '2026-11-11T12:00:00Z', created_at: '2026-11-11T12:00:00Z' };
const globalTokens = (token = 'global-access') => ({ access_token: token, refresh_token: 'r'.repeat(48), expires_in: 900, token_type: 'bearer', conta: globalAccount });

test('global session uses global me and refresh without a second OTP', async () => {
  lib.setSession({ ...globalTokens(), scope: 'global' });
  const paths = [];
  globalThis.fetch = async (url, options) => {
    paths.push(url);
    if (url.endsWith('/auth/global/refresh')) {
      assert.equal(new Headers(options.headers).has('Authorization'), false);
      return new Response(JSON.stringify(globalTokens('rotated-global')));
    }
    assert.ok(url.endsWith('/auth/global/me'));
    assert.equal(new Headers(options.headers).get('Authorization'), 'Bearer rotated-global');
    return new Response(JSON.stringify(globalAccount));
  };
  await lib.renovarSessao();
  assert.equal(lib.getSession().scope, 'global');
  assert.equal((await lib.obterContaGlobalAtual()).id, 1);
  assert.equal(paths.length, 2);
  lib.setSession(null);
});

test('global account cannot request tenant data or lose session through a tenant 401', async () => {
  lib.setSession({ ...globalTokens(), scope: 'global' });
  globalThis.fetch = async () => { throw new Error('Tenant endpoint must not be called'); };
  await assert.rejects(lib.listarMoradores(), (error) => error.status === 403);
  assert.equal(lib.getSession().scope, 'global');
  lib.setSession(null);
});

test('global logout revokes the global refresh token', async () => {
  lib.setSession({ ...globalTokens(), scope: 'global' });
  const saved = lib.getSession();
  lib.setSession(null);
  globalThis.fetch = async (url, options) => {
    assert.ok(url.endsWith('/auth/global/logout'));
    assert.equal(new Headers(options.headers).get('Authorization'), 'Bearer global-access');
    return new Response(null, { status: 204 });
  };
  await lib.encerrarSessao(saved);
  assert.equal(lib.getSession(), null);
});

test('invalid global refresh clears session instead of inventing a tenant identity', async () => {
  lib.setSession({ ...globalTokens(), scope: 'global' });
  globalThis.fetch = async () => new Response(JSON.stringify(globalTokens()).replace('"ativo":true', '"ativo":false'));
  await assert.rejects(lib.renovarSessao(), /Resposta de sessão inválida/);
  assert.equal(lib.getSession(), null);
});


test('revoked tenant context downgrades to onboarding without clearing the global session', async () => {
  lib.setSession({ access_token: 'old-context', refresh_token: 'x'.repeat(48), expires_in: 900, scope: 'condominio' });
  let tenantCalls = 0;
  globalThis.fetch = async (url) => {
    if (url.endsWith('/auth/refresh')) return new Response(JSON.stringify({
      access_token: 'onboarding', refresh_token: 'r'.repeat(48), token_type: 'bearer', expires_in: 900,
      scope: 'global', usuario: null, vinculos: [],
      conta: { id: 99, email, ativo: true, email_verificado_em: '2026-11-11T12:00:00Z' },
    }));
    tenantCalls++;
    return new Response('{}', { status: 401 });
  };
  await assert.rejects(lib.obterUsuarioAtual(), (error) => error.status === 403);
  assert.equal(tenantCalls, 1);
  assert.equal(lib.getSession().scope, 'global');
  assert.equal(lib.getSession().access_token, 'onboarding');
  lib.setSession(null);
});
