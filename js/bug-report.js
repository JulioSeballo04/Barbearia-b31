import { makeActivatable } from "./dom.js";
import { render } from "./render.js";
import { state } from "./state.js";
import { buildBugReportMailto } from "./whatsapp.js";

// Card reaproveitado tanto na tela do cliente quanto no painel do
// barbeiro. Usa mailto: de propósito (sem servidor, sem custo, sem
// depender de nenhuma API externa) — clicar abre o app de e-mail do
// próprio usuário já com o destinatário e a descrição preenchidos.
export function bugReportCardHtml(idPrefix){
  return '<div class="card">'+
    '<h2>Encontrou um problema?</h2>'+
    '<p class="sub">Descreva o que aconteceu. Isso vai abrir seu aplicativo de e-mail com a mensagem já preenchida.</p>'+
    '<label for="'+idPrefix+'BugDesc">O que aconteceu?</label>'+
    '<textarea id="'+idPrefix+'BugDesc" rows="3" placeholder="Ex: ao confirmar o agendamento, apareceu uma mensagem de erro e a tela travou..."></textarea>'+
    '<div style="display:flex; gap:16px; align-items:center; margin-top:12px; flex-wrap:wrap;">'+
      '<button class="ghost" id="'+idPrefix+'ReportBtn">Reportar por e-mail</button>'+
      '<span class="backlink" id="'+idPrefix+'BugToggle">Fechar</span>'+
    '</div>'+
  '</div>';
}

// Versão "recolhida" do card acima: só um link discreto, pra não competir
// visualmente com o fluxo principal da tela (agendar / ver a agenda do
// dia). Abre o card completo (função acima) quando tocado.
export function bugReportTeaserHtml(idPrefix){
  return '<div class="bug-teaser"><span class="backlink" id="'+idPrefix+'BugToggle">Encontrou um problema? Reportar por e-mail</span></div>';
}

export function bugReportSectionHtml(idPrefix, isOpen){
  return isOpen ? bugReportCardHtml(idPrefix) : bugReportTeaserHtml(idPrefix);
}

export function wireBugReportHandlers(idPrefix, context){
  var toggle = document.getElementById(idPrefix+"BugToggle");
  if(toggle){
    makeActivatable(toggle, function(){
      if(idPrefix === "client") state.clientBugOpen = !state.clientBugOpen;
      else state.barberBugOpen = !state.barberBugOpen;
      render();
    });
  }
  var btn = document.getElementById(idPrefix+"ReportBtn");
  if(!btn) return;
  btn.onclick = function(){
    var desc = document.getElementById(idPrefix+"BugDesc").value.trim();
    window.location.href = buildBugReportMailto(context, desc);
  };
}

