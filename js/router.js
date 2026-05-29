// ════════════════════════════════════════
//  ROUTER + DAY NAV
//  js/router.js
// ════════════════════════════════════════

import { dstr } from "./db.js";

const $ = id => document.getElementById(id);

export let curTab   = "dashboard";
export let weekOff  = 0;

// ── Tab names ──
const TAB_TITLES = {
  dashboard: "Главная",
  plan:      "День",
  goals:     "Жизнь",
  diary:     "Журнал",
  profile:   "Профиль",
  analytics: "Аналитика",
  ideas:     "Идеи",
  "ai-chat": "AI-ассистент",
};

// ── Tab renderers registry ──
const renderers = {};
export function registerTab(id, renderFn) {
  renderers[id] = renderFn;
}

// ── Switch tab ──
export async function switchTab(id) {
  curTab  = id;
  weekOff = 0;
  document.querySelectorAll(".nt").forEach(t => t.classList.toggle("on", t.dataset.tab === id));
  document.querySelectorAll(".mod").forEach(m => m.classList.remove("on"));
  $("tab-" + id)?.classList.add("on");
  $("tb-ttl").textContent = TAB_TITLES[id] || id;
  closeSidebar();
  if (renderers[id]) await renderers[id]();
}

// ── Sidebar ──
export function openSidebar()  {
  $("sidebar").classList.add("open");
  $("sb-ov").classList.add("on");
}
export function closeSidebar() {
  $("sidebar").classList.remove("open");
  $("sb-ov").classList.remove("on");
}

// ── Month names ──
const MGEN  = ["января","февраля","марта","апреля","мая","июня",
               "июля","августа","сентября","октября","ноября","декабря"];
const DS    = ["Вс","Пн","Вт","Ср","Чт","Пт","Сб"];
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

// ── Day nav builder ──
export function buildDayNav(selDate, datesWT, showAll, containerId, onDay, onAll) {
  const today2 = new Date(); today2.setHours(0,0,0,0);
  const lbl = dstr(selDate) === dstr(today2)
    ? `Сегодня, ${selDate.getDate()} ${capitalize(MGEN[selDate.getMonth()])}`
    : `${selDate.getDate()} ${MGEN[selDate.getMonth()]} ${selDate.getFullYear()}`;

  // Build 7-day strip starting from Monday
  const mon = new Date(selDate);
  const dow = mon.getDay();
  mon.setDate(mon.getDate() - (dow === 0 ? 6 : dow - 1) + weekOff * 7);

  let btns = "";
  for (let i = 0; i < 7; i++) {
    const d   = new Date(mon); d.setDate(mon.getDate() + i);
    const sel = dstr(d) === dstr(selDate);
    const dot = datesWT.has(dstr(d));
    btns += `<button class="ds-day ${sel?"on":""} ${dot?"has-dot":""}"
      data-date="${dstr(d)}">${d.getDate()}</button>`;
  }

  $(containerId).innerHTML = `
    <div class="dn-row">
      <button class="dn-date" id="${containerId}-lbl">${lbl}</button>
    </div>
    <div class="day-strip">
      <button class="ds-arr" id="${containerId}-pw">←</button>
      ${btns}
      <button class="ds-arr" id="${containerId}-nw">→</button>
      <button class="ds-all ${showAll?"on":""}" id="${containerId}-all">Все</button>
    </div>`;

  $(`${containerId}-lbl`).onclick = () => { window._calCb = d => onDay(d); window.openCal(); };
  $(`${containerId}-pw`).onclick  = () => { weekOff--; if(renderers[curTab]) renderers[curTab](); };
  $(`${containerId}-nw`).onclick  = () => { weekOff++; if(renderers[curTab]) renderers[curTab](); };
  $(`${containerId}-all`).onclick = onAll;
  $(containerId).querySelectorAll(".ds-day").forEach(b =>
    b.addEventListener("click", () => { weekOff = 0; onDay(new Date(b.dataset.date)); })
  );
}

// ── Item card builder (shared between plan, dashboard) ──
export function taskCard(t, goals, projects, opts = {}) {
  const { clickable = true, isKeyTask = false } = opts;
  const dl       = t.deadline;
  const isRecurring = t.recurrence && t.recurrence.type && t.recurrence.type !== "none";
  const ov       = dl && window._isOv(dl) && !t.done && !isRecurring;
  const goalName = goals.find(g => g.id === t.goalId)?.title || "";
  const projName = projects.find(p => p.id === t.projId)?.name || "";
  const priTag   = t.priority === "high" ? `<span class="ic-tag tag-pri-high">🔴 Высокий</span>`
    : (t.priority === "med" || t.priority === "medium") ? `<span class="ic-tag tag-pri-med">🟡 Средний</span>`
    : t.priority === "low" ? `<span class="ic-tag tag-pri-low">🟢 Низкий</span>` : "";
  const subs = t.subtasks?.length
    ? `<div class="ic-sub-list">${t.subtasks.map(s => `<div class="ic-sub-item">— ${window._esc(s)}</div>`).join("")}</div>` : "";
  const attachIcon  = t.attachments?.length ? `<span class="ic-tag" style="background:rgba(123,79,30,.1)">📎 ${t.attachments.length}</span>` : "";
  const remindIcon  = t.reminder ? `<span class="ic-tag" style="background:rgba(200,150,62,.15)">🔔</span>` : "";
  const recurLabels = { daily:"🔄 Ежедневно", weekly:"🔄 Еженедельно", monthly:"🔄 Ежемесячно" };
  const recurIcon   = isRecurring
    ? `<span class="ic-tag" style="background:rgba(39,201,147,.12);color:#27C993">${recurLabels[t.recurrence.type] || "🔄"}</span>` : "";
  const aiIcon      = t.fromAi ? `<span class="ic-tag ai-tag">✨ AI</span>` : "";
  const dispIcon    = t.displaced ? `<span class="ic-tag" style="background:rgba(192,64,48,.1);color:var(--red)">↩ вытеснена</span>` : "";
  const keyBadge    = isKeyTask ? `<div class="key-task-badge">★ Ключевая цель дня</div>` : "";

  // Блок метрик — показывается после выполнения задачи
  const energyLabels = ["","💀","😔","😐","🙂","🚀"];
  const energyTips   = ["","Сильно вымотало","Немного устал","Нейтрально","Дало сил","Мощный заряд!"];
  let doneBlock = "";
  if (t.done) {
    // Энергия — эмодзи в ряд
    const enBtns = [1,2,3,4,5].map(n =>
      `<button class="en-btn ${(t.energyScore||0)===n?"on e"+n:""}" title="${energyTips[n]}"
        onclick="event.stopPropagation();window._saveEnergy('${t.id}',${n},this)">${energyLabels[n]}</button>`
    ).join("");
    // Мотив — 2 кнопки с эмодзи
    const motivMap = {"долг":"😤 долг","хочу":"😊 хочу"};
    const motivBtns = ["долг","хочу"].map(v =>
      `<button class="metric-btn ${(t.motiv||'')===v?'on':''}" data-val="${v}"
        onclick="event.stopPropagation();window._saveMetric('${t.id}','motiv','${v}',this)">${motivMap[v]}</button>`
    ).join("");
    // Авторское
    const authorMap = {"да":"✍️ да","нет":"🔁 нет"};
    const authorBtns = ["да","нет"].map(v =>
      `<button class="metric-btn ${(t.authorAction||'')===v?'on':''}" data-val="${v}"
        onclick="event.stopPropagation();window._saveMetric('${t.id}','authorAction','${v}',this)">${authorMap[v]}</button>`
    ).join("");
    // Страх
    const fearMap = {"есть":"😨 есть","нет":"😌 нет"};
    const fearBtns = ["есть","нет"].map(v =>
      `<button class="metric-btn ${(t.fearLink||'')===v?'on':''}" data-val="${v}"
        onclick="event.stopPropagation();window._saveMetric('${t.id}','fearLink','${v}',this)">${fearMap[v]}</button>`
    ).join("");

    doneBlock = `<div class="metrics-block">
      <div class="metrics-row"><span class="metrics-lbl">⚡</span><div class="en-btns">${enBtns}</div></div>
      <div class="metrics-row"><span class="metrics-lbl">Мотив</span><div class="metric-btns">${motivBtns}</div></div>
      <div class="metrics-row"><span class="metrics-lbl">Страх</span><div class="metric-btns">${fearBtns}</div></div>
    </div>`;
  }

  const clickAttr = clickable ? 'onclick="window.editTask(\'' + t.id + '\')"' : "";
  return `<div class="icard ${t.done?"done":""} ${t.displaced?"displaced":""} ${isKeyTask?"key-task":""}" ${clickAttr}>
    ${keyBadge}
    <div class="ic-chk ${t.done?"on":""}" onclick="event.stopPropagation();window.toggleTask('${t.id}')">${t.done?"✓":""}</div>
    <div class="ic-body">
      <div class="ic-ttl">${window._esc(t.title)}</div>
      <div class="ic-meta">
        ${dl && !isRecurring ? `<span class="ic-tag tag-dl ${ov?"ov":""}">${window._fdt(dl)}</span>` : ""}
        ${goalName ? `<span class="ic-tag tag-goal">↳ ${window._esc(goalName)}</span>` : ""}
        ${projName ? `<span class="ic-tag tag-proj">${window._esc(projName)}</span>` : ""}
        ${priTag}${attachIcon}${remindIcon}${recurIcon}${aiIcon}${dispIcon}
      </div>
      ${subs}
      ${t.note ? `<div style="font-size:11px;color:var(--tx-m);margin-top:4px">${window._esc(t.note)}</div>` : ""}
      ${doneBlock}
    </div>
    <div class="ic-acts">
      <button class="ib del" onclick="event.stopPropagation();window.delItem('tasks','${t.id}')">🗑</button>
    </div>
  </div>`;}