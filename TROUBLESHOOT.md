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

## 16. Shopline 应用设置里的 URL 填错（应用地址 vs 回调地址）

**现象**：在 Shopline Partners 后台配置应用时，不确定"应用地址"和"应用回调地址"分别填什么。填了 Cloudflare Tunnel 临时地址后，每次重启地址都变。

**原因**：开发阶段用的 Cloudflare Tunnel 地址（如 `https://xxx.trycloudflare.com`）是临时的，不适合正式环境。正式环境需要用固定域名。

**解决方案**：

| 字段 | 填什么 | 示例 |
|------|--------|------|
| **应用地址** | Vercel 前端地址（用户打开 app 看到的页面） | `https://web-seven-beta-49.vercel.app` |
| **应用回调地址** | Railway 后端的 OAuth callback 端点 | `https://positive-warmth-production.up.railway.app/api/imagelingo/auth/callback` |

**关键区分**：
- 应用地址 = 前端（Vercel），用户交互界面
- 回调地址 = 后端（Railway），处理 OAuth token 交换
- 同时需要更新 `backend/.env` 和 Railway 环境变量中的 `SHOPLINE_APP_URL` 和 `SHOPLINE_REDIRECT_URI`

```bash
# 更新 Railway 环境变量
railway variables set \
  SHOPLINE_APP_URL=https://positive-warmth-production.up.railway.app \
  SHOPLINE_REDIRECT_URI=https://positive-warmth-production.up.railway.app/api/imagelingo/auth/callback
```

---

## 17. GDPR Webhook 端点缺失

**现象**：Shopline 应用审核要求填写 GDPR 相关的 Webhook 端点（客户数据删除、商店数据删除），但后端没有实现。

**解决方案**：在 `backend/routes/webhook.py` 中新增两个端点：

```python
@router.post("/gdpr/customers-data-erasure")
async def customers_data_erasure(request: Request):
    """ImageLingo 不存储客户 PII，直接返回 OK"""
    return {"status": "ok", "message": "No customer data stored"}

@router.post("/gdpr/shop-data-erasure")
async def shop_data_erasure(request: Request):
    """商家卸载时，删除该 store 的所有数据"""
    # 级联删除：usage_logs → subscriptions → translated_images → translation_jobs → stores
    ...
```

**Shopline 后台填写**：
- 客户数据删除端点：`https://{railway_domain}/api/imagelingo/webhooks/gdpr/customers-data-erasure`
- 商店数据删除端点：`https://{railway_domain}/api/imagelingo/webhooks/gdpr/shop-data-erasure`

---

## 18. Lovart API 返回 401 Invalid access key

**现象**：翻译 job 失败，错误信息 `Lovart HTTP 401: {"code":1005,"error":"Invalid access key"}`。

**原因**：可能的情况：
1. 本地 `.env` 里的 key 已更新，但 Railway 环境变量还是旧的
2. Lovart 后台重新生成了 AK/SK，旧 key 已失效
3. Key 复制时多了空格或换行

**排查步骤**：
```bash
# 1. 确认本地 .env 的 key
python3 -c "from dotenv import load_dotenv; load_dotenv('backend/.env'); import os; print(os.environ['LOVART_ACCESS_KEY'][:12])"

# 2. 直接测试 API 连通性
python3 -c "
import hmac, hashlib, time, json, urllib.request
ak = 'ak_xxx'; sk = 'sk_xxx'
method, path = 'POST', '/v1/openapi/project/save'
ts = str(int(time.time()))
sig = hmac.new(sk.encode(), f'{method}\n{path}\n{ts}'.encode(), hashlib.sha256).hexdigest()
# ... 发请求测试
"

# 3. 同步更新 Railway 环境变量
railway variables set LOVART_ACCESS_KEY=ak_xxx LOVART_SECRET_KEY=sk_xxx
```

**关键点**：本地 `.env` 和 Railway 环境变量必须同步更新。Railway 设置环境变量后会自动触发重新部署。

---

## 19. OCR 在 async 上下文中报 "This event loop is already running"

**现象**：Railway 日志报 `OCR failed (continuing without): This event loop is already running`，同时有 `RuntimeWarning: coroutine 'OCRService.extract_text' was never awaited`。

**原因**：`_run_ocr()` 是同步函数，内部用 `asyncio.get_event_loop().run_until_complete(ocr.extract_text(...))` 调用 async 方法。但它被 async 的 `_run_pipeline()` 调用，此时 event loop 已经在运行，不能嵌套 `run_until_complete()`。

**解决方案**：新增 `_run_ocr_async()` 异步版本，在 pipeline 中用 `await` 调用：

```python
async def _run_ocr_async(image_url: str) -> list[str]:
    try:
        ocr = OCRService(lang_groups=[["ch_sim", "en"]])
        # ... 下载图片 ...
        results = await ocr.extract_text(image_bytes)  # 直接 await
        return [r["text"] for r in results if r.get("confidence", 0) > 0.3]
    except Exception as e:
        logger.warning("OCR failed (continuing without): %s", e)
        return []

async def _run_pipeline(...):
    ocr_texts = await _run_ocr_async(image_url)  # 用 async 版本
```

**注意**：OCR 失败是 non-fatal 的，不会阻断翻译流程。但修复后 OCR 能正常工作，可以给 Lovart 提供更准确的文字信息，提升翻译质量。

---

## 20. History 页面报 SQL 类型错误（uuid = text）

**现象**：Railway 日志报 `psycopg2.errors.UndefinedFunction: operator does not exist: uuid = text`，History 页面加载失败。

**原因**：`translated_images` 表的 `job_id` 列类型是 `UUID`，但查询时传入的是 `TEXT` 类型的数组，PostgreSQL 不会自动做类型转换。

**解决方案**：在 SQL 查询中显式转换类型：

```python
# 错误写法
cur.execute("SELECT ... WHERE job_id = ANY(ARRAY[%s, %s])", (id1, id2))

# 正确写法 — 显式 cast
cur.execute("SELECT ... WHERE job_id = ANY(%s::uuid[])", (job_ids,))
```

---

## 部署 Checklist

每次部署前确认：

1. **环境变量同步**：本地 `.env` 和 Railway 环境变量一致（特别是 API key 更新后）
2. **前后端都部署**：
   - 后端：`railway up --detach`（或 push 到 main 触发自动部署）
   - 前端：`cd web && vercel --prod`
3. **Shopline 后台配置**：应用地址（后端 /entry）、回调地址（后端 /callback）、GDPR webhook 地址（后端）
4. **数据库 schema**：新增表/列后在 Neon console 执行 SQL
5. **Lovart API**：key 更新后同步到 Railway（`railway variables set ...`）

---

## 21. Shopline 应用审核被拒 — 未按标准接入授权

**现象**：提交应用审核后收到邮件："该应用尚未按照我们的标准要求接入 SHOPLINE 授权"。

**原因**：三个问题：
1. `SKIP_HMAC_VERIFY=true` 跳过了签名验证，Shopline 要求所有请求都必须验证 HMAC-SHA256 签名
2. 没有实现 token refresh（文档第八步），token 过期后只能手动重新授权
3. OAuth callback 收到 code 后没有验证签名

**Shopline 授权文档**：https://developer.shopline.com/zh-hans-cn/docs/apps/api-instructions-for-use/app-authorization

**解决方案**：

1. **删除 `SKIP_HMAC_VERIFY` 跳过逻辑**，签名验证强制开启
2. **`/install` 和 `/callback` 都验证签名**：
```python
def verify_hmac(params: dict) -> bool:
    sign = params.get("sign", "")
    filtered = {k: v for k, v in params.items() if k != "sign"}
    expected = _make_sign(filtered)
    return hmac.compare_digest(expected, sign)
```
3. **实现 token refresh（第八步）**：token 过期时自动调用 `POST /admin/oauth/token/refresh`，签名方式与 token create 相同（`HMAC-SHA256(body_string + timestamp, app_secret)`）
4. **`redirectUri` 做 URL encode**（文档要求）

---

## 22. Shopline 应用地址应该填什么

**现象**：不确定 Shopline Partners 后台的"应用地址"和"应用回调地址"分别填前端还是后端。

**结论**：

| 字段 | 填写 | 说明 |
|------|------|------|
| **应用地址** | `https://{railway_domain}/api/imagelingo/auth/entry` | 后端 entry 端点，验证签名后重定向到前端 |
| **应用回调地址** | `https://{railway_domain}/api/imagelingo/auth/callback` | 后端 callback 端点，处理 OAuth code 换 token |
| **客户数据删除端点** | `https://{railway_domain}/api/imagelingo/webhooks/gdpr/customers-data-erasure` | GDPR |
| **商店数据删除端点** | `https://{railway_domain}/api/imagelingo/webhooks/gdpr/shop-data-erasure` | GDPR |

**为什么应用地址不能填 Vercel 前端**：Shopline 每次打开 app 都会带签名参数（`?appkey=...&sign=...`）访问应用地址，审核要求必须验证签名。前端不做签名验证，会被拒。

**`/entry` 端点的逻辑**：
1. 验证 HMAC-SHA256 签名
2. 检查 store 是否已授权（DB 里有有效 token）
3. 已授权 → 302 重定向到 Vercel 前端（`FRONTEND_URL?shop={handle}`）
4. 未授权 → 返回 HTML 页面，用 `window.top.location.href` 跳转到 OAuth 授权页

---

## 23. OAuth 授权页在 Shopline iframe 里嵌套（双重/多重侧边栏）

**现象**：首次安装 app 时，OAuth 授权页面出现在 Shopline 的 iframe 里，导致 Shopline admin 侧边栏被嵌套了多层。

**原因**：Shopline 在 iframe 里加载应用地址，如果应用地址用 HTTP 302 重定向到 OAuth 授权页（`https://{handle}.myshopline.com/admin/oauth-web/#/oauth/authorize`），OAuth 页面也会在 iframe 里打开。OAuth 页面本身是完整的 Shopline admin 页面，所以出现了嵌套。

**解决方案**：不用 302 重定向，改为返回一个小 HTML 页面，用 JavaScript 在顶层窗口跳转：

```python
from fastapi.responses import HTMLResponse

# 在 /entry 端点中，未授权时：
return HTMLResponse(
    f'<!DOCTYPE html><html><head><title>Redirecting...</title></head>'
    f'<body><script>window.top.location.href = "{auth_url}";</script>'
    f'<p>Redirecting to authorization...</p></body></html>'
)
```

**关键点**：`window.top.location.href` 让整个浏览器窗口（而不是 iframe）跳转到 OAuth 页面，避免嵌套。

**注意**：OAuth 完成后的 callback 重定向到 `FRONTEND_URL?shop={handle}`（Vercel 前端），这个是在 iframe 外面发生的，Shopline 会自动重新加载 app iframe，此时 `/entry` 检测到已授权，直接跳到前端，不会嵌套。

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
