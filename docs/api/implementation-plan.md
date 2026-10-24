# Plano detalhado proposto — subfases 3.1–3.7

> Estado vigente após nova aprovação: O01–O16 e OR01–OR12 aprovadas; orders pronto documentalmente para persistência isolada, aguardando autorização de implementação. Ver [consolidação vigente](phase-3.2-orders-readiness.md). Recomendações/pedidos de aprovação das revisões anteriores são históricos e não reabrem estas decisões.

Complementa o [plano oficial](../planning/implementation-plan.md) sem o alterar. Base histórica `807aa68`; fundação publicada em `68f41ec` e preparação documental 3.2 a partir desta última versão; integração em main adiada por decisão do utilizador. **O primeiro bloco users/producers de 3.2 foi implementado e consolidado nos commits locais 77673a5/c87f928; a autorização seguinte acrescentou apenas products**, sem novas dependências, branches ou operações Git de escrita nesta tarefa. Restantes modelos/fases continuam sem autorização; main intacta.

## Sequência, segurança e preservação

3.1 fundação → 3.2 dados → 3.3 catálogo/produtores → 3.4 encomendas → 3.5 avaliações/admin → 3.6 preparação REST de leilões → 3.7 aceitação. O contrato já inclui autenticação/serviços como recursos futuros, sem os antecipar para implementação nesta fase.

C04 foi aprovada: autenticação/autorização reais mantêm-se na semana 4. Leituras e escritas privadas não podem ser disponibilizadas pela API até essa segurança estar implementada. Serviços de negócio podem ser testados em isolamento interno nas subfases autorizadas, com endpoints privados bloqueados. O frontend continua demonstrativo; escolher um papel não autentica nem autoriza.

Os caminhos abaixo são **previsões**, não ficheiros criados. Utilizar apps/api/src/modules e apps/api/src/shared, packages/shared somente com consumo real (C05). Cada módulo separa rotas/controlador, validação/DTO, serviço e acesso a dados; transações de orders/auctions coordenam serviços sem escrita cruzada diretamente nas rotas. Nunca exportar documentos Mongoose para browser.

## 3.1 — Fundação técnica e ambiente

C01/C02/C04/C06 estão aprovadas nos princípios e no âmbito do [registo](decisions.md). A [proposta técnica de entrada](phase-3.1-proposal.md) concretiza versões, validação HTTP, scripts, variáveis e ambiente/testes MongoDB para nova aprovação; a autorização posterior de 2026-10-16 permite executar apenas 3.1 com os ajustes registados na [entrega](foundation-implementation.md).

- **Objetivos/funcionalidades:** aplicação Express separada do processo de arranque; configuração de ambiente, ligação/encerramento MongoDB, erros e diagnóstico mínimos; compatibilidade ESM/TypeScript e ferramentas de teste.
- **Dependências:** aplicar C01/C02/C04/C06 aprovadas; aprovação da proposta técnica e autorização explícita de implementação/instalações; aprovação individual das dependências/versões; configuração de desenvolvimento/teste definida pelo utilizador. Não assumir que um .env existe ou que o Atlas está provisionado.
- **Ficheiros previstos:** apps/api/{package.json, tsconfig.json, README.md}, src/{app.ts, server.ts}, src/shared/{config, database, http}/*, tests/foundation.spec.ts e configuração Vitest. Scripts/configurações da raiz só quando necessários e expressamente autorizados; exemplo de ambiente sem segredos em local acordado.
- **Testes:** Vitest de configuração válida/inválida; Supertest do pipeline HTTP/rota inexistente/erro seguro; falha de conexão e encerramento sem processo pendurado. Um probe técnico de readiness deve distinguir HTTP do estado MongoDB, se for aprovado; não representa painel Cloud real.
- **Aceitação:** API arranca/encerra controladamente, fail fast com configuração inválida, erros sem segredos; configuração backend não altera o build web. Dependências ficam no workspace correto. Nenhuma escrita privada acessível pela rede.
- **Riscos/decisões:** herdar Bundler/DOM/noEmit indevidamente; instalar versões ou validador propostos sem aprovação; logar URI/token. Versões e Zod estão agora propostos na entrada técnica, com fontes e alternativas; não foram instalados nem aprovados por implicação.

## 3.2 — Schemas, referências e testes de persistência

**Estado: users/producers/products consolidados localmente; orders em revisão documental após O01–O16, sem implementação autorizada.** Q01/Q03/Q04/Q06/Q14 aprovadas funcionalmente; T32-01–T32-06 aprovadas no âmbito explícito, detalhes residuais ainda por aprovar. Ver [prontidão A/B/C e primeiro bloco](phase-3.2-readiness.md). Ver [plano detalhado 3.2.a–g](phase-3.2-proposal.md) e [sete modelos candidatos](phase-3.2-models.md).

- **Objetivo:** cinco coleções académicas e justificação de referências/embedding; producers/reviews aprovadas T32-06, total de sete coleções. Campos e índices não foram aprovados em bloco. Sem novos endpoints privados.
- **Sequência futura:** a) representações/contrato; b) User/perfil; c) Product/unidades/rascunhos; d) Order/snapshots; e) Auction/Bid; f) Review condicionada; g) índices/integridade/regressão. Cada etapa tem ficheiros, testes, aceitação, dependências e riscos na proposta.
- **Dependências:** OR estruturais de orders conforme relatório próprio, Q07–Q13/Q15/Q16 conforme os modelos seguintes, C03/C05 quando aplicável e detalhes residuais Q04/Q06/Q14; inteiros g/ml/unidades/embalagens, half-up e meses opcionais já aprovados. A01–A03 aprovadas e aplicadas ao primeiro bloco; as regras comerciais B só bloqueiam os modelos posteriores afetados.
- **Ficheiros previstos:** módulos e testes próprios da API, sem alterar frontend/segurança ou criar packages compartilhados antes de C05. Paths concretos constam de 3.2.a–g; nenhum foi criado agora.
- **Testes futuros:** MongoDB real isolado para required/enums/quantidades/preços/referências/índices únicos/consistência e transações aplicáveis; criar/aguardar índices explicitamente porque autoIndex=false. Preservar os 228 backend atualmente aprovados e os 274 Playwright de referência, acrescentando apenas casos pertinentes nos blocos autorizados.
- **Aceitação:** campos e invariantes rastreados; valores exatos, snapshots imutáveis, identidade única com capacidades acumuladas, pendente com rascunho privado e nenhuma publicação automática; sem regra inventada nas áreas bloqueadas.
- **Riscos:** confundir user/perfil ou papel/aprovação/publicação; misturar g/ml/embalagens; regex ou índices multikey inadequados; pretender que ref/unique/validator bastem para integridade concorrente.

## 3.3 — Catálogo e produtores

- **Objetivos/funcionalidades:** listagem/detalhes públicos e gestão própria de produto/perfil; candidatura própria; filtros e consultas com operadores MongoDB pertinentes.
- **Dependências:** 3.1/3.2, Q03/Q04/Q06/Q11/Q12/Q14/Q15, C01–C04. C04 fixa JWT/RBAC real na semana 4; até então, testes de serviço com contexto interno e HTTP privado negado.
- **Ficheiros previstos:** modules/{products, producers}/*.{routes,controller,service,repository,validation,dto}.ts e testes. Contratos em packages/shared apenas após C05; OpenAPI atualizado na documentação complementar.
- **Testes:** GET 200; POST produto 201 + Location; PUT 200; DELETE 204 sem corpo; 400/401/403/404; produtor alheio/não aprovado; campos protegidos; filtros combinados, pesquisa escapada/acentos, paginação e recurso arquivado. Demonstrar operador(es) previstos em E p. 18, sem exigir quatro consultas académicas separadas.
- **Aceitação:** respostas coerentes com contrato e elegibilidade pública, nenhuma atribuição de owner/aprovação pelo cliente; histórico protegido no DELETE acordado. Preservar semântica de query e não expor hash/contactos privados.
- **Riscos/decisões:** publicação de pendentes, regex sem limite, N+1 de perfis, taxonomias falsas. Sem upload Blob, mapa SDK ou redesign nesta subfase; ausência de coordenadas fica explícita.

## 3.4 — Encomendas e consistência de stock

- **Objetivos/funcionalidades:** criar order/grupo, consultar próprias encomendas e alterar estado pelo produtor responsável; valores do servidor e snapshots históricos.
- **Dependências:** 3.3 e modelo orders posteriormente autorizado; O01–O16 já aprovadas funcionalmente, Q03/Q04 e C02/C04 preservadas. Resolver OR05/OR12, configurações comerciais e políticas operacionais indicadas na prontidão; fechar DTOs/Location/reconfirmação antes do checkout. O01/P03 não aprovam todos os detalhes de D08 por extensão.
- **Ficheiros previstos:** modules/orders/*.{routes,controller,service,repository,validation,dto}.ts, unidade transacional partilhada se necessária, testes unitários/Supertest/integração concorrente e fixtures.
- **Testes:** carrinho vazio/linha inválida; dono vindo do token; totais forjados recusados; snapshot preservado; quantidade indisponível; último stock entre dois compradores; falha na segunda linha sem débito parcial; repetição de chave se adotada; seis estados O02, receção separada, pagamento independente e transições proibidas; acesso alheio.
- **Aceitação:** implementação segue política aprovada de multi-produtor e débito; sem stock negativo ou commits parciais; preço alterado não é aceite silenciosamente; uma confirmação inequívoca e HTTP documentado. Persistir histórico junto da mudança.
- **Riscos/decisões:** pendentes comprometem stock por P03; O03/O04 regulam cancelamento/reposição, com exceções OR06 ainda por decidir; retry/commit incerto não significa rollback; taxas/morada/entrega sem contrato. Sem processamento online de pagamentos ou sockets neste bloco; cancelamento segue apenas O03 e OR aplicáveis, após autorização própria. Frontend/cesta não são alterados nesta etapa isolada.

## 3.5 — Avaliações, candidaturas e administração REST

- **Objetivos/funcionalidades:** avaliar produto e produtor após entrega; denúncia/manutenção/ocultação; aprovação/rejeição; consultas globais e indicadores autorizados.
- **Dependências:** orders entregues reais, Q04/Q10/Q12/Q15, D09 e C02/C04. Não considerar entrega dos mocks como elegibilidade de uma conta real.
- **Ficheiros previstos:** modules/{reviews, admin}/*, serviços de candidatura em producers, agregações próprias/globais e testes de autorização/elegibilidade/concorrência/projeções.
- **Testes:** entrega não própria/não concluída; alvo alheio; escala/cardinalidade acordadas; denúncia repetida; decisão concorrente/alvo já decidido; ocultação removida de consultas e médias públicas; classificação/texto preservados; indicadores derivados e sem duplicar denúncias/páginas; ausência de dados privados.
- **Aceitação:** só admin decide, só comprador elegível avalia; autor/data server-side; consultas e agregados refletem decisão persistida; produtor não vê atividade alheia. Poderes ficam dentro da matriz e não incluem alterar contas/encomendas/leilões.
- **Riscos/decisões:** política de reabertura/repetição ainda Q04/Q10/Q12; limites de denúncia e fórmula Q15 por aprovar. Estado Cloud não é implementado nem marcado saudável; notifications persistente e outros conteúdos não são introduzidos sem decisão.

## 3.6 — Estrutura REST/persistente dos leilões e licitações

- **Objetivos/funcionalidades:** preparar criação/consultas de lotes, lista própria/global, histórico de bids e participações; contratos e ensaio de consistência para a Fase 5.
- **Dependências:** Q01/Q03/Q04/Q06/Q07/Q08/Q09 e C04; aprovar D06 antes do ensaio que o adota. Criação com campos dependentes de reserva/datas não é disponibilizada enquanto essas decisões estiverem abertas.
- **Ficheiros previstos:** modules/auctions/*.{routes,controller,service,repository,validation,dto}.ts, modelos Auction/Bid já aprovados em 3.2, testes de integridade/snapshot e ensaio transacional interno. Protocolo complementar sem código Socket.IO nesta subfase.
- **Testes:** enum/datas/incremento; base sem bid/vencedor; refs de produto do mesmo produtor se opção adotada; histórico ordenado e sem PII; estados agendado/ativo/terminado coerentes. Ensaio interno de rollback auction+bid e concorrência, se D06 aprovado, sem endpoint de licitação fictício.
- **Aceitação:** consultas previstas e persistência respeitam o contrato; nenhuma oferta recusada ou preço base é inserida como bid; limitações do snapshot e ciclo de vida ainda ausente são explícitas. Campos/resultados dependentes de Q não são inventados.
- **Riscos/decisões:** relógio local, timers, reserva/conversão e dupla baixa de stock. Sem salas, presença, broadcasts, licitar real, agendador/fecho automático ou conversão: estes dependem da Fase 5 e decisões correspondentes. Não chamar leilão expirado operacional/ativo por mera fixture.

## 3.7 — Aceitação da API e preparação da integração M2

- **Objetivos/funcionalidades:** fechar rastreabilidade, contratos, documentação e evidências; preparar Swagger e integração real sem os declarar concluídos.
- **Dependências:** subfases realizadas e decisões aplicáveis resolvidas; distinguir operações implementadas, bloqueadas e reservadas a fases futuras. Cobertura de segurança final/integração pertence a M2.
- **Ficheiros previstos:** documentação complementar docs/api, OpenAPI atualizado, README/configuração de scripts apenas em autorização futura adequada, testes de contrato e matriz de evidências.
- **Testes:** TypeScript, ESLint, Prettier, build API/web, Vitest/Supertest e MongoDB real para invariantes; suite Playwright demonstrativa completa de 274 testes preservados, com novos testes backend adicionais, sem número artificial predeterminado. Comparar nove documentos F0 com c10d031 e verificar âmbito/segredos.
- **Aceitação:** nenhuma regressão visual/funcional, nenhuma permissão baseada em mock, documentação corresponde às operações efetivas e testes negativos passam. Como a segurança real permanece na semana 4, leituras e escritas privadas permanecem fechadas até à sua implementação e não se declara aceitação end-to-end dessas operações nem M2 completo.
- **Riscos/decisões:** alterar testes para esconder regressões, ativar integração por omissão, copiar DTOs diretamente para UI ou declarar Cloud/tempo real concluídos. Definir autorização separada para semana 4, instalações e Git.

## Estado de execução 3.1

Fundação implementada localmente após autorização explícita de 2026-10-16, com Node 22.21.1/npm 10.9.4 e MongoDB 8.0.34 de membro único por replica set. Ver [implementação e evidências](foundation-implementation.md). 3.2 tem agora users/producers, validações, índices e testes locais; outros cinco modelos e 3.3–3.7 não foram iniciados. C04 mantém todas as operações privadas inacessíveis.

## Fora do âmbito e estratégia de entrega

Autenticação final/Swagger UI/SPA integrada: semana 4; leilões/notificações em tempo real: semana 5; Blob/estado Cloud/publicação: semana 6; aceitação global/relatório/vídeo: semana 7. Laravel/elasticidade só depois dos obrigatórios. Antecipações precisam de decisão explícita e não substituem critérios académicos.

Nenhuma branch nova é criada nesta preparação. Uma autorização futura deve indicar a branch de implementação a partir da fundação publicada 68f41ec, sem merge em main nesta etapa. Commits/push/PR continuam sujeitos a autorização própria. Cada subfase deve entregar uma fatia verificável, respetivos testes, ficheiros e pendências, antes de pedir autorização para publicação ou para avançar.

## Ordem proposta após a consolidação T32

A01–A03 aprovadas e users/producers autorizados/implementados; não esperar por todas as Q comerciais para esse bloco. A etapa 3.2.a não é uma obrigação de implementar dinheiro/categorias antes da identidade: resolver cada representação antes do modelo respetivo. Blocos comerciais continuam dependentes de decisões B; segurança real, integração, mapa e Cloud mantêm a sequência prevista. Ver campos, índices mínimos, testes e aceitação na [análise de prontidão](phase-3.2-readiness.md). Ver [entrega efetiva do primeiro bloco](phase-3.2-identity-implementation.md); não avançar sem nova autorização.

## Products — bloco local concluído após esclarecimentos

P01–P08 aprovadas; referência fixa por kg/L/unidade/embalagem e declaração explícita de ingredientes resolvidas pelo utilizador antes do código. Modelo products, tipos/constantes, validações, dois índices compostos e testes locais implementados conforme [entrega específica](phase-3.2-products.md). Não foi iniciada a etapa Order: P03 é apenas a regra futura de débito na submissão; P08 reserva confirmação/UI e snapshots para as fases respetivas. Quatro modelos restantes e operações HTTP continuam futuros. A implementação local não concede autorização Git de publicação.

## Entrada de orders — apenas análise, sem execução

[Plano de subfases e aceitação](phase-3.2-orders-readiness.md): aprovar OR estruturais → autorizar tipos/cálculos → autorizar persistência isolada com testes → autorizar separadamente configuração comercial e caminho de escrita condicionado → serviços transacionais/ciclo comercial → segurança/HTTP/agendador/integração nas fases próprias. Não executar toda esta sequência por implicação da aprovação O01–O16.

O próximo bloco não inclui users/producers/products modificados, endpoints ou autenticação. Os 228 backend/274 Playwright são referências preservadas; esta revisão só executa verificações documentais. Pedidos, reclamações e pagamento têm estados próprios; conclusão automática não marca pagamento, e nenhum reembolso é processado.

## Entrada consolidada de orders — execução ainda não autorizada

O/OR aprovadas; substituir a etapa «pedir aprovação das OR» pela autorização do bloco isolado. Sequência técnica proposta: tipos/constantes/cálculos exatos → schema isolado/índices/fixtures/testes → configuração aditiva e protocolo de escrita coordenado → checkout interno → comandos auditados → job/segurança/HTTP/integração/tempo real nas fases próprias. Ficheiros, testes e critérios detalhados na [consolidação](phase-3.2-orders-readiness.md).

Não executar checkout com Product.updateOne bloqueado pelo helper, nem assumir que exists/perfil ou __v resolvem concorrência. Provar conflitos entre checkout e decisão/configuração do produtor em MongoDB real quando autorizado. Preservar os 228 backend existentes; esta consolidação só valida documentos. Subtotais zero recusados, reclamações múltiplas, tempo restante pausável e pendências de stock entram no plano de testes, sem alterar frontend ou testes nesta tarefa.
