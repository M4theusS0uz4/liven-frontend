type Props = { value: string; onChange: (value: string) => void; disabled?: boolean; label?: string };

export default function OtpCodeInput({ value, onChange, disabled, label = 'Código de verificação' }: Props) {
  return <label className="block min-w-0 text-sm font-bold text-slate-700">{label}
    <input required autoFocus type="text" autoComplete="one-time-code"
      inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6}
      disabled={disabled} value={value}
      onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
      onPaste={(event) => {
        event.preventDefault();
        onChange(event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6));
      }}
      placeholder="Digite o código de 6 dígitos"
      className="mx-auto mt-2 block w-full min-w-0 max-w-full rounded-xl border border-border bg-surface px-3 py-3 text-center text-xl outline-none transition placeholder:text-sm placeholder:font-normal focus:border-brand disabled:opacity-50" />
  </label>;
}
