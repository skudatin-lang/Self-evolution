// ════════════════════════════════════════
//  TAB: ИДЕИ
//  js/tabs/ideas.js
// ════════════════════════════════════════

import { registerTab, buildDayNav } from "../router.js";
import { getIdeas, dstr, esc, isOv, fdt } from "../db.js";

let ideasDate  = new Date(); ideasDate.setHours(0,0,0,0);
let showAll    = false;
let ideasMode  = "day"; // day | all | search
let ideasQuery = "";    // текст или тег поиска

export function initIdeas() { registerTab("ideas", renderIdeas); }

// ════════════════════════════════════════
//  SIDEBAR
// ════════════════════════════════════════
function renderIdeasSidebar(all) {
  const td     = dstr(new Date());
  const dayCnt = all.filter(x => x.date === td).length;

  document.getElementById("sb-body").innerHTML = `
    <div class="sb-tiles-grid">
      <button class="sb-tile ${ideasMode==='day'?'on':''}" onclick="window._ideasMode('day')">
        <div class="sb-tile-ico">💡</div>
        <div class="sb-tile-lbl">Идеи дня</div>
        <div class="sb-tile-cnt">${dayCnt}</div>
      </button>
      <button class="sb-tile ${ideasMode==='all'?'on':''}" onclick="window._ideasMode('all')">
        <div class="sb-tile-ico">🗂</div>
        <div class="sb-tile-lbl">Все идеи</div>
        <div class="sb-tile-cnt">${all.length}</div>
      </button>
      <button class="sb-tile ${ideasMode==='search'?'on':''}" onclick="window._ideasMode('search')">
        <div class="sb-tile-ico">🔍</div>
        <div class="sb-tile-lbl">Поиск</div>
        <div class="sb-tile-cnt">${[...new Set(all.flatMap(x=>x.tags||[]))].length}</div>
      </button>
      <button class="sb-tile" onclick="window._ideasMode('all')">
        <div class="sb-tile-ico">✓</div>
        <div class="sb-tile-lbl">Реализовано</div>
        <div class="sb-tile-cnt">${all.filter(x=>x.realized).length}</div>
      </button>
    </div>`;
}

// ════════════════════════════════════════
//  ПРАВАЯ ЧАСТЬ
// ════════════════════════════════════════
function renderIdeasMain(all) {
  const body = document.getElementById("ideas-body");
  if (!body) return;

  if (ideasMode === "day") {
    const datesWT = new Set(all.map(x => x.date).filter(Boolean));
    body.innerHTML = `<div id="ideas-dn"></div><div id="ideas-list"></div>`;

    buildDayNav(ideasDate, datesWT, showAll, "ideas-dn",
      d => { ideasDate = d; showAll = false; renderIdeas(); },
      () => { showAll = !showAll; renderIdeas(); }
    );

    const items = (showAll ? all : all.filter(x => x.date === dstr(ideasDate)))
      .sort((a,b) => (b.createdAt?.toDate?.() ?? 0) - (a.createdAt?.toDate?.() ?? 0));

    document.getElementById("ideas-list").innerHTML = items.length
      ? items.map(x => ideaCard(x)).join("")
      : '<div class="empty"><div class="ei">💡</div><p>Нет идей — нажмите «+»</p></div>';

  } else if (ideasMode === "all") {
    const sorted = [...all].sort((a,b) => (b.createdAt?.toDate?.() ?? 0) - (a.createdAt?.toDate?.() ?? 0));
    body.innerHTML = `
      <div class="plan-section-label">ВСЕ ИДЕИ (${sorted.length})</div>
      ${sorted.length
        ? sorted.map(x => ideaCard(x)).join("")
        : '<div class="empty"><div class="ei">💡</div><p>Идей нет — нажмите «+»</p></div>'}`;

  } else if (ideasMode === "search") {
    // ── Поиск — как в дневнике ──
    const allTags = [...new Set(all.flatMap(x => Array.isArray(x.tags) ? x.tags : []))].sort();

    const matches = ideasQuery.trim()
      ? all.filter(x =>
          (x.title || "").toLowerCase().includes(ideasQuery.toLowerCase()) ||
          (x.text  || "").toLowerCase().includes(ideasQuery.toLowerCase()) ||
          (x.category || "").toLowerCase().includes(ideasQuery.toLowerCase()) ||
          (Array.isArray(x.tags) && x.tags.some(t => t.toLowerCase().includes(ideasQuery.toLowerCase()))))
        .sort((a,b) => (b.createdAt?.toDate?.() ?? 0) - (a.createdAt?.toDate?.() ?? 0))
      : [];

    body.innerHTML = `
      <div class="diary-search-wrap">
        <input class="inp" id="ideas-search-inp"
          placeholder="Введите слово, фразу или тег..."
          value="${esc(ideasQuery)}"/>
        <button class="dn-cal-btn" id="ideas-search-btn">🔍</button>
      </div>
      ${allTags.length ? `
        <div class="diary-tags-cloud">
          <div class="diary-tags-cloud-lbl">Теги</div>
          <div class="diary-tags-cloud-wrap">
            ${allTags.map(t => `
              <button class="diary-cloud-tag ${ideasQuery===t?"active":""}"
                onclick="window._ideasSearchTag('${esc(t)}')">#${esc(t)}</button>`).join("")}
          </div>
        </div>` : ""}
      <div id="ideas-search-results">
        ${ideasQuery.trim()
          ? (matches.length
              ? `<div class="sec-lbl" style="margin:10px 0 8px">Найдено: ${matches.length}</div>
                 ${matches.map(x => ideaCard(x)).join("")}`
              : '<div class="empty"><div class="ei">🔍</div><p>Ничего не найдено</p></div>')
          : '<div class="empty"><div class="ei">🔍</div><p>Введите запрос или выберите тег</p></div>'}
      </div>`;

    const inp = document.getElementById("ideas-search-inp");
    const btn = document.getElementById("ideas-search-btn");
    const doSearch = () => { ideasQuery = inp.value.trim(); renderIdeasMain(all); };
    if (btn) btn.onclick = doSearch;
    if (inp) {
      inp.addEventListener("keydown", e => { if (e.key === "Enter") doSearch(); });
      // Живой поиск при вводе
      inp.addEventListener("input", () => {
        ideasQuery = inp.value.trim();
        const res = document.getElementById("ideas-search-results");
        if (!res) return;
        const q = ideasQuery;
        const found = q
          ? all.filter(x =>
              (x.title || "").toLowerCase().includes(q.toLowerCase()) ||
              (x.text  || "").toLowerCase().includes(q.toLowerCase()) ||
              (Array.isArray(x.tags) && x.tags.some(t => t.toLowerCase().includes(q.toLowerCase()))))
            .sort((a,b) => (b.createdAt?.toDate?.() ?? 0) - (a.createdAt?.toDate?.() ?? 0))
          : [];
        res.innerHTML = q
          ? (found.length
              ? `<div class="sec-lbl" style="margin:10px 0 8px">Найдено: ${found.length}</div>
                 ${found.map(x => ideaCard(x)).join("")}`
              : '<div class="empty"><div class="ei">🔍</div><p>Ничего не найдено</p></div>')
          : '<div class="empty"><div class="ei">🔍</div><p>Введите запрос или выберите тег</p></div>';
        // Обновляем активность тегов
        document.querySelectorAll(".diary-cloud-tag").forEach(b =>
          b.classList.toggle("active", b.textContent === `#${q}`)
        );
      });
      setTimeout(() => inp?.focus(), 50);
    }
  }

  body.insertAdjacentHTML("beforeend",
    `<button class="fab" onclick="window.openNewModal('idea',null,null,'ideas')">+</button>`);
}

// ── Карточка идеи — с тегами ──
function ideaCard(x) {
  const tagsHtml = Array.isArray(x.tags) && x.tags.length
    ? x.tags.map(t => `
        <button class="diary-cloud-tag small"
          onclick="event.stopPropagation();window._ideasSearchTag('${esc(t)}')">#${esc(t)}</button>`
      ).join("")
    : "";

  const realizedStyle = x.realized
    ? "opacity:.5;text-decoration:line-through;" : "";

  return `
    <div class="icard ${x.realized?"done":""}" onclick="window.editIdea('${x.id}')">
      <div class="ic-body">
        <div class="ic-ttl" style="${realizedStyle}">${esc(x.title || "Без заголовка")}</div>
        ${x.text ? `<div style="font-size:12px;color:var(--tx-m);margin-top:4px">${esc(x.text.slice(0,120))}${x.text.length>120?"…":""}</div>` : ""}
        <div class="ic-meta">
          <span class="ic-tag tag-dl">${x.date || ""}</span>
          ${x.category ? `<span class="ic-tag tag-goal">${esc(x.category)}</span>` : ""}
          ${x.realized ? `<span class="ic-tag" style="background:rgba(77,255,180,.12);color:var(--grn)">✓ Реализована</span>` : ""}
        </div>
        ${tagsHtml ? `<div class="diary-tags-cloud-wrap" style="margin-top:6px">${tagsHtml}</div>` : ""}
      </div>
      <div class="ic-acts">
        ${!x.realized ? `
          <button class="ib" style="font-size:13px;color:#27C993" title="Реализовать идею"
            onclick="event.stopPropagation();window._realizeIdea('${x.id}')">✓</button>` : ""}
        <button class="ib" onclick="event.stopPropagation();window.editIdea('${x.id}')" title="Редактировать">✎</button>
        <button class="ib del" onclick="event.stopPropagation();window.delItem('ideas','${x.id}')">🗑</button>
      </div>
    </div>`;
}

// ════════════════════════════════════════
//  MAIN RENDER
// ════════════════════════════════════════
export async function renderIdeas() {
  document.getElementById("tb-ttl").textContent = "Идеи";
  const all = await getIdeas();
  renderIdeasSidebar(all);
  renderIdeasMain(all);
}

// ── Глобальные хэндлеры ──
window._ideasMode = async mode => {
  ideasMode  = mode;
  if (mode !== "search") ideasQuery = "";
  const all  = await getIdeas();
  renderIdeasSidebar(all);
  renderIdeasMain(all);
};

window._ideasSearchTag = tag => {
  ideasMode  = "search";
  ideasQuery = tag;
  renderIdeas();
};

// Реализовать идею — помечает как реализованную в Firebase
window._realizeIdea = async ideaId => {
  const { updateIdea } = await import("../db.js");
  await updateIdea(ideaId, { realized: true, realizedDate: new Date().toISOString().slice(0,10) });
  window._refreshAll?.();
};
