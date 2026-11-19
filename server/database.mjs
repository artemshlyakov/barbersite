import http from 'node:http';
if (process.env.HTTPS_PROXY || process.env.https_proxy) http.setGlobalProxyFromEnv?.();
const databaseId = process.env.TATNET_DATABASE_ID || '76e89500-3c3b-4a6b-88c1-d0e361fa112d';
if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(databaseId)) throw new Error('Invalid TATNET_DATABASE_ID');
const base = 'https://api.min.tatnet.ru/v1/supabase/' + databaseId;
export function problem(status, message) { return Object.assign(new Error(message), {status}); }
export async function database(sql, write = false) {
  let response, result;
  try {
    response = await fetch(base + (write ? '/sql' : '/query'), {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(29000),
      headers: {Authorization: 'Bearer ' + process.env.TATNET_API_KEY, 'Content-Type': 'application/json'},
      body: JSON.stringify({sql, max_rows:1000})
    });
    result = await response.json();
  } catch { throw problem(503, 'database_unavailable'); }
  if (!response.ok) throw problem(503, 'database_unavailable');
  if (!result.ok) {
    const {message,sqlstate} = result.error || {};
    if (sqlstate === 'P0001' || ['23503','23505','23P01','23514'].includes(sqlstate)) {
      throw problem(409, ['slot unavailable','request key reused','day conflict','service in use','phone limit','booking unavailable'].includes(message) ? message : 'conflict');
    }
    throw problem(503, 'database_unavailable');
  }
  return result.results;
}
export async function rows(select) {
  const result = await database('SELECT row_to_json(record)::text FROM (' + select + ') AS record');
  return result[0].rows.map(([json]) => JSON.parse(json));
}
export function str(value, max, empty=false) {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim()) || value.includes('\0')) throw problem(400,'invalid_text');
  // TatNet accepts SQL without bind parameters. Only hexadecimal bytes enter the literal.
  return "convert_from(decode('" + Buffer.from(value.trim()).toString('hex') + "','hex'),'UTF8')";
}
export function num(value,min=1,max=2147483647) {
  if ((typeof value !== 'number' && typeof value !== 'string') || !/^\d+$/.test(String(value)) || !Number.isSafeInteger(+value) || +value<min || +value>max) throw problem(400,'invalid_number');
  return +value;
}
export function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(value) || isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0,10)!==value) throw problem(400,'invalid_date');
  return "'" + value + "'::date";
}
export function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d[T ]\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d(?::?\d\d)?)$/.test(value)) throw problem(400,'invalid_time');
  const normalized = value.replace(' ','T').replace(/([+-]\d\d)$/, '$1:00');
  if (isNaN(Date.parse(normalized))) throw problem(400,'invalid_time');
  return "'" + new Date(normalized).toISOString() + "'::timestamptz";
}
export function boolean(value) {
  if (typeof value !== 'boolean') throw problem(400,'invalid_boolean');
  return String(value);
}
export async function reserve(data,manual) {
  const {service,start_at,phone,name,token} = data;
  if (typeof phone !== 'string' || !/^\+[1-9]\d{7,14}$/.test(phone) || typeof token !== 'string' || !/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(token)) throw problem(400,'invalid_booking');
  const key = str(token,36)+'::uuid', tel=str(phone,17), when=instant(start_at);
  const checkLimit = manual ? '' : `if not exists(select from habib.calendar where request_key=${key}) and
    (select count(*) from habib.calendar b join habib.clients c on c.id=b.client_id where c.phone=${tel} and status='pending' and upper(span)>now())>=3
    then raise exception 'phone limit'; end if;`;
  const result=await database(`begin;
    do $$ declare booking bigint; begin
      perform pg_advisory_xact_lock(hashtextextended(${tel},45));
      ${checkLimit}
      booking:=habib.reserve(${num(service)},${when},${tel},${str(name,100)},${key});
      ${manual ? "update habib.calendar set status='confirmed' where id=booking and status='pending';" : ''}
    end $$;
    select id from habib.calendar where request_key=${key};
    commit;`,true);
  return {id:result.find(r=>r.columns?.includes('id')).rows[0][0]};
}
