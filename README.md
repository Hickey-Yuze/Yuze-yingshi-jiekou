# juzhi-adapter-cloudflare — 磁力猫适配器 Cloudflare 版

磁力猫(橘汁) → 苹果CMS 兼容 API 适配器，部署于 **Cloudflare Pages Functions**。
与原版 `../juzhi-adapter/server.js` 完全同构，无 Python 子进程 / 无本地文件 / 无 HTTP 监听。

## 已完成改造

| 原版障碍 | 解决 |
|---|---|
| `spawn` Python 解析 protobuf | `lib/proto.js` 纯 JS wire-format 解析器（三个 schema 按字段号提取） |
| `fs.readFileSync` 29MB 索引 | `build_index.py` 拆分 10 块 × ~3MB 静态文件 → `dist/index/`，**Functions 经 `env.ASSETS` 读取**（无需 KV 绑定） |
| `http.createServer()` | `functions/api/juzhi.js` 标准 Pages Functions handler（GET/POST/OPTIONS） |
| 内存缓存 + 落盘 json | 模块级内存缓存（搜索/列表/zone 公钥）；直链缓存可选 KV `JUZHI_CACHE`（不配也能跑） |

## 目录结构

```
functions/api/juzhi.js   # 苹果CMS 接口(路由 + 处理器, 复刻原版全部分支)
lib/proto.js             # 纯 JS protobuf: 编码(varint/lenField) + 解码 + 三 schema 提取
lib/crypto.js            # 加密常量 + MD5/SHA1/AES-256-ECB/RSA-PKCS1v1.5 + 参数构造
lib/mirror.js            # 磁力猫客户端: zone 握手 / 业务请求 / 直链解析
build_index.py           # 索引构建: 生成 dist/index/ 静态块 (chunk_N.txt / cat_N.txt / meta.json)
test.mjs                 # 本地回归测试(模拟 ASSETS, 直调 handler, 覆盖全部接口)
wrangler.jsonc           # Pages 项目配置(compatibility_flags 等)
dist/index/              # 静态索引块(构建产物, 已提交可选)
```

## 部署步骤

```bash
# 1. 构建索引 -> dist/index/ (chunk_0~9.txt, cat_20~24.txt, meta.json)
python3 build_index.py

# 2. 部署 (wrangler 4, 需已 wrangler login)
npx wrangler pages deploy dist --project-name <项目名> --branch main

# 3. 验证
curl "https://<项目名>.pages.dev/api/juzhi?ac=detail&wd=流浪地球"
```

> 注意：部署**必须用 `--branch main`**（main 是生产分支）；`--branch production` 会被当成 Preview。
> 本项目已实测：Direct Upload 部署下 KV binding 不可靠（dashboard 绑定不注入、jsonc 绑定指向错误命名空间），
> 故索引全部走 **ASSETS 静态资源**（`env.ASSETS.fetch()`），彻底绕开绑定问题。

## 本地回归

```bash
node test.mjs
```

覆盖: 分类信息 / 搜索(命中+封面) / 详情(线路分组+主线路直链) / 分页浏览(首页+末页) /
分类浏览(首末页) / 空参数回退。注意: **详情/直链用例依赖磁力猫服务端**，
服务端故障时(zone 400 / code 1010)该用例会失败, 其余用例仍应全绿。

## 可选: KV 缓存 (JUZHI_CACHE)

非必需。若配置：dashboard 绑定 `JUZHI_CACHE` 后**用 GitHub 集成部署**（Direct Upload 不注入绑定）。
KV 用途: 直链缓存(365d) / zone 公钥(30min)。索引不使用 KV。

## 对接文档

安全链路 / proto schema / 踩坑记录见原版文档（仍全部适用）：
`/var/folders/ln/cjbf6g7157z5jdhxfh4mjtpc0000gn/T/opencode/磁力猫对接文档.md`
