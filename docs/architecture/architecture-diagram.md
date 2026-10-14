# Diagramas de arquitetura

Modelo de monólito modular escolhido em F0; referência E p. 6. Fontes e classificação em [requisitos](../requirements/functional-requirements.md). Diagramas representam a proposta, não recursos já configurados. `notifications` persistente e agendador são decisões propostas; Laravel e elasticidade ficam fora da base obrigatória.

## Contexto do sistema

```mermaid
flowchart LR
    V[Visitante] -->|Explorar e registar| S[Do Campo à Mesa]
    C[Comprador] -->|Encomendar, avaliar e licitar| S
    P[Produtor] -->|Gerir catálogo, encomendas e leilões| S
    A[Administrador] -->|Aprovar, moderar e consultar| S
    S -->|Persistência gerida| M[(MongoDB Atlas)]
    S -->|Imagens| B[Azure Blob Storage]
    S -->|Mapa público: fornecedor por selecionar| MAP[Serviço de mapa]
    T[Docente] -->|Aplicação, Swagger e defesa| S
```

Mapa é requisito funcional; fornecedor externo é uma alternativa por validar Q11. Papéis não representam serviços separados.

## Contentores lógicos e alojamento

```mermaid
flowchart TB
    U[Utilizador no browser]
    subgraph AZ[Microsoft Azure]
        SWA[Static Web Apps: assets da SPA]
        subgraph AS[App Service: uma instância inicial]
            API[Processo Node.js: Express e Socket.IO]
            JOB[Agendador interno no mesmo processo]
        end
        BLOB[Blob Storage: imagens]
    end
    SPA[SPA React executada no browser]
    DB[(MongoDB Atlas: serviço externo gerido)]
    U -->|HTTPS: carregar aplicação| SWA
    SWA -->|HTML, CSS e JavaScript| SPA
    U -->|Interação| SPA
    SPA -->|HTTPS: REST com bearer JWT| API
    SPA <-->|Ligação segura Socket.IO e WebSocket| API
    SPA -->|HTTPS: ler imagens| BLOB
    API -->|Mongoose: TLS e transações| DB
    API -->|Upload autorizado| BLOB
    JOB -->|Serviços internos e datas persistidas| API
```

O browser estabelece sockets diretamente com App Service. O agendador não tem publicação independente. MongoDB e Blob não são acessíveis para escrita com segredos enviados ao frontend.

## Componentes principais do backend

```mermaid
flowchart TB
    REST[Rotas e controladores REST]
    SOCKET[Gateway Socket.IO]
    AUTH[Autenticação, RBAC e propriedade]
    subgraph MONO[Monólito modular: serviços de aplicação]
        IDENT[Identidade e utilizadores]
        PROD[Produtores e aprovação]
        CAT[Produtos e catálogo]
        ORD[Encomendas e stock]
        REV[Avaliações e moderação]
        AUC[Leilões e licitações]
        NOT[Notificações]
        ADM[Administração e indicadores]
    end
    JOB[Agendador interno]
    DATA[Repositórios Mongoose e unidade transacional]
    ATLAS[(Atlas)]
    STORE[Serviço de imagens]
    BLOB[Blob Storage]
    REST --> AUTH
    SOCKET --> AUTH
    AUTH --> IDENT
    AUTH --> PROD
    AUTH --> CAT
    AUTH --> ORD
    AUTH --> REV
    AUTH --> AUC
    AUTH --> ADM
    JOB --> AUC
    ORD --> NOT
    AUC --> NOT
    IDENT --> DATA
    PROD --> DATA
    CAT --> DATA
    ORD --> DATA
    REV --> DATA
    AUC --> DATA
    NOT --> DATA
    ADM --> DATA
    DATA --> ATLAS
    CAT --> STORE
    PROD --> STORE
    STORE --> BLOB
    NOT -->|Após commit| SOCKET
    AUC -->|Após commit| SOCKET
```

Dependências representam chamadas internas e acesso coordenado; não mensageria entre microsserviços. `NOT` é proposta para notificações persistentes. Broadcasts de licitações continuam sob responsabilidade de `AUC`, após commit, sem exigir uma coleção de notificações por participante.

## Componentes da SPA

```mermaid
flowchart LR
    R[React Router] --> PUB[Catálogo e perfis públicos]
    R --> BUY[Carrinho, encomendas e sala de leilão]
    R --> PRO[Painel do produtor]
    R --> ADM[Painel administrativo]
    SES[Context de sessão] --> R
    CART[Context de carrinho] --> BUY
    UI[Componentes Bootstrap e SCSS Mobile First] --> PUB
    UI --> BUY
    UI --> PRO
    UI --> ADM
    PUB --> HTTP[Cliente REST tipado]
    BUY --> HTTP
    PRO --> HTTP
    ADM --> HTTP
    BUY --> HOOK[useLeilao: ligação por página]
    PRO --> HOOK
    SES --> PERSONAL[Socket pessoal no âmbito da sessão]
```

Guardas de routing melhoram navegação; a API volta a autorizar todas as operações. Não existe confiança no papel declarado pelo browser.
