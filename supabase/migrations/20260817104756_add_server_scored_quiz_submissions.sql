-- Store one server-scored submission for each generated quiz.
-- Additive only: existing generation attempts and user data remain unchanged.

begin;

create table public.quiz_submissions (
  request_id uuid primary key
    references public.generation_attempts (request_id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  answers_hash text not null,
  answers jsonb not null,
  score smallint not null,
  question_count smallint not null,
  completed_at timestamptz not null default clock_timestamp(),
  constraint quiz_submissions_answers_hash_check
    check (answers_hash ~ '^[0-9a-f]{64}$'),
  constraint quiz_submissions_answers_object_check
    check (jsonb_typeof(answers) = 'object' and octet_length(answers::text) <= 32768),
  constraint quiz_submissions_score_check
    check (question_count between 1 and 30 and score between 0 and question_count)
);

comment on table public.quiz_submissions is
  'One immutable server-scored answer set per generated quiz request. Browser roles have no table access.';

create index quiz_submissions_user_completed_idx
  on public.quiz_submissions (user_id, completed_at desc);

alter table public.quiz_submissions enable row level security;
revoke all on table public.quiz_submissions from public, anon, authenticated;
grant select, insert on table public.quiz_submissions to service_role;

commit;
