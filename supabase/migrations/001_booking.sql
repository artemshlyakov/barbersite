begin;
create schema habib;
revoke all on schema habib from public;
alter default privileges in schema habib revoke execute on functions from public;

create table habib.services (
 id integer generated always as identity primary key,
 name_ru text not null, name_en text not null,
 description_ru text not null default '', description_en text not null default '',
 price integer not null check (price >= 0),
 minutes integer not null check (minutes between 1 and 240),
 active boolean not null default true
);
insert into habib.services (name_ru,name_en,price,minutes) values
 ('Стрижка','Haircut',1000,30), ('Борода','Beard trim',1000,30),
 ('Удлинённая стрижка','Long haircut',1700,45);

create table habib.day_overrides (day date primary key, open boolean not null);
create table habib.clients (
 id bigint generated always as identity primary key,
 phone text unique not null check (phone ~ '^[+][1-9][0-9]{7,14}$'),
 name text not null check (length(trim(name)) between 1 and 100)
);
create type habib.visit_status as enum
 ('pending','confirmed','completed','cancelled','declined','no_show');
-- One calendar for the single master. Blocks and appointments compete for the same space.
create table habib.calendar (
 id bigint generated always as identity primary key,
 span tstzrange not null check (not isempty(span) and lower(span) is not null and
   upper(span) is not null and lower_inc(span) and not upper_inc(span)),
 status habib.visit_status,
 client_id bigint references habib.clients,
 service_id integer references habib.services,
 booked_price integer, booked_minutes integer, booked_name_ru text, booked_name_en text,
 request_key uuid unique, request_payload jsonb,
 check ((status is null and client_id is null and service_id is null) or
   (status is not null and client_id is not null and service_id is not null and booked_price is not null
    and booked_minutes is not null and booked_name_ru is not null and booked_name_en is not null)),
 exclude using gist (span with &&) where (status is null or status not in ('declined','cancelled'))
);
create index on habib.calendar(client_id);
create function habib.slots(service integer, day date)
returns table (starts_at timestamptz) language sql stable set search_path = pg_catalog,habib as $$
 select t from services s
 cross join generate_series((day + time '10:00') at time zone 'Europe/Moscow',
   (day + time '18:30') at time zone 'Europe/Moscow', interval '15 minutes') t
 where s.id = service and s.active and t > statement_timestamp()
 and day - (statement_timestamp() at time zone 'Europe/Moscow')::date between 0 and 29
 and coalesce((select o.open from day_overrides o where o.day = $2), extract(isodow from day) <> 2)
 and not exists (select from calendar c where (status is null or status not in ('declined','cancelled'))
 and c.span && tstzrange(t,t + make_interval(mins => s.minutes),'[)'))
 order by t
$$;
create function habib.reserve(service integer, start_at timestamptz, phone_number text, client_name text, token uuid)
returns bigint language plpgsql set search_path = pg_catalog,habib as $$
declare
 day date := (start_at at time zone 'Europe/Moscow')::date;
 payload jsonb := jsonb_build_array(service,extract(epoch from start_at),phone_number,trim(client_name));
 existing calendar%rowtype;
 item services%rowtype;
 customer bigint;
 result bigint;
begin
 if token is null then raise exception 'request key required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(token::text,0));
 select * into existing from calendar where request_key = token;
 if found then
   if existing.request_payload <> payload then raise exception 'request key reused'; end if;
   return existing.id;
 end if;
 -- Schedule editors must take this same day lock before closing or reopening a date.
 perform pg_advisory_xact_lock(1313, day - date '2000-01-01');
 select * into item from services where id = service for share;
 if not exists (select from habib.slots(service,day) where starts_at = start_at)
 then raise exception 'slot unavailable'; end if;
 insert into clients(phone,name) values(phone_number,trim(client_name))
 on conflict(phone) do update set phone = excluded.phone returning id into customer;
 insert into calendar(span,status,client_id,service_id,booked_price,booked_minutes,
   booked_name_ru,booked_name_en,request_key,request_payload)
 values(tstzrange(start_at,start_at + make_interval(mins => item.minutes),'[)'),
   'pending',customer,service,item.price,item.minutes,item.name_ru,item.name_en,token,payload)
 returning id into result;
 return result;
end $$;
commit;
