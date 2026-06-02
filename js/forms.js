// ════════════════════════════════════════
//  FORMS — v5  Life Evolution дизайн
//  js/forms.js
//
//  Все модалки переработаны под скрины:
//   — Задача:  вкладки, метрики 1-10, связь с целью
//   — Цель:    уровни, сферы, почему важно
//   — Проект:  горизонт, вехи, ожидаемый результат
//   — Идея:    теги-таблетки, связь с целью/проектом
//   — Дневник: энергия+/-, теги, настроение
// ════════════════════════════════════════

import { openModal, closeModal, toast,
         getSubtasks, getActivePriority, setPriority, addSubRow } from "./modal.js";
import {
  addTask, updateTask, deleteTask,
  addGoal, updateGoal, deleteGoal,
  addProject, updateProject,
  addIdea, updateIdea, getIdeas,
  addDiaryEntry, updateDiaryEntry, getDiary,
  addTemplate, getTemplates,
  getGoals, getProjects, getTasks,
  saveDailyAudit, calcAuthorRatio, getAuditForDate,
  esc, toTS, today, dstr
} from "./db.js";
import { uploadAttachment } from "./storage.js";

const $ = id => document.getElementById(id);

// ════════════════════════════════════════
//  ДАТА-ПИКЕР (сохранён полностью)
// ════════════════════════════════════════
const MONTHS_RU  = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const DAYS_SHORT = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];

function makeDateField(id, withTime, initVal = "") {
  const wrap   = document.createElement("div");
  wrap.className   = "dtp-wrap";
  wrap.dataset.id  = id;
  const hidden = document.createElement("input");
  hidden.type  = "hidden"; hidden.id = id; hidden.value = initVal;
  const btn    = document.createElement("button");
  btn.type = "button"; btn.className = "dtp-btn inp"; btn.dataset.for = id;

  // ── Иконка календаря + текст ──
  btn.innerHTML = `<svg style="width:14px;height:14px;margin-right:6px;flex-shrink:0;opacity:.6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
  <span>${initVal ? formatDisplay(initVal, withTime) : withTime ? "Дата и время..." : "Дата..."}</span>`;

  const clear  = document.createElement("button");
  clear.type = "button"; clear.className = "dtp-clear"; clear.title = "Очистить"; clear.textContent = "×";
  clear.onclick = e => {
    e.stopPropagation();
    hidden.value = "";
    btn.querySelector("span").textContent = withTime ? "Дата и время..." : "Дата...";
    btn.classList.remove("has-val");
  };
  wrap.appendChild(hidden); wrap.appendChild(btn); wrap.appendChild(clear);
  btn.onclick = () => openDtpPopup(btn, hidden, withTime);
  return wrap;
}

function formatDisplay(val, withTime) {
  if (!val) return "";
  const dt = new Date(val); if (isNaN(dt)) return val;
  const MONTHS_SHORT = ["янв","фев","мар","апр","мая","июн","июл","авг","сен","окт","ноя","дек"];
  const d = dt.getDate(), m = MONTHS_SHORT[dt.getMonth()], y = dt.getFullYear();
  if (!withTime) return `${d} ${m} ${y}`;
  const hh = String(dt.getHours()).padStart(2,"0"), mm = String(dt.getMinutes()).padStart(2,"0");
  return `${d} ${m} ${y}  ${hh}:${mm}`;
}

function openDtpPopup(btn, hidden, withTime) {
  document.getElementById("dtp-popup")?.remove();
  const id = hidden.id || '';
  let initVal = hidden.value;
  if (!initVal) {
    const now = new Date(); const todayStr = dstr(now); const pad = n => String(n).padStart(2,"0");
    if (id.includes("start") || id === "t-start" || id === "et-st") {
      const mins = Math.ceil(now.getMinutes()/5)*5; const h = mins>=60?now.getHours()+1:now.getHours(); const m = mins>=60?0:mins;
      initVal = `${todayStr}T${pad(h%24)}:${pad(m)}`;
    } else if (id.includes("dl")||id.includes("deadline")||id.includes("end")) {
      const startId = id.startsWith("et")?"et-st":"t-start"; const startVal = document.getElementById(startId)?.value||'';
      const datePart = startVal?startVal.slice(0,10):todayStr; initVal = `${datePart}T23:00`;
    } else if (id.includes("until")) {
      const startId = id.startsWith("et")?"et-st":"t-start"; const startVal = document.getElementById(startId)?.value||'';
      const datePart = startVal?startVal.slice(0,10):todayStr; initVal = `${datePart}T23:00`;
    }
  }
  let initNorm = initVal||'';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(initNorm)) initNorm += ":00";
  const existing = initNorm ? new Date(initNorm) : new Date();
  let selYear=existing.getFullYear(), selMonth=existing.getMonth(), selDay=initVal?existing.getDate():null;
  let selHour=existing.getHours(), selMin=Math.round(existing.getMinutes()/5)*5;
  const popup = document.createElement("div"); popup.id="dtp-popup"; popup.className="dtp-popup";
  let overlay;
  function renderFull() {
    const y=selYear, m=selMonth; const fd=new Date(y,m,1).getDay(); const off=fd===0?6:fd-1; const days=new Date(y,m+1,0).getDate();
    const tod=new Date(); tod.setHours(0,0,0,0); const todStr=dstr(tod);
    let grid=DAYS_SHORT.map(d=>`<div class="dtp-dh">${d}</div>`).join("");
    for(let i=0;i<off;i++) grid+=`<div class="dtp-dc other"></div>`;
    for(let d=1;d<=days;d++){const ds=`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;const cls=["dtp-dc",ds===todStr?"today":"",selDay===d?"sel":""].filter(Boolean).join(" ");grid+=`<div class="${cls}" data-d="${d}">${d}</div>`;}
    const timeHtml=withTime?`<div class="dtp-time"><div class="dtp-time-lbl">Время</div><div class="dtp-time-row"><div class="dtp-spinner"><button class="dtp-spin-btn" data-action="hour-up">▲</button><div class="dtp-spin-val" id="dtp-hh">${String(selHour).padStart(2,"0")}</div><button class="dtp-spin-btn" data-action="hour-dn">▼</button></div><div class="dtp-time-sep">:</div><div class="dtp-spinner"><button class="dtp-spin-btn" data-action="min-up">▲</button><div class="dtp-spin-val" id="dtp-mm">${String(selMin).padStart(2,"0")}</div><button class="dtp-spin-btn" data-action="min-dn">▼</button></div></div></div>`:"";
    popup.innerHTML=`<div class="dtp-hd"><button class="dtp-nav" id="dtp-pm">‹</button><span class="dtp-mo">${MONTHS_RU[m]} ${y}</span><button class="dtp-nav" id="dtp-nm">›</button></div><div class="dtp-grid" id="dtp-grid">${grid}</div>${timeHtml}<div class="dtp-footer"><button class="dtp-cancel">Отмена</button><button class="dtp-confirm" id="dtp-confirm-btn" ${selDay===null?"disabled":""}>Выбрать</button></div>`;
    wireEvents();
  }
  function updateDay(){popup.querySelectorAll(".dtp-dc:not(.other)").forEach(dc=>{dc.classList.toggle("sel",parseInt(dc.dataset.d)===selDay);});const cb=document.getElementById("dtp-confirm-btn");if(cb)cb.disabled=selDay===null;}
  function wireEvents(){
    popup.querySelector("#dtp-pm").onclick=e=>{e.stopPropagation();e.preventDefault();selMonth--;if(selMonth<0){selMonth=11;selYear--;}renderFull();};
    popup.querySelector("#dtp-nm").onclick=e=>{e.stopPropagation();e.preventDefault();selMonth++;if(selMonth>11){selMonth=0;selYear++;}renderFull();};
    popup.querySelector("#dtp-grid").addEventListener("click",e=>{const dc=e.target.closest(".dtp-dc:not(.other)");if(!dc)return;e.stopPropagation();e.preventDefault();selDay=parseInt(dc.dataset.d);updateDay();});
    popup.addEventListener("mousedown",e=>{e.preventDefault();});
    popup.addEventListener("touchstart",e=>{e.stopPropagation();},{passive:true});
    popup.querySelectorAll("button,.dtp-dc").forEach(el=>{el.setAttribute("tabindex","-1");el.style.touchAction="manipulation";});
    popup.querySelectorAll(".dtp-spin-btn").forEach(sb=>{sb.onclick=e=>{e.stopPropagation();e.preventDefault();const a=sb.dataset.action;if(a==="hour-up")selHour=(selHour+1)%24;if(a==="hour-dn")selHour=(selHour+23)%24;if(a==="min-up")selMin=(selMin+5)%60;if(a==="min-dn")selMin=(selMin+55)%60;const hh=document.getElementById("dtp-hh");const mm=document.getElementById("dtp-mm");if(hh)hh.textContent=String(selHour).padStart(2,"0");if(mm)mm.textContent=String(selMin).padStart(2,"0");};});
    popup.querySelector(".dtp-cancel").onclick=e=>{e.stopPropagation();e.preventDefault();if(overlay)overlay.remove();else popup.remove();if(vp)vp.content=vpOrig;};
    popup.querySelector("#dtp-confirm-btn").onclick=e=>{e.stopPropagation();e.preventDefault();if(!selDay)return;const dateStr=`${selYear}-${String(selMonth+1).padStart(2,"0")}-${String(selDay).padStart(2,"0")}`;const val=withTime?`${dateStr}T${String(selHour).padStart(2,"0")}:${String(selMin).padStart(2,"0")}`:dateStr;hidden.value=val;const sp=btn.querySelector("span");if(sp)sp.textContent=formatDisplay(val,withTime);btn.classList.add("has-val");if(overlay)overlay.remove();else popup.remove();if(vp)vp.content=vpOrig;};
  }
  renderFull();
  const vp=document.querySelector("meta[name=viewport]"); const vpOrig=vp?.content||'';
  if(vp)vp.content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no";
  overlay=document.createElement("div"); overlay.style.cssText="position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.5);backdrop-filter:blur(2px);";
  overlay.onclick=()=>{overlay.remove();if(vp)vp.content=vpOrig;}; overlay.appendChild(popup);
  const popupW=300, popupH=withTime?420:320, vw=window.innerWidth, vh=window.innerHeight;
  const left=Math.max(8,Math.min(Math.round((vw-popupW)/2),vw-popupW-8));
  const top=Math.max(8,Math.min(Math.round((vh-popupH)/2),vh-popupH-8));
  popup.style.cssText=`position:absolute;z-index:10000;top:${top}px;left:${left}px;width:${popupW}px;`;
  document.body.appendChild(overlay); popup.onclick=e=>e.stopPropagation();
}

function dtpVal(id) { return ($( id)?.value||'').trim(); }

// ════════════════════════════════════════
//  METRIC SLIDER — компонент шкала 1-10
//  По скрину: иконка + название + значение X/10
// ════════════════════════════════════════
function metricSlider(id, label, icon, color, value = 5) {
  return `
    <div class="mslider-card">
      <div class="mslider-header">
        <span class="mslider-ico">${icon}</span>
        <span class="mslider-label" style="color:${color}">${label}</span>
      </div>
      <div class="mslider-value-row">
        <span class="mslider-ico-big">${icon}</span>
        <span class="mslider-val" id="${id}-val" style="color:${color}">${value}/10</span>
      </div>
      <input type="range" class="mslider-range" id="${id}"
        min="1" max="10" value="${value}"
        style="--mslider-color:${color}"
        oninput="document.getElementById('${id}-val').textContent=this.value+'/10'"/>
    </div>`;
}

// ════════════════════════════════════════
//  LINK FIELD — поле "Связь с целью/проектом"
//  По скрину: иконка + название + тип + кнопки × и ▾
// ════════════════════════════════════════
function renderLinkField(containerId, goals, projects, selectedGoalId, selectedProjId) {
  const cont = document.getElementById(containerId);
  if (!cont) return;

  const selectedGoal = goals.find(g => g.id === selectedGoalId);
  const selectedProj = projects.find(p => p.id === selectedProjId);

  if (selectedGoal || selectedProj) {
    const item = selectedProj || selectedGoal;
    const type = selectedProj ? "Проект" : "Цель";
    const icon = selectedProj ? "📁" : "🎯";
    cont.innerHTML = `
      <div class="link-field-selected">
        <span class="link-field-ico">${icon}</span>
        <div class="link-field-info">
          <div class="link-field-name">${esc(selectedProj ? item.name : item.title)}</div>
          <div class="link-field-type">${type}</div>
        </div>
        <button type="button" class="link-field-clear"
          onclick="window._clearLink('${containerId}')">×</button>
        <button type="button" class="link-field-chevron"
          onclick="window._openLinkPicker('${containerId}')">▾</button>
      </div>`;
  } else {
    cont.innerHTML = `
      <button type="button" class="link-field-empty"
        onclick="window._openLinkPicker('${containerId}')">
        <span class="link-field-empty-ico">+</span>
        Связать с целью или проектом
        <span class="link-field-chevron-ico">▾</span>
      </button>`;
  }
}

// Пикер привязки
window._openLinkPicker = (containerId) => {
  document.getElementById("link-picker-popup")?.remove();
  const popup = document.createElement("div");
  popup.id = "link-picker-popup";
  popup.className = "link-picker-popup";

  Promise.all([getGoals(), getProjects()]).then(([goals, projects]) => {
    const activeGoals = goals.filter(g => !g.done);
    const activeProjs = projects.filter(p => !p.done);
    popup.innerHTML = `
      <div class="link-picker-header">
        <span>Выбрать связь</span>
        <button onclick="document.getElementById('link-picker-popup')?.remove()">×</button>
      </div>
      ${activeGoals.length ? `
        <div class="link-picker-section">Цели</div>
        ${activeGoals.map(g => `
          <button class="link-picker-item"
            onclick="window._selectLink('${containerId}','goal','${g.id}','${esc(g.title)}')">
            <span>🎯</span><span>${esc(g.title)}</span>
          </button>`).join("")}` : ""}
      ${activeProjs.length ? `
        <div class="link-picker-section">Проекты</div>
        ${activeProjs.map(p => `
          <button class="link-picker-item"
            onclick="window._selectLink('${containerId}','proj','${p.id}','${esc(p.name)}')">
            <span>📁</span><span>${esc(p.name)}</span>
          </button>`).join("")}` : ""}
      ${!activeGoals.length && !activeProjs.length
        ? '<div class="link-picker-empty">Целей и проектов нет</div>' : ""}`;
    document.body.appendChild(popup);
  });
};

window._selectLink = (containerId, type, id, name) => {
  const cont = document.getElementById(containerId);
  if (!cont) { document.getElementById("link-picker-popup")?.remove(); return; }
  const icon = type === "proj" ? "📁" : "🎯";
  const typeLabel = type === "proj" ? "Проект" : "Цель";
  cont.innerHTML = `
    <div class="link-field-selected">
      <span class="link-field-ico">${icon}</span>
      <div class="link-field-info">
        <div class="link-field-name">${name}</div>
        <div class="link-field-type">${typeLabel}</div>
      </div>
      <button type="button" class="link-field-clear"
        onclick="window._clearLink('${containerId}')">×</button>
      <button type="button" class="link-field-chevron"
        onclick="window._openLinkPicker('${containerId}')">▾</button>
    </div>`;
  cont.dataset.type = type;
  cont.dataset.id   = id;
  document.getElementById("link-picker-popup")?.remove();
};

window._clearLink = (containerId) => {
  const cont = document.getElementById(containerId);
  if (!cont) return;
  delete cont.dataset.type; delete cont.dataset.id;
  cont.innerHTML = `
    <button type="button" class="link-field-empty"
      onclick="window._openLinkPicker('${containerId}')">
      <span class="link-field-empty-ico">+</span>
      Связать с целью или проектом
      <span class="link-field-chevron-ico">▾</span>
    </button>`;
};

function getLinkValue(containerId) {
  const cont = document.getElementById(containerId);
  if (!cont) return { goalId: null, projId: null };
  const type = cont.dataset.type;
  const id   = cont.dataset.id;
  if (!type || !id) return { goalId: null, projId: null };
  return {
    goalId: type === "goal" ? id : null,
    projId: type === "proj" ? id : null,
  };
}

// ════════════════════════════════════════
//  TAG PILLS — таблетки-теги
// ════════════════════════════════════════
function renderTagPills(containerId, tags, prefix) {
  const cont = document.getElementById(containerId);
  if (!cont) return;
  cont.innerHTML = tags.map(t =>
    `<button type="button" class="tag-pill on"
      onclick="window._removeTag('${containerId}','${t}','${prefix}')">
      ${esc(t)} ×
    </button>`
  ).join("") +
  `<button type="button" class="tag-pill-add"
    onclick="window._promptTag('${containerId}','${prefix}')">+ Добавить тег</button>`;
}

window._removeTag = (containerId, tag, prefix) => {
  if (!window[`_tags_${prefix}`]) return;
  window[`_tags_${prefix}`] = window[`_tags_${prefix}`].filter(t => t !== tag);
  renderTagPills(containerId, window[`_tags_${prefix}`], prefix);
};

window._promptTag = (containerId, prefix) => {
  const val = window.prompt("Введите тег:");
  if (!val?.trim()) return;
  const t = val.trim().toLowerCase().replace(/\s+/g, "-");
  if (!window[`_tags_${prefix}`]) window[`_tags_${prefix}`] = [];
  if (!window[`_tags_${prefix}`].includes(t)) {
    window[`_tags_${prefix}`].push(t);
    renderTagPills(containerId, window[`_tags_${prefix}`], prefix);
  }
};

// ════════════════════════════════════════
//  SPHERE PILLS — ключевые сферы (для цели)
// ════════════════════════════════════════
const SPHERES = ["Финансы","Свобода","Рост","Здоровье","Влияние","Семья","Творчество","Работа"];

function renderSpherePills(containerId, selected) {
  const cont = document.getElementById(containerId);
  if (!cont) return;
  cont.innerHTML = SPHERES.map(s =>
    `<button type="button" class="sphere-pill ${selected.includes(s) ? "on" : ""}"
      onclick="window._toggleSphere('${containerId}','${s}')">
      ${esc(s)}
    </button>`
  ).join("") +
  `<button type="button" class="sphere-pill-add"
    onclick="window._promptSphere('${containerId}')">+</button>`;
}

window._toggleSphere = (containerId, sphere) => {
  const btn = document.querySelector(`#${containerId} .sphere-pill[onclick*="${sphere}"]`);
  if (!btn) return;
  btn.classList.toggle("on");
};

window._promptSphere = (containerId) => {
  const val = window.prompt("Введите сферу:");
  if (!val?.trim()) return;
  const cont = document.getElementById(containerId);
  if (!cont) return;
  const btn = document.createElement("button");
  btn.type = "button"; btn.className = "sphere-pill on";
  btn.textContent = val.trim();
  btn.onclick = () => btn.classList.toggle("on");
  cont.querySelector(".sphere-pill-add")?.before(btn);
};

function getSelectedSpheres(containerId) {
  return [...document.querySelectorAll(`#${containerId} .sphere-pill.on`)]
    .map(b => b.textContent.trim()).filter(Boolean);
}

// ════════════════════════════════════════
//  MODAL TABS — переключение Основное/Дополнительно
// ════════════════════════════════════════
function setupModalTabs() {
  const tabs = document.querySelectorAll(".m-tab-btn");
  const panes = document.querySelectorAll(".m-tab-pane");
  tabs.forEach(tab => {
    tab.onclick = () => {
      tabs.forEach(t => t.classList.remove("on"));
      panes.forEach(p => p.classList.remove("on"));
      tab.classList.add("on");
      const target = document.getElementById(tab.dataset.pane);
      if (target) target.classList.add("on");
    };
  });
}

// ════════════════════════════════════════
//  СОЗДАНИЕ ЗАДАЧИ
// ════════════════════════════════════════
export async function buildTaskModal(title, defGoalId = null, defProjId = null, defaultDate = null) {
  let [goals, projects] = await Promise.all([getGoals(), getProjects()]);
  goals    = goals.filter(g => !g.done);
  projects = projects.filter(p => !p.done);
  window._tags_task = [];

  const defGoal = goals.find(g => g.id === defGoalId);
  const defProj = projects.find(p => p.id === defProjId);

  $("m-body").innerHTML = `
    <!-- Вкладки -->
    <div class="m-tabs">
      <button class="m-tab-btn on" data-pane="task-pane-main">Основное</button>
      <button class="m-tab-btn" data-pane="task-pane-extra">Дополнительно</button>
    </div>

    <!-- Основное -->
    <div class="m-tab-pane on" id="task-pane-main">

      <div class="mf-group">
        <label class="mf-label">Название задачи</label>
        <input class="mf-input" id="t-title" placeholder="Название задачи"/>
      </div>

      <div class="mf-row">
        <div class="mf-group mf-group-half">
          <label class="mf-label">Связь с целью</label>
          <div id="t-link-field"
            ${defProj ? `data-type="proj" data-id="${defProj.id}"` : defGoal ? `data-type="goal" data-id="${defGoal.id}"` : ""}
          ></div>
        </div>
        <div class="mf-group mf-group-half">
          <label class="mf-label">Смысл / Почему это важно?</label>
          <textarea class="mf-textarea mf-textarea-sm" id="t-why"
            placeholder="Это приближает меня к..." maxlength="200"></textarea>
          <div class="mf-counter"><span id="t-why-cnt">0</span>/200</div>
        </div>
      </div>

      <!-- Метрики 1-10 -->
      <div class="mf-metrics-grid">
        ${metricSlider("t-importance",   "Важность",    "⭐", "#7C5CFF", 5)}
        ${metricSlider("t-urgency",      "Срочность",   "⏱",  "#FFB84D", 5)}
        ${metricSlider("t-energy-cost",  "Энергоёмкость","⚡","#4DFFB4", 5)}
        ${metricSlider("t-resistance",   "Сопротивление","🛡", "#FF6B6B", 5)}
      </div>

      <div class="mf-row">
        <div class="mf-group mf-group-half">
          <label class="mf-label">Оценка времени</label>
          <select class="mf-select" id="t-duration">
            <option value="">— Не указано —</option>
            <option value="15">15 мин</option>
            <option value="30">30 мин</option>
            <option value="60">1 ч</option>
            <option value="90">1 ч 30 мин</option>
            <option value="120">2 ч</option>
            <option value="150">2 ч 30 мин</option>
            <option value="180">3 ч</option>
            <option value="240">4 ч</option>
            <option value="480">8 ч (весь день)</option>
          </select>
        </div>
        <div class="mf-group mf-group-half">
          <label class="mf-label">Приоритет</label>
          <div class="mf-pri-row">
            <button type="button" class="mf-pri-btn" data-pri="high" onclick="window._setPri('high')">🔴 Высокий</button>
            <button type="button" class="mf-pri-btn on-med" data-pri="med" onclick="window._setPri('med')">🟡 Средний</button>
            <button type="button" class="mf-pri-btn" data-pri="low" onclick="window._setPri('low')">🟢 Низкий</button>
          </div>
        </div>
      </div>

      <div class="mf-group">
        <label class="mf-label">Подзадачи</label>
        <div id="sub-list" class="mf-subtasks-list"></div>
        <button type="button" class="mf-add-sub-btn"
          onclick="window._addTaskSubtask()">+ Добавить подзадачу</button>
      </div>
    </div>

    <!-- Дополнительно -->
    <div class="m-tab-pane" id="task-pane-extra">

      <div class="mf-group">
        <label class="mf-label">Примечание</label>
        <textarea class="mf-textarea" id="t-note" placeholder="Дополнительные заметки..."></textarea>
      </div>

      <!-- Строка 1: Начало / Дедлайн -->
      <div class="mf-row">
        <div class="mf-group mf-group-half">
          <label class="mf-label">Начало</label>
          <div id="t-start-field"></div>
        </div>
        <div class="mf-group mf-group-half">
          <label class="mf-label">Дедлайн</label>
          <div id="t-dl-field"></div>
        </div>
      </div>

      <!-- Строка 2: Повторить до / Напоминание -->
      <div class="mf-row">
        <div class="mf-group mf-group-half">
          <label class="mf-label">Повторить до</label>
          <div id="t-until-field-row" style="display:none"><div id="t-until-field"></div></div>
          <div id="t-until-placeholder" style="color:var(--tx-l);font-size:12px;font-style:italic">Задайте повторение выше</div>
        </div>
        <div class="mf-group mf-group-half">
          <label class="mf-label">Напоминание</label>
          <div id="t-reminder-field"></div>
        </div>
      </div>

      <div class="mf-group">
        <label class="mf-label">Повторение</label>
        <div class="mf-recur-btns" id="t-recur-types">
          <button type="button" class="mf-recur-btn on" data-val="none" onclick="window._setRecurType(this,'t')">Нет</button>
          <button type="button" class="mf-recur-btn" data-val="daily"   onclick="window._setRecurType(this,'t')">Ежедневно</button>
          <button type="button" class="mf-recur-btn" data-val="weekly"  onclick="window._setRecurType(this,'t')">Еженедельно</button>
          <button type="button" class="mf-recur-btn" data-val="monthly" onclick="window._setRecurType(this,'t')">Ежемесячно</button>
        </div>
        <input type="hidden" id="t-recurrence-type" value="none"/>
        <div id="t-recur-weekdays" class="recur-weekdays" style="display:none">
          ${[1,2,3,4,5,6,0].map((d,i)=>`<button type="button" class="recur-wd-btn" data-day="${d}" onclick="window._toggleWd(this)">${["Пн","Вт","Ср","Чт","Пт","Сб","Вс"][i]}</button>`).join("")}
        </div>
        <div id="t-recur-monthdays" class="recur-monthdays" style="display:none">
          <div class="recur-md-lbl">Числа месяца:</div>
          <div class="recur-md-grid">${Array.from({length:31},(_,i)=>i+1).map(d=>`<button type="button" class="recur-md-btn" data-day="${d}" onclick="window._toggleMd(this)">${d}</button>`).join("")}</div>
        </div>
        <div id="t-recur-until-row" style="display:none">
          <div class="mf-group" style="margin-top:8px"><label class="mf-label">Повторять до</label><div id="t-until-field"></div></div>
        </div>
      </div>

    </div>`;

  // Передаём HTML в openModal — он записывает в m-body синхронно
  const _taskHtml = $("m-body").innerHTML;
  openModal(title || "Новая задача", _taskHtml, async () => {
    const titleVal = $("t-title")?.value.trim();
    if (!titleVal) { toast("⚠️ Введите название задачи"); return; }
    const { goalId, projId } = getLinkValue("t-link-field");
    const recType   = $("t-recurrence-type")?.value || "none";
    const untilVal  = recType !== "none" ? (dtpVal("t-until") || null) : null;
    const weekdays  = recType === "weekly" ? [...document.querySelectorAll("#t-recur-weekdays .recur-wd-btn.on")].map(b=>parseInt(b.dataset.day)) : [];
    const monthdays = recType === "monthly" ? [...document.querySelectorAll("#t-recur-monthdays .recur-md-btn.on")].map(b=>parseInt(b.dataset.day)) : [];
    const startRaw = dtpVal("t-start");
    const dlRaw    = dtpVal("t-dl");
    const dur      = parseInt($("t-duration")?.value) || null;
    try {
      await addTask({
        title:       titleVal,
        note:        $("t-note")?.value.trim() || '',
        why:         $("t-why")?.value.trim() || '',
        goalId, projId,
        deadline:    dlRaw || null,
        startDate:   startRaw || null,
        priority:    getActivePriority(),
        subtasks:    [...($("sub-list")?.querySelectorAll(".mf-subtask-row") || [])].map(row => {
          const cb    = row.querySelector("input[type=checkbox]");
          const inp   = row.querySelector("input.mf-sub-inp") || row.querySelector("input:not([type=checkbox])");
          const title = inp?.value.trim() || "";
          const done  = cb?.checked || false;
          return title ? { title, done } : null;
        }).filter(Boolean),
        date:        startRaw ? startRaw.slice(0,10) : (defaultDate || today()),
        reminder:    dtpVal("t-reminder") || null,
        duration:    dur,
        importance:  parseInt(document.getElementById("t-importance")?.value) || 5,
        urgency:     parseInt(document.getElementById("t-urgency")?.value) || 5,
        energyCost:  parseInt(document.getElementById("t-energy-cost")?.value) || 5,
        resistance:  parseInt(document.getElementById("t-resistance")?.value) || 5,
        recurrence: recType !== "none" ? {
          type:      recType, interval: 1, until: untilVal,
          weekdays:  recType === "weekly"  && weekdays.length  ? weekdays  : null,
          monthdays: recType === "monthly" && monthdays.length ? monthdays : null,
        } : null,
      });
      toast("Задача создана ✓");
      closeModal();
      window._refreshAll?.();
    } catch(e) { toast("⚠️ " + e.message); }
  });

  // Вставляем компоненты ПОСЛЕ openModal (m-body уже содержит HTML)
  renderLinkField("t-link-field", goals, projects, defGoalId, defProjId);
  const dlFieldEl = $("t-dl-field");
  if (dlFieldEl) {
    // Дедлайн: дата + время, дефолт 23:00 текущего дня
    const dlDefault = defaultDate
      ? defaultDate + "T23:00"
      : (today() + "T23:00");
    dlFieldEl.replaceWith(makeDateField("t-dl", true, dlDefault));
  }
  const startFieldEl = $("t-start-field");
  if (startFieldEl) startFieldEl.replaceWith(makeDateField("t-start", true));
  const remFieldEl = $("t-reminder-field");
  if (remFieldEl) remFieldEl.replaceWith(makeDateField("t-reminder", true));
  const untilFieldEl = $("t-until-field");
  if (untilFieldEl) untilFieldEl.replaceWith(makeDateField("t-until", false));
  $("t-why")?.addEventListener("input", () => {
    const cnt = $("t-why-cnt"); if (cnt) cnt.textContent = $("t-why").value.length;
  });
  setupModalTabs();
  const saveBtn = $("m-save"); if (saveBtn) saveBtn.textContent = "Создать задачу";
  const cancelBtn = $("m-cancel"); if (cancelBtn) cancelBtn.textContent = "Отмена";
  document.addEventListener("click", function closePicker(e) {
    if (!e.target.closest(".link-picker-popup") &&
        !e.target.closest(".link-field-empty") &&
        !e.target.closest(".link-field-chevron")) {
      document.getElementById("link-picker-popup")?.remove();
      document.removeEventListener("click", closePicker);
    }
  });

}

window._addTaskSubtask = () => {
  const list = $("sub-list");
  if (!list) return;
  const row = document.createElement("div");
  row.className = "mf-subtask-row";
  row.innerHTML = `
    <input type="checkbox" class="mf-sub-check"
      onchange="this.nextElementSibling.classList.toggle('done-sub',this.checked)"/>
    <input class="mf-input mf-sub-inp" placeholder="Название подзадачи"/>
    <button type="button" class="mf-subtask-rm"
      onclick="this.closest('.mf-subtask-row').remove()">×</button>`;
  list.appendChild(row);
  row.querySelector(".mf-sub-inp")?.focus();
};

function getTaskSubtasks() {
  return [...document.querySelectorAll("#sub-list .mf-subtask-row input")]
    .map(i => i.value.trim()).filter(Boolean);
}

// ════════════════════════════════════════
//  РЕДАКТИРОВАНИЕ ЗАДАЧИ
// ════════════════════════════════════════
export async function editTaskModal(id) {
  const allT = await getTasks();
  const t = allT.find(x => x.id === id);
  if (!t) return;
  let [goals, projects] = await Promise.all([getGoals(), getProjects()]);
  goals = goals.filter(g => !g.done); projects = projects.filter(p => !p.done);

  function toISO(val) {
    if (!val) return "";
    let dt;
    if (val && typeof val.toDate === "function") { dt = val.toDate(); }
    else { let s = String(val); if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) s+=":00"; if(/^\d{4}-\d{2}-\d{2}$/.test(s)) s+="T00:00:00"; dt=new Date(s); }
    if (!dt||isNaN(dt.getTime())) return "";
    const pad=n=>String(n).padStart(2,"0");
    return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  }
  const dlVal=toISO(t.deadline), stVal=toISO(t.startDate), remVal=toISO(t.reminder);
  const recurrence=t.recurrence||{type:"none",interval:1,until:""};

  $("m-body").innerHTML = `
    <div class="m-tabs">
      <button class="m-tab-btn on" data-pane="et-pane-main">Основное</button>
      <button class="m-tab-btn" data-pane="et-pane-extra">Дополнительно</button>
    </div>

    <!-- ОСНОВНОЕ -->
    <div class="m-tab-pane on" id="et-pane-main">

      <!-- Название + "Сделать главной" -->
      <div class="mf-group">
        <div class="mf-title-row">
          <label class="mf-label">Название задачи</label>
          <label class="mf-main-toggle">
            <input type="checkbox" id="et-is-main" ${t.isMain ? "checked" : ""}/>
            <span class="mf-main-toggle-lbl">⭐ Главная задача дня</span>
          </label>
        </div>
        <input class="mf-input" id="et-ttl" value="${esc(t.title)}"/>
      </div>

      <!-- Связь с целью + Почему важно -->
      <div class="mf-row">
        <div class="mf-group mf-group-half">
          <label class="mf-label">Связь с целью</label>
          <div id="et-link-field"
            ${t.projId ? `data-type="proj" data-id="${t.projId}"` : t.goalId ? `data-type="goal" data-id="${t.goalId}"` : ""}
          ></div>
        </div>
        <div class="mf-group mf-group-half">
          <label class="mf-label">Смысл / Почему это важно?</label>
          <textarea class="mf-textarea mf-textarea-sm" id="et-why"
            maxlength="200">${esc(t.why || '')}</textarea>
          <div class="mf-counter"><span id="et-why-cnt">${(t.why||'').length}</span>/200</div>
        </div>
      </div>

      <!-- Метрики 1-10 (значения берутся из data-value атрибута при сохранении) -->
      <div class="mf-metrics-grid">
        ${metricSlider("et-importance",  "Важность",    "⭐", "#7C5CFF", t.importance  || 5)}
        ${metricSlider("et-urgency",     "Срочность",   "⏱",  "#FFB84D", t.urgency     || 5)}
        ${metricSlider("et-energy-cost", "Энергоёмкость","⚡","#4DFFB4", t.energyCost  || 5)}
        ${metricSlider("et-resistance",  "Сопротивление","🛡", "#FF6B6B", t.resistance  || 5)}
      </div>

      <!-- Оценка времени + Приоритет -->
      <div class="mf-row">
        <div class="mf-group mf-group-half">
          <label class="mf-label">Оценка времени</label>
          <select class="mf-select" id="et-duration">
            <option value="">— Не указано —</option>
            ${[15,30,60,90,120,150,180,240,480].map(v=>`<option value="${v}" ${t.duration==v?"selected":""}>${v<60?v+" мин":Math.floor(v/60)+" ч"+(v%60?" "+v%60+" мин":"")}</option>`).join("")}
          </select>
        </div>
        <div class="mf-group mf-group-half">
          <label class="mf-label">Приоритет</label>
          <select class="mf-select" id="et-pri">
            <option value="high" ${t.priority==="high"?"selected":""}>🔴 Высокий</option>
            <option value="med"  ${(!t.priority||t.priority==="med")?"selected":""}>🟡 Средний</option>
            <option value="low"  ${t.priority==="low"?"selected":""}>🟢 Низкий</option>
          </select>
        </div>
      </div>

      <!-- Подзадачи -->
      <div class="mf-group">
        <label class="mf-label">Подзадачи</label>
        <div id="sub-list" class="mf-subtasks-list">
          ${(t.subtasks||[]).map(s => {
          const subTitle = typeof s === "object" ? (s.title || "") : String(s||"");
          const subDone  = typeof s === "object" ? !!s.done : false;
          return `<div class="mf-subtask-row">
            <input type="checkbox" class="mf-sub-check" ${subDone ? "checked" : ""}
              onchange="this.nextElementSibling.classList.toggle('done-sub',this.checked)"/>
            <input class="mf-input mf-sub-inp ${subDone ? "done-sub" : ""}" value="${esc(subTitle)}"/>
            <button type="button" class="mf-subtask-rm" onclick="this.closest('.mf-subtask-row').remove()">×</button>
          </div>`;
        }).join("")}
        </div>
        <button type="button" class="mf-add-sub-btn" onclick="window._addTaskSubtask()">+ Добавить подзадачу</button>
      </div>
    </div>

    <!-- ДОПОЛНИТЕЛЬНО -->
    <div class="m-tab-pane" id="et-pane-extra">

      <div class="mf-group">
        <label class="mf-label">Примечание</label>
        <textarea class="mf-textarea" id="et-note">${esc(t.note||'')}</textarea>
      </div>

      <!-- Строка 1: Начало / Дедлайн -->
      <div class="mf-row">
        <div class="mf-group mf-group-half"><label class="mf-label">Начало</label><div id="et-start-field"></div></div>
        <div class="mf-group mf-group-half"><label class="mf-label">Дедлайн</label><div id="et-dl-field"></div></div>
      </div>

      <!-- Строка 2: Повторять до / Напоминание -->
      <div class="mf-row">
        <div class="mf-group mf-group-half">
          <label class="mf-label">Повторение</label>
          <div class="mf-recur-btns" id="et-recur-types">
            <button type="button" class="mf-recur-btn ${recurrence.type==="none"||!recurrence.type?"on":""}" data-val="none" onclick="window._setRecurType(this,'et')">Нет</button>
            <button type="button" class="mf-recur-btn ${recurrence.type==="daily"?"on":""}" data-val="daily" onclick="window._setRecurType(this,'et')">Ежедневно</button>
            <button type="button" class="mf-recur-btn ${recurrence.type==="weekly"?"on":""}" data-val="weekly" onclick="window._setRecurType(this,'et')">Еженедельно</button>
            <button type="button" class="mf-recur-btn ${recurrence.type==="monthly"?"on":""}" data-val="monthly" onclick="window._setRecurType(this,'et')">Ежемесячно</button>
          </div>
          <input type="hidden" id="et-recurrence-type" value="${recurrence.type||'none'}"/>
          <div id="et-recur-weekdays" class="recur-weekdays" style="display:${recurrence.type==="weekly"?"flex":"none"}">
            ${[1,2,3,4,5,6,0].map((d,i)=>{const lbl=["Пн","Вт","Ср","Чт","Пт","Сб","Вс"][i];return `<button type="button" class="recur-wd-btn ${(recurrence.weekdays||[]).includes(d)?"on":""}" data-day="${d}" onclick="window._toggleWd(this)">${lbl}</button>`}).join("")}
          </div>
          <div id="et-recur-monthdays" class="recur-monthdays" style="display:${recurrence.type==="monthly"?"block":"none"}">
            <div class="recur-md-lbl">Числа:</div>
            <div class="recur-md-grid">${Array.from({length:31},(_,i)=>i+1).map(d=>`<button type="button" class="recur-md-btn ${(recurrence.monthdays||[]).includes(d)?"on":""}" data-day="${d}" onclick="window._toggleMd(this)">${d}</button>`).join("")}</div>
          </div>
          <div id="et-recur-until-row" style="display:${recurrence.type&&recurrence.type!=="none"?"block":"none"}">
            <div class="mf-group" style="margin-top:8px"><label class="mf-label">Повторять до</label><div id="et-until-field"></div></div>
          </div>
        </div>
        <div class="mf-group mf-group-half"><label class="mf-label">Напоминание</label><div id="et-reminder-field"></div></div>
      </div>

      <button class="mf-delete-btn" onclick="window._delTask('${id}')">🗑 Удалить задачу</button>
    </div>`;

  const _etHtml = $("m-body").innerHTML;
  openModal("Редактировать задачу", _etHtml, async () => {
    const { goalId, projId } = getLinkValue("et-link-field");
    const recType   = $("et-recurrence-type")?.value || "none";
    const untilVal  = recType !== "none" ? (dtpVal("et-until") || null) : null;
    const startRaw  = dtpVal("et-st"); const dlRaw = dtpVal("et-dl");
    const newSubs = [...($("sub-list")?.querySelectorAll(".mf-subtask-row") || [])].map(row => {
        const cb    = row.querySelector("input[type=checkbox]");
        const inp   = row.querySelector("input.mf-sub-inp") || row.querySelector("input:not([type=checkbox])");
        const title = inp?.value.trim() || "";
        const done  = cb?.checked || false;
        return title ? { title, done } : null;
      }).filter(Boolean);
    try {
      // Читаем ползунки через value атрибут range input (надёжнее чем textContent)
      const getSlider = id => parseInt(document.getElementById(id)?.value) || 5;
      await updateTask(id, {
        title:      $("et-ttl")?.value.trim() || t.title,
        note:       $("et-note")?.value.trim() || '',
        why:        $("et-why")?.value.trim() || '',
        goalId, projId,
        priority:   $("et-pri")?.value || "med",
        isMain:     $("et-is-main")?.checked || false,
        deadline:   dlRaw || null, startDate: startRaw || null,
        date:       startRaw ? startRaw.slice(0,10) : today(),
        reminder:   dtpVal("et-reminder") || null,
        subtasks:   newSubs,
        duration:   parseInt($("et-duration")?.value) || null,
        importance: getSlider("et-importance"),
        urgency:    getSlider("et-urgency"),
        energyCost: getSlider("et-energy-cost"),
        resistance: getSlider("et-resistance"),
        recurrence: recType !== "none" ? {
          type: recType, interval: 1, until: untilVal,
          weekdays:  recType==="weekly"  ? [...document.querySelectorAll("#et-recur-weekdays .recur-wd-btn.on")].map(b=>parseInt(b.dataset.day)) : null,
          monthdays: recType==="monthly" ? [...document.querySelectorAll("#et-recur-monthdays .recur-md-btn.on")].map(b=>parseInt(b.dataset.day)) : null,
        } : null,
      });
      toast("Сохранено ✓"); closeModal(); window._refreshAll?.();
    } catch(e) { toast("⚠️ " + e.message); }
  });

  // Инициализация компонентов editTaskModal
  renderLinkField("et-link-field", goals, projects, t.goalId, t.projId);
  const etDlEl = $("et-dl-field");
  if (etDlEl) {
    // Дедлайн с временем; если есть сохранённое время — берём его, иначе 23:00
    const etDlDefault = dlVal
      ? (dlVal.length <= 10 ? dlVal + "T23:00" : dlVal)
      : "";
    etDlEl.replaceWith(makeDateField("et-dl", true, etDlDefault));
  }
  const etStEl = $("et-start-field"); if (etStEl) etStEl.replaceWith(makeDateField("et-st", true, stVal));
  const etRemEl = $("et-reminder-field"); if (etRemEl) etRemEl.replaceWith(makeDateField("et-reminder", true, remVal));
  const etUntilEl = $("et-until-field"); if (etUntilEl) etUntilEl.replaceWith(makeDateField("et-until", false, recurrence.until || ''));
  $("et-why")?.addEventListener("input", () => { const c=$("et-why-cnt"); if(c) c.textContent=$("et-why").value.length; });
  setupModalTabs();
  const etSaveBtn = $("m-save"); if (etSaveBtn) etSaveBtn.textContent = "Сохранить";

}

// ════════════════════════════════════════
//  СОЗДАНИЕ ЦЕЛИ
// ════════════════════════════════════════
export async function buildGoalModal(title) {
  const GOAL_LEVELS = [
    { id:"strategic", label:"Стратегическая", sub:"Главная цель жизни", icon:"🔭" },
    { id:"life",      label:"Жизненная",       sub:"На несколько лет",  icon:"🌿" },
    { id:"annual",    label:"Годовая",          sub:"На год",            icon:"📅" },
    { id:"quarter",   label:"Квартальная",      sub:"На 3 месяца",       icon:"⚡" },
  ];

  $("m-body").innerHTML = `
    <div class="m-tabs">
      <button class="m-tab-btn on" data-pane="goal-pane-main">Основное</button>
      <button class="m-tab-btn" data-pane="goal-pane-extra">Дополнительно</button>
    </div>

    <div class="m-tab-pane on" id="goal-pane-main">
      <div class="mf-group">
        <label class="mf-label">Формулировка цели</label>
        <input class="mf-input" id="g-title" placeholder="Финансовая свобода к 2027 году"/>
      </div>

      <div class="mf-row">
        <div class="mf-group mf-group-half">
          <label class="mf-label">Уровень цели</label>
          <div class="mf-level-picker" id="g-level-picker">
            ${GOAL_LEVELS.map((l, i) => `
              <button type="button" class="mf-level-btn ${i===0?"on":""}"
                data-level="${l.id}" onclick="window._selectGoalLevel('${l.id}')">
                <span class="mf-level-ico">${l.icon}</span>
                <div class="mf-level-info">
                  <div class="mf-level-name">${l.label}</div>
                  <div class="mf-level-sub">${l.sub}</div>
                </div>
              </button>`).join("")}
          </div>
          <input type="hidden" id="g-level" value="strategic"/>
        </div>
        <div class="mf-group mf-group-half">
          <label class="mf-label">Срок достижения</label>
          <div id="g-dl-field"></div>
        </div>
      </div>

      <div class="mf-group">
        <label class="mf-label">Описание цели</label>
        <textarea class="mf-textarea" id="g-desc"
          placeholder="Я хочу иметь стабильный пассивный доход..."
          maxlength="300"></textarea>
        <div class="mf-counter"><span id="g-desc-cnt">0</span>/300</div>
      </div>

      <div class="mf-group">
        <label class="mf-label">Ключевые сферы</label>
        <div class="mf-spheres" id="g-spheres"></div>
      </div>

      <div class="mf-group">
        <label class="mf-label">Почему это важно для меня?</label>
        <textarea class="mf-textarea mf-textarea-sm" id="g-why"
          placeholder="Это даст мне выбор, время и возможность..."
          maxlength="200"></textarea>
        <div class="mf-counter"><span id="g-why-cnt">0</span>/200</div>
      </div>
    </div>

    <div class="m-tab-pane" id="goal-pane-extra">
      <div class="mf-group">
        <label class="mf-label">Ключевые результаты</label>
        <div id="g-kr-list" class="mf-subtasks-list"></div>
        <button type="button" class="mf-add-sub-btn" onclick="window._addKR()">+ Добавить результат</button>
      </div>
    </div>`;



  window._selectGoalLevel = (level) => {
    document.querySelectorAll(".mf-level-btn").forEach(b => b.classList.toggle("on", b.dataset.level === level));
    const inp = $("g-level"); if (inp) inp.value = level;
  };

  window._addKR = () => {
    const list = $("g-kr-list"); if (!list) return;
    const row = document.createElement("div"); row.className = "mf-subtask-row";
    row.innerHTML = `<input class="mf-input" placeholder="Ключевой результат"/><button type="button" class="mf-subtask-rm" onclick="this.closest('.mf-subtask-row').remove()">×</button>`;
    list.appendChild(row); row.querySelector("input")?.focus();
  };

  const _goalHtml = $("m-body").innerHTML;
  openModal(title || "Новая цель", _goalHtml, async () => {
    const t = $("g-title")?.value.trim();
    if (!t) { toast("⚠️ Введите название цели"); return; }
    const keyResults = [...($("g-kr-list")?.querySelectorAll(".mf-subtask-row input")||[])].map(i=>i.value.trim()).filter(Boolean);
    await addGoal({
      title:      t,
      desc:       $("g-desc")?.value.trim() || '',
      why:        $("g-why")?.value.trim() || '',
      level:      $("g-level")?.value || "strategic",
      spheres:    getSelectedSpheres("g-spheres"),
      keyResults,
      deadline:   dtpVal("g-dl") || null,
    });
    toast("Цель создана ✓"); closeModal(); window._refreshAll?.();
  });

  // Инициализация buildGoalModal
  const gDlEl = $("g-dl-field"); if (gDlEl) gDlEl.replaceWith(makeDateField("g-dl", false));
  renderSpherePills("g-spheres", []);
  $("g-desc")?.addEventListener("input", () => { const c=$("g-desc-cnt"); if(c) c.textContent=$("g-desc").value.length; });
  $("g-why")?.addEventListener("input",  () => { const c=$("g-why-cnt");  if(c) c.textContent=$("g-why").value.length; });
  setupModalTabs();
  const gSaveBtn = $("m-save"); if (gSaveBtn) gSaveBtn.textContent = "Создать цель";

}

// ════════════════════════════════════════
//  СОЗДАНИЕ ПРОЕКТА
// ════════════════════════════════════════
export async function buildProjectModal(title, defGoalId = null) {
  const goals = await getGoals();
  const activeGoals = goals.filter(g => !g.done);

  $("m-body").innerHTML = `
    <div class="m-tabs">
      <button class="m-tab-btn on" data-pane="proj-pane-main">Основное</button>
      <button class="m-tab-btn" data-pane="proj-pane-extra">Дополнительно</button>
    </div>

    <div class="m-tab-pane on" id="proj-pane-main">
      <div class="mf-group">
        <label class="mf-label">Название проекта</label>
        <input class="mf-input" id="p-title" placeholder="Разработка AI-ассистента"/>
      </div>

      <div class="mf-row">
        <div class="mf-group mf-group-half">
          <label class="mf-label">Связь с целью</label>
          <div id="p-link-field"
            ${defGoalId ? `data-type="goal" data-id="${defGoalId}"` : ""}
          ></div>
        </div>
        <div class="mf-group mf-group-half">
          <label class="mf-label">Краткое описание</label>
          <textarea class="mf-textarea mf-textarea-sm" id="p-desc"
            placeholder="Создать AI-продукт..."
            maxlength="300"></textarea>
          <div class="mf-counter"><span id="p-desc-cnt">0</span>/300</div>
        </div>
      </div>

      <div class="mf-group">
        <label class="mf-label">Ожидаемый результат</label>
        <textarea class="mf-textarea mf-textarea-sm" id="p-result"
          placeholder="Стабильный доход от продукта..."
          maxlength="200"></textarea>
        <div class="mf-counter"><span id="p-result-cnt">0</span>/200</div>
      </div>

      <div class="mf-row">
        <div class="mf-group mf-group-third">
          <label class="mf-label">Приоритет</label>
          <select class="mf-select" id="p-priority">
            <option value="high">⬆ Высокий</option>
            <option value="medium" selected>— Средний</option>
            <option value="low">⬇ Низкий</option>
          </select>
        </div>
        <div class="mf-group mf-group-third">
          <label class="mf-label">Горизонт</label>
          <select class="mf-select" id="p-horizon">
            <option value="1m">1 месяц</option>
            <option value="3m">1–3 месяца</option>
            <option value="6m" selected>3–6 месяцев</option>
            <option value="12m">6–12 месяцев</option>
            <option value="2y">1–2 года</option>
            <option value="5y">3+ года</option>
          </select>
        </div>
        <div class="mf-group mf-group-third">
          <label class="mf-label">Прогресс (план)</label>
          <select class="mf-select" id="p-progress">
            ${[0,10,20,30,40,50,60,70,80,90,100].map(v=>`<option value="${v}">${v}%</option>`).join("")}
          </select>
        </div>
      </div>
    </div>

    <div class="m-tab-pane" id="proj-pane-extra">
      <div class="mf-group">
        <label class="mf-label">Ключевые вехи</label>
        <div id="p-milestones-list" class="mf-subtasks-list"></div>
        <button type="button" class="mf-add-sub-btn" onclick="window._addMilestone()">+ Добавить веху</button>
      </div>
    </div>`;



  window._addMilestone = () => {
    const list = $("p-milestones-list"); if (!list) return;
    const row = document.createElement("div"); row.className = "mf-subtask-row";
    row.innerHTML = `<input class="mf-input" placeholder="Ключевая веха"/><button type="button" class="mf-subtask-rm" onclick="this.closest('.mf-subtask-row').remove()">×</button>`;
    list.appendChild(row); row.querySelector("input")?.focus();
  };

  const _projHtml = $("m-body").innerHTML;
  openModal(title || "Новый проект", _projHtml, async () => {
    const t = $("p-title")?.value.trim();
    if (!t) { toast("⚠️ Введите название"); return; }
    const { goalId } = getLinkValue("p-link-field");
    const milestones = [...($("p-milestones-list")?.querySelectorAll(".mf-subtask-row input")||[])].map(i=>i.value.trim()).filter(Boolean);
    await addProject({
      name:      t,
      goalId:    goalId || null,
      desc:      $("p-desc")?.value.trim() || '',
      result:    $("p-result")?.value.trim() || '',
      priority:  $("p-priority")?.value || "medium",
      horizon:   $("p-horizon")?.value || "6m",
      progress:  parseInt($("p-progress")?.value) || 0,
      milestones,
    });
    toast("Проект создан ✓"); closeModal(); window._refreshAll?.();
  });

  // Инициализация buildProjectModal
  renderLinkField("p-link-field", activeGoals, [], defGoalId, null);
  $("p-desc")?.addEventListener("input",   () => { const c=$("p-desc-cnt");   if(c) c.textContent=$("p-desc").value.length; });
  $("p-result")?.addEventListener("input", () => { const c=$("p-result-cnt"); if(c) c.textContent=$("p-result").value.length; });
  setupModalTabs();
  const pSaveBtn = $("m-save"); if (pSaveBtn) pSaveBtn.textContent = "Создать проект";

}

// ════════════════════════════════════════
//  СОЗДАНИЕ ИДЕИ
// ════════════════════════════════════════
export async function buildIdeaModal(title, defaultDate = null) {
  let [goals, projects] = await Promise.all([getGoals(), getProjects()]);
  goals    = goals.filter(g => !g.done);
  projects = projects.filter(p => !p.done);
  const dateVal = dstr(defaultDate ? new Date(defaultDate) : new Date());
  window._tags_idea = [];

  $("m-body").innerHTML = `
    <div class="mf-group">
      <label class="mf-label">Заголовок идеи</label>
      <input class="mf-input" id="i-title" placeholder="Название идеи"/>
    </div>

    <div class="mf-group">
      <label class="mf-label">Описание идеи</label>
      <textarea class="mf-textarea" id="i-text"
        placeholder="Опишите идею подробнее..."
        maxlength="500"></textarea>
      <div class="mf-counter"><span id="i-text-cnt">0</span>/500</div>
    </div>

    <div class="mf-group">
      <label class="mf-label">Связано с целью или проектом (если есть)</label>
      <div id="idea-link-field"></div>
    </div>

    <div class="mf-group">
      <label class="mf-label">Теги</label>
      <div class="mf-tag-pills" id="idea-tags-cont"></div>
    </div>`;



  const _ideaHtml = $("m-body").innerHTML;
  openModal(title || "Новая идея", _ideaHtml, async () => {
    const t = $("i-title")?.value.trim();
    if (!t) { toast("⚠️ Введите заголовок"); return; }
    const { goalId, projId } = getLinkValue("idea-link-field");
    await addIdea({
      title:  t,
      text:   $("i-text")?.value.trim() || '',
      date:   dateVal,
      tags:   window._tags_idea || [],
      goalId: goalId || null,
      projId: projId || null,
    });
    toast("Идея сохранена ✓"); closeModal(); window._refreshAll?.();
  });

  // Инициализация buildIdeaModal
  renderLinkField("idea-link-field", goals, projects, null, null);
  renderTagPills("idea-tags-cont", [], "idea");
  $("i-text")?.addEventListener("input", () => { const c=$("i-text-cnt"); if(c) c.textContent=$("i-text").value.length; });
  const ideaSaveBtn = $("m-save"); if (ideaSaveBtn) ideaSaveBtn.textContent = "Сохранить идею";

}

// ════════════════════════════════════════
//  РЕДАКТИРОВАНИЕ ИДЕИ
// ════════════════════════════════════════
export async function editIdeaModal(id) {
  const all = await getIdeas();
  const x = all.find(i => i.id === id);
  if (!x) return;
  let [goals, projects] = await Promise.all([getGoals(), getProjects()]);
  goals = goals.filter(g => !g.done); projects = projects.filter(p => !p.done);
  window._tags_idea_edit = Array.isArray(x.tags) ? [...x.tags] : [];

  $("m-body").innerHTML = `
    <div class="mf-group">
      <label class="mf-label">Заголовок идеи</label>
      <input class="mf-input" id="ei-title" value="${esc(x.title||'')}"/>
    </div>
    <div class="mf-group">
      <label class="mf-label">Описание идеи</label>
      <textarea class="mf-textarea" id="ei-text" maxlength="500">${esc(x.text||'')}</textarea>
      <div class="mf-counter"><span id="ei-text-cnt">${(x.text||'').length}</span>/500</div>
    </div>
    <div class="mf-group">
      <label class="mf-label">Связано с целью или проектом</label>
      <div id="ei-link-field"
        ${x.projId ? `data-type="proj" data-id="${x.projId}"` : x.goalId ? `data-type="goal" data-id="${x.goalId}"` : ""}
      ></div>
    </div>
    <div class="mf-group">
      <label class="mf-label">Теги</label>
      <div class="mf-tag-pills" id="idea-edit-tags-cont"></div>
    </div>
    <button class="mf-delete-btn" onclick="window.delItem('ideas','${id}')">🗑 Удалить идею</button>`;

  const _eiHtml = $("m-body").innerHTML;
  openModal("Редактировать идею", _eiHtml, async () => {
    const t = $("ei-title")?.value.trim();
    if (!t) { toast("⚠️ Введите заголовок"); return; }
    const { goalId, projId } = getLinkValue("ei-link-field");
    await updateIdea(id, {
      title: t, text: $("ei-text")?.value.trim() || '',
      date: x.date || today(), tags: window._tags_ideedit || [],
      goalId: goalId || null, projId: projId || null,
    });
    toast("Сохранено ✓"); closeModal(); window._refreshAll?.();
  });

  // Инициализация editIdeaModal — ПОСЛЕ openModal
  renderLinkField("ei-link-field", goals, projects, x.goalId, x.projId);
  window._tags_ideedit = [...window._tags_idea_edit];
  renderTagPills("idea-edit-tags-cont", window._tags_ideedit, "ideedit");
  $("ei-text")?.addEventListener("input", () => { const c=$("ei-text-cnt"); if(c) c.textContent=$("ei-text").value.length; });
  const eiSaveBtn = $("m-save"); if (eiSaveBtn) eiSaveBtn.textContent = "Сохранить";

}

// ════════════════════════════════════════
//  ФОРМА ДНЕВНИКА
// ════════════════════════════════════════
export async function buildDiaryModal(title, tmpl = null, defaultDate = null) {
  const dateVal = defaultDate || dstr(new Date());
  const now     = new Date();
  const timeVal = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
  window._tags_diary = [];
  window._energy_pos = [];
  window._energy_neg = [];

  const MOODS = [
    { emoji:"😊", label:"Отлично" },
    { emoji:"😌", label:"Спокойствие" },
    { emoji:"🙂", label:"Хорошо" },
    { emoji:"😐", label:"Нейтрально" },
    { emoji:"😔", label:"Устал" },
    { emoji:"😤", label:"Напряжён" },
    { emoji:"😢", label:"Тяжело" },
  ];

  $("m-body").innerHTML = `
    <div class="mf-row mf-row-3">
      <div class="mf-group">
        <label class="mf-label">Дата</label>
        <div class="mf-date-display" id="d-date-display" onclick="window._openDiaryDatePicker()">
          <svg style="width:14px;height:14px;margin-right:5px;opacity:.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <span id="d-date-lbl">${formatDisplay(dateVal, false)}</span>
        </div>
        <input type="hidden" id="d-date" value="${dateVal}"/>
      </div>
      <div class="mf-group">
        <label class="mf-label">Время</label>
        <div class="mf-time-input">
          <svg style="width:14px;height:14px;margin-right:5px;opacity:.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <input class="mf-input-bare" id="d-time" type="time" value="${timeVal}"/>
        </div>
      </div>
      <div class="mf-group">
        <label class="mf-label">Настроение</label>
        <div class="mf-mood-row" id="d-mood-row">
          ${MOODS.map(m => `
            <button type="button" class="mf-mood-btn" data-mood="${m.emoji} ${m.label}"
              title="${m.label}"
              onclick="window._selectMood(this)">
              ${m.emoji}
            </button>`).join("")}
        </div>
        <input type="hidden" id="d-mood-val" value=""/>
      </div>
    </div>

    <div class="mf-group">
      <label class="mf-label">Заголовок записи</label>
      <input class="mf-input" id="d-title"
        placeholder="Продуктивный и осознанный день"
        value="${tmpl ? esc(tmpl.title||'') : ''}"/>
    </div>

    <div class="mf-group">
      <label class="mf-label">Что произошло?</label>
      <textarea class="mf-textarea" id="d-text"
        placeholder="Удалось сосредоточиться с утра..."
        maxlength="500">${esc(tmpl?.body||'')}</textarea>
      <div class="mf-counter"><span id="d-text-cnt">0</span>/500</div>
    </div>

    <div class="mf-row">
      <div class="mf-group mf-group-half">
        <label class="mf-label" style="color:var(--grn)">Что дало энергию?</label>
        <div class="mf-energy-list" id="d-energy-pos">
          <button type="button" class="mf-energy-add pos"
            onclick="window._addEnergyItem('pos')">+ Добавить</button>
        </div>
      </div>
      <div class="mf-group mf-group-half">
        <label class="mf-label" style="color:var(--red)">Что забрало энергию?</label>
        <div class="mf-energy-list" id="d-energy-neg">
          <button type="button" class="mf-energy-add neg"
            onclick="window._addEnergyItem('neg')">+ Добавить</button>
        </div>
      </div>
    </div>

    <div class="mf-group">
      <label class="mf-label">Теги / темы</label>
      <div class="mf-tag-pills" id="diary-tags-cont"></div>
    </div>`;



  window._selectMood = (btn) => {
    document.querySelectorAll(".mf-mood-btn").forEach(b => b.classList.remove("on"));
    btn.classList.add("on");
    const inp = $("d-mood-val"); if (inp) inp.value = btn.dataset.mood;
  };

  window._openDiaryDatePicker = () => {
    const hidden = $("d-date");
    const fakeBtn = { querySelector: () => null, classList: { add: () => {}, remove: () => {} } };
    const fakeBtnObj = {
      type: "button", innerHTML: "", textContent: "",
      querySelector: () => ({ textContent: "" }),
      classList: { add: () => {}, remove: () => {} },
    };
    openDtpPopup({
      ...fakeBtnObj,
      querySelector: (sel) => {
        if (sel === "span") return { textContent: "" };
        return null;
      },
    }, hidden, false);
    // After picker closes — update label
    const observer = new MutationObserver(() => {
      const lbl = $("d-date-lbl");
      if (lbl && hidden.value) lbl.textContent = formatDisplay(hidden.value, false);
    });
    if (hidden) observer.observe(hidden, { attributes: true, attributeFilter: ["value"] });
    // Also check via input event simulation
    setTimeout(() => {
      if (hidden.value) {
        const lbl = $("d-date-lbl");
        if (lbl) lbl.textContent = formatDisplay(hidden.value, false);
      }
    }, 100);
  };

  window._addEnergyItem = (type) => {
    const val = window.prompt(type === "pos" ? "Что дало энергию?" : "Что забрало энергию?");
    if (!val?.trim()) return;
    const listId = type === "pos" ? "d-energy-pos" : "d-energy-neg";
    const list = $(listId); if (!list) return;
    const arr  = type === "pos" ? window._energy_pos : window._energy_neg;
    arr.push(val.trim());
    const addBtn = list.querySelector(".mf-energy-add");
    const item = document.createElement("div");
    item.className = `mf-energy-item ${type}`;
    item.innerHTML = `<span class="mf-energy-dot ${type}">•</span><span class="mf-energy-text">${esc(val.trim())}</span>
      <button type="button" class="mf-energy-rm" onclick="this.closest('.mf-energy-item').remove()">×</button>`;
    list.insertBefore(item, addBtn);
  };

  const _diaryHtml = $("m-body").innerHTML;
  openModal(title || "Новая запись в дневник", _diaryHtml, async () => {
    const t = $("d-title")?.value.trim();
    if (!t) { toast("⚠️ Введите заголовок"); return; }
    const energyPos = [...($("d-energy-pos")?.querySelectorAll(".mf-energy-text")||[])].map(e=>e.textContent.trim()).filter(Boolean);
    const energyNeg = [...($("d-energy-neg")?.querySelectorAll(".mf-energy-text")||[])].map(e=>e.textContent.trim()).filter(Boolean);
    await addDiaryEntry({
      title:     t,
      text:      $("d-text")?.value.trim() || '',
      date:      $("d-date")?.value.trim() || today(),
      time:      $("d-time")?.value.trim() || '',
      mood:      $("d-mood-val")?.value.trim() || '',
      tags:      window._tags_diary || [],
      energyPos, energyNeg,
    });
    toast("Запись сохранена ✓"); closeModal(); window._refreshAll?.();
  });

  // Инициализация buildDiaryModal
  renderTagPills("diary-tags-cont", [], "diary");
  $("d-text")?.addEventListener("input", () => { const c=$("d-text-cnt"); if(c) c.textContent=$("d-text").value.length; });
  const diarySaveBtn = $("m-save"); if (diarySaveBtn) diarySaveBtn.textContent = "Сохранить запись";
  const diaryCancelBtn = $("m-cancel"); if (diaryCancelBtn) diaryCancelBtn.textContent = "Отмена";

}

// ════════════════════════════════════════
//  РЕДАКТИРОВАНИЕ ДНЕВНИКА
// ════════════════════════════════════════
export async function editDiaryModal(id) {
  const all = await getDiary();
  const x = all.find(e => e.id === id);
  if (!x) return;
  window._tags_diary_edit = Array.isArray(x.tags) ? [...x.tags] : [];
  window._energy_pos_edit = Array.isArray(x.energyPos) ? [...x.energyPos] : [];
  window._energy_neg_edit = Array.isArray(x.energyNeg) ? [...x.energyNeg] : [];

  const MOODS = ["😊","😌","🙂","😐","😔","😤","😢"];

  $("m-body").innerHTML = `
    <div class="mf-row mf-row-3">
      <div class="mf-group">
        <label class="mf-label">Дата</label>
        <input class="mf-input" id="ed-date" type="date" value="${x.date||today()}"/>
      </div>
      <div class="mf-group">
        <label class="mf-label">Время</label>
        <input class="mf-input" id="ed-time" type="time" value="${x.time||''}"/>
      </div>
      <div class="mf-group">
        <label class="mf-label">Настроение</label>
        <div class="mf-mood-row">
          ${MOODS.map(e => `<button type="button" class="mf-mood-btn ${(x.mood||'').startsWith(e)?"on":""}" data-mood="${e}" onclick="window._selectMoodEdit(this)">${e}</button>`).join("")}
        </div>
        <input type="hidden" id="ed-mood-val" value="${esc(x.mood||'')}"/>
      </div>
    </div>
    <div class="mf-group">
      <label class="mf-label">Заголовок</label>
      <input class="mf-input" id="ed-title" value="${esc(x.title||'')}"/>
    </div>
    <div class="mf-group">
      <label class="mf-label">Что произошло?</label>
      <textarea class="mf-textarea" id="ed-text" maxlength="500">${esc(x.text||'')}</textarea>
      <div class="mf-counter"><span id="ed-text-cnt">${(x.text||'').length}</span>/500</div>
    </div>
    <div class="mf-row">
      <div class="mf-group mf-group-half">
        <label class="mf-label" style="color:var(--grn)">Что дало энергию?</label>
        <div class="mf-energy-list" id="ed-energy-pos">
          ${window._energy_pos_edit.map(e=>`<div class="mf-energy-item pos"><span class="mf-energy-dot pos">•</span><span class="mf-energy-text">${esc(e)}</span><button type="button" class="mf-energy-rm" onclick="this.closest('.mf-energy-item').remove()">×</button></div>`).join("")}
          <button type="button" class="mf-energy-add pos" onclick="window._addEnergyItemEdit('pos')">+ Добавить</button>
        </div>
      </div>
      <div class="mf-group mf-group-half">
        <label class="mf-label" style="color:var(--red)">Что забрало энергию?</label>
        <div class="mf-energy-list" id="ed-energy-neg">
          ${window._energy_neg_edit.map(e=>`<div class="mf-energy-item neg"><span class="mf-energy-dot neg">•</span><span class="mf-energy-text">${esc(e)}</span><button type="button" class="mf-energy-rm" onclick="this.closest('.mf-energy-item').remove()">×</button></div>`).join("")}
          <button type="button" class="mf-energy-add neg" onclick="window._addEnergyItemEdit('neg')">+ Добавить</button>
        </div>
      </div>
    </div>
    <div class="mf-group">
      <label class="mf-label">Теги</label>
      <div class="mf-tag-pills" id="diary-edit-tags-cont"></div>
    </div>
    <button class="mf-delete-btn" onclick="window.delItem('diary','${id}')">🗑 Удалить запись</button>`;

  window._selectMoodEdit = (btn) => {
    document.querySelectorAll("#m-body .mf-mood-btn").forEach(b => b.classList.remove("on"));
    btn.classList.add("on");
    const inp = $("ed-mood-val"); if (inp) inp.value = btn.dataset.mood;
  };

  window._addEnergyItemEdit = (type) => {
    const val = window.prompt(type === "pos" ? "Что дало энергию?" : "Что забрало энергию?");
    if (!val?.trim()) return;
    const listId = type === "pos" ? "ed-energy-pos" : "ed-energy-neg";
    const list = $(listId); if (!list) return;
    const addBtn = list.querySelector(".mf-energy-add");
    const item = document.createElement("div");
    item.className = `mf-energy-item ${type}`;
    item.innerHTML = `<span class="mf-energy-dot ${type}">•</span><span class="mf-energy-text">${esc(val.trim())}</span><button type="button" class="mf-energy-rm" onclick="this.closest('.mf-energy-item').remove()">×</button>`;
    list.insertBefore(item, addBtn);
  };

  const _edHtml = $("m-body").innerHTML;
  openModal("Редактировать запись", _edHtml, async () => {
    const t = $("ed-title")?.value.trim();
    if (!t) { toast("⚠️ Введите заголовок"); return; }
    const energyPos = [...($("ed-energy-pos")?.querySelectorAll(".mf-energy-text")||[])].map(e=>e.textContent.trim()).filter(Boolean);
    const energyNeg = [...($("ed-energy-neg")?.querySelectorAll(".mf-energy-text")||[])].map(e=>e.textContent.trim()).filter(Boolean);
    await updateDiaryEntry(id, {
      title: t, text: $("ed-text")?.value.trim() || '',
      date: $("ed-date")?.value.trim() || today(),
      time: $("ed-time")?.value.trim() || '',
      mood: $("ed-mood-val")?.value.trim() || '',
      tags: window._tags_diaryedit || [],
      energyPos, energyNeg,
    });
    toast("Сохранено ✓"); closeModal(); window._refreshAll?.();
  });

  // Инициализация editDiaryModal — ПОСЛЕ openModal
  renderTagPills("diary-edit-tags-cont", window._tags_diary_edit, "diaryedit");
  $("ed-text")?.addEventListener("input", () => { const c=$("ed-text-cnt"); if(c) c.textContent=$("ed-text").value.length; });

}

// ════════════════════════════════════════
//  SHARED HANDLERS
// ════════════════════════════════════════
window._setRecurType = (btn, prefix) => {
  const val = btn.dataset.val;
  btn.closest(".mf-recur-btns")?.querySelectorAll(".mf-recur-btn").forEach(b => b.classList.remove("on"));
  btn.classList.add("on");
  const inp      = document.getElementById(prefix + "-recurrence-type");
  const wdRow    = document.getElementById(prefix + "-recur-weekdays");
  const mdRow    = document.getElementById(prefix + "-recur-monthdays");
  const untilRow = document.getElementById(prefix + "-recur-until-row");
  if (inp)      inp.value = val;
  if (wdRow)    wdRow.style.display    = val === "weekly"  ? "flex"  : "none";
  if (mdRow)    mdRow.style.display    = val === "monthly" ? "block" : "none";
  if (untilRow) untilRow.style.display = val !== "none"    ? "block" : "none";
};

window._toggleWd = btn => btn.classList.toggle("on");
window._toggleMd = btn => btn.classList.toggle("on");

// ════════════════════════════════════════
//  ДИСПЕТЧЕР openNewModal
// ════════════════════════════════════════
export async function openNewModal(type, goalId = null, projId = null, tab = null, defaultDate = null) {
  switch (type) {
    case "task":     return buildTaskModal("Новая задача", goalId, projId, defaultDate);
    case "goal":     return buildGoalModal("Новая цель");
    case "project":  return buildProjectModal("Новый проект", goalId);
    case "idea":     return buildIdeaModal("Новая идея", defaultDate);
    case "diary":    return buildDiaryModal("Новая запись в дневник", null, defaultDate);
    default:         return buildTaskModal("Новая запись", goalId, projId, defaultDate);
  }
}

// ════════════════════════════════════════
//  ШАБЛОН ДНЕВНИКА (упрощённый)
// ════════════════════════════════════════
export async function buildTemplateModal(title) {
  openModal(title || "Новый шаблон", `
    <div class="mf-group">
      <label class="mf-label">Название шаблона</label>
      <input class="mf-input" id="tmpl-title" placeholder="Название..."/>
    </div>
    <div class="mf-group">
      <label class="mf-label">Текст шаблона</label>
      <textarea class="mf-textarea" id="tmpl-body" placeholder="Текст..."></textarea>
    </div>`,
    async () => {
      const t = $("tmpl-title")?.value.trim();
      if (!t) { toast("⚠️ Введите название"); return; }
      await addTemplate({ title: t, body: $("tmpl-body")?.value.trim() || '' });
      toast("Шаблон создан ✓"); closeModal(); window._refreshAll?.();
    });
}

// ════════════════════════════════════════
//  ВЕЧЕРНИЙ АУДИТ (упрощённый под новый стиль)
// ════════════════════════════════════════
export async function buildAuditModal(existingAudit = null) {
  const energy     = existingAudit?.energy    ?? 5;
  const fatigue    = existingAudit?.fatigue   ?? 5;
  const mood       = existingAudit?.mood      ?? "";
  const reflection = existingAudit?.reflection ?? "";
  const authorRatio = await calcAuthorRatio();
  let arColor = "var(--tx-m)", arIco = "💤";
  if (authorRatio !== null) {
    if (authorRatio >= 60) { arColor = "var(--grn)"; arIco = "🔥"; }
    else if (authorRatio >= 30) { arColor = "var(--go)"; arIco = "⚡"; }
  }
  openModal("🌙 Вечерний аудит", `
    ${authorRatio !== null ? `<div class="audit-author-badge"><span class="audit-author-ico">${arIco}</span><div class="audit-author-body"><span class="audit-author-lbl">Авторство сегодня</span><span class="audit-author-val" style="color:${arColor}">${authorRatio}%</span></div></div>` : ""}
    <div class="mf-group">
      <label class="mf-label">⚡ Энергия: <span id="audit-energy-val">${energy}</span>/10</label>
      <input type="range" class="audit-slider" id="audit-energy" min="1" max="10" value="${energy}" oninput="document.getElementById('audit-energy-val').textContent=this.value"/>
    </div>
    <div class="mf-group">
      <label class="mf-label">😮 Усталость: <span id="audit-fatigue-val">${fatigue}</span>/10</label>
      <input type="range" class="audit-slider" id="audit-fatigue" min="1" max="10" value="${fatigue}" oninput="document.getElementById('audit-fatigue-val').textContent=this.value"/>
    </div>
    <div class="mf-group">
      <label class="mf-label">Рефлексия дня</label>
      <textarea class="mf-textarea" id="audit-reflection" placeholder="Какой момент сегодня был твоим?">${esc(reflection)}</textarea>
    </div>`,
    async () => {
      await saveDailyAudit({ energy: parseInt($("audit-energy")?.value)||5, fatigue: parseInt($("audit-fatigue")?.value)||5, mood, reflection: $("audit-reflection")?.value.trim()||'', authorRatio });
      toast("Аудит сохранён ✓"); closeModal(); window._refreshAll?.();
    });
}

// ════════════════════════════════════════
//  БЫСТРОЕ ДОБАВЛЕНИЕ (для открытия из кнопки + в сайдбаре)
// ════════════════════════════════════════
window._openNewEntryPicker = () => {
  const types = [
    { type:"task",    icon:"✅", label:"Задача" },
    { type:"goal",    icon:"🎯", label:"Цель" },
    { type:"project", icon:"📁", label:"Проект" },
    { type:"idea",    icon:"💡", label:"Идея" },
    { type:"diary",   icon:"📖", label:"Запись в журнал" },
  ];

  document.getElementById("entry-picker-popup")?.remove();
  const popup = document.createElement("div");
  popup.id = "entry-picker-popup";
  popup.className = "entry-picker-popup";
  popup.innerHTML = `
    <div class="entry-picker-title">Что создаём?</div>
    <div class="entry-picker-grid">
      ${types.map(t => `
        <button class="entry-picker-btn" onclick="window._pickEntry('${t.type}')">
          <span class="entry-picker-ico">${t.icon}</span>
          <span class="entry-picker-lbl">${t.label}</span>
        </button>`).join("")}
    </div>`;

  const ov = document.createElement("div");
  ov.style.cssText = "position:fixed;inset:0;z-index:9990;background:rgba(0,0,0,.5);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;";
  ov.id = "entry-picker-ov";
  ov.appendChild(popup);
  ov.onclick = e => { if (e.target === ov) ov.remove(); };
  document.body.appendChild(ov);
};

window._pickEntry = (type) => {
  document.getElementById("entry-picker-ov")?.remove();
  openNewModal(type);
};
