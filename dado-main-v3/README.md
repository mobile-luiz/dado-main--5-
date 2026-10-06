# Campo&Dados — Plataforma de Dados de Pesquisa (demonstração)

Plataforma web para gerenciar dados de pesquisa de campo:

- **Visão geral** com indicadores do ensaio e próximas campanhas
- **Campanhas de campo** em mapa (realizadas e previstas): cadastrar clicando no mapa, editar (dados e local) e excluir
- **Solo e vegetação**: boxplots e gráfico de média ± desvio padrão, filtros por espessura, bloco e dose de N, tabela com média, mediana, desvio padrão, CV, mínimo e máximo
- **Download** das estatísticas em Excel (.xlsx) e **importação** de nova planilha
- **Controle de acesso** em 3 níveis: Usuário, Gerente e Administrador

## Estrutura

```
plataforma-pesquisa/
├── index.html          página principal
├── css/estilo.css      estilos
├── js/dados.js         dados do ensaio (40 parcelas)
├── js/app.js           lógica da plataforma
├── js/planilha.js      banco de dados no Google Planilhas
├── js/planilha-config.js  URL do Apps Script (preencher)
├── apps-script/Code.gs código para colar no Apps Script da planilha
└── lib/                bibliotecas (Leaflet, Plotly, SheetJS) já incluídas
```

As bibliotecas ficam na pasta `lib`, então gráficos e planilhas funcionam sem depender de CDN.
O mapa de fundo (OpenStreetMap ou satélite da Esri) e a fonte precisam de internet.

## Rodar no VS Code

1. Abra a pasta `plataforma-pesquisa` no VS Code (Arquivo > Abrir Pasta).
2. Instale a extensão **Live Server** (Ritwick Dey).
3. Clique com o botão direito em `index.html` > **Open with Live Server**.
4. O navegador abre em `http://127.0.0.1:5500` e as alterações recarregam sozinhas.

Também funciona com dois cliques no `index.html`.

## Publicar no GitHub Pages

```bash
cd plataforma-pesquisa
git init
git add .
git commit -m "Plataforma de dados de pesquisa - demonstração"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/plataforma-pesquisa.git
git push -u origin main
```

Depois, no GitHub: **Settings > Pages > Build and deployment > Source: Deploy from a branch**,
escolha **main** e **/(root)** e clique em **Save**. Em 1 a 2 minutos o site fica em:

`https://SEU-USUARIO.github.io/plataforma-pesquisa/`

## Importar dados

Entre como **Gerente** ou **Administrador**, vá em **Solo e vegetação > Importar planilha** e escolha o arquivo (.xlsx, .xls ou .csv).
A planilha precisa das colunas `Block`, `Thickness` e `N_rate`; as demais colunas numéricas viram variáveis de análise.

Os dados importados ficam **gravados no navegador** (localStorage) e continuam lá depois de recarregar ou fechar a página.

## Banco de dados no Google Planilhas

Sem configuração, a plataforma roda em **modo local** (dados só no navegador).
Com o Google Planilhas configurado, dados do ensaio, campanhas e usuários ficam na planilha:
o que um usuário muda aparece para os outros em até ~15 segundos, e quem editar direto na planilha também atualiza a plataforma.

Abas usadas (criadas pela função `configurar`): **Dados**, **Campanhas**, **Usuarios**, **Login** e **Config**.
No primeiro login do administrador, se a planilha estiver vazia, a plataforma preenche com os dados de exemplo.

### Passo a passo

1. Abra a planilha e vá em **Extensões > Apps Script**.
2. Apague o conteúdo de `Código.gs`, cole o arquivo `apps-script/Code.gs` deste projeto e salve (Ctrl+S).
3. No começo do `Code.gs`, troque o `ADMIN_INICIAL` (nome, e-mail e senha do primeiro administrador) e salve.
4. No topo, escolha a função **configurar** e clique em **Executar**. Autorize o acesso
   (Avançado > Acessar projeto (não seguro) > Permitir). Isso cria as abas e o administrador.
5. Clique em **Implantar > Nova implantação** > engrenagem > **App da Web**:
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
   Clique em **Implantar** e copie a **URL do app da Web** (termina em `/exec`).
6. Cole essa URL em `js/planilha-config.js`, no `window.PLANILHA_URL`.
7. Faça o `git add`, `commit` e `push`.

O indicador no menu lateral mostra: "Sincronizado com o Google Planilhas" ou "Modo local".

### Login e senhas

- A senha é conferida no Apps Script. O site nunca recebe a aba **Login**, e sem login não lê nem grava nada.
- As senhas ficam guardadas como hash (`sha256$...`), não dá para ler a senha original.
- **Criar usuário:** entre como administrador > **Usuários > Convidar**, preencha nome, e-mail, nível e a senha inicial.
- **Trocar a própria senha:** link **Trocar senha** embaixo do nome, no menu lateral.
- **Esqueceu a senha:** o administrador edita o usuário e digita uma senha nova. Ou, direto na planilha,
  digita a senha nova na coluna `senha` da aba **Login** — ela vira hash sozinha.
- **Níveis:** Usuário só vê; Gerente importa dados e mexe nas campanhas; Administrador também gerencia usuários.
  O servidor confere o nível em toda gravação.
- O login fica salvo no navegador e expira após 6 horas sem uso.

**Ao alterar o `Code.gs` depois:** vá em **Implantar > Gerenciar implantações > lápis > Versão: Nova versão > Implantar**.
Assim a URL continua a mesma. (Se criar uma "Nova implantação", a URL muda.)

## Observações

- No modo local (sem planilha), o login é só demonstração e não confere senha.
- No modo local, dados importados, campanhas e usuários ficam gravados só no navegador onde foram feitos.
  Com o Google Planilhas configurado, ficam na planilha e são compartilhados com todos.
- Não compartilhe a planilha como editor com quem não for administrador: quem edita a planilha mexe em tudo direto.
- As localizações das campanhas são ilustrativas.
