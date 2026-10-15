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
