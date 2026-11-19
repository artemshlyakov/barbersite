begin;
do $$
declare
 d date := (now() at time zone 'Europe/Moscow')::date + 1;
 t timestamptz;
 k uuid := gen_random_uuid();
 a bigint;
begin
 while extract(isodow from d) <> 2 loop d := d + 1; end loop;
 assert not exists(select from habib.slots(3,d));
 insert into habib.day_overrides values(d,true);
 assert (select count(*) from habib.slots(3,d)) = 35;
 t := (d + time '18:30') at time zone 'Europe/Moscow';
 a := habib.reserve(3,t,'+79990000000','Test',k);
 assert a = habib.reserve(3,t,'+79990000000','Test',k);
 assert (select upper(span) from habib.calendar where id=a) = t + interval '45 minutes';
 assert not exists(select from habib.slots(1,d) where starts_at = t - interval '15 minutes');
 assert exists(select from habib.slots(1,d) where starts_at = t - interval '30 minutes');
 begin
   insert into habib.calendar(span) values(tstzrange(t,t + interval '5 minutes'));
   raise exception 'block overlapped booking';
 exception when exclusion_violation then null;
 end;
 update habib.calendar set status='declined' where id=a;
 assert exists(select from habib.slots(3,d) where starts_at=t);
 assert not exists(select from habib.slots(1,d+30));
end $$;
rollback;
