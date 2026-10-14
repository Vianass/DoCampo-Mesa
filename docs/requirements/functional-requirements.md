# Requisitos funcionais — Do Campo à Mesa

## Âmbito e fontes

Fase 0: análise, arquitetura e planeamento. Versão inicial de 15 de outubro de 2026. Não constitui autorização para iniciar a Fase 1.

**E** identifica o enunciado «Do Campo à Mesa — Trabalho prático individual · 7 semanas · 2026/2027», IPVC–ESTG, 27 páginas, ficheiro `Do_Campo_a_Mesa_Enunciado.pdf`. As referências usam a página física do PDF e o respetivo título. SHA-256: `ff42084c30a5a663ce4165ae301c5255dd313f710e51af446fd5dbffe3925243`. O original foi disponibilizado em `/Users/viana10/Downloads/Do_Campo_a_Mesa_Enunciado.pdf`; esse caminho não é necessário para interpretar as referências.

**F0** identifica o pedido «PROJECT: DO CAMPO À MESA — PHASE 0», secções 1–10. É a origem das tecnologias previamente escolhidas e dos nove documentos solicitados. Não substitui E como fonte de requisitos académicos.

| Classificação | Significado |
| --- | --- |
| O — obrigatório | Exigência explícita de E; referência apresentada em cada linha. |
| V — valorização opcional | Componentes expressamente opcionais de E, p. 24. |
| P — melhoria proposta | Recomendação de engenharia; não é requisito obrigatório do enunciado. |
| D — decisão arquitetural | Escolha de F0 ou solução técnica proposta para cumprir O; registada em `decisions.md`. |

Todos os requisitos O são necessários para concluir o projeto. A prioridade **P1** indica implementação antecipada por dependências; **P2** indica implementação posterior, sem reduzir a obrigatoriedade. **P3** é reservada a melhorias e valorização. Os critérios concretizam a verificação; regras de negócio não definidas em E mantêm-se condicionadas às questões Q de [decisions.md](../architecture/decisions.md).

Os textos e listas das páginas 9–12 complementam o âmbito funcional. Pormenores presentes apenas nas imagens dos protótipos — seguidores, distância à localização do visitante, rascunhos, pagamentos e números de instâncias — não são promovidos a obrigações.

## Catálogo e produtores públicos

| ID / classe | Descrição | Papel | Prioridade | Critérios de aceitação | Referência E |
| --- | --- | --- | --- | --- | --- |
| RF-CAT-01 / O | Explorar e pesquisar produtos por nome, ingrediente ou produtor. | Visitante; utilizador autenticado | P1 | Catálogo público; uma pesquisa com correspondências mostra os produtos pertinentes; ausência de resultados é explícita. A semântica de ingrediente depende de Q14. | p. 4, «Visitante»; p. 9, «Visitante» |
| RF-CAT-02 / O | Combinar filtros por categoria, produtor, localidade, época e modo de produção, incluindo biológico. | Visitante; utilizador autenticado | P1 | Cada filtro restringe os resultados; filtros combinados respeitam todos os critérios; limpar filtros recupera o catálogo. Taxonomias: Q14. | p. 4; p. 9 |
| RF-CAT-03 / O | Apresentar perfil público do produtor com mapa, produtos e avaliações. | Visitante; utilizador autenticado | P1 | Perfil associa produtos e avaliações ao produtor correto e apresenta localização no mapa; não expõe email privado, hash ou moradas de compradores. Publicação: Q04; mapa: Q11. | p. 4; p. 9 |
| RF-CAT-04 / O | Destacar leilões em direto na página inicial. | Visitante; utilizador autenticado | P2 | Existindo um leilão ativo, a página permite aceder ao seu detalhe; sem leilões ativos não apresenta um leilão terminado como ativo. Observação anónima: Q09. | p. 9 |

## Identidade e aprovação

| ID / classe | Descrição | Papel | Prioridade | Critérios de aceitação | Referência E |
| --- | --- | --- | --- | --- | --- |
| RF-AUT-01 / O | Registar comprador ou produtor. | Visitante | P1 | Ambas as opções estão disponíveis; dados inválidos são rejeitados; não existe autorregisto como administrador. Cardinalidade dos papéis: Q01. | p. 4; p. 20, «Passo 6» |
| RF-AUT-02 / O | Autenticar por credenciais e emitir JWT com expiração. | Comprador, produtor, administrador | P1 | Credenciais válidas obtêm token; inválidas não obtêm sessão; API exige `Authorization: Bearer`; token expirado produz 401. Duração e armazenamento: D04/Q13. | p. 20 |
| RF-AUT-03 / O | Autorizar operações por papel. | Todos | P1 | Falta de autenticação produz 401; papel insuficiente produz 403; rotas privadas não são acessíveis apenas por manipulação da interface. Propriedade do recurso é concretizada em RNF-SEG-04. | p. 5, «Segurança»; p. 20 |
| RF-AUT-04 / O | Aprovar ou rejeitar novos produtores. | Administrador | P1 | Administrador consulta candidaturas e regista decisão; utilizador sem esse papel não pode decidir; capacidades antes da aprovação e nova candidatura aguardam Q04. | p. 4, «Administrador»; p. 12 |

## Gestão do produtor

| ID / classe | Descrição | Papel | Prioridade | Critérios de aceitação | Referência E |
| --- | --- | --- | --- | --- | --- |
| RF-PRO-01 / O | Criar, consultar, alterar e remover produtos, preços, stock e fotografias. | Produtor | P1 | CRUD disponível; preço e stock inválidos rejeitados; fotografia fica no armazenamento Cloud; alterações não modificam snapshots de encomendas anteriores. Política de remoção: Q12; aprovação: Q04. | p. 4; p. 17, «Passo 3»; p. 23, «Passo 8» |
| RF-PRO-02 / O | Gerir a página pública do produtor. | Produtor | P2 | Alterações aos dados públicos refletem-se no perfil; campos privados não são publicados; localização é representável no mapa. | p. 4; p. 9 |
| RF-PRO-03 / O | Consultar estatísticas de vendas, encomendas e avaliações. | Produtor | P2 | Painel apresenta agregados dos seus dados; dados de outro produtor não são incluídos; fórmula de vendas é documentada após Q15. | p. 4, «Produtor»; p. 11 |
| RF-PRO-04 / O | Apresentar alertas de stock baixo. | Produtor | P2 | Produtos que satisfazem o limiar acordado são assinalados no painel; o limiar aguarda Q15. | p. 11 |

## Carrinho e encomendas

| ID / classe | Descrição | Papel | Prioridade | Critérios de aceitação | Referência E |
| --- | --- | --- | --- | --- | --- |
| RF-ENC-01 / O | Gerir carrinho com estado global na SPA. | Comprador | P1 | Adicionar, alterar quantidade e remover produtos atualiza linhas e total ao navegar; identidade e regras de quantidade: Q01/Q03. Persistir entre dispositivos é P, não O. | p. 4; p. 16, «Passo 2» |
| RF-ENC-02 / O | Criar encomenda com levantamento ou entrega. | Comprador | P1 | Carrinho válido cria encomenda pendente; modalidade é guardada; linhas incluem nome e preço do momento da compra; totais são calculados pelo servidor. Carrinho com vários produtores: Q02; condições de entrega: Q06. | p. 4; p. 17; p. 18, «Passo 4» |
| RF-ENC-03 / O | Acompanhar estados pendente, confirmada, pronta e entregue. | Comprador | P1 | Lista e detalhe apresentam o estado persistido das próprias encomendas; os quatro estados são reconhecidos. Transições permitidas: Q05. | p. 4; p. 10; p. 18 |
| RF-ENC-04 / O | Atualizar o estado das encomendas. | Produtor | P1 | Produtor atua apenas sobre encomendas suas; valor fora do enum é rejeitado; comprador não atualiza estado pela operação reservada ao produtor. | p. 4; p. 11; p. 22, «Passo 7» |
| RF-ENC-05 / O | Notificar alterações de estado em tempo real. | Comprador e produtor | P2 | Comprador ligado recebe alteração sem recarregar a página; painel do produtor mantém o mesmo estado, incluindo noutro separador autenticado; utilizadores alheios não recebem o evento. | p. 2, «Notificações»; p. 4; p. 10; p. 22 |

## Avaliações e moderação

| ID / classe | Descrição | Papel | Prioridade | Critérios de aceitação | Referência E |
| --- | --- | --- | --- | --- | --- |
| RF-AVA-01 / O | Avaliar produtos e produtores após entrega. | Comprador | P2 | Ambos os alvos podem ser avaliados; avaliação antes de entrega é recusada; perfil e catálogo apresentam avaliações publicadas. Escala, edição e cardinalidade: Q10. | p. 4; p. 10 |
| RF-AVA-02 / O | Denunciar e moderar avaliações; moderar conteúdos. | Utilizador autenticado para denúncia, administrador para moderação | P2 | Denúncia chega à área de moderação; administrador decide manter ou ocultar; avaliações ocultadas deixam de surgir publicamente. Papel do denunciante e demais conteúdos: Q10/Q12. | p. 4; p. 12 |

## Leilões e tempo real

| ID / classe | Descrição | Papel | Prioridade | Critérios de aceitação | Referência E |
| --- | --- | --- | --- | --- | --- |
| RF-LEI-01 / O | Criar leilão com lote, preço base, incremento e duração e acompanhá-lo. | Produtor | P2 | Valores inválidos são rejeitados; datas e estado ficam persistidos; produtor acompanha o seu leilão. Estados agendado, ativo e terminado; reserva do lote: Q07. | p. 4; p. 11; p. 18 |
| RF-LEI-02 / O | Entrar em sala por leilão e ver participantes. | Comprador; produtor para acompanhamento | P2 | Estado inicial é enviado; salas são isoladas por leilão; entradas e saídas atualizam a presença, incluindo `disconnecting`. Métrica de presença: Q09. | p. 10; p. 21, «Passo 7» |
| RF-LEI-03 / O | Licitar com validação atómica no servidor. | Comprador | P2 | Leilão ativo e não expirado aceita valor ≥ atual + incremento; duas ofertas iguais de 317 € concorrentes aceitam apenas uma quando ambas eram inicialmente válidas; a outra recebe recusa. Valor inicial = preço base. | p. 7, «Consistência do leilão»; p. 21 |
| RF-LEI-04 / O | Mostrar atalhos de +5, +10 e +25 €, valor mínimo e recusa. | Comprador | P2 | Atalhos alteram a proposta com base no valor mostrado; não contornam o incremento mínimo do servidor; recusa é visível e estado é atualizado. | p. 10; p. 22 |
| RF-LEI-05 / O | Publicar histórico e novo estado após licitação aceite. | Participantes autorizados | P2 | Histórico reflete as ofertas aceites e atualiza-se sem recarregar; todos os clientes ligados convergem para o mesmo valor; cada oferta aceite existe em `bids`. | p. 7; p. 10; p. 18; p. 21 |
| RF-LEI-06 / O | Sincronizar a contagem decrescente a partir de `terminaEm`. | Participantes autorizados | P2 | Servidor envia a data de fim; cliente calcula tempo restante; alterar o relógio local não permite licitar fora do prazo. Semântica temporal: Q08. | p. 5, «Sockets»; p. 10; p. 21 |
| RF-LEI-07 / O | Gerir ligação no ciclo de vida da página. | Utilizador autenticado | P2 | Hook reutilizável `useLeilao(id, token)`; abandonar a página liberta a ligação correspondente; não duplica listeners; notificações pessoais mantêm o seu ciclo de vida. | p. 22 |

## Administração, API e Cloud

| ID / classe | Descrição | Papel | Prioridade | Critérios de aceitação | Referência E |
| --- | --- | --- | --- | --- | --- |
| RF-ADM-01 / O | Disponibilizar painel global de utilizadores, encomendas e leilões ativos em tempo real. | Administrador | P2 | Painel consulta os três conjuntos; leilões ativos são atualizados; acesso limitado ao administrador. | p. 4; p. 12 |
| RF-ADM-02 / O | Apresentar estado dos serviços Cloud. | Administrador | P2 | Painel distingue estado conhecido, indisponibilidade e ausência de observação da API, Socket.IO, Atlas, Blob e Swagger UI. Profundidade das verificações: Q16. | p. 12 |
| RF-API-01 / O | API REST para produtos, produtores, encomendas, avaliações e leilões. | Conforme recurso | P1 | `GET /api/products` → 200; `POST` → 201 com `Location`; `PUT /api/products/:id` → 200; `DELETE` → 204; `POST /api/orders` e `PATCH /api/orders/:id/estado`; erros 400/401/403/404 documentados e demonstráveis. | p. 5; p. 17 |
| RF-API-02 / O | Documentar integralmente a API em OpenAPI 3 e Swagger UI. | Docente; consumidores da API | P1 | Endpoints, parâmetros, corpos, respostas e schemas em `components`; segurança `bearerAuth`; Swagger UI acessível em `/api-docs`. Esboço no M1, completude no M2. | p. 19, «Passo 5»; p. 14 |
| RF-CLO-01 / O | Publicar SPA e API em PaaS, dados em Atlas gratuito e imagens em storage Cloud. | Operador do projeto | P2 | URLs HTTPS funcionam fora da máquina de desenvolvimento; sockets funcionam no alojamento; imagens carregam de Blob; relatório justifica o modelo de serviço; URLs permanecem ativas até à defesa. | p. 23; p. 25; p. 27 |

## Valorização opcional e melhorias

| ID / classe | Descrição | Papel | Prioridade | Critérios de aceitação | Origem |
| --- | --- | --- | --- | --- | --- |
| RF-VAL-01 / V | Backoffice Laravel MVC. | Administrador | P3 | Só após todos os O funcionais; MVC/Blade/Eloquent e integração com a mesma API ou base de dados; recomendação: API para conservar autorização centralizada. | E p. 24; F0 §7 |
| RF-VAL-02 / V | Elasticidade e análise CapEx/OpEx. | Operador | P3 | Só após todos os O funcionais; carga de leilão simulada, escala e custos analisados; broadcasts entre instâncias verificados. | E p. 24; F0 §7 |
| RF-MEL-01 / P | Recuperar estado após reconexão. | Utilizador autenticado | P2 | Reentrada repõe estado e histórico persistidos; eventos repetidos ou antigos não regredem a interface. | Proposta D07; suporte a RF-LEI-05/RF-ENC-05 |
| RF-MEL-02 / P | Idempotência de licitações e checkout. | Comprador | P2 | Repetir a mesma chave e payload não duplica ofertas, encomendas nem débito de stock; payload diferente com a mesma chave é recusado. | Proposta D06/D08 |
| RF-MEL-03 / P | Persistir notificações e permitir consulta posterior. | Comprador e produtor | P3 | Mudança de estado e notificações são gravadas juntas; consulta apresenta mudanças ocorridas enquanto desligado. | Proposta D09 |

Pagamento eletrónico, faturação fiscal, chat, seguidores, geolocalização do comprador, recuperação de password e login social não são obrigações identificadas em E. A necessidade de pagamento ou conversão do resultado do leilão em encomenda deve ser resolvida em Q06/Q07 antes de expandir o âmbito.

## Rastreabilidade transversal

Os requisitos de interface, persistência, segurança e entregáveis académicos estão em [non-functional-requirements.md](non-functional-requirements.md). Os cenários estão em [use-cases.md](use-cases.md); soluções técnicas em [system-overview.md](../architecture/system-overview.md), [data-model.md](../database/data-model.md) e [auction-consistency.md](../architecture/auction-consistency.md). O calendário e os marcos estão em [implementation-plan.md](../planning/implementation-plan.md).
