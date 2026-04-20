"""
Lovart Service — 直接调用 Lovart Agent API 完成图片翻译渲染。
使用 AK/SK HMAC-SHA256 认证，API 对齐 agent_skill.py。
"""
import hashlib, hmac, json, ssl, time, urllib.request, urllib.parse, urllib.error, os
from typing import Optional

LOVART_BASE_URL = os.environ.get("LOVART_BASE_URL", "https://lgw.lovart.ai")
LOVART_PREFIX = "/v1/openapi"

_ssl_ctx = ssl.create_default_context()
if os.environ.get("LOVART_INSECURE_SSL") == "1":
    _ssl_ctx.check_hostname = False
    _ssl_ctx.verify_mode = ssl.CERT_NONE


class LovartService:
    def __init__(self):
        self.access_key = os.environ["LOVART_ACCESS_KEY"]
        self.secret_key = os.environ["LOVART_SECRET_KEY"]
        self.base_url = LOVART_BASE_URL
        self.prefix = LOVART_PREFIX

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
            "User-Agent": "Mozilla/5.0 LovartImageLingo/1.0",
        }

    def _request(self, method: str, path: str, body=None, params=None) -> dict:
        url = f"{self.base_url}{path}"
        if params:
            url += "?" + urllib.parse.urlencode(params)
        data = json.dumps(body).encode() if body is not None else None
        headers = self._sign(method, path)
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        with urllib.request.urlopen(req, timeout=120, context=_ssl_ctx) as resp:
            result = json.loads(resp.read().decode())
        if isinstance(result, dict) and result.get("code", 0) != 0:
            raise ValueError(f"Lovart API error: {result.get('message', result)}")
        return result.get("data", result) if isinstance(result, dict) else result

    def _get_or_create_project(self) -> str:
        result = self._request("POST", f"{self.prefix}/project/save", body={
            "project_id": "",
            "canvas": "",
            "project_cover_list": [],
            "pic_count": 0,
            "project_type": 3,
            "project_name": "imagelingo-translations",
        })
        return result.get("project_id", "")

    async def translate_image(
        self,
        image_url: str,
        target_language: str,
        source_hint: str = "Chinese",
    ) -> str:
        """
        调用 Lovart Agent，将图片中的文字翻译并渲染为目标语言。
        返回翻译后图片的 URL。
        """
        project_id = self._get_or_create_project()

        prompt = (
            f"Please translate all {source_hint} text in this image into {target_language}. "
            f"Keep the original layout, font style, and design. "
            f"Replace each text element in-place with its {target_language} translation. "
            f"Output the final image with translated text rendered onto it."
        )

        # Step 1: 发送任务
        thread_id = self._request("POST", f"{self.prefix}/chat", body={
            "prompt": prompt,
            "project_id": project_id,
            "attachments": [image_url],
        })["thread_id"]

        # Step 2: 轮询直到完成（最多等 5 分钟）
        for _ in range(100):
            time.sleep(3)
            status_data = self._request("GET", f"{self.prefix}/chat/status",
                                        params={"thread_id": thread_id})
            status = status_data.get("status")
            if status == "done":
                result = self._request("GET", f"{self.prefix}/chat/result",
                                       params={"thread_id": thread_id})
                for item in result.get("items", []):
                    for artifact in item.get("artifacts", []):
                        if artifact.get("type") == "image":
                            return artifact.get("content", "")
                raise ValueError("Lovart done but no image artifact found")
            elif status == "abort":
                raise ValueError("Lovart task aborted")
            # running/pending — continue polling

        raise TimeoutError("Lovart translation timed out after 5 minutes")
