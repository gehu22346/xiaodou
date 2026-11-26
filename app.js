const DATA_URL = "./data/codes.json";
const REFRESH_SECONDS = 20;
const TRIED_KEY = "xiaodou-tried-codes-v5";
const FEED_STATE_KEY = "xiaodou-feed-state-v1";
const REFRESH_INTERVAL_MS = REFRESH_SECONDS * 1000;
const $ = id => document.getElementById(id);

const statusNames = {
  available: "可能可用",
  used: "已使用",
  verify: "待确认",
  tried: "我试过"
};

let pool = [];
let feed = [];
let displayCount = 0;
let countdown = REFRESH_SECONDS;
let toastTimer;
let lastRefreshAt = 0;

// 每个时间段分别抽取数量，避免从4分钟直接跳到47分钟。
function buildAgeMinutes(total) {
  const ages = [];
  const add = (count, min, max) => {
    for (let i = 0; i < count; i++) ages.push(min + Math.random() * (max - min));
  };
  // 刚刚2~3条，1/2/3分钟前各3~4条。
  add(randIntBetween(2, 3), 0.03, 0.85);
  add(randIntBetween(3, 4), 1.02, 1.95);
  add(randIntBetween(3, 4), 2.02, 2.95);
  add(randIntBetween(3, 4), 3.02, 3.95);
  // 其余记录在4分钟至6小时之间连续随机分布。
  while (ages.length < total) ages.push(4.05 + Math.random() * 355.9);
  return shuffle(ages);
}
function randInt(max) {
  if (max <= 0) return 0;
  if (window.crypto?.getRandomValues) {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] % max;
  }
  return Math.floor(Math.random() * max);
}
function randIntBetween(min, max) {
  return min + randInt(max - min + 1);
}
function shuffle(array) {
  const out = [...array];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[ch]));
}
function getTriedCodes() {
  try { return new Set(JSON.parse(localStorage.getItem(TRIED_KEY) || "[]")); }
  catch { return new Set(); }
}
function saveTriedCodes(set) {
  localStorage.setItem(TRIED_KEY, JSON.stringify([...set]));
}
function showToast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 2200);
}
function relativeTime(createdAt) {
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - createdAt) / 60000));
  if (elapsedMinutes === 0) return "刚刚";
  if (elapsedMinutes < 60) return `${elapsedMinutes}分钟前`;
  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = elapsedMinutes % 60;
  return minutes ? `${hours}小时${minutes}分钟前` : `${hours}小时前`;
}
function assignStatuses(items) {
  const indexes = shuffle(items.map((_, i) => i));
  const availableCount = Math.round(items.length * 0.8);
  const usedCount = Math.round(items.length * 0.1);
  items.forEach(item => { item.status = "verify"; });
  indexes.slice(0, availableCount).forEach(i => { items[i].status = "available"; });
  indexes.slice(availableCount, availableCount + usedCount).forEach(i => { items[i].status = "used"; });
}
function assignInitialFeed() {
  displayCount = randIntBetween(50, 120);
  const selected = shuffle(pool).slice(0, displayCount);
  const ages = buildAgeMinutes(displayCount);
  const now = Date.now();

  feed = selected.map((source, i) => ({
    code: source.code,
    status: "verify",
    createdAt: now - ages[i] * 60000
  }));
  assignStatuses(feed);
  lastRefreshAt = now;
  saveFeedState();
  renderLastUpdated();
  renderStats();
  renderList();
}
function randomStatus() {
  const n = Math.random();
  if (n < 0.8) return "available";
  if (n < 0.9) return "used";
  return "verify";
}
function rotateFeedAt(refreshTimestamp) {
  if (!pool.length || !feed.length) return;
  const rotateCount = Math.min(randIntBetween(1, 2), feed.length);
  const current = new Set(feed.map(x => x.code));
  const incoming = shuffle(pool.filter(x => !current.has(x.code))).slice(0, rotateCount);
  if (!incoming.length) return;

  // 淘汰最旧记录，只给新进入的编码写入新的创建时间。
  feed.sort((a, b) => a.createdAt - b.createdAt);
  feed.splice(0, incoming.length);
  for (const source of incoming) {
    feed.push({code:source.code, status:randomStatus(), createdAt:refreshTimestamp});
  }
  feed = shuffle(feed);
}
function saveFeedState() {
  try {
    localStorage.setItem(FEED_STATE_KEY, JSON.stringify({feed, displayCount, lastRefreshAt}));
  } catch (error) {
    console.warn("无法保存邀请码列表状态", error);
  }
}
function restoreFeedState() {
  try {
    const saved = JSON.parse(localStorage.getItem(FEED_STATE_KEY) || "null");
    if (!saved || !Array.isArray(saved.feed) ||
        !Number.isFinite(saved.lastRefreshAt) ||
        saved.feed.length < 50 || saved.feed.length > 120) return false;

    const validPool = new Set(pool.map(x => x.code));
    const restored = saved.feed.filter(x =>
      validPool.has(x.code) &&
      Number.isFinite(x.createdAt) &&
      ["available", "used", "verify"].includes(x.status)
    );
    if (restored.length !== saved.feed.length) return false;

    feed = restored;
    displayCount = feed.length;
    lastRefreshAt = saved.lastRefreshAt;
    return true;
  } catch {
    return false;
  }
}
function catchUpRefreshes() {
  const now = Date.now();
  let nextTick = lastRefreshAt + REFRESH_INTERVAL_MS;
  let changed = false;

  // 页面离开期间错过的刷新按原时间戳补齐，不重新生成整份列表。
  while (nextTick <= now) {
    rotateFeedAt(nextTick);
    lastRefreshAt = nextTick;
    nextTick += REFRESH_INTERVAL_MS;
    changed = true;
  }
  if (changed) saveFeedState();

  renderLastUpdated();
  renderStats();
  renderList();
}
function effectiveStatus(item, tried) {
  return tried.has(item.code) ? "tried" : item.status;
}
function renderStats() {
  const tried = getTriedCodes();
  $("totalCount").textContent = feed.length;
  $("availableCount").textContent = feed.filter(x => x.status === "available").length;
  $("usedCount").textContent = feed.filter(x => x.status === "used").length;
  $("recentCount").textContent = feed.filter(x => Date.now() - x.createdAt < 10 * 60000).length;
}
function renderList() {
  const keyword = $("searchInput").value.trim().toUpperCase();
  const filter = $("filterSelect").value;
  const sort = $("sortSelect").value;
  const tried = getTriedCodes();
  let rows = feed.map(item => ({...item, displayStatus:effectiveStatus(item,tried)}));
  if (keyword) rows = rows.filter(x => x.code.includes(keyword));
  if (filter !== "all") rows = rows.filter(x => x.displayStatus === filter);
  rows.sort((a,b) => sort === "oldest" ? a.createdAt - b.createdAt : b.createdAt - a.createdAt);

  $("codeList").innerHTML = rows.length ? rows.map(item => `
    <div class="code-row ${escapeHtml(item.displayStatus)}">
      <span class="time">${escapeHtml(relativeTime(item.createdAt))}</span>
      <span class="code">${escapeHtml(item.code)}</span>
      <span class="status ${escapeHtml(item.displayStatus)}">${statusNames[item.displayStatus] || "未知"}</span>
      <span class="ops">
        <button data-action="copy" data-code="${escapeHtml(item.code)}">复制</button>
        <button data-action="tried" data-code="${escapeHtml(item.code)}">我试过</button>
      </span>
    </div>`).join("") : '<div class="empty">没有找到匹配的邀请码</div>';
}
function renderLastUpdated() {
  const timestamp = lastRefreshAt || Date.now();
  $("lastUpdated").textContent = new Date(timestamp).toLocaleString("zh-CN", {
    year:"numeric", month:"2-digit", day:"2-digit",
    hour:"2-digit", minute:"2-digit", second:"2-digit",
    hour12:false
  });
}
async function loadPool() {
  const response = await fetch(`${DATA_URL}?v=1`, {cache:"force-cache"});
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  pool = Array.isArray(payload.codes) ? payload.codes.filter(x => /^[A-Z0-9]{6}$/.test(x.code)) : [];
  if (pool.length < 120) throw new Error("码库不足120条");

  if (!restoreFeedState()) assignInitialFeed();
  else catchUpRefreshes();
  updateCountdown();
}
function refreshFeed() {
  const scheduledTimestamp = lastRefreshAt + REFRESH_INTERVAL_MS;
  if (scheduledTimestamp > Date.now()) return;
  rotateFeedAt(scheduledTimestamp);
  lastRefreshAt = scheduledTimestamp;
  saveFeedState();
  renderLastUpdated();
  renderStats();
  renderList();
  updateCountdown();
}
function updateCountdown() {
  const nextAt = lastRefreshAt + REFRESH_INTERVAL_MS;
  const remaining = Math.max(0, Math.ceil((nextAt - Date.now()) / 1000));
  countdown = remaining;
  $("countdown").textContent = remaining;
}
function addManualCode() {
  const code = $("manualCode").value.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code) || !/[A-Z]/.test(code) || !/[0-9]/.test(code)) {
    showToast("格式不正确：需要6位且同时包含字母和数字");
    return;
  }
  if (feed.some(x => x.code === code) || pool.some(x => x.code === code)) {
    showToast("这个编码已经在码库中");
    return;
  }
  feed.push({code,status:"verify",createdAt:Date.now()});
  displayCount = feed.length;
  assignStatuses(feed);
  saveFeedState();
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
      showToast("已复制：" + code);
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
$("manualCode").addEventListener("keydown", e => { if (e.key === "Enter") addManualCode(); });
$("searchInput").addEventListener("input", renderList);
$("sortSelect").addEventListener("change", renderList);
$("filterSelect").addEventListener("change", renderList);
$("refreshBtn").addEventListener("click", () => {
  if (Date.now() < lastRefreshAt + REFRESH_INTERVAL_MS) {
    showToast("下一次自动刷新还未到时间");
    return;
  }
  refreshFeed();
  showToast("码库已按时间戳刷新");
});

loadPool().catch(error => {
  $("codeList").innerHTML = '<div class="empty">码库加载失败，请检查 data/codes.json</div>';
  showToast(error.message);
});
setInterval(() => {
  if (!lastRefreshAt) return;
  if (Date.now() >= lastRefreshAt + REFRESH_INTERVAL_MS) {
    refreshFeed();
  } else {
    updateCountdown();
    renderStats();
    renderList();
  }
}, 1000);
