import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

type Props = { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; autoComplete?: 'new-password' | 'current-password'; minLength?: number };

export default function PasswordInput({ label, value, onChange, disabled, autoComplete = 'new-password', minLength = 8 }: Props) {
  const [visivel, setVisivel] = useState(false);
  return <div><label className="block text-sm font-bold text-slate-700">{label}
    <span className="relative mt-2 block">
      <input required type={visivel ? 'text' : 'password'} autoComplete={autoComplete} minLength={minLength} maxLength={128}
        disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)}
        className="block w-full min-w-0 rounded-xl border border-border bg-surface py-3 pl-4 pr-12 outline-none transition focus:border-brand disabled:opacity-50"/>
    </span></label>
    <div className="relative"><button type="button" disabled={disabled} aria-label={`${visivel ? 'Ocultar' : 'Mostrar'} ${label.toLowerCase()}`} aria-pressed={visivel}
      onClick={() => setVisivel((value) => !value)} className="absolute bottom-1 right-1 rounded-lg p-3 text-slate-500 hover:text-brand">{visivel ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div>
  </div>;
}
