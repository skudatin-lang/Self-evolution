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

      // Show detail
      const dt = tasks.filter(t => t.date === ds);
      const di = ideas.filter(x => x.date === ds);
      const dd = diary.filter(x => x.date === ds);
      let det  = `<div style="font-family:var(--fd);font-size:11px;font-weight:700;
        color:var(--br);margin-bottom:8px;text-transform:uppercase;">${ds}</div>`;
      if (dt.length) det += dt.map(t =>
        `<div style="font-size:12px;padding:3px 0;color:var(--br-d)">📋 ${esc(t.title)}</div>`).join("");
      if (di.length) det += di.map(x =>
        `<div style="font-size:12px;padding:3px 0;color:var(--go-d)">💡 ${esc(x.title||x.text)}</div>`).join("");
      if (dd.length) det += dd.map(x =>
        `<div style="font-size:12px;padding:3px 0;color:var(--tx-m)">📖 ${esc(x.title||x.text)}</div>`).join("");
      if (!dt.length && !di.length && !dd.length)
        det += `<p style="font-size:12px;color:var(--tx-l)">Нет записей на этот день</p>`;
      $("cal-det").innerHTML = det;
    });
  });
}

export function initCalendar() {
  $("cal-pm").onclick = () => { calDate.setMonth(calDate.getMonth()-1); renderCal(); };
  $("cal-nm").onclick = () => { calDate.setMonth(calDate.getMonth()+1); renderCal(); };
  $("cal-ov").addEventListener("click", e => { if(e.target === $("cal-ov")) closeCal(); });
}
