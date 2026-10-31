# Fase 10 — confirmação de receção e atualizações das encomendas

Implementação local na branch `feat/api-foundation`, a partir de `3bd7625b63a347c90ca10a5aa5602c73489b612d`. Concretiza RF-ENC-03/05 e o acesso às avaliações de RF-AVA-01, reutilizando checkout, modelos, histórico, capacidades, JWT, REST e o servidor Socket.IO existentes. Os nove documentos originais da Fase 0 são preservados.

## Âmbito e regras

Mantêm-se os seis estados: `pendente`, `confirmada`, `em_preparacao`, `pronta`, `concluida`, `cancelada`. A cadeia do produtor não muda: apenas `pendente → confirmada → em_preparacao → pronta`. A nova ação pertence exclusivamente ao comprador proprietário, ativo e com a capacidade atual de comprador: **confirmação explícita de receção, `pronta → concluida`**, tanto para levantamento como entrega. Não se aceita confirmação por produtor ou administrador, saltos de etapas, encomenda alheia ou cancelada.

A ação declara que o comprador recebeu/levantou todos os produtos; não constitui prova logística independente. O pedido atual da Fase 10 autoriza a confirmação direta em `pronta`. O13/O14 continuam a prever, num âmbito posterior, declaração distinta de entrega pelo produtor, prazo/reclamações, conclusão automática e intervenção administrativa justificada. Esses mecanismos não são implementados nem inferidos nesta fase; não se preenche `entregaDeclaradaEm` por simulação, não se inicia um cronómetro e não se concede poder administrativo de conclusão. O termo académico «entregue» continua distinto do estado interno aprovado `concluida`.

Pagamento e estado operacional permanecem independentes. `por_pagar`, `pagamento_comunicado` e `pago` são preservados sem conversão; não há gateway, confirmação financeira, stock adicional ou restrição financeira inventada. A compra mantém linhas, preços, modalidade, período, montantes e recibo de idempotência originais. Nenhuma regra de leilões é alterada.

## Arquitetura e MongoDB

`order-receipt.service.ts` separa o comando e os metadados de receção; `order-notifications.service.ts` fornece projeções mínimas para o transporte. Reutilizam `Order`, validação integral/evolução, versão otimista e guarda transacional de capacidades. Não há coleções, índices, migrações, campos de schema ou dependências novos.

Na mesma transação snapshot/majority/primary: revalidar capacidade com escrita condicional na revisão operacional de users, encontrar a encomenda pelo seu ID **e comprador**, verificar ETag/estado, guardar a conclusão pelo modelo completo. Regista-se `confirmacaoRececaoEm`, `concluidaEm`, `modoConclusao=comprador`, evento em `rececao.historico` e evento `pronta → concluida` em `historicoEstado`. Os dois eventos têm IDs próprios e o mesmo comando, responsável verificado, data e versão observada. A contagem de receção fica parada; datas/históricos anteriores são preservados. Pagamento, stock e recibo não são escritos por esta ação.

Tempo transacional até 10 segundos, cinco tentativas de conflito transitório e versão otimista de orders. A guarda de users coordena alterações de capacidade/desativação concorrentes pelo protocolo já existente. Falhar antes do commit faz rollback conjunto, incluindo auditoria. Não há efeitos de rede dentro do callback repetível.

## Contrato REST

| Método e rota                   | Comportamento                                                                                                                                                        |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/api/orders/:id`           | Detalhe próprio existente, agora com ETag forte privado, `versao`, `podeConfirmarRececao` e datas minimizadas de `rececao`. Os campos anteriores permanecem.         |
| PATCH `/api/orders/:id/receipt` | JSON estrito `{ "confirmarRececao": true }`, JWT e um único `If-Match` forte. Resposta 200 com detalhe confirmado, metadados, ETag e `origem: nova` ou `recuperada`. |

ETag HMAC usa contexto próprio, comprador, encomenda e versão, com o segredo de ambiente existente. Não é um token de acesso nem um valor fornecido como autoridade pelo browser. Sem ETag: 428; malformado/duplicado: 400; versão antiga: 412; estado incompatível: 409; não autenticado/inativo: 401; papel insuficiente: 403; terceiro/inexistente: o mesmo 404. Queries/corpos extra são rejeitados; JSON obrigatório, erros seguros e `Cache-Control:no-store`. O novo comando tem limite de 240/IP e 60/conta por minuto, por processo; limites REST e Socket.IO não constituem uma quota distribuída única.

O [OpenAPI](openapi.yaml) documenta a extensão do GET e o PATCH implementado. Os percursos académicos propostos e os comandos de pagamento/cancelamento continuam identificados como propostas, não endpoints implementados por inferência. As versões e datas públicas são metadados necessários à confirmação e reconciliação; atores, comandos, chaves, hashes, manifesto e auditoria privada continuam fora do DTO do comprador.

## Concorrência, repetição e resultado incerto

Dois pedidos simultâneos com o mesmo ETag só executam uma transição e um evento em cada histórico. O segundo pode recuperar a conclusão do mesmo comprador com o ETag observado no evento original, ou o ETag atual, devolvendo 200/`recuperada` sem nova auditoria de encomenda. A capacidade é sempre revalidada, inclusive nos replays. Não se recupera por esse mecanismo uma conclusão histórica automática, administrativa ou sem o evento específico desta ação. Um ETag anterior a outra etapa não autoriza a confirmação.

Não existe uma nova chave de idempotência ou armazenamento paralelo: a ação tem um único resultado terminal e uma prova de comando/versão no próprio documento. Isso não muda a idempotência do checkout. O browser bloqueia duplo envio; não repete PATCH automaticamente. Após timeout, erro de transporte, conflito ou resultado desconhecido, consulta o detalhe atual. Um 500/503 ou resposta perdida não prova rollback. Só o estado devolvido por REST confirma o resultado; um replay legítimo não duplica histórico.

## Socket.IO privado

Reutiliza-se a instância existente de Socket.IO em `/socket.io`. `order.socket.ts` associa o namespace **`/orders`**; não cria outro servidor, altera regras de leilões ou concede acesso pelo namespace público. `attachAuctionSockets` apenas passa a associar e encerrar este módulo opcional. Runtime e harness real usam a mesma montagem.

| Evento          | Direção e conteúdo                                                                                                                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `orders:watch`  | Cliente → servidor, objeto vazio estrito, com acknowledgement obrigatório. Não aceita userId, ID de encomenda ou nome de sala. Ack de sucesso `{ok:true,data:{consultar:true}}` exige reconciliação REST. |
| `order:updated` | Servidor → comprador/produtor autorizados: `{encomendaId, estado, versao, atualizadaEm}`. Todos os campos derivam de MongoDB confirmado.                                                                  |
| `orders:error`  | Servidor → cliente, erro seguro, sem URI, dados pessoais ou stack. 401/403 retiram o acesso e desligam a ligação.                                                                                         |

Tipos/validação estão em `order.protocol.ts`; o browser valida a fronteira independentemente, sem importar Mongoose. Não se enviam nomes, emails, moradas, montantes, tokens, responsável, conteúdo de auditoria ou recibos.

## Autorização e rooms

JWT apenas em memória e no `auth` do handshake; sem query, URL ou headers alternativos. Mesmas proteções de origem/TLS/proxy/tamanho do Engine.IO existente. Cada subscrição deriva a conta autenticada; a room é `encomendas:conta:<id>` e nunca é escolhida pelo cliente. A projeção MongoDB filtra `comprador=user.id` e/ou `produtor=user.id`, apenas para as capacidades atuais. Administrador sem essas capacidades não tem subscrição comercial nem bypass.

Não se faz broadcast cego para a room: antes de cada lote de emissão, revalidam-se JWT, atividade e papéis, consulta-se MongoDB e revalida-se novamente após a leitura. Mudança de capacidades durante a leitura não divulga o lote. Existe verificação periódica e encerramento por expiração, mesmo sem novo comando; contas desativadas não continuam a receber eventos por manter um socket aberto. Nenhuma verificação elimina o intervalo físico entre a última decisão de acesso e a escrita na rede, nem retira dados já recebidos pelo navegador.

Mesmos valores técnicos dos limites existentes por namespace/processo: até 1000 sockets, 50/IP, oito/conta e quotas de comandos. As tentativas de conexão Engine.IO são partilhadas no servidor existente; os contadores de comandos/ocupação dos namespaces são independentes. O harness de centenas de testes permite mais tentativas de conexão apenas na sua base/servidor efémeros; o runtime de produção mantém os limites existentes, testados no backend.

## Publicação e garantias efetivas

MongoDB é a fonte de verdade. O publisher consulta versões com majority/primary nos conjuntos privados ativos; logo só observa alterações persistidas e deteta também commits REST ou de outra instância. O intervalo de referência é o mínimo dos intervalos de sincronização/autorização existentes (500 ms por omissão), sem promessa de latência. Só emite versões superiores ao último valor observado; operações com rollback não produzem estado especulativo.

As notificações são substituíveis, não uma fila durável. Versões intermédias podem ser agrupadas; não se garante entrega de cada evento, replay de notificações, confirmação de leitura ou entrega exatamente uma vez. Desligar/reconectar obriga a nova autorização/subscrição e consulta REST. Não se introduz outbox, coleção de notificações ou infraestrutura distribuída. A room/adapter é local; não se afirma presença/quotas globais entre réplicas. Não há eventos de encomendas para administração nesta fase.

Limite conservador de 1000 encomendas por subscrição/conta e orçamento de leitura de cinco segundos: excesso recusa a subscrição, não publica um subconjunto silencioso. REST paginado continua disponível e a interface mantém recuperação. Uma falha de consulta suspende a observação até nova subscrição; não gera uma avalanche de mensagens a cada tick. Escala superior, cache por conta, índices adicionais, notificações duráveis e benchmark de produção continuam dependentes de necessidade demonstrada.

## React e reconciliação

Um `OrderUpdatesProvider` vinculado à sessão acompanha as páginas que consomem estes dados: encomendas/avaliações do comprador e dashboard/encomendas do produtor. A ligação mantém-se entre essas secções e é libertada ao passar para páginas sem esse consumo; regressar obriga a nova autorização e consulta REST. Não se introduz uma subscrição global que altere o ciclo de candidaturas ou outras áreas independentes. Liberta sockets/listeners/timers ao sair, expirar ou mudar de identidade/capacidades. Eventos duplicados/antigos são ignorados por ID/versão; eventos válidos invalidam leituras, não substituem o estado comercial com dados do socket. Leituras voltam a REST, com cancelamento e proteção contra respostas de outra sessão. O comprador não aceita uma versão menor que a já confirmada; a gestão do produtor impede leituras antigas de sobrescrever a resposta do seu comando e reconcilia alterações ocorridas durante a escrita.

Reconciliação ao subscrever/reconectar, regressar à rede, focar/reabrir a página e, quando visível, a cada 15 segundos, além das ações manuais. Regressar à rede também revalida a sessão: um erro temporário de `/auth/me` mantém a área fechada até a API voltar a confirmar o acesso. Não se ignora a autorização para apresentar dados offline. Não há novo storage de JWT, contactos, moradas ou encomendas.

Comprador: detalhe e histórico atualizados, ação apenas em `pronta`, confirmação nativa com explicação, envio único, erros/conflitos com consulta antes de repetir, sucesso confirmado e ligação para avaliações. A conclusão atualiza a elegibilidade da Fase 9; não cria avaliações automaticamente nem utiliza encomendas históricas fabricadas como prova do percurso normal.

Produtor: páginas e dashboard existentes atualizam estado/histórico/indicadores. O valor de concluídas continua distinto de receita recebida; não se adiciona confirmação em nome do comprador. Administração: consultas/filtros/históricos/indicadores existentes representam `concluida`, preservando supervisão exclusivamente de leitura e as suas ações de atualização.

## Design, testes e revisão

Identidade, grelha, tipografia, cores e componentes existentes preservados; o diálogo é o mesmo componente nativo partilhado. A instância nova é desmontada ao fechar por erro para libertar o fundo e permitir recuperação. Foco inicial no cancelamento, explicação explícita, erro anunciado, retorno de foco após conclusão confirmada e feedback de ligação discreto. Sem anúncios por segundo ou interfaces administrativas duplicadas.

Testes novos de contrato, HTTP/MongoDB e clientes Socket.IO reais: modalidades, transições inválidas, proprietário/papéis, atividade, JWT/expiração, ETag, concorrência, repetição/timeout, histórico único, auditoria, rollback real após save, stock, recibo e pagamentos preservados, elegibilidade, privacidade, rooms, desativação/perda de papel durante ligação e reconexão. Fixtures criam compras fictícias pelo checkout e preparação reais; **nenhuma compra positiva é pré-fabricada como concluída**. Estados de pagamento históricos e cancelamento são fixtures negativas/condições de teste, sem novos comandos públicos ou pagamentos simulados na aplicação.

React/API/MongoDB/Socket.IO exercitam o ciclo até publicar uma avaliação, dois intervenientes ligados, perda real da resposta após commit, falha anterior ao envio, duplo clique, reconexão e ausência de atualização manual. Casos HTTP 412 injetados verificam apresentação e recuperação; a concorrência efetiva é testada separadamente em MongoDB. Seis larguras 320/430/768/1024/1280/1440 px, comprador, produtor, administração, confirmação, conflito, vazio, rede/recuperação, teclado, foco, contraste e árvores AX. Evidências ficam fora do Git. VoiceOver audível, outros browsers/dispositivos físicos e carga de produção não testados; não se afirma certificação WCAG integral.

Resultados finais das suites completas, validações, inventário e hashes acompanham o relatório de entrega. As ocorrências encontradas e corrigidas durante a revisão são registadas. Uma regressão real da Fase 9 mantém a verificação de 401 e passa a exigir regresso automático ao login, substituindo o clique manual que a perda imediata de acesso já torna impossível. Não se elimina cobertura, não se alteram os outros testes antigos nem as regras de leilões para obter aprovação.

## Revisão manual isolada

Na raiz, com Docker e dependências existentes:

```sh
npm run mongo:test:up --workspace @docampo/api
DOCAMPO_RECEIPT_REVIEW=1 node --import tsx apps/web/tests/support/real-api-server.mjs
```

Noutro terminal:

```sh
VITE_API_URL=http://127.0.0.1:3011/api npm run dev --workspace @docampo/web -- --port 5183
```

O servidor imprime apenas o caminho de um ficheiro privado temporário (0600) com contas fictícias de comprador/produtor/administrador e ID da encomenda pronta. Usar contextos de navegador separados para comprador e produtor: entrar em `/entrar`, abrir `/area/comprador/encomendas/:id` e `/area/produtor/encomendas/:id`. Confirmar receção no comprador, verificar `concluida`/histórico no produtor sem refresh, depois abrir avaliações e publicar explicitamente. Na administração, consultar `/area/administrador/encomendas/:id`, histórico e filtro de concluídas. Pagamento mantém-se `por_pagar`.

Só usa replica set de teste loopback, porta 27019, base aleatória `docampo_test_web_*`, segredos aleatórios de sessão e contas fictícias. Não partilhar 3011/5183 com as suites reais. Ctrl+C encerra serviços e remove base/ficheiros privados. O módulo de revisão não integra o runtime de produção. Sem staging, commit, push, branches, merge, PR ou início da Fase 11 nesta entrega. Proposta após autorização: `feat(orders): add receipt confirmation and realtime updates`.

## Validação integrada final — 31/10/2026

| Execução completa final                       | Resultado                           |
| --------------------------------------------- | ----------------------------------- |
| Backend, incluindo HTTP, MongoDB e Socket.IO  | 1831 testes aprovados, 55 ficheiros |
| Frontend habitual                             | 611 testes aprovados                |
| Integrações reais React/API/MongoDB/Socket.IO | 133 testes aprovados                |
| Regressões reais dos leilões                  | 12 testes aprovados                 |

São **2587 testes distintos**: 1831 backend e 756 frontend, com 31 backend e 16 frontend novos. As suites completas foram efetivamente executadas após as correções, sem skips ou retries automáticos. Um teste anterior de suspensão conserva o 401 e passa a exigir retirada automática/regresso ao login; os restantes testes anteriores são preservados.

TypeScript API/frontend, ESLint, Prettier com ignore explícito, builds API/frontend, OpenAPI, ligações Markdown, `git diff --check`, verificação de segredos e integridade byte a byte dos nove documentos da Fase 0 aprovados. Os contratos anteriores permanecem iguais fora da extensão necessária do detalhe próprio e do novo PATCH. Duas respostas HTTP reais foram conferidas contra os schemas; o pagamento manteve-se `por_pagar` após confirmação. Sem novas dependências.

Foram guardadas **75 capturas fora do Git**, árvores AX/ariaSnapshots e 2384 amostras de contraste, mínimo observado 5,24:1. Seis larguras aprovadas, sem overflow horizontal no conjunto ensaiado. O modo manual documentado foi utilizado com contas fictícias, incluindo perda de ligação/reconexão nas seis larguras, cancelamento com retorno do foco, receção e atualização real do produtor. Zero pageerrors nesse ensaio. VoiceOver audível e dispositivos físicos continuam por testar.

A revisão corrigiu problemas no trabalho novo: fecho do diálogo no erro, concorrência entre subscrição/verificação periódica, recuperação da validação de sessão no regresso à rede, limpeza das fixtures por teste e subscrição fora das páginas consumidoras. Artefactos Playwright passaram a usar diretórios separados. Uma execução sob validações simultâneas também apresentou timeouts/503 antigos sem causa específica demonstrada; as repetições completas finais passaram. Não se alteraram regras de leilões, pagamentos ou stock para obter aprovação.

Inventário final: **32 ficheiros, 17 novos e 15 modificados**. Relatório, inventário, logs e hashes acompanham as evidências temporárias da entrega. Código/configurações preservados durante as validações finais; documentação concluída com os resultados. Processos e credenciais privados removidos, zero bases web efémeras restantes e MongoDB de teste encerrado, preservando o ambiente de desenvolvimento. HEAD local/remoto permanece `3bd7625b63a347c90ca10a5aa5602c73489b612d`; main local/remota `c10d031dafc3a0173f5540875152f35f61bb1549`. Staging vazio, sem publicação desta fase.
