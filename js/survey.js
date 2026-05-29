// ════════════════════════════════════════
//  SURVEY — Колесо баланса жизни
//  js/survey.js
// ════════════════════════════════════════

import { getSurvey, saveSurvey, dstr } from "./db.js";

// ── 6 сфер колеса ──
const SPHERES = [
  { id: "health",    label: "Здоровье",       emoji: "💪", color: "#4A8A4A", q: 1 },
  { id: "relations", label: "Отношения",      emoji: "❤️", color: "#C8963E", q: 2 },
  { id: "work",      label: "Работа / Дело",  emoji: "💼", color: "#3A6EA8", q: 3 },
  { id: "finance",   label: "Финансы",        emoji: "💰", color: "#7B4F1E", q: 4 },
  { id: "rest",      label: "Отдых / Творчество", emoji: "🎨", color: "#9A6F28", q: 5 },
  { id: "meaning",   label: "Смысл / Вклад",  emoji: "🌱", color: "#5A3510", q: 6 },
];

// ── Вопросы ──
const QUESTIONS = [
  { id: "health",    text: "Как вы оцениваете своё физическое самочувствие и уровень энергии в последние 2–3 недели?",   hint: "Сон, питание, активность, усталость" },
  { id: "relations", text: "Как вы оцениваете качество отношений с близкими людьми и чувство принадлежности?",            hint: "Семья, друзья, партнёр" },
  { id: "work",      text: "Как вы оцениваете вашу реализацию в работе или значимом для вас деле?",                       hint: "Работа, проект, учёба, хобби" },
  { id: "finance",   text: "Как вы оцениваете ваше финансовое положение и ощущение материальной безопасности?",           hint: "Доход, сбережения, стабильность" },
  { id: "rest",      text: "Как вы оцениваете количество и качество отдыха, творчества и того, что делает вас счастливым?", hint: "Хобби, путешествия, удовольствия" },
  { id: "meaning",   text: "Как вы оцениваете наличие смысла, направления и вклада во что-то большее, чем вы сами?",      hint: "Миссия, помощь другим, ценности" },
  { id: "pri_health_imp",  text: "Насколько для вас важно улучшить или поддерживать сферу «Здоровье и энергия» в ближайшие 3 месяца?", hint: "" },
  { id: "pri_meaning_imp", text: "Насколько для вас важно усилить сферу «Смысл и вклад» в ближайшие 3 месяца?",           hint: "" },
  { id: "priorities", text: "Какие сферы для вас сейчас самые приоритетные? Выберите 1–2.", hint: "Мультивыбор" },
];

let scores   = {};   // { health: 4, ... }
let importances = {}; // { health: 7, meaning: 9 }
let priorities  = []; // ["finance", "health"]
let step = 0;        // текущий вопрос 0..8
let overlay, box;

// ════════════════════════════════════════
//  ОТКРЫТЬ / ЗАКРЫТЬ
// ════════════════════════════════════════
export function openSurvey() {
  if (document.getElementById("survey-ov")) return;

  overlay = document.createElement("div");
  overlay.id = "survey-ov";
  overlay.className = "survey-ov";

  box = document.createElement("div");
  box.className = "survey-box";
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  // Загружаем сохранённые данные если есть
  getSurvey().then(arr => {
    const s = arr[0];
    if (s) {
      scores      = s.scores      || {};
      importances = s.importances || {};
      priorities  = s.priorities  || [];
    }
    renderStep();
  });
}

function closeSurvey() {
  document.getElementById("survey-ov")?.remove();
}

// ════════════════════════════════════════
//  РЕНДЕР ШАГА
// ════════════════════════════════════════
function renderStep() {
  if (step === 9) { renderResult(); return; }

  const q      = QUESTIONS[step];
  const sphere = SPHERES.find(s => s.id === q.id);
  const total  = QUESTIONS.length;
  const pct    = Math.round(step / total * 100);

  if (step < 6) {
    // Шаги 0–5: оценка сферы (1–10)
    const cur = scores[q.id] || 0;
    box.innerHTML = `
      <div class="sv-hd">
        <div class="sv-progress"><div class="sv-prog-fill" style="width:${pct}%"></div></div>
        <div class="sv-step">${step + 1} / ${total}</div>
      </div>
      <div class="sv-sphere-badge" style="background:${sphere.color}20;border-color:${sphere.color}40">
        <span class="sv-sphere-ico">${sphere.emoji}</span>
        <span class="sv-sphere-lbl" style="color:${sphere.color}">${sphere.label}</span>
      </div>
      <div class="sv-q">${q.text}</div>
      ${q.hint ? `<div class="sv-hint">${q.hint}</div>` : ""}
      <div class="sv-scale">
        ${[1,2,3,4,5,6,7,8,9,10].map(n => `
          <button class="sv-num ${cur === n ? "on" : ""}"
            style="${cur===n?`background:${sphere.color};border-color:${sphere.color};`:""}"
            onclick="window._svPick(${n})">${n}</button>`).join("")}
      </div>
      <div class="sv-scale-labels">
        <span>Плохо</span><span>Отлично</span>
      </div>
      <div class="sv-ft">
        ${step > 0 ? `<button class="sv-btn sv-btn-back" onclick="window._svBack()">← Назад</button>` : `<button class="sv-btn sv-btn-back" onclick="window._svClose()">Позже</button>`}
        <button class="sv-btn sv-btn-next ${cur===0?"disabled":""}" onclick="window._svNext()" ${cur===0?"disabled":""}>
          ${step === 5 ? "Далее →" : "Далее →"}
        </button>
      </div>`;

  } else if (step === 6 || step === 7) {
    // Шаги 6–7: важность здоровья и смысла
    const fieldId = step === 6 ? "pri_health_imp" : "pri_meaning_imp";
    const sphId   = step === 6 ? "health" : "meaning";
    const sph     = SPHERES.find(s => s.id === sphId);
    const cur     = importances[sphId] || 0;
    box.innerHTML = `
      <div class="sv-hd">
        <div class="sv-progress"><div class="sv-prog-fill" style="width:${pct}%"></div></div>
        <div class="sv-step">${step + 1} / ${total}</div>
      </div>
      <div class="sv-sphere-badge" style="background:${sph.color}20;border-color:${sph.color}40">
        <span class="sv-sphere-ico">${sph.emoji}</span>
        <span class="sv-sphere-lbl" style="color:${sph.color}">${sph.label}</span>
      </div>
      <div class="sv-q">${q.text}</div>
      <div class="sv-scale">
        ${[1,2,3,4,5,6,7,8,9,10].map(n => `
          <button class="sv-num ${cur===n?"on":""}"
            style="${cur===n?`background:${sph.color};border-color:${sph.color};`:""}"
            onclick="window._svPickImp('${sphId}',${n})">${n}</button>`).join("")}
      </div>
      <div class="sv-scale-labels">
        <span>Не важно</span><span>Критично</span>
      </div>
      <div class="sv-ft">
        <button class="sv-btn sv-btn-back" onclick="window._svBack()">← Назад</button>
        <button class="sv-btn sv-btn-next ${cur===0?"disabled":""}" onclick="window._svNext()" ${cur===0?"disabled":""}>Далее →</button>
      </div>`;

  } else if (step === 8) {
    // Шаг 8: выбор приоритетов (мультивыбор, макс 2)
    box.innerHTML = `
      <div class="sv-hd">
        <div class="sv-progress"><div class="sv-prog-fill" style="width:${pct}%"></div></div>
        <div class="sv-step">${step + 1} / ${total}</div>
      </div>
      <div class="sv-q">${q.text}</div>
      <div class="sv-hint">Выберите 1 или 2 сферы</div>
      <div class="sv-pri-grid">
        ${SPHERES.map(s => `
          <button class="sv-pri-btn ${priorities.includes(s.id)?"on":""}"
            style="${priorities.includes(s.id)?`background:${s.color};border-color:${s.color};color:#fff;`:""}"
            onclick="window._svTogglePri('${s.id}','${s.color}',this)">
            <span class="sv-pri-ico">${s.emoji}</span>
            <span>${s.label}</span>
          </button>`).join("")}
      </div>
      <div class="sv-ft">
        <button class="sv-btn sv-btn-back" onclick="window._svBack()">← Назад</button>
        <button class="sv-btn sv-btn-next ${priorities.length===0?"disabled":""}" id="sv-pri-next"
          onclick="window._svNext()" ${priorities.length===0?"disabled":""}>Готово →</button>
      </div>`;
  }
}

// ════════════════════════════════════════
//  РЕЗУЛЬТАТ — КОЛЕСО БАЛАНСА
// ════════════════════════════════════════
async function renderResult() {
  // Сохраняем
  const avg = Object.values(scores).reduce((a,b)=>a+b,0) / 6;
  await saveSurvey({
    scores, importances, priorities,
    avgSatisfaction: parseFloat(avg.toFixed(1)),
    date: dstr(new Date()),
  });

  // Строим SVG колесо
  const cx = 160, cy = 160, R = 130, n = 6;
  const sectors = SPHERES.map((s, i) => {
    const val   = scores[s.id] || 0;
    const r     = (val / 10) * R;
    const angle = (2 * Math.PI / n) * i - Math.PI / 2;
    return { ...s, val, r, angle };
  });

  // Строим полигон заполнения
  const fillPts = sectors.map(s =>
    `${cx + s.r * Math.cos(s.angle)},${cy + s.r * Math.sin(s.angle)}`
  ).join(" ");

  // Строим сетку (5 концентрических многоугольников)
  const gridLines = [2,4,6,8,10].map(lvl => {
    const pts = sectors.map(s => {
      const rr = (lvl / 10) * R;
      return `${cx + rr * Math.cos(s.angle)},${cy + rr * Math.sin(s.angle)}`;
    }).join(" ");
    return `<polygon points="${pts}" fill="none" stroke="rgba(123,79,30,.12)" stroke-width="1"/>`;
  }).join("");

  // Спицы
  const spokes = sectors.map(s =>
    `<line x1="${cx}" y1="${cy}" x2="${cx + R * Math.cos(s.angle)}" y2="${cy + R * Math.sin(s.angle)}"
      stroke="rgba(123,79,30,.15)" stroke-width="1"/>`
  ).join("");

  // Подписи
  const labels = sectors.map(s => {
    const lx = cx + (R + 22) * Math.cos(s.angle);
    const ly = cy + (R + 22) * Math.sin(s.angle);
    const isPri = priorities.includes(s.id);
    return `
      <text x="${lx}" y="${ly - 6}" text-anchor="middle" font-size="18">${s.emoji}</text>
      <text x="${lx}" y="${ly + 10}" text-anchor="middle" font-size="10"
        font-family="Cinzel,serif" font-weight="700"
        fill="${isPri ? s.color : "rgba(90,53,16,.6)"}">${s.val}/10</text>
      ${isPri ? `<circle cx="${lx}" cy="${ly + 18}" r="3" fill="${s.color}"/>` : ""}`;
  }).join("");

  // Средний балл
  const avgScore = parseFloat((Object.values(scores).reduce((a,b)=>a+b,0)/6).toFixed(1));
  const scoreColor = avgScore >= 7 ? "#4A8A4A" : avgScore >= 4 ? "#C8963E" : "#C04030";

  // Зоны рассогласования (приоритет высок, но оценка низкая)
  const gaps = SPHERES
    .filter(s => priorities.includes(s.id) && (scores[s.id] || 0) < 6)
    .map(s => `<span style="color:${s.color}">${s.emoji} ${s.label} (${scores[s.id]}/10)</span>`);

  box.innerHTML = `
    <div class="sv-hd">
      <div class="sv-progress"><div class="sv-prog-fill" style="width:100%"></div></div>
      <div class="sv-step">Готово!</div>
    </div>
    <div class="sv-result-ttl">Ваше Колесо баланса</div>

    <svg viewBox="0 0 320 320" class="sv-wheel">
      ${gridLines}
      ${spokes}
      <polygon points="${fillPts}"
        fill="rgba(200,150,62,.18)" stroke="#C8963E" stroke-width="2"
        stroke-linejoin="round"/>
      ${labels}
      <text x="${cx}" y="${cy - 6}" text-anchor="middle"
        font-family="Cinzel,serif" font-size="22" font-weight="800"
        fill="${scoreColor}">${avgScore}</text>
      <text x="${cx}" y="${cy + 12}" text-anchor="middle"
        font-family="Raleway,sans-serif" font-size="10"
        fill="rgba(90,53,16,.5)">из 10</text>
    </svg>

    <div class="sv-scores">
      ${SPHERES.map(s => {
        const v   = scores[s.id] || 0;
        const pct = v * 10;
        const col = v >= 7 ? "#4A8A4A" : v >= 4 ? "#C8963E" : "#C04030";
        const isPri = priorities.includes(s.id);
        return `
          <div class="sv-score-row">
            <span class="sv-score-ico">${s.emoji}</span>
            <span class="sv-score-lbl ${isPri?"sv-pri-mark":""}">${s.label}</span>
            <div class="sv-score-bar">
              <div class="sv-score-fill" style="width:${pct}%;background:${col}"></div>
            </div>
            <span class="sv-score-val" style="color:${col}">${v}</span>
          </div>`;
      }).join("")}
    </div>

    ${gaps.length ? `
      <div class="sv-gap-block">
        <div class="sv-gap-ttl">⚡ Зоны рассогласования</div>
        <div class="sv-gap-text">Вы выбрали приоритетными, но уровень пока низкий:</div>
        <div class="sv-gap-list">${gaps.join("")}</div>
        <div class="sv-gap-hint">ИИ-анализ учтёт это при составлении плана дня.</div>
      </div>` : ""}

    <div class="sv-ft" style="margin-top:16px">
      <button class="sv-btn sv-btn-back" onclick="window._svBack()">← Пересмотреть</button>
      <button class="sv-btn sv-btn-done" onclick="window._svDone()">Сохранить ✓</button>
    </div>`;
}

// ════════════════════════════════════════
//  WINDOW GLOBALS
// ════════════════════════════════════════
window.openSurvey   = openSurvey;
window._svClose     = closeSurvey;

window._svPick = n => {
  const q = QUESTIONS[step];
  scores[q.id] = n;
  renderStep(); // перерисовываем чтобы подсветить выбор
};

window._svPickImp = (sphId, n) => {
  importances[sphId] = n;
  renderStep();
};

window._svTogglePri = (id, color, btn) => {
  if (priorities.includes(id)) {
    priorities = priorities.filter(p => p !== id);
    btn.classList.remove("on");
    btn.style.background = "";
    btn.style.borderColor = "";
    btn.style.color = "";
  } else {
    if (priorities.length >= 2) return; // макс 2
    priorities.push(id);
    btn.classList.add("on");
    btn.style.background = color;
    btn.style.borderColor = color;
    btn.style.color = "#fff";
  }
  const nextBtn = document.getElementById("sv-pri-next");
  if (nextBtn) {
    nextBtn.disabled = priorities.length === 0;
    nextBtn.classList.toggle("disabled", priorities.length === 0);
  }
};

window._svNext = () => {
  // Валидация
  if (step < 6 && !scores[QUESTIONS[step].id]) return;
  if ((step === 6 || step === 7) && !importances[step === 6 ? "health" : "meaning"]) return;
  if (step === 8 && priorities.length === 0) return;
  step++;
  renderStep();
};

window._svBack = () => {
  if (step === 0) { closeSurvey(); return; }
  step--;
  renderStep();
};

window._svDone = async () => {
  const avg = Object.values(scores).reduce((a,b)=>a+b,0) / 6;
  await saveSurvey({
    scores, importances, priorities,
    avgSatisfaction: parseFloat(avg.toFixed(1)),
    date: dstr(new Date()),
  });
  closeSurvey();
  // Показываем тост
  window._toast?.("Анкета сохранена ✓ ИИ учтёт данные при анализе");
};

// Кнопка повторного прохождения анкеты (для sidebar/dashboard)
window.reopenSurvey = () => {
  step = 0;
  openSurvey();
};
