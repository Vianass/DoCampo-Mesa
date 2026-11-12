# Fase 14.2 — Carrinhos por identidade e compra de lotes vencedores

## Âmbito e preservação

Implementação local autorizada para corrigir o isolamento do carrinho e permitir a formalização da compra de um lote pelo vencedor. Sem operações Git de escrita, deployment, dependências novas ou alterações aos nove documentos originais da Fase 0. Os oito documentos pendentes da Fase 14.1 permanecem byte a byte intactos; este documento técnico é independente dessa organização documental.

O checkout normal conserva os seus contratos e cálculos. Não se acrescentou persistência de carrinhos no backend nem se inserem lotes de leilão artificialmente na cesta normal.

## Carrinho: diagnóstico e política

O `CartProvider` anterior era partilhado por todas as sessões reais. Inicializava uma única vez o reducer e persistia na chave comum `docampo.cart.v1`, sem selecionar estado pela identidade. Login/logout não trocavam essa identidade de armazenamento. A causa abrangia simultaneamente estado React e persistência; mudar apenas a chave sem substituir o estado visível não resolveria o problema.

A seleção atual usa o identificador estável devolvido pela autenticação, não o email:

- Visitante: `docampo.cart.guest.v2`.
- Conta: `docampo.cart.account.v2.<id>`.
- Demonstração: mantém a chave independente anterior.
- Carimbos de alterações do carrinho e referências locais de recuperação de checkout também são separados por conta.

O reducer seleciona o novo estado antes de os filhos serem apresentados. A troca de conta não desmonta os formulários de autenticação nem altera o encaminhamento existente. Ações assíncronas conservam a identidade de origem e são ignoradas se essa identidade já não for a atual; consultas obsoletas são canceladas. Logout mostra apenas a cesta de visitante; um novo login recupera a cesta dessa conta. O contador e os totais derivam sempre da cesta selecionada.

Não há fusão automática de visitante com conta. A pessoa autenticada pode escolher **Importar cesta de visitante**, declarando que os artigos são seus. A operação reutiliza validações de produto, quantidade e stock e não realiza uma compra. Sem confirmação, as duas cestas permanecem independentes. A chave antiga sem proprietário é conservada, mas não é atribuída automaticamente a visitante ou conta: não existe informação suficiente para determinar a quem pertenciam essas escolhas.

Eventos `storage` atualizam apenas a cesta correspondente à identidade da aba. Abas de contas diferentes mantêm cestas distintas. Para alterações simultâneas da mesma conta, prevalece a última escrita local; a validação comercial definitiva continua a ser feita no checkout pelo servidor.

O armazenamento contém escolhas e snapshots públicos necessários, sem JWT, passwords, emails de autenticação ou moradas de entrega. Continua a ser armazenamento local do mesmo navegador, não sincronização entre dispositivos nem fronteira de autorização contra alguém com acesso ao próprio perfil do navegador. Falhas de armazenamento mantêm o tratamento explícito existente; não se promete persistência se o navegador a recusar.

## Compra de leilão

O encerramento continua a fixar resultado e vencedor no MongoDB, sem criar encomenda ou processar pagamento automaticamente. Um lote sem ofertas não tem compra disponível. Não se introduzem prazos de compra, penalizações ou transferência para outro licitador.

Só o vencedor autenticado e ativo pode preparar e confirmar a compra. O detalhe autorizado apresenta **Parabéns! Ganhaste este leilão.**, o valor final, o estado e a ação **Finalizar compra**. O produtor vê **Compra pendente de confirmação pelo vencedor.**, sem poder confirmar em nome desse comprador. Depois da formalização, ambos encontram a ligação à encomenda, nas respetivas áreas autorizadas.

O checkout do lote reutiliza os componentes de receção/pagamento e os cálculos de taxas existentes. O valor, produto, produtor, quantidade física e vencedor são derivados dos registos persistidos, não de campos livres do cliente. Horários, modalidades, concelhos, local de levantamento, métodos de pagamento e revisão comercial vêm da configuração atual do produtor. Condições ausentes ou indisponíveis não são inventadas. A confirmação exige um período futuro válido.

### Representação e persistência

- `AuctionRecord.compra` conserva a encomenda associada e a chave/fingerprint privados da confirmação.
- `OrderRecord.leilaoOrigem` referencia o leilão e tem índice único parcial, compatível com encomendas antigas sem esse campo.
- A origem é imutável na evolução da encomenda.
- O preço vencedor é o preço de **uma embalagem comercial indivisível do lote**. O snapshot da unidade contém a quantidade física e a unidade base originais em `conteudoPorUnidade`, além do rótulo do lote. O contexto interno identifica a origem do leilão, que também entra no fingerprint; apenas esse percurso aceita o valor vencedor inteiro seguro acima do teto de preço unitário do catálogo. A validação e persistência exigem uma única embalagem indivisível. O checkout normal conserva o limite de preço dos produtos. Assim, os cálculos monetários existentes continuam exatos, sem inventar um preço por kg/L para representar o valor total da licitação.
- O DTO próprio devolve `leilaoOrigemId`; listagem e detalhe identificam a origem e permitem consultar o leilão. Dados privados de entrega continuam nas projeções autorizadas de encomendas, sem os divulgar no detalhe do leilão.

O ciclo operacional é o existente: pendente → confirmada → em preparação → pronta pelo produtor; a conclusão exige confirmação de receção pelo comprador. O pagamento começa por pagar. Notificações privadas de encomendas e reconciliação REST são reutilizadas; não se acrescentou um protocolo de notificações paralelo.

### Stock, transação e idempotência

O stock físico já foi debitado da disponibilidade livre quando o leilão reservou o lote. A confirmação **não volta a debitar stock**. Consome a reserva afeta ao vencedor, que passa para `consumida`, e associa a encomenda na mesma transação que a cria. A revisão operacional do produto é usada para arbitrar alterações concorrentes, sem alterar o preço, unidade ou quantidade livre do produto global.

A operação reutiliza transações snapshot/majority, guardas de capacidades atuais, seleção comercial, preparação dos snapshots de encomenda, fingerprint canónico e âncora idempotente existentes. O resultado vencedor não é alterado, o leilão não reabre e uma falha aborta tanto a encomenda como a formalização. O índice único da origem e a escrita condicional do leilão impedem duas vendas mesmo com chaves diferentes concorrentes.

Mesma chave e mesmo pedido recuperam o recibo original. Outro pedido após formalização é recusado; a consulta continua a indicar a encomenda existente. Uma resposta perdida não implica falha do commit: o cliente conserva o pedido/chave em memória e oferece recuperação. Depois de refresh/novo login, a consulta persistida do leilão permite reencontrar a encomenda confirmada. Não se guardam moradas do novo checkout de leilão no armazenamento local.

As regras atuais de conta ativa, aprovação, moderação e condições comerciais continuam aplicáveis. Uma compra pendente que deixe de estar elegível permanece pendente até as condições necessárias serem repostas; não há cancelamento automático, libertação arbitrária da reserva ou vencedor alternativo.

## Endpoints efetivos

| Método | Caminho                      | Comportamento                                                                   |
| ------ | ---------------------------- | ------------------------------------------------------------------------------- |
| GET    | `/api/auctions/:id/checkout` | Preparação exclusiva do vencedor com condições atuais e estado da formalização. |
| POST   | `/api/auctions/:id/checkout` | Confirmação transacional, com `Idempotency-Key` e corpo `{condicao}`.           |

POST devolve 201 para criação e 200 para recuperação. O corpo não aceita preço, lote, quantidade, comprador ou produtor arbitrários fora da seleção comercial validada. Condições inválidas dão erro estruturado; autorização/propriedade, conflitos e resultados indeterminados mantêm os códigos HTTP documentados. Um 503 requer consultar ou repetir com a mesma chave/pedido. Não escolher outra chave como tentativa de recuperação.

A compra só aparece no detalhe autenticado do vencedor ou do produtor. Chave, fingerprint, identidade privada do comprador e morada não são difundidos nos eventos de leilão. O evento comunica a nova versão após commit; o detalhe volta a ser lido por REST para reconciliar a formalização.

Consultar o [OpenAPI](openapi.yaml) para os contratos completos. As validações e limitações de autenticação existentes continuam documentadas em [security.md](security.md).

## Validação e revisão manual

Os testes de regressão novos abrangem contas A/B, logout/login, refresh, visitante com importação explícita, armazenamento antigo sem proprietário, abas da mesma conta e de contas diferentes, quantidades e totais. A compra de leilão é exercitada com MongoDB real, autenticação, HTTP, concorrência, rollback, recuperação e associação imutável à encomenda. Os percursos React reais incluem licitação Socket.IO, encerramento, formalização, gestão do produtor e receção pelo comprador.

Executar as suites completas com MongoDB de teste e resultados fora do repositório, conservando os testes anteriores. Não usar mocks como prova de integração real. As páginas afetadas são revistas a 320, 430, 768, 1024, 1280 e 1440 px, com capturas e relatório fora do repositório.

Para revisão manual: criar duas contas compradoras e configurar uma conta produtora de teste; verificar cestas separadas, realizar uma compra normal e depois um leilão com duas pessoas. O vencedor deve confirmar o lote no checkout específico; o produtor deve encontrar a encomenda associada e prepará-la pelo fluxo normal. Só o comprador confirma a receção. O roteiro detalhado e resultados efetivos desta intervenção ficam no relatório externo da Fase 14.2.
