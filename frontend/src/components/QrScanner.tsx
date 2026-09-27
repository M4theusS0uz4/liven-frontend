import { Camera, CameraOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

type BarcodeDetectorLike = { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>> };
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;
declare global { interface Window { BarcodeDetector?: BarcodeDetectorConstructor } }

type Props = { onDetected: (value: string) => void };

export default function QrScanner({ onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const callbackRef = useRef(onDetected);
  const [ativo, setAtivo] = useState(false);
  const [mensagem, setMensagem] = useState('');
  callbackRef.current = onDetected;

  useEffect(() => {
    if (!ativo) return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    let frame = 0;
    let cancelado = false;
    let lendo = false;
    const pararFluxo = () => {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setAtivo(false);
    };

    const detector = window.BarcodeDetector ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
    const ler = async () => {
      if (cancelado) return;
      if (!detector) {
        setMensagem('Este navegador não oferece leitura automática. Digite o código abaixo.');
        return;
      }
      if (!lendo && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        lendo = true;
        try {
          const [codigo] = await detector.detect(video);
          if (codigo?.rawValue) {
            callbackRef.current(codigo.rawValue);
            pararFluxo();
            return;
          }
        } catch {
          setMensagem('Não foi possível ler este QR Code. Você também pode informar o código manualmente.');
        } finally {
          lendo = false;
        }
      }
      if (!cancelado) frame = window.requestAnimationFrame(() => void ler());
    };

    void video.play().then(() => {
      if (!cancelado) {
        setMensagem(detector ? 'Aponte a câmera para o QR Code.' : 'Digite o código abaixo para validar o convite.');
        frame = window.requestAnimationFrame(() => void ler());
      }
    }).catch(() => setMensagem('Não foi possível iniciar o vídeo da câmera.'));

    return () => {
      cancelado = true;
      window.cancelAnimationFrame(frame);
    };
  }, [ativo]);

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);

  const parar = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setAtivo(false);
  };

  const iniciar = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMensagem('Câmera indisponível neste contexto. Digite o código do convite.');
      return;
    }
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      setAtivo(true);
      setMensagem('Iniciando câmera...');
    } catch {
      setMensagem('Não foi possível acessar a câmera. Verifique a permissão ou digite o código do convite.');
    }
  };

  return <div className="space-y-2"><button type="button" onClick={ativo ? parar : iniciar} className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm font-bold text-slate-700">{ativo ? <CameraOff size={16}/> : <Camera size={16}/>} {ativo ? 'Parar câmera' : 'Ler QR Code'}</button>{ativo && <video ref={videoRef} autoPlay muted playsInline className="h-40 w-full rounded-lg bg-slate-900 object-cover"/>}{mensagem && <p className="text-xs text-slate-500">{mensagem}</p>}</div>;
}
