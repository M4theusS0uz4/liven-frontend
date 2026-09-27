export type VisitAccessMethod = 'qr' | 'facial' | 'manual';
export type VisitAccessStatus = 'authorized' | 'inside' | 'exited' | 'denied';

export type VisitAccess = {
  id: number;
  nome: string;
  telefone: string;
  tipo: VisitAccessMethod;
  codigo: string;
  ativa: boolean;
  status: VisitAccessStatus;
  unidade: string;
  createdAt: string;
  autorizadoPor?: string;
  placa?: string;
  fotoNome?: string;
  fotoPreview?: string;
};

const STORAGE_KEY = 'liven-visitas';

export function carregarVisitas(): VisitAccess[] | null {
  try {
    const visitas = localStorage.getItem(STORAGE_KEY);
    return visitas ? JSON.parse(visitas) as VisitAccess[] : null;
  } catch {
    return null;
  }
}

export function salvarVisitas(visitas: VisitAccess[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(visitas));
}
