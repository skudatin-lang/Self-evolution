// ════════════════════════════════════════
//  БАНК ДЕЙСТВИЙ — js/actions-bank.js
//
//  Хранит готовые микро-задачи сгруппированные по тегам.
//  AI может рекомендовать их, пользователь добавляет в план.
//  Редактируется через вкладку «Банк» в форме задачи.
// ════════════════════════════════════════

import { getDb, getUid, ss } from "./db.js";
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc } from
  "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Теги банка
export const BANK_TAGS = [
  "#тело",       // физические упражнения, дыхание, поза
  "#авторство",  // сказать нет, сделать по-своему
  "#страх",      // план Б, проработка страха
  "#драйвер",    // физическая активность, творчество
  "#отдых",      // восстановление, сон, тишина
  "#контакт",    // позвонить, написать, встретиться
  "#деньги",     // финансовые микро-шаги
  "#здоровье",   // медицина, еда, движение
];

// Встроенный банк по умолчанию (загружается если пользовательский пустой)
export const DEFAULT_BANK = [
  { title: "Лечь на спину, ноги на стул — 10 мин",  tags: ["#тело","#отдых"],    duration_min: 10, energy_cost: 1 },
  { title: "Диафрагмальное дыхание — 5 циклов",     tags: ["#тело","#отдых"],    duration_min: 3,  energy_cost: 1 },
  { title: "Прогулка 15 минут без телефона",         tags: ["#тело","#драйвер"],  duration_min: 15, energy_cost: 2 },
  { title: "Сделать одно дело «хочу» вместо «долг»", tags: ["#авторство"],        duration_min: 30, energy_cost: 2 },
  { title: "Написать 3 строки в дневник",            tags: ["#авторство","#страх"], duration_min: 5, energy_cost: 1 },
  { title: "Позвонить маме / близкому",              tags: ["#контакт"],          duration_min: 10, energy_cost: 2 },
  { title: "Записать 1 идею без оценки",             tags: ["#драйвер","#авторство"], duration_min: 5, energy_cost: 1 },
  { title: "Сделать план Б для главного страха",     tags: ["#страх"],            duration_min: 15, energy_cost: 3 },
  { title: "Пауза перед ответом — сказать «я подумаю»", tags: ["#авторство","#страх"], duration_min: 1, energy_cost: 1 },
  { title: "10 мин физической активности (зарядка/зал)", tags: ["#тело","#драйвер"], duration_min: 10, energy_cost: 3 },
];

// ── CRUD ──
function uc(name) {
  return collection(getDb(), "users", getUid(), name);
}
function ud(name, id) {
  return doc(getDb(), "users", getUid(), name, id);
}

export async function getBankActions() {
  const snap = await getDocs(uc("actions_bank"));
  const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (!items.length) return DEFAULT_BANK.map((a, i) => ({ ...a, id: "default_" + i }));
  return items;
}

export async function addBankAction(data) {
  return addDoc(uc("actions_bank"), { ...data, createdAt: ss() });
}

export async function updateBankAction(id, data) {
  if (id.startsWith("default_")) return; // default нельзя редактировать
  return updateDoc(ud("actions_bank", id), data);
}

export async function deleteBankAction(id) {
  if (id.startsWith("default_")) return;
  return deleteDoc(ud("actions_bank", id));
}

// ── Получить рекомендации из банка по тегам ──
export async function getBankByTags(tags = []) {
  const all = await getBankActions();
  if (!tags.length) return all;
  return all.filter(a => Array.isArray(a.tags) && a.tags.some(t => tags.includes(t)));
}

// ── Диалог управления банком ──
export function openBankDialog() {
  getBankActions().then(actions => renderBankDialog(actions));
}

async function renderBankDialog(actions) {
  document.getElementById("bank-dialog")?.remove();
  const dlg = document.createElement("div");
  dlg.id = "bank-dialog";
  dlg.innerHTML = `
    <div class="bank-backdrop" onclick="document.getElementById('bank-dialog').remove()"></div>
    <div class="bank-box">
      <div class="bank-hd">
        <div class="bank-title">⚡ Банк действий</div>
        <div class="bank-sub">Готовые задачи для плана дня. AI выбирает из них.</div>
        <button class="bank-close" onclick="document.getElementById('bank-dialog').remove()">✕</button>
      </div>
      <div class="bank-tags-filter" id="bank-tags-filter">
        <button class="bank-tag-btn on" data-tag="all">Все</button>
        ${BANK_TAGS.map(t => `<button class="bank-tag-btn" data-tag="${t}">${t}</button>`).join("")}
      </div>
      <div class="bank-list" id="bank-list">
        ${renderBankList(actions, "all")}
      </div>
      <div class="bank-add">
        <input class="inp" id="bank-add-inp" placeholder="Новое действие..."/>
        <select class="sel" id="bank-add-tag">
          ${BANK_TAGS.map(t => `<option value="${t}">${t}</option>`).join("")}
        </select>
        <button class="bank-add-btn" onclick="window._bankAdd()">+ Добавить</button>
      </div>
    </div>`;
  document.body.appendChild(dlg);

  // Фильтрация по тегам
  dlg.querySelectorAll(".bank-tag-btn").forEach(btn => {
    btn.onclick = () => {
      dlg.querySelectorAll(".bank-tag-btn").forEach(b => b.classList.remove("on"));
      btn.classList.add("on");
      const tag = btn.dataset.tag;
      document.getElementById("bank-list").innerHTML = renderBankList(actions, tag);
    };
  });
}

function renderBankList(actions, filterTag) {
  const filtered = filterTag === "all" ? actions
    : actions.filter(a => Array.isArray(a.tags) && a.tags.includes(filterTag));
  if (!filtered.length) return '<div style="padding:16px;color:var(--tx-l)">Нет действий</div>';
  return filtered.map(a => `
    <div class="bank-item" data-id="${a.id}">
      <div class="bank-item-body">
        <div class="bank-item-title">${a.title}</div>
        <div class="bank-item-meta">
          ${(a.tags||[]).map(t => `<span class="bank-item-tag">${t}</span>`).join("")}
          ${a.duration_min ? `<span class="bank-item-dur">~${a.duration_min} мин</span>` : ""}
        </div>
      </div>
      <div class="bank-item-acts">
        <button class="ib" onclick="window._bankAddToDay('${a.id}','${(a.title||"").replace(/'/g,"\\'")}')">➕</button>
        ${!a.id.startsWith("default_") ? `<button class="ib del" onclick="window._bankDel('${a.id}')">🗑</button>` : ""}
      </div>
    </div>`).join("");
}

window._bankAdd = async () => {
  const title = document.getElementById("bank-add-inp")?.value.trim();
  const tag   = document.getElementById("bank-add-tag")?.value;
  if (!title) return;
  await addBankAction({ title, tags: [tag], duration_min: 15, energy_cost: 2 });
  document.getElementById("bank-add-inp").value = "";
  const actions = await getBankActions();
  document.getElementById("bank-list").innerHTML = renderBankList(actions, "all");
};

window._bankDel = async (id) => {
  await deleteBankAction(id);
  const actions = await getBankActions();
  document.getElementById("bank-list").innerHTML = renderBankList(actions, "all");
};

window._bankAddToDay = (id, title) => {
  // Вставляем в поле добавления задачи в план дня
  window.openNewModal?.("task", null, null, "plan", null);
  setTimeout(() => {
    const inp = document.getElementById("t-title");
    if (inp) inp.value = title;
  }, 200);
  document.getElementById("bank-dialog")?.remove();
};

export { openBankDialog };
