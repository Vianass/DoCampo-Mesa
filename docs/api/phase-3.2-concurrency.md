# Etapa 3B — concorrência e escritas condicionais

Implementação local de 23 de outubro de 2026, em `feat/api-foundation`, HEAD `15c85e95395d9421ef3f65d909c29406f2633032`; main `c10d031`. Âmbito: preparação isolada de produtos, stock e produtores. Não há checkout, orders novas, serviços de encomendas, endpoints, autenticação ou operações Git de publicação.

Referências: O12/OR05/OR12 e [consolidação funcional](phase-3.2-orders-readiness.md), [persistência orders](phase-3.2-orders-persistence.md), [configuração comercial](phase-3.2-producers-commercial.md), [modelo products](phase-3.2-products.md). Esses documentos, os nove originais da Fase 0 e o módulo orders permanecem intactos.

## Análise de entrada

Product guarda stock inteiro em g/ml/unidades/embalagens, referência de preço fixa e estado rascunho/publicado/arquivado. Publicação valida conta produtora e perfil aprovado; carrinho não reserva. Producer separa aprovação e configuração comercial opcional; um perfil antigo aprovado sem configuração continua válido, mas não está preparado localmente para receber encomendas.

Ambos usam timestamps e o __v Mongoose anterior. Esse campo não era um protocolo universal entre save, stock e verificações de aprovação. As guardas partilhadas já bloqueavam updateOne/updateMany/findOneAndUpdate/replace/bulk/insertMany e gravações sem validação completa. Não havia repositório de stock autorizado. Existiam sessões e ensaios MongoDB transacionais, sem serviços comerciais.

Conclusão: manter as guardas e acrescentar um contador comum, uma comparação de revisão na própria escrita de save, e dois caminhos internos estritamente limitados. Não abrir uma opção genérica de contornar middleware.

## Ficheiros

Modificados apenas:

- [product.model.ts](../../apps/api/src/modules/products/product.model.ts): revisão, proteção de save e omissão da revisão técnica nas serializações anteriores.
- [product.types.ts](../../apps/api/src/modules/products/product.types.ts): revisão opcional para compatibilidade com documentos antigos.
- [producer.model.ts](../../apps/api/src/modules/producers/producer.model.ts): revisão e o mesmo protocolo de save.
- [producer.serialization.ts](../../apps/api/src/modules/producers/producer.serialization.ts): omissão do novo metadado técnico.

Criados:

- [concurrency-error.ts](../../apps/api/src/modules/concurrency/concurrency-error.ts).
- [document-revision.ts](../../apps/api/src/modules/concurrency/document-revision.ts).
- [operation-session.ts](../../apps/api/src/modules/concurrency/operation-session.ts).
- [product-stock.repository.ts](../../apps/api/src/modules/products/product-stock.repository.ts).
- [producer-eligibility.ts](../../apps/api/src/modules/producers/producer-eligibility.ts).
- [producer-guard.repository.ts](../../apps/api/src/modules/producers/producer-guard.repository.ts).
- [concurrency-fixtures.ts](../../apps/api/tests/support/concurrency-fixtures.ts).
- [concurrency.spec.ts unitário](../../apps/api/tests/unit/concurrency.spec.ts).
- [concurrency.spec.ts integração](../../apps/api/tests/integration/concurrency.spec.ts).
- Este relatório.

Sem dependências, configurações globais, coleções ou índices adicionais. Os ficheiros anteriores que não estão nos quatro caminhos autorizados acima são preservados por hash, incluindo todos os testes/fixtures existentes.

## Revisão e caminhos de escrita

`revisaoOperacional` é um inteiro seguro não negativo, opcional no tipo legado e com default local zero nos schemas novos. Não substitui ou renomeia __v, não muda IDs nem cria configurações/stock. A ausência física do campo equivale a revisão zero; uma leitura não executa migração. O primeiro save, débito ou guarda usa uma condição que aceita zero ou campo ausente e incrementa para um atomicamente. Revisão máxima esgotada é recusada, sem wrap/reset.

Todo save existente em products/producers participa, incluindo alterações de preço, unidade, stock, publicação, aprovação, configuração e outros campos do perfil. Um documento carregado guarda a revisão lida em metadados locais, fora da base/serialização. Não se permite atribuí-la manualmente. A gravação requer a revisão selecionada e compara-a na condição MongoDB via `$where` do documento Mongoose; o incremento é `$inc` na mesma operação de atualização. O plugin não faz uma segunda escrita nem confia apenas em optimisticConcurrency.

As condições próprias anteriores do documento são preservadas e restauradas depois da tentativa; saves sucessivos do mesmo documento funcionam. Uma escrita com revisão antiga que já não encontra o documento devolve CONFLITO_VERSAO. Após conflito ou rollback, reler documentos antes de tentar novamente: os metadados locais de objetos Mongoose não são um gestor de retries transacionais. Em callbacks repetíveis, carregar os documentos dentro de cada nova tentativa.

| Caminho                                                                 | Proteção                                                                                                       |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Product/Producer.create ou documento novo.save                          | Validação existente e revisão inicial zero.                                                                    |
| Product/Producer.save de documento carregado                            | Validação existente, comparação de revisão e incremento na mesma escrita; usa a sessão atribuída ao documento. |
| updateOne/updateMany/findOneAndUpdate/replace/bulk/insertMany genéricos | Continuam bloqueados; não foi criado um bypass de middleware.                                                  |
| decreaseProductStock                                                    | Uma operação nativa limitada a decremento de stock, revisão e updatedAt, com predicados explícitos.            |
| guardProducerEligibility                                                | Uma operação nativa limitada ao incremento real da revisão, dentro de transação explícita.                     |
| Coleção/driver direto, shell, scripts externos                          | Fora do protocolo; não podem ser usados por futuros serviços comerciais sem integrar revisão/validação.        |

A implementação não altera permissões de publicação nem exige configuração comercial para criar/publicar Product, preservando as regras anteriores. A validação de publicação continua a fazer leituras de conta/aprovação; não passa a representar uma autorização transacional universal. No futuro checkout, a guarda do produtor é obrigatória, independentemente dessas leituras.

## Débito condicional de stock

`decreaseProductStock(connection, input, session?)` recebe IDs internos, revisão esperada, quantidade, preço aceite e unidade aceite completa. Reutiliza os cálculos/validações da Etapa 1 de orders, sem alterar esse módulo nem copiar regras: quantidades positivas inteiras, mínimos/incrementos, tetos por modalidade, preço de referência, half-up e rejeição de subtotal zero.

Verifica candidato existente, proprietário, publicado, oferta/unidade, revisão e stock. A leitura de diagnóstico não autoriza por si a operação: a escrita repete os predicados no MongoDB, incluindo stockDisponivel >= quantidade, teto da modalidade, revisão, produtor, publicação, preço e unidade histórica observada. O decremento e o incremento da revisão são atómicos; não há stock reservado nem consulta a um carrinho.

Pode ser utilizada sem sessão para um único débito atómico isolado. Se for fornecida sessão, esta tem de estar ativa numa transação. Nunca chamar esta variante isolada para uma compra com vários documentos; o serviço futuro deve passar a mesma sessão da guarda e das restantes escritas. A função não inicia, confirma, aborta ou repete transações.

Devolve apenas produtoId, stockDisponivel e revisaoOperacional. Não gera snapshots de orders, não cria encomendas e não implementa reposição/cancelamento.

## Guarda do produtor

`guardProducerEligibility(connection, input, session)` exige sessão explícita com transação ativa antes de qualquer escrita. Recebe produtor por referência à conta, revisão esperada e seleção: modalidade, pagamento, concelho quando aplicável, taxa aceite e período concreto UTC/fuso.

Verifica existência, aprovação atual, configuração local válida, modalidade ativa, método aceite, cobertura, taxa e horário. A leitura nativa seleciona apenas os campos necessários, excluindo pagamento privado, telefone e identidade do decisor. Não devolve a configuração ao chamador.

O período tem instantes UTC explícitos e zona igual à agenda. Verifica a união das janelas da modalidade no dia local, incluindo pontos interiores e o último instante anterior ao fim, sem aceitar um intervalo que atravesse uma pausa ou um recuo de relógio fora da janela. A agenda tem resolução de minuto; o fim do período é exclusivo. Intervalos podem atravessar janelas adjacentes. Não existe reserva/capacidade nem conversão silenciosa de horas locais inexistentes; uma futura entrada em hora local terá de ser resolvida para UTC explicitamente.

Após validar, executa findOneAndUpdate nativo com predicados de identidade, revisão, aprovação, modalidade, pagamento, disponibilidade e condições de entrega. Incrementa realmente revisaoOperacional. Não muda aprovação, configuração, dados privados ou updatedAt comercial do perfil. Essa escrita disputa o mesmo documento que um save administrativo/comercial, detetando alterações concorrentes que uma simples leitura em snapshot não detetaria.

A revisão é operacional, não uma contagem exclusiva de edições da configuração: guardas e outros saves também a incrementam. Uma revisão diferente pode significar apenas outro escritor cooperante; não prova por si mudança de preço/taxa. CONFIGURACAO_ALTERADA identifica condições aceites incompatíveis; CONFLITO_VERSAO identifica o token antigo. Não atualizar ou reconfirmar ofertas automaticamente por causa desses erros.

## Protocolo do futuro chamador

1. Iniciar explicitamente uma transação no mesmo cliente/conexão, com leitura snapshot, preferência primary e confirmação majority. Nenhum auxiliar desta etapa a cria.
2. Recarregar dados/revisões na tentativa corrente; preservar a oferta que o comprador aceitou e validar novamente as condições. Não aceitar silenciosamente preços/unidades/taxas novos.
3. Agrupar linhas por produto antes das validações/cálculos e usar ordem estável para produtores/produtos. Obter uma guarda por produtor na transação e executar os débitos com a mesma sessão. Uma guarda já incrementa a revisão: não repetir a mesma guarda com o token anterior nessa transação.
4. Num checkout autorizado posterior, gravar todas as orders, a âncora/chave/recibo e os débitos na mesma transação. Neste bloco não existe essa implementação.
5. Qualquer erro deve impedir o commit da composição. O chamador aborta; não capturar um erro de domínio e confirmar apenas as operações anteriores. Falhas de escrita MongoDB mantêm os seus labels para o coordenador repetir uma transação abortada quando aplicável.
6. Emitir efeitos externos apenas após commit confirmado. Não adicionar sockets, emails, chamadas externas ou outros efeitos irreversíveis ao callback repetível.

OR05 continua uma dependência do checkout: estes débitos não são um serviço global idempotente. Após commit incerto, recuperar primeiro a operação pela chave/recibo original; não reler a revisão e repetir cegamente um débito isolado. Retentativas têm de ser limitadas e revalidar dados atuais; mudança comercial requer reconfirmação, não um retry que substitui a oferta do comprador.

## Erros, privacidade e limites

ConcurrencyError distingue VALIDACAO, STOCK_INSUFICIENTE, PRODUTO_INDISPONIVEL, PRODUTOR_INELEGIVEL, OFERTA_ALTERADA, CONFIGURACAO_ALTERADA, CONFLITO_VERSAO, modalidade/método/concelho/horário incompatíveis, sessão obrigatória e leitura incompleta. Não tem status HTTP nem inclui dados privados nos textos.

isMongoWriteConflict reconhece MongoServerError 112. Não se embrulham indiscriminadamente falhas do driver ou internas: preservam-se tipo, código e labels transacionais. O futuro limite HTTP terá de sanitizar erros internos antes de apresentação, sem destruir os labels usados pelo coordenador interno. Uma sessão de outro cliente é recusada pelo driver sem escrita; não há fallback fora de sessão.

toJSON/toObject anteriores omitem o novo contador; a projeção pública aditiva de producers já usa whitelist e continua segura. Lean privilegiado, transform:false e driver direto continuam representações internas, não DTOs públicos.

Limitações explícitas:

- Acesso nativo externo que ignora o protocolo pode invalidar as garantias entre escritores. Os dois repositórios são exceções fechadas e validadas, não uma autorização genérica para driver direto.
- A capacidade/papéis da conta users não recebem uma revisão coordenada nesta etapa. Antes de introduzir alterações concorrentes de capacidades/suspensão nos serviços reais, definir e autorizar a coordenação desse escritor; não modificar users implicitamente.
- A guarda serializa escritores do mesmo perfil e pode causar conflitos conservadores sob carga. Não há retry/backoff automático ou garantia de desempenho de produção.
- Recarregar objetos Mongoose depois de rollback/conflito; o protocolo não restaura automaticamente todos os metadados locais de objetos reutilizados pelo chamador.
- Não existe autenticação, autorização, checkout, reserva de stock, pagamento, cronómetro/job ou idempotência global operacional. As rotas privadas permanecem ausentes.

## Testes e resultados

MongoDB real 8.0.34, rs-dcm-test, porta local 27019 e base aleatória docampo_test_<uuid>. Criam-se apenas as coleções users/producers/products e respetivos índices prévios. Nenhuma order é criada. Bases de teste são removidas pela própria suite; sem .env, Atlas ou desenvolvimento.

As intercalações usam operações aguardadas como barreiras: estabelecer snapshot, confirmar uma alteração externa e só depois tentar a escrita no snapshot antigo. Não usam sleeps, timers ou mocks para afirmar segurança concorrente. Os unitários testam regras puras e identificação de erros, não substituem a prova MongoDB.

| Verificação executada          | Resultado                                   |
| ------------------------------ | ------------------------------------------- |
| Novos unitários                | 31 aprovados.                               |
| Nova integração real           | 23 aprovados.                               |
| Unitários backend completos    | 535 aprovados.                              |
| HTTP existentes                | 22 aprovados.                               |
| Integração MongoDB completa    | 126 aprovados.                              |
| Suite backend completa         | 683 aprovados, incluindo os 629 anteriores. |
| TypeScript, ESLint e build API | Aprovados.                                  |

Cobertura crítica: última unidade disputada, stock insuficiente/versão/oferta antiga, rollback conjunto da guarda e débito, ausência de escrita visível fora da sessão, aprovação/configuração alteradas após o snapshot, estado/stock concorrentes, propagação de write conflict e TransientTransactionError, save antigo impedido de repor stock ou aprovação, saves concorrentes/sucessivos, revisão ausente legada, sessão inexistente/inativa/estrangeira e repetição explícita com dados atuais.

Prettier, ligações deste relatório, git diff --check, hashes dos ficheiros preservados e Fase 0 são verificados no fecho. Frontend/Playwright permanecem preservados, sem reexecução nesta etapa backend.

## Próximo passo

As primitivas de stock e de guarda estão prontas para revisão e para composição num checkout transacional futuramente autorizado. Essa etapa terá de implementar a coordenação global, idempotência/recibo, snapshots, oferta aceite, política de retries e testes de compra integral. Confirmar também as fronteiras de escrita de capacidades de users antes de as tornar concorrentes com vendas. Não iniciar essa etapa nem publicar Git por efeito desta entrega.
