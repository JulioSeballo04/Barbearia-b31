import { refreshClientOwnAppts } from "../data.js";
import { attachPhoneMask, renderAuthLogo } from "../dom.js";
import {
  auth, db, doc, getDoc, googleProvider, setDoc, signInWithPopup, signOut
} from "../firebase.js";
import { openPrivacyLinkHtml, wirePrivacyLink } from "../modals.js";
import { render } from "../render.js";
import { firstDayOfMonth } from "../scheduling.js";
import { state } from "../state.js";
import { escapeHtml, isValidPhone, nowSP, saveErrorMessage } from "../utils.js";

// ---------- CLIENT AUTH ----------

export function renderClientAuth(el){
  el.innerHTML =
    '<span class="backlink" id="backLink">&larr; voltar</span>'+
    renderAuthLogo()+
    '<div class="card">'+
      '<h2>Quero agendar</h2>'+
      '<p class="sub">Entre com sua conta Google pra marcar um horário.</p>'+
      '<div id="authError" class="error" role="alert" aria-live="polite" style="display:none;"></div>'+
      '<button class="primary" id="googleBtn">Entrar com Google</button>'+
    '</div>'+
    openPrivacyLinkHtml();

  document.getElementById("backLink").setAttribute("tabindex", "0");
  document.getElementById("backLink").setAttribute("role", "button");
  var backHandler = function(){ state.screen = "landing"; render(); };
  document.getElementById("backLink").onclick = backHandler;
  document.getElementById("backLink").onkeydown = function(ev){
    if(ev.key === "Enter" || ev.key === " "){ ev.preventDefault(); backHandler(); }
  };
  wirePrivacyLink(el);

  document.getElementById("googleBtn").onclick = async function(){
    var errBox = document.getElementById("authError");
    var btn = document.getElementById("googleBtn");
    errBox.style.display = "none";
    btn.disabled = true;
    btn.textContent = "Abrindo o Google...";
    try{
      var result = await signInWithPopup(auth, googleProvider);
      var user = result.user;
      var profileSnap = await getDoc(doc(db, "clients", user.uid));
      if(profileSnap.exists() && profileSnap.data().phone){
        var p = profileSnap.data();
        state.clientSession = {uid: user.uid, name: p.name || user.displayName, phone: p.phone, email: p.email || user.email};
        state.screen = "clientApp";
        render();
        refreshClientOwnAppts().then(render);
      } else {
        state.pendingGoogleUser = user;
        state.screen = "clientPhone";
        render();
      }
    }catch(e){
      btn.disabled = false;
      btn.textContent = "Entrar com Google";
      // Se a pessoa simplesmente fechou o popup, não precisa mostrar erro.
      if(e && e.code === "auth/popup-closed-by-user") return;
      errBox.textContent = "Não foi possível entrar com o Google. Tente novamente.";
      errBox.style.display = "block";
    }
  };
}

// ---------- CLIENT PHONE (completar cadastro após login Google) ----------

export function renderClientPhoneStep(el){
  var user = state.pendingGoogleUser;
  el.innerHTML =
    renderAuthLogo()+
    '<div class="card">'+
      '<h2>Falta pouco</h2>'+
      '<p class="sub">Confirme seu nome e informe seu telefone com DDD pra concluir o cadastro.</p>'+
      '<label for="nameStepInput">Nome</label>'+
      '<input type="text" id="nameStepInput" placeholder="Seu nome" maxlength="60" value="'+escapeHtml(user.displayName || "")+'">'+
      '<p class="sub" style="margin:4px 0 0;">É esse nome que vai aparecer pro barbeiro nos agendamentos.</p>'+
      '<label for="phoneStepInput">Telefone</label>'+
      '<input type="tel" id="phoneStepInput" placeholder="(11) 91234-5678" autocomplete="tel">'+
      '<p class="sub" style="margin:4px 0 0;">Usado pra confirmar seu agendamento e como meio de contato com o barbeiro (ex: em caso de cancelamento).</p>'+
      '<label style="display:flex; align-items:center; gap:8px; margin-top:14px;">'+
        '<input type="checkbox" id="ageConfirmChk" style="width:auto;">'+
        ' Declaro ser maior de 18 anos, ou estar agendando como responsável por um menor.'+
      '</label>'+
      '<div id="phoneStepError" class="error" role="alert" aria-live="polite" style="display:none;"></div>'+
      '<button class="primary" id="phoneStepBtn">Concluir cadastro</button>'+
    '</div>';

  attachPhoneMask(document.getElementById("phoneStepInput"));
  document.getElementById("phoneStepBtn").onclick = async function(){
    var nameInput = document.getElementById("nameStepInput");
    var input = document.getElementById("phoneStepInput");
    var ageChk = document.getElementById("ageConfirmChk");
    var errBox = document.getElementById("phoneStepError");
    var name = nameInput.value.trim().slice(0, 60);
    var phone = input.value.trim();
    nameInput.classList.remove("invalid");
    input.classList.remove("invalid");
    if(!name){
      nameInput.classList.add("invalid");
      errBox.textContent = "Informe seu nome.";
      errBox.style.display = "block";
      return;
    }
    if(!isValidPhone(phone)){
      input.classList.add("invalid");
      errBox.textContent = "Informe um telefone válido, com DDD.";
      errBox.style.display = "block";
      return;
    }
    if(!ageChk.checked){
      errBox.textContent = "Confirme que é maior de 18 anos (ou responsável) pra continuar.";
      errBox.style.display = "block";
      return;
    }
    errBox.style.display = "none";
    var btn = document.getElementById("phoneStepBtn");
    btn.disabled = true;
    btn.textContent = "Salvando...";
    try{
      await setDoc(doc(db, "clients", user.uid), {
        uid: user.uid,
        name: name,
        email: user.email || "",
        photoURL: user.photoURL || "",
        phone: phone,
        // Registro de quando a pessoa confirmou a declaração de maioridade
        // (ver checkbox acima) — não é uma verificação real de idade (o app
        // não tem como confirmar isso de fato), só o registro de que a
        // pessoa afirmou estar de acordo antes de criar a conta.
        ageConfirmedAt: Date.now()
      }, { merge: true });
      state.clientSession = {uid: user.uid, name: name, phone: phone, email: user.email};
      state.pendingGoogleUser = null;
      state.screen = "clientApp";
      render();
      refreshClientOwnAppts().then(render);
    }catch(e){
      btn.disabled = false;
      btn.textContent = "Concluir cadastro";
      errBox.textContent = saveErrorMessage();
      errBox.style.display = "block";
    }
  };
}

export async function doClientLogout(){
  try{ await signOut(auth); }catch(e){}
  state.clientSession = null;
  state.clientEditingName = false;
  state.clientEditingPhone = false;
  state.pendingGoogleUser = null;
  state.clientConfirmed = null;
  state.clientSelectedService = null;
  state.clientSelectedDate = null;
  state.clientSelectedSlot = null;
  state.clientCalendarMonth = firstDayOfMonth(nowSP());
  state.clientDateAppts = [];
  state.clientOwnAppts = [];
  state.clientView = "book";
  state.clientBugOpen = false;
  state.screen = "landing";
  render();
}
