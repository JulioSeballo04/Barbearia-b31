import { bugReportSectionHtml, wireBugReportHandlers } from "../bug-report.js";
import { DOW, MAX_ACTIVE_APPTS_PER_CLIENT, MONTH_NAMES } from "../constants.js";
import { bookAppointmentTx, cancelApptDoc, ensureOverridesLoaded, refreshClientDateAppts } from "../data.js";
import { attachPhoneMask, makeActivatable, showToast } from "../dom.js";
import { db, doc, setDoc } from "../firebase.js";
import { openDeleteAccountLinkHtml, openPrivacyLinkHtml, wireDeleteAccountLink, wirePrivacyLink } from "../modals.js";
import { render } from "../render.js";
import {
  firstDayOfMonth, getUpcomingClientAppts, isMonthUnlocked, isSlotAvailable, lastDayOfMonth, monthKeyStr, slotsForDate
} from "../scheduling.js";
import { state } from "../state.js";
import {
  dateFromKey, dateKey, escapeHtml, formatDateLabel, isValidPhone, nowSP, saveErrorMessage
} from "../utils.js";
import { buildBookingWaMessage, buildCancelWaMessage, waLink } from "../whatsapp.js";
import { doClientLogout } from "./client-auth.js";

// ---------- CLIENT APP (booking) ----------

export function renderSessionBarHtml(){
  var nameRow;
  if(state.clientEditingName){
    nameRow = '<div class="session-bar">'+
      '<span class="who">'+
        '<input type="text" id="clientNameInput" value="'+escapeHtml(state.clientSession.name)+'" '+
          'style="font-size:13px; padding:4px 8px; border-radius:4px; border:1px solid var(--line); width:160px;" maxlength="60">'+
      '</span>'+
      '<span>'+
        '<span class="backlink" id="saveNameBtn" style="margin-right:12px;">Salvar</span>'+
        '<span class="backlink" id="cancelNameBtn">Cancelar</span>'+
      '</span>'+
    '</div>'+
    '<p class="sub" style="margin:2px 0 4px;">É esse nome que vai aparecer pro barbeiro nos agendamentos.</p>'+
    '<div id="nameError" class="error" role="alert" aria-live="polite" style="display:none; margin-bottom:10px;"></div>';
  } else {
    nameRow = '<div class="session-bar">'+
      '<span class="who">Logado como '+escapeHtml(state.clientSession.name)+' · <span class="backlink" id="editNameBtn">editar nome</span></span>'+
      '<span class="backlink" id="logoutClient">Sair</span>'+
    '</div>';
  }

  var phoneRow;
  if(state.clientEditingPhone){
    phoneRow = '<div class="session-bar-sub-edit">'+
      '<input type="tel" id="clientPhoneInput" value="'+escapeHtml(state.clientSession.phone || "")+'" '+
        'style="font-size:13px; padding:4px 8px; border-radius:4px; border:1px solid var(--line); width:160px;" autocomplete="tel">'+
      '<span class="backlink" id="savePhoneBtn" style="margin-left:10px;">Salvar</span>'+
      '<span class="backlink" id="cancelPhoneBtn" style="margin-left:10px;">Cancelar</span>'+
      '<p class="sub" style="margin:6px 0 0;">Usado pra confirmar seu agendamento e como meio de contato com o barbeiro (ex: em caso de cancelamento).</p>'+
      '<div id="phoneEditError" class="error" role="alert" aria-live="polite" style="display:none; margin-top:4px;"></div>'+
    '</div>';
  } else {
    phoneRow = '<div class="session-bar-sub">Telefone: '+escapeHtml(state.clientSession.phone || "não informado")+' · <span class="backlink" id="editPhoneBtn">editar telefone</span></div>';
  }

  return nameRow + phoneRow;
}

export function wireSessionBarHandlers(el){
  var logoutBtn = document.getElementById("logoutClient");
  if(logoutBtn) makeActivatable(logoutBtn, doClientLogout);

  var editBtn = document.getElementById("editNameBtn");
  if(editBtn){
    makeActivatable(editBtn, function(){
      state.clientEditingName = true;
      render();
    });
  }

  var cancelBtn = document.getElementById("cancelNameBtn");
  if(cancelBtn){
    makeActivatable(cancelBtn, function(){
      state.clientEditingName = false;
      render();
    });
  }

  var saveBtn = document.getElementById("saveNameBtn");
  if(saveBtn){
    makeActivatable(saveBtn, async function(){
      var input = document.getElementById("clientNameInput");
      var errBox = document.getElementById("nameError");
      var val = input.value.trim().slice(0, 60);
      if(!val){
        errBox.textContent = "O nome não pode ficar em branco.";
        errBox.style.display = "block";
        return;
      }
      saveBtn.textContent = "Salvando...";
      var previous = state.clientSession.name;
      state.clientSession.name = val;
      try{
        await setDoc(doc(db, "clients", state.clientSession.uid), { name: val }, { merge: true });
        state.clientEditingName = false;
        render();
      }catch(e){
        state.clientSession.name = previous;
        saveBtn.textContent = "Salvar";
        errBox.textContent = saveErrorMessage();
        errBox.style.display = "block";
      }
    });
  }

  var editPhoneBtn = document.getElementById("editPhoneBtn");
  if(editPhoneBtn){
    makeActivatable(editPhoneBtn, function(){
      state.clientEditingPhone = true;
      render();
    });
  }

  var cancelPhoneBtn = document.getElementById("cancelPhoneBtn");
  if(cancelPhoneBtn){
    makeActivatable(cancelPhoneBtn, function(){
      state.clientEditingPhone = false;
      render();
    });
  }

  var phoneInput = document.getElementById("clientPhoneInput");
  if(phoneInput) attachPhoneMask(phoneInput);

  var savePhoneBtn = document.getElementById("savePhoneBtn");
  if(savePhoneBtn){
    makeActivatable(savePhoneBtn, async function(){
      var input = document.getElementById("clientPhoneInput");
      var errBox = document.getElementById("phoneEditError");
      var val = input.value.trim();
      if(!isValidPhone(val)){
        errBox.textContent = "Informe um telefone válido, com DDD.";
        errBox.style.display = "block";
        return;
      }
      savePhoneBtn.textContent = "Salvando...";
      var previous = state.clientSession.phone;
      state.clientSession.phone = val;
      try{
        await setDoc(doc(db, "clients", state.clientSession.uid), { phone: val }, { merge: true });
        state.clientEditingPhone = false;
        render();
      }catch(e){
        state.clientSession.phone = previous;
        savePhoneBtn.textContent = "Salvar";
        errBox.textContent = saveErrorMessage();
        errBox.style.display = "block";
      }
    });
  }
}

export function renderClientOwnApptsHtml(){
  var upcoming = getUpcomingClientAppts();
  if(!upcoming.length) return "";
  var itemsHtml = upcoming.map(function(a){
    var dateLabel = a.date.split("-").reverse().join("/");
    return '<div class="appt">'+
      '<div>'+
        '<div class="who">'+escapeHtml(a.serviceName)+'</div>'+
        '<div class="when">'+dateLabel+' às '+a.time+'</div>'+
      '</div>'+
      '<div class="appt-actions">'+
        '<button class="danger" data-clientcancel="'+a.id+'">Cancelar</button>'+
      '</div>'+
    '</div>';
  }).join("");
  return '<div class="card">'+
    '<h2>Seus agendamentos</h2>'+
    '<p class="sub">Horários que você já marcou.</p>'+
    itemsHtml+
  '</div>';
}

export function wireClientOwnApptsHandlers(el){
  el.querySelectorAll("[data-clientcancel]").forEach(function(btn){
    btn.onclick = async function(){
      var id = btn.getAttribute("data-clientcancel");
      var target = state.clientOwnAppts.find(function(a){ return a.id === id; });
      if(!target) return;
      var ok = window.confirm("Cancelar esse agendamento?");
      if(!ok) return;
      btn.disabled = true;
      btn.textContent = "Cancelando...";
      // Abre a aba em branco AGORA, ainda dentro do clique original — celulares
      // (principalmente Safari/iOS) bloqueiam window.open() se ele acontecer só
      // depois de um await, porque nesse ponto o navegador já não considera mais
      // que foi resposta direta a um toque do usuário. Abrindo a aba antes e só
      // preenchendo o destino dela depois, o popup nunca é bloqueado.
      var waTab = state.config.whatsapp ? window.open("", "_blank") : null;
      var okSave = await cancelApptDoc(id);
      if(!okSave){
        if(waTab) waTab.close();
        btn.disabled = false;
        btn.textContent = "Cancelar";
        showToast(saveErrorMessage(), true);
        return;
      }
      state.clientOwnAppts = state.clientOwnAppts.filter(function(a){ return a.id !== id; });
      if(waTab){
        var link = waLink(state.config.whatsapp, buildCancelWaMessage(target));
        if(link){ waTab.location = link; } else { waTab.close(); }
      }
      render();
    };
  });
}

// ---------- CALENDÁRIO DO CLIENTE (visão do mês, mesmo estilo do calendário do barbeiro) ----------

export function renderClientCalendarHtml(){
  var monthDate = state.clientCalendarMonth || firstDayOfMonth(nowSP());
  var today = nowSP();
  var todayKey = dateKey(today);
  var isCurrentMonth = monthKeyStr(monthDate) === monthKeyStr(today);
  var first = firstDayOfMonth(monthDate);
  var last = lastDayOfMonth(monthDate);
  var startOffset = first.getDay();
  var daysInMonth = last.getDate();
  var unlocked = isMonthUnlocked(monthDate);

  var cells = [];
  for(var i = 0; i < startOffset; i++){ cells.push('<div class="cal-day cal-empty"></div>'); }
  for(var day = 1; day <= daysInMonth; day++){
    var d = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
    var k = dateKey(d);
    var override = state.scheduleOverrides[k];
    var isPast = k < todayKey;
    var isToday = k === todayKey;
    var isDefaultWorkDay = state.config.workDays.indexOf(d.getDay()) !== -1;
    var hasCustomPeriods = override && Array.isArray(override.periods) && override.periods.length;
    var isClosed = override && override.closed;
    var isOff = !isClosed && !isDefaultWorkDay && !hasCustomPeriods;
    var isLocked = !unlocked && !isPast;
    var isSelected = k === state.clientSelectedDate;
    var isAvailable = !isPast && !isLocked && !isClosed && !isOff;

    var classes = ["cal-day"];
    if(isToday) classes.push("is-today");
    if(isPast) classes.push("is-past");
    if(isClosed) classes.push("is-closed");
    else if(isOff) classes.push("is-off");
    if(isLocked) classes.push("is-locked");
    if(isAvailable) classes.push("is-available");
    if(isSelected) classes.push("is-selected");

    var label = DOW[d.getDay()]+' dia '+day+(isAvailable ? '' : ', indisponível');
    cells.push('<div class="'+classes.join(" ")+'" '+
      (isAvailable ? 'data-calday="'+k+'" role="button" tabindex="0" aria-pressed="'+isSelected+'"' : 'aria-disabled="true"')+
      ' aria-label="'+label+'">'+
      '<span class="cal-num">'+day+'</span>'+
      (isToday ? '<span class="cal-dot"></span>' : '')+
    '</div>');
  }

  var lockedNoteHtml = !unlocked
    ? '<p class="sub" style="margin-top:10px;">A agenda de '+MONTH_NAMES[monthDate.getMonth()]+' ainda não foi liberada para agendamento.</p>'
    : "";

  return '<div class="cal-wrap">'+
    '<div class="cal-head">'+
      '<div class="cal-nav"><button type="button" data-clicalprev aria-label="Mês anterior"'+(isCurrentMonth ? ' disabled' : '')+'>&larr;</button></div>'+
      '<div class="cal-title">'+MONTH_NAMES[monthDate.getMonth()]+' de '+monthDate.getFullYear()+'</div>'+
      '<div class="cal-nav"><button type="button" data-clicalnext aria-label="Próximo mês">&rarr;</button></div>'+
    '</div>'+
    '<div class="cal-dow">'+DOW.map(function(n){ return '<span>'+n+'</span>'; }).join("")+'</div>'+
    '<div class="cal-grid">'+cells.join("")+'</div>'+
    '<div class="cal-legend">'+
      '<span><span class="dot" style="background:var(--white); border:1px solid var(--line);"></span> Disponível</span>'+
      '<span><span class="dot" style="background:var(--gray-300);"></span> Indisponível</span>'+
      '<span><span class="dot" style="background:var(--black);"></span> Selecionado</span>'+
    '</div>'+
    lockedNoteHtml+
  '</div>';
}

export function wireClientCalendarHandlers(el){
  var prevBtn = el.querySelector("[data-clicalprev]");
  if(prevBtn && !prevBtn.disabled){
    prevBtn.onclick = function(){
      var m = state.clientCalendarMonth;
      state.clientCalendarMonth = new Date(m.getFullYear(), m.getMonth()-1, 1);
      render();
      ensureOverridesLoaded(state.clientCalendarMonth).then(render);
    };
  }
  var nextBtn = el.querySelector("[data-clicalnext]");
  if(nextBtn){
    nextBtn.onclick = function(){
      var m = state.clientCalendarMonth;
      state.clientCalendarMonth = new Date(m.getFullYear(), m.getMonth()+1, 1);
      render();
      ensureOverridesLoaded(state.clientCalendarMonth).then(render);
    };
  }
  el.querySelectorAll("[data-calday]").forEach(function(cell){
    makeActivatable(cell, async function(){
      state.clientSelectedDate = cell.getAttribute("data-calday");
      state.clientSelectedSlot = null;
      await refreshClientDateAppts(state.clientSelectedDate);
      render();
    });
  });
}

// Etapa 1 do agendamento: enquanto nenhum serviço foi escolhido, mostra a
// grade completa; depois de escolhido, recolhe pra uma linha de resumo com
// "trocar" — evita manter o grid de serviços sempre aberto ocupando espaço
// acima do calendário e dos horários.
export function renderClientServiceCardHtml(services, selectedSvc){
  if(selectedSvc){
    return '<div class="card">'+
      '<div class="step-summary-row">'+
        '<div>'+
          '<h2 style="padding-bottom:0; margin-bottom:3px;">1. Serviço</h2>'+
          '<p class="sub" style="margin:0;">'+escapeHtml(selectedSvc.name)+' · R$ '+selectedSvc.price+' · '+selectedSvc.minutes+' min</p>'+
        '</div>'+
        '<span class="backlink" id="changeSvcBtn">trocar</span>'+
      '</div>'+
    '</div>';
  }
  var svcHtml = services.map(function(s){
    return '<div class="svc" data-svc="'+s.id+'" aria-pressed="false">'+
      '<div class="name">'+escapeHtml(s.name)+'</div>'+
      '<div class="meta">R$ '+s.price+' · '+s.minutes+' min</div>'+
    '</div>';
  }).join("");
  return '<div class="card">'+
    '<h2>1. Escolha o serviço</h2>'+
    '<div class="services">'+svcHtml+'</div>'+
  '</div>';
}

// Etapas 2 e 3 do agendamento (dia + horário) num único card. Igual ao
// serviço, uma vez que os dois já foram escolhidos, recolhe pra uma linha
// de resumo com "trocar" — sem isso, o calendário do mês inteiro e a grade
// de horários ficavam sempre abertos, mesmo depois de já escolhidos.
export function renderClientDateTimeCardHtml(selectedSvc){
  var isComplete = selectedSvc && state.clientSelectedDate && state.clientSelectedSlot;
  if(isComplete){
    return '<div class="card">'+
      '<div class="step-summary-row">'+
        '<div>'+
          '<h2 style="padding-bottom:0; margin-bottom:3px;">2. Dia e horário</h2>'+
          '<p class="sub" style="margin:0;">'+formatDateLabel(state.clientSelectedDate)+' às '+state.clientSelectedSlot+'</p>'+
        '</div>'+
        '<span class="backlink" id="changeDateBtn">trocar</span>'+
      '</div>'+
    '</div>';
  }

  var slotsHtml = '<p class="empty">Escolha um serviço para ver os horários</p>';
  if(selectedSvc && !state.clientSelectedDate){
    slotsHtml = '<p class="empty">Escolha um dia para ver os horários</p>';
  }
  if(selectedSvc && state.clientSelectedDate){
    var selDate = dateFromKey(state.clientSelectedDate);
    var slots = selDate ? slotsForDate(selDate, selectedSvc.minutes) : [];
    if(slots.length === 0){
      slotsHtml = '<p class="empty">Sem horários livres nesse dia pra esse serviço ('+selectedSvc.minutes+' min)</p>';
    } else {
      slotsHtml = '<div class="slots">' + slots.map(function(t){
        var taken = !isSlotAvailable(state.clientSelectedDate, t, selectedSvc.minutes);
        var sel = state.clientSelectedSlot === t;
        var extra = taken ? ' aria-disabled="true" aria-label="'+t+', indisponível"' : ' aria-pressed="'+sel+'" aria-label="'+t+'"';
        return '<div class="slot'+(taken?' taken':'')+(sel?' selected':'')+'" data-slot="'+(taken?'':t)+'"'+extra+'>'+t+'</div>';
      }).join("") + '</div>';
    }
  }

  return '<div class="card">'+
    '<h2>2. Escolha o dia</h2>'+
    renderClientCalendarHtml()+
    '<h2 style="margin-top:18px;">3. Escolha o horário</h2>'+
    slotsHtml+
  '</div>';
}

// Indicador simples de progresso (1 → 2 → 3), pra deixar visualmente claro
// em que ponto do agendamento o cliente está, sem precisar ler os títulos.
export function renderClientStepsHtml(step1Done, step2Done){
  var steps = [
    {n:1, label:"Serviço", done: step1Done},
    {n:2, label:"Dia e horário", done: step2Done},
    {n:3, label:"Confirmar", done: false}
  ];
  var current = !step1Done ? 1 : (!step2Done ? 2 : 3);
  return '<div class="step-progress">'+steps.map(function(s){
    var cls = s.done ? "done" : (s.n === current ? "current" : "");
    return '<div class="step-node '+cls+'">'+
      '<span class="step-circle">'+(s.done ? "&#10003;" : s.n)+'</span>'+
      '<span class="step-label">'+s.label+'</span>'+
    '</div>';
  }).join('<div class="step-line"></div>')+'</div>';
}

export function renderClientApp(el){
  if(state.clientConfirmed){
    var a = state.clientConfirmed;
    var waConfirmLink = state.config.whatsapp ? waLink(state.config.whatsapp, buildBookingWaMessage(a)) : null;
    var waConfirmHtml = waConfirmLink
      ? '<a class="ghost" href="'+waConfirmLink+'" target="_blank" rel="noopener" style="display:inline-block; text-decoration:none; margin-top:12px;">Não abriu? Confirmar via WhatsApp</a>'
      : "";
    el.innerHTML =
      '<div class="card success-box">'+
        '<div class="badge">&#10003;</div>'+
        '<h2 class="display">Horário confirmado</h2>'+
        '<p class="sub">'+escapeHtml(a.serviceName)+' — '+a.dateLabel+' às '+a.time+'</p>'+
        waConfirmHtml+
        '<div><button class="ghost" id="newBooking" style="margin-top:16px;">Marcar outro horário</button></div>'+
        '<div><span class="backlink" id="logoutClient" style="margin-top:16px;">Sair da conta</span></div>'+
      '</div>'+
      renderClientOwnApptsHtml();
    document.getElementById("newBooking").onclick = function(){
      state.clientConfirmed = null;
      state.clientSelectedService = null;
      state.clientSelectedDate = null;
      state.clientSelectedSlot = null;
      state.clientView = "book";
      render();
    };
    makeActivatable(document.getElementById("logoutClient"), doClientLogout);
    wireClientOwnApptsHandlers(el);
    return;
  }

  var services = state.config.services;

  var selectedSvc = services.find(function(s){ return s.id === state.clientSelectedService; });

  // Resumo antes do botão de confirmar. Serviço e dia/horário já aparecem
  // nos resumos colapsados das etapas 1 e 2 logo acima, então repeti-los
  // aqui de novo só duplicava informação sem ajudar — a única coisa que
  // ainda não tinha aparecido em lugar nenhum era o valor.
  var summaryHtml = "";
  if(selectedSvc && state.clientSelectedDate && state.clientSelectedSlot){
    summaryHtml = '<div class="booking-summary">'+
      '<div><span class="label">Valor</span><span class="value">R$ '+selectedSvc.price+'</span></div>'+
    '</div>';
  }

  var upcoming = getUpcomingClientAppts();
  var viewToggleHtml = "";
  if(upcoming.length){
    var onBook = state.clientView !== "appts";
    viewToggleHtml = '<div class="view-toggle">'+
      '<button type="button" class="'+(onBook?'active':'')+'" data-clientview="book" aria-pressed="'+onBook+'">Marcar novo horário</button>'+
      '<button type="button" class="'+(!onBook?'active':'')+'" data-clientview="appts" aria-pressed="'+(!onBook)+'">Seus agendamentos ('+upcoming.length+')</button>'+
    '</div>';
  }

  var bodyHtml;
  if(upcoming.length && state.clientView === "appts"){
    bodyHtml = renderClientOwnApptsHtml();
  } else {
    var step1Done = !!selectedSvc;
    var step2Done = !!(selectedSvc && state.clientSelectedDate && state.clientSelectedSlot);
    bodyHtml =
      renderClientStepsHtml(step1Done, step2Done)+
      renderClientServiceCardHtml(services, selectedSvc)+
      renderClientDateTimeCardHtml(selectedSvc)+
      '<div class="card">'+
        summaryHtml+
        '<div id="cliError" class="error" role="alert" aria-live="polite" style="display:none;"></div>'+
        '<button class="primary" id="confirmBtn">Confirmar agendamento</button>'+
      '</div>';
  }

  el.innerHTML =
    renderSessionBarHtml()+
    viewToggleHtml+
    bodyHtml+
    bugReportSectionHtml("client", state.clientBugOpen)+
    openPrivacyLinkHtml()+
    openDeleteAccountLinkHtml();

  wireSessionBarHandlers(el);
  wireBugReportHandlers("client", "cliente");
  wireClientCalendarHandlers(el);
  wirePrivacyLink(el);
  wireDeleteAccountLink(el);

  el.querySelectorAll("[data-clientview]").forEach(function(btn){
    btn.onclick = function(){
      state.clientView = btn.getAttribute("data-clientview");
      render();
    };
  });

  if(upcoming.length && state.clientView === "appts"){
    wireClientOwnApptsHandlers(el);
    return;
  }

  var changeSvcBtn = document.getElementById("changeSvcBtn");
  if(changeSvcBtn){
    makeActivatable(changeSvcBtn, function(){
      state.clientSelectedService = null;
      state.clientSelectedDate = null;
      state.clientSelectedSlot = null;
      render();
    });
  }

  var changeDateBtn = document.getElementById("changeDateBtn");
  if(changeDateBtn){
    makeActivatable(changeDateBtn, function(){
      state.clientSelectedDate = null;
      state.clientSelectedSlot = null;
      render();
    });
  }

  el.querySelectorAll(".svc").forEach(function(node){
    makeActivatable(node, function(){
      state.clientSelectedService = node.getAttribute("data-svc");
      state.clientSelectedDate = null;
      state.clientSelectedSlot = null;
      render();
    });
  });
  el.querySelectorAll(".slot").forEach(function(node){
    var t = node.getAttribute("data-slot");
    if(!t){
      node.setAttribute("tabindex", "-1");
      return;
    }
    makeActivatable(node, function(){ state.clientSelectedSlot = t; render(); });
  });

  document.getElementById("confirmBtn").onclick = async function(){
    var errBox = document.getElementById("cliError");
    if(!state.clientSelectedService){
      errBox.textContent = "Escolha um serviço.";
      errBox.style.display = "block";
      return;
    }
    if(!state.clientSelectedDate || !state.clientSelectedSlot){
      errBox.textContent = "Escolha o dia e o horário.";
      errBox.style.display = "block";
      return;
    }
    if(getUpcomingClientAppts().length >= MAX_ACTIVE_APPTS_PER_CLIENT){
      errBox.textContent = "Você já tem "+MAX_ACTIVE_APPTS_PER_CLIENT+" agendamentos marcados. Cancele um pra marcar outro.";
      errBox.style.display = "block";
      return;
    }
    errBox.style.display = "none";
    var btn = document.getElementById("confirmBtn");
    btn.disabled = true;
    btn.textContent = "Confirmando...";

    await refreshClientDateAppts(state.clientSelectedDate);
    var svc = state.config.services.find(function(s){ return s.id === state.clientSelectedService; });
    if(!isSlotAvailable(state.clientSelectedDate, state.clientSelectedSlot, svc.minutes)){
      errBox.textContent = "Esse horário acabou de ser reservado. Escolha outro.";
      errBox.style.display = "block";
      btn.disabled = false;
      btn.textContent = "Confirmar agendamento";
      render();
      return;
    }

    var appt = {
      date: state.clientSelectedDate,
      time: state.clientSelectedSlot,
      serviceId: svc.id,
      serviceName: svc.name,
      price: svc.price,
      minutes: svc.minutes,
      name: state.clientSession.name,
      phone: state.clientSession.phone,
      uid: state.clientSession.uid,
      done: false,
      createdAt: Date.now()
    };

    // A checagem acima é só pra UX (evitar mostrar "confirmando" num
    // horário já óbvio como ocupado). A trava real contra dois clientes
    // confirmando o mesmo horário ao mesmo tempo é a transação abaixo.
    // A aba do WhatsApp é aberta em branco JÁ AQUI, antes do await — celulares
    // (principalmente Safari/iOS) bloqueiam window.open() se ele só acontecer
    // depois de uma pausa assíncrona, porque nesse ponto deixa de contar como
    // resposta direta a um toque do usuário. Preenchendo o destino da aba só
    // depois que a gravação terminar, o popup nunca é bloqueado.
    var waTab = state.config.whatsapp ? window.open("", "_blank") : null;
    var newApptId;
    try{
      newApptId = await bookAppointmentTx(appt);
    }catch(e){
      if(waTab) waTab.close();
      if(e && e.message === "SLOT_TAKEN"){
        errBox.textContent = "Esse horário acabou de ser reservado por outra pessoa. Escolha outro.";
      } else {
        errBox.textContent = saveErrorMessage();
      }
      errBox.style.display = "block";
      btn.disabled = false;
      btn.textContent = "Confirmar agendamento";
      await refreshClientDateAppts(state.clientSelectedDate);
      render();
      return;
    }

    state.clientConfirmed = {
      serviceName: svc.name,
      dateLabel: formatDateLabel(appt.date),
      time: appt.time
    };
    state.clientOwnAppts.push(Object.assign({id: newApptId}, appt));
    if(waTab){
      var waLinkUrl = waLink(state.config.whatsapp, buildBookingWaMessage(state.clientConfirmed));
      if(waLinkUrl){ waTab.location = waLinkUrl; } else { waTab.close(); }
    }
    render();
  };
}
