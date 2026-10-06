/* ============================================================
   Campo&Dados — API do Google Planilhas (Google Apps Script)
   ------------------------------------------------------------
   Cole este arquivo em: Planilha > Extensões > Apps Script
   e publique como "App da Web" (veja o README.md).

   Abas usadas (criadas pela função configurar):
     Dados      → uma linha por parcela (Block, Thickness, N_rate, ...)
     Campanhas  → nome, status, data, dia, mes, lat, lng, desc
     Usuarios   → nome, email, nivel (admin | gerente | usuario), acesso
     Login      → email, senha   (a senha fica guardada como hash)
     Config     → origem dos dados, etc.

   LOGIN
   - A senha é conferida AQUI no servidor; o site nunca recebe a aba Login.
   - Para criar/trocar senha direto na planilha: digite a senha normal
     na coluna "senha" da aba Login. Ela vira hash sozinha (sha256$...).
   - Sem login válido, o site não lê nem grava nada.
   ============================================================ */

/* >>> TROQUE ANTES DE RODAR "configurar" <<<
   Primeiro administrador da plataforma. Depois de entrar, troque a senha. */
const ADMIN_INICIAL = { nome: "Administrador", email: "admin@pesquisa.org", senha: "trocar123" };

const SESSAO_SEGUNDOS = 6 * 60 * 60;   // login vale 6 horas (máximo do CacheService)
const ABA = { dados: "Dados", campanhas: "Campanhas", usuarios: "Usuarios", login: "Login", config: "Config" };
const COL_CAMP = ["nome", "status", "data", "dia", "mes", "lat", "lng", "desc"];
const COL_USER = ["nome", "email", "nivel", "acesso"];
const COL_LOGIN = ["email", "senha"];
const PODE = {                          // quem pode gravar cada parte
  dados: ["admin", "gerente"],
  campanhas: ["admin", "gerente"],
  usuarios: ["admin"]
};

/* ================= LEITURA (GET) =================
   ?acao=versao           → só a versão (consulta leve, sem login)
   ?token=...             → tudo (dados, campanhas, usuários) — exige login  */
function doGet(e) {
  try { return lerTudo(e); }
  catch (err) { return json({ ok: false, erro: "Erro na planilha: " + err }); }
}
function lerTudo(e) {
  const p = (e && e.parameter) || {};
  if (p.acao === "versao") return json({ ok: true, versao: versaoAtual() });

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const eu = usuarioDaSessao(ss, p.token);
  if (!eu) return json({ ok: false, codigo: "sessao", erro: "Sessão expirada. Entre novamente." });

  const cfg = lerConfig(ss);
  return json({
    ok: true,
    versao: versaoAtual(),
    eu: eu,
    semente: cfg.semente === "1",
    origem: cfg.origem_arquivo ? { arquivo: cfg.origem_arquivo, data: cfg.origem_data || "" } : null,
    dados: lerTabela(aba(ss, ABA.dados)),
    campanhas: lerTabela(aba(ss, ABA.campanhas, COL_CAMP)),
    usuarios: lerTabela(aba(ss, ABA.usuarios, COL_USER))
  });
}

/* ================= GRAVAÇÃO (POST) =================
   { acao:"login", email, senha }
   { acao:"sair", token }
   { acao:"salvar", token, parte:"dados"|"campanhas"|"usuarios", valor, origem }
   { acao:"senha", token, email, senha }        admin troca de qualquer um; usuário só a própria
   { acao:"semente", token, dados, origem, campanhas }   preenche a planilha vazia (1ª vez)  */
function doPost(e) {
  let corpo;
  try { corpo = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, erro: "pedido inválido" }); }
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (corpo.acao === "login") {
    try { return json(fazerLogin(ss, corpo.email, corpo.senha)); }
    catch (err) { return json({ ok: false, erro: "Erro no login: " + err }); }
  }
  if (corpo.acao === "sair") { if (corpo.token) CacheService.getScriptCache().remove("s_" + corpo.token); return json({ ok: true }); }

  const eu = usuarioDaSessao(ss, corpo.token);
  if (!eu) return json({ ok: false, codigo: "sessao", erro: "Sessão expirada. Entre novamente." });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (corpo.acao === "salvar") {
      const parte = corpo.parte;
      if (!PODE[parte]) return json({ ok: false, erro: "parte inválida" });
      if (PODE[parte].indexOf(eu.nivel) < 0) return json({ ok: false, codigo: "permissao", erro: "Seu nível de acesso não permite essa alteração." });

      if (parte === "dados") {
        escreverTabela(aba(ss, ABA.dados), corpo.valor || [], null, ["Block", "Thickness", "N_rate"]);
        const o = corpo.origem || {};
        gravarConfig(ss, { origem_arquivo: o.arquivo || "", origem_data: o.data || "" });
      } else if (parte === "campanhas") {
        escreverTabela(aba(ss, ABA.campanhas, COL_CAMP), corpo.valor || [], COL_CAMP, null, ["lat", "lng"]);
      } else if (parte === "usuarios") {
        const lista = (corpo.valor || []).map(u => ({ nome: u.nome, email: String(u.email || "").trim().toLowerCase(), nivel: u.nivel, acesso: u.acesso }));
        if (!lista.some(u => u.nivel === "admin")) return json({ ok: false, erro: "É preciso ter pelo menos um administrador." });
        escreverTabela(aba(ss, ABA.usuarios, COL_USER), lista, COL_USER);
        limparLogins(ss, lista.map(u => u.email));       // quem saiu da lista perde a senha
      }
      return json({ ok: true, versao: novaVersao() });
    }

    if (corpo.acao === "senha") {
      const email = String(corpo.email || "").trim().toLowerCase();
      if (eu.nivel !== "admin" && email !== eu.email) return json({ ok: false, codigo: "permissao", erro: "Você só pode trocar a sua própria senha." });
      if (String(corpo.senha || "").length < 6) return json({ ok: false, erro: "A senha precisa ter pelo menos 6 caracteres." });
      definirSenha(ss, email, corpo.senha);
      return json({ ok: true });
    }

    if (corpo.acao === "semente") {
      if (eu.nivel !== "admin") return json({ ok: false, codigo: "permissao", erro: "Só o administrador." });
      const cfg = lerConfig(ss);
      if (cfg.semente === "1") return json({ ok: true, versao: versaoAtual() });
      if (lerTabela(aba(ss, ABA.dados)).length === 0 && corpo.dados) {
        escreverTabela(aba(ss, ABA.dados), corpo.dados, null, ["Block", "Thickness", "N_rate"]);
        const o = corpo.origem || {};
        gravarConfig(ss, { origem_arquivo: o.arquivo || "", origem_data: o.data || "" });
      }
      if (lerTabela(aba(ss, ABA.campanhas, COL_CAMP)).length === 0 && corpo.campanhas)
        escreverTabela(aba(ss, ABA.campanhas, COL_CAMP), corpo.campanhas, COL_CAMP, null, ["lat", "lng"]);
      gravarConfig(ss, { semente: "1" });
      return json({ ok: true, versao: novaVersao() });
    }

    return json({ ok: false, erro: "ação inválida" });
  } catch (err) {
    return json({ ok: false, erro: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/* Edição direta na planilha:
   - aba Login, coluna senha: transforma a senha digitada em hash
   - qualquer aba: muda a versão para a plataforma recarregar */
function onEdit(e) {
  try {
    const sh = e.range.getSheet();
    if (sh.getName() === ABA.login) {
      const cab = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(c => String(c).trim().toLowerCase());
      const col = cab.indexOf("senha") + 1;
      if (col > 0 && e.range.getRow() > 1) {
        const r = sh.getRange(e.range.getRow(), col, e.range.getNumRows(), 1);
        const v = r.getValues().map(([s]) => [s && !ehHash(s) ? gerarHash(String(s)) : s]);
        r.setValues(v);
      }
      return;                               // mudar senha não precisa recarregar a plataforma
    }
  } catch (err) {}
  novaVersao();
}

/* ================= LOGIN ================= */
function fazerLogin(ss, email, senha) {
  email = String(email || "").trim().toLowerCase();
  const falha = { ok: false, erro: "E-mail ou senha incorretos." };
  if (!email || !senha) return falha;

  const sh = aba(ss, ABA.login, COL_LOGIN);
  const v = sh.getDataRange().getValues();
  let linha = -1, guardada = "";
  for (let i = 1; i < v.length; i++) {
    if (String(v[i][0]).trim().toLowerCase() === email) { linha = i + 1; guardada = String(v[i][1]); break; }
  }
  const usuarios = lerTabela(aba(ss, ABA.usuarios, COL_USER));
  const u = usuarios.find(x => String(x.email).trim().toLowerCase() === email);

  let certa = false;
  if (linha > 0 && guardada) {
    if (ehHash(guardada)) certa = conferirHash(senha, guardada);
    else { certa = guardada === String(senha); if (certa) sh.getRange(linha, 2).setValue(gerarHash(String(senha))); } // senha colada sem hash
  }
  if (!certa || !u) { Utilities.sleep(800); return falha; }   // atraso dificulta tentativa e erro

  // registra o último acesso
  const shU = aba(ss, ABA.usuarios, COL_USER);
  const vu = shU.getDataRange().getValues();
  const cIdx = vu[0].map(c => String(c).trim().toLowerCase());
  const cEmail = cIdx.indexOf("email"), cAcesso = cIdx.indexOf("acesso");
  for (let i = 1; i < vu.length; i++) {
    if (String(vu[i][cEmail]).trim().toLowerCase() === email && cAcesso >= 0) {
      shU.getRange(i + 1, cAcesso + 1).setNumberFormat("@")
        .setValue(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm"));
      break;
    }
  }

  const token = Utilities.getUuid() + Utilities.getUuid().slice(0, 8);
  CacheService.getScriptCache().put("s_" + token, email, SESSAO_SEGUNDOS);
  return { ok: true, token: token, usuario: { nome: u.nome, email: email, nivel: u.nivel } };
}

/* Confere o token e devolve {nome, email, nivel} atualizado da aba Usuarios */
function usuarioDaSessao(ss, token) {
  if (!token) return null;
  const cache = CacheService.getScriptCache();
  const email = cache.get("s_" + token);
  if (!email) return null;
  const u = lerTabela(aba(ss, ABA.usuarios, COL_USER)).find(x => String(x.email).trim().toLowerCase() === email);
  if (!u) { cache.remove("s_" + token); return null; }      // usuário excluído
  cache.put("s_" + token, email, SESSAO_SEGUNDOS);           // renova enquanto estiver usando
  return { nome: u.nome, email: email, nivel: u.nivel };
}

function definirSenha(ss, email, senha) {
  const sh = aba(ss, ABA.login, COL_LOGIN);
  const v = sh.getDataRange().getValues();
  const hash = gerarHash(String(senha));
  for (let i = 1; i < v.length; i++) {
    if (String(v[i][0]).trim().toLowerCase() === email) { sh.getRange(i + 1, 2).setValue(hash); return; }
  }
  sh.appendRow([email, hash]);
}

/* Remove da aba Login quem não está mais na aba Usuarios */
function limparLogins(ss, emails) {
  const sh = aba(ss, ABA.login, COL_LOGIN);
  const v = sh.getDataRange().getValues();
  for (let i = v.length - 1; i >= 1; i--) {
    const em = String(v[i][0]).trim().toLowerCase();
    if (em && emails.indexOf(em) < 0) sh.deleteRow(i + 1);
  }
}

/* Hash da senha: sha256$sal$resultado (com 1000 repetições) */
function ehHash(s) { return /^sha256\$[0-9a-f]+\$[0-9a-f]{64}$/.test(String(s)); }
function gerarHash(senha, sal) {
  sal = sal || Utilities.getUuid().replace(/-/g, "").slice(0, 16);
  let h = sal + senha;
  for (let i = 0; i < 1000; i++) h = hex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + sal, Utilities.Charset.UTF_8));
  return "sha256$" + sal + "$" + h;
}
function conferirHash(senha, guardada) {
  const sal = String(guardada).split("$")[1];
  return gerarHash(String(senha), sal) === guardada;
}
function hex(bytes) { return bytes.map(b => ((b + 256) % 256).toString(16).padStart(2, "0")).join(""); }

/* ================= UTILIDADES ================= */
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function versaoAtual() { return PropertiesService.getScriptProperties().getProperty("versao") || "0"; }
function novaVersao() {
  const v = Date.now() + "_" + Math.random().toString(36).slice(2, 7);
  PropertiesService.getScriptProperties().setProperty("versao", v);
  return v;
}

function aba(ss, nome, cabecalho) {
  let sh = ss.getSheetByName(nome);
  if (!sh) {
    sh = ss.insertSheet(nome);
    if (cabecalho) {
      sh.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho]).setFontWeight("bold");
      sh.getRange(1, 1, 1000, cabecalho.length).setNumberFormat("@");
      if (nome === ABA.campanhas) sh.getRange(1, 6, 1000, 2).setNumberFormat("0.######");
    }
    sh.setFrozenRows(1);
  }
  return sh;
}

function lerTabela(sh) {
  const v = sh.getDataRange().getValues();
  if (v.length < 2) return [];
  const cab = v[0].map(c => String(c).trim());
  const tz = Session.getScriptTimeZone();
  const out = [];
  for (let i = 1; i < v.length; i++) {
    const linha = v[i];
    if (linha.every(c => c === "" || c === null)) continue;
    const o = {};
    cab.forEach((c, j) => {
      if (!c) return;
      let x = linha[j];
      if (x instanceof Date) x = Utilities.formatDate(x, tz, "dd/MM/yyyy");
      o[c] = x === "" ? null : x;
    });
    out.push(o);
  }
  return out;
}

function escreverTabela(sh, linhas, colunas, primeiras, numericas) {
  let cab = colunas;
  if (!cab) {
    const set = [];
    (primeiras || []).forEach(c => { if (linhas.some(l => c in l)) set.push(c); });
    linhas.forEach(l => Object.keys(l).forEach(k => { if (set.indexOf(k) < 0) set.push(k); }));
    cab = set;
  }
  sh.clearContents();
  if (!cab.length) return;
  const valores = [cab].concat(linhas.map(l => cab.map(c => (l[c] === null || l[c] === undefined) ? "" : l[c])));
  if (colunas) {
    cab.forEach((c, j) => {
      const fmt = (numericas || []).indexOf(c) >= 0 ? "0.######" : "@";
      sh.getRange(1, j + 1, Math.max(valores.length, 2), 1).setNumberFormat(fmt);
    });
  }
  sh.getRange(1, 1, valores.length, cab.length).setValues(valores);
  sh.getRange(1, 1, 1, cab.length).setFontWeight("bold");
  sh.setFrozenRows(1);
}

function lerConfig(ss) {
  const sh = aba(ss, ABA.config, ["chave", "valor"]);
  const o = {};
  sh.getDataRange().getValues().slice(1).forEach(r => { if (r[0]) o[r[0]] = String(r[1]); });
  return o;
}
function gravarConfig(ss, novos) {
  const atual = lerConfig(ss);
  Object.assign(atual, novos);
  const sh = aba(ss, ABA.config, ["chave", "valor"]);
  const linhas = Object.keys(atual).map(k => [k, String(atual[k])]);
  sh.clearContents();
  sh.getRange(1, 1, 1, 2).setValues([["chave", "valor"]]).setFontWeight("bold");
  if (linhas.length) sh.getRange(2, 1, linhas.length, 2).setNumberFormat("@").setValues(linhas);
}

/* ================= CONFIGURAÇÃO INICIAL =================
   1) Troque ADMIN_INICIAL lá em cima.
   2) Escolha "configurar" no topo do editor e clique em Executar.
   Cria as abas e o primeiro administrador (se a aba Usuarios estiver vazia). */
function configurar() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  aba(ss, ABA.dados);
  aba(ss, ABA.campanhas, COL_CAMP);
  const shU = aba(ss, ABA.usuarios, COL_USER);
  const shL = aba(ss, ABA.login, COL_LOGIN);
  aba(ss, ABA.config, ["chave", "valor"]);

  const email = ADMIN_INICIAL.email.trim().toLowerCase();
  const jaExiste = lerTabela(shU).some(u => String(u.email).trim().toLowerCase() === email);
  if (!jaExiste) shU.appendRow([ADMIN_INICIAL.nome, email, "admin", "Nunca acessou"]);
  const temLogin = shL.getDataRange().getValues().slice(1).some(r => String(r[0]).trim().toLowerCase() === email);
  if (!temLogin) definirSenha(ss, email, ADMIN_INICIAL.senha);   // não sobrescreve senha já trocada

  // protege a aba Login: só o dono da planilha edita (outros editores veem o aviso)
  try { shL.protect().setDescription("Senhas da plataforma").setWarningOnly(true); } catch (e) {}
  novaVersao();
  Logger.log("Pronto! Entre na plataforma com " + email);
}

/* Define a senha de um usuário pelo editor do Apps Script.
   Troque o e-mail e a senha abaixo, escolha "definirSenhaManual" e clique em Executar.
   (Alternativa: digitar a senha na coluna "senha" da aba Login.) */
function definirSenhaManual() {
  const email = "teste@teste.com";
  const senha = "123456";
  definirSenha(SpreadsheetApp.getActiveSpreadsheet(), email.trim().toLowerCase(), senha);
  Logger.log("Senha definida para " + email);
}
