// ════════════════════════════════════════
//  TAB: ДНЕВНИК
//  js/tabs/diary.js
// ════════════════════════════════════════

import { registerTab, buildDayNav } from "../router.js";
import { getDiary, getTemplates, deleteTemplate, dstr, esc,
         getIdeas, getTasks, getGoals, getProjects, getSurvey,
         addGoal, addProject, addTask, updateGoal, deleteGoal,
         getDailyAudits, saveDailyAudit, getAuditForDate, calcAuthorRatio } from "../db.js";
import { buildDiaryModal, buildTemplateModal, buildAuditModal } from "../forms.js";

let diaryDate = new Date(); diaryDate.setHours(0,0,0,0);
let showAll   = false;
let diaryMode = "day";   // day | templates | all | search
let searchTag = "";       // текущий тег для поиска

export function initDiary() { registerTab("diary", renderDiary); }

// ════════════════════════════════════════
//  SIDEBAR
// ════════════════════════════════════════
function renderDiarySidebar(entries, templates) {
  const hasKey  = !!localStorage.getItem("lc-ai-key");
  const prof    = JSON.parse(localStorage.getItem("lc-ai-profile") || "{}");
  const lastAna = localStorage.getItem("lc-ai-life-last") || "";

  document.getElementById("sb-body").innerHTML = `
    <div class="sb-tiles-grid">
      <button class="sb-tile ${diaryMode==='templates'?'on':''}" onclick="window._diaryMode('templates')">
        <div class="sb-tile-ico">📄</div>
        <div class="sb-tile-lbl">Шаблоны</div>
        <div class="sb-tile-cnt">${templates.length}</div>
      </button>
      <button class="sb-tile sb-tile-accent" onclick="window.openNewModal('template',null,null,'diary')">
        <div class="sb-tile-ico">✦</div>
        <div class="sb-tile-lbl">Новый шаблон</div>
        <div class="sb-tile-cnt"></div>
      </button>
      <button class="sb-tile ${diaryMode==='all'?'on':''}" onclick="window._diaryMode('all')">
        <div class="sb-tile-ico">📚</div>
        <div class="sb-tile-lbl">Все записи</div>
        <div class="sb-tile-cnt">${entries.length}</div>
      </button>
      <button class="sb-tile ${diaryMode==='search'?'on':''}" onclick="window._diaryMode('search')">
        <div class="sb-tile-ico">🔍</div>
        <div class="sb-tile-lbl">Найти запись</div>
        <div class="sb-tile-cnt"></div>
      </button>
    </div>

    <!-- Life-Control AI Panel -->
    <div class="ai-panel lc-ai-panel">
      <div class="ai-panel-hd">
        <span class="ai-panel-ico">🌱</span>
        <span class="ai-panel-ttl">Life-Control AI</span>
        <button class="ai-cfg-toggle" onclick="window._lcAiToggleCfg()" title="Настройки">⚙</button>
      </div>
      <div class="lc-ai-desc">Наблюдает паттерны, анализирует состояние, помогает видеть причинно-следственные связи.</div>

      <!-- Настройки (скрыты если уже настроено) -->
      <div id="lc-ai-cfg" style="display:${hasKey ? 'none' : 'flex'};flex-direction:column;gap:8px;">
        <div class="ai-key-row">
          <input class="inp ai-key-inp" id="lc-key-inp" type="password"
            placeholder="ProxyAPI ключ (DeepSeek)"
            value="${localStorage.getItem('lc-ai-key') || ''}"/>
          <button class="ai-key-save" onclick="window._lcAiSaveKey()">OK</button>
        </div>
        <div class="ai-cfg-grid">
          <div class="ai-cfg-item">
            <label class="ai-cfg-lbl">Хронотип</label>
            <select class="sel ai-cfg-sel" id="lc-chron">
              <option value="lark" ${prof.chronotype==="lark"?'selected':''}>🌅 Жаворонок</option>
              <option value="owl"  ${prof.chronotype==="owl" ?'selected':''}>🦉 Сова</option>
            </select>
          </div>
          <div class="ai-cfg-item">
            <label class="ai-cfg-lbl">Возраст</label>
            <input class="inp ai-cfg-inp" id="lc-age" type="number" placeholder="30"
              value="${prof.age || ''}"/>
          </div>
        </div>
        <button class="ai-key-save" style="width:100%" onclick="window._lcAiSaveProfile()">Сохранить</button>
      </div>

      <div id="lc-ai-cfg-saved" style="display:${hasKey ? 'flex' : 'none'}" class="ai-key-saved-row">
        <span>🔑 ${prof.chronotype === "owl" ? "🦉 Сова" : "🌅 Жаворонок"}${prof.age ? " · "+prof.age+" лет" : ""}</span>
        <button class="ai-key-change" onclick="window._lcAiToggleCfg()">✎</button>
      </div>

      <!-- Режим анализа -->
      <div class="lc-ai-modes">
        <button class="lc-mode-btn active" id="lc-mode-daily"   onclick="window._lcSetMode('daily')">📅 День</button>
        <button class="lc-mode-btn"        id="lc-mode-weekly"  onclick="window._lcSetMode('weekly')">📆 Неделя</button>
        <button class="lc-mode-btn"        id="lc-mode-desires" onclick="window._lcSetMode('desires')">💫 Желания</button>
      </div>

      ${lastAna ? `<div class="lc-ai-last">Последний анализ: ${lastAna}</div>` : ""}

      <button class="ai-run-btn" id="lc-run-btn" onclick="window._lcAiAnalysis()">
        ◆ Запустить анализ
      </button>
      <div class="ai-result" id="lc-ai-result"></div>
    </div>`;
}

// ════════════════════════════════════════
//  ПРАВАЯ ЧАСТЬ
// ════════════════════════════════════════
function renderDiaryMain(entries, templates) {
  const body = document.getElementById("diary-body");

  if (diaryMode === "day") {
    // ── Обычный дневник с dayNav ──
    const datesWT = new Set(entries.map(x => x.date).filter(Boolean));
    body.innerHTML = `<div id="diary-dn"></div><div id="diary-list"></div>`;

    buildDayNav(diaryDate, datesWT, showAll, "diary-dn",
      d => { diaryDate = d; showAll = false; renderDiary(); },
      () => { showAll = !showAll; renderDiary(); }
    );

    const items = (showAll ? entries : entries.filter(x => x.date === dstr(diaryDate)))
      .sort((a,b) => (b.createdAt?.toDate?.() ?? 0) - (a.createdAt?.toDate?.() ?? 0));

    document.getElementById("diary-list").innerHTML = items.length
      ? items.map(x => diaryCard(x)).join("")
      : '<div class="empty"><div class="ei">📖</div><p>Записей нет — нажмите «+»</p></div>';

  } else if (diaryMode === "templates") {
    // ── Шаблоны ──
    body.innerHTML = `
      <div class="plan-section-label">ШАБЛОНЫ (${templates.length})</div>
      ${templates.length ? templates.map(t => `
        <div class="icard">
          <div class="ic-body" onclick="window._useTmpl('${t.id}')" style="cursor:pointer">
            <div class="ic-ttl">${esc(t.title)}</div>
            ${t.body ? `<div style="font-size:12px;color:var(--tx-m);margin-top:3px">${esc(t.body.slice(0,100))}${t.body.length>100?"…":""}</div>` : ""}
            <div class="ic-meta"><span class="ic-tag tag-goal">Нажмите чтобы использовать</span></div>
          </div>
          <div class="ic-acts">
            <button class="ib del" onclick="event.stopPropagation();window.delItem('templates','${t.id}')">🗑</button>
          </div>
        </div>`).join("")
      : '<div class="empty"><div class="ei">📄</div><p>Шаблонов нет</p></div>'}`;

  } else if (diaryMode === "all") {
    // ── Все записи ──
    const sorted = [...entries].sort((a,b) => (b.date||"") > (a.date||"") ? 1 : -1);
    body.innerHTML = `
      <div class="plan-section-label">ВСЕ ЗАПИСИ (${sorted.length})</div>
      ${sorted.length
        ? sorted.map(x => diaryCard(x)).join("")
        : '<div class="empty"><div class="ei">📚</div><p>Записей нет</p></div>'}`;

  } else if (diaryMode === "search") {
    // ── Собираем все уникальные теги из записей ──
    const allTags = [...new Set(
      entries.flatMap(x => Array.isArray(x.tags) ? x.tags : [])
    )].sort();

    const matches = searchTag.trim()
      ? entries.filter(x =>
          (x.title  || "").toLowerCase().includes(searchTag.toLowerCase()) ||
          (x.text   || "").toLowerCase().includes(searchTag.toLowerCase()) ||
          (x.mood   || "").toLowerCase().includes(searchTag.toLowerCase()) ||
          (Array.isArray(x.tags) && x.tags.some(t => t.toLowerCase().includes(searchTag.toLowerCase()))))
        .sort((a,b) => (b.date||"") > (a.date||"") ? 1 : -1)
      : [];

    body.innerHTML = `
      <div class="diary-search-wrap">
        <input class="inp" id="diary-search-inp"
          placeholder="Введите слово, фразу или тег..."
          value="${esc(searchTag)}"/>
        <button class="dn-cal-btn" id="diary-search-btn">🔍</button>
      </div>
      ${allTags.length ? `
        <div class="diary-tags-cloud">
          <div class="diary-tags-cloud-lbl">Теги</div>
          <div class="diary-tags-cloud-wrap">
            ${allTags.map(t => `
              <button class="diary-cloud-tag ${searchTag===t?"active":""}"
                onclick="window._diarySearchTag('${esc(t)}')">#${esc(t)}</button>`).join("")}
          </div>
        </div>` : ""}
      <div id="diary-search-results">
        ${searchTag.trim()
          ? (matches.length
              ? `<div class="sec-lbl" style="margin:10px 0 8px">Найдено: ${matches.length}</div>
                 ${matches.map(x => diaryCard(x)).join("")}`
              : '<div class="empty"><div class="ei">🔍</div><p>Ничего не найдено</p></div>')
          : '<div class="empty"><div class="ei">🔍</div><p>Введите запрос или выберите тег</p></div>'}
      </div>`;

    const inp = document.getElementById("diary-search-inp");
    const btn = document.getElementById("diary-search-btn");
    const doSearch = () => { searchTag = inp.value; renderDiaryMain(entries, templates); };
    btn.onclick = doSearch;
    inp.addEventListener("keydown", e => { if (e.key === "Enter") doSearch(); });
    setTimeout(() => inp?.focus(), 50);
  }

  // FAB — только в режиме day
  if (diaryMode === "day") {
    body.insertAdjacentHTML("beforeend",
      `<button class="fab" onclick="window.openNewModal('diary',null,null,'diary','${dstr(diaryDate)}')">+</button>`);
  } else {
    body.insertAdjacentHTML("beforeend",
      `<button class="fab" onclick="window.openNewModal('diary',null,null,'diary')">+</button>`);
  }
}

// ── Карточка записи дневника ──
function diaryCard(x) {
  const moodIcon = x.mood ? `<span class="ic-tag" style="background:rgba(200,150,62,.1)">${x.mood.split(" ")[0]}</span>` : "";
  const tagsHtml = Array.isArray(x.tags) && x.tags.length
    ? x.tags.map(t => `<span class="ic-tag ic-tag-diary-tag">#${esc(t)}</span>`).join("")
    : "";
  return `
    <div class="icard" onclick="window.editDiary('${x.id}')">
      <div class="ic-body">
        <div class="ic-ttl">${esc(x.title || "Без заголовка")}</div>
        ${x.intention ? `<div class="diary-intention">↳ ${esc(x.intention)}</div>` : ""}
        ${x.text ? `<div style="font-size:12px;color:var(--tx-m);margin-top:4px">${esc(x.text.slice(0,130))}${x.text.length>130?"…":""}</div>` : ""}
        <div class="ic-meta">
          <span class="ic-tag tag-dl">${x.date || ""} ${x.time || ""}</span>
          ${moodIcon}
          ${tagsHtml}
        </div>
      </div>
      <div class="ic-acts">
        <button class="ib del" onclick="event.stopPropagation();window.delItem('diary','${x.id}')">🗑</button>
      </div>
    </div>`;
}

// ════════════════════════════════════════
//  MAIN RENDER
// ════════════════════════════════════════
export async function renderDiary() {
  document.getElementById("tb-ttl").textContent = "Журнал";
  const [entries, templates] = await Promise.all([getDiary(), getTemplates()]);
  renderDiarySidebar(entries, templates);
  renderDiaryMain(entries, templates);
}

// ── Глобальные хэндлеры ──
window._diaryMode = async mode => {
  diaryMode = mode;
  if (mode !== "search") searchTag = "";
  const [entries, templates] = await Promise.all([getDiary(), getTemplates()]);
  renderDiarySidebar(entries, templates);
  renderDiaryMain(entries, templates);
};

// Клик по тегу в облаке — сразу ищем
window._diarySearchTag = async tag => {
  searchTag = tag;
  const [entries, templates] = await Promise.all([getDiary(), getTemplates()]);
  renderDiaryMain(entries, templates);
};

window._useTmpl = async id => {
  const all = await getTemplates();
  const t   = all.find(x => x.id === id);
  if (!t) return;
  buildDiaryModal("Новая запись в дневник", t, dstr(diaryDate));
};

// ════════════════════════════════════════
//  LIFE-CONTROL AI
//  DeepSeek через ProxyAPI
//  Анализ дневника, целей, желаний, энергии
// ════════════════════════════════════════

let lcAiMode = "daily"; // daily | weekly | desires

// ── Утилиты ──
function lcEsc(s) {
  return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// ── Тогл настроек ──
window._lcAiToggleCfg = () => {
  const cfg   = document.getElementById("lc-ai-cfg");
  const saved = document.getElementById("lc-ai-cfg-saved");
  if (!cfg) return;
  const open = cfg.style.display !== "none";
  cfg.style.display   = open ? "none" : "flex";
  if (saved) saved.style.display = open ? "flex" : "none";
};

// ── Сохранение ключа ──
window._lcAiSaveKey = () => {
  const val = document.getElementById("lc-key-inp")?.value.trim();
  if (val) localStorage.setItem("lc-ai-key", val);
};

// ── Сохранение профиля ──
window._lcAiSaveProfile = () => {
  const key = document.getElementById("lc-key-inp")?.value.trim();
  if (key) localStorage.setItem("lc-ai-key", key);
  const prof = JSON.parse(localStorage.getItem("lc-ai-profile") || "{}");
  prof.chronotype = document.getElementById("lc-chron")?.value || "lark";
  prof.age        = parseInt(document.getElementById("lc-age")?.value) || null;
  localStorage.setItem("lc-ai-profile", JSON.stringify(prof));
  const cfg   = document.getElementById("lc-ai-cfg");
  const saved = document.getElementById("lc-ai-cfg-saved");
  if (cfg)   cfg.style.display   = "none";
  if (saved) {
    saved.style.display = "flex";
    saved.innerHTML = `<span>${prof.chronotype === "owl" ? "🦉 Сова" : "🌅 Жаворонок"}${prof.age ? " · "+prof.age+" лет" : ""}</span><button class="ai-key-change" onclick="window._lcAiToggleCfg()">✎</button>`;
  }
};

// ── Выбор режима ──
window._lcSetMode = mode => {
  lcAiMode = mode;
  ["daily","weekly","desires"].forEach(m => {
    const btn = document.getElementById("lc-mode-" + m);
    if (btn) btn.classList.toggle("active", m === mode);
  });
};

// ── DeepSeek вызов ──
async function lcAskDeepSeek(systemPrompt, userMessage) {
  const key = localStorage.getItem("lc-ai-key");
  if (!key) throw new Error("API ключ не задан. Введите ключ в настройках.");

  const resp = await fetch("https://api.proxyapi.ru/openrouter/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + key,
    },
    body: JSON.stringify({
      model: "deepseek/deepseek-chat",
      max_tokens: 1200,
      temperature: 0.7,
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

// ── Рендер ответа ──
function renderLcResponse(text, resultDiv) {
  let parsed = null;
  try {
    const cleaned = text.replace(/```json\s*/gi,"").replace(/```\s*/g,"").trim();
    parsed = JSON.parse(cleaned);
  } catch(_) {}

  if (parsed) {
    let html = "";

    // ── ПРЕДЛАГАЕМЫЕ ЦЕЛИ (главный блок) ──
    if (parsed.suggested_goals?.length) {
      const sphereLabel = {
        health:"💪 Здоровье", relations:"❤️ Отношения", work:"💼 Работа",
        finance:"💰 Финансы", rest:"🎨 Отдых", meaning:"🌱 Смысл",
      };
      const priColor = { high:"var(--red)", medium:"var(--go-d)", low:"var(--grn)" };
      const actionBadge = {
        add:     `<span class="lc-gs-badge add">+ Новая</span>`,
        keep:    `<span class="lc-gs-badge keep">✓ Оставить</span>`,
        remove:  `<span class="lc-gs-badge remove">✕ Убрать</span>`,
        rephrase:`<span class="lc-gs-badge rephrase">✎ Обновить</span>`,
      };

      // Сохраняем данные для применения
      window._lcSuggestedGoals = parsed.suggested_goals;

      html += `<div class="ai-block lc-goals-suggest">
        <div class="ai-block-ttl">🎯 Предлагаемые цели для Mind Map</div>
        <div class="lc-goals-suggest-sub">На основе анализа твоего поведения и записей</div>

        ${parsed.suggested_goals.map((g, i) => {
          const title  = lcEsc(g.title || "");
          const desc   = lcEsc(g.desc  || "");
          const why    = lcEsc(g.why   || "");
          const sph    = sphereLabel[g.sphere] || g.sphere || "";
          const pri    = priColor[g.priority] || "var(--tx-l)";
          const act    = g.action || "add";
          const badge  = actionBadge[act] || actionBadge.add;
          const isRemove = act === "remove";

          // Проекты внутри цели
          const projectsHtml = (g.projects || []).map(p => {
            const tasksHtml = (p.tasks || []).map(t =>
              `<div class="lc-gs-task">
                <span class="lc-gs-task-dot">·</span>
                ${lcEsc(t.title)}
                ${t.priority === "high" ? `<span class="lc-gs-task-pri">!</span>` : ""}
              </div>`
            ).join("");
            return `<div class="lc-gs-project">
              <div class="lc-gs-proj-name">📁 ${lcEsc(p.name)}</div>
              ${p.desc ? `<div class="lc-gs-proj-desc">${lcEsc(p.desc)}</div>` : ""}
              ${tasksHtml ? `<div class="lc-gs-tasks">${tasksHtml}</div>` : ""}
            </div>`;
          }).join("");

          return `
            <div class="lc-goal-suggest-row ${isRemove?"remove":""}" id="lc-gsr-${i}">
              <div class="lc-gs-body">
                <div class="lc-gs-header">
                  <div class="lc-gs-title">${title}</div>
                  ${badge}
                </div>
                ${desc ? `<div class="lc-gs-desc">${desc}</div>` : ""}
                ${why  ? `<div class="lc-gs-why">💬 ${why}</div>` : ""}
                <div class="lc-gs-meta">
                  ${sph ? `<span class="lc-gs-chip">${sph}</span>` : ""}
                  <span class="lc-gs-chip" style="color:${pri}">${g.priority || ""}</span>
                </div>
                ${projectsHtml ? `<div class="lc-gs-projects">${projectsHtml}</div>` : ""}
              </div>
              <div class="lc-gs-actions">
                ${!isRemove
                  ? `<button class="lc-gs-btn add" id="lc-gsb-${i}"
                      onclick="window._lcAddGoalFull(${i})">+ В цели</button>`
                  : `<button class="lc-gs-btn remove"
                      onclick="window._lcRemoveGoal(${JSON.stringify(g.original_title||title)})">Убрать</button>`
                }
              </div>
            </div>`;
        }).join("")}

        <div class="lc-gs-apply-section">
          <div class="lc-gs-apply-ttl">Применить всё сразу:</div>
          <div class="lc-gs-apply-btns">
            <button class="lc-gs-apply-btn replace"
              onclick="window._lcApplyAllGoals('replace')">
              🔄 Заменить все цели
            </button>
            <button class="lc-gs-apply-btn add"
              onclick="window._lcApplyAllGoals('add')">
              + Добавить к текущим
            </button>
          </div>
        </div>
      </div>`;
    }

    // Состояние энергии
    if (parsed.energy_state) {
      const stateMap = {
        recovery:     { icon:"🔋", label:"Восстановление",  color:"var(--blu)" },
        stable:       { icon:"✅", label:"Стабильно",        color:"var(--grn)" },
        growth:       { icon:"🚀", label:"Рост",             color:"var(--go)"  },
        burnout_risk: { icon:"🔥", label:"Риск выгорания",   color:"var(--red)" },
      };
      const s = stateMap[parsed.energy_state] || { icon:"💡", label: parsed.energy_state, color:"var(--tx)" };
      const bp = parsed.burnout_probability != null ? parsed.burnout_probability : null;
      html += `<div class="ai-block lc-energy-block" style="border-left:3px solid ${s.color}">
        <div class="ai-block-ttl">⚡ Энергетическое состояние</div>
        <div class="lc-energy-state" style="color:${s.color}">${s.icon} ${lcEsc(s.label)}</div>
        ${bp != null ? `<div class="lc-burnout-bar"><div class="lc-burnout-fill" style="width:${bp*100}%;background:${bp>0.6?"var(--red)":bp>0.3?"var(--go)":"var(--grn)"}"></div></div>
        <div class="lc-burnout-lbl">Риск выгорания: ${Math.round(bp*100)}%</div>` : ""}
        ${parsed.main_energy_sources?.length ? `<div class="lc-list-pos">
          <div class="ai-block-ttl" style="margin-top:4px">Даёт энергию</div>
          ${parsed.main_energy_sources.map(s=>`<div class="lc-list-item pos">+ ${lcEsc(s)}</div>`).join("")}
        </div>` : ""}
        ${parsed.main_energy_drains?.length ? `<div class="lc-list-neg">
          <div class="ai-block-ttl" style="margin-top:4px">Забирает энергию</div>
          ${parsed.main_energy_drains.map(s=>`<div class="lc-list-item neg">− ${lcEsc(s)}</div>`).join("")}
        </div>` : ""}
        ${parsed.recommended_recovery_actions?.length ? `<div class="ai-block-ttl" style="margin-top:6px">Рекомендации</div>
          ${parsed.recommended_recovery_actions.map(a=>`<div class="lc-list-item">▸ ${lcEsc(a)}</div>`).join("")}` : ""}
      </div>`;
    }

    // Выравнивание целей
    if (parsed.aligned_goals?.length || parsed.misaligned_goals?.length || parsed.possible_external_goals?.length) {
      html += `<div class="ai-block">
        <div class="ai-block-ttl">🎯 Выравнивание целей</div>
        ${parsed.aligned_goals?.length ? `<div class="lc-goals-group">
          <div class="lc-goals-lbl grn">✓ Твои цели</div>
          ${parsed.aligned_goals.map(g=>`<div class="lc-goal-item grn">${lcEsc(typeof g==="string"?g:g.title||g.id||"")}</div>`).join("")}
        </div>` : ""}
        ${parsed.misaligned_goals?.length ? `<div class="lc-goals-group">
          <div class="lc-goals-lbl ora">⚡ Рассогласование</div>
          ${parsed.misaligned_goals.map(g=>`<div class="lc-goal-item ora">${lcEsc(typeof g==="string"?g:g.title||g.id||"")}</div>`).join("")}
        </div>` : ""}
        ${parsed.possible_external_goals?.length ? `<div class="lc-goals-group">
          <div class="lc-goals-lbl red">⚠ Возможно чужие</div>
          ${parsed.possible_external_goals.map(g=>`<div class="lc-goal-item red">${lcEsc(typeof g==="string"?g:g.title||g.id||"")}</div>`).join("")}
        </div>` : ""}
        ${parsed.emerging_real_goals?.length ? `<div class="lc-goals-group">
          <div class="lc-goals-lbl blu">💫 Проявляющиеся желания</div>
          ${parsed.emerging_real_goals.map(g=>`<div class="lc-goal-item blu">${lcEsc(typeof g==="string"?g:g.title||g.id||"")}</div>`).join("")}
        </div>` : ""}
      </div>`;
    }

    // Желания и паттерны
    if (parsed.detected_desires?.length || parsed.repeating_patterns?.length) {
      html += `<div class="ai-block" style="border-left:3px solid var(--go)">
        <div class="ai-block-ttl">💫 Желания и паттерны</div>
        ${parsed.detected_desires?.length ? `<div class="ai-block-ttl" style="margin-top:4px">Обнаружены желания</div>
          ${parsed.detected_desires.map(d=>`<div class="lc-list-item pos">✦ ${lcEsc(d)}</div>`).join("")}` : ""}
        ${parsed.repeating_patterns?.length ? `<div class="ai-block-ttl" style="margin-top:6px">Повторяющиеся паттерны</div>
          ${parsed.repeating_patterns.map(p=>`<div class="lc-list-item">↻ ${lcEsc(p)}</div>`).join("")}` : ""}
        ${parsed.suppressed_interests?.length ? `<div class="ai-block-ttl" style="margin-top:6px">Подавленные интересы</div>
          ${parsed.suppressed_interests.map(i=>`<div class="lc-list-item ora">◉ ${lcEsc(i)}</div>`).join("")}` : ""}
      </div>`;
    }

    // Недельный отчёт
    if (parsed.weekly_summary) {
      const ws = parsed.weekly_summary;
      html += `<div class="ai-block">
        <div class="ai-block-ttl">📆 Недельная динамика</div>
        ${ws.energy_trend ? `<div class="lc-list-item">⚡ ${lcEsc(ws.energy_trend)}</div>` : ""}
        ${ws.main_positive_pattern ? `<div class="lc-list-item pos">+ ${lcEsc(ws.main_positive_pattern)}</div>` : ""}
        ${ws.main_problem_pattern ? `<div class="lc-list-item neg">− ${lcEsc(ws.main_problem_pattern)}</div>` : ""}
      </div>`;
    }

    // Вопросы для рефлексии
    const questions = parsed.reflection_questions || parsed.questions_for_user || [];
    if (questions.length) {
      html += `<div class="ai-block lc-questions">
        <div class="ai-block-ttl">🪞 Вопросы для размышления</div>
        ${questions.map(q=>`<div class="lc-question">${lcEsc(q)}</div>`).join("")}
      </div>`;
    }

    // Mind map предложения
    if (parsed.mind_map_suggestions?.length) {
      html += `<div class="ai-block">
        <div class="ai-block-ttl">🗺 Обновить Mind Map</div>
        ${parsed.mind_map_suggestions.map(s=>`<div class="lc-list-item">▸ ${lcEsc(typeof s==="string"?s:s.suggestion||s.message||"")}</div>`).join("")}
      </div>`;
    }

    // Микроэксперимент
    if (parsed.micro_experiment) {
      html += `<div class="ai-block" style="border-left:3px solid var(--go)">
        <div class="ai-block-ttl">🧪 Микроэксперимент</div>
        <div class="lc-list-item">${lcEsc(typeof parsed.micro_experiment==="string"?parsed.micro_experiment:parsed.micro_experiment.description||"")}</div>
      </div>`;
    }

    // Основной совет (если нет структурированных блоков — показываем как текст)
    if (parsed.advice || parsed.daily_plan) {
      const txt = parsed.advice || (Array.isArray(parsed.daily_plan) ? parsed.daily_plan.join("\n") : "");
      if (txt) html += `<div class="ai-block ai-advice"><div class="ai-block-ttl">💡 Совет</div>
        <div class="ai-advice-text">${lcEsc(txt).replace(/\n/g,"<br>")}</div></div>`;
    }

    if (!html) {
      html = `<div class="ai-advice-text">${text.replace(/\n/g,"<br>")}</div>`;
    }

    resultDiv.innerHTML = html +
      `<div class="ai-result-meta">DeepSeek Life-Control AI · ${new Date().toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}</div>`;

  } else {
    // Текстовый ответ
    resultDiv.innerHTML = `<div class="ai-advice-text">${text.replace(/\*\*(.*?)\*\*/g,"<b>$1</b>").replace(/\n/g,"<br>")}</div>
      <div class="ai-result-meta">DeepSeek Life-Control AI · ${new Date().toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}</div>`;
  }
}

// ── ГЛАВНАЯ ФУНКЦИЯ ──
window._lcAiAnalysis = async () => {
  const key = localStorage.getItem("lc-ai-key");
  const resultDiv = document.getElementById("lc-ai-result");
  const btn       = document.getElementById("lc-run-btn");
  if (!resultDiv) return;

  if (!key) {
    resultDiv.innerHTML = `<div class="ai-result-warn">⚠ Введите ProxyAPI ключ в настройках выше</div>`;
    window._lcAiToggleCfg();
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = "⏳ Анализирую..."; }
  resultDiv.innerHTML = `<div class="ai-result-loading">Анализирую ваш контекст…</div>`;

  try {
    const [diary, ideas, tasks, goals, projects, surveys] = await Promise.all([
      getDiary(), getIdeas(), getTasks(), getGoals(), getProjects(), getSurvey()
    ]);
    const prof   = JSON.parse(localStorage.getItem("lc-ai-profile") || "{}");
    const today2 = dstr(new Date());

    // ── Дневник за 14 дней ──
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 14);
    const recentDiary = diary
      .filter(e => e.date && new Date(e.date) >= cutoff)
      .sort((a,b) => (b.date||"") > (a.date||"") ? 1 : -1)
      .slice(0, 20);

    // ── Идеи за 30 дней ──
    const recentIdeas = ideas
      .filter(i => !i.date || new Date(i.date) >= new Date(Date.now() - 30*864e5))
      .slice(0, 15);

    // ── Данные анкеты (колесо баланса) ──
    const survey = surveys[0] || null;
    const wheelData = survey ? {
      scores:          survey.scores || {},
      priorities:      survey.priorities || [],
      avg_satisfaction: survey.avgSatisfaction || null,
      survey_date:     survey.date || null,
      low_spheres: Object.entries(survey.scores || {})
        .filter(([,v]) => v <= 4).map(([k,v]) => `${k}:${v}`),
      priority_gaps: (survey.priorities || [])
        .filter(id => (survey.scores?.[id] || 10) < 6)
        .map(id => `${id}(${survey.scores?.[id] || 0}/10)`),
    } : null;

    // ── История энергии по задачам за 14 дней ──
    const cutoff14 = new Date(); cutoff14.setDate(cutoff14.getDate() - 14);
    const scoredTasks = tasks.filter(t =>
      t.done && t.energyScore && t.completedDate &&
      new Date(t.completedDate) >= cutoff14
    );
    const energyByTask = scoredTasks.map(t => ({
      title: t.title,
      score: t.energyScore,
      date:  t.completedDate,
    }));
    const avgEnergy = scoredTasks.length
      ? parseFloat((scoredTasks.reduce((s,t) => s + t.energyScore, 0) / scoredTasks.length).toFixed(1))
      : null;
    const topVampires  = energyByTask.filter(t => t.score <= 2).slice(0, 5);
    const topChargers  = energyByTask.filter(t => t.score >= 4).slice(0, 5);

    // ── Статистика задач ──
    const doneTasks  = tasks.filter(t => t.done);
    const openTasks  = tasks.filter(t => !t.done);
    const missionKw  = ["стратег","продаж","создат","разработ","подготов","систем","запуст","развит","важн","цел"];
    const noiseKw    = ["почт","уведом","правк","созвон","рутин","купит","убрат"];
    const missionDone = doneTasks.filter(t => missionKw.some(k => (t.title||"").toLowerCase().includes(k)));
    const noiseDone   = doneTasks.filter(t => noiseKw.some(k => (t.title||"").toLowerCase().includes(k)));

    // ── Настроение из дневника ──
    const moodMap = { "😊 Отлично":5,"🙂 Хорошо":4,"😐 Нейтрально":3,"😔 Плохо":2,"😢 Тяжело":1,"😫 Плохо":1 };
    const moodScores = recentDiary.filter(e=>e.mood).map(e=>moodMap[e.mood]||3);
    const avgMood = moodScores.length ? parseFloat((moodScores.reduce((a,b)=>a+b,0)/moodScores.length).toFixed(1)) : null;

    // ── Теги ──
    const tagFreq = {};
    diary.flatMap(e=>e.tags||[]).forEach(t => { tagFreq[t] = (tagFreq[t]||0)+1; });
    const topTags = Object.entries(tagFreq).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([t,c])=>`${t}(${c})`);

    // ── Финальный JSON ──
    const inputData = {
      user_profile: {
        chronotype:          prof.chronotype || "lark",
        best_hours:          prof.best_hours || "09:00-11:30",
        focus_limit_minutes: prof.focus_limit_minutes || 90,
      },
      wheel_of_life: wheelData,
      energy_history: {
        avg_energy_14d:  avgEnergy,
        vampire_tasks:   topVampires,
        charging_tasks:  topChargers,
        scored_count:    scoredTasks.length,
      },
      context: {
        date:            today2,
        avg_mood_14d:    avgMood,
        mode:            lcAiMode,
      },
      goals: goals.map(g => ({
        id: g.id, title: g.title, done: !!g.done,
        priority: g.priority || "medium", desc: g.desc || "",
      })),
      projects: projects.map(p => ({
        id: p.id, title: p.name, goal_id: p.goalId || null, done: !!p.done,
      })),
      behavior_stats: {
        total_done:    doneTasks.length,
        mission_done:  missionDone.length,
        noise_done:    noiseDone.length,
        open_tasks:    openTasks.length,
        mission_ratio: doneTasks.length > 0
          ? parseFloat((missionDone.length / doneTasks.length).toFixed(2)) : 0,
      },
      diary_entries: recentDiary.map(e => ({
        date: e.date, title: e.title,
        text: (e.text||"").slice(0, 300),
        mood: e.mood || null, tags: e.tags || [],
      })),
      ideas: recentIdeas.map(i => ({
        title: i.title, text: (i.text||"").slice(0, 200), date: i.date,
      })),
      frequent_tags: topTags,
    };

    // ── Промпты по режимам (улучшенные) ──
    let userRequest = "";
    if (lcAiMode === "daily") {
      userRequest = `Выполни DAILY CONTEXT ANALYSIS.

ВАЖНАЯ ИЕРАРХИЯ (строго соблюдай):
- ЦЕЛЬ (goal) — крупное жизненное направление на 3-12 месяцев. Пример: "Выйти на стабильный доход от недвижимости", "Восстановить здоровье и энергию". НЕ путай с задачами.
- ПРОЕКТ (project) — конкретный результат внутри цели, занимает 2-8 недель. Пример: "Получить лицензию агента", "Пройти курс по сделкам". Привязан к цели.
- ЗАДАЧА (task) — конкретное действие, выполняется за 15-120 минут. Пример: "Позвонить в агентство", "Посмотреть вебинар". Привязана к проекту или цели.

Верни JSON:
{
  "energy_state": "recovery|stable|growth|burnout_risk",
  "burnout_probability": 0.0-1.0,
  "main_energy_sources": ["строка"],
  "main_energy_drains": ["строка"],
  "recommended_recovery_actions": ["действие 5-15 мин"],
  "aligned_goals": ["существующие цели подтверждённые поведением"],
  "misaligned_goals": ["цели без реальных действий"],
  "possible_external_goals": ["цели навязанные извне"],
  "suggested_goals": [
    {
      "title": "Глагол + результат, 4-8 слов. Это ЦЕЛЬ — крупное направление",
      "desc": "Зачем эта цель важна для пользователя — 2-3 предложения на основе его данных",
      "why": "Почему истинная — ссылка на конкретные данные из дневника/идей/поведения",
      "sphere": "health|relations|work|finance|rest|meaning",
      "priority": "high|medium|low",
      "source": "aligned|emerging|desire",
      "action": "add|keep|remove|rephrase",
      "original_title": "название существующей цели если это переформулировка или null",
      "projects": [
        {
          "name": "Конкретный результат за 2-8 недель",
          "desc": "Что именно нужно сделать",
          "tasks": [
            { "title": "Конкретное действие 15-60 мин", "priority": "high|med|low" }
          ]
        }
      ]
    }
  ],
  "detected_desires": ["строка"],
  "reflection_questions": ["вопрос"],
  "advice": "2-3 предложения"
}

ПРАВИЛА suggested_goals:
- Максимум 3-4 цели
- Каждая цель — НАПРАВЛЕНИЕ (не задача и не проект)
- projects внутри цели — 1-3 штуки, конкретные результаты
- tasks внутри проекта — 2-5 штук, конкретные действия
- Включай только цели подтверждённые поведением или сильным интересом
- НЕ включай possible_external_goals в suggested_goals

Верни ТОЛЬКО JSON без markdown.`;

    } else if (lcAiMode === "weekly") {
      userRequest = `Выполни WEEKLY REFLECTION.

ИЕРАРХИЯ (строго соблюдай):
- ЦЕЛЬ — направление на 3-12 месяцев ("Выйти на стабильный доход")
- ПРОЕКТ — конкретный результат за 2-8 недель внутри цели
- ЗАДАЧА — действие за 15-120 минут

Верни JSON:
{
  "energy_trend": "динамика энергии за неделю",
  "weekly_summary": { "main_positive_pattern": "", "main_problem_pattern": "", "energy_score": 0-10 },
  "real_goals_detected": ["цели подтверждённые действиями"],
  "possible_false_goals": ["цели без действий"],
  "suggested_goals": [
    {
      "title": "Направление на 3-12 месяцев",
      "desc": "Почему важна — 2-3 предложения",
      "why": "На основе каких данных",
      "sphere": "health|relations|work|finance|rest|meaning",
      "priority": "high|medium|low",
      "source": "aligned|emerging|desire",
      "action": "add|keep|remove|rephrase",
      "original_title": "название существующей или null",
      "projects": [
        { "name": "Результат за 2-8 недель", "desc": "", "tasks": [{ "title": "Действие 15-60 мин", "priority": "high|med|low" }] }
      ]
    }
  ],
  "wheel_progress": "изменение колеса баланса",
  "mind_map_suggestions": ["строка"],
  "energy_state": "recovery|stable|growth|burnout_risk",
  "burnout_probability": 0.0-1.0,
  "top_vampire": "задача с низкой энергией — что делать",
  "top_charger": "задача с высокой энергией — как усилить",
  "reflection_questions": ["вопрос"]
}

Верни ТОЛЬКО JSON без markdown.`;

    } else {
      userRequest = `Выполни DESIRE EXTRACTION — глубокий анализ желаний и истинной мотивации.
Особое внимание: сравни wheel_of_life.priority_gaps с реальными действиями — где самые большие расхождения?

Верни JSON:
{
  "detected_desires": ["явные желания из идей и дневника"],
  "repeating_patterns": ["темы которые повторяются"],
  "suppressed_interests": ["о чём думает но не делает"],
  "energy_positive_topics": ["что даёт энергию по всем источникам"],
  "energy_negative_topics": ["что забирает энергию"],
  "emerging_real_goals": ["потенциальные новые направления на основе паттернов"],
  "wheel_gaps_analysis": "анализ расхождений между приоритетами и реальными действиями",
  "reflection_questions": ["3 глубоких вопроса для исследования желаний"],
  "micro_experiment": "один конкретный эксперимент 5-10 мин для проверки истинного интереса"
}

Верни ТОЛЬКО JSON без markdown.`;
    }

    const systemPrompt = `Ты — AI-система осознанной эффективности и жизненной навигации Life-Control.

ФИЛОСОФИЯ:
- Energy First: энергия — главный KPI. Высокая эффективность без энергии = путь к выгоранию
- Alignment Over Discipline: если цель постоянно избегается — возможно она чужая или сформулирована не так
- Real Behavior > Declared Goals: смотри на что человек тратит время и что даёт ему энергию — это и есть истинные приоритеты
- Wheel of Life: учитывай данные колеса баланса — сферы с низкими оценками требуют внимания
- Energy Tracking: используй energyScore задач — они показывают что реально вымотывает и что заряжает

ТЫ АНАЛИЗИРУЕШЬ: дневник (что чувствует, о чём думает), идеи (что привлекает внимание), задачи с оценкой энергии, колесо баланса, паттерны поведения.

ТОН: спокойный, поддерживающий, как внимательный аналитик. Не мотиватор. Не давишь. Помогаешь понять.
Отвечай только на русском. Верни ТОЛЬКО валидный JSON.`;

    const text = await lcAskDeepSeek(systemPrompt, userRequest + "\n\nДанные пользователя:\n" + JSON.stringify(inputData, null, 2));

    // Сохраняем время последнего анализа
    const timeStr = new Date().toLocaleString("ru-RU", {day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
    localStorage.setItem("lc-ai-life-last", timeStr);
    const lastEl = document.querySelector(".lc-ai-last");
    if (lastEl) lastEl.textContent = `Последний анализ: ${timeStr}`;

    renderLcResponse(text, resultDiv);

  } catch(err) {
    resultDiv.innerHTML = `<div class="ai-result-error">⚠ ${err.message}</div>`;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "◆ Запустить анализ"; }
  }
};

// ════════════════════════════════════════
//  ДЕЙСТВИЯ С ПРЕДЛАГАЕМЫМИ ЦЕЛЯМИ
// ════════════════════════════════════════

// Создаём одну цель со всеми проектами и задачами внутри
async function createGoalFull(g) {
  // 1. Создаём цель
  const goalRef = await addGoal({
    title:    g.title,
    desc:     g.desc || g.why || "",
    priority: g.priority || "medium",
    done:     false,
    fromAi:   true,
    aiSphere: g.sphere || null,
  });
  const goalId = goalRef.id;

  // 2. Создаём проекты внутри цели
  for (const p of (g.projects || [])) {
    const projRef = await addProject({
      name:   p.name,
      desc:   p.desc || "",
      goalId: goalId,
      done:   false,
      fromAi: true,
    });
    const projId = projRef.id;

    // 3. Создаём задачи внутри проекта
    for (const t of (p.tasks || [])) {
      await addTask({
        title:    t.title,
        note:     "",
        goalId:   goalId,
        projId:   projId,
        priority: t.priority || "med",
        date:     dstr(new Date()),
        done:     false,
        fromAi:   true,
      });
    }
  }
  return goalId;
}

// Тихое обновление — только вкладка Цели, дневник не трогаем
async function _refreshGoalsSilent() {
  try {
    const { renderGoals } = await import("./tabs/goals.js");
    await renderGoals?.();
  } catch(_) {}
}

// Кнопка «+ В цели» на одной цели
window._lcAddGoalFull = async idx => {
  const g   = window._lcSuggestedGoals?.[idx];
  const btn = document.getElementById(`lc-gsb-${idx}`);
  if (!g || !btn) return;

  btn.disabled = true;
  btn.textContent = "⏳…";

  try {
    await createGoalFull(g);
    btn.textContent = "✓ Добавлено";
    btn.className   = "lc-gs-btn added";
    window._toast?.(`Цель «${g.title}» создана в Mind Map`);
    // Обновляем только цели в фоне — дневник не трогаем чтобы не сбрасывать ответ AI
    _refreshGoalsSilent();
  } catch(e) {
    btn.disabled    = false;
    btn.textContent = "+ В цели";
    window._toast?.("Ошибка: " + e.message);
  }
};

// Кнопка «Заменить все» или «Добавить к текущим»
window._lcApplyAllGoals = async mode => {
  const suggested = window._lcSuggestedGoals || [];
  if (!suggested.length) return;

  const btn = document.querySelector(`.lc-gs-apply-btn.${mode}`);
  if (btn) { btn.disabled = true; btn.textContent = "⏳ Применяю…"; }

  try {
    if (mode === "replace") {
      const existing = await getGoals();
      for (const g of existing.filter(g => !g.done)) {
        await deleteGoal(g.id);
      }
    }

    const toCreate = suggested.filter(g => g.action !== "remove");
    for (const g of toCreate) {
      await createGoalFull(g);
    }

    const toRemove = suggested.filter(g => g.action === "remove");
    for (const g of toRemove) {
      const existing = await getGoals();
      const found = existing.find(e =>
        e.title?.toLowerCase().trim() === (g.original_title || g.title)?.toLowerCase().trim()
      );
      if (found) await deleteGoal(found.id);
    }

    const count = toCreate.length;
    window._toast?.(`${mode === "replace" ? "Цели заменены" : "Цели добавлены"} — ${count} целей создано`);
    if (btn) { btn.textContent = "✓ Готово"; }
    // Обновляем только цели — дневник не трогаем
    _refreshGoalsSilent();

  } catch(e) {
    if (btn) {
      btn.disabled = false;
      btn.textContent = mode === "replace" ? "🔄 Заменить все" : "+ Добавить к текущим";
    }
    window._toast?.("Ошибка: " + e.message);
  }
};

// Убрать конкретную цель
window._lcRemoveGoal = async title => {
  try {
    const existing = await getGoals();
    const goal = existing.find(g =>
      g.title?.toLowerCase().trim() === title?.toLowerCase().trim()
    );
    if (!goal) { window._toast?.(`Цель не найдена: «${title}»`); return; }

    const del = confirm(`Удалить цель «${goal.title}»?\n\nОК — удалить\nОтмена — пометить как выполненную`);
    if (del) await deleteGoal(goal.id);
    else await updateGoal(goal.id, { done: true });

    window._toast?.(del ? "Цель удалена" : "Цель помечена как выполненная");
    window._refreshAll?.();
  } catch(e) {
    window._toast?.("Ошибка: " + e.message);
  }
};
