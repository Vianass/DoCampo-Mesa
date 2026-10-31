import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, isAbsolute, relative } from 'node:path';
export interface ImageStorage {
  readonly publicBase: string;
  put: (id: string, bytes: Buffer) => Promise<void>;
  read: (id: string) => Promise<Buffer>;
}
/** Adaptador exclusivamente local. A futura implementação Cloud mantém esta porta. */
export function developmentImageStorage(
  directory: string,
  publicBase: string,
  production = false,
): ImageStorage {
  if (production) throw new Error('Armazenamento local de imagens proibido em produção.');
  if (!isAbsolute(directory)) throw new Error('A pasta de imagens tem de ser absoluta.');
  const root = resolve(directory),
    project = resolve(import.meta.dirname, '../../../../..');
  const fromProject = relative(project, root);
  if (!fromProject.startsWith('..')) throw new Error('Guardar imagens fora do repositório.');
  const url = new URL(publicBase);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('URL público de imagens inválido.');
  function path(id: string) {
    if (!/^[a-f0-9-]{36}\.webp$/.test(id)) throw new Error('Identificador de imagem inválido.');
    return resolve(root, id);
  }
  return {
    publicBase: publicBase.replace(/\/+$/, ''),
    async put(id, bytes) {
      await mkdir(root, { recursive: true, mode: 0o700 });
      await writeFile(path(id), bytes, { flag: 'wx', mode: 0o600 });
    },
    read: (id) => readFile(path(id)),
  };
}
