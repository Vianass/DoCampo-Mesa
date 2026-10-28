# Fase 6A — backend dos leilões e licitações

Implementação **local**, base `cbc219d1e57bfce6208ab57a96004c8fe131e7ab`, branch `feat/api-foundation`. Não há autorização de commit/push. Os nove documentos da Fase 0 permanecem históricos e intactos. O enunciado académico exige atualização atómica da liderança e exemplo de duas ofertas iguais de 317 €: só uma pode ser aceite. Reutilizam-se a arquitetura modular, autenticação JWT, guardas operacionais e transações já existentes.

## Decisões e âmbito

O utilizador aprovou [Q07, Q08 e a parte REST de Q09](decisions.md): reservar o lote, prazo fixo com elegibilidade no MongoDB e detalhe/histórico autenticados. O resultado não cria encomenda nem pagamento. Presença e Socket.IO continuam futuros; não existe nova interface React. A política de autenticação, os dashboards e as regras de encomendas não são alterados.

O lote contém **um produto próprio**, quantidade inteira na escala já aprovada (g/ml/unidades/embalagens) e snapshot da unidade. Respeita mínimo, incremento e limite de stock dessa modalidade. Produto tem de estar publicado e pertencer a produtor ativo/aprovado. Não se criam lotes independentes ou compostos nesta fase.

## Estrutura

`apps/api/src/modules/auctions/` separa tipos, dois modelos Mongoose, validação HTTP, projeções DTO, repositório transacional, reposição de stock, serviço de domínio, limites e rotas. `app.ts` recebe o serviço explicitamente; `runtime.ts` prepara coleções/índices e recuperação, inicia manutenção e espera pela sua conclusão ao encerrar. Importar módulos não inicia temporizadores ou servidores.

`auctions` guarda referências a produto e conta produtora, identificação pública do produtor em snapshot, lote, base/incremento, datas, estado, liderança, sequência, versão, saldo da reserva, resultado e auditoria de transições. `bids` guarda ofertas aceites imutáveis, comprador privado, valor, sequência, instante de aceitação e chave/hash de repetição. O preço base **não é um bid**.

Índices: produtor/data de criação; estado/fim; estado/início; unicidade produtor/chave de criação; índice parcial de reposição pendente. Em bids: únicos leilão/sequência e leilão/comprador/chave. O primeiro serve a ordenação e a unicidade da sequência, sem índice redundante só de leilão. Não há TTL nem eliminação de histórico. `save` exige transação para inserções e bloqueia mutações posteriores fora do repositório; os DTOs são projeções explícitas, não serialização direta de documentos internos. Projeções parciais continuam seguras.

## REST

Todos os caminhos têm prefixo `/api`. Ver exemplos e schemas completos no [OpenAPI](openapi.yaml).

| Método/caminho              | Acesso                          | Resultado                                                                         |
| --------------------------- | ------------------------------- | --------------------------------------------------------------------------------- |
| GET `/auctions`             | Público                         | Resumos paginados, sem identidade dos compradores.                                |
| GET `/auctions/:id`         | Conta ativa autenticada         | Detalhe, liderança pseudónima e ETag. Proprietário vê saldo/auditoria minimizada. |
| GET `/me/producer/auctions` | Produtor atual                  | Apenas leilões próprios, incluindo terminados/cancelados.                         |
| POST `/auctions`            | Produtor aprovado               | Reserva e cria: 201 novo, 200 repetição da mesma criação.                         |
| PUT `/auctions/:id`         | Produtor aprovado, proprietário | Substituição completa dos campos editáveis, antes do início.                      |
| POST `/auctions/:id/cancel` | Produtor proprietário           | Cancela antes do fim e da primeira oferta; liberta stock uma vez.                 |
| POST `/auctions/:id/bids`   | Comprador atual                 | 201 oferta aceite, 200 repetição da oferta original.                              |
| GET `/auctions/:id/bids`    | Conta ativa autenticada         | Histórico paginado por sequência, numa transação snapshot.                        |

Paginação: `pagina` 1–1000, `porPagina` 12/24/36 e `ordem` recentes/antigas. Listas de leilões admitem `estado`; histórico não admite esse filtro. Não há pesquisa textual, exclusão ou edição de bids. Datas são ISO 8601 com offset; valores monetários são cêntimos inteiros seguros. Base mínima 0, incremento mínimo 1 e base + incremento representável. Cada oferta é **o preço total do lote**, não o preço por kg/L nem o preço do catálogo.

Criação exige `produtoId`, `quantidade`, `titulo`, `descricao`, `precoBaseCent`, `incrementoCent` e `terminaEm`; `iniciaEm` omitido significa início imediato no relógio MongoDB. PUT exige todos os campos editáveis: título, descrição, base, incremento, fim; início omitido significa imediato. Produto, quantidade e unidade ficam imutáveis depois da reserva: para outro lote, cancelar quando permitido e criar outro. Não se debitam quantidades adicionais por editar.

Uma recuperação de criação já confirmada não reserva novamente stock e exige conta ativa e papel produtor atual; pode consultar o recurso histórico mesmo se a aprovação comercial mudou. A criação nova e a edição continuam a exigir aprovação.

Criação/licitação exigem um único `Idempotency-Key` ASCII visível, 1–128 caracteres. Mesma chave no âmbito da operação/identidade e mesmo pedido normalizado recuperam o recurso/oferta, sem nova reserva ou incremento. Payload diferente devolve 409. Oferta recuperada mantém ID, sequência, valor e instante originais, mesmo após o fim; a resposta inclui também o estado atual do leilão. Repetição requer comprador atual elegível; não torna um JWT expirado ou conta desativada válidos.

PUT/cancelamento exigem `If-Match` forte obtido no detalhe: 428 ausente, 400 inválido/duplicado, 412 desatualizado. O ETag é opaco e não representa uma capacidade de acesso. Cancelamento exige corpo JSON `{}`. Não há cancelamento idempotente por nova chave: uma repetição exige releitura e devolve conflito/precondição quando já mudou.

Erros estruturados: 400 entrada inválida (campos minimizados), 401 autenticação, 403 capacidade/aprovação/auto-licitação, 404 inexistente/fora do âmbito próprio, 409 mínimo/prazo/transição/stock/chave, 412/428 precondição, 413 payload, 415 formato, 429 limite, 500 erro interno sanitizado e 503 indisponível/resultado incerto. Num resultado incerto de POST, conservar exatamente chave/pedido e repetir; uma chave nova é outra operação. Nenhum erro promete que não houve commit.

## Tempo e transições

`agendado → ativo → terminado`; agendado também pode terminar diretamente se o processo esteve parado. `agendado/ativo → cancelado` apenas sem ofertas e antes do fim. Terminado/cancelado nunca reabrem. Não há pausa nem extensão. PUT só antes do início original, em agendado e sem ofertas, com revisão atual.

A operação condicional de licitação exige `iniciaEm <= $$NOW < terminaEm`, estados elegíveis, versão/sequência observadas e valor >= atual + incremento. A primeira oferta exige base + incremento. O instante aceite vem do mesmo `$$NOW` da atualização MongoDB. Uma transação elegível pode terminar o commit depois do prazo: isso é permitido pela decisão Q08 e é testado explicitamente. O encerramento concorrente entra em conflito com a escrita da liderança e relê o estado confirmado antes de escolher o vencedor.

Recuperação no arranque, manutenção periódica de um segundo e reconciliação nas consultas de detalhe/histórico/listagem usam o mesmo serviço. Trabalho temporal percorre lotes de 50, com orçamento de cinco segundos por passagem; atrasos por carga/paragem são recuperáveis. Saldos pendentes são percorridos com cursor para que um produto impossível de repor não impeça outros. Uma listagem que ainda encontre um item com estado temporal desatualizado devolve 503, em vez de anunciar que continua ativo. As listagens não constituem autorização nem garantia de aceitação de uma oferta; o predicado atómico é sempre decisivo. `serverNow` indica o instante de observação do MongoDB; não é relógio de contagem do cliente nem promessa de tempo real.

## Atomicidade e concorrência

Transações `snapshot`, leitura primary e escrita majority; tentativas limitadas a oito execuções e orçamento de dez segundos. A atualização condicional de auction e a inserção do bid fazem commit juntas. Se qualquer escrita falhar, liderança, versão, sequência, auditoria e bid revertem. Índices únicos resolvem repetição concorrente. Não existe mutex local como garantia de consistência.

Guardas de capacidades escrevem revisões das contas, em ordem estável; o perfil aprovado tem guarda própria. Desativação, retirada de papel/aprovação ou alteração concorrente tornam a operação inválida ou provocam repetição/rollback. A mesma identidade não licita no seu lote, mesmo acumulando comprador/produtor. A propriedade nunca vem de um campo de produtor enviado no corpo.

Reserva usa o repositório de stock existente, com revisão, preço/unidade e elegibilidade. Disputa o mesmo stock com checkout sem dupla venda. Cancelamento/fecho sem ofertas repõem na mesma transação que atualiza o saldo da reserva. Ao atingir o limite, perder o produto ou mudar a unidade, o saldo fica `libertacao_pendente`, com quantidade já reposta e pendente; não se excede o teto nem se convertem unidades. Regularização posterior é idempotente. Com vencedor, estado da reserva `afeta_vencedor`, sem devolução ao stock disponível. A utilização comercial posterior desse lote exige uma fase própria.

Encerramento grava apenas uma vez resultado, oferta/comprador final, valor e auditoria. Sem ofertas, resultado `sem_licitacoes`, valor/bid/comprador nulos. Histórico de bids permanece separado e imutável; não aumenta o tamanho do documento auction a cada oferta. Edições preservam margem técnica para a auditoria de encerramento, sem truncar eventos anteriores.

## Privacidade e limites

Resumo público não expõe comprador, email, token, chaves/hash ou auditoria. Detalhe/histórico usam referência HMAC específica do leilão e `proprio`; não permitem correlacionar a identidade privada entre leilões. Alterar o segredo pode alterar pseudónimos/ETags; não altera o histórico interno. Autenticação e [limites HTTP](security.md) continuam no backend, incluindo contas/roles atuais, JSON estrito, CORS e proxy existentes. Os limites por IP/conta são locais ao processo e não substituem proteção distribuída futura.

Não há pagamento online, encomenda automática, entrega do lote vencedor, moderação administrativa, salas/presença, notificações ou sincronização React. Não há nova dependência, migração de dados de desenvolvimento ou alteração dos nove documentos da Fase 0. O serviço de domínio recebe identidade já autenticada e é reutilizável por um futuro transporte Socket.IO; esse transporte terá de aplicar autenticação/limites e emitir eventos somente após commit, sem segunda lógica de aceitação. Essa integração não está implementada.

## Testar numa base isolada

Com Docker e as dependências já disponíveis, iniciar apenas o replica set de testes e executar os ensaios reais:

```sh
npm run mongo:test:up --workspace @docampo/api
cd apps/api
npx --no-install vitest run tests/unit/auction-model.spec.ts tests/unit/bid-model.spec.ts tests/http/auctions.spec.ts tests/integration/auctions.spec.ts
```

Os testes criam bases aleatórias `docampo_test_*`, dados fictícios e tokens com segredos aleatórios; eliminam apenas a própria base no fim. Não usam contas reais, não expõem passwords e não modificam `docampo_dev_catalog`. HTTP usa Express/JWT reais com MongoDB no grupo de integração; os duplicados de transporte estão identificados no grupo HTTP e não são usados como prova de atomicidade.

Cobertura: schemas/serialização parcial/privacidade; limites e validação HTTP; criação e repetição concorrente; propriedade/capacidades; edição/cancelamento; mínimos e prazos MongoDB; duas ofertas iguais e vários compradores simultâneos; repetição de bid e replay após fim; falhas depois de débito/atualização com rollback; stock disputado com checkout; histórico/resultado; reposição parcial e unidade alterada; alteração de capacidades durante a transação; recuperação após reinício e temporizador; aceitação antes do fim com commit posterior.

O relatório de entrega distingue a suite backend completa, testes frontend habituais, integração React/API/MongoDB já existente, verificações estáticas, builds, OpenAPI, ligações Markdown e integridade documental. A interface React de leilões permanece demonstrativa, como nas fases anteriores: não deve ser apresentada como cliente destes endpoints reais.

## Sincronização de um teste existente

A execução completa do frontend revelou duas falhas em `apps/web/tests/checkout.spec.ts`: o auxiliar de login devolvia controlo logo após clicar, permitindo aos testes trocar de rota enquanto o pedido `/auth/me` e o redirecionamento ainda terminavam. Os testes isolados reproduziram a falha. Foi acrescentada apenas uma espera observável pela saída de `/entrar`, sem sleeps ou remoção de asserções. O ficheiro completo passou depois com 18 testes. Não se alterou código, estilos ou comportamento do frontend; a suite habitual completa foi depois repetida com este ajuste e passou integralmente.

## Inventário da implementação local

**17 ficheiros novos:**

- Em `apps/api/src/modules/auctions/`: `auction.types.ts`, `auction.model.ts`, `auction.validation.ts`, `auction.dto.ts`, `auction.repository.ts`, `auction-stock.repository.ts`, `auction.service.ts`, `auction.routes.ts`, `auction-rate-limit.ts`, `bid.types.ts` e `bid.model.ts`.
- `apps/api/tests/unit/auction-model.spec.ts` e `apps/api/tests/unit/bid-model.spec.ts`.
- `apps/api/tests/http/auctions.spec.ts`.
- `apps/api/tests/integration/auctions.spec.ts`.
- `apps/api/tests/support/auction-fixtures.ts`.
- Este documento, `docs/api/phase-6a-auctions.md`.

**8 ficheiros modificados:**

- `apps/api/src/app.ts` e `apps/api/src/runtime.ts`: composição e ciclo de vida do serviço.
- `apps/web/tests/checkout.spec.ts`: apenas espera pelo redirecionamento de login.
- `README.md` e `apps/api/README.md`: estado local e acesso à documentação.
- `docs/api/decisions.md`, `docs/api/security.md` e `docs/api/openapi.yaml`: aprovações, permissões e contratos efetivos.

Código e estilos React, dependências, packages, modelos e regras anteriores de encomendas/checkout permanecem preservados. Artefactos de compilação e relatórios de execução estão excluídos do inventário Git. Staging, commits e push não são executados nesta fase.

## Validações executadas nesta entrega

Suite backend completa: **1 407 testes aprovados** — 889 unitários, 146 HTTP e 372 de integração MongoDB real. São **119 testes novos** (52 unitários, 22 HTTP e 45 MongoDB). A suite habitual frontend foi repetida após a sincronização do auxiliar de login: **413/413 aprovados**, sem skips/retries. Suite separada React/API/MongoDB: **53/53 aprovados**, sem skips/retries; total frontend **466 testes**. A primeira execução paralela perdeu dois traces por colisão entre diretórios de artefactos; a execução final usou diretórios separados e passou integralmente, sem alteração à aplicação ou à suite real.

TypeScript API/frontend, ESLint global, Prettier com ignore explícito da raiz, builds API/frontend e `git diff --check` aprovados. OpenAPI verificado quanto a YAML, 733 referências locais, IDs únicos, parâmetros de caminho, 121 schemas e exemplos; **12 respostas HTTP reais** do runtime comparadas com os schemas (incluindo criação, consulta, licitação, repetição, edição, cancelamento e erros). Os contratos anteriores fora dos caminhos de leilões foram comparados semanticamente e preservados. Verificadas ligações Markdown locais, ausência de artefactos/credenciais reais no inventário e igualdade dos nove documentos da Fase 0 com o início da tarefa e main.
