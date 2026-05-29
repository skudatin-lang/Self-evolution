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
import { saveWeekGoal, cleanupRecurringChildren } from "./db.js";
import { openProfileDialog }             from "./profile.js";
import { openBankDialog }                from "./actions-bank.js";
import { MONTHS }                        from "./utils.js";
import "./survey.js";
import "./ai-plan.js";

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

      // Cleanup recurring task children
      cleanupRecurringChildren().then(n => {
        if (n > 0) { refreshAll(); console.log(`[app] Cleaned ${n} recurring children`); }
      });

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
  "life-os": {
    label:"◆ Life OS", dark: true,
    bg:"#050816", bgs:"#080d1f", bgp:"#0B1023", bgw:"#121933",
    br:"#4DFFB4", brd:"#2bcc8a", brl:"#80ffcc",
    go:"#4DFFB4", god:"#2bcc8a", gol:"#80ffcc",
    cr:"#0d1428", crd:"#0a1020",
    red:"#FF6B6B", grn:"#4DFFB4", blu:"#5CB8FF",
    tx:"#E2EAF4", txm:"#8AAFC8", txl:"#4D7A9E",
    bd:"rgba(77,255,180,0.08)", bds:"rgba(77,255,180,0.18)", sh:"rgba(0,0,0,0.6)",
  },
  "light": {
    label:"☀️ Светлая", dark: false,
    bg:"#EDE3CC", bgs:"#E4D8BB", bgp:"#F5EDD8", bgw:"#FDFAF4",
    br:"#7B4F1E", brd:"#5A3510", brl:"#A06A2E",
    go:"#C8963E", god:"#9A6F28", gol:"#E4B96A",
    cr:"#F5EDD8", crd:"#EAE0C4",
    red:"#C04030", grn:"#4A8A4A", blu:"#3A6EA8",
    tx:"#3A2810", txm:"#7B5A30", txl:"#A08050",
    bd:"rgba(123,79,30,.18)", bds:"rgba(123,79,30,.42)", sh:"rgba(80,40,10,.10)",
  },
  "dark": {
    label:"🌙 Тёмная", dark: true,
    bg:"#0F1923", bgs:"#152232", bgp:"#152232", bgw:"#1C2F45",
    br:"#5BA4CF", brd:"#3D7FA8", brl:"#85C1E9",
    go:"#00B4D8", god:"#0096B7", gol:"#48CAE4",
    cr:"#152232", crd:"#1C2F45",
    red:"#FF6B6B", grn:"#43D9A2", blu:"#5BA4CF",
    tx:"#E2EAF4", txm:"#8AAFC8", txl:"#4D7A9E",
    bd:"rgba(0,180,216,.14)", bds:"rgba(0,180,216,.30)", sh:"rgba(0,0,0,.55)",
  },
  "forest": {
    label:"🌲 Лесная", dark: true,
    bg:"#0D1A0F", bgs:"#152A18", bgp:"#152A18", bgw:"#1E3A22",
    br:"#4CAF50", brd:"#388E3C", brl:"#81C784",
    go:"#4CAF50", god:"#388E3C", gol:"#81C784",
    cr:"#152A18", crd:"#1E3A22",
    red:"#FF7043", grn:"#AED581", blu:"#4DB6AC",
    tx:"#E8F5E9", txm:"#A5D6A7", txl:"#66BB6A",
    bd:"rgba(76,175,80,.18)", bds:"rgba(76,175,80,.38)", sh:"rgba(0,20,5,.55)",
  },
  "breeze": {
    label:"🌊 Бриз", dark: false,
    bg:"#E8F4F8", bgs:"#D6EBF5", bgp:"#F0F8FC", bgw:"#FFFFFF",
    br:"#0277BD", brd:"#01579B", brl:"#0288D1",
    go:"#0288D1", god:"#0277BD", gol:"#29B6F6",
    cr:"#F0F8FC", crd:"#D6EBF5",
    red:"#EF5350", grn:"#26A69A", blu:"#1565C0",
    tx:"#0D2B3E", txm:"#2E6B8A", txl:"#5B9BB7",
    bd:"rgba(2,119,189,.18)", bds:"rgba(2,119,189,.40)", sh:"rgba(0,40,80,.10)",
  },
  "sunset": {
    label:"🌇 Закат", dark: true,
    bg:"#1A0A0F", bgs:"#2A1018", bgp:"#2A1018", bgw:"#3A1822",
    br:"#FF6B6B", brd:"#E53935", brl:"#FF8A80",
    go:"#FF6B6B", god:"#E53935", gol:"#FF8A80",
    cr:"#2A1018", crd:"#3A1822",
    red:"#FF8A65", grn:"#FFD54F", blu:"#FF80AB",
    tx:"#FBE9E7", txm:"#FFAB91", txl:"#FF7043",
    bd:"rgba(255,107,107,.18)", bds:"rgba(255,107,107,.38)", sh:"rgba(80,0,20,.55)",
  },
  "gold": {
    label:"✨ Золото", dark: true,
    bg:"#0F0A00", bgs:"#1A1200", bgp:"#1A1200", bgw:"#261A00",
    br:"#FFD700", brd:"#B8860B", brl:"#FFE44D",
    go:"#FFD700", god:"#B8860B", gol:"#FFE44D",
    cr:"#1A1200", crd:"#261A00",
    red:"#FF4500", grn:"#9ACD32", blu:"#4169E1",
    tx:"#FFF8DC", txm:"#DAA520", txl:"#8B7536",
    bd:"rgba(255,215,0,.18)", bds:"rgba(255,215,0,.40)", sh:"rgba(0,0,0,.65)",
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

function applyPalette(id) {
  const t = THEMES[id] || THEMES["life-os"];
  const root = document.documentElement;
  if (t.dark) root.setAttribute("data-theme","dark");
  else root.removeAttribute("data-theme");
  const vars = {
    "--bg": t.bg, "--bg-s": t.bgs, "--bg-p": t.bgp, "--bg-w": t.bgw,
    "--br": t.br, "--br-d": t.brd, "--br-l": t.brl,
    "--go": t.go, "--go-d": t.god, "--go-l": t.gol,
    "--cr": t.cr || t.bgp, "--cr-d": t.crd || t.bgw,
    "--red": t.red, "--grn": t.grn, "--blu": t.blu,
    "--tx": t.tx, "--tx-m": t.txm, "--tx-l": t.txl,
    "--bd": t.bd, "--bd-s": t.bds, "--sh": t.sh,
    "--acc2": t.dark ? "#7C5CFF" : "#6B5CE7",
    "--acc2-l": "#9E8CFF", "--acc2-d": "#5a3dcc",
    "--warn": t.dark ? "#FFB84D" : "#E8924A",
  };
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
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
          <span class="pal-dot" style="background:${t.go}"></span>
          <span class="pal-dot" style="background:${t.grn}"></span>
          <span class="pal-lbl">${t.label}</span>
          ${t.dark ? '<span class="pal-dark-badge">🌙</span>' : ''}
        </button>`).join("")}
    </div>`;
  document.body.appendChild(picker);
}

window._setPalette  = id => { applyPalette(id); document.getElementById("lc-palette-picker")?.remove(); };
window.toggleTheme  = () => openPalettePicker();
