import { loadData, refreshClientOwnAppts } from "./data.js";
import { auth, db, doc, getDoc, onAuthStateChanged } from "./firebase.js";
import { render } from "./render.js";
import { doBarberLogout } from "./screens/barber-auth.js";
import { state } from "./state.js";

async function init(){
  render();
  await loadData();

  // Restaura a sessão do cliente se o navegador ainda tiver um login
  // Google válido (Firebase mantém isso entre recarregamentos de página).
  // O painel do barbeiro nunca abre sozinho nesse restore, mesmo que a
  // mesma conta Google do barbeiro esteja logada — ele sempre passa de
  // novo pela tela de acesso (Google + PIN), que é a trava real.
  var restoreResolved = false;
  onAuthStateChanged(auth, async function(user){
    if(restoreResolved) return; // só usa a primeira notificação, na carga inicial
    restoreResolved = true;
    if(user && user.providerData.some(function(p){ return p.providerId === "google.com"; })){
      try{
        var profileSnap = await getDoc(doc(db, "clients", user.uid));
        if(profileSnap.exists() && profileSnap.data().phone){
          var p = profileSnap.data();
          state.clientSession = {uid: user.uid, name: p.name || user.displayName, phone: p.phone, email: p.email || user.email};
          state.screen = "clientApp";
          render();
          refreshClientOwnAppts().then(render);
        }
      }catch(e){}
    }
  });

  render();

  // Desloga o painel do barbeiro sozinho depois de um tempo sem nenhum
  // clique/tecla — útil se o aparelho ficar esquecido aberto num balcão.
  var BARBER_INACTIVITY_LIMIT_MS = 30 * 60 * 1000; // 30 minutos
  ["click", "keydown"].forEach(function(evt){
    document.addEventListener(evt, function(){
      if(state.screen === "barberApp") state.barberLastActivity = Date.now();
    });
  });

  // Agendamentos novos já chegam em tempo real via startApptsListener() (ver
  // acima). Este intervalo agora só cuida do logout por inatividade.
  setInterval(async function(){
    if(state.screen !== "barberApp") return;
    if(state.barberLastActivity && (Date.now() - state.barberLastActivity) > BARBER_INACTIVITY_LIMIT_MS){
      await doBarberLogout();
    }
  }, 30000);
}
init();
