# Orders — consolidação vigente de OR01–OR12

Base preservada: feat/api-foundation em 15c85e95395d9421ef3f65d909c29406f2633032; main c10d031. **O01–O16 e OR01–OR12 aprovadas funcionalmente. Documentação pronta para iniciar um bloco isolado do modelo orders após autorização explícita; implementação não iniciada.** Não há questões funcionais OR por aprovar para esse bloco. Segurança real, configurações de producers, escrita concorrente de products e serviços transacionais são dependências de etapas posteriores, não código existente.

Esta consolidação sucede à revisão anterior, preservada integralmente no arquivo no fim deste documento. As letras B/C identificam as escolhas no novo pedido do utilizador; **prevalece o conteúdo expresso**, não uma correspondência automática com letras ou recomendações anteriores. Foram recusadas por essa via as propostas antigas de suspender preparação, permitir subtotal zero, manter prazo original após reclamação e limitar a uma reclamação ativa. Detalhes de campos, índices e limites abaixo são concretizações técnicas propostas, não novas funcionalidades aprovadas nem autorização de execução.

## Aprovações consolidadas

| ID / opção comunicada | Regra vigente                                                                                                                                                                                                                                                                                                           |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OR01 / B              | Seis estados O02, terminando em concluida; entrega declarada e receção confirmada são acontecimentos distintos. Verificar o termo académico Entregue, sem acrescentar sétimo estado ou alias automático.                                                                                                                |
| OR02 / B              | Configuração comercial em producers: modalidades, taxa, concelhos, disponibilidade semanal e métodos; alterações aditivas compatíveis. Orders preserva snapshots das condições aplicadas e protege contactos/dados privados.                                                                                            |
| OR03 / B              | Agregar pelo ID estável do produto, somar quantidades antes de validar mínimos/incrementos/stock/tetos; inteiros g/ml/unidades/embalagens e um subtotal por produto agregado.                                                                                                                                           |
| OR04 / B              | Cêntimos inteiros, half-up por linha; subtotal arredondado inferior a 1 cêntimo é rejeitado. Total = soma de linhas arredondadas + taxa. Limites técnicos seguros, sem alterar P02/P05 de products.                                                                                                                     |
| OR05 / B              | Chave única da compra global; mesmo pedido/chave recupera resultado original, dados diferentes causam conflito; unicidade persistida e proteção concorrente; transação MongoDB global integral ou rollback integral.                                                                                                    |
| OR06 / C              | Cancelamento válido não é bloqueado por falta de capacidade: repor apenas quantidades dentro dos tetos, guardar o restante pendente e regularizar com auditoria. Sem duplicação ou conversão automática de unidade; reposição controlada/parcial em preparação/pronta.                                                  |
| OR07 / C              | Pedidos de cancelamento pendente/aceite/rejeitado; produtor continua a processar enquanto aguarda. Cada alteração verifica estado/versão atual e regista pedido/decisão/ator/data/justificação, impedindo decisões incompatíveis.                                                                                       |
| OR08 / B              | Agenda semanal em producers; data/intervalo concretos em orders; proposta pendente não muda acordo. Só aceitação explícita do comprador torna alteração efetiva; histórico e fuso horário corretos.                                                                                                                     |
| OR09 / B              | Prazo de 168 horas desde declaração de entrega; pausar enquanto qualquer reclamação não esteja resolvida e retomar apenas o tempo restante. UTC, conclusão automática única auditada, pagamento independente.                                                                                                           |
| OR10 / C              | por_pagar/pagamento_comunicado/pago; comprador comunica, produtor confirma, dinheiro permite confirmação direta. Produtor rejeita comunicação com motivo; reversão de pago exige admin com justificação. Histórico nunca apagado.                                                                                       |
| OR11 / C              | Várias reclamações independentes embebidas, sem unicidade por assunto ou limitação a uma ativa. ID/motivo/descrição/estado/histórico; produtor propõe, comprador aceita ou admin decide fundamentadamente. Sem encerramento unilateral, duplicação técnica ou eliminação de auditoria; limites de segurança explícitos. |
| OR12 / C              | Transação global com stock condicionado e elegibilidade atual; aprovação protegida por escrita/versionamento coordenado, não leitura prévia isolada. Qualquer falha de produto/produtor reverte toda a compra; ensaios de concorrência em MongoDB real.                                                                 |

O01–O16 mantêm-se: OR06 concretiza a exceção necessária à reposição integral imediata de O04 quando falta capacidade, sem impedir O03; OR09 concretiza os sete dias de O14 e a suspensão O15; OR10 acrescenta a correção administrativa fundamentada ao ciclo O10, sem autorizar admin a confirmar recebimentos normais. OR11 não aprova coleção de reclamações. OR05/OR12 adotam transações/idempotência apenas para encomendas; não aprovam Q07–Q10 de leilões/reviews nem todos os detalhes D06/D07/D08.

## Compatibilidade académica e prontidão

O PDF pp. 4/18 usa entregue, incluindo enum no exemplo; RF-ENC-03 da Fase 0 preserva essa designação. **Existe diferença literal**, que não pode ser declarada aceite pelo docente. O modelo mantém concluida por aprovação explícita e regista entregaDeclaradaEm, confirmacaoRececaoEm e conclusão separadamente. O relatório académico deverá explicar o percurso físico de entrega e a conclusão administrativa/comercial, com histórico visível. Não mapear entrega declarada para concluida nem omitir a divergência; obter validação académica antes da aceitação final, sem bloquear o schema interno já aprovado nem alterar F0.

Embedding de linhas, comprador/produtor referenciados a users e coleção orders cumprem a estrutura académica. Campos de cancelamento, pagamento e reclamação são expansões aprovadas pelo utilizador, não exigências textuais novas do enunciado. Manter POST /api/orders e PATCH /api/orders/:id/estado, códigos e segurança previstos; nenhuma rota é criada nesta tarefa.

**Conclusão de entrada:** pronta a especificação do modelo isolado, tipos, cálculos, validações locais, índices e testes de persistência. Não há bloqueio funcional OR pendente para o iniciar quando autorizado. Não confundir esta prontidão com checkout operacional: perfis ainda não têm configuração comercial, modelos atuais bloqueiam updates condicionados, não há protocolo comum de versões/segurança, agendador ou DTOs de todos os comandos. Essas etapas têm ficheiros e critérios próprios abaixo.

## Estrutura final proposta para persistência

Nomes físicos são uma concretização técnica a manter coerente na implementação; DTOs e documentos Mongoose continuam separados. A coluna imutável refere-se à informação submetida, não à proibição de guardar novos acontecimentos autorizados.

| Grupo                                | Campos / comportamento propostos                                                                                                                                                                                                                                     |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identidade e concorrência            | _id; comprador/produtor ObjectId → users, imutáveis; operacaoCompraId opaco comum; versao inteira crescente; createdAt/updatedAt UTC. Perfil público tem ID distinto, resolvido no DTO.                                                                              |
| linhas[]                             | Uma linha por produto após agregação; id estável de linha, produto ObjectId, nome, quantidade, precoReferenciaCent, unidadeSnapshot completa, subtotalCent ≥ 1 e versão/identidade da unidade para reposição. Snapshot imutável; nunca recalcular com produto atual. |
| Totais                               | subtotalProdutosCent = soma das linhas; taxaEntregaCent aplicada uma vez; totalCent = subtotal + taxa; moeda EUR. Operação soma totais das orders sem novo arredondamento.                                                                                           |
| entrega.snapshot                     | Tipo, concelhoId estável, tarifa aplicada e local/morada/contacto necessários; período escolhido inicial e zona IANA. Snapshot inicial imutável. Morada só quando entrega ao domicílio; sem copiar zonas/agenda inteiras.                                            |
| entrega.acordoAtual / propostas[]    | Acordo atual referencia período inicial ou proposta aceite; proposta com ID, intervalo UTC, zona, estado pendente/aceite/rejeitada e decisões auditadas. Acrescentar aceitação não reescreve snapshot inicial.                                                       |
| pagamento                            | Método escolhido imutável; estado por_pagar/pagamento_comunicado/pago; eventos com de/para, tipo, ator, data, motivo e comando. Dados bancários não são acrescentados por inferência.                                                                                |
| estado / historicoEstado[]           | Seis estados O02; cadeia operacional pelo produtor, cancelamentos O03 e conclusão O13/O14 separados por ação. Atores técnicos explicitamente distintos de contas; sem administrador fictício.                                                                        |
| pedidosCancelamento[]                | IDs, pendente/aceite/rejeitado, autor/data/motivo, decisão e versão observada. Pedido não congela preparação. Estado terminal impede aceitação incompatível; não criar quarto estado ou decidir pedido automaticamente por omissão.                                  |
| cancelamento / reposicoes[]          | Estado anterior e motivo; por linha, quantidade debitada, autorizada a repor, efetivamente reposta, pendente e não destinada a reposição; movimentos com ID/ator/data/justificação. Repetição não altera saldo duas vezes.                                           |
| rececao                              | entregaDeclaradaEm, confirmacaoRececaoEm, modo/data/motivo de conclusão e cronómetro persistido: duracaoMs 604800000, decorridoMs, ultimoInicioEm, pausadoDesde e limiteAtualEm. Limite pode estar ausente enquanto pausado, sem perder o tempo restante.            |
| reclamacoes[]                        | Várias, incluindo simultaneamente ativas: ID, motivo, descrição, estado aberta/em_analise/escalada/resolvida; propostas de solução e intervenções com ID, tipo, responsável/data, conteúdo/decisão. Só comprador aceita solução ou admin resolve fundamentadamente.  |
| idempotencia, apenas na order âncora | Chave global, hash canónico, IDs do grupo e resultado original mínimo imutável. Metadados internos não são devolvidos ao produtor nem usados como autorização. Não criar coleção adicional.                                                                          |

Ator persistido proposto: utilizador com userId real e papelNaAcao, ou sistema com identificador técnico; autoria deriva do servidor e nunca de uma conta fictícia. O DTO OrderActor é uma projeção reduzida distinta, sem userId administrativo privado.

Configuração comercial futura em producers é aditiva: bloco comercial opcional para perfis antigos, com pelo menos uma modalidade/método quando habilitado a receber novas encomendas; taxa não negativa, zonas por concelhoId e disponibilidade por dia local/início/fim/fuso. Manter concelho textual e campos/privacidade existentes; acrescentar concelhoId/catalogoVersao sem reinterpretação destrutiva. Perfis antigos não são automaticamente habilitados com preços/horários inventados. O catálogo real de concelhos e o adaptador de códigos são detalhe técnico a validar antes da configuração real; testes podem usar IDs explicitamente fictícios.

### Agregação, unidades e aritmética

Agregação exclusivamente por produtoId estável; não fragmentar em linhas por preço antigo. Duplicados com aceitação comercial contraditória exigem reconfirmação, não escolha silenciosa de preço. Somar inteiros exatos antes de mínimo, passo, stock e teto. Concretização da grelha B da revisão: quantidade ≥ mínimo e (quantidade − mínimo) múltipla do incremento; não confundir essa grelha com quantidade múltipla do incremento a partir de zero.

Preço por 1000 g/ml ou por uma unidade/embalagem mantém P02. BigInt apenas no cálculo intermédio, half-up por quociente/resto e conversão validada para Number seguro em JSON/BSON. Validar subtotal ≥ 1 depois do arredondamento; não cobrar um cêntimo artificialmente. Exemplo aprovado: 250 g × 150 cêntimos/kg → 38; duplicados 250 + 250 g são primeiro 500 g e dão 75, não 76. Compra de 1 g a 1 cêntimo/kg resulta zero e é recusada, sem alterar o preço aprovado do produto.

### Limites técnicos concretos propostos

São proteções operacionais propostas nesta documentação, não tetos comerciais de products nem instalações. Podem ser afinadas com evidência sem reabrir O/OR, desde que a auditoria seja preservada e não se introduzam novas regras comerciais.

| Dado                                      | Limite técnico proposto                                                                                           | Justificação / efeito                                                                                                                                                                                                                                                        |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preço e stock de products                 | Mantidos: 1–1 000 000 cêntimos; 10 000 000 g/ml ou 100 000 unidades/embalagens                                    | Nenhuma mudança P02/P05. Quantidade agregada nunca excede stock/teto da modalidade.                                                                                                                                                                                          |
| Dinheiro de order/operação/taxa           | Inteiros seguros entre 0 e 9007199254740991; linha/total de order ≥ 1                                             | Number.MAX_SAFE_INTEGER; BigInt verifica cada soma e o total da operação antes da conversão. Taxa zero permitida, levantamento exige zero; não copiar teto de preço de produto para taxa/total.                                                                              |
| Linhas/produtores por compra              | 100 produtos distintos / 10 produtores                                                                            | Transação curta e pedido limitado; contar após agregação e rejeitar excesso explicitamente, sem dividir em compras parciais. Limites técnicos propostos, não exigência académica.                                                                                            |
| Pedido HTTP futuro                        | 100 KiB JSON já configurados na fundação                                                                          | Não alterar esse limite agora; tamanho é validado antes de transação. Snapshots do catálogo são validados separadamente, pois podem ser maiores que o pedido.                                                                                                                |
| Chave e hash idempotentes                 | Chave opaca até 128 caracteres ASCII; SHA-256 canónico de 64 caracteres hexadecimais                              | Cabeçalho limitado, sem dados pessoais; hash não é autenticação. UUID gerado pelo cliente é opção técnica, sem nova dependência.                                                                                                                                             |
| Motivo/justificação e textos novos        | Motivo até 500 pontos de código; justificação/intervenção até 2000; descrição de reclamação até 4000              | NFC/trim, sem truncagem; erro identifica campo. Limites só para novos inputs de orders, não para alterar nome/descrição existentes de products.                                                                                                                              |
| BSON inicial / normal / absoluto de order | 1 MiB na criação, 6 MiB de orçamento normal, 8 MiB absoluto                                                       | Margem perante limite BSON 16 MiB; medir tamanho BSON real, não comprimento de JSON. Produto com snapshot demasiado grande é recusado antes do débito, nunca truncado.                                                                                                       |
| Reserva de auditoria                      | 128 KiB de reserva base por order e mais 128 KiB por processo ativo admitido, contabilizados até ao teto de 8 MiB | Reservar espaço para decisões de fecho e metadados, além do orçamento normal. Dimensionar pelo menos quatro eventos críticos máximos, metadados e movimentos de stock; validar BSON real e reserva pessimista contra Unicode; não prometer aceitação ilimitada de mensagens. |
| Prazo de receção                          | 604800000 ms de contagem efetiva; 0 ≤ decorridoMs ≤ esse valor                                                    | Exatamente 168 horas; pausas não consomem tempo. Datas UTC e fuso IANA preservado para agenda local.                                                                                                                                                                         |

Não definir um limite funcional de uma reclamação ativa nem deduplicar por motivo, produto ou descrição. IDs/chave do comando evitam apenas repetição técnica; nova reclamação legítima, mesmo semelhante, tem ID próprio. Crescimento ilimitado é incompatível com qualquer documento finito. Antes de aceitar uma intervenção, reservar capacidade para preservar o seu ciclo auditável; se não houver capacidade, recusar atomicamente sem apagar histórico, manter reclamações existentes abertas/pausadas e sinalizar o limite operacional. O modo de reserva e tamanho exato são testes de segurança obrigatórios antes do serviço.

Não há bloqueio estrutural para persistir dentro deste envelope. **Se os ensaios demonstrarem que a reserva não preserva todas as decisões obrigatórias de processos já aceites, interromper esse bloco e reportar antes de qualquer extração/coleção nova.** Aceitação ilimitada de reclamações/intervenções não pode ser prometida; essa exigência futura implicaria nova análise, nunca migração ou eliminação silenciosa.

### Idempotência global e índices

Concretização técnica proposta sem nova coleção: todas as orders recebem operacaoCompraId; uma é âncora e guarda idempotencia.chave. Índice único parcial `{ 'idempotencia.chave': 1 }`, filtro por tipo string; demais orders omitem o campo. Chave global não inclui produtor: duas compras com produtores disjuntos continuam a disputar a mesma chave. Acrescentar índice único `{ operacaoCompraId: 1, produtor: 1 }`; consultas por comprador/data, produtor/estado/data e data limite de receção. Criar/aguardar índices explicitamente só na fase autorizada; autoIndex/autoCreate continuam desligados. Não usar TTL.

Fingerprint canónico inclui linhas agregadas/ordenadas, quantidades e oferta aceite, condições selecionadas por produtor, período, método, taxa aceite e dados privados necessários; hash nunca é exposto como dado comercial. Não incluir versão de transporte ou ordem arbitrária das linhas. Mesmo pedido após normalização tem o mesmo hash; alterações comerciais são pedidos diferentes. Chave alheia não devolve resultado: autenticar e comparar comprador antes de recuperar; colisão com outro comprador produz conflito genérico sem revelar grupo/identidade.

Guardar recibo original mínimo imutável: operação, data inicial, IDs/produtores das orders, estados iniciais e totais/moeda. Repetição devolve esse recibo, não estados atuais reconstruídos de documentos mutáveis. Consultar estado atual é leitura separada autorizada. A âncora tem manifesto do grupo mas o DTO do produtor nunca o inclui. Resultado/chave/hash/âncora são criados na mesma transação dos débitos e de todas as orders. Commit incerto recupera a mesma chave; nenhum retry gera automaticamente uma nova. Conservação da chave acompanha os documentos, sem expiração automática nesta proposta.

### Stock, cancelamento e coordenação concorrente

Débito futuro por predicado que combina proprietário, publicado, oferta/unidade/versão aceites, quantidade disponível e teto; repo interno restrito. Todo o checkout usa a mesma sessão/transação. Ler aprovação não basta: obter uma escrita condicional real no perfil elegível/configurado, por exemplo incrementar uma revisaoOperacional comparada, e obrigar mudanças de aprovação/configuração a usar o mesmo protocolo. Escritores comerciais de produto também usam versão condicionada; qualquer conflito repete a transação e revalida aceitação/elegibilidade. Não atribuir essa garantia a __v ou a leituras de snapshot isoladas. Novas alterações futuras de capacidade da conta terão de participar na coordenação da elegibilidade; não criar agora poderes de alteração de papéis.

Esta coordenação serializa as operações relevantes no perfil sem alterar os direitos comerciais. Transações usam primary, snapshot e majority, sessão explícita em todas as operações, ordem estável e sem paralelismo interno. Tempo/retries são parâmetros técnicos limitados; nenhuma emissão Socket.IO/efeito externo no callback repetível. O helper atual bloqueia updates por query e models existentes não têm ainda revisões coordenadas: a implementação futura do repositório exige autorização própria, validação explícita e testes, sem enfraquecer guardas nem escrever diretamente a partir das rotas.

Cancelamento pendente/confirmada autoriza reposição integral, mas aplica já apenas min(quantidade autorizada em falta, capacidade atual); restante fica pendente de regularização OR06. Preparação/pronta: produtor escolhe quantidades por linha, incluindo zero/parcial, com motivo; quantidade deliberadamente não destinada a reposição não é confundida com pendência. Invariantes: reposta + pendente = autorizada; autorizada + naoRepor = debitada; todas não negativas e sem duplicação de movimento. Se unidade mudou, produto está ausente ou guardas impedem uma escrita segura, registar a pendência sem impedir o cancelamento válido; não converter nem publicar por efeito da reposição. Regularização posterior aplica só o saldo e guarda ator/data/razão/capacidade observada.

Pedido de cancelamento não suspende preparação nem o relógio de receção. A aceitação verifica a versão/estado atuais e usa a política de reposição desse instante, não a do pedido antigo. Um pedido pendente nunca autoriza cancelar uma concluída. Não decidir pedidos automaticamente nem apagar os que ficaram historicamente pendentes; ações posteriores incompatíveis falham com conflito. Cancelamento efetivo e reposição/pendência são registados atomicamente, sem depender de pagamento online.

### Agenda, pagamento e reclamações

Guardar datas concretas UTC de início/fim e zona IANA; agenda semanal é local à zona do produtor. Datas inexistentes na mudança de hora são recusadas; instantes ambíguos exigem offset explícito, sem adivinhar ou deslocar silenciosamente. Proposta identificada não sobrescreve acordo; aceitação compara versão/estado e acrescenta novo evento/acordo efetivo. Revisão posterior da agenda habitual não modifica encomenda existente.

Pagamento: por_pagar → pagamento_comunicado pelo comprador; comunicado → pago pelo produtor; por_pagar → pago diretamente pelo produtor para dinheiro; comunicado → por_pagar pelo produtor que rejeita, com motivo. Pago só pode ser revertido por administração com justificação e estado de destino não pago coerente com a correção auditada; admin não passa a confirmar recebimentos normais. Histórico com de/para, ação e fundamento preserva os acontecimentos originais. Cancelamento/conclusão não apaga pagamento ou executa reembolso. Não inferir confirmação direta não monetária sem comunicação, uma recomendação anterior não escolhida no conteúdo de OR10.

Várias reclamações podem estar abertas/em_analise/escaladas em simultâneo. Solução proposta não é resolução; só aceitação do comprador ou decisão administrativa fundamentada resolve, sem fecho unilateral do produtor. Estado da reclamação é independente da order; não criar regra automática de reabertura de encomenda concluída nem proibir reclamação apenas por estado terminal, sem base no pedido aprovado. IDs e versões evitam replay de intervenções sem impedir novas reclamações legítimas.

### Cronómetro de receção pausável

Guardar duração fixa, tempo já consumido e início do trecho ativo. Na primeira reclamação não resolvida, somar o trecho decorrido ao acumulado (limitado a 168 h), limpar limite ativo e guardar pausa. Reclamações adicionais não pausam nem descontam novamente. Resolver uma mantendo outra ativa não retoma; resolver a última inicia novo trecho com o tempo restante e calcula o novo limite UTC. Pausas sobrepostas contam uma só vez. Reclamação anterior à declaração de entrega faz o cronómetro nascer pausado com todo o prazo por consumir.

Exemplo: declaração às 10:00 UTC de 1 de novembro; reclamação após 48 h deixa 120 h. Uma segunda reclamação sobreposta não muda esse saldo. Quando todas ficam resolvidas às 10:00 UTC de 5 de novembro, novo limite é 10:00 UTC de 10 de novembro. Nunca retomar o limite original nem conceder 168 h novas. Se saldo for zero, a conclusão fica elegível quando deixar de haver pendências, sem pressupor execução imediata.

Declaração, reclamação, resolução, confirmação de receção e job atualizam a mesma order com estado/versão condicionados. O job só conclui uma vez, a partir da etapa permitida, com entrega declarada, prazo efetivo esgotado e nenhuma reclamação não resolvida; grava ator técnico/data/motivo. Se reclamação entrar primeiro, job reavalia e não conclui; se conclusão vencer, intervenção posterior preserva o ocorrido e segue o fluxo de reclamação sem reabrir automaticamente. Pagamento nunca é alterado pelo job. Reexecução/restart usa dados persistidos, não timer em memória ou TTL.

## Exemplos documentais completos de DTOs propostos

Os dois exemplos seguintes são fictícios, validados contra OrderLine e CheckoutGroup, sem inserção ou execução de compra. A linha exemplifica 250 + 250 g agregados antes do cálculo; o recibo exemplifica 950 + 38 cêntimos e não é resultado dessa única linha.

```json
{
  "id": "linha-ficticia-001",
  "produtoId": "produto-ficticio-001",
  "nome": "Batatas fictícias",
  "quantidade": 500,
  "precoReferenciaCent": 150,
  "unidadeSnapshot": {
    "modalidade": "peso",
    "unidadeBase": "g",
    "quantidadeReferencia": 1000,
    "quantidadeMinima": 250,
    "incrementoCompra": 50
  },
  "versaoUnidade": 0,
  "subtotalCent": 75
}
```

```json
{
  "operacaoCompraId": "compra-ficticia-001",
  "createdAt": "2026-11-01T10:00:00Z",
  "encomendas": [
    {
      "id": "order-ficticia-001",
      "produtorId": "perfil-ficticio-001",
      "estadoInicial": "pendente",
      "totalCent": 950
    },
    {
      "id": "order-ficticia-002",
      "produtorId": "perfil-ficticio-002",
      "estadoInicial": "pendente",
      "totalCent": 38
    }
  ],
  "totalCent": 988,
  "moeda": "EUR"
}
```

## DTOs e OpenAPI documentais

OrderStatus passa aos seis estados O02; preço de linha tem referência fixa e subtotal ≥ 1; CreateOrder seleciona condições por produtor e CheckoutGroup representa recibo original do grupo, inclusive com um só produtor. Não permitir oneOf de respostas comerciais diferentes. Corpo enviado inclui IDs/quantidades e aceitação das condições; servidor resolve ownership e calcula tudo novamente. Dados aceites do browser não são valores autoritativos de preço ou stock.

Separar DTO comum sem morada/contactos/manifesto do armazenamento e da projeção privada de cumprimento. GET de interveniente/admin continua sujeito a propriedade e necessidade; DTO privado complementar, quando necessário, exige mapeamento explícito/segurança na etapa HTTP, não exportação do modelo. Chave/hash/manifesto/reserva interna de auditoria nunca são devolvidos pelo simples toJSON/populate. Leitura parcial tem de serializar sem acessos inseguros; gravação de projeção incompleta é recusada. Modelos anteriores e suas projeções permanecem intactos.

Os schemas OpenAPI são uma proposta técnica alinhada com as aprovações, não schemas Mongoose criados nem endpoints disponíveis. Comandos específicos de cancelamento/pagamento/reclamação/agenda/receção terão DTOs próprios na fase de serviços/HTTP, sem usar PATCH /estado para dar qualquer poder ao cliente. As 45 operações existentes permanecem bloqueadas exceto health implementado; nenhum método/path/operationId adicional é introduzido. Não se declara o contrato inteiro congelado antes dos testes de implementação e segurança.

## Plano por etapas e aceitação

| Etapa futura                  | Ficheiros previstos                                                                                                                      | Aceitação e fronteira                                                                                                                                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.2.d.1 — tipos/cálculos      | modules/orders/{order.types,order.constants,order.calculations}.ts e teste unitário próprio                                              | Agregação por produto, grelha, referências kg/L, half-up após agregar, recusa de zero/overflow; sem efeitos de stock/HTTP.                                                                            |
| 3.2.d.2 — persistência        | modules/orders/order.model.ts, validações locais se úteis, tests/{unit,integration}/order-model.spec.ts, tests/support/order-fixtures.ts | Snapshots, enums, históricos, cronómetro, campos privados e âncora/índices; leitura completa/parcial segura e rollback técnico com MongoDB real. Sem checkout ou alterações aos três modelos prévios. |
| Preparação aditiva dependente | Extensão comercial/versionamento de producers; protocolo de produtos/repositório de stock                                                | Autorização explícita por ficheiro; compatibilidade com perfis existentes, coordenação da aprovação/configuração e todos os escritores. Não enfraquecer helper existente.                             |
| 3.4.a — checkout interno      | Serviço/repositório orders e testes concorrentes                                                                                         | Grupo integral, oferta aceite, stock seguro, unicidade global e recibo original, rollback/commit incerto sem duplicação. C04 mantém HTTP privado ausente.                                             |
| 3.4.b — ciclo comercial       | Comandos de cancelamento/reposição/agenda/pagamento/reclamação e testes                                                                  | Ações/versões/justificações e reserva de auditoria; saldo de stock auditável, várias reclamações, relógio pausável.                                                                                   |
| Etapas próprias posteriores   | Job persistido, DTOs/rotas reais, autenticação/RBAC, adaptação frontend e sockets                                                        | Autorização separada; segurança antes de rede privada, regressão das três áreas/carrinho/design e comunicação só após commit.                                                                         |

Não exigir novas decisões funcionais sobre nomes de campos, geração de IDs opacos, representação de índice parcial, hashing canónico, medição BSON, testes/fixtures ou ajuste de timeouts. São concretizações técnicas dentro das invariantes aprovadas; qualquer mudança a direitos, introdução de um sétimo estado, novas coleções, estados de pagamento, prazo de 168 h, política de stock ou garantia de auditoria requer nova autorização. A execução de qualquer etapa também requer autorização, mesmo sem bloqueios funcionais.

### Plano de testes final

- Unidade: agrupamento por ID estável com quantidades repetidas, mínimos/passos/tetos após agregação, aceite comercial contraditório, 250 + 250 g → 75 cêntimos, rejeição de linha zero, frações/string/NaN/Infinity/overflow e taxa única por produtor. Não alterar P02/P05.
- Persistência: snapshots e ownership imutáveis, seis estados sem entregue extra, todas as listas/enums/datas/versões, índices e âncora única, privacidade inclusive com populate e serialização parcial, BSON real/Unicode máximo e reservas de fecho. MongoDB efémero real; modelos anteriores preservados.
- Checkout: último stock entre compradores; falha no último produtor desfaz o grupo; mesma chave/dados em paralelo devolve um recibo; chave igual/dados ou produtores disjuntos diferentes dá conflito; chave de outro comprador não revela dados; resposta perdida e retry após mudanças de estado/preço devolvem recibo original sem novo débito.
- Concorrência: aprovação/configuração mudadas durante submissão; alteração simultânea de preço/unidade/stock e formulário antigo; confirmar que a escrita condicional no perfil faz ambos os escritores revalidarem, não um teste baseado apenas numa leitura prévia.
- Reposição: cancelamento continua válido no teto, restituição só até capacidade e pendência exata; regularizações simultâneas/repetidas não duplicam; modalidade mudada não converte; produto ausente/arquivado/perfil alterado não apaga direito nem dívida de stock; preparação/pronta repõem só quantidade autorizada.
- Cancelamento: pedido pendente não bloqueia preparação; aceitar usa estado/versão atuais; decisão concorrente aceite/rejeitado só uma vence; concluída nunca cancelada; histórico/justificação intactos e nenhum pedido decidido silenciosamente.
- Agenda/pagamento: proposta não altera acordo; aceitação concorrente com nova proposta tem precondição; fusos/mudança de hora; rejeição de pagamento comunicado com razão; pagamento confirmado só revertido por admin fundamentado; produtor/admin alheios recusados, eventos anteriores preservados, conclusão não marca pago.
- Reclamações/receção: várias legítimas simultâneas e retries técnicos distintos; sem fecho unilateral; duas pausas sobrepostas, resolver só uma, última resolução/tempo restante, reclamação anterior à entrega, restart/fronteira de prazo, job versus reclamação/receção e execução automática única. Recusa de crescimento inseguro conserva auditoria e espaço de decisões já admitidas.
- Regressão no bloco de implementação: preservar os 228 backend anteriores e acrescentar os testes pertinentes; TypeScript API/frontend, ESLint, Prettier e build API. Não repetir Playwright nesta documentação; preservar 274 testes e reexecutar na integração autorizada.

### Verificações e limites desta consolidação

Apenas verificações documentais: O/OR/limites, referências/estrutura OpenAPI, exemplos JSON, links/âncoras, Prettier, git diff --check e comparação de conteúdo com o início da tarefa. Nenhum teste de aplicação, ligação MongoDB, contentor, instalação ou alteração de código. Os resultados finais constam de traceability.md. Aprovações/documentos anteriores preservados, nove F0 intactos, HEAD/main/branch sem mudança e staging vazio.

**Aguardar autorização explícita para a implementação local de orders; não iniciar nenhuma etapa nesta tarefa.**

---

## Arquivo integral da revisão anterior — propostas entretanto substituídas

O conteúdo abaixo é histórico e preservado para rastreabilidade. Onde disser OR pendente, uma reclamação ativa, prazo original, suspensão de preparação ou subtotal zero permitido, prevalece a consolidação vigente acima. As alternativas antigas não são regras atuais nem novas questões a decidir.

# Fase 3.2 — prontidão do modelo orders

Revisão técnica e documental de 17 de outubro de 2026. Base: feat/api-foundation em 15c85e95395d9421ef3f65d909c29406f2633032; main em c10d031. Users, producers e products estão implementados e consolidados; **orders não está implementado nem autorizado para implementação nesta tarefa**. O01–O16 estão aprovadas funcionalmente; as propostas OR01–OR12 abaixo continuam por aprovar. Nenhuma aprovação implícita de todas as recomendações D08, de um schema ou de alterações aos modelos existentes.

## 1. Fontes e âmbito

Consultados os nove originais da Fase 0: [requisitos funcionais](../requirements/functional-requirements.md), [não funcionais](../requirements/non-functional-requirements.md), [casos de utilização](../requirements/use-cases.md), [visão global](../architecture/system-overview.md), [diagramas](../architecture/architecture-diagram.md), [consistência de leilões](../architecture/auction-consistency.md), [decisões](../architecture/decisions.md), [modelo de dados](../database/data-model.md) e [plano oficial](../planning/implementation-plan.md). Permanecem documentos históricos imutáveis.

Consultados [README API](README.md), [decisões atuais](decisions.md), [mapeamento](data-mapping.md), [modelos candidatos](phase-3.2-models.md), [proposta](phase-3.2-proposal.md), [prontidão anterior](phase-3.2-readiness.md), [entrega products](phase-3.2-products.md), [plano](implementation-plan.md), [OpenAPI](openapi.yaml), [segurança](security.md), [rastreabilidade](traceability.md) e [integração frontend](frontend-integration.md).

Revistos os modelos e testes de users/producers/products, o helper de validação partilhado, os testes transacionais e os tipos de encomenda das áreas comprador/produtor/administrador. São reutilizáveis as factories por conexão, timestamps, validação estrita, fixtures fictícias e bases aleatórias de integração; não os quatro estados ou os cálculos simplificados do frontend demonstrativo.

PDF académico original: 27 páginas, SHA-256 ff42084c30a5a663ce4165ae301c5255dd313f710e51af446fd5dbffe3925243. Páginas 4/10/11: encomendas, entrega e atualização de estado; 17: POST /api/orders e PATCH /api/orders/:id/estado; 18: orders, linhas embebidas, referências a users e validações; 19/20: contrato e segurança; 22: notificação de estado. Não se copiou o PDF nem se executaram os seus exemplos como instruções.

## 2. Aprovações O01–O16

| ID  | Decisão aprovada e alcance                                                                                                                                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O01 | Carrinho único; uma encomenda independente por produtor, todas com referência comum à compra; cada produtor gere apenas a sua; submissão global atómica, sem encomendas parciais.                                                                                                                        |
| O02 | Estados pendente, confirmada, em_preparacao, pronta, concluida, cancelada. Percurso principal pendente → confirmada → em_preparacao → pronta → concluida; cancelamento separado.                                                                                                                         |
| O03 | Pendente: comprador cancela diretamente, produtor/admin também podem cancelar. Após confirmação e antes da conclusão: comprador solicita; produtor aceita/recusa ou cancela com motivo; admin cancela com justificação. Concluída não cancelável. Guardar responsável, data, motivo, pedidos e decisões. |
| O04 | Cancelamento pendente/confirmada repõe automaticamente a totalidade; em_preparacao/pronta tem reposição controlada pelo produtor. Sem reposição duplicada; respeitar tetos P05. Quantidade da reposição controlada e conflitos com teto ainda exigem detalhe.                                            |
| O05 | Levantamento no produtor e entrega ao domicílio; produtor escolhe modalidades e precisa de pelo menos uma ativa para receber encomendas. Cada encomenda tem modalidade própria.                                                                                                                          |
| O06 | Taxa fixa por produtor, incluindo zero; aplicada uma vez por encomenda com entrega; levantamento sem taxa. Valor aplicado fica no snapshot e não muda com tarifas posteriores.                                                                                                                           |
| O07 | Produtor escolhe concelhos de entrega com IDs estáveis; concelho da morada tem de estar abrangido; mesma taxa nos concelhos desse produtor; alterações posteriores não afetam encomendas submetidas.                                                                                                     |
| O08 | Dias/horários configurados por produtor; comprador escolhe período disponível; produtor confirma ou propõe alteração que exige aceitação do comprador. Guardar acordo; alterações da agenda habitual não o reescrevem.                                                                                   |
| O09 | Pagamento direto: dinheiro, MB WAY ou transferência; produtor aceita pelo menos um método; comprador escolhe antes da submissão; método guardado por encomenda. Sem processamento online nem exposição pública de contactos/dados bancários privados.                                                    |
| O10 | Pagamento por_pagar/pagamento_comunicado/pago; comprador comunica, apenas produtor confirma receção; dinheiro permite marcação direta pelo produtor. Histórico próprio, independente do estado da encomenda; sem verificação bancária automática.                                                        |
| O11 | Linhas guardam referência, nome, quantidade, unidade, preço de referência e subtotal; encomenda guarda subtotal de produtos, taxa e total final. EUR/cêntimos inteiros, cálculo no servidor e half-up por linha T32-03; alterações de produto não reescrevem snapshots.                                  |
| O12 | Carrinho sem reserva; revalidar preço, stock e disponibilidade antes e na submissão segura. Preço alterado exige confirmação; falta de stock exige ajuste/remoção explícitos, sem alteração silenciosa ou criação parcial.                                                                               |
| O13 | Produtor declara entrega/levantamento realizado; comprador confirma receção e a encomenda passa a concluida. Admin pode intervir em divergência com justificação. Conclusão não confirma pagamento.                                                                                                      |
| O14 | Após entrega declarada, comprador tem sete dias para confirmar ou comunicar problema. Sem resposta nem reclamação pendente, pode haver conclusão automática após esse prazo. Guardar declaração, limite, conclusão e motivo automático; não alterar pagamento.                                           |
| O15 | Comprador reclama; produtor analisa e propõe solução; comprador aceita ou pede intervenção administrativa; admin consulta histórico e fundamenta decisão. Sem reembolso automático; reclamação não resolvida suspende conclusão automática.                                                              |
| O16 | Reclamações e intervenções embebidas na encomenda, sem coleção nova; estados aberta/em_analise/escalada/resolvida. Intervenções com ID, responsável, data, tipo, conteúdo e decisões. Estado independente da encomenda.                                                                                  |

Estas aprovações fecham a escolha funcional Q02 e parte substancial de Q05/Q06; não fecham todos os detalhes técnicos, restantes Q/C ou equivalência académica. O03/O13/O15 concedem poderes administrativos específicos que não existiam no protótipo apenas de consulta. Não concedem edição arbitrária de encomendas. O09 não altera a exclusão de pagamentos online. O16 não autoriza uma coleção de reclamações.

## 3. Estrutura preliminar — proposta, sem schema criado

Nomes físicos e obrigatoriedades adicionais são candidatos. ObjectId, datas UTC e inteiros seguros seguem o padrão existente como recomendação técnica; DTOs próprios continuam obrigatórios por C01. Não exportar documentos Mongoose diretamente.

| Grupo candidato            | Conteúdo e invariantes propostas                                                                                                                                                                                                                                     | Dependências                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Identidade                 | _id; comprador/produtor → users imutáveis; createdAt/updatedAt; versão explícita para comandos concorrentes. Produtor vem dos produtos, comprador da identidade autenticada futura.                                                                                  | O01, T32-06, OR05/OR12          |
| Operação comum             | operacaoCompraId comum; referência de apresentação separada da chave idempotente do pedido; metadados de deduplicação internos, sem contactos de outros produtores.                                                                                                  | O01, OR05                       |
| linhas[]                   | ID de linha estável proposto; produto → products; nome; quantidade inteira; snapshot de modalidade/base/referência/mínimo/incremento/conteúdo; precoReferenciaCent; subtotalCent. Todos pertencem ao mesmo produtor e ficam comercialmente imutáveis após submissão. | O11, T32-02/03, OR03/OR04       |
| Totais                     | subtotalProdutosCent = soma das linhas; taxaEntregaCent; totalCent = subtotal + taxa; moeda EUR. Total da operação é soma das orders, não nova encomenda comercial.                                                                                                  | O06/O11, OR04                   |
| entrega                    | Tipo; concelhoId e nome no snapshot; morada privada só para domicílio; local de levantamento e contactos estritamente necessários; tarifa aplicada; período pedido, propostas com decisão e período acordado. Não copiar o catálogo de zonas inteiro.                | O05–O08, OR02/OR08              |
| pagamento                  | Método escolhido e snapshot mínimo da condição comercial; estado e histórico de comunicação/confirmação com autor/data. Não guardar JWT, hash ou dados bancários por inferência. Instruções privadas só se aprovadas e necessárias.                                  | O09/O10, OR10                   |
| estado / historicoEstado[] | Seis códigos O02; evento inicial e eventos de transição com de/para, autor, data, motivo quando exigido e ID de comando proposto. Ator técnico separado da conta humana na conclusão automática.                                                                     | O02/O03/O13/O14, OR01/OR07/OR09 |
| cancelamento               | Pedidos identificados, estado e decisão com autor/data/motivo; cancelamento efetivo distinto de pedido; estado anterior registado para determinar a política de stock.                                                                                               | O03, OR07                       |
| reposicaoStock[]           | Por linha: quantidade debitada, reposta e eventual pendência/decisão de não repor; unidade do snapshot; responsável/data e identificador de movimento. Soma reposta nunca excede o débito original, mesmo após retries.                                              | O04, OR06                       |
| rececao                    | Declaração de entrega pelo produtor, data limite, confirmação do comprador, conclusão com data, tipo e motivo; reclamação aberta impede conclusão automática. Nenhum destes campos confirma pagamento.                                                               | O13/O14, OR09                   |
| reclamacoes[]              | ID, estado O16, autor/data/assunto; proposta de solução e decisões; intervenções estruturadas com IDs únicos dentro da ordem e histórico preservado. Não equivalem a reviews.                                                                                        | O15/O16, OR11                   |

Nomes, quantidades, preços e taxa submetidos são snapshots comerciais imutáveis; período acordado só muda com aceitação e histórico O08. Estado, pagamento, pedidos, reclamações e reposições evoluem por comandos auditados. Um estado terminal da encomenda não torna necessariamente terminal o pagamento ou a reclamação. Não definir agora origemLeilao, reserva ou conversão: Q07 continua futuro.

### Índices candidatos

- `{ comprador: 1, createdAt: -1 }` para compras próprias; `{ produtor: 1, estado: 1, createdAt: -1 }` para gestão de cada produtor.
- `{ operacaoCompraId: 1, produtor: 1 }` único proposto: uma order por produtor/operação. Não garante idempotência global do pedido.
- Índice de chave do pedido depende de OR05: um índice comprador/chave/produtor é insuficiente quando dois payloads têm produtores diferentes. Candidatura sem coleção extra: chave apenas no documento âncora, índice único parcial comprador/chave e manifesto privado do grupo; requer aprovação e ensaios.
- Futuro agendador: `{ estado: 1, 'rececao.limiteConfirmacaoEm': 1 }`, seletividade a medir. Reclamações por resolver continuam verificadas no predicado de escrita; índice não é autorização ou regra de transição.
- Não criar índices de todos os arrays, índice único de origem de leilão sem Q07 nem TTL de encomendas. Unicidade de IDs dentro de arrays tem de ser validada localmente; um índice multikey único não a assegura dentro do mesmo documento. Ver [índices multikey oficiais](https://www.mongodb.com/docs/manual/core/indexes/index-types/index-multikey/).

## 4. Cálculos monetários e quantidades

Para cada linha: calcular a fração exata precoReferenciaCent × quantidadeBase / quantidadeReferencia; aplicar half-up uma única vez nessa linha; somar os resultados arredondados. Referência fixa 1000 g/ml para peso/volume e 1 para unidade/embalagem. Conteúdo de 500 g numa embalagem não multiplica a quantidade comercial cobrada.

| Exemplo fictício                                                    | Cálculo exato                          | Subtotal arredondado                               |
| ------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------- |
| Peso: 250 g a 150 cêntimos/kg                                       | 150 × 250 / 1000 = 37,5 cêntimos       | 38 cêntimos                                        |
| Volume: 250 ml a 200 cêntimos/L                                     | 200 × 250 / 1000 = 50 cêntimos         | 50 cêntimos                                        |
| Unidade: 3 a 200 cêntimos                                           | 200 × 3 / 1                            | 600 cêntimos                                       |
| Duas embalagens de 500 g a 350 cêntimos                             | 350 × 2 / 1; stock debita 2 embalagens | 700 cêntimos                                       |
| Duas linhas de 250 g, comparadas com uma de 500 g a 150 cêntimos/kg | 38 + 38 = 76; linha agregada = 75      | OR03 precisa decidir a agregação                   |
| 1 g a 1 cêntimo/kg, se mínimo/passo permitirem                      | 1 / 1000 de cêntimo                    | Zero por half-up; OR04 precisa decidir a aceitação |

Recomenda-se BigInt apenas na aritmética intermédia, com quociente/resto para half-up e conversão validada para Number seguro/JSON. Para valores não negativos, a expressão matemática floor((2 × preço × quantidade + referência) / (2 × referência)) descreve half-up sem ponto flutuante; não é código implementado. A soma das linhas mais taxa deve caber no limite monetário aprovado. Não impor o teto de preço unitário P02 ao total da encomenda ou à taxa sem decisão.

Total da operação = soma dos totais por produtor. Exemplo: encomenda A com 700 + 250 de entrega e encomenda B com 38 + 0 de levantamento totalizam 988 cêntimos, sem novo arredondamento. Não exigir quantidades múltiplas de kg/L nem converter g para ml. Definir grelha em OR03; não arredondar quantidades silenciosamente.

## 5. Transações, concorrência e falhas — desenho proposto

O01 aprova atomicidade global e P03 fixa débito na submissão. Recomenda-se uma transação MongoDB curta por compra, na mesma conexão/sessão, abrangendo deduplicação, leituras relevantes, débitos e todas as orders. Primeiro resolver repetição de pedido já concluído; um replay não depende do stock/preço atual para voltar a aceitar a compra original. Só um pedido novo é submetido à validação comercial atual.

Dentro da transação futura: validar produtos publicados, perfil/capacidade elegível, configuração comercial atual, quantidades e oferta aceite; obter snapshots; debitar cada produto condicionado ao stock suficiente e aos campos/versão comercial esperados; criar todas as orders e marcador de idempotência; abortar tudo se uma verificação falhar. Processar produtos por ordem estável e sequencialmente. O callback pode ser repetido: sem sockets, emails, uploads ou efeitos externos dentro dele. Commit incerto exige recuperar resultado com a mesma chave, não anunciar rollback nem gerar outra compra. Ver [driver Node.js](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/) e [transações Mongoose](https://mongoosejs.com/docs/transactions.html).

Recomendações técnicas ainda sujeitas à fase autorizada: readPreference primary, readConcern snapshot, writeConcern majority e prazo/retries limitados. Uma leitura do perfil/configuração dentro da transação pode ser antiga; não fornece por si só serialização com uma alteração concorrente de aprovação/agenda/tarifa. OR12 precisa escolher um ponto de elegibilidade e coordenação de escritas. A documentação [MongoDB 8.0 sobre conflitos e leituras antigas](https://www.mongodb.com/docs/v8.0/core/transactions-production-consideration/) suporta esta limitação; não se promete isolamento serializável automático.

Compatibilidade concreta: requireDocumentValidation bloqueia updateOne/findOneAndUpdate/bulkWrite nos modelos atuais. Não propor `$inc` via Product.updateOne como se já funcionasse. __v nativo não é ainda um protocolo universal de versão comercial/CAS. Futuro serviço precisará de autorização para um caminho de escrita interno condicionado, com validação explícita, sem enfraquecer as guardas existentes. Esta revisão não modifica helper/modelos nem usa o driver para os contornar.

Cancelamento/reposição futuro: mudar estado e registar movimento/reposição na mesma unidade de consistência aplicável; comparar versão/estado anterior e saldo de quantidade por linha. Dois cancelamentos ou repetição da decisão não podem repor duas vezes. Pronto e em_preparacao seguem a política controlada aprovada em OR06, não uma regra escolhida por omissão. Reposição não publica rascunho/arquivado nem transforma quantidade histórica numa nova modalidade.

## 6. Estados, intervenientes e independência

| Ação aprovada                               | Interveniente                                                                              | Efeito / separação                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Submeter compra                             | Comprador autenticado futuro                                                               | Cria pendente, com débito P03 e grupo atómico O01.                                                      |
| Confirmar / preparar / marcar pronta        | Produtor da encomenda; atribuição concreta proposta em OR07                                | Cadeia O02, com histórico; sem saltos/reversões adicionais por inferência.                              |
| Cancelar pendente                           | Comprador próprio, produtor responsável ou admin                                           | Cancelada, com política automática integral O04 e histórico O03.                                        |
| Pedir cancelamento após confirmação         | Comprador próprio                                                                          | Pedido não é cancelamento efetivo; produtor aceita/recusa. Ritmo de preparação enquanto aguarda é OR07. |
| Cancelar após confirmação                   | Produtor responsável com motivo; admin com justificação; aceitação de pedido pelo produtor | Política de stock depende do estado anterior, não do estado cancelada final.                            |
| Declarar entrega/levantamento               | Produtor responsável                                                                       | Facto de execução física guardado, ainda distinto da receção confirmada e do pagamento.                 |
| Confirmar receção                           | Comprador próprio                                                                          | Concluida; pagamento mantém-se.                                                                         |
| Concluir automaticamente                    | Ator técnico futuro, elegibilidade persistida                                              | O14 e ausência de reclamação pendente; prazo/retoma OR09; nunca confirma pagamento.                     |
| Intervir em divergência / reclamação        | Admin, com fundamento                                                                      | Apenas os poderes O03/O13/O15; não pode marcar pago em nome do produtor por inferência.                 |
| Comunicar pagamento / confirmar recebimento | Comprador / produtor, respetivamente                                                       | Histórico de pagamento separado; detalhes de transição OR10.                                            |

Concluida e cancelada são terminais para o percurso comercial proposto; não proibir novas intervenções/pagamento/reclamação apenas porque esse percurso terminou. Nenhuma regressão, reabertura, expiração de encomenda pendente ou regra que impeça auto-compra é acrescentada implicitamente. Avaliações e estatísticas continuam Q10/Q15: conclusão não equivale a receita recebida, e a elegibilidade para avaliar precisa de integração própria.

## 7. Decisões pendentes, ordenadas por dependência

Legenda: **M** impede fechar o modelo completo/validações/índices; **S** necessária antes do serviço 3.4, não antes de um modelo isolado limitado aos campos aprovados; **H** necessária antes de estabilizar contrato/integração HTTP. Todas as alternativas/recomendações são propostas. Aprovar O01–O16 não aprova estes pacotes. Não exigir decisões de Cloud, leilões ou reviews para começar um bloco de orders que não as utiliza.

### OR01 — vocabulário académico e seis estados aprovados (H)

**Problema/motivo:** E pp. 4/18, RF-ENC-03, frontend e OrderStatus usam entregue; O02 usa concluida e separa entrega declarada da receção. Não são automaticamente sinónimos: pode haver entrega declarada e reclamação antes de concluir. Bloqueia o contrato final/evidência académica, sem reabrir o enum O02 já aprovado para o domínio.

**Alternativas/impacto:** A) domínio com os seis códigos O02, eventos de entrega/receção explícitos e justificação académica documentada; preserva a decisão mas a equivalência com o exemplo deve ser validada. B) alias entregue na fronteira académica; preserva clientes antigos, mas uma conversão ambígua pode ocultar a receção não confirmada. C) alterar o enum O02 para incorporar entregue; exigiria nova decisão expressa, não uma correção técnica automática.

**Recomendação:** A, preservando O02 e apresentando o mapeamento para validação académica; não converter pronta/entrega declarada em concluida. Não declarar a divergência resolvida nem modificar F0. Necessária antes de fechar OpenAPI e integração.

### OR02 — origem da configuração comercial e concelhos (M/S)

**Problema/motivo:** producers guarda concelho textual e telefone privado; não tem modalidades/taxa/zonas/agenda/métodos. users não tem moradas. Faltam fonte autoritativa e formato de snapshots para O05–O09. Uma escolha do browser não prova que o produtor a oferece.

**Alternativas/impacto:** A) bloco comercial em producers e catálogo versionado de concelhos com IDs oficiais ou IDs internos estáveis mapeados a fonte oficial; mantém sete coleções, mas exige autorização futura para estender o perfil e migrar concelho textual. B) coleção comercial separada; facilita evolução independente, mas acrescenta uma coleção ainda não aprovada. C) confiar em snapshots enviados pelo cliente; evita configuração mas não comprova oferta/zonas e é inadequado como autoridade.

**Recomendação:** A, sem escolher já fornecedor/versão/cobertura geográfica do catálogo. Aprovar campos mínimos de morada/contacto/local de levantamento, exposição e comportamento de perfil ainda sem configuração; recomendar bloquear novas compras até configuração válida, sem afetar histórico. Guardar somente concelho escolhido e condições aplicadas na order. Antes do modelo completo, fechar o formato dos snapshots; configuração efetiva e alterações ao perfil só numa autorização posterior.

### OR03 — grelha de quantidades e linhas repetidas (M)

**Problema/motivo:** mínimo e incremento são positivos, mas não se escolheu se a grelha parte de zero ou do mínimo; dividir a mesma compra em linhas altera o arredondamento. Bloqueia validação e cálculo reproduzível de snapshots.

**Alternativas/impacto:** grelha A: quantidade ≥ mínimo e quantidade múltipla do incremento; grelha B: quantidade ≥ mínimo e diferença para mínimo múltipla do incremento. Com mínimo 250 g/passo 100 g, A admite 300/400 g e B 250/350 g. Para duplicados: rejeitar obriga o cliente a consolidar; agregar antes de validar/arredondar dá uma linha por produto; preservar linhas pode mudar o preço total e contornar mínimos.

**Recomendação:** grelha B e agregação por produto/oferta comercial idêntica antes de mínimo/passo e half-up, com quantidade somada exata e validada; não juntar produtos distintos. Nenhuma escolha está aprovada. A política afeta modelo, fingerprint idempotente e frontend futuro.

### OR04 — limites monetários, dimensão e subtotal zero (M)

**Problema/motivo:** P02 limita preço de referência, não taxa, linha, encomenda, operação ou número de linhas. Half-up pode produzir zero numa linha com preço válido. Arrays de histórico/reclamações também precisam de limites compatíveis com embedding. Faltam valores concretos para fechar validação segura.

**Alternativas/impacto:** Number seguro guardado e aritmética BigInt interna simplificam JSON; BSON long/decimal exigem conversão/tipos específicos. Limites só técnicos evitam inventar tetos comerciais, mas não substituem limites de tamanho de pedidos/documentos. Aceitar subtotal zero respeita half-up literal; exigir compra que produza pelo menos um cêntimo restringe quantidades e requer nova regra. Cobrar um cêntimo artificialmente altera T32-03.

**Recomendação:** Number seguro para valores persistidos, BigInt intermédio, limites técnicos de linhas/produtores/texto e verificação de taxa/totais seguros a aprovar; tetos comerciais adicionais são opcionais, não requisitos académicos; aceitar zero exclusivamente quando resulta do arredondamento aprovado, se confirmado pelo utilizador. Não definir números arbitrários nem equiparar taxa máxima ao preço máximo do produto. Necessária para o modelo completo e ensaios de fronteira.

### OR05 — referência de compra e idempotência global (M)

**Problema/motivo:** O01 aprova referência comum, mas não a transforma numa chave de retry. Índice único comprador/chave/produtor permite dois pedidos com a mesma chave e produtores disjuntos. Sem um ponto único de concorrência, uma consulta prévia não impede duplicação.

**Alternativas/impacto:** A) coleção de operações, chave única comprador/pedido e resultado; arquitetura clara, mas requer aprovar coleção além das sete. B) um documento âncora dentro de orders, único por comprador/chave via índice parcial, com manifesto privado dos IDs esperados do grupo; evita coleção extra, mas aumenta a complexidade e exige testes de leitura/privacidade. C) apenas índice por produtor; é insuficiente e não recomendado. UUID versus outro ID opaco é concretização técnica a confirmar, não nome comercial.

**Recomendação:** B se se mantiverem estritamente sete coleções; A só com aprovação explícita da coleção adicional. Separar ID comum gerado no servidor, chave estável do cliente e hash canónico do pedido completo; mesma chave/payload recupera o grupo, diferente payload é conflito, incluindo conjunto de produtores. Aprovar prazo de retenção da chave, limites e se replay devolve resultado original mais estado atual. Não usar TTL para apagar encomendas. Precisa de aprovação antes dos campos/índices finais; não implementar nenhum marcador nesta revisão.

### OR06 — reposição controlada e situações incompatíveis com reposição integral (M/S)

**Problema/motivo:** O04 não define nenhuma/toda/parcial na reposição controlada. Além disso, depois do débito o produtor pode reabastecer até ao teto; uma devolução posterior excede P05. Exemplo: 100 000 unidades, compra de 2, reabastecimento a 100 000 e cancelamento exigem 100 002. Mudança de unidade, produto removido ou publicado por perfil agora não aprovado também impedem um simples save/adição cega.

**Alternativas/impacto:** para em_preparacao/pronta, decisão nenhuma/toda é simples mas pouco flexível; quantidade por linha permite reposição parcial auditada. Para excesso: bloquear cancelamento evita exceder teto, mas colide com o cancelamento direto O03; limitar silenciosamente perde a reposição integral e é inadequado; reservar margem para todas as devoluções possíveis limita novos reabastecimentos e altera a regra de gestão de stock; cancelar e registar reposição pendente preserva o direito de cancelar mas exige aceitar que reposição automática pode ficar diferida.

**Recomendação:** quantidade por linha, incluindo zero, com motivo, saldo e comandos idempotentes. Para excesso, recomendar cancelamento registado com pendência explícita de reposição e resolução controlada; **esta exceção à reposição automática imediata precisa de aprovação**, não é deduzida de O04. Definir ainda bloqueio de mudança de modalidade com unidades a repor ou tratamento de incompatibilidade sem conversão arbitrária; nunca repor g como embalagens. Modelo precisa de representação auditável; serviços futuros precisam da política final antes de comandos.

### OR07 — pedidos de cancelamento e concorrência entre ações (M/S)

**Problema/motivo:** falta definir se há vários pedidos ativos, se a preparação continua enquanto aguardam decisão e como se trata pedido pendente quando há declaração de entrega/conclusão. O03 não permite cancelar concluída, mas não autoriza ignorar pedidos. Bloqueia estrutura de pedidos e predicados dos comandos.

**Alternativas/impacto:** um pedido ativo por ordem simplifica auditoria e idempotência; vários paralelos exigem relacionar decisões. Suspender progressão até decisão protege a expectativa do comprador mas é regra funcional adicional; permitir progressão evita bloqueio da operação mas pode tornar o pedido obsoleto. Concorrência pode ser resolvida por versão/estado e nova leitura, em vez de a última gravação apagar a anterior.

**Recomendação:** um pedido ativo, decisões imutáveis e CAS/versionamento; solicitar aprovação da suspensão de preparação/conclusão enquanto o pedido aguarda. Autor e data reais do servidor; admin não substitui produtor na confirmação de pagamento. Atribuir ao produtor as transições operacionais O02 e separar confirmação de receção O13. Propor confirmar receção apenas após entrega declarada válida na etapa pronta; intervenção em divergência tem de preservar o fundamento e a política aprovada. Sem saltos/reaberturas nem poderes genéricos novos. Campos do pedido antes do modelo; bloqueio operacional antes do serviço.

### OR08 — períodos, propostas e revisão de condições (M/S)

**Problema/motivo:** O08 não define duração/antecedência de períodos, exceções, fuso, validade de proposta nem a relação entre aceitação de nova hora e confirmação da encomenda. Falta ainda escolher que alterações de tarifa/unidade/condições exigem nova confirmação além do preço explicitamente aprovado em O12.

**Alternativas/impacto:** janelas com início/fim concretos em UTC e zona IANA preservada são verificáveis; texto livre é simples mas não valida disponibilidade. Confirmar order só após acordo do período mantém coerência; confirmar order com proposta de período pendente exige dois fluxos independentes e regras de preparação. Capacidade por janela acrescenta reservas de agenda; não a presumir como requisito.

**Recomendação:** intervalo concreto pedido, proposta identificada e aceite/recusada sem sobrescrever o acordo anterior; snapshot da condição e fuso correto por produtor, sem impor Europe/Lisbon a todas as ilhas. Propor confirmação comercial após acordo do período. Aprovar limites/antecedência/exceções e reconfirmação de taxa/unidade/total; sem otimização de rotas ou reservas de agenda implícitas. Fechar formato do snapshot antes do modelo e regras de agenda antes do serviço.

### OR09 — sete dias, reclamação e conclusão automática (M/S)

**Problema/motivo:** sete dias podem ser 168 horas ou sete dias civis; O14 permite mas não torna obrigatória execução automática imediata. Após resolver reclamação, não se sabe se retoma prazo original, tempo restante ou sete dias novos. Falta definir resposta relevante, fronteira do prazo e efeito de pedido de cancelamento pendente. Afeta timestamps e controlo de elegibilidade.

**Alternativas/impacto:** 168 horas decorridas em UTC são determinísticas; dias civis preservam horário local mas variam na mudança de hora. Manter limite original permite conclusão assim que a reclamação fica resolvida se prazo já passou; pausar o relógio dá tempo restante; reiniciar sete dias concede prazo adicional. Cada escolha muda o comportamento comercial.

**Recomendação:** 168 horas a partir de declaração persistida válida; guardar limite original e conclusão/motivo; retoma do limite original apenas com aprovação explícita do efeito após resolução. Job futuro recupera pendências ao reiniciar e usa escrita condicional sobre a mesma order que recebe reclamações/receção, evitando conclusão concorrente com reclamação aceite. Não reiniciar cronómetro sem decisão; não aplicar TTL. Campos antes do modelo; agendador apenas em autorização própria.

### OR10 — ciclo de pagamento direto (M/S)

**Problema/motivo:** falta decidir se produtor pode confirmar MB WAY/transferência sem comunicação prévia do comprador, se pode corrigir marcação errada e o que registar num cancelamento já pago. Os três estados O10 não incluem reembolso. Sem estes detalhes, uma máquina de estados seria inventada.

**Alternativas/impacto:** exigir comunicação antes de qualquer confirmação não monetária dá cadeia rígida mas impede registar recebimento já conhecido; permitir confirmação direta pelo produtor para todos os métodos é mais flexível e mantém a autoridade O10. Histórico só progressivo é simples; correção auditada exige regras adicionais. Guardar apenas método/estado minimiza dados; instruções bancárias privadas exigem formato e permissões próprios.

**Recomendação:** início por_pagar, comunicação pelo comprador e confirmação pelo produtor, propondo confirmação direta também quando este já recebeu por MB WAY/transferência; sem reversão ou estado de reembolso até política expressa. Encomenda cancelada não apaga o facto de ter sido paga; conclusão também não o altera. Guardar método e histórico mínimo, não copiar dados bancários/contactos sem necessidade aprovada. Aprovar transições para fechar validações do modelo completo.

### OR11 — várias reclamações, resolução e crescimento embebido (M)

**Problema/motivo:** O16 fixa embedding e quatro estados, mas não cardinalidade, número simultâneo, reabertura, prazos de apresentação ou limites de intervenções/conteúdo. Uma proposta do produtor não equivale a solução aceite; decisão administrativa e aceitação precisam de registo. Modelo ilimitado arrisca exceder 16 MiB por documento, limite técnico [MongoDB 8.0](https://www.mongodb.com/docs/v8.0/reference/limits/#bson-documents).

**Alternativas/impacto:** uma reclamação única é simples mas não cobre problemas posteriores; várias com só uma ativa simplificam suspensão e resolução; várias ativas permitem assuntos independentes mas complicam concorrência. Resolver por aceitação do comprador ou decisão administrativa preserva os intervenientes O15; permitir encerramento unilateral do produtor acrescentaria poder não aprovado. Limites explícitos evitam crescimento livre; truncar evidência ou extrair coleção contradiz esta aprovação.

**Recomendação:** várias sequenciais, no máximo uma ativa, com intervenções identificadas, proposta separada de decisão e resolução por aceitação do comprador ou decisão administrativa fundamentada. Aprovar regras de reabertura/novos assuntos após resolução/conclusão/cancelamento, limites de texto/quantidade e resposta quando se atingem. Nunca apagar/truncar história nem fechar automaticamente para libertar espaço. Qualquer não resolvida bloqueia conclusão automática, mesmo em análise ou escalada.

### OR12 — escrita de stock, versão e elegibilidade concorrente (S)

**Problema/motivo:** guardas Mongoose bloqueiam updates condicionados atuais; leitura de aprovação/configuração não bloqueia alterações concorrentes; __v atual não é versão comercial universal. Não é defeito a corrigir na fundação isolada, mas impede assumir que o checkout já está tecnicamente preparado.

**Alternativas/impacto:** A) repositório interno restrito para débito/reposição e controlo de versão, com validação explícita e coordenação de escrita com perfil/configuração; exige autorização e testes de todos os caminhos de escrita. B) save completo com concorrência otimista explícita em todos os escritores; reutiliza validação, mas exige alterações e não basta ler/gravar stock sem predicado/versionamento. C) atualizar coleção diretamente nas rotas; contorna regras e não é recomendado.

**Recomendação:** A como desenho futuro, mantendo guards públicos e sem atalho de rota. Aprovar instante de elegibilidade e coordenação entre alterações de preço/stock/unidade/aprovação/configuração e checkout; validar nenhuma venda acima do stock nem reposição acima do teto. Não alegar serialização de perfil só por usar transação. Não bloqueia criar um modelo Order isolado após aprovação dos respetivos campos; bloqueia serviços transacionais e exige autorização separada para tocar em products/producers/helper.

### Classificação final

**Antes do modelo orders completo (3.2.d):** OR03, OR04, OR05, OR10 e OR11; formatos de snapshots OR02/OR08, registos de reposição OR06, pedidos OR07 e datas/ator técnico OR09. Estes pacotes precisam de respostas no âmbito estrutural indicado; não exigem implementar configurações, comandos ou jobs.

**Antes dos serviços transacionais (3.4):** políticas operacionais residuais OR02/OR06–OR09 e OR12; completar idempotência/reconfirmação OR05/OR08. **Antes do contrato final e integração:** OR01 e os DTOs/projeções/rotas; C03/C05 só quando usados. Não é necessário resolver Q07–Q10/Q11/Q13/Q15/Q16 inteiras para o schema limitado de orders.

**Melhorias opcionais:** outbox/notificações duráveis, capacidade de agenda por janela, anexos, exportação e otimização de rotas. Indicadores obrigatórios do projeto ficam na fase própria Q15; não são uma opção de omissão nem requisito para fechar o schema orders. Não são exigidas para fechar este modelo nem autorizadas agora. **Fases futuras obrigatórias ou já aprovadas funcionalmente:** segurança real, serviços de checkout/cancelamento/pagamento/reclamação, conclusão automática, contratos/integração e notificações em tempo real; cada implementação exige autorização própria. Processamento online de pagamentos e reembolsos automáticos continuam excluídos.

## 8. Compatibilidade e privacidade

O01 respeita um produtor por order e referências users do PDF. O11 respeita embedding de linhas; O16 acrescenta reclamações embebidas, com limites pendentes. O02 diverge do enum literal académico: OR01 permanece explícita. O03/O09–O16 expandem decisões funcionais além do núcleo académico e não devem ser apresentados como obrigações textuais do docente.

O OpenAPI atual é estruturalmente válido, mas **não está funcionalmente alinhado com O01–O16**: OrderStatus tem quatro estados legados; POST mantém oneOf antigo; CreateOrder tem entrega global e não escolhas por produtor; faltam taxa/método/agenda/receção/cancelamento/reclamações e payloads específicos de comandos. Metadados/descrições assinalam estas lacunas, sem criar schemas/rotas finais ou aprovar alternativas. Preservados 45 operationIds/39 paths/55 schemas e condições de segurança; só GET /api/health existe no runtime. Antes de HTTP, substituir estruturas legadas após OR01–OR12 aplicáveis, não gerar código a partir delas.

Projeções futuras: comprador vê apenas suas orders e o conjunto da sua compra; produtor vê só a própria order e dados necessários ao cumprimento, nunca moradas, produtos ou valores de outras orders do grupo; admin usa projeção minimizada e acesso a detalhe justificado; não há leitura pública de orders. Hash canónico, chave idempotente e manifesto não dão acesso nem devem aparecer no DTO do produtor. Responsável técnico por conclusão automática não é um administrador fictício.

C04 mantém todos os comandos/leituras privados indisponíveis até JWT/RBAC/propriedade reais. Não confiar em DEMO IDs, role local, comprador/produtor/totais/timestamps enviados pelo browser. Campos bancários e contactos privados não são públicos nem entram em logs. A aprovação funcional de um comando não regista uma rota HTTP ou concede autoridade a um papel demonstrativo.

Frontend atual: quatro estados, sem checkout real e com quantidade × preço; não suporta grupo, agenda, taxa, pagamentos ou reclamações reais. Adaptação futura tem de preservar o modo demo, as três áreas, cesta, navegação, sistema visual e testes existentes; requer DTOs explícitos e migração de storage acordada para g/ml/referências. Não mapear seis estados para quatro silenciosamente, não recalcular histórico a partir do catálogo nem limpar carrinho num timeout de resultado incerto.

## 9. Plano proposto, sem execução

| Subfase                        | Objetivo / ficheiros previstos                                                                                                                                        | Dependências / aceitação / limitações                                                                                                                                                                                                                 |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Revisão de entrada             | Aprovar respostas OR aplicáveis e consolidar especificação em docs/api.                                                                                               | Sem código, instalações ou Git; distinguir modelo de serviços e não exigir toda a plataforma antecipadamente.                                                                                                                                         |
| 3.2.d.1 — tipos e aritmética   | modules/orders/order.types.ts, order.constants.ts, order.calculations.ts; tests/unit/order-calculations.spec.ts.                                                      | OR03/OR04 e campos aprovados; representação exata das quatro modalidades, half-up e limites. Helpers internos, sem HTTP ou stock.                                                                                                                     |
| 3.2.d.2 — persistência isolada | modules/orders/order.model.ts, validação local se necessária; tests/unit/order-model.spec.ts, tests/integration/order-model.spec.ts, tests/support/order-fixtures.ts. | OR estruturais aprovadas; referências, snapshots imutáveis, seis estados e subdocumentos validados, índices justificados, projeções seguras e rollback técnico real. Nenhum checkout/comando ou alteração aos três modelos anteriores por implicação. |
| Preparação dos dependentes     | Proposta de configuração comercial em producers e protocolo interno de escrita em products/helper.                                                                    | OR02/OR12 e autorização expressa para cada ficheiro existente; não executar como parte automática de 3.2.d.2.                                                                                                                                         |
| 3.4.a — checkout interno       | orders/order.service.ts, order.repository.ts e testes de concorrência; localização concreta a rever.                                                                  | OR05/OR08/OR12, configuração e writes preparados. Grupo integral, preços confirmados, sem overselling ou duplicações; contexto só de teste, HTTP privado bloqueado por C04.                                                                           |
| 3.4.b — ciclo comercial        | Comandos internos de estado/cancelamento/reposição/pagamento/agenda/reclamação e testes próprios.                                                                     | OR06–OR11 aprovadas; rastreabilidade, ownership e independência dos estados. Não implementar reembolso ou pagamento online.                                                                                                                           |
| Fases autorizadas posteriores  | Agendador idempotente O14, DTOs/rotas/segurança real, integração e sockets.                                                                                           | OR01 e contratos finais; autenticação antes de qualquer operação privada acessível; eventos só após commit e recuperação por leitura. Sem antecipação nesta revisão.                                                                                  |

Não acrescentar dependências: Mongoose/Vitest/Supertest existentes cobrem o desenho previsto; BigInt é nativo. Nenhum ficheiro da tabela é criado nesta tarefa. A ordem de implementação e a divisão em blocos têm de ser autorizadas após as decisões.

## 10. Plano de testes e critérios de aceitação

| Camada futura             | Casos necessários e resultado esperado                                                                                                                                                                                                                                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modelo / tipos            | Obrigatoriedades, tipos sem coerção, IDs e ownership, linhas não vazias, quatro modalidades/ref fixa, mínimos/passos e duplicados conforme OR03, estados e histórias coerentes, snapshots imutáveis. Projeções completas/parciais serializam sem erro e sem dados privados; não guardar projeção sem invariantes.                                                         |
| Aritmética                | Fronteiras e overflow em produto/soma/taxa/total; 37,5 → 38, 50, 600 e 700 cêntimos; duplicados 76 versus agregado 75; subtotal zero conforme OR04; total de operação 988. Dinheiro inteiro, sem BigInt cru em JSON, taxa única por produtor e levantamento gratuito.                                                                                                     |
| Persistência MongoDB real | Factory por conexão; apenas orders nova; índices criados/aguardados explicitamente na base efémera; unicidade do grupo/produtor e chave âncora se aprovada; snapshots continuam iguais após editar produto/tarifa/zona/agenda; embedding/IDs locais sem duplicação; rollback com subdocumentos e sessão.                                                                  |
| Checkout concorrente      | Última unidade entre dois compradores; falha no último produtor desfaz todas as orders/débitos; mesmo pedido concorrente; mesma chave com payload/produtores disjuntos; repetição após commit com resposta perdida; commit desconhecido recuperado sem novo débito.                                                                                                       |
| Alterações concorrentes   | Preço/unidade/stock/tarifa/zona/perfil/configuração alterados durante submissão; conflito revalida e requer confirmação quando aplicável, sem aceitar silenciosamente nem permitir formulário antigo repor stock vendido.                                                                                                                                                 |
| Cancelamento/reposição    | Todos os estados/atores O03; pedido distinto de decisão; cancelamento versus preparação/conclusão; replay não repõe duas vezes; parcial/zero segundo OR06; reabastecimento até teto, unidade mudada, produto ausente/arquivado/perfil alterado; sem clamp silencioso.                                                                                                     |
| Entrega e pagamento       | Modalidade/método inativos rejeitados em compra nova, concelho fora da zona recusado, taxa zero válida, snapshot intacto; proposta de período só muda acordo com aceitação; pagamento comunicado não é confirmado e apenas produtor marca recebido; concluida com por_pagar continua possível.                                                                            |
| Receção/reclamações       | Entrega declarada sem receção não conclui por si; tentativa de receção sem declaração/fora da etapa permitida segundo OR07; 7 dias/fronteira/mudança de hora/restart conforme OR09; reclamação/receção simultâneas com job; todas as reclamações não resolvidas bloqueiam automatismo; aceitação/escalamento/resolução/intervenções e limites OR11; pagamento inalterado. |
| HTTP e segurança futuros  | C04 mantém rotas ausentes nesta etapa. Após autorização/segurança: 401/403/404/409 seguros; produtor não lê outras orders do grupo; comprador alheio/admin sem poder específico não escreve; campos forjados e dados privados não escapam; comparar com OpenAPI revisto.                                                                                                  |
| Regressão futura          | Preservar os 228 backend existentes, acrescentar testes pertinentes e executar TypeScript API/frontend, ESLint, Prettier e build API no bloco de implementação. Preservar 274 Playwright; executar quando houver integração/frontend autorizado, sem alterar mocks para mascarar diferenças.                                                                              |

Critério de entrada do modelo: aprovações estruturais identificadas, vocabulário do domínio O02 preservado, esquema/limites/índices rastreáveis e autorização explícita limitada aos ficheiros previstos. Critério de saída do bloco de persistência: testes reais e unitários aprovados, anteriores preservados, relatório honesto sem alegar checkout/segurança implementados. Critério de saída de serviços posteriores: invariantes comerciais provadas com concorrência e falhas reais, não apenas mocks.

## 11. Evidências desta tarefa e próximo passo

As verificações executadas são documentais: consistência, inventário/refs/estrutura OpenAPI, ligações/âncoras Markdown, sete exemplos JSON existentes, integridade F0 e snapshot do repositório. Os 228 backend são a última validação aprovada e não foram reexecutados; nenhum MongoDB/contentor, dependência, schema, teste de aplicação ou frontend foi iniciado por esta revisão.

Riscos prioritários: enum académico divergente, ausência de configuração comercial, duplicação global de compras, reposição acima do teto ou em unidade errada, crescimento das reclamações e conclusão concorrente com uma reclamação. São decisões/integrações pendentes, não falhas corrigidas em código nesta tarefa. Resultados finais e ficheiros alterados ficam na [rastreabilidade](traceability.md).

Próximo passo recomendado: o utilizador decide os pacotes OR no âmbito estrutural necessário a 3.2.d, aceita a divisão entre persistência e serviços e concede autorização de implementação própria. Até essa autorização, permanecer apenas na análise/documentação. Sem staging, commits, push, branch, merge, PR ou alterações a main.
