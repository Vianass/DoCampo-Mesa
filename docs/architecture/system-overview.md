# Visão global do sistema

## Âmbito e arquitetura

Do Campo à Mesa é um mercado digital para consumidores e restauração local, com catálogo, encomendas, avaliações e leilões. Mantém quatro intervenientes funcionais de E p. 4; o visitante é acesso anónimo. Fontes: [requisitos funcionais](../requirements/functional-requirements.md). Arquitetura escolhida em F0: **monorepo, monólito modular e API REST**, sem microsserviços. E p. 6 fornece a arquitetura de referência; a concretização Azure e tecnologias de F0 estão registadas em [decisions.md](decisions.md).

O frontend constitui uma SPA publicada independentemente. Backend HTTP e gateway Socket.IO partilham um processo Node.js, serviços de aplicação, autorização e acesso Mongoose. A separação entre REST e sockets é uma fronteira de transporte, não uma duplicação de regras. Atlas é fonte persistente da verdade; rooms e timers são estado transitório.

## Responsabilidades

| Componente | Responsabilidades |
| --- | --- |
| React/TypeScript/Vite | Ecrãs por papel, componentes reutilizáveis, routing React Router, formulários/filtros, estado global de sessão e carrinho em Context, apresentação responsiva Bootstrap/SCSS. Exigências E p. 15/16; D02. |
| Express/TypeScript | API REST, validação, autenticação, autorização, serviços de catálogo, produtores, encomendas, avaliações, leilões, estatísticas e administração. Calcula preços e decide stock; não aceita permissões/totais fornecidos pelo cliente. |
| Gateway Socket.IO | Autenticação, entrada em salas autorizadas, presença, comandos de licitação, acknowledgements e eventos. Delega regras ao serviço de leilões e transmite apenas depois de persistência confirmada. |
| Mongoose/MongoDB Atlas | Schemas e índices, referências e snapshots, pesquisa e agregações, atualização condicional e transações. Schema não substitui política de negócio nem propriedade. |
| Agendador interno | Ativação/encerramento, recuperação ao arranque e varredura de datas persistidas. Usa serviços e CAS; não é um serviço distribuído separado. D11 proposto. |
| Azure Blob Storage | Bytes das imagens; MongoDB guarda chave, URL e metadados. Upload autorizado pela API e validação do ficheiro; D10 proposto. |
| Administração | Aprovação/moderação e visão global/saúde; permanece na SPA obrigatória. Laravel é valorização posterior, E p. 24. |

## Estrutura futura do monorepo

Proposta para a fase seguinte; **estas pastas/aplicações não foram geradas**:

```text
apps/
  web/                 SPA React, rotas, componentes, hooks, SCSS
  api/                 Express + Socket.IO + agendador
    src/modules/
      auth/ users/ producers/ products/ orders/
      reviews/ auctions/ notifications/ admin/
    src/shared/        infraestrutura transversal e configuração
packages/
  contracts/           DTOs/tipos partilhados quando necessários
docs/                  análise, diagramas, modelo e planeamento
```

Cada módulo terá entrada HTTP/socket, serviço de aplicação e acesso a dados. Os serviços centrais de encomendas/leilões coordenam transações através de interfaces dos módulos; rotas não escrevem diretamente noutras coleções. Partilhar DTOs não significa exportar documentos Mongoose, hashes ou permissões internas para o browser. Evitar criar abstrações/pacotes sem utilização efetiva.

## Autenticação e autorização

E p. 20 exige JWT com expiração, bcrypt, cabeçalho `Authorization`, controlo por papel, HTTPS e segredos fora do Git. D03/D04 propõem autorização adicional por propriedade, aprovação atual e estado da conta. Comprador consulta encomendas próprias; produtor gere catálogo, perfil, encomendas e leilões próprios; administrador aprova/modera e consulta painel global. Não se infere poder de adjudicar, alterar qualquer encomenda ou licitar como administrador.

Registo nunca atribui administrador nem aprovação por dados enviados. Sockets recebem o mesmo token via `handshake.auth`, revalidam permissões nos comandos e expiração durante ligações longas. Salas pessoais são derivadas da identidade autenticada; cliente não escolhe `user:<id>` alheio. Token em memória é proposta sujeita a Q13; duração de 2 h no exemplo não é valor obrigatório. Matriz final depende Q01/Q04.

## REST e dados

API base `/api`. Preservar endpoints e códigos explícitos E p. 17, incluindo `PUT /api/products/:id`, `DELETE` 204 e `PATCH /api/orders/:id/estado`. REST inclui produtores, reviews, leilões e consultas autorizadas do histórico; nomes finais definidos no contrato M1/M2. OpenAPI 3 descreve toda a API e bearerAuth; Swagger UI em `/api-docs` (E p. 19). Formato de erros proposto: código estável, mensagem pt-PT e identificador do pedido; 409 para conflitos de negócio e 413/429 para limites são propostas a documentar, não códigos adicionais exigidos pelo enunciado.

Dados: cinco coleções obrigatórias e três coleções adicionais avaliadas e recomendadas. Linhas de encomenda embebidas preservam preço/nome/unidade; users/products/producers partilhados são referenciados; bids e reviews ficam separados por crescimento. [Modelo de dados](../database/data-model.md).

## Fluxos principais

1. **Catálogo:** browser solicita filtros → API valida e constrói consulta limitada → Atlas devolve produtos públicos → SPA apresenta cartões e imagens Blob. Pesquisa por nome de produtor resolve IDs elegíveis; pesquisa não aceita operadores livres do cliente.
2. **Checkout:** comprador envia IDs/quantidades/modalidade e chave idempotente → servidor calcula totais e valida preços/stock → transação grava débitos e snapshots de encomendas → resposta confirma → carrinho atualiza. Política multi-produtor e unidades aguardam Q02/Q03.
3. **Estado de encomenda:** produtor envia estado → autorização por proprietário e transição → commit → evento para salas pessoais do comprador/produtor → atualização da SPA. Persistência de notificações é P, distinta da obrigação de tempo real.
4. **Leilão:** JWT e entrada autorizada → snapshot/histórico/fim → comando → CAS e bid na mesma transação → commit → acknowledgement e broadcast por sala. Concorrência e reconexão em [auction-consistency.md](auction-consistency.md).
5. **Imagem:** produtor envia ficheiro → API valida → Blob armazena → API associa metadados em produto/perfil. Blob e MongoDB não participam numa única transação; órfãos são tratados por reconciliação proposta, sem afirmar atomicidade entre serviços.

## Protocolo de tempo real proposto

| Canal / evento | Conteúdo e autorização |
| --- | --- |
| `leilao:<id>` | Estado e eventos públicos da sala autorizada; identidade de licitante reduzida, nunca email/JWT. Acesso de visitante Q09. |
| `user:<id>` | Alterações de encomendas e notificações pessoais; entrada exclusivamente derivada do token. |
| `admin:leiloes` | Projeção global de leilões ativos apenas para administrador, para RF-ADM-01. |
| `entrar` / `sair` | Pedido de sala de leilão; servidor valida recurso/acesso; saída liberta listeners/ligação dedicada. |
| `estado` | Snapshot com `estado`, valor atual, `sequencia`, `terminaEm`, `serverNow` e presença. |
| `licitar` | `leilaoId`, `valorCent`, `requestId`; resposta correlacionada aceite/recusada/temporariamente indisponível. |
| `nova-licitacao` | `bidId`, `leilaoId`, `valorCent`, licitante público, `sequencia`, `terminaEm`, `serverNow`; após commit. |
| `presenca` / `leilao-terminado` | Número de participantes segundo Q09 / snapshot final versionado. |
| `encomenda-atualizada` | ID, estado, `versao`, data; só intervenientes e projeção administrativa autorizada. |

O hook reutilizável de leilão possui ligação dedicada que desliga ao sair, como E p. 22 exige. A ligação de notificações pessoais pertence ao âmbito da sessão, permitindo notificações noutras páginas. Esta separação de ligações é D, não componente Cloud adicional. D07 recupera snapshots na reentrada: o transporte Socket.IO não garante cada entrega por omissão. [Garantias Socket.IO](https://socket.io/docs/v4/delivery-guarantees/).

## Cloud e operação

| Serviço escolhido | Modelo e justificação |
| --- | --- |
| Azure Static Web Apps | Alojamento gerido da SPA, conforme opção PaaS de E p. 23; publicação de assets e fallback de routing a validar. Não aloja o processo persistente Socket.IO desta arquitetura. |
| Azure App Service | PaaS para processo Node.js HTTP e sockets, com HTTPS e suporte WebSocket a ensaiar. Sem administração de máquinas virtuais. |
| MongoDB Atlas gratuito | Base de dados gerida, tratada no relatório como DBaaS/BaaS; cumprir tier gratuito de E p. 23/27. |
| Azure Blob Storage | Armazenamento de objetos gerido, serviço de storage; não o descrever como uma máquina IaaS. |

A SPA usa URLs públicas diretas da API/socket; CORS e origens Socket.IO são listas explícitas. Atlas/Blob são acedidos pelo backend com credenciais de ambiente; variáveis `VITE_*` são públicas e não podem conter segredos. HTTPS/WSS e recuperação após restart integram o ensaio da semana 6.

Base proposta: uma instância/processo. Antes de escalar, acrescentar adapter entre instâncias e avaliar afinidade para HTTP long-polling, presença global e recuperação de sessões. [Socket.IO em múltiplos nós](https://socket.io/docs/v4/using-multiple-nodes/). Essa evolução permanece opcional V; não adicionar Redis na Fase 0.

O plano/SKU, região, runtime e limites reais serão confirmados antes de configurar recursos. E p. 23 contém um exemplo B1, não uma garantia de gratuitidade; Free/Shared não têm SLA financeiro. [Planeamento de custos App Service](https://learn.microsoft.com/azure/app-service/overview-manage-costs). Objetivo académico: manter URLs até à defesa; não prometer um SLA industrial com recursos gratuitos. Q16 regista operação e orçamento pendentes.

## Verificação e limites da proposta

Todas as funcionalidades obrigatórias estão em RF/RNF/ENT; rastreabilidade de testes e marcos em [implementation-plan.md](../planning/implementation-plan.md). O modelo precisa validação Q antes de gerar schemas. Esta fase não cria apps, instala dependências, estabelece ligações a bases de dados nem configura Azure. Próximo passo, após aprovação explícita: protótipos/estrutura de frontend responsivo da semana 1.
