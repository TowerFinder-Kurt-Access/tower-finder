-- Session lifecycle events: a deliberate sign-out, a revoked session, and an
-- expired one. PostgreSQL 12+ allows ADD VALUE inside the migration
-- transaction as long as the values are not used in the same transaction.
ALTER TYPE "LoginEventType" ADD VALUE 'LOGOUT';
ALTER TYPE "LoginEventType" ADD VALUE 'SESSION_REVOKED';
ALTER TYPE "LoginEventType" ADD VALUE 'SESSION_EXPIRED';
