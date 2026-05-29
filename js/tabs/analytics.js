// ════════════════════════════════════════
//  TAB: АНАЛИТИКА
//  js/tabs/analytics.js
// ════════════════════════════════════════
import { registerTab }                  from "../router.js";
import { getTasks, getDailyAudits,
         getGoals, dstr, esc }           from "../db.js";

let analyticsPeriod = "week"; // week | month | year

export function initAnalytics() { registerTab("analytics", renderAnalytics); }

// ── Вычислить данные состояния за период ──
async function buildStateData(period) {
  const audits = await getDailyAudits();
  const now    = new Date();
  let cutoff;
  if (period === "week")  cutoff = new Date(now - 7  * 86400000);
  if (period === "month") cutoff = new Date(now - 30 * 86400000);
  if (period === "year")  cutoff = new Date(now - 365* 86400000);

  return audits
    .filter(a => a.date && new Date(a.date + "T00:00:00") >= cutoff)
    .sort((a, b) => a.date > b.date ? 1 : -1);
}

// ── SVG мини-график ──
function sparkline(data, key, color, label) {
  if (!data.length) return "";
  const vals = data.map(d => d[key] ?? 0).filter(v => v > 0);
  if (!vals.length) return "";

  const W = 280, H = 80, pad = 8;
  const maxV = 10, minV = 0;
  const xStep = (W - pad * 2) / Math.max(vals.length - 1, 1);

  const points = vals.map((v, i) => {
    const x = pad + i * xStep;
    const y = H - pad - ((v - minV) / (maxV - minV)) * (H - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return `<div class="spark-wrap">
    <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <polyline points="${points}"
        fill="none" stroke="${color}" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round"
        style="filter:drop-shadow(0 0 4px ${color}60)"/>
      ${vals.map((v, i) => {
        const x = pad + i * xStep;
        const y = H - pad - ((v - minV) / (maxV - minV)) * (H - pad * 2);
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${color}"/>`;
      }).join("")}
    </svg>
  </div>`;
}

// ── Ключевые выводы из данных ──
function buildInsights(data, tasks) {
  const insights = [];

  if (data.length < 3) {
    insights.push("Заполни чек-ин несколько дней подряд — появятся паттерны");
    return insights;
  }

  // Пик энергии по часам чек-ина
  const mornings = data.filter(d => d.checkinTime && new Date(d.checkinTime).getHours() < 10);
  if (mornings.length > 0) {
    const avgMorningEnergy = mornings.reduce((s, d) => s + (d.energy || 0), 0) / mornings.length;
    if (avgMorningEnergy >= 7) insights.push("Твой фокус максимален по утрам");
  }

  // Стресс и количество задач
  const highTaskDays = data.filter(d => {
    const done = tasks.filter(t => t.completedDate === d.date).length;
    return done > 5 && (d.stress || 0) >= 7;
  });
  if (highTaskDays.length >= 2) insights.push("Стресс растёт в дни с >5 задачами");

  // Сон и энергия
  const sleepData = data.filter(d => d.sleep && d.energy);
  if (sleepData.length >= 3) {
    const goodSleep = sleepData.filter(d => d.sleep >= 7);
    const badSleep  = sleepData.filter(d => d.sleep < 6);
    if (goodSleep.length > 0 && badSleep.length > 0) {
      insights.push("Сон напрямую влияет на энергию");
    }
  }

  // Физическая активность и настроение
  const active = data.filter(d => d.refObservation?.includes("спорт") || d.refObservation?.includes("трениров"));
  if (active.length >= 2) insights.push("Физическая активность улучшает настроение");

  if (!insights.length) insights.push("Продолжай заполнять чек-ин — скоро появятся персональные инсайты");
  return insights;
}

export async function renderAnalytics() {
  document.getElementById("tb-ttl").textContent = "Аналитика";
  const body = document.getElementById("analytics-body");
  if (!body) return;

  // Очищаем sidebar
  const sb = document.getElementById("sb-body");
  if (sb) sb.innerHTML = "";

  const [data, tasks, goals] = await Promise.all([
    buildStateData(analyticsPeriod),
    getTasks(),
    getGoals(),
  ]);

  // Прогресс целей
  const activeGoals = goals.filter(g => !g.done);
  const goalProgress = activeGoals.map(g => {
    const gTasks   = tasks.filter(t => t.goalId === g.id);
    const doneCnt  = gTasks.filter(t => t.done).length;
    const total    = gTasks.length;
    const pct      = total > 0 ? Math.round(doneCnt / total * 100) : 0;
    return { title: g.title, pct, color: g.color || "#4DFFB4" };
  });
  const avgPct = goalProgress.length
    ? Math.round(goalProgress.reduce((s, g) => s + g.pct, 0) / goalProgress.length)
    : 0;

  const insights = buildInsights(data, tasks);

  // Круговой прогресс SVG
  const r = 36, circ = 2 * Math.PI * r;
  const dash = (avgPct / 100) * circ;
  const circSvg = `
    <svg width="90" height="90" viewBox="0 0 90 90">
      <circle cx="45" cy="45" r="${r}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="7"/>
      <circle cx="45" cy="45" r="${r}" fill="none"
        stroke="#7C5CFF" stroke-width="7"
        stroke-dasharray="${dash.toFixed(1)} ${circ.toFixed(1)}"
        stroke-dashoffset="${(circ/4).toFixed(1)}"
        stroke-linecap="round"
        style="filter:drop-shadow(0 0 6px rgba(124,92,255,0.5))"/>
      <text x="45" y="49" text-anchor="middle"
        font-family="Cinzel,serif" font-size="16" font-weight="700"
        fill="#9E8CFF">${avgPct}%</text>
    </svg>`;

  body.innerHTML = `

    <!-- Переключатель периода -->
    <div class="analytics-period-switch">
      <button class="aps-btn ${analyticsPeriod==="week" ?"on":""}" onclick="window._analyticsPeriod('week')">Неделя</button>
      <button class="aps-btn ${analyticsPeriod==="month"?"on":""}" onclick="window._analyticsPeriod('month')">Месяц</button>
      <button class="aps-btn ${analyticsPeriod==="year" ?"on":""}" onclick="window._analyticsPeriod('year')">Год</button>
    </div>

    <!-- График трендов -->
    <div class="analytics-card">
      <div class="analytics-card-title">Тренды состояния</div>
      ${data.length >= 2 ? `
        <div class="analytics-chart-wrap" id="analytics-chart">
          <canvas id="state-chart" height="120"></canvas>
        </div>
        <div class="analytics-legend">
          <span class="aleg-item"><span class="aleg-dot" style="background:#4DFFB4"></span>Энергия</span>
          <span class="aleg-item"><span class="aleg-dot" style="background:#FFB84D"></span>Фокус</span>
          <span class="aleg-item"><span class="aleg-dot" style="background:#FF5C9F"></span>Стресс</span>
          <span class="aleg-item"><span class="aleg-dot" style="background:#5CB8FF"></span>Уверенность</span>
        </div>
      ` : `<div class="analytics-empty">Заполни чек-ин несколько дней чтобы увидеть тренды</div>`}
    </div>

    <!-- Ключевые выводы -->
    <div class="analytics-card">
      <div class="analytics-card-title">Ключевые выводы</div>
      <ul class="analytics-insights">
        ${insights.map(i => `<li>${esc(i)}</li>`).join("")}
      </ul>
      <button class="analytics-detail-btn" onclick="window.switchTab('ai-chat')">
        Подробный анализ ›
      </button>
    </div>

    <!-- Прогресс целей -->
    <div class="analytics-card analytics-goals-card">
      <div class="analytics-goals-left">
        <div class="analytics-card-title">Прогресс целей</div>
        <div class="analytics-goals-sub">В среднем ${avgPct}% выполнения планов</div>
      </div>
      <div class="analytics-goals-circle">${circSvg}</div>
    </div>
  `;

  // Рисуем canvas-график если есть данные
  if (data.length >= 2) {
    requestAnimationFrame(() => drawStateChart(data));
  }
}

// ── Canvas-график состояния ──
function drawStateChart(data) {
  const canvas = document.getElementById("state-chart");
  if (!canvas) return;
  const wrap = canvas.parentElement;
  const W = wrap.offsetWidth || 300;
  const H = 120;
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, W, H);

  const series = [
    { key: "energy",    color: "#4DFFB4" },
    { key: "focus",     color: "#FFB84D" },
    { key: "stress",    color: "#FF5C9F" },
    { key: "control",   color: "#5CB8FF" },
  ];

  const pad = 12;
  const xStep = (W - pad * 2) / Math.max(data.length - 1, 1);

  series.forEach(({ key, color }) => {
    const vals = data.map(d => d[key] ?? null);
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2;
    ctx.shadowBlur  = 6;
    ctx.shadowColor = color + "80";
    let started = false;
    vals.forEach((v, i) => {
      if (v === null) return;
      const x = pad + i * xStep;
      const y = H - pad - ((v - 0) / 10) * (H - pad * 2);
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Dots
    vals.forEach((v, i) => {
      if (v === null) return;
      const x = pad + i * xStep;
      const y = H - pad - ((v - 0) / 10) * (H - pad * 2);
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  // X-axis labels (dates)
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.font = "10px Raleway,sans-serif";
  ctx.textAlign = "center";
  const step = Math.max(1, Math.floor(data.length / 5));
  data.forEach((d, i) => {
    if (i % step !== 0 && i !== data.length - 1) return;
    const x = pad + i * xStep;
    const parts = d.date?.split("-") || [];
    const lbl   = parts.length === 3 ? `${parts[2]} ${["","янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"][+parts[1]||0]}` : "";
    ctx.fillText(lbl, x, H - 1);
  });
}

window._analyticsPeriod = async period => {
  analyticsPeriod = period;
  await renderAnalytics();
};
