export const roles = ['comprador', 'produtor', 'administrador'] as const;
export type Role = (typeof roles)[number];
export type RegistrationRole = Exclude<Role, 'administrador'>;
export type DemoSession = { kind: 'visitor' } | { kind: 'demonstration'; role: Role };
export function isRole(value: unknown): value is Role {
  return roles.some((role) => role === value);
}
export const roleLabels: Record<Role, string> = {
  comprador: 'Comprador',
  produtor: 'Produtor',
  administrador: 'Administrador',
};

export interface AccountUser {
  readonly id: string;
  readonly nome: string;
  readonly email: string;
  readonly papeis: readonly Role[];
}
export type AccountSession =
  | { kind: 'visitor' }
  | {
      kind: 'authenticated';
      user: AccountUser;
      expiresAt: string;
      status: 'ready' | 'checking' | 'unavailable' | 'forbidden';
    };
