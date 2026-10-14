# Plano de implementação — sete semanas

## Âmbito, marcos e dependências

Segue o calendário explícito E p. 14: semana 1 Passo 1; semana 2 Passo 2 e M1; semana 3 Passos 3–4; semana 4 Passos 5–6 e M2; semana 5 Passo 7; semana 6 Passo 8; semana 7 testes/relatório/vídeo e M3. Fontes/IDs em [requisitos](../requirements/functional-requirements.md) e [não funcionais](../requirements/non-functional-requirements.md). Não há datas de início, submissão ou defesa fornecidas: não são inventadas. Os oito passos distribuem-se por sete semanas.

**Fase 0 atual:** documentação e revisão do âmbito, sem apps, dependências, lógica, Cloud ou ligações à base de dados. **Fase 1 e trabalho seguinte:** só começam após aprovação explícita do utilizador (F0 §9/10). O plano recomenda registar respostas Q antes do trabalho dependente, não as assumir tacitamente.

Dependência geral: protótipos/contrato → SPA → API/modelo → autenticação/integração → tempo real → Cloud → aceitação final. Segurança influencia desenho desde o início, embora a implementação formal do Passo 6 esteja na semana 4. Dados simulados permitem cumprir M1 antes de backend. Testes e relatório evoluem durante o projeto, não começam apenas na última semana.

## Semana 1 — Fase 1, frontend responsivo

**Dependências:** aprovação explícita; revisão de Q02/Q03/Q14 para carrinho, unidades e filtros; Q11 para representar mapa; respostas pendentes podem ser mostradas como hipóteses identificadas nos protótipos, sem lógica definitiva.

**Tarefas:** criar estrutura inicial de monorepo/frontend apenas após aprovação; construir protótipos de alta fidelidade de cada interveniente em telemóvel e desktop; implementar HTML5 semântico, Bootstrap 5 e SCSS com variáveis, mixins e parciais; estilos base para telemóvel e media queries de 768/1024/1280 px; preparar catálogo, perfil com mapa, carrinho/encomendas, leilão, produtor e administrador, incluindo registo/login.

**Entregáveis:** protótipos e interface responsiva estática navegável; convenções visuais e de componentes; início do README; registo de decisões e evidências para relatório. Git partilhado com o docente pelo estudante; commits regulares e tag proposta `w1-responsive`.

**Aceitação:** todos os intervenientes têm representações desktop/telemóvel; quatro patamares de layout incluindo base; grelha, cartões, formulários/navegação Bootstrap e elementos semânticos comprovados; percursos sem corte de conteúdo. Cobertura: RF-CAT, RF-PRO, RF-ADM, RF-ENC e RF-LEI ao nível visual; RNF-RES-01/02.

**Verificação:** inspeção nos limites dos breakpoints e uso por teclado; Playwright para smoke visual/navegação se estrutura já o permitir, sem testes que apenas repitam estilos. Não exigir integrações reais neste marco.

## Semana 2 — SPA e M1

**Dependências:** layouts semana 1; dados de domínio simulados coerentes; vocabulário e rotas previstos; respostas Q que afetem interface.

**Tarefas:** React Router e páginas; componentes reutilizáveis `CartaoProduto`, `Carrinho` e `PainelLeilao`; Context de carrinho e sessão; filtros/formulários ligados ao estado; dados JSON simulados e estados de carregamento/erro/vazio; percursos por papel simulados claramente identificados; esboço OpenAPI com recursos, schemas e segurança prevista. Não confundir guarda visual simulada com segurança implementada.

**Entregáveis:** SPA responsiva navegável com dados simulados; esboço OpenAPI; documentação atualizada. Git: tag proposta `m1-spa` no fim da semana 2.

**Aceitação M1 de E p. 14:** frontend responsivo + SPA navegável + dados simulados + esboço API. Carrinho/sessão mantêm estado durante navegação; filtros produzem resultados coerentes; cada papel encontra o respetivo percurso. RF-CAT, RF-ENC-01, RF-LEI-04 ao nível de UI; RNF-MAN-01; ENT-02.

**Verificação:** Vitest para cálculo/aplicação de estado do carrinho quando tiver regras acordadas; Playwright para navegação, filtros, carrinho e ecrãs por papel em telemóvel/desktop. Sem fingir persistência ou eventos reais.

## Semana 3 — API REST e MongoDB

**Dependências:** esboço OpenAPI M1; fechar Q01–Q06, Q10/Q12/Q14 para schemas/API; preparar ensaio transacional para D06/D08 sem desenvolver ainda a sala em tempo real. Selecionar versões suportadas e configuração de teste replica set/Atlas na fase autorizada.

**Tarefas:** gerar backend modular; schemas Mongoose, referências/embedding e índices; coleções obrigatórias e adicionais adotadas; endpoints de produtos, produtores, orders, reviews, auctions; filtros e consultas com operadores MongoDB; códigos HTTP e `Location` exigidos; snapshots e débito condicionado de stock; consulta por proprietário e contratos de autorização; interfaces de aprovação/moderação e estatísticas. Conectar Atlas gratuito só nesta fase autorizada. Não expor endpoints de escrita publicamente antes de autenticação/RBAC estar concluído.

**Entregáveis:** API e persistência funcionais em ambiente de desenvolvimento; modelo/contrato revistos; dados de demonstração fictícios; esqueleto de integração SPA; tag proposta `w3-api-data`.

**Aceitação:** CRUD e contratos E p. 17; cinco coleções E p. 18; linhas embebidas com snapshots; pesquisa demonstrável; checkout não produz stock negativo nem débitos parciais conforme proposta adotada; documentação explica índices e embedding. RF-API-01, RF-PRO-01/02, RF-ENC-02–04, RF-AVA e estrutura RF-LEI-01; RNF-CON-02/04.

**Verificação:** Supertest para status/validação e payloads; integração transacional para checkout concorrente, rollback e snapshots; esquema/serviço para elegibilidade de reviews. Testes que requerem autenticação final completam-se na semana 4. O plano não depende de mocks para provar atomicidade.

## Semana 4 — OpenAPI, segurança, integração e M2

**Dependências:** API/modelo semana 3; Q04/Q13 para aprovação/sessão; Q15 para indicadores; mecanismo controlado de administrador inicial.

**Tarefas:** bcrypt/JWT/expiração e middleware por papel, propriedade e aprovação; registo comprador/produtor, aprovação/rejeição, login/logout; completar OpenAPI 3 e `/api-docs`; integrar dados reais na SPA; fechar encomendas, avaliações/moderação, perfis e painéis; aplicar validação, limites, configuração de ambiente e logs seguros propostos; executar ensaio CAS+bid transacional que prepara semana 5. Imagens podem usar adaptador de desenvolvimento claramente temporário até Blob real na semana 6, sem alegar cumprimento Cloud antecipado.

**Entregáveis:** SPA integrada; API integralmente documentada e autenticada com MongoDB; evidências de acesso por papel; tag proposta `m2-api-auth`.

**Aceitação M2:** API + documentação + MongoDB + autenticação + integração SPA (E p. 14). Swagger descreve todos os endpoints e bearerAuth; 401/403/404 verificados; produtor alheio não altera dados; aprovação tem fluxo funcional; decisões Q atualizadas; não guardar segredos no Git. RF-AUT-01–04, RF-API-02, RF-PRO, RF-ENC, RF-AVA, RF-ADM-01 ao nível REST; RNF-SEG; ENT-03.

**Verificação:** Supertest negativo por papel/proprietário/conta e token expirado; Playwright registo/login, aprovação, compra, evolução de estado e avaliação após entrega; teste do par auction/bid com falha de inserção. Rever correspondência OpenAPI/API e impedir exposição de hash ou moradas alheias.

## Semana 5 — Leilões e notificações em tempo real

**Dependências:** M2; decidir Q07/Q08/Q09 antes de implementar reserva/resultado/prazo/presença; transações ensaiadas; permissões Socket.IO coerentes com REST.

**Tarefas:** rooms de leilão e pessoais; JWT/expiração em ligações; hook de leilão e cleanup; snapshot, histórico, presença e relógio; CAS+bid transacional e idempotência se P adotado; mensagens de recusa; ativação/encerramento e recuperação ao restart; notifications de estado para comprador/produtor; painel global de leilões ativo; reconexão e ressincronização versionada propostas. Resultado/reserva/conversão só conforme Q07 aprovado.

**Entregáveis:** aplicação funcional em desenvolvimento com todos os percursos de tempo real; relatório de ensaios concorrentes e diagramas atualizados; tag proposta `w5-realtime`.

**Aceitação:** duas ofertas iguais → uma aceite e um bid; histórico consistente após falha/retry; ofertas vencidas recusadas; todos os clientes convergem; contagem baseada em fim do servidor; presença atualiza na saída; encomendas mudam sem refresh; reinício recupera leilões. RF-LEI-01–07, RF-ENC-05, RF-ADM-01; RNF-CON-01/03, RNF-FIA-01. RF-MEL-01/02/03 apenas segundo propostas adotadas, sem comprometer O.

**Verificação:** Vitest para regras de incremento/ciclo temporal; integração real MongoDB para simultaneidade, write conflict, rollback e idempotência; clientes Socket.IO em ensaio de integração para rooms/auth/presença; Playwright com dois contextos independentes para ofertas concorrentes, recusa, notificações e reconexão. Incluir valores diferentes, bid/encerramento concorrentes e commit/ack perdido.

## Semana 6 — Cloud

**Dependências:** funcionalidades semana 5; Q11/Q16; conta/créditos e serviços verificados pelo estudante; escolha real de runtime/SKU/region compatíveis; confirmação de que URLs podem manter-se até à defesa.

**Tarefas:** publicar SPA em Static Web Apps, API/sockets em App Service, Atlas gratuito, imagens em Blob; variáveis de ambiente/HTTPS/origens explícitas; ensaiar WebSocket direto, fallback de SPA/routing e upload seguro; implementar estado de serviços no painel; acompanhar consumo de créditos; documentar modelo PaaS/DBaaS/storage e limites; ensaiar restart, dados persistidos e exportação de recuperação se P adotado.

**Entregáveis:** URLs públicas da aplicação e Swagger; storage real com imagens; instruções de configuração sem segredos; evidências de serviços/modelo Cloud e orçamento; tag proposta `w6-cloud`.

**Aceitação:** visita exterior ao ambiente de desenvolvimento; compra/avaliação/leilão/notificação funcionam publicados; imagens vêm do Blob; HTTPS e WebSockets comprovados; painel distingue estado operacional/degradado/desconhecido; limites e créditos não pressupõem SLA ou gratuitidade de B1. RF-CLO-01, RF-ADM-02; RNF-CLO-01/02, RNF-SEG-03; E p. 23/25/27.

**Verificação:** Playwright smoke na publicação, com dados fictícios; dois browsers/contextos públicos para licitação e estado; verificação de acesso a imagens e bloqueio de uploads não autorizados; ausência de segredos em assets; restart/ressincronização. Verificar quotas e condições atuais antes de provisionar, não copiar comandos de exemplo cegamente.

## Semana 7 — Aceitação final, relatório, vídeo e M3

**Dependências:** publicação semana 6; todas as questões que afetam funcionalidades resolvidas ou limitações explicitamente aceites sem omitir O; evidências de requisitos e marcos.

**Tarefas:** regressão de todos os RF/RNF O e propostas adotadas; corrigir falhas de maior impacto; garantir README com instalação/execução; verificar Git partilhado e commits; concluir relatório máximo 20 páginas com arquitetura, escolhas, dados, Cloud, consistência e dificuldades; declarar bibliotecas/IA; gravar vídeo máximo 5 minutos; preparar defesa individual de 15 minutos e capacidade de explicar código; confirmar URLs ativas até à defesa.

**Entregáveis:** código/README, URLs, relatório, vídeo; lista de aceitação com evidências e riscos residuais; tag proposta `m3-final` (release candidate antes da regressão se útil).

**Aceitação M3:** aplicação completa, tempo real e Cloud; entregáveis nos limites exigidos; nenhum requisito O pendente; não marcar completo apenas por atingir semana 7. RF restantes e RNF/ENT-01/04/05/06, E p. 14/25/27.

**Verificação:** execução integrada de percursos por papel, testes negativos, concorrência/expiração/restart, layout nos breakpoints e acessibilidade proposta; conferência dos limites de páginas/duração; ensaio de apresentação com histórico de decisões/commits.

## Valorização: entrada apenas após aceitação obrigatória

E p. 24: Laravel até +1; elasticidade/custos até +0,5; máximo final 20. F0 §7 obriga a agendar apenas depois de todas as funcionalidades obrigatórias completas e funcionais. Assim, **não reservar uma semana obrigatória nem iniciar em paralelo com requisitos em falta**.

Após aceitação global de O e entregáveis garantidos, e apenas se houver tempo/créditos antes da submissão, criar marco opcional separado `optional-laravel` e/ou `optional-elasticity`. Recomendar Laravel a consumir a mesma API para conservar regras; para elasticidade validar adapter, afinidade se polling, presença global, encerramento concorrente e custos CapEx/OpEx. Se não houver margem, omitir valorização e preservar M3. Não configurar nada nesta Fase 0.

## Matriz de cobertura e evidência

| Grupo | Implementação principal | Evidência prevista |
| --- | --- | --- |
| RF-CAT-01–04 | S1–S2 UI, S3–S4 dados, S5 destaque real | Pesquisa nome/ingrediente/produtor, cinco filtros, perfil/mapa/avaliações e destaque ativo; E p. 4/9. |
| RF-AUT-01–04 | S4 | Registo dos dois papéis, JWT expira, 401/403, aprovação/rejeição e negativas por propriedade. |
| RF-PRO-01–04 | S1–S4, fotos Cloud S6 | CRUD, perfil, snapshots preservados, indicadores com fórmula, alerta com limiar validado. |
| RF-ENC-01–05 | S2 carrinho, S3–S4 API, S5 notificações | Modalidades, snapshots, quatro estados/transições acordadas, duas sessões notificadas, último stock concorrente. |
| RF-AVA-01/02 | S3–S4 | Avaliação produto/produtor após entrega; denúncia, manutenção/ocultação e agregados. |
| RF-LEI-01–07 | S2 UI, S3 modelo, S5 real | Criação, sala, presença, mínimo, atalhos/recusa, histórico/tempo, cleanup; casos de consistência. |
| RF-ADM-01/02 | S4 dados, S5 tempo real, S6 saúde | Visão global autorizada, leilões ativos e estado observado de cinco componentes. |
| RF-API-01/02 | S2 esboço, S3–S4 completo | Métodos/status/Location, schemas/respostas/auth, Swagger `/api-docs`. |
| RF-CLO-01; RNF-CLO O | S6–S7 e até defesa | URLs públicas, imagens Blob, Atlas gratuito, HTTPS/socket, justificação Cloud e créditos. |
| RNF-RES O; RNF-MAN-01 | S1–S2, regressão S7 | Breakpoints 768/1024/1280, SASS/Bootstrap/semântica, estado/routing/reutilização. |
| RNF-SEG O; RNF-CON O | S3–S5, publicação S6 | Hash/JWT/segredos/HTTPS, coleções/validação/pesquisa e concorrência atómica. |
| ENT-01–06 | S1–S7 e defesa | Git/README, M1/M2/M3, relatório ≤20 páginas, vídeo ≤5 min, defesa 15 min e declaração IA. |
| Melhorias P adotadas | Junto ao módulo respetivo | Idempotência, reconexão, persistência de notificações, stock, upload, acessibilidade/desempenho com objetivos identificados como propostos. |
| RF-VAL-01/02 | Apenas após aceitação global O | Marco opcional separado; não condição de M3. |

## Estratégia de testes e gestão Git

Vitest cobre regras onde falhas têm consequência comercial: mínimo/incremento, estados, quantidades/totais e aplicação de versões. Supertest cobre REST, validação e matriz de autorização. Integração com MongoDB transacional prova invariantes de stock e auction/bid; mocks não substituem ensaios concorrentes. Playwright cobre utilizadores independentes, Mobile First e fluxos reais. Objetivos P de latência são medidos com ambiente/dados/carga declarados; sem exigir volume de testes ou cobertura percentual que E não definiu.

Para cada RF/RNF O manter referência de teste ou evidência manual com resultado, versão Git e ambiente. Falhas críticas de autorização, stock ou histórico impedem a aceitação. Reexecutar suites afetadas por alterações e regressão final; não duplicar verificações sem mudança relevante.

Tags e branches são convenção proposta, não exigência académica adicional. Commits pequenos, descritivos e regulares, ligados aos IDs quando útil; partilha com docente pelo estudante. Não criar commit, publicar repositório, enviar mensagens ou configurar recursos nesta fase documental.

## Próximo passo recomendado

Rever os nove documentos, acordar as primeiras respostas Q e obter aprovação explícita para iniciar a Fase 1. Começar pelos protótipos e frontend responsivo da semana 1; manter o plano atualizado com datas reais quando forem fornecidas. Nenhuma implementação deve avançar apenas porque esta documentação foi produzida.
