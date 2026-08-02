#!/usr/bin/env python3
"""CF 版索引构建: 从 mirror_catalog.jsonl 生成静态索引块 (dist/index/)。

静态块由 Pages Functions 通过 env.ASSETS 读取(无需 KV 绑定):
- dist/index/chunk_0.txt ... chunk_N.txt  全量行块
- dist/index/cat_20.txt ... cat_24.txt    分类行块
- dist/index/meta.json                    分块元数据
同时生成 KV 上传文件(可选): index/*.json + upload_kv.sh
"""
import json, os, sys

SRC = "/var/folders/ln/cjbf6g7157z5jdhxfh4mjtpc0000gn/T/opencode/mirror_catalog.jsonl"
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dist", "index")
KV_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "index")
TARGET_BYTES = 3 * 1024 * 1024  # 每块约 3MB

CAT_NAMES = {20: "电影", 21: "剧集", 22: "综艺", 23: "动漫", 24: "短剧"}


def clean(s):
    if s is None:
        return ""
    return str(s).replace("|", " ").replace("\n", " ").strip()


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(KV_DIR, exist_ok=True)
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

    # 静态块 (ASSETS 读取)
    for i, c in enumerate(chunks):
        with open(os.path.join(OUT_DIR, "chunk_%d.txt" % i), "w", encoding="utf-8") as f:
            f.write("\n".join(c) + "\n")
    for cat, rows in cats.items():
        with open(os.path.join(OUT_DIR, "cat_%s.txt" % cat), "w", encoding="utf-8") as f:
            f.write("\n".join(rows) + "\n")
    meta = {"chunks": [len(c) for c in chunks], "total": sum(len(c) for c in chunks)}
    with open(os.path.join(OUT_DIR, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, separators=(",", ":"))

    # KV 上传文件 (可选)
    for i, c in enumerate(chunks):
        path = os.path.join(KV_DIR, "chunk_%d.json" % i)
        with open(path, "w", encoding="utf-8") as f:
            json.dump([{"key": "idx:%d" % i, "value": "\n".join(c)}], f, ensure_ascii=False, separators=(",", ":"))
    for cat, rows in cats.items():
        path = os.path.join(KV_DIR, "cat_%s.json" % cat)
        with open(path, "w", encoding="utf-8") as f:
            json.dump([{"key": "cat:%s" % cat, "value": "\n".join(rows)}], f, ensure_ascii=False, separators=(",", ":"))

    sizes = [os.path.getsize(os.path.join(OUT_DIR, "chunk_%d.txt" % i)) for i in range(len(chunks))]
    print("chunks:", len(chunks), "sizes(MB):", [round(s / 1048576, 2) for s in sizes])
    print("max:", round(max(sizes) / 1048576, 2), "MB")
    for cat, rows in cats.items():
        print("cat %s (%s): %d rows" % (cat, CAT_NAMES.get(int(cat), "?"), len(rows)))
    print("total:", meta["total"])
    print("static index ->", OUT_DIR)


if __name__ == "__main__":
    sys.exit(main())

