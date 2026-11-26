const DATA_URL = "./data/codes.json";
const REFRESH_SECONDS = 20;
const STORAGE_KEY = "xiaodou-tried-codes-v1";
const $ = (id) => document.getElementById(id);

const statusNames = {
  available: "可能可用",
  used: "已使用",
  verify: "待确认",
  tried: "我试过"
};

let codes = [];
let countdown = REFRESH_SECONDS;
let toastTimer;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}

function getTriedCodes() {
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]")); }
  catch { return new Set(); }
}

function saveTriedCodes(set) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
}

function showToast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 2200);
}

function isValidCode(code) {
  return /^[A-Z0-9]{6}$/.test(code) && /[A-Z]/.test(code) && /[0-9]/.test(code);
}

function effectiveStatus(item, tried) {
  return tried.has(item.code) ? "tried" : item.status;
}

function formatTime(value) {
  if (!value) return "--:--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(11, 16) || value;
  return date.toLocaleTimeString("zh-CN", {hour:"2-digit", minute:"2-digit", hour12:false});
}

function isRecent(value) {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && Date.now() - date.getTime() <= 15 * 60 * 1000;
}

function renderStats() {
  const tried = getTriedCodes();
  const available = codes.filter(x => effectiveStatus(x, tried) === "available").length;
  const used = codes.filter(x => effectiveStatus(x, tried) === "used").length;
  $("totalCount").textContent = codes.length;
  $("availableCount").textContent = available;
  $("usedCount").textContent = used;
  $("recentCount").textContent = codes.filter(x => isRecent(x.created_at)).length;
}

function renderList() {
  const keyword = $("searchInput").value.trim().toLowerCase();
  const filter = $("filterSelect").value;
  const sort = $("sortSelect").value;
  const tried = getTriedCodes();

  let rows = codes.map(item => ({...item, displayStatus: effectiveStatus(item, tried)}));
  if (keyword) {
    rows = rows.filter(x =>
      [x.code, x.source, x.author].some(v => String(v || "").toLowerCase().includes(keyword))
    );
  }
  if (filter !== "all") rows = rows.filter(x => x.displayStatus === filter);
  rows.sort((a,b) => {
    const delta = new Date(b.created_at) - new Date(a.created_at);
    return sort === "oldest" ? -delta : delta;
  });

  $("codeList").innerHTML = rows.length ? rows.map(item => `
    <div class="code-row ${escapeHtml(item.displayStatus)}">
      <span class="time">${escapeHtml(formatTime(item.created_at))}</span>
      <span class="code">${escapeHtml(item.code)}</span>
      <span class="status ${escapeHtml(item.displayStatus)}">${statusNames[item.displayStatus] || "未知"}</span>
      <span class="source" title="${escapeHtml(item.source || "")}">${escapeHtml(item.source || "社区分享")}</span>
      <span class="ops">
        <button data-action="copy" data-code="${escapeHtml(item.code)}">复制</button>
        <button data-action="tried" data-code="${escapeHtml(item.code)}">我试过</button>
      </span>
    </div>`).join("") : '<div class="empty">没有找到匹配的邀请码</div>';
}

async function loadData({silent=false}={}) {
  try {
    const response = await fetch(`${DATA_URL}?t=${Date.now()}`, {cache:"no-store"});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const remoteCodes = Array.isArray(payload.codes) ? payload.codes : [];
    const localCodes = JSON.parse(localStorage.getItem("xiaodou-local-codes-v1") || "[]");
    const seen = new Set(remoteCodes.map(x => x.code));
    codes = [...localCodes.filter(x => !seen.has(x.code)), ...remoteCodes];
    $("lastUpdated").textContent = payload.updated_at || "未知";
    renderStats();
    renderList();
    countdown = REFRESH_SECONDS;
    $("countdown").textContent = countdown;
    if (!silent) showToast("邀请码数据已刷新");
  } catch (error) {
    $("codeList").innerHTML = '<div class="empty">数据加载失败，请检查 data/codes.json 是否存在</div>';
    if (!silent) showToast("数据加载失败：" + error.message);
  }
}

async function addManualCode() {
  const code = $("manualCode").value.trim().toUpperCase();
  if (!isValidCode(code)) {
    showToast("格式不正确：需要 6 位且同时包含字母和数字");
    return;
  }
  if (codes.some(x => x.code === code)) {
    showToast("这个邀请码已经在列表中");
    return;
  }
  const localItems = JSON.parse(localStorage.getItem("xiaodou-local-codes-v1") || "[]");
  localItems.unshift({
    code,
    status: "verify",
    source: "本机手动添加",
    author: "",
    created_at: new Date().toISOString()
  });
  localStorage.setItem("xiaodou-local-codes-v1", JSON.stringify(localItems));
  codes.unshift(localItems[0]);
  $("manualCode").value = "";
  renderStats();
  renderList();
  showToast("已添加到当前浏览器（仅本机可见）");
}

$("codeList").addEventListener("click", async event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const code = button.dataset.code;
  if (button.dataset.action === "copy") {
    try {
      await navigator.clipboard.writeText(code);
      showToast("邀请码已复制：" + code);
    } catch {
      showToast("复制失败，请手动复制：" + code);
    }
  }
  if (button.dataset.action === "tried") {
    const tried = getTriedCodes();
    tried.add(code);
    saveTriedCodes(tried);
    renderStats();
    renderList();
    showToast("已在本机标记为试过");
  }
});

$("addCodeBtn").addEventListener("click", addManualCode);
$("manualCode").addEventListener("keydown", event => {
  if (event.key === "Enter") addManualCode();
});
$("searchInput").addEventListener("input", renderList);
$("sortSelect").addEventListener("change", renderList);
$("filterSelect").addEventListener("change", renderList);
$("refreshBtn").addEventListener("click", () => loadData());

$("groupQr").addEventListener("click", () => $("qrModal").classList.add("open"));
$("closeModal").addEventListener("click", () => $("qrModal").classList.remove("open"));
$("qrModal").addEventListener("click", event => {
  if (event.target === $("qrModal")) $("qrModal").classList.remove("open");
});

loadData({silent:true});
setInterval(() => {
  countdown -= 1;
  if (countdown <= 0) loadData({silent:true});
  else $("countdown").textContent = countdown;
}, 1000);
