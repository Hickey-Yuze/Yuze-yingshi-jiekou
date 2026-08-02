import { readFileSync } from "node:fs";
import { onRequestGet } from "./functions/api/yuze.js";

class Assets {
  async fetch(url) {
    const p = new URL(url).pathname;
    try {
      const body = readFileSync("./dist" + p, "utf8");
      return { ok: true, text: async () => body };
    } catch {
      return { ok: false, text: async () => "" };
    }
  }
}

const env = { ASSETS: new Assets() };

async function call(query) {
  const req = new Request("http://localhost/api/yuze?" + query);
  const res = await onRequestGet({ request: req, env, waitUntil() {} });
  return JSON.parse(await res.text());
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let pass = 0, fail = 0;
  const check = (name, cond, extra = "") => {
    if (cond) { pass++; console.log("PASS", name); }
    else { fail++; console.log("FAIL", name, extra); }
  };

  /* 1. classes */
  const classes = await call("ac=detail");
  check("classes has 5 cats", classes.class?.length === 5, JSON.stringify(classes.class?.map(c => c.type_name)));

  /* 2. search */
  const s = await call("ac=detail&wd=流浪地球");
  check("search hits", s.total > 0 && s.list.length > 0, "total=" + s.total);
  if (s.list?.length) {
    const it = s.list[0];
    check("search item fields", it.vod_id && it.vod_name && it.type_name, JSON.stringify(it).slice(0, 200));
    check("search cover", /^https?:/.test(it.vod_pic), it.vod_pic?.slice(0, 80));

    /* 3. detail (真实磁力猫请求) */
    const d = await call("ac=detail&ids=" + it.vod_id);
    check("detail code", d.code === 1, JSON.stringify(d).slice(0, 200));
    if (d.code === 1) {
      const c = d.list[0];
      check("detail name match", c.vod_name === it.vod_name, `${c.vod_name} vs ${it.vod_name}`);
      check("detail vod_play_from", !!c.vod_play_from && c.vod_play_from.split(",").length > 0, c.vod_play_from);
      const groups = c.vod_play_url.split("$$$");
      check("detail primary line has real urls",
        groups.some(g => /https?:\/\/.+\.m3u8/.test(g)),
        c.vod_play_url.slice(0, 150));
      check("detail from count matches groups", c.vod_play_from.split(",").length === groups.length,
        `${c.vod_play_from} vs ${groups.length} groups`);
      /* 4. line=1 */
      const d2 = await call("ac=detail&ids=" + it.vod_id + "&line=1");
      const c2 = d2.list?.[0];
      check("detail line=1 has urls", d2.code === 1 && c2 && /https?:\/\/.+\.m3u8/.test(c2.vod_play_url),
        c2?.vod_play_url?.slice(0, 100));
    }
  }

  /* 5. list 全量分页 */
  const l1 = await call("ac=detail&pg=1");
  check("list pg1 24 items", l1.list?.length === 24, "len=" + l1.list?.length);
  check("list pagecount", l1.pagecount > 9000, "pagecount=" + l1.pagecount);
  const l2 = await call("ac=detail&pg=9155");
  check("list last page", l2.list?.length >= 1 && l2.list?.length <= 24, "len=" + l2.list?.length);

  /* 6. 分类浏览 */
  const c20 = await call("ac=detail&t=20&pg=1");
  check("cat 20 (电影) 24 items", c20.list?.length === 24, "len=" + c20.list?.length);
  const c20t = await call("ac=detail&t=20&pg=" + (c20.pagecount || 1));
  check("cat 20 last page ok", c20t.code === 1, JSON.stringify(c20t).slice(0, 100));

  /* 7. 空关键词 = classes(与原版一致: wd="" 为 falsy) */
  const empty = await call("ac=detail&wd=");
  check("empty wd falls to classes", empty.class?.length === 5 && empty.list?.length === 0,
    "class=" + empty.class?.length + " list=" + empty.list?.length);

  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("TEST ERROR:", e); process.exit(1); });
