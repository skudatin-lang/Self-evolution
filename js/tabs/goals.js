// goals.js — NotebookLM style v5
// Исправлено: кнопка + (нет зазора), иерархия (переместить), описание/note в sidebar

import { registerTab } from "../router.js";
import { getGoals, getProjects, getTasks,
         deleteGoal, deleteProject, deleteTask, toggleTask,
         esc, today, getUid } from "../db.js";
import { toast } from "../modal.js";
import { GCOLS } from "../utils.js";

// ══ СОСТОЯНИЕ ══
let mmTree = null, mmFlat = [];
let mmPan = { x: 0, y: 0 }, mmScale = 1;
let mmSel = null;
let eventsSet = false;
let collapsed = new Set();
let fmtShowDone = true;
let mmViewMode  = "all"; // all | goals | projects | tasks | done

// ══ РАЗМЕРЫ НОД ══
// Размеры нод — динамические по тексту
// Вычисляется в buildNode на основе реальной длины текста
const NW_MIN = { root: 120, goal: 140, project: 120, task: 110 };
const NW_MAX = { root: 220, goal: 300, project: 260, task: 240 };
const NH = { root: 44, goal: 36, project: 30, task: 26 };
// Примерная ширина символа (px) для каждого типа (font-size * 0.6)
const CH_W = { root: 10, goal: 9, project: 8.5, task: 8 };

function calcNodeW(type, label) {
  const charW  = CH_W[type] || 8;
  const padH   = 32; // горизонтальный padding × 2
  const extras = type === "goal" ? 24 : type === "project" ? 20 : 16; // иконки/кнопки
  const raw    = Math.ceil((label || '').length * charW) + padH + extras;
  return Math.max(NW_MIN[type] || 110, Math.min(NW_MAX[type] || 240, raw));
}
const VGAP = 14, HGAP = 60;

export function initGoals() { registerTab("goals", renderGoals); }

// ══════════════════════════════════════════
//  SIDEBAR — панель деталей выбранной ноды
// ══════════════════════════════════════════
function renderSidebar(selNode) {
  const sb = document.getElementById("sb-body");
  if (!sb) return;

  if (!selNode || selNode.type === "root") {
    // При открытии вкладки (нет выбранного узла) — сайдбар остаётся пустым
    // как на всех остальных вкладках
    sb.innerHTML = "";
    return;
  }

  const typeLabel = { goal:"Цель", project:"Проект", task:"Задача" }[selNode.type] || '';
  const typeEmoji = { goal:"🎯", project:"📁", task:"✅" }[selNode.type] || "•";

  // Прогресс
  let progressHtml = "";
  if (selNode.type === "goal" || selNode.type === "project") {
    const childTasks = getAllTasksUnder(selNode);
    const total = childTasks.length;
    const done  = childTasks.filter(n => n.done).length;
    const pct   = total > 0 ? Math.round(done / total * 100) : 0;
    const barColor = pct >= 70 ? "var(--grn)" : pct >= 40 ? "var(--go)" : "var(--red)";
    progressHtml = total > 0 ? `
      <div class="mm-sb-progress">
        <div class="mm-sb-prog-row">
          <span class="mm-sb-prog-lbl">Прогресс</span>
          <span class="mm-sb-prog-pct" style="color:${barColor}">${pct}%</span>
        </div>
        <div class="mm-sb-prog-bar">
          <div class="mm-sb-prog-fill" style="width:${pct}%;background:${barColor}"></div>
        </div>
        <div class="mm-sb-prog-sub">${done} из ${total} задач выполнено</div>
      </div>` : "";
  }

  // Дедлайн
  const deadlineHtml = selNode.deadline ? `
    <div class="mm-sb-field">
      <span class="mm-sb-field-lbl">📅 Дедлайн</span>
      <span class="mm-sb-field-val">${formatDate(selNode.deadline)}</span>
    </div>` : "";

  // Описание/комментарий — берём desc (цели/проекты) или note (задачи)
  const descText = selNode.desc || selNode.note || '';
  const descHtml = descText ? `
    <div class="mm-sb-comment">
      <div class="mm-sb-comment-lbl">💬 Комментарий</div>
      <div class="mm-sb-comment-text">${esc(descText)}</div>
    </div>` : "";

  // Статус — для всех типов кроме root
  const statusHtml = selNode.type !== "root" ? `
    <div class="mm-sb-field">
      <span class="mm-sb-field-lbl">Статус</span>
      <span class="mm-sb-field-val" style="color:${selNode.done?"var(--grn)":"var(--tx-m)"}">
        ${selNode.done ? "✓ Выполнено" : "○ В работе"}
      </span>
    </div>` : "";

  // Секция «Переместить»
  const moveHtml = buildMoveSection(selNode);

  // Кнопки действий
  let actionBtns = "";
  if (selNode.type === "goal") {
    actionBtns = `
      <button class="mm-sb-action ${selNode.done ? "primary-undo" : "primary"}" onclick="window._mmToggle('${selNode.id}')">
        ${selNode.done ? "↩ Вернуть в работу" : "✓ Отметить выполненной"}
      </button>
      <button class="mm-sb-action" onclick="window._planEditGoal('${selNode.id}')">✎ Изменить</button>
      <button class="mm-sb-action" onclick="window.openNewModal('project','${selNode.id}',null,'goals')">📁 + Проект</button>
      <button class="mm-sb-action" onclick="window.openNewModal('task','${selNode.id}',null,'goals')">✅ + Задача</button>
      <div class="mm-sb-del-row">
        <button class="mm-sb-action danger half" onclick="window._mmDeleteNode('${selNode.id}','${selNode.type}',false)" title="Удалить только цель, проекты и задачи останутся">🗑 Только цель</button>
        <button class="mm-sb-action danger half" onclick="window._mmDeleteNode('${selNode.id}','${selNode.type}',true)" title="Удалить цель и всё внутри">🗑 + Всё внутри</button>
      </div>`;
  } else if (selNode.type === "project") {
    actionBtns = `
      <button class="mm-sb-action ${selNode.done ? "primary-undo" : "primary"}" onclick="window._mmToggle('${selNode.id}')">
        ${selNode.done ? "↩ Вернуть в работу" : "✓ Отметить выполненным"}
      </button>
      <button class="mm-sb-action" onclick="window._planEditProj('${selNode.id}')">✎ Изменить</button>
      <button class="mm-sb-action" onclick="window.openNewModal('task',null,'${selNode.id}','goals')">✅ + Задача</button>
      <div class="mm-sb-del-row">
        <button class="mm-sb-action danger half" onclick="window._mmDeleteNode('${selNode.id}','${selNode.type}',false)" title="Удалить только проект, задачи останутся">🗑 Только проект</button>
        <button class="mm-sb-action danger half" onclick="window._mmDeleteNode('${selNode.id}','${selNode.type}',true)" title="Удалить проект и все задачи внутри">🗑 + Задачи</button>
      </div>`;
  } else if (selNode.type === "task") {
    actionBtns = `
      <button class="mm-sb-action ${selNode.done ? "primary-undo" : "primary"}" onclick="window._mmToggle('${selNode.id}')">
        ${selNode.done ? "↩ Вернуть в работу" : "✓ Отметить выполненной"}
      </button>
      <button class="mm-sb-action" onclick="window.editTask('${selNode.id}')">✎ Изменить</button>
      <button class="mm-sb-action" onclick="window._mmAddSubtask('${selNode.id}')">+ Подзадачу</button>
      <button class="mm-sb-action danger" onclick="window._mmDeleteNode('${selNode.id}','${selNode.type}',true)">🗑 Удалить</button>`;
  }

  sb.innerHTML = `
    <div class="mm-sb-detail">
      <div class="mm-sb-detail-header">
        <span class="mm-sb-detail-emoji">${typeEmoji}</span>
        <div>
          <div class="mm-sb-detail-type">${typeLabel}</div>
          <div class="mm-sb-detail-name">${esc(selNode.label)}</div>
        </div>
      </div>
      ${progressHtml}
      ${statusHtml}
      ${deadlineHtml}
      ${descHtml}
      ${moveHtml}
      <div class="mm-sb-actions">${actionBtns}</div>
      <div class="mm-sb-toggle-row" style="margin-top:14px;padding-top:12px;border-top:1px solid var(--bd)">
        <span class="mm-sb-toggle-lbl">Показать выполненные</span>
        <button class="fmt-toggle ${fmtShowDone?"on":""}" onclick="window._fmtShowDone()">
          <span class="fmt-toggle-knob"></span>
        </button>
      </div>
    </div>`;
}

// ══════════════════════════════════════════
//  СЕКЦИЯ ПЕРЕМЕСТИТЬ
// ══════════════════════════════════════════
function buildMoveSection(node) {
  if (node.type === "root" || node.type === "goal") return "";

  const parent = findParent(node.id);

  if (node.type === "project") {
    const goals = mmFlat.filter(n => n.type === "goal");
    const options = goals.map(g =>
      `<option value="goal:${g.id}" ${parent?.id === g.id ? 'selected' : ''}>${esc(g.label)}</option>`
    ).join("");
    return `
      <div class="mm-sb-move">
        <div class="mm-sb-move-title">↕ Переместить</div>
        <div class="mm-sb-move-row">
          <span class="mm-sb-move-lbl">Цель</span>
          <select class="mm-sb-move-sel" id="move-sel-${node.id}"
            onchange="window._mmMove('${node.id}','${node.type}',this.value)">
            <option value="root:" ${!parent || parent.type==="root" ? 'selected' : ''}>— без цели —</option>
            ${options}
          </select>
        </div>
        <button class="mm-sb-add-btn" style="width:100%;margin-top:6px"
          onclick="window._mmQuickNewGoal('${node.id}')">
          + Создать новую цель
        </button>
      </div>`;
  }

  if (node.type === "task") {
    const goals    = mmFlat.filter(n => n.type === "goal");
    const projects = mmFlat.filter(n => n.type === "project");
    const goalOpts = goals.map(g =>
      `<option value="goal:${g.id}" ${parent?.id === g.id && parent?.type==="goal" ? 'selected' : ''}>${esc(g.label)}</option>`
    ).join("");
    const projOpts = projects.map(p =>
      `<option value="project:${p.id}" ${parent?.id === p.id ? 'selected' : ''}>${esc(p.label)}</option>`
    ).join("");

    return `
      <div class="mm-sb-move">
        <div class="mm-sb-move-title">↕ Переместить</div>
        <div class="mm-sb-move-row">
          <span class="mm-sb-move-lbl">Привязать к</span>
          <select class="mm-sb-move-sel" id="move-sel-${node.id}"
            onchange="window._mmMove('${node.id}','${node.type}',this.value)">
            <option value="root:" ${!parent || parent.type==="root" ? 'selected' : ''}>— без привязки —</option>
            ${goals.length ? `<optgroup label="── Цели ──">${goalOpts}</optgroup>` : ""}
            ${projects.length ? `<optgroup label="── Проекты ──">${projOpts}</optgroup>` : ""}
          </select>
        </div>
        <div style="display:flex;gap:6px;margin-top:6px">
          <button class="mm-sb-add-btn" style="flex:1"
            onclick="window._mmQuickNewGoal('${node.id}','task')">
            + Новая цель
          </button>
          <button class="mm-sb-add-btn" style="flex:1"
            onclick="window._mmQuickNewProject('${node.id}')">
            + Новый проект
          </button>
        </div>
      </div>`;
  }

  return "";
}

// ══════════════════════════════════════════
//  ПЕРЕМЕЩЕНИЕ — изменение иерархии в Firebase
// ══════════════════════════════════════════
window._mmMove = async (nodeId, nodeType, targetValue) => {
  const [targetType, targetId] = (targetValue || "root:").split(":");

  try {
    if (nodeType === "project") {
      const newGoalId = targetType === "goal" && targetId ? targetId : null;
      const { updateProject } = await import("../db.js");
      await updateProject(nodeId, { goalId: newGoalId });

    } else if (nodeType === "task") {
      let newGoalId = null, newProjId = null;
      if (targetType === "goal" && targetId) {
        newGoalId = targetId;
      } else if (targetType === "project" && targetId) {
        newProjId = targetId;
        // Наследуем goalId от родительского проекта
        const projParent = findParent(targetId);
        if (projParent?.type === "goal") newGoalId = projParent.id;
        else {
          // Ищем goalId из mmFlat
          const proj = mmFlat.find(n => n.id === targetId);
          if (proj) {
            const gp = findParentOfType(targetId, "goal");
            if (gp) newGoalId = gp.id;
          }
        }
      }
      const { updateTask } = await import("../db.js");
      await updateTask(nodeId, { goalId: newGoalId, projId: newProjId });
    }

    toast("Перемещено ✓");
    await renderGoals(); // Полный ре-рендер чтобы карта обновилась
  } catch(e) {
    toast("Ошибка: " + e.message);
    console.error("_mmMove error:", e);
  }
};

// ══════════════════════════════════════════
//  ВСПОМОГАТЕЛЬНЫЕ
// ══════════════════════════════════════════
function getAllTasksUnder(node) {
  const result = [];
  function walk(n) {
    if (n.type === "task") result.push(n);
    n.children.forEach(walk);
  }
  node.children.forEach(walk);
  return result;
}

function findParent(nodeId) {
  for (const n of mmFlat) {
    if (n.children.some(c => c.id === nodeId)) return n;
  }
  return null;
}

// Находим ближайшего родителя нужного типа по цепочке вверх
function findParentOfType(nodeId, type) {
  let cur = findParent(nodeId);
  while (cur) {
    if (cur.type === type) return cur;
    cur = findParent(cur.id);
  }
  return null;
}

function formatDate(str) {
  if (!str) return "";
  const [y, m, d] = str.split("-");
  return `${d}.${m}.${y}`;
}

async function delSubtree(node) {
  for (const c of node.children) await delSubtree(c);
  if (node.type === "goal")         await deleteGoal(node.id);
  else if (node.type === "project") await deleteProject(node.id);
  else if (node.type === "task")    await deleteTask(node.id);
}

// ══════════════════════════════════════════
//  КАСКАДНОЕ ПЕРЕКЛЮЧЕНИЕ DONE
// ══════════════════════════════════════════

// Сохраняем done для одной ноды в Firebase
async function saveNodeDone(id, type, done) {
  const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
  const { db } = await import("../firebase.js");
  const uid = getUid();
  if (type === "task") {
    await updateDoc(doc(db, "users", uid, "tasks", id), { done });
  } else if (type === "goal") {
    await updateDoc(doc(db, "users", uid, "goals", id), { done });
  } else if (type === "project") {
    await updateDoc(doc(db, "users", uid, "projects", id), { done });
  }
}

// Каскадное переключение:
// - при done=true  → все дети становятся done, помечаем их autoCompleted=true
// - при done=false → снимаем только тех у кого autoCompleted=true (вручную не трогаем)
async function toggleNodeCascade(node, newDone) {
  // Ставим на саму ноду
  await saveNodeDone(node.id, node.type, newDone);
  node.done = newDone;
  if (newDone) node.autoCompleted = false; // сама нода выполнена вручную

  // Рекурсивно обходим всех детей (всех уровней)
  async function cascadeDown(n, done) {
    for (const child of n.children) {
      if (done) {
        // Запоминаем что ребёнок был НЕ выполнен до каскада — отметим его как autoCompleted
        if (!child.done) {
          child.autoCompleted = true;
          await saveNodeDone(child.id, child.type, true);
          child.done = true;
        }
      } else {
        // Снимаем только если autoCompleted (т.е. выполнено автоматически, не вручную)
        if (child.autoCompleted) {
          child.autoCompleted = false;
          await saveNodeDone(child.id, child.type, false);
          child.done = false;
        }
      }
      await cascadeDown(child, done);
    }
  }
  await cascadeDown(node, newDone);
}

// ══════════════════════════════════════════
//  RENDER GOALS
// ══════════════════════════════════════════
export async function renderGoals() {
  document.getElementById("tb-ttl").textContent = "Жизнь";
  const [goals, projects, allTasks] = await Promise.all([getGoals(), getProjects(), getTasks()]);
  const tasks    = fmtShowDone ? allTasks  : allTasks.filter(t => !t.done);
  const gFiltered = fmtShowDone ? goals     : goals.filter(g => !g.done);
  const pFiltered = fmtShowDone ? projects  : projects.filter(p => !p.done);
  // При начальном рендере не перезаписываем сайдбар — только при клике на узел
  if (mmSel) renderSidebar(mmFlat.find(n => n.id === mmSel) || null);

  const wrap = document.getElementById("mm-wrap");
  if (!wrap) return; // вкладка не активна
  const ch = wrap.offsetHeight || 500;

  const mk = (id, type, label, color, done, extra = {}) => ({
    id, type, label, color, done: !!done,
    deadline: extra.deadline || null,
    desc: extra.desc || '',
    note: extra.note || '',
    w: calcNodeW(type, label), h: NH[type] || 28,
    children: [], x: 0, y: 0, subtreeH: 0, subtreeW: 0
  });

  const root = mk("root", "root", "МОЯ ЖИЗНЬ", null, false);
  const usedTaskIds = new Set(); // предотвращаем дублирование задач

  gFiltered.forEach((g, gi) => {
    const dc = GCOLS[gi % GCOLS.length];
    const gn = mk(g.id, "goal", g.title, dc, !!g.done, { deadline: g.deadline, desc: g.desc });
    pFiltered.filter(p => p.goalId === g.id).forEach(p => {
      const pn = mk(p.id, "project", p.name, dc, !!p.done, { desc: p.desc });
      tasks.filter(t => t.projId === p.id && !usedTaskIds.has(t.id)).forEach(t => {
        usedTaskIds.add(t.id);
        pn.children.push(mk(t.id, "task", t.title, dc, t.done, { deadline: t.deadline, note: t.note }));
      });
      gn.children.push(pn);
    });
    tasks.filter(t => t.goalId === g.id && !t.projId && !usedTaskIds.has(t.id)).forEach(t => {
      usedTaskIds.add(t.id);
      gn.children.push(mk(t.id, "task", t.title, dc, t.done, { deadline: t.deadline, note: t.note }));
    });
    root.children.push(gn);
  });
  tasks.filter(t => !t.goalId && !t.projId && !usedTaskIds.has(t.id)).forEach(t => {
    usedTaskIds.add(t.id);
    root.children.push(mk(t.id, "task", t.title, GCOLS[0], t.done, { deadline: t.deadline, note: t.note }));
  });

  function applyCollapsed(n) {
    // viewMode фильтрует показ дочерних нод
    let showChildren;
    if (mmViewMode === "goals") {
      showChildren = n.type === "root" ? n.children : [];
    } else if (mmViewMode === "projects") {
      showChildren = (n.type === "root" || n.type === "goal") ? n.children.filter(c => c.type !== "task") : [];
    } else {
      showChildren = collapsed.has(n.id) ? [] : n.children;
    }
    n._visibleChildren = showChildren;
    n._visibleChildren.forEach(applyCollapsed);
  }
  applyCollapsed(root);

  function sz(n) {
    const vc = n._visibleChildren;
    if (!vc.length) { n.subtreeH = n.h; n.subtreeW = n.w; return; }
    let tH = 0, tW = 0;
    vc.forEach((c, i) => {
      sz(c);
      const g = i < vc.length - 1 ? VGAP : 0;
      tH += c.subtreeH + g;
      tW = Math.max(tW, c.subtreeW);
    });
    n.subtreeH = Math.max(n.h, tH);
    n.subtreeW = n.w + HGAP + tW;
  }
  sz(root);

  function lay(n, x, cy) {
    n.x = x; n.y = cy - n.h / 2;
    const vc = n._visibleChildren;
    if (!vc.length) return;
    const cx2 = x + n.w + HGAP;
    let curY = cy - n.subtreeH / 2;
    vc.forEach(c => {
      lay(c, cx2, curY + c.subtreeH / 2);
      curY += c.subtreeH + VGAP;
    });
  }
  lay(root, 40, ch / 2);

  mmFlat = [];
  (function fl(n) { mmFlat.push(n); n.children.forEach(fl); })(root);
  mmTree = root;

  drawMM();
  if (!eventsSet) { setupEvents(wrap); eventsSet = true; }

  // Заполняем блок "Ближайшие шаги" под картой
  renderGoalsSteps(goals, allTasks);
}

// ══════════════════════════════════════════
//  RERENDER (без перезагрузки данных)
// ══════════════════════════════════════════
function rerenderGoals() {
  if (!mmTree) return;
  const wrap = document.getElementById("mm-wrap");
  const ch = wrap.offsetHeight || 500;

  function applyCollapsed(n) {
    n._visibleChildren = collapsed.has(n.id) ? [] : n.children;
    n._visibleChildren.forEach(applyCollapsed);
  }
  applyCollapsed(mmTree);

  function sz(n) {
    const vc = n._visibleChildren;
    if (!vc.length) { n.subtreeH = n.h; n.subtreeW = n.w; return; }
    let tH = 0, tW = 0;
    vc.forEach((c, i) => {
      sz(c);
      const g = i < vc.length - 1 ? VGAP : 0;
      tH += c.subtreeH + g;
      tW = Math.max(tW, c.subtreeW);
    });
    n.subtreeH = Math.max(n.h, tH);
    n.subtreeW = n.w + HGAP + tW;
  }
  sz(mmTree);

  function lay(n, x, cy) {
    n.x = x; n.y = cy - n.h / 2;
    const vc = n._visibleChildren;
    if (!vc.length) return;
    const cx2 = x + n.w + HGAP;
    let curY = cy - n.subtreeH / 2;
    vc.forEach(c => {
      lay(c, cx2, curY + c.subtreeH / 2);
      curY += c.subtreeH + VGAP;
    });
  }
  lay(mmTree, 40, ch / 2);

  drawMM();
}

// ══════════════════════════════════════════
//  DRAW
// ══════════════════════════════════════════
function drawMM() {
  const wrap = document.getElementById("mm-wrap");
  if (!wrap) return;
  // Удаляем ноды и группы
  wrap.querySelectorAll(".mm-node, .mm-node-group").forEach(n => n.remove());
  const svg = document.getElementById("mm-svg");
  if (!mmTree) { svg.innerHTML = ""; return; }

  // SVG линии
  let lines = "";
  function edges(n) {
    const vc = n._visibleChildren || [];
    vc.forEach(c => {
      const x1 = (n.x + n.w) * mmScale + mmPan.x;
      const y1 = (n.y + n.h / 2) * mmScale + mmPan.y;
      const x2 = c.x * mmScale + mmPan.x;
      const y2 = (c.y + c.h / 2) * mmScale + mmPan.y;
      const mx = (x1 + x2) / 2;
      const raw = c.color && c.color !== "var(--tx-l)" ? c.color : "#4DFFB4";
      const col = c.type === "task" ? raw + "55" : raw + "bb";
      const sw  = c.type === "goal" ? 2.5 : c.type === "project" ? 1.8 : 1.2;
      const dsh = c.type === "task" ? 'stroke-dasharray="5,3"' : "";
      const d   = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
      lines += `<path d="${d}" stroke="${col}" stroke-width="${sw}" fill="none" ${dsh} stroke-linecap="round" stroke-linejoin="round"/>`;
      edges(c);
    });
  }
  edges(mmTree);
  svg.innerHTML = lines;

  // DOM ноды
  function nodes(n) {
    const isCollapsed = collapsed.has(n.id);
    const hasChildren = n.children.length > 0;
    const isSel = n.id === mmSel;
    const hasComment = !!(n.desc || n.note);
    const canAdd = n.type !== "root"; // задачи тоже могут добавлять подзадачи

    // ── Группа-обёртка ──
    // Кнопка + входит в группу, поэтому при переходе мыши нода→кнопка
    // группа не теряет hover (нет зазора = нет исчезновения)
    const group = document.createElement("div");
    group.className = "mm-node-group";
    const addBtnW = canAdd ? 30 : 0;
    group.style.cssText = [
      "position:absolute",
      `left:${n.x * mmScale + mmPan.x}px`,
      `top:${n.y * mmScale + mmPan.y}px`,
      `width:${n.w * mmScale + addBtnW}px`,
      `height:${n.h * mmScale}px`,
    ].join(";");

    // ── Нода ──
    const el = document.createElement("div");
    el.className = `mm-node type-${n.type}${isSel ? " sel" : ""}${n.done ? " done" : ""}`;
    el.dataset.id = n.id;
    if (n.type !== "root" && n.color) el.style.setProperty("--nc", n.color);
    el.style.cssText += [
      "position:absolute",
      "left:0",
      "top:0",
      `width:${n.w * mmScale}px`,
      `height:${n.h * mmScale}px`,
    ].join(";");

    // Точка-индикатор комментария
    const commentDot = hasComment
      ? `<span class="mm-comment-dot" title="Есть комментарий"></span>`
      : "";

    // Чекбокс — на всех нодах кроме root
    const checkbox = n.type !== "root"
      ? `<span class="mm-checkbox${n.done ? (n.autoCompleted ? " auto-checked" : " checked") : ""}" data-id="${n.id}" title="${n.done ? (n.autoCompleted ? "Выполнено автоматически (нажми чтобы снять)" : "Вернуть в работу") : "Отметить выполненной"}">${n.done ? "✓" : ""}</span>`
      : "";

    let inner = `${checkbox}<span class="mm-node-txt">${esc(n.label)}</span>${commentDot}`;
    if (hasChildren) {
      inner += `<span class="mm-collapse-btn${n.type==='root'?' root-collapse':''}" data-id="${n.id}">${isCollapsed ? "▸" : "▾"}</span>`;
    }
    el.innerHTML = inner;

    // Клик по чекбоксу — каскадное переключение done
    el.querySelectorAll(".mm-checkbox").forEach(cb => {
      cb.addEventListener("click", async e => {
        e.stopPropagation();
        const newDone = !n.done;
        if (!newDone) n.autoCompleted = false; // снимаем вручную — убираем флаг
        await toggleNodeCascade(n, newDone);
        // Перерисовываем всю карту (каскад изменил много нод)
        drawMM();
        if (mmSel === n.id) renderSidebar(n);
        else if (mmSel) {
          const sel = mmFlat.find(x => x.id === mmSel);
          if (sel) renderSidebar(sel);
        }
      });
    });

    // ── Кнопка + ──
    if (canAdd) {
      const addBtn = document.createElement("button");
      // Что добавляем от каждого типа:
      // root → цель, goal → проект или задачу (покажем выбор), project → задачу, task → подзадачу
      addBtn.className = "mm-add-btn";
      addBtn.title = { goal:"Добавить проект/задачу", project:"Добавить задачу", task:"Добавить подзадачу" }[n.type] || "+";
      addBtn.textContent = "+";
      addBtn.style.cssText = [
        "position:absolute",
        "right:0",
        "top:50%",
        "transform:translateY(-50%) scale(.75)",
        "opacity:0",
        "transition:opacity 140ms ease, transform 140ms ease",
        "width:24px",
        "height:24px",
        "pointer-events:none",
      ].join(";");
      addBtn.onclick = e => {
        e.stopPropagation();
        if (n.type === "goal") {
          // У цели можно добавить и проект и задачу — показываем мини-меню
          window._mmAddFromGoal(n.id, addBtn);
        } else if (n.type === "project") {
          window.openNewModal("task", null, n.id, "goals");
        } else if (n.type === "task") {
          // Подзадача — задача привязанная к той же цели/проекту что и родитель
          const parentNode = mmFlat.find(x => x.id === n.id);
          const parentGoalId = parentNode ? (findParentOfType(n.id, "goal")?.id || null) : null;
          const parentProjId = parentNode ? (findParentOfType(n.id, "project")?.id || null) : null;
          window.openNewModal("task", parentGoalId, parentProjId, "goals");
        }
      };
      group.appendChild(addBtn);

      // Показываем/скрываем кнопку при hover на группе
      group.addEventListener("mouseenter", () => {
        addBtn.style.opacity = "1";
        addBtn.style.transform = "translateY(-50%) scale(1)";
        addBtn.style.pointerEvents = "all";
      });
      group.addEventListener("mouseleave", () => {
        addBtn.style.opacity = "0";
        addBtn.style.transform = "translateY(-50%) scale(.75)";
        addBtn.style.pointerEvents = "none";
      });
    }

    // ── Клик по ноде ──
    el.addEventListener("click", e => {
      e.stopPropagation();
      if (e.target.classList.contains("mm-collapse-btn")) return;
      if (mmSel === n.id) {
        mmSel = null; drawMM(); renderSidebar(null);
      } else {
        mmSel = n.id; drawMM(); renderSidebar(n);
      }
    });

    // ── Collapse ──
    el.querySelectorAll(".mm-collapse-btn").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        const nid = btn.dataset.id;
        if (collapsed.has(nid)) collapsed.delete(nid);
        else collapsed.add(nid);
        rerenderGoals();
      });
    });

    // ── Drag & Drop ноды ──
    el.addEventListener("mousedown", e => {
      if (e.target.classList.contains("mm-collapse-btn")) return;
      if (e.button !== 0) return;
      e.stopPropagation();

      const startX = e.clientX, startY = e.clientY;
      let dragging = false;
      let ghost = null;

      const onMove = mv => {
        const dx = mv.clientX - startX, dy = mv.clientY - startY;
        if (!dragging && Math.hypot(dx, dy) > 8) {
          dragging = true;
          // Создаём ghost-элемент
          ghost = document.createElement("div");
          ghost.className = "mm-drag-ghost";
          ghost.textContent = n.label;
          document.body.appendChild(ghost);
          el.style.opacity = "0.4";
          wrap.style.cursor = "grabbing";
        }
        if (dragging && ghost) {
          ghost.style.left = mv.clientX + 12 + "px";
          ghost.style.top  = mv.clientY - 10 + "px";
          // Подсвечиваем ноду под курсором
          document.querySelectorAll(".mm-node.drop-target").forEach(x => x.classList.remove("drop-target"));
          const under = document.elementFromPoint(mv.clientX, mv.clientY)?.closest(".mm-node");
          if (under && under !== el) under.classList.add("drop-target");
        }
      };

      const onUp = async up => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        if (ghost) ghost.remove();
        el.style.opacity = "";
        wrap.style.cursor = "";
        document.querySelectorAll(".mm-node.drop-target").forEach(x => x.classList.remove("drop-target"));

        if (!dragging) return;

        // Находим целевую ноду
        const targetEl = document.elementFromPoint(up.clientX, up.clientY)?.closest(".mm-node");
        if (!targetEl || targetEl === el) return;
        const targetId = targetEl.dataset.id;
        const targetNode = mmFlat.find(x => x.id === targetId);
        if (!targetNode) return;

        // Определяем куда переместить
        let targetValue = null;
        if (n.type === "project") {
          if (targetNode.type === "goal")    targetValue = `goal:${targetNode.id}`;
          else if (targetNode.type === "root") targetValue = `root:`;
        } else if (n.type === "task") {
          if (targetNode.type === "project") targetValue = `project:${targetNode.id}`;
          else if (targetNode.type === "goal") targetValue = `goal:${targetNode.id}`;
          else if (targetNode.type === "root") targetValue = `root:`;
        }

        if (targetValue) {
          toast("Перемещаю...");
          await window._mmMove(n.id, n.type, targetValue);
        } else {
          toast("Нельзя переместить сюда");
        }
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });

    group.appendChild(el);
    wrap.appendChild(group);

    (n._visibleChildren || []).forEach(nodes);
  }
  nodes(mmTree);
}

// ══════════════════════════════════════════
//  СОБЫТИЯ
// ══════════════════════════════════════════
function setupEvents(wrap) {
  wrap.addEventListener("click", e => {
    if (e.target === wrap || e.target === document.getElementById("mm-svg")) {
      mmSel = null; drawMM(); renderSidebar(null);
    }
  });

  let panning = false, panStart = { x: 0, y: 0 };
  wrap.addEventListener("mousedown", e => {
    if (e.target === wrap || e.target === document.getElementById("mm-svg")) {
      panning = true;
      wrap.style.cursor = "grabbing";
      panStart = { x: e.clientX - mmPan.x, y: e.clientY - mmPan.y };
    }
  });
  window.addEventListener("mousemove", e => {
    if (!panning) return;
    mmPan = { x: e.clientX - panStart.x, y: e.clientY - panStart.y };
    drawMM();
  });
  window.addEventListener("mouseup", () => {
    panning = false;
    wrap.style.cursor = "";
  });

  wrap.addEventListener("wheel", e => {
    e.preventDefault();
    const ns = Math.max(0.25, Math.min(3, mmScale + (e.deltaY < 0 ? 0.1 : -0.1)));
    const r = wrap.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    mmPan.x = mx - (mx - mmPan.x) * (ns / mmScale);
    mmPan.y = my - (my - mmPan.y) * (ns / mmScale);
    mmScale = ns;
    drawMM();
  }, { passive: false });

  let touchPan = false, touchPanStart = { x: 0, y: 0 };
  let lp = 0, lpMid = { x: 0, y: 0 };

  wrap.addEventListener("touchstart", e => {
    if (e.touches.length === 1) {
      const tgt = e.target;
      if (tgt === wrap || tgt === document.getElementById("mm-svg")) {
        touchPan = true;
        touchPanStart = { x: e.touches[0].clientX - mmPan.x, y: e.touches[0].clientY - mmPan.y };
      }
    }
    if (e.touches.length === 2) {
      lp = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      lpMid = { x: (e.touches[0].clientX + e.touches[1].clientX) / 2, y: (e.touches[0].clientY + e.touches[1].clientY) / 2 };
    }
  }, { passive: true });

  wrap.addEventListener("touchmove", e => {
    if (e.touches.length === 1 && touchPan) {
      e.preventDefault();
      mmPan = { x: e.touches[0].clientX - touchPanStart.x, y: e.touches[0].clientY - touchPanStart.y };
      drawMM();
    }
    if (e.touches.length === 2 && lp > 0) {
      e.preventDefault();
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      const ns = Math.max(0.25, Math.min(3, mmScale * (d / lp)));
      const r = wrap.getBoundingClientRect();
      const mx = lpMid.x - r.left, my = lpMid.y - r.top;
      mmPan.x = mx - (mx - mmPan.x) * (ns / mmScale);
      mmPan.y = my - (my - mmPan.y) * (ns / mmScale);
      mmScale = ns; lp = d;
      drawMM();
    }
  }, { passive: false });

  wrap.addEventListener("touchend", e => {
    if (e.touches.length < 2) lp = 0;
    if (e.touches.length === 0) touchPan = false;
  }, { passive: true });

  window.addEventListener("keydown", e => {
    if (e.key === "Escape") { mmSel = null; drawMM(); renderSidebar(null); }
  });
}

// ══════════════════════════════════════════
//  TOOLBAR
// ══════════════════════════════════════════
document.getElementById("mm-reset")?.addEventListener("click", () => {
  mmPan = { x: 0, y: 0 }; mmScale = 1; drawMM();
});
document.getElementById("mm-zoom-in")?.addEventListener("click", () => {
  mmScale = Math.min(3, mmScale + 0.2); drawMM();
});
document.getElementById("mm-zoom-out")?.addEventListener("click", () => {
  mmScale = Math.max(0.25, mmScale - 0.2); drawMM();
});

// ══════════════════════════════════════════
//  WINDOW GLOBALS
// ══════════════════════════════════════════
window._mmSetView = mode => {
  mmViewMode = mmViewMode === mode ? "all" : mode; // повторный клик — сброс
  // Режим done включает показ выполненных, tasks — выключает
  if (mode === "done")  fmtShowDone = true;
  if (mode === "tasks") fmtShowDone = false;
  renderGoals();
};

window._fmtShowDone = () => {
  fmtShowDone = !fmtShowDone;
  mmViewMode  = "all";
  window._refreshAll?.();
};

window._mmToggle = async id => {
  const node = mmFlat.find(n => n.id === id);
  if (!node) return;
  const newDone = !node.done;
  if (!newDone) node.autoCompleted = false;
  await toggleNodeCascade(node, newDone);
  drawMM();
  if (mmSel === id) renderSidebar(node);
  else if (mmSel) {
    const sel = mmFlat.find(n => n.id === mmSel);
    if (sel) renderSidebar(sel);
  }
};

window._mmDeleteNode = async (id, type, withChildren = true) => {
  const node = mmFlat.find(n => n.id === id);
  if (!node) return;

  const hasKids = node.children.length > 0;
  const confirmMsg = withChildren && hasKids
    ? "Удалить элемент и всё вложенное?"
    : "Удалить элемент?";
  if (!confirm(confirmMsg)) return;

  if (withChildren) {
    // Удаляем всё дерево
    await delSubtree(node);
  } else {
    // Удаляем только саму ноду, детей отвязываем (убираем parentId/goalId/projId)
    const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const { db } = await import("../firebase.js");
    const uid = getUid();
    for (const child of node.children) {
      if (child.type === "project") {
        await updateDoc(doc(db, "users", uid, "projects", child.id), { goalId: null });
      } else if (child.type === "task") {
        const updates = {};
        if (type === "goal")    updates.goalId = null;
        if (type === "project") { updates.projId = null; updates.goalId = null; }
        await updateDoc(doc(db, "users", uid, "tasks", child.id), updates);
      }
    }
    // Удаляем саму ноду
    if (type === "goal")    await deleteGoal(id);
    else if (type === "project") await deleteProject(id);
    else if (type === "task")    await deleteTask(id);
  }

  mmSel = null;
  window._refreshAll?.();
};

// Мини-меню: добавить от цели (проект или задачу)
window._mmAddFromGoal = (goalId, anchorEl) => {
  // Убираем старое меню если есть
  document.getElementById("mm-add-menu")?.remove();
  const menu = document.createElement("div");
  menu.id = "mm-add-menu";
  menu.className = "mm-add-menu";
  menu.innerHTML = `
    <button class="mm-add-menu-btn" onclick="document.getElementById('mm-add-menu')?.remove();window.openNewModal('project','${goalId}',null,'goals')">📁 Проект</button>
    <button class="mm-add-menu-btn" onclick="document.getElementById('mm-add-menu')?.remove();window.openNewModal('task','${goalId}',null,'goals')">✅ Задача</button>`;
  // Позиционируем под кнопкой +
  const r = anchorEl.getBoundingClientRect();
  menu.style.cssText = `position:fixed;left:${r.left}px;top:${r.bottom + 4}px;z-index:9999;`;
  document.body.appendChild(menu);
  // Закрываем при клике вне
  setTimeout(() => {
    document.addEventListener("click", function close() {
      document.getElementById("mm-add-menu")?.remove();
      document.removeEventListener("click", close);
    });
  }, 10);
};

// Добавить подзадачу от задачи (наследует привязку к цели/проекту)
window._mmAddSubtask = id => {
  const node = mmFlat.find(n => n.id === id);
  if (!node) return;
  const goalId = findParentOfType(id, "goal")?.id || null;
  const projId = findParentOfType(id, "project")?.id || null;
  window.openNewModal("task", goalId, projId, "goals");
};
window._planEditGoal = async id => {
  const { getGoals, updateGoal } = await import("../db.js");
  const { openModal, closeModal, toast: t2 } = await import("../modal.js");
  const all = await getGoals();
  const g = all.find(x => x.id === id); if (!g) return;
  openModal("Редактировать цель", `
    <div class="fg"><label class="fl">Название *</label>
      <input class="inp" id="eg-title" value="${esc(g.title || '')}"/></div>
    <div class="fg"><label class="fl">Описание</label>
      <textarea class="txta" id="eg-desc">${esc(g.desc || '')}</textarea></div>
    <div class="fg"><label class="fl">Дедлайн</label>
      <input class="inp" id="eg-dl" type="date" value="${g.deadline || ''}"/></div>`,
    async () => {
      const title = document.getElementById("eg-title")?.value.trim();
      if (!title) { toast("⚠️ Введите название"); return; }
      await updateGoal(id, {
        title,
        desc:     document.getElementById("eg-desc")?.value.trim() || '',
        deadline: document.getElementById("eg-dl")?.value || null,
      });
      t2("Цель обновлена ✓"); closeModal(); window._refreshAll?.();
    });
};

// ── Редактирование проекта ──
window._planEditProj = async id => {
  const { getProjects, getGoals } = await import("../db.js");
  const { openModal, closeModal, toast: t2 } = await import("../modal.js");
  const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
  const { db } = await import("../firebase.js");
  const uid = getUid();
  const [projects, goals] = await Promise.all([getProjects(), getGoals()]);
  const p = projects.find(x => x.id === id); if (!p) return;
  openModal("Редактировать проект", `
    <div class="fg"><label class="fl">Название *</label>
      <input class="inp" id="ep-name" value="${esc(p.name || '')}"/></div>
    <div class="fg"><label class="fl">Описание</label>
      <textarea class="txta" id="ep-desc">${esc(p.desc || '')}</textarea></div>
    <div class="fg"><label class="fl">Цель</label>
      <select class="sel" id="ep-goal">
        <option value="">— Без цели —</option>
        ${goals.map(g => `<option value="${g.id}" ${g.id === p.goalId ? 'selected' : ''}>${esc(g.title)}</option>`).join("")}
      </select></div>`,
    async () => {
      const name = document.getElementById("ep-name")?.value.trim();
      if (!name) { toast("⚠️ Введите название"); return; }
      await updateDoc(doc(db, "users", uid, "projects", id), {
        name,
        desc:   document.getElementById("ep-desc")?.value.trim() || '',
        goalId: document.getElementById("ep-goal")?.value || null,
      });
      t2("Проект обновлён ✓"); closeModal(); window._refreshAll?.();
    });
};

// ══════════════════════════════════════════
//  БЫСТРОЕ СОЗДАНИЕ ЦЕЛИ / ПРОЕКТА из секции «Переместить»
// ══════════════════════════════════════════

// Создать новую цель и сразу привязать к ней ноду
window._mmQuickNewGoal = async (nodeId, nodeType) => {
  const { openModal: om, closeModal: cm, toast: t3 } = await import("../modal.js");
  const type = nodeType || mmFlat.find(n => n.id === nodeId)?.type || "project";

  om("Новая цель", `
    <div class="fg"><label class="fl">Название цели *</label>
      <input class="inp" id="qng-title" placeholder="Чего хочу достичь?"/></div>
    <div class="fg"><label class="fl">Описание</label>
      <textarea class="txta" id="qng-desc" placeholder="Описание..."></textarea></div>`,
    async () => {
      const title = document.getElementById("qng-title")?.value.trim();
      if (!title) { t3("⚠️ Введите название"); return; }

      // Создаём цель
      const { addGoal } = await import("../db.js");
      const newGoal = await addGoal({ title, desc: document.getElementById("qng-desc")?.value.trim() || '' });
      const newGoalId = newGoal.id;
      t3("Цель создана ✓");
      cm();

      // Привязываем ноду к новой цели
      await window._mmMove(nodeId, type, `goal:${newGoalId}`);

      // Обновляем карту
      await renderGoals();
    });
};

// Создать новый проект и сразу привязать к нему задачу
window._mmQuickNewProject = async (nodeId) => {
  const { openModal: om, closeModal: cm, toast: t3 } = await import("../modal.js");
  const goals = mmFlat.filter(n => n.type === "goal");
  const goalOpts = goals.map(g =>
    `<option value="${g.id}">${esc(g.label)}</option>`
  ).join("");

  om("Новый проект", `
    <div class="fg"><label class="fl">Название проекта *</label>
      <input class="inp" id="qnp-title" placeholder="Название проекта"/></div>
    <div class="fg"><label class="fl">Привязать к цели</label>
      <select class="sel" id="qnp-goal">
        <option value="">— без цели —</option>
        ${goalOpts}
      </select></div>
    <div class="fg"><label class="fl">Описание</label>
      <textarea class="txta" id="qnp-desc" placeholder="Описание..."></textarea></div>`,
    async () => {
      const name = document.getElementById("qnp-title")?.value.trim();
      if (!name) { t3("⚠️ Введите название"); return; }

      const { addProject } = await import("../db.js");
      const goalId = document.getElementById("qnp-goal")?.value || null;
      const newProj = await addProject({
        name,
        desc:   document.getElementById("qnp-desc")?.value.trim() || '',
        goalId: goalId || null,
      });
      const newProjId = newProj.id;
      t3("Проект создан ✓");
      cm();

      // Привязываем задачу к новому проекту
      await window._mmMove(nodeId, "task", `project:${newProjId}`);

      // Обновляем карту
      await renderGoals();
    });
};

// ════════════════════════════════════════
//  БЛОК "БЛИЖАЙШИЕ ШАГИ" под картой
//  По скрину: иконка + название цели + прогресс-бар + %
// ════════════════════════════════════════
function renderGoalsSteps(goals, tasks) {
  const panel = document.getElementById("goals-steps-panel");
  if (!panel) return;

  const activeGoals = goals.filter(g => !g.done);
  if (!activeGoals.length) { panel.innerHTML = ""; return; }

  // Считаем прогресс по задачам каждой цели
  const withProgress = activeGoals.map((g, i) => {
    const gTasks  = tasks.filter(t => t.goalId === g.id);
    const done    = gTasks.filter(t => t.done).length;
    const total   = gTasks.length;
    const pct     = total > 0 ? Math.round(done / total * 100) : 0;
    // Цвет прогресс-бара: зелёный >60%, жёлтый >30%, красный <=30%
    const color   = pct >= 60 ? "#4DFFB4" : pct >= 30 ? "#FFB84D" : "#FF6B6B";
    return { g, pct, color, icon: GCOLS[i % GCOLS.length] };
  }).sort((a, b) => b.pct - a.pct); // топ по прогрессу сначала

  const shown = withProgress.slice(0, 5);

  panel.innerHTML = `
    <div class="goals-steps-header">
      <div class="goals-steps-title">Ближайшие шаги</div>
      <label class="goals-show-done-toggle">
        <input type="checkbox" id="goals-show-done-chk" ${fmtShowDone ? "checked" : ""}
          onchange="window._fmtShowDone()"/>
        <span>Показать выполненные</span>
      </label>
    </div>
    ${shown.map(({ g, pct, color }) => `
      <div class="goal-step-row" onclick="window._openGoalDetail?.('${g.id}')">
        <div class="goal-step-ico" style="border:1.5px solid ${color}40">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="${color}" stroke-width="2"/>
            <circle cx="12" cy="12" r="4"  fill="${color}"/>
          </svg>
        </div>
        <div class="goal-step-body">
          <div class="goal-step-name">${esc(g.title)}</div>
          <div class="goal-step-bar-wrap">
            <div class="goal-step-bar" style="width:${pct}%;background:${color};"></div>
          </div>
        </div>
        <span class="goal-step-pct" style="color:${color}">${pct}%</span>
      </div>`).join("")}
    ${withProgress.length > 5 ? `
      <button class="goals-steps-more" onclick="window._goalsView('list')">
        Смотреть все цели →
      </button>` : ""}
  `;
}

// View switcher handler (карта / список)
window._goalsView = async (view) => {
  const mapView  = document.getElementById("goals-map-view");
  const listView = document.getElementById("goals-list-view");
  const mapBtn   = document.getElementById("gvs-map");
  const listBtn  = document.getElementById("gvs-list");

  if (!mapView || !listView) return;

  if (view === "map") {
    mapView.style.display  = "";
    listView.style.display = "none";
    mapBtn?.classList.add("on");
    listBtn?.classList.remove("on");
    // Скрываем зум-кнопки только если нужно
  } else {
    mapView.style.display  = "none";
    listView.style.display = "";
    mapBtn?.classList.remove("on");
    listBtn?.classList.add("on");
    // Рендерим список целей
    renderGoalsList(listView);
  }
};

async function renderGoalsList(container) {
  const { getGoals, getTasks, getProjects } = await import("../db.js");
  const { GCOLS } = await import("../utils.js");
  const [goals, tasks, projects] = await Promise.all([getGoals(), getTasks(), getProjects()]);

  const active = goals.filter(g => !g.done);
  if (!active.length) {
    container.innerHTML = `<div class="plan-empty"><div class="plan-empty-ico">🎯</div><div class="plan-empty-text">Целей нет</div><button class="plan-empty-add" onclick="openNewModal('goal',null,null,'goals')">+ Добавить цель</button></div>`;
    return;
  }

  container.innerHTML = active.map((g, i) => {
    const color    = GCOLS[i % GCOLS.length];
    const gTasks   = tasks.filter(t => t.goalId === g.id);
    const doneCnt  = gTasks.filter(t => t.done).length;
    const total    = gTasks.length;
    const pct      = total > 0 ? Math.round(doneCnt / total * 100) : 0;
    const pColor   = pct >= 60 ? "#4DFFB4" : pct >= 30 ? "#FFB84D" : "#FF6B6B";
    const projCnt  = projects.filter(p => p.goalId === g.id && !p.done).length;
    return `
      <div class="icard" style="border-left:3px solid ${color}">
        <div class="ic-body" onclick="window._openGoalDetail?.('${g.id}')">
          <div class="ic-ttl">${esc(g.title)}</div>
          ${g.desc ? `<div style="font-size:12px;color:var(--tx-m);margin-top:3px">${esc(g.desc.slice(0,100))}</div>` : ""}
          <div style="margin:8px 0 4px;height:3px;background:rgba(255,255,255,0.06);border-radius:99px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:${pColor};border-radius:99px;transition:width .5s ease"></div>
          </div>
          <div class="ic-meta">
            <span class="ic-tag" style="background:${color}22;color:${color}">${pct}%</span>
            ${projCnt ? `<span class="ic-tag tag-proj">${projCnt} проектов</span>` : ""}
            <span class="ic-tag tag-goal">${total - doneCnt} задач</span>
          </div>
        </div>
      </div>`;
  }).join("") + `<button class="fab" onclick="openNewModal('goal',null,null,'goals')">+</button>`;
}

window._openGoalDetail = async id => {
  window.switchTab?.("goals");
  const node = document.querySelector(`[data-nid="${id}"]`);
  if (node) node.click();
};
