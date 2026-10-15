# Sales Ops War Room

Q3 销售复盘可交互作战室 · **模拟演示数据（MOCK / DEMO ONLY）** · Vite + 原生 TypeScript + Chart.js

> ⚠️ 本页面数据为**模拟演示数据**，客户名称已全部匿名化（如 `客户-华北A1`），
> **不含任何真实手机号 / 邮箱 / 身份证 / 合同编号**。原始敏感数据（`_raw_data/`）**不提交到 GitHub**。

## GitHub Pages URL

部署后访问：`https://vbk-ai-agent-gateway.github.io/sales-ops-war-room-<随机6位>/`

（准确链接以仓库 README 与 Pages API 返回的 `html_url` 为准；push 后 `curl .../pages` 确认 `status=built` 再给链接。）

## 仓库 URL

`https://github.com/VBK-AI-Agent-Gateway/sales-ops-war-room-<随机6位>`

## 本地启动

```bash
npm install          # 安装依赖（vite + typescript + chart.js）
npm run dev          # 开发服务器 http://localhost:5173
npm run build        # 类型检查 + 构建到 dist/（含 tsc --noEmit）
npm run preview      # 预览构建产物
```

重新生成模拟数据 / 指标：

```bash
python3 tools/prepare.py   # 生成脱敏模拟 CSV(写入 /ws/_raw_data，不入库) + public/data.json
```

## GitHub Pages 子路径处理（避免 JS/CSS 404）

- `vite.config.ts` 设置 **`base: "./"`** —— 让打包后的 JS/CSS 资源、`data.json`、`version.json`
  都按**相对路径**解析，无论部署在仓库根还是子路径都不会 404。
- `main.ts` 里用 `new URL("data.json", import.meta.url)` / `new URL("version.json", import.meta.url)`
  按**模块相对路径**请求数据，天然适配 Pages 子路径。

## version.json（commit SHA + build time）

由 GitHub Actions 在构建时写入 `public/version.json`：

```json
{ "commit": "$GITHUB_SHA", "buildTime": "2025-09-25T00:00:00Z" }
```

前端 `loadVersion()` 读取并在页头展示 `commit <sha前7位> · build <时间>`；本地开发时占位 `unknown/local-dev`。

## 功能

- 顶部 **KPI 卡**：季度目标 / 已签约 / 加权管道 / 预测达成率 / 缺口 / 平均销售周期
- **漏斗**：各阶段数量、金额、向下一阶段转化率（自定义条形漏斗）
- **销售排名**：Chart.js 堆叠柱（已签约 + 加权管道）+ 达成率折线 + 代表明细表
- **风险商机表**：高金额低概率 / 超 30 天未联系 / 临近关单缺下一步 / 回款逾期 / 续约风险
- **行动清单**：按优先级（高/中/低）列出动作、负责人、截止日期、原因
- **搜索 / 等级筛选 / 表头排序 / 导出 CSV**
- **暗色 / 亮色模式**（localStorage 持久化）
- **移动端可用**（1080 / 720 / 420 三档响应式断点）
- **请求失败不白屏**：`data.json` / `version.json` 加载失败时显示错误条，页面其余部分仍可操作
- 顶部 `version.json` 展示 **commit SHA + build time**

## 目录结构

```
sales-ops-war-room-xxxxxx/
├── .github/workflows/deploy.yml   # Actions: npm ci + 注入 version.json + build + 部署 Pages
├── public/
│   ├── data.json                  # 脱敏后的模拟演示数据（指标产物）
│   └── version.json               # commit SHA + build time（CI 注入）
├── src/
│   ├── main.ts                    # 渲染 KPI/漏斗/排名/风险/行动 + 搜索筛选导出 + 主题 + 错误兜底
│   └── style.css                  # 原生 CSS，暗/亮双主题 + 三档响应式
├── tools/prepare.py               # 生成脱敏模拟 CSV + 计算指标输出 data.json
├── index.html
├── package.json
├── vite.config.ts                 # base: "./" 处理 Pages 子路径
├── tsconfig.json
├── .gitignore                     # 排除 node_modules/dist/.env/_raw_data
└── README.md
```

## 安全与合规

- `.gitignore` 排除 `node_modules/`、`dist/`、`.env*`、`_raw_data/`（原始敏感数据不入库）
- 公开页面数据**已脱敏**：无手机号、邮箱、身份证、合同编号
- 不打印、不提交、不泄露 `GITHUB_TOKEN` / 任何 secret（认证走 `credential.helper` 读 `/ws/.secrets/github_pat`，配置里只有 `cat` 命令）
- 不提交 `node_modules` / `dist` / `.env`