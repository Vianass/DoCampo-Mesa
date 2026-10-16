# Fase 3.0 — contrato da API e decisões de entrada

Estado: **documentação com aprovação parcial de C01/C02/C04/C06 e fundação 3.1 implementada localmente**. Q01–Q16, C03/C05 e detalhes técnicos não aprovados continuam pendentes. Base aprovada: `feat/admin-dashboard`, commit `807aa68`; trabalho local 3.1 em `feat/api-foundation`, mesmo HEAD. A integração cumulativa em `main` foi expressamente adiada pelo utilizador; na etapa documental 3.0 não se criou branch, e na implementação 3.1 apenas se criou a branch expressamente autorizada, sem alterar `main` (`c10d031`). Todos os ficheiros desta pasta são documentação complementar.

A autorização posterior de 2026-10-16 permitiu implementar somente a fundação na branch `feat/api-foundation`, sem publicação. Ver [entrega 3.1](foundation-implementation.md) e [comandos da API](../../apps/api/README.md). Os nove documentos locais anteriores foram preservados; os resultados históricos desta pasta mantêm as suas datas.

## Documentos e leitura

| Documento                                                    | Conteúdo                                                                                                                                                  |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [openapi.yaml](openapi.yaml)                                 | Contrato inicial OpenAPI 3.0.3: autenticação/utilizadores, produtores/candidaturas, produtos, encomendas, avaliações, leilões/licitações e administração. |
| [decisions.md](decisions.md)                                 | Estado das decisões, análise Q01–Q16, alternativas e recomendações por aprovar.                                                                           |
| [data-mapping.md](data-mapping.md)                           | Recursos, coleções, schemas futuros, referências e DTOs; não implementa modelos Mongoose.                                                                 |
| [security.md](security.md)                                   | Matriz de permissões, projeções e condições antes de ativar escritas.                                                                                     |
| [frontend-integration.md](frontend-integration.md)           | Migração gradual, adaptação dos mocks e preservação do frontend aprovado.                                                                                 |
| [implementation-plan.md](implementation-plan.md)             | Subfases 3.1–3.7, dependências, ficheiros previstos, testes, aceitação e riscos.                                                                          |
| [foundation-implementation.md](foundation-implementation.md) | Implementação local autorizada 3.1, versões efetivas, ambiente, testes e limitações.                                                                      |
| [phase-3.1-proposal.md](phase-3.1-proposal.md)               | Proposta histórica de 2026-10-15; os ajustes autorizados em 2026-10-16 e as versões efetivas constam da entrega 3.1.                                      |
| [traceability.md](traceability.md)                           | Correspondência académica, inventário de operações e resultado das verificações.                                                                          |

## Autoridade e estados

- **Obrigatório académico (O):** requisitos explícitos do PDF, referenciados por página e pelos RF/RNF existentes.
- **Aprovado/fixado (A):** escolhas fornecidas pelo utilizador em F0 e decisões explícitas posteriores. Node.js/Express/TypeScript/Mongoose, monorepo modular, MongoDB Atlas, OpenAPI/Swagger, JWT/bcrypt e ferramentas de teste já estão escolhidos; a fundação Express/TypeScript/Mongoose está implementada localmente; autenticação, Swagger e serviços comerciais continuam futuros.
- **Proposta documentada (P):** solução D ou recomendação Q/C que precisa de aprovação quando afetar implementação. Não equivale a requisito académico.
- **Pendente (Q/C):** operação, schema ou política não podem ser estabilizados sem resolver as dependências indicadas. Aprovação de um protótipo não aprova automaticamente regras comerciais para contas reais.

Além de preparar documentação local e adiar integração em `main`, o utilizador aprovou em 2026-10-15 C01/C02/C04/C06 no âmbito do [registo](decisions.md). Q01–Q16 continuam pendentes para o backend real; pressupostos demonstrativos de fases anteriores são evidência de interface, não respostas definitivas.

## Convenções do contrato

`servers.url: /api` combinado com `/products` representa `/api/products`. Não anuncia servidor disponível. `security: []` significa operação pública, também utilizável por pessoas autenticadas; as demais operações usam `bearerAuth`. As extensões `x-authorized-roles`, `x-decision-dependencies`, `x-contract-status` e `x-implementation-stage` documentam papéis, bloqueios e fase prevista. As extensões são metadados: nenhum middleware ou permissão é gerado nesta subfase.

Apenas GET /health é implementado localmente; as 44 operações comerciais/futuras continuam propostas bloqueadas, sem endpoints em funcionamento. `proposta-bloqueada` significa que há Q a resolver, além de C03/C05 e dos detalhes ainda não aprovados de C01/C02/C06. As convenções C01 estão aprovadas, mas os nomes adicionais de rotas/DTOs continuam sujeitos a revisão; só os métodos/caminhos/códigos explicitamente exigidos são fixados pelo enunciado. O pedido atual solicita cobertura inicial de toda a API; isso não antecipa a implementação de autenticação (semana 4), sockets (semana 5) ou Cloud (semana 6).

O contrato usa campos públicos em português conforme C01 aprovada, concretizando essa parte de D14, mantendo modelos de apresentação existentes em inglês através de adaptadores futuros. Dinheiro em cêntimos é a proposta D05 condicionada por Q06. Quantidade é descrita sem fechar fracionamento: Q03 decide o schema final. Escala/cardinalidade de avaliações, taxonomias, limiares, durações de sessão e limites de texto não são fixados copiando os mocks.

`POST /orders` apresenta duas alternativas de resposta (`Order` ou `CheckoutGroup`) exclusivamente para tornar Q02 visível; antes de estabilizar o contrato deve ser escolhida uma forma. Não é autorização para responder de maneira variável. PUT de produto segue a substituição completa dos campos editáveis aprovada em C01; os campos de servidor são preservados e nunca atribuídos pelo cliente. Paginação, metadados e limites ainda dependem de C03.

Não há escrita REST de bids neste rascunho. `GET /auctions/{id}/bids` e `GET /me/bids` cobrem consultas; o comando `licitar` pertence ao protocolo Socket.IO futuro, conforme [consistência dos leilões](../architecture/auction-consistency.md). Não se acrescentam pagamentos, recuperação real de password, refresh tokens, gestão de permissões, eliminação de contas ou poderes administrativos genéricos.

## Requisitos académicos preservados

PDF p. 17: GET products 200; POST products 201 com Location; PUT products/:id 200; DELETE 204 sem corpo; POST orders; PATCH orders/:id/estado; erros 400/401/403/404. PDF p. 18: users/products/orders/auctions/bids, linhas embebidas, comprador/produtor referenciados, required/enum/min e consulta com operador MongoDB. PDF p. 19: OpenAPI 3, components, bearerAuth e Swagger UI futuro em `/api-docs`. PDF p. 20: bcrypt, JWT com expiração, papel, segredos de ambiente e HTTPS em produção.

A estrutura OpenAPI válida não demonstra código HTTP, autenticação ou consistência implementados. M1 exige esboço; M2 exige API documentada, MongoDB, autenticação e SPA integrada. Este documento fecha a lacuna de contrato inicial identificada na análise, sem declarar M2 concluído.

## Fontes preservadas

Os nove documentos originais continuam sem alterações: [requisitos funcionais](../requirements/functional-requirements.md), [não funcionais](../requirements/non-functional-requirements.md), [casos de utilização](../requirements/use-cases.md), [visão global](../architecture/system-overview.md), [diagramas](../architecture/architecture-diagram.md), [consistência dos leilões](../architecture/auction-consistency.md), [decisões F0](../architecture/decisions.md), [modelo de dados](../database/data-model.md) e [plano oficial](../planning/implementation-plan.md).

Consultaram-se também o [README atual](../../README.md), o [sistema visual](../design/design-system.md), as fontes/tipos/reducers privados e as configurações dos workspaces. O README e notas históricas de entrega ainda descrevem a Fase 2.4.4 como local e as instruções de instalação selecionam a branch do comprador: são desatualizações conhecidas, não alteradas porque esta autorização se restringe à documentação complementar 3.0.

O PDF original tem 27 páginas e SHA-256 `ff42084c30a5a663ce4165ae301c5255dd313f710e51af446fd5dbffe3925243`, igual ao identificado em F0. Foi consultado no caminho local fornecido pelo utilizador, sem copiar o PDF para o repositório. Referência técnica: [OpenAPI 3.0.3](https://spec.openapis.org/oas/v3.0.3.html). Ferramentas/limites da validação estão em [traceability.md](traceability.md).

A Fase 3.1 foi posteriormente autorizada e implementada localmente; instalaram-se apenas dependências da API e criou-se a branch expressamente autorizada. Não se executaram operações Git de publicação. A aprovação inicial destas quatro decisões não aprovou Q01–Q16/C03/C05; a autorização posterior de 3.1 aplica os ajustes registados na entrega, sem resolver essas questões. Qualquer implementação, instalação, alteração documental original ou operação Git futura depende de autorização explícita. A preservação da Fase 0 permanece obrigatória.
