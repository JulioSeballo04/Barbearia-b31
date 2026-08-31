import { DOW } from "./constants.js";

export function saveErrorMessage(){
  return "Não foi possível salvar. Verifique sua conexão e tente novamente.";
}

export function apptDocId(dateKey, time){
  return dateKey + "_" + time.replace(":", "");
}

// Configs antigos (salvos antes dos períodos múltiplos existirem) só têm
// startHour/endHour soltos. Isso transforma isso num período único, pra
// quem já usava o app não perder a configuração que tinha.
export function migrateConfig(cfg){
  if(!cfg.workPeriods || !cfg.workPeriods.length){
    cfg.workPeriods = [{
      startHour: (typeof cfg.startHour === "number") ? cfg.startHour : 9,
      endHour: (typeof cfg.endHour === "number") ? cfg.endHour : 19
    }];
  }
  if(!Array.isArray(cfg.unlockedMonths)) cfg.unlockedMonths = [];
  return cfg;
}

export function pad(n){ return n < 10 ? "0"+n : ""+n; }
export function dateKey(d){ return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate()); }
// Caminho inverso de dateKey: transforma "AAAA-MM-DD" de volta num Date
// local, usado quando o dia escolhido no calendário do cliente não está
// necessariamente numa lista de dias já montada em memória.
export function dateFromKey(k){
  var p = k.split("-");
  return new Date(parseInt(p[0],10), parseInt(p[1],10)-1, parseInt(p[2],10));
}
// Formata "AAAA-MM-DD" como "Seg 14/09", reaproveitado no resumo do
// agendamento e na tela de confirmação.
export function formatDateLabel(k){
  var d = dateFromKey(k);
  return DOW[d.getDay()] + " " + d.getDate() + "/" + pad(d.getMonth()+1);
}

// A barbearia funciona sempre no horário de Brasília (America/Sao_Paulo),
// não importa de onde o cliente esteja acessando. Sem isso, os cálculos de
// "hoje" e "que horas são agora" usariam o fuso do dispositivo de quem
// estiver com o app aberto — um cliente acessando de outro fuso (ou com o
// relógio do celular fora de hora) veria dias e horários errados.
//
// Isso corrige o FUSO HORÁRIO (o app sempre calcula como se estivesse em
// São Paulo, seja qual for o fuso do navegador). Não corrige um relógio do
// aparelho genuinamente errado (ex: alguém que mexeu manualmente na data do
// celular) — isso exigiria consultar um relógio de servidor, o que precisa
// de mais infraestrutura do que só HTML+Firestore.
export function nowSP(){
  var parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());
  var map = {};
  parts.forEach(function(p){ if(p.type !== "literal") map[p.type] = p.value; });
  // Monta um Date "local" com os componentes de horário de SP, pra que
  // getDay()/getHours()/getDate() etc. já leiam certo em qualquer lugar
  // do código sem precisar mexer em cada função que usa esses métodos.
  return new Date(
    parseInt(map.year, 10), parseInt(map.month, 10) - 1, parseInt(map.day, 10),
    parseInt(map.hour, 10), parseInt(map.minute, 10), parseInt(map.second, 10)
  );
}
export function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
  });
}

export function onlyDigits(s){ return String(s || "").replace(/\D/g, ""); }

export function formatPhoneInput(value){
  var d = onlyDigits(value).slice(0, 11);
  if(d.length <= 2) return d.length ? "(" + d : "";
  if(d.length <= 7) return "(" + d.slice(0,2) + ") " + d.slice(2);
  return "(" + d.slice(0,2) + ") " + d.slice(2,7) + "-" + d.slice(7);
}

export function isValidPhone(value){
  var d = onlyDigits(value);
  return d.length === 10 || d.length === 11;
}

export function isValidPassword(value){
  return String(value || "").length >= 4;
}
