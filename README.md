# Richfield EDT900 Game Simulations

Emerging & Disruptive Technology 900 (EDT900) game simulation platform: three
boardroom-style simulations with student accounts, server-scored AfriCOIN and a
lecturer score monitor. Styled in the Richfield poster look (cream dotted
canvas, gold and charcoal, Montserrat).

| Page | What it is |
| --- | --- |
| `index.html` | Module landing poster: the three simulations, how they run and the "Play the simulations" panel |
| `game.html` | The three simulations, one account for all of them |
| `login.html` | Student sign in |
| `register.html` | Student registration |
| `admin.html` | Score monitor: every student, their AfriCOIN and each problem they answered |

## The three simulations

| Simulation | Content file in `assets/data/` | Structure | Maximum |
| --- | --- | --- | --- |
| Simulation 0 - AI Detective | `EDT900_Simulation_0_AI_Detective.json` | 3 stages x 5 problems | 300 AfriCOIN |
| Simulation 1 - Gauteng Smart Supply Challenge | `EDT900_Major_Simulation_1_Gauteng_Smart_Supply.json` | 3 levels x 3 problems | 180 AfriCOIN |
| Simulation 2 - Africa 2035 Boardroom Challenge | `EDT900_Major_Simulation_2_Africa_2035_Boardroom.json` | 3 levels x 3 problems | 180 AfriCOIN |

**660 AfriCOIN** are available per student. The scoring follows the published
content exactly:

- Simulation 0: Stage 1 = 10, Stage 2 = 20, Stage 3 = 30 AfriCOIN per correct problem
- Simulations 1 and 2: Level 1 = 10, Level 2 = 20, Level 3 = 30 AfriCOIN per correct problem
- Stage and level badges unlock on the rule written in each file (4 of 5 problems
  for Simulation 0, 2 of 3 problems for the two major simulations)
- Every problem ends with detailed feedback: why the answer is best, the teaching
  point, the plot twist (where the file has one), the SDG link, the ethics flash
  and the fun line

The JSON files are the single source of truth: the browser renders each
simulation from them and the server re-scores every answer from them, so the
AfriCOIN stored against an account cannot be faked from the browser console.

## Administrators (already created)

The admin logins are stored in **`data/admins.json`** - open the file and edit
them whenever you like, or add more entries to the list.

| Username | Password | Name |
| --- | --- | --- |
| `admin` | `EDT900@2026` | Richfield EDT900 Administrator |
| `mbofhenijunior7@gmail.com` | `GRIT@2026` | Makhavhu MJ |

Sign in at `admin.html` with either username (or the email address). The seeded
list also lives in `lib/admin-seed.mjs`, which is what fills the file on the
first run and what seeds the hosted store when the site is deployed.

Changing a password from the score monitor replaces the readable `password`
field in the file with a `passwordHash`, so once the site is live only the hash
is stored.

## The JSON database (no database server needed)

```bash
npm install
npm start            # = node server.mjs  →  http://localhost:5500
```

| File | Contents |
| --- | --- |
| `data/users.json` | Every student account, with the AfriCOIN they earned problem by problem |
| `data/admins.json` | The admin logins (above) |
| `data/sessions.json` | Active sign-in sessions (ignored by git) |
| `data/runtime.json` | Failed-login counters (ignored by git) |

Register on the site and open `data/users.json` - the student and their AfriCOIN
appear there immediately. Deleting a student from the file removes their
account. The server binds to `0.0.0.0`, so phones on the same Wi-Fi can join the
session through `http://<your-laptop-ip>:5500`.

### Working without the server

Every page also runs **without** the game server: if `/api` cannot be reached
(for example opening the site from a static host, or a Vercel preview before the
hosted store is connected) the pages automatically switch to the browser
database in `assets/js/local-db.js`, which keeps accounts and AfriCOIN in
`localStorage` for that one browser. A small gold note at the top of each page
says which mode is active, and the score monitor then lists the students saved
in that browser (with CSV export). Run `node server.mjs` whenever you want the
shared JSON database.

## AfriCOIN and attempts

For every student the server keeps one record per problem:

- `points` - the best AfriCOIN that student reached for that problem
- `maximum` - what the problem is worth
- `correct` / `correctEver` - whether the last answer, and any answer, was right
- `plays` and `lastAt` - how often it was tried and when

A student's total is the sum of those best scores, so replaying can only improve
the total. Answers are scored on the server, so they cannot be faked from the
browser console.


## Deploying to Vercel

`vercel.json` publishes the site from a **`public/` folder** that
`scripts/build-vercel.mjs` assembles (every page plus the complete `assets/`
folder), and keeps `api/[...route].mjs` as the serverless API:

1. Put the project on GitHub (or run `npx vercel` in this folder) and import it
   in the Vercel dashboard.
2. Leave the project's **Build Command**, **Output Directory** and **Root
   Directory** empty - `vercel.json` sets them (build:
   `node scripts/build-vercel.mjs`, output: `public`). If the dashboard has old
   overrides, clear them, because an installed project may keep stale settings.
3. Redeploy (Deployments → the latest one → **Redeploy**). The build log should
   end with `Vercel bundle ready in public/ (... required files verified)`.
4. Check the deployment: `https://<your-site>/assets/css/style.css` must answer
   **200** with `content-type: text/css`. If it answers 404, the deployment used
   an old build setting - clear the overrides and redeploy again.
5. Add the free key/value store so accounts and AfriCOIN survive on Vercel:
   project → **Storage → Create Database → Upstash Redis (Vercel KV)** →
   connect it. Vercel injects `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
   Until that is done, sign-ups and score saving fail with "read-only file
   system" because a deployment can only write to `/tmp`.

Run `npm run build:vercel` locally at any time to see exactly what will be
published (it fails loudly if a page or asset is missing). The same command also
writes `lib/published-bundle.mjs`, a committed copy of every page and asset that
the Vercel function imports. Together with the `rewrites` in `vercel.json` (which
send `/assets/*` and the five pages to the function) that keeps the site styled
even when a project holds on to an older Output Directory in its dashboard
settings and Vercel answers 404 for those files.

`GET /api/health` is the quickest way to see what a deployment is serving: it
returns the git `commit` the function was built from, plus a `published` block
that lists the files the function can reach (`files`) and how many it carries in
its own bundle (`bundle`).

### When Vercel runs the Node server

If the Vercel project is set up to run `server.mjs` (a "Node.js" style preset,
which happens when the project keeps a build/output override in its dashboard),
Vercel only ships the files that server imports. Pages and assets that are never
imported - the stylesheets, the scripts, `game.html` and friends - would then
answer 404 and the site would look unstyled. `server.mjs` therefore answers any
of the five pages and anything under `assets/` from `lib/published-bundle.mjs`
when the file is not on disk, and `vercel.json` additionally routes `/assets/*`
and the pages through the API, which reads the same copy. Nothing is lost: the
files on disk still win whenever they are there.

To go back to a normal static CDN deployment, open the project's **Settings →
Build and Development Settings** and set **Framework Preset** to *Other*, clear
**Build Command**, **Output Directory** and **Root Directory** (or leave the
values `node scripts/build-vercel.mjs` and `public`, which `vercel.json` sets),
then **Redeploy**.

Optional: `ADMIN_USERNAME` / `ADMIN_PASSWORD` environment variables for an extra
admin login. Without the store the site still works (browser database per
device).

## API

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/api/register` | Create an account and start a session |
| POST | `/api/login` | Sign in |
| POST | `/api/logout` | Sign out |
| GET | `/api/me` | Current account and AfriCOIN |
| GET | `/api/health` | Service check (simulations and AfriCOIN available) |
| POST | `/api/answers` | Score one problem of one simulation |
| POST | `/api/admin/login` | Admin sign in (username or email) |
| POST | `/api/admin/logout` | Admin sign out |
| GET | `/api/admin/me` | Current admin + the admin logins |
| POST | `/api/admin/password` | Change the signed-in admin password |
| GET | `/api/admin/users` | Every registered student with AfriCOIN |
| GET | `/api/admin/users/:id` | One student with per-problem detail |
| GET | `/api/admin/users.csv` | CSV export (`?view=summary` or `?view=questions`) |

A scored answer is sent as:

```json
{ "gameId": "sim0", "questionId": "S1P1", "answer": "C" }
```

## Checks

```bash
npm run check           # syntax check of every server, function and browser script
npm test                # API test suite (accounts, scoring, admin, CSV)
npm run test:http       # boots server.mjs, tests pages, accounts and the JSON files
npm run test:local      # tests the browser database used without the server
npm run test:fallback   # tests the switch to that database when the API store is unusable
npm run test:vercel     # bundles the Vercel function and drives it against a mock store
npm run test:ui         # plays all three simulations through a DOM stand-in without a browser
npm run test:live       # checks a deployed site: every page, stylesheet, script and file it uses
```

`npm run test:live` accepts another address, for example
`node scripts/live-check.mjs https://your-site.vercel.app` or
`node scripts/live-check.mjs http://localhost:5500`. It also prints the git
commit the deployment was built from, which is the quickest way to tell an old
deployment from the newest one.

## Theme

The poster palette lives in `assets/css/theme.css` (and `:root` in
`assets/css/style.css`): cream `#f2f0ea` with a `#d8d3c5` dot pattern, gold
`#d9a634` / `#c99a2e`, ink `#161616`, Montserrat 400-900, white cards with soft
shadows. The header, footer and favicon use the GRIT Lab Africa logo from
`https://showroom.gritlabafrica.org/assets/images/logo.png`.

## This project's own repository

The project now has its **own Git history** (the Richfield EDT900 commits) and
its own remote:

| Remote | Repository | Purpose |
| --- | --- | --- |
| `origin` | `https://github.com/Makhavhu7/Richfield-EDT900-Game-Simulations` | This project |
| `uct-gsb-template` | `https://github.com/FrankBahle/UCT_GSB` | The original template, left untouched |

```bash
git push            # publish new work to this project's own repository
```

The template repository is never written to - `git push` only goes to `origin`.
If you want to keep your own remote name for it, change the URL with
`git remote set-url origin <your-repository-url>`.

## Netlify (still supported)

`netlify.toml` and `netlify/functions/api.mjs` are kept, so the same project
can also deploy to Netlify with Netlify Blobs as the store.
