# Fase 11A — Gestão real do produtor

Implementação local para revisão; sem commit, push ou deployment. Base: `50164be0ea90925c8d8bd2909fb4c73e7dc681fc`, branch `feat/api-foundation`. Os registos das fases anteriores mantêm o seu contexto histórico. Os nove documentos originais da Fase 0 não são alterados.

## Rastreabilidade e decisões

A auditoria 11.0 e o PDF original foram consultados antes da implementação. A lista inicial de lacunas foi registada fora do repositório, juntamente com hashes dos ficheiros existentes.

| Lacuna da auditoria | Requisito                                  | Entrega desta fase                                                                                                       |
| ------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| G03                 | RF-PRO-01, gestão de catálogo              | Criar rascunhos, consultar, editar, publicar e arquivar com API/MongoDB e React reais.                                   |
| G05                 | RF-PRO-01, fotografias                     | Envio binário, validação, duas imagens por produto, substituição, principal, texto alternativo e remoção de referências. |
| G06                 | RF-PRO-02, perfil e condições comerciais   | Edição dos campos autorizados e condições da loja, com persistência e atualização do perfil público.                     |
| G07                 | RF-PRO-03/RF-PRO-04, indicadores e alertas | Contagens persistidas, stock livre, indisponibilidade, limiar opcional e médias de avaliações separadas.                 |

O enunciado não exige destruição física de produtos: mantém-se o `DELETE` existente, que arquiva e preserva referências e snapshots. Não se cria um segundo CRUD. A remoção de um produto publicado retira-o do mercado sem apagar encomendas ou leilões.

Esclarecimentos aprovados pelo utilizador:

- Limiar opcional por produto, em g, ml ou unidades segundo a venda; sem valor numérico por defeito. Stock zero é sempre indisponível. Esta aprovação resolve apenas o detalhe do limiar de Q15, sem decidir todos os indicadores futuros.
- Adaptador de fotografias de desenvolvimento numa pasta configurável fora do repositório, substituível por Cloud; configuração de produção recusa o adaptador local.

## Arquitetura

O catálogo reutiliza os modelos, validações, autorização e transações existentes. O novo módulo `producer-management` separa contratos HTTP, serviço e rotas. O módulo `images` separa descodificação/normalização, armazenamento, associação ao recurso e HTTP. Os formulários React, contratos, estado remoto e estilos ficam em `features/producer-management` e `_producer-management.scss`.

O MongoDB continua a ser a fonte de verdade. Não há cópia editável demonstrativa nem alteração dos dados públicos globais em memória. O perfil grava no documento `producers`, o limiar opcional em `products` e a propriedade imutável de cada ficheiro em `imageAssets` (`_id` do ficheiro, conta autora e data). Esta coleção privada não expõe endpoint de listagem. A aprovação e a aquisição de papéis continuam a pertencer à candidatura/administração existentes.

## Endpoints

Ver o contrato completo em [openapi.yaml](openapi.yaml).

| Método e caminho                   | Comportamento                                                                                                  |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `POST /api/products`               | Cria rascunho com os campos editáveis existentes e limiar opcional.                                            |
| `GET /api/me/products`             | Produtos próprios; pesquisa, estado, categoria, situação de stock, ordenação e paginação no backend.           |
| `GET /api/me/products/:id`         | Detalhe próprio, ETag e quantidades ainda afetas a leilões, separadas do stock livre.                          |
| `PUT /api/products/:id`            | Substituição completa dos campos editáveis, com `If-Match`; omissões removem campos opcionais.                 |
| `DELETE /api/products/:id`         | Arquivo lógico com o ETag atual, preservando histórico.                                                        |
| `GET /api/me/producer`             | Perfil e condições comerciais próprios; inclui dados privados necessários à edição.                            |
| `PUT /api/me/producer`             | Substituição completa do perfil editável e configuração comercial, com `If-Match`.                             |
| `GET /api/me/producer/indicators`  | Produtos não arquivados, publicados, sem stock, stock reduzido e médias separadas de avaliações públicas.      |
| `POST /api/me/products/:id/images` | Acrescenta uma fotografia; `?substituir=0` ou `1` substitui a fotografia indicada.                             |
| `POST /api/me/producer/image`      | Substitui a fotografia do próprio perfil.                                                                      |
| `GET /api/media/:id`               | Bytes WebP públicos apenas quando o recurso e a conta são elegíveis; rascunho apenas para o autor autenticado. |

Os envios de fotografias usam bytes JPEG/PNG/WebP diretamente no corpo e `Content-Type` correspondente, não JSON/base64 ou multipart. Exigem JWT de produtor e `If-Match`. A remoção, texto alternativo e fotografia principal usam o PUT do respetivo recurso. Os limites de débito reutilizam o mecanismo existente: perfil 240 pedidos/IP e 120/conta na janela do mecanismo; fotografias 120/IP e 30/conta. A produção não monta as rotas do adaptador local.

## Produtos, stock e concorrência

Mantêm-se categorias estáveis, preço inteiro em cêntimos, regras de rascunho/publicação, grelha de compra, ingredientes explicitamente declarados e limite de duas imagens. O formulário apresenta preço por kg/L/unidade/embalagem e stock em g/ml/un, sem converter nem somar unidades diferentes.

`limiarStockBaixo` é inteiro entre 0 e 10 000 000, opcional e privado. Não surge no DTO público. Stock positivo menor ou igual ao limiar é reduzido; zero é indisponível; sem quantidade definida o rascunho indica configuração pendente. Não há email, fornecedor externo ou valor inventado. Os filtros e contagens calculam os estados no MongoDB; as médias respeitam a moderação e distinguem produtos de produtor.

O stock editável é a quantidade **livre**. Um leilão reserva a quantidade através do serviço transacional existente; os lotes reservados, afetos ao vencedor ou com libertação pendente são apresentados à parte. Enquanto existir afetação, a edição não permite mudar a unidade/regras de quantidade. O arquivo não liberta lotes arbitrariamente. Checkout e reservas invalidam a revisão do produto; uma edição antiga falha em vez de repor silenciosamente quantidades já consumidas.

As transações de edição mantêm as guardas de utilizador/perfil e a revisão operacional. O perfil usa ETag forte opaco, guardas atuais e transação com leitura snapshot, escrita majority e primário. O frontend não confia em botões ocultos para autorizar. Conflitos 409/412 e resultados incertos bloqueiam nova escrita até consulta atualizada. Não há repetição automática de mutações sem confirmação do resultado.

## Perfil e loja

São editáveis nome público, localidade, concelho, descrição, telefone, fotografia e configuração comercial. A PUT exige `comercial`, que pode ser `null` para remover a configuração e impedir novas compras até a configurar. Os campos administrativos, conta, papéis, histórico e aprovação são rejeitados.

A configuração reutiliza as regras documentadas: levantamento/entrega explícitos, local de levantamento, taxa em cêntimos seguros, identificadores estáveis de concelhos, fuso IANA, períodos semanais não sobrepostos e métodos de pagamento direto. O formulário distingue os dados públicos do telefone/referências privadas. Não executa pagamentos, confirma titularidade de IBAN ou cria alterações retroativas nos snapshots de compras. A desativação da configuração impede novas compras, preservando as anteriores.

O catálogo nacional de concelhos ainda não está integrado: usam-se os identificadores estáveis já aceites pelo modelo, com explicação no formulário. Não há geocodificação nem mapa nesta fase. A gestão exige capacidade de produtor existente; uma candidatura pendente de comprador não concede permissões implícitas.

## Fotografias e armazenamento

`ImageStorage` é a porta substituível (`put`, `read`, base pública), sem dependência permanente do disco nas regras de negócio. Em desenvolvimento/teste usam-se ficheiros exclusivos UUID/WebP fora do repositório, pasta 0700 e ficheiros 0600. A propriedade original fica persistida e uma URL copiada para outro perfil não permite publicar uma imagem privada alheia.

Validação real com `sharp@0.35.5`: até 5 MiB e 16 megapíxeis, JPEG/PNG/WebP estáticos, formato confrontado com o MIME, descodificação completa, rejeição de ficheiros danificados/animações, orientação normalizada, saída até 1600×1600 px e sem metadados originais. Há limite de duas conversões em curso por processo e timeout de conversão de cinco segundos. SVG e formatos ativos não são aceites. O limite de duas fotografias é também aplicado na transação/modelo, não apenas no formulário.

A dependência permite validar e reencodificar os bytes, em vez de confiar em extensão/MIME. Versão exata no lockfile, sem atualizar versões anteriores. Referências oficiais: [versão 0.35.5](https://sharp.pixelplumbing.com/changelog/v0.35.5/), [limites de entrada](https://sharp.pixelplumbing.com/api-constructor/) e [instalação](https://sharp.pixelplumbing.com/install/).

Referências substituídas/removidas deixam de ser servidas. Os bytes e o registo privado podem permanecer órfãos, incluindo quando o resultado de uma transação é indeterminado: não se elimina um ficheiro que possa ter sido associado num commit confirmado. Uma futura tarefa de reconciliação/retenção, com confirmação majority e período de segurança, deverá gerir estes órfãos; não existe recolha automática nesta fase. O disco local não fornece redundância, quota global ou durabilidade Cloud; a pasta temporária por defeito pode ser limpa pelo sistema operativo.

Variáveis de desenvolvimento exemplificadas em `apps/api/.env.example`:

```dotenv
MEDIA_STORAGE=development
MEDIA_DIRECTORY=/private/tmp/docampo-media-development
MEDIA_PUBLIC_BASE=http://127.0.0.1:3001/api/media
```

A pasta tem de ser absoluta e estar fora do repositório. Base HTTP(S), sem credenciais/query/fragmento. Em produção, `MEDIA_STORAGE=development` impede o arranque; sem esse adaptador as rotas locais de imagem não são montadas. A Fase 13 terá de fornecer armazenamento Cloud, entrega/autorizações compatíveis, migração das referências, retenção e limites operacionais. Não foi contratado serviço, efetuado deployment ou declarada conformidade Cloud nesta fase.

## React, atualização pública e recuperação

Rotas integradas nas áreas existentes:

- `/area/produtor/produtos`: filtros/paginação reais e atalhos.
- `/area/produtor/produtos/novo`: criação de rascunho.
- `/area/produtor/produtos/:id/editar`: edição, fotografias e arquivo.
- `/area/produtor/perfil`: perfil, condições e fotografia.
- `/area/produtor` e `/area/produtor/indicadores`: resumo de produtos, alertas e avaliações, mantendo encomendas/vendas reais anteriores.

Os formulários preservam alterações ainda não guardadas ao recuperar o foco ou abrir o seletor de ficheiros. ETag confirma a gravação; respostas antigas são canceladas/ignoradas. A lista/indicadores reconciliam eventos da aplicação, notificações privadas de encomendas e consulta visível de 15 segundos. Eventos locais e BroadcastChannel apenas pedem nova consulta, sem transportar identidade ou JWT. Catálogo e carrinho reconciliam após mutações e regresso ao separador, preservando o tratamento das tentativas de checkout pendentes.

Não há difusão global de cada edição para todos os compradores ligados: outro dispositivo consulta no regresso/navegação, e os serviços de checkout continuam a validar preço/stock/condições. As fotografias privadas são obtidas com autorização e URL de Blob revogada na desmontagem; o token não é colocado em URLs ou armazenamento persistente.

Loading, vazio, falha, identificador inválido, sucesso e confirmação de arquivo são explícitos. Labels e texto alternativo editável, foco nas mensagens de resultado/erro, diálogo nativo com cancelamento e teclado, grelhas mobile first e estilos existentes são reutilizados.

## Validação e revisão

A evidência desta execução é guardada fora do repositório em `/private/tmp/docampo-11a-2bimnnka`. Os resultados finais, inventário e capturas constam do relatório externo, evitando artefactos de teste no Git.

Os novos testes cobrem contratos, limiar ausente/zero/inválido, privacidade, ETag concorrente, ficheiros reais/formatos/tamanho/píxeis, propriedade imutável, stock livre versus reservas e snapshots de checkout. As integrações React usam API, MongoDB e contas fictícias isoladas; incluem um produtor adquirido pelo percurso de candidatura/aprovação, configuração da loja, produto com fotografia, publicação e compra real por outro comprador.

As seis larguras 320, 430, 768, 1024, 1280 e 1440 px cobrem perfil, rascunho, fotografias, lista com alerta, indicadores, vazio e erro/recuperação. Verificam-se overflow, erros JavaScript e contraste calculado. O teste de teclado verifica contenção/restauro de foco e Escape na confirmação sem arquivar, além do foco no erro. A inspeção visual usa as capturas destas execuções. Isto não equivale a certificação WCAG nem a ensaio audível de VoiceOver; a confirmação audível requer um ambiente interativo adequado.

As suites anteriores de autenticação, checkout, receção, avaliações, administração, leilões e Socket.IO são reexecutadas. Não se altera um teste anterior para esconder uma regressão. Os testes locais não demonstram dimensionamento, SLA Cloud, recuperação de desastre ou avaliação por utilizadores reais.

## Resultados desta execução

| Validação reexecutada                              | Resultado                                                               |
| -------------------------------------------------- | ----------------------------------------------------------------------- |
| Backend completo: unitários, HTTP e MongoDB        | 1 859 testes, 57 ficheiros, aprovados                                   |
| Frontend habitual                                  | 620 aprovados                                                           |
| Integrações reais React/API/MongoDB                | 144 aprovadas                                                           |
| Regressões reais de leilões/Socket.IO              | 12 aprovadas                                                            |
| Total sem duplicar repetições                      | **2 635 testes aprovados**                                              |
| TypeScript API/frontend, ESLint, Prettier e builds | Aprovados                                                               |
| OpenAPI                                            | 78 operações, 1 029 referências e quatro respostas HTTP reais conformes |
| Ligações Markdown e âncoras locais                 | 603 ligações e cinco âncoras válidas                                    |
| Fase 0, padrões de segredos e diff --check         | Nove documentos intactos; verificações aprovadas                        |

Foram acrescentados 48 testes: 28 backend, nove de modelo frontend e 11 de integração real. A primeira execução completa real encontrou seis falhas por reutilização da classe identificadora dos indicadores de encomendas no novo resumo de inventário. O componente novo passou a usar uma classe própria com os estilos partilhados; os testes anteriores não foram alterados. A repetição completa terminou com 144 aprovações. Houve ainda correção da formatação do novo teste de teclado antes da aprovação final do Prettier.

A revisão adicional do perfil comercial expandido passou nas seis larguras, com gravação MongoDB, foco de sucesso e privacidade pública; a medição desta página teve 44 amostras por largura e contraste mínimo de 5,24:1. Foram guardadas 48 capturas fora do repositório. Não foi confirmado VoiceOver audível nem certificação de acessibilidade.

## Revisão manual

Com o replica set local, API e React configurados conforme [fundação](foundation-implementation.md), usar apenas contas fictícias. Registar comprador, submeter candidatura e aprovar com a administração existente; voltar a confirmar as capacidades com `/auth/me`. Em Perfil, configurar levantamento/entrega, horários e método direto. Criar rascunho incompleto, guardar, acrescentar fotografias, completar campos e publicar. Consultar o produto/perfil público noutro contexto e adicionar à cesta.

Experimentar stock 0, quantidade acima/abaixo do limiar e ausência de limiar. Noutro separador, criar reserva/leilão ou compra e tentar guardar uma versão antiga: deve exigir consulta atualizada, preservando a reserva/snapshot. Testar falha de rede e recuperação, rejeição de fotografia inválida, troca de principal/alt, remoção, arquivo e consulta do histórico. Rever as seis larguras e navegar por teclado. Não usar dados ou credenciais de produção.

## Limitações e próximos trabalhos

A gestão local real de catálogo/perfil/alertas fica disponível para revisão; continua pendente a migração de fotografias para Cloud, o catálogo nacional de concelhos, retenção/quota global de imagens, validação audível assistida e ensaio em infraestrutura de produção. Não há mapa, pagamentos online, alertas por email ou alterações de regras de leilão. As fases 11B/11C/11D e 13 não são iniciadas. Nenhuma operação Git de publicação está autorizada por esta implementação.
