// ════════════════════════════════════════
//  APP.JS — главный файл запуска
//  Собирает все модули вместе
// ════════════════════════════════════════

import { auth }                        from "./firebase.js";
import { setUid, getTasks, getIdeas,
         getDiary, deleteTask, deleteIdea,
         deleteDiaryEntry, deleteProject,
         deleteGoal, deleteTemplate,
         toggleTask, saveEnergyScore, saveMetric,
         getSurvey, saveAiPlanDraft, getAiPlanDraft, applyAiPlan,
         esc, isOv, fdt }  from "./db.js";
import { initModal, toast, addSubRow,
         setPriority }                 from "./modal.js";
import { switchTab, registerTab,
         openSidebar, closeSidebar }   from "./router.js";
import { openCal, closeCal,
         initCalendar }                from "./calendar.js";
import { openNewModal, editTaskModal,
         editIdeaModal, editDiaryModal,
         buildTaskModal }              from "./forms.js";
import { initStorage }                 from "./storage.js";
import { initDashboard }               from "./tabs/dashboard.js";
import { initPlan, renderPlan }        from "./tabs/plan.js";
import { initGoals, renderGoals }      from "./tabs/goals.js";
import { initIdeas, renderIdeas }      from "./tabs/ideas.js";
import { initDiary, renderDiary }      from "./tabs/diary.js";
import { initAvatar, openAvatarDialog, toggleAvatarVisible } from "./avatar.js";
import { saveWeekGoal, cleanupRecurringChildren } from "./db.js";
import { openProfileDialog } from "./profile.js";
import { openBankDialog } from "./actions-bank.js";
import { MONTHS }                      from "./utils.js";
import "./survey.js";
import "./ai-plan.js";

import {
  GoogleAuthProvider, OAuthProvider,
  signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const $ = id => document.getElementById(id);

// ════════════════════════════════════════
//  WINDOW GLOBALS
//  (нужны для inline onclick в HTML)
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
  // Обновляем только план дня если он открыт, иначе полный рефреш
  const planBody = document.getElementById("plan-body");
  if (planBody) await renderPlan();
  else refreshAll();
};
window._toast = toast; // алиас для модулей без прямого импорта (ai-plan.js, survey.js)

// Сохранение оценки энергии после выполненной задачи
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
  // Снимаем .on со всех кнопок группы, ставим только на нажатую
  btnEl?.closest(".metric-btns")?.querySelectorAll(".metric-btn").forEach(b =>
    b.classList.toggle("on", b.dataset.val === value)
  );
};
window._esc         = esc;
window._fdt         = fdt;
window._isOv        = isOv;
window._setPri      = setPriority;
window._addSub      = (containerId = "sub-list") => addSubRow(containerId);
window._saveWG      = saveWeekGoal;

window._getTasks    = getTasks;
window._getIdeas    = getIdeas;
window._getDiary    = getDiary;

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
//  REFRESH — обновляет текущую вкладку
// ════════════════════════════════════════
async function refreshAll() {
  const tab = (await import("./router.js")).curTab;
  if      (tab==="dashboard") { const {renderDashboard}=(await import("./tabs/dashboard.js")); await renderDashboard?.(); }
  else if (tab==="plan")      { await renderPlan(); /* Цели обновляем в фоне */ renderGoals().catch(()=>{}); }
  else if (tab==="goals")     await renderGoals();
  else if (tab==="ideas")     await renderIdeas();
  else if (tab==="diary")     await renderDiary();
}

// ════════════════════════════════════════
//  INIT
// ════════════════════════════════════════
function initApp() {
  initModal();
  initCalendar();
  initStorage(); // инициализация Firebase Storage
  initDashboard();
  initPlan();
  initGoals();
  initIdeas();
  initDiary();

  // Nav tabs
  document.querySelectorAll(".nt").forEach(t =>
    t.addEventListener("click", () => switchTab(t.dataset.tab))
  );

  // Sidebar toggle
  $("burger")?.addEventListener("click", openSidebar);
  $("sb-ov")?.addEventListener("click",  closeSidebar);

  // ── Тёмная тема ──
  initTheme();

  // New entry button — зависит от текущей вкладки
  async function newForTab() {
    const { curTab } = await import("./router.js");
    const map = { dashboard:"task", plan:"task", goals:"goal", ideas:"idea", diary:"diary" };
    openNewModal(map[curTab] || "task", null, null, curTab);
  }
  $("sb-new")?.addEventListener("click", () => { closeSidebar(); newForTab(); });
  $("tb-new")?.addEventListener("click", newForTab);
}

// ════════════════════════════════════════
//  AUTH
// ════════════════════════════════════════
$("btn-g").onclick = async () => {
  try {
    const p = new GoogleAuthProvider();
    // Без prompt:"select_account" — не заставляем выбирать аккаунт повторно
    await signInWithPopup(auth, p);
  } catch(e) {
    const m = {
      "auth/unauthorized-domain": `Домен не авторизован! Добавьте skudatin-lang.github.io в Firebase Console → Authentication → Authorized domains`,
      "auth/popup-blocked":       "Разрешите всплывающие окна в браузере.",
      "auth/popup-closed-by-user":"Вход отменён.",
      "auth/cancelled-popup-request": "",
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
      ? "Добавьте skudatin-lang.github.io в Firebase Authorized domains."
      : "Яндекс: " + e.code);
  }
};

$("btn-logout").onclick = async () => {
  if (confirm("Выйти из аккаунта?")) await signOut(auth);
};

let appInitialized = false;

onAuthStateChanged(auth, async user => {
  if (user) {
    setUid(user.uid);
    $("sb-un").textContent = user.displayName || "Пользователь";
    $("sb-ue").textContent = user.email || "";
    const av = $("sb-av");
    av.innerHTML = user.photoURL
      ? `<img src="${user.photoURL}" alt=""/>`
      : (user.displayName || "U")[0].toUpperCase();
    const mn = new Date();
    $("sb-mo").textContent = MONTHS[mn.getMonth()].toUpperCase() + " " + mn.getFullYear();
    $("s-auth").classList.remove("on");
    $("s-app").classList.add("on");
    if (!appInitialized) {
      appInitialized = true;
      initApp();
      await switchTab("dashboard");
      // Аватар — инициализируем после входа
      setTimeout(() => initAvatar(), 500);
      window._openAvatarDialog = openAvatarDialog;
      window._toggleAvatar = toggleAvatarVisible;
      window._openProfileDialog = openProfileDialog;
      window._openBankDialog   = openBankDialog;
      // Одноразовая очистка дочерних записей повторяющихся задач
      cleanupRecurringChildren().then(n => { if (n > 0) { refreshAll(); console.log(`Cleaned ${n} recurring children`); } });
      // Проверяем нужно ли показать анкету
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
//  ТЕМЫ — полные наборы токенов
// ════════════════════════════════════════
const THEMES = {
  // ── Life OS (тёмный ambient — дефолт v3) ──
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
  // ── Оригинальная светлая ──
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
  // ── Оригинальная тёмная ──
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
  // ── Лесная ──
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
  // ── Морской бриз ──
  "breeze": {
    label:"🌊 Морской бриз", dark: false,
    bg:"#E8F4F8", bgs:"#D6EBF5", bgp:"#F0F8FC", bgw:"#FFFFFF",
    br:"#0277BD", brd:"#01579B", brl:"#0288D1",
    go:"#0288D1", god:"#0277BD", gol:"#29B6F6",
    cr:"#F0F8FC", crd:"#D6EBF5",
    red:"#EF5350", grn:"#26A69A", blu:"#1565C0",
    tx:"#0D2B3E", txm:"#2E6B8A", txl:"#5B9BB7",
    bd:"rgba(2,119,189,.18)", bds:"rgba(2,119,189,.40)", sh:"rgba(0,40,80,.10)",
  },
  // ── Закат ──
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
  // ── Осень ──
  "autumn": {
    label:"🍂 Осень", dark: false,
    bg:"#FAF0E4", bgs:"#F2E2C8", bgp:"#FDF6EC", bgw:"#FFFBF5",
    br:"#8B4513", brd:"#6B3410", brl:"#A0522D",
    go:"#D2691E", god:"#A0522D", gol:"#E8924A",
    cr:"#FDF6EC", crd:"#F2E2C8",
    red:"#CC3300", grn:"#6B8E23", blu:"#8B6914",
    tx:"#3E1C00", txm:"#7A4420", txl:"#AD7A45",
    bd:"rgba(139,69,19,.18)", bds:"rgba(139,69,19,.40)", sh:"rgba(60,20,0,.10)",
  },
  // ── Эмо ──
  "emo": {
    label:"🖤 Эмо", dark: true,
    bg:"#0A0A0A", bgs:"#141414", bgp:"#141414", bgw:"#1E1E1E",
    br:"#CC00CC", brd:"#990099", brl:"#FF33FF",
    go:"#CC00CC", god:"#990099", gol:"#FF33FF",
    cr:"#141414", crd:"#1E1E1E",
    red:"#FF0044", grn:"#00FF88", blu:"#4488FF",
    tx:"#FFFFFF", txm:"#CC99CC", txl:"#886688",
    bd:"rgba(204,0,204,.22)", bds:"rgba(204,0,204,.45)", sh:"rgba(0,0,0,.70)",
  },
  // ── Викторианская ──
  "victorian": {
    label:"🎩 Викторианская", dark: false,
    bg:"#F5F0E8", bgs:"#EDE5D0", bgp:"#FAF6EE", bgw:"#FEFCF7",
    br:"#4A3728", brd:"#2E1F0F", brl:"#6B5040",
    go:"#8B6914", god:"#6B4E0A", gol:"#B8960A",
    cr:"#FAF6EE", crd:"#EDE5D0",
    red:"#8B2020", grn:"#2E5A1C", blu:"#1A3A5C",
    tx:"#1A0E00", txm:"#5A3E20", txl:"#8C6840",
    bd:"rgba(74,55,40,.18)", bds:"rgba(74,55,40,.42)", sh:"rgba(30,15,0,.12)",
  },
  // ── Золото ──
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
  const t = THEMES[id] || THEMES["light"];
  const root = document.documentElement;

  // Переключаем base theme
  if (t.dark) root.setAttribute("data-theme","dark");
  else root.removeAttribute("data-theme");

  // Накатываем все токены через inline style (приоритет выше data-theme)
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

  // Иконка кнопки
  const emoji = t.label.split(" ")[0];
  ["theme-toggle","nav-theme-btn"].forEach(bid => {
    const b = $(bid);
    if (b) b.textContent = emoji;
  });

  localStorage.setItem("lc-palette", id);
}

function openPalettePicker() {
  document.getElementById("lc-palette-picker")?.remove();
  const cur = localStorage.getItem("lc-palette") || "light";
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

window._setPalette = id => {
  applyPalette(id);
  document.getElementById("lc-palette-picker")?.remove();
};
window.toggleTheme = () => openPalettePicker();