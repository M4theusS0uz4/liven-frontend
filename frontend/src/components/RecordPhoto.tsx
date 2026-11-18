import { ImageIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { obterFotoCadastro, type ColecaoFoto, type RegistroComFoto } from '../lib/api';
import { validarArquivoFoto, type AlteracaoFoto } from '../lib/photos';

type OrigemFoto = { colecao: ColecaoFoto; registro: RegistroComFoto };

export default function RecordPhoto({ origem, arquivo, fotoLocal, className = 'size-14' }: {
  origem?: OrigemFoto;
  arquivo?: AlteracaoFoto;
  fotoLocal?: string;
  className?: string;
}) {
  const colecao = origem?.colecao;
  const registro = origem?.registro;
  const [remota, setRemota] = useState<{ registro: RegistroComFoto; foto: string }>();
  const [local, setLocal] = useState<{ arquivo: File; url: string }>();

  useEffect(() => {
    if (!arquivo) return;
    const url = URL.createObjectURL(arquivo);
    setLocal({ arquivo, url });
    return () => URL.revokeObjectURL(url);
  }, [arquivo]);

  useEffect(() => {
    if (!colecao || !registro?.tem_foto || arquivo !== undefined) return;
    const controller = new AbortController();
    obterFotoCadastro(colecao, registro.id, controller.signal).then(
      ({ foto }) => { if (!controller.signal.aborted) setRemota({ registro, foto }); },
      () => {},
    );
    return () => controller.abort();
  }, [colecao, registro, arquivo]);

  const src = arquivo === undefined ? fotoLocal ?? (remota?.registro === registro ? remota?.foto : undefined)
    : arquivo && local?.arquivo === arquivo ? local.url : undefined;
  return src
    ? <img src={src} alt="" className={`${className} shrink-0 rounded-xl object-cover`} />
    : <span aria-hidden="true" className={`${className} grid shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600`}><ImageIcon size={20} /></span>;
}

export function PhotoPicker({ origem, fotoLocal, foto, onChange }: {
  origem?: OrigemFoto;
  fotoLocal?: string;
  foto: AlteracaoFoto;
  onChange: (foto: AlteracaoFoto) => void;
}) {
  const [erro, setErro] = useState('');
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-white p-3">
      <RecordPhoto origem={origem} arquivo={foto} fotoLocal={fotoLocal} />
      <div className="min-w-0 flex-1">
        <label className="block text-sm font-semibold text-slate-900">
          Foto <span className="font-normal text-slate-600">(opcional)</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => {
              const arquivo = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (!arquivo) return;
              try {
                validarArquivoFoto(arquivo);
                onChange(arquivo);
                setErro('');
              } catch (error) {
                setErro((error as Error).message);
              }
            }}
            className="mt-1 block w-full text-xs text-slate-700 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-100 file:px-2 file:py-2 file:font-semibold file:text-slate-900"
          />
        </label>
        {erro && <p role="alert" className="mt-1 text-xs text-red-800">{erro}</p>}
        {(foto || (foto === undefined && (origem?.registro.tem_foto || fotoLocal))) &&
          <button type="button" onClick={() => { onChange(null); setErro(''); }} className="mt-2 text-xs font-semibold text-red-800 hover:underline">Remover foto</button>}
      </div>
    </div>
  );
}
