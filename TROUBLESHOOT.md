# ImageLingo Troubleshooting Guide

本文档记录了 Shopline 嵌入式 App 开发过程中遇到的主要问题及解决方案。

---

## 1. `shopline` 命令找不到

**现象**：终端执行 `shopline app dev` 报 `zsh: command not found: shopline`

**原因**：`@shoplinedev/cli` 安装在项目的 `devDependencies` 里，不是全局安装，shell 的 PATH 里找不到。

**解决方案**：通过 npm scripts 运行，它会自动把 `node_modules/.bin` 加入 PATH：
```bash
npm run dev          # 等价于 shopline app dev
npx shopline app dev --debug  # 或者用 npx
```

---

## 2. App 页面空白

**现象**：在 Shopline 后台打开 App 显示空白页面。

**原因**：`app/node_modules` 下依赖不完整（只有 `node-fetch`），`express`、`@shoplineos/shopline-app-express` 等核心包缺失，Express 服务器无法启动。

**解决方案**：
```bash
cd app && npm install
```
然后回到项目根目录重新 `npm run dev`。

---

## 3. App 显示的是模板默认页面

**现象**：App 加载成功，但显示 "SHOPLINE 应用 模版" 而不是 ImageLingo 的 Dashboard。

**原因**：`web/src/pages/index.tsx` 是 Shopline 官方模板的默认首页，路由 `/` 匹配到了它，而 Dashboard 在 `/dashboard`。

**解决方案**：用 Dashboard 的内容替换 `web/src/pages/index.tsx`，让 `/` 路由直接渲染 Dashboard。

---

## 4. Translate 请求被 Shopline OAuth 拦截（`undefined.myshopline.com`）

**现象**：点击 Translate 后浏览器跳转到 `https://undefined.myshopline.com/admin/oauth-web/`，返回 302。

**原因**：前端的 `/api/translate/` 请求被 Vite 代理到 Node.js Express，Express 的 `/api/*` 中间件 `shopline.validateAuthentication()` 拦截了所有 API 请求，但 `/api/translate` 路由不存在于 Express 中（它在 Python FastAPI 后端）。认证失败后尝试重定向到 OAuth 页面，但 handle 为 undefined。

**解决方案**：在 Express 中用 `http-proxy-middleware` 将 `/api/translate` 和 `/api/auth` 代理到 Python 后端，且必须放在 `shopline.validateAuthentication()` 之前：

```typescript
// app/src/index.ts
import { createProxyMiddleware } from 'http-proxy-middleware';

const PYTHON_BACKEND = process.env.PYTHON_BACKEND_URL || 'http://127.0.0.1:8000';

// 必须在 Shopline auth 中间件之前
app.use('/api/auth', createProxyMiddleware({
  target: PYTHON_BACKEND,
  changeOrigin: true,
  pathRewrite: function(_path: string, req: any) { return req.originalUrl; },
}));

app.use('/api/translate', createProxyMiddleware({
  target: PYTHON_BACKEND,
  changeOrigin: true,
  pathRewrite: function(_path: string, req: any) { return req.originalUrl; },
}));
```

**关键点**：`http-proxy-middleware` 默认会剥离匹配的路径前缀，必须用 `pathRewrite` 保留完整路径（`req.originalUrl`），否则 Python 后端收到的是 `/install` 而不是 `/api/auth/install`。

---

## 5. Python 后端连不上 Neon 数据库（连接本地 socket）

**现象**：`psycopg2.OperationalError: connection to server on socket "/tmp/.s.PGSQL.5432" failed`

**原因**：两个问题叠加：
1. `backend/main.py` 里 `load_dotenv()` 没指定路径，从项目根目录启动 uvicorn 时找不到 `backend/.env`
2. `backend/db/connection.py` 里 `DATABASE_URL = os.getenv("DATABASE_URL", "")` 在模块导入时就执行了，此时 `.env` 还没加载，所以 `DATABASE_URL` 是空字符串

**解决方案**：

`backend/main.py` — 指定 `.env` 的绝对路径：
```python
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent / ".env")
```

`backend/db/connection.py` — 延迟读取环境变量，在每次连接时才获取：
```python
@contextmanager
def get_connection():
    database_url = os.getenv("DATABASE_URL", "")
    if not database_url:
        raise RuntimeError("DATABASE_URL is not set")
    conn = psycopg2.connect(database_url)
    ...
```

---

## 6. 数据库表不存在（`imagelingo.stores` does not exist）

**现象**：`psycopg2.errors.UndefinedTable: relation "imagelingo.stores" does not exist`

**原因**：Neon 数据库里还没有创建 `imagelingo` schema 和相关表。

**解决方案**：在 Neon 数据库中执行 `backend/db/init_schema.sql` 里的建表 SQL，或运行：
```bash
python -m backend.db.models
```

---

## 7. Shopline OAuth Token 接口返回签名错误

**现象**：`POST /admin/oauth/token/create` 返回 `{"code": 500, "i18nCode": "RequestSignIsEmpty"}`

**原因**：Shopline 的 token 创建 API 要求请求头带签名，不能只传 JSON body。

**Shopline POST 请求签名规则**：
- `source = request_body_string + timestamp`
- `sign = HMAC-SHA256(source, app_secret)`
- 请求头必须包含：`appkey`、`timestamp`、`sign`、`Content-Type: application/json`

**解决方案**：
```python
import json, time, hmac, hashlib

body = {"code": code}
body_str = json.dumps(body, separators=(",", ":"))
timestamp = str(int(time.time() * 1000))
source = body_str + timestamp
sign = hmac.new(app_secret.encode(), source.encode(), hashlib.sha256).hexdigest()

headers = {
    "Content-Type": "application/json",
    "appkey": app_key,
    "timestamp": timestamp,
    "sign": sign,
}
# 注意：发送时用 content=body_str 而不是 json=body，确保 body 字符串和签名一致
resp = await client.post(token_url, content=body_str, headers=headers)
```

**注意**：GET 请求和 POST 请求的签名方式不同：
- GET：`source = 按字母排序的 query params`（如 `appkey=xxx&timestamp=xxx`）
- POST：`source = body_string + timestamp`

---

## 8. Token 响应解析失败（`access_token` 为 null）

**现象**：`NotNullViolation: null value in column "access_token"`

**原因**：Shopline 的 token 响应结构是嵌套的，token 在 `data.accessToken` 里，不是顶层字段：
```json
{
  "code": 200,
  "data": {
    "accessToken": "eyJ...",
    "expireTime": "2026-04-21T06:17:04.172+00:00",
    "refreshToken": "...",
    "scope": "read_products,write_products"
  }
}
```

**解决方案**：
```python
data = resp.json()
token_data = data["data"]
access_token = token_data.get("accessToken")
expire_time = token_data.get("expireTime")  # ISO 格式，不是秒数
```

---

## 9. OAuth 回调路径不匹配（307 重定向循环）

**现象**：Shopline 回调到 `/api/auth/callback/`（带斜杠），Python 返回 307 重定向到不带斜杠的版本，在代理环境下形成循环。

**原因**：FastAPI 路由 `@router.get("/callback")` 不匹配带尾部斜杠的路径，会自动 307 重定向。

**解决方案**：同时注册两个路径：
```python
@router.get("/callback")
@router.get("/callback/")
async def callback(code: str, handle: str):
    ...
```

---

## 10. 嵌入式 App 里 `store_handle` 为空

**现象**：Translate 请求发送的 `store_handle` 为空字符串，导致 401。

**原因**：Shopline 嵌入式 App 在 iframe 里加载，前端 URL 的 query 参数可能不包含 `handle` 或 `shop`。前端代码 `new URLSearchParams(window.location.search).get("shop")` 取不到值。

**解决方案**：在 Python 后端做 fallback，当 `store_handle` 为空时从数据库取唯一的 store：
```python
if not handle:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT handle FROM imagelingo.stores LIMIT 1")
            row = cur.fetchone()
    if row:
        handle = row[0]
```

---

## 11. Lovart API 返回文字回复而不是翻译后的图片

**现象**：翻译 job 状态为 `failed`，错误信息 `Lovart done but no image artifact found`。Lovart 后台也没有 credit 消耗记录。

**原因**：两个问题叠加：

1. **Prompt 硬编码了源语言为 "Chinese"**：`translate_image()` 的 `source_hint` 默认值是 `"Chinese"`，prompt 写的是 "translate all Chinese text"。当图片里是英文时，Lovart 直接回复"没有中文，不需要翻译"，只返回文字分析，不生成图片。

2. **Prompt 不够明确**：Lovart 是 AI agent 模式，简单的 "translate and return the image" 指令会被当成对话请求，Lovart 选择了"分析并回复"而不是"生成新图片"。

**Lovart 实际返回的数据结构**（只有文字，没有 artifacts）：
```json
{
  "thread_id": "...",
  "status": "done",
  "items": [
    {"type": "assistant", "text": "I'll analyze the image first..."},
    {"type": "assistant", "text": "I've analyzed the image and found that there is no Chinese text..."}
  ]
}
```

**解决方案**：

1. 去掉 `source_hint` 的 "Chinese" 硬编码，改为 `"auto"`
2. 重写 prompt，明确要求生成图片而不是文字分析：

```python
async def translate_image(self, image_url: str, target_language: str, source_hint: str = "auto") -> str:
    prompt = (
        f"Translate ALL text visible in this image into {target_language}. "
        f"Generate a new version of this image where every piece of text has been replaced "
        f"with its {target_language} translation. Keep the exact same layout, colors, fonts, "
        f"and design. Output the final translated image."
    )
```

3. 增强结果解析，除了检查 `artifacts` 外，还检查 `attachments`、`image_url` 等字段：

```python
# 检查 artifacts
for item in result.get("items", []):
    for artifact in item.get("artifacts", []):
        if artifact.get("type") == "image":
            return artifact.get("content", "")

# Fallback: 检查 attachments
for item in result.get("items", []):
    for att in item.get("attachments", []):
        if isinstance(att, str) and att.startswith("http"):
            return att
```

**注意**：Lovart 翻译图片耗时较长（通常 30-90 秒），这是 AI agent 模式的正常行为 — 它需要分析图片、识别文字、翻译、重新渲染。前端的轮询间隔设为 2-3 秒即可。

---

## 12. 翻译时报 "Store not authenticated or token expired"

**现象**：点击 Translate 按钮后，job 状态直接变为 `failed`，错误信息 `Store not authenticated or token expired`。

**原因**：Shopline OAuth token 有效期约 10 小时。过期后 `get_token(handle)` 检查 `expires_at <= now()` 返回 `None`，翻译端点返回 401。代码里的 `refresh_token_if_needed()` 实际上没有 refresh 逻辑，只是调了 `get_token()`。

**解决方案**：

1. **后端**：新增 `GET /api/imagelingo/auth/reauth-url` 端点，返回 Shopline OAuth 重新授权的 URL
2. **前端**：翻译请求返回 401 时，显示红色 banner + "Re-authorize Store" 按钮，引导用户重新走 OAuth

```python
# backend/routes/auth.py
@router.get("/reauth-url")
async def reauth_url(handle: str = ""):
    if not handle:
        # Fallback: get the most recent store from DB
        cur.execute("SELECT handle FROM imagelingo.stores ORDER BY updated_at DESC LIMIT 1")
        ...
    auth_url = f"https://{handle}.myshopline.com/admin/oauth-web/#/oauth/authorize?..."
    return {"auth_url": auth_url, "handle": handle}
```

**注意**：Shopline 目前不支持 refresh token 自动续期，token 过期后必须重新走 OAuth 授权流程。

---

## 13. Re-authorize 按钮在 Shopline iframe 里点击无反应

**现象**：点击 "Re-authorize Store" 按钮后页面没有任何反应。

**原因**：两个问题叠加：
1. `window.open(url, "_top")` 在 Shopline 的 iframe 安全策略下被拦截
2. `storeHandle` 为空时 `handleReauth` 直接 return 了，没有任何提示

**解决方案**：
- 用 `window.top.location.href = url` 替代 `window.open(url, "_top")`，直接在顶层窗口跳转
- 加 try/catch fallback 到 `window.location.href`（防止跨域限制）

```typescript
try { window.top!.location.href = auth_url; } catch { window.location.href = auth_url; }
```

---

## 14. Re-authorize 跳转到 `https://.myshopline.com/...`（handle 为空）

**现象**：点击 Re-authorize 后跳转到 `https://.myshopline.com/admin/oauth-web/...`，DNS 解析失败。

**原因**：前端在 Vercel 上运行（hostname 是 `web-xxx.vercel.app`），不是 `xxx.myshopline.com`。URL query 参数里也没有 `handle` 或 `shop`，所以 `storeHandle` 始终为空字符串，传给后端后生成了无效的 OAuth URL。

**解决方案**：后端 `reauth-url` 端点不再强制要求前端传 handle，handle 为空时从数据库查最近更新的 store：

```python
@router.get("/reauth-url")
async def reauth_url(handle: str = ""):
    if not handle:
        cur.execute("SELECT handle FROM imagelingo.stores ORDER BY updated_at DESC LIMIT 1")
        row = cur.fetchone()
        if row:
            handle = row[0]
    ...
```

**注意**：这个 fallback 只适用于单 store 场景。如果未来支持多 store，需要在前端通过其他方式（如 Shopline App Bridge SDK）获取当前 store handle。

---

## 15. Railway 部署 healthcheck 失败（`${PORT:-8000}` 未展开）

**现象**：Railway build 成功，但 healthcheck 持续失败，运行时日志报 `Error: Invalid value for '--port': '${PORT:-8000}' is not a valid integer`。

**原因**：`railway.json` 里的 `startCommand` 使用了 bash 变量语法 `${PORT:-8000}`，但 Railway Docker 容器执行 startCommand 时不走 shell，变量不会被展开，直接当成字面字符串传给 uvicorn。

**解决方案**：用 `sh -c` 包裹命令，强制通过 shell 执行：

```json
{
  "deploy": {
    "startCommand": "sh -c 'uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}'"
  }
}
```

**注意**：直接用 `$PORT`（不带默认值）也不行，同样不会被展开。必须用 `sh -c` 包裹。

---

## 开发环境快速启动

```bash
# 1. 安装依赖
npm install
cd app && npm install && cd ..
cd backend && pip install -r requirements.txt && cd ..

# 2. 配置环境变量
cp backend/.env.example backend/.env
# 编辑 backend/.env 填入所有 key

# 3. 启动 Shopline dev（Node.js + Vite 前端）
npm run dev

# 4. 另一个终端启动 Python 后端
uvicorn backend.main:app --reload --port 8000

# 5. 首次使用需要初始化数据库 + OAuth 授权
# 数据库建表：在 Neon console 执行 backend/db/init_schema.sql
# OAuth：浏览器打开 {tunnel_url}/api/auth/install?handle={store_handle}
```
