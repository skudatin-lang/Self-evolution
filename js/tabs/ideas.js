// ════════════════════════════════════════
//  TAB: ИДЕИ  v4.0
//  js/tabs/ideas.js
//
//  По скрину:
//   — Переключатель "Мои идеи" / "Коллекции"
//   — Поиск "Поиск идей..."
//   — Фильтры-таблетки: Все / Работа / Продукты / Жизнь / Творчество / Финансы
//   — Карточки: заголовок + цветная категория + описание + относительная дата
//   — FAB "+"
// ════════════════════════════════════════

import { registerTab } from "../router.js";
import { getIdeas, dstr, esc } from "../db.js";

let ideasView    = "mine";   // mine | collections
let ideasFilter  = "all";    // all | работа | продукты | жизнь | творчество | финансы
let ideasQuery   = "";

// Категории и их цвета
const CATEGORIES = [
  { id: "all",         label: "Все",        color: null },
  { id: "работа",      label: "Работа",     color: "#7C5CFF" },
  { id: "продукты",    label: "Продукты",   color: "#4DFFB4" },
  { id: "жизнь",       label: "Жизнь",      color: "#5CB8FF" },
  { id: "творчество",  label: "Творчество", color: "#FFB84D" },
  { id: "финансы",     label: "Финансы",    color: "#43D9A2" },
];

// Цвет по категории
function catColor(cat) {
  const found = CATEGORIES.find(c => c.id === (cat || "").toLowerCase());
  return found?.color || "#8AAFC8";
}

// Относительная дата
function relDate(dateStr) {
  if (!dateStr) return "";
  const d   = new Date(dateStr + "T00:00:00");
  const now = new Date(); now.setHours(0,0,0,0);
  const diff = Math.round((now - d) / 86400000);
  if (diff === 0) return "Сегодня";
  if (diff === 1) return "Вчера";
  if (diff <= 6)  return `${diff} дня назад`;
  if (diff <= 13) return "Неделю назад";
  return `${Math.round(diff/7)} нед. назад`;
}

export function initIdeas() { registerTab("ideas", renderIdeas); }

// ════════════════════════════════════════
//  SIDEBAR
// ════════════════════════════════════════

// ════════════════════════════════════════
//  ОСНОВНОЙ КОНТЕНТ
// ════════════════════════════════════════
function renderIdeasMain(all) {
  const body = document.getElementById("ideas-body");
  if (!body) return;

  // Фильтрация
  let items = all;

  // По вкладке
  if (ideasView === "collections") {
    // Группируем по категориям
    renderCollections(body, all);
    return;
  }

  // Поиск
  if (ideasQuery.trim()) {
    const q = ideasQuery.toLowerCase();
    items = items.filter(x =>
      (x.title || "").toLowerCase().includes(q) ||
      (x.text  || "").toLowerCase().includes(q) ||
      (x.category || "").toLowerCase().includes(q) ||
      (Array.isArray(x.tags) && x.tags.some(t => t.toLowerCase().includes(q)))
    );
  }

  // По категории
  if (ideasFilter !== "all") {
    items = items.filter(x => (x.category || "").toLowerCase() === ideasFilter);
  }

  // Сортировка: свежие сверху
  items = [...items].sort((a, b) =>
    (b.createdAt?.toDate?.() ?? new Date(b.date || 0)) -
    (a.createdAt?.toDate?.() ?? new Date(a.date || 0))
  );

  body.innerHTML = `

    <!-- Переключатель Мои идеи / Коллекции -->
    <div class="ideas-view-tabs">
      <button class="ivt-btn ${ideasView==="mine"?"on":""}"
        onclick="window._ideasView('mine')">Мои идеи</button>
      <button class="ivt-btn ${ideasView==="collections"?"on":""}"
        onclick="window._ideasView('collections')">Коллекции</button>
    </div>

    <!-- Поиск -->
    <div class="ideas-search-row">
      <span class="ideas-search-ico">🔍</span>
      <input class="inp ideas-search-inp" id="ideas-search-inp"
        placeholder="Поиск идей..."
        value="${esc(ideasQuery)}"/>
    </div>

    <!-- Фильтры-таблетки -->
    <div class="ideas-filter-row">
      ${CATEGORIES.map(c => `
        <button class="ideas-filter-btn ${ideasFilter===c.id?"on":""}"
          onclick="window._ideasFilterSet('${c.id}')">
          ${c.label}
        </button>`).join("")}
    </div>

    <!-- Список идей -->
    <div id="ideas-list">
      ${items.length
        ? items.map(x => ideaCardNew(x)).join("")
        : `<div class="plan-empty">
             <div class="plan-empty-ico">💡</div>
             <div class="plan-empty-text">
               ${ideasQuery || ideasFilter !== "all" ? "Ничего не найдено" : "Нет идей — нажмите «+»"}
             </div>
           </div>`
      }
    </div>

    <!-- FAB -->
    <button class="fab" onclick="window.openNewModal('idea',null,null,'ideas')">+</button>
  `;

  // Живой поиск
  const inp = document.getElementById("ideas-search-inp");
  if (inp) {
    inp.addEventListener("input", () => {
      ideasQuery = inp.value.trim();
      // Обновляем только список без полного перерендера
      let filtered = all;
      if (ideasQuery) {
        const q = ideasQuery.toLowerCase();
        filtered = filtered.filter(x =>
          (x.title || "").toLowerCase().includes(q) ||
          (x.text  || "").toLowerCase().includes(q) ||
          (x.category || "").toLowerCase().includes(q)
        );
      }
      if (ideasFilter !== "all") {
        filtered = filtered.filter(x => (x.category || "").toLowerCase() === ideasFilter);
      }
      filtered = filtered.sort((a,b) =>
        (b.createdAt?.toDate?.() ?? new Date(b.date||0)) -
        (a.createdAt?.toDate?.() ?? new Date(a.date||0))
      );
      const list = document.getElementById("ideas-list");
      if (list) list.innerHTML = filtered.length
        ? filtered.map(x => ideaCardNew(x)).join("")
        : `<div class="plan-empty"><div class="plan-empty-ico">🔍</div><div class="plan-empty-text">Ничего не найдено</div></div>`;
    });
  }
}

// ── Новая карточка идеи по скрину ──
function ideaCardNew(x) {
  const cat   = x.category || "";
  const color = catColor(cat);
  const date  = relDate(x.date);
  const text  = (x.text || "").slice(0, 100);

  return `
    <div class="idea-card-new ${x.realized ? "realized" : ""}"
      onclick="window.editIdea('${x.id}')">
      <div class="idea-card-header">
        <span class="idea-card-title">${esc(x.title || "Без заголовка")}</span>
        <span class="idea-card-date">${date}</span>
      </div>
      ${cat ? `<span class="idea-card-cat"
          style="background:${color}22;color:${color}">${esc(cat)}</span>` : ""}
      ${text ? `<div class="idea-card-text">${esc(text)}${x.text?.length > 100 ? "…" : ""}</div>` : ""}
    </div>`;
}

// ── Коллекции — группировка по категориям ──
function renderCollections(body, all) {
  const grouped = {};
  all.forEach(x => {
    const cat = x.category || "Без категории";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(x);
  });

  body.innerHTML = `
    <div class="ideas-view-tabs">
      <button class="ivt-btn" onclick="window._ideasView('mine')">Мои идеи</button>
      <button class="ivt-btn on" onclick="window._ideasView('collections')">Коллекции</button>
    </div>
    ${Object.entries(grouped).map(([cat, items]) => `
      <div class="ideas-collection">
        <div class="ideas-coll-header">
          <span class="ideas-coll-name" style="color:${catColor(cat)}">${esc(cat)}</span>
          <span class="ideas-coll-cnt">${items.length}</span>
        </div>
        ${items.slice(0, 3).map(x => `
          <div class="idea-card-new" onclick="window.editIdea('${x.id}')">
            <div class="idea-card-header">
              <span class="idea-card-title">${esc(x.title || "Без заголовка")}</span>
              <span class="idea-card-date">${relDate(x.date)}</span>
            </div>
            ${x.text ? `<div class="idea-card-text">${esc(x.text.slice(0,80))}…</div>` : ""}
          </div>`).join("")}
        ${items.length > 3 ? `
          <button class="goals-steps-more"
            onclick="window._ideasFilterSet('${esc(cat.toLowerCase())}');window._ideasView('mine')">
            Смотреть все ${items.length} →
          </button>` : ""}
      </div>`).join("")}
    <button class="fab" onclick="window.openNewModal('idea',null,null,'ideas')">+</button>`;
}

// ════════════════════════════════════════
//  MAIN RENDER
// ════════════════════════════════════════
export async function renderIdeas() {
  document.getElementById("tb-ttl").textContent = "Идеи";
  const all = await getIdeas();
  renderIdeasMain(all);
}

// ── Глобальные хэндлеры ──
window._ideasView = async view => {
  ideasView = view;
  const all = await getIdeas();
  renderIdeasMain(all);
};

window._ideasFilterSet = async filter => {
  ideasFilter = filter;
  ideasView   = "mine";
  const all = await getIdeas();
  renderIdeasMain(all);
};

window._realizeIdea = async ideaId => {
  const { updateIdea } = await import("../db.js");
  await updateIdea(ideaId, { realized: true, realizedDate: new Date().toISOString().slice(0,10) });
  window._refreshAll?.();
};
