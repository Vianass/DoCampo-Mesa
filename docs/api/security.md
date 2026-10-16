# Segurança e matriz de permissões — proposta

A matriz traduz RF-AUT/UC e D03/D04, com [Q01–Q16](decisions.md) pendentes. O enunciado exige JWT com expiração, bcrypt, papel, segredos de ambiente e HTTPS em produção. Propriedade/aprovação e projeções mínimas concretizam propostas já documentadas. **Nenhuma linha desta matriz implementa autorização nem concede novos poderes.** O OpenAPI exprime autenticação e papéis; as condições de negócio têm de ser validadas no futuro servidor.

## Matriz

Legenda: P = público; S = próprio; A = autorizado pelo papel; C = condicionado à decisão Q; — = não autorizado nesta proposta. Operação pública é também acessível a utilizadores autenticados. Visitante significa ausência de conta/token.

| Operação / operationId                                                  | Visitante | Comprador | Produtor | Administrador | Condições e projeção                                                                                                        |
| ----------------------------------------------------------------------- | --------- | --------- | -------- | ------------- | --------------------------------------------------------------------------------------------------------------------------- |
| getHealth                                                               | P         | P         | P        | P             | Único diagnóstico implementado localmente em 3.1; confirma HTTP, sem dados privados ou monitorização Cloud.                 |
| register, login                                                         | P         | P         | P        | P             | Registo cria só comprador/produtor; login não altera papéis. Q01/Q04/Q13.                                                   |
| getMe                                                                   | —         | S         | S        | S             | Apenas identidade própria, incluindo email próprio; hash nunca devolvido.                                                   |
| listProducts, getProduct, listProducers, getProducer                    | P         | P         | P        | P             | Só recursos publicáveis segundo Q04/Q12; coordenadas autorizadas Q11.                                                       |
| listProductReviews, listProducerReviews                                 | P         | P         | P        | P             | Apenas publicadas/não ocultas; sem dados privados do autor/denunciante. Q10/Q12.                                            |
| getOwnProducer, getOwnApplication                                       | —         | —         | S/C      | —             | Estado próprio; Q04 define capacidades pendentes/rejeitadas. Sem identidade privada do administrador decisor.               |
| listOwnProducts, replaceOwnProfile                                      | —         | —         | S/C      | —             | Propriedade do token; publicação/aprovação e campos permitidos Q04/Q11/Q12.                                                 |
| createProduct, replaceProduct, deleteProduct                            | —         | —         | S/C      | —             | Produtor elegível e proprietário; zero atribuição de proprietário/aprovação pelo body; remoção Q12/reservas Q07.            |
| createOrders                                                            | —         | A/C       | —        | —             | Comprador da sessão; produtos elegíveis, stock e totais do servidor. Q02–Q06.                                               |
| listOwnOrders, getOwnOrder                                              | —         | S         | S        | —             | Comprador participante ou produtor responsável; privacidade de morada por necessidade. Admin usa rota própria.              |
| changeOrderState                                                        | —         | —         | S/C      | —             | Só produtor responsável, enum/transição acordados Q05 e aprovação Q04.                                                      |
| listOwnReviews, createReview                                            | —         | S/C       | —        | —             | Entrega persistida do comprador; alvo pertence à encomenda; Q10 define escala/cardinalidade.                                |
| reportReview                                                            | —         | C         | C        | C             | Denúncia autenticada é recomendação Q10; papéis/limites finais pendentes. Não oculta automaticamente.                       |
| listAuctions                                                            | P/C       | P/C       | P/C      | P/C           | Resumo público para destaque; sem sala, presença, identidade privada ou comando de licitar. Q09.                            |
| getAuction, listAuctionBids                                             | —/C       | A/C       | A/C      | A/C           | Observação autenticada inicialmente proposta; anonimato e projeção dependem de Q09.                                         |
| listOwnAuctions, createAuction                                          | —         | —         | S/C      | —             | Propriedade/aprovação; lote/reserva/prazo Q07/Q08; sem direitos de licitar.                                                 |
| listOwnBids                                                             | —         | S         | —        | —             | Participações da identidade autenticada; não recebe IDs privados de outros compradores.                                     |
| licitar (Socket.IO futuro, não REST)                                    | —         | C         | —        | —             | Papel comprador, estado/prazo/mínimo atómicos; Q01/Q07–Q09/Q13 e D06.                                                       |
| getProducerIndicators                                                   | —         | —         | S/C      | —             | Agregações próprias por período/fórmula Q15; sem dados de outros produtores.                                                |
| listAdminUsers, getAdminUser                                            | —         | —         | —        | A             | Consulta mínima de utilizadores; não concede edição de papéis, suspensão ou eliminação.                                     |
| listAdminProducers, listApplications, getApplication, decideApplication | —         | —         | —        | A/C           | Decisão apenas sobre candidatura elegível pendente; autoria/data atribuídas pelo servidor, conflito em simultaneidade. Q04. |
| listAdminOrders, getAdminOrder                                          | —         | —         | —        | A             | Consulta global minimizada, sem poder de alterar estado/encomenda.                                                          |
| listModerationCases, getModerationCase, decideModeration                | —         | —         | —        | A/C           | Manter/ocultar e preservar evidência; não editar classificação/texto pelo autor. Outros conteúdos Q12.                      |
| listAdminAuctions, getAdminIndicators                                   | —         | —         | —        | A/C           | Leitura global; não criar bids, adjudicar ou alterar lotes em nome de outros.                                               |
| getServiceObservations                                                  | —         | —         | —        | A/C           | Sem URI privada/tokens/detalhes de rede; observação real Q16, desconhecido sem sonda.                                       |

## Bloqueio aprovado de operações privadas e condições de ativação

C04 foi aprovada: autenticação/autorização reais permanecem na semana 4; até estarem implementadas, nenhuma leitura ou escrita privada pode ser disponibilizada pela API. A matriz descreve o destino futuro, não permissões ativas. A seleção de papel no frontend demonstrativo não autentica nem autoriza.

1. Aprovar Q01, Q04 e Q13; a sequência C04 já está fixada na semana 4; definir quem aprovisiona o administrador inicial sem credenciais fixas no Git.
2. Implementar JWT assinado/expirado, verificação de conta atual, papel, propriedade e aprovação no servidor; não confiar na escolha de papel ou nos IDs DEMO do browser.
3. Validar body/query/path com lista explícita de campos e tipos, IDs e enums; rejeitar operadores MongoDB livres e atribuição de hash, papel administrador, proprietário, aprovação, totais, autor/data ou resultado do leilão.
4. Aprovar limites técnicos (texto/body/paginação/login/upload), política de password, detalhes remanescentes de C02 e normalização C03; aplicar os princípios de erro já aprovados. Os números provisórios dos formulários não são política real.
5. Executar testes negativos: ausente/inválido/expirado 401; papel insuficiente 403; recurso alheio 403/404 conforme C02; produtor não aprovado; campos injetados; informação privada/stack em respostas e logs.
6. Guardar segredos apenas no backend, fora do Git; exemplos sem credenciais; VITE_* nunca recebe URI MongoDB/segredo JWT/credenciais Blob. Configurar origens explícitas quando houver integração.

Até cumprir estas condições, rotas privadas ficam negadas/desativadas; não criar endpoint de identidade fictícia, cabeçalho de papel confiável ou bypass de autenticação acessível pela rede. Testes de serviço podem injetar contexto apenas dentro do harness interno. C04 aprovada mantém a segurança real na semana 4. Nesta fundação, testar serviços técnicos internamente não autoriza acesso HTTP privado. Não se implementa autenticação nesta fase.

## Projeções e privacidade

Mercado: perfil/localização autorizados, produto e avaliação pública. Nunca email privado, hash, morada de comprador, denúncias ou identidade privada de licitante. O próprio recebe os seus dados necessários; produtor recebe apenas dados de encomenda indispensáveis ao cumprimento; administração consulta projeção reduzida e não ganha poderes de escrita por ter leitura global.

ApplicationSelf/ProducerSelf retiram autorId administrativo; Application/ProducerManaged são administrativos. Order é privado: morada apenas quando necessária, e omitida da projeção administrativa se não houver necessidade aprovada. Review público não inclui ligação privada à encomenda; essa referência pode existir internamente/na própria atividade, por contrato posterior explícito. Decisões e evidência persistem no servidor, sem necessitar exposição integral ao browser.

Ocultar avaliação deve atualizar consultas/agregados públicos depois de persistir, mantendo texto/classificação/evidências. Esse comportamento futuro é diferente da simulação isolada aprovada, que continua intacta até integração autorizada. Uma lista inacessível não deve aparecer como vazia para mascarar 401/403.

## Erros e concorrência

400/401/403/404 são académicos. C02 aprova erros estruturados e seguros, códigos estáveis, mensagens claras, campos inválidos e HTTP incluindo 400/401/403/404/409/500. requestId, regra 403 versus 404 de recurso alheio, mecanismo concreto de edição obsoleta e códigos adicionais como 503 continuam por confirmar; erro 503 não garante rollback de um commit incerto. Não devolver detalhes do driver, connection strings ou claims sensíveis. IDs de pedido são de diagnóstico, não de autorização.

Aprovação e moderação devem ser avaliadas contra estado persistido atual. A política de repetição/reabertura é Q04/Q10/Q12; não transportar cegamente a regra de sessão demo para produção. PUT/PATCH nunca contornam ownership. ProductReplace prevê versaoEsperada (C02); definir a política para aceitar/recusar edição obsoleta e testar concorrência entre PUT de stock e checkout, sem permitir que o formulário reponha stock já debitado. Preços/stock/transições são validados na mesma unidade de consistência aprovada; autenticação não substitui transações.

O logout local não revoga automaticamente JWT emitidos; duração e eventual revogação precisam de Q13. HTTPS é exigido em produção; serviços de desenvolvimento não são declarados publicação Cloud. Rate limiting, CORS/origens e validação de upload requerem configuração futura aprovada, sem instalação de middleware nesta subfase.

Na fundação 3.1, apenas GET /api/health está registado; todas as operações privadas da matriz permanecem ausentes. Testes verificam que papel/ID DEMO e Bearer fictício não ativam essas operações. O middleware devolve 413 ao exceder o limite técnico JSON de 100 KiB; não é limite comercial ou decisão de upload.
