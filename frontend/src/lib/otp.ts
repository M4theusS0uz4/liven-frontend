// Validação simples da interface; o backend é a autoridade para formato e unicidade.
export function normalizarEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Informe um e-mail válido.');
  return email;
}

export function mascararEmail(value: string) {
  const separator = value.lastIndexOf('@');
  if (separator <= 0 || separator === value.length - 1) return '***';
  const local = value.slice(0, separator);
  return `${local.length > 1 ? local[0] : ''}***${value.slice(separator)}`;
}

export function obterCondominioId(value: string | undefined) {
  if (!value || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

export function codigoDemonstrativo(response: { codigo_mock?: string }, development: boolean) {
  return development && typeof response.codigo_mock === 'string' && /^\d{6}$/.test(response.codigo_mock)
    ? response.codigo_mock : null;
}

// UI cooldown only. The backend remains responsible for enforcing rate limits.
// Keep the deadline on email changes and route remounts; never store OTPs here.
let resendAt = 0;
export function proximoReenvio() { return resendAt; }
export function adiarReenvio(seconds: number) {
  resendAt = Math.max(resendAt, Date.now() + seconds * 1000);
  return resendAt;
}
