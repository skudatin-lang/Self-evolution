// ════════════════════════════════════════
//  TAB: ДЕНЬ (Day Screen)
//  js/tabs/plan.js  v3.0
//
//  Life OS концепция: "Управление направлением дня"
//  Добавлено:
//    — Morning Check-In (энергия / фокус / стресс / контроль)
//    — Evening Reflection (рефлексия дня)
//    — State Panel в сайдбаре
//  Сохранено:
//    — полная логика задач (повторяющиеся, ключевая цель)
//    — стратегический AI-анализ (DeepSeek)
//    — режимы: день / месяц / цели / проекты
// ════════════════════════════════════════

import { registerTab, buildDayNav, taskCard } from "../router.js";
import {
  getTasks, getGoals, getProjects, getWeekGoals,
  deleteGoal, deleteProject, getSurvey,
  dstr, esc, isOv, fdt, getKeyTask,
  saveDailyAudit, getAuditForDate, getDailyAudits
} from "../db.js";
import { GCOLS } from "../utils.js";

let planDate = new Date(); planDate.setHours(0,0,0,0);
let showAll  = false;
let planMode = "day"; // day | all | goals | projects

export function initPlan() { registerTab("plan", renderPlan); }

// ════════════════════════════════════════
//  MORNING CHECK-IN
//  Утренний чек-ин состояния (2 минуты)
//  Сохраняет в daily_audit
// ════════════════════════════════════════
function renderMorningCheckin(audit) {
  const h = new Date().getHours();
  // Показываем утром (до 14:00) если ещё не заполнено
  if (h >= 14 && !audit) return "";
  if (audit?.checkinDone) return "";

  const fields = [
    { id: "ci-energy",  label: "Энергия",  color: "#4DFFB4" },
    { id: "ci-focus",   label: "Фокус",    color: "#7C5CFF" },
    { id: "ci-stress",  label: "Стресс",   color: "#FF5C9F" },
    { id: "ci-control", label: "Контроль", color: "#5CB8FF" },
  ];

  return `
    <div class="checkin-card" id="morning-checkin">
      <div class="checkin-header">
        <div class="checkin-icon">☀</div>
        <div class="checkin-title-block">
          <div class="checkin-title">Утренний чек-ин</div>
          <div class="checkin-sub">Как ты сегодня? Займёт 1 минуту</div>
        </div>
      </div>
      <div class="checkin-sliders">
        ${fields.map(f => `
          <div class="checkin-slider-row">
            <span class="checkin-slider-lbl">${f.label}</span>
            <div class="checkin-scale" id="${f.id}-scale">
              ${[1,2,3,4,5,6,7,8,9,10].map(n => `
                <button class="cs-btn" data-field="${f.id}" data-val="${n}"
                  onclick="window._ciSelect('${f.id}', ${n}, this)"
                  style="--cs-color:${f.color}">
                  ${n}
                </button>`).join("")}
            </div>
          </div>`).join("")}
      </div>
      <div class="checkin-note-row">
        <input class="inp checkin-note-inp" id="ci-note"
          placeholder="Главное намерение дня (необязательно)…"/>
      </div>
      <button class="checkin-save-btn" onclick="window._saveMorningCheckin()">
        Отметить состояние →
      </button>
    </div>`;
}

// ── Сохранение чек-ина ──
window._ciSelect = (field, val, btn) => {
  const scale = document.getElementById(field + "-scale");
  if (!scale) return;
  scale.querySelectorAll(".cs-btn").forEach(b => b.classList.remove("on"));
  btn.classList.add("on");
};

window._saveMorningCheckin = async () => {
  const get = id => {
    const btn = document.querySelector(`#${id}-scale .cs-btn.on`);
    return btn ? parseInt(btn.dataset.val) : null;
  };
  const data = {
    energy:  get("ci-energy"),
    focus:   get("ci-focus"),
    stress:  get("ci-stress"),
    control: get("ci-control"),
    note:    document.getElementById("ci-note")?.value.trim() || "",
    checkinDone: true,
    checkinTime: new Date().toISOString(),
    date: dstr(new Date()),
  };

  try {
    await saveDailyAudit(data);
    const card = document.getElementById("morning-checkin");
    if (card) {
      card.innerHTML = `
        <div class="checkin-done">
          <span class="checkin-done-ico">✓</span>
          <span class="checkin-done-text">Состояние отмечено</span>
          ${data.energy !== null
            ? `<span class="checkin-done-stats">
                Энергия ${data.energy}/10 · Фокус ${data.focus ?? "—"}/10
               </span>`
            : ""}
        </div>`;
    }
    window._toast?.("Чек-ин сохранён ✓");
    // Обновляем дашборд если он рендерился
    if (typeof window._refreshAll === "function") window._refreshAll();
  } catch (e) {
    window._toast?.("Ошибка сохранения: " + e.message);
  }
};

// ════════════════════════════════════════
//  EVENING REFLECTION
//  Вечерняя рефлексия дня
//  Показывается с 18:00
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
          <label class="rq-label">Где ты держал слово себе?</label>
          <textarea class="inp txta rq-inp" id="ref-integrity" rows="2"
            placeholder="Моменты, когда сделал что обещал…"></textarea>
        </div>
        <div class="rq-item">
          <label class="rq-label">Главное наблюдение дня</label>
          <textarea class="inp txta rq-inp" id="ref-observation" rows="2"
            placeholder="Что заметил о себе, своих паттернах…"></textarea>
        </div>
        <div class="rq-mood-row">
          <span class="rq-label">Как завершается день?</span>
          <div class="rq-mood-btns">
            ${["😤","😔","😐","🙂","😌"].map((e,i) =>
              `<button class="rq-mood-btn" data-val="${i+1}"
                onclick="window._refMood(${i+1}, this)">${e}</button>`
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
  const data = {
    refProgress:    document.getElementById("ref-progress")?.value.trim()    || "",
    refIntegrity:   document.getElementById("ref-integrity")?.value.trim()   || "",
    refObservation: document.getElementById("ref-observation")?.value.trim() || "",
    refMood:        moodBtn ? parseInt(moodBtn.dataset.val) : null,
    reflectionDone: true,
    reflectionTime: new Date().toISOString(),
    date: dstr(new Date()),
  };

  try {
    await saveDailyAudit(data);
    const card = document.getElementById("evening-reflection");
    if (card) {
      card.innerHTML = `
        <div class="checkin-done">
          <span class="checkin-done-ico">✓</span>
          <span class="checkin-done-text">Рефлексия сохранена</span>
          <span class="checkin-done-stats">Хорошая работа — ты наблюдаешь свою жизнь</span>
        </div>`;
    }
    window._toast?.("Рефлексия сохранена ✓");
    if (typeof window._refreshAll === "function") window._refreshAll();
  } catch (e) {
    window._toast?.("Ошибка: " + e.message);
  }
};

// ════════════════════════════════════════
//  SIDEBAR — режимы + State Panel + AI
// ════════════════════════════════════════
async function renderPlanSidebar(tasks, goals, projects) {
  const td  = dstr(new Date());
  const tgt = new Date(td + "T00:00:00");

  // Задачи дня
  const todayCnt = tasks.filter(t => {
    if (t.done || t.displaced) return false;
    if (t.date === td) return true;
    if (t.recurrence && t.recurrence.type !== "none") {
      const r = t.recurrence;
      const start = t.startDate?.toDate?.() ?? (t.date ? new Date(t.date + "T00:00:00") : null);
      if (!start || start > tgt) return false;
      const until = r.until ? new Date(r.until + "T23:59:59") : null;
      if (until && tgt > until) return false;
      const dow = tgt.getDay(), dom = tgt.getDate();
      const diff = Math.round((tgt - start) / 86400000);
      switch (r.type) {
        case "daily":   return diff >= 0;
        case "weekly":  return r.weekdays?.length ? r.weekdays.includes(dow) : diff % (7*(r.interval||1)) === 0;
        case "monthly": return r.monthdays?.length ? r.monthdays.includes(dom) : dom === start.getDate();
      }
    }
    return false;
  }).length;

  const monthEnd    = new Date(); monthEnd.setMonth(monthEnd.getMonth()+1); monthEnd.setDate(0);
  const monthEndStr = dstr(monthEnd);
  const monthlyCnt  = tasks.filter(t => !t.done && t.date >= td && t.date <= monthEndStr).length;

  // Текущее состояние
  let todayState = null;
  try { todayState = await getAuditForDate(td); } catch (_) {}

  const prof   = JSON.parse(localStorage.getItem("lc-ai-profile") || "{}");
  const hasKey = !!localStorage.getItem("lc-ai-key");

  document.getElementById("sb-body").innerHTML = `

    <!-- Плитки режимов -->
    <div class="sb-tiles-grid">
      <button class="sb-tile ${planMode==="day"?"on":""}" onclick="window._planMode('day')">
        <div class="sb-tile-ico">📋</div>
        <div class="sb-tile-lbl">Задачи дня</div>
        <div class="sb-tile-cnt">${todayCnt}</div>
      </button>
      <button class="sb-tile ${planMode==="all"?"on":""}" onclick="window._planMode('all')">
        <div class="sb-tile-ico">📅</div>
        <div class="sb-tile-lbl">Месяц</div>
        <div class="sb-tile-cnt">${monthlyCnt}</div>
      </button>
      <button class="sb-tile ${planMode==="goals"?"on":""}" onclick="window._planMode('goals')">
        <div class="sb-tile-ico">🎯</div>
        <div class="sb-tile-lbl">Цели</div>
        <div class="sb-tile-cnt">${goals.filter(g=>!g.done).length}</div>
      </button>
      <button class="sb-tile ${planMode==="projects"?"on":""}" onclick="window._planMode('projects')">
        <div class="sb-tile-ico">📁</div>
        <div class="sb-tile-lbl">Проекты</div>
        <div class="sb-tile-cnt">${projects.filter(p=>!p.done).length}</div>
      </button>
    </div>

    <!-- State Panel — компактный в сайдбаре -->
    <div class="sb-state-panel">
      <div class="sb-state-label">Состояние дня</div>
      ${todayState
        ? `<div class="sb-state-bars">
            ${sbStateBar("Энергия",  todayState.energy,  "#4DFFB4")}
            ${sbStateBar("Фокус",    todayState.focus,   "#7C5CFF")}
            ${sbStateBar("Стресс",   todayState.stress,  "#FF5C9F")}
            ${sbStateBar("Контроль", todayState.control, "#5CB8FF")}
           </div>`
        : `<div class="sb-state-empty">Чек-ин ещё не заполнен</div>`
      }
    </div>

    <!-- Утренний план от AI -->
    <button class="aip-open-btn" onclick="window.openAiPlan()">
      ✨ Утренний план от AI
    </button>

    <!-- Стратегический AI (существующая логика) -->
    <div class="ai-panel">
      <div class="ai-panel-hd">
        <span class="ai-panel-ico">✨</span>
        <span class="ai-panel-ttl">Стратегический ИИ</span>
        <button class="ai-cfg-toggle" onclick="window._aiToggleCfg()" title="Настройки профиля">⚙</button>
      </div>

      <div id="ai-cfg-block" style="display:${hasKey && prof.chronotype ? "none" : "flex"};flex-direction:column;gap:8px;">
        <div class="ai-key-row" id="ai-key-row">
          <input class="inp ai-key-inp" id="ai-key-inp" type="password"
            placeholder="ProxyAPI ключ (DeepSeek)"
            value="${localStorage.getItem("lc-ai-key") || ""}"/>
          <button class="ai-key-save" onclick="window._aiSaveKey()">OK</button>
        </div>
        <div class="ai-cfg-grid">
          <div class="ai-cfg-item">
            <label class="ai-cfg-lbl">Хронотип</label>
            <select class="sel ai-cfg-sel" id="ai-chron">
              <option value="lark" ${prof.chronotype==="lark"?"selected":""}>🌅 Жаворонок</option>
              <option value="owl"  ${prof.chronotype==="owl" ?"selected":""}>🦉 Сова</option>
            </select>
          </div>
          <div class="ai-cfg-item">
            <label class="ai-cfg-lbl">Лучшие часы</label>
            <input class="inp ai-cfg-inp" id="ai-best" placeholder="09:00-11:30"
              value="${prof.best_hours || (prof.chronotype==="owl" ? "11:00-13:00" : "09:00-11:30")}"/>
          </div>
          <div class="ai-cfg-item">
            <label class="ai-cfg-lbl">Слабые часы</label>
            <input class="inp ai-cfg-inp" id="ai-worst" placeholder="15:00-17:00"
              value="${prof.worst_hours || "15:00-17:00"}"/>
          </div>
          <div class="ai-cfg-item">
            <label class="ai-cfg-lbl">Фокус (мин)</label>
            <input class="inp ai-cfg-inp" id="ai-focus" type="number" placeholder="90"
              value="${prof.focus_limit_minutes || 90}"/>
          </div>
        </div>
        <button class="ai-key-save" style="width:100%" onclick="window._aiSaveProfile()">Сохранить профиль</button>
      </div>

      <div id="ai-key-saved"
        style="display:${hasKey && prof.chronotype ? "flex" : "none"}"
        class="ai-key-saved-row">
        <span>🔑 ${prof.chronotype === "owl" ? "🦉 Сова" : "🌅 Жаворонок"} · ${prof.best_hours || "?"}</span>
        <button class="ai-key-change" onclick="window._aiToggleCfg()">✎</button>
      </div>

      <div class="ai-ctx-row">
        <div class="ai-ctx-item">
          <label class="ai-cfg-lbl">Сон (ч)</label>
          <input class="inp ai-cfg-inp" id="ai-sleep" type="number" step="0.5" min="0" max="12"
            placeholder="7" value="${localStorage.getItem("lc-ai-sleep") || ""}"/>
        </div>
        <div class="ai-ctx-item">
          <label class="ai-cfg-lbl">Настроение</label>
          <select class="sel ai-cfg-sel" id="ai-mood">
            <option value="5">😊 Отлично</option>
            <option value="4" selected>🙂 Хорошо</option>
            <option value="3">😐 Нейтрально</option>
            <option value="2">😔 Устал</option>
            <option value="1">😫 Плохо</option>
          </select>
        </div>
      </div>

      <button class="ai-run-btn" id="ai-run-btn" onclick="window._planAiAnalysis()">
        ✨ Стратегический анализ
      </button>
      <button class="ai-run-btn"
        style="margin-top:4px;background:transparent;border:1px solid var(--bd-s);"
        onclick="window._openBankDialog()">
        ⚡ Банк действий
      </button>
      <div class="ai-result" id="ai-result"></div>
    </div>`;
}

// ── Компактная полоска состояния для сайдбара ──
function sbStateBar(label, value, color) {
  if (value === null || value === undefined) return "";
  const pct = Math.round((value / 10) * 100);
  return `
    <div class="sb-sbar">
      <span class="sb-sbar-lbl">${label}</span>
      <div class="sb-sbar-track">
        <div class="sb-sbar-fill" style="width:${pct}%;background:${color};"></div>
      </div>
      <span class="sb-sbar-val" style="color:${color}">${value}</span>
    </div>`;
}

// ════════════════════════════════════════
//  ПЛАН ДНЯ — основной контент
// ════════════════════════════════════════
async function renderPlanMain(tasks, goals, projects) {
  const body = document.getElementById("plan-body");
  const td   = dstr(new Date());

  // Загружаем аудит для чек-ина / рефлексии
  let todayAudit = null;
  try { todayAudit = await getAuditForDate(td); } catch (_) {}

  try {

  if (planMode === "day") {

    body.innerHTML = `
      <div id="plan-dn"></div>
      <div id="plan-checkin"></div>
      <div id="plan-open"></div>
      <div id="plan-reflection"></div>
      <div id="plan-done-sec"></div>`;

    // Day navigator
    const datesWT = new Set(tasks.filter(x => x.date).map(x => x.date));
    buildDayNav(planDate, datesWT, showAll, "plan-dn",
      d => { planDate = d; showAll = false; renderPlan(); },
      () => { showAll = !showAll; renderPlan(); }
    );

    const targetStr = dstr(planDate);
    const isToday   = targetStr === td;

    // Morning Check-In — только для сегодня
    if (isToday) {
      document.getElementById("plan-checkin").innerHTML = renderMorningCheckin(todayAudit);
    }

    // Повторяющиеся задачи — скрываем родителей
    const parentIds = new Set(tasks.filter(t => t.parentId).map(t => t.parentId));
    const toDate    = s => s ? new Date(s.slice(0,10) + "T00:00:00") : null;
    const tgt       = new Date(targetStr + "T00:00:00");

    function recurMatchesDate(t, target) {
      const r = t.recurrence;
      if (!r || r.type === "none") return false;
      const start = t.startDate?.toDate?.() ?? (t.date ? new Date(t.date + "T00:00:00") : null);
      if (!start || start > target) return false;
      const until = r.until ? new Date(r.until + "T00:00:00") : null;
      if (until && target > until) return false;
      const dow = target.getDay();
      const dom = target.getDate();
      const diffDays = Math.round((target - start) / 86400000);
      switch (r.type) {
        case "daily":   return diffDays >= 0;
        case "weekly":
          if (r.weekdays?.length) return r.weekdays.includes(dow);
          return diffDays % (7 * (r.interval || 1)) === 0;
        case "monthly":
          if (r.monthdays?.length) return r.monthdays.includes(dom);
          return dom === start.getDate();
        case "yearly":
          return dom === start.getDate() && target.getMonth() === start.getMonth();
        default: return false;
      }
    }

    const open = tasks
      .filter(t => {
        if (t.displaced || parentIds.has(t.id)) return false;
        const isRecurring = t.recurrence && t.recurrence.type !== "none";
        if (isRecurring) {
          const doneToday = t.done && t.completedDate === targetStr;
          if (doneToday) return false;
          return recurMatchesDate(t, tgt);
        }
        if (t.done) return false;
        if (showAll) return true;
        if (t.date === targetStr) return true;
        const start = toDate(t.startDate ? dstr(t.startDate.toDate ? t.startDate.toDate() : new Date(t.startDate)) : t.date);
        const end   = t.deadline ? toDate(dstr(t.deadline.toDate ? t.deadline.toDate() : new Date(t.deadline))) : null;
        if (start && end && start <= tgt && tgt <= end) return true;
        return false;
      })
      .sort((a, b) => {
        if (a.deadline && b.deadline)
          return (a.deadline.toDate?.() ?? new Date(a.deadline)) > (b.deadline.toDate?.() ?? new Date(b.deadline)) ? 1 : -1;
        if (a.deadline) return -1;
        if (b.deadline) return 1;
        return (a.date || "") > (b.date || "") ? 1 : -1;
      });

    const done = tasks.filter(t =>
      t.done && !t.displaced &&
      (t.completedDate === targetStr || (!t.completedDate && t.date === targetStr))
    );

    // Ключевая задача дня
    const keyTask    = getKeyTask(open, targetStr);
    const nonKeyOpen = open.filter(t => t.id !== keyTask?.id);

    let planHtml = "";

    // Метка секции
    if (open.length > 0) {
      planHtml += `<div class="plan-section-label">
        ${isToday ? "ЗАДАЧИ НА СЕГОДНЯ" : `ЗАДАЧИ НА ${targetStr}`}
        <span class="plan-section-cnt">${open.length}</span>
      </div>`;
    }

    // Ключевая задача — выделенная карточка
    if (keyTask) {
      const goalName = goals.find(g => g.id === keyTask.goalId)?.title || "";
      const projName = projects.find(p => p.id === keyTask.projId)?.name || "";
      planHtml += `
        <div class="plan-key-goal" onclick="window.editTask('${keyTask.id}')">
          <div class="plan-kg-label">★ Ключевая цель дня</div>
          <div class="plan-kg-title">${esc(keyTask.title)}</div>
          ${goalName ? `<div class="plan-kg-goal">↳ ${esc(goalName)}</div>` : ""}
          ${projName ? `<div class="plan-kg-proj">${esc(projName)}</div>` : ""}
          <div class="plan-kg-actions">
            <div class="ic-chk ${keyTask.done ? "on" : ""}"
              onclick="event.stopPropagation();window.toggleTask('${keyTask.id}')">
              ${keyTask.done ? "✓" : ""}
            </div>
            <span style="font-size:12px;color:var(--tx-m)">нажми чтобы выполнить</span>
          </div>
        </div>`;
    }

    // Остальные задачи
    planHtml += nonKeyOpen.map(t => taskCard(t, goals, projects)).join("") ||
      (!keyTask ? `<div class="plan-empty">
        <div class="plan-empty-ico">✓</div>
        <div class="plan-empty-text">Все задачи выполнены</div>
        ${isToday ? `<button class="plan-empty-add" onclick="window.openNewModal('task',null,null,'plan','${targetStr}')">+ Добавить задачу</button>` : ""}
       </div>` : "");

    document.getElementById("plan-open").innerHTML = planHtml ||
      `<div class="plan-empty">
        <div class="plan-empty-ico">📋</div>
        <div class="plan-empty-text">Задач нет</div>
        ${isToday ? `<button class="plan-empty-add" onclick="window.openNewModal('task',null,null,'plan','${targetStr}')">+ Добавить задачу</button>` : ""}
       </div>`;

    // Evening Reflection — только для сегодня
    if (isToday) {
      document.getElementById("plan-reflection").innerHTML =
        renderEveningReflection(todayAudit);
    }

    // Выполненные
    if (done.length) {
      document.getElementById("plan-done-sec").innerHTML = `
        <div class="plan-section-label" style="margin-top:16px">
          ВЫПОЛНЕНО СЕГОДНЯ
          <span class="plan-section-cnt">${done.length}</span>
        </div>
        ${done.map(t => taskCard(t, goals, projects)).join("")}`;
    }

    body.insertAdjacentHTML("beforeend",
      `<button class="fab" onclick="window.openNewModal('task',null,null,'plan','${targetStr}')">+</button>`);

  } else if (planMode === "all") {
    const monthEnd    = new Date(); monthEnd.setMonth(monthEnd.getMonth()+1); monthEnd.setDate(0);
    const monthEndStr = dstr(monthEnd);
    const monthly     = tasks
      .filter(t => !t.done && t.date >= td && t.date <= monthEndStr)
      .sort((a,b) => (a.date||"") > (b.date||"") ? 1 : -1);
    body.innerHTML = `
      <div class="plan-section-label">
        ЗАДАЧИ ДО КОНЦА МЕСЯЦА
        <span class="plan-section-cnt">${monthly.length}</span>
      </div>
      <div id="plan-all-list">
        ${monthly.length
          ? monthly.map(t => taskCard(t, goals, projects)).join("")
          : `<div class="plan-empty"><div class="plan-empty-ico">📅</div><div class="plan-empty-text">Задач нет</div></div>`}
      </div>
      <button class="fab" onclick="window.openNewModal('task',null,null,'plan')">+</button>`;

  } else if (planMode === "goals") {
    body.innerHTML = `
      <div class="plan-section-label">
        МОИ ЦЕЛИ
        <span class="plan-section-cnt">${goals.filter(g=>!g.done).length}</span>
      </div>
      ${goals.filter(g=>!g.done).map((g, i) => `
        <div class="icard" style="border-left:3px solid ${GCOLS[i%GCOLS.length]};cursor:pointer"
          onclick="window.switchTab('goals')">
          <div class="ic-body">
            <div class="ic-ttl">${esc(g.title)}</div>
            ${g.desc ? `<div style="font-size:12px;color:var(--tx-m);margin-top:3px">${esc(g.desc)}</div>` : ""}
            <div class="ic-meta">
              <span class="ic-tag tag-goal">${tasks.filter(t=>t.goalId===g.id&&!t.done).length} задач</span>
            </div>
          </div>
        </div>`).join("") ||
        `<div class="plan-empty"><div class="plan-empty-ico">🎯</div><div class="plan-empty-text">Целей нет</div></div>`}
      <button class="fab" onclick="window.openNewModal('goal',null,null,'plan')">+</button>`;

  } else if (planMode === "projects") {
    body.innerHTML = `
      <div class="plan-section-label">
        ПРОЕКТЫ
        <span class="plan-section-cnt">${projects.filter(p=>!p.done).length}</span>
      </div>
      ${projects.filter(p=>!p.done).map((p, i) => {
        const goal = goals.find(g => g.id === p.goalId);
        const col  = goal ? GCOLS[goals.indexOf(goal) % GCOLS.length] : "var(--go)";
        const projTasks = tasks.filter(t=>t.projId===p.id&&!t.done);
        return `
          <div class="icard" style="border-left:3px solid ${col};cursor:pointer"
            onclick="window._planEditProj('${p.id}')">
            <div class="ic-body">
              <div class="ic-ttl">${esc(p.name)}</div>
              <div class="ic-meta">
                ${goal ? `<span class="ic-tag tag-goal">↳ ${esc(goal.title)}</span>` : ""}
                <span class="ic-tag tag-proj">${projTasks.length} задач</span>
              </div>
            </div>
          </div>`;
      }).join("") ||
      `<div class="plan-empty"><div class="plan-empty-ico">📁</div><div class="plan-empty-text">Проектов нет</div></div>`}
      <button class="fab" onclick="window.openNewModal('project',null,null,'plan')">+</button>`;
  }

  } catch(e) {
    console.error("renderPlanMain ERROR:", e);
    const body2 = document.getElementById("plan-body");
    if (body2) body2.innerHTML += `<div style="padding:16px;color:var(--red);font-family:monospace;font-size:12px">
      ❌ ${e.message}
    </div>`;
  }
}

// ════════════════════════════════════════
//  ГЛАВНЫЙ РЕНДЕР
// ════════════════════════════════════════
export async function renderPlan() {
  try {
    document.getElementById("tb-ttl").textContent = "День";
    const [tasks, goals, projects] = await Promise.all([getTasks(), getGoals(), getProjects()]);
    await renderPlanSidebar(tasks, goals, projects);
    await renderPlanMain(tasks, goals, projects);
  } catch(e) {
    console.error("renderPlan ERROR:", e);
    const body = document.getElementById("plan-body");
    if (body) body.innerHTML = `<div style="padding:20px;color:var(--red);font-family:monospace;font-size:12px">
      ⚠️ Ошибка загрузки:<br><br>${e.message}
    </div>`;
  }
}

// ════════════════════════════════════════
//  GLOBAL HANDLERS
// ════════════════════════════════════════
window._planMode = async mode => {
  planMode = mode;
  const [tasks, goals, projects] = await Promise.all([getTasks(), getGoals(), getProjects()]);
  await renderPlanSidebar(tasks, goals, projects);
  await renderPlanMain(tasks, goals, projects);
};

window._planDelGoal = async id => {
  if (!confirm("Удалить цель?")) return;
  const { deleteGoal } = await import("../db.js");
  await deleteGoal(id);
  window._refreshAll?.();
};

window._planDelProj = async id => {
  if (!confirm("Удалить проект?")) return;
  const { deleteProject } = await import("../db.js");
  await deleteProject(id);
  window._refreshAll?.();
};

window._planEditGoal = async id => {
  const { getGoals, updateGoal, esc: e2 } = await import("../db.js");
  const { openModal, closeModal, toast: t2 } = await import("../modal.js");
  const all = await getGoals();
  const g   = all.find(x => x.id === id);
  if (!g) return;
  openModal("Редактировать цель", `
    <div class="fg"><label class="fl">Название *</label>
      <input class="inp" id="eg-title" value="${e2(g.title||"")}"/></div>
    <div class="fg"><label class="fl">Описание</label>
      <textarea class="txta" id="eg-desc">${e2(g.desc||"")}</textarea></div>
    <div class="fg"><label class="fl">Дедлайн</label>
      <input class="inp" id="eg-dl" type="date" value="${g.deadline||""}"/></div>`,
    async () => {
      const title = document.getElementById("eg-title")?.value.trim();
      if (!title) { alert("Введите название"); return; }
      await updateGoal(id, {
        title,
        desc:     document.getElementById("eg-desc")?.value.trim() || "",
        deadline: document.getElementById("eg-dl")?.value || null,
      });
      t2("Цель обновлена ✓");
      closeModal();
      window._refreshAll?.();
    });
};

window._planEditProj = async id => {
  const db_mod = await import("../db.js");
  const modal  = await import("../modal.js");
  const [projects, goals] = await Promise.all([db_mod.getProjects(), db_mod.getGoals()]);
  const p = projects.find(x => x.id === id);
  if (!p) return;
  modal.openModal("Редактировать проект", `
    <div class="fg"><label class="fl">Название *</label>
      <input class="inp" id="ep-name" value="${db_mod.esc(p.name||"")}"/></div>
    <div class="fg"><label class="fl">Описание</label>
      <textarea class="txta" id="ep-desc">${db_mod.esc(p.desc||"")}</textarea></div>
    <div class="fg"><label class="fl">Цель</label>
      <select class="sel" id="ep-goal">
        <option value="">— Без цели —</option>
        ${goals.map(g=>`<option value="${g.id}" ${g.id===p.goalId?"selected":""}>${db_mod.esc(g.title)}</option>`).join("")}
      </select></div>`,
    async () => {
      const name = document.getElementById("ep-name")?.value.trim();
      if (!name) { alert("Введите название"); return; }
      const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
      const { db } = await import("../firebase.js");
      const uid = db_mod.getUid();
      await updateDoc(doc(db, "users", uid, "projects", id), {
        name,
        desc:   document.getElementById("ep-desc")?.value.trim() || "",
        goalId: document.getElementById("ep-goal")?.value || null,
      });
      modal.toast("Проект обновлён ✓");
      modal.closeModal();
      window._refreshAll?.();
    });
};

// ════════════════════════════════════════
//  AI — настройки профиля (сайдбар)
// ════════════════════════════════════════
window._aiToggleCfg = () => {
  const cfg   = document.getElementById("ai-cfg-block");
  const saved = document.getElementById("ai-key-saved");
  if (!cfg) return;
  const isOpen = cfg.style.display !== "none";
  cfg.style.display   = isOpen ? "none" : "flex";
  if (saved) saved.style.display = isOpen ? "flex" : "none";
};

window._aiSaveKey = () => {
  const val = document.getElementById("ai-key-inp")?.value.trim();
  if (!val) return;
  localStorage.setItem("lc-ai-key", val);
};

window._aiSaveProfile = () => {
  const key = document.getElementById("ai-key-inp")?.value.trim();
  if (key) localStorage.setItem("lc-ai-key", key);
  const prof = {
    chronotype:          document.getElementById("ai-chron")?.value || "lark",
    best_hours:          document.getElementById("ai-best")?.value.trim()  || "09:00-11:30",
    worst_hours:         document.getElementById("ai-worst")?.value.trim() || "15:00-17:00",
    focus_limit_minutes: parseInt(document.getElementById("ai-focus")?.value) || 90,
  };
  localStorage.setItem("lc-ai-profile", JSON.stringify(prof));
  const cfg   = document.getElementById("ai-cfg-block");
  const saved = document.getElementById("ai-key-saved");
  if (cfg)   cfg.style.display   = "none";
  if (saved) {
    saved.style.display = "flex";
    saved.innerHTML = `<span>${prof.chronotype === "owl" ? "🦉 Сова" : "🌅 Жаворонок"} · ${prof.best_hours}</span>
      <button class="ai-key-change" onclick="window._aiToggleCfg()">✎</button>`;
  }
};

// ════════════════════════════════════════
//  DEEPSEEK — стратегический анализ
// ════════════════════════════════════════
async function askDeepSeek(systemPrompt, userMessage) {
  const key = localStorage.getItem("lc-ai-key");
  if (!key) throw new Error("API ключ не задан. Введите ключ в настройках выше.");

  const resp = await fetch("https://api.proxyapi.ru/openrouter/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": "Bearer " + key,
    },
    body: JSON.stringify({
      model:       "deepseek/deepseek-chat",
      max_tokens:  1200,
      temperature: 0.6,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userMessage  },
      ],
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || "Ошибка API: " + resp.status);
  }
  const data = await resp.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

function esc2(s) {
  return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function renderAiResponse(text, resultDiv) {
  let parsed = null;
  try {
    const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch (_) {}

  if (parsed) {
    let html = "";
    if (parsed.period_summary) {
      html += `<div class="ai-block ai-summary">
        <div class="ai-block-ttl">📊 Обзор периода</div>
        <div class="ai-advice-text">${esc2(parsed.period_summary).replace(/\n/g,"<br>")}</div>
      </div>`;
    }
    if (parsed.cognitive_profile) {
      const cp = parsed.cognitive_profile;
      html += `<div class="ai-block">
        <div class="ai-block-ttl">🧠 Когнитивный профиль</div>
        ${cp.strengths?.length ? `<div class="ai-profile-section"><b>💪 Сильные стороны:</b><ul>${cp.strengths.map(s=>`<li>${esc2(s)}</li>`).join("")}</ul></div>` : ""}
        ${cp.weaknesses?.length ? `<div class="ai-profile-section"><b>⚠️ Зоны роста:</b><ul>${cp.weaknesses.map(s=>`<li>${esc2(s)}</li>`).join("")}</ul></div>` : ""}
        ${cp.authorship_trend ? `<div class="ai-advice-text">✍️ ${esc2(cp.authorship_trend)}</div>` : ""}
      </div>`;
    }
    if (parsed.body_state) {
      const bs = parsed.body_state;
      const lc = {"истощение":"var(--red)","напряжение":"var(--warn)","стабильность":"var(--grn)","подъём":"var(--go)"};
      html += `<div class="ai-block">
        <div class="ai-block-ttl">🏃 Состояние</div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <span style="font-size:16px;font-weight:700;color:${lc[bs.level]||"var(--go)"}">${esc2(bs.level||"")}</span>
        </div>
        <div class="ai-advice-text">${esc2(bs.description||"").replace(/\n/g,"<br>")}</div>
        ${bs.psychosomatic_signal ? `<div class="ai-warn-item" style="margin-top:6px">🔗 ${esc2(bs.psychosomatic_signal)}</div>` : ""}
      </div>`;
    }
    if (parsed.contradictions?.length) {
      html += `<div class="ai-block">
        <div class="ai-block-ttl">⚡ Противоречия</div>
        ${parsed.contradictions.map(c => `
          <div class="ai-contradiction">
            <div><b>Цель:</b> ${esc2(c.goal)}</div>
            <div><b>Действие:</b> ${esc2(c.action)}</div>
            <div class="ai-warn-item" style="margin-top:4px">${esc2(c.tension)}</div>
          </div>`).join("")}
      </div>`;
    }
    if (parsed.drivers?.length) {
      html += `<div class="ai-block">
        <div class="ai-block-ttl">🔥 Драйверы</div>
        ${parsed.drivers.map(d => `
          <div class="ai-driver-item">
            <b>${esc2(d.category)}</b> — ${esc2(d.effect)}
            ${d.recommendation ? `<div class="ai-advice-text" style="margin-top:2px">→ ${esc2(d.recommendation)}</div>` : ""}
          </div>`).join("")}
      </div>`;
    }
    if (parsed.main_barrier) {
      const mb = parsed.main_barrier;
      html += `<div class="ai-block ai-barrier">
        <div class="ai-block-ttl">🚧 Главный барьер</div>
        <div class="ai-advice-text"><b>${esc2(mb.description||"")}</b></div>
        ${mb.evidence ? `<div class="ai-advice-text" style="margin-top:6px;opacity:.8">${esc2(mb.evidence)}</div>` : ""}
        ${mb.micro_step ? `<div style="margin-top:8px;color:var(--go)">▸ Микро-шаг: ${esc2(mb.micro_step)}</div>` : ""}
      </div>`;
    }
    if (parsed.weekly_recommendation) {
      const wr = parsed.weekly_recommendation;
      html += `<div class="ai-block ai-week-rec">
        <div class="ai-block-ttl">📅 Рекомендация на неделю</div>
        ${wr.focus ? `<div class="ai-advice-text"><b>Фокус:</b> ${esc2(wr.focus)}</div>` : ""}
        ${wr.target_authorship ? `<div class="ai-advice-text">✍️ Авторство: <b>${esc2(wr.target_authorship)}</b></div>` : ""}
        ${wr.key_action ? `<div style="margin-top:8px;color:var(--go)">▸ ${esc2(wr.key_action)}</div>` : ""}
      </div>`;
    }
    if (parsed.warnings?.length) {
      html += `<div class="ai-block ai-warnings">
        <div class="ai-block-ttl">⚠ Предупреждения</div>
        ${parsed.warnings.map(w => `<div class="ai-warn-item">• ${esc2(typeof w === "string" ? w : JSON.stringify(w))}</div>`).join("")}
      </div>`;
    }
    if (!html) html = `<div class="ai-advice-text">${text.replace(/\n/g,"<br>")}</div>`;
    resultDiv.innerHTML = html +
      `<div class="ai-result-meta">DeepSeek AI · ${new Date().toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}</div>`;
  } else {
    resultDiv.innerHTML = `<div class="ai-advice-text">${text.replace(/\*\*(.*?)\*\*/g,"<b>$1</b>").replace(/\n/g,"<br>")}</div>
      <div class="ai-result-meta">DeepSeek AI · ${new Date().toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}</div>`;
  }
}

// ── Стратегический анализ (полноэкранный) ──
window._planAiAnalysis = async () => {
  const key = localStorage.getItem("lc-ai-key");
  const btn = document.getElementById("ai-run-btn");

  if (!key) {
    const resultDiv = document.getElementById("ai-result");
    if (resultDiv) resultDiv.innerHTML = `<div class="ai-result-warn">⚠ Введите ProxyAPI ключ в настройках выше</div>`;
    window._aiToggleCfg();
    return;
  }

  document.getElementById("sa-overlay")?.remove();
  const ov = document.createElement("div");
  ov.id = "sa-overlay";
  ov.className = "sa-overlay";
  ov.innerHTML = `
    <div class="sa-box">
      <div class="sa-hd">
        <div class="sa-title">🔍 Стратегический анализ</div>
        <div class="sa-date">${new Date().toLocaleDateString("ru-RU",{weekday:"long",day:"numeric",month:"long"})}</div>
        <button class="sa-close" onclick="document.getElementById('sa-overlay')?.remove()">✕</button>
      </div>
      <div class="sa-body" id="sa-body">
        <div class="ai-result-loading">Анализирую ваш день…</div>
      </div>
    </div>`;
  document.body.appendChild(ov);

  if (btn) { btn.disabled = true; btn.textContent = "⏳ Анализирую..."; }

  try {
    const [tasks, goals, projects, surveys, diary, ideas] = await Promise.all([
      getTasks(), getGoals(), getProjects(), getSurvey(),
      import("../db.js").then(m => m.getDiary()),
      import("../db.js").then(m => m.getIdeas()),
    ]);
    const prof   = JSON.parse(localStorage.getItem("lc-ai-profile") || "{}");
    const today2 = dstr(new Date());
    const d14ago = new Date(); d14ago.setDate(d14ago.getDate() - 14);
    const d14str = dstr(d14ago);

    const doneTasks   = tasks.filter(t => t.done && t.completedDate >= d14str);
    const authorTasks = doneTasks.filter(t => t.motiv === "хочу");
    const fearTasks   = doneTasks.filter(t => t.fearLink === "есть");
    const scored      = doneTasks.filter(t => t.energyScore);
    const avgEnergy   = scored.length
      ? (scored.reduce((s,t) => s + (t.energyScore||0), 0) / scored.length).toFixed(1) : null;

    const vampireCandidates = {};
    doneTasks.filter(t => t.energyScore <= 2).forEach(t => {
      vampireCandidates[t.title] = (vampireCandidates[t.title]||0) + 1;
    });
    const vampires = Object.entries(vampireCandidates)
      .filter(([,cnt]) => cnt >= 2)
      .map(([title, cnt]) => ({ title, occurrences: cnt }));

    const driverCandidates = {};
    doneTasks.filter(t => t.energyScore >= 4).forEach(t => {
      const key2 = t.goalId ? (goals.find(g=>g.id===t.goalId)?.title || "другое") : "другое";
      driverCandidates[key2] = (driverCandidates[key2]||0) + 1;
    });

    const recentDiary = diary
      .filter(d => d.date >= d14str).slice(0,10)
      .map(d => ({ date: d.date, mood: d.mood, text: (d.text||"").slice(0,200) }));

    const inputJson = {
      period: `${d14str} — ${today2}`,
      user_profile: prof,
      stats: {
        total_done: doneTasks.length,
        authorship_rate: doneTasks.length
          ? Math.round(authorTasks.length / doneTasks.length * 100) + "%" : "нет данных",
        fear_tasks_rate: doneTasks.length
          ? Math.round(fearTasks.length / doneTasks.length * 100) + "%" : "нет данных",
        avg_energy: avgEnergy, vampires,
        top_drivers: Object.entries(driverCandidates)
          .sort((a,b) => b[1]-a[1]).slice(0,3)
          .map(([cat, cnt]) => ({ category: cat, count: cnt })),
      },
      goals: goals.filter(g=>!g.done).map(g => ({
        title: g.title, priority: g.priority || "medium",
        tasks_done: doneTasks.filter(t => t.goalId === g.id).length,
        tasks_open: tasks.filter(t => !t.done && t.goalId === g.id).length,
      })),
      diary_14d: recentDiary,
      ideas_total: ideas.length,
      ideas_realized: ideas.filter(i => i.realized).length,
      wheel_of_life: surveys[0]?.scores || null,
    };

    const text = await askDeepSeek(saSystemPrompt, JSON.stringify(inputJson, null, 2));
    const saBody = document.getElementById("sa-body");
    if (saBody) renderAiResponse(text, saBody);

  } catch (err) {
    const saBody = document.getElementById("sa-body");
    if (saBody) saBody.innerHTML = `<div class="ai-result-error">⚠ ${err.message}</div>`;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "✨ Стратегический анализ"; }
  }
};

const saSystemPrompt = `Ты — AI-коуч по жизненной навигации в приложении Life-Control.
Говоришь с пользователем на «ты». Работаешь со СТРАТЕГИЧЕСКИМ уровнем — паттернами за 2+ недели.

АЛГОРИТМ АНАЛИЗА:
1. КОГНИТИВНЫЙ ПРОФИЛЬ — сильные стороны, слабости, паттерны авторства
2. ЭМОЦИОНАЛЬНО-ТЕЛЕСНОЕ СОСТОЯНИЕ — энергия, шкала истощение→подъём
3. КЛЮЧЕВЫЕ ПРОТИВОРЕЧИЯ — цели vs реальные действия
4. ВНУТРЕННИЕ ДРАЙВЕРЫ — активности дающие энергию
5. ГЛАВНЫЙ БАРЬЕР — один фактор с микро-шагом
6. ЕЖЕНЕДЕЛЬНЫЙ ПЛАН — конкретная рекомендация

Верни СТРОГО JSON без markdown:
{
  "period_summary": "3-4 предложения об общем ритме",
  "cognitive_profile": {
    "strengths": ["сила 1", "сила 2"],
    "weaknesses": ["слабость 1"],
    "authorship_trend": "динамика авторства"
  },
  "body_state": {
    "level": "истощение|напряжение|стабильность|подъём",
    "description": "1-2 предложения",
    "psychosomatic_signal": "если есть"
  },
  "contradictions": [{ "goal": "цель", "action": "действие", "tension": "противоречие" }],
  "drivers": [{ "category": "категория", "effect": "эффект", "recommendation": "рекомендация" }],
  "main_barrier": {
    "description": "барьер",
    "evidence": "доказательства",
    "micro_step": "первый шаг"
  },
  "weekly_recommendation": {
    "focus": "фокус недели",
    "target_authorship": "целевой %",
    "key_action": "ключевое действие"
  },
  "warnings": ["алерт 1"]
}

Тон: прямой, честный, без корпоративного языка.`;
