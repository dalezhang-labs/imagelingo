# AGENT_TASKS_NEXT.md — ImageLingo 补齐剩余可用性

目标：把后端“从能跑代码”补齐到“能在本地/部署环境稳定跑通关键链路”，主要验证与修复：
1) Shopline OAuth/token 存储与 translate 路由鉴权打通
2) 翻译 pipeline 的 job 创建/状态查询/写入 translated_images 能跑
3) Lovart 调用路径与解析逻辑与当前 `backend/services/lovart_service.py` 完全匹配（必要时对齐 `~/.openclaw/workspace/.agents/skills/lovart-api/agent_skill.py`）
4) Cloudinary 上传函数在给定 URL 输入下工作（或至少在无 key 情况下可降级/给清晰报错）
5) 补齐最小可用测试：至少让 `pytest`/或自定义 smoke test 在依赖齐全时能通过；依赖不齐全时要给“缺什么 key”的明确错误

约束：
- 只做“可用性补齐”，不新增大范围功能。
- 遇到问题优先对齐现有技能文件/约定，而不是猜 endpoint。
- 每个 Phase 完成后：`git add -A && git commit -m "feat/fix: ..."`。

---

## Phase 1 — 环境变量与缺失项校验（fail fast）
1. 检查 `backend/.env.example` 与代码中读取的 env keys 是否一致。
2. 在后端启动时或翻译路由调用 Lovart/Cloudinary前，做统一的 env 校验：缺什么 key 就返回明确错误（例如 500 detail 或清晰日志）。
3. 让错误信息不包含敏感值。

git commit: "fix: fail-fast env validation for ImageLingo"

---

## Phase 2 — LovartService endpoint/response 对齐（与 agent_skill.py 对齐）
1. 读取 `~/.openclaw/workspace/.agents/skills/lovart-api/agent_skill.py`，确认：
   - project 创建接口与入参（你们当前 lovart_service.py 使用的 `project/save` 是否正确）
   - 发起对话任务接口（当前是 `POST /v1/openapi/chat`）
   - 轮询状态接口（当前是 `GET /v1/openapi/chat/status?thread_id=...`）
   - 获取结果接口（当前是 `GET /v1/openapi/chat/result?thread_id=...`）
   - 返回 JSON 里 image artifact 字段结构（当前代码找 `items[].artifacts[].type == image`，并取 `content`）
2. 如果发现当前 `backend/services/lovart_service.py` 与 skill 的真实字段/路径不一致：
   - 直接修正 `lovart_service.py` 以对齐
   - 增加最小 debug：当结果里找不到 image artifact 时，记录 result 的 keys 但不要打印整段敏感数据
3. 加入单元/集成式 smoke test：在不调用真实 Lovart 时（可用 mock 或跳过），至少验证解析逻辑对齐预期结构。

git commit: "fix: align LovartService endpoints and result parsing"

---

## Phase 3 — translate 路由 job 状态与 translated_images 返回完整性
1. 检查 `backend/routes/translate.py` 的 job 创建、processing、done/failed 更新是否正确。
2. 检查 `GET /api/translate/jobs/{job_id}` 是否能在 done 后返回每个语言的 output_url。
3. 如果存在 bug（例如 language 字段不对齐、SQL schema mismatch、translated_images 插入缺字段）：修正。
4. 给出清晰错误：job 不存在 / status failed / translated_images 为空。

git commit: "fix: ensure translate job status and results retrieval"

---

## Phase 4 — CloudinaryService 的 URL->上传路径可用性
1. 检查 `backend/services/cloudinary_service.py` 当前实现：
   - 是否接受 `upload_image_from_url(translated_url, public_id)`
   - 是否对无 key/无网络失败给出明确错误
2. 若实现不完整：完善到能用（或至少在参数正确时能发请求并处理返回）。
3. 加 smoke test：mock Cloudinary API 响应，验证返回 URL 的解析。

git commit: "fix: robust CloudinaryService url upload and parsing"

---

## Phase 5 — 最小可用 smoke test
1. 运行现有测试（`backend/tests`）并补充一个 `test_smoke_pipeline.py`（尽量不依赖真实外部服务）：
   - mock LovartService.translate_image 与 CloudinaryService.upload_image_from_url
   - 验证：POST translate 创建 job -> background pipeline 跑完 -> job done -> GET job 返回 output_url
2. 如果需要数据库/Neon：允许使用本地 sqlite 或跳过外部依赖（但要打印跳过原因）。

git commit: "test: add ImageLingo smoke tests for pipeline"

---

## Phase 6 — 输出最终运行指令（给你手动部署用）
1. 在 `README.md` 或新文件 `RUNBOOK.md` 中补齐：
   - 本地如何启动后端
   - 需要哪些 env keys
   - Shopline 安装 flow 到 translate flow 的最短步骤
2. 确保文档不冗长，能让你照做。

git commit: "docs: add ImageLingo runbook"
