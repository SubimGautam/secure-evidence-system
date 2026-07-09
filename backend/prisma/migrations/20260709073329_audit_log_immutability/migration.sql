-- Defense in depth: even if the application layer is fully compromised
-- (SQL injection, RCE, a bug in a future migration), the database itself
-- refuses to modify or remove audit log rows through the app's own
-- connection — only INSERT and SELECT are permitted.
--
-- FORCE ROW LEVEL SECURITY is the key piece: Postgres normally lets a
-- table's owner bypass its own RLS policies, which would make this a no-op
-- here, since the app's DB role owns every table it created via migrations.
-- FORCE closes that loophole for anyone who isn't an actual Postgres
-- superuser (the app's runtime role is not).
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_select_all" ON "audit_logs" FOR SELECT USING (true);
CREATE POLICY "audit_logs_insert_only" ON "audit_logs" FOR INSERT WITH CHECK (true);

-- No UPDATE or DELETE policy is defined. With RLS forced and no policy
-- granting them, those commands are rejected outright — there is no
-- implicit fallback to "allowed."
