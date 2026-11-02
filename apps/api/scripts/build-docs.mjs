import { readFile, mkdir, writeFile, cp } from 'node:fs/promises';
import { parse } from 'yaml';
import { URL } from 'node:url';
const source = new URL('../../../docs/api/openapi.yaml', import.meta.url),
  target = new URL('../dist/documentation/', import.meta.url);
const document = parse(await readFile(source, 'utf8'), { maxAliasCount: 1000 });
if (!document.openapi?.startsWith('3.') || !document.paths || !document.components?.schemas)
  throw Error('Contrato OpenAPI inválido.');
await mkdir(target, { recursive: true });
await writeFile(new URL('openapi.json', target), JSON.stringify(document));
await cp(new URL('../src/documentation/assets/', import.meta.url), new URL('assets/', target), {
  recursive: true,
});
