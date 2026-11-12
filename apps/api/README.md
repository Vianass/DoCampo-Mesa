# API — Do Campo à Mesa

API REST real em Node.js, Express e TypeScript, com persistência MongoDB/Mongoose, autenticação JWT, autorização pelo estado atual da conta, checkout transacional, encomendas, leilões e moderação. Socket.IO notifica alterações após persistência; REST reconcilia o estado.

## Preparação e execução

Executar os comandos na raiz do monorepo. Requer Node.js 22.21.1 ou uma versão compatível de Node.js 24, npm 10+ e Docker com Compose. Instalar as versões do lockfile com `npm ci` numa cópia nova.

O [guia local](../../docs/delivery/local-execution.md) apresenta o percurso recomendado com contas fictícias e uma base isolada, incluindo os três papéis. Nesse modo, a API usa `http://127.0.0.1:3011/api` e Swagger `http://127.0.0.1:3011/api-docs/`.

Para desenvolvimento persistente, copiar [.env.example](.env.example) para `.env` apenas se este ainda não existir e preencher um `JWT_SECRET` aleatório de pelo menos 32 bytes. Configurar `MONGODB_URI`, `MONGODB_DB_NAME`, `CORS_ORIGINS` e a pasta externa de fotografias. Nunca publicar segredos. O frontend em `http://127.0.0.1:5173` exige essa origem exata em `CORS_ORIGINS`.

```sh
npm run mongo:dev:up --workspace @docampo/api
npm run dev --workspace @docampo/api
```

Por omissão: API em `http://127.0.0.1:3001/api`, saúde em `/api/health` e Swagger em `/api-docs/`. O replica set de desenvolvimento usa a porta 27018; o de teste usa 27019. Transações exigem replica set. A suite de integração não lê `.env` nem deve usar bases de desenvolvimento ou produção.

## Contrato e organização

- [OpenAPI](../../docs/api/openapi.yaml): contrato completo, incluindo propostas históricas identificadas como não implementadas; Swagger expõe apenas as operações efetivamente montadas.
- [Índice da API](../../docs/api/README.md): decisões, segurança, mapeamento e especificações de cada fase.
- [Compra de lotes vencedores](../../docs/api/phase-14.2-cart-auction-purchase.md): `GET` e `POST /api/auctions/:id/checkout`, exclusivos do vencedor autenticado. A confirmação transacional e idempotente cria uma encomenda de origem única e consome a reserva sem novo débito de stock; o encerramento do leilão não cria encomendas automaticamente.
- `src/modules/`: modelos, regras e serviços por domínio; `src/http/`: composição HTTP; `src/config/`, `src/database/` e os restantes módulos de infraestrutura mantêm responsabilidades separadas.
- `tests/unit/`, `tests/http/`, `tests/integration/` e fixtures: validação dos contratos, segurança e persistência real.
- `scripts/`: geração da documentação compilada e ferramentas explícitas de demonstração/manutenção. A preparação Cloud está inativa e não é necessária para execução local.

## Verificações e build

```sh
npm run mongo:test:up --workspace @docampo/api
npm run typecheck --workspace @docampo/api
npm run lint --workspace @docampo/api
npm run format:check --workspace @docampo/api
npm run build --workspace @docampo/api
npm test --workspace @docampo/api
```

Referência da Fase 14.2: **1 996 testes backend**. O comando de formatação usa explicitamente `../../.prettierignore`, abrangendo código e testes e excluindo `dist/`. O build gera JavaScript e documentação em `apps/api/dist/`; é obrigatório antes de `npm start --workspace @docampo/api`. Esse arranque compilado continua a exigir ambiente válido, MongoDB e configuração de segurança.

## Segurança e limites

Passwords novas usam Argon2id; hashes bcrypt anteriores continuam verificáveis. JWT HS256 depende de segredo de ambiente. Logout não revoga tokens antecipadamente. Contas inativas são bloqueadas e papéis/propriedade são verificados no backend. Não usar o seletor demonstrativo de papéis como autenticação.

Escritas HTTP na documentação interativa alteram a base atual: usar dados fictícios no ambiente isolado. Não há pagamentos bancários, recuperação real de palavra-passe por email ou armazenamento Cloud ativo. O adaptador de fotografias de desenvolvimento não é aceite em produção.

Os nove documentos da Fase 0 são históricos e permanecem intactos. As decisões e relatórios de fases anteriores continuam no [índice da API](../../docs/api/README.md), e as versões anteriores deste README permanecem no histórico Git. A [declaração de assistência de IA](../../README.md#bibliotecas-e-assistência-de-ia) aplica-se também à API.
