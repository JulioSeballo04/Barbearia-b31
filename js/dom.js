import { LOGO_IMG_SRC } from "./constants.js";
import { formatPhoneInput } from "./utils.js";

export function renderAuthLogo(dark){
  return '<div class="auth-logo'+(dark ? ' on-dark' : '')+'">'+
    '<img class="logo-img" src="'+LOGO_IMG_SRC+'" alt="Barbearia B31 — Barber Shop, since 2023">'+
    '<div class="mini-stripe"></div>'+
  '</div>';
}

export function attachPhoneMask(inputEl){
  if(!inputEl) return;
  inputEl.setAttribute("inputmode", "tel");
  inputEl.setAttribute("autocomplete", "tel");
  inputEl.addEventListener("input", function(){
    var pos = inputEl.selectionStart;
    var before = inputEl.value.length;
    inputEl.value = formatPhoneInput(inputEl.value);
    var after = inputEl.value.length;
    var newPos = Math.max(0, pos + (after - before));
    try{ inputEl.setSelectionRange(newPos, newPos); }catch(e){}
  });
}

// PIN de acesso é sempre numérico — barra letra/símbolo na hora de digitar
// (em vez de só validar depois de enviar), tanto pro campo de login quanto
// pro campo de trocar o PIN em Ajustes.
export function attachDigitsOnly(inputEl){
  if(!inputEl) return;
  inputEl.setAttribute("inputmode", "numeric");
  inputEl.setAttribute("pattern", "[0-9]*");
  inputEl.addEventListener("input", function(){
    var pos = inputEl.selectionStart;
    var before = inputEl.value.length;
    inputEl.value = inputEl.value.replace(/\D/g, "");
    var after = inputEl.value.length;
    var newPos = Math.max(0, pos - (before - after));
    try{ inputEl.setSelectionRange(newPos, newPos); }catch(e){}
  });
}

export function makeActivatable(node, handler){
  node.setAttribute("tabindex", "0");
  node.setAttribute("role", "button");
  node.onclick = handler;
  node.onkeydown = function(ev){
    if(ev.key === "Enter" || ev.key === " " || ev.key === "Spacebar"){
      ev.preventDefault();
      handler();
    }
  };
}

export var toastTimer = null;
export function showToast(message, isError){
  var existing = document.getElementById("appToast");
  if(existing) existing.remove();
  var toast = document.createElement("div");
  toast.id = "appToast";
  toast.className = "app-toast" + (isError ? " error" : "");
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.textContent = message;
  document.body.appendChild(toast);
  if(toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ toast.remove(); }, 4000);
}

