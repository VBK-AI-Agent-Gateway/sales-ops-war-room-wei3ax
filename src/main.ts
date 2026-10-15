import "./style.css";
import {
  Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip,
  LineController, LineElement, PointElement, Filler, Legend,
} from "chart.js";

/* 注册 Chart.js 组件（手动 tree-shake 注册，避免全量引入） */
Chart.register(
  BarController, BarElement, CategoryScale, LinearScale, Tooltip,
  LineController, LineElement, PointElement, Filler, Legend,
);

/* ------------------------------------------------------------------ *
 *  Sales Ops War Room
 *  - 读取 ./data.json（脱敏模拟演示数据）与 ./version.json（commit+build time）
 *  - KPI 卡 / 漏斗 / 排名 / 风险表 / 行动清单
 *  - 搜索、筛选、导出 CSV、暗亮主题、移动端、失败不白屏
 * ------------------------------------------------------------------ */

type Meta = { title: string; period: string; asOf: string; dataFlag: string; disclaimer: string; generatedAt: string };
type Kpi = {
  quarterTarget: number; signedAmount: number; weightedPipeline: number;
  forecastAttainment: number; gap: number; avgSalesCycleDays: number;
  openOpps: number; overdueNoContact: number;
};
type Rep = { rep: string; region: string; target: number; signed: number; weighted_pipe: number; forecast: number; attain: number };
type Funnel = { stage: string; count: number; amount: number; conv: number | null };
type Risk = { type: string; level: string; opp_id: string; account: string; rep: string; amount: number; stage: string; prob: number | null; detail: string };
type Action = { priority: string; type: string; action: string; owner: string; account: string; opp_id: string; due: string; reason: string; amount: number };
type Overdue = { opp_id: string; account: string; rep: string; stage: string; amount: number; days: number };
type Data = { meta: Meta; kpi: Kpi; reps: Rep[]; funnel: Funnel[]; risks: Risk[]; actions: Action[]; overdue: Overdue[] };
type Version = { commit?: string; sha?: string; buildTime?: string; builtAt?: string };

let DATA: Data | null = null;
let VERSION: Version = {};
let query = "";
let levelFilter = "全部";
let sortKey: keyof Risk = "amount";
let sortDir: -1 | 1 = -1;
const charts: Chart[] = [];

/* ---------------- utils ---------------- */
const $ = (sel: string): HTMLElement => {
  const el = document.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`missing element: ${sel}`);
  return el;
};
const fmtMoney = (n: number): string => {
  if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(2) + " 亿";
  if (Math.abs(n) >= 1e4) return (n / 1e4).toFixed(1) + " 万";
  return n.toLocaleString("zh-CN");
};
const fmtPct = (x: number): string => (x * 100).toFixed(1) + "%";
const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

function showBootError(msg: string): void {
  const box = document.getElementById("boot-error");
  if (box) { box.hidden = false; box.textContent = "⚠ 加载失败：" + msg; }
}
function inlineBanner(msg: string | null): void {
  const b = document.getElementById("data-error");
  if (!b) return;
  if (msg) { b.hidden = false; b.textContent = "⚠ " + msg; }
  else b.hidden = true;
}

/* ---------------- version.json (相对路径, 避免子路径 404) ------------ */
async function loadVersion(): Promise<void> {
  try {
    const url = new URL("version.json", import.meta.url).href;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    VERSION = (await res.json()) as Version;
    const commit = VERSION.commit ?? VERSION.sha ?? "unknown";
    const bt = VERSION.buildTime ?? VERSION.builtAt ?? "unknown";
    const el = document.getElementById("version-line");
    if (el) el.innerHTML = `commit <b>${esc(commit.slice(0, 7))}</b> · build <b>${esc(bt)}</b>`;
  } catch (e) {
    const el = document.getElementById("version-line");
    if (el) el.textContent = "version.json 读取失败（" + (e instanceof Error ? e.message : String(e)) + "）";
  }
}

/* ---------------- render: header/meta ---------------- */
function renderMeta(): void {
  if (!DATA) return;
  const m = DATA.meta;
  const flag = document.getElementById("data-flag");
  if (flag) flag.textContent = m.dataFlag;
  const meta = document.getElementById("meta-line");
  if (meta) meta.innerHTML = `周期 <b>${esc(m.period)}</b> · 数据基准日 <b>${esc(m.asOf)}</b> · ${esc(m.disclaimer)}`;
}

/* ---------------- render: KPI ---------------- */
function renderKpi(): void {
  const k = DATA!.kpi;
  const cards: Array<[string, string, string, string]> = [
    ["季度目标", fmtMoney(k.quarterTarget), `Q3 目标`, ""],
    ["已签约金额", fmtMoney(k.signedAmount), `覆盖 ${fmtPct(k.signedAmount / k.quarterTarget)}`, k.signedAmount >= k.quarterTarget * 0.6 ? "good" : "warn"],
    ["加权管道", fmtMoney(k.weightedPipeline), `${k.openOpps} 个进行中商机`, ""],
    ["预测达成率", fmtPct(k.forecastAttainment), `预测 ${fmtMoney(k.signedAmount + k.weightedPipeline)}`, k.forecastAttainment >= 1 ? "good" : "bad"],
    ["目标缺口", fmtMoney(k.gap), k.gap > 0 ? "需补差" : "已达标", k.gap > 0 ? "bad" : "good"],
    ["平均销售周期", k.avgSalesCycleDays + " 天", `超期未跟进 ${k.overdueNoContact}`, ""],
  ];
  const box = document.getElementById("kpis");
  if (!box) return;
  box.innerHTML = cards.map(([lb, v, s, cls]) =>
    `<div class="kpi ${cls}"><div class="k-lb">${lb}</div><div class="k-v">${v}</div><div class="k-s">${s}</div></div>`).join("");
}

/* ---------------- render: funnel (custom bars) ---------------- */
function renderFunnel(): void {
  const box = document.getElementById("funnel");
  if (!box || !DATA) return;
  const max = Math.max(...DATA.funnel.map((f) => f.amount), 1);
  box.innerHTML = DATA.funnel.map((f) => {
    const w = Math.max(4, (f.amount / max) * 100);
    const conv = f.conv == null ? "—" : "↓" + fmtPct(f.conv);
    return `<div class="fstage">
      <div class="fs-name">${esc(f.stage)}</div>
      <div class="fs-bar" style="width:${w}%"><span>${f.count} 个 · ${fmtMoney(f.amount)}</span></div>
      <div class="fs-meta">转化 ${conv}</div>
    </div>`;
  }).join("");
}

/* ---------------- render: rep ranking (Chart.js bar) ---------------- */
function renderRankChart(): void {
  const reps = DATA!.reps;
  const canvas = document.getElementById("rankChart") as HTMLCanvasElement | null;
  if (!canvas) return;
  const cs = getComputedStyle(document.documentElement);
  const grid = cs.getPropertyValue("--line").trim() || "#333";
  const muted = cs.getPropertyValue("--muted").trim() || "#999";
  charts.push(new Chart(canvas, {
    type: "bar",
    data: {
      labels: reps.map((r) => `${r.rep}·${r.region}`),
      datasets: [
        { label: "已签约", data: reps.map((r) => r.signed), backgroundColor: "#4f8cff", borderRadius: 5, stack: "s" },
        { label: "加权管道", data: reps.map((r) => r.weighted_pipe), backgroundColor: "#22d3ee", borderRadius: 5, stack: "s" },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: muted } } },
      scales: {
        x: { stacked: true, ticks: { color: muted }, grid: { color: grid } },
        y: { stacked: true, ticks: { color: muted, callback: (v) => fmtMoney(Number(v)) }, grid: { color: grid } },
      },
    },
  }));
}

/* ---------------- render: attainment line ---------------- */
function renderAttainChart(): void {
  const reps = DATA!.reps;
  const canvas = document.getElementById("attainChart") as HTMLCanvasElement | null;
  if (!canvas) return;
  const cs = getComputedStyle(document.documentElement);
  const grid = cs.getPropertyValue("--line").trim() || "#333";
  const muted = cs.getPropertyValue("--muted").trim() || "#999";
  charts.push(new Chart(canvas, {
    type: "line",
    data: {
      labels: reps.map((r) => `${r.rep}·${r.region}`),
      datasets: [{
        label: "预测达成率", data: reps.map((r) => r.attain),
        borderColor: "#2ee6a6", backgroundColor: "rgba(46,230,166,.16)",
        fill: true, tension: .35, pointRadius: 4,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: muted } } },
      scales: {
        x: { ticks: { color: muted }, grid: { color: grid } },
        y: { ticks: { color: muted, callback: (v) => fmtPct(Number(v)) }, grid: { color: grid }, suggestedMax: 1.4 },
      },
    },
  }));
}

/* ---------------- render: rep table ---------------- */
function renderRepTable(): void {
  const tb = document.getElementById("rep-tbody");
  if (!tb || !DATA) return;
  tb.innerHTML = DATA.reps.map((r) => {
    const pct = Math.min(100, Math.round(r.attain * 100));
    const cls = r.attain >= 1 ? "tag 低" : r.attain >= 0.7 ? "tag 中" : "tag 高";
    return `<tr>
      <td><b>${esc(r.rep)}</b></td><td>${esc(r.region)}</td>
      <td class="num">${fmtMoney(r.target)}</td>
      <td class="num">${fmtMoney(r.signed)}</td>
      <td class="num">${fmtMoney(r.weighted_pipe)}</td>
      <td class="num">${fmtMoney(r.forecast)}</td>
      <td><div style="display:flex;gap:8px;align-items:center"><div class="bar" style="flex:1"><i style="width:${pct}%"></i></div><span class="${cls}">${fmtPct(r.attain)}</span></div></td>
    </tr>`;
  }).join("");
}

/* ---------------- render: risk table (search/filter/sort/export) ------- */
function filteredRisks(): Risk[] {
  if (!DATA) return [];
  const q = query.trim().toLowerCase();
  return DATA.risks.filter((r) => {
    if (levelFilter !== "全部" && r.level !== levelFilter) return false;
    if (!q) return true;
    return [r.account, r.rep, r.stage, r.type, r.opp_id, r.detail]
      .join(" ").toLowerCase().includes(q);
  }).sort((a, b) => {
    const av = a[sortKey] as number | string | null;
    const bv = b[sortKey] as number | string | null;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * sortDir;
    return String(av ?? "").localeCompare(String(bv ?? "")) * sortDir;
  });
}
function renderRisks(): void {
  const tb = document.getElementById("risk-tbody");
  const cnt = document.getElementById("risk-count");
  if (!tb) return;
  const rows = filteredRisks();
  if (cnt) cnt.textContent = `${rows.length} 条 / 共 ${DATA ? DATA.risks.length : 0} 条`;
  if (rows.length === 0) { tb.innerHTML = `<tr><td colspan="7" class="empty">没有符合条件的风险商机</td></tr>`; return; }
  tb.innerHTML = rows.map((r) => `<tr>
    <td><span class="tag ${esc(r.level)}">${esc(r.level)}</span></td>
    <td>${esc(r.type)}</td>
    <td>${esc(r.account)}</td><td>${esc(r.rep)}</td><td>${esc(r.stage)}</td>
    <td class="num">${fmtMoney(r.amount)}</td>
    <td>${esc(r.detail)}</td>
  </tr>`).join("");
}
function exportRisksCSV(): void {
  const rows = filteredRisks();
  const header = ["等级", "类型", "客户", "负责人", "阶段", "金额", "说明"];
  const lines = [header.join(",")].concat(
    rows.map((r) => [r.level, r.type, r.account, r.rep, r.stage, r.amount, r.detail]
      .map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")),
  );
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `sales-risks-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ---------------- render: action list ---------------- */
function renderActions(): void {
  const ul = document.getElementById("action-list");
  if (!ul || !DATA) return;
  if (DATA.actions.length === 0) { ul.innerHTML = `<div class="empty">暂无行动项</div>`; return; }
  ul.innerHTML = DATA.actions.map((a) => `<li class="pri-${esc(a.priority)}">
    <div class="a-top">
      <span class="tag ${esc(a.priority)}">${esc(a.priority)}优先</span>
      <span class="a-act">${esc(a.action)}</span>
    </div>
    <div class="a-meta">
      <span>负责人 <b>${esc(a.owner)}</b></span>
      <span>客户 <b>${esc(a.account)}</b></span>
      <span>截止 <b>${esc(a.due)}</b></span>
      <span>${esc(a.type)}</span>
    </div>
    <div class="a-why">原因：${esc(a.reason)}</div>
  </li>`).join("");
}

/* ---------------- theme ---------------- */
const THEME_KEY = "swr-theme";
function applyTheme(t: "light" | "dark"): void {
  document.documentElement.setAttribute("data-theme", t);
  const btn = document.getElementById("theme-toggle");
  if (btn) btn.textContent = t === "dark" ? "☀️ 亮色" : "🌙 暗色";
  try { localStorage.setItem(THEME_KEY, t); } catch { /* ignore */ }
  // re-render charts with new colors
  if (DATA) { charts.splice(0).forEach((c) => c.destroy()); renderRankChart(); renderAttainChart(); }
}
function initTheme(): void {
  let saved: string | null = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch { /* ignore */ }
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const t: "light" | "dark" = saved === "dark" || saved === "light"
    ? (saved as "light" | "dark") : prefersDark ? "dark" : "light";
  applyTheme(t);
}

/* ---------------- events ---------------- */
function bindEvents(): void {
  document.getElementById("theme-toggle")?.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    applyTheme(cur === "dark" ? "light" : "dark");
  });
  const search = document.getElementById("search") as HTMLInputElement | null;
  search?.addEventListener("input", () => { query = search.value; renderRisks(); });
  const lvl = document.getElementById("level-filter") as HTMLSelectElement | null;
  lvl?.addEventListener("change", () => { levelFilter = lvl.value; renderRisks(); });
  document.getElementById("export-btn")?.addEventListener("click", exportRisksCSV);

  // sortable headers
  document.querySelectorAll<HTMLElement>("#risk-table th[data-key]").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.key as keyof Risk;
      if (sortKey === key) sortDir = sortDir === 1 ? -1 : 1;
      else { sortKey = key; sortDir = -1; }
      document.querySelectorAll("#risk-table th").forEach((x) => x.classList.remove("sorted"));
      th.classList.add("sorted");
      renderRisks();
    });
  });

  document.getElementById("refresh-btn")?.addEventListener("click", () => { void boot(); });
}

/* ---------------- boot ---------------- */
async function boot(): Promise<void> {
  try {
    inlineBanner(null);
    const url = new URL("data.json", import.meta.url).href;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    DATA = (await res.json()) as Data;
    renderMeta();
    renderKpi();
    renderFunnel();
    renderRankChart();
    renderAttainChart();
    renderRepTable();
    renderRisks();
    renderActions();
    const flag = document.getElementById("last-refresh");
    if (flag) flag.textContent = new Date().toISOString();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    showBootError("无法加载 data.json（" + msg + "）。请确认已构建部署且未删除 public/data.json。");
    inlineBanner("数据加载失败：" + msg + " — 页面其余部分仍可操作。");
    renderKpiSafeEmpty();
  }
}
function renderKpiSafeEmpty(): void {
  const box = document.getElementById("kpis");
  if (box && !box.innerHTML) box.innerHTML = `<div class="kpi"><div class="k-lb">数据</div><div class="k-v">—</div><div class="k-s">加载失败</div></div>`;
}

/* guard: 任何顶层异常都显示错误条, 绝不白屏 */
try {
  initTheme();
  bindEvents();
  void loadVersion();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { void boot(); });
  } else {
    void boot();
  }
} catch (e) {
  showBootError("初始化失败：" + (e instanceof Error ? e.message : String(e)));
}