# Tower Finder 4900 — Tech Stack Modernization

Date: 2026-09-28
For: internal review
Estimate basis: one developer, assisted by AI coding agents

---

## 1. Summary

| # | Work | Stack change | Est | Weeks |
| --- | --- | --- | --- | --- |
| 1 | Appearance: theme and currency | none | 8 h | 0.25 |
| 2 | Map | Leaflet to MapLibre via **mapcn** | 24 h | 1 |
| 3 | Components | Material UI and Emotion to **Shadcn/ui** and Tailwind | 24 h | 1 |
| 4 | Framework | **Next.js 16 to TanStack Start** | 40 h | 1.5 |
| 5 | Server and middleware optimization | after the API layer is rewritten | 16 h | 0.5 |
| 6 | Server deployment audit | none | 4 h | 0.25 |
| 7 | Review, test, clean up | all of the above | 6 h | 0.25 |
| | | | **122 h** | **4** |

Decisions already made:

- **Map uses mapcn.** Copy-in map components on MapLibre, styled with Tailwind, built for
  shadcn. One command installs it. Free, MIT, we own the code.
- **Components use Shadcn/ui.** Copy-in building blocks that we own.
- **Framework starts from a published template** that already ships the router, styling and
  a working login.

Work 5 sits after work 4 on purpose. Trimming the middleware, the API calls and the cron
runner is worth doing once, on the rewritten API layer, not twice.

Estimates assume an agent drafts the code and a person checks every screen render before it
merges. Review time is work 8 and is the limit on speed, not writing code.

These figures carry no contingency. 122 h is the work, not the work plus a buffer. If any
line overruns, the total moves.

---

## 2. Appearance: theme and currency — 8 h

Today the app is light only. `src/app/theme.js` hardcodes `mode: 'light'` and there is no
switch. There is also no currency setting, so dollar figures in the lead form and export are
shown without a unit.

- Theme switch: light, dark, or follow the system, with the choice remembered per user. 3 h
- Currency setting: pick the currency, format every money field with it. The schema already
  stores `feesDollarValue`, `feesPercentValue` and `rentIncreaseAmount`, and the review form
  and the tower export both print them. 3 h
- Settings surface on the existing profile page. No new page. 2 h

One ordering warning. The setting and the switch cost the same at any point, but the dark
palette itself depends on where the colours live. Work 4 replaces Material UI with Tailwind
tokens, so a dark theme built in work 1 has its colours rewritten in work 4. Either accept
that, or move the dark half of this item to sit directly after the Tailwind setup.

---

## 3. Map: Leaflet to MapLibre via mapcn — 24 h

- Install and configure mapcn, point it at our tower data, match our styling. 12 h
- Port our own map logic: cluster drill-in, parcel outlines, click a tower, my location. 8 h
- Remove the old map library, point the two other maps across, check bundle and security
  headers. 4 h

mapcn handles the markers, popups, tooltips, controls and clustering. The 8 hours is our
own logic: drilling into a cluster zooms to it instead of out, clicking a tower does not
yank the view back, parcel outlines have to draw.

The map stays free. Free open tiles, no API key, no key in the browser, no vendor lock-in.

The 24 hours assumes the agent ports our existing map code directly and a person checks
each render. Map behaviour is the one place a wrong result still looks correct, so this is
the line most likely to move.

---

## 4. Components: Material UI to Shadcn/ui — 24 h

- Tailwind setup, move our dark and light colours in. 6 h
- Copy in the component blocks, adapt to our screens, rebuild the navigation shell. 8 h
- Move the 12 screens across. 6 h
- Replace the grid tables. 4 h

shadcn has no grid table and neither does anything else. The 4 hours assumes the current
table keeps its behaviour as a plain sortable, filterable table. If row virtualisation or
column pinning turns out to be load-bearing, this grows.

Removing Emotion removes a styling runtime from the browser. That is the largest single
bundle win in the plan.

---

## 5. Framework: Next.js 16 to TanStack Start — 40 h

Start from a published template, which is why this is not 100 hours.

- Scaffold from the template, add environment settings, wire error reporting. 4 h
- Move the database layer and our 28 data models across. 5 h
- Rebuild login and security on the template's auth library. Keeps session revocation on
  password change, forced password change, two-factor, lockout, and roles. 10 h
- Build the route tree and the guard that replaces our current middleware. 5 h
- Turn our 35 hand-written server routes, and every axios call on the client, into one-call
  server functions. The types already exist. 10 h
- Move the scheduled job runner and cron. 2 h
- Run old and new side by side, compare every screen, then cut over. 4 h

Honest notes. Next.js 16 is not old or unsupported. It is the current release and the most
used in the industry, and this project already uses its modern routing. The argument for
moving is faster builds and clearer rules, not abandonment of something broken. TanStack
Start is a release candidate, and its error reporting is a beta. The gain is developer
speed, not app speed for users.

At 40 hours the security work and the side-by-side test are the two lines with no room.
Both are floors. If they get squeezed, the risk lands on customers, not on the schedule.

---

## 6. Server and middleware optimization — 16 h

Runs on the new API layer so the work is done once.

- Middleware. It currently makes a database round trip on every request to check whether a
  session was revoked. Move that into the session itself, so the check is free. 5 h
- API calls. Cut the extra data the tower list sends, and cache the city, province and
  carrier lists. Those change a few times a year and are re-read on every filter change.
  7 h
- Cron and the job queue. The runner picks one job at a time and the five triggers overlap.
  Batch them into a single pass and cache the outside map and address lookups, which are
  metered and slow. 4 h

Note: there is no analytics code in the project today. If we add page or event tracking,
it is new work and it is not in this estimate.

---

## 7. Server deployment audit — 4 h

Vercel bills Function Storage by the total size of the files it keeps for each server
function. That is the largest uncontrolled cost we have, and we do not know what is in it.

This produces a ranked list, not a guess.

- Measure every function's real size, per route, on the live deployment. 1.5 h
- Find what is being pulled in that does not need to be. 1 h
- Remove dead code, set a size budget per function, write up ranked fixes. 1.5 h

What we already know about the current build:

| Item | Size on disk | In the server functions? |
| --- | --- | --- |
| Database tooling | 115 MB | Yes, the largest single item |
| Web framework | 155 MB | Yes, partly |
| Component library | 203 MB | No, browser only |
| Map library | 4 MB | No, browser only |
| Compiled server output | 36 MB | Yes |

The top finding is already visible: our database tooling is the biggest thing in every
function, and it ships a large compiled engine with each one. The next major version of it
removes that engine, expected to be worth tens of megabytes per function. We size that from
the audit output rather than guess it now.

At 4 hours this is a measurement, not a fix. It tells us what to do about Function Storage.
It does not reduce it.

---

## 8. Review, test, clean up — 6 h

Every agent-written change is read by a person before merge. Old libraries and unused
packages deleted. Full pass over all screens and both user roles, admin and caller.

Six hours across four stack works is under a day and a half. That is enough to read the
diff and catch the obvious. It is not enough to check every screen against both user roles,
which is what this line was sized for when it was 20 hours. If a review finds a real problem
late, it costs more than the 14 hours saved here.

This is the line that keeps the rest honest. It is the first place to put the time back if
the 122 hours needs to hold.

---

## 9. Risks

| Risk | What we do about it |
| --- | --- |
| Review does not keep up with agent output | Work 8 is only 6 h. Treat it as the first thing to restore. |
| Dark theme colours rewritten by the Tailwind move | Build the theme switch in work 1, the dark palette after work 4. |
| Middleware change alters auth on every route | Test login, logout, and an admin and a caller session before anything else merges. |
| Map behaviour looks right and is wrong | Check every render against the current map. |
| Grid tables need more than a plain table | Build one table first, measure, then decide. |
| Release candidate framework has defects | It is work 5. If it slips, works 1 to 4 are already shipped. |
| Function Storage is worse than measured | The audit in work 7 measures before we change anything. |

The middleware line is the one that touches every request, so it is the one to test first.

---

## 10. What we are not doing

- Not changing the database. Same data, same records.
- Not changing any security control. Same logins, roles, password rules, two-factor, audit
  trail. Only the code underneath changes.
- Not changing what the app does. Same screens, same features.
- Not buying any new paid service.

---

## 11. Decision

Approve work 1, the theme and currency settings, at 8 h. It is the smallest item and
something people will use every day.
