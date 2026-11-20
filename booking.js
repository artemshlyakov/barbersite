import { api } from './api.js';

const en = document.documentElement.lang.startsWith('en');
const tr = (ru, english) => en ? english : ru;
const locale = en ? 'en-GB' : 'ru-RU';
const zone = 'Europe/Moscow';
const dayKey = new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' });
const dayLabel = new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' });
const clock = new Intl.DateTimeFormat(locale, { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle:'h23' });
const currencyFormatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
const money = value => currencyFormatter.format(value) + ' ₽';
const title = item => en ? item.name_en : item.name_ru;
const el = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const addDays = (day, days) => new Date(Date.parse(day+'T12:00:00Z') + days * 86400000).toISOString().slice(0,10);
const dateOf = day => new Date(day+'T12:00:00Z');
const button = (text, cls, onClick) => {
  const node = el('button', text, cls);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
};

const dialog = el('dialog', null, 'book-dialog');
dialog.setAttribute('aria-labelledby','booking-heading');
dialog.innerHTML = `
  <header><h2 id="booking-heading">${tr('Запись к Хабибу','Book with Habib')}</h2>
    <button type="button" class="bk-icon" data-close aria-label="${tr('Закрыть','Close')}">×</button></header>
  <form><fieldset><div class="bk-layout">
    <div><label class="bk-label">${tr('Услуга','Service')}<select name="service" required></select></label>
      <div class="bk-month"><button type="button" class="bk-icon" data-prev aria-label="${tr('Предыдущий месяц','Previous month')}">‹</button>
      <strong aria-live="polite"></strong><button type="button" class="bk-icon" data-next aria-label="${tr('Следующий месяц','Next month')}">›</button></div>
      <div class="bk-week" aria-hidden="true"></div><div class="bk-dates" role="group" aria-label="${tr('Дата визита','Appointment date')}"></div>
      <p class="bk-time-caption">${tr('Свободное время · Москва','Available times · Moscow')}</p>
      <div class="bk-times" role="group" aria-label="${tr('Время визита','Appointment time')}"></div><p class="bk-msg" data-slots role="status"></p>
    </div>
    <div class="bk-details"><h3>${tr('Ваш визит','Your visit')}</h3><p class="bk-summary" aria-live="polite"></p>
      <label class="bk-label">${tr('Имя','Name')}<input name="name" autocomplete="given-name" maxlength="100" required></label>
      <label class="bk-label">${tr('Телефон','Phone')}<input type="tel" name="phone" autocomplete="tel" maxlength="32" placeholder="+7 …" required></label>
      <button class="bk-submit" type="submit" disabled>${tr('Отправить заявку','Request appointment')}</button>
    </div>
  </div></fieldset></form>
  <p role="status" class="bk-msg" data-result></p><button class="bk-retry" type="button" hidden>${tr('Обновить','Refresh')}</button>
  <p class="bk-contact">${tr('Связаться с Хабибом','Contact Habib')} · <a href="tel:+79040339177">+7 904 033 9177</a> · <a href="https://t.me/khabiBarber" target="_blank" rel="noopener noreferrer">Telegram</a></p>`;
document.body.append(dialog);
const $ = selector => dialog.querySelector(selector);
const form = $('form');
const select = form.elements.service;
const result = $('[data-result]');
const retry = $('.bk-retry');
const priceStatus = document.getElementById('price-status');
const pickService = tr('Выберите услугу','Select a service');
const noServices = tr('Сейчас нет услуг для онлайн-записи. Свяжитесь с Хабибом напрямую.','No services are currently available to book online. Please contact Habib.');
const loadError = tr('Не удалось загрузить расписание. Обновите данные или свяжитесь с Хабибом.','Could not load booking details. Refresh or contact Habib directly.');
let services = [], today, lastDay, day, month, start = '', slotVersion = 0, catalogueVersion = 0, busy = false, attempt = null;
const service = () => services.find(s => String(s.id) === select.value);
const serviceDetails = item => money(item.price)+' · '+item.minutes+tr(' мин',' min');
const weekdays = tr('Пн Вт Ср Чт Пт Сб Вс','Mo Tu We Th Fr Sa Su').split(' ');
$('.bk-week').append(...weekdays.map(w => el('span',w)));

function setRange() {
  today = dayKey.format(new Date());
  lastDay = addDays(today,29);
  if (!day || day < today || day > lastDay) day = today;
  month = day.slice(0,7);
}
function renderDays() {
  const first = dateOf(month+'-01');
  $('.bk-month strong').textContent = first.toLocaleDateString(locale,{month:'long',year:'numeric',timeZone:'UTC'});
  $('[data-prev]').disabled = month <= today.slice(0,7);
  $('[data-next]').disabled = month >= lastDay.slice(0,7);
  const days = $('.bk-dates');
  days.replaceChildren(...Array.from({length:(first.getUTCDay()+6)%7},()=>el('span')));
  for (let date = month+'-01'; date.startsWith(month); date = addDays(date,1)) {
    const b = button(Number(date.slice(-2)), 'bk-choice', () => {
      day = date;
      for (const other of days.querySelectorAll('button')) other.setAttribute('aria-pressed', String(other===b));
      refreshSlots();
    });
    b.setAttribute('aria-label',dayLabel.format(dateOf(date)));
    b.setAttribute('aria-pressed',String(date===day));
    b.disabled = date < today || date > lastDay;
    days.append(b);
  }
}
function summary() {
  const item = service();
  $('.bk-summary').textContent = item ? [title(item),serviceDetails(item),dayLabel.format(dateOf(day)),start && clock.format(new Date(start))].filter(Boolean).join(' · ') : pickService;
  $('.bk-submit').disabled = busy || !item || !start;
}
// Keep only the last price seen for each service in this tab. Both languages share the same catalogue.
const seenKey = 'habib.booking.prices.v1';
let seenPrices = new Map();
try { seenPrices = new Map(JSON.parse(sessionStorage.getItem(seenKey) || '[]')); } catch { /* Storage may be disabled. */ }
function rememberPrice(id, price) {
  seenPrices.set(id, price);
  try { sessionStorage.setItem(seenKey, JSON.stringify([...seenPrices])); } catch { /* In-memory state still works. */ }
}

const motion = matchMedia('(prefers-reduced-motion: reduce)');
const priceContainer = document.getElementById('booking-prices');
let catalogueSignature = null;
const priceObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  for (const {target, isIntersecting, intersectionRatio} of entries) {
    if (!isIntersecting || intersectionRatio < 0.3 || !target.isConnected) continue;
    priceObserver.unobserve(target);
    const id = target.dataset.serviceId;
    const price = Number(target.dataset.priceCount);
    if (seenPrices.get(id) === price) continue;
    rememberPrice(id, price);
    if (!price || motion.matches) continue;
    target.textContent = money(0);
    const started = performance.now();
    const update = now => {
      if (!target.isConnected) return;
      const progress = motion.matches ? 1 : Math.max(0, Math.min((now - started) / 1400, 1));
      const eased = 1 - (1 - progress) ** 3;
      target.textContent = money(Math.round(price * eased));
      if (progress < 1) requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
  }
}, {threshold: 0.3}) : null;

function renderPrices() {
  const signature = JSON.stringify(services.map(item => [
    item.id, title(item), en ? item.description_en : item.description_ru, item.minutes, item.price
  ]));
  if (signature !== catalogueSignature) {
    catalogueSignature = signature;
    priceObserver?.disconnect();
    const rows = services.map(item => {
      const row = el('div',null,'price-row');
      const info = el('div');
      info.append(el('h3',title(item)));
      const description = en ? item.description_en : item.description_ru;
      info.append(el('small',[item.minutes+tr(' мин',' min'),description].filter(Boolean).join(' · ')));
      const amount = el('strong',money(item.price));
      amount.dataset.priceCount = item.price;
      amount.dataset.serviceId = item.id;
      if (seenPrices.get(String(item.id)) !== item.price) priceObserver?.observe(amount);
      row.append(info,amount);
      return row;
    });
    priceContainer.replaceChildren(...rows);
  }
  priceStatus.hidden = services.length > 0;
  priceStatus.textContent = noServices;
}
async function catalogue() {
  const version = ++catalogueVersion;
  try {
    const data = await api('/services');
    if (version!==catalogueVersion) return;
    services = data.filter(item=>item.active!==false);
    renderPrices();
    const selected = select.value;
    select.replaceChildren(new Option(pickService,''),...services.map(s => new Option(title(s)+' · '+serviceDetails(s), s.id)));
    if (services.some(s=>String(s.id)===selected)) select.value = selected;
    result.textContent = services.length ? '' : noServices;
    retry.hidden = true;
    if (dialog.open) await refreshSlots();
  } catch {
    if (version!==catalogueVersion) return;
    services = [];
    select.replaceChildren(new Option(pickService,''));
    priceObserver?.disconnect();
    catalogueSignature = null;
    priceContainer.replaceChildren();
    priceStatus.hidden = false;
    priceStatus.textContent = tr('Актуальный прайс временно недоступен. Уточните цену у Хабиба.','Live prices are temporarily unavailable. Please contact Habib for prices.');
    result.textContent = loadError;
    retry.hidden = false;
    if (dialog.open) await refreshSlots();
  }
}
async function refreshSlots() {
  const version = ++slotVersion;
  const times = $('.bk-times'), status = $('[data-slots]');
  start = '';
  times.replaceChildren(); summary();
  if (!service()) { status.textContent = tr('Сначала выберите услугу.','Choose a service to see available times.'); return; }
  status.textContent = tr('Загружаем время…','Loading times…');
  try {
    const data = await api('/slots?'+new URLSearchParams({service:select.value,day}));
    if (version!==slotVersion) return;
    status.textContent = data.length ? '' : tr('На эту дату свободного времени нет. Выберите другой день.','No times available. Please choose another day.');
    for (const slot of data) {
      const b = button(clock.format(new Date(slot.starts_at)), 'bk-choice', ()=>{
        start = slot.starts_at;
        for (const other of times.children) other.setAttribute('aria-pressed',String(other===b));
        summary();
      });
      b.setAttribute('aria-pressed','false');
      times.append(b);
    }
  } catch {
    if (version!==slotVersion) return;
    status.textContent = loadError;
    retry.hidden = false;
  }
}
for (const [key,offset] of [['prev',-1],['next',1]]) {
  $('[data-'+key+']').onclick = () => {
    const next = dateOf(month+'-01');
    next.setUTCMonth(next.getUTCMonth()+offset);
    month = next.toISOString().slice(0,7);
    renderDays();
  };
}
select.onchange = refreshSlots;
retry.onclick = catalogue;
$('[data-close]').onclick = () => { if (!busy) dialog.close(); };
dialog.addEventListener('cancel',e=>{ if(busy) e.preventDefault(); });
document.querySelectorAll('[data-booking]').forEach(trigger => {
  trigger.setAttribute('aria-haspopup','dialog');
  trigger.addEventListener('click',e=>{
    if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey) return;
    e.preventDefault();
    setRange(); renderDays();
    form.hidden = false;
    result.textContent = '';
    dialog.showModal();
    refreshSlots();
    catalogue();
  });
});

form.onsubmit = async e => {
  e.preventDefault();
  if (!service() || !start || busy) return;
  const name = form.elements.name.value.trim();
  let phone = form.elements.phone.value.trim().replace(/[\s()-]/g,'');
  if (/^[78]\d{10}$/.test(phone)) phone = '+7'+phone.slice(1);
  if (!name || !/^\+[1-9]\d{7,14}$/.test(phone)) {
    result.textContent = tr('Введите имя и телефон с кодом страны.','Enter your name and a phone number with country code.');
    (!name ? form.elements.name : form.elements.phone).focus();
    return;
  }
  const body = {service:Number(select.value),start_at:start,name,phone};
  const key = JSON.stringify(body);
  if (attempt?.key !== key) attempt = {key,token:crypto.randomUUID()};
  busy = true;
  $('fieldset').disabled = true; $('[data-close]').disabled = true; retry.hidden = true;
  result.textContent = tr('Отправляем заявку…','Sending your request…');
  try {
    const saved = await api('/reserve',{...body,token:attempt.token});
    if (!saved?.id) throw new Error('unconfirmed');
    form.hidden = true;
    result.textContent = tr('Заявка получена. Хабиб свяжется с вами для подтверждения.','Request received. Habib will contact you to confirm your appointment.');
    attempt = null; start = ''; form.reset();
  } catch (error) {
    if (error.code==='phone limit') {
      result.textContent = tr('У этого номера уже есть заявки, ожидающие подтверждения. Для новой записи свяжитесь с Хабибом.','This number already has requests awaiting confirmation. Contact Habib to make another appointment.');
    } else if (error.status===409) {
      await refreshSlots();
      result.textContent = tr('Это время уже занято. Выберите другой интервал.','This time is already booked. Choose another time.');
    } else if (error.status===429) {
      result.textContent = tr('Слишком много заявок. Попробуйте позже или свяжитесь с Хабибом.','Too many requests. Try again later or contact Habib.');
    } else {
      result.textContent = tr('Подтверждение не получено. Повторите отправку с теми же данными или свяжитесь с Хабибом.','We could not confirm your request. Retry with the same details or contact Habib.');
    }
  } finally {
    busy = false; $('fieldset').disabled = false; $('[data-close]').disabled = false;
    summary(); if(form.hidden) $('[data-close]').focus();
  }
};
setRange();
catalogue();
document.addEventListener('visibilitychange',()=>{ if(!document.hidden && !dialog.open) catalogue(); });
