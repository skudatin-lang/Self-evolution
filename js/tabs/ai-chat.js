// ════════════════════════════════════════
//  TAB: AI-АССИСТЕНТ
//  js/tabs/ai-chat.js
// ════════════════════════════════════════
import { registerTab }              from "../router.js";
import { getTasks, getDiary,
         getIdeas, getGoals,
         getDailyAudits, getSurvey,
         dstr, esc }                from "../db.js";

let chatHistory = [];
let isLoading   = false;

export function initAiChat() { registerTab("ai-chat", renderAiChat); }

// ── Быстрые запросы ──
const QUICK_PROMPTS = [
  "Проанализируй мою неделю",
  "Что меня тормозит?",
  "Как улучшить фокус?",
];

export async function renderAiChat() {
  // Сохраняем ссылку для _aicReset
  window._renderAiChatFn = renderAiChat;
  document.getElementById("tb-ttl").textContent = "AI-ассистент";
  const body = document.getElementById("ai-chat-body");
  if (!body) return;


  const lastAnalysis = localStorage.getItem("lc-ai-chat-last-summary") || "";
  const lastTime     = localStorage.getItem("lc-ai-chat-last-time")    || "";

  body.innerHTML = `
    <!-- Приветствие AI -->
    <div class="aic-hero">
      <div class="aic-avatar">◆</div>
      <div class="aic-hero-text">Как я могу помочь?</div>
    </div>

    <!-- Инструменты AI -->
    <div class="aic-tools-row">
      <button class="aic-tool-btn" onclick="window._planAiAnalysis?.()">
        <span>🔍</span><span>Стратегический анализ</span>
      </button>
      <button class="aic-tool-btn" onclick="window._openBankDialog?.()">
        <span>⚡</span><span>Банк действий</span>
      </button>
    </div>

    <!-- Быстрые запросы -->
    <div class="aic-quick-list" id="aic-quick">
      ${QUICK_PROMPTS.map(p => `
        <button class="aic-quick-btn" onclick="window._aicSendQuick('${esc(p)}')">
          <span class="aic-quick-ico">◈</span>
          <span>${esc(p)}</span>
        </button>`).join("")}
    </div>

    <!-- Последний анализ -->
    ${lastAnalysis ? `
    <div class="aic-last-card">
      <div class="aic-last-header">
        <span class="aic-last-title">Последний анализ</span>
        ${lastTime ? `<span class="aic-last-time">${lastTime}</span>` : ""}
      </div>
      <div class="aic-last-text">${esc(lastAnalysis)}</div>
      <button class="aic-last-btn" onclick="window._aicShowFullAnalysis()">
        Посмотреть полный анализ
      </button>
    </div>` : ""}

    <!-- История чата -->
    <div class="aic-messages" id="aic-messages">
      ${chatHistory.map(m => renderMessage(m)).join("")}
    </div>

    <!-- Input фиксирован внизу — стилизован через CSS -->
    <div class="aic-input-bar" id="aic-input-bar">
      <input class="aic-input" id="aic-input"
        placeholder="Задай вопрос..."
        onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();window._aicSend();}"/>
      <button class="aic-send-btn" onclick="window._aicSend()" title="Отправить">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="22" y1="2" x2="11" y2="13"/>
          <polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
      </button>
    </div>
  `;

  // Скролл вниз если есть история
  if (chatHistory.length) {
    const msgs = document.getElementById("aic-messages");
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  }
}

function renderMessage(m) {
  if (m.role === "user") {
    return `<div class="aic-msg aic-msg-user">
      <div class="aic-msg-bubble">${esc(m.content)}</div>
    </div>`;
  }
  return `<div class="aic-msg aic-msg-ai">
    <div class="aic-msg-ico">◆</div>
    <div class="aic-msg-bubble aic-msg-bubble-ai">${formatAiText(m.content)}</div>
  </div>`;
}

function formatAiText(text) {
  return esc(text)
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
}

// ── Отправить вопрос ──
async function sendMessage(text) {
  if (!text.trim() || isLoading) return;
  isLoading = true;

  chatHistory.push({ role: "user", content: text });
  appendMessage({ role: "user", content: text });

  // Placeholder для ответа
  const loadId = "aic-load-" + Date.now();
  const msgs = document.getElementById("aic-messages");
  if (msgs) {
    msgs.insertAdjacentHTML("beforeend", `
      <div class="aic-msg aic-msg-ai" id="${loadId}">
        <div class="aic-msg-ico">◆</div>
        <div class="aic-msg-bubble aic-msg-bubble-ai aic-loading">
          <span></span><span></span><span></span>
        </div>
      </div>`);
    msgs.scrollTop = msgs.scrollHeight;
  }

  try {
    const key = localStorage.getItem("lc-ai-key");
    if (!key) throw new Error("API ключ не задан. Добавь его в «День → Стратегический ИИ».");

    // Контекст пользователя
    const [tasks, diary, goals, audits, surveys] = await Promise.all([
      getTasks(), getDiary(), getGoals(), getDailyAudits(), getSurvey()
    ]);
    const prof     = JSON.parse(localStorage.getItem("lc-ai-profile") || "{}");
    const today2   = dstr(new Date());
    const d7ago    = new Date(); d7ago.setDate(d7ago.getDate() - 7);
    const d7str    = dstr(d7ago);

    const ctx = {
      today: today2,
      user_profile: prof,
      recent_audits: audits.filter(a => a.date >= d7str).slice(0, 7),
      today_tasks:   tasks.filter(t => t.date === today2 || t.completedDate === today2).slice(0, 10),
      goals:         goals.filter(g => !g.done).slice(0, 8).map(g => ({ id: g.id, title: g.title })),
      recent_diary:  diary.filter(d => d.date >= d7str).slice(0, 5).map(d => ({ date: d.date, text: (d.text || "").slice(0, 150) })),
      wheel_of_life: surveys[0]?.scores || null,
    };

    const systemPrompt = `Ты — AI-система осознанной эволюции в приложении Life Evolution.
Говоришь с пользователем на «ты», коротко и по делу.
Ты видишь контекст: задачи, дневник, цели, состояние за последние 7 дней.
Тон: спокойный, аналитический, честный. Не мотиватор. Зеркало паттернов.
Отвечай на русском. Максимум 3-4 предложения если не просят подробнее.

Контекст пользователя: ${JSON.stringify(ctx)}`;

    const history = chatHistory.slice(-6).map(m => ({
      role: m.role, content: m.content
    }));

    const resp = await fetch("https://api.proxyapi.ru/openrouter/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + key,
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-chat",
        max_tokens: 600,
        temperature: 0.7,
        messages: [
          { role: "system", content: systemPrompt },
          ...history,
        ],
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error?.message || "Ошибка API: " + resp.status);
    }
    const data = await resp.json();
    const reply = data.choices?.[0]?.message?.content?.trim() || "Не могу ответить.";

    chatHistory.push({ role: "assistant", content: reply });

    // Обновляем "последний анализ"
    if (chatHistory.length <= 2) {
      localStorage.setItem("lc-ai-chat-last-summary", reply.slice(0, 200));
      localStorage.setItem("lc-ai-chat-last-time",
        new Date().toLocaleString("ru-RU", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" })
      );
    }

    // Заменяем loader на ответ
    const loader = document.getElementById(loadId);
    if (loader) loader.outerHTML = renderMessage({ role: "assistant", content: reply });

  } catch(err) {
    const loader = document.getElementById(loadId);
    if (loader) loader.outerHTML = renderMessage({
      role: "assistant",
      content: "⚠ " + err.message
    });
  } finally {
    isLoading = false;
    const inp = document.getElementById("aic-input");
    if (inp) { inp.value = ""; inp.focus(); }
    const msgs2 = document.getElementById("aic-messages");
    if (msgs2) msgs2.scrollTop = msgs2.scrollHeight;
  }
}

function appendMessage(m) {
  const msgs = document.getElementById("aic-messages");
  if (!msgs) return;
  msgs.insertAdjacentHTML("beforeend", renderMessage(m));
  msgs.scrollTop = msgs.scrollHeight;

  // Скрываем быстрые кнопки после первого сообщения
  document.getElementById("aic-quick")?.style.setProperty("display", "none");

  // Показываем кнопку "Новый вопрос" (если ещё нет)
  if (!document.getElementById("aic-new-btn")) {
    const bar = document.getElementById("aic-input-bar");
    if (bar) {
      const btn = document.createElement("button");
      btn.id = "aic-new-btn";
      btn.className = "aic-new-question-btn";
      btn.textContent = "← Новый вопрос";
      btn.title = "Вернуться к списку быстрых вопросов";
      btn.onclick = () => window._aicReset();
      bar.parentElement.insertBefore(btn, bar);
    }
  }
}

window._aicSend = () => {
  const inp = document.getElementById("aic-input");
  if (inp) sendMessage(inp.value.trim());
};

window._aicSendQuick = text => {
  const inp = document.getElementById("aic-input");
  if (inp) inp.value = text;
  sendMessage(text);
};

window._aicShowFullAnalysis = () => {
  window._toast?.("Запускается полный стратегический анализ...");
  window._planAiAnalysis?.();
};

// Сбросить чат — вернуться к начальному экрану с быстрыми вопросами
window._aicReset = () => {
  chatHistory = [];
  isLoading   = false;
  // Удаляем кнопку "Новый вопрос"
  document.getElementById("aic-new-btn")?.remove();
  // Перерисовываем вкладку с нуля
  const { renderAiChat } = { renderAiChat: window._renderAiChatFn };
  if (window._renderAiChatFn) window._renderAiChatFn();
};
