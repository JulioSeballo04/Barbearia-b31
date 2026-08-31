import { BARBER_EMAIL } from "./constants.js";
import { loadData, refreshClients, refreshClientOwnAppts, startApptsListener } from "./data.js";
import { auth, db, doc, getDoc, onAuthStateChanged } from "./firebase.js";
import { render } from "./render.js";
import { isBarberSessionUnlocked, touchBarberSession } from "./screens/barber-auth.js";
import { state } from "./state.js";

async function init(){
  render();
  await loadData();

  // Restaura a sessão do cliente se o navegador ainda tiver um login
  // Google válido (Firebase mantém isso entre recarregamentos de página).
  // O painel do barbeiro só abre sozinho nesse restore se, além da sessão
  // Google, ele também já tiver confirmado o PIN há pouco tempo neste
  // aparelho (ver isBarberSessionUnlocked/BARBER_SESSION_PERSIST_MS) — sem
  // isso ele sempre passa de novo pela tela de acesso (Google + PIN), que é
  // a trava real. Isso inclui a própria conta do barbeiro: se ela também
  // tiver (por teste, por exemplo) um perfil de cliente salvo, o restore de
  // cliente é pulado mesmo assim — senão, ao recarregar a página logado
  // como barbeiro, o app cairia direto na tela de agendamento do cliente em
  // vez de ficar na landing/painel, o que já aconteceu na prática.
  var restoreResolved = false;
  onAuthStateChanged(auth, async function(user){
    if(restoreResolved) return; // só usa a primeira notificação, na carga inicial
    restoreResolved = true;
    if(user && user.email === BARBER_EMAIL){
      if(isBarberSessionUnlocked()){
        state.barberLoggedIn = true;
        state.screen = "barberApp";
        touchBarberSession();
        render();
        startApptsListener();
        refreshClients().then(render);
      }
      return;
    }
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

  // Enquanto o painel estiver aberto, cada clique/tecla renova o prazo do
  // "PIN lembrado" neste aparelho (ver touchBarberSession/
  // BARBER_SESSION_PERSIST_MS em barber-auth.js/constants.js) — assim um
  // dia inteiro de uso contínuo nunca esbarra nesse prazo. Não existe mais
  // nenhum logout automático por inatividade: o painel só desloga quando o
  // barbeiro clica em "Sair", ou depois de BARBER_SESSION_PERSIST_MS sem
  // abrir o app nenhuma vez.
  ["click", "keydown"].forEach(function(evt){
    document.addEventListener(evt, function(){
      if(state.screen === "barberApp") touchBarberSession();
    });
  });
}
init();

// Registra o service worker (PWA — permite "Instalar app"/"Adicionar à
// Tela de Início" e dá uma resiliência básica offline; ver sw.js). Falha
// em silêncio em navegadores sem suporte, sem afetar o resto do app.
if("serviceWorker" in navigator){
  window.addEventListener("load", function(){
    navigator.serviceWorker.register("./sw.js").catch(function(){});
  });
}
