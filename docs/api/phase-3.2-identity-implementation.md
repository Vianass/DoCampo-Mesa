# Fase 3.2 — primeiro bloco implementado: users e producers

Implementação local autorizada em 2026-10-17, na branch `feat/api-foundation`, base publicada `68f41ec`. A01/A02/A03 aprovadas pelo utilizador, incluindo o perfil alargado descrito nesta entrega. Não implementa products/orders/auctions/bids/reviews nem integra o frontend. Os nove documentos da Fase 0 permanecem históricos e inalterados.

## Âmbito e estrutura

- [user.model.ts](../../apps/api/src/modules/users/user.model.ts): tipos, schema e factory `createUserModel(connection)`; coleção users.
- [producer.model.ts](../../apps/api/src/modules/producers/producer.model.ts): tipos, schemas embebidos e factory `createProducerModel(connection)`; coleção producers, modelo ProducerProfile.
- [model-validation.ts](../../apps/api/src/modules/shared/model-validation.ts): normalização/validação de texto e datas, e guardas de escrita usadas pelos dois modelos.
- [testes unitários](../../apps/api/tests/unit/identity-models.spec.ts), [testes MongoDB](../../apps/api/tests/integration/identity-models.spec.ts) e [dados fictícios dos testes](../../apps/api/tests/support/identity-fixtures.ts).

As factories recebem uma conexão explícita e reutilizam o modelo apenas nessa conexão. Não usam uma ligação global, não registam modelos no arranque da API nem criam coleções em desenvolvimento. `autoCreate:false`, `autoIndex:false`, `bufferCommands:false`; criação de coleções/índices explícita somente na base isolada dos ensaios. A API existente conserva exclusivamente GET /api/health; nenhum ficheiro do pipeline HTTP/runtime foi alterado.

## users — campos e validações

| Campo                 | Persistência e regras                                                                                                                                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| _id                   | ObjectId gerado, estável e independente do nome. DTO futuro usa ID opaco.                                                                                                                                                          |
| nome                  | Nome completo obrigatório; NFC/trim, 1–120 pontos de código Unicode. Não inventar uma regra de duas palavras.                                                                                                                      |
| emailNormalizado      | Obrigatório; NFC/trim/minúsculas, formato validado com Zod existente e máximo 254 caracteres. Sem remoção de pontos/aliases nem normalização específica de fornecedores.                                                           |
| passwordHash          | Obrigatório, String sem coerção. Aceita apenas representação bcrypt de 60 caracteres, variantes 2a/2b/2y e custo estrutural 04–31. Nunca guarda password em claro. Não escolhe o custo futuro de hashing.                          |
| papeis                | Array obrigatório não vazio, sem duplicados, enum comprador/produtor/administrador, sem coerção de escalar para array ou de números para texto. Permite comprador+produtor. Sem papel visitante ou atribuição automática de admin. |
| createdAt / updatedAt | Timestamps Mongoose, datas UTC.                                                                                                                                                                                                    |

Índice adicional: **emailNormalizado único**. O índice _id é o intrínseco de MongoDB. A unicidade não depende de consulta prévia e é ensaiada sob concorrência. O schema aceita internamente o papel administrativo para o futuro procedimento controlado; não existe qualquer registo público ou comando de atribuição de papéis.

`passwordHash` tem `select:false`. toJSON/toObject eliminam-no mesmo depois de uma leitura interna explícita com +passwordHash. Essa leitura é reservada a código interno futuro de verificação bcrypt; o formato validado **não prova a origem criptográfica de uma string** e o modelo não calcula nem compara passwords. O teste usa uma constante pública fictícia e não conhece credenciais reais.

## producers — campos e relações

| Campo                 | Persistência e regras                                                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| _id / userId          | ID próprio do perfil; userId obrigatório, ObjectId ref User e imutável. Índice único userId assegura no máximo um perfil por conta.                                                                                 |
| nomePublico           | Nome da exploração/negócio obrigatório; NFC/trim, 1–160 pontos de código.                                                                                                                                           |
| nomeResponsavel       | Virtual de leitura derivado de userId após populate com nome. Não é persistido, não aceita valor forjado e não duplica nome da conta. Sem populate/conta disponível fica ausente.                                   |
| localidade            | Obrigatória; NFC/trim, 1–120 pontos de código.                                                                                                                                                                      |
| concelho              | Obrigatório, String não vazia após NFC/trim. Sem lista oficial ou taxonomia inventada.                                                                                                                              |
| descricao             | Descrição da atividade obrigatória; NFC/trim, 1–5000 pontos de código. Substitui a proposta anterior de descrição opcional.                                                                                         |
| telefone              | Contacto obrigatório e não vazio, sem coerção; select:false e retirado no JSON. Não impõe formato português, indicativo ou número de dígitos não aprovados. Publicação/contactos ficam para DTO/permissões futuros. |
| imagem                | Metadados opcionais de uma fotografia/logótipo: url HTTP(S) absoluta sem credenciais; alt opcional não vazio quando fornecido. Sem bytes, upload, credenciais Blob ou pedidos externos ao URL.                      |
| aprovacao             | Subdocumento obrigatório, sem _id próprio; inicia pendente, com submetidaEm do servidor e sem decisão.                                                                                                              |
| createdAt / updatedAt | Timestamps Mongoose UTC.                                                                                                                                                                                            |

Índice adicional: **userId único**; além do _id intrínseco. Não acrescenta índices de fila, papéis, localidade ou geografia sem consulta que os justifique.

A relação liga o perfil à conta; a leitura tipada pode fazer populate apenas do nome para obter o responsável. O JSON do perfil converte uma conta populada de volta ao ID, evitando publicar a conta inteira. Não duplica email, hash ou outros dados de autenticação no perfil. toObject continua ferramenta interna, não é DTO público.

## Candidatura e decisão embebida

Estados exclusivos: pendente/aprovado/rejeitado. Submissão e decisão usam Date válidas no modelo; consumidores internos têm de construir Date explicitamente, sem casts de booleanos/números/strings. Apresentação/DTO futuro usa ISO e não foi implementado.

- Pendente: decisão ausente; uma decisão parcial, concluída ou null não é aceite nesse estado.
- Aprovado/rejeitado: decisão obrigatória com autor ObjectId ref User e data válida, não anterior à submissão.
- Rejeitado: justificação obrigatória e não vazia após NFC/trim, até 2000 pontos de código.
- Aprovado: justificação opcional; quando presente, tem os mesmos limites.
- Autor da decisão excluído das leituras por omissão e do JSON do perfil. Leitura interna explícita pode selecioná-lo.

Estas regras validam a representação, não executam aprovação/rejeição. Não existe endpoint, serviço de decisão, recandidatura, revogação ou publicação de produtos. Ter papel produtor não equivale a aprovação nem concede venda.

## Escritas suportadas e limites de integridade

Neste bloco interno, suportam-se criação com create/new+save e alteração de documento com save e validação completa. strict:throw recusa campos desconhecidos, incluindo password em claro no User ou credenciais no perfil. Queries updateOne/updateMany/findOneAndUpdate/replaceOne/findOneAndReplace, bulkWrite e insertMany são recusadas; findByIdAndUpdate segue a mesma guarda. Não permitir save com validação desligada, validateModifiedOnly ou pathsToSave. Não introduzir uma via HTTP para contornar estas guardas.

**Limites explícitos:** ref não é chave estrangeira. Os modelos não consultam outras coleções para comprovar existência/papel da conta ou competência administrativa do autor; isso pertence ao serviço/autorização futuros, como previsto na preparação aprovada. Um teste demonstra uma referência que fica órfã e o populate sem conta, evitando alegar proteção que não existe. Não existem transações de criação conjunta de conta/perfil nem prevenção de concorrência entre decisão/alteração de papéis. As transações técnicas da fundação continuam testadas.

O acesso direto a Model.collection/driver, projeções internas explícitas e opções que desativem transformações não são uma API segura. lean não aplica transformações de documento: seleção por omissão protege o hash, mas uma seleção explícita +passwordHash em lean é leitura privada e não pode ser devolvida. DTOs e middleware reais continuam necessários. Estas guardas são técnicas, não uma fronteira contra código interno com acesso à base de dados.

## Testes e verificações executados

| Verificação                | Resultado                                                                                                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript API / frontend  | Aprovados separadamente.                                                                                                                                                      |
| ESLint monorepo            | Aprovado.                                                                                                                                                                     |
| Prettier raiz e docs/api   | Aprovados.                                                                                                                                                                    |
| Build API                  | Aprovado, sem instalar dependências.                                                                                                                                          |
| Unidade                    | 81 aprovados: 19 existentes + 62 novos.                                                                                                                                       |
| HTTP                       | 22 existentes aprovados; nenhum endpoint privado/comercial disponibilizado.                                                                                                   |
| Integração MongoDB         | 21 aprovados: 8 existentes + 13 novos, sem mocks de persistência.                                                                                                             |
| Suite API completa         | **124 testes aprovados em 6 ficheiros**, incluindo os 49 anteriores.                                                                                                          |
| Frontend                   | Código, estilos, navegação, carrinho, áreas privadas e testes preservados byte a byte; 274 Playwright é referência anterior, não nova execução.                               |
| Documentação / integridade | Ligações locais, OpenAPI apenas com metadados/descrições de aprovação atualizados, estrutura preservada, exemplos e nove F0 verificados; sem alteração de manifests/lockfile. |

Os ensaios novos cobrem campos obrigatórios/tipos/limites, normalização e aliases, papéis acumulados/inválidos, hash/serialização, estado inicial, decisões coerentes/incoerentes, imagens, isolamento por conexão, timestamps, responsável atualizado na conta, proprietário imutável, índices reais e conflitos concorrentes, guardas de escrita e limite referencial.

MongoDB 8.0.34 real no replica set rs-dcm-test, 127.0.0.1:27019, com nome docampo_test_<uuid> por suite; sem .env, Atlas ou fallback para desenvolvimento. Só a base aleatória do ensaio é eliminada no final; índices são criados/aguardados explicitamente. O contentor de teste, inicialmente parado, foi iniciado sem descarregar imagens e é parado após as verificações; o ambiente de desenvolvimento não é alterado.

Uma execução inicial dos testes de ciclo de vida encontrou EPERM da sandbox e passou ao ser repetida com a permissão de sockets necessária. Foram corrigidas incompatibilidades de tipagem durante o desenvolvimento e um teste passou a esperar a rejeição da alteração de userId imutável, em vez de esperar uma alteração silenciosamente ignorada. Asserções usam validate assíncrono, evitando a API validateSync descontinuada na versão instalada. Nenhuma falha fica pendente no resultado final.

## Estado e próxima revisão

Implementado apenas este bloco local. Não há autenticação, JWT, hashing operativo, registo, candidatura HTTP, aprovação administrativa HTTP, upload, dados reais ou novos modelos. C04 continua aplicada: operações privadas inacessíveis até segurança real na semana 4. Restantes Q/C/residuais conservam os momentos do [plano de prontidão](phase-3.2-readiness.md).

Sem staging, commits, push, branches, merge ou PR; main permanece c10d031. A revisão desta entrega e qualquer avanço/publicação precisam de nova autorização explícita.

## Correção autorizada de serialização e consolidação local

Após a revisão para os commits, reproduziu-se uma falha num documento parcial: uma projeção sem aprovacao fazia o transform JSON aceder a aprovacao.decisao e lançar TypeError. A consolidação foi interrompida antes de staging/commits; o utilizador autorizou posteriormente a correção mínima e um teste de regressão.

A única alteração funcional nesta correção é a guarda `value.aprovacao?.decisao`, que mantém a remoção do autor da decisão quando este existe e permite serializar projeções sem candidatura. Não altera campos, estados, validações de aprovação, contratos, endpoints ou autenticação.

O novo teste unitário verifica documento completo aprovado, documento hidratado com projeção sem aprovacao, serialização sem erro e remoção de telefone/autor, sem hash exposto. As regras existentes de aprovação/rejeição continuam cobertas pela suite completa.

Verificações repetidas após a correção: **81 unitários + 22 HTTP + 21 de integração MongoDB real = 124 aprovados**, incluindo os 123 anteriores. TypeScript API/frontend, ESLint, Prettier, build da API e verificações documentais aprovados; frontend/dependências/F0 preservados. MongoDB de teste reposto no estado parado depois das verificações, sem alterar desenvolvimento.

A autorização posterior permite exclusivamente dois commits locais, com documentação de preparação/consolidação no primeiro e modelos/testes/fixtures/este relatório no segundo. Não autoriza push, branches, merge, PR ou modelos seguintes. Os registos anteriores sem operações Git descrevem a entrega original.
