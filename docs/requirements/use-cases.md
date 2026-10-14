# Casos de utilização

Fontes e classes: [requisitos funcionais](functional-requirements.md). A descrição abaixo constitui um modelo de interação para validar na Fase 0. Os fluxos condicionados por Q não fixam silenciosamente regras de negócio.

## Atores e autorização

| Ator | Capacidades e restrições |
| --- | --- |
| Visitante | Catálogo e perfis públicos; registo. É ausência de autenticação, não um papel persistido. Acesso à observação de leilão aguarda Q09. |
| Comprador | Carrinho, próprias encomendas, avaliações elegíveis e licitações. |
| Produtor | Recursos e encomendas próprios, perfil, estatísticas e leilões. Publicação sujeita à decisão Q04 sobre aprovação. |
| Administrador | Aprovação, moderação e painel global; não se presume que possa editar qualquer encomenda ou licitar. |
| Serviços Cloud | Atlas e Blob fornecem persistência e imagens; não atribuem permissões comerciais. |
| Agendador interno | Processo do monólito que avalia datas e transições de leilão; ator técnico proposto D11. |

Em cada operação privada, autenticação precede autorização por papel, propriedade e estado do recurso. Falta de token → 401; falta de papel → 403; recurso ausente ou fora do âmbito de consulta pode produzir 404 conforme contrato. Frontend não constitui fronteira de segurança. E p. 20; concretização proposta RNF-SEG-04.

## UC-01 — Explorar catálogo e perfil

- **Atores:** visitante e utilizadores autenticados.
- **Requisitos:** RF-CAT-01–04; E p. 4/9.
- **Pré-condições:** produtos/perfis elegíveis para publicação existem; consultas públicas disponíveis.
- **Fluxo principal:** abrir catálogo; indicar pesquisa e filtros; consultar resultados; abrir produto e perfil; consultar mapa, produtos e avaliações; aceder ao destaque de leilão quando existe.
- **Alternativas:** nenhum resultado → mensagem e possibilidade de limpar filtros; produtor não publicado → indisponibilidade; erro da API → erro recuperável; mapa indisponível → localização textual, proposta D10.
- **Pós-condições:** dados consultados, sem alteração de stock ou de encomendas.
- **Autorização:** apenas campos públicos; política de publicação Q04; pesquisa/época Q14; mapa Q11; observação anónima Q09.

## UC-02 — Registar e autenticar

- **Atores:** visitante; comprador/produtor/administrador para login.
- **Requisitos:** RF-AUT-01–03; E p. 4/20.
- **Pré-condições:** para registo, identidade ainda não registada; para login, conta criada.
- **Fluxo principal:** escolher comprador ou produtor; preencher dados; servidor valida e guarda hash; apresentar resultado; enviar credenciais no login; receber JWT e iniciar estado de sessão.
- **Alternativas:** email duplicado → recusa segundo contrato; dados inválidos → 400; credenciais inválidas → 401; token expirado durante navegação → terminar sessão e solicitar login; produtor pendente → mostrar estado conforme Q04.
- **Pós-condições:** conta criada e/ou sessão autenticada; nenhuma candidatura automaticamente aprovada pelo cliente.
- **Autorização:** autorregisto não cria administrador; papel único ou múltiplo aguarda Q01; administrador inicial criado por mecanismo controlado, D03.

## UC-03 — Decidir candidatura de produtor

- **Ator:** administrador.
- **Requisitos:** RF-AUT-04; E p. 4/12.
- **Pré-condições:** administrador autenticado; candidatura pendente.
- **Fluxo principal:** consultar candidaturas; examinar dados; escolher aprovar ou rejeitar; persistir decisão; interface atualiza o estado.
- **Alternativas:** candidatura já decidida por outro administrador → conflito e atualização; dados insuficientes → manter pendente até decisão; nova candidatura após rejeição aguarda Q04.
- **Pós-condições:** decisão registada com autor e data, proposta D03.
- **Autorização:** só administrador; permissões de produtor são verificadas no servidor após aprovação, se a recomendação Q04 for aceite.

## UC-04 — Gerir catálogo e perfil próprios

- **Ator:** produtor.
- **Requisitos:** RF-PRO-01/02; E p. 4/17/23.
- **Pré-condições:** sessão válida; capacidades de publicação conforme Q04.
- **Fluxo principal:** criar produto; definir categoria, preço, unidade e stock; carregar fotografia; publicar; editar produto ou perfil; consultar resultado público; remover produto quando aplicável.
- **Alternativas:** dados inválidos → 400; imagem rejeitada → não associar blob; falha de storage → manter dados coerentes e permitir nova tentativa; produto já usado em encomenda/leilão → política Q12; ajuste de stock abaixo do reservado → recusa proposta D08.
- **Pós-condições:** catálogo/perfil atualizados; encomendas anteriores preservam snapshots.
- **Autorização:** papel produtor e propriedade; fotografia apenas em recurso autorizado; aprovação e remoção pendentes Q04/Q12.

## UC-05 — Finalizar carrinho

- **Ator:** comprador.
- **Requisitos:** RF-ENC-01/02; E p. 4/16/18.
- **Pré-condições:** sessão válida; carrinho não vazio; produtos elegíveis; stock suficiente; regras de unidade e entrega definidas.
- **Fluxo principal:** adicionar produtos; ajustar quantidades; escolher levantamento ou entrega; fornecer dados exigidos; confirmar; servidor relê produtos, calcula preços e valida disponibilidade; grava snapshots e encomenda pendente; apresenta identificador e total.
- **Alternativas:** stock insuficiente → nenhuma encomenda/debito parcial, proposta D08; preço alterado → apresentar total atualizado e pedir nova confirmação, recomendação Q06; repetição por timeout → recuperar resultado com a mesma chave, RF-MEL-02; vários produtores → Q02; morada/modo inválidos → 400.
- **Pós-condições:** encomenda criada; stock ajustado segundo política aceite; carrinho atualizado após confirmação inequívoca.
- **Autorização:** comprador autenticado; identidade e produtor obtidos no servidor; pagamento eletrónico não está definido em E (Q06).

## UC-06 — Consultar e atualizar encomenda

- **Atores:** comprador e produtor envolvidos.
- **Requisitos:** RF-ENC-03–05; E p. 4/10/11/22.
- **Pré-condições:** encomenda existente e sessão válida; ligação pessoal ativa para notificação imediata.
- **Fluxo principal:** comprador consulta detalhe; produtor consulta encomendas próprias e solicita novo estado; servidor valida permissão e transição; persiste; envia estado às salas pessoais do comprador e produtor; ambos atualizam a interface.
- **Alternativas:** recurso alheio → acesso recusado; estado inválido → 400; alteração concorrente → conflito e atualização; desligado → consulta REST recupera estado, com consulta de notificações se P for implementado; cancelamento/retrocesso aguarda Q05.
- **Pós-condições:** estado persistido e clientes ligados atualizados; nenhuma notificação de mudança não confirmada.
- **Autorização:** leitura limitada aos intervenientes e painel administrativo; mudança de estado reservada ao produtor responsável. Sem poder administrativo adicional implícito.

## UC-07 — Avaliar e moderar

- **Atores:** comprador, denunciante autorizado e administrador.
- **Requisitos:** RF-AVA-01/02; E p. 4/10/12.
- **Pré-condições:** entrega concluída para avaliação; avaliação existente para denúncia; regras Q10 acordadas.
- **Fluxo principal:** comprador avalia produto ou produtor; servidor valida elegibilidade e publica; utilizador denuncia conteúdo; administrador consulta denúncia e escolhe manter ou ocultar; apresentação pública e agregados refletem a decisão.
- **Alternativas:** avaliação antes de entrega → recusa; avaliação duplicada/edição → Q10; conteúdo já oculto → resposta idempotente; moderação de outros conteúdos → Q12.
- **Pós-condições:** avaliação/denúncia/decisão persistidas; ocultação não perde o histórico de decisão, proposta D09.
- **Autorização:** avaliação por comprador elegível; denúncia e identidade pública conforme Q10; moderação só por administrador.

## UC-08 — Criar e acompanhar leilão

- **Ator:** produtor.
- **Requisitos:** RF-LEI-01/02/06; E p. 4/11/18/21.
- **Pré-condições:** produtor autenticado; lote e datas válidos; publicação conforme Q04; gestão do lote conforme Q07.
- **Fluxo principal:** selecionar/descrever lote; definir preço base, incremento, início e duração; servidor valida e cria leilão; valor atual inicia no preço base sem comprador; agendador torna ativo na data prevista; produtor acompanha sala e ofertas.
- **Alternativas:** stock insuficiente se lote reservado → recusa; início no passado/duração inválida → 400; reinício após início → agendador recupera leilão; edição após primeira oferta aguarda Q08/Q12.
- **Pós-condições:** leilão agendado ou ativo; dados persistidos; nenhuma oferta simulada em `bids` para o preço base.
- **Autorização:** criador é o produtor da sessão; gerir apenas o seu leilão; acompanhamento não concede permissão para licitar.

## UC-09 — Entrar e licitar

- **Ator:** comprador; participantes autorizados como observadores.
- **Requisitos:** RF-LEI-02–07; E p. 7/10/21/22.
- **Pré-condições:** JWT válido, permissão e leilão existente; ativo e não expirado para oferta.
- **Fluxo principal:** entrar na sala; obter snapshot, histórico, fim e presença; selecionar valor/atalho; enviar pedido identificado; servidor valida atomicamente; grava valor e bid na mesma transação proposta; após commit confirma e transmite; clientes aplicam versão e atualizam histórico/contagem.
- **Alternativas:** oferta inferior ao mínimo ou igual a oferta já aceite → recusa com estado recente; duas ofertas iguais → uma ganha; fim alcançado → recusa; perda de ligação → estado incerto até consultar resultado; retry da mesma chave → mesmo resultado; sequência atrasada → ressincronizar.
- **Pós-condições:** oferta aceite corresponde a um bid persistido ou operação recusada sem alteração; clientes convergem por eventos e snapshots.
- **Autorização:** licitação exclusiva de comprador; auto-licitação/contas com vários papéis Q01; observação e presença Q09. Detalhe: [consistência](../architecture/auction-consistency.md).

## UC-10 — Encerrar leilão

- **Ator:** agendador interno; comprador vencedor e produtor como destinatários, se aplicável.
- **Requisitos:** suporte técnico a RF-LEI-01/03/06; estados em E p. 18; mecanismo proposto D11.
- **Pré-condições:** prazo atingido; estado agendado/ativo elegível para encerramento.
- **Fluxo principal:** processo procura leilões vencidos; atualização condicional encerra uma única vez; fixa resultado sem vencedor ou com maior oferta; após commit transmite snapshot final; clientes deixam de licitar.
- **Alternativas:** licitação concorre com encerramento → ordenação da base de dados e predicados decidem; reinício → recuperação pela data persistida; ausência de ofertas → não atribuir preço base a vencedor; transformação em encomenda/reserva Q07.
- **Pós-condições:** estado terminado e resultado estável; licitações posteriores recusadas.
- **Autorização:** transição técnica interna; resultado não decidido pelo relógio nem pelo cliente.

## UC-11 — Consultar painéis e saúde

- **Atores:** produtor e administrador.
- **Requisitos:** RF-PRO-03/04, RF-ADM-01/02; E p. 4/11/12.
- **Pré-condições:** sessão e papel válidos; dados disponíveis.
- **Fluxo principal:** produtor consulta indicadores e alertas próprios; administrador consulta utilizadores, encomendas, leilões ativos e saúde dos serviços; interface distingue dados, atualização em curso e erro.
- **Alternativas:** não há vendas → valores vazios/zero coerentes; dependência indisponível → mostrar estado degradado ou desconhecido com data, sem afirmar operacionalidade; fórmulas e verificações Q15/Q16.
- **Pós-condições:** informação apresentada sem alterar recursos.
- **Autorização:** produtor limitado aos seus dados; administrador tem visão global; métricas públicas de saúde não expõem credenciais nem dados pessoais.

## Cobertura de validação

UC-01–04 e UC-11 suportam os protótipos e M1; UC-02–07 e contratos REST suportam M2; UC-08–10, notificações, publicação e regressão de todos os percursos suportam M3. A versão final exige validar todos os requisitos O, incluindo os que têm soluções propostas neste documento. V só entra depois dessa validação.
