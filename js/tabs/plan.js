// ════════════════════════════════════════
//  TAB: ДЕНЬ  v4.0
//  js/tabs/plan.js
//
//  По скрину:
//   — 7-дневный навигатор (месяц + полоска дней)
//   — Блок "Главные задачи" (до 3, со звёздочкой/категорией/временем)
//   — Блок "Все задачи" (плоский список с чекбоксами)
//   — Блок "Фокус дня" (зелёная карточка внизу)
//   — Morning Check-In (утром)
//   — Evening Reflection (вечером)
//
//  Сохранена: вся логика повторяющихся задач,
//  связи с целями/проектами, AI-анализ (DeepSeek)
// ════════════════════════════════════════

import { registerTab, buildDayNav } from "../router.js";
import {
  getTasks, getGoals, getProjects, getWeekGoals,
  deleteGoal, deleteProject, getSurvey,
  dstr, esc, isOv, fdt, getKeyTask,
  saveDailyAudit, getAuditForDate, getDailyAudits
} from "../db.js";
import { GCOLS } from "../utils.js";

let planDate = new Date(); planDate.setHours(0,0,0,0);
let showAll  = false;

export function initPlan() { registerTab("plan", renderPlan); }

// ════════════════════════════════════════
//  УТРЕННИЙ ЧЕК-ИН
// ════════════════════════════════════════
function renderMorningCheckin(audit) {
  const h = new Date().getHours();
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
                  onclick="window._ciSelect('${f.id}',${n},this)"
                  style="--cs-color:${f.color}">${n}</button>`).join("")}
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
    ?.querySelectorAll(".cs-btn")
    .forEach(b => b.classList.remove("on"));
  btn.classList.add("on");
};

window._saveMorningCheckin = async () => {
  const get = id => {
    const btn = document.querySelector(`#${id}-scale .cs-btn.on`);
    return btn ? parseInt(btn.dataset.val) : null;
  };
  await saveDailyAudit({
    energy: get("ci-energy"), focus: get("ci-focus"),
    stress: get("ci-stress"), control: get("ci-control"),
    note: document.getElementById("ci-note")?.value.trim() || "",
    checkinDone: true, checkinTime: new Date().toISOString(),
    date: dstr(new Date()),
  });
  const card = document.getElementById("morning-checkin");
  if (card) card.innerHTML = `<div class="checkin-done">
    <span class="checkin-done-ico">✓</span>
    <span class="checkin-done-text">Состояние отмечено</span>
  </div>`;
  window._toast?.("Чек-ин сохранён ✓");
  if (typeof window._refreshAll === "function") window._refreshAll();
};

// ════════════════════════════════════════
//  ВЕЧЕРНЯЯ РЕФЛЕКСИЯ
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
            placeholder="Моменты когда сделал что обещал…"></textarea>
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
    refIntegrity:   document.getElementById("ref-integrity")?.value.trim()   || "",
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
  if (typeof window._refreshAll === "function") window._refreshAll();
};

// ════════════════════════════════════════
//  HELPER: проверить попадание
//  повторяющейся задачи на дату
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
//  SIDEBAR — плитки + State Panel + AI
// ════════════════════════════════════════
async function renderPlanSidebar(tasks, goals, projects) {
  const td  = dstr(new Date());
  const tgt = new Date(td + "T00:00:00");

  const todayCnt = tasks.filter(t => {
    if (t.done || t.displaced) return false;
    if (t.date === td) return true;
    if (t.recurrence && t.recurrence.type !== "none") return recurMatchesDate(t, tgt);
    return false;
  }).length;

  const monthEnd    = new Date(); monthEnd.setMonth(monthEnd.getMonth()+1); monthEnd.setDate(0);
  const monthEndStr = dstr(monthEnd);
  const monthlyCnt  = tasks.filter(t => !t.done && t.date >= td && t.date <= monthEndStr).length;

  let todayState = null;
  try { todayState = await getAuditForDate(td); } catch (_) {}

  const prof   = JSON.parse(localStorage.getItem("lc-ai-profile") || "{}");
  const hasKey = !!localStorage.getItem("lc-ai-key");

  // Главные задачи — задачи с высоким приоритетом на сегодня
  const mainTasks = tasks.filter(t =>
    !t.done && !t.displaced && t.date === td && t.priority === "high"
  ).slice(0, 3);

  document.getElementById("sb-body").innerHTML = `
    <div class="sb-tiles-grid">
      <button class="sb-tile on" onclick="">
        <div class="sb-tile-ico">📋</div>
        <div class="sb-tile-lbl">Задачи дня</div>
        <div class="sb-tile-cnt">${todayCnt}</div>
      </button>
      <button class="sb-tile" onclick="">
        <div class="sb-tile-ico">📅</div>
        <div class="sb-tile-lbl">Месяц</div>
        <div class="sb-tile-cnt">${monthlyCnt}</div>
      </button>
      <button class="sb-tile" onclick="window.switchTab('goals')">
        <div class="sb-tile-ico">🎯</div>
        <div class="sb-tile-lbl">Цели</div>
        <div class="sb-tile-cnt">${goals.filter(g=>!g.done).length}</div>
      </button>
      <button class="sb-tile" onclick="window.switchTab('goals')">
        <div class="sb-tile-ico">📁</div>
        <div class="sb-tile-lbl">Проекты</div>
        <div class="sb-tile-cnt">${projects.filter(p=>!p.done).length}</div>
      </button>
    </div>

    <!-- State Panel -->
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

    <!-- AI Plan -->
    <button class="aip-open-btn" onclick="window.openAiPlan()">
      ✨ Утренний план от AI
    </button>

    <!-- Strategic AI -->
    <div class="ai-panel">
      <div class="ai-panel-hd">
        <span class="ai-panel-ico">✨</span>
        <span class="ai-panel-ttl">Стратегический ИИ</span>
        <button class="ai-cfg-toggle" onclick="window._aiToggleCfg()" title="Настройки">⚙</button>
      </div>
      <div id="ai-cfg-block"
        style="display:${hasKey && prof.chronotype ? "none" : "flex"};flex-direction:column;gap:8px;">
        <div class="ai-key-row">
          <input class="inp ai-key-inp" id="ai-key-inp" type="password"
            placeholder="ProxyAPI ключ"
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
              value="${prof.best_hours || "09:00-11:30"}"/>
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
        <button class="ai-key-save" style="width:100%" onclick="window._aiSaveProfile()">Сохранить</button>
      </div>
      <div id="ai-key-saved"
        style="display:${hasKey && prof.chronotype ? "flex" : "none"}"
        class="ai-key-saved-row">
        <span>🔑 ${prof.chronotype === "owl" ? "🦉 Сова" : "🌅 Жаворонок"} · ${prof.best_hours || "?"}</span>
        <button class="ai-key-change" onclick="window._aiToggleCfg()">✎</button>
      </div>
      <div class="ai-ctx-row" style="margin-top:8px">
        <div class="ai-ctx-item">
          <label class="ai-cfg-lbl">Сон (ч)</label>
          <input class="inp ai-cfg-inp" id="ai-sleep" type="number" step="0.5"
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
      <button class="ai-run-btn" style="margin-top:4px;background:transparent;border:1px solid var(--bd-s);"
        onclick="window._openBankDialog()">⚡ Банк действий</button>
      <div class="ai-result" id="ai-result"></div>
    </div>`;
}

function sbStateBar(label, value, color) {
  if (value === null || value === undefined) return "";
  const pct = Math.round((value / 10) * 100);
  return `<div class="sb-sbar">
    <span class="sb-sbar-lbl">${label}</span>
    <div class="sb-sbar-track">
      <div class="sb-sbar-fill" style="width:${pct}%;background:${color};"></div>
    </div>
    <span class="sb-sbar-val" style="color:${color}">${value}</span>
  </div>`;
}

// ════════════════════════════════════════
//  ГЛАВНЫЙ РЕНДЕР ПЛАНА ДНЯ
//  Структура по скрину:
//   1. Дата + 7-дневный навигатор
//   2. Утренний чек-ин (если утро)
//   3. Блок "Главные задачи" (до 3)
//   4. Блок "Все задачи"
//   5. Блок "Фокус дня"
//   6. Вечерняя рефлексия (если вечер)
// ════════════════════════════════════════
async function renderPlanMain(tasks, goals, projects) {
  const body = document.getElementById("plan-body");
  const td   = dstr(new Date());

  let todayAudit = null;
  try { todayAudit = await getAuditForDate(td); } catch (_) {}

  try {
    const targetStr = dstr(planDate);
    const isToday   = targetStr === td;
    const tgt       = new Date(targetStr + "T00:00:00");
    const parentIds = new Set(tasks.filter(t => t.parentId).map(t => t.parentId));
    const toDate    = s => s ? new Date(s.slice(0,10) + "T00:00:00") : null;

    // ── Фильтр задач для выбранного дня ──
    // Показываем ВСЕ задачи этого дня — и выполненные и нет
    // Это позволяет видеть реальную картину любого прошлого дня
    const dayTasks = tasks.filter(t => {
      if (t.displaced || parentIds.has(t.id)) return false;
      const isRecurring = t.recurrence && t.recurrence.type !== "none";

      if (isRecurring) {
        // Для повторяющихся: показываем если день совпадает
        return recurMatchesDate(t, tgt);
      }

      if (showAll) return !t.done || t.completedDate === targetStr;

      // Задача запланирована на этот день
      if (t.date === targetStr) return true;

      // Задача выполнена в этот день
      if (t.done && t.completedDate === targetStr) return true;

      // Задача в диапазоне дат (startDate → deadline)
      const start = toDate(t.startDate
        ? dstr(t.startDate.toDate ? t.startDate.toDate() : new Date(t.startDate))
        : t.date);
      const end = t.deadline
        ? toDate(dstr(t.deadline.toDate ? t.deadline.toDate() : new Date(t.deadline)))
        : null;
      if (start && end && start <= tgt && tgt <= end) return true;

      return false;
    }).sort((a, b) => {
      // Сначала невыполненные, потом выполненные
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (a.priority === "high" && b.priority !== "high") return -1;
      if (b.priority === "high" && a.priority !== "high") return 1;
      if (a.deadline && b.deadline)
        return (a.deadline.toDate?.() ?? new Date(a.deadline)) >
               (b.deadline.toDate?.() ?? new Date(b.deadline)) ? 1 : -1;
      if (a.deadline) return -1;
      if (b.deadline) return 1;
      return (a.date || "") > (b.date || "") ? 1 : -1;
    });

    // Разбиваем на невыполненные и выполненные для выбранного дня
    const openTasks = dayTasks.filter(t => !t.done);
    const doneTasks = dayTasks.filter(t => t.done);

    // ── Разбивка на главные (high/starred) и все остальные ──
    const mainTasks  = openTasks.filter(t => t.priority === "high" || t.isMain).slice(0, 3);
    const otherTasks = openTasks.filter(t => !mainTasks.find(m => m.id === t.id));

    // Ключевая задача (фокус дня)
    const keyTask = getKeyTask(openTasks, targetStr);

    // ── Месяц и год ──
    const months = ["Январь","Февраль","Март","Апрель","Май","Июнь",
                    "Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
    const monthLabel = `${months[planDate.getMonth()]} ${planDate.getFullYear()}`;

    body.innerHTML = `

      <!-- Дата-заголовок -->
      <div class="plan-date-header">${monthLabel}</div>

      <!-- 7-дневный навигатор -->
      <div id="plan-dn"></div>

      <!-- Утренний чек-ин (только сегодня) -->
      ${isToday ? renderMorningCheckin(todayAudit) : ""}

      <!-- Блок: Главные задачи -->
      <div class="plan-main-tasks">
        <div class="plan-main-tasks-header">
          <div class="plan-main-tasks-title">Главные задачи</div>
          <div class="plan-main-tasks-sub">Не более 3 задач, двигающих твою жизнь</div>
        </div>
        ${mainTasks.length
          ? mainTasks.map(t => renderMainTaskCard(t, goals)).join("")
          : `<div class="plan-main-tasks-sub" style="padding:4px 0;color:var(--tx-l)">
               Нет главных задач — добавь задачу с высоким приоритетом
             </div>`
        }
        <button class="plan-add-main-btn"
          onclick="window.openNewModal('task',null,null,'plan','${targetStr}')">
          <span>+</span>
          <span>Добавить главную задачу</span>
        </button>
      </div>

      <!-- Блок: Все задачи -->
      <div class="plan-all-tasks">
        <div class="plan-all-tasks-title">
          Все задачи
          ${doneTasks.length ? `<span style="margin-left:8px;font-size:11px;color:var(--go);font-family:var(--fd)">✓ ${doneTasks.length} выполнено</span>` : ""}
        </div>
        ${otherTasks.length || doneTasks.length ? `
          ${otherTasks.map(t => renderTaskRow(t, false)).join("")}
          ${doneTasks.length ? `
            <div class="plan-section-label" style="margin:10px 0 4px;font-size:10px">
              ВЫПОЛНЕНО
            </div>
            ${doneTasks.map(t => renderTaskRow(t, true)).join("")}
          ` : ""}
        ` : `
          <div class="plan-empty">
            <div class="plan-empty-ico">📋</div>
            <div class="plan-empty-text">Задач нет</div>
            <button class="plan-empty-add"
              onclick="window.openNewModal('task',null,null,'plan','${targetStr}')">+ Добавить задачу</button>
          </div>
        `}
      </div>

      <!-- Блок: Фокус дня -->
      <div class="plan-focus-card" onclick="window.switchTab('ai-chat')">
        <div class="plan-focus-left">
          <div class="plan-focus-title">Фокус дня</div>
          <div class="plan-focus-sub">${
            keyTask
              ? esc(keyTask.title.slice(0, 40))
              : "Один фокус лучше десяти попыток."
          }</div>
        </div>
        <div class="plan-focus-ico">
          <svg viewBox="0 0 64 64" fill="none">
            <circle cx="32" cy="32" r="28" stroke="#4DFFB4" stroke-width="2"
              style="filter:drop-shadow(0 0 8px #4DFFB460)"/>
            <circle cx="32" cy="32" r="18" stroke="#4DFFB4" stroke-width="1.5" opacity=".6"/>
            <circle cx="32" cy="32" r="8"  stroke="#4DFFB4" stroke-width="1.5" opacity=".4"/>
            <circle cx="32" cy="32" r="3"  fill="#4DFFB4"
              style="filter:drop-shadow(0 0 4px #4DFFB4)"/>
          </svg>
        </div>
      </div>

      <!-- Вечерняя рефлексия (только сегодня, вечером) -->
      ${isToday ? renderEveningReflection(todayAudit) : ""}

      <!-- FAB -->
      <button class="fab"
        onclick="window.openNewModal('task',null,null,'plan','${targetStr}')">+</button>
    `;

    // Строим навигатор
    // datesWT — даты где есть задачи (для точки под числом)
    const datesWT = new Set(tasks.filter(x => x.date).map(x => x.date));
    buildDayNav(planDate, datesWT, showAll, "plan-dn",
      d => {
        // Парсим дату в локальном времени (не UTC) — важно для правильного отображения
        const str = typeof d === "string" ? d : dstr(d);
        const [y, m, day] = str.split("-").map(Number);
        planDate = new Date(y, m - 1, day);
        planDate.setHours(0,0,0,0);
        showAll = false;
        renderPlan();
      },
      () => { showAll = !showAll; renderPlan(); }
    );

  } catch(e) {
    console.error("renderPlanMain ERROR:", e);
    const b = document.getElementById("plan-body");
    if (b) b.innerHTML += `<div style="padding:16px;color:var(--red);font-family:monospace;font-size:12px">❌ ${e.message}</div>`;
  }
}

// ── Карточка главной задачи (по скрину: иконка + название + категория + время + ⭐) ──
function renderMainTaskCard(t, goals) {
  const isDone = t.done;
  const goalName = goals.find(g => g.id === t.goalId)?.title || "";
  // Категория — берём название цели или "Работа" по умолчанию
  const catLabel = goalName ? goalName.slice(0, 12) : (t.category || "");
  const catColor = t.goalColor || "#7C5CFF";
  // Время в минутах
  const mins = t.duration || t.estimatedMinutes || null;

  return `
    <div class="plan-main-task-card" onclick="window.editTask('${t.id}')">
      <div class="plan-mtc-check ${isDone ? "done" : ""}"
        onclick="event.stopPropagation();window.toggleTask('${t.id}')">
        ${isDone ? "✓" : ""}
      </div>
      <div class="plan-mtc-body">
        <div class="plan-mtc-title ${isDone ? "done" : ""}">${esc(t.title)}</div>
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

// ── Строка "Все задачи" (по скрину: чекбокс + название + время) ──
function renderTaskRow(t, isDone) {
  const mins = t.duration || t.estimatedMinutes || null;
  // Тип чекбокса: полный (зелёный), частичный (жёлтый), пустой
  const doneFraction = t.subtasks?.length
    ? t.subtasks.filter(s => s.done).length / t.subtasks.length
    : (isDone ? 1 : 0);
  const checkClass = isDone ? "done-full"
    : doneFraction > 0 ? "done-partial"
    : "pending";
  const checkContent = isDone ? "✓" : doneFraction > 0 ? "◐" : "";

  return `
    <div class="plan-task-row" onclick="window.editTask('${t.id}')">
      <div class="plan-tr-check ${checkClass}"
        onclick="event.stopPropagation();window.toggleTask('${t.id}')">
        ${checkContent}
      </div>
      <span class="plan-tr-title ${isDone ? "done" : ""}">${esc(t.title)}</span>
      ${mins ? `<span class="plan-tr-time">${mins} мин</span>` : ""}
    </div>`;
}

window._toggleMain = async (id) => {
  const { getTasks } = await import("../db.js");
  const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
  const { db } = await import("../firebase.js");
  const { getUid } = await import("../db.js");
  const all = await getTasks();
  const t = all.find(x => x.id === id);
  if (!t) return;
  await updateDoc(doc(db, "users", getUid(), "tasks", id), { isMain: !t.isMain });
  renderPlan();
};

// ════════════════════════════════════════
//  MAIN RENDER
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
      ⚠️ Ошибка загрузки:<br>${e.message}</div>`;
  }
}

// ════════════════════════════════════════
//  AI — настройки (сайдбар)
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
  if (val) localStorage.setItem("lc-ai-key", val);
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
  const cfg = document.getElementById("ai-cfg-block");
  const saved = document.getElementById("ai-key-saved");
  if (cfg) cfg.style.display = "none";
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
  if (!key) throw new Error("API ключ не задан.");
  const resp = await fetch("https://api.proxyapi.ru/openrouter/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
    body: JSON.stringify({
      model: "deepseek/deepseek-chat", max_tokens: 1200, temperature: 0.6,
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMessage }],
    }),
  });
  if (!resp.ok) { const e = await resp.json().catch(() => ({})); throw new Error(e.error?.message || "API error " + resp.status); }
  const data = await resp.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

function esc2(s) { return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

function renderAiResponse(text, resultDiv) {
  let parsed = null;
  try { parsed = JSON.parse(text.replace(/```json\s*/gi,"").replace(/```\s*/g,"").trim()); } catch(_) {}
  if (parsed) {
    let html = "";
    if (parsed.period_summary) html += `<div class="ai-block ai-summary"><div class="ai-block-ttl">📊 Обзор</div><div class="ai-advice-text">${esc2(parsed.period_summary).replace(/\n/g,"<br>")}</div></div>`;
    if (parsed.cognitive_profile) {
      const cp = parsed.cognitive_profile;
      html += `<div class="ai-block"><div class="ai-block-ttl">🧠 Профиль</div>
        ${cp.strengths?.length ? `<div class="ai-profile-section"><b>💪 Сильные:</b><ul>${cp.strengths.map(s=>`<li>${esc2(s)}</li>`).join("")}</ul></div>` : ""}
        ${cp.weaknesses?.length ? `<div class="ai-profile-section"><b>⚠️ Зоны роста:</b><ul>${cp.weaknesses.map(s=>`<li>${esc2(s)}</li>`).join("")}</ul></div>` : ""}
        ${cp.authorship_trend ? `<div class="ai-advice-text">✍️ ${esc2(cp.authorship_trend)}</div>` : ""}
      </div>`;
    }
    if (parsed.main_barrier) {
      const mb = parsed.main_barrier;
      html += `<div class="ai-block ai-barrier"><div class="ai-block-ttl">🚧 Барьер</div>
        <div class="ai-advice-text"><b>${esc2(mb.description||"")}</b></div>
        ${mb.micro_step ? `<div style="margin-top:6px;color:var(--go)">▸ ${esc2(mb.micro_step)}</div>` : ""}
      </div>`;
    }
    if (parsed.weekly_recommendation) {
      const wr = parsed.weekly_recommendation;
      html += `<div class="ai-block ai-week-rec"><div class="ai-block-ttl">📅 На неделю</div>
        ${wr.focus ? `<div class="ai-advice-text"><b>Фокус:</b> ${esc2(wr.focus)}</div>` : ""}
        ${wr.key_action ? `<div style="margin-top:6px;color:var(--go)">▸ ${esc2(wr.key_action)}</div>` : ""}
      </div>`;
    }
    if (parsed.warnings?.length) html += `<div class="ai-block ai-warnings"><div class="ai-block-ttl">⚠ Алерты</div>${parsed.warnings.map(w=>`<div class="ai-warn-item">• ${esc2(String(w))}</div>`).join("")}</div>`;
    if (!html) html = `<div class="ai-advice-text">${text.replace(/\n/g,"<br>")}</div>`;
    resultDiv.innerHTML = html + `<div class="ai-result-meta">DeepSeek · ${new Date().toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}</div>`;
  } else {
    resultDiv.innerHTML = `<div class="ai-advice-text">${text.replace(/\*\*(.*?)\*\*/g,"<b>$1</b>").replace(/\n/g,"<br>")}</div>
      <div class="ai-result-meta">DeepSeek · ${new Date().toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}</div>`;
  }
}

window._planAiAnalysis = async () => {
  const key = localStorage.getItem("lc-ai-key");
  const btn = document.getElementById("ai-run-btn");
  if (!key) { const r = document.getElementById("ai-result"); if (r) r.innerHTML = `<div class="ai-result-warn">⚠ Введите API ключ</div>`; window._aiToggleCfg(); return; }
  document.getElementById("sa-overlay")?.remove();
  const ov = document.createElement("div");
  ov.id = "sa-overlay"; ov.className = "sa-overlay";
  ov.innerHTML = `<div class="sa-box"><div class="sa-hd">
    <div class="sa-title">🔍 Стратегический анализ</div>
    <div class="sa-date">${new Date().toLocaleDateString("ru-RU",{weekday:"long",day:"numeric",month:"long"})}</div>
    <button class="sa-close" onclick="document.getElementById('sa-overlay')?.remove()">✕</button>
  </div><div class="sa-body" id="sa-body"><div class="ai-result-loading">Анализирую…</div></div></div>`;
  document.body.appendChild(ov);
  if (btn) { btn.disabled = true; btn.textContent = "⏳ Анализирую..."; }
  try {
    const [tasks, goals, projects, surveys, diary, ideas] = await Promise.all([
      getTasks(), getGoals(), getProjects(), getSurvey(),
      import("../db.js").then(m => m.getDiary()),
      import("../db.js").then(m => m.getIdeas()),
    ]);
    const prof = JSON.parse(localStorage.getItem("lc-ai-profile") || "{}");
    const today2 = dstr(new Date());
    const d14ago = new Date(); d14ago.setDate(d14ago.getDate()-14);
    const d14str = dstr(d14ago);
    const doneTasks = tasks.filter(t => t.done && t.completedDate >= d14str);
    const authorTasks = doneTasks.filter(t => t.motiv === "хочу");
    const scored = doneTasks.filter(t => t.energyScore);
    const avgEnergy = scored.length ? (scored.reduce((s,t)=>s+(t.energyScore||0),0)/scored.length).toFixed(1) : null;
    const vc = {}; doneTasks.filter(t=>t.energyScore<=2).forEach(t=>{vc[t.title]=(vc[t.title]||0)+1;});
    const vampires = Object.entries(vc).filter(([,c])=>c>=2).map(([title,occurrences])=>({title,occurrences}));
    const dc = {}; doneTasks.filter(t=>t.energyScore>=4).forEach(t=>{const k=t.goalId?(goals.find(g=>g.id===t.goalId)?.title||"другое"):"другое";dc[k]=(dc[k]||0)+1;});
    const inputJson = {
      period:`${d14str}—${today2}`, user_profile:prof,
      stats:{total_done:doneTasks.length,
        authorship_rate:doneTasks.length?Math.round(authorTasks.length/doneTasks.length*100)+"%":"нет данных",
        avg_energy:avgEnergy, vampires,
        top_drivers:Object.entries(dc).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([cat,cnt])=>({category:cat,count:cnt}))},
      goals:goals.filter(g=>!g.done).map(g=>({title:g.title,tasks_done:doneTasks.filter(t=>t.goalId===g.id).length,tasks_open:tasks.filter(t=>!t.done&&t.goalId===g.id).length})),
      diary_14d:diary.filter(d=>d.date>=d14str).slice(0,8).map(d=>({date:d.date,mood:d.mood,text:(d.text||"").slice(0,150)})),
      wheel_of_life:surveys[0]?.scores||null,
    };
    const saSystemPrompt = `Ты — AI-коуч Life Evolution. Говоришь на «ты». Стратегический уровень — паттерны за 2 недели.
Анализируй: когнитивный профиль, состояние, противоречия, драйверы, главный барьер, рекомендацию на неделю.
Верни ТОЛЬКО JSON без markdown: {"period_summary":"...","cognitive_profile":{"strengths":[],"weaknesses":[],"authorship_trend":""},"main_barrier":{"description":"","evidence":"","micro_step":""},"weekly_recommendation":{"focus":"","key_action":""},"warnings":[]}
Тон: прямой, честный.`;
    const text = await askDeepSeek(saSystemPrompt, JSON.stringify(inputJson,null,2));
    const saBody = document.getElementById("sa-body");
    if (saBody) renderAiResponse(text, saBody);
  } catch(err) {
    const sb = document.getElementById("sa-body");
    if (sb) sb.innerHTML = `<div class="ai-result-error">⚠ ${err.message}</div>`;
  } finally {
    if (btn) { btn.disabled=false; btn.textContent="✨ Стратегический анализ"; }
  }
};

// ── Редактирование цели / проекта ──
window._planEditGoal = async id => {
  const { getGoals, updateGoal } = await import("../db.js");
  const { openModal, closeModal, toast: t2 } = await import("../modal.js");
  const all = await getGoals(); const g = all.find(x=>x.id===id); if(!g) return;
  openModal("Редактировать цель",`
    <div class="fg"><label class="fl">Название *</label><input class="inp" id="eg-title" value="${esc(g.title||"")}"/></div>
    <div class="fg"><label class="fl">Описание</label><textarea class="txta" id="eg-desc">${esc(g.desc||"")}</textarea></div>
    <div class="fg"><label class="fl">Дедлайн</label><input class="inp" id="eg-dl" type="date" value="${g.deadline||""}"/></div>`,
    async () => {
      const title = document.getElementById("eg-title")?.value.trim();
      if (!title) { alert("Введите название"); return; }
      await updateGoal(id,{title,desc:document.getElementById("eg-desc")?.value.trim()||"",deadline:document.getElementById("eg-dl")?.value||null});
      t2("Цель обновлена ✓"); closeModal(); window._refreshAll?.();
    });
};

window._planEditProj = async id => {
  const db_mod = await import("../db.js");
  const modal  = await import("../modal.js");
  const [projects, goals] = await Promise.all([db_mod.getProjects(), db_mod.getGoals()]);
  const p = projects.find(x=>x.id===id); if(!p) return;
  modal.openModal("Редактировать проект",`
    <div class="fg"><label class="fl">Название *</label><input class="inp" id="ep-name" value="${db_mod.esc(p.name||"")}"/></div>
    <div class="fg"><label class="fl">Цель</label>
      <select class="sel" id="ep-goal">
        <option value="">— Без цели —</option>
        ${goals.map(g=>`<option value="${g.id}" ${g.id===p.goalId?"selected":""}>${db_mod.esc(g.title)}</option>`).join("")}
      </select></div>`,
    async () => {
      const name = document.getElementById("ep-name")?.value.trim();
      if (!name) { alert("Введите название"); return; }
      const {doc,updateDoc} = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
      const {db} = await import("../firebase.js");
      await updateDoc(doc(db,"users",db_mod.getUid(),"projects",id),{name,goalId:document.getElementById("ep-goal")?.value||null});
      modal.toast("Проект обновлён ✓"); modal.closeModal(); window._refreshAll?.();
    });
};
