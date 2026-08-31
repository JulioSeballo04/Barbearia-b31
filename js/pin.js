// ---------- HASH DO PIN (nunca guardamos o PIN em texto puro) ----------
export function randomHex(byteLen){
  var arr = new Uint8Array(byteLen);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(function(b){ return b.toString(16).padStart(2, "0"); }).join("");
}

export async function sha256Hex(text){
  var enc = new TextEncoder().encode(text);
  var digestBuf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(digestBuf)).map(function(b){ return b.toString(16).padStart(2, "0"); }).join("");
}

// Salga com um valor aleatório por instalação, pra dois barbeiros com o
// mesmo PIN não terem o mesmo hash salvo no banco.
//
// PBKDF2 com muitas iterações (em vez de um SHA-256 direto) é
// deliberadamente lento — é o ponto. Se alguém algum dia conseguir ler
// pinHash/pinSalt (ex: criando uma sessão anônima na mão, sem passar pela
// tela de PIN), tentar todas as combinações offline fica ordens de
// magnitude mais caro do que com um hash rápido feito pra checar arquivo,
// não senha.
export var PIN_HASH_ALGO = "pbkdf2-sha256-120k";
export var PIN_HASH_ITERATIONS = 120000;

export async function hashPin(pin, salt){
  var enc = new TextEncoder();
  var keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(pin), {name: "PBKDF2"}, false, ["deriveBits"]
  );
  var bits = await crypto.subtle.deriveBits(
    {name: "PBKDF2", salt: enc.encode(salt), iterations: PIN_HASH_ITERATIONS, hash: "SHA-256"},
    keyMaterial, 256
  );
  return Array.from(new Uint8Array(bits)).map(function(b){ return b.toString(16).padStart(2, "0"); }).join("");
}

// Algoritmo antigo (um SHA-256 só), mantido apenas pra continuar
// reconhecendo o PIN de instalações que já tinham um hash salvo antes
// dessa troca — ver o upgrade automático em wireBarberAuthHandlers.
export async function hashPinLegacySha256(pin, salt){
  return sha256Hex(salt + ":" + pin);
}
