// ════════════════════════════════════════
//  AVATAR — CSS анимация фото
//  Фото → живой аватар в углу экрана
//  js/avatar.js
// ════════════════════════════════════════

const LS_PHOTO  = "lc-avatar-photo";   // base64 фото
const LS_HIDDEN = "lc-avatar-hidden";  // скрыт?

export function initAvatar() {
  const photo = localStorage.getItem(LS_PHOTO);
  if (!photo) return;
  _showAvatar(photo);
}

export function openAvatarDialog() {
  _renderDialog();
}

export function toggleAvatarVisible() {
  const c = document.getElementById("avatar-container");
  if (!c) return;
  const nowHidden = c.classList.toggle("av-hidden");
  localStorage.setItem(LS_HIDDEN, nowHidden ? "1" : "");
}

// ── Показать аватара с фото ──
function _showAvatar(photoSrc) {
  const c = document.getElementById("avatar-container");
  if (!c) return;

  c.innerHTML = `
    <div class="av-photo-wrap">
      <div class="av-glow"></div>
      <div class="av-photo-frame">
        <img src="${photoSrc}" class="av-photo-img" alt="Аватар"/>
      </div>
      <div class="av-particles">
        <span class="av-particle p1">✦</span>
        <span class="av-particle p2">✦</span>
        <span class="av-particle p3">✦</span>
      </div>
    </div>
    <button class="av-toggle-btn" onclick="window._toggleAvatar()" title="Скрыть/показать">◀</button>`;

  c.classList.add("av-visible");
  if (localStorage.getItem(LS_HIDDEN)) c.classList.add("av-hidden");
}

// ── Диалог выбора фото ──
function _renderDialog() {
  document.getElementById("avatar-dialog")?.remove();
  const saved = localStorage.getItem(LS_PHOTO);

  const dlg = document.createElement("div");
  dlg.id = "avatar-dialog";
  dlg.innerHTML = `
    <div class="av-dlg-backdrop" onclick="document.getElementById('avatar-dialog').remove()"></div>
    <div class="av-dlg-box">
      <div class="av-dlg-title">🧑 Мой аватар</div>

      ${saved ? `
        <div class="av-dlg-preview">
          <img src="${saved}" class="av-dlg-preview-img" alt="Текущий аватар"/>
          <div class="av-dlg-preview-lbl">Текущий аватар</div>
        </div>` : `
        <div class="av-dlg-sub">
          Выбери фото — оно появится в углу экрана с живой анимацией
        </div>`}

      <div class="av-upload-zone"
        onclick="document.getElementById('av-file-inp').click()"
        ondragover="event.preventDefault()"
        ondrop="window._avOnDrop(event)">
        <div class="av-upload-ico">📸</div>
        <div class="av-upload-lbl">${saved ? "Сменить фото" : "Нажми или перетащи фото"}</div>
        <div class="av-upload-hint">JPG, PNG, HEIC — лучше фото в полный рост</div>
      </div>
      <input type="file" id="av-file-inp" accept="image/*"
        style="display:none" onchange="window._avOnFile(this)"/>

      <div id="av-status" class="av-status" style="display:none"></div>

      ${saved ? `
        <button class="av-btn-remove" onclick="window._avRemove()">
          🗑 Удалить аватара
        </button>` : ""}
    </div>`;

  document.body.appendChild(dlg);
}

// ── Обработка файла ──
window._avOnFile = async input => {
  const file = input.files[0];
  if (!file) return;
  await _loadPhoto(file);
};

window._avOnDrop = async e => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (file?.type.startsWith("image/")) await _loadPhoto(file);
};

async function _loadPhoto(file) {
  _setStatus("⏳ Загружаю фото...", "loading");
  try {
    const b64 = await _fileToBase64(file);
    localStorage.setItem(LS_PHOTO, b64);
    _setStatus("✅ Готово!", "success");
    setTimeout(() => {
      document.getElementById("avatar-dialog")?.remove();
      _showAvatar(b64);
    }, 600);
  } catch(e) {
    _setStatus("⚠️ Ошибка: " + e.message, "error");
  }
}

window._avRemove = () => {
  localStorage.removeItem(LS_PHOTO);
  localStorage.removeItem(LS_HIDDEN);
  const c = document.getElementById("avatar-container");
  if (c) { c.classList.remove("av-visible"); c.innerHTML = ""; }
  document.getElementById("avatar-dialog")?.remove();
};

window._toggleAvatar = toggleAvatarVisible;

// ── Утилиты ──
function _fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = e => res(e.target.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function _setStatus(msg, type) {
  const el = document.getElementById("av-status");
  if (!el) return;
  el.style.display = "block";
  el.className = `av-status av-status-${type}`;
  el.textContent = msg;
}
