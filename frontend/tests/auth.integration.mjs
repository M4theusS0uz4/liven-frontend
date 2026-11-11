// Non-destructive smoke checks against the real API. Never creates a user or seed.
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const base = process.env.LIVEN_TEST_API_URL ?? 'http://localhost:8000/api/v1';
const email = process.env.LIVEN_TEST_UNKNOWN_EMAIL;
const tenant = Number(process.env.LIVEN_TEST_CONDOMINIO_ID);
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !Number.isSafeInteger(tenant) || tenant <= 0) {
  throw new Error('Defina LIVEN_TEST_UNKNOWN_EMAIL com um e-mail comprovadamente não cadastrado e LIVEN_TEST_CONDOMINIO_ID com um condomínio existente.');
}
const result = await build({
  stdin: { contents: "export * from './src/lib/api'; export * from './src/lib/session';", resolveDir: process.cwd() },
  bundle: true, write: false, format: 'esm', platform: 'node',
  define: { 'import.meta.env': JSON.stringify({ VITE_API_URL: base }) },
});
const api = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const schema = await fetch(new URL('/openapi.json', base)).then((response) => {
  assert.equal(response.status, 200); return response.json();
});
for (const [path, method] of [['/auth/request-otp', 'post'], ['/auth/verify-otp', 'post'], ['/me', 'get'], ['/auth/refresh', 'post'], ['/auth/logout', 'post']]) {
  assert.ok(schema.paths[`/api/v1${path}`]?.[method], `${method} ${path} missing`);
}
console.log('PASS: five authentication endpoints are present in live OpenAPI.');
const payload = { email, condominio_id: tenant };
const requested = await api.solicitarOtp(payload);
assert.equal(typeof requested.detail, 'string');
assert.equal(requested.codigo_mock, undefined);
assert.equal(api.getSession(), null);
console.log('PASS: unknown email receives a generic response and no session/mock code.');
await assert.rejects(api.verificarOtp({ ...payload, codigo: '000000' }), (error) => error.status === 401 && error.message === 'Código inválido ou expirado.');
console.log('PASS: verification for an unknown email is rejected without authentication.');
await assert.rejects(api.obterUsuarioAtual(), (error) => error.status === 401);
console.log('PASS: /me requires authentication.');
api.setSession({ access_token: 'invalid', refresh_token: 'invalid-'.repeat(8), expires_in: 900 });
await assert.rejects(api.renovarSessao(), (error) => error.status === 401);
assert.equal(api.getSession(), null);
console.log('PASS: invalid refresh is rejected and clears the session.');
console.log('Successful login, valid refresh/logout and each real profile remain unvalidated until active users are available.');
