# ImageLingo — 开发计划 v1.0

## 产品定位

**面向中国 Shopline 跨境卖家的产品图 AI 翻译插件。**

卖家从 1688/淘宝拿到的产品图含大量中文文字（规格、卖点、成分表等），进入欧洲/东南亚市场时需要本地化。现在他们的流程是手动 PS + DeepL + 重排版，单张 15-30 分钟。

ImageLingo 的核心链路：
**上传产品图 → PaddleOCR 识别文字 → DeepL 翻译 → Lovart API 重渲文字 → 输出多语言图片 → 同步到 Shopline 商品图库**

对标竞品：EZ Product Image Translate（仅在 Shopify，$9-$59/月，71 条评论）
Shopline 平台目前 0 个竞品。

---

## 技术栈

```
前端：React + Vite（Shopline App 内嵌页）
      Tailwind CSS + shadcn/ui
后端：FastAPI（Python）→ Railway 部署
OCR：PaddleOCR（中文识别强，开源）
翻译：DeepL API（25 种语言，$25/月 50万字符）
渲染：Lovart API（Seedream 模型，多语言文字渲染进图片）
图片存储：Cloudinary（翻译结果图片存储，免费额度够用）
数据库：Neon PostgreSQL，schema: imagelingo
部署：Railway（后端）+ Vercel（前端）
Shopline：Shopline CLI (npm create @shoplinedev/app@next)
认证：Shopline OAuth 2.0
```

---

## 目录结构（目标）

```
imagelingo/
├── PLAN.md                        # 本文件
├── shopline.app.toml              # Shopline App 配置
├── package.json                   # 根 package（monorepo 风格）
│
├── backend/                       # FastAPI 后端
│   ├── main.py                    # 入口
│   ├── requirements.txt
│   ├── shopline.web.toml          # type="backend"
│   ├── routes/
│   │   ├── auth.py                # OAuth 回调（/api/auth/callback）
│   │   ├── translate.py           # 翻译主接口（/api/translate）
│   │   ├── jobs.py                # 任务状态查询（/api/jobs/{id}）
│   │   └── webhook.py             # Webhook 处理（/api/webhooks）
│   ├── services/
│   │   ├── shopline_client.py     # Shopline API 封装（products/images）
│   │   ├── ocr_service.py         # PaddleOCR 封装
│   │   ├── translate_service.py   # DeepL API 封装
│   │   ├── lovart_service.py      # Lovart API 封装
│   │   ├── cloudinary_service.py  # 图片上传/存储
│   │   └── token_store.py         # Access Token 持久化（Neon）
│   └── db/
│       ├── connection.py          # Neon 连接
│       └── models.py              # 表定义
│
└── frontend/                      # React + Vite 前端
    ├── shopline.web.toml          # type="frontend"
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.ts
    └── src/
        ├── main.tsx
        ├── App.tsx
        └── pages/
            ├── Dashboard.tsx      # 主页：用量概览 + 快速翻译入口
            ├── Translate.tsx      # 翻译操作页：选产品图 → 选语言 → 翻译
            └── History.tsx        # 翻译历史记录
```

---

## 数据库设计（Neon schema: imagelingo）

```sql
-- 店铺 Token 存储（每个安装的店铺一条记录）
CREATE TABLE imagelingo.stores (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  handle       TEXT UNIQUE NOT NULL,     -- 店铺域名 handle
  access_token TEXT NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  scopes       TEXT,
  installed_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 翻译任务
CREATE TABLE imagelingo.translation_jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id         UUID REFERENCES imagelingo.stores(id),
  product_id       TEXT NOT NULL,
  original_image_url TEXT NOT NULL,
  target_languages TEXT[] NOT NULL,      -- ['en', 'de', 'ja', 'ko', 'fr']
  status           TEXT DEFAULT 'pending', -- pending/processing/done/failed
  error_msg        TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  completed_at     TIMESTAMPTZ
);

-- 翻译结果（每个语言一条）
CREATE TABLE imagelingo.translated_images (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID REFERENCES imagelingo.translation_jobs(id),
  language        TEXT NOT NULL,
  output_url      TEXT NOT NULL,         -- Cloudinary URL
  shopline_image_id TEXT,               -- 同步到 Shopline 后的 image id
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 用量追踪（按月）
CREATE TABLE imagelingo.usage_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id          UUID REFERENCES imagelingo.stores(id),
  month             TEXT NOT NULL,       -- '2026-04'
  images_translated INT DEFAULT 0,
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, month)
);

-- 订阅计划
CREATE TABLE imagelingo.subscriptions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id            UUID REFERENCES imagelingo.stores(id) UNIQUE,
  plan                TEXT DEFAULT 'free', -- free/basic/pro/business
  images_limit        INT DEFAULT 5,       -- free: 5, basic: 200, pro: 1000
  billing_cycle_start TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Shopline API 关键信息

### OAuth 流程
```
1. 商家安装 → Shopline 向 appUrl 发 GET（含 appkey/handle/timestamp/sign）
2. 验签后跳转：GET https://{handle}.myshopline.com/admin/oauth-web/#/oauth/authorize
   参数：appKey, responseType=code, scope, redirectUri
3. 回调 redirectUri 携带 code（有效期 10 分钟）
4. POST https://{handle}.myshopline.com/admin/oauth/token/create → accessToken
5. accessToken 有效期 10 小时，需持久化存储并定时刷新
```

### 产品图片 API
```
# 读取产品图片列表
GET https://{handle}.myshopline.com/admin/openapi/v20260301/products/{product_id}/images.json
Header: Authorization: Bearer <accessToken>

# 新增产品图片（通过 URL 引用，不是 base64）
POST https://{handle}.myshopline.com/admin/openapi/v20260301/products/{product_id}/images.json
Body: { "image": { "src": "<cloudinary_url>", "alt": "<alt_text>" } }

# 权限 scopes：read_products, write_products
```

---

## 翻译核心流程（后端）

```python
# translate.py 核心逻辑
async def translate_image(image_url: str, target_languages: list[str]):

    # Step 1: 下载原图
    image = download_image(image_url)

    # Step 2: PaddleOCR 识别文字区域
    ocr_results = paddleocr.ocr(image)
    # 返回: [(bbox, text, confidence), ...]

    # Step 3: 对每个语言执行翻译 + 渲染
    results = {}
    for lang in target_languages:

        # Step 3a: DeepL 翻译文字
        translated_texts = deepl.translate(
            texts=[r[1] for r in ocr_results],
            target_lang=lang
        )

        # Step 3b: Lovart API 重渲文字回图片
        rendered_image = lovart.render_text(
            original_image=image,
            text_regions=[
                {"bbox": r[0], "text": t, "original_text": r[1]}
                for r, t in zip(ocr_results, translated_texts)
            ]
        )

        # Step 3c: 上传到 Cloudinary
        output_url = cloudinary.upload(rendered_image)
        results[lang] = output_url

    return results
```

---

## 定价方案

| 计划 | 价格 | 每月额度 |
|------|------|----------|
| Free | $0 | 5 张/月 |
| Basic | $9/月 | 200 张 |
| Pro | $29/月 | 1000 张 |
| Business | $59/月 | 无限量 + API |

---

## 开发任务（4 周）

### Week 1：基础搭建
- [x] 创建目录 + GitHub 仓库（已完成）
- [ ] Task 1: 用 Shopline CLI 初始化 App 脚手架
- [ ] Task 2: 搭建 FastAPI 后端骨架（含健康检查接口）
- [ ] Task 3: 实现 OAuth 认证流程（安装 → 获取 token → 持久化到 Neon）
- [ ] Task 4: 集成 PaddleOCR，测试中文图片识别
- [ ] Task 5: Railway 部署后端，Vercel 部署前端

### Week 2：核心翻译链路
- [ ] Task 6: 集成 DeepL API
- [ ] Task 7: 集成 Lovart API（文字重渲）
- [ ] Task 8: OCR → 翻译 → Lovart 全链路打通
- [ ] Task 9: 集成 Cloudinary（翻译结果存储）
- [ ] Task 10: 效果 QA（测试中→英/日/韩/德/法）

### Week 3：产品功能完整
- [ ] Task 11: 批量处理（多张图 + 多语言一次输出）
- [ ] Task 12: Shopline 商品图库同步（写回 API）
- [ ] Task 13: 前端 UI（Dashboard + Translate + History）
- [ ] Task 14: Neon 用量追踪 + 免费额度限制

### Week 4：上线
- [ ] Task 15: 计费系统（免费/付费计划切换）
- [ ] Task 16: 提交 Shopline App Store 审核
- [ ] Task 17: 冷启动（跨境卖家微信群 / 论坛发布）

---

## 环境变量（.env）

```
# Shopline
SHOPLINE_APP_KEY=<from partner portal>
SHOPLINE_APP_SECRET=<from partner portal>
SHOPLINE_APP_URL=<cloudflare tunnel or production URL>
SHOPLINE_REDIRECT_URI=<backend URL>/api/auth/callback

# DeepL
DEEPL_API_KEY=<deepl api key>

# Lovart
LOVART_API_KEY=<lovart api key>

# Cloudinary
CLOUDINARY_CLOUD_NAME=<name>
CLOUDINARY_API_KEY=<key>
CLOUDINARY_API_SECRET=<secret>

# Neon
DATABASE_URL=<neon connection string>
```

---

## 当前状态
- GitHub: https://github.com/dalezhang-labs/imagelingo
- sp-dashboard: https://sp-dashboard-m4q6rveqf-dale-vercel.vercel.app/projects/imagelingo
- Week 1 启动中
