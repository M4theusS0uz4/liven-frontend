const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';

export async function apiRequest(path: string, options: RequestInit = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.detail ?? 'Não foi possível concluir a requisição.');
  }
  return response.json();
}
