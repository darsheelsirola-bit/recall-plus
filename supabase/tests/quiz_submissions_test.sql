begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;

select plan(4);

select ok(
  to_regclass('public.quiz_submissions') is not null,
  'server-scored quiz submissions table exists'
);

select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.quiz_submissions'::regclass),
  'quiz submissions have RLS enabled'
);

select ok(
  not has_table_privilege('anon', 'public.quiz_submissions', 'SELECT')
  and not has_table_privilege('authenticated', 'public.quiz_submissions', 'SELECT')
  and not has_table_privilege('authenticated', 'public.quiz_submissions', 'INSERT'),
  'browser roles cannot read or insert protected quiz submissions'
);

select ok(
  has_table_privilege('service_role', 'public.quiz_submissions', 'SELECT')
  and has_table_privilege('service_role', 'public.quiz_submissions', 'INSERT'),
  'the server service role can persist and replay quiz submissions'
);

select * from finish();
rollback;
