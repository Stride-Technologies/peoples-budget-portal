-- Extend UserAuditAction with authentication / password lifecycle events.
-- Additive only: new enum values, safe on populated tables.
ALTER TYPE "UserAuditAction" ADD VALUE IF NOT EXISTS 'LOGIN';
ALTER TYPE "UserAuditAction" ADD VALUE IF NOT EXISTS 'LOGIN_FAILED';
ALTER TYPE "UserAuditAction" ADD VALUE IF NOT EXISTS 'PASSWORD_CHANGED';
ALTER TYPE "UserAuditAction" ADD VALUE IF NOT EXISTS 'PASSWORD_RESET_REQUESTED';
ALTER TYPE "UserAuditAction" ADD VALUE IF NOT EXISTS 'PASSWORD_RESET';
