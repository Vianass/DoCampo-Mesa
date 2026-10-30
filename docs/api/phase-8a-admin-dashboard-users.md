# Fase 8A — dashboard administrativo real e gestão de utilizadores

Implementação local sobre `0fc1b17da1b2945cea153ff8de22cff6832537d4`, na branch `feat/api-foundation`. Não altera `main`, os nove documentos da Fase 0 ou as regras comerciais existentes. Sem staging, commit, push, PR ou início das Fases 8B/8C/9.

## Reutilização e arquitetura

Backend modular Express/Mongoose, `createAccessControl`, autenticação JWT atual, validação Zod, erros estruturados, revisões operacionais/CAS e transações MongoDB existentes. O módulo `apps/api/src/modules/admin/` contém validação, modelos internos, projeções, serviço e rotas. É ligado ao runtime existente, sem outro servidor, configuração de autenticação ou dependência nova.

Frontend: módulo `features/admin-users` dentro do mesmo `AuthProvider`, layout privado, navegação e cliente `useAuth().request`. Reutiliza Button, FormField, campos do produtor, StatusBadge, EmptyState, LoadingSkeleton, datas e estilos administrativos. O `ConfirmationDialog` extrai o comportamento já validado na Fase 7C e é partilhado pelas candidaturas e alterações de conta; não muda a aprovação de produtores. O provider de utilizadores conserva o motivo em memória durante revalidação da mesma sessão, cancela leituras substituídas e limpa dados ao sair/perder administração. Listagens e indicadores são consultas canceláveis vinculadas à sessão/URL.

## Endpoints reais

Todos exigem Bearer JWT e conta atualmente ativa com papel `administrador`; `Cache-Control: no-store`. Contrato em [OpenAPI](openapi.yaml).

| Método e rota                      | Finalidade                                               |
| ---------------------------------- | -------------------------------------------------------- |
| GET `/api/admin/dashboard`         | Indicadores reais num snapshot MongoDB                   |
| GET `/api/admin/users`             | Nome/email, estado, papéis e registo, paginados          |
| GET `/api/admin/users/:id`         | Projeção administrativa mínima, capacidades e ETag forte |
| GET `/api/admin/users/:id/audit`   | Histórico paginado de alterações de acesso               |
| PATCH `/api/admin/users/:id/state` | Alterar `ativo` com `motivo`, confirmação e `If-Match`   |

Os dois GET de utilizadores substituem as operações históricas **propostas e nunca implementadas** na Fase 3.0. Nenhum contrato previamente operacional foi alterado. Mantêm `listAdminUsers`/`getAdminUser`; listagem concretizada no envelope `itens`, `pagina`, `porPagina`, `total`, `totalPaginas` usado pelo projeto. Não existe PATCH genérico de utilizador, DELETE de conta ou alteração de papéis.

Listagem: `pesquisa` literal parcial de nome/email, NFC e trim, 1–100 caracteres; `estado=ativo|inativo`; `papel=comprador|produtor|administrador`; `pagina=1..1000`, `porPagina=12|24|36`, `ordem=recentes|antigas`. Omitem-se filtros vazios. Regex é escapada, sem operadores arbitrários; pesquisa sem tolerância especial a acentos. `$facet` mantém coerência de total/página e projeções permitidas. Consultas paginadas têm `maxTimeMS=2000`; IDs e campos são validados estritamente. Uma página fora do intervalo regressa à última válida no React, preservando filtros e sem mostrar contadores impossíveis. Auditoria tem paginação independente, sem arrays históricos ilimitados na resposta.

## Dashboard e definições

| Indicador               | Definição                                                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Utilizadores registados | Todas as contas, incluindo inativas                                                                                                      |
| Compradores ativos      | Conta ativa com capacidade comprador                                                                                                     |
| Produtores aprovados    | Perfil aprovado, conta ativa e papel produtor                                                                                            |
| Candidaturas pendentes  | Perfis pendentes, incluindo conta entretanto inativa; elegibilidade é decidida na análise                                                |
| Produtos publicados     | Publicados com produtor elegível, incluindo stock zero; não significa disponíveis para compra                                            |
| Encomendas registadas   | Todas as encomendas persistidas; não é receita, pagamento ou lucro                                                                       |
| Leilões ativos          | Estado ativo/agendado, início atingido e fim futuro segundo `$$NOW`; exclui cancelados/expirados mesmo antes da recuperação do agendador |

Papéis sobrepõem-se: compradores/produtores não são parcelas exclusivas do total. São sete contagens curtas sequenciais numa transação de leitura com snapshot, sem carregar documentos comerciais no React. O instante apresentado é de consulta; atualização é explícita, sem polling ou alegação de monitorização em tempo real. Vazio deriva de zeros confirmados; erro/indisponibilidade nunca é convertido em zero. A entrada de candidaturas reutiliza o total do dashboard, sem segunda consulta só para o mesmo indicador.

## Gestão de estado e auditoria

Corpo exclusivo `{"ativo":false,"motivo":"Justificação"}` ou `ativo=true`. Motivo obrigatório **em ambas as transições**, NFC/trim e 1–2000 caracteres Unicode. A interface confirma a identidade/alvo/efeito e motivo num diálogo nativo, inicialmente focado em continuar a análise. Nenhum estado é aplicado otimisticamente; só HTTP 200 com DTO/ETag válidos confirma o resultado.

`user_state_audit` guarda referência à conta/administrador, estado anterior/novo, data, motivo e revisão interna. Índice único `(utilizadorId,revisao)` impede repetição técnica; índice por conta/data suporta histórico. O serviço só acrescenta eventos, e o modelo impede operações comuns de edição/remoção. Não há endpoint para alterar a evidência. Não se afirma proteção contra um operador com acesso administrativo direto à base de dados.

A transação inclui uma escrita de serialização em `admin_state_guards` (único documento `account-state`), validação atual do administrador e fence na sua revisão operacional, leitura/CAS do alvo, alteração de estado e inserção da auditoria. Nenhuma mudança de papéis ou eliminação é efetuada. A guarda comum impede write skew na contagem de administradores; o fence participa na mesma revisão usada por checkout/leilões, para não ignorar alterações concorrentes de elegibilidade. O singleton é provisionado no arranque, sem criar contas administrativas ou credenciais.

Autodesativação é recusada. Desativar um administrador exige preservar outro ativo. Corridas de desativação mútua são serializadas: após a primeira decisão, o ator entretanto inativo deixa de estar autorizado. Reativar não aprova produtor, publica produtos ou restitui papéis removidos por outros procedimentos. `ativo` ausente no legado continua a significar ativo.

Dois índices adicionais de `users` suportam ordenação por registo e combinação de papel/estado/registo; o índice único de email mantém-se. Não se reescrevem dados legados ou modelos comerciais.

## Concorrência e recuperação

GET detalhe devolve ETag HMAC opaco, baseado na identidade, atividade, papéis e revisão operacional; reenviar intacto em `If-Match`. 428 sem versão, 400 versão malformada, 412 se mudou, 409 para estado já aplicado/autodesativação/proteção do último administrador. Revisões de outras operações sensíveis podem invalidar o ETag; é conservador e exige reler.

Transações usam snapshot/majority, limite de 10 s e até três tentativas do callback. Autor/data e papéis nunca vêm do cliente. Falha ao inserir auditoria reverte integralmente estado, revisão e fences. Resultado de commit incerto ou indisponibilidade devolve 503 estruturado: consultar antes de repetir. Repetir a versão antiga não duplica auditoria; não existe replay automático de PATCH no React. Erro bloqueia ações até consulta explícita, relê detalhe e invalida listagem/auditoria, sem sucesso falso.

## Segurança, privacidade e limites

JWT permanece em memória. Cada pedido revalida atividade/papéis no backend; um JWT emitido antes da desativação não permite operações enquanto a conta está inativa. As ligações Socket.IO conservam as guardas/revalidação periódica já existentes; não se promete desconexão síncrona de todos os sockets no mesmo instante do commit. Reativação permite novamente JWT ainda não expirado: **não foi introduzida revogação permanente de tokens**, reset de password ou refresh token.

Email/nome são apresentados apenas na administração protegida para identificar contas e pesquisar. Nenhum hash, token, segredo, revisão, estado interno de guarda ou documento populado integralmente é devolvido. Auditoria expõe apenas IDs necessários, estados, motivo e data, para administradores. Não há edição de segurança, papéis, propriedade, decisões de produtor ou permissões arbitrárias. O processo de promoção continua exclusivamente na Fase 7.

Rate limiting reutiliza o mecanismo HMAC em memória existente, com limites por instância de 240 pedidos/min por IP e 120/min por administrador, máximo de 10 000 entradas e 429/Retry-After. Não é um limitador distribuído; mantêm-se proxy/HTTPS/CORS existentes. Identidades e tokens não são escritos nos logs.

## Interface e acessibilidade

Rotas `/area/administrador`, `/area/administrador/utilizadores` e `/area/administrador/utilizadores/:id`; a candidatura real da Fase 7C permanece na sua rota. Indicadores claros, cartões adaptativos, pesquisa submetida explicitamente, filtros na URL, estados de carregamento/vazio/erro, ações de atualização e detalhe com capacidades e histórico. Secções futuras continuam identificadas como não integradas.

Mantêm-se tokens, tipografia, paleta e navegação. A ficha de identidade usa disposição em bloco apenas na nova área administrativa, reutilizando a correção existente do produtor para impedir fragmentação do título; a sua legibilidade é verificada nas seis larguras. Controlos com pelo menos 44 px, quebra de emails/IDs, confirmação com fundo inerte, Tab/Shift+Tab contidos, Escape e retorno à origem; motivos longos têm região focável de leitura. Envio em curso desativa botões e mantém foco no diálogo. Sucesso foca o título; erros focam um grupo distinto de um único `role=alert`. Voz/leitura audível com VoiceOver requer verificação manual própria; árvore AX não constitui certificação WCAG.

## Testes e verificação

- Backend: validação/projeções/ETag/modelo de auditoria; fronteira HTTP, papéis, rate limiting, campos arbitrários; MongoDB real com contagens, filtros, paginação, estado, auditoria, rollback, legacy, JWT inativo, autodesativação, sobrevivência do último administrador e corridas de versões.
- Frontend: DTOs, privacidade, query, envelopes e capacidades; dashboard/loading/erro, listagem/pesquisa/filtros/página, motivo/confirmação/foco, bloqueios e 403; integração real React/API/MongoDB, resposta perdida, dois administradores, suspensão/reativação e histórico.
- Regressões completas frontend/backend, integrações reais e leilões preservados. Larguras 320/430/768/1024/1280/1440 px; capturas e árvores AX fora do repositório via `DOCAMPO_ADMIN_USER_SCREENSHOTS`.
- A instabilidade preexistente de `datetime-local` nos leilões mantém registo separado e não é corrigida nesta fase.

**Validação final executada:** 564 testes frontend habituais, 91 integrações reais React/API/MongoDB e 12 integrações reais de leilões, totalizando **667 testes frontend distintos**, mais **1659 testes backend completos**. Incluem 33 casos novos frontend (13 de contratos, 9 de interface, 11 reais) e 52 backend (20 unitários, 13 HTTP, 19 MongoDB). As 60 capturas finais e as árvores AX ficaram fora do repositório. Na inspeção adicional, 1014 amostras de texto estável e 132 frames de foco passaram os limiares aplicáveis; VoiceOver audível não foi testado.

Os resultados efetivamente executados constam do relatório final externo, distinguindo execuções completas, focadas e repetições sem somar os mesmos casos. Preparar a consolidação apenas depois de testes, TypeScript, ESLint, Prettier, builds, OpenAPI, links, segredos, diffs e integridade da Fase 0 passarem; não realizar staging ou publicação sem nova autorização.

## Revisão visual local isolada

Reutilizar o [modo de revisão com contas fictícias da Fase 7C](phase-7c-admin-producer-applications.md#preparação-da-revisão-manual-isolada), sem dados de produção. Na conta administrativa, abrir a visão geral e «Gerir utilizadores». A conta pode ser desativada/reativada apenas nesta base efémera, com motivo e confirmação; usar o segundo administrador para verificar concorrência. Encerrar os processos após a revisão, removendo a base e o ficheiro privado temporário de credenciais.

## Limitações e decisões futuras

A desativação não cancela encomendas/leilões, não repõe reservas de stock e não cria reembolsos; esses registos são preservados e continuam sujeitos às regras comerciais existentes.

Sem eliminação permanente, edição de papéis, criação de administradores, revogação permanente de JWT, recuperação de palavra-passe, emails de suspensão, gestão comercial global, moderação, monitorização Cloud, novos eventos em tempo real ou alterações das fases posteriores. Pesquisa parcial/counts podem exigir indexação adicional/estratégia própria a escala superior; há limites de duração e paginação, sem infraestrutura de pesquisa nova. Auditoria não tem TTL nem limpeza automática nesta fase; retenção/anonymização e provisionamento de administração em produção exigem decisão operacional própria, sem apagar evidência silenciosamente.
