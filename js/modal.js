// ════════════════════════════════════════
//  MODAL SYSTEM
//  js/modal.js
// ════════════════════════════════════════

let _saveFn = null;

const $ = id => document.getElementById(id);
const ov = () => $("m-ov");
const bd = () => $("m-body");

export function openModal(title, bodyHtml, saveFn) {
  const now = new Date();
  const MGEN = ["января","февраля","марта","апреля","мая","июня",
                "июля","августа","сентября","октября","ноября","декабря"];
  $("m-ttl").textContent = title;
  $("m-date").textContent = `${now.getDate()} ${MGEN[now.getMonth()]} ${now.getFullYear()}`;
  bd().innerHTML = bodyHtml;
  _saveFn = saveFn;
  $("m-tabs").style.display = "none";
  ov().classList.remove("hidden");
}

export function closeModal() {
  ov().classList.add("hidden");
  bd().innerHTML = "";
  _saveFn = null;
}

export function initModal() {
  $("m-x").onclick = closeModal;
  $("m-cancel").onclick = closeModal;
  $("m-save").onclick = () => { if (_saveFn) _saveFn(); };
  ov().addEventListener("click", e => { if (e.target === ov()) closeModal(); });
}

export function toast(msg, ms = 2600) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.add("hidden"), ms);
}

export function addSubRow(containerId = "sub-list") {
  const row = document.createElement("div");
  row.className = "sub-row";
  row.innerHTML = `<input class="inp" placeholder="Подзадача"/>
    <button class="rm-sub" onclick="this.closest('.sub-row').remove()">×</button>`;
  document.getElementById(containerId)?.appendChild(row);
}

export function getSubtasks(containerId = "sub-list") {
  return [...(document.getElementById(containerId)?.querySelectorAll("input") || [])]
    .map(i => i.value.trim()).filter(Boolean);
}

export function getActivePriority() {
  if (document.querySelector(".pri-btn.on-high")) return "high";
  if (document.querySelector(".pri-btn.on-low")) return "low";
  return "med";
}

export function setPriority(p) {
  document.querySelectorAll(".pri-btn").forEach(b => {
    b.className = "pri-btn";
    if (b.dataset.pri === p) b.classList.add(`on-${p}`);
  });
}