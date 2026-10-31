export interface PublicLocation {
  latitude: number;
  longitude: number;
  descricao: string;
}
export function parsePublicLocation(v: unknown): PublicLocation {
  if (!v || typeof v !== 'object') throw new Error('Localização pública inválida.');
  const p = v as Record<string, unknown>;
  if (
    typeof p.latitude !== 'number' ||
    !Number.isFinite(p.latitude) ||
    Math.abs(p.latitude) > 90 ||
    typeof p.longitude !== 'number' ||
    !Number.isFinite(p.longitude) ||
    Math.abs(p.longitude) > 180 ||
    typeof p.descricao !== 'string' ||
    !p.descricao.trim() ||
    p.descricao.length > 200
  )
    throw new Error('Localização pública inválida.');
  return { latitude: p.latitude, longitude: p.longitude, descricao: p.descricao };
}
export function mapLink(p: PublicLocation) {
  return `https://www.openstreetmap.org/?mlat=${p.latitude}&mlon=${p.longitude}#map=13/${p.latitude}/${p.longitude}`;
}
