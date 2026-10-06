🗼 Advanced tower detection and CRM dashboard for tower location management, owner lookup, and landowner lead generation.

## ☁️ Deploy your own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/TowerFinder-Kurt-Access/tower-finder)

## ✨ Features

- **Interactive Map** — Leaflet map with tower markers, marker clustering, and tower detail popups.
- **Tower Management** — Full tower CRUD with status tracking, sorting, and AI-assisted lead classification.
- **Owner & Parcel Lookup** — Parcel records, owner details, and third-party data enrichment per tower.
- **Nearby Businesses** — Geoapify-powered business discovery around each tower for contactable landowners.
- **Review & Print Forms** — Structured lead review forms (deal type, rent, fees, notes) with a clean printable document.
- **Notes & Call Tracking** — Call history, notes, and custom Street View URL saving per tower.
- **FCC Rooftop Discovery** — Scheduled job pipeline that discovers towers from FCC data and merges them into the database.
- **Role-Based Access Control** — NextAuth v5 authentication with admin roles, 2FA, and session security.
- **Excel Export** — Spreadsheet exports powered by ExcelJS for offline reporting.
- **Monitoring** — Sentry error tracking across the app and API routes.

## 🧱 Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router, Turbopack), [React 19](https://react.dev/)
- **UI**: [Material UI 7](https://mui.com/), [MUI X Data Grid](https://mui.com/x/react-data-grid/), [Leaflet](https://leafletjs.com/) + [react-leaflet](https://github.com/PaulLeCam/react-leaflet)
- **Data**: [Prisma ORM](https://www.prisma.io/) with PostgreSQL + Prisma Accelerate, [Supabase](https://supabase.com/)
- **Auth**: [NextAuth v5](https://next-auth.js.org/) with 2FA and bcrypt
- **Integrations**: [Geoapify](https://www.geoapify.com/) (places), FCC, ExcelJS, Sentry
- **Tooling**: TypeScript, ESLint, Prisma Migrate

## 🚀 Getting Started

Clone the repo, install deps, and boot the dev server:

```bash
git clone https://github.com/TowerFinder-Kurt-Access/tower-finder.git
cd tower-finder
npm install
npm run dev
```

Copy `.env.example` to `.env` and fill in your keys (database, auth, Geoapify, etc.) before the first run.

Open [http://localhost:3000](http://localhost:3000) to view the app.

## 🗄️ Database Setup

This project uses Prisma with PostgreSQL. To set up the database:

```bash
# Generate Prisma Client
npx prisma generate

# Push schema to database
npx prisma db push

# Create admin user
node scripts/create_admin.js
```

Default admin login:

- Email: admin@tower-finder.com
- Password: Use the password set during admin creation

## 📦 Build for Production

```bash
npm run build
npm start
```

## 🗂️ Configuration

The app is built under `src/`, with page routes in `src/app` and shared logic in `src/lib`. Key areas to explore are:

```text
src/
  app/
    towers/                 # Tower list, map, and tower detail pages
    review/                 # Lead review forms and printable lead document
    owners/                 # Owner and parcel lookup pages
    superpowers/            # Admin tools and discovery dashboards
    api/                    # Route handlers (towers, lead forms, jobs, cron)
  components/               # Shared React components (map, tables, layout)
  lib/                      # Prisma client, auth, jobs queue, data services
  services/                 # External API clients (Geoapify, FCC, scrapers)
prisma/
  schema.prisma             # Database schema
  migrations/               # SQL migrations
scripts/                    # Admin bootstrap and maintenance scripts
docs/                       # Plans, status reports, and technical notes
```

## 🤝🏻 Contributing

Contributions are always welcome, whether you're fixing bugs, improving docs, or shipping new features that make the project better for everyone.

Check out [Contributing.md](Contributing) to learn how to get started and follow the recommended workflow.

<!-- Please adhere to this project's `Code of Conduct`. -->

## ⚖️ License

No license file has been published for this project yet. Contact the repository owners for usage and distribution terms.
