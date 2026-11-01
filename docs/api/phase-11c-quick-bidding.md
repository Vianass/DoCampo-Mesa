# Fase 11C — licitações rápidas

Implementação local a partir de `849fe1108c7c90b3d032f62d7c9871d02bfb2813`, na branch `feat/api-foundation`. Sem staging, commits, push ou alteração dos nove documentos originais da Fase 0. Esta fase não inicia a Fase 11D.

## Rastreabilidade e âmbito

O enunciado original exige atalhos **+5 / +10 / +25 €** na sala do comprador (p. 10), mínimo validado, histórico em direto e recusa visível (pp. 21–22). Na matriz da auditoria 11.0, isto corresponde a **RF-LEI-04 / G12 P0**. A preservação de RF-LEI-03/05/06/07, RNF-CON-01 e RF-AUT-02/03 cobre atomicidade, histórico, relógio, ciclo de ligação e autorização. Não se infere uma listagem global de participações ou uma compra automática do lote.

A auditoria foi consultada com a matriz e as páginas relevantes do PDF original, de SHA-256 `ff42084c30a5a663ce4165ae301c5255dd313f710e51af446fd5dbffe3925243`. As aprovações posteriores 11A/11B resolvem as respetivas lacunas; a matriz 11.0 é uma fotografia histórica, não o estado atual de toda a plataforma.

## Semântica aprovada nesta execução

O PDF exige os três atalhos, mas não explicita a base de cálculo na legenda. O utilizador aprovou expressamente:

1. Somar ao **último valor atual confirmado pelo servidor**, sem acumular sobre o campo manual.
2. Antes da primeira oferta, esse valor atual é o preço base, conforme o modelo da p. 21 e a decisão existente.
3. Desativar um atalho abaixo do incremento mínimo ou acima do teto existente.
4. Preparar o valor sem o enviar; só «Confirmar oferta» submete.

Exemplo: valor atual de 12,00 € e incremento mínimo de 1,00 € produzem 17,00 €, 22,00 € e 37,00 €. Com incremento mínimo de 10,00 €, +5 € fica indisponível; +10 € prepara 22,00 €. Não se soma ao mínimo de 13,00 €, nem ao valor escrito, nem se arredonda um atalho insuficiente. O incremento é um mínimo, não uma exigência de múltiplos.

## Interface e acessibilidade

`QuickBidForm` reutiliza o formulário, os botões, os preços, o campo manual e a confirmação existentes. Os atalhos têm nomes acessíveis, `aria-pressed`, resultado visível e motivos de indisponibilidade. O utilizador pode alterar o valor manualmente ou cancelar a preparação, sem pedidos de escrita. Depois de cancelar, tem de escolher ou escrever novamente antes de confirmar.

O botão «Confirmar oferta» é a confirmação explícita; não se acrescenta uma segunda interface ou modal. A ordem do teclado mantém o campo seguido da confirmação. A seleção de um atalho, Enter num atalho ou cancelamento não envia uma licitação.

O valor a confirmar tem anúncio `polite`; erros de validação conservam o único `role=alert` associado ao campo. Estado selecionado, foco e contraste usam a identidade existente. A mudança de cores do botão é imediata, evitando perda de contraste durante uma interpolação; apenas a borda mantém transição. O layout usa três colunas adaptadas à largura disponível, sem novos tokens de design.

## Cêntimos e teto

`quick-bids.ts` calcula somas com `BigInt` e devolve apenas inteiros seguros. Mantém-se `Number.MAX_SAFE_INTEGER` em cêntimos, o teto já aceite pelo backend. O parser manual existente rejeita notação exponencial, valores negativos, mais de duas casas ou transbordo.

A revisão detetou uma perda de precisão visual no formatador partilhado: dividir o teto por 100 antes de o formatar apresentava 90 cêntimos em vez de 91. `formatPrice` passou a separar euros e cêntimos inteiros, conservando a formatação portuguesa e o resultado normal/negativo. Não altera montantes, contratos, limites, stock ou cálculos transacionais. Há regressão específica para o último cêntimo permitido.

## Concorrência e preparação desatualizada

O clique prepara uma quantia fixa. Quando o valor atual ou o incremento muda, o formulário conserva essa quantia e bloqueia a confirmação até o utilizador rever. Os botões mostram novas sugestões calculadas sobre o estado confirmado mais recente; não aumentam silenciosamente o campo escolhido.

Se a quantia antiga continuar suficiente, «Manter este valor» permite confirmá-la explicitamente. Se ficar abaixo do mínimo, esse controlo fica indisponível: é necessário escrever outro valor ou escolher outro atalho. Mesmo depois da revisão, uma alteração concorrente pode provocar HTTP/ACK 409; a decisão continua no servidor.

Rascunhos não submetidos ficam apenas em memória. Na sala `/leiloes/:id`, revalidações transitórias da sessão/consulta preservam o formulário, com interações bloqueadas enquanto o acesso ou os dados não estão confirmados. Uma recusa 401/403/404 não conserva uma sala utilizável; logout, troca de conta, navegação/guardas que desmontem a página e reload eliminam a preparação não submetida. Não se guarda o rascunho em localStorage/sessionStorage.

## API, Socket.IO e autoridade

Não existem novos endpoints, canais ou formatos de payload. O envio reutiliza `useAuctionRoom` → `auction:bid`, com valor e chave da tentativa, e o mesmo serviço utilizado por `POST /api/auctions/{id}/bids`. Ver [OpenAPI](openapi.yaml), [interface dos leilões](phase-6c-react-auctions.md) e [protocolo Socket.IO](phase-6b-socketio.md).

O cliente reutiliza versões e sequências para eventos repetidos, antigos ou incoerentes. Na entrada/reconexão/consulta explícita, complementa o snapshot Socket com `GET /api/auctions/{id}` autenticado antes de habilitar as ofertas. REST atrasado não substitui uma versão mais recente; erro de reconciliação bloqueia a operação e permite recuperação. A atualização de metadados sem ofertas é pedida uma vez por versão, evitando ciclos de renderização ou tempestades de consultas enquanto a leitura está pendente. O histórico continua paginado pela API; não é reconstruído com ofertas especulativas.

O relógio sincronizado existente determina apenas a apresentação e o bloqueio preventivo. `$$NOW`, o predicado de mínimo/versão/sequência, a transação, os índices únicos e o serviço backend permanecem intactos. Só a aceitação persistida atualiza a liderança. O encerramento e o vencedor não são decididos no React.

## Segurança e recuperação

JWT em memória, conta ativa, capacidades atuais, propriedade e proibição de auto-licitação continuam a ser verificados no backend. Atalhos não concedem papéis nem permitem enviar durante reconexão, expiração, encerramento, cancelamento ou tentativa incerta. Os participantes continuam pseudonimizados.

Uma tentativa enviada é diferente de uma preparação cancelável: preserva a mesma chave e o mesmo valor para recuperar o resultado. Atalhos e edição ficam bloqueados enquanto existe uma tentativa incerta. Não há repetição automática com um valor recalculado nem cancelamento de uma oferta já aceite. O recibo confirmado limpa a preparação sem recriar o campo ou perder o foco.

## Testes e revisão

Novos testes:

- `quick-bids.spec.ts`: os três cálculos, mínimo, limites, valores malformados, cêntimos e preservação de base confirmada.
- `quick-bid-live.spec.ts`: reconciliação REST, snapshot atrasado, eventos repetidos/antigos, acesso recusado, falha de rede e consultas concorrentes agrupadas.
- `quick-bids.real.spec.ts`: React/API/Socket.IO/MongoDB reais, preparação sem escrita, edição/cancelamento, confirmação, dupla submissão, corrida entre compradores, reconexão, conservação/revisão do valor, recuperação da mesma tentativa, mínimo/teto, encerramento/cancelamento, JWT inválido, falta de capacidade, conta desativada, teclado e seis larguras.

Os cenários reais criam exclusivamente contas e produtos fictícios na base efémera `docampo_test_web_*`; a criação de leilões e licitações percorre os serviços reais. O cenário de recuperação prepara uma tentativa já persistida com a chave original e confirma o replay via Socket; não é uma afirmação de que todas as formas de perda de rede foram reproduzidas fisicamente. Não se usam esses dados no ambiente de produção.

Os clientes de teste partilham o IP local. Os novos cenários têm cadência mínima de dez segundos para respeitar o limite real de 120 pedidos/minuto, sem desativar ou aumentar limites do backend. A segurança e a limitação continuam cobertas pela suite backend. Esta execução não constitui um ensaio de carga de produção.

Durante a revisão global, o utilizador autorizou expressamente correções mínimas em três ficheiros de testes anteriores. O mock de encomendas do produtor separa agora o erro da escrita (`writeStatus`) do resultado das leituras: os cenários 409/412/503 continuam a verificar a mensagem, o bloqueio, uma única escrita e a recuperação, sem fazer falhar também uma leitura concorrente. Na descoberta real, a deslocação e a verificação de carregamento da imagem são repetidas de forma limitada, voltando a resolver o locator se a reconciliação substituir o elemento. Mantêm-se os testes de imagem, relógio, alinhamento, contraste, overflow e erros. Não se desativa o tempo real, não se omitem testes e não se alteram funcionalidades de encomendas ou descoberta.

As primeiras execuções globais também registaram perdas de ligação ao Vite com recarregamento e perda da sessão em memória. Os traces foram preservados fora do repositório; as suites de browser são repetidas separadamente, sem builds ou alterações de código em paralelo. Estes incidentes e os resultados das repetições são discriminados no relatório, sem apresentar uma execução falhada como aprovada.

Responsividade: **320, 430, 768, 1024, 1280 e 1440 px**, com escolha por teclado, valor preparado, confirmação, mensagens, histórico, temporizador, contraste e ausência de overflow. `DOCAMPO_QUICK_BID_SCREENSHOTS` guarda capturas e medições fora do repositório. Imagens e dados são aguardados antes da captura. VoiceOver audível só pode ser declarado quando houver reprodução e inspeção efetivas; não equivale a uma inspeção da árvore acessível.

Validações da entrega: backend completo, frontend completo, integrações reais, regressões reais de leilões, TypeScript API/frontend, ESLint, Prettier com ignore da raiz, builds, OpenAPI/referências, Markdown, pesquisa de segredos, `git diff --check` e comparação dos nove documentos originais da Fase 0. Resultados e eventuais limitações da execução são discriminados no relatório final, sem contar repetições como testes distintos.

Resultado final: **1 870 testes backend + 650 frontend habituais + 169 integrações reais + 12 regressões reais de leilões = 2 701 testes distintos aprovados**. Incluem 34 novos testes (14 de cálculo/modelo, 4 do cliente tempo real e 16 cenários reais). As suites finais de browser foram executadas sequencialmente, com um único worker no frontend habitual e sem repetição automática de testes. Os 19 testes focados de encomendas também passaram; não são somados novamente. As falhas anteriores e as correções autorizadas permanecem registadas, sem alterar a lógica da aplicação ou as verificações exigidas pelos testes antigos.

## Requisitos complementares e pendências

Incluídos apenas os complementos necessários à experiência de licitação: confirmação/cancelamento de preparação, oferta desatualizada explícita, proteção durante revalidação/reconexão, reconciliação REST, precisão visual no teto e acessibilidade dos atalhos. G12 é a lacuna P0 diretamente resolvida.

G09/G10 (rota/estado das encomendas), G11 (alcance das notificações de encomendas), G08 (denúncias/moderação), G13–G19 (serviços, Swagger, Cloud, decisões formais e operação) exigem os respetivos âmbitos/aprovações e não são implementados aqui. G20 inclui a instabilidade histórica de `datetime-local`, que não é ocultada através da alteração de testes anteriores. As melhorias opcionais de participações globais/outbox/refresh token não passam a requisitos obrigatórios.

Limitações: latência e falhas de rede podem causar conflito mesmo após revisão; o servidor é sempre a autoridade. A preparação não submetida não sobrevive a reload/logout. Não há reserva de preço, extensão do prazo, revogação de licitação, auto-encomenda do vencedor, novo pagamento ou garantia de entrega exatamente uma vez. As observações locais não certificam integralmente acessibilidade, outros browsers ou desempenho Cloud.

## Revisão local e Git

Com o MongoDB de teste disponível, a partir da raiz:

```sh
DOCAMPO_QUICK_BID_SCREENSHOTS=/private/tmp/docampo-11c-capturas npx playwright test quick-bids.real.spec.ts --config playwright.integration.config.ts
npx playwright test --config playwright.auctions.config.ts
```

Executar as suites reais sequencialmente: partilham portas e helpers de bases efémeras. Para revisão manual, usar o ambiente isolado de [leilões 6C](phase-6c-react-auctions.md), com contas fictícias, e abrir `/leiloes/:id`. Escolher cada atalho, verificar o valor sem escrita, editar/cancelar e só depois confirmar; usar outro comprador para alterar o valor, reconectar e verificar o bloqueio/revisão. Não usar credenciais ou dados de produção.

Proposta futura, sem a executar: `feat(auctions): add quick bid increments`, para `origin/feat/api-foundation`, apenas após autorização expressa.
