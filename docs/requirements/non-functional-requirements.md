# Requisitos não funcionais e obrigações de entrega

Aplicam-se as fontes E/F0, as classes O/V/P/D e a prioridade definidas em [functional-requirements.md](functional-requirements.md). Requisitos O são académicos; números e medidas marcados P são objetivos propostos, sujeitos a validação, não critérios impostos pelo docente.

## Requisitos verificáveis

| ID / classe | Área e requisito | Critério de aceitação | Origem |
| --- | --- | --- | --- |
| RNF-SEG-01 / O | Hash de passwords com bcrypt. | Base de dados não contém password em claro; login compara hash; hash nunca é devolvido pela API. | E p. 20 |
| RNF-SEG-02 / O | JWT com expiração e controlo por papel. | Testar token ausente, inválido e expirado → 401; papel insuficiente → 403; mesma identidade autentica sockets. Duração de 2 h no exemplo não é uma obrigação. | E p. 20–21 |
| RNF-SEG-03 / O | HTTPS em produção; segredos em variáveis de ambiente. | SPA/API operam por HTTPS e sockets por ligação segura; repositório e bundles públicos não contêm URI privada, segredo JWT ou credenciais de Blob. | E p. 20; p. 23 |
| RNF-SEG-04 / P | Autorização por propriedade e aprovação, com listas explícitas de campos aceites. | Produtor A não altera recursos de B; comprador consulta apenas as suas encomendas; campos enviados pelo cliente não elevam papel nem aprovação; permissões atuais são verificadas também em sockets. | Proposta D03, concretização de RF-AUT-03; exemplo E p. 17/22 |
| RNF-SEG-05 / P | Validação de entrada, limites e erros seguros. | Rejeitar operadores MongoDB injetados, valores não finitos, regex não limitada e payloads excessivos; limitar login/licitação/upload; não expor stack traces. Limites configurados e documentados. | Proposta de engenharia |
| RNF-SEG-06 / P | Upload seguro. | Só produtor autorizado; tipo real, tamanho e extensão validados; identificador gerado pelo servidor; recusar conteúdo executável; segredos e escrita do storage inacessíveis ao browser. | Proposta D10; RF-PRO-01/RF-CLO-01 |
| RNF-RES-01 / O | Interface Mobile First com Bootstrap 5 e SASS. | Estilos base para telemóvel; media queries explícitas a 768, 1024 e 1280 px; variáveis, mixins e parciais; grelha, cartões, formulários e navegação Bootstrap. | E p. 5; p. 15 |
| RNF-RES-02 / O | HTML5 semântico e protótipos por interveniente em desktop e telemóvel. | Uso de `header`, `nav`, `main` e `article`; protótipos de visitante, comprador, produtor e administrador em ambos os formatos; navegação e formulários funcionais. | E p. 8; p. 15 |
| RNF-ACE-01 / P | Acessibilidade de navegação e informação. | Percursos principais executáveis por teclado; foco visível; inputs com labels; imagens com alternativa; erros e notificações perceptíveis sem depender da cor; alvo WCAG 2.2 AA a verificar. | Proposta; E exige semântica, não um nível WCAG |
| RNF-DES-01 / P | Desempenho REST mensurável. | Objetivo inicial p95 ≤ 500 ms em listagens e p95 ≤ 1 s em checkout, com 20 clientes simultâneos e dados de teste documentados; medir no ambiente real, distinguindo arranque e chamadas a serviços externos. | Proposta; E não define latência nem volume |
| RNF-DES-02 / P | Desempenho de tempo real mensurável. | Objetivo p95 ≤ 1 s entre aceitação confirmada e atualização dos clientes ligados, com 20 clientes; reportar latência e recusas sem sacrificar consistência. | Proposta; carga elevada só integra V em E p. 24 |
| RNF-MAN-01 / O | SPA com componentes reutilizáveis, routing, estado global e data binding. | Cartão de produto, carrinho e painel de leilão reutilizáveis; routing no cliente; carrinho/sessão partilhados; filtros e formulários ligados ao estado. | E p. 16 |
| RNF-MAN-02 / D | TypeScript, monorepo e monólito modular. | Organização proposta por módulos com frontend/backend separados; fronteiras e dependências descritas; sem microsserviços. Implementação apenas na fase seguinte autorizada. | F0 §1/4/9 |
| RNF-MAN-03 / P | Verificação automatizada e diagnóstico. | Vitest verifica regras críticas; Supertest verifica API/RBAC; Playwright verifica percursos por papel; logs estruturados com identificador de pedido, sem tokens/passwords. Sem percentagem de cobertura artificial. | Ferramentas F0 §1; estratégia proposta |
| RNF-FIA-01 / P | Recuperação de desconexões e reinícios. | Reentrada obtém snapshot; reinício do processo retoma encerramento de leilões expirados; estado persistido prevalece sobre eventos e timers locais. | Proposta D07/D11 |
| RNF-FIA-02 / P | Continuidade e cópias de segurança adequadas ao contexto académico. | Definir exportação e ensaio de recuperação antes de M3; documentar o último backup e limitações. Não prometer RPO/RTO contratual. | Proposta; limites Atlas abaixo |
| RNF-CON-01 / O | Licitações atómicas e estado comum entre clientes. | Duas ofertas iguais concorrentes produzem uma aceitação e uma recusa; nenhuma oferta abaixo do mínimo é aceite; broadcast segue persistência. | E p. 7; p. 21 |
| RNF-CON-02 / O | Modelo MongoDB com validação e escolhas justificadas. | `users`, `products`, `orders`, `auctions`, `bids`; linhas embebidas, referências de comprador/produtor; `required`, `enum`, `min`; pelo menos uma consulta com `$regex`, `$gte`, `$lte` ou `$lt` demonstrada e justificação no relatório. | E p. 18 |
| RNF-CON-03 / P | Atomicidade entre valor atual e histórico. | Oferta confirmada possui bid correspondente; falha ao inserir bid faz rollback do valor; retry não duplica bid; broadcasts não surgem antes do commit. | Proposta D06; corrige a janela do exemplo E p. 21 |
| RNF-CON-04 / P | Stock e snapshots consistentes. | Checkout concorrente não gera stock negativo; linhas preservam nome/preço/unidade mesmo após edição do produto; falha numa linha não deixa débitos parciais. | Proposta D05/D08; snapshots exemplificados em E p. 18 |
| RNF-ESC-01 / P | Evolução sem partilha incorreta de estado volátil. | Base inicial com um processo/instância; antes de várias instâncias, validar adapter, presença global, afinidade e encerramento concorrente. Nenhum requisito de auto-scaling obrigatório. | Proposta D12; V em E p. 24 |
| RNF-CLO-01 / O | Disponibilidade Cloud para entrega e defesa. | Aplicação e Swagger públicos e ativos até à defesa; SPA/API PaaS, Atlas gratuito, imagens Cloud e WebSockets funcionais; justificação IaaS/PaaS/BaaS. | E p. 23; p. 25 |
| RNF-CLO-02 / O | Usar créditos gratuitos de estudante e Atlas gratuito. | Plano de publicação identifica créditos, validade e limites; não presume que o SKU B1 do exemplo seja gratuito. | E p. 27, «Custos» |
| RNF-CLO-03 / P | Observação de saúde e orçamento. | Painel administrativo mostra estado observado com data e limitações; acompanhar consumo de créditos; documentar plano até à defesa. Não estipular SLA numérico do produto. | Proposta Q16; RF-ADM-02 |

O quadro da p. 5 menciona vários operadores de pesquisa; a lista formal da p. 18 exige pelo menos uma pesquisa com um dos operadores. Propõe-se demonstrar todos os quatro em cenários pertinentes, sem afirmar que E exige quatro consultas distintas.

O desenho de reconexão é necessário porque Socket.IO não assegura, por omissão, a entrega de cada evento. A recuperação automática também pode falhar; a proposta inclui ressincronização explícita. [Garantias de entrega](https://socket.io/docs/v4/delivery-guarantees/), [recuperação de ligação](https://socket.io/docs/v4/connection-state-recovery/).

Não se assume disponibilidade contratual em planos gratuitos. O App Service Free/Shared não oferece SLA financeiro; o Atlas gratuito não oferece backups geridos, pelo que a proposta de exportação deve ser validada na fase de Cloud. [Custos e planos App Service](https://learn.microsoft.com/azure/app-service/overview-manage-costs), [limites Atlas gratuito](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/). Fontes técnicas consultadas em 14 de outubro de 2026; condições dos serviços devem ser reconfirmadas antes da publicação.

## Obrigações académicas e evidências

| ID / classe | Obrigação | Critério de aceitação | Referência E |
| --- | --- | --- | --- |
| ENT-01 / O | Trabalho individual em Git partilhado com o docente. | Código-fonte, commits regulares ao longo das sete semanas e README com instalação/execução; partilha realizada pelo estudante. | p. 14; p. 25; p. 27 |
| ENT-02 / O | M1 no fim da semana 2. | Frontend responsivo, SPA navegável com dados simulados e esboço OpenAPI. | p. 14 |
| ENT-03 / O | M2 no fim da semana 4. | API documentada, MongoDB, autenticação e integração na SPA. | p. 14 |
| ENT-04 / O | M3 no fim da semana 7. | Aplicação completa em Cloud com tempo real, relatório e vídeo. | p. 14 |
| ENT-05 / O | Relatório com máximo de 20 páginas. | Arquitetura, decisões, modelo de dados, serviços/modelo Cloud, consistência dos leilões e dificuldades; uso de IA e bibliotecas declarado. | p. 25; p. 27 |
| ENT-06 / O | Vídeo com máximo de 5 minutos e defesa individual de 15 minutos. | Percursos demonstrados; estudante explica as decisões e qualquer parte do código; URLs continuam disponíveis até à defesa. | p. 14; p. 25; p. 27 |

E p. 26 distribui avaliação: frontend 15%; SPA 20%; API/MongoDB/Swagger 20%; tempo real/consistência 15%; Cloud/segurança 15%; relatório/apresentação/defesa 15%. Não são prioridades que autorizem omitir requisitos. A valorização é até +1 em Laravel e +0,5 em elasticidade/custos, com nota limitada a 20 (E p. 24).
