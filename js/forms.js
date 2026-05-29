// ════════════════════════════════════════
//  FORMS — v4 (пикер даты+времени, единое поле привязки)
//  js/forms.js
// ════════════════════════════════════════

import { openModal, closeModal, toast, getSubtasks, getActivePriority, setPriority, addSubRow } from "./modal.js";
import {
  addTask, updateTask, deleteTask,
  addGoal, updateGoal, deleteGoal,
  addProject,
  addIdea, updateIdea, getIdeas,
  addDiaryEntry, updateDiaryEntry, getDiary,
  addTemplate, getTemplates,
  getGoals, getProjects,
  getTasks,
  saveDailyAudit, calcAuthorRatio, getAuditForDate,
  // ── НОВОЕ: статусы и история задачи ──
  postponeTask, cancelTask, reopenTask,
  recordTitleChange, recordGoalChange,
  esc, toTS, today, dstr
} from "./db.js";
import { uploadAttachment } from "./storage.js";

const $ = id => document.getElementById(id);

// ════════════════════════════════════════
//  ПИКЕР ДАТЫ + ВРЕМЕНИ
//  Вызов: bindDatePicker(inputId, withTime)
//  inputId — id скрытого <input type="hidden">
//  withTime — показывать выбор времени
// ════════════════════════════════════════

const MONTHS_RU = ["Январь","Февраль","Март","Апрель","Май","Июнь",
                   "Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const DAYS_SHORT = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];

// Создаёт кнопку-отображалку + скрытый input, навешивает пикер
function makeDateField(id, withTime, initVal = "") {
  const wrap = document.createElement("div");
  wrap.className = "dtp-wrap";
  wrap.dataset.id = id;

  const hidden = document.createElement("input");
  hidden.type = "hidden";
  hidden.id = id;
  hidden.value = initVal;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "dtp-btn inp";
  btn.dataset.for = id;
  btn.textContent = initVal ? formatDisplay(initVal, withTime) : withTime ? "Дата и время..." : "Дата...";

  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "dtp-clear";
  clear.title = "Очистить";
  clear.textContent = "×";
  clear.onclick = e => {
    e.stopPropagation();
    hidden.value = "";
    btn.textContent = withTime ? "Дата и время..." : "Дата...";
    btn.classList.remove("has-val");
  };

  wrap.appendChild(hidden);
  wrap.appendChild(btn);
  wrap.appendChild(clear);

  btn.onclick = () => openDtpPopup(btn, hidden, withTime);
  return wrap;
}

function formatDisplay(val, withTime) {
  if (!val) return "";
  const dt = new Date(val);
  if (isNaN(dt)) return val;
  const d = String(dt.getDate()).padStart(2,"0");
  const m = String(dt.getMonth()+1).padStart(2,"0");
  const y = dt.getFullYear();
  if (!withTime) return `${d}.${m}.${y}`;
  const hh = String(dt.getHours()).padStart(2,"0");
  const mm = String(dt.getMinutes()).padStart(2,"0");
  return `${d}.${m}.${y}  ${hh}:${mm}`;
}

function openDtpPopup(btn, hidden, withTime) {
  document.getElementById("dtp-popup")?.remove();

  const id = hidden.id || "";
  let initVal = hidden.value;

  if (!initVal) {
    const now = new Date();
    const todayStr = dstr(now);
    const pad = n => String(n).padStart(2,"0");

    if (id.includes("start") || id === "t-start" || id === "et-st") {
      // Поле «Начало» — дефолт: сегодня + текущее время (округлено до 5 мин)
      const mins = Math.ceil(now.getMinutes() / 5) * 5;
      const h = mins >= 60 ? now.getHours() + 1 : now.getHours();
      const m = mins >= 60 ? 0 : mins;
      initVal = `${todayStr}T${pad(h % 24)}:${pad(m)}`;

    } else if (id.includes("dl") || id.includes("deadline") || id.includes("end")) {
      // Поле «Окончание» — дефолт: дата начала (или сегодня) + 23:00
      const startId = id.startsWith("et") ? "et-st" : "t-start";
      const startVal = document.getElementById(startId)?.value || "";
      const datePart = startVal ? startVal.slice(0, 10) : todayStr;
      initVal = `${datePart}T23:00`;

    } else if (id.includes("until")) {
      // Поле «Повторять до» — дефолт: дата начала + 23:00
      const startId = id.startsWith("et") ? "et-st" : "t-start";
      const startVal = document.getElementById(startId)?.value || "";
      const datePart = startVal ? startVal.slice(0, 10) : todayStr;
      initVal = `${datePart}T23:00`;
    }
  }

  // Нормализуем строку для Safari
  let initNorm = initVal || "";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(initNorm)) initNorm += ":00";

  const existing = initNorm ? new Date(initNorm) : new Date();
  let selYear  = existing.getFullYear();
  let selMonth = existing.getMonth();
  // Для всех полей с дефолтом — день уже выбран
  let selDay   = initVal ? existing.getDate() : null;
  let selHour  = existing.getHours();
  let selMin   = Math.round(existing.getMinutes() / 5) * 5;

  const popup = document.createElement("div");
  popup.id        = "dtp-popup";
  popup.className = "dtp-popup";

  // Объявляем overlay заранее — wireEvents ссылается на него
  let overlay;

  // ── Полный рендер (только при открытии или смене месяца) ──
  function renderFull() {
    const y   = selYear, m = selMonth;
    const fd  = new Date(y, m, 1).getDay();
    const off = fd === 0 ? 6 : fd - 1;
    const days = new Date(y, m + 1, 0).getDate();
    const tod  = new Date(); tod.setHours(0,0,0,0);
    const todStr = dstr(tod);

    let grid = DAYS_SHORT.map(d => `<div class="dtp-dh">${d}</div>`).join("");
    for (let i = 0; i < off; i++) grid += `<div class="dtp-dc other"></div>`;
    for (let d = 1; d <= days; d++) {
      const ds = `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      const cls = ["dtp-dc",
        ds === todStr ? "today" : "",
        selDay === d  ? "sel"   : ""
      ].filter(Boolean).join(" ");
      grid += `<div class="${cls}" data-d="${d}">${d}</div>`;
    }

    const timeHtml = withTime ? `
      <div class="dtp-time">
        <div class="dtp-time-lbl">Время</div>
        <div class="dtp-time-row">
          <div class="dtp-spinner">
            <button class="dtp-spin-btn" data-action="hour-up">▲</button>
            <div class="dtp-spin-val" id="dtp-hh">${String(selHour).padStart(2,"0")}</div>
            <button class="dtp-spin-btn" data-action="hour-dn">▼</button>
          </div>
          <div class="dtp-time-sep">:</div>
          <div class="dtp-spinner">
            <button class="dtp-spin-btn" data-action="min-up">▲</button>
            <div class="dtp-spin-val" id="dtp-mm">${String(selMin).padStart(2,"0")}</div>
            <button class="dtp-spin-btn" data-action="min-dn">▼</button>
          </div>
        </div>
      </div>` : "";

    popup.innerHTML = `
      <div class="dtp-hd">
        <button class="dtp-nav" id="dtp-pm">‹</button>
        <span class="dtp-mo" id="dtp-mo-lbl">${MONTHS_RU[m]} ${y}</span>
        <button class="dtp-nav" id="dtp-nm">›</button>
      </div>
      <div class="dtp-grid" id="dtp-grid">${grid}</div>
      ${timeHtml}
      <div class="dtp-footer">
        <button class="dtp-cancel">Отмена</button>
        <button class="dtp-confirm" id="dtp-confirm-btn" ${selDay===null?"disabled":""}>Выбрать</button>
      </div>`;

    wireEvents();
  }

  // ── Лёгкое обновление — только классы ячеек (без innerHTML) ──
  function updateDay() {
    popup.querySelectorAll(".dtp-dc:not(.other)").forEach(dc => {
      const d = parseInt(dc.dataset.d);
      dc.classList.toggle("sel", d === selDay);
    });
    const confirmBtn = document.getElementById("dtp-confirm-btn");
    if (confirmBtn) confirmBtn.disabled = selDay === null;
  }

  function wireEvents() {
    // Навигация по месяцам
    popup.querySelector("#dtp-pm").onclick = e => {
      e.stopPropagation(); e.preventDefault();
      selMonth--;
      if (selMonth < 0) { selMonth = 11; selYear--; }
      renderFull();
    };
    popup.querySelector("#dtp-nm").onclick = e => {
      e.stopPropagation(); e.preventDefault();
      selMonth++;
      if (selMonth > 11) { selMonth = 0; selYear++; }
      renderFull();
    };

    // Выбор дня — только обновляем классы, не перерисовываем
    popup.querySelector("#dtp-grid").addEventListener("click", e => {
      const dc = e.target.closest(".dtp-dc:not(.other)");
      if (!dc) return;
      e.stopPropagation(); e.preventDefault();
      selDay = parseInt(dc.dataset.d);
      updateDay();
    });

    // mousedown preventDefault на всех кнопках пикера —
    // запрещает фокус и scroll-into-view (причина zoom в Safari)
    popup.addEventListener("mousedown", e => { e.preventDefault(); });
    popup.addEventListener("touchstart", e => { e.stopPropagation(); }, { passive: true });

    // Запрет фокуса на всех элементах пикера — главная причина zoom в Safari
    popup.querySelectorAll("button, .dtp-dc").forEach(el => {
      el.setAttribute("tabindex", "-1");
      el.style.touchAction = "manipulation";
    });

    // Спиннеры времени — обновляем только текст
    popup.querySelectorAll(".dtp-spin-btn").forEach(sb => {
      sb.onclick = e => {
        e.stopPropagation(); e.preventDefault();
        const a = sb.dataset.action;
        if (a === "hour-up") selHour = (selHour + 1) % 24;
        if (a === "hour-dn") selHour = (selHour + 23) % 24;
        if (a === "min-up")  selMin  = (selMin + 5) % 60;
        if (a === "min-dn")  selMin  = (selMin + 55) % 60;
        const hh = document.getElementById("dtp-hh");
        const mm = document.getElementById("dtp-mm");
        if (hh) hh.textContent = String(selHour).padStart(2,"0");
        if (mm) mm.textContent = String(selMin).padStart(2,"0");
      };
    });

    // Отмена
    popup.querySelector(".dtp-cancel").onclick = e => {
      e.stopPropagation(); e.preventDefault();
      if (overlay) overlay.remove(); else popup.remove();
      if (vp) vp.content = vpOrig;
    };

    // Подтвердить
    popup.querySelector("#dtp-confirm-btn").onclick = e => {
      e.stopPropagation(); e.preventDefault();
      if (!selDay) return;
      const dateStr = `${selYear}-${String(selMonth+1).padStart(2,"0")}-${String(selDay).padStart(2,"0")}`;
      const val = withTime
        ? `${dateStr}T${String(selHour).padStart(2,"0")}:${String(selMin).padStart(2,"0")}`
        : dateStr;
      hidden.value = val;
      btn.textContent = formatDisplay(val, withTime);
      btn.classList.add("has-val");
      if (overlay) overlay.remove(); else popup.remove();
      if (vp) vp.content = vpOrig;
    };
  }

  // Первый рендер
  renderFull();

  // Блокируем viewport zoom на время работы пикера
  const vp = document.querySelector("meta[name=viewport]");
  const vpOrig = vp?.content || "";
  if (vp) vp.content = "width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no";

  // Создаём overlay — фон за пикером, клик закрывает
  overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.3);";
  overlay.onclick = () => { overlay.remove(); if(vp) vp.content = vpOrig; };
  overlay.appendChild(popup);

  // Центрируем пикер по экрану
  const popupW  = 300;
  const popupH  = withTime ? 420 : 320;
  const vw      = window.innerWidth;
  const vh      = window.innerHeight;
  const left = Math.max(8, Math.min(Math.round((vw - popupW) / 2), vw - popupW - 8));
  const top  = Math.max(8, Math.min(Math.round((vh - popupH) / 2), vh - popupH - 8));
  popup.style.cssText = `position:absolute;z-index:10000;top:${top}px;left:${left}px;width:${popupW}px;`;

  document.body.appendChild(overlay);

  // Клик по самому пикеру не закрывает
  popup.onclick = e => e.stopPropagation();
}

// Читаем значение из dtp поля
function dtpVal(id) {
  return ($(id)?.value || "").trim();
}

// ════════════════════════════════════════
//  ПРОСМОТРЩИК ФАЙЛОВ
// ════════════════════════════════════════
function showFileViewer(url, type, name) {
  const modal = document.createElement("div");
  modal.className = "file-viewer-overlay";
  const content = document.createElement("div");
  if (type && type.startsWith("image/")) {
    const img = document.createElement("img");
    img.src = url; img.style.maxWidth = "100%"; img.style.maxHeight = "90vh";
    content.appendChild(img);
  } else if (type && type.startsWith("video/")) {
    const video = document.createElement("video");
    video.src = url; video.controls = true; video.style.maxWidth = "100%"; video.style.maxHeight = "90vh";
    content.appendChild(video);
  } else if (type && type.startsWith("audio/")) {
    const audio = document.createElement("audio");
    audio.src = url; audio.controls = true; audio.style.width = "100%";
    content.appendChild(audio);
  } else {
    const iframe = document.createElement("iframe");
    iframe.src = url; iframe.style.width = "80vw"; iframe.style.height = "80vh"; iframe.style.border = "none";
    content.appendChild(iframe);
  }
  modal.appendChild(content);
  modal.onclick = () => modal.remove();
  document.body.appendChild(modal);
}

// ════════════════════════════════════════
//  БЫСТРОЕ ДОБАВЛЕНИЕ ЦЕЛИ / ПРОЕКТА
// ════════════════════════════════════════
async function quickAddGoal(callback) {
  openModal("Новая цель", `
    <div class="fg"><label class="fl">Название цели *</label>
      <input class="inp" id="quick-goal-title" placeholder="Чего хочу достичь?"/></div>
    <div class="fg"><label class="fl">Описание</label>
      <textarea class="txta" id="quick-goal-desc" placeholder="Описание..."></textarea></div>`,
    async () => {
      const t = $("quick-goal-title")?.value.trim();
      if (!t) { toast("⚠️ Введите название"); return; }
      const newGoal = await addGoal({ title: t, desc: $("quick-goal-desc")?.value.trim() || "" });
      toast("Цель создана");
      closeModal();
      callback(newGoal.id, t);
    });
}

async function quickAddProject(goalId, callback) {
  const goals = await getGoals();
  openModal("Новый проект", `
    <div class="fg"><label class="fl">Название проекта *</label>
      <input class="inp" id="quick-proj-title" placeholder="Название"/></div>
    <div class="fg"><label class="fl">Цель</label>
      <select class="sel" id="quick-proj-goal">
        <option value="">— Без цели —</option>
        ${goals.map(g => `<option value="${g.id}" ${g.id === goalId ? "selected" : ""}>${esc(g.title)}</option>`).join("")}
      </select></div>`,
    async () => {
      const t = $("quick-proj-title")?.value.trim();
      if (!t) { toast("⚠️ Введите название"); return; }
      const newProj = await addProject({ name: t, goalId: $("quick-proj-goal")?.value.trim() || null });
      toast("Проект создан");
      closeModal();
      callback(newProj.id, t);
    });
}

// ════════════════════════════════════════
//  СОЗДАНИЕ ЗАДАЧИ
// ════════════════════════════════════════
export async function buildTaskModal(title, defGoalId = null, defProjId = null, defaultDate = null) {
  let [goals, projects] = await Promise.all([getGoals(), getProjects()]);
  // Только активные (незавершённые) цели и проекты
  goals    = goals.filter(g => !g.done);
  projects = projects.filter(p => !p.done);
  let selectedGoalId = defGoalId || "";
  let attachments = [];

  function render() {
    const goalOpts = goals.map(g =>
      `<option value="goal:${g.id}" ${`goal:${g.id}` === `goal:${selectedGoalId}` ? "selected" : ""}>${esc(g.title)}</option>`
    ).join("");
    const projOpts = projects.map(p =>
      `<option value="proj:${p.id}" ${`proj:${p.id}` === `proj:${defProjId}` ? "selected" : ""}>${esc(p.name)}</option>`
    ).join("");

    $("m-body").innerHTML = `
      <div class="m-section"><div class="m-section-ttl">Основное</div>
        <div class="fg"><label class="fl">Название задачи *</label>
          <input class="inp" id="t-title" placeholder="Введите название"/></div>
        <div class="fg"><label class="fl">Примечание</label>
          <textarea class="txta" id="t-note" placeholder="Примечание..."></textarea></div>
      </div>

      <div class="m-section"><div class="m-section-ttl">Привязка</div>
        <div class="fg">
          <select class="sel" id="t-binding">
            <option value="">— Без привязки (в корне) —</option>
            ${goals.length ? `<optgroup label="── Цели ──">${goalOpts}</optgroup>` : ""}
            ${projects.length ? `<optgroup label="── Проекты ──">${projOpts}</optgroup>` : ""}
          </select>
          <div class="inp-row" style="margin-top:6px;gap:6px">
            <button class="add-sub" id="quick-add-goal-btn" style="flex:1">+ Новая цель</button>
            <button class="add-sub" id="quick-add-proj-btn" style="flex:1">+ Новый проект</button>
          </div>
        </div>
      </div>

      <div class="m-section"><div class="m-section-ttl">Сроки</div>
        <div class="inp-row">
          <div class="fg" style="flex:1">
            <label class="fl">Начало</label>
            <div id="dtp-start-wrap"></div>
          </div>
          <div class="fg" style="flex:1">
            <label class="fl">Окончание</label>
            <div id="dtp-dl-wrap"></div>
          </div>
        </div>
      </div>

      <div class="m-section"><div class="m-section-ttl">Повторение</div>
        <div class="recur-types" id="t-recur-types">
          <button class="recur-type-btn on" data-val="none"    onclick="window._setRecurType(this,'t')">Нет</button>
          <button type="button" class="recur-type-btn"    data-val="daily"   onclick="window._setRecurType(this,'t')">Ежедневно</button>
          <button type="button" class="recur-type-btn"    data-val="weekly"  onclick="window._setRecurType(this,'t')">Еженедельно</button>
          <button type="button" class="recur-type-btn"    data-val="monthly" onclick="window._setRecurType(this,'t')">Ежемесячно</button>
        </div>
        <input type="hidden" id="t-recurrence-type" value="none"/>

        <!-- Еженедельно: выбор дней недели -->
        <div id="t-recur-weekdays" class="recur-weekdays" style="display:none">
          <button type="button" class="recur-wd-btn" data-day="1" onclick="window._toggleWd(this)">Пн</button>
          <button type="button" class="recur-wd-btn" data-day="2" onclick="window._toggleWd(this)">Вт</button>
          <button type="button" class="recur-wd-btn" data-day="3" onclick="window._toggleWd(this)">Ср</button>
          <button type="button" class="recur-wd-btn" data-day="4" onclick="window._toggleWd(this)">Чт</button>
          <button type="button" class="recur-wd-btn" data-day="5" onclick="window._toggleWd(this)">Пт</button>
          <button type="button" class="recur-wd-btn" data-day="6" onclick="window._toggleWd(this)">Сб</button>
          <button type="button" class="recur-wd-btn" data-day="0" onclick="window._toggleWd(this)">Вс</button>
        </div>

        <!-- Ежемесячно: выбор числа -->
        <div id="t-recur-monthdays" class="recur-monthdays" style="display:none">
          <div class="recur-md-lbl">Числа месяца:</div>
          <div class="recur-md-grid">
            ${Array.from({length:31},(_,i)=>i+1).map(d=>
              `<button type="button" class="recur-md-btn" data-day="${d}" onclick="window._toggleMd(this)">${d}</button>`
            ).join("")}
          </div>
        </div>

        <!-- Дата окончания (для всех типов кроме Нет) -->
        <div id="t-recur-until-row" style="display:none">
          <div class="fg"><label class="fl">Повторять до (пусто = бессрочно)</label>
            <div id="t-until-field-wrap"></div>
          </div>
        </div>
      </div>

      <div class="m-section"><div class="m-section-ttl">Напоминание</div>
        <div class="fg"><label class="fl">Дата и время</label>
          <div id="dtp-reminder-wrap"></div>
        </div>
      </div>

      <div class="m-section"><div class="m-section-ttl">Приоритет</div>
        <div class="pri-row">
          <button class="pri-btn" data-pri="high" onclick="window._setPri('high')">🔴 Высокий</button>
          <button class="pri-btn on-med" data-pri="med" onclick="window._setPri('med')">🟡 Средний</button>
          <button class="pri-btn" data-pri="low" onclick="window._setPri('low')">🟢 Низкий</button>
        </div>
      </div>

      <div class="m-section"><div class="m-section-ttl">Мотив</div>
        <div class="motive-row">
          <button type="button" class="motive-btn on" id="motive-duty" data-val="duty"
            onclick="window._setMotive('duty')">⚙️ Надо</button>
          <button type="button" class="motive-btn" id="motive-want" data-val="want"
            onclick="window._setMotive('want')">🔥 Хочу</button>
        </div>
        <div class="motive-hint" id="motive-hint">Это задача по обязанности — но она тоже важна</div>
        <input type="hidden" id="t-motive" value="duty"/>
      </div>

      <div class="m-section"><div class="m-section-ttl">Подзадачи</div>
        <div id="sub-list" class="sub-list"></div>
        <button class="add-sub" onclick="window._addSub()">+ Добавить подзадачу</button>
      </div>

      <div class="m-section"><div class="m-section-ttl">Вложения</div>
        <input type="file" id="t-attach" accept="image/*,video/*,audio/*,application/pdf,text/plain,.doc,.docx"/>
        <div id="attach-list" class="sub-list" style="margin-top:6px"></div>
      </div>`;

    // Вставляем пикеры дат
    $("dtp-start-wrap")?.replaceWith(makeDateField("t-start", true));
    $("dtp-dl-wrap")?.replaceWith(makeDateField("t-dl", true));
    // until поле — вставляем в новый враппер (всегда в DOM, видимость через opacity)
    const untilField = makeDateField("t-until", false);
    const untilWrap = $("t-until-field-wrap");
    if (untilWrap) untilWrap.appendChild(untilField);
    $("dtp-reminder-wrap")?.replaceWith(makeDateField("t-reminder", true));

    // Обработчики
    $("quick-add-goal-btn")?.addEventListener("click", () => {
      quickAddGoal((newId, newTitle) => {
        goals.push({ id: newId, title: newTitle });
        const sel = $("t-binding");
        const opt = document.createElement("option");
        opt.value = `goal:${newId}`; opt.textContent = esc(newTitle);
        let grp = [...sel.querySelectorAll("optgroup")].find(g => g.label.includes("Цели"));
        if (!grp) { grp = document.createElement("optgroup"); grp.label = "── Цели ──"; sel.appendChild(grp); }
        grp.appendChild(opt); sel.value = `goal:${newId}`;
        selectedGoalId = newId;
      });
    });
    $("quick-add-proj-btn")?.addEventListener("click", () => {
      quickAddProject(selectedGoalId, (newId, newName) => {
        projects.push({ id: newId, name: newName, goalId: selectedGoalId });
        const sel = $("t-binding");
        const opt = document.createElement("option");
        opt.value = `proj:${newId}`; opt.textContent = esc(newName);
        let grp = [...sel.querySelectorAll("optgroup")].find(g => g.label.includes("Проекты"));
        if (!grp) { grp = document.createElement("optgroup"); grp.label = "── Проекты ──"; sel.appendChild(grp); }
        grp.appendChild(opt); sel.value = `proj:${newId}`;
      });
    });
    $("t-binding")?.addEventListener("change", e => {
      const v = e.target.value;
      selectedGoalId = v.startsWith("goal:") ? v.slice(5) : "";
    });
    $("t-attach")?.addEventListener("change", async e => {
      const file = e.target.files[0]; if (!file) return;
      toast("Загрузка...");
      const attached = await uploadAttachment(file, "temp");
      if (attached) {
        attachments.push(attached);
        const list = $("attach-list");
        const div = document.createElement("div");
        div.className = "sub-row";
        div.innerHTML = `<span style="flex:1;font-size:11px;cursor:pointer;color:var(--blu);">📎 ${esc(attached.name)}</span><button class="rm-sub">×</button>`;
        list.appendChild(div);
        div.querySelector("span").onclick = () => showFileViewer(attached.url, attached.type, attached.name);
        div.querySelector(".rm-sub").onclick = () => { attachments = attachments.filter(a => a.url !== attached.url); div.remove(); };
      }
      e.target.value = "";
    });
  }

  openModal(title || "Новая задача", "", async () => {
    const titleVal = $("t-title")?.value.trim();
    if (!titleVal) { toast("⚠️ Введите название задачи"); return; }
    const bindVal = $("t-binding")?.value || "";
    const goalId = bindVal.startsWith("goal:") ? bindVal.slice(5) : null;
    const projId = bindVal.startsWith("proj:") ? bindVal.slice(5) : null;
    let resolvedGoalId = goalId;
    if (projId && !goalId) {
      const proj = projects.find(p => p.id === projId);
      resolvedGoalId = proj?.goalId || null;
    }
    const recType    = $("t-recurrence-type")?.value.trim() || "none";
    const untilVal   = recType !== "none" ? (dtpVal("t-until") || null) : null;
    const weekdays = recType === "weekly"
      ? [...document.querySelectorAll("#t-recur-weekdays .recur-wd-btn.on")].map(b => parseInt(b.dataset.day))
      : [];
    const monthdays = recType === "monthly"
      ? [...document.querySelectorAll("#t-recur-monthdays .recur-md-btn.on")].map(b => parseInt(b.dataset.day))
      : [];
    const startRaw = dtpVal("t-start");
    const dlRaw    = dtpVal("t-dl");
    try {
      await addTask({
        title:     titleVal,
        note:      $("t-note")?.value.trim() || "",
        motive:    $("t-motive")?.value || "duty",
        goalId:    resolvedGoalId,
        projId,
        deadline:  dlRaw || null,
        startDate: startRaw || null,
        priority:  getActivePriority(),
        subtasks:  getSubtasks(),
        date:      startRaw ? startRaw.slice(0,10) : today(),
        reminder:  dtpVal("t-reminder") || null,
        attachments,
        recurrence: recType !== "none" ? {
          type:      recType,
          interval:  1,
          until:     untilVal,
          weekdays:  recType === "weekly"  && weekdays.length  ? weekdays  : null,
          monthdays: recType === "monthly" && monthdays.length ? monthdays : null,
        } : null,
      });
      toast("Задача добавлена ✓");
      closeModal();
      window._refreshAll?.();
    } catch(e) {
      console.error("addTask error:", e);
      toast("⚠️ Ошибка сохранения: " + e.message);
    }
  });
  render();
}

// ════════════════════════════════════════
//  РЕДАКТИРОВАНИЕ ЗАДАЧИ
// ════════════════════════════════════════
export async function editTaskModal(id) {
  const allT = await getTasks();
  const t = allT.find(x => x.id === id);
  if (!t) return;
  let [goals, projects] = await Promise.all([getGoals(), getProjects()]);
  // Только активные
  goals    = goals.filter(g => !g.done);
  projects = projects.filter(p => !p.done);

  // Безопасный парсинг даты → ISO строка для пикера
  function toISO(val) {
    if (!val) return "";
    let dt;
    if (val && typeof val.toDate === "function") {
      dt = val.toDate();
    } else {
      // Нормализуем строку: Safari не парсит "2026-05-21T18:00" без секунд
      let s = String(val);
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) s += ":00";
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += "T00:00:00";
      dt = new Date(s);
    }
    if (!dt || isNaN(dt.getTime())) return "";
    // Локальное время → ISO без timezone сдвига
    const pad = n => String(n).padStart(2,"0");
    return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  }

  const dlVal  = toISO(t.deadline);
  const stVal  = toISO(t.startDate);
  const remVal = toISO(t.reminder);
  const recurrence = t.recurrence || { type: "none", interval: 1, until: "" };
  let attachments = t.attachments || [];

  function renderEdit() {
    const bindVal = t.projId ? `proj:${t.projId}` : t.goalId ? `goal:${t.goalId}` : "";
    const goalOpts = goals.map(g =>
      `<option value="goal:${g.id}" ${`goal:${g.id}` === bindVal ? "selected" : ""}>${esc(g.title)}</option>`
    ).join("");
    const projOpts = projects.map(p =>
      `<option value="proj:${p.id}" ${`proj:${p.id}` === bindVal ? "selected" : ""}>${esc(p.name)}</option>`
    ).join("");

    $("m-body").innerHTML = `
      <div class="fg"><label class="fl">Название</label>
        <input class="inp" id="et-ttl" value="${esc(t.title)}"/></div>
      <div class="fg"><label class="fl">Примечание</label>
        <textarea class="txta" id="et-note">${esc(t.note || "")}</textarea></div>

      <div class="fg"><label class="fl">Привязка</label>
        <select class="sel" id="et-binding">
          <option value="" ${!bindVal ? "selected" : ""}>— Без привязки (в корне) —</option>
          ${goals.length ? `<optgroup label="── Цели ──">${goalOpts}</optgroup>` : ""}
          ${projects.length ? `<optgroup label="── Проекты ──">${projOpts}</optgroup>` : ""}
        </select>
        <div class="inp-row" style="margin-top:6px;gap:6px">
          <button type="button" class="add-sub" id="et-quick-goal" style="flex:1">+ Новая цель</button>
          <button type="button" class="add-sub" id="et-quick-proj" style="flex:1">+ Новый проект</button>
        </div>
      </div>

      <div class="m-section">
        <div class="m-section-ttl">Преобразовать задачу</div>
        <div class="inp-row" style="gap:6px">
          <button class="add-sub transform-btn" style="flex:1"
            onclick="window._transformTask('${t.id}','goal')">
            🎯 Сделать целью
          </button>
          <button class="add-sub transform-btn" style="flex:1"
            onclick="window._transformTask('${t.id}','project')">
            📁 Сделать проектом
          </button>
        </div>
        <div class="recur-md-lbl" style="margin-top:4px">Задача станет целью или проектом, а её подзадачи — задачами внутри</div>
      </div>

      <div class="inp-row">
        <div class="fg" style="flex:1"><label class="fl">Начало</label>
          <div id="dtp-et-start-wrap"></div>
        </div>
        <div class="fg" style="flex:1"><label class="fl">Окончание</label>
          <div id="dtp-et-dl-wrap"></div>
        </div>
      </div>

      <div class="m-section"><div class="m-section-ttl">Повторение</div>
        <div class="recur-types" id="et-recur-types">
          <button class="recur-type-btn ${recurrence.type==='none'||!recurrence.type?'on':''}" data-val="none"    onclick="window._setRecurType(this,'et')">Нет</button>
          <button class="recur-type-btn ${recurrence.type==='daily'?'on':''}"   data-val="daily"   onclick="window._setRecurType(this,'et')">Ежедневно</button>
          <button class="recur-type-btn ${recurrence.type==='weekly'?'on':''}"  data-val="weekly"  onclick="window._setRecurType(this,'et')">Еженедельно</button>
          <button class="recur-type-btn ${recurrence.type==='monthly'?'on':''}" data-val="monthly" onclick="window._setRecurType(this,'et')">Ежемесячно</button>
        </div>
        <input type="hidden" id="et-recurrence-type" value="${recurrence.type||'none'}"/>

        <!-- Еженедельно: дни недели -->
        <div id="et-recur-weekdays" class="recur-weekdays" style="display:${recurrence.type==='weekly'?'flex':'none'}">
          ${[1,2,3,4,5,6,0].map((d,i)=>{
            const lbl=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'][i];
            const sel=(recurrence.weekdays||[]).includes(d)?'on':'';
            return `<button class="recur-wd-btn ${sel}" data-day="${d}" onclick="window._toggleWd(this)">${lbl}</button>`;
          }).join('')}
        </div>

        <!-- Ежемесячно: числа месяца -->
        <div id="et-recur-monthdays" class="recur-monthdays" style="display:${recurrence.type==='monthly'?'block':'none'}">
          <div class="recur-md-lbl">Числа месяца:</div>
          <div class="recur-md-grid">
            ${Array.from({length:31},(_,i)=>i+1).map(d=>{
              const sel=(recurrence.monthdays||[]).includes(d)?'on':'';
              return `<button class="recur-md-btn ${sel}" data-day="${d}" onclick="window._toggleMd(this)">${d}</button>`;
            }).join('')}
          </div>
        </div>

        <!-- Дата окончания -->
        <div id="et-recur-until-row" style="display:${recurrence.type&&recurrence.type!=='none'?'block':'none'}">
          <div class="fg"><label class="fl">Повторять до (пусто = бессрочно)</label>
            <div id="et-until-field-wrap"></div>
          </div>
        </div>
      </div>

      <div class="fg"><label class="fl">Напоминание</label>
        <div id="dtp-et-reminder-wrap"></div>
      </div>

      <div class="fg"><label class="fl">Приоритет</label>
        <select class="sel" id="et-pri">
          <option value="high" ${t.priority==="high"?"selected":""}>🔴 Высокий</option>
          <option value="med" ${(!t.priority||t.priority==="med")?"selected":""}>🟡 Средний</option>
          <option value="low" ${t.priority==="low"?"selected":""}>🟢 Низкий</option>
        </select>
      </div>

      <div class="m-section"><div class="m-section-ttl">Мотив</div>
        <div class="motive-row">
          <button type="button" class="motive-btn ${(!t.motive||t.motive==='duty')?'on':''}" id="et-motive-duty" data-val="duty"
            onclick="window._setMotive('duty','et')">⚙️ Надо</button>
          <button type="button" class="motive-btn ${t.motive==='want'?'on':''}" id="et-motive-want" data-val="want"
            onclick="window._setMotive('want','et')">🔥 Хочу</button>
        </div>
        <div class="motive-hint" id="et-motive-hint">${t.motive==='want'?'🔥 Это твой выбор — задача наполняет энергией':'⚙️ Это задача по обязанности — но она тоже важна'}</div>
        <input type="hidden" id="et-motive" value="${t.motive||'duty'}"/>
      </div>

      <div class="m-section"><div class="m-section-ttl">Подзадачи</div>
        <div id="edit-sub-list" class="sub-list">
          ${(t.subtasks||[]).map(s=>`<div class="sub-row"><input class="inp" value="${esc(s)}"/><button class="rm-sub" onclick="this.closest('.sub-row').remove()">×</button></div>`).join("")}
        </div>
        <button class="add-sub" onclick="window._addSub('edit-sub-list')">+ Добавить</button>
      </div>

      <div class="m-section"><div class="m-section-ttl">Вложения</div>
        <div id="edit-attach-list" class="sub-list">
          ${attachments.map(a=>`<div class="sub-row"><span style="flex:1;font-size:11px;cursor:pointer;color:var(--blu);" data-url="${a.url}" data-type="${a.type||""}" data-name="${esc(a.name)}">📎 ${esc(a.name)}</span><button class="rm-sub" data-url="${a.url}">×</button></div>`).join("")}
        </div>
        <input type="file" id="et-attach"/>
      </div>
      <div class="m-section">
        <div class="m-section-ttl">Действия с задачей</div>

        ${t.status === "cancelled" ? `
          <button type="button" class="task-action-btn reopen"
            onclick="window._taskAction('reopen','${id}')">
            ↩ Восстановить задачу
          </button>
        ` : `
          <div class="task-action-row">
            <button type="button" class="task-action-btn postpone"
              onclick="window._openPostponePanel('${id}')">
              📅 Перенести
            </button>
            <button type="button" class="task-action-btn cancel"
              onclick="window._openCancelPanel('${id}')">
              ✕ Отменить
            </button>
          </div>
        `}

        <div id="task-action-panel" style="display:none"></div>

        ${Array.isArray(t.history) && t.history.length ? `
          <div class="task-history">
            <div class="task-history-ttl">История</div>
            ${t.history.slice(-5).reverse().map(h => {
              const d = h.at ? new Date(h.at).toLocaleDateString("ru-RU",{day:"numeric",month:"short"}) : "";
              const reasonMap = { no_time:"не было времени", no_mood:"не хотел", irrelevant:"потеряло смысл" };
              if (h.event === "postponed")     return `<div class="task-hist-row">📅 Перенёс${h.from&&h.to?` с ${h.from} на ${h.to}`:""}${h.reason?` — ${reasonMap[h.reason]||h.reason}`:""} <span class="task-hist-date">${d}</span></div>`;
              if (h.event === "cancelled")     return `<div class="task-hist-row">✕ Отменил${h.reason?` — ${reasonMap[h.reason]||h.reason}`:""} <span class="task-hist-date">${d}</span></div>`;
              if (h.event === "reopened")      return `<div class="task-hist-row">↩ Восстановил <span class="task-hist-date">${d}</span></div>`;
              if (h.event === "title_changed") return `<div class="task-hist-row">✎ Переименовал: «${esc(h.from)}» → «${esc(h.to)}» <span class="task-hist-date">${d}</span></div>`;
              if (h.event === "goal_changed")  return `<div class="task-hist-row">🎯 Сменил цель: ${esc(h.from)} → ${esc(h.to)} <span class="task-hist-date">${d}</span></div>`;
              return "";
            }).filter(Boolean).join("")}
          </div>
        ` : ""}
      </div>

      <div style="margin-top:8px">
        <button class="btn-cl" style="color:var(--red);width:100%" onclick="window._delTask('${id}')">🗑 Удалить задачу</button>
      </div>`;

    // Вставляем пикеры с существующими значениями
    $("dtp-et-start-wrap")?.replaceWith(makeDateField("et-st", true, stVal));
    $("dtp-et-dl-wrap")?.replaceWith(makeDateField("et-dl", true, dlVal));
    // until поле
    const etUntilField = makeDateField("et-until", false, recurrence.until || "");
    const etUntilWrap = $("et-until-field-wrap");
    if (etUntilWrap) etUntilWrap.appendChild(etUntilField);
    $("dtp-et-reminder-wrap")?.replaceWith(makeDateField("et-reminder", true, remVal));

    $("et-quick-goal")?.addEventListener("click", () => {
      quickAddGoal((newId, newTitle) => {
        goals.push({ id: newId, title: newTitle });
        const sel = $("et-binding");
        const opt = document.createElement("option");
        opt.value = `goal:${newId}`; opt.textContent = esc(newTitle);
        let grp = [...sel.querySelectorAll("optgroup")].find(g => g.label.includes("Цели"));
        if (!grp) { grp = document.createElement("optgroup"); grp.label = "── Цели ──"; sel.appendChild(grp); }
        grp.appendChild(opt); sel.value = `goal:${newId}`; t.goalId = newId;
      });
    });
    $("et-quick-proj")?.addEventListener("click", () => {
      quickAddProject(t.goalId, (newId, newName) => {
        projects.push({ id: newId, name: newName, goalId: t.goalId });
        const sel = $("et-binding");
        const opt = document.createElement("option");
        opt.value = `proj:${newId}`; opt.textContent = esc(newName);
        let grp = [...sel.querySelectorAll("optgroup")].find(g => g.label.includes("Проекты"));
        if (!grp) { grp = document.createElement("optgroup"); grp.label = "── Проекты ──"; sel.appendChild(grp); }
        grp.appendChild(opt); sel.value = `proj:${newId}`;
      });
    });
    document.querySelectorAll("#edit-attach-list span").forEach(span => {
      span.onclick = e => { e.stopPropagation(); showFileViewer(span.dataset.url, span.dataset.type, span.dataset.name); };
    });
    document.querySelectorAll("#edit-attach-list .rm-sub").forEach(btn => {
      btn.onclick = e => { e.stopPropagation(); attachments = attachments.filter(a => a.url !== btn.dataset.url); btn.closest(".sub-row").remove(); };
    });
    $("et-attach").onchange = async e => {
      const file = e.target.files[0]; if (!file) return;
      toast("Загрузка...");
      const attached = await uploadAttachment(file, id);
      if (attached) {
        attachments.push(attached);
        const list = $("edit-attach-list");
        const div = document.createElement("div");
        div.className = "sub-row";
        div.innerHTML = `<span style="flex:1;font-size:11px;cursor:pointer;color:var(--blu);">📎 ${esc(attached.name)}</span><button class="rm-sub">×</button>`;
        list.appendChild(div);
        div.querySelector("span").onclick = () => showFileViewer(attached.url, attached.type, attached.name);
        div.querySelector(".rm-sub").onclick = () => { attachments = attachments.filter(a => a.url !== attached.url); div.remove(); };
      }
      e.target.value = "";
    };
  }

  openModal("Редактировать задачу", "", async () => {
    const newSubtasks = [...($("edit-sub-list")?.querySelectorAll("input")||[])].map(i=>i.value.trim()).filter(Boolean);
    const bindVal = $("et-binding")?.value || "";
    const newGoalId = bindVal.startsWith("goal:") ? bindVal.slice(5) : null;
    const newProjId = bindVal.startsWith("proj:") ? bindVal.slice(5) : null;
    let resolvedGoalId = newGoalId;
    if (newProjId && !newGoalId) {
      const proj = projects.find(p => p.id === newProjId);
      resolvedGoalId = proj?.goalId || null;
    }
    const startRaw    = dtpVal("et-st");
    const dlRaw       = dtpVal("et-dl");
    const recType     = $("et-recurrence-type")?.value.trim() || "none";
    const etUntilVal  = recType !== "none" ? (dtpVal("et-until") || null) : null;
    const newTitle    = $("et-ttl")?.value.trim() || t.title;
    try {
      // ── Записываем историю изменений ──
      await recordTitleChange(id, t.title, newTitle);
      await recordGoalChange(id, t.goalId || null, resolvedGoalId || null, goals);

      await updateTask(id, {
        title:     newTitle,
        motive:    $("et-motive")?.value || "duty",
        note:      $("et-note")?.value.trim() || "",
        goalId:    resolvedGoalId,
        projId:    newProjId,
        priority:  $("et-pri")?.value.trim() || "med",
        deadline:  dlRaw || null,
        startDate: startRaw || null,
        date:      startRaw ? startRaw.slice(0,10) : today(),
        reminder:  dtpVal("et-reminder") || null,
        subtasks:  newSubtasks,
        attachments,
        recurrence: recType !== "none" ? {
          type:      recType,
          interval:  1,
          until:     etUntilVal,
          weekdays:  recType === "weekly"
                       ? ([...document.querySelectorAll("#et-recur-weekdays .recur-wd-btn.on")].map(b => parseInt(b.dataset.day)) || null)
                       : null,
          monthdays: recType === "monthly"
                       ? ([...document.querySelectorAll("#et-recur-monthdays .recur-md-btn.on")].map(b => parseInt(b.dataset.day)) || null)
                       : null,
        } : null,
      });
      toast("Сохранено ✓");
      closeModal();
      window._refreshAll?.();
    } catch(e) {
      console.error("updateTask error:", e);
      toast("⚠️ Ошибка сохранения: " + e.message);
    }
  });
  renderEdit();
}

// ════════════════════════════════════════
//  ФОРМА ЦЕЛИ
// ════════════════════════════════════════
export async function buildGoalModal(title) {
  openModal(title || "Новая цель", `
    <div class="fg"><label class="fl">Название цели *</label>
      <input class="inp" id="g-title" placeholder="Чего хочу достичь?"/></div>
    <div class="fg"><label class="fl">Описание</label>
      <textarea class="txta" id="g-desc" placeholder="Подробнее..."></textarea></div>
    <div class="fg"><label class="fl">Дедлайн</label>
      <div id="dtp-g-dl-wrap"></div></div>`,
    async () => {
      const t = $("g-title")?.value.trim();
      if (!t) { toast("⚠️ Введите название цели"); return; }
      await addGoal({ title: t, desc: $("g-desc")?.value.trim() || "", deadline: dtpVal("g-dl") || null });
      toast("Цель добавлена ✓");
      closeModal();
      window._refreshAll?.();
    });
  setTimeout(() => {
    $("dtp-g-dl-wrap")?.replaceWith(makeDateField("g-dl", false));
  }, 0);
}

// ════════════════════════════════════════
//  ФОРМА ПРОЕКТА
// ════════════════════════════════════════
export async function buildProjectModal(title, defGoalId = null) {
  const goals = await getGoals();
  openModal(title || "Новый проект", `
    <div class="fg"><label class="fl">Название проекта *</label>
      <input class="inp" id="p-title" placeholder="Название проекта"/></div>
    <div class="fg"><label class="fl">Цель</label>
      <select class="sel" id="p-goal">
        <option value="">— Без цели —</option>
        ${goals.map(g=>`<option value="${g.id}" ${g.id===defGoalId?"selected":""}>${esc(g.title)}</option>`).join("")}
      </select></div>
    <div class="fg"><label class="fl">Описание</label>
      <textarea class="txta" id="p-desc" placeholder="Описание..."></textarea></div>`,
    async () => {
      const t = $("p-title")?.value.trim();
      if (!t) { toast("⚠️ Введите название"); return; }
      await addProject({ name: t, goalId: $("p-goal")?.value.trim() || null, desc: $("p-desc")?.value.trim() || "" });
      toast("Проект добавлен ✓");
      closeModal();
      window._refreshAll?.();
    });
}

// ════════════════════════════════════════
//  ФОРМА ИДЕИ
// ════════════════════════════════════════
export function buildIdeaModal(title, defaultDate = null) {
  const dateVal = dstr(defaultDate ? new Date(defaultDate) : new Date());
  let ideaTags = [];
  openModal(title || "Новая идея", `
    <div class="fg"><label class="fl">Заголовок *</label>
      <input class="inp" id="i-title" placeholder="Название идеи"/></div>
    <div class="fg"><label class="fl">Описание</label>
      <textarea class="txta" id="i-text" placeholder="Опишите идею подробнее..."></textarea></div>
    <div class="fg"><label class="fl">Теги</label>
      <div class="diary-tag-input-row">
        <input class="inp" id="i-tag-inp" placeholder="Добавить тег и Enter" style="flex:1"/>
        <button type="button" class="add-sub" onclick="window._addIdeaTag()">+</button>
      </div>
      <div class="diary-tags-wrap" id="i-tags-wrap"></div>
    </div>
    <div class="fg"><label class="fl">Дедлайн (если нужно реализовать до)</label>
      <div id="dtp-i-dl-wrap"></div></div>`,
    async () => {
      const t = $("i-title")?.value.trim();
      if (!t) { toast("⚠️ Введите заголовок"); return; }
      await addIdea({
        title: t,
        text:  $("i-text")?.value.trim() || "",
        date:  dateVal,
        tags:  ideaTags,
        deadline: dtpVal("i-dl") ? toTS(dtpVal("i-dl")) : null,
      });
      toast("Идея добавлена ✓");
      closeModal();
      window._refreshAll?.();
    });

  // Хелперы тегов
  window._addIdeaTag = () => {
    const inp = $("i-tag-inp");
    const val = inp?.value.trim().toLowerCase().replace(/\s+/g,"-");
    if (!val || ideaTags.includes(val)) { if(inp) inp.value=""; return; }
    ideaTags.push(val);
    if(inp) inp.value = "";
    _renderIdeaTags(ideaTags, "i-tags-wrap", "i");
  };
  window._removeIdeaTag = (tag) => {
    ideaTags = ideaTags.filter(t => t !== tag);
    _renderIdeaTags(ideaTags, "i-tags-wrap", "i");
  };
  // Enter в поле тега
  setTimeout(() => {
    $("i-tag-inp")?.addEventListener("keydown", e => { if(e.key==="Enter"){e.preventDefault();window._addIdeaTag();} });
    $("dtp-i-dl-wrap")?.replaceWith(makeDateField("i-dl", false));
  }, 0);
}

// Рендер тегов идеи (аналог дневника)
function _renderIdeaTags(tags, containerId, prefix) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  wrap.innerHTML = tags.map(t => `
    <span class="diary-tag-pill">
      #${esc(t)}
      <button type="button" onclick="window._removeIdeaTag${prefix==="ei"?"Edit":""}('${t}')" class="diary-tag-remove">×</button>
    </span>`).join("");
}

// ════════════════════════════════════════
//  РЕДАКТИРОВАНИЕ ИДЕИ
// ════════════════════════════════════════
export async function editIdeaModal(id) {
  const all = await getIdeas();
  const x = all.find(i => i.id === id);
  if (!x) return;
  const dlVal = x.deadline ? (x.deadline.toDate ? x.deadline.toDate() : new Date(x.deadline)).toISOString().slice(0,10) : "";
  let ideaTags = Array.isArray(x.tags) ? [...x.tags] : [];

  openModal("Редактировать идею", `
    <div class="fg"><label class="fl">Заголовок *</label>
      <input class="inp" id="ei-title" value="${esc(x.title||"")}"/></div>
    <div class="fg"><label class="fl">Описание</label>
      <textarea class="txta" id="ei-text">${esc(x.text||"")}</textarea></div>
    <div class="fg"><label class="fl">Теги</label>
      <div class="diary-tag-input-row">
        <input class="inp" id="ei-tag-inp" placeholder="Добавить тег и Enter" style="flex:1"/>
        <button type="button" class="add-sub" onclick="window._addIdeaTagEdit()">+</button>
      </div>
      <div class="diary-tags-wrap" id="ei-tags-wrap">
        ${ideaTags.map(t=>`<span class="diary-tag-pill">#${esc(t)}<button type="button" onclick="window._removeIdeaTagEdit('${t}')" class="diary-tag-remove">×</button></span>`).join("")}
      </div>
    </div>
    <div class="fg"><label class="fl">Дедлайн</label>
      <div id="dtp-ei-dl-wrap"></div></div>
    <div style="margin-top:8px">
      <button class="btn-cl" style="color:var(--red);width:100%" onclick="window.delItem('ideas','${id}')">🗑 Удалить идею</button>
    </div>`,
    async () => {
      const t = $("ei-title")?.value.trim();
      if (!t) { toast("⚠️ Введите заголовок"); return; }
      await updateIdea(id, {
        title: t,
        text:  $("ei-text")?.value.trim() || "",
        date:  x.date || today(),
        tags:  ideaTags,
        deadline: dtpVal("ei-dl") ? toTS(dtpVal("ei-dl")) : null,
      });
      toast("Сохранено ✓");
      closeModal();
      window._refreshAll?.();
    });

  window._addIdeaTagEdit = () => {
    const inp = $("ei-tag-inp");
    const val = inp?.value.trim().toLowerCase().replace(/\s+/g,"-");
    if (!val || ideaTags.includes(val)) { if(inp) inp.value=""; return; }
    ideaTags.push(val);
    if(inp) inp.value = "";
    _renderIdeaTags(ideaTags, "ei-tags-wrap", "ei");
  };
  window._removeIdeaTagEdit = tag => {
    ideaTags = ideaTags.filter(t => t !== tag);
    _renderIdeaTags(ideaTags, "ei-tags-wrap", "ei");
  };

  setTimeout(() => {
    $("ei-tag-inp")?.addEventListener("keydown", e => { if(e.key==="Enter"){e.preventDefault();window._addIdeaTagEdit();} });
    $("dtp-ei-dl-wrap")?.replaceWith(makeDateField("ei-dl", false, dlVal));
  }, 0);
}

// ════════════════════════════════════════
//  ФОРМА ДНЕВНИКА
// ════════════════════════════════════════
export async function buildDiaryModal(title, tmpl = null, defaultDate = null) {
  const dateVal  = defaultDate || dstr(new Date());
  const now      = new Date();
  const timeVal  = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
  const tmplBody = tmpl?.body || "";
  let   tags     = [];

  function renderTagsBlock(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = tags.map((tag, i) => `
      <span class="diary-tag">#${esc(tag)}<button class="diary-tag-rm" onclick="window._diaryRmTag(${i},'${containerId}')">×</button></span>`
    ).join("") +
      `<input class="diary-tag-inp" id="${containerId}-inp" placeholder="+ тег (Enter)"
        onkeydown="if(event.key==='Enter'||event.key===','){event.preventDefault();window._diaryAddTag(this.value.trim(),'${containerId}');this.value='';}"/>`;
  }

  window._diaryAddTag = (val, cid) => {
    const t = val.trim().replace(/^#/, "").replace(/\s+/g,"_");
    if (t && !tags.includes(t)) { tags.push(t); renderTagsBlock(cid); }
    const inp = document.getElementById(cid + "-inp");
    if (inp) { inp.value = ""; inp.focus(); }
  };
  window._diaryRmTag = (i, cid) => { tags.splice(i, 1); renderTagsBlock(cid); };

  openModal(title || "Новая запись в дневник", `
    <div class="fg"><label class="fl">Заголовок *</label>
      <input class="inp" id="d-title" placeholder="Заголовок записи" value="${tmpl ? esc(tmpl.title||"") : ""}"/></div>
    <div class="fg"><label class="fl">Текст</label>
      <textarea class="txta" id="d-text" style="min-height:140px" placeholder="Запиши свои мысли...">${esc(tmplBody)}</textarea></div>
    <div class="inp-row">
      <div class="fg" style="flex:1"><label class="fl">Дата</label>
        <input class="inp" id="d-date" type="date" value="${dateVal}"/></div>
      <div class="fg" style="flex:1"><label class="fl">Время</label>
        <input class="inp" id="d-time" type="time" value="${timeVal}"/></div>
    </div>
    <div class="fg"><label class="fl">Настроение</label>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:4px" id="d-mood-row">
        ${["😊 Отлично","🙂 Хорошо","😐 Нейтрально","😔 Плохо","😢 Тяжело"].map(m=>`
          <button class="pri-btn" data-mood="${m}"
            onclick="document.querySelectorAll('[data-mood]').forEach(b=>b.classList.remove('on-med'));this.classList.add('on-med');document.getElementById('d-mood-val').value='${m}'">${m}</button>`
        ).join("")}
      </div>
      <input type="hidden" id="d-mood-val" value=""/>
    </div>
    <div class="fg"><label class="fl">Теги</label>
      <div class="diary-tags-wrap" id="d-tags-wrap"></div>
      <div style="font-size:10px;color:var(--tx-l);margin-top:4px">Введите тег и нажмите Enter или запятую</div>
    </div>`,
    async () => {
      const t = $("d-title")?.value.trim();
      if (!t) { toast("⚠️ Введите заголовок"); return; }
      const inp = $("d-tags-wrap-inp");
      if (inp?.value.trim()) window._diaryAddTag(inp.value.trim(), "d-tags-wrap");
      await addDiaryEntry({
        title: t,
        text:  $("d-text")?.value.trim() || "",
        date:  $("d-date")?.value.trim() || today(),
        time:  $("d-time")?.value.trim() || "",
        mood:  $("d-mood-val")?.value.trim() || "",
        tags,
      });
      toast("Запись добавлена ✓");
      closeModal();
      window._refreshAll?.();
    });
  setTimeout(() => renderTagsBlock("d-tags-wrap"), 0);
}

// ════════════════════════════════════════
//  РЕДАКТИРОВАНИЕ ДНЕВНИКА
// ════════════════════════════════════════
export async function editDiaryModal(id) {
  const all = await getDiary();
  const x = all.find(e => e.id === id);
  if (!x) return;
  let tags = Array.isArray(x.tags) ? [...x.tags] : [];

  function renderTagsBlock(cid) {
    const container = document.getElementById(cid);
    if (!container) return;
    container.innerHTML = tags.map((tag, i) => `
      <span class="diary-tag">#${esc(tag)}<button class="diary-tag-rm" onclick="window._diaryRmTag(${i},'${cid}')">×</button></span>`
    ).join("") +
      `<input class="diary-tag-inp" id="${cid}-inp" placeholder="+ тег (Enter)"
        onkeydown="if(event.key==='Enter'||event.key===','){event.preventDefault();window._diaryAddTag(this.value.trim(),'${cid}');this.value='';}"/>`;
  }

  window._diaryAddTag = (val, cid) => {
    const t = val.trim().replace(/^#/, "").replace(/\s+/g,"_");
    if (t && !tags.includes(t)) { tags.push(t); renderTagsBlock(cid); }
    const inp = document.getElementById(cid + "-inp");
    if (inp) { inp.value = ""; inp.focus(); }
  };
  window._diaryRmTag = (i, cid) => { tags.splice(i, 1); renderTagsBlock(cid); };

  openModal("Редактировать запись", `
    <div class="fg"><label class="fl">Заголовок *</label>
      <input class="inp" id="ed-title" value="${esc(x.title||"")}"/></div>
    <div class="fg"><label class="fl">Текст</label>
      <textarea class="txta" id="ed-text" style="min-height:140px">${esc(x.text||"")}</textarea></div>
    <div class="inp-row">
      <div class="fg" style="flex:1"><label class="fl">Дата</label>
        <input class="inp" id="ed-date" type="date" value="${x.date||today()}"/></div>
      <div class="fg" style="flex:1"><label class="fl">Время</label>
        <input class="inp" id="ed-time" type="time" value="${x.time||""}"/></div>
    </div>
    <div class="fg"><label class="fl">Настроение</label>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:4px">
        ${["😊 Отлично","🙂 Хорошо","😐 Нейтрально","😔 Плохо","😢 Тяжело"].map(m=>`
          <button class="pri-btn ${x.mood===m?"on-med":""}" data-mood="${m}"
            onclick="document.querySelectorAll('[data-mood]').forEach(b=>b.classList.remove('on-med'));this.classList.add('on-med');document.getElementById('ed-mood-val').value='${m}'">${m}</button>`
        ).join("")}
      </div>
      <input type="hidden" id="ed-mood-val" value="${esc(x.mood||"")}"/>
    </div>
    <div class="fg"><label class="fl">Теги</label>
      <div class="diary-tags-wrap" id="ed-tags-wrap"></div>
      <div style="font-size:10px;color:var(--tx-l);margin-top:4px">Введите тег и нажмите Enter или запятую</div>
    </div>
    <div style="margin-top:8px">
      <button class="btn-cl" style="color:var(--red);width:100%" onclick="window.delItem('diary','${id}')">🗑 Удалить запись</button>
    </div>`,
    async () => {
      const t = $("ed-title")?.value.trim();
      if (!t) { toast("⚠️ Введите заголовок"); return; }
      const inp = $("ed-tags-wrap-inp");
      if (inp?.value.trim()) window._diaryAddTag(inp.value.trim(), "ed-tags-wrap");
      await updateDiaryEntry(id, {
        title: t,
        text:  $("ed-text")?.value.trim() || "",
        date:  $("ed-date")?.value.trim() || today(),
        time:  $("ed-time")?.value.trim() || "",
        mood:  $("ed-mood-val")?.value.trim() || "",
        tags,
      });
      toast("Сохранено ✓");
      closeModal();
      window._refreshAll?.();
    });
  setTimeout(() => renderTagsBlock("ed-tags-wrap"), 0);
}

// ════════════════════════════════════════
//  ФОРМА ШАБЛОНА ДНЕВНИКА
// ════════════════════════════════════════
export function buildTemplateModal(title) {
  openModal(title || "Новый шаблон", `
    <div class="fg"><label class="fl">Название шаблона *</label>
      <input class="inp" id="tmpl-title" placeholder="Например: Утренние страницы"/></div>
    <div class="fg"><label class="fl">Текст шаблона</label>
      <textarea class="txta" id="tmpl-body" style="min-height:120px" placeholder="Шаблонный текст, вопросы для записи..."></textarea></div>`,
    async () => {
      const t = $("tmpl-title")?.value.trim();
      if (!t) { toast("⚠️ Введите название шаблона"); return; }
      await addTemplate({ title: t, body: $("tmpl-body")?.value.trim() || "" });
      toast("Шаблон создан ✓");
      closeModal();
      window._refreshAll?.();
    });
}

// ════════════════════════════════════════
//  ПОВТОРЕНИЯ — вспомогательные функции
// ════════════════════════════════════════

function _recurUnit(type) {
  return { daily:"дней", weekly:"нед.", monthly:"мес.", yearly:"лет" }[type] || "дней";
}
window._recurUnit = _recurUnit;

// Выбор типа повторения
window._setRecurType = (btn, prefix) => {
  const val = btn.dataset.val;
  btn.closest(".recur-types").querySelectorAll(".recur-type-btn").forEach(b => b.classList.remove("on"));
  btn.classList.add("on");

  const hiddenInp   = document.getElementById(prefix + "-recurrence-type");
  const wdRow       = document.getElementById(prefix + "-recur-weekdays");
  const mdRow       = document.getElementById(prefix + "-recur-monthdays");
  const untilRow    = document.getElementById(prefix + "-recur-until-row");

  if (hiddenInp) hiddenInp.value = val;
  // Дни недели — только для weekly
  if (wdRow)  wdRow.style.display  = val === "weekly"  ? "flex"  : "none";
  // Числа месяца — только для monthly
  if (mdRow)  mdRow.style.display  = val === "monthly" ? "block" : "none";
  // Дата окончания — для всех кроме none
  if (untilRow) untilRow.style.display = val !== "none" ? "block" : "none";
};

// Переключение дня недели
window._toggleWd = btn => btn.classList.toggle("on");

// Переключение числа месяца
window._toggleMd = btn => btn.classList.toggle("on");

// Переключение «Бессрочно» / дата окончания
window._toggleForever = prefix => {
  const cb      = document.getElementById(prefix + "-recur-forever");
  const forever = cb?.checked ?? true;
  // Враппер поля — id изменился на {prefix}-until-field-wrap
  const wrapId  = prefix === "t" ? "t-until-field-wrap" : "et-until-field-wrap";
  const wrap    = document.getElementById(wrapId);
  if (!wrap) return;

  if (forever) {
    wrap.style.opacity = ".35";
    wrap.style.pointerEvents = "none";
    // Сбрасываем значение чтобы сохранить как null
    const hidden = document.getElementById(prefix === "t" ? "t-until" : "et-until");
    if (hidden) { hidden.value = ""; }
    const btn = wrap.querySelector(".dtp-btn");
    if (btn) btn.textContent = "Дата...";
  } else {
    wrap.style.opacity = "1";
    wrap.style.pointerEvents = "auto";
    // Подставляем дефолт: дата начала + 23:00
    const hidden = document.getElementById(prefix === "t" ? "t-until" : "et-until");
    if (hidden && !hidden.value) {
      const startId  = prefix === "t" ? "t-start" : "et-st";
      const startVal = document.getElementById(startId)?.value || "";
      const datePart = startVal ? startVal.slice(0, 10) : dstr(new Date());
      const defVal   = datePart; // только дата для поля until
      hidden.value = defVal;
      const btn = wrap.querySelector(".dtp-btn");
      if (btn) btn.textContent = formatDisplay(defVal, false);
    }
  }
};

// ════════════════════════════════════════
//  ПРЕОБРАЗОВАНИЕ ЗАДАЧИ → ЦЕЛЬ / ПРОЕКТ
// ════════════════════════════════════════
window._transformTask = async (taskId, targetType) => {
  const allT = await getTasks();
  const t    = allT.find(x => x.id === taskId);
  if (!t) return;

  const label = targetType === "goal" ? "цель" : "проект";
  if (!confirm(`Преобразовать задачу «${t.title}» в ${label}?\n\nЗадача будет удалена, её подзадачи станут задачами внутри нового ${label === "цель" ? "цели" : "проекта"}.`)) return;

  try {
    if (targetType === "goal") {
      const ref = await addGoal({
        title: t.title, desc: t.note || "", priority: t.priority || "medium", done: false,
      });
      // Подзадачи → задачи привязанные к новой цели
      for (const sub of (t.subtasks || [])) {
        await addTask({ title: sub, goalId: ref.id, priority: "med", date: today(), done: false });
      }
    } else {
      const ref = await addProject({
        name: t.title, desc: t.note || "", goalId: t.goalId || null, done: false,
      });
      for (const sub of (t.subtasks || [])) {
        await addTask({ title: sub, projId: ref.id, goalId: t.goalId || null, priority: "med", date: today(), done: false });
      }
    }
    await deleteTask(taskId);
    toast(`Задача преобразована в ${label} ✓`);
    closeModal();
    window._refreshAll?.();
  } catch(e) {
    toast("Ошибка: " + e.message);
  }
};

// ════════════════════════════════════════
//  МОТИВ ЗАДАЧИ — переключатель Надо / Хочу
// ════════════════════════════════════════
window._setMotive = (val, prefix = "t") => {
  // Определяем правильные id в зависимости от контекста (новая / редактирование)
  const isEdit = prefix === "et";
  const dutyId = isEdit ? "et-motive-duty" : "motive-duty";
  const wantId = isEdit ? "et-motive-want" : "motive-want";
  const hiddenId = isEdit ? "et-motive" : "t-motive";
  const hintId = isEdit ? "et-motive-hint" : "motive-hint";

  document.getElementById(dutyId)?.classList.toggle("on", val === "duty");
  document.getElementById(wantId)?.classList.toggle("on", val === "want");
  const hidden = document.getElementById(hiddenId);
  if (hidden) hidden.value = val;
  const hint = document.getElementById(hintId);
  if (hint) hint.textContent = val === "want"
    ? "🔥 Это твой выбор — задача наполняет энергией"
    : "⚙️ Это задача по обязанности — но она тоже важна";
};

// ════════════════════════════════════════
//  ФОРМА ВЕЧЕРНЕГО АУДИТА
//  Быстрый чек-ин: энергия + усталость +
//  настроение + рефлексия + AI-ответ
// ════════════════════════════════════════
export async function buildAuditModal(existingAudit = null) {
  const energy     = existingAudit?.energy    ?? 5;
  const fatigue    = existingAudit?.fatigue   ?? 5;
  const mood       = existingAudit?.mood      ?? "";
  const reflection = existingAudit?.reflection ?? "";

  // Считаем коэффициент авторства за сегодня
  const authorRatio = await calcAuthorRatio();

  // Цвет и иконка авторства
  let arColor = "var(--tx-m)", arIco = "💤";
  if (authorRatio !== null) {
    if (authorRatio >= 60) { arColor = "var(--grn)"; arIco = "🔥"; }
    else if (authorRatio >= 30) { arColor = "var(--go)"; arIco = "⚡"; }
  }

  openModal("🌙 Вечерний аудит", `
    <div style="font-size:13px;color:var(--tx-m);margin-bottom:14px;line-height:1.5">
      Пара минут честности с собой. Без оценок — только данные.
    </div>

    ${authorRatio !== null ? `
    <div class="audit-author-badge">
      <span class="audit-author-ico">${arIco}</span>
      <div class="audit-author-body">
        <span class="audit-author-lbl">Авторство сегодня</span>
        <span class="audit-author-val" style="color:${arColor}">${authorRatio}%</span>
      </div>
      <span class="audit-author-sub">задач «Хочу» из выполненных</span>
    </div>` : `
    <div class="audit-author-badge audit-author-empty">
      <span class="audit-author-ico">📋</span>
      <div class="audit-author-body">
        <span class="audit-author-lbl">Нет выполненных задач</span>
        <span class="audit-author-sub">Отметь задачи «Хочу» чтобы видеть авторство</span>
      </div>
    </div>`}

    <div class="fg">
      <label class="fl">⚡ Энергия сейчас: <span id="audit-energy-val">${energy}</span>/10</label>
      <input type="range" class="audit-slider" id="audit-energy" min="1" max="10" value="${energy}"
        oninput="document.getElementById('audit-energy-val').textContent=this.value"/>
      <div class="audit-slider-marks"><span>😴</span><span>⚡</span><span>🚀</span></div>
    </div>

    <div class="fg">
      <label class="fl">😮‍💨 Усталость: <span id="audit-fatigue-val">${fatigue}</span>/10</label>
      <input type="range" class="audit-slider" id="audit-fatigue" min="1" max="10" value="${fatigue}"
        oninput="document.getElementById('audit-fatigue-val').textContent=this.value"/>
      <div class="audit-slider-marks"><span>💪</span><span>😐</span><span>🥴</span></div>
    </div>

    <div class="fg"><label class="fl">Настроение</label>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px" id="audit-mood-row">
        ${["😊 Отлично","🙂 Хорошо","😐 Нейтрально","😔 Плохо","😢 Тяжело"].map(m => `
          <button type="button" class="pri-btn ${mood===m?"on-med":""}" data-mood="${m}"
            onclick="document.querySelectorAll('[data-mood]').forEach(b=>b.classList.remove('on-med'));this.classList.add('on-med');document.getElementById('audit-mood-val').value='${m}'">${m}</button>`
        ).join("")}
      </div>
      <input type="hidden" id="audit-mood-val" value="${esc(mood)}"/>
    </div>

    <div class="fg"><label class="fl">Рефлексия дня</label>
      <textarea class="txta" id="audit-reflection" style="min-height:90px"
        placeholder="Какой момент сегодня был твоим? Что сделал для себя, а не для других?">${esc(reflection)}</textarea>
    </div>

    <div style="font-size:11px;color:var(--tx-l);margin-top:6px;line-height:1.5">
      После сохранения AI проанализирует твой день и задаст один вопрос.
    </div>`,

    async () => {
      const energyVal     = parseInt(document.getElementById("audit-energy")?.value)  || 5;
      const fatigueVal    = parseInt(document.getElementById("audit-fatigue")?.value) || 5;
      const moodVal       = document.getElementById("audit-mood-val")?.value || "";
      const reflectionTxt = document.getElementById("audit-reflection")?.value.trim() || "";

      const auditData = {
        energy:      energyVal,
        fatigue:     fatigueVal,
        mood:        moodVal,
        reflection:  reflectionTxt,
        authorRatio: authorRatio,
        aiResponse:  existingAudit?.aiResponse || null,
      };

      await saveDailyAudit(auditData);
      const { toast: toastFn } = await import("./modal.js");
      toastFn("Аудит сохранён ✓");
      closeModal();

      // Запускаем AI-анализ в фоне, если есть рефлексия
      if (reflectionTxt) {
        window._runAuditAI?.(auditData);
      }

      window._refreshAll?.();
    }
  );
}

// ════════════════════════════════════════
//  ПЕРЕНОС / ОТМЕНА ЗАДАЧИ — панели в модальном окне
// ════════════════════════════════════════

window._openPostponePanel = id => {
  const panel = document.getElementById("task-action-panel");
  if (!panel) return;
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek = new Date(); nextWeek.setDate(nextWeek.getDate() + 7);
  const p2  = n => String(n).padStart(2, "0");
  const fmt     = d => `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`;
  const fmtDisp = d => `${p2(d.getDate())}.${p2(d.getMonth()+1)}`;

  panel.style.display = "block";
  panel.innerHTML = `
    <div class="task-action-panel-inner postpone">
      <div class="tap-ttl">📅 На когда перенести?</div>
      <div class="tap-dates">
        <button class="tap-date-btn" onclick="window._taskAction('postpone','${id}','${fmt(tomorrow)}', window._postponeReason||'no_time')">
          Завтра <span>${fmtDisp(tomorrow)}</span>
        </button>
        <button class="tap-date-btn" onclick="window._taskAction('postpone','${id}','${fmt(nextWeek)}', window._postponeReason||'no_time')">
          След. неделя <span>${fmtDisp(nextWeek)}</span>
        </button>
      </div>
      <div class="tap-ttl" style="margin-top:10px">Причина</div>
      <div class="tap-reasons">
        <button class="tap-reason-btn on" onclick="window._setPostponeReason(this,'no_time')">⏰ Не было времени</button>
        <button class="tap-reason-btn"    onclick="window._setPostponeReason(this,'no_mood')">😶 Не хотел делать</button>
        <button class="tap-reason-btn"    onclick="window._setPostponeReason(this,'irrelevant')">🔄 Потеряло актуальность</button>
      </div>
      <button class="tap-cancel" onclick="document.getElementById('task-action-panel').style.display='none'">Закрыть</button>
    </div>`;

  window._postponeReason = "no_time";
};

window._setPostponeReason = (btn, reason) => {
  document.querySelectorAll(".tap-reason-btn").forEach(b => b.classList.remove("on"));
  btn.classList.add("on");
  window._postponeReason = reason;
};

window._openCancelPanel = id => {
  const panel = document.getElementById("task-action-panel");
  if (!panel) return;
  panel.style.display = "block";
  panel.innerHTML = `
    <div class="task-action-panel-inner cancel">
      <div class="tap-ttl">✕ Причина отмены</div>
      <div class="tap-reasons">
        <button class="tap-reason-btn" onclick="window._taskAction('cancel','${id}',null,'no_time')">⏰ Не нашёл времени</button>
        <button class="tap-reason-btn" onclick="window._taskAction('cancel','${id}',null,'no_mood')">😶 Не хотел делать</button>
        <button class="tap-reason-btn" onclick="window._taskAction('cancel','${id}',null,'irrelevant')">🔄 Потеряло смысл</button>
      </div>
      <button class="tap-cancel" onclick="document.getElementById('task-action-panel').style.display='none'">Закрыть</button>
    </div>`;
};

window._taskAction = async (action, id, newDate, reason) => {
  const { closeModal, toast: toastFn } = await import("./modal.js");
  try {
    if (action === "postpone") {
      const p2 = n => String(n).padStart(2, "0");
      const date = newDate || (() => {
        const d = new Date(); d.setDate(d.getDate() + 1);
        return `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`;
      })();
      await postponeTask(id, date, reason || window._postponeReason || "no_time");
      toastFn("📅 Задача перенесена");
    } else if (action === "cancel") {
      await cancelTask(id, reason || "irrelevant");
      toastFn("✕ Задача отменена");
    } else if (action === "reopen") {
      await reopenTask(id);
      toastFn("↩ Задача восстановлена");
    }
    closeModal();
    window._refreshAll?.();
  } catch(e) {
    toastFn("⚠️ Ошибка: " + e.message);
  }
};

// ════════════════════════════════════════
//  ДИСПЕТЧЕР — openNewModal
// ════════════════════════════════════════
export async function openNewModal(type, goalId = null, projId = null, tab = null, defaultDate = null) {
  switch (type) {
    case "task":     return buildTaskModal("Новая задача", goalId, projId, defaultDate);
    case "goal":     return buildGoalModal("Новая цель");
    case "project":  return buildProjectModal("Новый проект", goalId);
    case "idea":     return buildIdeaModal("Новая идея", defaultDate);
    case "diary":    return buildDiaryModal("Новая запись", null, defaultDate);
    case "template": return buildTemplateModal("Новый шаблон");
    case "audit":    return buildAuditModal();
    default:         return buildTaskModal("Новая запись", goalId, projId, defaultDate);
  }
}
