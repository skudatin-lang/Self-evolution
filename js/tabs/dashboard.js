// ════════════════════════════════════════
//  TAB: ГЛАВНАЯ (Home / Life OS)
//  js/tabs/dashboard.js  v3.0
//
//  Концепция: "Текущее состояние моей жизни"
//  Блоки:
//    1. Life Momentum — инерция жизни
//    2. Фокус дня — главная задача
//    3. State Panel — энергия/фокус/стресс/контроль
//    4. Life Alignment — соответствие действий целям
//    5. AI Insight — наблюдение системы
//    6. Плитки статистики
// ════════════════════════════════════════

import { registerTab }           from "../router.js";
import {
  getStats, getTasks, getDiary, getIdeas,
  dstr, esc, isOv, getKeyTask,
  getDailyAudits, getAuditForDate
} from "../db.js";

// ── Короткие названия месяцев/дней ──
const MGEN = ["января","февраля","марта","апреля","мая","июня",
              "июля","августа","сентября","октября","ноября","декабря"];
const WD   = ["воскресенье","понедельник","вторник","среда","четверг","пятница","суббота"];
const MONTHS_UPPER = ["ЯНВАРЬ","ФЕВРАЛЬ","МАРТ","АПРЕЛЬ","МАЙ","ИЮНЬ",
                      "ИЮЛЬ","АВГУСТ","СЕНТЯБРЬ","ОКТЯБРЬ","НОЯБРЬ","ДЕКАБРЬ"];

// ════════════════════════════════════════
//  ИНИЦИАЛИЗАЦИЯ
// ════════════════════════════════════════
export function initDashboard() {
  registerTab("dashboard", renderDashboard);
}

// ════════════════════════════════════════
//  ВЫЧИСЛЕНИЕ LIFE MOMENTUM (0–100)
//
//  Формула учитывает:
//  — выполнение задач за последние 7 дней (40%)
//  — соотношение выполненных к запланированным (30%)
//  — отсутствие просрочек (20%)
//  — активность в дневнике / идеях (10%)
// ════════════════════════════════════════
async function calcLifeMomentum() {
  const tasks = await getTasks();
  const ideas = await getIdeas();
  const diary = await getDiary();

  const now   = new Date();
  const today2 = dstr(now);

  // Последние 7 дней
  const days7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days7.push(dstr(d));
  }

  // Задачи за 7 дней
  const week  = tasks.filter(t => days7.includes(t.date));
  const done7 = tasks.filter(t => t.done && days7.includes(t.completedDate)).length;
  const total7 = week.length;

  // Процент выполнения за неделю
  const completionRate = total7 > 0 ? done7 / total7 : 0;

  // Просрочки — штраф
  const overdue = tasks.filter(t => !t.done && isOv(t.deadline)).length;
  const overduepenalty = Math.min(1, overdue * 0.1); // каждая просрочка -10%, макс -100%

  // Активность (идеи + дневник за 7 дней)
  const activityDays = new Set([
    ...ideas.filter(i => days7.includes(i.date)).map(i => i.date),
    ...diary.filter(d => days7.includes(d.date)).map(d => d.date),
  ]).size;
  const activityRate = activityDays / 7;

  // Streak — сколько дней подряд есть выполненные задачи
  let streak = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const ds = dstr(d);
    const hasDone = tasks.some(t => t.done && t.completedDate === ds);
    if (hasDone) streak++;
    else break;
  }
  const streakBonus = streak / 7; // 0..1

  // Итог
  const raw = (
    completionRate * 0.40 +
    streakBonus    * 0.30 +
    (1 - overduepenalty) * 0.20 +
    activityRate   * 0.10
  ) * 100;

  const score = Math.round(Math.min(100, Math.max(0, raw)));

  // Направление (сравниваем с прошлой неделей условно)
  const trend = score >= 65 ? "rising" : score >= 35 ? "stable" : "falling";

  return { score, streak, done7, total7, overdue, trend };
}

// ════════════════════════════════════════
//  ВЫЧИСЛЕНИЕ LIFE ALIGNMENT (0–100 по сферам)
//
//  Берём задачи за последние 14 дней,
//  группируем по goalId, считаем процент выполнения.
//  Если нет целей — показываем базовую структуру.
// ════════════════════════════════════════
async function calcLifeAlignment(goals, tasks) {
  const now = new Date();
  const days14 = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days14.push(dstr(d));
  }

  const recent = tasks.filter(t => days14.includes(t.date) || days14.includes(t.completedDate));

  // Группируем по цели
  const map = {};
  for (const t of recent) {
    const gid = t.goalId || "__none__";
    if (!map[gid]) map[gid] = { total: 0, done: 0 };
    map[gid].total++;
    if (t.done) map[gid].done++;
  }

  // Собираем результат по настоящим целям
  const result = goals.slice(0, 5).map(g => {
    const data = map[g.id] || { total: 0, done: 0 };
    const pct  = data.total > 0 ? Math.round((data.done / data.total) * 100) : 0;
    return { title: g.title, pct, color: g.color || "#4DFFB4", total: data.total };
  });

  // Если целей < 3 — добавляем "без цели"
  if (result.length === 0) {
    const none = map["__none__"] || { total: 0, done: 0 };
    const pct  = none.total > 0 ? Math.round((none.done / none.total) * 100) : 0;
    result.push({ title: "Общие задачи", pct, color: "#4DFFB4", total: none.total });
  }

  return result;
}

// ════════════════════════════════════════
//  STATE PANEL — читаем из последнего аудита дня
// ════════════════════════════════════════
async function getTodayState() {
  try {
    const audit = await getAuditForDate(dstr(new Date()));
    if (!audit) return null;
    return {
      energy:    audit.energy    ?? null,
      focus:     audit.focus     ?? null,
      stress:    audit.stress    ?? null,
      control:   audit.control   ?? null,
      mood:      audit.mood      ?? null,
    };
  } catch (e) {
    return null;
  }
}

// ════════════════════════════════════════
//  SVG — MOMENTUM CIRCLE
//  Большой кружок с score и направлением
// ════════════════════════════════════════
function momentumCircle(score, trend) {
  const r    = 58;
  const cx   = 72;
  const cy   = 72;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;

  // Цвет по уровню
  const color = score >= 70 ? "#4DFFB4"
              : score >= 40 ? "#FFB84D"
              : "#FF6B6B";

  const arrow = trend === "rising" ? "↗" : trend === "falling" ? "↘" : "→";
  const label = trend === "rising"  ? "Набирает импульс"
              : trend === "falling" ? "Теряет импульс"
              : "Стабильно";

  return `
    <svg class="momentum-svg" width="144" height="144" viewBox="0 0 144 144">
      <!-- Фоновый трек -->
      <circle cx="${cx}" cy="${cy}" r="${r}"
        fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="10"/>
      <!-- Прогресс -->
      <circle cx="${cx}" cy="${cy}" r="${r}"
        fill="none"
        stroke="${color}"
        stroke-width="10"
        stroke-dasharray="${dash.toFixed(1)} ${circ.toFixed(1)}"
        stroke-dashoffset="${(circ / 4).toFixed(1)}"
        stroke-linecap="round"
        style="
          filter: drop-shadow(0 0 8px ${color}60);
          transition: stroke-dasharray 1s ease;
        "/>
      <!-- Score -->
      <text x="${cx}" y="${cy - 6}" text-anchor="middle"
        font-family="Cinzel,serif" font-size="26" font-weight="700"
        fill="${color}">${score}</text>
      <!-- из 100 -->
      <text x="${cx}" y="${cy + 10}" text-anchor="middle"
        font-family="Raleway,sans-serif" font-size="10"
        fill="rgba(255,255,255,0.35)">из 100</text>
      <!-- Тренд-стрелка -->
      <text x="${cx}" y="${cy + 28}" text-anchor="middle"
        font-family="Raleway,sans-serif" font-size="11"
        fill="${color}cc">${arrow} ${label}</text>
    </svg>`;
}

// ════════════════════════════════════════
//  STATE BAR — один показатель состояния
// ════════════════════════════════════════
function stateBar(label, value, color) {
  if (value === null || value === undefined) {
    return `
      <div class="state-item">
        <div class="state-item-top">
          <span class="state-item-lbl">${label}</span>
          <span class="state-item-val state-item-empty">—</span>
        </div>
        <div class="state-bar-track">
          <div class="state-bar-fill" style="width:0%;background:${color};"></div>
        </div>
      </div>`;
  }
  const pct = Math.round((value / 10) * 100);
  return `
    <div class="state-item">
      <div class="state-item-top">
        <span class="state-item-lbl">${label}</span>
        <span class="state-item-val" style="color:${color}">${value}/10</span>
      </div>
      <div class="state-bar-track">
        <div class="state-bar-fill"
          style="width:${pct}%;background:${color};box-shadow:0 0 6px ${color}60;">
        </div>
      </div>
    </div>`;
}

// ════════════════════════════════════════
//  AI INSIGHT — короткое наблюдение системы
//  Генерируется локально на основе данных,
//  не требует API-ключа.
// ════════════════════════════════════════
function generateLocalInsight(momentum, state, stats, streak) {
  const insights = [];

  // Анализ momentum
  if (momentum.score >= 75) {
    insights.push({
      type: "positive",
      text: `${streak} ${pluralDays(streak)} подряд ты держишь ритм. Это уже не случайность — это паттерн.`
    });
  } else if (momentum.score < 35) {
    insights.push({
      type: "warning",
      text: `Импульс замедляется. ${momentum.overdue} просроченных задач создают фоновое напряжение.`
    });
  }

  // Анализ просрочек
  if (momentum.overdue >= 3) {
    insights.push({
      type: "observation",
      text: `${momentum.overdue} задачи ждут уже несколько дней. Возможно, они слишком большие — попробуй разбить на маленькие шаги.`
    });
  }

  // Анализ активности
  if (momentum.done7 === 0 && momentum.total7 > 0) {
    insights.push({
      type: "warning",
      text: `За последние 7 дней нет ни одной выполненной задачи. Что мешает двигаться вперёд?`
    });
  }

  // Анализ состояния
  if (state) {
    if (state.energy !== null && state.energy <= 4) {
      insights.push({
        type: "observation",
        text: `Низкая энергия сегодня. Это нормально — возможно, стоит сосредоточиться на одной главной задаче.`
      });
    }
    if (state.stress !== null && state.stress >= 7) {
      insights.push({
        type: "warning",
        text: `Высокий уровень стресса влияет на качество решений. Сделай что-то маленькое и конкретное.`
      });
    }
  }

  // Дефолтный инсайт если нет данных
  if (insights.length === 0) {
    if (stats.todayOpen === 0) {
      insights.push({
        type: "neutral",
        text: "На сегодня задач нет. Самое время спланировать день или добавить новую цель."
      });
    } else {
      insights.push({
        type: "neutral",
        text: `Сегодня ${stats.todayOpen} ${pluralTasks(stats.todayOpen)}. Начни с самой важной — это создаёт импульс.`
      });
    }
  }

  return insights[0]; // Показываем один, самый важный инсайт
}

function pluralDays(n) {
  if (n % 10 === 1 && n % 100 !== 11) return "день";
  if ([2,3,4].includes(n % 10) && ![12,13,14].includes(n % 100)) return "дня";
  return "дней";
}

function pluralTasks(n) {
  if (n % 10 === 1 && n % 100 !== 11) return "задача";
  if ([2,3,4].includes(n % 10) && ![12,13,14].includes(n % 100)) return "задачи";
  return "задач";
}

// ════════════════════════════════════════
//  PICKER — модальный выбор типа записи
// ════════════════════════════════════════
function openNewEntryPicker() {
  const existing = document.getElementById("entry-picker-ov");
  if (existing) existing.remove();

  const ov = document.createElement("div");
  ov.className = "entry-picker-ov";
  ov.id = "entry-picker-ov";
  ov.innerHTML = `
    <div class="entry-picker-box">
      <div class="ep-title">Что добавить?</div>
      <button class="ep-btn" onclick="window._epPick('task')">
        <span class="ep-ico">✅</span>
        <div><span class="ep-lbl">Задача</span><span class="ep-sub">Конкретное действие</span></div>
      </button>
      <button class="ep-btn" onclick="window._epPick('goal')">
        <span class="ep-ico">🎯</span>
        <div><span class="ep-lbl">Цель</span><span class="ep-sub">Долгосрочное направление</span></div>
      </button>
      <button class="ep-btn" onclick="window._epPick('idea')">
        <span class="ep-ico">💡</span>
        <div><span class="ep-lbl">Идея</span><span class="ep-sub">Мысль, инсайт, план</span></div>
      </button>
      <button class="ep-btn" onclick="window._epPick('diary')">
        <span class="ep-ico">📖</span>
        <div><span class="ep-lbl">Запись в журнал</span><span class="ep-sub">Наблюдение, рефлексия</span></div>
      </button>
    </div>`;

  ov.addEventListener("click", e => { if (e.target === ov) ov.remove(); });
  document.body.appendChild(ov);

  window._epPick = type => {
    ov.remove();
    window.openNewModal(type, null, null, "dashboard");
  };
}
window._openNewEntryPicker = openNewEntryPicker;

// ════════════════════════════════════════
//  ГЛАВНЫЙ РЕНДЕР
// ════════════════════════════════════════
export async function renderDashboard() {
  const el = document.getElementById("dash-body");

  // Загружаем все данные параллельно
  const [stats, momentum, stateToday] = await Promise.all([
    getStats(),
    calcLifeMomentum(),
    getTodayState(),
  ]);

  // Life Alignment
  const alignment = await calcLifeAlignment(stats.goals, stats.tasks);

  // AI Insight
  const insight = generateLocalInsight(momentum, stateToday, stats, momentum.streak);

  // Время суток → приветствие
  const d     = new Date();
  const h     = d.getHours();
  const gr    = h < 5  ? "Доброй ночи"
              : h < 12 ? "Доброе утро"
              : h < 17 ? "Добрый день"
              : "Добрый вечер";
  const fname = (document.getElementById("sb-un")?.textContent || "").split(" ")[0] || "";
  const greeting = fname ? `${gr}, ${esc(fname)}` : gr;

  // Ключевая задача дня — синхронизирована с блоком "Главные задачи" на вкладке ДЕНЬ
  // Главная задача = isMain=true ИЛИ priority="high", запланирована на сегодня
  const today2 = dstr(new Date());
  const todayMainTasks = (stats.allOpen || []).filter(t => {
    if (t.done) return false;
    const isToday = t.date === today2 || t.completedDate === today2;
    const isRecurring = t.recurrence && t.recurrence.type !== "none";
    if (!isToday && !isRecurring) return false;
    return t.isMain === true || t.priority === "high";
  });
  // Берём первую главную задачу (те же правила что в plan.js mainTasks)
  const keyTask = todayMainTasks[0] || null;
  const keyGoal = keyTask?.goalId
    ? stats.goals.find(g => g.id === keyTask.goalId)?.title || ""
    : "";

  // ── MAIN CONTENT ──
  el.innerHTML = `

    <!-- ═══ GREETING HEADER ═══ -->
    <div class="dash-header">
      <div class="dash-greeting">${greeting}</div>
      <div class="dash-subline">Ты создаёшь свою жизнь</div>
    </div>

    <!-- ═══ БЛОК 1: LIFE MOMENTUM ═══ -->
    <div class="lc-section-label">LIFE MOMENTUM</div>
    <div class="momentum-card">
      <div class="momentum-left">
        ${momentumCircle(momentum.score, momentum.trend)}
      </div>
      <div class="momentum-right">
        <div class="momentum-status ${momentum.trend}">
          ${momentum.trend === "rising"  ? "↗ Растёт"
          : momentum.trend === "falling" ? "↘ Падает"
          : "→ Стабильно"}
        </div>
        <div class="momentum-desc">
          ${momentum.streak > 0
            ? `<strong>${momentum.streak}</strong> ${pluralDays(momentum.streak)} подряд сохраняешь фокус`
            : "Начни серию — первый шаг важнее всего"
          }
        </div>
        <div class="momentum-stats">
          <div class="mstat">
            <span class="mstat-val">${momentum.done7}</span>
            <span class="mstat-lbl">выполнено за 7 дней</span>
          </div>
          <div class="mstat">
            <span class="mstat-val ${momentum.overdue > 0 ? "mstat-warn" : ""}">${momentum.overdue}</span>
            <span class="mstat-lbl">просрочено</span>
          </div>
        </div>
        <button class="momentum-btn" onclick="window.switchTab('plan')">
          Открыть план дня →
        </button>
      </div>
    </div>

    <!-- ═══ БЛОК 2: ФОКУС ДНЯ ═══ -->
    <div class="lc-section-label">ФОКУС ДНЯ</div>
    ${keyTask
      ? `<div class="focus-card" onclick="window.switchTab('plan')">
          <div class="focus-card-inner">
            <div class="focus-label">Главное действие</div>
            <div class="focus-title">${esc(keyTask.title)}</div>
            ${keyGoal ? `<div class="focus-goal">↳ ${esc(keyGoal)}</div>` : ""}
            ${keyTask.note
              ? `<div class="focus-note">${esc(keyTask.note.slice(0, 100))}${keyTask.note.length > 100 ? "…" : ""}</div>`
              : ""}
          </div>
          <div class="focus-card-arrow">›</div>
        </div>
        ${stats.todayOpen > 1
          ? `<div class="focus-more" onclick="window.switchTab('plan')">
               Ещё ${stats.todayOpen - 1} ${pluralTasks(stats.todayOpen - 1)} на сегодня →
             </div>`
          : ""
        }`
      : `<div class="focus-empty" onclick="window._openNewEntryPicker()">
           <div class="focus-empty-ico">+</div>
           <div class="focus-empty-text">Добавь главную задачу дня</div>
         </div>`
    }

    <!-- ═══ БЛОК 3: STATE PANEL ═══ -->
    <div class="lc-section-label">
      МОЁ СОСТОЯНИЕ
      <button class="lc-section-action" onclick="window.switchTab('plan')">
        ${stateToday ? "изменить" : "отметить"}
      </button>
    </div>
    <div class="state-panel">
      ${stateToday
        ? `
          ${stateBar("Энергия",    stateToday.energy,  "#4DFFB4")}
          ${stateBar("Фокус",      stateToday.focus,   "#7C5CFF")}
          ${stateBar("Стресс",     stateToday.stress,  "#FF5C9F")}
          ${stateBar("Контроль",   stateToday.control, "#5CB8FF")}
        `
        : `<div class="state-empty">
             <span>Состояние на сегодня не отмечено</span>
             <button class="state-empty-btn" onclick="window.switchTab('plan')">
               Отметить →
             </button>
           </div>`
      }
    </div>

    <!-- ═══ БЛОК 4: LIFE ALIGNMENT ═══ -->
    ${alignment.length > 0 ? `
    <div class="lc-section-label">
      СООТВЕТСТВИЕ ЖИЗНИ
      <button class="lc-section-action" onclick="window.switchTab('goals')">все цели</button>
    </div>
    <div class="alignment-card">
      ${alignment.map(a => `
        <div class="align-row">
          <span class="align-name">${esc(a.title)}</span>
          <div class="align-bar-wrap">
            <div class="align-bar"
              style="width:${a.pct}%;background:${esc(a.color)};box-shadow:0 0 6px ${esc(a.color)}50;">
            </div>
          </div>
          <span class="align-pct" style="color:${esc(a.color)}">${a.pct}%</span>
        </div>`).join("")}
      <div class="align-hint">Процент выполнения задач по целям за 14 дней</div>
    </div>` : ""}

    <!-- ═══ БЛОК 5: AI INSIGHT ═══ -->
    <div class="lc-section-label">НАБЛЮДЕНИЕ СИСТЕМЫ</div>
    <div class="insight-card insight-${insight.type}">
      <div class="insight-ico">
        ${insight.type === "positive"    ? "◆"
        : insight.type === "warning"     ? "▲"
        : insight.type === "observation" ? "●"
        : "○"}
      </div>
      <div class="insight-text">${esc(insight.text)}</div>
    </div>

    <!-- ═══ БЛОК 6: ПЛИТКИ СТАТИСТИКИ ═══ -->
    <div class="lc-section-label">ОБЗОР</div>
    <div class="dash-grid">
      <div class="dash-tile" onclick="window.switchTab('plan')">
        <div class="dt-ico">📋</div>
        <div class="dt-lbl">Задачи сегодня</div>
        <div class="dt-val">${stats.todayOpen} открытых</div>
        ${stats.todayDone > 0
          ? `<div class="dt-done">${stats.todayDone} выполнено</div>`
          : ""}
      </div>
      <div class="dash-tile" onclick="window.switchTab('goals')">
        <div class="dt-ico">🎯</div>
        <div class="dt-lbl">Жизнь</div>
        <div class="dt-val">${stats.goals.length} целей</div>
      </div>
      <div class="dash-tile" onclick="window.switchTab('ideas')">
        <div class="dt-ico">💡</div>
        <div class="dt-lbl">Идеи</div>
        <div class="dt-val">${stats.ideas.length} записей</div>
      </div>
      <div class="dash-tile" onclick="window.switchTab('diary')">
        <div class="dt-ico">📖</div>
        <div class="dt-lbl">Журнал</div>
        <div class="dt-val">${stats.diary.length} записей</div>
      </div>
    </div>

    <!-- Просроченные задачи — баннер -->
    ${stats.overdue > 0
      ? `<div class="dash-overdue-banner">
           ⚠️ Просрочено задач: ${stats.overdue} — они снижают твой импульс
         </div>`
      : ""}

    <!-- FAB -->
    <button class="fab" onclick="window._openNewEntryPicker()">+</button>
  `;
}
