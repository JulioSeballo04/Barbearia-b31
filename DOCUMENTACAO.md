# Documentação técnica — Barbearia B31

Este documento existe pra você conseguir abrir qualquer arquivo do projeto
e entender o que está acontecendo, mesmo sem ter escrito aquela linha.
Não é um resumo de "o que o app faz" (isso já está no `README`/no guia do
barbeiro) — é um mapa de **como o código está organizado e por quê**, pra
você usar como referência enquanto lê o código de verdade.

Estrutura sugerida de leitura: primeiro esta seção de visão geral, depois
"Como ler qualquer arquivo daqui pra frente", e a partir daí consulte a
seção do arquivo específico que estiver olhando.

---

## 1. Visão geral

**O que é:** um site (que também funciona como app instalável — PWA) de
agendamento pra uma barbearia. Dois "lados": o cliente agenda um horário
sozinho; o barbeiro tem um painel separado pra ver/gerenciar tudo.

**Stack:** JavaScript puro (sem framework — nada de React/Vue), ES
Modules nativos do navegador (sem bundler/Webpack/Vite — cada arquivo
`.js` é servido como está, o próprio navegador resolve os `import`),
Firebase (Auth + Firestore) como backend, hospedado no Firebase Hosting
e também espelhado na Vercel.

**Por que não tem framework nem build step:** é um projeto pequeno e o
autor original preferiu simplicidade radical — abrir o arquivo é ver
exatamente o que vai rodar no navegador, sem etapa de compilação no meio.
O preço disso é escrever manualmente coisas que um framework faria
sozinho (re-renderizar a tela, por exemplo) — ver seção 3.

---

## 2. Mapa de arquivos

```
index.html          esqueleto HTML (head + body), carrega css/js
manifest.json        metadados do PWA (ícone, nome, cor)
sw.js                 service worker (cache básico offline)
firestore.rules       regras de segurança do banco (quem pode ler/escrever o quê)
firebase.json         config de deploy (o que sobe pro Hosting)
css/
  styles.css           TODO o CSS do app (extraído do antigo <style> inline)
icons/                 ícones do PWA em vários tamanhos
js/
  firebase.js          inicializa o Firebase, reexporta funções do SDK
  constants.js         valores fixos (config padrão, e-mail do barbeiro, etc.)
  state.js             o objeto de estado global do app
  pin.js               hash do PIN do barbeiro (nunca texto puro)
  utils.js             funções puras (datas, validação, formatação)
  scheduling.js        lógica de agenda/disponibilidade e métricas
  whatsapp.js          monta links/mensagens de WhatsApp
  dom.js               helpers de UI reutilizados (máscaras, toast, etc.)
  bug-report.js        o widget "Encontrou um problema?"
  data.js              TODA leitura/escrita no Firestore
  modals.js            modal de privacidade + modal de excluir conta
  render.js            o "dispatcher" — decide qual tela desenhar
  main.js               ponto de entrada: inicializa tudo, restaura sessão
  screens/
    landing.js           tela inicial ("Quero agendar" / "Acessar meus clientes")
    client-auth.js       login do cliente (Google) + completar cadastro
    client-app.js         app do cliente: escolher serviço/dia/horário, ver agendamentos
    barber-auth.js        login do barbeiro (Google + PIN)
    barber-app.js          painel do barbeiro: Hoje / Calendário / Clientes / Ajustes
```

Cada arquivo em `js/` é um **ES Module**: começa com `import {...} from
"./outro-arquivo.js"` (pra pegar o que precisa de outros arquivos) e usa
`export` na frente de cada função/variável que outros arquivos podem
importar. Se uma função não tem `export`, ela só existe dentro daquele
arquivo.

---

## 3. Os três conceitos que explicam quase tudo

### 3.1. Um objeto de estado só, `state` (`js/state.js`)

Não existe "estado" espalhado em variáveis soltas — existe **um objeto
`state`** com tudo que pode mudar durante o uso do app: em qual tela você
está, quem está logado, qual dia foi selecionado no calendário, etc.
Qualquer função em qualquer arquivo pode importar `{ state }` e ler ou
escrever direto nele (`state.screen = "clientApp"`).

Não tem framework fazendo mágica aqui — é só um objeto JavaScript comum,
compartilhado porque toda função importa a *mesma instância* dele.

### 3.2. Re-renderizar tudo, sempre (`js/render.js`)

Sempre que algo muda (o cliente escolhe um serviço, um agendamento chega
em tempo real, o barbeiro clica em "Realizado"...), o código chama a
função `render()`. Ela olha `state.screen` e decide qual tela desenhar:

```js
// js/render.js (resumido)
export function render(){
  var el = document.getElementById("app");
  if(state.screen === "landing") renderLanding(el);
  else if(state.screen === "clientApp") renderClientApp(el);
  else if(state.screen === "barberApp") renderBarberApp(el);
  // ...
}
```

Cada `renderXxx(el)` **substitui todo o HTML de dentro de `el`** com uma
string nova (`el.innerHTML = "..."`), montada concatenando texto. Não tem
diffing nem componentes — é "apagar tudo e desenhar tudo de novo" a cada
mudança. Funciona bem porque cada tela é pequena e o navegador é rápido
pra isso.

Depois de desenhar o HTML novo, cada `renderXxx` chama um `wireXxx(el)`
correspondente, que percorre o HTML recém-criado procurando elementos
(`document.getElementById(...)` ou `document.querySelectorAll(...)`) e
prende os `onclick`/`oninput` neles. **Isso tem que ser refeito a cada
render**, porque o HTML antigo (com os listeners antigos presos) foi
jogado fora.

Padrão típico que você vai ver repetido em quase toda tela:
```js
function renderAlgumaCoisa(el){
  el.innerHTML = '<button id="meuBotao">Clique</button>';
  wireAlgumaCoisaHandlers(el);
}
function wireAlgumaCoisaHandlers(el){
  document.getElementById("meuBotao").onclick = function(){
    state.algumaCoisa = true;
    render(); // desenha tudo de novo, agora refletindo a mudança
  };
}
```

### 3.3. Firestore como única fonte de dados, `js/data.js`

Todo `getDoc`/`setDoc`/`getDocs`/`onSnapshot` do app está concentrado em
`js/data.js` (é o único arquivo que os outros módulos usam pra falar com
o banco). As telas nunca chamam o Firestore direto — chamam uma função
de `data.js` (ex: `bookAppointmentTx(appt)`, `refreshClients()`), que
por sua vez atualiza `state` e devolve um `true`/`false` de sucesso.

O painel do barbeiro usa `onSnapshot` (tempo real) só pra agendamentos —
o resto é busca manual (`getDocs`) chamada quando necessário, não fica
"escutando" o banco o tempo todo.

---

## 4. O banco de dados (Firestore) — coleções

| Coleção | Documento | O que guarda |
|---|---|---|
| `clients` | `{uid do Google}` | nome, telefone, e-mail, foto, se confirmou maioridade |
| `appointments` | `{data}_{horário}` (ex: `2026-09-05_1430`) | serviço, preço, duração, nome/telefone/uid do cliente, se foi "realizado" |
| `barberConfig` | `main` | serviços oferecidos, dias/horários de atendimento, WhatsApp, meses liberados |
| `barberSecrets` | `main` | só o **hash** do PIN (nunca o valor real) |
| `scheduleOverrides` | `{data}` | exceção de horário pra um dia específico (fechado, ou horário diferente) |

O ID do documento em `appointments` ser `data_horário` (em vez de um ID
aleatório) é deliberado: dois clientes não podem criar o mesmo horário
ao mesmo tempo, porque o segundo simplesmente colide com um documento que
já existe — ver `bookAppointmentTx` em `data.js`, que usa uma transação
(`runTransaction`) pra garantir isso mesmo com dois cliques simultâneos.

**Quem pode ler/escrever o quê** está inteiramente em `firestore.rules`
— veja a seção 6.

---

## 5. Trilhas de leitura — "eu quero entender como funciona X"

Em vez de ler os arquivos em ordem alfabética, siga o fluxo de uma ação
real. Alguns exemplos:

**"Como funciona o login do cliente?"**
`landing.js` (botão "Quero agendar") → `client-auth.js`
(`renderClientAuth`, clique em "Entrar com Google" chama
`signInWithPopup`) → se é a primeira vez, cai em `renderClientPhoneStep`
(pede nome/telefone) → grava em `clients/{uid}` via `setDoc` → muda
`state.screen = "clientApp"` → `render()`.

**"Como funciona marcar um horário?"**
`client-app.js` → `renderClientApp` monta as 3 etapas (serviço, dia,
horário) → botão "Confirmar agendamento" → `data.js` →
`bookAppointmentTx(appt)` (a transação que evita choque de horário) →
volta pra `client-app.js`, mostra confirmação e abre o WhatsApp
(`whatsapp.js` → `buildBookingWaMessage`).

**"Como o barbeiro entra no painel?"**
`landing.js` → `barber-auth.js` → `renderBarberAuth`. Duas etapas
sequenciais na mesma função: (1) ainda não é reconhecido pelo Google como
o e-mail do barbeiro → mostra botão "Entrar com Google"; (2) já é
reconhecido → mostra campo de PIN. O PIN digitado é comparado com o hash
salvo em `barberSecrets/main` (função `hashPin` de `pin.js`) — nunca
comparado em texto puro.

**"Como o calendário sabe se um dia está aberto?"**
`scheduling.js` → `isMonthUnlocked`/`isSlotAvailable` cruzam três coisas:
`state.config.workDays` (dias da semana padrão), `state.scheduleOverrides`
(exceções por data específica) e `state.appts` (o que já está ocupado).

**"Como as estatísticas do barbeiro são calculadas?"**
`scheduling.js` → `computeBarberStats()`. Roda uma vez sobre
`state.appts` (que já está todo em memória) e acumula soma/contagem por
semana/mês/ano e por serviço — não faz nenhuma consulta nova ao banco,
só processa o que já foi carregado.

---

## 6. Segurança — como ler `firestore.rules`

As regras do Firestore são a **única** trava de segurança de verdade —
tudo que valida no próprio app (JS) é conveniência de UX, não segurança,
porque qualquer pessoa pode abrir o DevTools e chamar o Firestore direto,
ignorando o app inteiro. Por isso toda regra sensível está comentada
explicando *por que* ela existe, não só *o que* ela faz.

Duas funções-chave, usadas em quase toda regra:
```js
function isClientSession() {
  return isSignedIn() && request.auth.token.firebase.sign_in_provider == "google.com";
}
function isBarberSession() {
  return isSignedIn() &&
    request.auth.token.firebase.sign_in_provider == "google.com" &&
    request.auth.token.email_verified == true &&
    request.auth.token.email == "jeffersonbarletta80@gmail.com"; // BARBER_EMAIL
}
```

`isBarberSession()` compara o e-mail exato — **precisa ser idêntico** ao
`BARBER_EMAIL` em `js/constants.js`. São "as duas metades da mesma
trava": o app só *mostra* a tela de PIN pra essa conta, mas é a regra
acima que *impede* qualquer outra conta de ler/escrever como se fosse o
barbeiro, mesmo brincando direto com o Firestore.

Vale ler com atenção a regra de `appointments` — é a mais elaborada:
cliente pode criar o próprio agendamento e cancelar (delete) o próprio a
qualquer momento, mas só pode *editar* (`update`) campos específicos
(`name`, `phone`, `uid` — usados só na anonimização de exclusão de
conta), nunca o preço/serviço/horário. O barbeiro pode editar/cancelar
qualquer um.

---

## 7. Autenticação, PIN e por que duas travas

O cliente entra só com Google — qualquer conta serve, a identidade dela
é o que a diferencia de outro cliente.

O barbeiro tem **duas** travas em sequência:
1. **Conta Google específica** (`BARBER_EMAIL`) — a trava de segurança
   real, verificada tanto no app quanto (o que importa) nas regras do
   Firestore.
2. **PIN de 6+ dígitos** — só uma conveniência *depois* que o Google já
   confirmou a identidade. Existe pra não expor o painel se alguém pegar
   o celular destravado com a sessão do Google ainda válida.

O PIN nunca é salvo em texto puro — só um hash **PBKDF2 com 120 mil
iterações** (`pin.js` → `hashPin`), deliberadamente lento pra tornar
inviável testar combinações mesmo que alguém consiga ler o hash. Existe
também `hashPinLegacySha256`, mantida só pra reconhecer o PIN de
instalações antigas (de antes dessa troca) e fazer o upgrade automático
do hash na próxima vez que a pessoa loga certo.

A sessão do barbeiro fica lembrada por até 12h neste aparelho
(`BARBER_SESSION_PERSIST_MS` em `constants.js`, mecanismo em
`barber-auth.js` → `touchBarberSession`/`isBarberSessionUnlocked`, usando
`localStorage`) — renovada a cada clique dentro do painel, então um dia
de trabalho contínuo nunca expira essa trava.

---

## 8. Convenções do código (pra não estranhar)

- **`var`, não `let`/`const`.** Estilo intencionalmente antigo/simples,
  consistente em todo o projeto.
- **Sem ponto-e-vírgula faltando, sem `;` opcional.** Todo statement
  termina em `;`.
- **Concatenação de string com `+` pra montar HTML.** Não tem nenhum
  template literal (crase `` ` ``) no projeto — é `'<div>'+valor+'</div>'`
  em todo lugar, de propósito, pra manter um estilo só.
- **`escapeHtml(texto)`** é chamada em qualquer lugar que insere dado do
  usuário (nome, telefone) dentro de uma string HTML — proteção contra
  XSS. Se você adicionar um campo novo, sempre passe por `escapeHtml`.
- **Comentários explicam o "porquê", não o "o quê".** Você vai ver
  comentários longos em decisões não-óbvias (por que um campo existe, por
  que uma trava foi implementada de um jeito e não de outro) e quase
  nenhum comentário em código autoexplicativo.
- **Nomes de arquivo em `screens/` = uma tela ou grupo de telas
  relacionadas.** Se está procurando o HTML de uma tela específica, é
  sempre em `js/screens/`.

---

## 9. O que este documento não cobre

- **PWA** (`manifest.json`, `sw.js`) — service worker bem pequeno e
  comentado no próprio arquivo, não precisa de mapa extra.
- **CSS** (`css/styles.css`) — um arquivo só, organizado por seção com
  comentários `/* ---------- NOME DA SEÇÃO ---------- */`; useCtrl+F pela
  classe que você viu no HTML.
- **Scripts administrativos locais** (`limpar-dados-demo.js` e
  similares) — não fazem parte do app, são utilitários pontuais que usam
  o Admin SDK do Firebase com uma chave de serviço local (nunca
  versionada no Git).

Se algo neste documento ficar desatualizado conforme o código mudar, é
sinal de que vale a pena atualizar este arquivo também — ele só é útil
enquanto continuar refletindo o código real.
