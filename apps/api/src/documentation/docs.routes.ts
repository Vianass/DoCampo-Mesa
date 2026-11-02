import { Router } from 'express';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { documentedApi } from './openapi.js';
import type { ApiRoute } from './route-inventory.js';
const require = createRequire(import.meta.url),
  distribution = dirname(require.resolve('swagger-ui-dist/package.json'));
function asset(name: string) {
  const source = new URL('./assets/' + name, import.meta.url);
  return readFileSync(
    existsSync(source)
      ? source
      : new URL('../../src/documentation/assets/' + name, import.meta.url),
    'utf8',
  );
}
export function documentationRoutes(routes: ApiRoute[]) {
  const router = Router(),
    specification = documentedApi(routes);
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'",
    );
    next();
  });
  router.get(['/', ''], (_req, res) =>
    res
      .type('html')
      .send(
        `<!doctype html><html lang="pt-PT"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Do Campo à Mesa — API REST</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/api-docs/swagger-ui.css"><link rel="stylesheet" href="/api-docs/docs.css"></head><body><a class="skip-docs" href="#swagger-ui">Saltar para a documentação</a><header class="docs-intro"><p>Do Campo à Mesa · Documentação interativa</p><h1>Conhecer a API.</h1><p>Consulta contratos e testa pedidos neste ambiente. As escritas alteram dados reais deste servidor: utiliza apenas dados de teste num ambiente de revisão.</p><p>Introduz um JWT em <strong>Authorize</strong>. Fica apenas em memória e desaparece ao atualizar. Nunca uses credenciais de produção numa revisão local.</p><a href="/api-docs/openapi.json">Consultar OpenAPI 3 em JSON</a><p>Swagger UI: <a href="/api-docs/LICENSE">licença Apache 2.0</a>, <a href="/api-docs/NOTICE">avisos</a> e <a href="/api-docs/swagger-ui-bundle.js.LICENSE.txt">licenças do bundle</a>.</p></header><main id="swagger-ui" tabindex="-1"></main><script src="/api-docs/swagger-ui-bundle.js"></script><script src="/api-docs/initializer.js"></script></body></html>`,
      ),
  );
  router.get('/openapi.json', (_req, res) => res.json(specification));
  router.get('/initializer.js', (_req, res) => res.type('js').send(asset('initializer.js')));
  router.get('/docs.css', (_req, res) => res.type('css').send(asset('docs.css')));
  for (const file of ['swagger-ui.css', 'swagger-ui-bundle.js'])
    router.get('/' + file, (_req, res) => res.sendFile(join(distribution, file)));
  for (const file of ['LICENSE', 'NOTICE', 'swagger-ui-bundle.js.LICENSE.txt'])
    router.get('/' + file, (_req, res) => res.type('txt').sendFile(join(distribution, file)));
  // Apenas assets e avisos conhecidos; sem diretório estático ou inicializadores de exemplo.
  return router;
}
