# Decisões de entrada — análise Q01–Q16

Complementa, sem substituir ou alterar, [decisions.md da Fase 0](../architecture/decisions.md). **C01/C02/C04/C06 foram aprovadas explicitamente no âmbito registado abaixo. Q01–Q16 e C03/C05 continuam pendentes.** As experiências demonstrativas anteriores continuam aprovadas no seu âmbito e não são modificadas. A autorização documental não resolve automaticamente as questões.

## Base aprovada e propostas transversais

D01/D02: monorepo e monólito modular, React/TypeScript e Node.js/Express/TypeScript/Mongoose. D04: JWT/bcrypt escolhidos; armazenamento/duração continuam proposta. D10/D12: Atlas e serviços Azure escolhidos; configuração, versões e planos concretos não escolhidos. D13: OpenAPI 3, Swagger UI, Vitest, Supertest e Playwright selecionados. A decisão atual aprova adiar integração em main e produzir apenas documentos na branch atual.

D03 (propriedade/aprovação), D05 (cêntimos), D06/D08 (transações/idempotência), D07 (versões/snapshots), D09 (coleções adicionais), D10 (mediação de upload), D11 (agendador), D12 (instância inicial) mantêm o estado de proposta nos aspetos assinalados em F0. O vocabulário público em português de D14 foi aprovado agora no âmbito C01; não se aprovaram automaticamente todos os nomes, rotas ou campos do rascunho. Não se presume que todos foram adotados por existirem mocks semelhantes.

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

**Problema:** uma conta pode comprar e produzir? Como evitar licitar no próprio lote? **Documentado:** E distingue três papéis; F0 recomenda um papel comercial por conta, administrador separado. A sessão demonstrativa escolhe um papel, sem provar a política real.

**Alternativas e balanço:** papel único simplifica schema, autorização e navegação, mas pode obrigar a contas distintas; vários papéis facilitam uso misto, mas exigem seleção de contexto e impedimento de auto-licitação. **Backend:** users.papel/roles, claims, autorização e relação de proprietário. **Frontend:** identidade real e eventual troca de contexto, preservando a demonstração existente.

**Recomendação P:** papel único na base académica; administrador por procedimento controlado, sem autorregisto. Se forem aceites vários papéis, proibir auto-licitação no servidor. **Necessária:** antes de User/schema, registo, autenticação e filtros próprios (3.2/4).

## Q02 — Checkout com vários produtores

**Problema:** a cesta demonstrativa aceita várias origens; como criar encomendas? **Documentado:** E exemplifica um produtor por order; não define checkout multi-produtor. F0 recomenda um grupo de encomendas por produtor, criado numa transação global.

**Alternativas e balanço:** restringir cesta a uma origem simplifica backend mas contraria a experiência aprovada; uma order com subencomendas aumenta complexidade de estados; várias orders agrupadas respeitam a gestão por produtor mas exigem atomicidade e resposta de grupo. **Backend:** schema, chave do checkout, índice/idempotência e transação. **Frontend:** confirmação/resultado do checkout e preservação da cesta após falha.

**Recomendação P:** uma order por produtor, grupo único e tudo ou nada, mantendo a cesta atual. **Necessária:** antes de 3.4 e de estabilizar POST /orders. O oneOf do contrato representa alternativas pendentes, não dois comportamentos arbitrários aprovados.

## Q03 — Unidades e frações

**Problema:** quantidade representa embalagens, kg fracionários ou inteiros escalados? **Documentado:** F0 recomenda unidades comerciais inteiras; demonstração usa inteiros e rótulos, sem fechar política real.

**Alternativas e balanço:** embalagens inteiras simplificam cálculo/stock, mas não cobrem peso variável; decimais são familiares mas exigem precisão definida; gramas/ml inteiros evitam erro binário, mas exigem conversões e rótulos. **Backend:** tipos, min/escala, snapshots e reservas. **Frontend:** QuantityControl, formularização de stock/unidade e totais.

**Recomendação P:** unidades comerciais inteiras com tamanho explícito, sujeitas a confirmação. **Necessária:** antes de Product/Order e criação/stock (3.2–3.4). Quantity no OpenAPI mantém número positivo sem declarar que frações são autorizadas; o schema final deverá restringir a opção aprovada.

## Q04 — Produtores pendentes, rejeição e recandidatura

**Problema:** que capacidades existem antes da aprovação? **Documentado:** aprovação/rejeição é obrigatória; F0 recomenda login/consulta da candidatura e bloqueio comercial até aprovação. O protótipo permite experiências privadas sem efeitos públicos.

**Alternativas e balanço:** bloquear tudo é simples mas dificulta consulta; rascunhos privados ajudam preparação, com novo ciclo de publicação; publicar antes de aprovação reduz barreiras mas enfraquece validação. **Backend:** elegibilidade nas leituras públicas e escritas, conflito de decisão, recandidatura. **Frontend:** mensagens/capacidades reais e candidatura, sem remover os cenários demo.

**Recomendação P:** consulta própria permitida, publicação/vendas/leilões bloqueados até aprovação; sem recandidatura automática. Aprovar uma candidatura não altera o papel arbitrariamente. **Necessária:** antes de perfis públicos/CRUD e decisões (3.2/3.3/3.5). Recandidatura exige decisão explícita antes de adicionar endpoint.

## Q05 — Estados de encomenda e stock

**Problema:** saltos, reversão/cancelamento e momento de débito/reposição. **Documentado:** quatro estados obrigatórios; F0 propõe cadeia linear e débito na criação. Mocks apresentam histórico linear apenas para consulta.

**Alternativas e balanço:** cadeia linear facilita auditoria mas é menos flexível; saltos/cancelamento exigem novos predicados e reposição idempotente; debitar na confirmação deixa pendências sem garantia de stock. **Backend:** transições, histórico/versão, transações e concorrência. **Frontend:** ações de estado futuras e mensagens de disponibilidade.

**Recomendação P:** pendente → confirmada → pronta → entregue, sem saltos; débito na criação, sem acrescentar cancelamento nesta base. Explicitar risco de stock comprometido em pendentes. **Necessária:** antes de 3.4. O enum não é aprovação da cadeia ou do débito.

## Q06 — Moeda, zero, entrega, pagamento e alteração de preço

**Problema:** preços, encargos, entrega e confirmação de total. **Documentado:** exemplos em EUR; D05 propõe cêntimos; F0 recomenda sem pagamento eletrónico e sem taxas inventadas. Demonstração permite zero, não há checkout real.

**Alternativas e balanço:** EUR sem pagamento reduz âmbito; prestador de pagamentos implica segurança/estados adicionais; preço zero ou estritamente positivo altera validação; entrega sem tarifa definida evita inventar valor, mas exige explicitar condições. **Backend:** Money, totais, morada condicional, cálculo de preço e recusa/reconfirmação. **Frontend:** confirmação do checkout e apresentação dos encargos acordados.

**Recomendação P:** EUR em inteiros seguros, sem pagamento integrado; acordar zero/condições de entrega; nunca aceitar silenciosamente novo preço. Definir mecanismo de reconfirmação antes de ativar checkout (por exemplo proposta de total e nova confirmação; mecanismo exato pendente). **Necessária:** antes de preços e 3.4. mínimo zero no schema é a proposta identificada, não decisão final.

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

**Problema:** apagar, arquivar ou ocultar; quais poderes administrativos existem? **Documentado:** DELETE 204 e moderação são obrigatórios; F0 recomenda arquivo de produtos referenciados e ocultação com autoria/data. Protótipo não permite apagar contas ou alterar encomendas.

**Alternativas e balanço:** apagamento físico simplifica consultas mas quebra evidência/referências; arquivo preserva histórico e exige filtro de visibilidade; poderes genéricos de moderação aumentam risco/âmbito. **Backend:** visibilidade, constraints de referências e rastreabilidade. **Frontend:** estados públicos/privados e recuperação de recurso removido.

**Recomendação P:** arquivo de produtos referenciados, ocultação de avaliações, sem apagar bids/evidência. Definir conteúdos e campos moderáveis antes de acrescentar operações; este contrato não inventa endpoints genéricos. **Necessária:** antes de DELETE e 3.5/3.6.

## Q13 — Duração e revogação da sessão

**Problema:** expiração, recarregamento, logout e invalidação. **Documentado:** JWT expira obrigatoriamente; F0 propõe memória e duração configurável, não 2 h obrigatório. A sessão demo não contém JWT ou identidade.

**Alternativas e balanço:** memória reduz persistência de token, mas pede login ao recarregar; localStorage é simples mas expõe token a scripts; refresh em cookie pode melhorar continuidade mas acrescenta política de segurança, renovação e revogação. **Backend:** claims, revalidação de conta, expiração e administrador inicial. **Frontend:** estado autenticado, expiração e preservação do carrinho.

**Recomendação P:** acesso em memória com duração a aprovar e verificação de conta atual em operações sensíveis; logout local não promete revogar JWT emitido. Sem endpoint de refresh/logout de servidor até escolher o mecanismo. Política real de password, rate limits e aprovisionamento inicial também precisam de aprovação técnica. **Necessária:** antes de ativar autenticação/escritas (C04/4).

## Q14 — Taxonomias e pesquisa

**Problema:** categoria, ingredientes, época e modo de produção. **Documentado:** filtros/pesquisa são obrigatórios; F0 recomenda listas controladas, termos de ingredientes e meses 1–12; mocks usam oito categorias e quatro estações, não contrato final.

**Alternativas e balanço:** texto livre é flexível mas inconsistente; enums são previsíveis mas exigem manutenção; meses são precisos mas não se mapeiam automaticamente para estações. **Backend:** normalização, pesquisas por produtor/perfil, índices e limites de regex. **Frontend:** opções/URL e equivalência da pesquisa sem acentos; nunca derivar época de createdAt.

**Recomendação P:** taxonomias controladas e ingredientes explícitos, acordando mapeamento de época e pesquisa normalizada em C03. **Necessária:** antes de Product/schema e catálogo 3.3. Nenhum enum dos mocks foi promovido a taxonomia real.

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
