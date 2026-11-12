# Documentação — Do Campo à Mesa

## Começar e avaliar

- [README principal](../README.md): funcionalidades, instalação, perfis, testes e limites.
- [Execução local e revisão académica](delivery/local-execution.md): serviços reais, contas fictícias, Swagger, leilões e resolução de problemas.
- [Configuração da API](../apps/api/README.md) e [índice técnico da API](api/README.md).
- [Contrato OpenAPI](api/openapi.yaml) e [sistema visual](design/design-system.md).
- [Carrinhos por comprador e compra de lotes vencedores](api/phase-14.2-cart-auction-purchase.md): correções da Fase 14.2 e respetivas limitações.

## Requisitos e arquitetura originais — Fase 0

Os nove documentos seguintes são preservados sem alterações e representam a análise inicial. As decisões posteriores e os esclarecimentos atuais do docente estão contextualizados no guia local e nas especificações de cada fase.

- [Requisitos funcionais](requirements/functional-requirements.md).
- [Requisitos não funcionais](requirements/non-functional-requirements.md).
- [Casos de uso](requirements/use-cases.md).
- [Visão do sistema](architecture/system-overview.md).
- [Diagrama de arquitetura](architecture/architecture-diagram.md).
- [Consistência dos leilões](architecture/auction-consistency.md).
- [Decisões de arquitetura](architecture/decisions.md).
- [Modelo de dados](database/data-model.md).
- [Planeamento original](planning/implementation-plan.md).

## Contratos, decisões e evolução

- [Decisões da API](api/decisions.md), [segurança](api/security.md), [mapeamento de dados](api/data-mapping.md), [rastreabilidade](api/traceability.md) e [planeamento técnico](api/implementation-plan.md).
- [Integração frontend/API](api/frontend-integration.md).
- [Preparação de produção e Swagger](api/phase-12-production-readiness.md).
- [Preparação Cloud](deployment/phase-13a-cloud-deployment.md): sem deployment ou armazenamento Cloud ativo.

Os documentos `phase-*` em `api/` preservam regras, decisões aprovadas e limitações específicas. O [índice da API](api/README.md) permite consultar essa evolução. Não foram removidos por serem de fases anteriores.

## Histórico e autoria

O histórico Git preserva as versões anteriores dos README, incluindo as existentes no commit `204acb199a7181eb765f6ccd88505c7b8a7412f6`; não se mantêm cópias redundantes desses textos neste diretório. Os documentos técnicos de cada fase e os nove originais continuam preservados.

A [declaração de bibliotecas e assistência de IA](../README.md#bibliotecas-e-assistência-de-ia) mantém a identificação do apoio de Codex e da skill Sites, bem como a responsabilidade do estudante pela revisão, compreensão e autoria do trabalho.
