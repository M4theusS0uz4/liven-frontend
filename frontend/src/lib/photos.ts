const formatos = ['image/jpeg', 'image/png', 'image/webp'];
const limiteArquivo = 8 * 1024 * 1024;

export type AlteracaoFoto = File | null | undefined;

export function validarArquivoFoto(arquivo: File) {
  if (!formatos.includes(arquivo.type)) throw new Error('Escolha uma imagem JPEG, PNG ou WebP.');
  if (!arquivo.size || arquivo.size > limiteArquivo) throw new Error('Escolha uma imagem de até 8 MB.');
}

export async function prepararFoto(arquivo: File, dimensaoMaxima = 512) {
  const imagem = await createImageBitmap(arquivo).catch(() => {
    throw new Error('Não foi possível ler a imagem selecionada.');
  });
  try {
    const escala = Math.min(1, dimensaoMaxima / Math.max(imagem.width, imagem.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(imagem.width * escala));
    canvas.height = Math.max(1, Math.round(imagem.height * escala));
    const contexto = canvas.getContext('2d');
    if (!contexto) throw new Error('Este navegador não conseguiu preparar a foto.');
    contexto.fillStyle = '#fff';
    contexto.fillRect(0, 0, canvas.width, canvas.height);
    contexto.drawImage(imagem, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.8);
  } finally {
    imagem.close();
  }
}

export const dadosAlteracaoFoto = async (arquivo: AlteracaoFoto) =>
  arquivo === undefined ? {} : { foto: arquivo === null ? null : await prepararFoto(arquivo) };
