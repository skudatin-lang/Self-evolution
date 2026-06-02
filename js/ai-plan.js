// ════════════════════════════════════════
//  AI-PLAN — Утренний план от AI
//  js/ai-plan.js
//
//  Попап поверх приложения:
//  1. Генерирует 3 варианта плана (A/B/C) через DeepSeek
//  2. Пользователь выбирает вариант / редактирует / комбинирует
//  3. AI проверяет итоговый список
//  4. «Применить» — создаёт задачи в Firebase, старые помечает displaced
// ════════════════════════════════════════

import {
  getTasks, getGoals, getProjects, getSurvey, getDiary, getIdeas,
  saveAiPlanDraft, getAiPlanDraft, applyAiPlan,
  dstr, esc, today
} from "./db.js";
import { buildProfileSystemPrompt, loadProfile } from "./profile.js";

// ══════════════════════════════════════
//  СОСТОЯНИЕ
// ══════════════════════════════════════
let _goals    = [];
let _projects = [];
let _variants = [];
let _selected = [];
let _activeVariant = 0;
let _lastAnalysis = "";
let _lastWarnings = [];
let _lastDeferred = [];
let _overlay  = null;
// 5-блочный формат
let _b1 = {}; // yesterday
let _b2 = {}; // morning
let _b4 = {}; // ideas+diary
let _b5 = []; // alerts
// DEBUG
let _dbgSystemPrompt = "";
let _dbgInputData    = "";

// ══════════════════════════════════════
//  ОТКРЫТЬ ПОПАП
// ══════════════════════════════════════
export async function openAiPlan() {
  if (document.getElementById("aip-overlay")) return;

  _overlay = document.createElement("div");
  _overlay.id = "aip-overlay";
  _overlay.className = "aip-overlay";

  const box = document.createElement("div");
  box.className = "aip-box";
  box.id = "aip-box";
  _overlay.appendChild(box);
  document.body.appendChild(_overlay);

  renderLoading("Загружаю данные…");

  try {
    [_goals, _projects] = await Promise.all([getGoals(), getProjects()]);

    // Проверяем есть ли сохранённый черновик сегодня
    const drafts = await getAiPlanDraft();
    const draft  = drafts[0];
    const forceNew = sessionStorage.getItem("aip-force-new");
    sessionStorage.removeItem("aip-force-new");

    if (!forceNew && draft?.date === today() && draft?.variants?.length) {
      _variants      = draft.variants;
      _lastAnalysis  = draft.analysis || "";
      _b1 = draft.b1 || {};
      _b2 = draft.b2 || {};
      _b4 = draft.b4 || {};
      _b5 = draft.b5 || draft.alerts || [];
      _lastWarnings  = _b5.map ? _b5.map(a => a.message||"").filter(Boolean) : [];
      _lastDeferred  = draft.deferred || [];
      _selected      = [...(_variants[0]?.tasks || [])].map(t => ({...t, variant:"A"}));
      _activeVariant = 0;
      renderVariants();
      return;
    }

    // Генерируем новый план
    renderLoading("Анализирую твои данные…");
    await generatePlan();
  } catch(e) {
    renderError(e.message);
  }
}

function closeAiPlan() {
  document.getElementById("aip-overlay")?.remove();
  _overlay = null;
}

// ══════════════════════════════════════
//  ГЕНЕРАЦИЯ — DeepSeek через ProxyAPI
// ══════════════════════════════════════
async function generatePlan() {
  const key = localStorage.getItem("lc-ai-key");
  if (!key) { renderError("Введите ProxyAPI ключ в настройках (вкладка План дня → ⚙)"); return; }

  const [tasks, surveys, diary, ideas] = await Promise.all([
    getTasks(), getSurvey(), getDiary(), getIdeas()
  ]);
  const survey  = surveys[0] || null;
  const today2  = today();
  const prof    = JSON.parse(localStorage.getItem("lc-ai-profile") || "{}");

  // ── Данные колеса баланса ──
  const wheel = survey ? {
    scores:    survey.scores || {},
    priorities: survey.priorities || [],
    avg:       survey.avgSatisfaction || null,
    gaps:      (survey.priorities || [])
      .filter(id => (survey.scores?.[id] || 10) < 6)
      .map(id => `${id}:${survey.scores?.[id]}/10`),
  } : null;

  // ── История энергии задач (14 дней) ──
  const cut14 = new Date(); cut14.setDate(cut14.getDate() - 14);
  const scored = tasks.filter(t =>
    t.done && t.energyScore && t.completedDate && new Date(t.completedDate) >= cut14
  );
  const vampires = scored.filter(t => t.energyScore <= 2).map(t => t.title).slice(0,5);
  const chargers = scored.filter(t => t.energyScore >= 4).map(t => t.title).slice(0,5);

  // ── Открытые задачи ──
  const open = tasks.filter(t => !t.done && !t.displaced).slice(0, 30).map(t => ({
    id:       t.id,
    title:    t.title,
    priority: t.priority || "med",
    goal:     _goals.find(g => g.id === t.goalId)?.title || null,
    project:  _projects.find(p => p.id === t.projId)?.name || null,
    deadline: t.deadline ? dstr(t.deadline.toDate ? t.deadline.toDate() : new Date(t.deadline)) : null,
    note:     t.note || "",
    date:     t.date || null,
  }));

  // ── Задачи уже запланированные на сегодня ──
  const todayTasks = tasks
    .filter(t => !t.done && !t.displaced && t.date === today2)
    .map(t => ({
      title:   t.title,
      goal:    _goals.find(g => g.id === t.goalId)?.title || null,
      project: _projects.find(p => p.id === t.projId)?.name || null,
    }));

  // ── Дневник и идеи (краткие) ──
  const cut7 = new Date(); cut7.setDate(cut7.getDate() - 7);
  const recentDiary = diary
    .filter(e => e.date && new Date(e.date) >= cut7)
    .map(e => ({ date: e.date, mood: e.mood || null, text: (e.text||"").slice(0,200) }));
  const recentIdeas = ideas.slice(0,10).map(i => ({ title: i.title, text: (i.text||"").slice(0,100) }));

  // ── Вчерашние данные для блока 1 ──
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = dstr(yesterday);
  const yesterdayDone = tasks.filter(t => t.completedDate === yesterdayStr);
  const authorActions = yesterdayDone.filter(t => t.authorAction === "да").length;
  const yesterdayPlanned = tasks.filter(t => t.date === yesterdayStr).length;

  // ── Просроченные важные задачи (алерты) ──
  const twoDaysAgo = new Date(); twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  const overdueAlerts = tasks.filter(t =>
    !t.done && t.priority === "high" &&
    t.date && new Date(t.date) < twoDaysAgo
  ).map(t => ({ title: t.title, date: t.date, days_overdue: Math.floor((Date.now() - new Date(t.date))/86400000) }));

  const input = {
    today:        today2,
    user_profile: {
      chronotype:  prof.chronotype || "lark",
      best_hours:  prof.best_hours  || "09:00-11:30",
      worst_hours: prof.worst_hours || "15:00-17:00",
    },
    yesterday: {
      planned: yesterdayPlanned,
      done: yesterdayDone.length,
      author_actions: authorActions,
      authorship_rate: yesterdayDone.length
        ? Math.round(authorActions / yesterdayDone.length * 100) + "%" : "0%",
    },
    wheel_of_life: wheel,
    energy_history: { vampires, chargers, avg_energy: scored.length
      ? parseFloat((scored.reduce((s,t)=>s+t.energyScore,0)/scored.length).toFixed(1)) : null },
    goals:    _goals.map(g => ({ id:g.id, title:g.title, priority:g.priority||"medium", desc:g.desc||"" })),
    projects: _projects.map(p => ({ id:p.id, title:p.name, goal_id:p.goalId||null })),
    open_tasks:    open,
    today_tasks:   todayTasks,
    diary_7d:      recentDiary,
    ideas: ideas.slice(0,10).map(i => ({ title:i.title, realized: !!i.realized })),
    ideas_realized: ideas.filter(i => i.realized).length,
    ideas_total: ideas.length,
    overdue_alerts: overdueAlerts,
  };

  const systemPrompt = `Ты — персональный AI-коуч в приложении Life-Control. Говоришь с пользователем на «ты», прямо и по-человечески. Знаешь его блоки, страхи и источники энергии.

ФОРМАТ ОТВЕТА — строго 5 блоков в JSON без markdown:

{
  "block1_yesterday": {
    "planned": число запланированных задач вчера,
    "done": число выполненных,
    "authorship_rate": "X%" — (авторские действия / всё выполненное * 100),
    "analysis": "2-3 предложения на ты — что говорит этот ритм о движении к целям. Конкретно, без воды.",
    "trend": "к чему ведёт если продолжать в том же темпе (1 предложение)"
  },
  "block2_morning": {
    "question": "Как спал? Оцени состояние с утра (1 — разбит, 5 — бодр)",
    "energy_used": число из energy_today или 3 если не указано,
    "state_diagnosis": "1-2 предложения — что значит такой уровень энергии для задач сегодня"
  },
  "block3_plan": {
    "variants": [
      {
        "label": "A",
        "focus": "название фокуса (5-7 слов)",
        "load": "лёгкая|средняя|высокая",
        "authorship_count": число авторских задач в варианте,
        "rationale": "1-2 предложения почему подходит сегодня",
        "tasks": [
          {
            "title": "глагол + конкретное действие",
            "type": "mission|support|health|routine|resource_anchor",
            "is_author_action": true,
            "fear_link": false,
            "motiv": "хочу|долг",
            "energy_cost": 2,
            "duration_min": 20,
            "time_slot": "09:00",
            "goal_title": "название цели или null",
            "note": "зачем именно сегодня",
            "steps": ["микрошаг 1", "микрошаг 2"]
          }
        ],
        "energy_boost_task": {
          "title": "конкретное действие на 5-10 мин восстанавливающее энергию",
          "duration_min": 10,
          "why": "почему именно это"
        },
        "overload_risk": "оценка риска перегруза 0-100%",
        "overload_comment": "если риск > 50% — 1 предложение предупреждения. Решение за пользователем."
      }
    ],
    "displaced_to_weekend": ["задачи которые лучше перенести"]
  },
  "block4_ideas_diary": {
    "ideas_realized_ratio": "X из Y идей реализованы",
    "ideas_insight": "1-2 предложения — паттерн между идеями и действиями",
    "diary_mood_trend": "тренд настроения за последние 7 дней",
    "diary_insight": "1-2 предложения — как записи в дневнике влияют на состояние. Конкретно."
  },
  "block5_alerts": [
    {
      "task_title": "название задачи",
      "days_overdue": число дней просрочки,
      "message": "Задача [название] не выполнена. Это твой выбор или поддался обстоятельствам?",
      "options": ["отменить", "перенести", "разбить на микрошаги"],
      "pattern_hypothesis": "если задача пропускается часто — гипотеза почему. Иначе null."
    }
  ],
  "warnings": ["конкретные предупреждения с именами задач"]
}

ПРАВИЛА:
- analysis всегда на «ты», конкретно, называй задачи и цели по имени
- НЕ пиши «у пользователя» — пиши «ты», «твой», «тебе»
- authorship_rate = задачи помеченные is_author_action:true или authorAction=да / всё выполненное
- Алерты только для задач: приоритет=high И просрочка >= 2 дней
- ОБЯЗАТЕЛЬНО верни ровно 3 варианта: A (лёгкая нагрузка), B (средняя нагрузка), C (высокая нагрузка)
- Варианты A/B/C РЕАЛЬНО отличаются по нагрузке: A=2 задачи, B=3-4 задачи, C=4-5 задач
- Если не можешь сгенерировать 3 варианта — уменьши задачи но сохрани 3 варианта
- КРИТИЧНО: массив "variants" должен содержать ровно 3 элемента — не 1, не 2, а 3
${buildProfileSystemPrompt()}`;

  // ── DEBUG: сохраняем для просмотра ──
  _dbgSystemPrompt = systemPrompt;
  _dbgInputData    = JSON.stringify(input, null, 2);
  console.group("🤖 AI-Plan DEBUG");
  console.log("SYSTEM PROMPT:\n", systemPrompt);
  console.log("USER DATA:\n", _dbgInputData);
  console.groupEnd();

  renderLoading("DeepSeek анализирует твой день…");

  const resp = await fetch("https://api.proxyapi.ru/openrouter/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + key,
    },
    body: JSON.stringify({
      model: "deepseek/deepseek-chat",
      max_tokens: 6000,
      temperature: 0.6,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: "Данные пользователя:\n" + JSON.stringify(input, null, 2) },
      ],
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(()=>({}));
    throw new Error(err.error?.message || "Ошибка API: " + resp.status);
  }

  const data = await resp.json();
  let text = data.choices?.[0]?.message?.content?.trim() || "";
  text = text.replace(/```json\s*/gi,"").replace(/```\s*/g,"").trim();

  let parsed;
  try { parsed = JSON.parse(text); }
  catch(e) { throw new Error("AI вернул некорректный JSON. Попробуй ещё раз."); }

  // Поддержка нового 5-блочного формата И старого формата
  _b1 = parsed.block1_yesterday  || {};
  _b2 = parsed.block2_morning    || {};
  const b3 = parsed.block3_plan  || {};
  _b4 = parsed.block4_ideas_diary || {};
  _b5 = parsed.block5_alerts     || [];

  // Варианты — из block3_plan.variants ИЛИ из корня (старый формат)
  _variants = b3.variants || parsed.variants || [];
  // Если AI вернул менее 3 вариантов — дополняем клонами с изменённой нагрузкой
  if (_variants.length < 3) {
    console.warn("AI вернул менее 3 вариантов:", _variants.length, "— дополняем");
    const base = _variants[0] || { label:"A", focus:"Базовый план", load:"средняя", tasks:[], rationale:"" };
    const loads = ["лёгкая","средняя","высокая"];
    const labels = ["A","B","C"];
    while (_variants.length < 3) {
      const idx = _variants.length;
      // Берём базовый вариант и адаптируем нагрузку
      const clone = JSON.parse(JSON.stringify(base));
      clone.label = labels[idx];
      clone.load  = loads[idx];
      clone.focus = base.focus + (idx === 0 ? " (лёгкий)" : idx === 2 ? " (интенсивный)" : "");
      clone.rationale = idx === 0
        ? "Облегчённая версия — оставляем только самое важное."
        : "Интенсивная версия — максимум задач при высокой энергии.";
      // Для лёгкого — берём только 2 первые задачи, для тяжёлого — все
      if (idx === 0 && clone.tasks?.length > 2) clone.tasks = clone.tasks.slice(0, 2);
      _variants.push(clone);
    }
  }
  _variants.forEach((v, i) => v.label = ["A","B","C"][i] || String(i+1));

  // Анализ — только для обратной совместимости с кэшем
  const analysisText = parsed.analysis || "";

  await saveAiPlanDraft({
    date: today2,
    variants: _variants,
    analysis: analysisText,
    b1: _b1, b2: _b2, b4: _b4, b5: _b5,
    alerts: _b5,
    deferred: b3.displaced_to_weekend || [],
  });

  _lastAnalysis  = analysisText;
  _lastWarnings  = [
    ...(_b5.map ? _b5.map(a => a.message || "").filter(Boolean) : []),
    ...(parsed.warnings || []),
  ].filter(Boolean);
  _lastDeferred  = b3.displaced_to_weekend || parsed.deferred_to_weekend || [];
  _selected      = _variants[0]?.tasks?.map(t => ({...t, variant:"A"})) || [];
  _activeVariant = 0;

  renderVariants();
}

// ══════════════════════════════════════
//  РЕНДЕР ВАРИАНТОВ
// ══════════════════════════════════════
function renderVariants() {
  const box = document.getElementById("aip-box");
  if (!box) return;

  const typeIcon  = { mission:"🎯", support:"💼", health:"💪", routine:"🔄", resource_anchor:"🌱" };
  const priColor  = { high:"var(--red)", med:"var(--go-d)", low:"var(--grn)" };
  const priLabel  = { high:"Высокий", med:"Средний", low:"Низкий" };

  // ── Блок 1: итоги вчера ──
  const block1Html = (_b1.analysis || _b1.authorship_rate) ? `
    <div class="aip-block aip-block-yesterday">
      <div class="aip-block-ttl">📅 Вчера</div>
      ${_b1.planned !== undefined ? `<div class="aip-block-stat">
        Запланировано: <b>${_b1.planned}</b> · Выполнено: <b>${_b1.done||0}</b>
        · Авторство: <b>${_b1.authorship_rate||"0%"}</b>
      </div>` : ""}
      ${_b1.analysis ? `<div class="aip-block-text">${esc(_b1.analysis)}</div>` : ""}
      ${_b1.trend ? `<div class="aip-block-trend">→ ${esc(_b1.trend)}</div>` : ""}
    </div>` : (_lastAnalysis ? `<div class="aip-analysis">${esc(_lastAnalysis)}</div>` : "");

  // ── Блок 2: утреннее состояние ──
  const block2Html = _b2.state_diagnosis ? `
    <div class="aip-block aip-block-morning">
      <div class="aip-block-ttl">⚡ Состояние утром</div>
      <div class="aip-block-text">${esc(_b2.state_diagnosis)}</div>
    </div>` : "";

  // ── Блок 4: идеи + дневник ──
  const block4Html = (_b4.ideas_insight || _b4.diary_insight) ? `
    <div class="aip-block aip-block-ideas">
      <div class="aip-block-ttl">💡 Идеи и дневник</div>
      ${_b4.ideas_realized_ratio ? `<div class="aip-block-stat">${esc(_b4.ideas_realized_ratio)}</div>` : ""}
      ${_b4.ideas_insight  ? `<div class="aip-block-text">${esc(_b4.ideas_insight)}</div>` : ""}
      ${_b4.diary_insight  ? `<div class="aip-block-text">📓 ${esc(_b4.diary_insight)}</div>` : ""}
    </div>` : "";

  // ── Блок 5: алерты ──
  const alertsHtml = _b5.length ? `
    <div class="aip-block aip-block-alerts">
      <div class="aip-block-ttl">🚨 Важные задачи</div>
      ${_b5.map(a => `
        <div class="aip-alert">
          <div class="aip-alert-msg">${esc(a.message||a.task_title||"")}</div>
          ${a.options?.length ? `<div class="aip-alert-opts">${a.options.map((o,i) => `<span class="aip-alert-opt">${String.fromCharCode(97+i)}) ${esc(o)}</span>`).join("")}</div>` : ""}
          ${a.pattern_hypothesis ? `<div class="aip-alert-hyp">💭 ${esc(a.pattern_hypothesis)}</div>` : ""}
        </div>`).join("")}
    </div>` : "";

  const warns = (_lastWarnings||[]).filter(w => !_b5.find(a => a.message === w));
  const warningsHtml = warns.length
    ? warns.map(w => `<div class="aip-warn">⚠ ${esc(w)}</div>`).join("") : "";

  const deferred = _lastDeferred || [];
  const deferredHtml = deferred.length ? `
    <div class="aip-deferred">
      <div class="aip-deferred-ttl">📅 Перенести на выходные</div>
      ${deferred.map(d => `<div class="aip-deferred-item">· ${esc(d)}</div>`).join("")}
    </div>` : "";

  // ── Вкладки вариантов ──
  const variantTabs = _variants.map((v,i) => {
    const loadEmoji = v.load === "лёгкая" ? "🟢" : v.load === "высокая" ? "🔴" : "🟡";
    return `<button class="aip-var-tab ${_activeVariant===i?"on":""}"
      onclick="window._aipSelectVariant(${i})">
      <span class="aip-var-letter">${v.label}</span>
      <span class="aip-var-focus">${esc(v.focus||"")} ${loadEmoji}</span>
    </button>`;
  }).join("");

  const activeV  = _variants[_activeVariant] || _variants[0] || {};
  const taskRows = (_activeVariant < 3 ? activeV.tasks : _selected)?.map((t, i) => {
    const sel = _activeVariant < 3
      ? !!_selected.find(s => s.title === t.title)
      : true;
    const costTag     = t.energy_cost ? `<span class="aip-meta-chip cost">⚡${t.energy_cost}/5</span>` : "";
    const vampireTag  = t.energy_vampire ? `<span class="aip-meta-chip vamp">🧛</span>` : "";
    const authorTag   = t.is_author_action ? `<span class="aip-meta-chip author">✍️</span>` : "";
    return `
    <div class="aip-task-row ${sel?"sel":""} ${t.energy_vampire?"vampire":""}" data-idx="${i}"
      onclick="window._aipToggleTask(${i})">
      <div class="aip-task-check">${sel ? "✓" : ""}</div>
      <div class="aip-task-body">
        <div class="aip-task-title">${esc(t.title)}</div>
        <div class="aip-task-meta">
          ${t.time_slot    ? `<span class="aip-meta-chip time">${t.time_slot}</span>` : ""}
          ${t.duration_min ? `<span class="aip-meta-chip dur">~${t.duration_min} мин</span>` : ""}
          <span class="aip-meta-chip type">${typeIcon[t.type]||"•"} ${t.type||""}</span>
          ${t.goal_title   ? `<span class="aip-meta-chip goal">↳ ${esc(t.goal_title)}</span>` : ""}
          ${t.priority ? `<span class="aip-meta-chip pri" style="color:${priColor[t.priority]||"var(--tx-l)"}">
            ${priLabel[t.priority]||""}</span>` : ""}
          ${costTag}${vampireTag}${authorTag}
        </div>
        ${t.note ? `<div class="aip-task-note">${esc(t.note)}</div>` : ""}
        ${t.steps?.length
          ? `<div class="aip-task-steps">${t.steps.map(s=>`<div class="aip-step">▸ ${esc(s)}</div>`).join("")}</div>`
          : ""}
      </div>
    </div>`;
  }).join("") || `<div class="aip-empty">Нет задач</div>`;

  // energy_boost_task
  const boost = _activeVariant < 3 ? (activeV.energy_boost_task || null) : null;
  const boostHtml = boost ? `
    <div class="aip-anchor">
      <span class="aip-anchor-icon">⚡</span>
      <div class="aip-anchor-body">
        <div class="aip-anchor-title">${esc(boost.title)}</div>
        ${boost.duration_min ? `<span class="aip-meta-chip dur">~${boost.duration_min} мин</span>` : ""}
        ${boost.why ? `<div class="aip-task-note">${esc(boost.why)}</div>` : ""}
      </div>
    </div>` : "";

  // overload risk
  const overloadHtml = (_activeVariant < 3 && activeV.overload_risk && parseInt(activeV.overload_risk) > 50) ? `
    <div class="aip-overload">⚠️ Риск перегруза: ${esc(activeV.overload_risk)}
      ${activeV.overload_comment ? ` — ${esc(activeV.overload_comment)}` : ""}
    </div>` : "";

  const selCount     = _selected.length;
  const missionCount = _selected.filter(t => t.type === "mission").length;

  const hint = _activeVariant < 3
    ? `<div class="aip-hint">✓ — задача уже в твоём плане. Кликни чтобы добавить или убрать.</div>`
    : `<div class="aip-hint">Это твой итоговый план.</div>`;

  box.innerHTML = `
    <div class="aip-hd">
      <div class="aip-hd-left">
        <div class="aip-title">✨ Утренний план</div>
        <div class="aip-date">${new Date().toLocaleDateString("ru-RU",{weekday:"long",day:"numeric",month:"long"})}</div>
      </div>
      <button id="aip-debug-btn" style="display:none;font-size:11px;padding:3px 8px;background:#222;color:#0f0;border:1px solid #444;border-radius:4px;cursor:pointer;margin-right:4px">🐛 Промпт</button>
      <button title="Сгенерировать новый план" style="font-size:11px;padding:4px 10px;background:rgba(0,180,216,.15);color:var(--go);border:1px solid var(--go);border-radius:var(--rf);cursor:pointer;font-family:var(--fd);font-weight:700;letter-spacing:.04em;margin-right:4px" onclick="window._aipForceRefresh()">🔄 Новый</button>
      <button class="aip-close" onclick="window._aipClose()">✕</button>
    </div>

    ${block1Html}
    ${block2Html}
    ${alertsHtml}
    ${warningsHtml}

    <div class="aip-var-tabs">
      ${variantTabs}
      <button class="aip-var-tab ${_activeVariant===3?"on":""}" onclick="window._aipSelectVariant(3)">
        <span class="aip-var-letter">✎</span>
        <span class="aip-var-focus">Мой план (${selCount})</span>
      </button>
    </div>

    ${_activeVariant < 3 ? `<div class="aip-rationale">${esc(activeV.rationale||"")}</div>` : ""}
    ${overloadHtml}
    ${hint}

    <div class="aip-task-list" id="aip-task-list">${taskRows}</div>
    ${boostHtml}
    ${block4Html}
    ${deferredHtml}

    <div class="aip-custom-add">
      <input class="aip-custom-inp" id="aip-custom-inp" placeholder="Добавить свою задачу..."/>
      <button class="aip-custom-btn" onclick="window._aipAddCustom()">+</button>
    </div>
    <div class="aip-footer">
      В плане: ${selCount} задач · Mission: ${missionCount}
    </div>
    <div class="aip-actions">
      <button class="aip-check-btn" onclick="window._aipCheck()">🔍 Проверить</button>
      <button class="aip-apply-btn" onclick="window._aipApply()">✅ Применить (${selCount})</button>
    </div>
    <div class="aip-check-result" id="aip-check-result"></div>`;

  // Навешиваем debug-кнопку — работает всегда (из кэша тоже)
  const dbgBtn = document.getElementById("aip-debug-btn");
  if (dbgBtn) {
    dbgBtn.style.display = "inline-block";
    dbgBtn.onclick = () => {
      const existing = document.getElementById("aip-debug-panel");
      if (existing) { existing.remove(); return; }
      const panel = document.createElement("div");
      panel.id = "aip-debug-panel";
      panel.style.cssText = "position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:9999;background:#0d1117;color:#7ee787;font-family:monospace;font-size:11px;padding:16px 16px 8px;border-radius:10px;width:min(680px,95vw);max-height:80vh;overflow:auto;white-space:pre-wrap;border:1px solid #30363d;box-shadow:0 8px 40px rgba(0,0,0,.7)";
      const content = _dbgSystemPrompt
        ? "═══ SYSTEM PROMPT ═══\n\n" + _dbgSystemPrompt + "\n\n═══ USER DATA ═══\n\n" + _dbgInputData
        : "⚠️ Данные доступны только после нового запроса к API.\nНажми «🔄 Новый» чтобы сгенерировать план и увидеть промпт.";
      panel.textContent = content;
      const close = document.createElement("button");
      close.textContent = "✕ Закрыть";
      close.style.cssText = "position:sticky;top:0;float:right;background:#21262d;color:#e6edf3;border:1px solid #30363d;padding:4px 12px;border-radius:6px;cursor:pointer;font-size:12px;margin-bottom:8px";
      close.onclick = () => panel.remove();
      panel.prepend(close);
      document.body.appendChild(panel);
    };
  }
}

// ══════════════════════════════════════
//  WINDOW GLOBALS
// ══════════════════════════════════════
window._aipClose = closeAiPlan;

// Принудительно сгенерировать новый план (сбросить кэш)
window._aipForceRefresh = () => {
  sessionStorage.setItem("aip-force-new", "1");
  closeAiPlan();
  setTimeout(() => window.openAiPlan?.(), 150);
};

window._aipSelectVariant = i => {
  _activeVariant = i;
  // НЕ заменяем _selected при переключении вкладок —
  // пользователь должен сам кликать по задачам чтобы добавить/убрать
  // Исключение: если _selected пустой и переходим на A — берём все задачи A по умолчанию
  if (i < 3 && _selected.length === 0 && _variants[i]?.tasks?.length) {
    _selected = _variants[i].tasks.map(t => ({...t, variant: _variants[i].label}));
  }
  renderVariants(_lastAnalysis);
};

window._aipToggleTask = idx => {
  // Получаем задачи из текущей отображаемой вкладки
  const displayTasks = _activeVariant === 3
    ? _selected
    : (_variants[_activeVariant]?.tasks || []);
  const task = displayTasks[idx];
  if (!task) return;

  const existsIdx = _selected.findIndex(s => s.title === task.title);

  if (existsIdx >= 0) {
    // Убираем из плана
    _selected.splice(existsIdx, 1);
  } else {
    // Добавляем в план — сохраняем из какого варианта взята
    const varLabel = _activeVariant < 3
      ? (_variants[_activeVariant]?.label || "?")
      : "custom";
    _selected.push({...task, variant: varLabel});
  }

  // Обновляем DOM без полного рендера (быстро)
  _updateTaskListDOM();
};

// Обновляет только список задач и счётчики — без перестройки всего попапа
function _updateTaskListDOM() {
  const box = document.getElementById("aip-box");
  if (!box) return;

  const displayTasks = _activeVariant === 3
    ? _selected
    : (_variants[_activeVariant]?.tasks || []);

  // Обновляем каждую строку
  box.querySelectorAll(".aip-task-row").forEach((row, i) => {
    const task = displayTasks[i];
    if (!task) return;
    const sel = _selected.some(s => s.title === task.title);
    row.classList.toggle("sel", sel);
    const chk = row.querySelector(".aip-task-check");
    if (chk) chk.textContent = sel ? "✓" : "";
  });

  // Обновляем счётчики
  const selCount     = _selected.length;
  const missionCount = _selected.filter(t => t.type === "mission").length;

  const summary = box.querySelector(".aip-summary");
  if (summary) summary.innerHTML = `В плане: <b>${selCount}</b> задач · Mission: <b>${missionCount}</b>`;

  const applyBtn = box.querySelector(".aip-btn-apply");
  if (applyBtn) {
    applyBtn.disabled = selCount === 0;
    applyBtn.classList.toggle("disabled", selCount === 0);
    applyBtn.textContent = `✅ Применить (${selCount})`;
  }

  // Обновляем вкладку «Мой план»
  const tabs = box.querySelectorAll(".aip-var-tab");
  const myTab = tabs[3];
  if (myTab) {
    const focusEl = myTab.querySelector(".aip-var-focus");
    if (focusEl) focusEl.textContent = `Мой план (${selCount})`;
  }

  // Обновляем предупреждения
  const existingWarns = box.querySelectorAll(".aip-warn");
  existingWarns.forEach(w => w.remove());
  const summaryEl = box.querySelector(".aip-summary");
  if (summaryEl) {
    if (missionCount === 0 && selCount > 0)
      summaryEl.insertAdjacentHTML("beforebegin",
        `<div class="aip-warn">⚠ Нет mission-задачи — день уйдёт в рутину</div>`);
    if (selCount > 5)
      summaryEl.insertAdjacentHTML("beforebegin",
        `<div class="aip-warn">⚠ ${selCount} задач — возможна перегрузка (рекомендуется 4-5)</div>`);
  }
}

window._aipAddCustom = () => {
  const inp = document.getElementById("aip-add-inp");
  const title = inp?.value.trim();
  if (!title) return;
  _selected.push({ title, type:"support", priority:"med", variant:"custom", note:"Добавлено вручную" });
  _activeVariant = 3;
  inp.value = "";
  renderVariants();
};

// ── Проверка плана ──
window._aipCheck = async () => {
  const key = localStorage.getItem("lc-ai-key");
  const resultDiv = document.getElementById("aip-check-result");
  if (!resultDiv || !key || _selected.length === 0) return;

  resultDiv.innerHTML = `<div class="aip-checking">⏳ Проверяю…</div>`;

  const checkPrompt = `Ты — AI планировщик. Пользователь составил план дня. Дай краткую оценку (2-3 предложения) и одно конкретное предложение если что-то можно улучшить. Будь конкретным, не давай длинных советов.

План пользователя: ${JSON.stringify(_selected.map(t=>({title:t.title,type:t.type,priority:t.priority,duration_min:t.duration_min})))}
Цели пользователя: ${JSON.stringify(_goals.map(g=>g.title))}

Ответь на русском, 3-4 предложения максимум. Без JSON.`;

  try {
    const resp = await fetch("https://api.proxyapi.ru/openrouter/v1/chat/completions", {
      method:"POST",
      headers:{"Content-Type":"application/json","Authorization":"Bearer "+key},
      body: JSON.stringify({
        model:"deepseek/deepseek-chat", max_tokens:300, temperature:0.5,
        messages:[{role:"user",content:checkPrompt}],
      }),
    });
    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content?.trim() || "";
    resultDiv.innerHTML = `<div class="aip-check-text">🔍 ${text}</div>`;
  } catch(e) {
    resultDiv.innerHTML = `<div class="aip-check-err">Ошибка проверки</div>`;
  }
};

// ── Применить план ──
window._aipApply = async () => {
  if (_selected.length === 0) return;
  const btn = document.querySelector(".aip-btn-apply");
  if (btn) { btn.disabled = true; btn.textContent = "⏳ Применяю…"; }

  try {
    await applyAiPlan(_selected, _goals, _projects);
    closeAiPlan();
    window._toast?.("✅ План применён — " + _selected.length + " задач добавлено");
    window._refreshAll?.();
  } catch(e) {
    if (btn) { btn.disabled = false; btn.textContent = "✅ Применить в план дня"; }
    window._toast?.("Ошибка: " + e.message);
  }
};

// ── Заглушки ──
function renderLoading(msg) {
  const box = document.getElementById("aip-box");
  if (!box) return;
  box.innerHTML = `
    <div class="aip-hd">
      <div class="aip-title">✨ Утренний план</div>
      <button class="aip-close" onclick="window._aipClose()">✕</button>
    </div>
    <div class="aip-loading">
      <div class="aip-loading-ico">✨</div>
      <div class="aip-loading-txt">${esc(msg)}</div>
    </div>`;
}

function renderError(msg) {
  const box = document.getElementById("aip-box");
  if (!box) return;
  box.innerHTML = `
    <div class="aip-hd">
      <div class="aip-title">✨ Утренний план</div>
      <button class="aip-close" onclick="window._aipClose()">✕</button>
    </div>
    <div class="aip-error">⚠ ${esc(msg)}</div>
    <div style="text-align:center;margin-top:16px">
      <button class="aip-btn-check" onclick="window._aipRetry()">Попробовать снова</button>
    </div>`;
}

window._aipRetry = () => { generatePlan().catch(e => renderError(e.message)); };

// ── Экспорт ──
window.openAiPlan = openAiPlan;
