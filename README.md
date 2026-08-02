# juzhi-adapter-cloudflare — 磁力猫适配器 Cloudflare 版

磁力猫(橘汁) → 苹果CMS 兼容 API 适配器，部署于 **Cloudflare Pages Functions**。
与原版 `../juzhi-adapter/server.js` 完全同构，无 Python 子进程 / 无本地文件 / 无 HTTP 监听。

## 已完成改造

| 原版障碍 | 解决 |
|---|---|
| `spawn` Python 解析 protobuf | `lib/proto.js` 纯 JS wire-format 解析器（三个 schema 按字段号提取，已验证与 protoc 输出字段一致） |
| `fs.readFileSync` 29MB 索引 | `build_index.py` 拆分 10 块 × ~3MB（均 <25MB 限制），存 **KV**，搜索/浏览按块加载 |
| `http.createServer()` | `functions/api/juzhi.js` 标准 Pages Functions handler（GET/POST/OPTIONS） |
| 内存缓存 + 落盘 json | **KV `JUZHI_CACHE`**：直链(365d) / zone 公钥(30min) / 搜索结果(1h) |

## 目录结构

```
functions/api/juzhi.js   # 苹果CMS 接口(路由 + 处理器, 复刻原版全部分支)
lib/proto.js             # 纯 JS protobuf: 编码(varint/lenField) + 解码 + 三 schema 提取
lib/crypto.js            # 加密常量 + MD5/SHA1/AES-256-ECB/RSA-PKCS1v1.5 + 参数构造
lib/mirror.js            # 磁力猫客户端: zone 握手 / 业务请求 / 直链解析(带 KV 缓存)
build_index.py           # 索引构建: 生成 index/chunk_N.json + index/cat_*.json + index/meta.json + upload_kv.sh
test.mjs                 # 本地回归测试(模拟 KV, 直调 handler, 覆盖全部接口)
wrangler.jsonc           # Pages 项目配置(KV binding)
upload_kv.sh             # 一键上传索引到 KV (由 build_index.py 生成)
```

## 部署步骤

```bash
# 1. 构建索引(可选, 已提交产物也行)
python3 build_index.py          # 生成 index/ 目录 + upload_kv.sh

# 2. 创建 KV 并绑定
wrangler kv namespace create JUZHI_CACHE   # 得到的 id 填入 wrangler.jsonc

# 3. 上传索引
./upload_kv.sh                  # 10 块全量 + 5 块分类 + 无 meta(meta.json 需单独 put)
#   注: meta.json 需手动: wrangler kv key put --binding JUZHI_CACHE "idx:meta" "$(cat index/meta.json)"

# 4. 本地开发
npm i
wrangler pages dev --kv JUZHI_CACHE   # 访问 http://localhost:8788/api/juzhi?ac=detail

# 5. 部署 (GitHub 连接 Pages 项目, 构建命令留空, 输出目录 dist)
wrangler pages deploy .            # 或 git push 自动部署
```

部署后视频源 url 填: `https://<project>.pages.dev/api/juzhi`

## 本地回归

```bash
node test.mjs
```

覆盖: 分类信息 / 搜索(命中+封面) / 详情(线路分组+主线路直链) / 分页浏览(首页+末页) /
分类浏览(首末页) / 空参数回退。注意: **详情/直链用例依赖磁力猫服务端**，
服务端故障时(zone 400 / code 1010)该用例会失败, 其余用例仍应全绿。

## KV Key 一览

| Key | 内容 | TTL |
|---|---|---|
| `idx:0..9` | 全量索引行块(id\|name\|year\|area\|remark\|cover\|cat) | 永久 |
| `idx:meta` | `{"chunks":[行数...],"total":N}` | 永久 |
| `cat:20..24` | 各分类行块 | 永久 |
| `playurl:<src>:<path>` | 视频直链 | 365d |
| `meta:zone` | zone 公钥 | 30min |
| `s:<kw>` | 搜索结果 JSON | 1h |

## 对接文档

安全链路 / proto schema / 踩坑记录见原版文档（仍全部适用）：
`/var/folders/ln/cjbf6g7157z5jdhxfh4mjtpc0000gn/T/opencode/磁力猫对接文档.md`
