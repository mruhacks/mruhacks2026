\set ev '69bcd2db-ada4-4fdf-b417-fc3a4bf6b4e4'

delete from check_ins where event_id = :'ev'
   or event_id in (select id from events where parent_event_id = :'ev');

-- 78 of the 84 accepted arrived at the door; the last 6 never showed up.
insert into check_ins (event_id, user_id, checked_in_at)
select :'ev', u.user_id, (select starts_at from events where id = :'ev') + interval '30 minutes'
from (
  select p.user_id, row_number() over (order by p.user_id) rn
  from event_participants p
  join participation_statuses s on s.id = p.status_id
  where p.event_id = :'ev' and s.label = 'accepted'
) u
where u.rn <= 78;

-- Attendance thins out meal by meal, so people end up with missed streaks of
-- 0 through 3 and the newest meal is still in progress.
insert into check_ins (event_id, user_id, checked_in_at)
select m.id, u.user_id, m.starts_at + interval '10 minutes'
from (
  select e.id, e.starts_at, c.cap
  from (
    select id, starts_at, row_number() over (order by starts_at) k
    from events
    where parent_event_id = :'ev'
      and event_type_id = (select id from event_types where label = 'meal')
      and starts_at <= now()
  ) e
  join (values (1, 78), (2, 70), (3, 60), (4, 50), (5, 40)) as c(k, cap)
    on c.k = e.k
) m
join (
  select p.user_id, row_number() over (order by p.user_id) rn
  from event_participants p
  join participation_statuses s on s.id = p.status_id
  where p.event_id = :'ev' and s.label = 'accepted'
) u on u.rn <= m.cap;

select e.name, t.label as type, e.starts_at,
       (select count(*) from check_ins c where c.event_id = e.id) as scans
from events e left join event_types t on t.id = e.event_type_id
where e.id = :'ev' or e.parent_event_id = :'ev'
order by e.starts_at;
