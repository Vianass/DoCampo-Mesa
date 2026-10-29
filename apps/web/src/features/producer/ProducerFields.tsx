import {
  useEffect,
  useId,
  useRef,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
export function ProducerSelect({
  label,
  error,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string }) {
  const id = useId();
  return (
    <div className="producer-field">
      <label htmlFor={id}>{label}</label>
      <select
        {...props}
        id={id}
        className="form-select"
        aria-invalid={!!error}
        aria-describedby={error ? id + '-error' : undefined}
      >
        {children}
      </select>
      {error && (
        <p id={id + '-error'} className="producer-field-error">
          {error}
        </p>
      )}
    </div>
  );
}
export function ProducerTextarea({
  label,
  error,
  hint,
  'aria-describedby': describedBy,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string; hint?: string }) {
  const id = useId();
  return (
    <div className="producer-field">
      <label htmlFor={id}>{label}</label>
      <textarea
        {...props}
        id={id}
        className="form-control"
        aria-invalid={!!error}
        aria-describedby={
          [describedBy, hint ? id + '-hint' : undefined, error ? id + '-error' : undefined]
            .filter(Boolean)
            .join(' ') || undefined
        }
      />
      {hint && (
        <p id={id + '-hint'} className="form-field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={id + '-error'} className="producer-field-error">
          {error}
        </p>
      )}
    </div>
  );
}
export function ProducerFormErrors({ errors }: { errors: object }) {
  const ref = useRef<HTMLDivElement>(null);
  const messages = Object.values(errors) as string[];
  useEffect(() => {
    if (messages.length) ref.current?.focus();
  }, [errors, messages.length]);
  return messages.length ? (
    <div className="producer-form-errors" role="alert" tabIndex={-1} ref={ref}>
      <p>Revê os campos antes de guardar.</p>
      <ul>
        {messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </div>
  ) : null;
}
