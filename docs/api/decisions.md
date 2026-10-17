# Decisões de entrada — análise Q01–Q16

Complementa, sem substituir ou alterar, [decisions.md da Fase 0](../architecture/decisions.md). **C01/C02/C04/C06 foram aprovadas explicitamente no âmbito registado abaixo. Q01/Q03/Q04/Q06/Q14 têm aprovação funcional registada em 2026-10-16; T32-01–T32-06 aprovadas em 2026-10-17 nos limites do registo; A01–A03 aprovadas para o bloco users/producers implementado localmente; restantes Q, C03/C05 e detalhes residuais continuam pendentes.** As experiências demonstrativas anteriores continuam aprovadas no seu âmbito e não são modificadas. A autorização documental não resolve automaticamente as questões.

## Base aprovada e propostas transversais

D01/D02: monorepo e monólito modular, React/TypeScript e Node.js/Express/TypeScript/Mongoose. D04: JWT/bcrypt escolhidos; armazenamento/duração continuam proposta. D10/D12: Atlas e serviços Azure escolhidos; configuração, versões e planos concretos não escolhidos. D13: OpenAPI 3, Swagger UI, Vitest, Supertest e Playwright selecionados. A decisão atual mantém a integração em main adiada e autoriza exclusivamente a implementação local de users/producers; nenhuma operação Git de escrita.

D03 (propriedade/aprovação), D05 (cêntimos), D06/D08 (transações/idempotência), D07 (versões/snapshots), D09 (campos/índices adicionais não aprovados), D10 (mediação de upload), D11 (agendador), D12 (instância inicial) mantêm o estado de proposta nos aspetos assinalados em F0. O vocabulário público em português de D14 foi aprovado agora no âmbito C01; não se aprovaram automaticamente todos os nomes, rotas ou campos do rascunho. Não se presume que todos foram adotados por existirem mocks semelhantes.

| ID técnico | Estado atual                    | Conteúdo e efeito                                                                                                                                                                                                        | Momento                                                                                            |
| ---------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| C01        | **Aprovada**, âmbito no registo | Português público, IDs estáveis independentes dos nomes, conta/perfil separados, DTOs próprios e PUT completo dos campos editáveis. Rotas/campos específicos mantêm as dependências Q.                                   | Entrada de 3.1; detalhar antes dos schemas/contrato final.                                         |
| C02        | **Aprovada**, âmbito no registo | Erros estruturados e seguros, códigos estáveis, mensagens/campos e HTTP incluindo 400/401/403/404/409/500. Detalhes de propriedade, concorrência e códigos adicionais não escolhidos.                                    | Antes do pipeline HTTP em 3.1.                                                                     |
| C03        | **Pendente**                    | Proposta: paginação limitada, ordenação permitida e pesquisa normalizada/escapada; array com metadados por definir. Envelope ou cabeçalhos são alternativas; limites/defaults por escolher.                              | Antes de listas e integração.                                                                      |
| C04        | **Aprovada**                    | Segurança real na semana 4; leituras e escritas privadas ficam inacessíveis até então. Contextos fictícios só em testes internos, nunca como autoridade HTTP.                                                            | Sequência já definida; bloqueio obrigatório até à semana 4.                                        |
| C05        | **Pendente**                    | Proposta: usar packages/shared apenas com consumidores reais, sem Mongoose/hash/segredos. Duplicação temporária de tipos reduz acoplamento mas exige verificar contrato. Não criar pacote paralelo sem necessidade.      | Antes do primeiro consumo partilhado.                                                              |
| C06        | **Aprovada nos princípios**     | Configuração independente Node.js LTS/Express/TypeScript, Mongoose/Vitest/Supertest mantidos. A autorização posterior de 3.1 adota as versões/opções efetivas registadas na entrega, mantendo outros detalhes pendentes. | Antes de 3.1/instalações; execução local de 3.1 autorizada posteriormente, conforme registo final. |

C04 fixa a sequência na semana 4. O bloqueio abrange todas as operações privadas, incluindo consultas; não criar autenticação fictícia acessível pela rede. As alternativas anteriormente analisadas não representam escolhas ainda abertas sobre antecipação nesta entrada. Nova alteração dessa sequência exigiria autorização explícita.

## Q01 — Cardinalidade dos papéis e auto-licitação

**Estado: aprovada funcionalmente em 2026-10-16.** A mesma conta pode comprar e produzir e aceder às duas áreas. A venda depende de aprovação da candidatura. Impedir licitar nos próprios leilões por comparação de identidade, mesmo mudando o contexto ativo. Administrador não pode ser criado no registo público e exige procedimento controlado.

A antiga recomendação de papel comercial único não foi escolhida e é ultrapassada por esta aprovação; F0 permanece como documento histórico inalterado. O protótipo de role único não define a conta real. **T32-01 aprovada em 2026-10-17:** lista de papéis por conta, acumuláveis comprador/produtor, perfil separado e aprovação comercial independente. Flags/papel único deixam de ser alternativas pendentes. Aquisição de capacidade e provisionamento admin continuam pendentes; A01/A02 aprovadas e implementadas no âmbito descrito na entrega; admin não ganha poderes comerciais por inferência.

**Impacto:** User/DTO/sessão futura suportam capacidades acumuladas; fonte real tem identidade única, sem duplicar conta ou confiar no papel demo. A lista de papéis e o vínculo de perfil estão implementados no modelo; fluxo de aquisição/provisionamento permanece para aprovação antes da semana 4. Nenhuma autenticação é implementada nesta tarefa.

## Q02 — Checkout com vários produtores

**Problema:** a cesta demonstrativa aceita várias origens; como criar encomendas? **Documentado:** E exemplifica um produtor por order; não define checkout multi-produtor. F0 recomenda um grupo de encomendas por produtor, criado numa transação global.

**Alternativas e balanço:** restringir cesta a uma origem simplifica backend mas contraria a experiência aprovada; uma order com subencomendas aumenta complexidade de estados; várias orders agrupadas respeitam a gestão por produtor mas exigem atomicidade e resposta de grupo. **Backend:** schema, chave do checkout, índice/idempotência e transação. **Frontend:** confirmação/resultado do checkout e preservação da cesta após falha.

**Recomendação P:** uma order por produtor, grupo único e tudo ou nada, mantendo a cesta atual. **Necessária:** antes de 3.4 e de estabilizar POST /orders. O oneOf do contrato representa alternativas pendentes, não dois comportamentos arbitrários aprovados.

## Q03 — Unidades e frações

**Estado: aprovada funcionalmente em 2026-10-16.** Sistema misto: unidade, embalagem, peso e volume; o produtor define a modalidade adequada. Embalagem tem conteúdo próprio (500 g, caixa de 6, garrafa de 750 ml), distinto da quantidade comercial comprada. A recomendação antiga de limitar toda a plataforma a unidades comerciais inteiras não foi adotada.

**T32-02/T32-03 aprovadas em 2026-10-17:** quantidades inteiras em g, ml, unidades inteiras ou número de embalagens; embalagem distinta do conteúdo. Subtotal exato, half-up por linha, soma das linhas arredondadas e servidor como fonte de verdade, sem operações monetárias de ponto flutuante imprecisas. Decimal128 para quantidades deixa de ser alternativa pendente.

**Continuam pendentes:** mínimos/passos, limites, referência de preço, tipo BSON e campos concretos de DTO/entrada; agregação de linhas iguais e versionamento. Product/Order/lote/stock partilham unidade/escala e snapshots; frontend/cart exigem futura adaptação autorizada. Quantity no OpenAPI passa a inteiro, sem escolher Number versus BSON long.

## Q04 — Produtores pendentes, rejeição e recandidatura

**Estado: aprovada no âmbito explícito em 2026-10-16; recandidatura continua pendente.** Pendente consulta candidatura, edita perfil e cria/edita produtos em rascunho; não publica, recebe encomendas ou cria leilões. Aprovado gere a loja, publica, recebe encomendas e cria leilões. Aprovação do perfil não publica automaticamente rascunhos. Rejeitado consulta decisão/justificação e não publica/vende; não conceder outros direitos por inferência.

Esta escolha permite preparação privada antes da aprovação e ultrapassa a recomendação anterior de só consulta. T32-05 aprova estados rascunho/publicado/arquivado, início rascunho, publicação explícita por aprovado e arquivo preservando histórico. Outros mínimos de rascunho e justificação/metadados do perfil foram aprovados em A02/A03 e implementados no primeiro bloco. Aprovação da candidatura não atribui arbitrariamente papel administrativo ou novas capacidades comerciais à conta.

**Impacto:** separar estado do perfil de estado de publicação do produto; consultas públicas exigem publicado + produtor aprovado, permissões de rascunho não exigem aprovação. Resolver recandidatura antes de criar endpoint ou transição e outros direitos do rejeitado antes de os disponibilizar. Os modelos podem ser planeados agora, mas nenhuma rota privada é ativada antes da segurança real C04.

## Q05 — Estados de encomenda e stock

**Problema:** saltos, reversão/cancelamento e momento de débito/reposição. **Documentado:** quatro estados obrigatórios; F0 propõe cadeia linear e débito na criação. Mocks apresentam histórico linear apenas para consulta.

**Alternativas e balanço:** cadeia linear facilita auditoria mas é menos flexível; saltos/cancelamento exigem novos predicados e reposição idempotente; debitar na confirmação deixa pendências sem garantia de stock. **Backend:** transições, histórico/versão, transações e concorrência. **Frontend:** ações de estado futuras e mensagens de disponibilidade.

**Recomendação P:** pendente → confirmada → pronta → entregue, sem saltos; débito na criação, sem acrescentar cancelamento nesta base. Explicitar risco de stock comprometido em pendentes. **Necessária:** antes de 3.4. O enum não é aprovação da cadeia ou do débito.

## Q06 — Moeda, zero, entrega, pagamento e alteração de preço

**Estado: aprovada no âmbito explícito em 2026-10-16.** Moeda EUR, preços em cêntimos inteiros; sem pagamentos eletrónicos, pagamento diretamente ao produtor; totais exclusivamente do servidor; alterações de preço exigem reconfirmação antes de concluir a encomenda.

**Continuam pendentes:** preço zero, métodos de entrega/recolha, encargos, dados de entrega e mecanismo exato de reconfirmação. Half-up por linha e soma das linhas arredondadas aprovados T32-03; limites, agregação de linhas iguais e versão de preço pendentes; não escolher tarifa, morada obrigatória ou estado pago por omissão. O mínimo zero do rascunho não aprova produtos gratuitos.

**Impacto:** preço por quantidade de referência, subtotal/total e moeda nos modelos/DTOs, com snapshot imutável e quantidade coerente. Fórmula peso/volume não é simples preço por unidade × número de embalagens em todos os casos. A parte monetária de D05 fica aprovada; snapshots essenciais das linhas aprovados T32-06; transações/idempotência e campos adicionais continuam propostas nos aspetos não explicitamente adotados. Resolver detalhes antes de preços/escritas e checkout 3.4.

## Q07 — Stock do lote, resultado e conversão

**Problema:** ligação do leilão ao catálogo e efeito do vencedor. **Documentado:** F0 recomenda reservar se associado, libertar sem ofertas e converter uma vez em encomenda pelo preço total da oferta; depende de aprovação. Os três produtos associados no admin são referências ilustrativas, sem reserva.

**Alternativas e balanço:** lote independente simplifica stock mas exige composição separada; reserva protege disponibilidade mas envolve transação; conversão automática fecha o fluxo comercial mas precisa de modalidade/dados do vencedor; resultado sem order é mais simples mas requer aceitação do processo.

**Backend:** reservas/índices/encerramento transacional e anti-duplo-débito. **Frontend:** criação de lote, stock e resultado/checkout. **Recomendação P:** seguir reserva/conversão de F0 só após aprovação expressa; não implementar nenhuma implicitamente. **Necessária:** antes dos campos/ações dependentes em 3.6 e do tempo real na Fase 5.

## Q08 — Tempo, edição e extensão do leilão

**Problema:** instante de elegibilidade, edição após início e extensões. **Documentado:** F0 propõe prazo fixo avaliado na operação atómica do banco; mínimo inicial base + incremento é académico.

**Alternativas e balanço:** receção no servidor é simples de explicar mas não ordena escritas concorrentes; avaliação atómica dá predicado consistente mas commit pode terminar depois do prazo; regra de commit tem complexidade adicional; extensão automática expande âmbito. **Backend:** relógio autoritativo, CAS, agendador e testes de limite. **Frontend:** contagem estimada e edição condicionada.

**Recomendação P:** prazo fixo e elegibilidade na avaliação atómica, bloquear alterações comerciais após início. **Necessária:** antes de criação/ciclo temporal dependentes (3.6/5). O contrato não declara que o relógio do browser ou do ack decide o resultado.

## Q09 — Observadores e presença

**Problema:** acesso anónimo e contagem de participantes. **Documentado:** destaque público ativo é obrigatório; F0 recomenda sala autenticada e utilizadores únicos, apesar de o exemplo contar sockets.

**Alternativas e balanço:** sala pública aumenta descoberta mas exige privacidade/controlo de carga; autenticados simplificam âmbito; sockets são fáceis de contar mas duplicam separadores; identidades únicas exigem agregação. **Backend:** autorização REST/socket, projeções de bids e presença. **Frontend:** visitante pode consultar resumo público sem ganhar comando de licitar.

**Recomendação P:** resumo público do destaque, sala/histórico inicialmente autenticados e presença por utilizador único. **Necessária:** antes de estabilizar consultas 3.6 e rooms na Fase 5. Papéis observadores não ganham capacidade de licitar.

## Q10 — Avaliações e denúncias

**Problema:** escala, alvo, unicidade, edição, denunciante e identidade. **Documentado:** ambos os alvos, produto e produtor, após entrega são obrigatórios; F0 recomenda uma avaliação por encomenda/alvo, 1–5 e denúncia autenticada. Mocks só criam avaliação de produtor com limite de 1000 caracteres, provisório.

**Alternativas e balanço:** uma por utilizador/alvo é simples mas perde experiências de compras repetidas; por encomenda mantém vínculo; edição exige histórico/política; anonimato protege denunciante mas dificulta abuso. **Backend:** elegibilidade, índices parciais, limites e moderação. **Frontend:** suportar também alvo produto e feedback, sem transformar mocks em compra verificada.

**Recomendação P:** por encomenda/alvo entregue, 1–5, denúncia autenticada e nome público reduzido; decidir edição e limites antes de escrever. **Necessária:** antes de Review/schema e 3.5. Não se fixou 1–5/min/max nem o limite demonstrativo no schema de entrada.

## Q11 — Localização e fornecedor de mapa

**Problema:** precisão pública e serviço externo. **Documentado:** mapa é obrigatório; fornecedor/coordenadas não escolhidos; mapa atual é ilustrativo, com ligação à localidade.

**Alternativas e balanço:** morada/coordenadas exatas ajudam localização mas aumentam exposição; localidade/coordenadas aproximadas preservam privacidade com menor precisão; SDK e mapa embebido têm termos/quotas diferentes. **Backend:** campos públicos autorizados e validação de intervalos; não inferir morada privada. **Frontend:** adaptador do mapa, atribuição e alternativa textual.

**Recomendação P:** localização consentida para publicação, integração simples após verificar termos/limites. Nenhum fornecedor novo é aprovado aqui. **Necessária:** antes da integração real de mapa; 3.3 pode manter ausência explícita de coordenadas.

## Q12 — Remoção e moderação de conteúdos

**Parcialmente resolvida por T32-05:** arquivo retira produtos da venda preservando histórico; publicado com stock zero pode permanecer visível sem compra. Estados de produto são rascunho/publicado/arquivado. **Problema residual:** restauro, DELETE físico, moderação de outros conteúdos e poderes administrativos. **Documentado:** DELETE 204 e moderação são obrigatórios; F0 recomenda arquivo de produtos referenciados e ocultação com autoria/data. Protótipo não permite apagar contas ou alterar encomendas.

**Alternativas e balanço:** apagamento físico simplifica consultas mas quebra evidência/referências; arquivo preserva histórico e exige filtro de visibilidade; poderes genéricos de moderação aumentam risco/âmbito. **Backend:** visibilidade, constraints de referências e rastreabilidade. **Frontend:** estados públicos/privados e recuperação de recurso removido.

**Recomendação P:** arquivo de produtos referenciados, ocultação de avaliações, sem apagar bids/evidência. Definir conteúdos e campos moderáveis antes de acrescentar operações; este contrato não inventa endpoints genéricos. **Necessária:** antes de DELETE e 3.5/3.6.

## Q13 — Duração e revogação da sessão

**Problema:** expiração, recarregamento, logout e invalidação. **Documentado:** JWT expira obrigatoriamente; F0 propõe memória e duração configurável, não 2 h obrigatório. A sessão demo não contém JWT ou identidade.

**Alternativas e balanço:** memória reduz persistência de token, mas pede login ao recarregar; localStorage é simples mas expõe token a scripts; refresh em cookie pode melhorar continuidade mas acrescenta política de segurança, renovação e revogação. **Backend:** claims, revalidação de conta, expiração e administrador inicial. **Frontend:** estado autenticado, expiração e preservação do carrinho.

**Recomendação P:** acesso em memória com duração a aprovar e verificação de conta atual em operações sensíveis; logout local não promete revogar JWT emitido. Sem endpoint de refresh/logout de servidor até escolher o mecanismo. Política real de password, rate limits e aprovisionamento inicial também precisam de aprovação técnica. **Necessária:** antes de ativar autenticação/escritas (C04/4).

## Q14 — Taxonomias e pesquisa

**Estado: aprovada funcionalmente em 2026-10-16.** Categoria principal controlada/predefinida, etiquetas personalizadas, ingredientes quando aplicável e informação de sazonalidade. Pesquisa reconhece palavras com e sem acentos.

**Continuam sujeitos a aprovação:** lista definitiva de categorias/IDs, estrutura/limites/normalização das etiquetas/ingredientes, semântica de ausência/lista vazia de meses, taxonomia de modo de produção e detalhe de filtros/paginação C03. A [lista inicial e alternativas](phase-3.2-proposal.md) são T32-04; não transformar as oito categorias/quatro estações dos mocks num contrato oficial.

**Recomendação técnica P:** IDs atribuídos estáveis, rótulos humanos separados de formas normalizadas, ingredientes explícitos, índices separados de arrays. T32-04 aprova categoria principal obrigatória, etiquetas opcionais, sazonalidade opcional por meses, pesquisa sem caixa/acentos e sazonalidade sem efeito automático na disponibilidade. Não foi escolhido um enum definitivo ou fornecedor de pesquisa. Não derivar sazonalidade de createdAt nem tratar etiquetas como prova de certificação.

**Impacto:** Product e filtros/URLs/adaptadores futuros precisam de correspondências explícitas; pesquisa por produtor resolve perfil→user. Escolher estrutura antes de schemas/catálogo; nenhuma alteração ao frontend nesta tarefa.

## Q15 — Indicadores e stock baixo

**Problema:** fórmula/período de vendas e limiar. **Documentado:** F0 recomenda total entregue por período e limiar por produto. Mocks somam cêntimos históricos do conjunto e usam três unidades como exemplo editável.

**Alternativas e balanço:** confirmadas ou entregues produzem números distintos; recebimentos exigiriam pagamento; limiar global é simples mas menos adequado; por produto dá controlo mas precisa de valor inicial. **Backend:** agregações autorizadas, período/unidade e limiares. **Frontend:** labels/fórmulas e indicadores derivados, não contadores paralelos.

**Recomendação P:** total entregue por período, explicitamente sem pagamentos; limiar por produto, inicial a acordar. **Necessária:** antes de 3.5. Não fixar três, período ou unidades heterogéneas como kg.

## Q16 — Observação Cloud e operação

**Problema:** sondas, serviços, região, custos e continuidade. **Documentado:** estado de API/Socket.IO/Atlas/Blob/Swagger e publicação até à defesa são obrigatórios; F0 propõe sondas leves, uma instância e custos/limites a validar. Admin demonstra exemplos separados de estado real não monitorizado.

**Alternativas e balanço:** sonda simples reduz custo, mas não demonstra saúde total; métricas completas melhoram diagnóstico mas aumentam configuração; mais instâncias exigem coordenação/presença/encerramento. **Backend:** sondas sem segredos e timestamp/limitações, orçamento e infraestrutura. **Frontend:** distinguir desconhecido real, observação datada e mera ilustração.

**Recomendação P:** verificações leves com estado/data e limites explícitos, manter desconhecido sem sonda real; confirmar região/planos/créditos antes de provisionar. **Necessária:** antes de serviços/Cloud na Fase 6; antes de 3.2 confirmar apenas capacidade do ambiente transacional escolhido. Não se seleciona SKU, preço ou região aqui.

## Registo de aprovação explícita — 2026-10-15

Fonte: instrução do utilizador «Fase 3.0 — Aprovação das decisões iniciais». A autorização permite atualizar exclusivamente a documentação complementar e apresentar uma proposta técnica; não permite iniciar 3.1, instalar dependências, modificar código ou executar Git de publicação. Não se altera retrospectivamente F0.

| ID  | Estado       | Âmbito aprovado                                                                                                                                                                                                            | Detalhes que não ficam aprovados por implicação                                                                                                                                            |
| --- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C01 | **Aprovada** | Campos públicos em português; identificadores estáveis independentes dos nomes; contas e perfis de produtor separados; DTOs próprios; PUT substitui completamente os campos editáveis, respeitando validação e permissões. | Formato concreto/geração dos IDs, continuidade de slugs, todas as rotas/nomes adicionais, coleções D09 e campos comerciais dependentes de Q não são aprovados em bloco.                    |
| C02 | **Aprovada** | Erros estruturados, códigos estáveis, mensagens claras e identificação dos campos inválidos; HTTP adequado incluindo 400/401/403/404/409/500; sem informações sensíveis nem detalhes internos.                             | Catálogo exato de códigos, requestId, política 403 versus 404 para propriedade, precondição versaoEsperada/concorrência e códigos adicionais 503/413/429 permanecem propostas a confirmar. |
| C04 | **Aprovada** | Autenticação/autorização reais na semana 4; todas as operações privadas, de leitura e escrita, inacessíveis pela API até estarem implementadas; papel escolhido no frontend demonstrativo não autentica nem autoriza.      | Não aprova Q01/Q04/Q13, bypass de segurança ou disponibilização de comandos privados com identidades fictícias.                                                                            |
| C06 | **Aprovada** | Configuração independente para apps/api com Node.js LTS, Express e TypeScript; manter Mongoose, Vitest e Supertest; separar configurações frontend/backend.                                                                | Versões concretas, biblioteca HTTP, scripts, variáveis, ambiente MongoDB e estratégia de testes/transações têm de ser apresentados antes de instalar e aguardam nova aprovação.            |

**Pendentes: Q01–Q16 e C03/C05.** Todas as recomendações dessas questões permanecem sem alteração. Aprovar estes princípios não aprova automaticamente as restantes propostas D, o contrato inteiro, a matriz comercial ou a implementação.

A [proposta técnica para 3.1](phase-3.1-proposal.md) apresenta as versões e os seis pontos pedidos pelo utilizador. É proposta, não execução ou aprovação. Qualquer aprovação futura deve indicar IDs/detalhes, alternativa, âmbito e consequências.

## Autorização de implementação 3.1 — 2026-10-16

O utilizador autorizou criar `feat/api-foundation` a partir de 807aa68 e implementar somente a fundação local, preservando documentação e frontend. Preferência expressa por Node 22.21.1 e MongoDB 8 em replica set de membro único prevalece sobre a proposta anterior de Node 24/três membros.

Após confirmar engines/peers, mantiveram-se Node 22.21.1 e npm 10.9.4; instalaram-se as versões documentadas na [entrega 3.1](foundation-implementation.md), incluindo Zod/tsx/Vite, Mongoose/Vitest/Supertest e TypeScript 5.9.3. Configuração e scripts são próprios da API. O endpoint técnico foi autorizado; limite JSON 100 KiB e HTTP 413 são detalhes técnicos da fundação, não regras comerciais.

Esta autorização substitui o bloqueio anterior de execução apenas no âmbito 3.1. **Q01–Q16 e C03/C05 continuam pendentes**; não aprova D06/D08/D09 ou modelos comerciais. Autenticação real permanece na semana 4 e todas as operações privadas continuam inacessíveis. Não há autorização para staging, commit, push, merge, PR ou início de 3.2.

## Preparação documental 3.2 — 2026-10-16

Registo histórico da primeira preparação, atualizado pela consolidação técnica de 2026-10-17 abaixo.

Fonte: pedido «FASE: 3.2 — PREPARAÇÃO DOS MODELOS MONGODB», exclusivamente documental. A Fase 3.1 foi posteriormente autorizada para publicação e está publicada em feat/api-foundation, HEAD 68f41ec; main continua c10d031. Os registos anteriores mantêm o seu âmbito e datas.

| Decisão | Estado atual                    | Aprovação e limite                                                                                                                                                                                         |
| ------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q01     | **Aprovada**                    | Conta acumulável comprador/produtor; venda só com aprovação; proibição de auto-licitação; admin controlado. Codificação das capacidades T32-01 não escolhida.                                              |
| Q03     | **Aprovada funcionalmente**     | Unidade/embalagem/peso/volume. Codificação A/B, escala, mínimos/passos, conversão/arredondamento não escolhidos.                                                                                           |
| Q04     | **Aprovada no âmbito indicado** | Preparação privada pendente, publicação/venda apenas aprovado; rascunhos não publicados automaticamente; rejeitado consulta decisão/justificação. Recandidatura e direitos adicionais continuam pendentes. |
| Q06     | **Aprovada no âmbito indicado** | EUR/cêntimos inteiros, pagamento direto sem integração, totais servidor e reconfirmação. Zero/entrega/custos/dados e mecanismo exato continuam pendentes.                                                  |
| Q14     | **Aprovada funcionalmente**     | Categoria principal controlada + etiquetas, ingredientes/sazonalidade e pesquisa sem diferença de acentos. Lista/limites/representação sazonal e detalhe C03 continuam pendentes.                          |

**Restantes questões pendentes:** Q02, Q05, Q07, Q08, Q09, Q10, Q11, Q12, Q13, Q15, Q16 e C03/C05. A aprovação das cinco regras não aprova T32-01..06, D06/D07/D08/D09, implementação, Git ou novos recursos. Ver [proposta 3.2](phase-3.2-proposal.md) e [modelos candidatos](phase-3.2-models.md). Nenhum schema, teste, dado ou ligação comercial é criado nesta tarefa.

## Consolidação técnica 3.2 — aprovação de 2026-10-17

Este registo atualiza os estados históricos acima; não os interpreta como recusando aprovações posteriores. Não autoriza implementação, testes novos, instalações ou Git.

| Decisão | Âmbito aprovado                                                                                                                                                        | Limites / pendências preservadas                                                                                                            |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| T32-01  | Lista de papéis na mesma conta; comprador/produtor acumuláveis; perfil separado; vender exige aprovação administrativa.                                                | Aquisição de capacidades, admin/claims e campos/índices concretos A01/A02.                                                                  |
| T32-02  | Quantidades inteiras em g/ml/unidades/número de embalagens; kg/L na apresentação; embalagem distinta do conteúdo.                                                      | Number/BSON long, limites, preço por referência, mínimos/passos e DTO concreto.                                                             |
| T32-03  | Subtotal exato por linha, half-up em cêntimos; total soma subtotais arredondados; servidor autoritativo; sem ponto flutuante impreciso.                                | Agregação de linhas repetidas, limites e versão de preço/reconfirmação.                                                                     |
| T32-04  | Categoria principal obrigatória/controlada, etiquetas opcionais, ingredientes aplicáveis, meses opcionais informativos, busca sem caixa/acentos.                       | Lista definitiva, IDs, limites/estrutura, modo de produção, ausência/vazio e C03.                                                           |
| T32-05  | rascunho/publicado/arquivado; início rascunho; publicação explícita por aprovado; aprovação não publica; zero stock visível sem compra; arquivo preserva histórico.    | Outros mínimos de rascunho, restauro/DELETE e moderação Q12; não aprova metadados da candidatura.                                           |
| T32-06  | Sete coleções users/producers/products/orders/auctions/bids/reviews; perfis/bids/reviews separados; linhas embebidas com snapshots essenciais e referências adequadas. | Campos/obrigatoriedades/índices específicos não são aprovados em bloco. D09 adotada apenas quanto à separação das duas coleções adicionais. |

Q02/Q05/Q07–Q13/Q15/Q16 e C03/C05 mantêm pendências, com Q12 parcialmente resolvida quanto ao arquivo de produtos. Q01/Q03/Q04/Q06/Q14 conservam os detalhes residuais explicitados. A [análise de prontidão](phase-3.2-readiness.md) classifica todas as pendências em A/B/C e propõe users/producers como primeiro bloco, dependente da confirmação de **A01 (identidade/email), A02 (perfil mínimo/cardinalidade), A03 (decisão administrativa)** e de autorização explícita de implementação. As recomendações A não são decisões tomadas.

## Implementação autorizada A01–A03 — 2026-10-17

O utilizador aprovou A01–A03 e autorizou implementar apenas users/producers, validações, índices e testes locais, preservando frontend e F0. Ver [campos efetivos, evidências e limites](phase-3.2-identity-implementation.md). Este registo atualiza as pendências A das secções históricas acima.

| Decisão | Âmbito aprovado e realizado                                                                                                                                                                                                                                                                                                                                                      |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A01     | Nome completo, email normalizado/único sem distinção de caixa, identidade estável, lista de papéis acumuláveis e hash privado compatível com bcrypt. Concretizações do bloco: ObjectId, timestamps, limites de nome/email, índice único e validação do formato bcrypt; sem hashing/login/registo/JWT ou administrador real.                                                      |
| A02     | No máximo um perfil por conta, índice único userId; nome da exploração/negócio, responsável derivado da conta, localidade, concelho, descrição da atividade e telefone obrigatórios; fotografia/logótipo opcional por metadados. Estado inicial pendente. **A descrição deixa de ser opcional; concelho e telefone entram por aprovação expressa.** Sem upload/candidatura HTTP. |
| A03     | pendente/aprovado/rejeitado; pendente sem decisão; aprovado/rejeitado com autor e data; rejeição com justificação obrigatória; limites/data coerentes do bloco aprovado. Sem endpoints administrativos, transições de recandidatura ou autenticação.                                                                                                                             |

As verificações cruzadas de existência/papel/competência pertencem ao serviço futuro autorizado; ref não as implementa. Os modelos validam a forma local, privacidade e unicidade, sem conceder permissões de venda. Q02/Q05/Q07–Q13/Q15/Q16, C03/C05 e detalhes residuais comerciais não se tornam aprovados por este bloco. Publicação e modelos seguintes continuam sujeitos a nova autorização.

## Produtos P01–P08 e esclarecimentos — 2026-10-17

P01–P08 aprovadas para o modelo products, com autorização condicional de implementação local; ver [registo integral e categorias](phase-3.2-products.md). As duas pendências identificadas foram respondidas pelo utilizador antes do código: preço fixo por kg/L ou unidade/embalagem, com stock em g/ml/contagens; aplicabilidade de ingredientes declarada explicitamente pelo produtor e lista obrigatória quando aplicáveis na publicação.

A categoria pode faltar no rascunho (P04 substitui a obrigatoriedade anterior nesse estado); para publicar, exige-se a lista completa de campos aprovada. Preço de produto entre 1 e 1 000 000 cêntimos, até duas fotos, stock máximo por modalidade. A lista de doze categorias substitui a sugestão anterior. P03 resolve o débito na submissão da encomenda, mas não autoriza checkout/transações; P08 preserva snapshots e exige confirmação futura, sem UI ou carrinho agora.

As recomendações históricas sobre preço zero/lista final/categoria em rascunho/referência de preço deixam de ser pendências no âmbito de products. Restantes questões Q/C continuam no seu âmbito próprio. Sem autorização para staging/commits/push/branches/merge/PR, novos endpoints, autenticação ou modelos seguintes.
