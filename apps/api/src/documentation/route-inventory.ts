import type { Application, Router } from 'express';
interface Layer {
  route?: { path: string | string[]; methods: Record<string, boolean> };
  handle?: { stack?: Layer[] };
}
const prefixes = new WeakMap<object, string>();
function stack(parent: Application | Router): Layer[] {
  const value = parent as unknown as { stack?: Layer[]; router?: { stack: Layer[] } };
  return value.stack ?? value.router?.stack ?? [];
}
/** Regista apenas o prefixo da montagem real; não replica métodos, permissões ou regras de negócio. */
export function mountRoutes(parent: Application | Router, prefix: string, child: Router) {
  (parent as Router).use(prefix || '/', child);
  const layer = stack(parent).at(-1);
  if (!layer) throw Error('Montagem de rotas indisponível.');
  prefixes.set(layer, prefix);
}
export interface ApiRoute {
  method: string;
  path: string;
}
export function apiRouteInventory(parent: Application | Router): ApiRoute[] {
  const result: ApiRoute[] = [];
  function walk(layers: Layer[], prefix: string) {
    for (const layer of layers) {
      if (layer.route) {
        for (const path of [layer.route.path].flat()) {
          if (typeof path !== 'string') throw Error('Rota sem contrato textual.');
          const full = (prefix + path).replace(/\/$/, '').replace(/:([A-Za-z]\w*)/g, '{$1}');
          if (!full.startsWith('/api/')) continue;
          for (const [method, active] of Object.entries(layer.route.methods))
            if (active) result.push({ method, path: full.slice(4) });
        }
      } else if (layer.handle?.stack) {
        const path = prefixes.get(layer);
        if (path === undefined) throw Error('Router sem prefixo documentado.');
        walk(layer.handle.stack, prefix + path);
      }
    }
  }
  walk(stack(parent), '');
  return [
    ...new Map(result.map((route) => [route.method + ':' + route.path, route])).values(),
  ].sort((a, b) => (a.path + a.method).localeCompare(b.path + b.method));
}
