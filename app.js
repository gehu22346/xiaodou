const DATA_URL = "./data/codes.json";
const REFRESH_SECONDS = 20;
const DISPLAY_COUNT = 117;
const TRIED_KEY = "xiaodou-tried-codes-v3";
const $ = id => document.getElementById(id);

const statusNames = {
  available: "可能可用",
  used: "已使用",
  verify: "待确认",
  tried: "我试过"
};

let pool = [];
let feed = [];
let countdown = REFRESH_SECONDS;
let toastTimer;
let rotation = 0;

// 初始时间分布：刚刚12条、5~10分钟20条，合计32条10分钟内新码。
const AGE_BUCKETS = [
  {count:12, min:0, max:4.9},
  {count:20, min:5, max:9.9},
  {count:20, min:10, max:29.9},
  {count:20, min:30, max:59.9},
  {count:15, min:60, max:119.9},
  {count:15, min:120, max:179.9},
  {count:15, min:180, max:239.9}
];

function randInt(max) {
  if (max <= 0) return 0;
  if (window.crypto && crypto.getRandomValues) {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] % max;
  }
  return Math.floor(Math.random() * max);
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
  if (minutes < 5) return "刚刚";
  if (minutes < 10) return "5~10分钟前";
  if (minutes < 30) return "10~30分钟前";
  if (minutes < 60) return "30~60分钟前";
  if (minutes < 120) return "1小时前";
  if (minutes < 180) return "2小时前";
  if (minutes < 240) return "3小时前";
  return "3小时前";
}
function assignInitialFeed() {
  const shuffled = shuffle(pool);
  let cursor = 0;
  const now = Date.now();
  feed = [];
  for (const bucket of AGE_BUCKETS) {
    for (let i = 0; i < bucket.count; i++) {
      const source = shuffled[cursor++];
      const ageMinutes = bucket.min + Math.random() * (bucket.max - bucket.min);
      feed.push({
        code: source.code,
        status: "available",
        createdAt: now - ageMinutes * 60000
      });
    }
  }
  // 首屏统计固定为117条：95条可能可用、22条已使用；状态位置随机打散。
  const statusOrder = shuffle(Array.from({length: DISPLAY_COUNT}, (_, i) => i));
  statusOrder.slice(95).forEach(index => { feed[index].status = "used"; });
  feed = shuffle(feed);
}
function rotateFeed() {
  if (!pool.length || !feed.length) return;
  // 每轮仅替换少量记录，避免整个列表突然跳变；按随机索引从1000条码库循环取码。
  const rotateCount = 1 + randInt(3); // 每20秒替换1~3条
  const current = new Set(feed.map(x => x.code));
  const candidates = shuffle(pool.filter(x => !current.has(x.code)));
  const incoming = candidates.slice(0, rotateCount);
  if (!incoming.length) return;

  // 优先淘汰时间最久的记录，列表自然向前滚动。
  feed.sort((a,b) => a.createdAt - b.createdAt);
  for (let i = 0; i < incoming.length; i++) {
    const next = incoming[i];
    feed[i] = {
      code: next.code,
      status: Math.random() < (95 / 117) ? "available" : "used",
      createdAt: Date.now() - randInt(45000)
    };
  }
  feed = shuffle(feed);
  rotation += incoming.length;
}
function effectiveStatus(item, tried) {
  return tried.has(item.code) ? "tried" : item.status;
}
function renderStats() {
  const tried = getTriedCodes();
  $("totalCount").textContent = feed.length;
  $("availableCount").textContent = feed.filter(x => effectiveStatus(x,tried) === "available").length;
  $("usedCount").textContent = feed.filter(x => effectiveStatus(x,tried) === "used").length;
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
  $("lastUpdated").textContent = "刚刚 · " + new Date().toLocaleTimeString("zh-CN", {hour12:false});
}
async function loadPool() {
  const response = await fetch(`${DATA_URL}?v=${Date.now()}`, {cache:"no-store"});
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = await response.json();
  pool = Array.isArray(payload.codes) ? payload.codes.filter(x => /^[A-Z0-9]{6}$/.test(x.code)) : [];
  if (pool.length < DISPLAY_COUNT) throw new Error("码库不足117条");
  assignInitialFeed();
  renderLastUpdated();
  renderStats();
  renderList();
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
  feed.unshift({code,status:"verify",createdAt:Date.now()});
  feed = feed.slice(0, DISPLAY_COUNT);
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
