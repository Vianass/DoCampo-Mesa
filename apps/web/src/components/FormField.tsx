import { useId, type InputHTMLAttributes } from 'react';
type FormFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
  labelHidden?: boolean;
};

export function FormField({
  label,
  hint,
  error,
  labelHidden = false,
  id,
  className = '',
  'aria-describedby': describedBy,
  ...props
}: FormFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const descriptions =
    [describedBy, hint ? `${fieldId}-hint` : undefined, error ? `${fieldId}-error` : undefined]
      .filter(Boolean)
      .join(' ') || undefined;
  return (
    <div className={`form-field ${className}`}>
      <label htmlFor={fieldId} className={`form-label ${labelHidden ? 'visually-hidden' : ''}`}>
        {label}
      </label>
      <input
        id={fieldId}
        className={`form-control ${error ? 'is-invalid' : ''}`}
        aria-describedby={descriptions}
        aria-invalid={error ? true : undefined}
        {...props}
      />
      {hint && (
        <p className="form-field__hint" id={`${fieldId}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="form-field__error" id={`${fieldId}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
