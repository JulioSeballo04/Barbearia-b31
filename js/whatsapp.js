import { state } from "./state.js";
import { nowSP, onlyDigits } from "./utils.js";

// Monta um link wa.me (grátis, sem API paga) com mensagem pré-preenchida.
// O campo salvo em barberConfig.whatsapp guarda só DDD+número (mesma
// máscara do telefone do cliente), então sempre prefixamos o código do
// Brasil (55) antes de montar o link.
export function waLink(phoneRaw, message){
  var digits = onlyDigits(phoneRaw);
  if(!digits) return null;
  if(digits.length <= 11){ digits = "55" + digits; }
  return "https://wa.me/" + digits + "?text=" + encodeURIComponent(message);
}

export function buildBookingWaMessage(confirmed){
  return "Olá! Quero confirmar meu agendamento na Barbearia B31:\n" +
    "Serviço: " + confirmed.serviceName + "\n" +
    "Data: " + confirmed.dateLabel + "\n" +
    "Horário: " + confirmed.time + "\n" +
    "Cliente: " + (state.clientSession ? state.clientSession.name : "");
}

export function buildCancelWaMessage(appt){
  var dateLabel = appt.date.split("-").reverse().join("/");
  return "Olá! Preciso cancelar meu agendamento na Barbearia B31:\n" +
    "Serviço: " + appt.serviceName + "\n" +
    "Data: " + dateLabel + "\n" +
    "Horário: " + appt.time + "\n" +
    "Cliente: " + appt.name;
}

export function buildBugReportMailto(context, description){
  var subject = "B31 — Problema relatado (" + context + ")";
  var lines = [
    "Descrição do problema:",
    description || "(não descrito)",
    "",
    "--- Contexto (não apague, ajuda a investigar) ---",
    "Página: " + context,
    "Data/hora: " + nowSP().toLocaleString("pt-BR"),
  ];
  if(context === "cliente" && state.clientSession){
    lines.push("Cliente: " + state.clientSession.name + " (" + state.clientSession.phone + ")");
  }
  var body = lines.join("\n");
  return "mailto:projetos.tecnologia2026@gmail.com?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
}

// Mensagem enviada pro CLIENTE quando é o BARBEIRO quem cancela pelo
// painel dele (sentido contrário da função acima).
export function buildBarberCancelWaMessage(appt){
  var dateLabel = appt.date.split("-").reverse().join("/");
  return "Olá " + appt.name + "! Infelizmente precisei cancelar seu agendamento na Barbearia B31:\n" +
    "Serviço: " + appt.serviceName + "\n" +
    "Data: " + dateLabel + "\n" +
    "Horário: " + appt.time + "\n" +
    "Vamos combinar um novo horário quando for melhor pra você. Desculpa o transtorno!";
}
