import { Camera, CameraOff, CheckCircle2, ScanFace, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

type Props = { onReady?: (file: File | null) => void };
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

export default function FacialCapture({ onReady }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [ativo, setAtivo] = useState(false);
  const [validando, setValidando] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [mensagem, setMensagem] = useState('');

  useEffect(() => {
    const video = videoRef.current;
    if (ativo && video && streamRef.current) {
      video.srcObject = streamRef.current;
      void video.play().catch(() => setMensagem('Não foi possível iniciar o vídeo. Verifique a permissão da câmera.'));
    }
  }, [ativo]);

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const definirArquivo = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setMensagem('Selecione um arquivo de imagem.');
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setMensagem('A imagem deve ter no máximo 5 MB.');
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setArquivo(file);
    setPreview(URL.createObjectURL(file));
    setMensagem('Imagem pronta. A validação é demonstrativa e não envia a foto ao backend.');
    onReady?.(file);
  };

  const iniciar = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMensagem('A câmera não está disponível. Use localhost/HTTPS ou anexe uma foto.');
      return;
    }
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      setArquivo(null);
      onReady?.(null);
      if (preview) URL.revokeObjectURL(preview);
      setPreview('');
      setAtivo(true);
      setMensagem('Câmera pronta. Posicione o rosto no centro.');
    } catch {
      setMensagem('Não foi possível acessar a câmera. Verifique a permissão ou anexe uma foto.');
    }
  };

  const parar = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setAtivo(false);
  };

  const capturar = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setMensagem('A câmera ainda está iniciando. Tente novamente em alguns segundos.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        setMensagem('Não foi possível capturar a imagem. Tente novamente.');
        return;
      }
      definirArquivo(new File([blob], `visita-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      parar();
    }, 'image/jpeg', 0.9);
  };

  return <div className="space-y-3 rounded-lg border border-border bg-surface-hover p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm font-bold text-slate-700">Foto da visita</span>
      <div className="flex gap-2">
        <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-bold text-slate-700"><Upload size={15}/>Anexar foto</button>
        <button type="button" onClick={ativo ? parar : iniciar} className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-bold text-slate-700">{ativo ? <CameraOff size={15}/> : <Camera size={15}/>} {ativo ? 'Cancelar câmera' : 'Tirar foto'}</button>
      </div>
    </div>
    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) definirArquivo(file); event.currentTarget.value = ''; }}/>
    {ativo && <div className="space-y-2"><video ref={videoRef} autoPlay muted playsInline className="h-48 w-full rounded-lg bg-slate-900 object-cover"/><button type="button" onClick={capturar} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-3 py-2 text-xs font-bold text-white"><ScanFace size={15}/>Capturar foto</button></div>}
    {preview && <div className="flex items-center gap-3"><img src={preview} alt="Prévia da foto da visita" className="h-16 w-16 rounded-lg object-cover"/><div className="min-w-0"><p className="flex items-center gap-1 text-sm font-bold text-emerald-700"><CheckCircle2 size={15}/>Foto selecionada</p><p className="truncate text-xs text-slate-500">{arquivo?.name}</p></div></div>}
    <p className="text-xs text-slate-500">{mensagem || 'Tire uma foto agora ou anexe uma imagem salva (máximo 5 MB). A validação é demonstrativa.'}</p>
  </div>;
}
