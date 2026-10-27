import { InvalidResponse } from './catalog-contract';
export class ApiFailure extends Error {
  constructor(
    readonly kind: 'network' | 'timeout' | 'http' | 'invalid' | 'configuration',
    readonly status?: number,
  ) {
    super(
      kind === 'timeout'
        ? 'O mercado demorou a responder. Tenta novamente.'
        : kind === 'invalid'
          ? 'Não foi possível apresentar estes dados. Tenta novamente mais tarde.'
          : kind === 'http' && status !== undefined && status < 500
            ? 'Não foi possível concluir a consulta. Revê os filtros ou tenta novamente.'
            : 'O mercado está temporariamente indisponível. Tenta novamente.',
    );
  }
}
export function apiBase(value: string = import.meta.env?.VITE_API_URL || '/api') {
  const base = value.replace(/\/+$/, '');
  if (base.startsWith('/') && !base.startsWith('//') && !/[?#\\]/.test(base)) return base;
  try {
    const url = new URL(base);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw Error();
    return base;
  } catch {
    throw new ApiFailure('configuration');
  }
}
export async function requestJson<T>(
  path: string,
  parse: (v: unknown) => T,
  signal?: AbortSignal,
  options: {
    base?: string;
    timeoutMs?: number;
    method?: 'GET' | 'POST';
    body?: unknown;
    bearer?: string;
    expectedStatus?: number;
  } = {},
): Promise<T> {
  const controller = new AbortController();
  let timeout = false;
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(() => {
    timeout = true;
    controller.abort();
  }, options.timeoutMs ?? 10000);
  try {
    const response = await fetch(apiBase(options.base) + path, {
      method: options.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(options.bearer ? { Authorization: 'Bearer ' + options.bearer } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      credentials: 'omit',
      signal: controller.signal,
    });
    if (!response.ok) throw new ApiFailure('http', response.status);
    if (
      response.status !== (options.expectedStatus ?? 200) ||
      !response.headers.get('content-type')?.toLowerCase().includes('application/json')
    )
      throw new InvalidResponse();
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new InvalidResponse();
    }
    try {
      return parse(value);
    } catch {
      throw new InvalidResponse();
    }
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Consulta cancelada.', 'AbortError');
    if (timeout) throw new ApiFailure('timeout');
    if (error instanceof ApiFailure) throw error;
    if (error instanceof InvalidResponse) throw new ApiFailure('invalid');
    throw new ApiFailure('network');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export function getJson<T>(
  path: string,
  parse: (value: unknown) => T,
  signal?: AbortSignal,
  options: { base?: string; timeoutMs?: number } = {},
) {
  return requestJson(path, parse, signal, options);
}
