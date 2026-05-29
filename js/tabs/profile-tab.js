// ════════════════════════════════════════
//  TAB: ПРОФИЛЬ
//  js/tabs/profile-tab.js
// ════════════════════════════════════════
import { registerTab }             from "../router.js";
import { getTasks, getDailyAudits,
         dstr, esc }               from "../db.js";

export function initProfileTab() { registerTab("profile", renderProfileTab); }

export async function renderProfileTab() {
  document.getElementById("tb-ttl").textContent = "Профиль";
  const body = document.getElementById("profile-body");
  if (!body) return;

  // Данные пользователя
  const userName  = document.getElementById("sb-un")?.textContent || "Пользователь";
  const userEmail = document.getElementById("sb-ue")?.textContent || "";
  const userPhoto = document.querySelector("#sb-av img")?.src || "";

  // Вычисляем статистику
  const tasks   = await getTasks();
  const audits  = await getDailyAudits();
  const today2  = dstr(new Date());

  // Дней в системе (по количеству уникальных дат в daily_audit)
  const auditDates = new Set(audits.map(a => a.date));
  const daysCount  = auditDates.size || Math.min(
    Math.ceil((Date.now() - (tasks[0]?.createdAt?.toDate?.()?.getTime?.() ?? Date.now())) / 86400000),
    999
  );

  // Self-trust: % дней когда были выполнены задачи
  const doneDates   = new Set(tasks.filter(t => t.completedDate).map(t => t.completedDate));
  const selfTrust   = auditDates.size > 0
    ? Math.round([...auditDates].filter(d => doneDates.has(d)).length / auditDates.size * 100)
    : 0;

  // Достижения — уникальные выполненные задачи с высоким приоритетом
  const achievements = tasks.filter(t => t.done && t.priority === "high").length;

  // Профиль AI из localStorage
  const aiProf = JSON.parse(localStorage.getItem("lc-ai-profile") || "{}");

  body.innerHTML = `
    <!-- ── Шапка профиля ── -->
    <div class="prof-tab-header">
      <div class="prof-tab-photo">
        ${userPhoto
          ? `<img src="${userPhoto}" alt="фото"/>`
          : `<span>${(userName[0] || "U").toUpperCase()}</span>`}
      </div>
      <div class="prof-tab-info">
        <div class="prof-tab-name">${esc(userName)}</div>
        <div class="prof-tab-tagline">${esc(aiProf.tagline || "Создаю свою лучшую жизнь")}</div>
      </div>
    </div>

    <!-- ── Статистика ── -->
    <div class="prof-stats-row">
      <div class="prof-stat-card">
        <div class="prof-stat-val">${daysCount}</div>
        <div class="prof-stat-lbl">Дней в системе</div>
      </div>
      <div class="prof-stat-card">
        <div class="prof-stat-val">${selfTrust}%</div>
        <div class="prof-stat-lbl">Самодисциплина</div>
      </div>
      <div class="prof-stat-card">
        <div class="prof-stat-val">${achievements}</div>
        <div class="prof-stat-lbl">Достижений</div>
      </div>
    </div>

    <!-- ── Меню ── -->
    <div class="prof-menu">
      <button class="prof-menu-item" onclick="window._openProfileSection('personal')">
        <span class="prof-menu-ico">👤</span>
        <span class="prof-menu-lbl">Личные данные</span>
        <span class="prof-menu-action">Редактировать</span>
      </button>
      <button class="prof-menu-item" onclick="window._openProfileSection('values')">
        <span class="prof-menu-ico">⭐</span>
        <span class="prof-menu-lbl">Ценности и убеждения</span>
        <span class="prof-menu-arrow">›</span>
      </button>
      <button class="prof-menu-item" onclick="window._openProfileSection('strengths')">
        <span class="prof-menu-ico">💪</span>
        <span class="prof-menu-lbl">Мои сильные стороны</span>
        <span class="prof-menu-arrow">›</span>
      </button>
      <button class="prof-menu-item" onclick="window._openProfileSection('growth')">
        <span class="prof-menu-ico">🌱</span>
        <span class="prof-menu-lbl">Зоны роста</span>
        <span class="prof-menu-arrow">›</span>
      </button>
    </div>

    <div class="prof-menu" style="margin-top:12px">
      <button class="prof-menu-item" onclick="window._openProfileDialog()">
        <span class="prof-menu-ico">🧬</span>
        <span class="prof-menu-lbl">Профиль для AI</span>
        <span class="prof-menu-arrow">›</span>
      </button>
      <button class="prof-menu-item" onclick="window.reopenSurvey?.()">
        <span class="prof-menu-ico">🎯</span>
        <span class="prof-menu-lbl">Колесо баланса</span>
        <span class="prof-menu-arrow">›</span>
      </button>
      <button class="prof-menu-item" onclick="window.toggleTheme?.()">
        <span class="prof-menu-ico">🎨</span>
        <span class="prof-menu-lbl">Тема оформления</span>
        <span class="prof-menu-arrow">›</span>
      </button>
      <button class="prof-menu-item" onclick="window.openCal?.()">
        <span class="prof-menu-ico">📅</span>
        <span class="prof-menu-lbl">Календарь</span>
        <span class="prof-menu-arrow">›</span>
      </button>
    </div>

    <!-- Выход -->
    <button class="prof-logout-btn" onclick="document.getElementById('btn-logout')?.click()">
      Выйти из аккаунта
    </button>
  `;
}

// Заглушки для подсекций — расширить позже
window._openProfileSection = section => {
  const titles = {
    personal:  "Личные данные",
    values:    "Ценности и убеждения",
    strengths: "Мои сильные стороны",
    growth:    "Зоны роста",
  };
  window._toast?.(`${titles[section] || section} — в разработке`);
};
