import { DOW } from "./constants.js";
import { state } from "./state.js";
import { dateKey, nowSP, pad } from "./utils.js";

// ---------- EXCEÇÕES DE HORÁRIO POR DIA (scheduleOverrides) ----------
// Além da grade semanal recorrente (workDays/workPeriods), o barbeiro pode
// abrir uma exceção pontual pra um dia específico: fechar um dia que
// normalmente atenderia (ex: feriado, folga) ou abrir/ajustar horário num
// dia que normalmente não atenderia (ex: um sábado especial). O documento
// tem o próprio dateKey como ID; guardamos "date" também no corpo pra dar
// pra fazer range query por documentId() sem precisar de índice composto.

export function monthKeyStr(d){ return d.getFullYear()+"-"+pad(d.getMonth()+1); }

export function isMonthUnlocked(d){
  var mk = monthKeyStr(d);
  if(mk === monthKeyStr(nowSP())) return true; // mês corrente sempre liberado
  return (state.config.unlockedMonths || []).indexOf(mk) !== -1;
}

export function firstDayOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
export function lastDayOfMonth(d){ return new Date(d.getFullYear(), d.getMonth()+1, 0); }

export function nextDays(n){
  var out = [];
  var today = nowSP();
  today.setHours(0,0,0,0);
  // O horizonte de agendamento nunca passa do fim do mês corrente, a não
  // ser que o barbeiro já tenha liberado o mês seguinte — por isso o loop
  // para tanto quando junta "n" dias válidos quanto quando sai do
  // horizonte liberado, o que vier primeiro (em vez de um limite fixo de
  // dias corridos que poderia atravessar pra um mês ainda travado).
  var i = 0;
  while(out.length < n && i < 62){
    var d = new Date(today);
    d.setDate(d.getDate() + i);
    i++;
    if(!isMonthUnlocked(d)) break;
    var k = dateKey(d);
    var override = state.scheduleOverrides[k];
    if(override && override.closed) continue;
    var isDefaultWorkDay = state.config.workDays.indexOf(d.getDay()) !== -1;
    var hasCustomPeriods = override && Array.isArray(override.periods) && override.periods.length;
    if(!isDefaultWorkDay && !hasCustomPeriods) continue;
    out.push(d);
  }
  return out;
}

export function slotsForDate(d, durationMinutes){
  var slots = [];
  var step = state.config.slotMinutes;
  var duration = durationMinutes || step;
  var isToday = dateKey(d) === dateKey(nowSP());
  var now = nowSP();
  var nowMin = now.getHours()*60 + now.getMinutes();
  var override = state.scheduleOverrides[dateKey(d)];
  if(override && override.closed) return slots;
  var periods = (override && Array.isArray(override.periods) && override.periods.length)
    ? override.periods : state.config.workPeriods;
  periods.forEach(function(period){
    var startMin = period.startHour * 60;
    var endMin = period.endHour * 60;
    for(var m = startMin; m + duration <= endMin; m += step){
      if(isToday && m <= nowMin) continue;
      var h = Math.floor(m/60), mm = m%60;
      slots.push(pad(h)+":"+pad(mm));
    }
  });
  slots.sort();
  return slots;
}

export function timeToMinutes(t){
  var parts = t.split(":");
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

export function apptsForDate(dateStr){
  return state.clientDateAppts.filter(function(a){ return a.date === dateStr; });
}

// Checks whether a candidate [startTime, startTime+duration) overlaps any
// existing appointment that day, so a longer service (ex: Corte + Barba)
// correctly blocks out shorter slots that would otherwise fit inside it.
//
// O "intervalo" configurado pelo barbeiro (state.config.slotMinutes) tem
// DOIS papéis: além de ser o passo da grade de horários (11:00, 11:15,
// 11:30...), ele também funciona como um tempo de buffer/limpeza que é
// somado ao fim de CADA agendamento existente. Por isso, um corte de 30min
// às 11:00 com intervalo de 15min ocupa até as 11:45 (não só até as
// 11:30) — o próximo horário realmente livre é 11:45.
export function isSlotAvailable(dateStr, startTime, duration){
  var startMin = timeToMinutes(startTime);
  var endMin = startMin + duration;
  var buffer = state.config.slotMinutes;
  var dayAppts = apptsForDate(dateStr);
  for(var i = 0; i < dayAppts.length; i++){
    var a = dayAppts[i];
    var aStart = timeToMinutes(a.time);
    var aDur = a.minutes || state.config.slotMinutes;
    var aEnd = aStart + aDur + buffer;
    if(startMin < aEnd && endMin > aStart){ return false; }
  }
  return true;
}

export function isTaken(dateStr, time){
  return !isSlotAvailable(dateStr, time, state.config.slotMinutes);
}

// ---------- BARBER STATS (saldo/trabalhos) ----------
// Instead of keeping a fragile "reset every Monday / every 1st" counter that
// would drift or double count if the barber skips opening the app for a
// while, the weekly/monthly figures are simply recalculated from the
// appointment history every time the panel renders. That naturally "resets"
// the moment a new week/month begins (there's nothing from it yet), while
// the annual total keeps growing all year since it's the same history,
// just filtered by the current year.
export function startOfWeek(d){
  var date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var day = date.getDay(); // 0 = domingo
  var diffToMonday = (day === 0 ? -6 : 1 - day);
  date.setDate(date.getDate() + diffToMonday);
  return date;
}

export function isCompletedAppt(a, now){
  return a.done === true;
}

// An appointment is "overdue" when its slot has already passed and nobody
// marked it done or cancelled it — the barber forgot, or the client was a
// no-show. These get called out separately in the panel instead of quietly
// blending into the schedule, since a no-show or forgotten confirmation is
// exactly the kind of thing a busy barber can lose track of.
export function isOverdueAppt(a, now){
  if(a.done) return false;
  var dt = new Date(a.date + "T" + a.time + ":00");
  return dt.getTime() < now.getTime();
}

export function dayHeaderLabel(dstr, todayKey, tomorrowKey){
  if(dstr === todayKey) return "Hoje";
  if(dstr === tomorrowKey) return "Amanhã";
  var parts = dstr.split("-").map(function(n){ return parseInt(n, 10); });
  var d = new Date(parts[0], parts[1] - 1, parts[2]);
  return DOW[d.getDay()] + ", " + dstr.split("-").reverse().slice(0, 2).join("/");
}

// "em 25 min" / "em 2h 10min" for later today, or "Amanhã às 09:00" /
// "Ter, 02/09 às 09:00" for anything past today.
export function timeUntilLabel(a, now, todayKey, tomorrowKey){
  var dt = new Date(a.date + "T" + a.time + ":00");
  if(a.date !== todayKey){
    return dayHeaderLabel(a.date, todayKey, tomorrowKey) + " às " + a.time;
  }
  var diffMin = Math.round((dt.getTime() - now.getTime()) / 60000);
  if(diffMin <= 0) return "agora";
  if(diffMin < 60) return "em " + diffMin + " min";
  var h = Math.floor(diffMin / 60), m = diffMin % 60;
  return "em " + h + "h" + (m ? " " + m + "min" : "");
}

export function formatBRL(n){
  return "R$ " + (Math.round((n || 0) * 100) / 100).toFixed(2).replace(".", ",");
}

export function computeBarberStats(){
  var now = nowSP();
  var weekStartKey = dateKey(startOfWeek(now));
  var monthKey = now.getFullYear() + "-" + pad(now.getMonth() + 1);
  var yearNum = now.getFullYear();

  var stats = {
    weekEarnings: 0, weekJobs: 0,
    monthEarnings: 0, monthJobs: 0,
    yearEarnings: 0, yearJobs: 0,
    year: yearNum
  };

  state.appts.forEach(function(a){
    if(!isCompletedAppt(a, now)) return;
    var price = a.price || 0;
    if(a.date >= weekStartKey){
      stats.weekEarnings += price;
      stats.weekJobs += 1;
    }
    if(a.date.slice(0, 7) === monthKey){
      stats.monthEarnings += price;
      stats.monthJobs += 1;
    }
    if(parseInt(a.date.slice(0, 4), 10) === yearNum){
      stats.yearEarnings += price;
      stats.yearJobs += 1;
    }
  });

  return stats;
}

// Agendamentos futuros (ainda não realizados) do próprio cliente logado —
// usado tanto pra decidir se mostra a aba "Seus agendamentos" quanto pra
// montar a lista dentro dela.
export function getUpcomingClientAppts(){
  var todayKey = dateKey(nowSP());
  return state.clientOwnAppts.filter(function(a){
    return !a.done && a.date >= todayKey;
  });
}
