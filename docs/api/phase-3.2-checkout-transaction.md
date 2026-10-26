# Etapa 4B.3 — checkout transacional funcional

Implementação local de **26 de outubro de 2026**, em `feat/api-foundation`, sobre HEAD `f35c280172c3038bffa925ba71d03433fb38304f`. `main` permanece em `c10d031dafc3a0173f5540875152f35f61bb1549`. Não se executam operações Git de publicação.

Este bloco implementa uma compra interna real, com uma encomenda por produtor e confirmação integral em MongoDB. Reutiliza as decisões O01–O16, OR01–OR12 e as orientações D4A-01–D4A-09 da [arquitetura do checkout](phase-3.2-checkout-readiness.md), o [contrato v1](phase-3.2-checkout-contract.md), a [idempotência 4B.2](phase-3.2-checkout-idempotency.md), a [configuração comercial](phase-3.2-producers-commercial.md) e o [protocolo de concorrência](phase-3.2-concurrency.md). Esses documentos e os seis ficheiros de 4B.2 são preservados.

## Arquitetura e ficheiros

Criados nesta etapa:

- [checkout.service.ts](../../apps/api/src/modules/orders/checkout.service.ts): serviço, composição transacional, reconfirmação e recuperação.
- [checkout.preparation.ts](../../apps/api/src/modules/orders/checkout.preparation.ts): IDs estáveis por execução e snapshots preparados com os cálculos existentes.
- [user-capability.repository.ts](../../apps/api/src/modules/users/user-capability.repository.ts): guarda transacional fechada das capacidades das contas.
- [checkout-fixtures.ts](../../apps/api/tests/support/checkout-fixtures.ts): dados fictícios e provisionamento apenas da base isolada de testes.
- [checkout.spec.ts unitário](../../apps/api/tests/unit/checkout.spec.ts).
- [checkout.spec.ts de integração](../../apps/api/tests/integration/checkout.spec.ts).
- Este relatório.

Modificados apenas cinco ficheiros anteriores:

- [user.model.ts](../../apps/api/src/modules/users/user.model.ts): revisão operacional e proteção de `save`, sem novos estados ou papéis.
- [producer-commercial.types.ts](../../apps/api/src/modules/producers/producer-commercial.types.ts), [schema](../../apps/api/src/modules/producers/producer-commercial.schema.ts) e [validação](../../apps/api/src/modules/producers/producer-commercial.validation.ts): local oficial de levantamento opcional.
- [producer.model.ts](../../apps/api/src/modules/producers/producer.model.ts): proteção desse campo contra substituição comercial a partir de uma leitura parcial.

Não se alteram orders, products, índices, configurações, dependências ou frontend. Não se acrescentam coleções. Os repositórios de stock e de guarda de produtores são reutilizados sem alterações.

## Pré-requisitos resolvidos

**Levantamento:** `comercial.localLevantamento` pertence ao perfil do produtor. É texto normalizado, não vazio, até 4096 pontos de código, sem caracteres de controlo ou surrogates isolados. A ausência continua válida para documentos antigos; uma compra com levantamento exige o campo preenchido e copia-o para o snapshot. Entrega não exige um local inventado. O contrato rejeita um local arbitrário enviado pelo comprador. O JSON anterior e a projeção pública anterior do produtor mantêm-se; o novo campo só é consultado internamente nesta etapa.

A leitura comercial parcial que omite o local não pode substituir a configuração. As alterações ao campo participam na revisão do perfil e, por isso, disputam a mesma escrita que a guarda de elegibilidade.

**Contas:** `users.revisaoOperacional` reutiliza o plugin já usado em products/producers. Novas contas começam em zero; campo ausente no legado equivale a zero, sem migração por leitura. O contador fica fora de `toJSON` e `toObject`. Um `save` compara e incrementa a revisão na própria escrita; um documento antigo ou lido sem revisão não pode sobrepor uma guarda. Updates/bulk genéricos continuam bloqueados.

`guardUserCapabilities` exige uma transação ativa, lê apenas ID/papéis/revisão e incrementa realmente a revisão com predicados de identidade, revisão e papéis necessários. Verifica o comprador e as contas produtoras. Quando uma conta acumula os dois papéis, executa uma única guarda com ambas as capacidades. Não se cria uma proibição de comprar à própria atividade produtora.

Não existem campos de ativação/suspensão no modelo atual: não são inventados. A coordenação cobre as capacidades existentes e os seus escritores cooperantes. Uma extensão futura de estados de conta terá de integrar esta mesma proteção.

## Fluxo transacional

`createCheckoutService` recebe conexão, uma função interna `resolveIdentity`, relógio opcional e orçamentos técnicos. A função devolvida recebe apenas chave e pedido. A identidade provém da dependência confiável do servidor; `buyerId`, papéis ou sessão demonstrativa no corpo não constituem autoridade e são rejeitados pelo contrato.

A função de identidade é uma fronteira de confiança interna, não uma implementação de autenticação. Nos testes usa contas fictícias explícitas. O serviço não está registado no runtime HTTP.

1. Validar e normalizar o pedido com 4B.1. Calcular o fingerprint v1 e procurar uma compra confirmada com 4B.2, antes de revalidar ofertas atuais.
2. Para uma compra nova, gerar uma vez referência global, IDs das encomendas/linhas/eventos e instante lógico. Conservar esses valores entre tentativas; não gerar uma chave diferente.
3. Iniciar `withTransaction` com `snapshot`, `primary` e confirmação `majority`. Todas as operações dessa tentativa usam a mesma sessão, sequencialmente.
4. Voltar a consultar a âncora no início do snapshot, antes de qualquer escrita. Se já existir, verificar comprador, fingerprint e grupo integral com os auxiliares de 4B.2.
5. Recarregar produtos reais e perfis por conta produtora em cada tentativa. Confirmar propriedade, publicação, oferta/unidade/quantidade/stock, revisões, aprovação, modalidades, taxa, concelho, agenda e método, reutilizando os validadores das guardas.
6. Calcular os totais com os helpers de orders. Agregar antes de validar/arredondar; cobrar uma taxa por produtor. Preparar snapshots, manifesto e recibo e validar todas as encomendas completas, incluindo o orçamento BSON.
7. Guardar primeiro a âncora completa para arbitrar a chave. Executar guardas de contas e produtores e débitos condicionais de produtos em ordem estável. Guardar as restantes encomendas com a mesma sessão.
8. Devolver sucesso apenas depois de `withTransaction` confirmar o commit. Qualquer falha aborta âncora, encomendas, guardas e débitos conjuntamente.

As encomendas começam `pendente`, o pagamento `por_pagar`, os históricos registam o comprador real do contexto e o relógio de receção permanece parado. Snapshots conservam nome, preço, unidade completa, quantidades, período/fuso e condições de receção. As versões de produto/configuração são as revisões observadas antes do débito/guarda; não são apresentadas como versões comerciais exclusivas.

As leituras de perfis excluem telefone, decisor e pagamento privado; a guarda de contas exclui email/password. Morada/contacto necessários à entrega entram na encomenda, nunca no recibo comum. Nenhum callback transacional envia notificações ou executa pagamentos.

## Reconfirmação, idempotência e concorrência

O serviço compara as condições atuais com as originalmente aceites. Não substitui silenciosamente preço, unidade, quantidade, taxa, concelho, horário, método ou revisão. Incompatibilidade comercial devolve `reconfirmacao_necessaria`; divergência de revisão usa `CONFLITO_REVISAO`, seguindo a política conservadora. O resultado indica ao chamador que deve consultar os dados atuais, sem criar uma cotação nova ou expor motivos administrativos privados. Pedido estruturalmente inválido ou conta sem capacidades devolve `recusado`.

Se a mudança surgir depois da leitura, as escritas condicionais e as guardas efetivas provocam conflito/rollback. Uma repetição permitida relê todos os documentos; nunca atualiza a oferta aceite automaticamente. Erros internos inesperados continuam a propagar-se, após rollback, sem se tornarem falsos sucessos.

A chave global, índice único parcial, âncora determinística, manifesto e recibo mantêm o formato existente. Um replay devolve o recibo original imutável, sem novos débitos ou guardas, mesmo depois de uma alteração posterior de preço/configuração. A associação ao comprador confiável continua obrigatória. A elegibilidade para criar outra compra é distinta da recuperação interna do recibo próprio; a política pública definitiva de acesso após mudança de capacidades pertence à etapa de segurança/HTTP.

Colisão reconhecida do índice da chave sai da tentativa e recupera o grupo confirmado fora do snapshot anterior. Chave de outro comprador ou payload diferente devolve conflito genérico sem recibo. Uma âncora isolada ou grupo incoerente mantém resultado indeterminado.

Orçamentos internos por omissão: **20 segundos** para a transação, **três tentativas do corpo** e **cinco segundos** por consulta de recuperação. As repetições de commit são geridas pelo driver dentro do orçamento temporal; não reexecutam débitos isoladamente. Estes parâmetros são configuráveis apenas na composição interna, não no pedido, e não representam um SLA total. Mantêm-se os limites anteriores de 100 produtos e 10 produtores.

Depois de uma falha reconhecida de comunicação/commit ou de esgotar as tentativas, consulta-se a persistência com 4B.2. Recibo confirmado permite sucesso; ausência em recuperação continua indeterminada, com a mesma chave e payload. Uma falha de domínio com transação abortada e sem compra observada permite devolver a recusa/reconfirmação original. Não se embrulham os labels necessários ao driver nem se interpretam mensagens de duplicação.

## Testes e validações

Executados com MongoDB real **8.0.34**, replica set `rs-dcm-test`, porta local 27019 e bases aleatórias `docampo_test_<uuid>`, removidas pelas suites. Os testes provisionam explicitamente as quatro coleções e índices existentes. Não usam a base de desenvolvimento, Atlas ou credenciais reais.

Os ensaios cobrem compra de um/vários produtores; vários produtos/fracionamento/half-up; taxa única; entrega e levantamento oficial; os três métodos de pagamento sem processamento bancário; snapshots e privacidade; todas as categorias de reconfirmação; legado sem revisão/local; proteção de leituras parciais e saves antigos; replay; payloads diferentes; chave global entre compradores/produtores disjuntos; último stock; alterações concorrentes de preço, configuração e capacidades; falha na última encomenda; retries limitados e recuperação após commit.

As corridas usam transações MongoDB reais e barreiras de operações aguardadas, sem sleeps para presumir concorrência. A falha na última encomenda verifica o rollback dos débitos e guardas anteriores. Uma falha transitória após um débito real verifica nova tentativa com os mesmos IDs e um único débito final.

Os testes de resposta perdida confirmam primeiro o commit real e injetam uma exceção na sua resposta, com e sem `UnknownTransactionCommitResult`. Verificam recuperação/repetição de commit e stock/recibo sem duplicação. Não se afirma que houve uma falha física de rede durante o protocolo de commit.

| Verificação                            | Resultado                                                       |
| -------------------------------------- | --------------------------------------------------------------- |
| Novos unitários                        | **26 aprovados**.                                               |
| Novos testes MongoDB                   | **43 aprovados**.                                               |
| Testes novos                           | **69 aprovados**.                                               |
| Suite backend completa                 | **951 aprovados em 20 ficheiros**, incluindo os 882 anteriores. |
| Distribuição                           | 736 unitários, 22 HTTP e 193 de integração.                     |
| TypeScript API, ESLint API e build API | Aprovados.                                                      |
| Prettier API                           | Aprovado com `--ignore-path ../../.prettierignore`.             |

Comandos: `npm test --workspace @docampo/api`, `npm run typecheck --workspace @docampo/api`, `npm run lint --workspace @docampo/api`, `npm run format:check --workspace @docampo/api -- --ignore-path ../../.prettierignore` e `npm run build --workspace @docampo/api`. A execução completa guardou o relatório JSON fora do projeto. Artefactos de build continuam ignorados. No fecho verificam-se também Markdown/ligações deste relatório, `git diff --check` e integridade dos nove documentos da Fase 0 perante `main`.

A comparação dos 306 ficheiros de entrada autoriza apenas os cinco caminhos modificados acima; preserva integralmente os outros 301, incluindo os seis de 4B.2, frontend, dependências, documentos históricos e testes anteriores. Playwright não é reexecutado nesta etapa exclusivamente backend.

## Limitações e integração HTTP futura

O serviço exige MongoDB com transações e os índices existentes previamente preparados. Não cria índices durante a compra. Escritores nativos externos que ignorem o protocolo podem invalidar as garantias; não se abre um caminho genérico de atualização. Não existem reservas de carrinho, processamento bancário, notificações, comandos posteriores das encomendas ou jobs de conclusão.

Mantêm-se IDs opacos de concelhos e instantes UTC explícitos. Catálogo oficial, interpretação de horas locais, capacidade/feriados/antecedência e uma política de revisões menos conservadora não são introduzidos nesta tarefa.

Antes de expor REST: implementar autenticação/autorização reais, ligar `resolveIdentity` a credenciais verificadas por pedido, preparar índices na inicialização/deployment, definir DTOs e mapeamento conta/perfil, política pública de acesso a recibos, códigos HTTP e sanitização de erros internos, e adaptar o OpenAPI legado. A escolha de papel na demonstração continua sem valor de autenticação. O único endpoint disponível permanece `GET /api/health`.

Entrega local: sete novos ficheiros desta etapa e cinco modificados, além dos seis não rastreados de 4B.2 preservados. Staging vazio, HEAD/main inalterados e nenhuma operação de commit/push/merge. Não se inicia outra etapa sem autorização.

Commit temático sugerido, sem execução: `feat(api): implement atomic checkout with guarded capabilities and receipt recovery`.
