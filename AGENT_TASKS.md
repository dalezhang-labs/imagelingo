# AGENT_TASKS.md — ImageLingo 续接任务包

## 当前状态（2026-04-20）

已完成：
- GitHub repo: https://github.com/dalezhang-labs/imagelingo
- FastAPI 骨架（main.py + routes/auth.py + routes/translate.py + routes/webhook.py）
- Shopline OAuth 认证路由
- Neon 数据库连接层（backend/db/）
- token_store.py（Access Token 持久化）
- 前端脚手架（web/src/ 含 App.tsx, Routes.tsx, pages/, hooks/, components/）

**PLAN.md 中 Week 1 的 Task 1-3 已完成。**

---

## 你的角色

你是执行 agent，负责将以下所有 Phase 完整实现。
- 每完成一个 Phase，执行 `git add -A && git commit -m "feat: <描述>"`
- 遇到错误自行调试，不要停下来询问
- 全部完成后，输出一份完成报告（见末尾格式要求）

参考文档：`PLAN.md`（含完整技术栈、数据库设计、API 规范）

---

## Phase 1 — 检查并补全现有代码

检查以下文件是否完整，缺什么补什么：

### backend/db/connection.py
应包含：
- 使用 `DATABASE_URL` 环境变量连接 Neon
- 创建 asyncpg 或 psycopg2 连接池
- 提供 `get_db()` 依赖函数供 FastAPI 路由使用

### backend/db/models.py
应包含 PLAN.md 中定义的所有 5 张表的 DDL（若 Neon 尚未建表则执行建表）：
- `imagelingo.stores`
- `imagelingo.translation_jobs`
- `imagelingo.translated_images`
- `imagelingo.usage_logs`
- `imagelingo.subscriptions`

### backend/routes/auth.py
应包含完整的 Shopline OAuth 2.0 流程：
- `GET /api/auth/install` — 验签后重定向到 Shopline 授权页
- `GET /api/auth/callback` — 接收 code，换取 access_token，存入 Neon stores 表
- 参考 PLAN.md 中 OAuth 流程说明

### backend/services/token_store.py
应包含：
- `save_token(handle, access_token, expires_at, scopes)`
- `get_token(handle) -> str | None`
- `refresh_token_if_needed(handle)`

git commit: "fix: complete Week 1 scaffolding"

---

## Phase 2 — PaddleOCR 集成

创建 `backend/services/ocr_service.py`：

```python
# 功能：接收图片 URL 或 bytes，返回识别结果
# 返回格式：[{"bbox": [[x1,y1],[x2,y2],[x3,y3],[x4,y4]], "text": "文字", "confidence": 0.99}, ...]

class OCRService:
    def __init__(self): ...
    async def extract_text(self, image_bytes: bytes) -> list[dict]: ...
```

要求：
- 使用 `paddlepaddle` + `paddleocr`（中文识别，`lang='ch'`）
- 在 `requirements.txt` 中添加依赖
- 写一个简单的单元测试文件 `backend/tests/test_ocr.py`，测试用一张包含中文的示例图片

git commit: "feat: PaddleOCR integration"

---

## Phase 3 — DeepL 翻译集成

创建 `backend/services/translate_service.py`：

```python
class TranslateService:
    def __init__(self): ...
    async def translate_texts(self, texts: list[str], target_lang: str) -> list[str]: ...
    # target_lang 格式：'EN-US', 'DE', 'JA', 'KO', 'FR'
```

要求：
- 使用 `deepl` Python SDK
- 从环境变量 `DEEPL_API_KEY` 读取
- 添加到 `requirements.txt`

git commit: "feat: DeepL translation service"

---

## Phase 4 — Lovart API 集成

创建 `backend/services/lovart_service.py`：

```python
class LovartService:
    def __init__(self): ...
    async def render_text_on_image(
        self,
        original_image_bytes: bytes,
        text_regions: list[dict],  # [{"bbox": ..., "text": "translated", "original_text": "原文"}]
    ) -> bytes:  # 返回渲染后的图片 bytes
        ...
```

要求：
- 使用 Lovart API（base URL: `https://api.lovart.ai`，API Key 从 `LOVART_API_KEY` 读取）
- 若 Lovart API 文档不确定，先用 `httpx` 实现，留 TODO 注释标明需要确认的参数
- 添加到 `requirements.txt`

git commit: "feat: Lovart text rendering service"

---

## Phase 5 — Cloudinary 存储集成

创建 `backend/services/cloudinary_service.py`：

```python
class CloudinaryService:
    def __init__(self): ...
    async def upload_image(self, image_bytes: bytes, public_id: str = None) -> str:
        # 返回 Cloudinary URL
        ...
```

要求：
- 使用 `cloudinary` Python SDK
- 从环境变量读取 `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- 图片存储在 `imagelingo/` 文件夹下

git commit: "feat: Cloudinary storage service"

---

## Phase 6 — 翻译主接口打通

实现 `backend/routes/translate.py`：

```python
# POST /api/translate
# Body: {
#   "store_handle": "example",
#   "product_id": "123",
#   "image_url": "https://...",
#   "target_languages": ["EN-US", "DE", "JA"]
# }
# Response: { "job_id": "uuid" }

# GET /api/translate/jobs/{job_id}
# Response: {
#   "status": "pending|processing|done|failed",
#   "results": {"EN-US": "https://cloudinary...", "DE": "..."},
#   "error": null
# }
```

核心流程（参考 PLAN.md 翻译核心流程）：
1. 验证 store token（通过 token_store）
2. 创建 translation_job 记录（status=pending）
3. 后台异步执行：OCR → DeepL → Lovart → Cloudinary → 更新 job 状态
4. 更新 `usage_logs` 表（当月翻译次数 +1）
5. 检查 `subscriptions` 表额度限制（free: 5张/月）

git commit: "feat: translation pipeline - full chain"

---

## Phase 7 — 前端 UI 实现

检查 `web/src/pages/` 目录，实现或补全以下三个页面：

### Dashboard.tsx
- 显示当前月用量（已用 / 总额度）
- 升级计划按钮（暂时只是 UI，不接支付）
- 快速翻译入口按钮 → 跳转 /translate

### Translate.tsx
- 输入框：粘贴图片 URL 或上传图片
- 多选目标语言（EN/DE/JA/KO/FR）
- 点击「翻译」→ 调用 `POST /api/translate`
- 轮询 `GET /api/translate/jobs/{job_id}` 显示进度
- 完成后展示各语言结果图片（并排显示）

### History.tsx
- 列表显示历史翻译任务
- 每条记录：原图缩略图、目标语言、状态、时间
- 点击可查看详细结果

UI 要求：
- 使用 Tailwind CSS + shadcn/ui 组件
- 风格参考：干净、专业、适合 B2B SaaS

git commit: "feat: frontend UI - Dashboard + Translate + History"

---

## Phase 8 — 环境变量 & 部署配置

1. 检查并更新 `.env.example`，确保包含所有必要变量：
```
SHOPLINE_APP_KEY=
SHOPLINE_APP_SECRET=
SHOPLINE_APP_URL=
SHOPLINE_REDIRECT_URI=
DEEPL_API_KEY=
LOVART_API_KEY=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
DATABASE_URL=
```

2. 创建 `backend/railway.json`（Railway 部署配置）：
```json
{
  "build": { "builder": "NIXPACKS" },
  "deploy": {
    "startCommand": "uvicorn backend.main:app --host 0.0.0.0 --port $PORT",
    "healthcheckPath": "/health"
  }
}
```

3. 确认前端 `web/` 目录有 `vercel.json`（如有需要）

4. 最终 git push：
```bash
git add -A && git commit -m "chore: deployment config + env template" && git push origin main
```

---

## 完成报告格式

完成后输出：

```
=== ImageLingo 开发报告 ===

✅ 已完成：
- Phase 1: ...
- Phase 2: ...
...

⚠️ 遇到的问题及处理：
- 问题1: ... → 解法: ...

📋 需要 Dale 手动操作：
1. 在 .env 填写真实 API Keys（DeepL / Lovart / Cloudinary / Shopline）
2. 在 Railway 配置环境变量
3. 在 Vercel 部署前端
4. 确认 Neon DATABASE_URL 已配置

🔗 Git log（最新5条）：
...
```
