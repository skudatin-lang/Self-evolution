// ════════════════════════════════════════
//  PERSONAL PROFILE — глубокое профилирование
//  Заполняется один раз, обновляется по желанию
//  Данные → обогащают системный промпт AI
//  js/profile.js
// ════════════════════════════════════════

const LS_KEY = "lc-deep-profile";

// ── Структура профиля ──
const PROFILE_SECTIONS = [
  {
    id: "physical",
    title: "🏃 Физическое состояние",
    desc: "AI учтёт ограничения при составлении плана",
    fields: [
      { id: "chronic_pain",   label: "Хронические боли или ограничения",  placeholder: "напр: боль в пояснице, проблемы с коленями", type: "text" },
      { id: "sleep_quality",  label: "Качество сна (типичное)",            placeholder: "напр: плохо сплю, апноэ, засыпаю легко",    type: "text" },
      { id: "energy_base",    label: "Базовый уровень энергии",            options: ["Обычно высокий (4-5/5)", "Средний (3/5)", "Часто низкий (1-2/5)"], type: "select" },
      { id: "health_limits",  label: "Что нельзя делать физически",       placeholder: "напр: нельзя долго сидеть, нет кардио нагрузок", type: "text" },
    ]
  },
  {
    id: "psychological",
    title: "🧠 Психологический контекст",
    desc: "Помогает AI избегать вредных рекомендаций",
    fields: [
      { id: "main_blocker",   label: "Что чаще всего мешает двигаться вперёд", placeholder: "напр: апатия, страх, прокрастинация, зависимость от оценки других", type: "text" },
      { id: "what_works",     label: "Что точно работает для вас",              placeholder: "напр: маленькие шаги, творчество, разговоры с близкими", type: "text" },
      { id: "what_drains",    label: "Что точно НЕ работает / истощает",        placeholder: "напр: советы «просто сделай», давление, большие списки дел", type: "text" },
      { id: "mood_triggers",  label: "От чего настроение резко падает",         placeholder: "напр: конфликты дома, нехватка денег, одиночество", type: "text" },
      { id: "energy_source",  label: "Главный источник энергии и радости",      placeholder: "напр: творчество, нейросети, общение, природа, музыка", type: "text" },
    ]
  },
  {
    id: "life_context",
    title: "🌍 Контекст жизни",
    desc: "Ситуация в которой живёт пользователь",
    fields: [
      { id: "family",         label: "Семейная ситуация",           placeholder: "напр: женат, двое детей, напряжение в отношениях", type: "text" },
      { id: "work_situation", label: "Рабочая ситуация",            placeholder: "напр: самозанятый, нет постоянного дохода, ищу новые проекты", type: "text" },
      { id: "main_fear",      label: "Главный страх прямо сейчас",  placeholder: "напр: потеря семьи, нехватка денег, не успеть реализоваться", type: "text" },
      { id: "main_desire",    label: "Главное желание прямо сейчас",placeholder: "напр: стабильный доход, гармония в семье, найти смысл", type: "text" },
    ]
  },
  {
    id: "ai_rules",
    title: "⚙️ Правила для AI",
    desc: "Что AI должен и не должен делать в рекомендациях",
    fields: [
      { id: "forbidden",      label: "Что AI никогда не должен советовать",  placeholder: "напр: «просто возьми себя в руки», «делай через силу», задачи >30 мин", type: "text" },
      { id: "max_tasks",      label: "Максимум задач в день",                options: ["1-2 задачи", "3-4 задачи", "5-6 задач", "Без ограничений"], type: "select" },
      { id: "tone",           label: "Желаемый тон AI",                      options: ["Мягкий и поддерживающий", "Прямой и конкретный", "Философский", "Как коуч"], type: "select" },
      { id: "focus_rule",     label: "Главный принцип планирования",          placeholder: "напр: 20% времени на творчество, здоровье важнее дохода", type: "text" },
    ]
  }
];

// ════════════════════════════════════════
//  ОТКРЫТЬ ДИАЛОГ ПРОФИЛЯ
// ════════════════════════════════════════
export function openProfileDialog() {
  document.getElementById("profile-dialog")?.remove();

  const saved = loadProfile();
  const dlg = document.createElement("div");
  dlg.id = "profile-dialog";
  dlg.innerHTML = `
    <div class="prof-backdrop" onclick=""></div>
    <div class="prof-box">
      <div class="prof-header">
        <div class="prof-title">🧬 Личный профиль для AI</div>
        <div class="prof-sub">Заполни один раз — AI всегда будет знать кто ты и что тебе нужно</div>
        <button class="prof-close" onclick="document.getElementById('profile-dialog').remove()">✕</button>
      </div>
      <div class="prof-body">
        ${PROFILE_SECTIONS.map(section => `
          <div class="prof-section">
            <div class="prof-section-title">${section.title}</div>
            <div class="prof-section-desc">${section.desc}</div>
            ${section.fields.map(f => `
              <div class="prof-field">
                <label class="prof-label">${f.label}</label>
                ${f.type === "select"
                  ? `<select class="sel prof-inp" id="prof-${f.id}">
                      <option value="">— выбери —</option>
                      ${f.options.map(o => `<option value="${o}" ${saved[f.id]===o?"selected":""}>${o}</option>`).join("")}
                    </select>`
                  : `<input class="inp prof-inp" id="prof-${f.id}"
                      placeholder="${f.placeholder}"
                      value="${(saved[f.id]||"").replace(/"/g,"&quot;")}">`
                }
              </div>`).join("")}
          </div>`).join("")}
      </div>
      <div class="prof-footer">
        <button class="btn-sv" onclick="window._saveProfile()">✅ Сохранить профиль</button>
        <div class="prof-hint">Данные хранятся только на вашем устройстве</div>
      </div>
    </div>`;

  document.body.appendChild(dlg);
}

// ── Сохранение ──
window._saveProfile = () => {
  const data = {};
  PROFILE_SECTIONS.forEach(s =>
    s.fields.forEach(f => {
      const el = document.getElementById(`prof-${f.id}`);
      if (el) data[f.id] = el.value.trim();
    })
  );
  localStorage.setItem(LS_KEY, JSON.stringify(data));

  // toast
  const t = document.createElement("div");
  t.className = "toast-msg";
  t.textContent = "Профиль сохранён ✓";
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);

  document.getElementById("profile-dialog")?.remove();
};

// ── Загрузка профиля ──
export function loadProfile() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); }
  catch { return {}; }
}

// ── Сборка системного промпта из профиля ──
export function buildProfileSystemPrompt(profile) {
  const p = profile || loadProfile();
  if (!Object.keys(p).length) return "";

  const parts = [];

  if (p.chronic_pain)   parts.push(`Физические ограничения: ${p.chronic_pain}.`);
  if (p.sleep_quality)  parts.push(`Сон: ${p.sleep_quality}.`);
  if (p.energy_base)    parts.push(`Базовая энергия: ${p.energy_base}.`);
  if (p.health_limits)  parts.push(`Нельзя физически: ${p.health_limits}.`);
  if (p.main_blocker)   parts.push(`Главный блок: ${p.main_blocker}.`);
  if (p.what_works)     parts.push(`Что работает: ${p.what_works}.`);
  if (p.what_drains)    parts.push(`Что истощает/не работает: ${p.what_drains}.`);
  if (p.mood_triggers)  parts.push(`Триггеры падения настроения: ${p.mood_triggers}.`);
  if (p.energy_source)  parts.push(`Источник энергии: ${p.energy_source}.`);
  if (p.family)         parts.push(`Семья: ${p.family}.`);
  if (p.work_situation) parts.push(`Работа: ${p.work_situation}.`);
  if (p.main_fear)      parts.push(`Главный страх: ${p.main_fear}.`);
  if (p.main_desire)    parts.push(`Главное желание: ${p.main_desire}.`);
  if (p.forbidden)      parts.push(`ЗАПРЕЩЕНО советовать: ${p.forbidden}.`);
  if (p.max_tasks)      parts.push(`Максимум задач в день: ${p.max_tasks}.`);
  if (p.tone)           parts.push(`Тон ответа: ${p.tone}.`);
  if (p.focus_rule)     parts.push(`Главный принцип: ${p.focus_rule}.`);

  return parts.length
    ? `\n\nПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ (ОБЯЗАТЕЛЬНО УЧИТЫВАТЬ):\n${parts.join("\n")}`
    : "";
}
