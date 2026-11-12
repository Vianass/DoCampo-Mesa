# Execução local e revisão académica

## Âmbito atual

A aplicação integra React, API Express, MongoDB e Socket.IO reais. Inclui catálogo, carrinho, checkout, encomendas, avaliações, candidaturas, gestão do produtor, administração e leilões. As rotas de demonstração estão identificadas e não concedem permissões na API.

Segundo os esclarecimentos do docente fornecidos para a Fase 14, deployment Cloud e Laravel são facultativos, o guia é orientativo e os mockups não são vinculativos. O backoffice é a área administrativa React. Os nove documentos da Fase 0 mantêm o texto original e representam a análise histórica; estas clarificações prevalecem na avaliação atual. Não foi realizado deployment nem ativado armazenamento Cloud.

## Preparar uma cópia nova

A Fase 14 está integrada em `main` no commit `204acb199a7181eb765f6ccd88505c7b8a7412f6`, que permanece como base das referências locais e remotas `main` e `feat/api-foundation`. Esta cópia contém a documentação da Fase 14.1 e as correções da Fase 14.2, já validadas localmente e ainda por consolidar em commit. Usar a versão efetivamente validada para a entrega.

É necessário Node.js 22.21.1 ou uma versão compatível de Node.js 24, npm 10 ou superior, Docker com Compose e Google Chrome para os testes Playwright configurados. Usar a raiz do repositório em todos os comandos deste guia.

Numa cópia nova, instalar as versões do lockfile:

```sh
npm ci
```

Não instalar novamente se as dependências já estiverem disponíveis. `npm ci` destina-se a uma cópia nova e repõe as versões do lockfile; não é um comando de atualização. A verificação de instalação da Fase 14.1 usa uma cópia isolada fora do repositório, preservando as dependências locais existentes.

## Revisão completa com dados fictícios isolados

Este é o percurso recomendado para o docente: fornece contas de comprador, produtor e administrador sem configurar segredos reais ou tocar na base de desenvolvimento. Usa os mesmos serviços da aplicação, uma base aleatória `docampo_test_web_*` no replica set de teste e fotografias numa pasta temporária. As permissões continuam a ser verificadas no backend. Os limites de pedidos são alargados pelo servidor de revisão; este servidor é exclusivo de teste, não uma configuração de produção.

Iniciar o MongoDB de teste:

```sh
npm run mongo:test:up --workspace @docampo/api
```

Num terminal, iniciar a API com esta combinação validada de cenários de revisão:

```sh
DOCAMPO_AUCTION_REVIEW=1 \
DOCAMPO_ADMIN_APPLICATION_REVIEW=1 \
DOCAMPO_REVIEWS_REVIEW=1 \
DOCAMPO_RECEIPT_REVIEW=1 \
node --import tsx apps/web/tests/support/real-api-server.mjs
```

Noutro terminal, iniciar o frontend real:

```sh
VITE_API_URL=http://127.0.0.1:3011/api npm run dev --workspace @docampo/web -- --port 5183
```

Abrir `http://127.0.0.1:5183`. A API está em `http://127.0.0.1:3011/api` e o Swagger em `http://127.0.0.1:3011/api-docs/`. Não executar as suites de integração enquanto estes servidores ocuparem as portas 3011 e 5183.

A API indica os caminhos absolutos dos ficheiros temporários de contas fictícias. Estes têm permissões `0600`, passwords aleatórias e nunca devem ser copiados para o repositório ou relatório. Usar as contas do mesmo cenário para as relações de encomendas e leilões correspondentes. O cenário de leilões fornece dois compradores e um produtor; o administrativo fornece administradores e candidatos; o cenário de receção fornece comprador, produtor e encomendas prontas. Para comprar, usar os produtos das contas desses cenários, com condições comerciais completas; o catálogo público inicial pode não ter local de levantamento. Não combinar indiscriminadamente outros modos antigos de revisão com este comando. As avaliações históricas do cenário de revisão são fictícias e não constituem dados de produção.

Cada arranque gera uma base, contas e ficheiros de credenciais próprios: usar os ficheiros indicados pelo servidor atualmente em execução, copiando o email e a palavra-passe do mesmo bloco. Não reutilizar ficheiros de sessões anteriores nem usar nomes de produtores como credenciais.

A sessão de revisão dura até 15 minutos, com token apenas em memória; atualizar a página exige novo login. Terminar os dois processos com `Ctrl+C`. O encerramento normal da API remove a base efémera da execução, incluindo os registos criados manualmente nessa base, fotografias e ficheiros de contas. Para dados duradouros, usar o modo de desenvolvimento persistente descrito abaixo; não reiniciar o ambiente como tentativa de corrigir credenciais. Uma interrupção forçada pode deixar dados de teste; não executar comandos de limpeza indiscriminados. Para parar o contentor de teste sem eliminar ficheiros ou volumes:

```sh
docker compose -f apps/api/compose.yaml --profile test stop mongo-test
```

## Percursos a demonstrar

| Papel            | Percurso e verificação                                                                                                                                                                                                                                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visitante        | `/`, `/produtos`, `/produtores`, `/leiloes`: pesquisar nome/ingrediente/produtor, combinar filtros, ordenar, paginar e abrir detalhes. O mapa de um perfil só carrega após escolha e quando existe um ponto público autorizado. A pesquisa dos leilões é explicitamente limitada à página carregada.                          |
| Comprador        | `/registo`, `/entrar`, `/area/comprador`, `/carrinho`, `/checkout`: verificar a cesta local independente por conta, escondida no logout e recuperada no novo login; importar a cesta de visitante apenas por confirmação explícita. Comprar produtos, consultar encomendas, confirmar a receção e avaliar compras concluídas. |
| Produtor         | `/area/produtor`: gerir produtos, fotografias, perfil, condições comerciais e limiares de stock; preparar encomendas; criar e acompanhar leilões; consultar indicadores próprios. Usar as contas produtoras aprovadas dos cenários.                                                                                           |
| Administrador    | `/area/administrador`: consultar utilizadores, aprovar/rejeitar candidaturas, supervisionar encomendas e leilões e moderar avaliações/conteúdos com motivo e auditoria. A supervisão não concede poderes operacionais sobre encomendas ou ofertas.                                                                            |
| Dois compradores | Abrir dois perfis de navegador ou uma janela normal e outra privada e acompanhar o mesmo lote com as contas do cenário. Os atalhos +5/+10/+25 € exigem confirmação. Após o fim, só o vencedor finaliza a compra em `/checkout/leilao/:id`, sem alterar a cesta normal; a encomenda associada segue para gestão do produtor.   |

Para uma demonstração automática curta de dois clientes Socket.IO reais, independente do navegador:

```sh
DOCAMPO_AUCTION_DEMO=1 npm run demo:auctions --workspace @docampo/api
```

Este comando usa exclusivamente MongoDB de teste, verifica o resultado persistido e encerra os recursos efémeros que criou.

## Desenvolvimento persistente

Para desenvolver fora do ambiente efémero, consultar também a [configuração da API](../../apps/api/README.md) e o [exemplo de ambiente](../../apps/api/.env.example). Se ainda não existir, copiar o exemplo para `apps/api/.env`, preservando qualquer configuração privada existente. Gerar localmente um segredo aleatório de pelo menos 32 bytes e preencher `JWT_SECRET`; nunca versionar ou publicar o valor. O comando seguinte só gera o segredo no terminal local:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Preparar o catálogo dedicado, sem modificar nem apagar registos existentes:

```sh
npm run mongo:dev:up --workspace @docampo/api
NODE_ENV=development node --import tsx scripts/seed-catalog.mjs
```

Iniciar API e frontend em terminais separados:

```sh
MONGODB_DB_NAME=docampo_dev_catalog CORS_ORIGINS=http://127.0.0.1:5173 npm run dev --workspace @docampo/api
```

```sh
npm run dev
```

Abrir `http://127.0.0.1:5173` e `http://127.0.0.1:3001/api-docs/`. O Vite encaminha `/api` e `/socket.io` para a API local. O seed público não fornece passwords reutilizáveis nem cria um administrador; para rever os três papéis, preferir o ambiente efémero anterior. O seed não corrige dados antigos: não inventar condições comerciais ou locais de levantamento que faltem a uma instalação anterior.

## Validações reproduzíveis

Com MongoDB de teste ativo e as portas 3011/5183 livres:

```sh
npm run typecheck
npm run typecheck --workspace @docampo/api
npm run lint
npm run format:check
npm run format:check --workspace @docampo/api
npm run build
npm run build --workspace @docampo/api
npm test --workspace @docampo/api
npx playwright test --workers=2
npx playwright test --config playwright.integration.config.ts
npx playwright test --config playwright.auctions.config.ts
git diff --check
```

Executar as três suites Playwright sequencialmente. As duas suites reais criam e encerram os seus próprios servidores e bases isoladas; não usam mocks como prova de integração. O build gera ficheiros ignorados em `dist/`, que não entram no Git. O comando de formatação da API utiliza explicitamente o ignore da raiz para excluir esses artefactos sem omitir os testes ou o código-fonte.

## Segurança, contratos e limites

- A auditoria da Fase 14 atualiza Mongoose de 9.11.2 para 9.11.4, com mquery 6.0.1 exigido por essa correção. A regressão isolada reproduz a alteração indevida de uma função herdada ao hidratar dados desconhecidos e confirma a proteção após a atualização; não demonstra exploração remota dos endpoints da aplicação. Ver os avisos do próprio projeto: [hidratação e propriedades herdadas](https://github.com/Automattic/mongoose/security/advisories/GHSA-8332-j7wj-wjw4) e [sanitização de filtros na ligação](https://github.com/Automattic/mongoose/security/advisories/GHSA-gg4r-jv3p-qx3c). Não foram atualizadas dependências sem relação com esta correção.
- A API autoriza pelo utilizador atual no MongoDB, incluindo estado ativo, papéis e propriedade. Escolher um papel na demonstração não autentica uma conta real.
- Tokens JWT ficam apenas em memória. Logout descarta o acesso no navegador, mas não revoga antecipadamente o token no servidor. Não há refresh token nem recuperação real de palavra-passe por email; a página de recuperação identifica a demonstração.
- Novas passwords usam Argon2id com 19 MiB, duas iterações e paralelismo 1; hashes bcrypt anteriores continuam verificáveis, sem aceitar truncagem acima de 72 bytes. A menção a bcrypt consta do guia orientativo, não justifica substituir o mecanismo aprovado. A escolha segue a [recomendação OWASP para armazenamento de passwords](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), consultada na Fase 14. Explicar esta diferença na defesa.
- Swagger publica as operações efetivamente montadas. `PATCH /api/orders/:id/estado` reutiliza os comandos existentes; `entregue` é traduzido para o estado persistido `concluida`, sem permitir que o produtor confirme a receção em nome do comprador. Escritas na documentação interativa alteram o ambiente atual; usar apenas a base de revisão.
- Quantias são inteiros em cêntimos, stock é validado no servidor e o checkout é transacional/idempotente. Pagamentos bancários e faturação não estão integrados.
- MongoDB decide a validade e a ordem das licitações. Socket.IO notifica depois do commit; REST recupera estado após desconexão. Não há promessa de entrega durável de todos os eventos nem suporte validado para múltiplas instâncias.
- Fotografias locais são validadas e normalizadas. O armazenamento de desenvolvimento não é aceite em produção; Cloud permanece facultativa e inativa. Não executar manutenção de órfãos como parte da revisão.
- A aplicação não comprova a entrega dos elementos externos: relatório académico até 20 páginas, vídeo até 5 minutos, partilha com o docente e defesa individual. O relatório técnico da auditoria não substitui automaticamente esses elementos.

O projeto utiliza bibliotecas e assistência de IA, declaradas no [README](../../README.md). O estudante é responsável por rever, compreender e explicar a implementação e deve incluir essa declaração no relatório académico.

## Resolução de problemas e dependências locais

- **MongoDB indisponível ou erro de transação:** confirmar que Docker está ativo e que o serviço `mongo-test` iniciou com o replica set previsto. Não apontar os testes para outra base nem eliminar volumes para resolver o erro.
- **Portas ocupadas:** parar apenas os processos de revisão próprios antes das suites reais. Não executar simultaneamente os dois conjuntos de integração nas portas 3011 e 5183.
- **HTTP 401 após atualizar a página:** a sessão é apenas em memória; iniciar sessão novamente. Contas desativadas, tokens expirados e alterações de papéis continuam sujeitos à autorização backend.
- **Fotografia ou build em falta:** os recursos originais estão em `apps/web/public/`; `dist/` é regenerado por `npm run build` e pelo build da API. `npm start` da API exige esse build. `vite preview` não fornece o proxy de desenvolvimento para a API.
- **Chrome indisponível:** instalar Google Chrome localmente ou selecionar um canal já instalado com `PLAYWRIGHT_CHANNEL`. A instalação npm não instala automaticamente o navegador configurado.
- **Avisos npm:** a auditoria de produção não identificou vulnerabilidades conhecidas na verificação da Fase 14.1. A auditoria completa tem dez avisos moderados associados à cadeia de ferramentas de desenvolvimento (minimatch/ESLint). A instalação local contém três pacotes excedentes preexistentes: `@emnapi/runtime`, `@img/sharp-wasm32` e `tslib`. Foram preservados; não remover ou atualizar automaticamente dependências para suprimir avisos.

O [índice documental](../README.md) separa as instruções atuais das especificações e dos registos históricos. Nesta revisão, os logs e resultados configurados ficam fora do repositório; não são necessários para iniciar a aplicação. Por omissão, Playwright pode gerar `test-results/` dentro do projeto, ignorado pelo Git; usar `--output` com uma pasta temporária externa para isolar os resultados. Alguns testes legados ainda gravam capturas em caminhos fixos de `/private/tmp`, que são renovadas ao repetir a suite. Preservar evidências necessárias antes de uma nova execução e não eliminar metadados locais de finalidade incerta.
