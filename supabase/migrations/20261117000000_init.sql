-- Accountability App: core schema, access rules and write functions.
--
-- Access model
--   * Reads: row-level security. A member can read only rows that belong to their own groups.
--   * Writes: almost everything goes through the SECURITY DEFINER functions at the bottom of this
--     file, which enforce the product rules (task limit, check-in window, reviewer is not the owner…).
--     Tables therefore have no insert/update policies unless a plain policy is enough.
--   * Streaks and strike outcomes are written only by the end-of-day Edge Function (service role).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null check (char_length(display_name) between 1 and 40),
  timezone      text not null default 'UTC',          -- decides when this member's day ends
  avatar_color  text not null default '#D97706',
  push_token    text,
  notify_nudges boolean not null default true,
  created_at    timestamptz not null default now()
);

create table public.groups (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (char_length(name) between 1 and 40),
  forfeit          text not null default '' check (char_length(forfeit) <= 140),
  invite_code      text not null unique,
  current_streak   integer not null default 0 check (current_streak >= 0),  -- server-written
  best_streak      integer not null default 0 check (best_streak >= 0),     -- server-written
  last_closed_date date,                                                    -- server-written
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now()
);

create table public.memberships (
  group_id  uuid not null references public.groups (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  role      text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  left_at   timestamptz,
  primary key (group_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id) where left_at is null;

create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups (id) on delete cascade,
  owner_id     uuid not null references public.profiles (id) on delete cascade,
  creator_id   uuid references public.profiles (id) on delete set null,
  title        text not null check (char_length(title) between 1 and 80),
  -- {"kind":"daily"} | {"kind":"weekdays","days":[1,3,5]} | {"kind":"once","date":"2026-12-01"}
  schedule     jsonb not null check (schedule ->> 'kind' in ('daily', 'weekdays', 'once')),
  window_start time not null default '06:00',
  window_end   time not null default '22:00',
  status       text not null check (status in ('pending', 'active', 'paused', 'ended', 'declined')),
  active_from  date,
  created_at   timestamptz not null default now(),
  check (window_start < window_end)
);
create index tasks_group_idx on public.tasks (group_id);

create table public.checkins (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks (id) on delete cascade,
  group_id    uuid not null references public.groups (id) on delete cascade,
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  date        date not null,
  photo_path  text,
  explanation text not null check (char_length(btrim(explanation)) >= 20),
  status      text not null default 'submitted' check (status in ('submitted', 'approved', 'questioned')),
  created_at  timestamptz not null default now(),
  unique (task_id, date)                                -- one check-in per task per day
);
create index checkins_group_date_idx on public.checkins (group_id, date);

create table public.verifications (
  id          uuid primary key default gen_random_uuid(),
  checkin_id  uuid not null references public.checkins (id) on delete cascade,
  reviewer_id uuid not null references public.profiles (id) on delete cascade,
  decision    text not null check (decision in ('approve', 'question')),
  created_at  timestamptz not null default now(),
  unique (checkin_id, reviewer_id)
);

create table public.comments (
  id         uuid primary key default gen_random_uuid(),
  checkin_id uuid not null references public.checkins (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index comments_checkin_idx on public.comments (checkin_id);

create table public.strikes (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  date         date not null,
  statement    text check (char_length(statement) <= 500),
  statement_at timestamptz,
  outcome      text not null default 'pending' check (outcome in ('pending', 'excused', 'upheld')),
  resolved_at  timestamptz,
  created_at   timestamptz not null default now(),
  unique (group_id, user_id, date)
);

create table public.votes (
  strike_id uuid not null references public.strikes (id) on delete cascade,
  voter_id  uuid not null references public.profiles (id) on delete cascade,
  choice    text not null check (choice in ('excuse', 'uphold')),
  created_at timestamptz not null default now(),
  primary key (strike_id, voter_id)                     -- one vote per member per strike
);

create table public.nudges (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups (id) on delete cascade,
  from_id    uuid not null references public.profiles (id) on delete cascade,
  to_id      uuid not null references public.profiles (id) on delete cascade,
  date       date not null default current_date,
  created_at timestamptz not null default now(),
  unique (from_id, to_id, group_id, date),              -- one nudge per friend per day
  check (from_id <> to_id)
);

create table public.reports (
  id             uuid primary key default gen_random_uuid(),
  reporter_id    uuid not null references public.profiles (id) on delete cascade,
  target_user_id uuid references public.profiles (id) on delete set null,
  checkin_id     uuid references public.checkins (id) on delete set null,
  reason         text not null check (char_length(btrim(reason)) between 1 and 500),
  created_at     timestamptz not null default now()
);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- ---------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------

create function public.is_member(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships
    where group_id = gid and user_id = auth.uid() and left_at is null
  );
$$;

create function public.shares_group(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships mine
    join memberships theirs using (group_id)
    where mine.user_id = auth.uid() and mine.left_at is null and theirs.user_id = other
  );
$$;

-- A profile row is created for every new auth user.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name, timezone, avatar_color)
  values (
    new.id,
    left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), 'Friend'), 40),
    coalesce(nullif(new.raw_user_meta_data ->> 'timezone', ''), 'UTC'),
    coalesce(nullif(new.raw_user_meta_data ->> 'avatar_color', ''), '#D97706')
  );
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------------------------

alter table public.profiles      enable row level security;
alter table public.groups        enable row level security;
alter table public.memberships   enable row level security;
alter table public.tasks         enable row level security;
alter table public.checkins      enable row level security;
alter table public.verifications enable row level security;
alter table public.comments      enable row level security;
alter table public.strikes       enable row level security;
alter table public.votes         enable row level security;
alter table public.nudges        enable row level security;
alter table public.reports       enable row level security;
alter table public.blocks        enable row level security;

create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_group(id));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy groups_read on public.groups for select to authenticated
  using (public.is_member(id));
create policy memberships_read on public.memberships for select to authenticated
  using (public.is_member(group_id));
create policy tasks_read on public.tasks for select to authenticated
  using (public.is_member(group_id));
create policy checkins_read on public.checkins for select to authenticated
  using (public.is_member(group_id));
create policy verifications_read on public.verifications for select to authenticated
  using (exists (select 1 from public.checkins c where c.id = checkin_id and public.is_member(c.group_id)));
create policy comments_read on public.comments for select to authenticated
  using (exists (select 1 from public.checkins c where c.id = checkin_id and public.is_member(c.group_id)));
create policy comments_insert on public.comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (select 1 from public.checkins c where c.id = checkin_id and public.is_member(c.group_id))
  );
-- Statements and votes stay private to the group.
create policy strikes_read on public.strikes for select to authenticated
  using (public.is_member(group_id));
create policy votes_read on public.votes for select to authenticated
  using (exists (select 1 from public.strikes s where s.id = strike_id and public.is_member(s.group_id)));

create policy nudges_read on public.nudges for select to authenticated
  using (from_id = auth.uid() or to_id = auth.uid());
create policy nudges_insert on public.nudges for insert to authenticated
  with check (
    from_id = auth.uid() and public.is_member(group_id)
    and exists (select 1 from public.memberships m
                where m.group_id = nudges.group_id and m.user_id = to_id and m.left_at is null)
  );

create policy reports_insert on public.reports for insert to authenticated
  with check (reporter_id = auth.uid());
create policy reports_read_own on public.reports for select to authenticated
  using (reporter_id = auth.uid());

create policy blocks_all_own on public.blocks for all to authenticated
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

-- Column safety: a member may edit their own profile but nothing server-owned.
revoke all on all tables in schema public from anon;
grant select on all tables in schema public to authenticated;
grant update (display_name, timezone, avatar_color, push_token, notify_nudges) on public.profiles to authenticated;
grant insert on public.comments, public.nudges, public.reports to authenticated;
grant insert, delete on public.blocks to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Write functions (the only way to change groups, tasks, check-ins, verifications, statements, votes)
-- ---------------------------------------------------------------------------------------------

create function public.require_user() returns uuid
language plpgsql stable as $$
begin
  if auth.uid() is null then raise exception 'not signed in' using errcode = '28000'; end if;
  return auth.uid();
end;
$$;

create function public.new_invite_code() returns text
language sql volatile as $$
  -- 6 characters, no look-alikes (0/O, 1/I/L).
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '')
  from generate_series(1, 6);
$$;

create function public.create_group(p_name text, p_forfeit text default '') returns public.groups
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := require_user();
  g groups;
begin
  loop
    begin
      insert into groups (name, forfeit, invite_code, created_by)
      values (btrim(p_name), btrim(coalesce(p_forfeit, '')), new_invite_code(), uid)
      returning * into g;
      exit;
    exception when unique_violation then null;  -- invite code collision: try again
    end;
  end loop;
  insert into memberships (group_id, user_id, role) values (g.id, uid, 'admin');
  return g;
end;
$$;

create function public.join_group(p_code text) returns public.groups
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := require_user();
  g groups;
begin
  select * into g from groups where invite_code = upper(btrim(p_code)) for update;
  if not found then raise exception 'No group has that invite code'; end if;
  if exists (select 1 from memberships where group_id = g.id and user_id = uid and left_at is null) then
    return g;
  end if;
  if (select count(*) from memberships where group_id = g.id and left_at is null) >= 8 then
    raise exception 'This group is full (8 members)';
  end if;
  insert into memberships (group_id, user_id) values (g.id, uid)
  on conflict (group_id, user_id) do update set left_at = null, joined_at = now(), role = 'member';
  return g;
end;
$$;

-- Anyone can leave silently. Their open tasks end; history stays for the group.
create function public.leave_group(p_group uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := require_user();
begin
  update memberships set left_at = now() where group_id = p_group and user_id = uid and left_at is null;
  if not found then raise exception 'You are not in this group'; end if;
  update tasks set status = 'ended'
   where group_id = p_group and owner_id = uid and status in ('pending', 'active', 'paused');
  -- Keep the group administrable: promote the longest-standing member if no admin is left.
  if not exists (select 1 from memberships where group_id = p_group and left_at is null and role = 'admin') then
    update memberships set role = 'admin'
     where group_id = p_group and user_id = (
       select user_id from memberships where group_id = p_group and left_at is null order by joined_at limit 1);
  end if;
end;
$$;

create function public.update_group(p_group uuid, p_name text, p_forfeit text) returns public.groups
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := require_user();
  g groups;
begin
  if not is_member(p_group) then raise exception 'You are not in this group'; end if;
  update groups set name = btrim(p_name), forfeit = btrim(coalesce(p_forfeit, ''))
   where id = p_group returning * into g;
  return g;
end;
$$;

-- First date a task can be due: today, unless today's window has already closed for the owner.
create function public.first_due_date(p_owner uuid, p_window_end time) returns date
language sql stable security definer set search_path = public as $$
  select case when (now() at time zone p.timezone)::time <= p_window_end
              then (now() at time zone p.timezone)::date
              else (now() at time zone p.timezone)::date + 1 end
  from profiles p where p.id = p_owner;
$$;

create function public.active_task_count(p_group uuid, p_owner uuid) returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from tasks
  where group_id = p_group and owner_id = p_owner and status in ('active', 'paused');
$$;

-- A task you set for yourself starts active. A task set for a friend waits for them to accept it.
create function public.create_task(
  p_group uuid, p_owner uuid, p_title text, p_schedule jsonb,
  p_window_start time default '06:00', p_window_end time default '22:00'
) returns public.tasks
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := require_user();
  t tasks;
  mine boolean := (p_owner = uid);
begin
  if not is_member(p_group) then raise exception 'You are not in this group'; end if;
  if not exists (select 1 from memberships where group_id = p_group and user_id = p_owner and left_at is null) then
    raise exception 'That person is not in this group';
  end if;
  if exists (select 1 from blocks where blocker_id = p_owner and blocked_id = uid) then
    raise exception 'You cannot set tasks for this person';
  end if;
  if mine and active_task_count(p_group, uid) >= 3 then
    raise exception 'You already have 3 active tasks. End or finish one first.';
  end if;
  insert into tasks (group_id, owner_id, creator_id, title, schedule, window_start, window_end, status, active_from)
  values (p_group, p_owner, uid, btrim(p_title), p_schedule, p_window_start, p_window_end,
          case when mine then 'active' else 'pending' end,
          case when mine then first_due_date(uid, p_window_end) end)
  returning * into t;
  return t;
end;
$$;

-- Owner: accept or decline a pending task, pause/resume, end. Creator: withdraw a pending task.
create function public.set_task_status(p_task uuid, p_status text) returns public.tasks
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := require_user();
  t tasks;
begin
  select * into t from tasks where id = p_task for update;
  if not found or not is_member(t.group_id) then raise exception 'Task not found'; end if;

  if t.owner_id <> uid then
    if t.creator_id = uid and t.status = 'pending' and p_status = 'declined' then
      update tasks set status = 'declined' where id = p_task returning * into t;
      return t;
    end if;
    raise exception 'Only the owner can change this task';
  end if;

  if t.status = 'pending' and p_status = 'active' then
    if active_task_count(t.group_id, uid) >= 3 then
      raise exception 'You already have 3 active tasks. End or finish one first.';
    end if;
    update tasks set status = 'active', active_from = first_due_date(uid, t.window_end)
     where id = p_task returning * into t;
  elsif t.status = 'pending' and p_status = 'declined' then
    update tasks set status = 'declined' where id = p_task returning * into t;
  elsif t.status = 'active' and p_status = 'paused' then
    update tasks set status = 'paused' where id = p_task returning * into t;
  elsif t.status = 'paused' and p_status = 'active' then
    update tasks set status = 'active', active_from = first_due_date(uid, t.window_end)
     where id = p_task returning * into t;
  elsif t.status in ('active', 'paused') and p_status = 'ended' then
    update tasks set status = 'ended' where id = p_task returning * into t;
  else
    raise exception 'Cannot change a % task to %', t.status, p_status;
  end if;
  return t;
end;
$$;

-- Submit today's check-in, or retake it. The date and the window are decided here, on the server,
-- in the owner's timezone, so a phone clock cannot be used to back-date proof.
create function public.submit_checkin(p_task uuid, p_photo_path text, p_explanation text) returns public.checkins
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := require_user();
  t tasks;
  c checkins;
  local_ts timestamp;
begin
  select * into t from tasks where id = p_task;
  if not found or t.owner_id <> uid then raise exception 'Task not found'; end if;
  if t.status <> 'active' then raise exception 'This task is not active'; end if;
  if char_length(btrim(coalesce(p_explanation, ''))) < 20 then
    raise exception 'Explain what you did in at least 20 characters';
  end if;
  if p_photo_path is null or p_photo_path not like t.group_id::text || '/' || uid::text || '/%' then
    raise exception 'A photo is required';
  end if;
  select now() at time zone timezone into local_ts from profiles where id = uid;
  if local_ts::time < t.window_start or local_ts::time > t.window_end then
    raise exception 'Outside the check-in window (% to %)',
      to_char(t.window_start, 'HH24:MI'), to_char(t.window_end, 'HH24:MI');
  end if;
  insert into checkins (task_id, group_id, owner_id, date, photo_path, explanation)
  values (t.id, t.group_id, uid, local_ts::date, p_photo_path, btrim(p_explanation))
  on conflict (task_id, date) do update
    set photo_path = excluded.photo_path, explanation = excluded.explanation,
        status = 'submitted', created_at = now()
  returning * into c;
  return c;
end;
$$;

-- One other member approves or questions. The latest decision sets the check-in's status.
create function public.review_checkin(p_checkin uuid, p_decision text) returns public.checkins
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := require_user();
  c checkins;
begin
  select * into c from checkins where id = p_checkin for update;
  if not found or not is_member(c.group_id) then raise exception 'Check-in not found'; end if;
  if c.owner_id = uid then raise exception 'You cannot review your own check-in'; end if;
  if p_decision not in ('approve', 'question') then raise exception 'Unknown decision'; end if;
  insert into verifications (checkin_id, reviewer_id, decision) values (p_checkin, uid, p_decision)
  on conflict (checkin_id, reviewer_id) do update set decision = excluded.decision, created_at = now();
  update checkins set status = case p_decision when 'approve' then 'approved' else 'questioned' end
   where id = p_checkin returning * into c;
  return c;
end;
$$;

create function public.post_statement(p_strike uuid, p_statement text) returns public.strikes
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := require_user();
  s strikes;
begin
  select * into s from strikes where id = p_strike for update;
  if not found or s.user_id <> uid then raise exception 'Strike not found'; end if;
  if s.outcome <> 'pending' then raise exception 'This strike is already settled'; end if;
  if s.statement_at is not null then raise exception 'You already posted a statement'; end if;
  if char_length(btrim(coalesce(p_statement, ''))) < 1 then raise exception 'Write a statement first'; end if;
  update strikes set statement = btrim(p_statement), statement_at = now()
   where id = p_strike returning * into s;
  return s;
end;
$$;

create function public.cast_vote(p_strike uuid, p_choice text) returns void
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := require_user();
  s strikes;
begin
  select * into s from strikes where id = p_strike;
  if not found or not is_member(s.group_id) then raise exception 'Strike not found'; end if;
  if s.user_id = uid then raise exception 'You cannot vote on your own strike'; end if;
  if s.outcome <> 'pending' then raise exception 'This vote is closed'; end if;
  if s.statement_at is null then raise exception 'There is no statement to vote on yet'; end if;
  insert into votes (strike_id, voter_id, choice) values (p_strike, uid, p_choice)
  on conflict (strike_id, voter_id) do update set choice = excluded.choice, created_at = now();
end;
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.is_member(uuid), public.shares_group(uuid),
  public.create_group(text, text), public.join_group(text), public.leave_group(uuid),
  public.update_group(uuid, text, text),
  public.create_task(uuid, uuid, text, jsonb, time, time), public.set_task_status(uuid, text),
  public.submit_checkin(uuid, text, text), public.review_checkin(uuid, text),
  public.post_statement(uuid, text), public.cast_vote(uuid, text)
to authenticated;
