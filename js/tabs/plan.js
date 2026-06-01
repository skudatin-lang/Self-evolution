// ════════════════════════════════════════
//  TAB: ДЕНЬ  v5 — исправленная логика задач
//  js/tabs/plan.js
// ════════════════════════════════════════

import { registerTab, buildDayNav } from "../router.js";
import {
  getTasks, getGoals, getProjects,
  getSurvey, dstr, esc, getKeyTask,
  saveDailyAudit, getAuditForDate
} from "../db.js";

let planDate = new Date(); planDate.setHours(0,0,0,0);
let showAll  = false;

export function initPlan() { registerTab("plan", renderPlan); }

// ════════════════════════════════════════
//  TOGGLE ЗАДАЧИ — передаём выбранный день
// ════════════════════════════════════════
window._toggleTaskOnDate = async (id, dateStr) => {
  // dateStr — строка "2026-05-30" из data-атрибута кнопки
  try {
    const { toggleTask } = await import("../db.js");
    await toggleTask(id, dateStr);
    await renderPlan();
  } catch(e) {
    console.error("_toggleTaskOnDate error:", e);
    window._toast?.("Ошибка: " + e.message);
  }
};

window._toggleMain = async (id) => {
  try {
    const { getTasks } = await import("../db.js");
    const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const { db } = await import("../firebase.js");
    const { getUid } = await import("../db.js");
    const all = await getTasks();
    const t = all.find(x => x.id === id);
    if (!t) return;
    await updateDoc(doc(db, "users", getUid(), "tasks", id), { isMain: !t.isMain });
    await renderPlan();
  } catch(e) {
    console.error("_toggleMain error:", e);
  }
};

// ════════════════════════════════════════
//  MORNING CHECK-IN
// ════════════════════════════════════════
function renderMorningCheckin(audit) {
  const h = new Date().getHours();
  if (h >= 14 && !audit) return "";
  if (audit?.checkinDone) return "";

  const fields = [
    { id:"ci-energy",  label:"Энергия",  color:"#4DFFB4" },
    { id:"ci-focus",   label:"Фокус",    color:"#7C5CFF" },
    { id:"ci-stress",  label:"Стресс",   color:"#FF5C9F" },
    { id:"ci-control", label:"Контроль", color:"#5CB8FF" },
  ];

  return `
    <div class="checkin-card" id="morning-checkin">
      <div class="checkin-header">
        <div class="checkin-icon">☀</div>
        <div class="checkin-title-block">
          <div class="checkin-title">Утренний чек-ин</div>
          <div class="checkin-sub">Как ты сегодня? 1 минута</div>
        </div>
      </div>
      <div class="checkin-sliders">
        ${fields.map(f => `
          <div class="checkin-slider-row">
            <span class="checkin-slider-lbl">${f.label}</span>
            <div class="checkin-scale" id="${f.id}-scale">
              ${[1,2,3,4,5,6,7,8,9,10].map(n =>
                `<button class="cs-btn" onclick="window._ciSelect('${f.id}',${n},this)"
                  style="--cs-color:${f.color}">${n}</button>`
              ).join("")}
            </div>
          </div>`).join("")}
      </div>
      <input class="inp checkin-note-inp" id="ci-note"
        placeholder="Главное намерение дня…" style="margin:8px 0"/>
      <button class="checkin-save-btn" onclick="window._saveMorningCheckin()">
        Отметить состояние →
      </button>
    </div>`;
}

window._ciSelect = (field, val, btn) => {
  document.getElementById(field + "-scale")
    ?.querySelectorAll(".cs-btn").forEach(b => b.classList.remove("on"));
  btn.classList.add("on");
};

window._saveMorningCheckin = async () => {
  const get = id => {
    const btn = document.querySelector(`#${id}-scale .cs-btn.on`);
    return btn ? parseInt(btn.dataset?.val ?? btn.textContent) : null;
  };
  await saveDailyAudit({
    energy:  get("ci-energy"), focus: get("ci-focus"),
    stress:  get("ci-stress"), control: get("ci-control"),
    note:    document.getElementById("ci-note")?.value.trim() || "",
    checkinDone: true, checkinTime: new Date().toISOString(),
    date: dstr(new Date()),
  });
  const card = document.getElementById("morning-checkin");
  if (card) card.innerHTML = `<div class="checkin-done">
    <span class="checkin-done-ico">✓</span>
    <span class="checkin-done-text">Состояние отмечено</span>
  </div>`;
  window._toast?.("Чек-ин сохранён ✓");
  window._refreshAll?.();
};

// ════════════════════════════════════════
//  EVENING REFLECTION
// ════════════════════════════════════════
function renderEveningReflection(audit) {
  const h = new Date().getHours();
  if (h < 18) return "";
  if (audit?.reflectionDone) return "";
  return `
    <div class="reflection-card" id="evening-reflection">
      <div class="reflection-header">
        <div class="reflection-icon">◐</div>
        <div class="reflection-title-block">
          <div class="reflection-title">Вечерняя рефлексия</div>
          <div class="reflection-sub">Конец дня — время осознания</div>
        </div>
      </div>
      <div class="reflection-questions">
        <div class="rq-item">
          <label class="rq-label">Что реально продвинуло тебя вперёд?</label>
          <textarea class="inp txta rq-inp" id="ref-progress" rows="2"
            placeholder="Не что сделал, а что изменило ситуацию…"></textarea>
        </div>
        <div class="rq-item">
          <label class="rq-label">Главное наблюдение дня</label>
          <textarea class="inp txta rq-inp" id="ref-observation" rows="2"
            placeholder="Что заметил о себе…"></textarea>
        </div>
        <div class="rq-mood-row">
          <span class="rq-label">Как завершается день?</span>
          <div class="rq-mood-btns">
            ${["😤","😔","😐","🙂","😌"].map((e,i) =>
              `<button class="rq-mood-btn" data-val="${i+1}"
                onclick="window._refMood(${i+1},this)">${e}</button>`
            ).join("")}
          </div>
        </div>
      </div>
      <button class="reflection-save-btn" onclick="window._saveEveningReflection()">
        Сохранить рефлексию →
      </button>
    </div>`;
}

window._refMood = (val, btn) => {
  document.querySelectorAll(".rq-mood-btn").forEach(b => b.classList.remove("on"));
  btn.classList.add("on");
};

window._saveEveningReflection = async () => {
  const moodBtn = document.querySelector(".rq-mood-btn.on");
  await saveDailyAudit({
    refProgress:    document.getElementById("ref-progress")?.value.trim()    || "",
    refObservation: document.getElementById("ref-observation")?.value.trim() || "",
    refMood:        moodBtn ? parseInt(moodBtn.dataset.val) : null,
    reflectionDone: true, reflectionTime: new Date().toISOString(),
    date: dstr(new Date()),
  });
  const card = document.getElementById("evening-reflection");
  if (card) card.innerHTML = `<div class="checkin-done">
    <span class="checkin-done-ico">✓</span>
    <span class="checkin-done-text">Рефлексия сохранена</span>
  </div>`;
  window._toast?.("Рефлексия сохранена ✓");
  window._refreshAll?.();
};

// ════════════════════════════════════════
//  ПОВТОРЯЮЩИЕСЯ ЗАДАЧИ — совпадение даты
// ════════════════════════════════════════
function recurMatchesDate(t, target) {
  const r = t.recurrence;
  if (!r || r.type === "none") return false;
  const start = t.startDate?.toDate?.() ?? (t.date ? new Date(t.date + "T00:00:00") : null);
  if (!start || start > target) return false;
  const until = r.until ? new Date(r.until + "T00:00:00") : null;
  if (until && target > until) return false;
  const dow = target.getDay(), dom = target.getDate();
  const diff = Math.round((target - start) / 86400000);
  switch (r.type) {
    case "daily":   return diff >= 0;
    case "weekly":
      if (r.weekdays?.length) return r.weekdays.includes(dow);
      return diff % (7 * (r.interval || 1)) === 0;
    case "monthly":
      if (r.monthdays?.length) return r.monthdays.includes(dom);
      return dom === start.getDate();
    case "yearly":
      return dom === start.getDate() && target.getMonth() === start.getMonth();
    default: return false;
  }
}

// ════════════════════════════════════════
//  КАРТОЧКИ ЗАДАЧ
//  ВАЖНО: дата передаётся как data-атрибут в кнопку,
//  не через глобальную переменную (надёжнее)
// ════════════════════════════════════════
function renderMainTaskCard(t, goals, targetStr) {
  // Задача выполнена именно в этот день?
  const isDoneToday = t.done && t.completedDate === targetStr;
  const goalName = goals.find(g => g.id === t.goalId)?.title || "";
  const catLabel = goalName ? goalName.slice(0, 12) : (t.category || "");
  const catColor = t.goalColor || "#7C5CFF";
  const mins = t.duration || t.estimatedMinutes || null;

  return `
    <div class="plan-main-task-card" onclick="window.editTask('${t.id}')">
      <button class="plan-mtc-check ${isDoneToday ? "done" : ""}"
        data-tid="${t.id}" data-date="${targetStr}"
        onclick="event.stopPropagation();window._toggleTaskOnDate(this.dataset.tid, this.dataset.date)">
        ${isDoneToday ? "✓" : ""}
      </button>
      <div class="plan-mtc-body">
        <div class="plan-mtc-title ${isDoneToday ? "done" : ""}">${esc(t.title)}</div>
        <div class="plan-mtc-tags">
          ${catLabel ? `<span class="plan-mtc-cat" style="background:${catColor}22;color:${catColor}">${esc(catLabel)}</span>` : ""}
          ${mins ? `<span class="plan-mtc-time">${mins} мин</span>` : ""}
        </div>
      </div>
      <span class="plan-mtc-star"
        onclick="event.stopPropagation();window._toggleMain('${t.id}')">
        ${t.isMain || t.priority === "high" ? "⭐" : "☆"}
      </span>
    </div>`;
}

function renderTaskRow(t, isDoneToday, targetStr) {
  const mins     = t.duration || t.estimatedMinutes || null;
  const checkClass   = isDoneToday ? "done-full" : "pending";
  const checkContent = isDoneToday ? "✓" : "";
  const subs     = Array.isArray(t.subtasks) ? t.subtasks : [];
  const hasSubs  = subs.length > 0;
  const subsDone = subs.filter(s => s && (typeof s === "object" ? s.done : false)).length;
  const recType  = t.recurrence?.type;
  const hasRecur = recType && recType !== "none";
  const hasDl    = !!t.deadline;
  // Форматируем дедлайн
  let dlLabel = "";
  if (hasDl) {
    try {
      const d = t.deadline?.toDate ? t.deadline.toDate() : new Date(t.deadline);
      const m = ["янв","фев","мар","апр","мая","июн","июл","авг","сен","окт","ноя","дек"][d.getMonth()];
      dlLabel = `${d.getDate()} ${m}`;
    } catch(_) {}
  }
  const recurIcon = { daily:"↻д", weekly:"↻н", monthly:"↻м" }[recType] || "↻";
  const subsId = "subs-" + t.id;

  return `
    <div class="plan-task-row ${isDoneToday ? "done-row" : ""}" onclick="window.editTask('${t.id}')">
      <button class="plan-tr-check ${checkClass}"
        data-tid="${t.id}" data-date="${targetStr}"
        onclick="event.stopPropagation();window._toggleTaskOnDate(this.dataset.tid, this.dataset.date)">
        ${checkContent}
      </button>
      <div class="plan-tr-body">
        <div class="plan-tr-main">
          <span class="plan-tr-title ${isDoneToday ? "done" : ""}">${esc(t.title)}</span>
          <div class="plan-tr-meta">
            ${mins     ? `<span class="plan-tr-badge time">⏱ ${mins < 60 ? mins + "м" : Math.floor(mins/60) + "ч" + (mins%60 ? (mins%60)+"м" : "")}</span>` : ""}
            ${hasDl    ? `<span class="plan-tr-badge dl">📅 ${dlLabel}</span>` : ""}
            ${hasRecur ? `<span class="plan-tr-badge recur">${recurIcon}</span>` : ""}
            ${hasSubs  ? `<span class="plan-tr-badge subs">${subsDone}/${subs.length}</span>` : ""}
          </div>
        </div>
        ${hasSubs ? `
          <button class="plan-tr-expand"
            onclick="event.stopPropagation();window._toggleSubs('${subsId}')">
            <span id="${subsId}-arrow">▸</span>
          </button>` : ""}
      </div>
    </div>
    ${hasSubs ? `
    <div class="plan-tr-subs" id="${subsId}" style="display:none">
      ${subs.map((s, si) => {
        const subTitle = typeof s === "object" ? (s.title || s) : s;
        const subDone  = typeof s === "object" ? !!s.done : false;
        return `<div class="plan-tr-sub-row">
          <span class="plan-tr-sub-dot ${subDone ? "done" : ""}">
            ${subDone ? "✓" : "○"}
          </span>
          <span class="plan-tr-sub-title ${subDone ? "done" : ""}">${esc(String(subTitle))}</span>
        </div>`;
      }).join("")}
    </div>` : ""}`;
}

// ── Строка "провалено" ──
function renderFailedTaskRow(t, targetStr) {
  return `
    <div class="plan-task-row failed-row" onclick="window.editTask('${t.id}')">
      <button class="plan-tr-check failed"
        data-tid="${t.id}" data-date="${targetStr}"
        title="Провалено — нажмите чтобы восстановить"
        onclick="event.stopPropagation();window._restoreFailedTask('${t.id}')">
        ✗
      </button>
      <div class="plan-tr-body">
        <div class="plan-tr-main">
          <span class="plan-tr-title failed">${esc(t.title)}</span>
        </div>
      </div>
    </div>`;
}

// Восстановить провалену задачу — снять статус failed
window._restoreFailedTask = async (id) => {
  try {
    const { updateTask } = await import("../db.js");
    await updateTask(id, { status: null, failedDate: null });
    window._toast?.("Задача восстановлена");
    await renderPlan();
  } catch(e) {
    console.error("restoreFailedTask:", e);
  }
};

// Раскрыть/свернуть подзадачи
window._toggleSubs = (subsId) => {
  const el  = document.getElementById(subsId);
  const arr = document.getElementById(subsId + "-arrow");
  if (!el) return;
  const open = el.style.display === "none" || el.style.display === "";
  el.style.display  = open ? "block" : "none";
  if (arr) arr.textContent = open ? "▾" : "▸";
};

// ════════════════════════════════════════
//  ГЛАВНЫЙ РЕНДЕР
// ════════════════════════════════════════
async function renderPlanMain(tasks, goals, projects) {
  const body = document.getElementById("plan-body");
  if (!body) return;

  const td        = dstr(new Date()); // сегодня
  const targetStr = dstr(planDate);   // выбранный день
  const isToday   = targetStr === td;
  const tgt       = new Date(targetStr + "T00:00:00");

  let todayAudit = null;
  try { todayAudit = await getAuditForDate(td); } catch (_) {}

  // ── Фильтрация задач для выбранного дня ──
  const parentIds = new Set(tasks.filter(t => t.parentId).map(t => t.parentId));

  // Задачи которые "принадлежат" выбранному дню
  const dayTasks = tasks.filter(t => {
    if (t.displaced || parentIds.has(t.id)) return false;

    const isRecurring = t.recurrence && t.recurrence.type !== "none";

    if (isRecurring) {
      return recurMatchesDate(t, tgt);
    }

    // Обычная задача — показываем если:
    // 1. запланирована на этот день
    if (t.date === targetStr) return true;
    // 2. выполнена именно в этот день
    if (t.completedDate === targetStr) return true;
    // 3. провалена именно в этот день (failedDate = этот день)
    if (t.status === "failed" && t.failedDate === targetStr) return true;

    return false;
  });

  // ── Разбивка: открытые / выполненные / провалено за выбранный день ──
  const doneTasks   = dayTasks.filter(t => t.done && t.completedDate === targetStr);
  const failedTasks = dayTasks.filter(t => t.status === "failed" && t.failedDate === targetStr);
  const openOnTarget = dayTasks.filter(t =>
    !(t.done && t.completedDate === targetStr) && t.status !== "failed"
  );

  // Главные задачи — только из открытых
  const mainTasks  = openOnTarget.filter(t => t.priority === "high" || t.isMain).slice(0, 3);
  const otherTasks = openOnTarget.filter(t => !mainTasks.find(m => m.id === t.id));

  // Фокус дня — первая открытая задача
  const keyTask = getKeyTask(openOnTarget, targetStr);

  const months = ["Январь","Февраль","Март","Апрель","Май","Июнь",
                  "Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
  const monthLabel = `${months[planDate.getMonth()]} ${planDate.getFullYear()}`;

  body.innerHTML = `

    <div class="plan-date-header">${monthLabel}</div>
    <div id="plan-dn"></div>

    ${isToday ? renderMorningCheckin(todayAudit) : ""}

    <!-- Утренний план AI — только сегодня, под чек-ином -->
    ${isToday ? `
      <div class="plan-ai-strip">
        <button class="plan-ai-btn primary"
          onclick="window.openAiPlan && window.openAiPlan()">
          <span class="plan-ai-ico">✨</span>
          <span>Утренний план от AI</span>
          <span class="plan-ai-sub">Создать план дня с AI</span>
        </button>
      </div>` : ""}

    <!-- Главные задачи -->
    <div class="plan-main-tasks">
      <div class="plan-main-tasks-header">
        <div class="plan-main-tasks-title">Главные задачи</div>
        <div class="plan-main-tasks-sub">Не более 3 задач, двигающих твою жизнь</div>
      </div>
      ${mainTasks.length
        ? mainTasks.map(t => renderMainTaskCard(t, goals, targetStr)).join("")
        : `<div class="plan-main-tasks-sub" style="padding:4px 0;color:var(--tx-l)">
             Нет главных задач — добавь задачу с высоким приоритетом
           </div>`
      }
      <button class="plan-add-main-btn"
        onclick="window.openNewModal('task',null,null,'plan','${targetStr}')">
        <span>+</span><span>Добавить главную задачу</span>
      </button>
    </div>

    <!-- Все задачи -->
    <div class="plan-all-tasks">
      <div class="plan-all-tasks-title">
        Все задачи
        ${doneTasks.length
          ? `<span style="margin-left:8px;font-size:11px;color:var(--go);font-family:var(--fd)">
               ✓ ${doneTasks.length} выполнено
             </span>`
          : ""}
        ${failedTasks.length
          ? `<span style="margin-left:6px;font-size:11px;color:var(--red);font-family:var(--fd)">
               ✗ ${failedTasks.length} провалено
             </span>`
          : ""}
      </div>
      ${otherTasks.length || doneTasks.length ? `
        ${otherTasks.map(t => renderTaskRow(t, false, targetStr)).join("")}
        ${doneTasks.length ? `
          <div class="plan-section-label" style="margin:10px 0 4px;font-size:10px">
            ВЫПОЛНЕНО
          </div>
          ${doneTasks.map(t => renderTaskRow(t, true, targetStr)).join("")}
        ` : ""}
        ${failedTasks.length ? `
          <div class="plan-section-label" style="margin:10px 0 4px;font-size:10px;color:var(--red)">
            ПРОВАЛЕНО
          </div>
          ${failedTasks.map(t => renderFailedTaskRow(t, targetStr)).join("")}
        ` : ""}
      ` : `
        <div class="plan-empty">
          <div class="plan-empty-ico">📋</div>
          <div class="plan-empty-text">Задач нет</div>
          <button class="plan-empty-add"
            onclick="window.openNewModal('task',null,null,'plan','${targetStr}')">
            + Добавить задачу
          </button>
        </div>
      `}
    </div>

    <!-- Фокус дня -->
    <div class="plan-focus-card" onclick="window.switchTab('ai-chat')">
      <div class="plan-focus-left">
        <div class="plan-focus-title">Фокус дня</div>
        <div class="plan-focus-sub">${
          keyTask
            ? esc(keyTask.title.slice(0, 60))
            : "Один фокус лучше десяти попыток."
        }</div>
      </div>
      <div class="plan-focus-ico">
        <svg viewBox="0 0 64 64" fill="none">
          <circle cx="32" cy="32" r="28" stroke="var(--go)" stroke-width="2"
            style="filter:drop-shadow(0 0 8px color-mix(in srgb,var(--go) 40%,transparent))"/>
          <circle cx="32" cy="32" r="18" stroke="var(--go)" stroke-width="1.5" opacity=".6"/>
          <circle cx="32" cy="32" r="8"  stroke="var(--go)" stroke-width="1.5" opacity=".4"/>
          <circle cx="32" cy="32" r="3"  fill="var(--go)"/>
        </svg>
      </div>
    </div>

    ${isToday ? renderEveningReflection(todayAudit) : ""}

    <button class="fab"
      onclick="window.openNewModal('task',null,null,'plan','${targetStr}')">+</button>
  `;

  // 7-дневный навигатор
  const datesWT = new Set(tasks.filter(x => x.date).map(x => x.date));
  buildDayNav(planDate, datesWT, showAll, "plan-dn",
    d => {
      const str = typeof d === "string" ? d : dstr(d);
      const [y, m, day] = str.split("-").map(Number);
      planDate = new Date(y, m - 1, day);
      planDate.setHours(0,0,0,0);
      showAll = false;
      renderPlan();
    },
    () => { showAll = !showAll; renderPlan(); }
  );
}

// ════════════════════════════════════════
//  SIDEBAR — пустой (одинаков на всех вкладках)
// ════════════════════════════════════════
async function renderPlanSidebar() {
  // Сайдбар ДЕНЬ одинаков с остальными вкладками — не заполняем sb-body
}

// ════════════════════════════════════════
//  MAIN RENDER
// ════════════════════════════════════════
export async function renderPlan() {
  try {
    document.getElementById("tb-ttl").textContent = "День";
    const [tasks, goals, projects] = await Promise.all([
      getTasks(), getGoals(), getProjects()
    ]);
    await renderPlanSidebar();
    await renderPlanMain(tasks, goals, projects);
  } catch(e) {
    console.error("renderPlan ERROR:", e);
    const body = document.getElementById("plan-body");
    if (body) body.innerHTML = `<div style="padding:20px;color:var(--red);
      font-family:monospace;font-size:12px">⚠️ ${e.message}</div>`;
  }
}

// ════════════════════════════════════════
//  AI — для вкладки AI (стратегический анализ)
//  Эти функции вызываются из ai-chat.js
// ════════════════════════════════════════
window._aiToggleCfg = () => {};
window._aiSaveKey   = () => {
  const val = document.getElementById("ai-key-inp")?.value.trim();
  if (val) localStorage.setItem("lc-ai-key", val);
};
window._aiSaveProfile = () => {
  const key = document.getElementById("ai-key-inp")?.value.trim();
  if (key) localStorage.setItem("lc-ai-key", key);
  const prof = {
    chronotype:          document.getElementById("ai-chron")?.value || "lark",
    best_hours:          document.getElementById("ai-best")?.value?.trim()  || "09:00-11:30",
    worst_hours:         document.getElementById("ai-worst")?.value?.trim() || "15:00-17:00",
    focus_limit_minutes: parseInt(document.getElementById("ai-focus")?.value) || 90,
  };
  localStorage.setItem("lc-ai-profile", JSON.stringify(prof));
};

// Стратегический анализ — полная версия
async function askDeepSeek(systemPrompt, userMessage) {
  const key = localStorage.getItem("lc-ai-key");
  if (!key) throw new Error("API ключ не задан. Введите ключ в Настройках.");
  const resp = await fetch("https://api.proxyapi.ru/openrouter/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type":"application/json","Authorization":"Bearer "+key },
    body: JSON.stringify({
      model:"deepseek/deepseek-chat", max_tokens:1200, temperature:0.6,
      messages:[{ role:"system", content:systemPrompt },{ role:"user", content:userMessage }],
    }),
  });
  if (!resp.ok) { const e=await resp.json().catch(()=>({})); throw new Error(e.error?.message||"API error "+resp.status); }
  const data = await resp.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

window._planAiAnalysis = async () => {
  // Открываем оверлей прямо из plan.js — он используется на вкладке AI тоже
  document.getElementById("sa-overlay")?.remove();
  const ov = document.createElement("div");
  ov.id = "sa-overlay"; ov.className = "sa-overlay";
  ov.innerHTML = `<div class="sa-box"><div class="sa-hd">
    <div class="sa-title">🔍 Стратегический анализ</div>
    <div class="sa-date">${new Date().toLocaleDateString("ru-RU",{weekday:"long",day:"numeric",month:"long"})}</div>
    <button class="sa-close" onclick="document.getElementById('sa-overlay')?.remove()">✕</button>
  </div><div class="sa-body" id="sa-body"><div class="ai-result-loading">Анализирую данные…</div></div></div>`;
  document.body.appendChild(ov);

  try {
    const [tasks, goals, , surveys, diary] = await Promise.all([
      getTasks(), getGoals(), getProjects(), getSurvey(),
      import("../db.js").then(m => m.getDiary()),
    ]);
    const prof = JSON.parse(localStorage.getItem("lc-ai-profile") || "{}");
    const td2  = dstr(new Date());
    const d14ago = new Date(); d14ago.setDate(d14ago.getDate()-14);
    const d14str = dstr(d14ago);
    const doneTasks = tasks.filter(t => t.done && t.completedDate >= d14str);
    const inputData = {
      period: `${d14str}—${td2}`, user_profile: prof,
      stats: { total_done: doneTasks.length },
      goals: goals.filter(g=>!g.done).map(g=>({ title:g.title, priority:g.priority||"medium" })),
      diary_14d: diary.filter(d=>d.date>=d14str).slice(0,8).map(d=>({
        date:d.date, text:(d.text||"").slice(0,150)
      })),
      wheel: surveys[0]?.scores || null,
    };
    const systemPrompt = `Ты — AI-коуч Life Evolution. Говоришь на «ты». Стратегический уровень.
Анализируй паттерны за 2 недели. Верни JSON без markdown:
{"period_summary":"","main_barrier":{"description":"","micro_step":""},"weekly_recommendation":{"focus":"","key_action":""},"warnings":[]}`;
    const text = await askDeepSeek(systemPrompt, JSON.stringify(inputData,null,2));
    const sb = document.getElementById("sa-body");
    if (!sb) return;
    let parsed = null;
    try { parsed = JSON.parse(text.replace(/```json\s*/gi,"").replace(/```\s*/g,"").trim()); } catch(_) {}
    if (parsed) {
      sb.innerHTML = `
        ${parsed.period_summary ? `<div class="ai-block"><div class="ai-block-ttl">📊 Обзор</div><div class="ai-advice-text">${parsed.period_summary.replace(/\n/g,"<br>")}</div></div>` : ""}
        ${parsed.main_barrier ? `<div class="ai-block ai-barrier"><div class="ai-block-ttl">🚧 Главный барьер</div>
          <div class="ai-advice-text"><b>${parsed.main_barrier.description||""}</b></div>
          ${parsed.main_barrier.micro_step ? `<div style="margin-top:6px;color:var(--go)">▸ ${parsed.main_barrier.micro_step}</div>` : ""}
        </div>` : ""}
        ${parsed.weekly_recommendation ? `<div class="ai-block ai-week-rec"><div class="ai-block-ttl">📅 На неделю</div>
          ${parsed.weekly_recommendation.focus ? `<div class="ai-advice-text"><b>Фокус:</b> ${parsed.weekly_recommendation.focus}</div>` : ""}
          ${parsed.weekly_recommendation.key_action ? `<div style="margin-top:6px;color:var(--go)">▸ ${parsed.weekly_recommendation.key_action}</div>` : ""}
        </div>` : ""}
        ${parsed.warnings?.length ? `<div class="ai-block"><div class="ai-block-ttl">⚠ Алерты</div>${parsed.warnings.map(w=>`<div class="ai-warn-item">• ${w}</div>`).join("")}</div>` : ""}
        <div class="ai-result-meta">DeepSeek · ${new Date().toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}</div>`;
    } else {
      sb.innerHTML = `<div class="ai-advice-text">${text.replace(/\n/g,"<br>")}</div>`;
    }
  } catch(err) {
    const sb = document.getElementById("sa-body");
    if (sb) sb.innerHTML = `<div class="ai-result-error">⚠ ${err.message}</div>`;
  }
};
