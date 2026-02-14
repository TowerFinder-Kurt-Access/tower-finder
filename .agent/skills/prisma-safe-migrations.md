Skill: Prisma Safe Database Migrations

Description: Instructions for evolving a database schema without data loss or full recreation.

⚠️ The Golden Rule
Never use npx prisma db push for persistent data environments. Use Prisma Migrate to generate incremental SQL changes.

🛠 Workflow: Incremental Updates
To add or modify fields without dropping tables, follow this sequence:

Modify Schema: Update your model in schema.prisma.

Generate Migration: Run the following in your terminal:

Bash
npx prisma migrate dev --name <description_of_change>
Review: Prisma creates a SQL file in ./prisma/migrations/.

Safe actions: Adding an optional field (?) or a field with a @default.

Unsafe actions: Adding a required field without a default to a table that already has rows.

🔄 Recovering from "Drift"
If Prisma warns that the database is out of sync and asks to reset, do not type y. Use the Baseline method:

Step 1: Sync the Schema
If the DB has changes the schema doesn't, pull them first:

npx prisma db pull

Step 2: Create a Fake "Initial" Migration
If you want to start using migrations on an existing DB without deleting data:

1. Create the migration folder without running it:

npx prisma migrate dev --name baseline_migration --create-only

2. Manually tell Prisma this migration is "already done":

npx prisma migrate resolve --applied baseline_migration


🛡️ Safety Checklist
Renaming a field? Prisma will try to DROP and ADD. You must manually edit the generated .sql file to use ALTER TABLE ... RENAME COLUMN ....

Changing Types? (e.g., String to Int). This will fail if data exists. Create a new column, migrate data via a script, then delete the old column.

Production Deploys: Always use npx prisma migrate deploy. This command never asks for confirmation and will never reset the database.

Commands Reference

Command	            Use Case
migrate dev	        Local development; creates SQL files.
migrate deploy	    Production/Staging; applies existing SQL files.
migrate status	    Checks if the DB is behind the schema.
db pull	            Updates schema.prisma to match the current DB.
