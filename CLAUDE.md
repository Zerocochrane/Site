# CLAUDE.md — guia do projeto para o Claude

Portfólio da fotógrafa **Debora Agostini**: site público, área do cliente e painel admin.

## Regras
- **Toda a interface é em português do Brasil.** A fotógrafa é tratada no feminino ("a fotógrafa", "ela"). README e comentários de código em inglês.
- Não altere `server/.env`, o banco (`server/data/`), `server/uploads/` nem `server/private/` — ficam só no servidor e estão no `.gitignore`.
- Não mexa em `.github/workflows/deploy.yml` sem pedir.
- Mudanças visuais devem funcionar no **modo claro e no escuro** (`html[data-theme]`, tokens CSS em `client/src/styles.css`) e no celular.
- Campos de formulário no celular precisam de fonte 16px (senão o iPhone dá zoom).

## Stack
- Node.js 24 (`node:sqlite`, sem dependência de banco externo). Ubuntu 26.04 + PM2 na Oracle Cloud.
- `client/`: React + Vite. `server/`: Express, SQLite em `server/data/portfolio.db`, `sharp` para imagens.
- Instalar: `npm run install:all` · Desenvolvimento: `npm run dev` · Build: `npm run build`.

## Publicar
- **Cada push na branch `main` publica o site** (GitHub Actions → rsync + `scripts/deploy-pm2.sh` no servidor).
- Antes de fazer push na `main`: `npm run build` precisa passar sem erros.
- Mensagens de commit curtas, em português, dizendo o que mudou para quem usa o site.

## Onde fica cada coisa
- Páginas públicas: `client/src/pages/` (Home, Group, Availability = agendamento, ClientArea, Privacy).
- Painel admin: `client/src/admin/` (Ferramentas = `ToolsAdmin.jsx`).
- Tema claro/escuro: `client/src/theme.js`, `client/src/components/ThemeToggle.jsx`.
- API: `server/routes/`. Pedidos de agendamento: `server/routes/inquiries.js`, e-mails em `server/mail.js`.
- Contrato e assinatura eletrônica: `server/signatures.js` (colunas, códigos SHA-256 em `contract_hashes`, PDF assinado com DejaVu via pdf-lib), rotas `/:id/contract/*` em `server/routes/adminClients.js` e `/contract*`, `/validate` em `server/routes/clientArea.js`; telas em `client/src/components/ContractBits.jsx`, `pages/ClientArea.jsx`, `admin/ClientAdmin.jsx`. Ordem: aceitar pedido → cliente criado → enviar contrato (cria a senha, prazo padrão 7 dias) → cliente assina → fotógrafa assina → fotos. Assinado pelo cliente = prazo parado até o aviso das fotos.
- Status do cliente (12 etapas, cores): `server/clientStatus.js` (etapa mais avançada entre as automáticas e as manuais em `clients.manual_marks`), rota `POST /api/admin/clients/:id/status`; telas `client/src/admin/StatusBits.jsx` (selo, legenda, linha do tempo), lista `ClientsAdmin.jsx`, página `ClientAdmin.jsx`; nomes e gatilhos em `STATUS_LIST` (`admin/clientUtils.js`), cores `.st-<chave>` no fim de `styles.css`.
- Portfólio de demonstração: `server/scripts/demo-portfolio.js` (fotos do Unsplash em `server/scripts/demo-photos.js`, reservas picsum/loremflickr, depois imagens geradas). Teste de conexão: `server/scripts/net-check.js`.
