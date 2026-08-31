import { MONTH_NAMES } from "./constants.js";
import { deleteClientAccount } from "./data.js";
import { makeActivatable, showToast } from "./dom.js";
import { render } from "./render.js";
import { state } from "./state.js";
import { nowSP } from "./utils.js";

// Link que qualquer tela pode usar pra abrir o modal da política de
// privacidade — só marca o estado e re-renderiza.
export function openPrivacyLinkHtml(){
  return '<p class="privacy-link"><span class="backlink" id="openPrivacyBtn">Política de Privacidade</span></p>';
}
export function wirePrivacyLink(el){
  var btn = document.getElementById("openPrivacyBtn");
  if(btn){
    makeActivatable(btn, function(){
      state.showPrivacyModal = true;
      render();
    });
  }
}

// Texto simples e direto (LGPD), pensado pro porte do negócio: sem termos
// jurídicos que ninguém lê, dizendo com clareza quais dados são guardados,
// pra quê, e como pedir a exclusão.
export function privacyPolicyHtml(){
  return '<p>Última atualização: '+MONTH_NAMES[nowSP().getMonth()]+' de '+nowSP().getFullYear()+'.</p>'+
    '<h3>Quem trata os seus dados</h3>'+
    '<p>Este aplicativo é usado pela Barbearia B31, em Bragança Paulista/SP, pra organizar os agendamentos dos próprios clientes.</p>'+
    '<h3>Quais dados coletamos</h3>'+
    '<ul>'+
      '<li>Nome e e-mail, obtidos quando você entra com sua conta Google.</li>'+
      '<li>Telefone/WhatsApp, informado por você no primeiro agendamento.</li>'+
      '<li>Histórico dos agendamentos feitos por você (serviço, data e horário).</li>'+
    '</ul>'+
    '<h3>Pra que usamos</h3>'+
    '<ul>'+
      '<li>Confirmar, lembrar e organizar o seu horário na barbearia.</li>'+
      '<li>Entrar em contato pelo WhatsApp em caso de confirmação ou cancelamento.</li>'+
      '<li>Mostrar seu histórico de agendamentos dentro do próprio aplicativo.</li>'+
    '</ul>'+
    '<h3>Com quem compartilhamos</h3>'+
    '<p>Não vendemos nem compartilhamos seus dados com terceiros pra fins de marketing. Os dados ficam guardados no Firebase (Google Cloud), usado só pelo funcionamento deste aplicativo.</p>'+
    '<h3>Por quanto tempo guardamos</h3>'+
    '<p>Enquanto sua conta existir no aplicativo, ou até você pedir a exclusão. Ao excluir, seus agendamentos futuros são cancelados e seu perfil (nome, telefone, conta de login) é apagado por completo. Os cortes já realizados ficam registrados de forma anônima (só data, serviço e valor), sem nenhum vínculo com você, apenas pra controle financeiro do negócio.</p>'+
    '<h3>Uso por menores de idade</h3>'+
    '<p>Este aplicativo é destinado a maiores de 18 anos. Se um responsável quiser agendar um horário para um menor de idade, o agendamento deve ser feito na conta do próprio responsável.</p>'+
    '<h3>Seus direitos</h3>'+
    '<p>Você pode pedir, a qualquer momento, pra ver, corrigir ou excluir os dados guardados sobre você. Seu nome pode ser editado direto na tela principal do aplicativo, e a exclusão completa dos seus dados está disponível no link "Excluir meus dados". Pra qualquer outra dúvida, use o link "Encontrou um problema?" dentro do aplicativo.</p>';
}

export function renderPrivacyModal(){
  var modal = document.getElementById("privacyModal");
  if(!modal) return;
  if(!state.showPrivacyModal){
    modal.style.display = "none";
    modal.innerHTML = "";
    return;
  }
  modal.style.display = "flex";
  modal.innerHTML =
    '<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="privacyTitle">'+
      '<div class="modal-head">'+
        '<h2 id="privacyTitle" style="padding-bottom:0;">Política de Privacidade</h2>'+
        '<span class="backlink" id="closePrivacyBtn">Fechar</span>'+
      '</div>'+
      '<div class="modal-body">'+privacyPolicyHtml()+'</div>'+
    '</div>';
  makeActivatable(document.getElementById("closePrivacyBtn"), function(){
    state.showPrivacyModal = false;
    render();
  });
  // Fecha também clicando fora do card, no fundo escurecido.
  modal.onclick = function(ev){
    if(ev.target === modal){
      state.showPrivacyModal = false;
      render();
    }
  };
}

// Link "Excluir meus dados" — só faz sentido pro cliente já logado, então
// só é usado dentro de renderClientApp.
export function openDeleteAccountLinkHtml(){
  return '<p class="danger-link"><span class="backlink" id="openDeleteAccountBtn">Excluir meus dados</span></p>';
}
export function wireDeleteAccountLink(el){
  var btn = document.getElementById("openDeleteAccountBtn");
  if(btn){
    makeActivatable(btn, function(){
      state.showDeleteAccountModal = true;
      render();
    });
  }
}

export function renderDeleteAccountModal(){
  var modal = document.getElementById("deleteAccountModal");
  if(!modal) return;
  if(!state.showDeleteAccountModal || !state.clientSession){
    modal.style.display = "none";
    modal.innerHTML = "";
    return;
  }
  modal.style.display = "flex";
  modal.innerHTML =
    '<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="deleteAccountTitle">'+
      '<div class="modal-head">'+
        '<h2 id="deleteAccountTitle" style="padding-bottom:0;">Excluir meus dados</h2>'+
        '<span class="backlink" id="closeDeleteAccountBtn">Fechar</span>'+
      '</div>'+
      '<div class="modal-body">'+
        '<p class="danger-text">Essa ação não pode ser desfeita.</p>'+
        '<p>Isso vai:</p>'+
        '<ul>'+
          '<li>Apagar seu perfil (nome e telefone) guardado no aplicativo;</li>'+
          '<li>Cancelar qualquer agendamento futuro que você tenha marcado;</li>'+
          '<li>Manter, só pra controle financeiro do negócio, a data/serviço/valor dos cortes já realizados — mas sem seu nome, telefone ou qualquer jeito de ligar isso a você;</li>'+
          '<li>Apagar sua conta de acesso — você precisaria criar tudo de novo pra agendar outra vez.</li>'+
        '</ul>'+
        '<div id="deleteAccountError" class="error" role="alert" aria-live="polite" style="display:none;"></div>'+
        '<div class="modal-actions">'+
          '<button type="button" class="danger" id="confirmDeleteAccountBtn">Sim, excluir meus dados</button>'+
          '<button type="button" class="ghost" id="cancelDeleteAccountBtn">Cancelar</button>'+
        '</div>'+
      '</div>'+
    '</div>';

  var closeModal = function(){
    state.showDeleteAccountModal = false;
    render();
  };
  makeActivatable(document.getElementById("closeDeleteAccountBtn"), closeModal);
  document.getElementById("cancelDeleteAccountBtn").onclick = closeModal;
  modal.onclick = function(ev){ if(ev.target === modal) closeModal(); };

  document.getElementById("confirmDeleteAccountBtn").onclick = async function(){
    var btn = document.getElementById("confirmDeleteAccountBtn");
    var errBox = document.getElementById("deleteAccountError");
    errBox.style.display = "none";
    btn.disabled = true;
    btn.textContent = "Excluindo...";
    var ok = await deleteClientAccount();
    if(ok){
      state.showDeleteAccountModal = false;
      state.screen = "landing";
      render();
      showToast("Seus dados foram excluídos.");
    } else {
      btn.disabled = false;
      btn.textContent = "Sim, excluir meus dados";
      errBox.textContent = "Não foi possível concluir agora. Se o problema continuar, use o \"Encontrou um problema?\" pra pedir manualmente.";
      errBox.style.display = "block";
    }
  };
}

