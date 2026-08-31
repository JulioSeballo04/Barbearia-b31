export var state = {
  screen: "landing", // landing | clientAuth | clientPhone | clientApp | barberAuth | barberApp
  config: null,
  appts: [],          // histórico completo, usado pelo painel do barbeiro
  clientDateAppts: [], // agendamentos só do dia selecionado, usado na tela do cliente
  clientOwnAppts: [], // agendamentos futuros do próprio cliente logado, pra ele ver/cancelar
  loaded: false,
  pendingGoogleUser: null, // usuário Google logado que ainda precisa informar telefone
  clientSession: null, // {uid, name, phone, email}
  clientEditingName: false,
  clientEditingPhone: false,
  clientSelectedService: null,
  clientSelectedDate: null,
  clientCalendarMonth: null, // primeiro dia do mês mostrado no calendário do cliente
  clientSelectedSlot: null,
  clientConfirmed: null,
  clientView: "book",        // "book" (marcar novo horário) | "appts" (ver agendamentos já marcados)
  clientBugOpen: false,      // se o formulário de reportar problema está expandido, na tela do cliente
  barberLoggedIn: false,
  scheduleOverrides: {},     // {dateKey: {closed:bool, periods:[{startHour,endHour}]}} — exceções por dia
  overridesLoadedMonths: {}, // {"AAAA-MM": true} — evita buscar o mesmo mês de novo
  barberCalendarMonth: null, // primeiro dia do mês mostrado no calendário do barbeiro
  barberSelectedDay: null,   // dateKey do dia clicado no calendário
  barberDayDraft: null,      // rascunho em edição do horário do dia selecionado
  barberClients: [],         // lista de clientes cadastrados (nome, email, telefone)
  barberClientsLoaded: false,
  barberClientSearch: "",
  barberBugOpen: false,      // se o formulário de reportar problema está expandido, no painel do barbeiro
  barberTab: "hoje",         // hoje | calendario | clientes | ajustes — abas do painel do barbeiro
  barberLastActivity: null,  // timestamp do último clique/tecla no painel, pra deslogar por inatividade
  showPrivacyModal: false,   // modal da política de privacidade, acessível de qualquer tela
  showDeleteAccountModal: false, // modal de confirmação de "excluir meus dados", só na tela do cliente
  deletingAccount: false     // true enquanto a exclusão está em andamento (evita cliques duplicados)
};
