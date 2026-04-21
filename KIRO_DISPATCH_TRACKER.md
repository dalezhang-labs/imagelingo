# Kiro CLI 任务追踪功能 — sp-dashboard 集成方案

> 目标：在 sp-dashboard 中新增一个页面，展示所有小何派发给 kiro-cli 的开发任务及其进度。

## 架构设计

```
小何 (Hermes)
  │
  ├─ dispatch-to-kiro skill 派活
  │     │
  │     ▼
  │  kiro-log (本地 CLI)
  │     │
  │     ├─ 1. 启动 kiro-cli 后台进程
  │     ├─ 2. 写入 Neon DB (core.kiro_dispatches)  ← 新增
  │     └─ 3. 写入本地 JSONL (备份)
  │
  ▼
kiro-cli (本地运行)
  │
  ├─ 执行开发任务...
  ├─ 输出日志到 /tmp/kiro-*.log
  └─ 完成后输出 HERMES-REPORT
        │
        ▼
kiro-sync (本地守护脚本，每 30s 轮询)  ← 新增
  │
  ├─ 检查进程是否还在运行 (ps)
  ├─ 解析日志尾部获取当前动作
  ├─ 检测 HERMES-REPORT 完成标志
  └─ 更新 Neon DB 状态
        │
        ▼
sp-dashboard (Next.js Web UI)
  │
  ├─ GET /api/kiro/dispatches     ← 新增 API
  ├─ GET /api/kiro/dispatches/[id] ← 新增 API
  └─ /kiro 页面                    ← 新增页面
```

## 数据库设计

### 新表：`core.kiro_dispatches`

```sql
CREATE TABLE core.kiro_dispatches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- 任务基本信息
  project TEXT NOT NULL,              -- 项目名 (如 "imagelingo")
  agent TEXT NOT NULL,                -- "hermes-task" 或 "hermes-dev"
  summary TEXT NOT NULL,              -- 一句话任务摘要
  task_description TEXT,              -- 完整任务描述（小何写的任务书）
  
  -- 运行信息
  pid INTEGER,                        -- kiro-cli 进程 PID
  log_file TEXT,                      -- 日志文件路径
  
  -- 状态
  status TEXT NOT NULL DEFAULT 'running',  -- running | completed | failed | blocked | exited
  report_status TEXT,                 -- HERMES-REPORT 里的 STATUS (DONE/PARTIAL/BLOCKED)
  current_action TEXT,                -- 当前正在做什么（从日志解析）
  
  -- 结果
  report_summary TEXT,                -- HERMES-REPORT 的 SUMMARY
  report_completed TEXT[],            -- COMPLETED 列表
  report_blockers TEXT[],             -- BLOCKERS 列表
  report_warnings TEXT[],             -- WARNINGS 列表
  report_next_steps TEXT[],           -- NEXT_STEPS 列表
  
  -- 关联
  project_id UUID REFERENCES core.projects(id) ON DELETE SET NULL,  -- 关联到 sp-dashboard 项目
  pr_url TEXT,                        -- GitHub PR 链接（从报告提取）
  
  -- 时间
  dispatched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,           -- kiro-sync 最后更新时间
  
  -- 元数据
  credits_used DECIMAL,               -- Kiro CLI 消耗的 credits
  duration_seconds INTEGER            -- 执行时长
);
```

## 需要开发的组件

### 1. 升级 kiro-log CLI（本地）

改造现有的 `~/.local/bin/kiro-log`：
- 派活时同时写 Neon DB 和本地 JSONL
- 用 Python + psycopg2（或直接用 neon serverless HTTP API）写入
- 需要 DATABASE_URL 环境变量

### 2. 新增 kiro-sync 守护脚本（本地）

`~/.local/bin/kiro-sync`：
- 每 30 秒轮询一次
- 检查所有 status=running 的任务：
  - 进程还在？→ 解析日志尾部，更新 current_action
  - 进程退出 + 有 REPORT？→ 解析完整报告，更新所有 report_* 字段，status=completed
  - 进程退出 + 无 REPORT？→ status=exited
- 用 launchd 或 cron 保持常驻

### 3. sp-dashboard API（2 个新路由）

`app/api/kiro/dispatches/route.ts`：
- GET：返回所有 dispatches，支持 ?status=running 过滤
- POST：创建新 dispatch（kiro-log 调用）

`app/api/kiro/dispatches/[id]/route.ts`：
- GET：返回单个 dispatch 详情（含完整报告）
- PATCH：更新状态（kiro-sync 调用）

### 4. sp-dashboard 前端页面

`app/kiro/page.tsx`：
- 顶部：运行中的任务卡片（绿色脉冲动画，显示 current_action）
- 中间：任务历史列表（表格，可按项目/状态筛选）
- 点击任务：展开显示完整 HERMES-REPORT
- 自动刷新：运行中的任务每 10s 轮询一次

### 5. Drizzle Schema 更新

在 `lib/schema.ts` 中新增 `kiroDispatches` 表定义。

## 数据通道：调 Vercel 线上 API

本地脚本通过 Vercel 上部署的 sp-dashboard API 读写 Neon DB：

```
kiro-log (本地)  ──POST──▶  https://sp-dashboard.vercel.app/api/kiro/dispatches
kiro-sync (本地) ──PATCH──▶  https://sp-dashboard.vercel.app/api/kiro/dispatches/[id]
Dale (手机/电脑) ──GET────▶  https://sp-dashboard.vercel.app/kiro
```

优势：
- 不依赖本地 dev server 运行
- 手机随时查看进度
- 小何也能直接调 API 查进度

### API 认证

所有 `/api/kiro/*` 接口需要 Bearer Token：
```
Authorization: Bearer <KIRO_API_KEY>
```

- Vercel 环境变量：`KIRO_API_KEY=<随机生成的 token>`
- 本地脚本：从 `~/.shared-ai-memory/.env` 读取同一个 key
- GET 和 POST/PATCH 都需要认证（防止外人读写）

### Vercel Deployment Protection

当前 sp-dashboard 开启了 Vercel Deployment Protection（访问需要登录）。
`/api/kiro/*` 路由需要绕过这个保护，否则本地脚本无法调用。

解决方案：在项目根目录创建 `vercel.json`，给 API 路由设置 `protection: { bypass: true }`：
```json
{
  "headers": [
    {
      "source": "/api/kiro/(.*)",
      "headers": [{ "key": "x-vercel-protection-bypass", "value": "true" }]
    }
  ]
}
```
或者在 Vercel Dashboard → Settings → Deployment Protection 中添加 Protection Bypass for Automation，获取一个 bypass secret，本地脚本请求时带上 `x-vercel-protection-bypass: <secret>` header。

**推荐后者**（Bypass Secret），更安全。

### 本地环境变量

`~/.shared-ai-memory/.env`：
```
SP_DASHBOARD_URL=https://sp-dashboard.vercel.app
KIRO_API_KEY=<与 Vercel 环境变量一致>
```

### Fallback

如果 Vercel API 不可达（断网），kiro-log 和 kiro-sync fallback 到本地 JSONL（`~/.shared-ai-memory/kiro-tasks/tasks.jsonl`），联网后自动同步。

## 验收标准

1. 小何派活后，Vercel 上的 `/kiro` 页面立刻能看到新任务（status=running）
2. 任务运行中，current_action 每 30s 更新一次
3. 任务完成后，页面显示完整 HERMES-REPORT
4. 历史任务可按项目和状态筛选
5. 手机浏览器打开 sp-dashboard URL 也能正常查看
6. 断网时 fallback 到本地 JSONL，联网后自动同步
7. kiro-watch CLI 继续可用（优先读 API，fallback 读本地）
8. API 写入接口有 Bearer Token 认证
