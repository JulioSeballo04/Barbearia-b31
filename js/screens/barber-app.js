import { bugReportSectionHtml, wireBugReportHandlers } from "../bug-report.js";
import { DOW, LOYALTY_VISITS_THRESHOLD, MONTH_NAMES } from "../constants.js";
import {
  cancelApptDoc, deleteClientByBarber, ensureOverridesLoaded, refreshAppts, refreshClients, saveConfig, saveDayOverride,
  setApptDoneDoc, updateClientByBarber
} from "../data.js";
import { attachDigitsOnly, attachPhoneMask, makeActivatable, showToast } from "../dom.js";
import { db, doc, setDoc } from "../firebase.js";
import { PIN_HASH_ALGO, hashPin, randomHex } from "../pin.js";
import { render } from "../render.js";
import {
  computeBarberStats, dayHeaderLabel, firstDayOfMonth, formatBRL, isMonthUnlocked, lastDayOfMonth, monthKeyStr, timeUntilLabel
} from "../scheduling.js";
import { state } from "../state.js";
import {
  dateKey, escapeHtml, isValidPhone, nowSP, saveErrorMessage
} from "../utils.js";
import { buildBarberCancelWaMessage, waLink } from "../whatsapp.js";
import { doBarberLogout } from "./barber-auth.js";

// ---------- BARBER APP ----------

// ---------- CALENDÁRIO DO BARBEIRO (visão do mês + exceção por dia) ----------

export function renderBarberCalendarCardHtml(){
  var monthDate = state.barberCalendarMonth;
  var todayKey = dateKey(nowSP());
  var first = firstDayOfMonth(monthDate);
  var last = lastDayOfMonth(monthDate);
  var startOffset = first.getDay();
  var daysInMonth = last.getDate();
  var unlocked = isMonthUnlocked(monthDate);

  // Conta agendamentos por dia usando o histórico já carregado em memória
  // (state.appts cobre o ano corrente inteiro), sem precisar de nova busca.
  var apptCounts = {};
  state.appts.forEach(function(a){
    if(a.date.slice(0,7) === monthKeyStr(monthDate)){
      apptCounts[a.date] = (apptCounts[a.date] || 0) + 1;
    }
  });

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
    var isWorkday = !isClosed && (isDefaultWorkDay || hasCustomPeriods);
    var count = apptCounts[k] || 0;
    var classes = ["cal-day"];
    if(isToday) classes.push("is-today");
    if(isPast) classes.push("is-past");
    if(isClosed) classes.push("is-closed");
    else if(isOff) classes.push("is-off");
    if(isWorkday) classes.push("is-workday");
    if(count > 0) classes.push("has-appts");
    if(!unlocked && !isPast) classes.push("is-locked");
    if(k === state.barberSelectedDay) classes.push("is-selected");
    cells.push('<div class="'+classes.join(" ")+'" data-calday="'+k+'" role="button" tabindex="0">'+
      '<span class="cal-num">'+day+'</span>'+
      (count > 0 ? '<span class="cal-dot">'+count+'</span>' : '')+
    '</div>');
  }

  var unlockBoxHtml = "";
  if(!unlocked){
    unlockBoxHtml = '<div class="month-unlock-box">'+
      'Esse mês ainda não está liberado para os clientes agendarem.'+
      '<br><button class="ghost" data-unlockmonth type="button" style="margin-top:8px;">Liberar '+MONTH_NAMES[monthDate.getMonth()]+' para agendamento</button>'+
    '</div>';
  } else if(monthKeyStr(monthDate) !== monthKeyStr(nowSP())){
    unlockBoxHtml = '<div class="month-unlock-box">'+
      'Esse mês está liberado para agendamento.'+
      '<br><button class="ghost" data-lockmonth type="button" style="margin-top:8px;">Bloquear esse mês de novo</button>'+
    '</div>';
  }

  return '<div class="card">'+
    '<h2>Calendário</h2>'+
    '<p class="sub">Toque num dia pra ver os clientes marcados ou ajustar o horário só daquele dia.</p>'+
    '<div class="cal-head">'+
      '<div class="cal-nav"><button type="button" data-calprev aria-label="Mês anterior">&larr;</button></div>'+
      '<div class="cal-title">'+MONTH_NAMES[monthDate.getMonth()]+' de '+monthDate.getFullYear()+'</div>'+
      '<div class="cal-nav"><button type="button" data-calnext aria-label="Próximo mês">&rarr;</button></div>'+
    '</div>'+
    '<div class="cal-dow">'+DOW.map(function(n){ return '<span>'+n+'</span>'; }).join("")+'</div>'+
    '<div class="cal-grid">'+cells.join("")+'</div>'+
    '<div class="cal-legend">'+
      '<span><span class="dot" style="background:var(--gold-dark); border-radius:3px;"></span> Hoje</span>'+
      '<span><span class="dot" style="background:var(--gold-soft); border-radius:3px; border:1px solid var(--gold-dark);"></span> Atende nesse dia</span>'+
      '<span><span class="dot" style="background:var(--gold-dark);"></span> Tem agendamento</span>'+
      '<span><span class="dot" style="background:rgba(193,39,45,0.35); border:1px solid var(--barber-red);"></span> Não atende</span>'+
    '</div>'+
    unlockBoxHtml+
    renderDayEditorHtml()+
  '</div>';
}

export function renderDayEditorHtml(){
  var k = state.barberSelectedDay;
  var draft = state.barberDayDraft;
  if(!k || !draft) return "";
  var dateLabel = k.split("-").reverse().join("/");
  var dayAppts = state.appts.filter(function(a){ return a.date === k; })
    .sort(function(a,b){ return a.time.localeCompare(b.time); });
  var apptsHtml = dayAppts.length
    ? dayAppts.map(function(a){
        return '<div class="day-appt-row">'+a.time+' &middot; '+escapeHtml(a.name)+' &middot; '+escapeHtml(a.serviceName)+(a.done ? ' &middot; realizado' : '')+'</div>';
      }).join("")
    : '<p class="sub" style="margin:6px 0 0;">Nenhum agendamento nesse dia.</p>';

  var periodsHtml = draft.periods.map(function(p, i){
    var removeBtn = draft.periods.length > 1
      ? '<button class="danger" data-dayremoveperiod="'+i+'" type="button">Remover</button>'
      : '';
    return '<div class="grid2" data-day-period-row="'+i+'" style="align-items:end; margin-bottom:10px;">'+
      '<div><label>Abre às (hora)</label><input type="text" data-day-period-field="startHour" value="'+p.startHour+'"></div>'+
      '<div style="display:flex; gap:8px; align-items:end;">'+
        '<div style="flex:1;"><label>Fecha às (hora)</label><input type="text" data-day-period-field="endHour" value="'+p.endHour+'"></div>'+
        removeBtn+
      '</div>'+
    '</div>';
  }).join("");

  return '<div class="day-editor">'+
    '<h2 style="font-size:15px; padding-bottom:0;">'+dateLabel+'</h2>'+
    '<div style="margin:10px 0;">'+apptsHtml+'</div>'+
    '<label style="display:flex; align-items:center; gap:8px; margin-top:6px;">'+
      '<input type="checkbox" id="dayClosedChk" style="width:auto;" '+(draft.closed ? "checked" : "")+'>'+
      ' Fechado nesse dia (sem atendimento)'+
    '</label>'+
    (draft.closed ? "" :
      '<div id="dayPeriodsList" style="margin-top:10px;">'+periodsHtml+'</div>'+
      '<button class="ghost" id="addDayPeriodBtn" type="button" style="margin:4px 0 14px;">+ Adicionar período</button>'
    )+
    '<div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:6px;">'+
      '<button class="primary" id="saveDayBtn" type="button">Salvar horário desse dia</button>'+
      (state.scheduleOverrides[k] ? '<button class="ghost" id="resetDayBtn" type="button">Restaurar horário padrão</button>' : '')+
      '<button class="ghost" id="closeDayEditorBtn" type="button">Fechar</button>'+
    '</div>'+
    '<div id="daySaved" class="hint" role="status" aria-live="polite" style="display:none;"></div>'+
  '</div>';
}

export function wireBarberCalendarHandlers(el){
  var prevBtn = el.querySelector("[data-calprev]");
  if(prevBtn){
    prevBtn.onclick = function(){
      var m = state.barberCalendarMonth;
      state.barberCalendarMonth = new Date(m.getFullYear(), m.getMonth()-1, 1);
      state.barberSelectedDay = null;
      state.barberDayDraft = null;
      render();
      ensureOverridesLoaded(state.barberCalendarMonth).then(render);
    };
  }
  var nextBtn = el.querySelector("[data-calnext]");
  if(nextBtn){
    nextBtn.onclick = function(){
      var m = state.barberCalendarMonth;
      state.barberCalendarMonth = new Date(m.getFullYear(), m.getMonth()+1, 1);
      state.barberSelectedDay = null;
      state.barberDayDraft = null;
      render();
      ensureOverridesLoaded(state.barberCalendarMonth).then(render);
    };
  }

  el.querySelectorAll("[data-calday]").forEach(function(cell){
    makeActivatable(cell, function(){
      var k = cell.getAttribute("data-calday");
      if(state.barberSelectedDay === k){
        state.barberSelectedDay = null;
        state.barberDayDraft = null;
      } else {
        state.barberSelectedDay = k;
        var existing = state.scheduleOverrides[k];
        state.barberDayDraft = existing
          ? {
              closed: !!existing.closed,
              periods: (existing.periods && existing.periods.length)
                ? JSON.parse(JSON.stringify(existing.periods))
                : JSON.parse(JSON.stringify(state.config.workPeriods))
            }
          : { closed: false, periods: JSON.parse(JSON.stringify(state.config.workPeriods)) };
      }
      render();
    });
  });

  var unlockBtn = el.querySelector("[data-unlockmonth]");
  if(unlockBtn){
    unlockBtn.onclick = async function(){
      var mk = monthKeyStr(state.barberCalendarMonth);
      var previous = state.config.unlockedMonths.slice();
      if(state.config.unlockedMonths.indexOf(mk) === -1) state.config.unlockedMonths.push(mk);
      unlockBtn.disabled = true;
      var ok = await saveConfig();
      if(!ok){
        state.config.unlockedMonths = previous;
        showToast(saveErrorMessage(), true);
        render();
        return;
      }
      render();
    };
  }

  var lockBtn = el.querySelector("[data-lockmonth]");
  if(lockBtn){
    lockBtn.onclick = async function(){
      var mk = monthKeyStr(state.barberCalendarMonth);
      var previous = state.config.unlockedMonths.slice();
      var idx = state.config.unlockedMonths.indexOf(mk);
      if(idx !== -1) state.config.unlockedMonths.splice(idx, 1);
      lockBtn.disabled = true;
      var ok = await saveConfig();
      if(!ok){
        state.config.unlockedMonths = previous;
        showToast(saveErrorMessage(), true);
        render();
        return;
      }
      render();
    };
  }

  var dayClosedChk = document.getElementById("dayClosedChk");
  if(dayClosedChk){
    dayClosedChk.onchange = function(){
      state.barberDayDraft.closed = dayClosedChk.checked;
      render();
    };
  }

  var addDayPeriodBtn = document.getElementById("addDayPeriodBtn");
  if(addDayPeriodBtn){
    addDayPeriodBtn.onclick = function(){
      if(state.barberDayDraft.periods.length >= 6){
        showToast("Máximo de 6 períodos por dia.", true);
        return;
      }
      var last = state.barberDayDraft.periods[state.barberDayDraft.periods.length - 1];
      var suggestedStart = Math.min(last.endHour + 1, 22);
      var suggestedEnd = Math.min(suggestedStart + 2, 23);
      state.barberDayDraft.periods.push({startHour: suggestedStart, endHour: suggestedEnd});
      render();
    };
  }

  el.querySelectorAll("[data-dayremoveperiod]").forEach(function(btn){
    btn.onclick = function(){
      var idx = parseInt(btn.getAttribute("data-dayremoveperiod"), 10);
      state.barberDayDraft.periods.splice(idx, 1);
      render();
    };
  });

  var saveDayBtn = document.getElementById("saveDayBtn");
  if(saveDayBtn){
    saveDayBtn.onclick = async function(){
      var k = state.barberSelectedDay;
      var draft = state.barberDayDraft;
      var savedMsg = document.getElementById("daySaved");
      var overrideToSave;
      if(draft.closed){
        overrideToSave = {closed: true, periods: []};
      } else {
        var rows = el.querySelectorAll("[data-day-period-row]");
        var periods = [];
        var invalid = false;
        rows.forEach(function(row){
          var sh = parseInt(row.querySelector('[data-day-period-field="startHour"]').value, 10);
          var eh = parseInt(row.querySelector('[data-day-period-field="endHour"]').value, 10);
          if(isNaN(sh) || isNaN(eh) || sh < 0 || sh > 23 || eh < 1 || eh > 24 || sh >= eh){ invalid = true; }
          periods.push({startHour: sh, endHour: eh});
        });
        periods.sort(function(a,b){ return a.startHour - b.startHour; });
        for(var i = 1; i < periods.length; i++){
          if(periods[i].startHour < periods[i-1].endHour){ invalid = true; }
        }
        if(!periods.length || invalid){
          savedMsg.textContent = "Confira os períodos desse dia (0-23h, sem se sobrepor).";
          savedMsg.style.display = "block";
          return;
        }
        overrideToSave = {closed: false, periods: periods};
      }
      saveDayBtn.disabled = true;
      saveDayBtn.textContent = "Salvando...";
      var ok = await saveDayOverride(k, overrideToSave);
      if(!ok){
        saveDayBtn.disabled = false;
        saveDayBtn.textContent = "Salvar horário desse dia";
        savedMsg.textContent = saveErrorMessage();
        savedMsg.style.display = "block";
        return;
      }
      state.barberDayDraft = overrideToSave;
      render();
    };
  }

  var resetDayBtn = document.getElementById("resetDayBtn");
  if(resetDayBtn){
    resetDayBtn.onclick = async function(){
      var k = state.barberSelectedDay;
      resetDayBtn.disabled = true;
      var ok = await saveDayOverride(k, null);
      if(!ok){
        resetDayBtn.disabled = false;
        showToast(saveErrorMessage(), true);
        return;
      }
      state.barberDayDraft = {closed: false, periods: JSON.parse(JSON.stringify(state.config.workPeriods))};
      render();
    };
  }

  var closeDayEditorBtn = document.getElementById("closeDayEditorBtn");
  if(closeDayEditorBtn){
    closeDayEditorBtn.onclick = function(){
      state.barberSelectedDay = null;
      state.barberDayDraft = null;
      render();
    };
  }
}

// ---------- CLIENTES CADASTRADOS (consulta do barbeiro) ----------

export function clientsListInnerHtml(){
  var search = state.barberClientSearch.trim().toLowerCase();
  var list = state.barberClients;
  if(search){
    list = list.filter(function(c){
      return (c.name || "").toLowerCase().indexOf(search) !== -1 ||
        (c.phone || "").toLowerCase().indexOf(search) !== -1 ||
        (c.email || "").toLowerCase().indexOf(search) !== -1;
    });
  }
  if(!list.length){
    return '<p class="empty">'+(state.barberClientsLoaded ? "Nenhum cliente encontrado." : "Carregando...")+'</p>';
  }

  // Quantas vezes cada cliente já veio (agendamentos marcados como
  // "realizado", dentro do histórico já carregado em memória — que cobre o
  // ano corrente em diante, ver refreshAppts). Serve pro barbeiro enxergar
  // quem é cliente frequente, ex: pra decidir uma promoção tipo "10º corte
  // grátis".
  var visitCounts = {};
  state.appts.forEach(function(a){
    if(a.done && a.uid){ visitCounts[a.uid] = (visitCounts[a.uid] || 0) + 1; }
  });

  return list.map(function(c){
    var visits = visitCounts[c.uid] || 0;
    var isLoyal = visits >= LOYALTY_VISITS_THRESHOLD;

    if(state.barberEditingClientUid === c.uid){
      return '<div class="client-row">'+
        '<label for="editClientName">Nome</label>'+
        '<input type="text" id="editClientName" value="'+escapeHtml(c.name || "")+'" maxlength="60">'+
        '<label for="editClientPhone">Telefone</label>'+
        '<input type="tel" id="editClientPhone" value="'+escapeHtml(c.phone || "")+'">'+
        '<div id="editClientError" class="error" role="alert" aria-live="polite" style="display:none;"></div>'+
        '<div class="modal-actions">'+
          '<button type="button" class="primary" data-saveclient="'+c.uid+'">Salvar</button>'+
          '<button type="button" class="ghost" data-canceleditclient>Cancelar</button>'+
        '</div>'+
      '</div>';
    }

    var starHtml = isLoyal
      ? ' <span class="loyalty-star" data-starclient="'+c.uid+'" role="button" tabindex="0" title="Cliente fiel — enviar promoção">&#9733;</span>'
      : "";

    var promoBoxHtml = "";
    if(state.barberPromoClientUid === c.uid){
      var defaultMsg = "Olá "+(c.name || "")+"! Você já é super cliente da Barbearia B31 ("+visits+" cortes este ano) — "+
        "preparei uma promoção especial pra te agradecer. ";
      promoBoxHtml = '<div class="promo-box" style="margin-top:8px;">'+
        '<label for="promoMsg">Mensagem (edite como quiser antes de enviar)</label>'+
        '<textarea id="promoMsg" rows="4">'+escapeHtml(defaultMsg)+'</textarea>'+
        '<div class="modal-actions" style="margin-top:8px;">'+
          '<button type="button" class="primary" data-sendpromo="'+c.uid+'">Enviar pelo WhatsApp</button>'+
          '<button type="button" class="ghost" data-cancelpromo>Cancelar</button>'+
        '</div>'+
      '</div>';
    }

    return '<div class="client-row">'+
      '<div class="who">'+escapeHtml(c.name || "(sem nome)")+starHtml+'</div>'+
      '<div class="client-meta">'+escapeHtml(c.phone || "-")+' &middot; '+escapeHtml(c.email || "-")+'</div>'+
      '<div class="client-meta">'+visits+(visits === 1 ? " corte realizado" : " cortes realizados")+' este ano</div>'+
      '<div class="client-row-actions">'+
        '<span class="backlink" data-editclient="'+c.uid+'" role="button" tabindex="0">Editar</span>'+
        '<span class="backlink" data-deleteclient="'+c.uid+'" role="button" tabindex="0" style="color:var(--barber-red);">Excluir</span>'+
      '</div>'+
      promoBoxHtml+
    '</div>';
  }).join("");
}

export function renderBarberClientsCardHtml(){
  var total = state.barberClients.length;
  return '<div class="card">'+
    '<div class="appts-head">'+
      '<h2>Clientes cadastrados</h2>'+
      '<button class="ghost" id="refreshClientsBtn" type="button">Atualizar</button>'+
    '</div>'+
    '<p class="sub">'+total+(total === 1 ? " cliente cadastrado" : " clientes cadastrados")+'</p>'+
    '<input type="text" id="clientSearchInput" placeholder="Buscar por nome, telefone ou email" value="'+escapeHtml(state.barberClientSearch)+'" style="margin-bottom:10px;">'+
    '<div id="clientsList">'+clientsListInnerHtml()+'</div>'+
  '</div>';
}

export function wireBarberClientsHandlers(el){
  var searchInput = document.getElementById("clientSearchInput");
  if(searchInput){
    // Atualiza só a lista (não a página inteira) pra não perder o foco nem
    // a posição do cursor a cada letra digitada.
    searchInput.addEventListener("input", function(){
      state.barberClientSearch = searchInput.value;
      var listEl = document.getElementById("clientsList");
      if(listEl) listEl.innerHTML = clientsListInnerHtml();
    });
  }
  var refreshBtn = document.getElementById("refreshClientsBtn");
  if(refreshBtn){
    refreshBtn.onclick = async function(){
      refreshBtn.disabled = true;
      refreshBtn.textContent = "Atualizando...";
      var ok = await refreshClients();
      if(!ok){ showToast(saveErrorMessage(), true); }
      render();
    };
  }

  attachPhoneMask(document.getElementById("editClientPhone"));

  el.querySelectorAll("[data-editclient]").forEach(function(btn){
    makeActivatable(btn, function(){
      state.barberEditingClientUid = btn.getAttribute("data-editclient");
      state.barberPromoClientUid = null;
      render();
    });
  });

  el.querySelectorAll("[data-canceleditclient]").forEach(function(btn){
    makeActivatable(btn, function(){
      state.barberEditingClientUid = null;
      render();
    });
  });

  el.querySelectorAll("[data-saveclient]").forEach(function(btn){
    btn.onclick = async function(){
      var uid = btn.getAttribute("data-saveclient");
      var nameInput = document.getElementById("editClientName");
      var phoneInput = document.getElementById("editClientPhone");
      var errBox = document.getElementById("editClientError");
      var name = nameInput.value.trim().slice(0, 60);
      var phone = phoneInput.value.trim();
      if(!name){
        errBox.textContent = "Informe o nome.";
        errBox.style.display = "block";
        return;
      }
      if(!isValidPhone(phone)){
        errBox.textContent = "Informe um telefone válido, com DDD.";
        errBox.style.display = "block";
        return;
      }
      btn.disabled = true;
      btn.textContent = "Salvando...";
      var ok = await updateClientByBarber(uid, { name: name, phone: phone });
      if(!ok){
        btn.disabled = false;
        btn.textContent = "Salvar";
        errBox.textContent = saveErrorMessage();
        errBox.style.display = "block";
        return;
      }
      var c = state.barberClients.find(function(x){ return x.uid === uid; });
      if(c){ c.name = name; c.phone = phone; }
      state.barberEditingClientUid = null;
      showToast("Cliente atualizado.");
      render();
    };
  });

  el.querySelectorAll("[data-deleteclient]").forEach(function(btn){
    makeActivatable(btn, async function(){
      var uid = btn.getAttribute("data-deleteclient");
      var c = state.barberClients.find(function(x){ return x.uid === uid; });
      var ok = window.confirm("Excluir o cadastro de "+(c ? c.name : "esse cliente")+"? Agendamentos futuros dele serão cancelados.");
      if(!ok) return;
      var deleted = await deleteClientByBarber(uid);
      if(!deleted){
        showToast(saveErrorMessage(), true);
        return;
      }
      state.barberClients = state.barberClients.filter(function(x){ return x.uid !== uid; });
      state.appts = state.appts.filter(function(a){ return a.uid !== uid; });
      showToast("Cliente excluído.");
      render();
    });
  });

  el.querySelectorAll("[data-starclient]").forEach(function(btn){
    makeActivatable(btn, function(){
      state.barberEditingClientUid = null;
      state.barberPromoClientUid = btn.getAttribute("data-starclient");
      render();
    });
  });

  el.querySelectorAll("[data-cancelpromo]").forEach(function(btn){
    makeActivatable(btn, function(){
      state.barberPromoClientUid = null;
      render();
    });
  });

  el.querySelectorAll("[data-sendpromo]").forEach(function(btn){
    btn.onclick = function(){
      var uid = btn.getAttribute("data-sendpromo");
      var c = state.barberClients.find(function(x){ return x.uid === uid; });
      var msgInput = document.getElementById("promoMsg");
      var msg = msgInput.value.trim();
      if(!msg) return;
      var link = c && waLink(c.phone, msg);
      if(!link){
        showToast("Esse cliente não tem um telefone válido salvo.", true);
        return;
      }
      window.open(link, "_blank");
      state.barberPromoClientUid = null;
      render();
    };
  });
}

export function renderBarberApp(el){
  var now = nowSP();
  var todayKey = dateKey(now);
  var tomorrowDate = new Date(now); tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  var tomorrowKey = dateKey(tomorrowDate);

  var upcoming = state.appts
    .filter(function(a){ return a.date >= todayKey || !a.done; })
    .sort(function(a,b){ return (a.date+a.time).localeCompare(b.date+b.time); });

  // Group into day buckets (list is already sorted, so same-date items are
  // always consecutive) — makes a long schedule scannable at a glance
  // instead of one flat list mixing today, tomorrow and next week together.
  var groups = [];
  upcoming.forEach(function(a){
    var last = groups[groups.length - 1];
    if(!last || last.date !== a.date){ groups.push({date: a.date, items: [a]}); }
    else { last.items.push(a); }
  });

  var todayCount = 0, overdueCount = 0;
  groups.forEach(function(g){
    if(g.date === todayKey) todayCount += g.items.length;
    else if(g.date < todayKey) overdueCount += g.items.length;
  });

  // The next thing the barber needs to actually do — first appointment
  // (today or later) that isn't done and hasn't already passed.
  var nextAppt = null;
  for(var i = 0; i < upcoming.length; i++){
    var cand = upcoming[i];
    if(cand.done) continue;
    if(new Date(cand.date + "T" + cand.time + ":00").getTime() >= now.getTime()){ nextAppt = cand; break; }
  }
  // Card isolado do próximo atendimento — é a resposta mais direta pra "o
  // que eu preciso fazer agora", por isso fica destacado antes de tudo na
  // aba "Hoje", em vez de dividir espaço dentro do card de agendamentos.
  var nextCardHtml = "";
  if(nextAppt){
    nextCardHtml =
      '<div class="card next-appt-card">'+
        '<div class="next-appt-label">Próximo atendimento</div>'+
        '<div class="next-appt-body">'+
          '<div><strong>'+escapeHtml(nextAppt.name)+'</strong> · '+escapeHtml(nextAppt.serviceName)+'</div>'+
          '<div class="next-appt-when">'+timeUntilLabel(nextAppt, now, todayKey, tomorrowKey)+'</div>'+
        '</div>'+
      '</div>';
  }

  var apptsHtml = '<p class="empty">Nenhum agendamento por enquanto.</p>';
  if(groups.length){
    apptsHtml = groups.map(function(g){
      var overdue = g.date < todayKey;
      var label = (overdue ? "Atrasado · " : "") + dayHeaderLabel(g.date, todayKey, tomorrowKey);
      var rows = g.items.map(function(a){
        var dur = a.minutes || state.config.slotMinutes;
        var actionsHtml = a.done
          ? '<span class="done-badge">&#10003; Realizado</span><button class="ghost" data-undone="'+a.id+'">Desfazer</button>'
          : '<button class="success" data-done="'+a.id+'">Realizado</button><button class="danger" data-cancel="'+a.id+'">Cancelar</button>';
        return '<div class="appt'+(a.done ? ' done' : '')+'">'+
          '<div>'+
            '<div class="who">'+escapeHtml(a.name)+' · '+escapeHtml(a.serviceName)+' ('+dur+' min)</div>'+
            '<div class="when">às '+a.time+' · '+escapeHtml(a.phone)+'</div>'+
          '</div>'+
          '<div class="appt-actions">'+actionsHtml+'</div>'+
        '</div>';
      }).join("");
      return '<div class="appt-day-group">'+
        '<div class="appt-day-header'+(overdue ? ' is-overdue' : '')+'">'+label+'</div>'+
        rows+
      '</div>';
    }).join("");
  }

  var weekdayToggle = DOW.map(function(name, idx){
    var on = state.config.workDays.indexOf(idx) !== -1;
    return '<span class="'+(on?'on':'')+'" data-day="'+idx+'" aria-pressed="'+on+'">'+name+'</span>';
  }).join("");

  var periodsHtml = state.config.workPeriods.map(function(p, i){
    var removeBtn = state.config.workPeriods.length > 1
      ? '<button class="danger" data-removeperiod="'+i+'" type="button">Remover</button>'
      : '';
    return '<div class="grid2" data-period-row="'+i+'" style="align-items:end; margin-bottom:10px;">'+
      '<div><label>Abre às (hora)</label><input type="text" data-period-field="startHour" data-idx="'+i+'" value="'+p.startHour+'"></div>'+
      '<div style="display:flex; gap:8px; align-items:end;">'+
        '<div style="flex:1;"><label>Fecha às (hora)</label><input type="text" data-period-field="endHour" data-idx="'+i+'" value="'+p.endHour+'"></div>'+
        removeBtn+
      '</div>'+
    '</div>';
  }).join("");

  var stats = computeBarberStats();
  var statsHtml =
    '<div class="card">'+
      '<h2>Seu desempenho</h2>'+
      '<p class="sub">Considera só os agendamentos marcados como "realizado".</p>'+
      '<div class="stats-grid">'+
        '<div class="stat-box"><div class="stat-label">Saldo da semana</div><div class="stat-value money">'+formatBRL(stats.weekEarnings)+'</div></div>'+
        '<div class="stat-box"><div class="stat-label">Trabalhos da semana</div><div class="stat-value">'+stats.weekJobs+'</div></div>'+
        '<div class="stat-box"><div class="stat-label">Saldo do mês</div><div class="stat-value money">'+formatBRL(stats.monthEarnings)+'</div></div>'+
        '<div class="stat-box"><div class="stat-label">Trabalhos do mês</div><div class="stat-value">'+stats.monthJobs+'</div></div>'+
      '</div>'+
    '</div>'+
    '<div class="card">'+
      '<h2>Perfil</h2>'+
      '<p class="sub">Acumulado do ano de '+stats.year+'.</p>'+
      '<div class="stats-grid">'+
        '<div class="stat-box"><div class="stat-label">Saldo anual</div><div class="stat-value money">'+formatBRL(stats.yearEarnings)+'</div></div>'+
        '<div class="stat-box"><div class="stat-label">Trabalhos no ano</div><div class="stat-value">'+stats.yearJobs+'</div></div>'+
        '<div class="stat-box"><div class="stat-label">Dia mais movimentado</div><div class="stat-value">'+
          (stats.busiestDowLabel ? escapeHtml(stats.busiestDowLabel) : "—")+
        '</div></div>'+
      '</div>'+
      (stats.busiestDowLabel ? '<p class="sub" style="margin:8px 0 0;">'+stats.busiestDowCount+(stats.busiestDowCount === 1 ? " agendamento contando" : " agendamentos contando")+' esse dia da semana (passados e futuros).</p>' : "")+
    '</div>';

  var apptsSubtitleBits = [todayCount + (todayCount === 1 ? " agendamento hoje" : " agendamentos hoje")];
  if(overdueCount) apptsSubtitleBits.push(overdueCount + (overdueCount === 1 ? " pendente de dia anterior" : " pendentes de dias anteriores"));

  // Aba "Hoje" — o que o barbeiro precisa ver assim que abre o painel no
  // dia a dia: quem vem a seguir e a agenda do dia/próximos dias.
  var hojeHtml =
    nextCardHtml+
    '<div class="card">'+
      '<div class="appts-head">'+
        '<h2>Agendamentos</h2>'+
        '<button class="ghost" id="refreshApptsBtn">Atualizar</button>'+
      '</div>'+
      '<p class="sub">'+apptsSubtitleBits.join(" · ")+'</p>'+
      apptsHtml+
    '</div>';

  // Aba "Ajustes" — desempenho, configuração de dias/horários e serviços:
  // coisa que se mexe raramente, separada do que é olhado todo dia.
  var ajustesHtml =
    statsHtml+
    '<div class="card">'+
      '<h2>Configurações</h2>'+
      '<p class="sub">Dias e horários de atendimento</p>'+
      '<label>Dias que atende</label>'+
      '<div class="weekday-toggle">'+weekdayToggle+'</div>'+
      '<label>Períodos de atendimento no dia</label>'+
      '<p class="sub" style="margin:-4px 0 10px;">Ex: 3 períodos — 09h às 12h, 14h às 17h e 18h às 21h.</p>'+
      '<div id="periodsList">'+periodsHtml+'</div>'+
      '<button class="ghost" id="addPeriodBtn" type="button" style="margin:4px 0 14px;">+ Adicionar período</button>'+
      '<label for="slotMin">Duração do intervalo de horários (min)</label>'+
      '<input type="text" id="slotMin" value="'+state.config.slotMinutes+'">'+
      '<label for="newPin">Trocar PIN de acesso</label>'+
      '<input type="password" id="newPin" placeholder="Deixe em branco pra manter o PIN atual" value="" autocomplete="new-password">'+
      '<label for="confirmNewPin">Confirmar novo PIN</label>'+
      '<input type="password" id="confirmNewPin" placeholder="Repita o novo PIN" value="" autocomplete="new-password">'+
      '<p class="sub" style="margin:2px 0 12px;"><span class="backlink" id="toggleNewPinVisibility">mostrar PIN</span></p>'+
      '<label for="barberWhatsapp">WhatsApp para receber confirmações e cancelamentos</label>'+
      '<input type="tel" id="barberWhatsapp" placeholder="(11) 91234-5678" value="'+escapeHtml(state.config.whatsapp || "")+'">'+
      '<button class="primary" id="saveCfgBtn">Salvar configurações</button>'+
      '<div id="cfgSaved" class="hint" role="status" aria-live="polite" style="display:none;">Configurações salvas.</div>'+
    '</div>'+
    '<div class="card">'+
      '<h2>Serviços</h2>'+
      '<div id="servicesList"></div>'+
      '<button class="ghost" id="addSvcBtn" style="margin-top:10px;">+ Adicionar serviço</button>'+
    '</div>'+
    '<div class="card">'+
      '<h2>Serviços mais realizados</h2>'+
      '<p class="sub">Total de '+stats.year+', considerando só os agendamentos marcados como "realizado".</p>'+
      (stats.byService.length
        ? '<div class="stats-grid">'+stats.byService.map(function(s){
            return '<div class="stat-box">'+
              '<div class="stat-label">'+escapeHtml(s.serviceName)+'</div>'+
              '<div class="stat-value">'+s.count+(s.count === 1 ? " vez" : " vezes")+'</div>'+
              '<div class="stat-value money" style="font-size:14px;">'+formatBRL(s.earnings)+'</div>'+
            '</div>';
          }).join("")+'</div>'
        : '<p class="empty">Nenhum serviço realizado ainda este ano.</p>')+
    '</div>'+
    bugReportSectionHtml("barber", state.barberBugOpen);

  var tabDefs = [
    {id:"hoje", label:"Hoje"+(todayCount ? " ("+todayCount+")" : "")},
    {id:"calendario", label:"Calendário"},
    {id:"clientes", label:"Clientes"},
    {id:"ajustes", label:"Ajustes"}
  ];
  var tabsHtml = '<div class="barber-tabs">'+tabDefs.map(function(t){
    var active = state.barberTab === t.id;
    return '<button type="button" class="'+(active?"active":"")+'" data-barbertab="'+t.id+'" aria-pressed="'+active+'">'+t.label+'</button>';
  }).join("")+'</div>';

  var tabContent;
  if(state.barberTab === "calendario") tabContent = renderBarberCalendarCardHtml();
  else if(state.barberTab === "clientes") tabContent = renderBarberClientsCardHtml();
  else if(state.barberTab === "ajustes") tabContent = ajustesHtml;
  else tabContent = hojeHtml;

  el.innerHTML =
    '<span class="backlink" id="logoutBarber">&larr; sair do painel</span>'+
    tabsHtml+
    tabContent;

  attachPhoneMask(document.getElementById("barberWhatsapp"));
  attachDigitsOnly(document.getElementById("newPin"));
  attachDigitsOnly(document.getElementById("confirmNewPin"));
  var toggleNewPinBtn = document.getElementById("toggleNewPinVisibility");
  if(toggleNewPinBtn){
    makeActivatable(toggleNewPinBtn, function(){
      var newPinInput = document.getElementById("newPin");
      var confirmPinInput = document.getElementById("confirmNewPin");
      var showing = newPinInput.type === "text";
      var newType = showing ? "password" : "text";
      newPinInput.type = newType;
      if(confirmPinInput) confirmPinInput.type = newType;
      toggleNewPinBtn.textContent = showing ? "mostrar PIN" : "ocultar PIN";
    });
  }
  wireBugReportHandlers("barber", "barbeiro");
  wireBarberCalendarHandlers(el);
  wireBarberClientsHandlers(el);

  el.querySelectorAll("[data-barbertab]").forEach(function(btn){
    btn.onclick = function(){
      state.barberTab = btn.getAttribute("data-barbertab");
      render();
    };
  });

  var logoutHandler = doBarberLogout;
  var logoutBtn = document.getElementById("logoutBarber");
  logoutBtn.setAttribute("tabindex", "0");
  logoutBtn.setAttribute("role", "button");
  logoutBtn.onclick = logoutHandler;
  logoutBtn.onkeydown = function(ev){
    if(ev.key === "Enter" || ev.key === " "){ ev.preventDefault(); logoutHandler(); }
  };

  var refreshApptsBtn = document.getElementById("refreshApptsBtn");
  if(refreshApptsBtn){
    refreshApptsBtn.onclick = async function(){
      refreshApptsBtn.disabled = true;
      refreshApptsBtn.textContent = "Atualizando...";
      await refreshAppts();
      render();
    };
  }

  el.querySelectorAll("[data-cancel]").forEach(function(btn){
    btn.onclick = async function(){
      var id = btn.getAttribute("data-cancel");
      var target = state.appts.find(function(a){ return a.id === id; });
      if(!target) return;
      var ok = window.confirm("Cancelar esse agendamento?");
      if(!ok) return;
      var previous = state.appts;
      // Mesmo truque do fluxo do cliente: abre a aba em branco JÁ AQUI,
      // ainda como resposta direta ao clique — celulares (principalmente
      // Safari/iOS) bloqueiam window.open() feito depois de um await.
      var waTab = target.phone ? window.open("", "_blank") : null;
      state.appts = state.appts.filter(function(a){ return a.id !== id; });
      render();
      var okSave = await cancelApptDoc(id);
      if(!okSave){
        if(waTab) waTab.close();
        state.appts = previous;
        showToast(saveErrorMessage(), true);
        render();
        return;
      }
      if(waTab){
        var link = waLink(target.phone, buildBarberCancelWaMessage(target));
        if(link){ waTab.location = link; } else { waTab.close(); }
      }
    };
  });

  el.querySelectorAll("[data-done]").forEach(function(btn){
    btn.onclick = async function(){
      var id = btn.getAttribute("data-done");
      var target = state.appts.find(function(a){ return a.id === id; });
      if(!target) return;
      target.done = true;
      render();
      var ok = await setApptDoneDoc(id, true);
      if(!ok){
        target.done = false;
        showToast(saveErrorMessage(), true);
        render();
        return;
      }
    };
  });

  el.querySelectorAll("[data-undone]").forEach(function(btn){
    btn.onclick = async function(){
      var id = btn.getAttribute("data-undone");
      var target = state.appts.find(function(a){ return a.id === id; });
      if(!target) return;
      target.done = false;
      render();
      var ok = await setApptDoneDoc(id, false);
      if(!ok){
        target.done = true;
        showToast(saveErrorMessage(), true);
        render();
        return;
      }
    };
  });

  el.querySelectorAll(".weekday-toggle span").forEach(function(node){
    makeActivatable(node, function(){
      var day = parseInt(node.getAttribute("data-day"), 10);
      var idx = state.config.workDays.indexOf(day);
      if(idx === -1){ state.config.workDays.push(day); } else { state.config.workDays.splice(idx, 1); }
      render();
    });
  });

  var addPeriodBtn = document.getElementById("addPeriodBtn");
  if(addPeriodBtn){
    addPeriodBtn.onclick = function(){
      if(state.config.workPeriods.length >= 6){
        showToast("Máximo de 6 períodos por dia.", true);
        return;
      }
      var last = state.config.workPeriods[state.config.workPeriods.length - 1];
      // Sugere um período logo depois do último, já dando um intervalo de 1h
      // pra não nascer colado no anterior — o barbeiro pode ajustar na hora.
      var suggestedStart = Math.min(last.endHour + 1, 22);
      var suggestedEnd = Math.min(suggestedStart + 2, 23);
      state.config.workPeriods.push({startHour: suggestedStart, endHour: suggestedEnd});
      render();
    };
  }

  el.querySelectorAll("[data-removeperiod]").forEach(function(btn){
    btn.onclick = function(){
      var idx = parseInt(btn.getAttribute("data-removeperiod"), 10);
      state.config.workPeriods.splice(idx, 1);
      render();
    };
  });

  var saveCfgBtn = document.getElementById("saveCfgBtn");
  if(saveCfgBtn){
    saveCfgBtn.onclick = async function(){
      var periodRows = el.querySelectorAll("[data-period-row]");
      var periods = [];
      var periodsInvalid = false;
      periodRows.forEach(function(row){
        var sh = parseInt(row.querySelector('[data-period-field="startHour"]').value, 10);
        var eh = parseInt(row.querySelector('[data-period-field="endHour"]').value, 10);
        if(isNaN(sh) || isNaN(eh) || sh < 0 || sh > 23 || eh < 1 || eh > 24 || sh >= eh){
          periodsInvalid = true;
        }
        periods.push({startHour: sh, endHour: eh});
      });
      // Períodos não podem se sobrepor (ex: 09h-13h e 12h-15h), senão o mesmo
      // horário apareceria duplicado na lista do cliente.
      periods.sort(function(a,b){ return a.startHour - b.startHour; });
      for(var i = 1; i < periods.length; i++){
        if(periods[i].startHour < periods[i-1].endHour){ periodsInvalid = true; }
      }
      var sm = parseInt(document.getElementById("slotMin").value, 10);
      var newPin = document.getElementById("newPin").value.trim().slice(0, 12);
      var confirmNewPin = document.getElementById("confirmNewPin").value.trim().slice(0, 12);
      var whatsapp = document.getElementById("barberWhatsapp").value.trim();
      var saved = document.getElementById("cfgSaved");
      if(!periods.length || periodsInvalid){
        saved.textContent = "Confira os períodos de atendimento (0-23h, sem se sobrepor).";
        saved.style.display = "block";
        return;
      }
      if(isNaN(sm) || sm <= 0 || sm > 240){
        saved.textContent = "Confira a duração do intervalo de horários (1 a 240 min).";
        saved.style.display = "block";
        return;
      }
      // O campo de PIN só é validado se o barbeiro digitou algo — deixar em
      // branco significa "não quero trocar o PIN agora".
      if(newPin && newPin.length < 6){
        saved.textContent = "O novo PIN precisa ter pelo menos 6 caracteres.";
        saved.style.display = "block";
        return;
      }
      if(newPin && newPin !== confirmNewPin){
        saved.textContent = "O PIN e a confirmação não são iguais.";
        saved.style.display = "block";
        return;
      }
      // WhatsApp é opcional (sem ele, o botão de confirmação/cancelamento via
      // WhatsApp simplesmente não aparece pro cliente), mas se preenchido
      // precisa ser um número válido com DDD.
      if(whatsapp && !isValidPhone(whatsapp)){
        saved.textContent = "Informe um WhatsApp válido, com DDD, ou deixe o campo em branco.";
        saved.style.display = "block";
        return;
      }
      var previous = {workPeriods: state.config.workPeriods, slotMinutes: state.config.slotMinutes, whatsapp: state.config.whatsapp};
      state.config.workPeriods = periods;
      state.config.slotMinutes = sm;
      state.config.whatsapp = whatsapp;
      var ok = await saveConfig();
      if(!ok){
        state.config.workPeriods = previous.workPeriods;
        state.config.slotMinutes = previous.slotMinutes;
        state.config.whatsapp = previous.whatsapp;
        saved.textContent = saveErrorMessage();
        saved.style.display = "block";
        return;
      }
      // O PIN é salvo separado (hash + salt em barberSecrets, nunca em texto
      // puro), só quando o barbeiro realmente digitou um novo valor.
      if(newPin){
        try{
          var newSalt = randomHex(16);
          var newHash = await hashPin(newPin, newSalt);
          await setDoc(doc(db, "barberSecrets", "main"), { pinHash: newHash, pinSalt: newSalt, pinAlgo: PIN_HASH_ALGO });
          document.getElementById("newPin").value = "";
          document.getElementById("confirmNewPin").value = "";
        }catch(e){
          saved.textContent = "Configurações salvas, mas não foi possível trocar o PIN agora. Tente de novo.";
          saved.style.display = "block";
          render();
          return;
        }
      }
      saved.textContent = "Configurações salvas.";
      saved.style.display = "block";
      render();
    };
  }

  renderServicesList();

  var addSvcBtn = document.getElementById("addSvcBtn");
  if(addSvcBtn){
    addSvcBtn.onclick = async function(){
      state.config.services.push({id:"s"+Date.now(), name:"Novo serviço", price:0, minutes:30});
      var ok = await saveConfig();
      if(!ok){
        state.config.services.pop();
        showToast(saveErrorMessage(), true);
        return;
      }
      render();
    };
  }
}

export function renderServicesList(){
  var box = document.getElementById("servicesList");
  if(!box) return;
  box.innerHTML = state.config.services.map(function(s, i){
    return '<div class="grid2" style="align-items:end; margin-bottom:10px; border-bottom:1px solid var(--line); padding-bottom:10px;">'+
      '<div><label>Nome</label><input type="text" data-field="name" data-idx="'+i+'" value="'+escapeHtml(s.name)+'"></div>'+
      '<div style="display:flex; gap:8px;">'+
        '<div style="flex:1;"><label>Preço (R$)</label><input type="text" data-field="price" data-idx="'+i+'" value="'+s.price+'"></div>'+
        '<div style="flex:1;"><label>Min.</label><input type="text" data-field="minutes" data-idx="'+i+'" value="'+s.minutes+'"></div>'+
      '</div>'+
      '<button class="danger" data-removesvc="'+i+'" style="grid-column:1/-1; width:fit-content;">Remover</button>'+
    '</div>';
  }).join("");

  box.querySelectorAll("input").forEach(function(inp){
    inp.onchange = async function(){
      var idx = parseInt(inp.getAttribute("data-idx"), 10);
      var field = inp.getAttribute("data-field");
      var val = inp.value;
      var previous = state.config.services[idx][field];
      if(field === "name"){
        val = val.trim().slice(0, 40);
        if(!val) val = "Serviço";
      } else if(field === "price"){
        val = parseFloat(val);
        if(isNaN(val) || val < 0) val = 0;
        val = Math.min(Math.round(val * 100) / 100, 9999);
      } else if(field === "minutes"){
        val = parseInt(val, 10);
        if(isNaN(val) || val <= 0) val = state.config.slotMinutes;
        val = Math.min(val, 480);
      }
      state.config.services[idx][field] = val;
      inp.value = val;
      var ok = await saveConfig();
      if(!ok){
        state.config.services[idx][field] = previous;
        inp.value = previous;
        showToast(saveErrorMessage(), true);
      }
    };
  });
  box.querySelectorAll("[data-removesvc]").forEach(function(btn){
    btn.onclick = async function(){
      var idx = parseInt(btn.getAttribute("data-removesvc"), 10);
      var removed = state.config.services.splice(idx, 1)[0];
      var ok = await saveConfig();
      if(!ok){
        state.config.services.splice(idx, 0, removed);
        showToast(saveErrorMessage(), true);
        return;
      }
      render();
    };
  });
}
