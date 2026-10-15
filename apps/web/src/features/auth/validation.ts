import type { RegistrationRole } from './types';

export type AuthFormKind = 'login' | 'registration' | 'recovery';
export type FormErrors = Record<string, string>;
export const DEMO_PASSWORD_MIN_LENGTH = 8;

export function validateAuthForm(
  kind: AuthFormKind,
  data: FormData,
  role: RegistrationRole = 'comprador',
): FormErrors {
  const value = (name: string) => String(data.get(name) ?? '');
  const errors: FormErrors = {};
  const required = (name: string, message: string) => {
    if (!value(name).trim()) errors[name] = message;
  };
  required('email', 'Introduz o teu email.');
  if (!errors.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value('email').trim()))
    errors.email = 'Introduz um email válido, como nome@exemplo.pt.';
  if (kind === 'recovery') return errors;
  required('password', 'Introduz uma palavra-passe.');
  if (kind === 'login') return errors;
  required('name', 'Introduz o teu nome.');
  if (!errors.password && value('password').length < DEMO_PASSWORD_MIN_LENGTH)
    errors.password = 'Usa pelo menos 8 caracteres nesta demonstração.';
  required('confirmPassword', 'Confirma a palavra-passe.');
  if (!errors.confirmPassword && value('confirmPassword') !== value('password'))
    errors.confirmPassword = 'As palavras-passe não coincidem.';
  if (role === 'produtor') {
    required('producerName', 'Introduz o nome público do produtor.');
    required('locality', 'Introduz a localidade do produtor.');
  }
  return errors;
}
