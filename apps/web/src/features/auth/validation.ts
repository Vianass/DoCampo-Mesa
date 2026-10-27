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

/** Política HTTP real: mínimo 15 no registo, até 128 pontos de código/512 bytes. */
export function validateAccountForm(kind: 'login' | 'registration', data: FormData): FormErrors {
  const value = (key: string) => String(data.get(key) ?? '');
  const errors: FormErrors = {};
  const email = value('email').trim();
  if (!email) errors.email = 'Introduz o teu email.';
  else if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    errors.email = 'Introduz um email válido, como nome@exemplo.pt.';
  const password = value('password'),
    length = [...password].length;
  if (!password) errors.password = 'Introduz uma palavra-passe.';
  else if (
    length > 128 ||
    new TextEncoder().encode(password).length > 512 ||
    password.includes('\0') ||
    /\p{Cs}/u.test(password)
  )
    errors.password = 'Usa até 128 caracteres válidos, sem caracteres nulos.';
  if (kind === 'registration') {
    const name = value('name').normalize('NFC').trim();
    if (!name || [...name].length > 120 || /[\p{Cc}\p{Cs}]/u.test(name))
      errors.name = 'Introduz um nome válido com até 120 caracteres.';
    if (!errors.password && length < 15)
      errors.password =
        'Usa pelo menos 15 caracteres. Não são exigidos símbolos ou combinações artificiais.';
    if (!value('confirmPassword')) errors.confirmPassword = 'Confirma a palavra-passe.';
    else if (value('confirmPassword') !== password)
      errors.confirmPassword = 'As palavras-passe não coincidem.';
  }
  return errors;
}
