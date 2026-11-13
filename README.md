# Photographer Portfolio

A portfolio website with an availability calendar and booking requests.

- **Frontend:** React (Vite) — `client/`
- **Backend:** Node.js + Express — `server/`
- **Database:** SQLite built into Node.js 24 (`node:sqlite`, no native package to compile; one file, `server/data/portfolio.db`, created automatically). Photos are stored in `server/uploads/`.

SQLite was chosen because the data is small (photos, calendar days, requests) and it needs no separate database server — backing up the site is just copying `server/data` and `server/uploads`.

## What's inside

**Public site**
- `/` — big name + tagline, the **Work** section: one large cover card per group (Weddings, Portraits…), in the order set in admin, then About.
- `/work/<id>-<name>` — a group page with its subgroups ("collections") as cards. If a group has only one subgroup, its carousel opens directly.
- `/work/<id>-<name>/<id>-<name>` — a subgroup's photos as a carousel: arrows, keyboard ← →, swipe on phones, thumbnails, full-screen view, buttons to switch to the group's other subgroups, and a link to the next one.
- `/availability` — month calendar. Open days are black; booked days are struck through. Clicking an open day shows a short form: **type of event**, **how many hours**, name, email, optional phone and message. The request is saved and emailed to the photographer, with Reply-To set to the customer so she just hits "Reply".

**Admin (`/admin`, password protected)**
- **Portfolio** — three levels: **groups → subgroups → photos**.
  - *Portfolio*: create groups and drag them into order.
  - *A group*: rename/describe it, create subgroups and drag them into order, and pick the **group cover** from any photo in any of its subgroups (cover picker at the bottom).
  - *A subgroup*: rename/describe it, upload many photos at once, drag them into carousel order, set **★ Group cover** or **Subgroup cover** on any photo, move a photo to another subgroup (any group), or delete.
  - Empty groups and subgroups are completely hidden from visitors (not listed, not counted, and direct links show "not found"). Photos uploaded before subgroups existed were moved into a subgroup named after their group.
- **Saving:** edits are *not* saved automatically. Names, descriptions, captions, the order of groups/subgroups/photos, cover choices, calendar days and settings are kept as a draft until **Save changes** is clicked in the bar at the bottom of the screen (or Ctrl+S / Cmd+S). **Discard** throws the draft away. Leaving the page, switching tabs, logging out or closing the browser with unsaved changes asks for confirmation first.
  - These happen immediately, because each is a one-off action with its own button: uploading photos, deleting, moving a photo to another subgroup, creating a group/subgroup, and changing a booking request's status.
- **Calendar** — pick *Available / Booked / Unavailable* and click days. Quick buttons: open all weekends, weekdays, every day, or clear the month.
- **Requests** — every booking request, with status (new / replied / confirmed / declined) and a "Reply by email" button. Marking a request **confirmed** blocks that day on the calendar.
- **Settings** — name, tagline, About text, Instagram handle and the list of event types customers can pick.

## Photo protection (portfolio)

- **Watermark:** every portfolio photo is published as a reduced copy (max 2200 px) with a light, repeating diagonal "© <your name>" watermark, and with camera/GPS metadata removed. The name comes from Admin → Settings at the time of upload.
- **Originals stay private:** the uploaded original is moved to `server/private/portfolio/` and is never reachable from the web. Photos uploaded before this feature were converted automatically the first time the server started.
- **Copy protection** on the public pages: right-click on photos, dragging photos out, long-press "save image" on phones, Ctrl/Cmd+S and printing are blocked. Text can still be selected and right-clicked. (No website can prevent screenshots — that's what the watermark is for.)

## Client area (photo selection & delivery)

A private area per client at **`/client`** (linked in the site footer as "Client area").

**Photographer (Admin → Clients)**
1. **Create the client:** name, email, login, how many photos they may choose, and how many days they have.
2. **Upload the photos to choose from** (JPG/PNG/WEBP/TIFF, up to 80 MB each, uploaded in batches). Clients only ever receive *reduced copies with a watermark*; full-size proofs are not stored.
3. **Send access:** the system creates an 8-character password (letters, numbers and a special character), starts the selection period and emails the client their login, password and the link. The password is shown once on screen and stored only as a secure hash — "Create a new password and email it" makes a new one.
4. Follow progress: chosen photos are marked; download the list of chosen file names (.txt) or copy them. You also get an email with the list when the client confirms.
5. **Extend:** while the client is still choosing, add days at any time. If the access already expired, the new period starts now and the client can log in again (optionally emails the new deadline).
6. **Finished photos:** upload the edited files, then click **Email: your photos are ready**. (Sending this also ends the selection phase if the client never confirmed.)

**Client**
- Logs in, taps ♡ on up to the allowed number of photos (large view available), then **Confirm selection**. After confirming the selection is locked (also enforced by the server). Only the photographer can reopen it.
- Right-click, dragging images, long-press saving, Ctrl/Cmd+S and printing are blocked on the client pages. No website can block screenshots, which is why proofs are watermarked and reduced.
- When the photos are delivered: views them and downloads everything as a **.zip** of the original files.

**Automatic rules**
- While choosing: login is blocked once the period ends (and photos can no longer be opened). If the client hasn't confirmed, a reminder email is sent when **2 days** are left, warning that access will be blocked.
- **Once the selection is confirmed the deadline is switched off** — the client's access is never revoked from then on (no reminders either). If the photographer reopens the selection, a new deadline applies until the client confirms again.
- **The client's first .zip download starts a 6-month retention period.** When it ends, all their photos are deleted automatically and the login is blocked; the client record (name, contact, event, payment) and the contract are kept. The client and the admin both see the deletion date.
- The server checks every 30 minutes, so it must be running (PM2 keeps it running).

**Configuration** (`server/.env`): set `SITE_URL` to the public address of the site (used for the links in emails), e.g. `SITE_URL=https://anafotografia.com.br`; in development `http://localhost:5173`. Emails need the `SMTP_*` settings — without them nothing is sent (the email is printed in the server console) and the admin shows the login details so you can share them yourself.

Files are stored in `server/private/` (never served directly — only through short-lived signed links). Back it up together with `server/data` and `server/uploads`.

## Finance (Financeiro)

- On each client page, **Evento e pagamento** stores the event, event date, duration, payment method, amount paid and
  number of installments; **Contrato** holds one PDF (max 25 MB, kept in `server/private/clients/<id>/contract.pdf`).
- `/admin/finance` shows revenue per month (by **event date**), the breakdown of a chosen month (payment, contract
  download, event, duration, amount per hour) and exports the month to `.xlsx` (sheet with formulas + a 12-month summary).
- Demo data for testing: `npm run demo:finance --prefix server` creates ~28 fictitious clients (logins `demo-…`,
  e-mails `@exemplo.com`, no e-mails are sent); `npm run demo:finance:remove --prefix server` deletes them again.
- When a client's retention period ends, only the **photos** are deleted and the login is blocked; the client becomes
  **Arquivado** and keeps name, contact, event, payment data and contract (still shown in Financeiro). "Excluir cliente
  definitivamente" on the client page removes everything.

## Traffic (Tráfego)

- The public site counts visits (a visit ends after 30 min without activity) and page views; the photographer is not
  counted while logged in to the admin, and automated browsers/bots are ignored.
- A small banner asks visitors (once per browser) whether the site may use their **approximate location**. If they allow,
  the browser's position is rounded (~10 km) and turned into a city **on the server, offline** (package `all-the-cities`,
  GeoNames data — no external service is called). Coordinates and IP addresses are never stored. If they refuse or ignore
  the banner, the visit shows as "Não permitiu rastreamento".
- Browsers only allow location on **HTTPS** sites (or localhost) — without HTTPS every visit appears without a city.
- `/admin/traffic`: visits per month (12-month chart), month picker, totals, visits per location and the latest visits.
  Visits older than 24 months are deleted automatically.
- Demo data: `npm run demo:traffic --prefix server` / `npm run demo:traffic:remove --prefix server`.

## Demo portfolio

`npm run demo:portfolio --prefix server` creates 8–10 groups (Casamentos, Gestantes, Família, Formaturas…), each with
3–5 subgroups of 8–10 photos. Photos are downloaded from picsum.photos (free Unsplash images, same images every run)
and go through the normal upload pipeline (watermark + private original). Without internet (or if downloads fail 3 times)
it switches to generated soft-colour images; force that with `-- --offline`. Takes a few minutes.
`npm run demo:portfolio:remove --prefix server` deletes only the demo groups and their photos.

Photo sources are tried in order: picsum.photos, then loremflickr.com (Creative Commons photos from Flickr, matched to
each theme). A source that fails is skipped; if none answers, generated images are used. If your server can't reach
either, upload 10–80 of your own photos in **Configurações → Ferramentas → Minhas fotos para a demonstração** and use
**Criar com minhas fotos** (`npm run demo:portfolio --prefix server -- --from-uploads`). They are stored in
`server/private/demo-source/` (never served) and reused across all demo subgroups.

## Clear photos and clients

`npm run clear:data --prefix server` shows what would be deleted; `npm run clear:data --prefix server -- --yes` deletes
**all portfolio groups/subgroups/photos and all clients** (including demo clients, payments, contracts and client-area photos).
Add `--keep-demo` to keep the demo clients. Settings, categories, calendar days, booking requests and traffic are kept.

## Watermark fonts

Watermarks are drawn with the DejaVu Sans fonts bundled in `server/fonts/` (`server/fonts.js` points fontconfig at them),
so they work even on a minimal Ubuntu server with no fonts installed. Photos stamped before this fix (the text shows as
little boxes) can be redone from their private originals with **Configurações → Ferramentas → Refazer marcas d’água**
or `npm run rewatermark --prefix server`. Client-area proofs don't keep an original, so re-upload those if needed.

## Starting over (clear content)

`npm run reset:content --prefix server` shows what would be deleted; add ` -- --yes` to delete for real: all portfolio
photos, groups and subgroups, every client created by hand (photos, payment data, contract) and all client-area photos.
Demo clients (`demo-…`), settings, categories, calendar and booking requests are kept. Stop `npm run dev` first.

## Run it

Requires **Node.js 24** (see `.nvmrc`). Target server: **Ubuntu 26.04 LTS**.

```bash
npm run install:all          # installs root, server and client packages
# edit server/.env  → set ADMIN_PASSWORD, TOKEN_SECRET, PHOTOGRAPHER_EMAIL, SMTP_*
npm run dev                  # site on http://localhost:5173, API on :4000
```

Production (one process serves both API and site):

```bash
npm run build
npm start                    # http://localhost:4000
```

## Email

Fill the `SMTP_*` values in `server/.env`. With Gmail: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER` = the Gmail address and `SMTP_PASS` = an **App Password** (Google Account → Security → App passwords).
If SMTP is not set, requests are still saved and visible in Admin → Requests; the email is printed in the server console.

## Deploying on Ubuntu 26.04 with PM2

Copy the project to the server (without `node_modules`), then from the project folder:

```bash
bash scripts/install-pm2.sh   # once per server (Ubuntu 26.04): Node.js 24, PM2, start-on-boot, log rotation
nano server/.env              # set passwords, email and SMTP
bash scripts/deploy-pm2.sh    # installs, builds and starts the site — run again after every update
```

Run both as your normal user (not root); the scripts use `sudo` where needed. `install-pm2.sh` installs Node.js 24 from NodeSource (pinned over Ubuntu's own `nodejs` package). `deploy-pm2.sh` refuses to run on Node < 24 and reinstalls `server/node_modules` automatically if it was copied from Windows or built for another Node version. If the site can't be reached, run `bash scripts/diagnose.sh` on the server: it checks Node, PM2, the app logs, the port, the firewall and prints the addresses to try. Useful commands: `pm2 status`, `pm2 logs photo-portfolio`, `pm2 restart photo-portfolio`.

## Automatic deploy with GitHub Actions

Every push to `main` runs `.github/workflows/deploy.yml`: it copies the code to the server with rsync over SSH
(never touching `server/.env`, the database, photos, contracts, logs or `node_modules`) and runs
`scripts/deploy-pm2.sh` there. A red ✗ on the commit in GitHub means the deploy failed — open the run to see why.

One-time setup:
0. Move `scripts/github-deploy.yml` to `.github/workflows/deploy.yml` (create the folders).
1. Put this folder in a **private** GitHub repository (GitHub Desktop → Add local repository → Publish, keep "private").
2. On the server, from the project folder: `bash scripts/setup-deploy-key.sh` — installs rsync, creates a deploy-only
   SSH key and prints the values for the secrets.
3. In GitHub → Settings → Secrets and variables → Actions, create `OCI_HOST`, `OCI_USER`, `OCI_PATH`,
   `OCI_SSH_KEY`, `OCI_KNOWN_HOSTS` (and `OCI_PORT` if SSH is not on 22).
4. GitHub → Actions → Deploy → Run workflow (or just push) to test.

The server's SSH port must accept connections from the internet (OCI security list), since GitHub's runners connect from varying addresses.

## Deploying elsewhere

Any host that runs Node and keeps files on disk works (a VPS, Render/Railway with a persistent disk, etc.). Keep `server/data/` and `server/uploads/` on persistent storage and back them up. Put it behind HTTPS.

## API reference

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/login` | – | `{password}` → `{token}` |
| GET | `/api/groups` | – | Groups with photos, in order (`?all=1` includes empty ones) |
| GET | `/api/groups/:id` | – | One group and its subgroups (`?all=1` empty ones too, `?photos=1` with photos; `:id` may be `12`, `12-name` or the slug) |
| POST | `/api/groups` | admin | `{name, description}` create |
| PATCH | `/api/groups/:id` | admin | `{name?, description?, coverPhotoId?}` — cover can be any photo in the group's subgroups |
| DELETE | `/api/groups/:id` | admin | Deletes the group and its photos |
| PUT | `/api/groups/order` | admin | `{ids:[...]}` group order |
| POST | `/api/groups/:id/subgroups` | admin | `{name, description}` create a subgroup |
| PUT | `/api/groups/:id/subgroups/order` | admin | `{ids:[...]}` subgroup order |
| GET | `/api/subgroups/:id` | – | Subgroup, its photos, its group and sibling subgroups |
| PATCH | `/api/subgroups/:id` | admin | `{name?, description?, coverPhotoId?}` |
| DELETE | `/api/subgroups/:id` | admin | Deletes the subgroup and its photos |
| POST | `/api/subgroups/:id/photos` | admin | Multipart field `photos` (up to 100 files) |
| PUT | `/api/subgroups/:id/photos/order` | admin | `{ids:[...]}` photo order |
| PATCH / DELETE | `/api/photos/:id` | admin | `{title?, subgroupId?}` caption / move — or delete |
| GET | `/api/availability?from&to` | – | Open and booked days |
| PUT | `/api/availability` | admin | `{dates:[...], status:'available'\|'booked'\|'closed'}` |
| POST | `/api/inquiries` | – | Booking request (rate limited) |
| GET / PATCH / DELETE | `/api/inquiries[/:id]` | admin | Manage requests |
| GET / PUT | `/api/settings` | – / admin | Site texts and event types |
| GET / POST | `/api/admin/clients` | admin | List / create clients |
| GET / PATCH / DELETE | `/api/admin/clients/:id` | admin | Client detail (with photos) / edit / delete |
| POST | `/api/admin/clients/:id/send-access` | admin | New password + access email (first time starts the period) |
| POST | `/api/admin/clients/:id/extend` | admin | `{days, notify}` (only before the selection is confirmed) |
| POST | `/api/admin/clients/:id/photos?kind=proof\|done` | admin | Multipart `photos` (≤30 per request) |
| DELETE | `/api/admin/clients/:id/photos/:pid` | admin | Delete a client photo |
| POST | `/api/admin/clients/:id/notify-done` | admin | "Photos are ready" email (ends the selection phase) |
| POST | `/api/admin/clients/:id/reopen` | admin | `{days}` let the client change a confirmed selection (deadline applies again) |
| GET | `/api/admin/clients/:id/selection.txt` | admin | Chosen file names |
| POST | `/api/client/login` | – | `{username, password}` (blocked after the deadline) |
| GET | `/api/client/me` | client | Photos, selection, deadline, finished photos |
| PUT | `/api/client/photos/:id/select` | client | `{selected}` (limit enforced, locked after confirm) |
| POST | `/api/client/confirm` | client | Lock the selection |
| GET | `/api/client/download` | signed link | All finished photos as .zip (first download starts the 6-month retention) |
| GET | `/api/media/:id/:variant` | signed link | Private photo files |
