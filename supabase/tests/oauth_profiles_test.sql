begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;

select plan(8);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
values
(
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000401',
  'authenticated',
  'authenticated',
  'google-oauth@example.test',
  '',
  clock_timestamp(),
  '{"provider":"google","providers":["google"]}'::jsonb,
  '{"display_name":"Legacy Display","full_name":"Google Student","name":"Lower Priority"}'::jsonb,
  clock_timestamp(),
  clock_timestamp(),
  '',
  '',
  '',
  ''
),
(
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000402',
  'authenticated',
  'authenticated',
  'apple-oauth@example.test',
  '',
  clock_timestamp(),
  '{"provider":"apple","providers":["apple"]}'::jsonb,
  '{}'::jsonb,
  clock_timestamp(),
  clock_timestamp(),
  '',
  '',
  '',
  ''
),
(
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000403',
  'authenticated',
  'authenticated',
  'github-oauth@example.test',
  '',
  clock_timestamp(),
  '{"provider":"github","providers":["github"]}'::jsonb,
  '{"name":" ","user_name":"octo-student","preferred_username":"lower-priority"}'::jsonb,
  clock_timestamp(),
  clock_timestamp(),
  '',
  '',
  '',
  ''
),
(
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000404',
  'authenticated',
  'authenticated',
  'preferred-oauth@example.test',
  '',
  clock_timestamp(),
  '{"provider":"github","providers":["github"]}'::jsonb,
  '{"preferred_username":"preferred-student"}'::jsonb,
  clock_timestamp(),
  clock_timestamp(),
  '',
  '',
  '',
  ''
);

select is(
  (select display_name from public.recall_profiles where id = '00000000-0000-0000-0000-000000000401'),
  'Google Student',
  'OAuth signup uses the first valid full name'
);

select is(
  (select display_name from public.recall_profiles where id = '00000000-0000-0000-0000-000000000402'),
  'Recall+ User',
  'OAuth signup without usable name metadata receives the Recall+ fallback'
);

select is(
  (select display_name from public.recall_profiles where id = '00000000-0000-0000-0000-000000000403'),
  'octo-student',
  'OAuth signup skips unusable metadata and accepts GitHub user_name'
);

select is(
  (select display_name from public.recall_profiles where id = '00000000-0000-0000-0000-000000000404'),
  'preferred-student',
  'OAuth signup accepts preferred_username when earlier candidates are absent'
);

select is(
  (
    select count(*)::integer
    from public.recall_profiles
    where id in (
      '00000000-0000-0000-0000-000000000401',
      '00000000-0000-0000-0000-000000000402',
      '00000000-0000-0000-0000-000000000403',
      '00000000-0000-0000-0000-000000000404'
    )
  ),
  4,
  'each OAuth Auth user receives exactly one profile row'
);

select is(
  (
    select count(*)::integer
    from public.user_app_data
    where user_id in (
      '00000000-0000-0000-0000-000000000401',
      '00000000-0000-0000-0000-000000000402',
      '00000000-0000-0000-0000-000000000403',
      '00000000-0000-0000-0000-000000000404'
    )
  ),
  4,
  'each OAuth Auth user receives exactly one app-data row'
);

update public.recall_profiles
set display_name = 'Custom Student Name'
where id = '00000000-0000-0000-0000-000000000403';

update auth.users
set raw_user_meta_data = '{"full_name":"Provider Changed Name"}'::jsonb
where id = '00000000-0000-0000-0000-000000000403';

select is(
  (select display_name from public.recall_profiles where id = '00000000-0000-0000-0000-000000000403'),
  'Custom Student Name',
  'returning OAuth users keep their custom profile name'
);

select ok(
  not has_function_privilege('anon', 'public.handle_new_recall_user()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.handle_new_recall_user()', 'EXECUTE'),
  'the profile trigger function is not a client-callable API'
);

select * from finish();
rollback;
