# AGENT_TASKS_V2.md — ImageLingo 架构调整任务包

## 背景（重要，请先读完）

架构有两处重大变更：

1. **翻译方案变更**：移除 DeepL，改用 Lovart API 直接处理翻译+渲染
   - Lovart 是 AI 设计平台，支持自然语言 prompt，可以"识别图片中的中文文字并翻译渲染成目标语言"
   - 不需要单独的 OCR → 翻译 → 渲染三步，Lovart 一步完成

2. **Lovart 认证方式**：AK/SK（HMAC-SHA256），不是普通 API Key
   - 已有现成的 Python 客户端：`~/.openclaw/workspace/.agents/skills/lovart-api/agent_skill.py`
   - 认证环境变量：`LOVART_ACCESS_KEY` 和 `LOVART_SECRET_KEY`（已配置在 ~/.zshrc）

---

## 你的角色

全部实现以下 Phase，遇到错误自行调试，完成后输出报告。
每个 Phase 完成后 `git add -A && git commit -m "feat/fix: <描述>"`。

---

## Phase 1 — 重写 Lovart 服务层

**删除** `backend/services/ocr_service.py`、`backend/services/translate_service.py`、`backend/services/lovart_service.py`（旧版）。

**创建新版** `backend/services/lovart_service.py`：

```python
"""
Lovart Service — 直接调用 Lovart Agent API 完成图片翻译渲染。
使用 AK/SK HMAC-SHA256 认证（复用 ~/.openclaw 中的 agent_skill.py 逻辑）。
"""
import hashlib, hmac, json, ssl, time, uuid, urllib.request, urllib.parse, urllib.error, os
from typing import Optional

LOVART_BASE_URL = "https://api.lovart.ai"
LOVART_PREFIX = "/v1/openapi"

class LovartService:
    def __init__(self):
        self.access_key = os.environ["LOVART_ACCESS_KEY"]
        self.secret_key = os.environ["LOVART_SECRET_KEY"]
        self.base_url = LOVART_BASE_URL
        self.prefix = LOVART_PREFIX
        self._ssl_ctx = ssl.create_default_context()

    def _sign(self, method: str, path: str) -> dict:
        ts = str(int(time.time()))
        sig = hmac.new(
            self.secret_key.encode(),
            f"{method}\n{path}\n{ts}".encode(),
            hashlib.sha256,
        ).hexdigest()
        return {
            "X-Access-Key": self.access_key,
            "X-Timestamp": ts,
            "X-Signature": sig,
            "X-Signed-Method": method,
            "X-Signed-Path": path,
            "Content-Type": "application/json",
        }

    def _request(self, method: str, path: str, body=None) -> dict:
        url = f"{self.base_url}{path}"
        data = json.dumps(body).encode() if body else None
        headers = self._sign(method, path)
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        with urllib.request.urlopen(req, timeout=120, context=self._ssl_ctx) as resp:
            return json.loads(resp.read().decode())

    def _get_or_create_project(self) -> str:
        """获取或创建 ImageLingo 专用 project"""
        # 列出现有 project
        try:
            result = self._request("GET", f"{self.prefix}/projects")
            projects = result.get("data", {}).get("projects", [])
            for p in projects:
                if p.get("name", "").startswith("imagelingo"):
                    return p["projectId"]
        except Exception:
            pass
        # 创建新 project
        project_id = uuid.uuid4().hex
        self._request("POST", f"{self.prefix}/projects", {
            "projectId": project_id,
            "name": "imagelingo-translations"
        })
        return project_id

    async def translate_image(
        self,
        image_url: str,
        target_language: str,  # 如 "English", "German", "Japanese"
        source_hint: str = "Chinese"
    ) -> str:
        """
        调用 Lovart Agent，将图片中的中文文字翻译并渲染为目标语言。
        返回翻译后图片的 URL。
        """
        project_id = self._get_or_create_project()

        prompt = (
            f"Please translate all {source_hint} text in this image into {target_language}. "
            f"Keep the original layout, fonts style, and design. "
            f"Replace each text element in-place with its {target_language} translation. "
            f"Output the final image with translated text rendered onto it."
        )

        # Step 1: 发送任务
        path = f"{self.prefix}/agent/tasks"
        body = {
            "projectId": project_id,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": image_url}}
                    ]
                }
            ]
        }
        result = self._request("POST", path, body)
        thread_id = result.get("data", {}).get("threadId")
        if not thread_id:
            raise ValueError(f"Lovart task creation failed: {result}")

        # Step 2: 轮询直到完成（最多等 5 分钟）
        status_path = f"{self.prefix}/agent/tasks/{thread_id}"
        for _ in range(100):
            time.sleep(3)
            status_result = self._request("GET", status_path)
            data = status_result.get("data", {})
            status = data.get("status")
            if status == "done":
                # 提取输出图片 URL
                artifacts = data.get("artifacts", [])
                for artifact in artifacts:
                    if artifact.get("type") == "image":
                        return artifact.get("content") or artifact.get("url", "")
                raise ValueError("Lovart done but no image artifact found")
            elif status == "failed":
                raise ValueError(f"Lovart task failed: {data.get('error')}")
            # pending/processing — continue polling

        raise TimeoutError("Lovart translation timed out after 5 minutes")
```

**注意**：如果上述 API 路径（`/v1/openapi/agent/tasks`）不正确，请参考
`~/.openclaw/workspace/.agents/skills/lovart-api/agent_skill.py` 中的实际 endpoint，
将 `_request` 调用和路径对齐。不要猜，直接读那个文件。

git commit: "refactor: replace OCR+DeepL+Lovart with unified Lovart translation service"

---

## Phase 2 — 更新翻译主接口

修改 `backend/routes/translate.py`，简化翻译链路：

```
旧链路：OCR → DeepL → Lovart渲染 → Cloudinary
新链路：Lovart（一步完成翻译+渲染）→ Cloudinary
```

接口签名不变：
- `POST /api/translate` — 创建任务
- `GET /api/translate/jobs/{job_id}` — 查询状态

内部逻辑变为：
1. 对每个 `target_language`，调用 `LovartService.translate_image(image_url, lang)`
2. 将返回的图片 URL 下载后上传到 Cloudinary（或直接存 Lovart URL，看 Cloudinary 是否必要）
3. 更新 `translated_images` 表

target_language 语言名称映射（用于 Lovart prompt）：
```python
LANG_NAMES = {
    "EN": "English",
    "DE": "German",
    "JA": "Japanese",
    "KO": "Korean",
    "FR": "French",
    "ES": "Spanish",
    "IT": "Italian",
    "PT": "Portuguese",
    "TH": "Thai",
    "VI": "Vietnamese",
    "ID": "Indonesian",
}
```

git commit: "feat: simplified translation pipeline via Lovart"

---

## Phase 3 — 清理依赖

修改 `backend/requirements.txt`：
- **删除**：`paddlepaddle`, `paddleocr`, `deepl`
- **保留**：`fastapi`, `uvicorn`, `asyncpg`, `psycopg2-binary`, `cloudinary`, `httpx`, `python-dotenv`

git commit: "chore: remove unused OCR and DeepL dependencies"

---

## Phase 4 — 更新 .env.example

```
# Shopline
SHOPLINE_APP_KEY=
SHOPLINE_APP_SECRET=
SHOPLINE_APP_URL=
SHOPLINE_REDIRECT_URI=

# Lovart（AK/SK 认证，从 https://lovart.ai AK/SK Management 获取）
LOVART_ACCESS_KEY=ak_xxx
LOVART_SECRET_KEY=sk_xxx

# Cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# Neon PostgreSQL
DATABASE_URL=
```

git commit: "chore: update env template (remove DeepL, add Lovart AK/SK)"

---

## Phase 5 — 最终 push

```bash
git push origin main
```

---

## 完成报告格式

```
=== ImageLingo V2 更新报告 ===

✅ 已完成：
- Phase 1: ...
- Phase 2: ...
...

⚠️ 遇到的问题及处理：
- 问题: ... → 解法: ...

📋 需要 Dale 手动操作：
1. 在 backend/.env 填写 LOVART_ACCESS_KEY 和 LOVART_SECRET_KEY
   （值已在 ~/.zshrc 中，复制过来即可）
2. 填写 SHOPLINE_APP_KEY / SHOPLINE_APP_SECRET（需从 Shopline Partner Portal 获取）
3. 填写 CLOUDINARY 和 DATABASE_URL
4. 在 Railway 配置环境变量并部署

🔗 Git log（最新5条）：
...
```
