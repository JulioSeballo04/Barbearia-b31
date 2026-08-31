import { renderDeleteAccountModal, renderPrivacyModal } from "./modals.js";
import { renderBarberApp } from "./screens/barber-app.js";
import { renderBarberAuth } from "./screens/barber-auth.js";
import { renderClientApp } from "./screens/client-app.js";
import { renderClientAuth, renderClientPhoneStep } from "./screens/client-auth.js";
import { renderLanding } from "./screens/landing.js";
import { state } from "./state.js";

export function render(){
  var el = document.getElementById("app");
  if(!state.loaded){
    el.innerHTML = '<div class="card"><p class="empty">Carregando...</p></div>';
    renderPrivacyModal();
    return;
  }
  if(state.screen === "landing") renderLanding(el);
  else if(state.screen === "clientAuth") renderClientAuth(el);
  else if(state.screen === "clientPhone") renderClientPhoneStep(el);
  else if(state.screen === "clientApp") renderClientApp(el);
  else if(state.screen === "barberAuth") renderBarberAuth(el);
  else if(state.screen === "barberApp") renderBarberApp(el);
  renderPrivacyModal();
  renderDeleteAccountModal();
}
