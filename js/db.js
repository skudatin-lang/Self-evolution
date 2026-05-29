// ════════════════════════════════════════
//  DATABASE MODULE (исправлен)
//  js/db.js
// ════════════════════════════════════════

import { db } from "./firebase.js";
import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDoc,
  getDocs, query, where, writeBatch, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let _uid = null;
export const setUid = uid => { _uid = uid; };
export const getUid = () => _uid;

export const uc = col => collection(db, "users", _uid, col);
export const ud = (col, id) => doc(db, "users", _uid, col, id);

export async function sg(q) {
  try {
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn("sg error:", e);
    return [];
  }
}

const p2 = n => String(n).padStart(2, "0");
export const dstr = d => {
  if (!d) return "";
  const dt = d instanceof Date ? d : d.toDate ? d.toDate() : new Date(d);
  return `${dt.getFullYear()}-${p2(dt.getMonth() + 1)}-${p2(dt.getDate())}`;
};
export const fdt = d => {
  if (!d) return "";
  let dt;
  if (d instanceof Date) {
    dt = d;
  } else if (d && typeof d.toDate === "function") {
    dt = d.toDate();
  } else {
    // Нормализуем строку для Safari: добавляем секунды и timezone если нет
    let s = String(d);
    // "2026-05-21T05:20" → "2026-05-21T05:20:00"
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) s += ":00";
    // "2026-05-21" → "2026-05-21T00:00:00"
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += "T00:00:00";
    dt = new Date(s);
  }
  if (isNaN(dt.getTime())) return "";
  return `${p2(dt.getDate())}.${p2(dt.getMonth() + 1)}.${dt.getFullYear()} ${p2(dt.getHours())}:${p2(dt.getMinutes())}`;
};
export const today = () => dstr(new Date());
export const isOv = d => {
  if (!d) return false;
  let dt;
  if (d && typeof d.toDate === "function") {
    dt = d.toDate();
  } else {
    let s = String(d);
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) s += ":00";
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s += "T00:00:00";
    dt = new Date(s);
  }
  return !isNaN(dt.getTime()) && dt < new Date();
};
export const toTS = v => (v ? Timestamp.fromDate(new Date(v)) : null);
export const esc = s => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const ss = () => serverTimestamp();

// Безопасный парсинг даты-строки в локальный Date (Safari-safe)
function parseLocalDate(s) {
  if (!s) return null;
  if (s && typeof s.toDate === "function") return s.toDate();
  // "2026-05-22" → Safari парсит как UTC → сдвиг. Добавляем T00:00:00 для локального
  let str = String(s);
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) str += "T00:00:00";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(str)) str += ":00";
  const dt = new Date(str);
  return isNaN(dt.getTime()) ? null : dt;
}

// ── Генерация повторяющихся задач ──
export async function generateRecurringInstances(parentTask, startDate, endDate) {
  if (!parentTask.recurrence || parentTask.recurrence.type === "none") return [];
  const { type, interval = 1, until, weekdays = [], monthdays = [] } = parentTask.recurrence;

  // Стартовая дата
  let start = parseLocalDate(startDate);
  if (!start || isNaN(start.getTime())) start = new Date();
  start.setHours(0, 0, 0, 0);

  // Дата окончания: until или 90 дней от старта
  const horizon = new Date(start);
  horizon.setDate(horizon.getDate() + 90);
  const untilDate = until ? parseLocalDate(until) : horizon;
  if (!untilDate || isNaN(untilDate.getTime())) { untilDate || horizon; }
  untilDate.setHours(23, 59, 59, 0);

  const instances = [];
  let current = new Date(start);

  while (current <= untilDate) {
    let shouldAdd = false;
    const dow = current.getDay(); // 0=вс, 1=пн...

    switch (type) {
      case "daily":
        shouldAdd = true;
        break;
      case "weekly":
        // Если выбраны конкретные дни — проверяем; иначе каждые N недель от startDate
        if (weekdays.length > 0) {
          shouldAdd = weekdays.includes(dow);
        } else {
          const diffDays = Math.round((current - startDate) / 86400000);
          shouldAdd = diffDays % (7 * interval) === 0;
        }
        break;
      case "monthly":
        if (monthdays.length > 0) {
          shouldAdd = monthdays.includes(current.getDate());
        } else {
          shouldAdd = current.getDate() === new Date(startDate).getDate();
        }
        break;
      case "yearly":
        shouldAdd = current.getMonth() === startDate.getMonth()
                 && current.getDate() === startDate.getDate();
        break;
    }

    if (shouldAdd) {
      const newTask = { ...parentTask };
      delete newTask.id;
      delete newTask.createdAt;
      newTask.parentId = parentTask.id;
      newTask.date     = dstr(current);
      newTask.recurrence = null;
      newTask.done       = false;
      newTask.createdAt  = ss();
      instances.push(stripUndefined(newTask));
    }

    // Шаг цикла
    if (type === "weekly" && weekdays.length > 0) {
      current.setDate(current.getDate() + 1); // по одному дню — weekdays сами фильтруют
    } else if (type === "weekly") {
      current.setDate(current.getDate() + 7 * interval);
    } else if (type === "monthly") {
      current.setDate(current.getDate() + 1);
    } else if (type === "yearly") {
      current.setFullYear(current.getFullYear() + interval);
    } else {
      current.setDate(current.getDate() + interval);
    }
  }

  // Удаляем старые экземпляры, создаём новые
  const existing = await sg(query(uc("tasks"), where("parentId", "==", parentTask.id)));
  const batch = writeBatch(db);
  existing.forEach(t => batch.delete(ud("tasks", t.id)));
  await batch.commit();

  for (const inst of instances) {
    await addDoc(uc("tasks"), inst);
  }
  return instances;
}

// ── Убираем undefined из объекта (Firebase не принимает undefined) ──
function stripUndefined(obj) {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) return obj.map(stripUndefined);
  if (typeof obj === "object") {
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) result[k] = stripUndefined(v);
    }
    return result;
  }
  return obj;
}

// ════════════════ TASKS ════════════════
export const getTasks = async () => {
  const raw = await sg(uc("tasks"));
  const today2 = dstr(new Date());

  // Автосброс: повторяющиеся задачи у которых done=true но completedDate !== сегодня
  // → сбрасываем done в Firebase и возвращаем как невыполненные
  const toReset = raw.filter(t =>
    t.done &&
    t.recurrence && t.recurrence.type !== "none" &&
    t.completedDate && t.completedDate !== today2
  );
  if (toReset.length > 0) {
    // Сбрасываем в Firebase (без await — не блокируем загрузку)
    toReset.forEach(t =>
      updateDoc(ud("tasks", t.id), { done: false, completedDate: null }).catch(() => {})
    );
    // Возвращаем уже со сброшенным done локально
    toReset.forEach(t => { t.done = false; t.completedDate = null; });
  }

  return raw;
};

export const addTask = async data => {
  const taskData = stripUndefined({
    title: data.title,
    note: data.note || "",
    goalId: data.goalId || null,
    projId: data.projId || null,
    // ── НОВОЕ: мотив задачи (duty = надо, want = хочу) ──
    motive: data.motive || "duty",
    priority: data.priority || "med",
    subtasks: data.subtasks || [],
    date: data.date || today(),
    deadline: toTS(data.deadline),
    startDate: toTS(data.startDate),
    done: false,
    // ── статус и история задачи ──
    status: "open",    // open | postponed | cancelled
    history: [],       // массив событий изменений
    createdAt: ss(),
    reminder: data.reminder ? toTS(data.reminder) : null,
    attachments: data.attachments || [],
    recurrence: data.recurrence || null,
    parentId: data.parentId || null,
    displaced: data.displaced || null,
    fromAi: data.fromAi || null,
    energyScore: data.energyScore || null,
  });
  const docRef = await addDoc(uc("tasks"), taskData);
  return docRef;
};

export const updateTask = async (id, data) => {
  const payload = stripUndefined({ ...data });
  if ("deadline" in data) payload.deadline = toTS(data.deadline);
  if ("startDate" in data) payload.startDate = toTS(data.startDate);
  if ("reminder" in data) payload.reminder = toTS(data.reminder);
  await updateDoc(ud("tasks", id), payload);
};

// ── Ключевая задача дня (единая логика для Плана и Дашборда) ──
export function getKeyTask(tasks, targetStr) {
  // tasks уже отфильтрованы под нужный день (из plan.js open или stats.todayTasks)
  // Приоритет: high → первая в списке
  return tasks.find(t => !t.done && !t.displaced && t.priority === "high")
      || tasks.find(t => !t.done && !t.displaced)
      || null;
}

// Удаляем ВСЕ дочерние экземпляры повторяющихся задач (одноразовая очистка)
export const cleanupRecurringChildren = async () => {
  const children = await sg(query(uc("tasks"), where("parentId", "!=", null)));
  if (!children.length) return 0;
  const batch = writeBatch(db);
  children.forEach(c => batch.delete(ud("tasks", c.id)));
  await batch.commit();
  return children.length;
};

export const deleteTask = async id => {
  const children = await sg(query(uc("tasks"), where("parentId", "==", id)));
  const batch = writeBatch(db);
  children.forEach(c => batch.delete(ud("tasks", c.id)));
  batch.delete(ud("tasks", id));
  await batch.commit();
};

export const toggleTask = async id => {
  const all = await getTasks();
  const t = all.find(x => x.id === id);
  if (!t) return;

  const isRecurring = t.recurrence && t.recurrence.type !== "none";
  const today2 = dstr(new Date());

  if (isRecurring) {
    // Для повторяющихся задач: toggleTask работает только в рамках текущего дня
    const doneToday = t.done && t.completedDate === today2;
    if (doneToday) {
      await updateDoc(ud("tasks", id), { done: false, completedDate: null });
    } else {
      await updateDoc(ud("tasks", id), { done: true, completedDate: today2, status: "open" });
    }
  } else {
    // Обычные задачи — стандартная логика
    const nowDone = !t.done;
    const update = { done: nowDone };
    if (nowDone) { update.completedDate = today2; update.status = "open"; }
    else { update.completedDate = null; }
    await updateDoc(ud("tasks", id), update);
  }
};

// ── Сохранение оценки энергии после задачи (1–5) ──
export const saveEnergyScore = async (id, score) => {
  await updateDoc(ud("tasks", id), { energyScore: score, energyScoredAt: dstr(new Date()) });
};

// ════════════════════════════════════════
//  ИСТОРИЯ ИЗМЕНЕНИЙ ЗАДАЧИ
//  Каждое важное событие пишется в history[]
//  Типы: postponed | cancelled | reopened | title_changed | goal_changed
// ════════════════════════════════════════

async function _appendHistory(id, event) {
  const all = await getTasks();
  const task = all.find(t => t.id === id);
  if (!task) return;
  const history = Array.isArray(task.history) ? [...task.history] : [];
  history.push({ ...event, at: new Date().toISOString() });
  await updateDoc(ud("tasks", id), { history });
}

// ── Перенос задачи ──
// reason: "no_time" | "no_mood" | "irrelevant"
export const postponeTask = async (id, newDate, reason = "no_time") => {
  const all = await getTasks();
  const task = all.find(t => t.id === id);
  if (!task) return;
  const history = Array.isArray(task.history) ? [...task.history] : [];
  history.push({
    event: "postponed",
    from: task.date || null,
    to: newDate,
    reason,
    at: new Date().toISOString(),
  });
  await updateDoc(ud("tasks", id), {
    date: newDate,
    status: "open",
    history,
  });
};

// ── Отмена задачи ──
export const cancelTask = async (id, reason = "irrelevant") => {
  const all = await getTasks();
  const task = all.find(t => t.id === id);
  if (!task) return;
  const history = Array.isArray(task.history) ? [...task.history] : [];
  history.push({
    event: "cancelled",
    reason,
    at: new Date().toISOString(),
  });
  await updateDoc(ud("tasks", id), {
    status: "cancelled",
    history,
  });
};

// ── Восстановление отменённой задачи ──
export const reopenTask = async id => {
  await _appendHistory(id, { event: "reopened" });
  await updateDoc(ud("tasks", id), { status: "open" });
};

// ── Запись смены названия задачи ──
export const recordTitleChange = async (id, oldTitle, newTitle) => {
  if (!oldTitle || !newTitle || oldTitle.trim() === newTitle.trim()) return;
  await _appendHistory(id, {
    event: "title_changed",
    from: oldTitle.trim(),
    to: newTitle.trim(),
  });
};

// ── Запись смены цели у задачи ──
export const recordGoalChange = async (id, oldGoalId, newGoalId, goals) => {
  if (oldGoalId === newGoalId) return;
  const oldTitle = goals.find(g => g.id === oldGoalId)?.title || "—";
  const newTitle = goals.find(g => g.id === newGoalId)?.title || "—";
  await _appendHistory(id, {
    event: "goal_changed",
    from: oldTitle,
    to: newTitle,
  });
};

// ── Заглушки для обратной совместимости (actions-bank.js) ──
export const saveMetric = async () => {};
export const getDb = () => db;

// ════════════════ GOALS, PROJECTS, IDEAS, DIARY, TEMPLATES ════════════════
export const getGoals = () => sg(uc("goals"));
export const addGoal = data => addDoc(uc("goals"), { ...data, createdAt: ss() });
export const deleteGoal = id => deleteDoc(ud("goals", id));
export const updateGoal = (id, d) => updateDoc(ud("goals", id), d);

export const getProjects = () => sg(uc("projects"));
export const addProject  = data => addDoc(uc("projects"), { ...data, createdAt: ss() });
export const updateProject = (id, data) => updateDoc(ud("projects", id), stripUndefined(data));
export const deleteProject = id => deleteDoc(ud("projects", id));

export const getIdeas = () => sg(uc("ideas"));
export const addIdea = data => addDoc(uc("ideas"), { ...data, date: data.date || today(), createdAt: ss() });
export const updateIdea = (id, d) => updateDoc(ud("ideas", id), d);
export const deleteIdea = id => deleteDoc(ud("ideas", id));

export const getDiary = () => sg(uc("diary"));
export const addDiaryEntry = data => addDoc(uc("diary"), { ...data, date: data.date || today(), createdAt: ss() });
export const updateDiaryEntry = (id, d) => updateDoc(ud("diary", id), d);
export const deleteDiaryEntry = id => deleteDoc(ud("diary", id));

export const getTemplates = () => sg(uc("templates"));
export const addTemplate = data => addDoc(uc("templates"), { ...data, createdAt: ss() });
export const deleteTemplate = id => deleteDoc(ud("templates", id));

// ════════════ SURVEY / КОЛЕСО БАЛАНСА ════════════
export const getSurvey  = () => sg(uc("survey"));
export const saveSurvey = async data => {
  const arr = await getSurvey();
  if (arr.length) await updateDoc(ud("survey", arr[0].id), { ...data, updatedAt: ss() });
  else await addDoc(uc("survey"), { ...data, createdAt: ss(), updatedAt: ss() });
};

// ════════════ AI PLAN — черновик и применение ════════════
export const saveAiPlanDraft = async data => {
  const arr = await sg(uc("aiplan"));
  if (arr.length) await updateDoc(ud("aiplan", arr[0].id), { ...data, updatedAt: ss() });
  else await addDoc(uc("aiplan"), { ...data, createdAt: ss(), updatedAt: ss() });
};
export const getAiPlanDraft = () => sg(uc("aiplan"));

// Применить выбранный план:
// - помечает старые невыполненные задачи на сегодня как displaced
// - создаёт новые задачи из выбранного варианта
export const applyAiPlan = async (selectedTasks, goals, projects) => {
  const todayStr = dstr(new Date());
  const allTasks = await getTasks();

  const toDisplace = allTasks.filter(t =>
    !t.done && t.date === todayStr && !t.displaced
  );
  if (toDisplace.length) {
    const batch = writeBatch(db);
    toDisplace.forEach(t =>
      batch.update(ud("tasks", t.id), { displaced: true, displacedAt: todayStr })
    );
    await batch.commit();
  }

  for (const t of selectedTasks) {
    const goal    = goals.find(g => g.title === t.goal_title || g.id === t.goal_id);
    const project = projects.find(p => p.name === t.project_title || p.id === t.project_id);
    await addDoc(uc("tasks"), {
      title:      t.title,
      note:       t.note || t.reason || "",
      goalId:     goal?.id    || t.goal_id    || null,
      projId:     project?.id || t.project_id || null,
      priority:   t.priority  || "med",
      subtasks:   t.steps     || [],
      date:       todayStr,
      deadline:   null,
      startDate:  null,
      done:       false,
      status:     "open",
      history:    [],
      fromAi:     true,
      aiVariant:  t.variant || "",
      createdAt:  ss(),
      reminder:   null,
      attachments: [],
      recurrence: null,
      parentId:   null,
    });
  }
};

export const getWeekGoals = () => sg(uc("weekgoals"));
export const saveWeekGoal = async (field, value, id) => {
  const arr = await getWeekGoals();
  const wg = arr[0];
  if (wg) await updateDoc(ud("weekgoals", wg.id), { [field]: value.trim() });
  else await addDoc(uc("weekgoals"), { [field]: value.trim(), createdAt: ss() });
};

export const getMmPos = () => sg(uc("mmpos"));
export const saveMmPos = async (nid, x, y) => {
  const arr = await getMmPos();
  const ex = arr.find(p => p.nid === nid);
  if (ex) await updateDoc(ud("mmpos", ex.id), { x, y });
  else await addDoc(uc("mmpos"), { nid, x, y });
};

export const getStats = async () => {
  const [tasks, goals, ideas, diary] = await Promise.all([getTasks(), getGoals(), getIdeas(), getDiary()]);
  const td  = today();
  const tgt = new Date(td + "T00:00:00");

  // Задачи на сегодня = прямые + повторяющиеся которые попадают на сегодня
  const tt = tasks.filter(t => {
    if (t.done || t.displaced) return false;
    if (t.date === td) return true;
    if (t.recurrence && t.recurrence.type !== "none") {
      const r = t.recurrence;
      const start = t.startDate?.toDate?.() ?? (t.date ? new Date(t.date + "T00:00:00") : null);
      if (!start || start > tgt) return false;
      const until = r.until ? new Date(r.until + "T23:59:59") : null;
      if (until && tgt > until) return false;
      const dow  = tgt.getDay();
      const dom  = tgt.getDate();
      const diff = Math.round((tgt - start) / 86400000);
      switch (r.type) {
        case "daily":   return diff >= 0;
        case "weekly":  return r.weekdays?.length ? r.weekdays.includes(dow) : diff % (7*(r.interval||1)) === 0;
        case "monthly": return r.monthdays?.length ? r.monthdays.includes(dom) : dom === start.getDate();
        case "yearly":  return dom === start.getDate() && tgt.getMonth() === start.getMonth();
      }
    }
    return false;
  });

  // Все открытые задачи — для определения ключевой цели (включает задачи с будущей датой)
  const allOpen = tasks.filter(t => !t.done && !t.displaced);

  return {
    tasks, goals, ideas, diary,
    todayOpen:  tt.filter(t => !t.done).length,
    todayDone:  tasks.filter(t => t.done && t.completedDate === td).length,
    overdue:    tasks.filter(t => !t.done && isOv(t.deadline)).length,
    todayTasks: tt.length ? tt : allOpen, // fallback на все задачи если нет задач на сегодня
    allOpen,
  };
};
// ════════════════════════════════════════
//  DAILY AUDIT — вечерний аудит дня
//  Коллекция: users/{uid}/daily_audit
//  Поля: date, energy, fatigue, mood,
//        reflection, aiResponse, authorRatio
// ════════════════════════════════════════

export const getDailyAudits = () => sg(uc("daily_audit"));

// Сохранить или обновить аудит за день (один документ на дату)
export const saveDailyAudit = async data => {
  const dateStr = data.date || today();
  const all = await getDailyAudits();
  const existing = all.find(a => a.date === dateStr);
  if (existing) {
    await updateDoc(ud("daily_audit", existing.id), { ...data, updatedAt: ss() });
    return existing.id;
  } else {
    const ref = await addDoc(uc("daily_audit"), { ...data, date: dateStr, createdAt: ss() });
    return ref.id;
  }
};

export const deleteDailyAudit = id => deleteDoc(ud("daily_audit", id));

// Получить аудит за конкретный день
export const getAuditForDate = async (dateStr) => {
  const all = await getDailyAudits();
  return all.find(a => a.date === (dateStr || today())) || null;
};

// Коэффициент авторства: % задач с motive="want" среди выполненных за день
export const calcAuthorRatio = async (dateStr) => {
  const tasks = await getTasks();
  const td = dateStr || today();
  const doneTodayTasks = tasks.filter(t => t.done && t.completedDate === td);
  if (!doneTodayTasks.length) return null;
  const wantCount = doneTodayTasks.filter(t => t.motive === "want").length;
  return Math.round((wantCount / doneTodayTasks.length) * 100);
};

// ════════════ ФОКУСНАЯ ЦЕЛЬ НЕДЕЛИ ════════════
// Хранится в коллекции users/{uid}/focus_goal — один документ
export const getFocusGoal = async () => {
  const arr = await sg(uc("focus_goal"));
  return arr[0] || null; // { goalId, setAt }
};

export const saveFocusGoal = async (goalId) => {
  const arr = await sg(uc("focus_goal"));
  const data = { goalId, setAt: today() };
  if (arr.length) await updateDoc(ud("focus_goal", arr[0].id), data);
  else await addDoc(uc("focus_goal"), { ...data, createdAt: ss() });
};

// ════════════ РАСШИРЕННАЯ СТАТИСТИКА ДЛЯ ДАШБОРДА ════════════
export const getDashStats = async () => {
  const [tasks, goals, ideas, diary] = await Promise.all([
    getTasks(), getGoals(), getIdeas(), getDiary()
  ]);
  const td  = today();
  const tgt = new Date(td + "T00:00:00");

  // Задачи сегодня — учитываем старые задачи без поля status
  const todayAll = tasks.filter(t => t.date === td);

  // Выполнено сегодня = done:true (независимо от completedDate — задача была на сегодня)
  const todayDone = todayAll.filter(t => t.done).length;

  // Перенесено = status:"postponed"
  const todayPostponed = todayAll.filter(t => t.status === "postponed").length;

  // Отменено = status:"cancelled"
  const todayCancelled = todayAll.filter(t => t.status === "cancelled").length;

  // Открыто = не выполнено И не отменено (старые задачи без status тоже открыты)
  const todayOpen = todayAll.filter(t =>
    !t.done && t.status !== "cancelled" && t.status !== "postponed"
  ).length;

  // Прогресс по целям
  const goalProgress = goals.map(g => {
    const gTasks     = tasks.filter(t => t.goalId === g.id);
    const gDone      = gTasks.filter(t => t.done).length;
    const gPostponed = gTasks.reduce((acc, t) => {
      const h = Array.isArray(t.history) ? t.history : [];
      return acc + h.filter(e => e.event === "postponed").length;
    }, 0);
    return { ...g, taskTotal: gTasks.length, taskDone: gDone, taskPostponed: gPostponed };
  });

  // Идеи
  const ideasTotal    = ideas.length;
  const ideasInPlan   = ideas.filter(i => i.status === "planned").length;
  const ideasDone     = ideas.filter(i => i.status === "done").length;
  const sevenDaysAgo  = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const ideasUnseen   = ideas.filter(i => {
    if (i.status && i.status !== "new") return false;
    const d = i.date ? new Date(i.date + "T00:00:00") : null;
    return d && d < sevenDaysAgo;
  }).length;

  // Дневник
  const diaryTotal = diary.length;
  const diaryLast  = diary.length
    ? diary.slice().sort((a,b) => (b.date||"") > (a.date||"") ? 1 : -1)[0]
    : null;

  // Настроение за последние 5 дней
  const moodDays = [];
  for (let i = 4; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = dstr(d);
    const entry = diary.filter(e => e.date === ds && e.mood).slice(-1)[0];
    moodDays.push(entry?.mood || null);
  }

  return {
    tasks, goals: goalProgress, ideas, diary,
    todayOpen, todayDone, todayPostponed, todayCancelled,
    ideasTotal, ideasInPlan, ideasDone, ideasUnseen,
    diaryTotal, diaryLast, moodDays,
  };
};

// Алерты: важные задачи не выполнены 2+ дней
export const getOverdueAlerts = async () => {
  const tasks = await getTasks();
  const today2 = new Date(); today2.setHours(0, 0, 0, 0);
  return tasks.filter(t => {
    if (t.done || t.displaced || t.priority !== "high") return false;
    if (t.status === "cancelled") return false;
    if (!t.date) return false;
    const taskDate = new Date(t.date + "T00:00:00");
    const diffDays = Math.floor((today2 - taskDate) / 86400000);
    return diffDays >= 2;
  });
};
