-- Historical rows were preflighted before the hardening migration:
-- user_app_data contained one 2-byte JSON object and generation_attempts was
-- empty. Validate the bounded-payload constraints now that deployment no
-- longer needs the NOT VALID compatibility path.

alter table public.user_app_data
  validate constraint user_app_data_size_check;

alter table public.generation_attempts
  validate constraint generation_attempts_result_size_check;
