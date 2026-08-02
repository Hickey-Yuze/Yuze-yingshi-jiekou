#!/usr/bin/env python3
"""CF 版索引构建: 从 mirror_catalog.jsonl 生成 KV 分块 + bulk 上传文件。

输出到 index/ 目录:
- chunk_0.json ... chunk_N.json  全量行块 (wrangler kv:bulk 上传文件, <25MB)
- cat_20.json ... cat_24.json    分类行块
- meta.json                      分块元数据 { chunks: [每块行数], total }
- upload.sh                      一键上传命令
"""
import json, os, sys

SRC = "/var/folders/ln/cjbf6g7157z5jdhxfh4mjtpc0000gn/T/opencode/mirror_catalog.jsonl"
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "index")
TARGET_BYTES = 3 * 1024 * 1024  # 每块约 3MB

CAT_NAMES = {20: "电影", 21: "剧集", 22: "综艺", 23: "动漫", 24: "短剧"}


def clean(s):
    if s is None:
        return ""
    return str(s).replace("|", " ").replace("\n", " ").strip()


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    cats = {}
    chunks = []
    cur = []
    cur_bytes = 0

    with open(SRC, encoding="utf-8") as f:
        for line in f:
            d = json.loads(line)
            cat = d.get("cate_type2")
            if cat not in CAT_NAMES:
                continue
            fields = [
                d["id"],
                clean(d.get("name")),
                d.get("year", 0),
                clean(d.get("area")),
                clean(d.get("remark")),
                clean(d.get("cover")),
                cat,
            ]
            row = "|".join(str(x) for x in fields)
            cats.setdefault(str(cat), []).append(row)
            cur.append(row)
            cur_bytes += len(row.encode("utf-8")) + 1
            if cur_bytes >= TARGET_BYTES:
                chunks.append(cur)
                cur = []
                cur_bytes = 0
    if cur:
        chunks.append(cur)

    # meta.json
    meta = {"chunks": [len(c) for c in chunks], "total": sum(len(c) for c in chunks)}
    with open(os.path.join(OUT_DIR, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, separators=(",", ":"))

    # 全量分块 (wrangler kv:bulk JSON 格式)
    for i, c in enumerate(chunks):
        path = os.path.join(OUT_DIR, "chunk_%d.json" % i)
        with open(path, "w", encoding="utf-8") as f:
            json.dump([{"key": "idx:%d" % i, "value": "\n".join(c)} for c in [c]], f, ensure_ascii=False, separators=(",", ":"))

    # 分类块
    for cat, rows in cats.items():
        path = os.path.join(OUT_DIR, "cat_%s.json" % cat)
        with open(path, "w", encoding="utf-8") as f:
            json.dump([{"key": "cat:%s" % cat, "value": "\n".join(rows)}], f, ensure_ascii=False, separators=(",", ":"))

    # 上传脚本
    lines = ["#!/bin/bash", "set -e", "KV=JUZHI_CACHE", ""]
    for i in range(len(chunks)):
        lines.append('wrangler kv:bulk put --binding "$KV" index/chunk_%d.json' % i)
    for cat in cats:
        lines.append('wrangler kv:bulk put --binding "$KV" index/cat_%s.json' % cat)
    up = os.path.join(os.path.dirname(os.path.abspath(__file__)), "upload_kv.sh")
    with open(up, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    os.chmod(up, 0o755)

    sizes = [os.path.getsize(os.path.join(OUT_DIR, "chunk_%d.json" % i)) for i in range(len(chunks))]
    print("chunks:", len(chunks), "sizes(MB):", [round(s / 1048576, 2) for s in sizes])
    print("max:", round(max(sizes) / 1048576, 2), "MB")
    for cat, rows in cats.items():
        print("cat %s (%s): %d rows" % (cat, CAT_NAMES.get(int(cat), "?"), len(rows)))
    print("total:", meta["total"])
    print("done ->", up)


if __name__ == "__main__":
    sys.exit(main())
