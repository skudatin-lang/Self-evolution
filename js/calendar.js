// ════════════════════════════════════════
//  CALENDAR MODULE
//  js/calendar.js
// ════════════════════════════════════════

import { getTasks, getIdeas, getDiary, dstr, esc } from "./db.js";

const $ = id => document.getElementById(id);
const MONTHS = ["Январь","Февраль","Март","Апрель","Май","Июнь",
                "Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];

let calDate     = new Date();
let selectCb    = null; // if set — picking mode, calls cb(date) and closes

export function openCal(cb = null) {
  selectCb = cb || null;
  $("cal-ov").classList.remove("hidden");
  renderCal();
}
export function closeCal() {
  $("cal-ov").classList.add("hidden");
  selectCb = null;
}

export async function renderCal() {
  const y = calDate.getFullYear(), m = calDate.getMonth();
  $("cal-mo").textContent = `${MONTHS[m]} ${y}`;

  const fd   = new Date(y, m, 1).getDay();
  const off  = fd === 0 ? 6 : fd - 1;
  const days = new Date(y, m + 1, 0).getDate();
  const tod  = new Date(); tod.setHours(0,0,0,0);

  const [tasks, ideas, diary] = await Promise.all([getTasks(), getIdeas(), getDiary()]);
  const allD = new Set([...tasks, ...ideas, ...diary].map(x => x.date).filter(Boolean));

  let html = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"]
    .map(d => `<div class="cal-dh">${d}</div>`).join("");

  for (let i = 0; i < off; i++) {
    const pd = new Date(y, m, -off + i + 1);
    html += `<div class="cal-cell other"><div class="cc-day">${pd.getDate()}</div></div>`;
  }
  for (let d = 1; d <= days; d++) {
    const dt    = new Date(y, m, d);
    const ds    = dstr(dt);
    const isTod = ds === dstr(tod);
    const dayT  = tasks.filter(t => t.date === ds);
    const hasDot = allD.has(ds) && !dayT.length;
    // Показываем только количество задач, не текст — чтобы не было масштабирования
    const taskHint = dayT.length
      ? `<div class="cc-task-count">📋 ${dayT.length}</div>`
      : (hasDot ? `<div class="cc-ev">•</div>` : "");
    html += `<div class="cal-cell ${isTod?"today":""}" data-date="${ds}">
      <div class="cc-day">${d}</div>${taskHint}
    </div>`;
  }
  $("cal-grid").innerHTML = html;
  $("cal-det").innerHTML  = "";

  $("cal-grid").querySelectorAll(".cal-cell:not(.other)").forEach(cell => {
    cell.addEventListener("click", async () => {
      $("cal-grid").querySelectorAll(".cal-cell").forEach(c => c.classList.remove("sel"));
      cell.classList.add("sel");
      const ds = cell.dataset.date;

      // Picking mode
      if (selectCb) { selectCb(new Date(ds)); closeCal(); return; }

      // Переходим на вкладку ДЕНЬ с выбранной датой
      // Парсим дату в локальном времени
      const [y2, m2, d2] = ds.split("-").map(Number);
      const localDate = new Date(y2, m2 - 1, d2);
      localDate.setHours(0, 0, 0, 0);

      closeCal();

      // Переключаем на вкладку ДЕНЬ и устанавливаем дату
      if (window._setPlanDate) {
        window._setPlanDate(localDate);
      } else {
        // Fallback: переключаем вкладку и ждём рендер
        window.switchTab?.("plan").then?.(() => {
          window._setPlanDate?.(localDate);
        });
        window.switchTab?.("plan");
      }
    });
  });
}

export function initCalendar() {
  $("cal-pm").onclick = () => { calDate.setMonth(calDate.getMonth()-1); renderCal(); };
  $("cal-nm").onclick = () => { calDate.setMonth(calDate.getMonth()+1); renderCal(); };
  $("cal-ov").addEventListener("click", e => { if(e.target === $("cal-ov")) closeCal(); });
}
