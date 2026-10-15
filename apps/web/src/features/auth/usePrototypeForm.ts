import { useEffect, useRef, useState, type FormEvent } from 'react';
import { validateAuthForm, type AuthFormKind, type FormErrors } from './validation';
import type { RegistrationRole } from './types';

// This hook validates presentation only. It never authenticates or sends a request.
export function usePrototypeForm(kind: AuthFormKind, role?: RegistrationRole) {
  const [errors, setErrors] = useState<FormErrors>({});
  const [status, setStatus] = useState<'idle' | 'checking' | 'unavailable'>('idle');
  const summaryRef = useRef<HTMLDivElement>(null);
  const submitting = useRef(false);
  useEffect(() => {
    if (Object.keys(errors).length) summaryRef.current?.focus();
  }, [errors]);
  useEffect(() => {
    if (status !== 'checking') return;
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        submitting.current = false;
        setStatus('unavailable');
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      submitting.current = false;
    };
  }, [status]);
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    const nextErrors = validateAuthForm(kind, new FormData(form), role);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setStatus('idle');
      return;
    }
    form.querySelectorAll<HTMLInputElement>('input[data-password]').forEach((input) => {
      input.value = '';
    });
    submitting.current = true;
    setStatus('checking');
  }
  return { errors, status, summaryRef, onSubmit };
}
