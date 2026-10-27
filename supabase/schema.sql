-- 困りごとボード schema. Run once in Supabase → SQL Editor.
create extension if not exists pgcrypto;

create table if not exists rooms (
  id text primary key,
  phase text not null default 'lobby',          -- lobby | post | react | vote | free | themes
  phase_ends_at timestamptz,
  expected int not null default 6,
  nice_threshold int not null default 3,
  post_count int not null default 0,
  themes jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references rooms(id) on delete cascade,
  nickname text not null,
  created_at timestamptz not null default now()
);

-- secrets live in their own tables with NO read policy, so they never reach browsers
create table if not exists participant_secrets (
  participant_id uuid primary key references participants(id) on delete cascade,
  secret_hash text not null
);

-- posts are anonymous: no participant column at all
create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references rooms(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 140),
  late boolean not null default false,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists post_secrets (
  post_id uuid primary key references posts(id) on delete cascade,
  del_hash text not null
);

create table if not exists replies (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references rooms(id) on delete cascade,
  post_id uuid not null references posts(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  nickname text not null,
  body text not null check (char_length(body) between 1 and 200),
  is_solution boolean not null default false,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists wakaru (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references rooms(id) on delete cascade,
  target_type text not null check (target_type in ('post','reply')),
  target_id uuid not null,
  participant_id uuid not null references participants(id) on delete cascade,
  nickname text not null,
  created_at timestamptz not null default now(),
  unique (target_id, participant_id)
);

create table if not exists votes (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references rooms(id) on delete cascade,
  post_id uuid not null references posts(id) on delete cascade,
  participant_id uuid not null references participants(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, participant_id)
);

create table if not exists done (
  room_id text not null references rooms(id) on delete cascade,
  phase text not null,
  participant_id uuid not null references participants(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (room_id, phase, participant_id)
);

-- Row Level Security: browsers may only READ. All writes go through the app's API (secret key).
alter table rooms enable row level security;
alter table participants enable row level security;
alter table participant_secrets enable row level security;
alter table posts enable row level security;
alter table post_secrets enable row level security;
alter table replies enable row level security;
alter table wakaru enable row level security;
alter table votes enable row level security;
alter table done enable row level security;

drop policy if exists read_rooms on rooms;
create policy read_rooms on rooms for select using (true);
drop policy if exists read_participants on participants;
create policy read_participants on participants for select using (true);
-- posts stay hidden while the posting phase is running (batch reveal keeps them anonymous)
drop policy if exists read_posts on posts;
create policy read_posts on posts for select using (
  not hidden and exists (select 1 from rooms r where r.id = room_id and r.phase not in ('lobby','post'))
);
drop policy if exists read_replies on replies;
create policy read_replies on replies for select using (not hidden);
drop policy if exists read_wakaru on wakaru;
create policy read_wakaru on wakaru for select using (true);
drop policy if exists read_votes on votes;
create policy read_votes on votes for select using (true);
drop policy if exists read_done on done;
create policy read_done on done for select using (true);

-- live updates
do $$
declare t text;
begin
  foreach t in array array['rooms','participants','posts','replies','wakaru','votes','done'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
