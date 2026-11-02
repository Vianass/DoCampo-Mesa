import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';
import type { ApiRoute } from './route-inventory.js';
type RecordValue = Record<string, unknown>;
export interface OpenApiDocument extends RecordValue {
  openapi: string;
  paths: Record<string, Record<string, RecordValue>>;
  components: { schemas: Record<string, RecordValue>; [key: string]: unknown };
}
export function sourceOpenApi(): OpenApiDocument {
  const compiled = new URL('./openapi.json', import.meta.url);
  if (existsSync(compiled)) return JSON.parse(readFileSync(compiled, 'utf8'));
  if (process.env.NODE_ENV === 'production')
    throw Error('Contrato OpenAPI compilado em falta. Executa o build.');
  return parse(
    readFileSync(new URL('../../../../docs/api/openapi.yaml', import.meta.url), 'utf8'),
    { maxAliasCount: 1000 },
  );
}
export function documentedApi(routes: ApiRoute[]): OpenApiDocument {
  const source = structuredClone(sourceOpenApi()),
    paths: OpenApiDocument['paths'] = {};
  for (const { path, method } of routes) {
    const operation = source.paths[path]?.[method];
    if (!operation || operation['x-contract-status'] === 'proposta-bloqueada')
      throw Error(`Contrato OpenAPI em falta: ${method.toUpperCase()} ${path}`);
    (paths[path] ??= {})[method] = operation;
  }
  source.paths = paths;
  source.servers = [{ url: '/api', description: 'API deste servidor; sem credenciais na URL.' }];
  source.info = {
    ...(source.info as RecordValue),
    title: 'Do Campo à Mesa — API REST',
    description:
      'Operações efetivamente montadas neste processo. JWT em Authorize, apenas em memória. Exemplos fictícios. Ações de escrita alteram a base de dados do ambiente atual.',
  };
  source['x-contract-status'] = 'operacoes-implementadas';
  const used = new Set<string>();
  function visit(value: unknown) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const row = value as RecordValue;
    if (typeof row.$ref === 'string') {
      if (!row.$ref.startsWith('#/'))
        throw Error('Referência externa não permitida no contrato público.');
      const parts = row.$ref
        .slice(2)
        .split('/')
        .map((p) => p.replaceAll('~1', '/').replaceAll('~0', '~'));
      let target: unknown = source;
      for (const p of parts) target = (target as RecordValue)?.[p];
      if (target === undefined) throw Error('Referência OpenAPI inválida.');
      if (!used.has(row.$ref)) {
        used.add(row.$ref);
        visit(target);
      }
    }
    Object.values(row).forEach(visit);
  }
  visit(paths);
  for (const [group, entries] of Object.entries(source.components)) {
    if (group === 'securitySchemes') continue;
    (source.components as Record<string, unknown>)[group] = Object.fromEntries(
      Object.entries(entries as Record<string, unknown>).filter(([name]) =>
        used.has('#/components/' + group + '/' + name),
      ),
    );
  }
  return source;
}
