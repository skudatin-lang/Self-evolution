// ════════════════════════════════════════
//  APP.JS — главный файл запуска v3
//  Life Evolution
// ════════════════════════════════════════

import { auth }                          from "./firebase.js";
import { setUid, getTasks, getIdeas,
         getDiary, deleteTask, deleteIdea,
         deleteDiaryEntry, deleteProject,
         deleteGoal, deleteTemplate,
         toggleTask, saveEnergyScore, saveMetric,
         getSurvey, saveAiPlanDraft, getAiPlanDraft, applyAiPlan,
         esc, isOv, fdt }                from "./db.js";
import { initModal, toast, addSubRow,
         setPriority }                   from "./modal.js";
import { switchTab, registerTab,
         openSidebar, closeSidebar }     from "./router.js";
import { openCal, closeCal,
         initCalendar }                  from "./calendar.js";
import { openNewModal, editTaskModal,
         editIdeaModal, editDiaryModal,
         buildTaskModal }                from "./forms.js";
import { initStorage }                   from "./storage.js";
import { initDashboard }                 from "./tabs/dashboard.js";
import { initPlan, renderPlan }          from "./tabs/plan.js";
import { initGoals, renderGoals }        from "./tabs/goals.js";
import { initIdeas, renderIdeas }        from "./tabs/ideas.js";
import { initDiary, renderDiary }        from "./tabs/diary.js";
import { initProfileTab, renderProfileTab } from "./tabs/profile-tab.js";
import { initAnalytics, renderAnalytics }   from "./tabs/analytics.js";
import { initAiChat, renderAiChat }         from "./tabs/ai-chat.js";
import { saveWeekGoal, cleanupRecurringChildren, markFailedTasks } from "./db.js";
import { openProfileDialog }             from "./profile.js";
import { openBankDialog }                from "./actions-bank.js";
import { MONTHS }                        from "./utils.js";
import "./survey.js";
// ai-plan.js — загружается динамически (lazy) чтобы не блокировать старт приложения
// Файл: js/ai-plan.js

import {
  GoogleAuthProvider, OAuthProvider,
  signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const $ = id => document.getElementById(id);

// ════════════════════════════════════════
//  WINDOW GLOBALS
// ════════════════════════════════════════
window.openNewModal = openNewModal;
window.openCal      = openCal;
window.closeCal     = closeCal;
window.switchTab    = switchTab;
window.editTask     = editTaskModal;
window.editIdea     = editIdeaModal;
window.editDiary    = editDiaryModal;

window.toggleTask = async id => {
  await toggleTask(id);
  const planBody = document.getElementById("plan-body");
  if (planBody) await renderPlan();
  else refreshAll();
};

window._toast = toast;

window._saveEnergy = async (taskId, score, btnEl) => {
  await saveEnergyScore(taskId, score);
  const row = btnEl.closest(".en-btns") || btnEl.closest(".en-row");
  if (row) {
    row.querySelectorAll(".en-btn").forEach((b, i) => {
      const n = i + 1;
      b.className = `en-btn${n === score ? " on e" + n : ""}`;
    });
  }
};

window._saveMetric = async (taskId, field, value, btnEl) => {
  await saveMetric(taskId, field, value);
  btnEl?.closest(".metric-btns")?.querySelectorAll(".metric-btn").forEach(b =>
    b.classList.toggle("on", b.dataset.val === value)
  );
};

window._esc   = esc;
window._fdt   = fdt;
window._isOv  = isOv;
window._setPri  = setPriority;
window._addSub  = (containerId = "sub-list") => addSubRow(containerId);
window._saveWG  = saveWeekGoal;
window._getTasks = getTasks;
window._getIdeas = getIdeas;
window._getDiary = getDiary;

window.delItem = async (col, id) => {
  if (!confirm("Удалить?")) return;
  const map = {
    tasks:     deleteTask,
    ideas:     deleteIdea,
    diary:     deleteDiaryEntry,
    projects:  deleteProject,
    goals:     deleteGoal,
    templates: deleteTemplate,
  };
  await map[col]?.(id);
  toast("Удалено");
  refreshAll();
};

window._delTask = async id => {
  if (!confirm("Удалить задачу?")) return;
  await deleteTask(id);
  toast("Задача удалена");
  const { closeModal } = await import("./modal.js");
  closeModal();
  refreshAll();
};

window._refreshAll = refreshAll;

// ════════════════════════════════════════
//  REFRESH
// ════════════════════════════════════════
async function refreshAll() {
  const tab = (await import("./router.js")).curTab;
  if      (tab === "dashboard") { const { renderDashboard } = await import("./tabs/dashboard.js"); await renderDashboard?.(); }
  else if (tab === "plan")      { await renderPlan(); renderGoals().catch(() => {}); }
  else if (tab === "goals")     await renderGoals();
  else if (tab === "ideas")     await renderIdeas();
  else if (tab === "diary")     await renderDiary();
  else if (tab === "profile")   await renderProfileTab();
  else if (tab === "analytics") await renderAnalytics();
  else if (tab === "ai-chat")   await renderAiChat();
}

// ════════════════════════════════════════
//  MOBILE "ЕЩЁ" MENU
// ════════════════════════════════════════
window._openMoreMenu = () => {
  const ov = document.getElementById("more-sheet-ov");
  if (ov) ov.classList.remove("hidden");
};
window._closeMoreMenu = () => {
  const ov = document.getElementById("more-sheet-ov");
  if (ov) ov.classList.add("hidden");
};
window._moreNav = async (tab) => {
  window._closeMoreMenu();
  await switchTab(tab);
  // Mark "Ещё" button as active on bottom nav
  document.querySelectorAll(".bn-btn").forEach(b => b.classList.remove("on"));
  document.getElementById("bn-more-btn")?.classList.add("on");
};

// ════════════════════════════════════════
//  INIT
// ════════════════════════════════════════
function initApp() {
  initModal();
  initCalendar();
  initStorage();

  // Register all tab renderers
  initDashboard();
  initPlan();
  initGoals();
  initIdeas();
  initDiary();
  initProfileTab();
  initAnalytics();
  initAiChat();

  // Desktop top-nav clicks
  document.querySelectorAll(".nt").forEach(t =>
    t.addEventListener("click", () => switchTab(t.dataset.tab))
  );

  // Mobile bottom-nav clicks (only the 4 direct tabs — "Ещё" handled separately)
  document.querySelectorAll(".bn-btn:not(#bn-more-btn)").forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      if (tab) switchTab(tab);
    });
  });

  // Sidebar toggle (mobile)
  $("burger")?.addEventListener("click", openSidebar);
  $("sb-ov")?.addEventListener("click",  closeSidebar);

  // Theme
  initTheme();

  // "Новая запись" — opens entry picker
  $("sb-new")?.addEventListener("click", () => {
    closeSidebar();
    window._openNewEntryPicker?.();
  });
  $("tb-new")?.addEventListener("click", () => window._openNewEntryPicker?.());
}

// ── Sync bottom nav active state when tab switches ──
const _origSwitchTab = switchTab;
window.switchTab = async (id) => {
  await _origSwitchTab(id);
  // Update bottom nav
  const moreSet = new Set(["profile","analytics","ideas","ai-chat"]);
  document.querySelectorAll(".bn-btn").forEach(b => b.classList.remove("on"));
  if (moreSet.has(id)) {
    document.getElementById("bn-more-btn")?.classList.add("on");
  } else {
    document.querySelector(`.bn-btn[data-tab="${id}"]`)?.classList.add("on");
  }
};

// ════════════════════════════════════════
//  AUTH
// ════════════════════════════════════════
$("btn-g").onclick = async () => {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch(e) {
    const m = {
      "auth/unauthorized-domain":      "Домен не авторизован в Firebase Console → Authentication → Authorized domains",
      "auth/popup-blocked":            "Разрешите всплывающие окна в браузере.",
      "auth/popup-closed-by-user":     "Вход отменён.",
      "auth/cancelled-popup-request":  "",
    };
    const msg = m[e.code];
    if (msg === undefined) alert("Ошибка: " + e.code);
    else if (msg) alert(msg);
  }
};

$("btn-y").onclick = async () => {
  try {
    await signInWithPopup(auth, new OAuthProvider("yandex.com"));
  } catch(e) {
    if (e.code === "auth/popup-closed-by-user" || e.code === "auth/cancelled-popup-request") return;
    alert(e.code === "auth/unauthorized-domain"
      ? "Добавьте домен в Firebase Authorized domains."
      : "Яндекс: " + e.code);
  }
};

$("btn-logout").onclick = async () => {
  if (confirm("Выйти из аккаунта?")) await signOut(auth);
};

// ════════════════════════════════════════
//  AUTH STATE
// ════════════════════════════════════════
let appInitialized = false;

onAuthStateChanged(auth, async user => {
  if (user) {
    setUid(user.uid);

    // Fill sidebar user info
    $("sb-un").textContent = user.displayName || "Пользователь";
    $("sb-ue").textContent = user.email || "";
    const av = $("sb-av");
    if (av) {
      av.innerHTML = user.photoURL
        ? `<img src="${user.photoURL}" alt="фото"/>`
        : (user.displayName || "U")[0].toUpperCase();
    }
    const mn = new Date();
    $("sb-mo").textContent = MONTHS[mn.getMonth()].toUpperCase() + " " + mn.getFullYear();

    $("s-auth").classList.remove("on");
    $("s-app").classList.add("on");

    if (!appInitialized) {
      appInitialized = true;
      initApp();
      await switchTab("dashboard");

      // Expose global helpers
      window._openProfileDialog = openProfileDialog;
      window._openBankDialog    = openBankDialog;

      // Загружаем ai-plan динамически — не блокирует старт если файл отсутствует
      import("./ai-plan.js").catch(() => {
        console.warn("[app] ai-plan.js не найден — функция утреннего плана недоступна");
      });

      // Cleanup recurring task children
      cleanupRecurringChildren().then(n => {
        if (n > 0) { refreshAll(); console.log(`[app] Cleaned ${n} recurring children`); }
      });

      // Авто-пометка невыполненных задач прошлых дней как "провалено"
      markFailedTasks().then(n => {
        if (n > 0) {
          console.log(`[app] Marked ${n} tasks as failed`);
          refreshAll();
        }
      }).catch(e => console.warn("[app] markFailedTasks error:", e));

      // Survey check (every 30 days)
      setTimeout(async () => {
        const surveys = await getSurvey();
        const s = surveys[0];
        const needSurvey = !s || !s.scores ||
          (s.updatedAt && (Date.now() - s.updatedAt.toDate?.().getTime?.()) > 30 * 24 * 60 * 60 * 1000);
        if (needSurvey) window.openSurvey?.();
      }, 800);
    }
  } else {
    appInitialized = false;
    $("s-app").classList.remove("on");
    $("s-auth").classList.add("on");
  }
});

// ════════════════════════════════════════
//  THEME SYSTEM
// ════════════════════════════════════════
const THEMES = {
  // ── Life OS — тёмный ambient (дефолт) ──
  // Дизайн-система: #050816 фон, #4DFFB4 акцент, #7C5CFF вторичный
  "life-os": {
    label:"◆ Life OS", dark: true,
    bg:"#050816",  bgs:"#0B1023",  bgp:"#0B1023",  bgw:"#121933",
    br:"#4DFFB4",  brd:"#2bdb95",  brl:"#7DFFD4",
    go:"#4DFFB4",  god:"#2bdb95",  gol:"#7DFFD4",
    cr:"#0B1023",  crd:"#050816",
    red:"#FF5C8F", grn:"#4DFFB4",  blu:"#5CB8FF",
    tx:"#EAEEF6",  txm:"#7C9CB8",  txl:"#4A6B8A",
    bd:"rgba(77,255,180,0.08)", bds:"rgba(77,255,180,0.20)", sh:"rgba(0,0,0,0.65)",
    acc2:"#7C5CFF", warn:"#FFB84D",
  },
  // ── Светлая ──
  // Дизайн-система: #F7F7FB фон, #407CFF акцент, #7C5CFF вторичный
  "light": {
    label:"☀️ Светлая", dark: false,
    bg:"#F7F7FB",  bgs:"#EEEEF6",  bgp:"#FFFFFF",  bgw:"#FFFFFF",
    br:"#407CFF",  brd:"#2563EB",  brl:"#60A5FA",
    go:"#407CFF",  god:"#2563EB",  gol:"#60A5FA",
    cr:"#F0F2FA",  crd:"#E3E8F2",
    red:"#FF5C8F", grn:"#22C55E",  blu:"#407CFF",
    tx:"#0F172A",  txm:"#475569",  txl:"#94A3B8",
    bd:"rgba(64,124,255,0.12)", bds:"rgba(64,124,255,0.28)", sh:"rgba(15,23,42,0.08)",
    acc2:"#7C5CFF", warn:"#F59E0B",
  },
  // ── Тёмная ──
  // Дизайн-система: #0A0E1A фон, #4D7CFF акцент, #7C5CFF вторичный
  "dark": {
    label:"🌙 Тёмная", dark: true,
    bg:"#0A0E1A",  bgs:"#131827",  bgp:"#131827",  bgw:"#1E2436",
    br:"#4D7CFF",  brd:"#2563EB",  brl:"#7EA8FF",
    go:"#4D7CFF",  god:"#2563EB",  gol:"#7EA8FF",
    cr:"#131827",  crd:"#0A0E1A",
    red:"#FF5C8F", grn:"#4DFFB4",  blu:"#4D7CFF",
    tx:"#E8EAF0",  txm:"#8892A4",  txl:"#4A5568",
    bd:"rgba(77,124,255,0.12)", bds:"rgba(77,124,255,0.28)", sh:"rgba(0,0,0,0.60)",
    acc2:"#7C5CFF", warn:"#FFB84D",
  },
  // ── Лесная ──
  // Дизайн-система: #081408 фон, #62F198 акцент, #4DB6AC вторичный
  "forest": {
    label:"🌲 Лесная", dark: true,
    bg:"#081408",  bgs:"#112B11",  bgp:"#112B11",  bgw:"#1A3A28",
    br:"#62F198",  brd:"#3DD672",  brl:"#89F7B0",
    go:"#62F198",  god:"#3DD672",  gol:"#89F7B0",
    cr:"#112B11",  crd:"#081408",
    red:"#FF7043", grn:"#62F198",  blu:"#4DB6AC",
    tx:"#E8F5E8",  txm:"#86B894",  txl:"#4A7A54",
    bd:"rgba(98,241,152,0.10)", bds:"rgba(98,241,152,0.24)", sh:"rgba(0,10,4,0.60)",
    acc2:"#4DB6AC", warn:"#FFB74D",
  },
  // ── Бриз ──
  // Дизайн-система: #F0F2F7 фон (светлая), #7ED3F7 акцент, #4AC3F4 вторичный
  "breeze": {
    label:"🌊 Бриз", dark: false,
    bg:"#F0F2F7",  bgs:"#E3E8F2",  bgp:"#FFFFFF",  bgw:"#FFFFFF",
    br:"#4AC3F4",  brd:"#0EA5E9",  brl:"#7ED3F7",
    go:"#4AC3F4",  god:"#0EA5E9",  gol:"#7ED3F7",
    cr:"#EAF6FD",  crd:"#D6EFF9",
    red:"#FF6B8E", grn:"#34D399",  blu:"#4AC3F4",
    tx:"#0C1A2E",  txm:"#334E68",  txl:"#627D98",
    bd:"rgba(74,195,244,0.14)", bds:"rgba(74,195,244,0.32)", sh:"rgba(12,26,46,0.08)",
    acc2:"#7C5CFF", warn:"#FFB840",
  },
  // ── Закат ──
  // Дизайн-система: #1A0014 фон, #FF84B0 акцент, #FF6B8E вторичный
  "sunset": {
    label:"🌇 Закат", dark: true,
    bg:"#1A0014",  bgs:"#2E1020",  bgp:"#2E1020",  bgw:"#3E1F2E",
    br:"#FF84B0",  brd:"#FF6B8E",  brl:"#FFB3CC",
    go:"#FF84B0",  god:"#FF6B8E",  gol:"#FFB3CC",
    cr:"#2E1020",  crd:"#1A0014",
    red:"#FF6B8E", grn:"#7EF5B5",  blu:"#7EB5FF",
    tx:"#FDE8F0",  txm:"#C9849C",  txl:"#8A5068",
    bd:"rgba(255,132,176,0.12)", bds:"rgba(255,132,176,0.28)", sh:"rgba(80,0,40,0.65)",
    acc2:"#FF6B8E", warn:"#FFD166",
  },
  // ── Золото ──
  // Дизайн-система: #1A1408 фон, #FFD166 акцент, #FACD4B вторичный
  "gold": {
    label:"✨ Золото", dark: true,
    bg:"#1A1408",  bgs:"#261A00",  bgp:"#261A00",  bgw:"#322400",
    br:"#FFD166",  brd:"#FACD4B",  brl:"#FFE599",
    go:"#FFD166",  god:"#FACD4B",  gol:"#FFE599",
    cr:"#261A00",  crd:"#1A1408",
    red:"#FF7EF5", grn:"#40CFFF",  blu:"#40CFFF",
    tx:"#FFF8E8",  txm:"#C9A84C",  txl:"#8A7030",
    bd:"rgba(255,209,102,0.12)", bds:"rgba(255,209,102,0.28)", sh:"rgba(0,0,0,0.70)",
    acc2:"#FACD4B", warn:"#FF7EF5",
  },
};

function initTheme() {
  const saved = localStorage.getItem("lc-palette") || "life-os";
  applyPalette(saved);
  ["theme-toggle","nav-theme-btn"].forEach(id => {
    const btn = $(id);
    if (btn) btn.onclick = () => openPalettePicker();
  });
}

// ── Простое осветление/затемнение HEX цвета ──
function lightenHex(hex, amount) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  const clamp = v => Math.min(255,Math.max(0,v));
  return "#"+[clamp(r+amount),clamp(g+amount),clamp(b+amount)]
    .map(v=>v.toString(16).padStart(2,"0")).join("");
}

function applyPalette(id) {
  const t = THEMES[id] || THEMES["life-os"];
  const root = document.documentElement;
  // Устанавливаем data-palette для CSS-тем (переключает ВСЕ переменные)
  root.setAttribute("data-palette", id);
  // data-theme="dark/light" для обратной совместимости
  if (t.dark) root.setAttribute("data-theme","dark");
  else { root.removeAttribute("data-theme"); root.setAttribute("data-theme","light"); }
  // acc2 и warn берём из темы, иначе дефолт
  const acc2   = t.acc2  || (t.dark ? "#7C5CFF" : "#6B5CE7");
  const acc2l  = t.acc2  ? lightenHex(t.acc2, 20)  : "#9E8CFF";
  const acc2d  = t.acc2  ? lightenHex(t.acc2, -20) : "#5a3dcc";
  const warn   = t.warn  || (t.dark ? "#FFB84D" : "#E8924A");
  const vars = {
    "--bg": t.bg, "--bg-s": t.bgs, "--bg-p": t.bgp, "--bg-w": t.bgw,
    "--br": t.br, "--br-d": t.brd, "--br-l": t.brl,
    "--go": t.go, "--go-d": t.god, "--go-l": t.gol,
    "--cr": t.cr || t.bgp, "--cr-d": t.crd || t.bgw,
    "--red": t.red, "--grn": t.grn, "--blu": t.blu,
    "--tx": t.tx, "--tx-m": t.txm, "--tx-l": t.txl,
    "--bd": t.bd, "--bd-s": t.bds, "--sh": t.sh,
    "--acc2": acc2, "--acc2-l": acc2l, "--acc2-d": acc2d,
    "--warn": warn,
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  // Glow-переменные вычисляем из акцента темы
  const goR = parseInt(t.go.slice(1,3),16)||77, goG = parseInt(t.go.slice(3,5),16)||255, goB = parseInt(t.go.slice(5,7),16)||180;
  const a2R = parseInt(acc2.slice(1,3),16)||124, a2G = parseInt(acc2.slice(3,5),16)||92,  a2B = parseInt(acc2.slice(5,7),16)||255;
  root.style.setProperty("--glow-go",   `0 0 24px rgba(${goR},${goG},${goB},${t.dark?0.22:0.14})`);
  root.style.setProperty("--glow-acc2", `0 0 24px rgba(${a2R},${a2G},${a2B},${t.dark?0.28:0.16})`);
  root.style.setProperty("--glow-soft", `0 8px 40px rgba(0,0,0,${t.dark?0.55:0.08})`);
  const emoji = t.label.split(" ")[0];
  ["theme-toggle","nav-theme-btn"].forEach(bid => {
    const b = $(bid);
    if (b) b.textContent = emoji;
  });
  localStorage.setItem("lc-palette", id);
}

function openPalettePicker() {
  document.getElementById("lc-palette-picker")?.remove();
  const cur = localStorage.getItem("lc-palette") || "life-os";
  const picker = document.createElement("div");
  picker.id = "lc-palette-picker";
  picker.innerHTML = `
    <div class="pal-backdrop" onclick="document.getElementById('lc-palette-picker').remove()"></div>
    <div class="pal-popup">
      <div class="pal-title">🎨 Выбери палитру</div>
      ${Object.entries(THEMES).map(([id, t]) => `
        <button class="pal-btn ${id===cur?"on":""}" onclick="window._setPalette('${id}')">
          <span class="pal-dot" style="background:${t.bg};border:2px solid ${t.go}"></span>
          <span class="pal-dot" style="background:${t.go}"></span>
          <span class="pal-dot" style="background:${t.acc2||'#7C5CFF'}"></span>
          <span class="pal-lbl">${t.label}</span>
          ${t.dark ? '<span class="pal-dark-badge">🌙</span>' : '<span class="pal-dark-badge" style="opacity:.5">☀️</span>'}
        </button>`).join("")}
    </div>`;
  document.body.appendChild(picker);
}

window._setPalette  = id => { applyPalette(id); document.getElementById("lc-palette-picker")?.remove(); };
window.toggleTheme  = () => openPalettePicker();
