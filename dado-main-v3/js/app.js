/* Campo&Dados — lógica da plataforma (demonstração) */
/* ---------- Armazenamento no navegador (localStorage) ----------
   Os dados importados, campanhas e usuários ficam gravados neste navegador.
   Sem nada gravado, a plataforma usa os dados de exemplo de js/dados.js. */
const CHAVE="campoedados_v1";
function lerSalvo(){try{return JSON.parse(localStorage.getItem(CHAVE))||{};}catch(e){return {};}}
function gravar(parte,valor){
  try{const s=lerSalvo();s[parte]=valor;localStorage.setItem(CHAVE,JSON.stringify(s));}
  catch(e){if(typeof nuvemGravar!=="function"){toast("Não foi possível gravar no navegador (espaço cheio ou bloqueado).");return false;}}
  // Se o Google Planilhas estiver configurado (js/planilha.js), grava também na planilha
  if(typeof nuvemGravar==="function")nuvemGravar(parte);
  return true;
}
const esc=s=>String(s??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const MESES=["JAN","FEV","MAR","ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ"];
const SALVO=lerSalvo();
let DADOS=(Array.isArray(SALVO.dados)?SALVO.dados:DADOS_ENSAIO).map(d=>({...d}));   // [] = dados removidos
let ORIGEM=SALVO.origem||null; // {arquivo, data} da última importação
const FATORES=["Block","Thickness","N_rate","PlotID","Trat"];
const SOLO=["Soil_NH4","Soil_NO3","Mineral_N","Moisture","pH","EC"];
const NOMES={Soil_NH4:"N-NH₄ do solo",Soil_NO3:"N-NO₃ do solo",Mineral_N:"N mineral do solo",Moisture:"Umidade do solo",pH:"pH do solo",EC:"Condutividade elétrica",
 Height_cm:"Altura de planta (cm)",Stem_mm:"Diâmetro do colmo (mm)",LAI:"Índice de área foliar",SPAD:"Índice SPAD",Biomass_MgHa:"Biomassa (Mg/ha)",LeafN_pct:"N foliar (%)",
 N_uptake:"Absorção de N",GrainN:"N no grão",EarLen_cm:"Comprimento da espiga (cm)",KernelRows:"Fileiras por espiga",KernelsPerRow:"Grãos por fileira",
 TKW_g:"Massa de mil grãos (g)",Yield_MgHa:"Produtividade (Mg/ha)",AgronomicEff:"Eficiência agronômica",RecoveryEff:"Eficiência de recuperação",PFP:"Produtividade parcial do fator",PhysEff:"Eficiência fisiológica",NUE:"Eficiência de uso de N"};
const nome=v=>NOMES[v]||v;
const CORES=["#2F6B45","#8A5A3B","#3B6890","#A3843A","#6B4F7A"];
const ROTULO={N_rate:"Dose de N",Thickness:"Espessura",Trat:"Tratamento",Block:"Bloco"};
const NIVEL={admin:"Administrador",gerente:"Gerente",usuario:"Usuário"};
const ord=(a,b)=>String(a).localeCompare(String(b),"pt",{numeric:true});
const $=id=>document.getElementById(id);

/* ---------- Utilidades ---------- */
function toast(msg){const t=$("toast");t.textContent=msg;t.classList.add("on");clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove("on"),2800);}
function quantil(s,p){const i=(s.length-1)*p,a=Math.floor(i),b=Math.ceil(i);return s[a]+(s[b]-s[a])*(i-a);}
function stats(v){v=v.filter(x=>x!==null&&x!==""&&!isNaN(x)).map(Number);const n=v.length;if(!n)return null;
 const s=[...v].sort((a,b)=>a-b),m=v.reduce((a,b)=>a+b,0)/n,dp=n>1?Math.sqrt(v.reduce((a,b)=>a+(b-m)**2,0)/(n-1)):0;
 return{n,media:m,mediana:quantil(s,.5),dp,cv:m?dp/m*100:null,min:s[0],max:s[n-1]};}
const r2=x=>x==null?"":Math.round(x*100)/100;
const fmt=(x,d=2)=>x==null?"—":x.toLocaleString("pt-BR",{minimumFractionDigits:d,maximumFractionDigits:d});
const layoutBase={margin:{l:52,r:12,t:10,b:48},paper_bgcolor:"#fff",plot_bgcolor:"#fff",font:{family:"Public Sans, Arial",color:"#17251D",size:12.5},
 yaxis:{gridcolor:"#E7EBE6",zeroline:false},xaxis:{linecolor:"#DCE2DB"},legend:{orientation:"h",y:1.1,x:0}};
/* No celular: margens e fonte menores nos gráficos */
const ehCelular=()=>window.innerWidth<640;
function baseGraf(){return ehCelular()?{...layoutBase,margin:{l:46,r:8,t:8,b:44},font:{...layoutBase.font,size:11},legend:{...layoutBase.legend,y:1.2,font:{size:11}}}:layoutBase;}
const cfg={responsive:true,displaylogo:false,modeBarButtonsToRemove:["lasso2d","select2d","autoScale2d"],toImageButtonOptions:{format:"png",scale:2}};

/* ---------- Arte do login: parcelas do ensaio ---------- */
(function(){let h="";const cor=["#2F6B45","#3E7D55","#4F9066","#62A378","#78B68C"];
 for(let b=0;b<4;b++)for(let p=0;p<10;p++){const x=20+p*52,y=20+b*68;h+=`<rect x="${x}" y="${y}" width="46" height="60" rx="4" fill="${cor[(p+b*3)%5]}" opacity="${.35+((p*7+b*3)%5)/10}"/>`;}
 $("arteParcelas").innerHTML=h;})();

/* ---------- Login: o nível de acesso vem do cadastro do usuário ---------- */
const iniciais=n=>String(n).trim().split(/\s+/).filter(Boolean).map(p=>p[0]).filter((_,i,a)=>i===0||i===a.length-1).join("").toUpperCase()||"?";
function erroLogin(msg,campo){$("erroLogin").textContent=msg;$("erroLogin").classList.add("on");["email","senha"].forEach(i=>$(i).classList.toggle("invalido",i===campo));if(campo)$(campo).focus();}
async function tentarLogin(){
 if($("btnEntrar").disabled)return;          // evita clicar/apertar Enter duas vezes
 const email=$("email").value.trim().toLowerCase(),senha=$("senha").value;
 if(!email)return erroLogin("Informe seu e-mail.","email");
 if(!senha)return erroLogin("Informe sua senha.","senha");
 $("erroLogin").classList.remove("on");["email","senha"].forEach(id=>$(id).classList.remove("invalido"));

 // Com o Google Planilhas: a senha é conferida no Apps Script (aba Login)
 if(typeof loginPlanilha==="function"){
  const b=$("btnEntrar");b.disabled=true;b.textContent="Entrando…";
  try{const u=await loginPlanilha(email,senha,$("manterConectado").checked);$("senha").value="";entrar([u.nome,u.email,u.nivel]);}
  catch(e){erroLogin(e.message==="Failed to fetch"?"Sem conexão com a planilha. Tente de novo.":e.message,"senha");}
  finally{b.disabled=false;b.textContent="Entrar";}
  return;
 }
 // Modo local (demonstração): não confere senha
 const i=USUARIOS.findIndex(u=>String(u[1]).toLowerCase()===email);
 if(i<0)return erroLogin("E-mail não cadastrado. Peça um convite ao administrador.","email");
 USUARIOS[i][3]="Hoje";gravar("usuarios",USUARIOS);
 entrar(USUARIOS[i]);
}
$("btnEntrar").onclick=tentarLogin;
document.querySelectorAll("#formLogin input").forEach(i=>i.onkeydown=e=>{if(e.key==="Enter")tentarLogin();});
$("verSenha").onclick=()=>{const s=$("senha"),ver=s.type==="password";s.type=ver?"text":"password";$("verSenha").title=ver?"Ocultar senha":"Mostrar senha";$("verSenha").setAttribute("aria-label",$("verSenha").title);};
let USUARIO_LOGADO=null;
function entrar(u){
 USUARIO_LOGADO=u;
 const [nomeU,,perfil]=u;
 document.body.className=perfil;
 $("nomeUsuario").textContent=nomeU;$("avatar").textContent=iniciais(nomeU);$("avatarMobile").textContent=iniciais(nomeU);$("nivelUsuario").textContent=NIVEL[perfil];
 const h=new Date().getHours();$("saudacao").textContent=`${h<12?"Bom dia":h<18?"Boa tarde":"Boa noite"}, ${nomeU.split(" ")[0]}`;
 $("login").style.display="none";$("app").classList.add("on");abrir("geral");
}
$("sair").onclick=()=>{if(typeof sairPlanilha==="function")sairPlanilha();USUARIO_LOGADO=null;document.body.className="";menuMobile(false);$("app").classList.remove("on");$("login").style.display="";$("senha").value="";$("senha").type="password";$("erroLogin").classList.remove("on");};

/* ---------- Trocar a própria senha (só com o Google Planilhas) ---------- */
if(!window.PLANILHA_URL)$("trocarSenha").style.display="none";
$("trocarSenha").onclick=()=>{$("novaSenha").value="";$("novaSenha2").value="";$("modalSenha").classList.add("on");$("novaSenha").focus();};
$("btnSalvarSenha").onclick=async()=>{
 const a=$("novaSenha").value,b=$("novaSenha2").value;
 if(a.length<6){toast("A senha precisa ter pelo menos 6 caracteres");return;}
 if(a!==b){toast("As senhas não conferem");return;}
 const email=USUARIO_LOGADO&&USUARIO_LOGADO[1];if(!email)return;
 const bt=$("btnSalvarSenha");bt.disabled=true;
 try{await senhaPlanilha(email,a);$("modalSenha").classList.remove("on");toast("Senha alterada");}
 catch(e){toast("Não foi possível trocar a senha: "+e.message);}
 finally{bt.disabled=false;}
};

/* ---------- Navegação ---------- */
function abrir(p){
 document.querySelectorAll(".menu button").forEach(b=>b.setAttribute("aria-current",b.dataset.p===p?"page":"false"));
 document.querySelectorAll(".pagina").forEach(s=>s.classList.toggle("on",s.id==="p-"+p));
 if(p==="geral")desenharGeral();
 if(p==="camp"){iniciarMapa();setTimeout(()=>mapa&&mapa.invalidateSize(),60);}
 if(p==="analise")desenhar();
 if(p==="usuarios")desenharUsuarios();
 window.scrollTo(0,0);
}
document.querySelectorAll(".menu button").forEach(b=>b.onclick=()=>{abrir(b.dataset.p);menuMobile(false);});

/* ---------- Menu lateral no celular (gaveta) ---------- */
function menuMobile(abrirMenu){
 document.body.classList.toggle("menu-aberto",abrirMenu);
 $("btnMenu").setAttribute("aria-expanded",abrirMenu?"true":"false");
}
$("btnMenu").onclick=()=>menuMobile(!document.body.classList.contains("menu-aberto"));
$("veuMenu").onclick=()=>menuMobile(false);
document.addEventListener("keydown",e=>{if(e.key==="Escape")menuMobile(false);});
/* Ao girar o celular ou redimensionar: ajusta mapas e redesenha os gráficos se mudar de celular para tela grande */
let eraCelular=ehCelular(),tRes;
window.addEventListener("resize",()=>{clearTimeout(tRes);tRes=setTimeout(()=>{
 if(window.innerWidth>900)menuMobile(false);
 if(typeof mapa!=="undefined"&&mapa)mapa.invalidateSize();
 if(ehCelular()!==eraCelular){eraCelular=ehCelular();if($("app").classList.contains("on"))atualizarTela();}
},200);});

/* ---------- Campanhas ---------- */
const CAMPANHAS=SALVO.campanhas||[
 {nome:"Ensaio milho — ureia revestida com biochar",status:"feita",data:"Nov/2025 a Mar/2026",lat:-17.79,lng:-50.92,desc:"4 blocos × 2 espessuras × 5 doses de N"},
 {nome:"Amostragem de solo — safra 2024/25",status:"feita",data:"Jun/2025",lat:-21.18,lng:-47.81,desc:"Coleta de solo 0–20 e 20–40 cm"},
 {nome:"Avaliação de vegetação — soja",status:"feita",data:"Fev/2025",lat:-24.95,lng:-53.46,desc:"Biomassa, SPAD e IAF"},
 {nome:"Ensaio milho safrinha — repetição",status:"futura",data:"Fev/2027",dia:"10",mes:"FEV",lat:-17.85,lng:-51.05,desc:"Repetição do ensaio com biochar"},
 {nome:"Amostragem de solo pós-colheita",status:"futura",data:"Abr/2027",dia:"05",mes:"ABR",lat:-12.54,lng:-55.72,desc:"Nitrogênio residual no perfil"}
];
let mapa=null,mapaMini=null,camadaCamp=null,filtroCamp="todas",novoPonto=null,modoNovo=false;
const corCamp=c=>c.status==="feita"?"#2F6B45":"#3B6890";
function tiles(m,comOpcoes){
  // Mapa: OpenStreetMap (se não carregar, troca sozinho para as ruas da Esri)
  const esri="https://server.arcgisonline.com/ArcGIS/rest/services/";
  const ruasEsri=()=>L.tileLayer(esri+"World_Street_Map/MapServer/tile/{z}/{y}/{x}",{maxZoom:19,attribution:"Tiles &copy; Esri"});
  const osm=L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"&copy; OpenStreetMap"});
  const camadaMapa=L.layerGroup([osm]);
  let erros=0,trocou=false;
  osm.on("tileerror",()=>{if(trocou||++erros<3)return;trocou=true;camadaMapa.removeLayer(osm);camadaMapa.addLayer(ruasEsri());});

  // Satélite: imagens da Esri + nomes de cidades, estradas e limites por cima
  const satelite=L.layerGroup([
    L.tileLayer(esri+"World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxZoom:19,attribution:"Imagens &copy; Esri, Maxar, Earthstar Geographics"}),
    L.tileLayer(esri+"Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",{maxZoom:19}),
    L.tileLayer(esri+"Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",{maxZoom:19,opacity:.7})
  ]);

  const bases={"Mapa":camadaMapa,"Satélite":satelite};
  const preferida=lerSalvo().mapaBase;
  (bases[preferida]||camadaMapa).addTo(m);
  if(comOpcoes){
    L.control.layers(bases,null,{position:"topright",collapsed:false}).addTo(m);
    m.on("baselayerchange",e=>gravar("mapaBase",e.name)); // lembra a escolha
  }
}
function iniciarMapa(){
 if(typeof L==="undefined"){$("mapa").innerHTML='<p class="nota" style="padding:20px">Conecte-se à internet para carregar o mapa.</p>';return;}
 if(!mapa){mapa=L.map("mapa").setView([-18.5,-51.5],5);tiles(mapa,true);
  mapa.on("click",cliqueNoMapa);}
 desenharCamp();
}
const ICO_EDITAR='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>';
const ICO_EXCLUIR='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';
let editIdx=null; // null = nova campanha; número = campanha em edição

function desenharCamp(){
 if(camadaCamp)camadaCamp.remove();camadaCamp=L.layerGroup().addTo(mapa);
 const lista=$("listaCamp");lista.innerHTML="";
 const visiveis=CAMPANHAS.map((c,i)=>({c,i})).filter(({c})=>filtroCamp==="todas"||c.status===filtroCamp);
 if(!visiveis.length)lista.innerHTML='<li class="vazio">Nenhuma campanha neste filtro.</li>';
 visiveis.forEach(({c,i})=>{
  const m=marcador(c).addTo(camadaCamp);
  const li=document.createElement("li");
  li.innerHTML=`<div class="camp-info"><b>${esc(c.nome)}</b><span><span class="tag ${c.status}">${c.status==="feita"?"Realizada":"Prevista"}</span> ${esc(c.data)}</span></div>
   <div class="camp-acoes so-gerente">
    <button type="button" class="acao" data-acao="editar" title="Editar campanha">${ICO_EDITAR}Editar</button>
    <button type="button" class="acao perigo" data-acao="excluir" title="Excluir campanha">${ICO_EXCLUIR}Excluir</button>
   </div>`;
  li.querySelector(".camp-info").onclick=()=>{mapa.flyTo([c.lat,c.lng],9,{duration:.8});setTimeout(()=>m.openPopup(),850);};
  li.querySelector('[data-acao="editar"]').onclick=()=>abrirEdicao(i);
  li.querySelector('[data-acao="excluir"]').onclick=()=>pedirExclusao(i);
  lista.appendChild(li);});
}
function marcador(c){return L.circleMarker([c.lat,c.lng],{radius:9,color:"#fff",weight:2,fillColor:corCamp(c),fillOpacity:1})
 .bindPopup(`<b>${esc(c.nome)}</b><br><span class="tag ${c.status}">${c.status==="feita"?"Realizada":"Prevista"}</span> ${esc(c.data)}<br><small>${esc(c.desc)}</small>`);}

$("filtroCamp").onclick=e=>{const b=e.target.closest("button");if(!b)return;filtroCamp=b.dataset.f;
 [...$("filtroCamp").children].forEach(x=>x.setAttribute("aria-pressed",x===b));desenharCamp();};

/* Nova campanha: primeiro marca o local no mapa, depois preenche */
$("btnNovaCamp").onclick=()=>{editIdx=null;modoNovo="novo";$("modoMapa").textContent="Clique no mapa para marcar o local da nova campanha.";$("modoMapa").style.display="block";};
function preencherModal(c){
 $("tituloCamp").textContent=editIdx===null?"Nova campanha":"Editar campanha";
 $("descCamp").textContent=editIdx===null?"O local foi marcado no mapa. Preencha os dados da campanha.":"Altere os dados e salve. Para mudar o local, use o botão abaixo.";
 $("cNome").value=c.nome||"";$("cData").value=c.data||"";$("cStatus").value=c.status||"futura";$("cDesc").value=c.desc||"";$("cInicio").value=c.inicio||"";
 $("cLocal").textContent=novoPonto?`Local: ${novoPonto.lat.toFixed(4)}, ${novoPonto.lng.toFixed(4)}`:"";
 $("modalCamp").classList.add("on");$("cNome").focus();
}
function abrirEdicao(i){editIdx=i;const c=CAMPANHAS[i];novoPonto={lat:c.lat,lng:c.lng};preencherModal(c);}
/* Mudar o local durante a edição: fecha o modal, marca no mapa e volta com os campos preenchidos */
$("btnMoverCamp").onclick=()=>{
 rascunho={nome:$("cNome").value,data:$("cData").value,status:$("cStatus").value,desc:$("cDesc").value,inicio:$("cInicio").value};
 $("modalCamp").classList.remove("on");modoNovo="mover";
 $("modoMapa").textContent="Clique no mapa para definir o novo local da campanha.";$("modoMapa").style.display="block";
 if(editIdx!==null)mapa.flyTo([CAMPANHAS[editIdx].lat,CAMPANHAS[editIdx].lng],8,{duration:.6});
};
let rascunho=null;
function cliqueNoMapa(e){
 if(!modoNovo)return;
 novoPonto=e.latlng;$("modoMapa").style.display="none";
 const dados=modoNovo==="mover"&&rascunho?rascunho:{};modoNovo=false;rascunho=null;preencherModal(dados);
}
$("btnSalvarCamp").onclick=()=>{
 if(!$("cNome").value.trim()||!$("cData").value.trim()){toast("Preencha o nome e o período da campanha");return;}
 const ini=$("cInicio").value,d=ini?new Date(ini+"T12:00:00"):null;
 const camp={nome:$("cNome").value.trim(),data:$("cData").value.trim(),status:$("cStatus").value,desc:$("cDesc").value.trim(),
  inicio:ini,dia:d?String(d.getDate()).padStart(2,"0"):"",mes:d?MESES[d.getMonth()]:"",lat:novoPonto.lat,lng:novoPonto.lng};
 if(editIdx===null)CAMPANHAS.push(camp);else CAMPANHAS[editIdx]={...CAMPANHAS[editIdx],...camp};
 const msg=editIdx===null?"Campanha cadastrada":"Campanha atualizada";
 gravar("campanhas",CAMPANHAS);editIdx=null;$("modalCamp").classList.remove("on");desenharCamp();toast(msg);
};

/* Excluir com confirmação */
let excluirIdx=null;
function pedirExclusao(i){excluirIdx=i;$("textoExcluir").textContent=`A campanha "${CAMPANHAS[i].nome}" será removida do mapa e da lista. Essa ação não pode ser desfeita.`;$("modalExcluir").classList.add("on");}
$("btnConfirmaExcluir").onclick=()=>{
 if(excluirIdx===null)return;const nomeC=CAMPANHAS[excluirIdx].nome;
 CAMPANHAS.splice(excluirIdx,1);excluirIdx=null;gravar("campanhas",CAMPANHAS);
 $("modalExcluir").classList.remove("on");mapa.closePopup();desenharCamp();toast(`Campanha "${nomeC}" excluída`);
};
document.querySelectorAll("[data-fechar]").forEach(b=>b.onclick=()=>{b.closest(".fundo-modal").classList.remove("on");modoNovo=false;rascunho=null;editIdx=null;excluirIdx=null;editUserIdx=null;excluirUserIdx=null;$("uNivel").disabled=false;$("modoMapa").style.display="none";});

/* ---------- Visão geral ---------- */
function desenharGeral(){
 const feitas=CAMPANHAS.filter(c=>c.status==="feita").length,fut=CAMPANHAS.length-feitas;
 const temY=VARIAVEIS.includes("Yield_MgHa");let melhor=null;
 if(temY){const g={};DADOS.forEach(d=>(g[d.Trat]=g[d.Trat]||[]).push(d.Yield_MgHa));
  Object.entries(g).forEach(([k,v])=>{const s=stats(v);if(s&&(!melhor||s.media>melhor.m))melhor={k,m:s.media};});}
 const y=temY?stats(DADOS.map(d=>d.Yield_MgHa)):null;
 $("kpisGeral").innerHTML=`
  <div class="kpi"><span>Campanhas realizadas</span><strong>${feitas}</strong><small>${fut} previstas</small></div>
  <div class="kpi"><span>Parcelas no ensaio</span><strong>${DADOS.length}</strong><small>${VARIAVEIS.length} variáveis medidas</small></div>
  <div class="kpi"><span>Produtividade média</span><strong>${y?fmt(y.media,1):"—"}</strong><small>Mg/ha · CV ${y?fmt(y.cv,1):"—"}%</small></div>
  <div class="kpi destaque"><span>Maior produtividade</span><strong>${melhor?fmt(melhor.m,1):"—"}</strong><small>${melhor?melhor.k.replace(" · "," com dose "):""}</small></div>`;
 const gg=$("graficoGeral");
 if(!temY){if(window.Plotly)Plotly.purge(gg);gg.innerHTML=`<div class="graf-vazio">${DADOS.length?"A planilha importada não tem a coluna Yield_MgHa (produtividade).":"Nenhum dado importado ainda."}</div>`;}
 else if(gg.querySelector(".graf-vazio"))gg.innerHTML="";
 if(temY&&window.Plotly){
  const esp=unicos("Thickness"),doses=unicos("N_rate");
  Plotly.react("graficoGeral",esp.map((e,i)=>{const ss=doses.map(d=>stats(DADOS.filter(x=>x.Thickness===e&&x.N_rate===d).map(x=>x.Yield_MgHa)));
   return{type:"scatter",mode:"lines+markers",name:e,x:doses,y:ss.map(s=>s&&s.media),error_y:{type:"data",array:ss.map(s=>s&&s.dp),thickness:1.2,width:4},line:{color:CORES[i],width:2.5},marker:{size:8}};}),
   {...baseGraf(),yaxis:{...layoutBase.yaxis,title:"Mg/ha"}},cfg);}
 $("proximas").innerHTML=CAMPANHAS.filter(c=>c.status==="futura").map(c=>`<div class="prox"><div class="data-box">${c.dia||"--"}<small>${c.mes||""}</small></div><div><b>${esc(c.nome)}</b><span>${esc(c.desc||c.data)}</span></div></div>`).join("")||'<p class="nota">Nenhuma campanha prevista.</p>';
 if(typeof L!=="undefined"){if(!mapaMini){mapaMini=L.map("mapaMini",{zoomControl:false,attributionControl:false}).setView([-18.5,-51.5],4);tiles(mapaMini);}
  mapaMini.eachLayer(l=>{if(l instanceof L.CircleMarker)l.remove();});CAMPANHAS.forEach(c=>marcador(c).addTo(mapaMini));setTimeout(()=>mapaMini.invalidateSize(),60);}
}

/* ---------- Dados e filtros ---------- */
let VARIAVEIS=[],tipoGraf="box";
function unicos(c){return[...new Set(DADOS.map(d=>d[c]))].sort(ord);}
function prepararDados(){
 const vazio=!DADOS.length;
 $("semDados").hidden=!vazio;$("corpoAnalise").hidden=vazio;
 $("btnBaixar").hidden=vazio;
 if(vazio){
  VARIAVEIS=[];$("selVar").innerHTML="";["fEsp","fBloco","fDose"].forEach(id=>$(id).innerHTML="");
  $("introAnalise").textContent="Nenhum dado importado.";
  $("origemDados").textContent="";$("btnRemoverImport").hidden=true;
  return;
 }
 DADOS.forEach(d=>d.Trat=`${d.Thickness} · ${d.N_rate}`);
 VARIAVEIS=Object.keys(DADOS[0]).filter(k=>!FATORES.includes(k)&&DADOS.some(d=>typeof d[k]==="number"&&!isNaN(d[k])));
 const sel=$("selVar"),antes=sel.value;sel.innerHTML="";
 [["Solo",VARIAVEIS.filter(v=>SOLO.includes(v))],["Vegetação e produção",VARIAVEIS.filter(v=>!SOLO.includes(v))]].forEach(([g,vs])=>{
  if(!vs.length)return;const og=document.createElement("optgroup");og.label=g;
  vs.forEach(v=>{const o=document.createElement("option");o.value=v;o.textContent=nome(v);og.appendChild(o);});sel.appendChild(og);});
 if(VARIAVEIS.includes(antes))sel.value=antes;else if(VARIAVEIS.includes("Yield_MgHa"))sel.value="Yield_MgHa";
 checks("fEsp",unicos("Thickness"),v=>v);checks("fBloco",unicos("Block"),v=>"Bloco "+v);checks("fDose",unicos("N_rate"),v=>v);
 const vazias=Object.keys(DADOS[0]).filter(k=>!FATORES.includes(k)&&!VARIAVEIS.includes(k));
 $("introAnalise").textContent=`${DADOS.length} parcelas e ${VARIAVEIS.length} variáveis.`+(vazias.length?` Sem dados: ${vazias.join(", ")}.`:"");
 $("origemDados").textContent=ORIGEM?`Fonte: ${ORIGEM.arquivo} · importado em ${ORIGEM.data}`:"Fonte: dados de exemplo do ensaio";
 $("btnRemoverImport").hidden=!ORIGEM;

}
function checks(id,vals,rot){const el=$(id);el.innerHTML="";
 vals.forEach(v=>{const l=document.createElement("label");l.innerHTML=`<input type="checkbox" checked value="${v}">${rot(v)}`;el.appendChild(l);});el.onchange=desenhar;}
const marcados=id=>[...document.querySelectorAll(`#${id} input:checked`)].map(i=>i.value);
function filtrados(){const e=marcados("fEsp"),b=marcados("fBloco"),n=marcados("fDose");
 return DADOS.filter(d=>e.includes(String(d.Thickness))&&b.includes(String(d.Block))&&n.includes(String(d.N_rate)));}

/* ---------- Análise ---------- */
function desenhar(){
 if(!$("p-analise").classList.contains("on")||!DADOS.length)return;
 const v=$("selVar").value,g=$("selGrupo").value,dados=filtrados(),geral=stats(dados.map(d=>d[v]));
 $("kpisVar").innerHTML=[["Média",geral&&geral.media],["Mediana",geral&&geral.mediana],["Desvio padrão",geral&&geral.dp],["CV (%)",geral&&geral.cv]]
  .map(([k,x],i)=>`<div class="kpi${i===0?" destaque":""}"><span>${k}</span><strong${k==="CV (%)"&&x>20?' style="color:var(--alerta)"':""}>${fmt(x)}</strong><small>${geral?geral.n+" parcelas":"sem dados"}</small></div>`).join("");
 $("tituloGraf").textContent=nome(v);
 $("descGraf").textContent=`Agrupado por ${ROTULO[g]}`+(g==="N_rate"?", separado por espessura":"")+(tipoGraf==="box"?". Cada ponto é uma parcela.":". Barras mostram a média e as linhas o desvio padrão.");
 const grupos=[...new Set(dados.map(d=>d[g]))].sort(ord),rot=k=>g==="Block"?"Bloco "+k:String(k);
 let traces,layout={...baseGraf(),yaxis:{...layoutBase.yaxis,title:nome(v)}};
 const series=g==="N_rate"?unicos("Thickness").filter(e=>dados.some(d=>d.Thickness===e)).map(e=>({nome:e,dados:dados.filter(d=>d.Thickness===e),x:d=>d.N_rate}))
  :[{nome:"",dados,x:d=>rot(d[g])}];
 if(tipoGraf==="box"){
  traces=g==="N_rate"?series.map((s,i)=>({type:"box",name:s.nome,x:s.dados.map(s.x),y:s.dados.map(d=>d[v]),marker:{color:CORES[i%5],size:5},line:{width:1.5},boxpoints:"all",jitter:.35,pointpos:0}))
   :grupos.map((k,i)=>({type:"box",name:rot(k),y:dados.filter(d=>d[g]===k).map(d=>d[v]),marker:{color:CORES[i%5],size:5},line:{width:1.5},boxpoints:"all",jitter:.35,pointpos:0}));
  layout.boxmode="group";layout.showlegend=g==="N_rate";
 }else{
  traces=series.map((s,i)=>{const ks=[...new Set(s.dados.map(s.x))].sort(ord),ss=ks.map(k=>stats(s.dados.filter(d=>s.x(d)===k).map(d=>d[v])));
   return{type:"bar",name:s.nome,x:ks,y:ss.map(z=>z&&z.media),error_y:{type:"data",array:ss.map(z=>z&&z.dp),thickness:1.2,width:5,color:"#17251D"},marker:{color:g==="N_rate"?CORES[i%5]:ks.map((_,j)=>CORES[j%5])}};});
  layout.barmode="group";layout.showlegend=g==="N_rate";layout.bargap=.3;
 }
 if(window.Plotly)Plotly.react("grafico",traces,layout,{...cfg,toImageButtonOptions:{format:"png",scale:2,filename:v}});
 const linhas=grupos.map(k=>({k:rot(k),s:stats(dados.filter(d=>d[g]===k).map(d=>d[v]))}));
 $("tabStats").innerHTML=`<thead><tr><th class="e">${ROTULO[g]}</th><th>N</th><th>Média</th><th>Mediana</th><th>Desvio padrão</th><th>CV (%)</th><th>Mínimo</th><th>Máximo</th></tr></thead><tbody>`+
  linhas.concat(geral?[{k:"Geral",s:geral,t:1}]:[]).filter(l=>l.s).map(l=>`<tr${l.t?' class="total"':""}><td class="e">${l.k}</td><td>${l.s.n}</td><td>${fmt(l.s.media)}</td><td>${fmt(l.s.mediana)}</td><td>${fmt(l.s.dp)}</td><td class="${l.s.cv>20?"cv-alto":""}">${fmt(l.s.cv)}</td><td>${fmt(l.s.min)}</td><td>${fmt(l.s.max)}</td></tr>`).join("")+"</tbody>";
}
["selVar","selGrupo"].forEach(id=>$(id).onchange=desenhar);
$("tipoGraf").onclick=e=>{const b=e.target.closest("button");if(!b)return;tipoGraf=b.dataset.t;[...$("tipoGraf").children].forEach(x=>x.setAttribute("aria-pressed",x===b));desenhar();};

/* ---------- Download ---------- */
function tabelaStats(dados,grupo){const out=[];
 VARIAVEIS.forEach(v=>{(grupo?[...new Set(dados.map(d=>d[grupo]))].sort(ord):[null]).forEach(k=>{
  const s=stats((k===null?dados:dados.filter(d=>d[grupo]===k)).map(d=>d[v]));if(!s)return;
  const l={"Categoria":SOLO.includes(v)?"Solo":"Vegetação","Variável":nome(v)};if(grupo)l[ROTULO[grupo]]=k;
  Object.assign(l,{"N":s.n,"Média":r2(s.media),"Mediana":r2(s.mediana),"Desvio padrão":r2(s.dp),"CV (%)":r2(s.cv),"Mínimo":r2(s.min),"Máximo":r2(s.max)});out.push(l);});});
 return out;}
$("btnBaixar").onclick=()=>{if(!DADOS.length){toast("Não há dados para baixar");return;}
 const dados=filtrados(),wb=XLSX.utils.book_new();
 [["Por tratamento","Trat"],["Por espessura","Thickness"],["Por dose de N","N_rate"],["Por bloco","Block"],["Geral",null]].forEach(([n,g])=>{
  const ws=XLSX.utils.json_to_sheet(tabelaStats(dados,g));ws["!cols"]=[{wch:11},{wch:30},{wch:20},...Array(8).fill({wch:14})];XLSX.utils.book_append_sheet(wb,ws,n);});
 XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(dados.map(({Trat,...r})=>r)),"Dados filtrados");
 XLSX.writeFile(wb,"estatisticas_solo_vegetacao.xlsx");toast("Planilha de estatísticas baixada");};

/* ---------- Importar ---------- */
$("btnImportar").onclick=()=>$("arq").click();
$("btnImportarVazio").onclick=()=>$("arq").click();
$("arq").onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();
 r.onload=ev=>{const wb=XLSX.read(new Uint8Array(ev.target.result),{type:"array"});
  const novos=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:null});
  const faltam=["Block","Thickness","N_rate"].filter(c=>!novos.length||!(c in novos[0]));
  if(faltam.length){toast("A planilha precisa das colunas: "+faltam.join(", "));return;}
  // Limpa linhas vazias e converte números que vieram como texto (ex.: "12,5")
  const limpos=novos.filter(l=>Object.values(l).some(v=>v!==null&&v!=="")).map(l=>{const o={};
    for(const[k,v]of Object.entries(l)){const n=typeof v==="string"&&/^-?\d+([.,]\d+)?$/.test(v.trim())?Number(v.replace(",",".")):v;const ch=String(k).trim();if(ch)o[ch]=n;}return o;});
  DADOS=limpos;ORIGEM={arquivo:f.name,data:new Date().toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"})};
  const ok=gravar("dados",DADOS.map(({Trat,...r})=>r))&&gravar("origem",ORIGEM);
  prepararDados();desenhar();
  toast(`Planilha importada: ${DADOS.length} parcelas`+(ok?" (dados gravados)":""));};
 r.readAsArrayBuffer(f);e.target.value="";};


/* ---------- Remover dados importados (volta aos dados de exemplo) ---------- */
$("btnRemoverImport").onclick=()=>{
 if(!ORIGEM)return;
 $("textoRemoverImport").textContent=`As ${DADOS.length} parcelas de "${ORIGEM.arquivo}" serão apagadas`+(window.PLANILHA_URL?" da planilha":"")+
  " para todos os usuários. A plataforma fica sem dados até uma nova planilha ser importada.";
 $("modalRemoverImport").classList.add("on");
};
$("btnConfirmaRemoverImport").onclick=()=>{
 const arquivo=ORIGEM&&ORIGEM.arquivo;
 DADOS=[];ORIGEM=null;
 gravar("dados",[]);gravar("origem",null);       // com o Google Planilhas, limpa a aba Dados
 $("modalRemoverImport").classList.remove("on");
 prepararDados();desenhar();
 toast(arquivo?`Dados de "${arquivo}" removidos`:"Dados removidos");
};

/* ---------- Usuários ---------- */
const USUARIOS=SALVO.usuarios||[["Ana Ribeiro","ana@pesquisa.org","admin","Hoje"],["Carlos Mendes","carlos@pesquisa.org","gerente","Ontem"],
 ["Júlia Santos","julia@pesquisa.org","usuario","Há 3 dias"],["Pedro Alves","pedro@pesquisa.org","usuario","Há 1 semana"]];
const escHTML=t=>String(t??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const qtdAdmins=()=>USUARIOS.filter(u=>u[2]==="admin").length;
let editUserIdx=null,excluirUserIdx=null;

function desenharUsuarios(){
 $("tabUsuarios").innerHTML=USUARIOS.map((u,i)=>{
  const dono=i===0;   // a primeira conta (administrador principal) é protegida
  return `<tr><td class="e nome-u"><b>${escHTML(u[0])}</b></td><td class="e" data-label="E-mail">${escHTML(u[1])}</td>
 <td class="e" data-label="Nível"><select class="ctl" style="width:auto;padding:5px 8px" data-i="${i}" ${dono?"disabled":""}>${Object.entries(NIVEL).map(([k,n])=>`<option value="${k}"${k===u[2]?" selected":""}>${n}</option>`).join("")}</select></td>
 <td class="e" data-label="Último acesso">${escHTML(u[3])}</td>
 <td class="e acoes-u"><div style="display:flex;gap:6px">
  <button type="button" class="acao" data-editar="${i}" title="Editar usuário">${ICO_EDITAR}Editar</button>
  <button type="button" class="acao perigo" data-excluir="${i}" ${dono?'disabled style="opacity:.4;cursor:not-allowed" title="O administrador principal não pode ser excluído"':'title="Excluir usuário"'}>${ICO_EXCLUIR}Excluir</button>
 </div></td></tr>`;}).join("");
 $("tabUsuarios").querySelectorAll("select").forEach(s=>s.onchange=()=>{
  const i=+s.dataset.i;
  if(USUARIOS[i][2]==="admin"&&s.value!=="admin"&&qtdAdmins()<=1){s.value="admin";toast("A plataforma precisa de pelo menos um administrador");return;}
  USUARIOS[i][2]=s.value;gravar("usuarios",USUARIOS);toast(`${USUARIOS[i][0]} agora é ${NIVEL[s.value]}`);});
 $("tabUsuarios").querySelectorAll("[data-editar]").forEach(b=>b.onclick=()=>abrirEdicaoUser(+b.dataset.editar));
 $("tabUsuarios").querySelectorAll("[data-excluir]").forEach(b=>b.onclick=()=>{if(!b.disabled)pedirExclusaoUser(+b.dataset.excluir);});
}

/* Abre o mesmo modal para convidar (novo) ou editar (existente) */
function abrirModalUser(i){
 editUserIdx=i;const u=i===null?["","","usuario"]:USUARIOS[i];
 $("tituloUser").textContent=i===null?"Convidar usuário":"Editar usuário";
 const comSenha=!!window.PLANILHA_URL;
 $("campoSenhaUser").style.display=comSenha?"":"none";$("uSenha").value="";
 $("dicaSenhaUser").textContent=i===null?"Mínimo de 6 caracteres. Passe a senha para a pessoa; ela pode trocar depois.":"Deixe em branco para manter a senha atual.";
 $("descUser").textContent=i===null?(comSenha?"Cadastre a pessoa e defina a senha de acesso.":"A pessoa recebe um e-mail para criar a senha."):"Altere o nome, o e-mail, o nível de acesso ou a senha.";
 $("btnEnviarConvite").textContent=i===null?(comSenha?"Criar usuário":"Enviar convite"):"Salvar alterações";
 $("uNome").value=u[0];$("uEmail").value=u[1];$("uNivel").value=u[2];
 $("uNivel").disabled=i===0;   // o administrador principal continua administrador
 $("modalUser").classList.add("on");$("uNome").focus();
}
function abrirEdicaoUser(i){abrirModalUser(i);}
$("btnConvidar").onclick=()=>abrirModalUser(null);

$("btnEnviarConvite").onclick=()=>{
 const nome=$("uNome").value.trim(),email=$("uEmail").value.trim().toLowerCase(),nivel=$("uNivel").value,senha=$("uSenha").value;
 const comSenha=!!window.PLANILHA_URL;
 if(!nome||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){toast("Informe o nome e um e-mail válido");return;}
 if(USUARIOS.some((u,i)=>i!==editUserIdx&&String(u[1]).toLowerCase()===email)){toast("Já existe um usuário com esse e-mail");return;}
 const emailMudou=editUserIdx!==null&&String(USUARIOS[editUserIdx][1]).toLowerCase()!==email;
 if(comSenha&&(editUserIdx===null||emailMudou)&&senha.length<6){toast(emailMudou?"Ao trocar o e-mail, defina uma nova senha (mín. 6 caracteres)":"Defina uma senha com pelo menos 6 caracteres");$("uSenha").focus();return;}
 if(comSenha&&senha&&senha.length<6){toast("A senha precisa ter pelo menos 6 caracteres");return;}
 if(editUserIdx===null){
  USUARIOS.push([nome,email,nivel,comSenha?"Nunca acessou":"Convite enviado"]);toast(comSenha?`Usuário "${nome}" criado`:"Convite enviado");
 }else{
  const u=USUARIOS[editUserIdx];
  if(u[2]==="admin"&&nivel!=="admin"&&qtdAdmins()<=1){toast("A plataforma precisa de pelo menos um administrador");return;}
  USUARIOS[editUserIdx]=[nome,email,editUserIdx===0?"admin":nivel,u[3]];toast(`Usuário "${nome}" atualizado`);
 }
 gravar("usuarios",USUARIOS);
 if(comSenha&&senha)senhaPlanilha(email,senha).catch(e=>toast("Não foi possível salvar a senha: "+e.message));
 editUserIdx=null;$("uNivel").disabled=false;$("uSenha").value="";
 $("modalUser").classList.remove("on");desenharUsuarios();
};

/* Excluir usuário com confirmação */
function pedirExclusaoUser(i){
 if(i===0)return;
 if(USUARIOS[i][2]==="admin"&&qtdAdmins()<=1){toast("A plataforma precisa de pelo menos um administrador");return;}
 excluirUserIdx=i;
 $("textoExcluirUser").textContent=`${USUARIOS[i][0]} (${USUARIOS[i][1]}) perderá o acesso à plataforma. Essa ação não pode ser desfeita.`;
 $("modalExcluirUser").classList.add("on");
}
$("btnConfirmaExcluirUser").onclick=()=>{
 if(excluirUserIdx===null)return;const nome=USUARIOS[excluirUserIdx][0];
 USUARIOS.splice(excluirUserIdx,1);excluirUserIdx=null;gravar("usuarios",USUARIOS);
 $("modalExcluirUser").classList.remove("on");desenharUsuarios();toast(`Usuário "${nome}" excluído`);
};
document.addEventListener("keydown",e=>{if(e.key==="Escape")document.querySelectorAll(".fundo-modal.on").forEach(m=>m.classList.remove("on"));});

prepararDados();

/* Redesenha a tela que estiver aberta (usado quando chegam dados novos da nuvem) */
function atualizarTela(){
 prepararDados();
 if($("p-geral").classList.contains("on"))desenharGeral();
 if($("p-analise").classList.contains("on"))desenhar();
 if(mapa)desenharCamp();
 if($("p-usuarios").classList.contains("on"))desenharUsuarios();
}
