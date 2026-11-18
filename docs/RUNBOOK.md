# Change runbook: from request to production

How a change to Booklab goes from the PM's request to the live system at
https://www.booklabbookshop.co.ke. Follow the steps in order; each one has a check
that must pass before moving on. Commands are for macOS (zsh) on the developer
machine unless they say "on the droplet".

Related: [DEPLOY.md](DEPLOY.md) (first-time server setup), [GO-LIVE.md](GO-LIVE.md),
[OFFLINE-SYNC.md](OFFLINE-SYNC.md) (branch laptops), [SETUP.md](SETUP.md) (local setup).

## At a glance

| # | Step | Done when |
|---|------|-----------|
| 1 | Understand the request | Ambiguities resolved with the PM; impact on existing data known |
| 2 | Build on `develop`, run locally | Both apps type-check; feature works at http://localhost:5173 |
| 3 | Test | Scripted API checks pass; screens checked in a browser; regressions re-run |
| 4 | Independent audit | A second reviewer (a Sonnet agent) has read the diff; real findings fixed and re-tested |
| 5 | Commit and push | `develop` and the feature branch on GitHub; CHANGELOG updated |
| 6 | Pre-deploy checks | Server copies unchanged since last deploy; database + files backed up; migration pre-checks pass |
| 7 | Deploy | Changed files copied; `redeploy.sh` run; migration applied |
| 8 | Verify | API up, no errors in the log, new build served, data looks right |
| 9 | Tell the PM | What changed, what to refresh, anything they must do |

Nothing reaches production without steps 4 and 6.

## 1. Understand the request

- Restate the request and check it against the code before building. Ask the PM when a
  choice changes what gets built. Examples from past changes:
  - "Remove numbering": was it the row `#` column or the invoice number?
  - "HOI on the invoice": a code bug, or data in the customer record?
  - Invoice number format: three options with their trade-offs were offered.
- For anything touching production data, read it first, read-only. An example is
  renumbering an invoice or adding a unique index. Use the read-only queries in step 6.
- Note what must not change: printed documents already given out, issued numbers, and
  stock and sales history.

## 2. Build and run locally

Local setup (once): MySQL from XAMPP (`root`, no password), database `bookshop`,
`backend/.env` from `.env.example` with a random `JWT_SECRET`
(`openssl rand -hex 32`). Seed with `SEED_ADMIN_PASSWORD=… SEED_CASHIER_PASSWORD=…
npm run seed`. Passwords never go in the repo.

```bash
git checkout develop && git pull --ff-only
cd backend  && npx prisma migrate deploy && npm run dev     # API on :4000
cd frontend && npx vite --port 5173 --strictPort            # app on :5173
```

- Schema change: edit `backend/prisma/schema.prisma` and add a migration folder
  `backend/prisma/migrations/<YYYYMMDDHHMMSS>_<name>/migration.sql`.
  - If it backfills or constrains existing rows, write the SQL so it is safe on
    production data, e.g. backfill before adding a unique index.
  - Then run `npx prisma migrate deploy && npx prisma generate`, and restart the API.
- Branch laptops run the same schema on SQLite (`npm run branch:schema`). A new nullable
  column or unique index is fine there. Anything else, check
  `backend/scripts/gen-sqlite-schema.mjs`.
- Type-check both apps, and fix everything before testing:
  ```bash
  (cd backend && npx tsc -p tsconfig.json --noEmit) && (cd frontend && npx tsc -p tsconfig.json --noEmit)
  ```
- For realistic local data, load the real catalogue from `docs/catalogue-import-*.csv`
  through `POST /api/books/import` (admin). Spread stock with `POST /api/stock/grid`.
  Back up the local database first:
  `mysqldump -uroot bookshop | gzip > before.sql.gz`.

## 3. Test

- **API:** a small Node script per feature against http://localhost:4000. Log in as
  `admin` (and a cashier for permission checks) and print PASS/FAIL per check.
  - Cover the happy path.
  - Cover each guard: wrong role → 403, bad input → 400, not found → 404.
  - Cover races where relevant, e.g. 10 simultaneous saves must give 10 different numbers.
  - Cover data integrity: stock counts, movements, audit rows.
  - The script must put back any stock it changed.
- **Screens:** check in a browser, or headless Chrome over the DevTools protocol, and
  screenshot.
  - Drive the real UI: pick the item, type, save.
  - Headless `--virtual-time-budget` screenshots can miss network images and CSS
    transitions. Trust a DevTools-protocol check (`img.complete && naturalWidth`) over
    a blank screenshot.
- **Printed documents:** generate the PDF and read it.
- **Regressions:** re-run the earlier scripts for areas the change touches. For invoices:
  create → issue → deliver → add after delivery → paid; numbering; delivery-note races.
- Check the database directly when the API cannot show it, e.g. audit-log rows.

## 4. Independent audit

Before committing, a second reviewer reads the change. We use a Sonnet agent in
Claude Code, read-only.

- Give it:
  - the diff (`git diff` plus untracked files)
  - the intended behaviour, in plain terms
  - what to look for: correctness, regressions, permissions, data integrity, races,
    branch sync, migrations, and UI states that lose data
- Do **not** give it your own test conclusions, so its review is not anchored on them.
- It must not modify files, touch databases or start servers. It may run `tsc`.
- It reports findings, most severe first, each marked CONFIRMED or PLAUSIBLE.

For each finding:
- **Real** → fix it, then re-run the affected tests and the regressions.
- **Intended** (e.g. the PM asked for it) → note why and leave it.
- **Low value** → note it and leave it.

Record the outcome in the commit message: "Audit fixes: …".

Past catches worth remembering:
- An "Add stock" retry could double-receive stock, because deltas are not idempotent.
- `$` in a find & replace string was treated as a regex pattern.
- Delivery-note numbers could collide under a single company-wide series.

## 5. Commit and push

- Add a CHANGELOG entry at the top, dated, in plain language for the PM. Say what
  changed and any migration name.
- Commit on `develop`. Author is `Admin <mwangudi@gmail.com>`, the same as the pharma
  app. End the message with the co-author line if an AI assistant helped.
- Push `develop`, and the feature branch if one is in use:
  ```bash
  git push origin develop
  git push origin develop:feature/invoice-stock-editable-cost
  ```
- List what will be deployed: `git diff --name-only <last-deployed-commit> develop`.
  - The last deployed commit is in the newest CHANGELOG entry that was released, or in
    the deploy note.
  - `CHANGELOG.md` is not on the droplet; leave it out of the file list.

## 6. Pre-deploy checks

The droplet is `root@46.101.6.131`, reached with `ssh -i ~/.ssh/id_ed255_new -o IdentitiesOnly=yes`.
It is shared with PharmaCare and BrokerKnow; be careful with anything outside
`/var/www/booklab`.

`/var/www/booklab` is **not a git checkout**. Code is copied as files, and files on the
server may have Windows (CRLF) line endings. In zsh, write SSH options out in full on
each command: a variable holding them is not split into separate arguments, and every
call then fails as if the file differed.

1. **No drift.** Each file about to be replaced must still match the last deployed
   commit, compared with CR stripped:
   ```bash
   for f in <files>; do
     l=$(git show <last-deployed>:$f | tr -d '\r' | md5 -q)
     r=$(ssh -o BatchMode=yes -o IdentitiesOnly=yes -i ~/.ssh/id_ed255_new root@46.101.6.131 \
          "tr -d '\r' < /var/www/booklab/$f | md5sum | cut -d' ' -f1")
     echo "$f $([ -n "$r" ] && [ "$l" = "$r" ] && echo match || echo DIFFERS)"
   done
   ```
   A mismatch means someone changed the server, or an earlier deploy skipped the file.
   Find out which before overwriting.

   For a long list, loop over a file with `while read f; …; done < files.txt`. In that
   case use **`ssh -n`**: without it ssh swallows the rest of the list, and only the
   first file is checked. Always confirm the count checked matches the count expected.
2. **Back up** the database (nightly script, run now) and the files being replaced:
   ```bash
   # on the droplet
   /usr/local/bin/booklab-backup.sh | tee -a /var/log/booklab-backup.log
   cd /var/www/booklab && tar -czf /root/backups/booklab-code-pre-<commit>-$(date +%Y%m%d-%H%M%S).tgz <files>
   ```
3. **Migration pre-checks**, read-only, on the droplet. Credentials are in
   `/root/.booklab-backup.cnf`; never put the password on a command line.
   For a unique index, confirm there are no duplicates first:
   ```bash
   mysql --defaults-extra-file=/root/.booklab-backup.cnf booklab -e \
     "select col, count(*) from T where col is not null group by col having count(*) > 1"
   ```

## 7. Deploy

Copy only the changed files, from a clean export of `develop`, so nothing local or
uncommitted ships:

```bash
rm -rf /tmp/release && mkdir -p /tmp/release && git archive develop | tar -x -C /tmp/release
printf '%s\n' <files> > /tmp/files.txt          # one path per line; no CHANGELOG.md
cd /tmp/release && rsync -c --itemize-changes --files-from=/tmp/files.txt \
  -e "ssh -o BatchMode=yes -o IdentitiesOnly=yes -i $HOME/.ssh/id_ed255_new" ./ root@46.101.6.131:/var/www/booklab/
```

Then on the droplet:
- **Backend or schema changed:** `cd /var/www/booklab && bash deploy/redeploy.sh`. It
  runs install, `prisma generate`, `prisma migrate deploy`, both builds, chown, restarts
  `booklab-api` and reloads nginx.
- **Frontend only:**
  `cd /var/www/booklab/frontend && npm run build && chown -R www-data:www-data /var/www/booklab/frontend`.
  The API is not restarted.

## 8. Verify

```bash
# on the droplet
systemctl is-active booklab-api nginx
journalctl -u booklab-api --since '-3 min' --no-pager | grep -iE 'error|fail'      # expect nothing
mysql --defaults-extra-file=/root/.booklab-backup.cnf booklab -N \
  -e "select migration_name from _prisma_migrations order by started_at desc limit 1"
grep -o 'index-[A-Za-z0-9_-]*\.js' /var/www/booklab/frontend/dist/index.html

# from anywhere
curl -s https://www.booklabbookshop.co.ke/ | grep -o 'index-[A-Za-z0-9_-]*\.js'    # same bundle as above
curl -s -o /dev/null -w '%{http_code}\n' https://www.booklabbookshop.co.ke/api/invoices   # 401 = API up
```

- `/health` is not proxied publicly; use an `/api/...` call that answers 401.
- Grep the served bundle for a string unique to the new feature.
- For data changes, read back the affected rows, e.g. existing invoice numbers
  unchanged and the new index present.

## 9. Tell the PM

- **What is live:** in their words, not the code's.
- **Refresh:** the installed app updates only after they tap the update prompt
  (`registerType: 'prompt'`, so a till never reloads mid-sale). Browsers need a refresh.
- **Anything they must do:** e.g. reprint an invoice whose number changed.
- **Not yet done:** e.g. branch laptops updated with `branch/update-branch.ps1`, which
  must happen **after** the cloud.

## Rollback

- **Code:** on the droplet, restore the pre-deploy tarball over `/var/www/booklab`, then
  run `bash deploy/redeploy.sh`.
- **Database:**
  - An additive migration (new nullable column or index) can stay after a code rollback,
    because older code ignores it.
  - Restore the pre-deploy dump only if data is wrong, and only after confirming with
    the owner: it discards anything recorded since.
  ```bash
  gunzip -c /root/backups/nightly/booklab-<stamp>.sql.gz | mysql --defaults-extra-file=/root/.booklab-backup.cnf booklab
  ```

## Direct data fixes on production

Example: renaming `INV-LUA-0002` to `INV-2026-0001`. Avoid these where the app can do
it; when needed:

1. Read the affected rows and everything that references them (payments, stock movement
   notes, audit), read-only.
2. Back up, as in step 6.
3. Run one transaction with guards, so it only applies if the data is still as read.
   Insert an `AuditLog` row with the from/to values and the reason.
4. Read the rows back. Tell the PM what changed and what to reprint.

## Standing facts

- **Nightly backup:** `/etc/cron.d/booklab-backup`, 02:30 Kenya time, into
  `/root/backups/nightly/`, kept 30 days, log `/var/log/booklab-backup.log`. The restore
  has been tested.
- **Off-droplet copy:** not set up yet. This is still a go-live blocker.
- **Branch laptops** take code changes with `branch/update-branch.ps1`, after the cloud.
  Older laptops keep syncing; ingest tolerates fields they do not send yet.
- **Document numbers:**
  - Invoices and delivery notes: `INV-YYYY-NNNN` and `DN-YYYY-NNNN`.
  - On a branch laptop: `INV-YYYY-<BRANCH>-NNNN`.
  - Goods receipts: `GRN-<BRANCH>-NNNN`.
  - Invoice pages are addressed by a short code: `/invoices/XR56LK`.
