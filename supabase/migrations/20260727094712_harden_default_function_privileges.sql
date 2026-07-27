-- PostgreSQL combines schema-specific defaults with global defaults. The
-- implicit PUBLIC EXECUTE grant on new functions must therefore be revoked at
-- the global level; approved RPCs continue to receive explicit grants.

alter default privileges for role postgres
  revoke execute on functions from public, anon, authenticated, service_role;
