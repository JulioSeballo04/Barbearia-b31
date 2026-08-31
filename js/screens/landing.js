import { BARBER_ICON_SVG, CLIENT_ICON_SVG } from "../constants.js";
import { makeActivatable, renderAuthLogo } from "../dom.js";
import { openPrivacyLinkHtml, wirePrivacyLink } from "../modals.js";
import { render } from "../render.js";
import { state } from "../state.js";

// ---------- LANDING ----------

export function renderLanding(el){
  el.innerHTML =
    '<div class="landing-wrap">'+
      '<div class="landing-hero">'+
        renderAuthLogo(true)+
        '<p class="lead">Agende seu horário em poucos toques.</p>'+
      '</div>'+
      '<p class="landing-subtitle">Escolha como continuar</p>'+
      '<div class="landing-grid">'+
        '<div class="landing-card" id="goClient">'+
          '<div class="icon">'+CLIENT_ICON_SVG+'</div>'+
          '<h3>Quero agendar<span class="arrow">&rarr;</span></h3>'+
          '<p>Entre na sua conta ou crie uma para marcar um horário.</p>'+
        '</div>'+
        '<div class="landing-card" id="goBarber">'+
          '<div class="icon">'+BARBER_ICON_SVG+'</div>'+
          '<h3>Acessar meus clientes<span class="arrow">&rarr;</span></h3>'+
          '<p>Área do barbeiro. Acesso restrito.</p>'+
        '</div>'+
      '</div>'+
    '</div>'+
    openPrivacyLinkHtml();
  makeActivatable(document.getElementById("goClient"), function(){
    state.screen = "clientAuth";
    render();
  });
  makeActivatable(document.getElementById("goBarber"), function(){
    state.screen = "barberAuth";
    render();
  });
  wirePrivacyLink(el);
}
