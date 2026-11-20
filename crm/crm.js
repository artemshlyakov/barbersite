import { api } from "../api.js";

const $ = (id) => document.getElementById(id);
const dialog = document.querySelector("dialog");
const titles = {
  calendar: "Календарь",
  clients: "Клиенты",
  schedule: "Расписание",
  services: "Прайс",
};
const statuses = {
  pending: "Ожидает подтверждения",
  confirmed: "Подтверждена",
  completed: "Завершена",
  cancelled: "Отменена",
  declined: "Отклонена",
  no_show: "Клиент не пришёл",
};
const msk = "Europe/Moscow";
const dateOf = (value) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: msk }).format(new Date(value));
const timeOf = (value) =>
  new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: msk,
  }).format(new Date(value));
const dayTitle = (day) =>
  new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: msk,
  }).format(new Date(day + "T12:00:00+03:00"));
const plusDays = (day, days) =>
  new Date(Date.parse(day + "T12:00:00Z") + days * 86400000)
    .toISOString()
    .slice(0, 10);
const active = (value) => [true, "true", "t", 1].includes(value);
let tab = "calendar",
  week = false,
  logged = false,
  rendering = 0,
  modalVersion = 0;
const errors = {
  unauthorized: "Не удалось войти. Проверьте логин и пароль.",
  forbidden: "Эта учётная запись не имеет доступа к кабинету мастера.",
  not_configured: "Подключение к базе пока не настроено.",
  database_unavailable:
    "База временно недоступна. Обновите календарь перед повторной попыткой.",
  invalid_booking:
    "Проверьте телефон и укажите международный код, например +7.",
  invalid_input: "Проверьте введённые данные.",
  invalid_service: "Проверьте название, стоимость и длительность услуги.",
  invalid_status: "Проверьте выбранный статус записи.",
  invalid_day: "Проверьте дату и доступность дня.",
  invalid_number: "Проверьте числовые значения.",
  invalid_text: "Проверьте длину и содержимое полей.",
  invalid_time: "Проверьте время.",
  invalid_date: "Проверьте дату.",
  "slot unavailable": "Это время недоступно. Выберите другой интервал.",
  "day conflict":
    "На этот день есть активная запись. Сначала перенесите или отмените её.",
  conflict:
    "Изменение невозможно: время уже занято или услуга используется в записи. Используемую услугу можно скрыть из прайса.",
  "booking unavailable": "Запись изменилась. Обновите календарь.",
  not_found: "Объект уже изменён или недоступен.",
  too_many_requests: "Слишком много запросов. Попробуйте позднее.",
  "request key reused": "Параметры заявки изменились. Откройте новую форму.",
};
const report = (e) => {
  if (logged && [401,403].includes(e.status)) showLogin();
  (dialog.open ? $("dialogError") : $("notice")).textContent =
    errors[e.code] ||
    (/^[А-ЯЁ]/.test(e.message)
      ? e.message
      : "Не удалось выполнить запрос. Проверьте соединение и обновите страницу.");
};
function el(tag, text, cls) {
  const n = document.createElement(tag);
  if (text != null) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}
function button(text, action, cls) {
  const b = el("button", text, cls);
  b.type = "button";
  b.onclick = async () => {
    b.disabled = true;
    try {
      await action();
    } catch (e) {
      report(e);
    } finally {
      b.disabled = false;
    }
  };
  return b;
}
function open(title) {
  modalVersion++;
  $("dialogTitle").textContent = title;
  $("dialogError").textContent = "";
  $("editor").replaceChildren();
  if (!dialog.open) dialog.showModal();
  return $("editor");
}
$("close").onclick = () => dialog.close();
dialog.addEventListener("close", () => {
  modalVersion++;
  $("editor").replaceChildren();
});
function field(form, label, name, type = "text", value = "", options = {}) {
  const l = el("label", label),
    n = el(
      type === "select" ? "select" : type === "textarea" ? "textarea" : "input",
    );
  if (n.tagName === "INPUT") n.type = type;
  if (options.choices)
    for (const [v, t] of options.choices) n.add(new Option(t, v));
  n.name = name;
  n.value = value ?? "";
  n.required = options.required ?? true;
  for (const k of [
    "min",
    "max",
    "step",
    "maxLength",
    "placeholder",
    "autocomplete",
  ])
    if (options[k] != null) n[k] = options[k];
  l.append(n);
  form.append(l);
  return n;
}
function formIn(parent) {
  const f = el("form");
  parent.append(f);
  return f;
}
function submit(form, label, task) {
  const b = el("button", label, "primary");
  b.type = "submit";
  form.append(b);
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (b.disabled) return;
    b.disabled = true;
    $("dialogError").textContent = "";
    const rev = modalVersion;
    try {
      await task(Object.fromEntries(new FormData(form)));
      if (rev === modalVersion && dialog.open) dialog.close();
      await refresh();
    } catch (err) {
      report(err);
    } finally {
      b.disabled = false;
    }
  };
}
function showLogin() {
  logged = false;
  rendering++;
  if (dialog.open) dialog.close();
  $("view").replaceChildren();
  $("workspace").hidden = true;
  $("logout").hidden = true;
  $("gate").hidden = false;
  $("sync").textContent = "";
  $("notice").textContent = "";
}
function showDesk() {
  logged = true;
  $("gate").hidden = true;
  $("workspace").hidden = false;
  $("logout").hidden = false;
}
$("login").onsubmit = async (e) => {
  e.preventDefault();
  const f = e.currentTarget,
    b = f.querySelector("button");
  b.disabled = true;
  try {
    await api("/login", { login: f.elements.login.value.trim(), password: f.password.value });
    try {
      await api("/admin/days?day=" + $("date").value + "&days=1");
    } catch (error) {
      await api("/logout", {}).catch(() => {});
      throw error;
    }
    f.reset();
    showDesk();
    await refresh();
  } catch (err) {
    report(err);
  } finally {
    b.disabled = false;
  }
};
$("logout").onclick = async () => {
  try {
    await api("/logout", {});
    showLogin();
  } catch (e) {
    showLogin();
    report(e);
  }
};
$("date").value = dateOf(Date.now());
$("date").onchange = () => {
  if ($("date").value) refresh();
};
$("prev").onclick = () => shift(-1);
$("next").onclick = () => shift(1);
function shift(n) {
  $("date").value = plusDays($("date").value, n * (week ? 7 : 1));
  refresh();
}
$("today").onclick = () => {
  $("date").value = dateOf(Date.now());
  refresh();
};
$("range").onclick = () => {
  week = !week;
  $("range").setAttribute("aria-pressed", String(week));
  refresh();
};
document.querySelectorAll("[data-tab]").forEach(
  (b) =>
    (b.onclick = () => {
      tab = b.dataset.tab;
      refresh();
    }),
);
let searchTimeout;
$("search").oninput = () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(refresh, 220);
};
function entry(r, history = false) {
  const n = el("article", null, "entry"),
    detail = el("div");
  n.dataset.record = r.id;
  n.append(
    el(
      "time",
      (history ? dateOf(r.start_at) + " · " : "") +
        timeOf(r.start_at) +
        "–" +
        timeOf(r.end_at),
    ),
    detail,
  );
  detail.append(
    el("strong", r.status ? r.name : "Время заблокировано"),
    el("p", r.booked_name_ru || ""),
  );
  if (r.status)
    n.append(el("span", statuses[r.status] || r.status, "badge " + r.status));
  n.append(
    button(r.status ? "Открыть запись" : "Снять блокировку", () =>
      r.status ? appointment(r) : unblock(r),
    ),
  );
  return n;
}
function unblock(r) {
  const f = formIn(open("Снять блокировку?"));
  f.append(
    el(
      "p",
      dayTitle(dateOf(r.start_at)) +
        " · " +
        timeOf(r.start_at) +
        "–" +
        timeOf(r.end_at),
    ),
  );
  submit(f, "Освободить время", () => api("/admin/unblock", { id: r.id }));
}
async function clientCard(r) {
  const box = open(r.name),
    rev = modalVersion;
  const contact = el("a", r.phone);
  contact.href = "tel:" + r.phone;
  box.append(contact, el("h3", "История записей"));
  const rows = await api(
    "/admin/history?client=" + encodeURIComponent(r.client_id || r.id),
  );
  if (rev !== modalVersion) return;
  if (!rows.length) box.append(el("p", "Записей пока нет."));
  rows.forEach((row) => box.append(entry(row, true)));
}
function appointment(r) {
  const box = open(r.name),
    line = el(
      "p",
      dayTitle(dateOf(r.start_at)) +
        " · " +
        timeOf(r.start_at) +
        "–" +
        timeOf(r.end_at),
    );
  box.append(
    line,
    el("p", r.booked_name_ru + " · " + r.booked_price + " ₽"),
    button("Карточка клиента", () => clientCard(r)),
  );
  if (["declined", "cancelled"].includes(r.status)) {
    box.append(el("p", statuses[r.status]));
    return;
  }
  const f = formIn(box);
  field(f, "Статус", "status", "select", r.status, {
    choices: Object.entries(statuses),
  });
  submit(f, "Сохранить статус", (body) =>
    api("/admin/status", { id: r.id, ...body }),
  );
  if (["pending", "confirmed"].includes(r.status))
    box.append(
      button("Перенести запись", () => {
        const editor = formIn(open("Перенос записи"));
        field(editor, "Новая дата", "day", "date", dateOf(r.start_at));
        field(editor, "Начало по Москве", "time", "time", timeOf(r.start_at), {
          min: "10:00",
          max: "18:30",
          step: 900,
        });
        submit(editor, "Перенести", (v) =>
          api("/admin/move", {
            id: r.id,
            start_at: v.day + "T" + v.time + ":00+03:00",
          }),
        );
      }),
    );
}
async function newBooking() {
  const box = open("Новая запись"),
    rev = modalVersion,
    services = await api("/services");
  if (rev !== modalVersion) return;
  if (!services.length) {
    box.append(el("p", "Сначала добавьте активную услугу в прайс."));
    return;
  }
  const f = formIn(box),
    token = crypto.randomUUID();
  const svc = field(f, "Услуга", "service", "select", services[0].id, {
    choices: services.map((s) => [s.id, s.name_ru]),
  });
  const day = field(f, "Дата", "day", "date", $("date").value, {
    min: dateOf(Date.now()),
    max: plusDays(dateOf(Date.now()), 29),
  });
  const slot = field(f, "Свободное время по Москве", "start_at", "select", "");
  field(f, "Имя клиента", "name", "text", "", { maxLength: 100 });
  field(f, "Телефон с кодом страны", "phone", "tel", "", {
    placeholder: "+7…",
    maxLength: 24,
  });
  let seq = 0;
  async function loadSlots() {
    const id = ++seq;
    slot.replaceChildren(new Option("Загрузка…", ""));
    slot.disabled = true;
    try {
      const slots = await api(
        "/slots?service=" + svc.value + "&day=" + encodeURIComponent(day.value),
      );
      if (seq !== id || rev !== modalVersion) return;
      slot.replaceChildren(
        new Option(
          slots.length ? "Выберите время" : "Свободного времени нет",
          "",
        ),
      );
      slots.forEach((s) =>
        slot.add(new Option(timeOf(s.starts_at), s.starts_at)),
      );
    } catch (e) {
      if (seq === id) {
        slot.replaceChildren(new Option("Время недоступно", ""));
        report(e);
      }
    } finally {
      if (seq === id) slot.disabled = false;
    }
  }
  svc.onchange = day.onchange = loadSlots;
  submit(f, "Создать запись", (v) => {
    if (!v.start_at) throw new Error("Выберите доступное время.");
    return api("/admin/reserve", {
      service: Number(v.service),
      start_at: v.start_at,
      name: v.name.trim(),
      phone: v.phone.replace(/[\s()-]/g, ""),
      token,
    });
  });
  await loadSlots();
}
function serviceEditor(s = { active: true }) {
  const f = formIn(open(s.id ? "Редактировать услугу" : "Новая услуга"));
  for (const [key, title] of [
    ["name_ru", "Название на русском"],
    ["name_en", "Название на английском"],
    ["description_ru", "Описание на русском"],
    ["description_en", "Описание на английском"],
  ]) {
    const desc = key.startsWith("description");
    field(f, title, key, desc ? "textarea" : "text", s[key], {
      required: !desc,
      maxLength: desc ? 600 : 100,
    });
  }
  field(f, "Цена, ₽", "price", "number", s.price, {
    min: 0,
    max: 9999999,
    step: 1,
  });
  field(f, "Длительность, мин", "minutes", "number", s.minutes ?? 30, {
    min: 1,
    max: 240,
    step: 1,
  });
  const label = el("label", null, "check"),
    c = el("input");
  c.type = "checkbox";
  c.checked = active(s.active);
  label.append(c, "Показывать на сайте");
  f.append(label);
  submit(f, "Сохранить услугу", (v) =>
    api("/admin/service", {
      ...v,
      id: s.id,
      price: Number(v.price),
      minutes: Number(v.minutes),
      active: c.checked,
    }),
  );
  if (s.id)
    f.after(
      button(
        "Удалить услугу",
        () => {
          const confirm = formIn(open("Удалить услугу?"));
          confirm.append(el("p", s.name_ru));
          submit(confirm, "Удалить", () =>
            api("/admin/service/delete", { id: s.id }),
          );
        },
        "danger",
      ),
    );
}
function scheduleDay(d, current) {
  const f = formIn(open("Расписание на день"));
  f.append(el("p", dayTitle(d)));
  field(
    f,
    "Доступность",
    "open",
    "select",
    current == null ? "default" : String(active(current)),
    {
      choices: [
        ["default", "По обычному расписанию"],
        ["true", "Открыть для записи"],
        ["false", "Выходной"],
      ],
    },
  );
  submit(f, "Сохранить", (v) =>
    api("/admin/day", {
      day: d,
      open: v.open === "default" ? null : v.open === "true",
    }),
  );
}
function blockTime() {
  const f = formIn(open("Заблокировать часы"));
  field(f, "Дата", "day", "date", $("date").value);
  field(f, "Начало по Москве", "from", "time", "10:00");
  field(f, "Конец по Москве", "to", "time", "14:00");
  submit(f, "Заблокировать", (v) => {
    if (v.from >= v.to)
      throw new Error("Конец интервала должен быть позже начала.");
    return api("/admin/block", {
      start_at: v.day + "T" + v.from + ":00+03:00",
      end_at: v.day + "T" + v.to + ":00+03:00",
    });
  });
}
async function refresh() {
  if (!logged) return;
  const version = ++rendering,
    day = $("date").value || dateOf(Date.now()),
    days = week ? 7 : 1;
  const period = tab === "calendar" || tab === "schedule",
    p = "?day=" + day + "&days=" + days,
    area = document.createDocumentFragment();
  $("title").textContent = titles[tab];
  $("searchLabel").hidden = tab !== "clients";
  $("period").hidden = !period;
  document.querySelectorAll("[data-tab]").forEach((b) => {
    if (b.dataset.tab === tab) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  const actions = {
    calendar: ["Новая запись", newBooking],
    schedule: ["Заблокировать часы", blockTime],
    services: ["Добавить услугу", serviceEditor],
  };
  $("action").hidden = !actions[tab];
  if (actions[tab]) {
    const [caption, fn] = actions[tab];
    $("action").textContent = caption;
    $("action").onclick = () =>
      Promise.resolve()
        .then(() => fn())
        .catch(report);
  }
  const key = [tab, day, days, $("search").value].join("|");
  if ($("view").dataset.key !== key) {
    $("view").replaceChildren();
    $("view").dataset.key = key;
    $("sync").textContent = "Загрузка…";
  }
  try {
    if (period) {
      const [rows, overrides] = await Promise.all([
        api("/admin/calendar" + p),
        api("/admin/days" + p),
      ]);
      for (let i = 0; i < days; i++) {
        const d = plusDays(day, i),
          override = overrides.find((o) => o.day === d),
          isOpen = override
            ? active(override.open)
            : new Date(d + "T12:00Z").getUTCDay() !== 2;
        const section = el("section", null, "group"),
          heading = el("div", null, "row");
        heading.append(el("h2", dayTitle(d)));
        section.append(heading);
        if (!isOpen) heading.append(el("span", "Выходной", "badge"));
        if (tab === "schedule") {
          heading.append(
            button("Изменить день", () => scheduleDay(d, override?.open)),
          );
          section.append(
            el(
              "p",
              isOpen
                ? "Начало записей с 10:00 до 18:30"
                : "Запись на этот день закрыта.",
            ),
          );
        }
        const appointments = rows.filter(
          (r) => dateOf(r.start_at) === d && (tab === "calendar" || !r.status),
        );
        if (!appointments.length)
          section.append(
            el(
              "p",
              tab === "calendar"
                ? "Записей и блокировок нет."
                : "Отдельных блокировок нет.",
              "empty",
            ),
          );
        appointments.forEach((r) => section.append(entry(r)));
        area.append(section);
      }
    } else if (tab === "clients") {
      const rows = await api(
        "/admin/clients?q=" + encodeURIComponent($("search").value),
      );
      if (!rows.length) area.append(el("p", "Клиенты не найдены."));
      rows.forEach((r) =>
        area.append(
          button(r.name + " · " + r.phone, () => clientCard(r), "list-button"),
        ),
      );
    } else {
      const rows = await api("/admin/services");
      if (!rows.length) area.append(el("p", "Прайс пока пуст."));
      rows.forEach((s) => {
        const row = el("article", null, "entry"),
          info = el("div");
        info.append(
          el("strong", s.name_ru),
          el("p", s.name_en + " · " + s.minutes + " мин · " + s.price + " ₽"),
        );
        row.append(info);
        if (!active(s.active)) row.append(el("span", "Скрыта", "badge"));
        row.append(button("Редактировать", () => serviceEditor(s)));
        area.append(row);
      });
    }
    if (version !== rendering) return;
    const focused = document.activeElement.closest("article[data-record]")
      ?.dataset.record;
    $("view").replaceChildren(area);
    if (focused)
      $("view")
        .querySelector('[data-record="' + CSS.escape(focused) + '"] button')
        ?.focus({ preventScroll: true });
    $("sync").textContent = "Обновлено в " + timeOf(Date.now());
    $("notice").textContent = "";
  } catch (e) {
    if (version === rendering) {
      $("sync").textContent = "Обновление не удалось";
      report(e);
    }
  }
}
async function init() {
  try {
    await api("/admin/days?day=" + $("date").value + "&days=1");
    showDesk();
    await refresh();
  } catch (e) {
    showLogin();
    if (e.status !== 401) report(e);
  }
}
setInterval(() => {
  if (logged && !document.hidden && !dialog.open && tab === "calendar")
    refresh();
}, 20000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && logged && !dialog.open) refresh();
});
init();
