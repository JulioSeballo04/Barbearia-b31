import { BARBER_EMAIL, BARBER_SESSION_PERSIST_MS, BARBER_SESSION_STORAGE_KEY, DEFAULT_PIN } from "../constants.js";
import { refreshClients, startApptsListener, stopApptsListener } from "../data.js";
import { attachDigitsOnly, makeActivatable, renderAuthLogo } from "../dom.js";
import {
  auth, db, deleteField, doc, getDoc, googleProvider, setDoc, signInWithPopup, signOut, updateDoc
} from "../firebase.js";
import { PIN_HASH_ALGO, hashPin, hashPinLegacySha256, randomHex } from "../pin.js";
import { render } from "../render.js";
import { state } from "../state.js";
import { escapeHtml } from "../utils.js";

export function isCurrentUserTheBarber(){
  return !!(auth.currentUser && auth.currentUser.email === BARBER_EMAIL &&
    auth.currentUser.providerData.some(function(p){ return p.providerId === "google.com"; }));
}

// Marca "PIN confirmado agora neste aparelho" — chamado tanto no login
// quanto (renovando o prazo) a cada atividade dentro do painel, pra um dia
// inteiro de uso contínuo nunca expirar essa trava por inatividade.
export function touchBarberSession(){
  try{ localStorage.setItem(BARBER_SESSION_STORAGE_KEY, String(Date.now())); }catch(e){}
}

// Se true, o painel pode reabrir direto (sem pedir o PIN de novo) assim que
// o Firebase confirmar que a sessão Google do barbeiro ainda está válida —
// é o que faz "atualizar a página" não jogar o barbeiro pra tela de PIN
// toda vez, contanto que ele já tenha confirmado o PIN há pouco tempo neste
// mesmo aparelho.
export function isBarberSessionUnlocked(){
  try{
    var raw = localStorage.getItem(BARBER_SESSION_STORAGE_KEY);
    if(!raw) return false;
    var ts = parseInt(raw, 10);
    return !isNaN(ts) && (Date.now() - ts) < BARBER_SESSION_PERSIST_MS;
  }catch(e){ return false; }
}

// ---------- BARBER AUTH ----------

// Desloga de verdade (encerra a sessão Google) pra forçar reautenticação
// completa no próximo acesso, e não só o PIN de conveniência — por isso
// também limpa a marca de "PIN lembrado" (BARBER_SESSION_STORAGE_KEY), senão
// o próximo onAuthStateChanged ainda tentaria reabrir o painel sozinho.
export async function doBarberLogout(){
  stopApptsListener();
  try{ await signOut(auth); }catch(e){}
  try{ localStorage.removeItem(BARBER_SESSION_STORAGE_KEY); }catch(e){}
  state.barberLoggedIn = false;
  state.barberTab = "hoje";
  state.barberBugOpen = false;
  state.screen = "landing";
  render();
}

export function renderBarberAuth(el){
  var backHandler2 = function(){ state.screen = "landing"; render(); };

  if(!isCurrentUserTheBarber()){
    // Etapa 1 — identidade real, verificada pelo próprio Google e conferida
    // pela regra do Firestore (isBarberSession agora exige esse e-mail
    // específico, não só "qualquer sessão anônima"). Isso é o que corrige a
    // falha em que qualquer visitante conseguia criar uma sessão anônima
    // por fora do app e ganhar permissão de barbeiro sem PIN nenhum.
    el.innerHTML =
      '<span class="backlink" id="backLink">&larr; voltar</span>'+
      renderAuthLogo()+
      '<div class="card">'+
        '<h2>Acesso do barbeiro</h2>'+
        '<p class="sub">Área restrita — entre com a conta Google cadastrada como barbeiro.</p>'+
        '<div id="barberGoogleError" class="error" role="alert" aria-live="polite" style="display:none;"></div>'+
        '<button class="primary" id="barberGoogleBtn">Entrar com Google</button>'+
      '</div>';
    document.getElementById("backLink").setAttribute("tabindex", "0");
    document.getElementById("backLink").setAttribute("role", "button");
    document.getElementById("backLink").onclick = backHandler2;
    document.getElementById("backLink").onkeydown = function(ev){
      if(ev.key === "Enter" || ev.key === " "){ ev.preventDefault(); backHandler2(); }
    };
    document.getElementById("barberGoogleBtn").onclick = async function(){
      var errBox = document.getElementById("barberGoogleError");
      var btn = document.getElementById("barberGoogleBtn");
      errBox.style.display = "none";
      btn.disabled = true;
      btn.textContent = "Abrindo o Google...";
      try{
        var result = await signInWithPopup(auth, googleProvider);
        if(result.user.email !== BARBER_EMAIL){
          // Conta errada: desloga na hora, pra não deixar uma sessão Google
          // válida (mas não autorizada) pendurada no navegador.
          try{ await signOut(auth); }catch(e){}
          btn.disabled = false;
          btn.textContent = "Entrar com Google";
          errBox.textContent = "Essa conta não tem acesso ao painel do barbeiro.";
          errBox.style.display = "block";
          return;
        }
        render(); // agora isCurrentUserTheBarber() é true — recai na etapa do PIN
      }catch(e){
        btn.disabled = false;
        btn.textContent = "Entrar com Google";
        if(e && e.code === "auth/popup-closed-by-user") return;
        errBox.textContent = "Não foi possível entrar com o Google. Tente novamente.";
        errBox.style.display = "block";
      }
    };
    return;
  }

  // Etapa 2 — já reconhecido pelo Google como o barbeiro; o PIN aqui é só
  // uma trava rápida de conveniência neste aparelho (ex: reabrir o painel
  // sem repetir o login do Google toda hora). A segurança de verdade já
  // foi garantida antes desta tela.
  el.innerHTML =
    '<span class="backlink" id="backLink">&larr; voltar</span>'+
    renderAuthLogo()+
    '<div class="card">'+
      '<h2>Acesso do barbeiro</h2>'+
      '<p class="sub">Conectado como '+escapeHtml(auth.currentUser.email)+'. Confirme o PIN pra abrir o painel.</p>'+
      '<label for="pinInput">PIN de acesso</label>'+
      '<div class="pin-field-wrap">'+
        '<input type="password" id="pinInput" placeholder="****" inputmode="numeric" autocomplete="off">'+
        '<span class="backlink" id="togglePinVisibility">mostrar</span>'+
      '</div>'+
      '<div id="pinError" class="error" role="alert" aria-live="polite" style="display:none;">PIN incorreto.</div>'+
      '<button class="primary" id="pinBtn">Entrar</button>'+
    '</div>';
  document.getElementById("backLink").setAttribute("tabindex", "0");
  document.getElementById("backLink").setAttribute("role", "button");
  document.getElementById("backLink").onclick = backHandler2;
  document.getElementById("backLink").onkeydown = function(ev){
    if(ev.key === "Enter" || ev.key === " "){ ev.preventDefault(); backHandler2(); }
  };
  var pinInput = document.getElementById("pinInput");
  attachDigitsOnly(pinInput);
  var togglePinBtn = document.getElementById("togglePinVisibility");
  makeActivatable(togglePinBtn, function(){
    var showing = pinInput.type === "text";
    pinInput.type = showing ? "password" : "text";
    togglePinBtn.textContent = showing ? "mostrar" : "ocultar";
  });
  async function tryPin(){
    var val = pinInput.value.trim();
    var errBox = document.getElementById("pinError");
    var btn = document.getElementById("pinBtn");
    if(!val){
      pinInput.classList.add("invalid");
      errBox.textContent = "Informe o PIN.";
      errBox.style.display = "block";
      return;
    }
    btn.disabled = true;
    btn.textContent = "Verificando...";
    try{
      var secretsSnap = await getDoc(doc(db, "barberSecrets", "main"));
      var pinHash, pinSalt, pinAlgo;
      if(secretsSnap.exists()){
        pinHash = secretsSnap.data().pinHash;
        pinSalt = secretsSnap.data().pinSalt;
        pinAlgo = secretsSnap.data().pinAlgo; // ausente em instalações antigas
      } else {
        // Primeiro acesso depois de passar a hashear o PIN: se ainda
        // existir um PIN em texto puro salvo do jeito antigo, migra ele
        // pra um hash agora (sem o barbeiro precisar fazer nada). Se não
        // existir nada ainda (instalação nova), usa o PIN padrão.
        var legacyPin = (state.config && typeof state.config.pin === "string") ? state.config.pin : DEFAULT_PIN;
        pinSalt = randomHex(16);
        pinHash = await hashPin(legacyPin, pinSalt);
        pinAlgo = PIN_HASH_ALGO;
        await setDoc(doc(db, "barberSecrets", "main"), { pinHash: pinHash, pinSalt: pinSalt, pinAlgo: pinAlgo });
        if(state.config && typeof state.config.pin !== "undefined"){
          try{ await updateDoc(doc(db, "barberConfig", "main"), { pin: deleteField() }); }catch(e){}
          delete state.config.pin;
        }
      }

      var matched;
      if(pinAlgo === PIN_HASH_ALGO){
        var typedHash = await hashPin(val, pinSalt);
        matched = (typedHash === pinHash);
      } else {
        // Hash salvo com o algoritmo antigo (SHA-256 direto). Verifica do
        // jeito antigo e, se bater, já troca pro PBKDF2 na hora — o
        // barbeiro nem percebe, mas da próxima vez em diante o PIN já
        // está protegido com o hash mais forte.
        var legacyTypedHash = await hashPinLegacySha256(val, pinSalt);
        matched = (legacyTypedHash === pinHash);
        if(matched){
          try{
            var upgradedHash = await hashPin(val, pinSalt);
            await setDoc(doc(db, "barberSecrets", "main"), { pinHash: upgradedHash, pinSalt: pinSalt, pinAlgo: PIN_HASH_ALGO });
          }catch(e){ /* login segue normalmente mesmo se o upgrade falhar agora */ }
        }
      }

      if(matched){
        state.barberLoggedIn = true;
        state.screen = "barberApp";
        touchBarberSession();
        render();
        startApptsListener();
        refreshClients().then(render);
      } else {
        btn.disabled = false;
        btn.textContent = "Entrar";
        pinInput.classList.add("invalid");
        errBox.textContent = "PIN incorreto.";
        errBox.style.display = "block";
      }
    }catch(e){
      btn.disabled = false;
      btn.textContent = "Entrar";
      errBox.textContent = "Não foi possível verificar o PIN. Verifique sua conexão.";
      errBox.style.display = "block";
    }
  }
  document.getElementById("pinBtn").onclick = tryPin;
  pinInput.addEventListener("keydown", function(ev){
    if(ev.key === "Enter"){ ev.preventDefault(); tryPin(); }
    pinInput.classList.remove("invalid");
  });
}
