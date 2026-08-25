# Installing a branch till

A runbook for putting the Bookshop on a Windows laptop at a branch. Every step
here has been done on real hardware; the traps at the bottom are ones that were
actually hit, not hypothetical.

Repeat this whole document once per branch. The only thing that differs between
branches is the **sync token** in step 5.

---

## What a branch till is

The laptop runs the whole system against its **own local SQLite database**, so it
keeps selling when the internet is down. A sync runner reconciles with the cloud
whenever it can: sales, stock movements, expenses and trading documents go up;
products, prices, users, branches and a stock snapshot come down.

It is not a thin client. If the cloud is unreachable the till carries on, and
nothing is lost — it queues in an outbox until the connection returns.

**Payroll and M-Pesa do not run on a branch.** Payroll is head-office work, and
M-Pesa needs a connection anyway.

---

## Before you start

| | |
|---|---|
| **Node 24 LTS** | https://nodejs.org — **not** Node 20, which is end of life |
| **Git** | https://git-scm.com |
| A browser | Chrome or Edge, for kiosk mode |
| Cloud admin login | to mint the branch's token |

NSSM is fetched automatically at step 7.

Do not run these steps on a development machine — see
[Do not run setup-branch.ps1 on a dev machine](#do-not-run-setup-branchps1-on-a-dev-machine).

---

## 1. Allow PowerShell to run scripts

A fresh Windows install refuses to run unsigned `.ps1` files, so the first
script fails with *"running scripts is disabled on this system"*.

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

Answer `Y`. `RemoteSigned` still blocks unsigned scripts downloaded from the
internet, which is why it is preferred over `Bypass`.

## 2. Get the code

```powershell
git clone https://github.com/mwangudi/booklab.git C:\booklab
cd C:\booklab
git checkout develop
```

## 3. Create the configuration

```powershell
Copy-Item C:\booklab\branch\.env.branch.example C:\booklab\backend\.env
notepad C:\booklab\backend\.env
```

Set these four. The rest of the file can stay as it is.

| Setting | Value |
|---|---|
| `HOST` | `127.0.0.1` — **without this the till answers to every device on the shop wifi** |
| `CLOUD_URL` | `https://booklab.localinvestors.co.ke` |
| `SYNC_TOKEN` | filled in at step 5 |
| `JWT_SECRET` | a long random string, **different on every laptop and different from the cloud** |

A quick way to generate the secret:

```powershell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Max 256 }))
```

## 4. Build

```powershell
cd C:\booklab\branch
.\setup-branch.ps1
```

Installs dependencies, generates the SQLite client, creates `branch.db` and
builds both the API and the web app. First run takes a few minutes.

## 5. Mint this branch's sync token

On the cloud, signed in as an admin:

**Administration → Branch sync → Issue token**

Choose the branch, and name the machine something you will recognise later
("Kapsabet front till"). Copy the token straight into `backend\.env`:

```
SYNC_TOKEN="<the token>"
```

**The token is shown once and never again.** If you lose it, revoke it and issue
another — that is safer than hunting for it.

Tokens are per branch. A Kapsabet token cannot read or write Mumias data.

## 6. Prove it works before making it permanent

```powershell
cd C:\booklab\branch
.\run-branch.ps1
```

Open `http://127.0.0.1:4000` and sign in with a cloud account.

Check all four before continuing:

- the log says `Server listening at http://127.0.0.1:4000` — **not** `0.0.0.0`
- you can sign in
- **the stock figures are not zero** — a fresh branch showing zero stock is the
  single worst failure this system has had; it means the pull did not happen
- products and prices look right

If stock is zero, stop and fix the token or the connection. Do not install the
services on top of a broken install.

Stop it with `Ctrl+C`.

## 7. Install the services

Open an **elevated** PowerShell — services need administrator rights.

```powershell
cd C:\booklab\branch
.\install-services.ps1
```

If NSSM is missing it is downloaded from nssm.cc, placed in `C:\tools` and added
to the PATH automatically. The script prints the download's SHA256 so you can
compare it against the site if you want that assurance.

You should see both services reach `Running`:

```
  BookshopBranchApi    Running
  BookshopBranchSync   Running
```

They now start with Windows. Logs are in `C:\booklab\backend\logs\`.

## 8. Set up the till browser

Create a desktop shortcut in kiosk mode:

```
"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk http://127.0.0.1:4000
```

Then set the laptop to never sleep, and to sign the till user in automatically
if it lives behind the counter.

---

## Updating a branch later

**Data looks after itself.** New products, price changes, new staff and stock
figures all reach the till through the sync runner without anyone touching it.
Only a *code* change needs the steps below.

```powershell
cd C:\booklab\branch
.\update-branch.ps1 -Check     # is there anything to update? changes nothing
.\update-branch.ps1            # elevated: pull, rebuild, restart, verify
```

The updater stops the services so nothing writes mid-update, backs up
`branch.db`, pulls, reinstalls dependencies only if the lock files moved,
rebuilds the schema and both applications, restarts, and then checks the till
actually answers on `/health`. If it does not — or a service fails to start — it
puts the previous commit and database back and restarts. It keeps the last five
database backups.

To have it run by itself, once, elevated:

```powershell
.\update-branch.ps1 -Schedule
```

That registers a nightly task at **03:20** — after closing, well before opening,
so a bad update rolls itself back with nobody trading. Scheduling is opt-in on
purpose: an unattended rebuild that fails at 8am is a till that cannot sell.
Leaving it manual and running `-Check` when you want is a perfectly reasonable
choice for one or two branches.

If a code update ever needs a database change, the updater handles it — the
manual equivalent is:

```powershell
$env:BRANCH_BUILD='1'; node scripts/gen-sqlite-schema.mjs
npx prisma db push --schema prisma/schema.sqlite.prisma --skip-generate
```

---

## If a laptop is lost or replaced

Revoke its token: **Administration → Branch sync → Revoke**. That machine stops
syncing immediately.

Anything it had not yet sent stays stranded on it until a new token is issued,
so revoke *and* re-issue if the laptop is being replaced rather than binned.

---

## Traps

### "running scripts is disabled on this system"
Step 1. If it persists, the files carry the internet download mark:
`Get-ChildItem C:\booklab -Recurse -Filter *.ps1 | Unblock-File`

### `nssm : Can't open service!`
Fixed — `git pull`. The installer used to ask NSSM whether a service existed,
but NSSM writes to stderr when it does not, and PowerShell turns native stderr
into a terminating error. Update and re-run.

### `install-services.ps1` exits saying it needs elevation
Right-click PowerShell → **Run as administrator**. A normal terminal cannot
create services.

### The till is reachable from other machines on the network
`HOST=127.0.0.1` is missing from `backend\.env`, or the backend was not rebuilt
after adding it. Set it, `npm run build` in `backend\`, restart the services.

### Stock shows zero everywhere
The master pull has not run. Check `SYNC_TOKEN` is set and not revoked, that
`CLOUD_URL` is right, and that the laptop can reach the cloud. Look in
`backend\logs\BookshopBranchSync.err.log`.

### Sales are not reaching the cloud
Look at the outbox: `node backend\scripts\branch-outbox.mjs`. A queue that never
drains usually means a revoked or wrong token.

### Do not run setup-branch.ps1 on a dev machine
It sets `BRANCH_BUILD=1`, which **overwrites `@prisma/client` with the SQLite
client**. On a development machine that breaks all work against the cloud MySQL
database until you run `npx prisma generate` in `backend\` to put it back.

### A phone or tablet cannot sell offline until it has connected once
The catalogue is cached on first load. Open the app once on the shop wifi before
relying on it away from a connection.

---

## Related

- [OFFLINE-SYNC.md](OFFLINE-SYNC.md) — how sync actually works, and its limits
- [GO-LIVE.md](GO-LIVE.md) — what must be true before real trading
- [DEPLOY.md](DEPLOY.md) — the cloud side
