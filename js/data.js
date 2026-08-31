import { DEFAULT_CONFIG } from "./constants.js";
import {
  auth, collection, db, deleteDoc, deleteField, deleteUser, doc, documentId, getDoc, getDocs, googleProvider, onSnapshot, query, runTransaction, setDoc, signInWithPopup, updateDoc, where
} from "./firebase.js";
import { render } from "./render.js";
import { firstDayOfMonth, lastDayOfMonth, monthKeyStr } from "./scheduling.js";
import { state } from "./state.js";
import { apptDocId, dateKey, migrateConfig, nowSP } from "./utils.js";

export async function loadData(){
  try{
    var cfgSnap = await getDoc(doc(db, "barberConfig", "main"));
    if(cfgSnap.exists()){
      state.config = migrateConfig(cfgSnap.data());
    } else {
      state.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
      await setDoc(doc(db, "barberConfig", "main"), state.config);
    }
  }catch(e){
    state.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }
  var thisMonth = nowSP();
  var nextMonth = new Date(thisMonth.getFullYear(), thisMonth.getMonth()+1, 1);
  await ensureOverridesLoaded(thisMonth);
  await ensureOverridesLoaded(nextMonth);
  state.barberCalendarMonth = firstDayOfMonth(thisMonth);
  state.clientCalendarMonth = firstDayOfMonth(thisMonth);
  state.loaded = true;
}

// Each save function returns true/false so callers can tell the user when a
// write didn't actually reach storage (e.g. offline) instead of silently
// updating the UI as if it worked.
export async function saveConfig(){
  try{ await setDoc(doc(db, "barberConfig", "main"), state.config); return true; }
  catch(e){ return false; }
}

// Cria o agendamento numa transação: o documento tem ID determinístico
// (data_horário), e a transação só escreve se ele ainda não existir. Isso
// elimina a corrida de condição de dois clientes confirmando o mesmo
// horário ao mesmo tempo — o segundo sempre recebe SLOT_TAKEN.
export async function bookAppointmentTx(appt){
  var id = apptDocId(appt.date, appt.time);
  var ref = doc(db, "appointments", id);
  await runTransaction(db, async function(tx){
    var existing = await tx.get(ref);
    if(existing.exists()){ throw new Error("SLOT_TAKEN"); }
    tx.set(ref, appt);
  });
  return id;
}

export async function cancelApptDoc(id){
  try{ await deleteDoc(doc(db, "appointments", id)); return true; }
  catch(e){ return false; }
}

export async function setApptDoneDoc(id, doneVal){
  try{ await updateDoc(doc(db, "appointments", id), { done: !!doneVal }); return true; }
  catch(e){ return false; }
}

// Pulls appointments from Firestore. Needed because each person (client or
// barber) has their own in-memory copy of state — if a client books on
// their phone, the barber's screen doesn't know about it until it re-reads.
// Used on login, on manual refresh, and by the background poll below.
//
// Scoped to the current year onward (not the whole collection): the
// performance panel only ever needs this year's data (saldo semanal,
// mensal e anual), and this runs on a 12s poll while the barber panel is
// open, so pulling every historical appointment ever made would mean the
// read cost — and the payload — keeps growing forever as the shop's
// history piles up. A pending appointment from a previous year that never
// got marked "Realizado" won't show up in the overdue list, but that's an
// edge case worth trading for keeping every regular poll cheap and fast.
export async function refreshAppts(){
  try{
    var yearStart = dateKey(new Date(nowSP().getFullYear(), 0, 1));
    var q = query(collection(db, "appointments"), where("date", ">=", yearStart));
    var snap = await getDocs(q);
    var list = [];
    snap.forEach(function(d){ list.push(Object.assign({id: d.id}, d.data())); });
    list.sort(function(a,b){ return (a.date+a.time).localeCompare(b.date+b.time); });
    state.appts = list;
    return true;
  }catch(e){ return false; }
}

// Enquanto o painel do barbeiro está aberto, escuta os agendamentos do ano
// em tempo real (em vez de reconsultar tudo a cada N segundos): um
// agendamento feito ou cancelado em qualquer outro aparelho aparece na tela
// assim que o Firestore avisa, sem espera nem re-fetch manual. Guarda a
// função de "parar de escutar" pra poder desligar no logout — senão a
// escuta continuaria rodando (e consumindo leituras) mesmo fora do painel.
export var apptsUnsubscribe = null;
export function startApptsListener(){
  if(apptsUnsubscribe) return;
  var yearStart = dateKey(new Date(nowSP().getFullYear(), 0, 1));
  var q = query(collection(db, "appointments"), where("date", ">=", yearStart));
  apptsUnsubscribe = onSnapshot(q, function(snap){
    var list = [];
    snap.forEach(function(d){ list.push(Object.assign({id: d.id}, d.data())); });
    list.sort(function(a,b){ return (a.date+a.time).localeCompare(b.date+b.time); });
    state.appts = list;
    render();
  }, function(e){
    // Se a escuta cair (ex: sem internet), mantém os dados que já estavam
    // na tela; o botão "Atualizar" do painel continua disponível como plano B.
  });
}
export function stopApptsListener(){
  if(apptsUnsubscribe){ apptsUnsubscribe(); apptsUnsubscribe = null; }
}

// Busca só os agendamentos do dia selecionado, usado na tela do cliente
// pra saber quais horários já estão ocupados.
export async function refreshClientDateAppts(dateKey){
  try{
    var q = query(collection(db, "appointments"), where("date", "==", dateKey));
    var snap = await getDocs(q);
    var list = [];
    snap.forEach(function(d){ list.push(Object.assign({id: d.id}, d.data())); });
    state.clientDateAppts = list;
    return true;
  }catch(e){ return false; }
}

// Busca só os agendamentos futuros do próprio cliente logado, usado pra ele
// ver e poder cancelar o que já marcou.
export async function refreshClientOwnAppts(){
  if(!state.clientSession) return false;
  try{
    var q = query(collection(db, "appointments"), where("uid", "==", state.clientSession.uid));
    var snap = await getDocs(q);
    var list = [];
    snap.forEach(function(d){ list.push(Object.assign({id: d.id}, d.data())); });
    list.sort(function(a,b){ return (a.date+a.time).localeCompare(b.date+b.time); });
    state.clientOwnAppts = list;
    return true;
  }catch(e){ return false; }
}

// Busca as exceções do mês dado, só se ainda não tiverem sido buscadas
// nesta sessão (cache simples em memória por "AAAA-MM").
export async function ensureOverridesLoaded(monthDate){
  var mk = monthKeyStr(monthDate);
  if(state.overridesLoadedMonths[mk]) return true;
  try{
    var startKey = dateKey(firstDayOfMonth(monthDate));
    var endKey = dateKey(lastDayOfMonth(monthDate));
    var q = query(collection(db, "scheduleOverrides"),
      where(documentId(), ">=", startKey), where(documentId(), "<=", endKey));
    var snap = await getDocs(q);
    snap.forEach(function(d){ state.scheduleOverrides[d.id] = d.data(); });
    state.overridesLoadedMonths[mk] = true;
    return true;
  }catch(e){ return false; }
}

// Salva (ou remove, se overrideObj for null) a exceção de um dia específico.
export async function saveDayOverride(dayKey, overrideObj){
  try{
    if(overrideObj){
      await setDoc(doc(db, "scheduleOverrides", dayKey), Object.assign({date: dayKey}, overrideObj));
      state.scheduleOverrides[dayKey] = overrideObj;
    } else {
      await deleteDoc(doc(db, "scheduleOverrides", dayKey));
      delete state.scheduleOverrides[dayKey];
    }
    return true;
  }catch(e){ return false; }
}

// Busca todos os clientes já cadastrados (nome, email, telefone), pro
// barbeiro conseguir consultar sem precisar abrir cada agendamento. Só é
// chamada dentro do painel do barbeiro — a regra do Firestore só libera
// leitura da coleção inteira "clients" pra sessão do barbeiro.
export async function refreshClients(){
  try{
    var snap = await getDocs(collection(db, "clients"));
    var list = [];
    snap.forEach(function(d){ list.push(Object.assign({uid: d.id}, d.data())); });
    list.sort(function(a,b){ return (a.name || "").localeCompare(b.name || "", "pt-BR"); });
    state.barberClients = list;
    state.barberClientsLoaded = true;
    return true;
  }catch(e){ return false; }
}

// Apaga tudo o que o cliente tem guardado: os próprios agendamentos
// (passados e futuros — sem base legal pra reter depois de um pedido de
// exclusão), o perfil em "clients" e por fim a própria conta de login. Tudo
// isso já é permitido pelas Firestore Rules pro dono dos dados (ver
// firestore.rules), então não depende de Cloud Function nem do plano Blaze.
// Apaga tudo o que identifica o cliente, mas preserva o que é dado do
// negócio (não dele): agendamentos já realizados viram histórico anônimo —
// mantém data, serviço e valor (pro financeiro do barbeiro), mas perde
// nome, telefone e o vínculo com o uid, então não dá mais pra saber que
// aqueles atendimentos foram dessa pessoa nem quantas vezes ela veio.
// Agendamento futuro/ainda não realizado, em vez de virar uma vaga
// "fantasma" sem dono, é cancelado de verdade (o barbeiro não teria como
// atender alguém que ele não sabe mais quem é).
export async function deleteClientAccount(){
  if(!state.clientSession) return false;
  var uid = state.clientSession.uid;
  try{
    var q = query(collection(db, "appointments"), where("uid", "==", uid));
    var snap = await getDocs(q);
    var nowTs = nowSP().getTime();
    var ops = [];
    snap.forEach(function(d){
      var a = d.data();
      var apptTs = new Date(a.date + "T" + a.time + ":00").getTime();
      if(apptTs < nowTs){
        ops.push(updateDoc(doc(db, "appointments", d.id), {
          name: "Cliente (dados removidos)",
          phone: "",
          uid: deleteField()
        }));
      } else {
        ops.push(deleteDoc(doc(db, "appointments", d.id)));
      }
    });
    await Promise.all(ops);

    await deleteDoc(doc(db, "clients", uid));

    if(auth.currentUser){
      try{
        await deleteUser(auth.currentUser);
      }catch(e){
        // Excluir a conta de login exige um login "recente" por segurança do
        // próprio Firebase. Se passou muito tempo desde que a pessoa entrou,
        // pede pra ela confirmar com o Google de novo e tenta uma vez mais.
        if(e && e.code === "auth/requires-recent-login"){
          await signInWithPopup(auth, googleProvider);
          await deleteUser(auth.currentUser);
        } else {
          throw e;
        }
      }
    }

    state.clientSession = null;
    state.clientSelectedService = null;
    state.clientSelectedDate = null;
    state.clientSelectedSlot = null;
    state.clientConfirmed = null;
    state.clientDateAppts = [];
    state.clientOwnAppts = [];
    state.clientView = "book";
    state.clientBugOpen = false;
    return true;
  }catch(e){
    return false;
  }
}


// Barbeiro corrigindo nome/telefone de um cliente já cadastrado (ex:
// digitou errado no cadastro, ou o cliente pediu a correção por fora do
// app). Só esses dois campos — o barbeiro não deveria conseguir mudar o
// uid nem o e-mail do cliente por aqui.
export async function updateClientByBarber(uid, fields){
  try{
    var patch = {};
    if(typeof fields.name === "string") patch.name = fields.name;
    if(typeof fields.phone === "string") patch.phone = fields.phone;
    await setDoc(doc(db, "clients", uid), patch, { merge: true });
    return true;
  }catch(e){ return false; }
}

// Barbeiro removendo um cadastro de cliente (ex: duplicado, cadastro de
// teste, ou a pedido do cliente por outro canal que não o "Excluir meus
// dados" dele mesmo). Mesmo tratamento de agendamentos que a autoexclusão
// do próprio cliente (ver deleteClientAccount acima): futuro é cancelado
// de verdade, passado vira histórico anônimo (mantém data/serviço/valor
// pro financeiro, perde o vínculo com a pessoa). Diferença: aqui não dá
// pra apagar a conta de login do Google da pessoa (isso só ela mesma
// consegue, autenticada como ela — o painel do barbeiro não tem esse
// poder), então se ela voltar a acessar o link vai passar pelo cadastro
// de novo, como se fosse a primeira vez.
export async function deleteClientByBarber(uid){
  try{
    var q = query(collection(db, "appointments"), where("uid", "==", uid));
    var snap = await getDocs(q);
    var nowTs = nowSP().getTime();
    var ops = [];
    snap.forEach(function(d){
      var a = d.data();
      var apptTs = new Date(a.date + "T" + a.time + ":00").getTime();
      if(apptTs < nowTs){
        ops.push(updateDoc(doc(db, "appointments", d.id), {
          name: "Cliente (dados removidos)",
          phone: "",
          uid: deleteField()
        }));
      } else {
        ops.push(deleteDoc(doc(db, "appointments", d.id)));
      }
    });
    await Promise.all(ops);
    await deleteDoc(doc(db, "clients", uid));
    return true;
  }catch(e){ return false; }
}
