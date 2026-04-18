DO $$ BEGIN
  CREATE TYPE "invitation_status" AS ENUM ('pending', 'accepted', 'expired', 'canceled');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "org_invitations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "role" "user_role" DEFAULT 'member' NOT NULL,
  "status" "invitation_status" DEFAULT 'pending' NOT NULL,
  "invited_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_org_invitations_org_id" ON "org_invitations" ("organization_id");
CREATE INDEX IF NOT EXISTS "idx_org_invitations_email" ON "org_invitations" ("email");
