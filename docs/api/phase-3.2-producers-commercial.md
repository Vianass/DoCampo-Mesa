# Producers — Etapa 3A: configuração comercial

Implementação local de 22 de outubro de 2026, em `feat/api-foundation`, HEAD `15c85e95395d9421ef3f65d909c29406f2633032`; main `c10d031`. Âmbito exclusivo: módulo producers, fixtures/testes associados e este relatório. Sem staging, commits, push, checkout, endpoints ou serviços transacionais. A Etapa 3B não foi iniciada.

Referências funcionais: O05–O09, OR02/OR08 e a [consolidação de orders](phase-3.2-orders-readiness.md). A [Etapa 2 de orders](phase-3.2-orders-persistence.md), os documentos históricos e os nove originais da Fase 0 são preservados. Não existe alteração a users, products, orders, frontend, dependências ou configuração global.

## Ficheiros

Modificado apenas [producer.model.ts](../../apps/api/src/modules/producers/producer.model.ts): acrescenta a propriedade opcional, integra schema/validação/privacidade e protege a edição a partir de projeções incompletas. Mantém campos, referências, estados de aprovação e índices anteriores.

Criados:

- [producer-commercial.constants.ts](../../apps/api/src/modules/producers/producer-commercial.constants.ts).
- [producer-commercial.types.ts](../../apps/api/src/modules/producers/producer-commercial.types.ts).
- [producer-commercial.validation.ts](../../apps/api/src/modules/producers/producer-commercial.validation.ts).
- [producer-commercial.schema.ts](../../apps/api/src/modules/producers/producer-commercial.schema.ts).
- [producer.serialization.ts](../../apps/api/src/modules/producers/producer.serialization.ts).
- [producer-commercial-fixtures.ts](../../apps/api/tests/support/producer-commercial-fixtures.ts).
- [producer-commercial.spec.ts unitário](../../apps/api/tests/unit/producer-commercial.spec.ts).
- [producer-commercial.spec.ts integração](../../apps/api/tests/integration/producer-commercial.spec.ts).
- Este relatório.

## Estrutura aditiva

`ProducerRecord.comercial` é opcional e tem `default: undefined`. A ausência não cria subdocumentos, modalidades, taxas, métodos ou horários. Perfis antigos continuam válidos, incluindo aprovados e rejeitados; nenhuma migração é executada.

| Campo                   | Representação                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| modalidades             | Booleanos explícitos levantamento/entrega; pelo menos um ativo quando o bloco completo é fornecido.           |
| taxaEntregaCent         | Opcional sem entrega; obrigatória e explícita com entrega ativa. Inteiro seguro não negativo, zero permitido. |
| concelhosEntregaIds     | Lista de IDs opacos, sem repetições; pelo menos um quando a entrega está ativa.                               |
| catalogoConcelhosVersao | Referência opcional para futura integração com catálogo, sem lista oficial inventada.                         |
| disponibilidade         | Zona IANA e listas independentes de períodos de levantamento/entrega.                                         |
| metodosPagamento        | Lista não vazia, sem repetições, de dinheiro/mb_way/transferencia_bancaria.                                   |
| pagamentoPrivado        | Opcional: contacto MB WAY e/ou transferência com IBAN e titular opcional.                                     |

Tipos explícitos de configuração, disponibilidade, intervalo, pagamento privado, problemas de validação e prontidão local. Constantes comerciais próprias do módulo usam os mesmos identificadores de orders, com teste de compatibilidade, sem modificar ou criar uma dependência de execução desse módulo.

O bloco representa uma configuração completa quando presente, não um novo ciclo de rascunho ou uma ativação real de vendas. Para deixar um perfil sem configuração, pode removê-lo explicitamente por leitura interna completa/save. Uma modalidade inativa pode conservar parâmetros válidos para futura reativação; esses parâmetros não a tornam ativa.

## Validação local

`validateProducerCommercial` é uma função pura que devolve campos/mensagens sem os valores recebidos. `assessProducerCommercial` distingue `aprovado`, `configurado` e `prontoLocalmente`; a última condição é apenas aprovação e configuração local válida. Não verifica a conta, as capacidades reais, stock, preços, uma compra concreta ou concorrência; nunca substitui elegibilidade/autorização de um serviço.

Taxas usam Number apenas com inteiros seguros até `Number.MAX_SAFE_INTEGER`. Não se copia o teto comercial de preço de products para a taxa. Levantamento não exige uma taxa inventada: a aplicação de zero à encomenda será responsabilidade do adaptador/checkout futuro. Nenhum valor é aplicado a orders existentes.

IDs são opacos e estáveis, até 128 pontos de código, sem espaços/caracteres de controlo; não são derivados do nome nem normalizados silenciosamente. Formatos de um catálogo nacional, pertença a concelhos reais e respetiva versão não são validados nesta etapa. Não existe coleção adicional.

Cada período usa `diaSemana` ISO 1–7 (segunda a domingo) e horas locais `HH:mm`, 00:00–23:59, com início anterior ao fim. Rejeitam-se duplicados, intervalos invertidos e sobreposições no mesmo dia/modalidade. Intervalos adjacentes são permitidos, assim como horários coincidentes entre modalidades ou em dias diferentes. A validação ordena uma cópia interna e não modifica o array original. Modalidades ativas exigem pelo menos um período; não se inventa disponibilidade para dias não indicados.

Estes formatos são concretizações técnicas da agenda semanal, sem reservas, capacidade, calendário de exceções, duração mínima imposta ou passagem automática da meia-noite. Os períodos não representam instantes UTC; a futura escolha de uma data terá de tratar alterações de hora, ambiguidades e disponibilidade vigente. Os instantes e snapshots concretos continuam a pertencer a orders.

Dados privados são opcionais: O09 não impôs um contacto/IBAN obrigatório para configurar os métodos. Quando fornecidos, validam-se os respetivos subdocumentos. O contacto é texto não vazio até 64 pontos de código; não se inventa uma norma nacional ou verificação de titularidade. IBAN é normalizado para maiúsculas sem espaços de apresentação e verifica formato/comprimento geral e checksum mod 97. Não verifica país/banco por catálogo, conta existente, titular, adesão MB WAY ou recebimentos. Titular opcional: texto não vazio até 160 pontos de código. Esses comprimentos são proteções técnicas, não regras comerciais novas.

Schemas usam strict: throw, subdocumentos sem IDs/versionamento implícitos e tipos sem conversões de números/booleanos/string que mascarassem entradas inválidas. Mantêm-se as guardas existentes contra query updates/bulk/save sem validação. As validações cruzadas e a proteção de erros usam os hooks assíncronos validate/save; validateSync não é prova suficiente e não é usado como caminho de persistência.

Erros Mongoose relacionados com comercial são reconstruídos sem guardar os valores/reasons privados nos erros devolvidos; problemas de estrutura/enum/cast conservam o campo e uma mensagem sanitizada. As mensagens da função pura são específicas e não interpolam o conteúdo. Falhas internas inesperadas propagam-se, sem serem disfarçadas como erros de validação. Não existem logs de pagamento.

## Compatibilidade, leituras e privacidade

O JSON anterior conserva a forma prévia: não passa a incluir comercial implicitamente. Acrescentou-se proteção equivalente ao toObject para telefone, identidade do decisor e contas populadas. Subdocumentos privados também têm serialização minimizada. A representação interna continua disponível deliberadamente com transform: false; não é uma resposta pública.

`pagamentoPrivado` usa select: false como defesa adicional. A leitura normal/lean omite-o; uma seleção privilegiada pode incluí-lo. `projectProducerPublic` é uma projeção nova, aditiva e com lista explícita de campos, que permite apresentar configuração comercial pública sem pagamento privado, conta, contactos ou decisão administrativa interna. Aceita objetos lean e projeções incompletas, sem os alterar. Não concede autorização por um papel recebido nem altera o OpenAPI/contratos existentes.

Exemplo de leitura interna necessária para editar o bloco completo, sem substituir autenticação futura:

```ts
Producer.findById(id).select('+telefone +aprovacao.decisao.autor +comercial.pagamentoPrivado');
```

Quando comercial é alterado num documento existente, a gravação exige que todos os seus campos, incluindo privados e folhas aninhadas, tenham sido selecionados. Isto evita que uma substituição baseada numa leitura parcial apague informação omitida. Uma leitura parcial continua a poder ser serializada. Perfis sem configuração podem ser lidos/validados sem migração; os requisitos prévios de gravação dos campos base são preservados.

Lean privilegiado, acesso nativo à coleção e transform: false não são seguros para apresentação direta. Usar a projeção pública e, nas futuras áreas privadas, projeções contextualizadas após verificação de propriedade/permissões. Não enviar nem registar números bancários em bruto. A seleção não substitui autorização.

## Testes executados

Fixtures inteiramente fictícias: IDs de concelhos explicitamente fictícios, domínio example.invalid, contacto nulo fictício e IBAN de BBAN totalmente nulo com checksum calculado apenas para testes. Não são instruções de pagamento, contas reais ou catálogo oficial.

| Verificação                                   | Resultado atual                               |
| --------------------------------------------- | --------------------------------------------- |
| Novos unitários                               | 75 aprovados.                                 |
| Nova integração MongoDB                       | 29 aprovados.                                 |
| Unitários backend completos                   | 504 aprovados.                                |
| HTTP existentes                               | 22 aprovados; único endpoint continua health. |
| Integração MongoDB completa                   | 103 aprovados.                                |
| Suite backend completa                        | 629 aprovados, incluindo os 525 anteriores.   |
| TypeScript backend, ESLint backend, build API | Aprovados.                                    |

Cobertura: todas as modalidades e estados antigos, taxa zero/negativa/decimal/overflow, concelhos/dias/horas inválidos e duplicados, sobreposições/adjacência, métodos inválidos/repetidos, pagamento privado, normalização e erros sem valores bancários, manutenção dos campos base, serialização/projeções/populate/lean, adição/edição/remoção explícita da configuração, conservação de dados privados e proibição de alterações comerciais a partir de projeções incompletas. Um ensaio com Product real demonstra que configurar producers não altera produtos ou aprovação/identidade do perfil.

MongoDB real 8.0.34, replica set rs-dcm-test em 127.0.0.1:27019, bases aleatórias docampo_test_<uuid> removidas pela própria suite. Não se usa .env, desenvolvimento ou Atlas. Não se omitem falhas do ambiente. Frontend/Playwright são preservados, sem reexecução nesta etapa backend.

Prettier, ligações deste relatório, git diff --check, hashes dos ficheiros preservados e nove originais da Fase 0 são verificados no fecho. A única alteração preexistente autorizada é producer.model.ts; os nove novos ficheiros permanecem locais.

## Dependências da Etapa 3B e seguintes

Permanecem por implementar o protocolo de versões/escritas coordenadas em producers/products, validação transacional da aprovação/configuração e da capacidade da conta, cálculo e reconfirmação da oferta, criação global de orders/stock/idempotência, interpretação de datas, projeções privadas autorizadas e restantes serviços. O __v atual de producers não é uma garantia universal de concorrência comercial; esta tarefa não muda os caminhos de escrita para contornar as guardas.

Antes de um checkout, resolver também a origem/versionamento do catálogo real de concelhos e os adaptadores para os snapshots aplicados em orders. Não interpretar prontoLocalmente como licença para ativar vendas ou uma decisão administrativa. A falta de instruções privadas de pagamento terá de ser tratada explicitamente no contexto autorizado, sem as divulgar publicamente.

O bloco está pronto para revisão da configuração comercial e definição/autorização separada da Etapa 3B. Não iniciar essa etapa, alterar os outros modelos, ativar rotas ou publicar Git por efeito desta entrega.
