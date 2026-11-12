# Documentação da API

A API está integrada em `main`, com autenticação, catálogo, checkout, encomendas, leilões, avaliações e administração reais. As descrições de fases anteriores registam o estado da respetiva entrega e não representam automaticamente o estado atual.

## Consultar e executar

- [Configuração da API](../../apps/api/README.md) e [guia local completo](../delivery/local-execution.md).
- [OpenAPI](openapi.yaml): contrato com propostas históricas identificadas; Swagger publica as operações efetivamente montadas em `/api-docs/`.
- [Decisões](decisions.md), [segurança](security.md), [mapeamento de dados](data-mapping.md) e [rastreabilidade](traceability.md).
- [Integração com o frontend](frontend-integration.md) e [planeamento técnico inicial](implementation-plan.md).

## Fundação e persistência — Fases 3–4

- [Proposta de fundação](phase-3.1-proposal.md) e [implementação](foundation-implementation.md).
- [Proposta de modelos](phase-3.2-proposal.md), [preparação](phase-3.2-readiness.md), [especificação dos modelos](phase-3.2-models.md) e [users/producers](phase-3.2-identity-implementation.md).
- [Products](phase-3.2-products.md), [decisões de orders](phase-3.2-orders-readiness.md) e [persistência de orders](phase-3.2-orders-persistence.md).
- [Condições comerciais](phase-3.2-producers-commercial.md) e [concorrência](phase-3.2-concurrency.md).
- [Arquitetura do checkout](phase-3.2-checkout-readiness.md), [contrato](phase-3.2-checkout-contract.md), [idempotência](phase-3.2-checkout-idempotency.md) e [transação](phase-3.2-checkout-transaction.md).

## Funcionalidades integradas — Fases 5–11

- Catálogo e autenticação React: [contratos de integração](frontend-integration.md) e [segurança](security.md).
- Leilões: [backend](phase-6a-auctions.md), [Socket.IO](phase-6b-socketio.md) e [React](phase-6c-react-auctions.md).
- Candidaturas: [backend](phase-7a-producer-applications.md), [React do candidato](phase-7b-react-producer-applications.md) e [gestão administrativa](phase-7c-admin-producer-applications.md).
- Administração: [dashboard e utilizadores](phase-8a-admin-dashboard-users.md), [encomendas](phase-8b-admin-order-supervision.md) e [leilões](phase-8c-admin-auction-supervision.md).
- [Avaliações e moderação](phase-9-reviews-moderation.md).
- [Conclusão de encomendas e notificações privadas](phase-10-orders-realtime.md).
- [Gestão real do produtor](phase-11a-producer-management.md), [descoberta e mapas](phase-11b-discovery-and-maps.md), [licitações rápidas](phase-11c-quick-bidding.md) e [denúncias/moderação](phase-11d-content-moderation.md).

## Preparação de entrega e histórico

- [Swagger, segurança e preparação de produção](phase-12-production-readiness.md).
- [Preparação Cloud](../deployment/phase-13a-cloud-deployment.md): infraestrutura preparada, sem deployment ou armazenamento Cloud ativo.
- [Carrinhos por identidade e compra de lotes vencedores — Fase 14.2](phase-14.2-cart-auction-purchase.md): política de visitante, persistência local, confirmação pelo vencedor e encomenda gerida pelo produtor.
- [Documentação original da Fase 0 e restantes guias](../README.md).

Os nove documentos da Fase 0 permanecem intactos. Os esclarecimentos do docente sobre Cloud/Laravel facultativos estão contextualizados no guia local; as formulações e versões anteriores dos README permanecem no histórico Git. A [declaração de assistência de IA](../../README.md#bibliotecas-e-assistência-de-ia) aplica-se também aos contratos e à documentação técnica.
