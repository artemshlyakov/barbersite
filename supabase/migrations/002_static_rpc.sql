begin;

-- Only a deployment owner can enroll the master's verified GoTrue UUID.
-- The singleton key prevents accidentally granting two accounts CRM access.
create table habib.crm_owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid unique not null
);
create table habib.booking_receipts (
  booking_id bigint primary key references habib.calendar(id) on delete cascade,
  received_at timestamptz not null default clock_timestamp()
);
create index booking_receipts_received on habib.booking_receipts(received_at);
alter table habib.crm_owner enable row level security;
alter table habib.booking_receipts enable row level security;
revoke all on schema habib from public, anon, authenticated;
revoke all on all tables in schema habib from public, anon, authenticated;
revoke all on all sequences in schema habib from public, anon, authenticated;
revoke all on all functions in schema habib from public, anon, authenticated;
alter function habib.slots(integer,date) set search_path=pg_catalog,habib,pg_temp;
alter function habib.reserve(integer,timestamptz,text,text,uuid) set search_path=pg_catalog,habib,pg_temp;

create function public.habib_services() returns jsonb
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(s) order by s.id),'[]'::jsonb) from
    (select id,name_ru,name_en,description_ru,description_en,price,minutes,active
     from habib.services where active) s
$$;

create function public.habib_slots(service integer, day date) returns jsonb
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('starts_at',s.starts_at) order by s.starts_at),'[]'::jsonb)
  from habib.slots($1,$2) s
$$;

create function public.habib_reserve(service integer, start_at timestamptz, phone text, name text, token uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare
  booking bigint;
  retry boolean;
begin
  if service is null or service<=0 or not isfinite(start_at) or start_at is null or token is null
     or name is null or length(btrim(name)) not between 1 and 100
     or phone is null or phone !~ '^[+][1-9][0-9]{7,14}$'
  then raise sqlstate 'PT400' using message='invalid_booking'; end if;

  -- The gateway does not promise an unspoofable IP header. A transaction-level
  -- lock enforces shared burst limits even when callers rotate phone numbers.
  perform pg_advisory_xact_lock(1314,1);
  select exists(select from habib.calendar where request_key=token) into retry;
  if not retry then
    if exists(select from habib.calendar b join habib.clients c on c.id=b.client_id
               where c.phone=$3 and b.status='pending' and upper(b.span)>now() offset 2)
       or exists(select from habib.booking_receipts where received_at>now()-interval '10 minutes' offset 7)
       or exists(select from habib.booking_receipts where received_at>now()-interval '24 hours' offset 39)
    then raise sqlstate 'PT429' using message='too_many_requests'; end if;
  end if;
  booking := habib.reserve(service,start_at,phone,btrim(name),token);
  if not retry then
    delete from habib.booking_receipts where received_at<=now()-interval '24 hours';
    insert into habib.booking_receipts(booking_id) values(booking);
  end if;
  return jsonb_build_object('id',booking);
exception
  when raise_exception or exclusion_violation or unique_violation then
    -- Constraint diagnostics can contain a conflicting row. Keep them private.
    raise sqlstate 'PT409' using message='slot unavailable';
  when check_violation or not_null_violation or foreign_key_violation or data_exception then
    raise sqlstate 'PT400' using message='invalid_booking';
end $$;

create view habib.crm_calendar as
select b.id, lower(b.span) as start_at,upper(b.span) as end_at,b.status,
       c.name,c.phone,b.client_id,b.service_id,b.booked_name_ru,b.booked_price,b.booked_minutes
from habib.calendar b left join habib.clients c on c.id=b.client_id;
revoke all on habib.crm_calendar from public, anon, authenticated;

create function public.habib_admin(action text,payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare
  result jsonb;
  d date; n integer; is_open boolean;
  start_at timestamptz; end_at timestamptz; t time;
  item habib.calendar%rowtype;
  target bigint; service_id integer; next_status habib.visit_status;
  ru text; en text; descr_ru text; descr_en text; amount integer; duration integer; visible boolean;
begin
  if not exists(select from habib.crm_owner o where o.user_id=auth.uid()) then
    raise insufficient_privilege using message='unauthorized';
  end if;
  if jsonb_typeof(payload) is distinct from 'object' or pg_column_size(payload)>16384 then
    raise sqlstate 'PT400' using message='invalid_json';
  end if;

  case action
  when 'calendar', 'days' then
    d:=(payload->>'day')::date;
    n:=coalesce((payload->>'days')::integer,1);
    if d is null or not isfinite(d) or n not between 1 and 7 then raise sqlstate 'PT400' using message='invalid_date'; end if;
    if action='calendar' then
      select jsonb_agg(to_jsonb(c) order by c.start_at,c.id) into result from habib.crm_calendar c
      where c.start_at < ((d+n)::timestamp at time zone 'Europe/Moscow') and c.end_at > (d::timestamp at time zone 'Europe/Moscow');
    else
      select jsonb_agg(to_jsonb(o) order by o.day) into result from habib.day_overrides o where o.day>=d and o.day<d+n;
    end if;
    return coalesce(result,'[]'::jsonb);
  when 'clients' then
    select jsonb_agg(to_jsonb(c) order by c.name,c.id) into result from
      (select id,name,phone from habib.clients
       where strpos(lower(name||' '||phone),lower(coalesce(payload->>'q','')))>0 order by name,id limit 500) c;
    return coalesce(result,'[]'::jsonb);
  when 'history' then
    select jsonb_agg(to_jsonb(c) order by c.start_at desc,c.id) into result from
      (select * from habib.crm_calendar v where v.client_id=(payload->>'client')::bigint order by v.start_at desc,v.id limit 500) c;
    return coalesce(result,'[]'::jsonb);
  when 'services' then
    select jsonb_agg(to_jsonb(s) order by s.id) into result from habib.services s;
    return coalesce(result,'[]'::jsonb);
  when 'service' then
    service_id:=(payload->>'id')::integer;
    ru:=btrim(payload->>'name_ru'); en:=btrim(payload->>'name_en');
    descr_ru:=coalesce(payload->>'description_ru',''); descr_en:=coalesce(payload->>'description_en','');
    amount:=(payload->>'price')::integer; duration:=(payload->>'minutes')::integer; visible:=(payload->>'active')::boolean;
    if length(coalesce(ru,'')) not between 1 and 100 or length(coalesce(en,'')) not between 1 and 100
        or length(descr_ru)>600 or length(descr_en)>600 or amount not between 0 and 9999999
        or duration not between 1 and 240 or visible is null then raise sqlstate 'PT400' using message='invalid_service'; end if;
    if service_id is null then
      insert into habib.services(name_ru,name_en,description_ru,description_en,price,minutes,active)
      values(ru,en,descr_ru,descr_en,amount,duration,visible);
    else
      update habib.services s set (name_ru,name_en,description_ru,description_en,price,minutes,active)=
        (ru,en,descr_ru,descr_en,amount,duration,visible) where s.id=service_id;
    end if;
  when 'service/delete' then
    delete from habib.services where id=(payload->>'id')::integer;
  when 'reserve' then
    target:=habib.reserve((payload->>'service')::integer,(payload->>'start_at')::timestamptz,
       payload->>'phone',btrim(payload->>'name'),(payload->>'token')::uuid);
    update habib.calendar set status='confirmed' where id=target and status='pending';
    return jsonb_build_object('id',target);
  when 'status' then
    next_status:=(payload->>'status')::habib.visit_status;
    if next_status is null then raise sqlstate 'PT400' using message='invalid_status'; end if;
    update habib.calendar set status=next_status where id=(payload->>'id')::bigint and status is not null
      and (status not in ('declined','cancelled') or status=next_status);
  when 'move' then
    start_at:=(payload->>'start_at')::timestamptz; d:=(start_at at time zone 'Europe/Moscow')::date; t:=(start_at at time zone 'Europe/Moscow')::time;
    perform pg_advisory_xact_lock(1313,d-date '2000-01-01');
    select * into item from habib.calendar where id=(payload->>'id')::bigint and status in ('pending','confirmed') for update;
    if not found or start_at is null or start_at<=now() or d-(now() at time zone 'Europe/Moscow')::date not between 0 and 29
      or t not between time '10:00' and time '18:30' or extract(minute from t)::int % 15<>0 or extract(second from t)<>0
      or not coalesce((select o.open from habib.day_overrides o where o.day=d),extract(isodow from d)<>2)
    then raise sqlstate 'PT409' using message='booking unavailable'; end if;
    update habib.calendar set span=tstzrange(start_at,start_at+make_interval(mins=>item.booked_minutes),'[)') where id=item.id;
  when 'block' then
    start_at:=(payload->>'start_at')::timestamptz; end_at:=(payload->>'end_at')::timestamptz;
    d:=(start_at at time zone 'Europe/Moscow')::date;
    if start_at is null or end_at is null or not isfinite(start_at) or not isfinite(end_at) or start_at>=end_at or end_at<=now()
       or d<>((end_at-interval '1 microsecond') at time zone 'Europe/Moscow')::date then raise sqlstate 'PT400' using message='invalid_time'; end if;
    perform pg_advisory_xact_lock(1313,d-date '2000-01-01');
    insert into habib.calendar(span) values(tstzrange(start_at,end_at,'[)'));
  when 'unblock' then
    delete from habib.calendar where id=(payload->>'id')::bigint and status is null;
  when 'day' then
    d:=(payload->>'day')::date; is_open:=(payload->>'open')::boolean;
    if d is null or not isfinite(d) or not (payload ? 'open') then raise sqlstate 'PT400' using message='invalid_day'; end if;
    perform pg_advisory_xact_lock(1313,d-date '2000-01-01');
    if not coalesce(is_open,extract(isodow from d)<>2) and exists(select from habib.calendar
      where status in ('pending','confirmed') and span && tstzrange(d::timestamp at time zone 'Europe/Moscow',(d+1)::timestamp at time zone 'Europe/Moscow','[)'))
    then raise sqlstate 'PT409' using message='day conflict'; end if;
    if is_open is null then
      delete from habib.day_overrides where day=d;
    else
      insert into habib.day_overrides(day,open) values(d,is_open) on conflict(day) do update set open=excluded.open;
    end if;
    return jsonb_build_object('ok',true);
  else raise sqlstate 'PT404' using message='not_found';
  end case;
  if not found then raise sqlstate 'PT404' using message='not_found'; end if;
  return jsonb_build_object('ok',true);
exception
  when exclusion_violation or foreign_key_violation or unique_violation then raise sqlstate 'PT409' using message='conflict';
  when raise_exception then raise sqlstate 'PT409' using message='booking unavailable';
  when data_exception or check_violation or not_null_violation then raise sqlstate 'PT400' using message='invalid_input';
end $$;

revoke all on function public.habib_services(),public.habib_slots(integer,date),
  public.habib_reserve(integer,timestamptz,text,text,uuid),public.habib_admin(text,jsonb)
  from public, anon, authenticated;
grant execute on function public.habib_services(),public.habib_slots(integer,date),
  public.habib_reserve(integer,timestamptz,text,text,uuid) to anon,authenticated;
grant execute on function public.habib_admin(text,jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
