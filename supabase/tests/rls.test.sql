-- Access-rule and write-function tests. Any failed expectation raises and aborts the run.
\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null

create schema t;
create function t.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), false);
end $$;

-- Runs a statement that must fail with a message containing `needle`.
create function t.must_fail(stmt text, needle text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlerrm ilike '%' || needle || '%' then return; end if;
    raise exception 'expected error containing "%", got "%"', needle, sqlerrm;
  end;
  raise exception 'expected failure (%) but statement succeeded: %', needle, stmt;
end $$;

create function t.eq(actual anyelement, expected anyelement, label text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL %: expected %, got %', label, expected, actual;
  end if;
  raise notice 'ok  %', label;
end $$;
grant usage on schema t to authenticated, anon;
grant execute on all functions in schema t to authenticated, anon;

-- Users: ana, ben, cal share a group. dee is an outsider.
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', '{"display_name":"Ana","timezone":"America/Toronto"}'),
  ('00000000-0000-0000-0000-00000000000b', '{"display_name":"Ben","timezone":"America/Toronto"}'),
  ('00000000-0000-0000-0000-00000000000c', '{"display_name":"Cal","timezone":"Asia/Seoul"}'),
  ('00000000-0000-0000-0000-00000000000d', '{"display_name":"Dee"}');
\set ana '''00000000-0000-0000-0000-00000000000a'''
\set ben '''00000000-0000-0000-0000-00000000000b'''
\set cal '''00000000-0000-0000-0000-00000000000c'''
\set dee '''00000000-0000-0000-0000-00000000000d'''

select t.eq((select count(*) from public.profiles), 4::bigint, 'signup trigger creates a profile');
select t.eq((select timezone from public.profiles where display_name = 'Dee'), 'UTC', 'timezone defaults to UTC');

set role authenticated;

-- Groups and invites ------------------------------------------------------------------------
select t.as_user(:ana);
select id as gid, invite_code as code from public.create_group('Study crew', 'Most strikes buys coffee') \gset
select t.eq((select role from public.memberships where group_id = :'gid'), 'admin', 'creator becomes admin');
select t.eq(length(:'code'), 6, 'invite code is 6 characters');

select t.as_user(:dee);
select t.eq((select count(*) from public.groups), 0::bigint, 'outsider sees no groups');
select t.eq((select count(*) from public.profiles), 1::bigint, 'outsider sees only their own profile');
select t.must_fail('select public.join_group(''NOPE99'')', 'invite code');

select t.as_user(:ben);
select public.join_group(lower(:'code')) is not null as joined \gset
select t.as_user(:cal);
select public.join_group(:'code') is not null as joined \gset
select t.eq((select count(*) from public.memberships where group_id = :'gid'), 3::bigint, 'members see the roster');
select t.eq((select count(*) from public.profiles), 3::bigint, 'members see each other''s profiles, not outsiders');

-- Server-owned columns ----------------------------------------------------------------------
select t.as_user(:ana);
select t.must_fail('update public.groups set current_streak = 99', 'permission denied');
select t.must_fail('insert into public.memberships (group_id, user_id) select id, ''00000000-0000-0000-0000-00000000000d'' from public.groups', 'permission denied');
select t.must_fail('update public.profiles set id = gen_random_uuid()', 'permission denied');
update public.profiles set display_name = 'Ana K' where id = :ana;
select t.eq((select display_name from public.profiles where id = :ana), 'Ana K', 'member can edit own profile');
update public.profiles set display_name = 'Hacked' where id = :ben;
select t.eq((select display_name from public.profiles where id = :ben), 'Ben', 'member cannot edit another profile');

-- Tasks -------------------------------------------------------------------------------------
select id as t_self from public.create_task(:'gid', :ana, 'Gym', '{"kind":"daily"}', '00:00', '23:59') \gset
select t.eq((select status from public.tasks where id = :'t_self'), 'active', 'own task starts active');
select t.eq((select active_from from public.tasks where id = :'t_self'),
                  (now() at time zone 'America/Toronto')::date, 'own task is due from today in owner timezone');

select id as t_for_ben from public.create_task(:'gid', :ben, 'Read 20 pages', '{"kind":"weekdays","days":[1,3,5]}') \gset
select t.eq((select status from public.tasks where id = :'t_for_ben'), 'pending', 'task set for a friend starts pending');
select t.must_fail(format('select public.set_task_status(%L, ''active'')', :'t_for_ben'), 'Only the owner');
select t.must_fail(format('select public.create_task(%L, %L, ''x'', ''{"kind":"daily"}'')', :'gid', '00000000-0000-0000-0000-00000000000d'), 'not in this group');

select public.create_task(:'gid', :ana, 'Task 2', '{"kind":"daily"}') is not null as ok \gset
select public.create_task(:'gid', :ana, 'Task 3', '{"kind":"daily"}') is not null as ok \gset
select t.must_fail(format('select public.create_task(%L, %L, ''Task 4'', ''{"kind":"daily"}'')', :'gid', '00000000-0000-0000-0000-00000000000a'), '3 active tasks');

select t.as_user(:ben);
select t.must_fail(format('select public.submit_checkin(%L, %L, ''Read chapters four and five tonight'')', :'t_for_ben', :'gid' || '/00000000-0000-0000-0000-00000000000b/x.jpg'), 'not active');
select public.set_task_status(:'t_for_ben', 'active') is not null as ok \gset
select t.eq((select status from public.tasks where id = :'t_for_ben'), 'active', 'owner accepts a pending task');
select t.must_fail(format('select public.set_task_status(%L, ''pending'')', :'t_for_ben'), 'Cannot change');

select t.as_user(:dee);
select t.eq((select count(*) from public.tasks), 0::bigint, 'outsider sees no tasks');
select t.must_fail(format('select public.create_task(%L, %L, ''x'', ''{"kind":"daily"}'')', :'gid', '00000000-0000-0000-0000-00000000000d'), 'not in this group');

-- Check-ins ---------------------------------------------------------------------------------
select t.as_user(:ana);
\set photo :gid '/00000000-0000-0000-0000-00000000000a/one.jpg'
select t.must_fail(format('select public.submit_checkin(%L, %L, ''too short'')', :'t_self', :'photo'), '20 characters');
select t.must_fail(format('select public.submit_checkin(%L, null, ''Did the full leg day session'')', :'t_self'), 'photo is required');
select t.must_fail(format('select public.submit_checkin(%L, %L, ''Did the full leg day session'')', :'t_self', :'gid' || '/00000000-0000-0000-0000-00000000000b/x.jpg'), 'photo is required');
select id as cid from public.submit_checkin(:'t_self', :'photo', 'Did the full leg day session') \gset
select t.eq((select date from public.checkins where id = :'cid'),
                  (now() at time zone 'America/Toronto')::date, 'check-in date is the owner''s local date');
select public.submit_checkin(:'t_self', :'photo', 'Retake: did the full leg day session') is not null as ok \gset
select t.eq((select count(*) from public.checkins where task_id = :'t_self'), 1::bigint, 'retake replaces, one check-in per task per day');
select t.must_fail(format('select public.review_checkin(%L, ''approve'')', :'cid'), 'your own check-in');
select t.must_fail('insert into public.checkins (task_id, group_id, owner_id, date, explanation) select id, group_id, owner_id, current_date - 1, ''back-dated proof of yesterday'' from public.tasks limit 1', 'permission denied');
select t.must_fail('update public.checkins set status = ''approved''', 'permission denied');

-- A window that has already closed today (or not opened yet) rejects the check-in.
reset role;
update public.tasks set window_start = '00:00', window_end = '00:01'
 where title = 'Task 2' and (now() at time zone 'America/Toronto')::time > '00:01';
update public.tasks set window_start = '23:58', window_end = '23:59'
 where title = 'Task 2' and (now() at time zone 'America/Toronto')::time <= '00:01';
select id as t_closed from public.tasks where title = 'Task 2' \gset
set role authenticated;
select t.must_fail(format('select public.submit_checkin(%L, %L, ''Did the full leg day session'')', :'t_closed', :'photo'), 'Outside the check-in window');

-- Verification ------------------------------------------------------------------------------
select t.as_user(:dee);
select t.eq((select count(*) from public.checkins), 0::bigint, 'outsider sees no check-ins');
select t.must_fail(format('select public.review_checkin(%L, ''approve'')', :'cid'), 'not found');

select t.as_user(:ben);
select public.review_checkin(:'cid', 'question') is not null as ok \gset
select t.eq((select status from public.checkins where id = :'cid'), 'questioned', 'a friend can question a check-in');
insert into public.comments (checkin_id, author_id, body) values (:'cid', :ben, 'Is that today?');
select t.must_fail(format('insert into public.comments (checkin_id, author_id, body) values (%L, %L, ''spoof'')', :'cid', '00000000-0000-0000-0000-00000000000a'), 'row-level security');
select public.review_checkin(:'cid', 'approve') is not null as ok \gset
select t.eq((select status from public.checkins where id = :'cid'), 'approved', 'the reviewer can change to approve');
select t.eq((select count(*) from public.verifications where checkin_id = :'cid'), 1::bigint, 'one verification per reviewer');

-- Strikes, statements, votes ----------------------------------------------------------------
reset role;
insert into public.strikes (group_id, user_id, date) values (:'gid', :cal, current_date - 1) returning id as sid \gset
set role authenticated;

select t.as_user(:ana);
select t.must_fail(format('select public.cast_vote(%L, ''excuse'')', :'sid'), 'no statement');
select t.must_fail(format('select public.post_statement(%L, ''not mine'')', :'sid'), 'not found');
select t.must_fail('update public.strikes set outcome = ''excused''', 'permission denied');

select t.as_user(:cal);
select public.post_statement(:'sid', 'Flight was delayed six hours') is not null as ok \gset
select t.must_fail(format('select public.post_statement(%L, ''again'')', :'sid'), 'already posted');
select t.must_fail(format('select public.cast_vote(%L, ''excuse'')', :'sid'), 'your own strike');

select t.as_user(:ana);
select public.cast_vote(:'sid', 'uphold');
select public.cast_vote(:'sid', 'excuse');
select t.eq((select choice from public.votes where strike_id = :'sid' and voter_id = :ana), 'excuse', 'a voter can change their vote, one row');
select t.as_user(:dee);
select t.eq((select count(*) from public.strikes), 0::bigint, 'statements are private to the group');
select t.must_fail(format('select public.cast_vote(%L, ''uphold'')', :'sid'), 'not found');

-- Nudges, reports, blocks -------------------------------------------------------------------
select t.as_user(:ana);
insert into public.nudges (group_id, from_id, to_id) values (:'gid', :ana, :ben);
select t.must_fail(format('insert into public.nudges (group_id, from_id, to_id) values (%L, %L, %L)', :'gid', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b'), 'duplicate key');
select t.must_fail(format('insert into public.nudges (group_id, from_id, to_id) values (%L, %L, %L)', :'gid', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000d'), 'row-level security');
insert into public.reports (reporter_id, target_user_id, checkin_id, reason) values (:ana, :ben, null, 'Rude comment');
select t.as_user(:ben);
select t.eq((select count(*) from public.reports), 0::bigint, 'a reported user cannot see the report');
insert into public.blocks (blocker_id, blocked_id) values (:ben, :ana);
select t.as_user(:ana);
select t.eq((select count(*) from public.blocks), 0::bigint, 'blocks are visible only to the blocker');
select t.must_fail(format('select public.create_task(%L, %L, ''Blocked'', ''{"kind":"daily"}'')', :'gid', '00000000-0000-0000-0000-00000000000b'), 'cannot set tasks');

-- Leaving -----------------------------------------------------------------------------------
select public.leave_group(:'gid');
select t.eq((select count(*) from public.groups), 0::bigint, 'after leaving, the group is no longer readable');
select t.as_user(:ben);
select t.eq((select role from public.memberships where group_id = :'gid' and user_id = :ben), 'admin', 'admin role passes on when the admin leaves');
select t.eq((select count(*) from public.tasks where owner_id = :ana and status <> 'ended'), 0::bigint, 'a leaver''s tasks end');

-- Signed-out and anonymous ------------------------------------------------------------------
select t.as_user(null);
select t.must_fail('select public.create_group(''x'', '''')', 'not signed in');
set role anon;
select t.must_fail('select count(*) from public.groups', 'permission denied');
select t.must_fail('select public.join_group(''ABCDEF'')', 'permission denied');
reset role;

-- Account deletion cascades -----------------------------------------------------------------
delete from auth.users where id = :cal;
select t.eq((select count(*) from public.strikes), 0::bigint, 'deleting an account removes its strikes');
select t.eq((select count(*) from public.memberships where user_id = :cal), 0::bigint, 'deleting an account removes its memberships');

\o
\echo ALL DATABASE TESTS PASSED
