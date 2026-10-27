import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  validateAuthForm,
  validateAccountForm,
  type AuthFormKind,
  type FormErrors,
} from './validation';
import type { RegistrationRole } from './types';
import { demonstrationSite } from './demo-mode';
import { useAuth } from './useAuth';
import { authApi, authError } from './auth-api';
import { accountDestination } from '../private-area/navigation';
// Mantém a apresentação existente; a prévia nunca chama os endpoints reais.
export function usePrototypeForm(kind: AuthFormKind, role?: RegistrationRole) {
  const [errors, setErrors] = useState<FormErrors>({});
  const [status, setStatus] = useState<'idle' | 'checking' | 'unavailable' | 'success'>('idle');
  const summaryRef = useRef<HTMLDivElement>(null),
    submitting = useRef(false),
    request = useRef<AbortController | null>(null);
  const auth = useAuth(),
    navigate = useNavigate(),
    [params] = useSearchParams();
  const live = !demonstrationSite && kind !== 'recovery';
  useEffect(
    () => () => {
      request.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (Object.keys(errors).length) summaryRef.current?.focus();
  }, [errors]);
  useEffect(() => {
    if (status !== 'checking' || live) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        submitting.current = false;
        setStatus('unavailable');
      });
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
      submitting.current = false;
    };
  }, [status, live]);
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget,
      data = new FormData(form);
    const next = live
      ? validateAccountForm(kind as 'login' | 'registration', data)
      : validateAuthForm(kind, data, role);
    setErrors(next);
    if (Object.keys(next).length) {
      setStatus('idle');
      return;
    }
    form.querySelectorAll<HTMLInputElement>('input[data-password]').forEach((input) => {
      input.value = '';
    });
    submitting.current = true;
    setStatus('checking');
    if (!live) return;
    const controller = new AbortController();
    request.current = controller;
    const credentials = {
      email: String(data.get('email') ?? '')
        .trim()
        .toLowerCase(),
      password: String(data.get('password') ?? ''),
    };
    try {
      if (kind === 'registration') {
        await authApi.register(
          {
            ...credentials,
            nome: String(data.get('name') ?? '')
              .normalize('NFC')
              .trim(),
          },
          controller.signal,
        );
        if (!controller.signal.aborted) setStatus('success');
      } else {
        const user = await auth.login(credentials, controller.signal);
        if (!controller.signal.aborted) {
          setStatus('success');
          navigate(accountDestination(params.get('destino'), user.papeis), { replace: true });
        }
      }
    } catch (error) {
      if (
        !controller.signal.aborted &&
        !(error instanceof DOMException && error.name === 'AbortError')
      ) {
        setErrors({ form: authError(error) });
        setStatus('idle');
      }
    } finally {
      if (request.current === controller) submitting.current = false;
    }
  }
  return { errors, status, summaryRef, onSubmit };
}
