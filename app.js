const DATA_URL = "./data/codes.json";
const REFRESH_SECONDS = 20;
const TRIED_KEY = "xiaodou-tried-codes-v4";
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

// 每个时间段分别抽取数量，避免从4分钟直接跳到47分钟。
function buildAgeMinutes(total) {
  const ages = [];
  const pick = (min, max) => min + Math.random() * (max - min);
  const addBucket = (count, min, max) => {
    for (let i = 0; i < count; i++) ages.push(pick(min, max));
  };

  // 近几分钟数量少而自然：刚刚2~3条，1~4分钟前每档3~4条。
  addBucket(randIntBetween(2, 3), 0.05, 0.85);
  addBucket(randIntBetween(3, 4), 1.02, 1.92);
  addBucket(randIntBetween(3, 4), 2.02, 2.92);
  addBucket(randIntBetween(3, 4), 3.02, 3.92);
  addBucket(randIntBetween(3, 4), 4.02, 4.92);

  // 余量按连续时间段分配，且不会删掉刚刚/1~4分钟前的记录。
  let remaining = total - ages.length;
  const buckets = [
    {minCount:6, maxCount:8, min:5.05, max:9.95},
    {minCount:7, maxCount:10, min:10.05, max:29.95},
    {minCount:7, maxCount:10, min:30.05, max:59.95},
    {minCount:4, maxCount:6, min:60.05, max:119.95},
    {minCount:3, maxCount:5, min:120.05, max:179.95}
  ];

  for (let i = 0; i < buckets.length; i++) {
    const bucket = buckets[i];
    const minForLater = buckets.slice(i + 1).reduce((sum, x) => sum + x.minCount, 0);
    const count = Math.min(
      remaining - minForLater,
      randIntBetween(bucket.minCount, bucket.maxCount)
    );
    const safeCount = Math.max(0, count);
    addBucket(safeCount, bucket.min, bucket.max);
    remaining -= safeCount;
  }

  // 其余分散在3~6小时，时间间隔自然，不集中在同一分钟。
  for (let i = 0; i < remaining; i++) {
    const band = Math.random();
    if (band < 0.55) ages.push(pick(180.05, 239.95));
    else if (band < 0.82) ages.push(pick(240.05, 299.95));
    else ages.push(pick(300.05, 359.95));
  }
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
  const minutes = Math.max(0, (Date.now() - createdAt) / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 2) return "1分钟前";
  if (minutes < 3) return "2分钟前";
  if (minutes < 4) return "3分钟前";
  if (minutes < 5) return "4分钟前";
  if (minutes < 10) return "5~10分钟前";
  if (minutes < 30) return "10~30分钟前";
  if (minutes < 60) return "30~60分钟前";
  if (minutes < 120) return "1小时前";
  if (minutes < 180) return "2小时前";
  if (minutes < 240) return "3小时前";
  return `${Math.floor(minutes / 60)}小时前`;
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
  renderLastUpdated();
  renderStats();
  renderList();
}
function rotateFeed() {
  if (!pool.length || !feed.length) return;

  // 每20秒只替换1~2条，保留大部分记录及其原始时间。
  const rotateCount = Math.min(randIntBetween(1, 2), feed.length);
  const current = new Set(feed.map(x => x.code));
  const candidates = shuffle(pool.filter(x => !current.has(x.code)));
  const incoming = candidates.slice(0, rotateCount);
  if (!incoming.length) return;

  // 移除最旧的记录，新增记录时间为当前时刻。
  feed.sort((a, b) => a.createdAt - b.createdAt);
  feed.splice(0, incoming.length);
  for (const source of incoming) {
    feed.push({
      code: source.code,
      status: "verify",
      createdAt: Date.now() - randInt(12000)
    });
  }
  assignStatuses(feed);
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
  $("lastUpdated").textContent = new Date().toLocaleString("zh-CN", {
    year:"numeric", month:"2-digit", day:"2-digit",
    hour:"2-digit", minute:"2-digit", second:"2-digit",
    hour12:false
  });
}
async function loadPool() {
  const response = await fetch(`${DATA_URL}?v=${Date.now()}`, {cache:"no-store"});
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  pool = Array.isArray(payload.codes) ? payload.codes.filter(x => /^[A-Z0-9]{6}$/.test(x.code)) : [];
  if (pool.length < 120) throw new Error("码库不足120条");
  assignInitialFeed();
}
function refreshFeed() {
  rotateFeed();
  renderLastUpdated();
  renderStats();
  renderList();
  countdown = REFRESH_SECONDS;
  $("countdown").textContent = countdown;
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
  refreshFeed();
  showToast("码库已轮换刷新");
});

loadPool().catch(error => {
  $("codeList").innerHTML = '<div class="empty">码库加载失败，请检查 data/codes.json</div>';
  showToast(error.message);
});
setInterval(() => {
  countdown -= 1;
  if (countdown <= 0) refreshFeed();
  else $("countdown").textContent = countdown;
}, 1000);
