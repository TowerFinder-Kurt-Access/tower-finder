# Tower Finder 4900

Advanced Tower Detection and CRM Dashboard for tower location management and owner lookup.

## Features

- Interactive map with tower locations
- Tower management with status tracking
- Owner lookup and parcel information
- Notes and call tracking
- Custom Street View URL saving
- User management with role-based access control

## Getting Started

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Database Setup

This project uses Prisma with PostgreSQL. To set up the database:

```bash
# Generate Prisma Client
npx prisma generate

# Push schema to database
npx prisma db push

# Create admin user
node scripts/create_admin.js
```

## Default Login

- Email: admin@tower-finder.com
- Password: Use the password set during admin creation

## Technology Stack

- Next.js 16
- React 19
- Material-UI (MUI)
- Prisma ORM
- PostgreSQL
- NextAuth v5
- Leaflet Maps
- TypeScript
