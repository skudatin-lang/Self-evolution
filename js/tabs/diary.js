// ════════════════════════════════════════
//  TAB: ЖУРНАЛ  v4.0
//  js/tabs/diary.js
//
//  По скрину:
//   — 7-дневный навигатор
//   — Карточки по периодам: Утро / День / Вечер
//   — Блок "Главные мысли дня"
//   — Блок "Эмоции дня" (emoji)
//   — AI-анализ (DeepSeek) — полностью сохранён
// ════════════════════════════════════════

import { registerTab, buildDayNav }     from "../router.js";
import { getDiary, getIdeas, getTasks,
         getGoals, getProjects,
         addGoal, addProject, addTask,
         deleteGoal, updateGoal,
         getTemplates, getSurvey,
         dstr, esc, isOv, fdt }          from "../db.js";

let diaryDate  = new Date(); diaryDate.setHours(0,0,0,0);
let showAll    = false;
let diaryMode  = "day"; // day | all | search | templates
let searchTag  = "";
let lcAiMode   = "daily"; // daily | weekly | desires

// Периоды дня
const PERIODS = [
  { key: "morning", label: "Утро",   class: "morning", hours: [5, 12]  },
  { key: "day",     label: "День",   class: "day",     hours: [12, 18] },
  { key: "evening", label: "Вечер",  class: "evening", hours: [18, 24] },
];

// Эмоции
const EMOTIONS = ["😊","😌","🤔","😤","😔","😤","🥳","😴","💪","❤️"];

export function initDiary() { registerTab("diary", renderDiary); }

// ════════════════════════════════════════
//  SIDEBAR
// ════════════════════════════════════════

// ════════════════════════════════════════
//  ОСНОВНОЙ КОНТЕНТ
// ════════════════════════════════════════
function renderDiaryMain(entries, templates) {
  const body = document.getElementById("diary-body");
  if (!body) return;

  if (diaryMode === "day") {
    renderDayView(body, entries);
  } else if (diaryMode === "all") {
    renderAllEntries(body, entries);
  } else if (diaryMode === "templates") {
    renderTemplates(body, templates);
  } else if (diaryMode === "search") {
    renderSearch(body, entries);
  }
}

// ── Вид "День" — по скрину: навигатор + периоды + мысли + эмоции ──
function renderDayView(body, entries) {
  const targetStr = dstr(diaryDate);
  const isToday   = targetStr === dstr(new Date());

  const datesWT   = new Set(entries.map(x => x.date).filter(Boolean));

  // Фильтруем записи за день
  const dayEntries = (showAll ? entries : entries.filter(x => x.date === targetStr))
    .sort((a, b) => (a.createdAt?.toDate?.() ?? 0) - (b.createdAt?.toDate?.() ?? 0));

  // Группируем по периоду (Утро/День/Вечер) на основе времени создания
  function getPeriod(entry) {
    const t = entry.createdAt?.toDate?.() ?? (entry.time ? new Date("2000-01-01T"+entry.time) : null);
    if (!t) return entry.period || "evening";
    const h = t.getHours();
    if (h >= 5  && h < 12) return "morning";
    if (h >= 12 && h < 18) return "day";
    return "evening";
  }

  function getTimeStr(entry) {
    const t = entry.createdAt?.toDate?.() ?? null;
    if (t) return t.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    return entry.time || "";
  }

  const byPeriod = { morning: [], day: [], evening: [] };
  dayEntries.forEach(e => {
    const p = getPeriod(e);
    byPeriod[p].push(e);
  });

  // Эмоции дня — ищем в записях
  const allEmotions = dayEntries.flatMap(e => e.emotions || []);

  // Главные мысли — из записей с тегом "мысль" или поле "thoughts"
  const thoughts = dayEntries.flatMap(e => {
    if (e.thoughts) return Array.isArray(e.thoughts) ? e.thoughts : [e.thoughts];
    return [];
  }).filter(Boolean);

  const months = ["Январь","Февраль","Март","Апрель","Май","Июнь",
                  "Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
  const monthLabel = `${months[diaryDate.getMonth()]} ${diaryDate.getFullYear()}`;

  body.innerHTML = `

    <!-- Месяц -->
    <div class="plan-date-header">${monthLabel}</div>

    <!-- 7-дневный навигатор -->
    <div id="diary-dn"></div>

    <!-- Периоды дня -->
    ${PERIODS.map(p => {
      const periodEntries = byPeriod[p.key];
      if (!periodEntries.length && !isToday) return "";
      return `
        <div class="diary-period-card"
          onclick="window.openNewModal('diary',null,null,'diary','${targetStr}')">
          <div class="diary-period-header">
            <span class="diary-period-label ${p.class}">${p.label}</span>
            ${periodEntries[0] ? `<span class="diary-period-time">${getTimeStr(periodEntries[0])}</span>` : ""}
          </div>
          ${periodEntries.length
            ? periodEntries.map(e => `
                <div class="diary-period-text">
                  ${esc((e.title && e.title !== "Без заголовка" ? e.title + ". " : "") + (e.text || "").slice(0, 120))}
                  ${(e.title ? e.title.length : 0) + (e.text || "").length > 120 ? "…" : ""}
                </div>
                ${periodEntries.indexOf(e) < periodEntries.length - 1 ? "<hr style='border:none;border-top:1px solid var(--bd);margin:6px 0'/>" : ""}`).join("")
            : `<div class="diary-period-text" style="color:var(--tx-l);font-style:italic">
                 Нажмите чтобы добавить запись
               </div>`}
        </div>`;
    }).join("")}

    <!-- Главные мысли дня -->
    ${thoughts.length ? `
    <div class="diary-thoughts-card">
      <div class="diary-thoughts-title">Главные мысли дня</div>
      <ul class="diary-thoughts-list">
        ${thoughts.slice(0, 5).map(t => `<li>${esc(t)}</li>`).join("")}
      </ul>
    </div>` : ""}

    <!-- Эмоции дня -->
    <div class="diary-emotions-card">
      <div class="diary-emotions-title">Эмоции дня</div>
      <div class="diary-emotions-row">
        ${allEmotions.slice(0, 5).map(e => `
          <div class="diary-emotion-btn selected">${e}</div>`).join("")}
        <button class="diary-emotion-add"
          onclick="window._addEmotion('${targetStr}')">+</button>
      </div>
    </div>

    <!-- FAB -->
    <button class="fab"
      onclick="window.openNewModal('diary',null,null,'diary','${targetStr}')">+</button>
  `;

  // Навигатор
  buildDayNav(diaryDate, datesWT, showAll, "diary-dn",
    d => { diaryDate = d; showAll = false; renderDiary(); },
    () => { showAll = !showAll; renderDiary(); }
  );
}

// ── Все записи ──
function renderAllEntries(body, entries) {
  const sorted = [...entries].sort((a, b) => (b.date || "") > (a.date || "") ? 1 : -1);
  body.innerHTML = `
    <div class="plan-section-label">
      ВСЕ ЗАПИСИ
      <span class="plan-section-cnt">${sorted.length}</span>
    </div>
    ${sorted.length
      ? sorted.map(x => diaryCard(x)).join("")
      : '<div class="plan-empty"><div class="plan-empty-ico">📚</div><div class="plan-empty-text">Записей нет</div></div>'}
    <button class="fab" onclick="window.openNewModal('diary',null,null,'diary')">+</button>`;
}

// ── Шаблоны ──
function renderTemplates(body, templates) {
  body.innerHTML = `
    <div class="plan-section-label">
      ШАБЛОНЫ
      <span class="plan-section-cnt">${templates.length}</span>
    </div>
    ${templates.length
      ? templates.map(t => `
          <div class="icard">
            <div class="ic-body" onclick="window._useTmpl('${t.id}')" style="cursor:pointer">
              <div class="ic-ttl">${esc(t.title)}</div>
              ${t.body ? `<div style="font-size:12px;color:var(--tx-m);margin-top:3px">${esc(t.body.slice(0,100))}${t.body.length>100?"…":""}</div>` : ""}
              <div class="ic-meta"><span class="ic-tag tag-goal">Нажмите чтобы использовать</span></div>
            </div>
            <div class="ic-acts">
              <button class="ib del"
                onclick="event.stopPropagation();window.delItem('templates','${t.id}')">🗑</button>
            </div>
          </div>`).join("")
      : '<div class="plan-empty"><div class="plan-empty-ico">📄</div><div class="plan-empty-text">Шаблонов нет</div></div>'}
    <button class="fab" onclick="window.openNewModal('diary',null,null,'diary')">+</button>`;
}

// ── Поиск ──
function renderSearch(body, entries) {
  const allTags = [...new Set(entries.flatMap(x => x.tags || []))].sort();
  const matches = searchTag.trim()
    ? entries.filter(x =>
        (x.title||"").toLowerCase().includes(searchTag.toLowerCase()) ||
        (x.text ||"").toLowerCase().includes(searchTag.toLowerCase()) ||
        (x.mood ||"").toLowerCase().includes(searchTag.toLowerCase()) ||
        (Array.isArray(x.tags) && x.tags.some(t => t.toLowerCase().includes(searchTag.toLowerCase())))
      ).sort((a,b) => (b.date||"") > (a.date||"") ? 1 : -1)
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
        ? matches.length
          ? `<div class="plan-section-label">НАЙДЕНО <span class="plan-section-cnt">${matches.length}</span></div>
             ${matches.map(x => diaryCard(x)).join("")}`
          : '<div class="plan-empty"><div class="plan-empty-ico">🔍</div><div class="plan-empty-text">Ничего не найдено</div></div>'
        : '<div class="plan-empty"><div class="plan-empty-ico">🔍</div><div class="plan-empty-text">Введите запрос или выберите тег</div></div>'}
    </div>
    <button class="fab" onclick="window.openNewModal('diary',null,null,'diary')">+</button>`;

  const inp = document.getElementById("diary-search-inp");
  const btn = document.getElementById("diary-search-btn");
  const doSearch = () => { searchTag = inp.value; renderDiary(); };
  if (btn) btn.onclick = doSearch;
  if (inp) inp.addEventListener("keydown", e => { if (e.key === "Enter") doSearch(); });
  setTimeout(() => inp?.focus(), 50);
}

// ── Карточка записи ──
function diaryCard(x) {
  const moodIcon = x.mood ? `<span class="ic-tag" style="background:rgba(200,150,62,.1)">${x.mood.split(" ")[0]}</span>` : "";
  const tagsHtml = Array.isArray(x.tags) && x.tags.length
    ? x.tags.map(t => `<span class="ic-tag ic-tag-diary-tag">#${esc(t)}</span>`).join("")
    : "";
  return `
    <div class="icard" onclick="window.editDiary('${x.id}')">
      <div class="ic-body">
        <div class="ic-ttl">${esc(x.title || "Без заголовка")}</div>
        ${x.text ? `<div style="font-size:12px;color:var(--tx-m);margin-top:4px">${esc(x.text.slice(0,130))}${x.text.length>130?"…":""}</div>` : ""}
        <div class="ic-meta">
          <span class="ic-tag tag-dl">${x.date || ""} ${x.time || ""}</span>
          ${moodIcon}
          ${tagsHtml}
        </div>
      </div>
      <div class="ic-acts">
        <button class="ib del"
          onclick="event.stopPropagation();window.delItem('diary','${x.id}')">🗑</button>
      </div>
    </div>`;
}

// ════════════════════════════════════════
//  MAIN RENDER
// ════════════════════════════════════════
export async function renderDiary() {
  document.getElementById("tb-ttl").textContent = "Журнал";
  const [entries, templates] = await Promise.all([getDiary(), getTemplates()]);
  renderDiaryMain(entries, templates);
}

// ════════════════════════════════════════
//  GLOBAL HANDLERS
// ════════════════════════════════════════
window._diaryMode = async mode => {
  diaryMode = mode;
  const [entries, templates] = await Promise.all([getDiary(), getTemplates()]);
  renderDiaryMain(entries, templates);
};

window._diarySearchTag = tag => {
  searchTag = tag;
  diaryMode = "search";
  renderDiary();
};

window._useTmpl = async id => {
  const { getTemplates } = await import("../db.js");
  const all = await getTemplates();
  const tmpl = all.find(t => t.id === id);
  if (!tmpl) return;
  window.openNewModal("diary", null, null, "diary", null, {
    title: tmpl.title, body: tmpl.body
  });
};

window._addEmotion = async (dateStr) => {
  const emotions = ["😊","😌","🤔","😤","😔","🥳","😴","💪","❤️","😱","🎉","😢"];
  const { openModal, closeModal, toast: t2 } = await import("../modal.js");
  openModal("Добавить эмоцию",
    `<div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;padding:10px 0">
      ${emotions.map(e => `
        <button onclick="window._selectEmotion('${e}')"
          style="font-size:32px;background:none;border:none;cursor:pointer;
                 transition:transform .15s;padding:4px;"
          onmouseover="this.style.transform='scale(1.3)'"
          onmouseout="this.style.transform=''">
          ${e}
        </button>`).join("")}
     </div>`,
    null
  );
  window._selectEmotion = async emoji => {
    closeModal();
    // Добавляем эмоцию в последнюю запись дня или создаём новую
    const { getDiary, updateDiaryEntry } = await import("../db.js");
    const all = await getDiary();
    const dayEntry = all.filter(e => e.date === dateStr)
      .sort((a,b) => (b.createdAt?.toDate?.()??0) - (a.createdAt?.toDate?.()??0))[0];
    if (dayEntry) {
      const newEmotions = [...(dayEntry.emotions || []), emoji];
      await updateDiaryEntry(dayEntry.id, { emotions: newEmotions });
    }
    t2("Эмоция добавлена");
    renderDiary();
  };
};

// ════════════════════════════════════════
//  AI HANDLERS (полностью сохранены)
// ════════════════════════════════════════
function lcEsc(s) {
  return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

window._lcAiToggleCfg = () => {
  const cfg   = document.getElementById("lc-ai-cfg");
  const saved = document.getElementById("lc-ai-cfg-saved");
  if (!cfg) return;
  const open = cfg.style.display !== "none";
  cfg.style.display   = open ? "none" : "flex";
  if (saved) saved.style.display = open ? "flex" : "none";
};

window._lcAiSaveKey = () => {
  const val = document.getElementById("lc-key-inp")?.value.trim();
  if (val) localStorage.setItem("lc-ai-key", val);
};

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
    saved.innerHTML = `<span>${prof.chronotype==="owl"?"🦉 Сова":"🌅 Жаворонок"}${prof.age?" · "+prof.age+" лет":""}</span>
      <button class="ai-key-change" onclick="window._lcAiToggleCfg()">✎</button>`;
  }
};

window._lcSetMode = mode => {
  lcAiMode = mode;
  ["daily","weekly","desires"].forEach(m => {
    const btn = document.getElementById("lc-mode-" + m);
    if (btn) btn.classList.toggle("active", m === mode);
  });
};

async function lcAskDeepSeek(systemPrompt, userMessage) {
  const key = localStorage.getItem("lc-ai-key");
  if (!key) throw new Error("API ключ не задан.");
  const resp = await fetch("https://api.proxyapi.ru/openrouter/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type":"application/json","Authorization":"Bearer "+key },
    body: JSON.stringify({
      model:"deepseek/deepseek-chat", max_tokens:1200, temperature:0.7,
      messages:[{role:"system",content:systemPrompt},{role:"user",content:userMessage}],
    }),
  });
  if (!resp.ok) { const e=await resp.json().catch(()=>({})); throw new Error(e.error?.message||"API error "+resp.status); }
  const data = await resp.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

function renderLcResponse(text, resultDiv) {
  let parsed = null;
  try { parsed = JSON.parse(text.replace(/```json\s*/gi,"").replace(/```\s*/g,"").trim()); } catch(_) {}

  if (parsed) {
    let html = "";
    if (parsed.suggested_goals?.length) {
      const sphereLabel={health:"💪 Здоровье",relations:"❤️ Отношения",work:"💼 Работа",finance:"💰 Финансы",rest:"🎨 Отдых",meaning:"🌱 Смысл"};
      const priColor={high:"var(--red)",medium:"var(--go-d)",low:"var(--grn)"};
      const actionBadge={add:`<span class="lc-gs-badge add">+ Новая</span>`,keep:`<span class="lc-gs-badge keep">✓ Оставить</span>`,remove:`<span class="lc-gs-badge remove">✕ Убрать</span>`,rephrase:`<span class="lc-gs-badge rephrase">✎ Обновить</span>`};
      window._lcSuggestedGoals = parsed.suggested_goals;
      html += `<div class="ai-block lc-goals-suggest">
        <div class="ai-block-ttl">🎯 Предлагаемые цели для Mind Map</div>
        <div class="lc-goals-suggest-sub">На основе анализа твоего поведения и записей</div>
        ${parsed.suggested_goals.map((g,i) => {
          const act=g.action||"add"; const isRemove=act==="remove";
          const projectsHtml=(g.projects||[]).map(p=>`<div class="lc-gs-project">
            <div class="lc-gs-proj-name">📁 ${lcEsc(p.name)}</div>
            ${p.desc?`<div class="lc-gs-proj-desc">${lcEsc(p.desc)}</div>`:""}
            ${(p.tasks||[]).map(t=>`<div class="lc-gs-task"><span class="lc-gs-task-dot">·</span>${lcEsc(t.title)}${t.priority==="high"?`<span class="lc-gs-task-pri">!</span>`:""}</div>`).join("")}
          </div>`).join("");
          return `<div class="lc-goal-suggest-row ${isRemove?"remove":""}" id="lc-gsr-${i}">
            <div class="lc-gs-body">
              <div class="lc-gs-header"><div class="lc-gs-title">${lcEsc(g.title||"")}</div>${actionBadge[act]||actionBadge.add}</div>
              ${g.desc?`<div class="lc-gs-desc">${lcEsc(g.desc)}</div>`:""}
              ${g.why?`<div class="lc-gs-why">💬 ${lcEsc(g.why)}</div>`:""}
              <div class="lc-gs-meta">
                ${g.sphere?`<span class="lc-gs-chip">${sphereLabel[g.sphere]||g.sphere}</span>`:""}
                <span class="lc-gs-chip" style="color:${priColor[g.priority]||"var(--tx-l)"}">${g.priority||""}</span>
              </div>
              ${projectsHtml?`<div class="lc-gs-projects">${projectsHtml}</div>`:""}
            </div>
            <div class="lc-gs-actions">
              ${!isRemove
                ?`<button class="lc-gs-btn add" id="lc-gsb-${i}" onclick="window._lcAddGoalFull(${i})">+ В цели</button>`
                :`<button class="lc-gs-btn remove" onclick="window._lcRemoveGoal(${JSON.stringify(g.original_title||g.title)})">Убрать</button>`
              }
            </div>
          </div>`;
        }).join("")}
        <div class="lc-gs-apply-section">
          <div class="lc-gs-apply-ttl">Применить всё сразу:</div>
          <div class="lc-gs-apply-btns">
            <button class="lc-gs-apply-btn replace" onclick="window._lcApplyAllGoals('replace')">🔄 Заменить все цели</button>
            <button class="lc-gs-apply-btn add" onclick="window._lcApplyAllGoals('add')">+ Добавить к текущим</button>
          </div>
        </div>
      </div>`;
    }
    if (parsed.energy_state) {
      const stateMap={recovery:{icon:"🔋",label:"Восстановление",color:"var(--blu)"},stable:{icon:"✅",label:"Стабильно",color:"var(--grn)"},growth:{icon:"🚀",label:"Рост",color:"var(--go)"},burnout_risk:{icon:"🔥",label:"Риск выгорания",color:"var(--red)"}};
      const s=stateMap[parsed.energy_state]||{icon:"💡",label:parsed.energy_state,color:"var(--tx)"};
      const bp=parsed.burnout_probability??null;
      html+=`<div class="ai-block lc-energy-block" style="border-left:3px solid ${s.color}">
        <div class="ai-block-ttl">⚡ Энергетическое состояние</div>
        <div class="lc-energy-state" style="color:${s.color}">${s.icon} ${lcEsc(s.label)}</div>
        ${bp!=null?`<div class="lc-burnout-bar"><div class="lc-burnout-fill" style="width:${bp*100}%;background:${bp>.6?"var(--red)":bp>.3?"var(--go)":"var(--grn)"}"></div></div>
        <div class="lc-burnout-lbl">Риск выгорания: ${Math.round(bp*100)}%</div>`:""}
        ${parsed.main_energy_sources?.length?`<div class="ai-block-ttl" style="margin-top:4px">Даёт энергию</div>${parsed.main_energy_sources.map(s=>`<div class="lc-list-item pos">+ ${lcEsc(s)}</div>`).join("")}`:""}
        ${parsed.main_energy_drains?.length?`<div class="ai-block-ttl" style="margin-top:4px">Забирает энергию</div>${parsed.main_energy_drains.map(s=>`<div class="lc-list-item neg">− ${lcEsc(s)}</div>`).join("")}`:""}
        ${parsed.recommended_recovery_actions?.length?`<div class="ai-block-ttl" style="margin-top:6px">Рекомендации</div>${parsed.recommended_recovery_actions.map(a=>`<div class="lc-list-item">▸ ${lcEsc(a)}</div>`).join("")}`:""}
      </div>`;
    }
    if (parsed.aligned_goals?.length||parsed.misaligned_goals?.length||parsed.possible_external_goals?.length) {
      html+=`<div class="ai-block"><div class="ai-block-ttl">🎯 Выравнивание целей</div>
        ${parsed.aligned_goals?.length?`<div class="lc-goals-group"><div class="lc-goals-lbl grn">✓ Твои цели</div>${parsed.aligned_goals.map(g=>`<div class="lc-goal-item grn">${lcEsc(typeof g==="string"?g:g.title||"")}</div>`).join("")}</div>`:""}
        ${parsed.misaligned_goals?.length?`<div class="lc-goals-group"><div class="lc-goals-lbl ora">⚡ Рассогласование</div>${parsed.misaligned_goals.map(g=>`<div class="lc-goal-item ora">${lcEsc(typeof g==="string"?g:g.title||"")}</div>`).join("")}</div>`:""}
        ${parsed.possible_external_goals?.length?`<div class="lc-goals-group"><div class="lc-goals-lbl red">⚠ Возможно чужие</div>${parsed.possible_external_goals.map(g=>`<div class="lc-goal-item red">${lcEsc(typeof g==="string"?g:g.title||"")}</div>`).join("")}</div>`:""}
        ${parsed.emerging_real_goals?.length?`<div class="lc-goals-group"><div class="lc-goals-lbl blu">💫 Проявляющиеся</div>${parsed.emerging_real_goals.map(g=>`<div class="lc-goal-item blu">${lcEsc(typeof g==="string"?g:g.title||"")}</div>`).join("")}</div>`:""}
      </div>`;
    }
    if (parsed.detected_desires?.length||parsed.repeating_patterns?.length) {
      html+=`<div class="ai-block" style="border-left:3px solid var(--go)"><div class="ai-block-ttl">💫 Желания и паттерны</div>
        ${parsed.detected_desires?.length?`<div class="ai-block-ttl" style="margin-top:4px">Обнаружены желания</div>${parsed.detected_desires.map(d=>`<div class="lc-list-item pos">✦ ${lcEsc(d)}</div>`).join("")}`:""}
        ${parsed.repeating_patterns?.length?`<div class="ai-block-ttl" style="margin-top:6px">Паттерны</div>${parsed.repeating_patterns.map(p=>`<div class="lc-list-item">↻ ${lcEsc(p)}</div>`).join("")}`:""}
        ${parsed.suppressed_interests?.length?`<div class="ai-block-ttl" style="margin-top:6px">Подавленные интересы</div>${parsed.suppressed_interests.map(i=>`<div class="lc-list-item ora">◉ ${lcEsc(i)}</div>`).join("")}`:""}
      </div>`;
    }
    if (parsed.weekly_summary) {
      const ws=parsed.weekly_summary;
      html+=`<div class="ai-block"><div class="ai-block-ttl">📆 Недельная динамика</div>
        ${ws.energy_trend?`<div class="lc-list-item">⚡ ${lcEsc(ws.energy_trend)}</div>`:""}
        ${ws.main_positive_pattern?`<div class="lc-list-item pos">+ ${lcEsc(ws.main_positive_pattern)}</div>`:""}
        ${ws.main_problem_pattern?`<div class="lc-list-item neg">− ${lcEsc(ws.main_problem_pattern)}</div>`:""}
      </div>`;
    }
    const questions=parsed.reflection_questions||parsed.questions_for_user||[];
    if (questions.length) html+=`<div class="ai-block lc-questions"><div class="ai-block-ttl">🪞 Вопросы для размышления</div>${questions.map(q=>`<div class="lc-question">${lcEsc(q)}</div>`).join("")}</div>`;
    if (parsed.advice||parsed.daily_plan) {
      const txt=parsed.advice||(Array.isArray(parsed.daily_plan)?parsed.daily_plan.join("\n"):"");
      if (txt) html+=`<div class="ai-block ai-advice"><div class="ai-block-ttl">💡 Совет</div><div class="ai-advice-text">${lcEsc(txt).replace(/\n/g,"<br>")}</div></div>`;
    }
    if (!html) html=`<div class="ai-advice-text">${text.replace(/\n/g,"<br>")}</div>`;
    resultDiv.innerHTML = html + `<div class="ai-result-meta">DeepSeek AI · ${new Date().toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}</div>`;
  } else {
    resultDiv.innerHTML = `<div class="ai-advice-text">${text.replace(/\*\*(.*?)\*\*/g,"<b>$1</b>").replace(/\n/g,"<br>")}</div>
      <div class="ai-result-meta">DeepSeek AI · ${new Date().toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}</div>`;
  }
}

window._lcRunAnalysis = async () => {
  const btn = document.getElementById("lc-ai-run-btn");
  const resultDiv = document.getElementById("lc-ai-result");
  if (!resultDiv) return;
  if (btn) { btn.disabled=true; btn.textContent="⏳ Анализирую…"; }
  resultDiv.innerHTML = `<div class="ai-result-loading">Анализирую данные…</div>`;
  try {
    const [diary, ideas, tasks, goals, projects, surveys] = await Promise.all([
      getDiary(), getIdeas(), getTasks(), getGoals(), getProjects(), getSurvey()
    ]);
    const prof = JSON.parse(localStorage.getItem("lc-ai-profile") || "{}");
    const today2 = dstr(new Date());
    const d14ago = new Date(); d14ago.setDate(d14ago.getDate()-14);
    const d14str = dstr(d14ago);
    const recentDiary = diary.filter(e => e.date >= d14str).sort((a,b)=>(a.date||"")>(b.date||"")?1:-1);
    const recentIdeas = ideas.filter(i => i.date >= d14str);
    const wheelData   = surveys[0]?.scores || null;
    const scoredTasks = tasks.filter(t => t.done && t.energyScore && t.completedDate >= d14str);
    const avgEnergy   = scoredTasks.length ? parseFloat((scoredTasks.reduce((s,t)=>s+t.energyScore,0)/scoredTasks.length).toFixed(1)) : null;
    const doneTasks   = tasks.filter(t=>t.done);
    const openTasks   = tasks.filter(t=>!t.done);
    const moodMap={"😊 Отлично":5,"🙂 Хорошо":4,"😐 Нейтрально":3,"😔 Плохо":2,"😢 Тяжело":1,"😫 Плохо":1};
    const moodScores  = recentDiary.filter(e=>e.mood).map(e=>moodMap[e.mood]||3);
    const avgMood     = moodScores.length ? parseFloat((moodScores.reduce((a,b)=>a+b,0)/moodScores.length).toFixed(1)) : null;
    const tagFreq={}; diary.flatMap(e=>e.tags||[]).forEach(t=>{tagFreq[t]=(tagFreq[t]||0)+1;});
    const topTags=Object.entries(tagFreq).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([t,c])=>`${t}(${c})`);
    const inputData={
      user_profile:{chronotype:prof.chronotype||"lark",best_hours:prof.best_hours||"09:00-11:30",focus_limit_minutes:prof.focus_limit_minutes||90},
      wheel_of_life:wheelData,
      energy_history:{avg_energy_14d:avgEnergy,vampire_tasks:scoredTasks.filter(t=>t.energyScore<=2).slice(0,5).map(t=>({title:t.title,score:t.energyScore})),charging_tasks:scoredTasks.filter(t=>t.energyScore>=4).slice(0,5).map(t=>({title:t.title,score:t.energyScore}))},
      context:{date:today2,avg_mood_14d:avgMood,mode:lcAiMode},
      goals:goals.map(g=>({id:g.id,title:g.title,done:!!g.done,priority:g.priority||"medium",desc:g.desc||""})),
      projects:projects.map(p=>({id:p.id,title:p.name,goal_id:p.goalId||null,done:!!p.done})),
      behavior_stats:{total_done:doneTasks.length,open_tasks:openTasks.length},
      diary_entries:recentDiary.map(e=>({date:e.date,title:e.title,text:(e.text||"").slice(0,300),mood:e.mood||null,tags:e.tags||[]})),
      ideas:recentIdeas.map(i=>({title:i.title,text:(i.text||"").slice(0,200),date:i.date})),
      top_recurring_tags:topTags,
    };
    let userRequest;
    if (lcAiMode==="daily") {
      userRequest=`Выполни DAILY ANALYSIS. Верни JSON: {"suggested_goals":[{"title":"","desc":"","why":"","sphere":"work|health|relations|finance|rest|meaning","priority":"high|medium|low","action":"add|keep|remove|rephrase","projects":[{"name":"","desc":"","tasks":[{"title":"","priority":"med"}]}]}],"energy_state":"recovery|stable|growth|burnout_risk","burnout_probability":0.0,"main_energy_sources":[],"main_energy_drains":[],"recommended_recovery_actions":[],"reflection_questions":[],"advice":""} Верни ТОЛЬКО JSON.`;
    } else if (lcAiMode==="weekly") {
      userRequest=`Выполни WEEKLY SUMMARY. Верни JSON: {"suggested_goals":[],"energy_state":"stable","weekly_summary":{"energy_trend":"","main_positive_pattern":"","main_problem_pattern":""},"aligned_goals":[],"misaligned_goals":[],"possible_external_goals":[],"reflection_questions":[]} Верни ТОЛЬКО JSON.`;
    } else {
      userRequest=`Выполни DESIRE EXTRACTION. Верни JSON: {"detected_desires":[],"repeating_patterns":[],"suppressed_interests":[],"emerging_real_goals":[],"reflection_questions":[],"micro_experiment":""} Верни ТОЛЬКО JSON.`;
    }
    const systemPrompt=`Ты — AI-система осознанной эффективности Life Evolution. Говоришь на «ты». Анализируй дневник, идеи, задачи, колесо баланса и энергию. Тон: спокойный, аналитический, не мотиватор. Верни ТОЛЬКО валидный JSON.`;
    const text = await lcAskDeepSeek(systemPrompt, userRequest+"\n\nДанные:\n"+JSON.stringify(inputData,null,2));
    const timeStr = new Date().toLocaleString("ru-RU",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
    localStorage.setItem("lc-ai-life-last", timeStr);
    const lastEl = document.querySelector(".lc-ai-last");
    if (lastEl) lastEl.textContent = `Последний анализ: ${timeStr}`;
    renderLcResponse(text, resultDiv);
  } catch(err) {
    resultDiv.innerHTML = `<div class="ai-result-error">⚠ ${err.message}</div>`;
  } finally {
    if (btn) { btn.disabled=false; btn.textContent="◆ Запустить анализ"; }
  }
};

async function createGoalFull(g) {
  const goalRef = await addGoal({title:g.title,desc:g.desc||g.why||"",priority:g.priority||"medium",done:false,fromAi:true,aiSphere:g.sphere||null});
  const goalId  = goalRef.id;
  for (const p of (g.projects||[])) {
    const projRef = await addProject({name:p.name,desc:p.desc||"",goalId,done:false,fromAi:true});
    for (const t of (p.tasks||[])) await addTask({title:t.title,note:"",goalId,projId:projRef.id,priority:t.priority||"med",date:dstr(new Date()),done:false,fromAi:true});
  }
  return goalId;
}

async function _refreshGoalsSilent() {
  try { const {renderGoals}=await import("./goals.js"); await renderGoals?.(); } catch(_) {}
}

window._lcAddGoalFull = async idx => {
  const g=window._lcSuggestedGoals?.[idx]; const btn=document.getElementById(`lc-gsb-${idx}`);
  if (!g||!btn) return; btn.disabled=true; btn.textContent="⏳…";
  try { await createGoalFull(g); btn.textContent="✓ Добавлено"; btn.className="lc-gs-btn added"; window._toast?.(`Цель «${g.title}» создана`); _refreshGoalsSilent(); }
  catch(e) { btn.disabled=false; btn.textContent="+ В цели"; window._toast?.("Ошибка: "+e.message); }
};

window._lcApplyAllGoals = async mode => {
  const suggested=window._lcSuggestedGoals||[]; if (!suggested.length) return;
  const btn=document.querySelector(`.lc-gs-apply-btn.${mode}`);
  if (btn) { btn.disabled=true; btn.textContent="⏳ Применяю…"; }
  try {
    if (mode==="replace") { const existing=await getGoals(); for (const g of existing.filter(g=>!g.done)) await deleteGoal(g.id); }
    for (const g of suggested.filter(g=>g.action!=="remove")) await createGoalFull(g);
    for (const g of suggested.filter(g=>g.action==="remove")) {
      const existing=await getGoals();
      const found=existing.find(e=>e.title?.toLowerCase().trim()===(g.original_title||g.title)?.toLowerCase().trim());
      if (found) await deleteGoal(found.id);
    }
    window._toast?.(mode==="replace"?"Цели заменены":"Цели добавлены");
    if (btn) btn.textContent="✓ Готово";
    _refreshGoalsSilent();
  } catch(e) {
    if (btn) { btn.disabled=false; btn.textContent=mode==="replace"?"🔄 Заменить":"+ Добавить"; }
    window._toast?.("Ошибка: "+e.message);
  }
};

window._lcRemoveGoal = async title => {
  try {
    const existing=await getGoals();
    const goal=existing.find(g=>g.title?.toLowerCase().trim()===title?.toLowerCase().trim());
    if (!goal) { window._toast?.(`Цель не найдена: «${title}»`); return; }
    if (confirm(`Удалить цель «${goal.title}»?`)) await deleteGoal(goal.id);
    else await updateGoal(goal.id,{done:true});
    window._toast?.("Готово"); window._refreshAll?.();
  } catch(e) { window._toast?.("Ошибка: "+e.message); }
};
