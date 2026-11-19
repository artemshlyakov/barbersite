import {problem,database,rows,num,str,date,instant,boolean,reserve} from './database.mjs';
const zone="'Europe/Moscow'";
const calendar=`select b.id, lower(span) as start_at,upper(span) as end_at,status,c.name,c.phone,
  b.client_id,b.service_id,b.booked_name_ru,b.booked_price,b.booked_minutes
  from habib.calendar b left join habib.clients c on c.id=b.client_id`;
const dayLock = day => `perform pg_advisory_xact_lock(1313,${day} - date '2000-01-01');`;
export async function adminRead(path,params) {
  switch(path) {
    case '/admin/services': return rows('select * from habib.services order by id');
    case '/admin/clients': {
      const term=str(params.get('q')||'',100,true);
      return rows(`select id,name,phone from habib.clients where position(lower(${term}) in lower(name||' '||phone))>0 order by name,id limit 500`);
    }
    case '/admin/history': return rows(calendar+` where b.client_id=${num(params.get('client'))} order by lower(span) desc limit 500`);
    case '/admin/days':
    case '/admin/calendar': {
      const day=date(params.get('day')), n=num(params.get('days')||1,1,7);
      if(path==='/admin/days') return rows(`select day,open from habib.day_overrides where day>=${day} and day<${day}+${n} order by day`);
      return rows(calendar+` where span && tstzrange(${day}::timestamp at time zone ${zone},(${day}+${n})::timestamp at time zone ${zone},'[)') order by lower(span),b.id`);
    }
    default: throw problem(404,'not_found');
  }
}
async function changed(sql) {
  const result=await database(sql,true);
  if (!result[0].rows_affected) throw problem(404,'not_found');
  return {ok:true};
}
async function guarded(body,declare='') {
  await database('do $$ '+declare+' begin '+body+' end $$;',true);
  return {ok:true};
}
export async function adminWrite(path,b) {
  switch(path) {
    case '/admin/reserve': return reserve(b,true);
    case '/admin/service': {
      const vals=[str(b.name_ru,100),str(b.name_en,100),str(b.description_ru||'',600,true),str(b.description_en||'',600,true),num(b.price,0,9999999),num(b.minutes,1,240),boolean(b.active)];
      const cols='name_ru,name_en,description_ru,description_en,price,minutes,active';
      return changed(b.id ? `update habib.services set (${cols})=(${vals}) where id=${num(b.id)} returning id` : `insert into habib.services(${cols}) values(${vals}) returning id`);
    }
    case '/admin/service/delete': return changed(`delete from habib.services where id=${num(b.id)} returning id`);
    case '/admin/status': {
      if (!['pending','confirmed','completed','declined','cancelled','no_show'].includes(b.status)) throw problem(400,'invalid_status');
      // A released interval must be rebooked through availability checks.
      return changed(`update habib.calendar set status=${str(b.status,12)}::habib.visit_status where id=${num(b.id)} and status is not null and
       (status not in ('declined','cancelled') or status=${str(b.status,12)}::habib.visit_status) returning id`);
    }
    case '/admin/unblock': return changed(`delete from habib.calendar where id=${num(b.id)} and status is null returning id`);
    case '/admin/block': {
      const start=instant(b.start_at),end=instant(b.end_at);
      return guarded(`if ${start}>=${end} or ${end}<=now() or (${start} at time zone ${zone})::date<>((${end}-interval '1 microsecond') at time zone ${zone})::date then raise exception 'slot unavailable'; end if;
        ${dayLock('('+start+' at time zone '+zone+')::date')}
        insert into habib.calendar(span) values(tstzrange(${start},${end},'[)'));`);
    }
    case '/admin/day': {
      const day=date(b.day);
      const close=b.open===false ? 'true' : b.open===null ? `extract(isodow from ${day})=2` : 'false';
      return guarded(`${dayLock(day)}
        if (${close}) and exists(select from habib.calendar where status in ('pending','confirmed') and span && tstzrange(${day}::timestamp at time zone ${zone},(${day}+1)::timestamp at time zone ${zone},'[)'))
        then raise exception 'day conflict'; end if;
        ${b.open===null ? `delete from habib.day_overrides where day=${day}` : `insert into habib.day_overrides values(${day},${boolean(b.open)}) on conflict(day) do update set open=excluded.open`};`);
    }
    case '/admin/move': {
      const start=instant(b.start_at);
      return guarded(`${dayLock('d')}
        select * into item from habib.calendar where id=${num(b.id)} and status in ('confirmed','pending') for update;
        if not found then raise exception 'booking unavailable'; end if;
        if ${start}<=now() or d-(now() at time zone ${zone})::date not between 0 and 29
          or t not between time '10:00' and time '18:30' or extract(minute from t)::int%15<>0 or extract(second from t)<>0
          or not coalesce((select open from habib.day_overrides where day=d),extract(isodow from d)<>2) then raise exception 'slot unavailable'; end if;
        update habib.calendar set span=tstzrange(${start},${start}+make_interval(mins=>item.booked_minutes),'[)') where id=item.id;`,
        `declare d date:=(${start} at time zone ${zone})::date; t time:=(${start} at time zone ${zone})::time; item habib.calendar%rowtype;`);
    }
    default:throw problem(404,'not_found');
  }
}
