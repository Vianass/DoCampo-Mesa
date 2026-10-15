import { useId, useState } from 'react';
import { FormField } from '../../components/FormField';

export function PasswordField({
  name = 'password',
  label = 'Palavra-passe',
  error,
  hint,
  registration = false,
}: {
  name?: string;
  label?: string;
  error?: string;
  hint?: string;
  registration?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  return (
    <div className="auth-password">
      <FormField
        id={id}
        name={name}
        label={label}
        type={visible ? 'text' : 'password'}
        autoComplete={registration ? 'new-password' : 'current-password'}
        data-password="true"
        required
        error={error}
        hint={hint}
      />
      <button
        type="button"
        className="auth-password__toggle"
        aria-controls={id}
        aria-pressed={visible}
        aria-label={`${visible ? 'Ocultar' : 'Mostrar'} ${label.toLocaleLowerCase('pt-PT')}`}
        onClick={() => setVisible((value) => !value)}
      >
        {visible ? 'Ocultar' : 'Mostrar'}
      </button>
    </div>
  );
}
