/* ============================================================
   Banco de dados (Apps Script) + login
   ------------------------------------------------------------
   - O login é conferido no Apps Script (aba Login, senha em hash).
   - Depois de entrar, os dados são lidos/gravados com um token.
   - A cada PLANILHA_INTERVALO segundos confere se a planilha mudou.
   ============================================================ */
(function(){
  const status=$("statusSync");
  const mostrar=(txt,cls)=>{status.textContent=txt;status.className="sync "+cls;};
  const URL_API=window.PLANILHA_URL;
  const CHAVE_SESSAO="campoedados_sessao";

  if(!URL_API){mostrar("Modo local · dados só neste navegador","local");return;}

  let aplicando=false,versao=null,primeiraCarga=true,fila=Promise.resolve(),pendentes=0,timer=null;
  let sessao=null;   // {token, usuario:{nome,email,nivel}, manter}
  try{sessao=JSON.parse(localStorage.getItem(CHAVE_SESSAO));}catch(e){}
  if(sessao&&!sessao.manter)sessao=null;

  const semVazios=o=>{const r={};for(const[k,v]of Object.entries(o||{}))if(v!==null&&v!==undefined&&v!=="")r[k]=v;return r;};
  const semTrat=l=>l.map(({Trat,...r})=>r);
  const listaUsuarios=()=>USUARIOS.map(u=>({nome:u[0],email:u[1],nivel:u[2],acesso:u[3]}));
  function cacheLocal(parte,valor){aplicando=true;try{gravar(parte,valor);}finally{aplicando=false;}}

  class ErroSessao extends Error{}
  /* fetch com limite de tempo (o Apps Script às vezes demora para "acordar") */
  async function buscar(url,opcoes,segundos){
    const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),(segundos||30)*1000);
    try{return await fetch(url,{...opcoes,signal:ctl.signal});}
    catch(e){throw new Error(e.name==="AbortError"?"O banco de dados demorou para responder. Tente de novo.":"Sem conexão com o banco de dados. Confira a internet.");}
    finally{clearTimeout(t);}
  }
  /* Se o Apps Script der erro, ele devolve uma página HTML em vez de JSON */
  async function lerJson(r){
    const txt=await r.text();
    try{return JSON.parse(txt);}
    catch(e){throw new Error("O banco de dados não respondeu direito. Tente de novo em instantes.");}
  }
  async function ler(params){
    const r=await buscar(URL_API+"?"+params,{cache:"no-store"});
    const j=await lerJson(r);
    if(j.codigo==="sessao")throw new ErroSessao(j.erro);
    if(!j.ok)throw new Error(j.erro||"erro no banco de dados");return j;
  }
  async function enviar(corpo){
    // text/plain evita a verificação de CORS (preflight) que o Apps Script não responde
    const r=await buscar(URL_API,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},
      body:JSON.stringify({token:sessao&&sessao.token,...corpo})});
    const j=await lerJson(r);
    if(j.codigo==="sessao")throw new ErroSessao(j.erro);
    if(j.erro==="parte inválida"||j.erro==="ação inválida")throw new Error("O banco de dados está desatualizado. Avise o administrador.");
    if(!j.ok)throw new Error(j.erro||"erro ao gravar");return j;
  }

  /* ---------- Sessão ---------- */
  function guardarSessao(s){sessao=s;try{s&&s.manter?localStorage.setItem(CHAVE_SESSAO,JSON.stringify(s)):localStorage.removeItem(CHAVE_SESSAO);}catch(e){}}
  function sessaoExpirou(msg){
    guardarSessao(null);clearInterval(timer);timer=null;
    if($("app").classList.contains("on"))$("sair").click();
    erroLogin(msg||"Sessão expirada. Entre novamente.");
    mostrar("Faça login","local");
  }

  /* Chamado pelo app.js no botão Entrar */
  window.loginPlanilha=async function(email,senha,manter){
    const r=await enviar({acao:"login",email,senha});
    guardarSessao({token:r.token,usuario:r.usuario,manter:!!manter});
    primeiraCarga=true;versao=null;
    await carregar(r.dados?r:null);     // o login já traz os dados (servidor antigo: busca em seguida)
    iniciarConferencia();
    return r.usuario;
  };
  /* Chamado pelo app.js no botão Sair */
  window.sairPlanilha=function(){
    if(sessao)fetch(URL_API,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({acao:"sair",token:sessao.token})}).catch(()=>{});
    guardarSessao(null);clearInterval(timer);timer=null;mostrar("Faça login","local");
  };
  /* Chamado pelo app.js ao criar usuário ou trocar senha */
  window.senhaPlanilha=function(email,senha){
    pendentes++;mostrar("Salvando senha…","enviando");
    const p=fila.then(()=>enviar({acao:"senha",email,senha}));
    fila=p.catch(()=>{}).finally(()=>{if(--pendentes===0)mostrar("Sincronizado com o banco de dados","ok");});
    return p;
  };

  /* ---------- RECEBER da planilha ---------- */
  function aplicar(d){
    if(d.dados&&d.dados.length){DADOS=d.dados.map(semVazios);ORIGEM=d.origem||{arquivo:"banco de dados",data:""};}
    else{DADOS=[];ORIGEM=null;}
    cacheLocal("dados",semTrat(DADOS));cacheLocal("origem",ORIGEM);

    CAMPANHAS.splice(0,CAMPANHAS.length,...(d.campanhas||[]).map(c=>{const o=semVazios(c);
      o.lat=Number(o.lat);o.lng=Number(o.lng);if(o.dia!=null)o.dia=String(o.dia).padStart(2,"0");return o;}));
    cacheLocal("campanhas",CAMPANHAS);

    if(d.usuarios&&d.usuarios.length){
      USUARIOS.splice(0,USUARIOS.length,...d.usuarios.map(u=>[u.nome||"",String(u.email||"").toLowerCase(),u.nivel||"usuario",u.acesso||""]));
      cacheLocal("usuarios",USUARIOS);
    }
    // se o nível da pessoa mudou na planilha, aplica na hora
    if(d.eu&&sessao&&$("app").classList.contains("on")&&d.eu.nivel!==sessao.usuario.nivel){
      sessao.usuario=d.eu;guardarSessao(sessao);document.body.className=d.eu.nivel;
      $("nivelUsuario").textContent=NIVEL[d.eu.nivel]||d.eu.nivel;toast("Seu nível de acesso mudou: "+(NIVEL[d.eu.nivel]||d.eu.nivel));
    }
    atualizarTela();
  }

  async function carregar(pronto){
    const d=pronto||await ler("token="+encodeURIComponent(sessao.token));
    // 1ª vez: planilha sem dados e sem campanhas → o administrador preenche as campanhas de exemplo
    if(primeiraCarga&&!d.semente&&d.eu.nivel==="admin"&&!(d.dados&&d.dados.length)&&!(d.campanhas&&d.campanhas.length)){
      mostrar("Preparando o banco de dados…","enviando");
      // só as campanhas: aba Dados vazia = a plataforma mostra os dados de exemplo
      await enviar({acao:"semente",campanhas:JSON.parse(JSON.stringify(CAMPANHAS))});
      primeiraCarga=false;return carregar();
    }
    const mudouFora=!primeiraCarga&&versao!==null&&d.versao!==versao;
    versao=d.versao;aplicar(d);
    if(mudouFora)toast("Dados atualizados pelo banco de dados");
    primeiraCarga=false;
    mostrar("Sincronizado com o banco de dados","ok");
  }

  /* ---------- ENVIAR para a planilha ---------- */
  window.nuvemGravar=function(parte){
    if(aplicando||!sessao)return;
    let corpo=null;
    if(parte==="origem")corpo={acao:"salvar",parte:"dados",valor:ORIGEM?semTrat(DADOS):[],origem:ORIGEM};
    else if(parte==="campanhas")corpo={acao:"salvar",parte:"campanhas",valor:JSON.parse(JSON.stringify(CAMPANHAS))};
    else if(parte==="usuarios")corpo={acao:"salvar",parte:"usuarios",valor:listaUsuarios()};
    if(!corpo)return;
    pendentes++;mostrar("Salvando no banco de dados…","enviando");
    fila=fila.then(()=>enviar(corpo)).then(r=>{versao=r.versao;})
      .catch(e=>{console.error(e);
        if(e instanceof ErroSessao)return sessaoExpirou(e.message);
        mostrar("Falha ao salvar no banco de dados","erro");toast("Não foi possível salvar: "+e.message);
        carregar().catch(()=>{});})     // volta para o que está na planilha
      .finally(()=>{if(--pendentes===0&&sessao&&!status.classList.contains("erro"))mostrar("Sincronizado com o banco de dados","ok");});
  };

  /* ---------- Conferir mudanças periodicamente ---------- */
  let falhas=0,conferindo=false;
  async function conferir(){
    if(!sessao||document.hidden||pendentes>0||conferindo)return;
    conferindo=true;
    try{const r=await ler("acao=versao");falhas=0;
        if(r.versao!==versao)await carregar();
        else if(!status.classList.contains("ok"))mostrar("Sincronizado com o banco de dados","ok");}
    catch(e){if(e instanceof ErroSessao)return sessaoExpirou(e.message);
        console.warn(e);
        // só avisa depois de 2 falhas seguidas (o Apps Script às vezes falha uma vez e volta)
        if(++falhas>=2)mostrar("Sem conexão com o banco de dados · tentando de novo","enviando");}
    finally{conferindo=false;}
  }
  function iniciarConferencia(){clearInterval(timer);timer=setInterval(conferir,Math.max(5,window.PLANILHA_INTERVALO||15)*1000);}
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)conferir();});

  /* ---------- Ao abrir a página ----------
     Só entra sozinho se a pessoa marcou "Manter conectado".
     Enquanto confere a sessão, mostra "Entrando…" no lugar do formulário. */
  if(sessao&&sessao.token){
    document.body.classList.add("retomando");mostrar("Conectando ao banco de dados…","enviando");
    carregar().then(()=>{document.body.classList.remove("retomando");
        entrar([sessao.usuario.nome,sessao.usuario.email,sessao.usuario.nivel]);iniciarConferencia();})
      .catch(e=>{document.body.classList.remove("retomando");
        if(e instanceof ErroSessao)sessaoExpirou();else{console.error(e);guardarSessao(null);mostrar("Erro ao ler o banco de dados","erro");erroLogin(e.message);}});
  }else{
    mostrar("Faça login","local");
    // "acorda" o servidor enquanto a pessoa digita: o login sai bem mais rápido
    ler("acao=versao").catch(()=>{});
  }
})();