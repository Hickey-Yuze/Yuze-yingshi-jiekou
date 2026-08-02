import { juzhiRequest, resolvePlayUrl } from "../../lib/mirror.js";
import { parseListPage, parseDetail, parsePlayUrl } from "../../lib/proto.js";

export const config = { runtime: "nodejs" };

const CAT_NAMES = { "20": "电影", "21": "剧集", "22": "综艺", "23": "动漫", "24": "短剧" };
const PS = 24;
const SEARCH_PS = 20;

function cleanHtml(s) { return (s || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim(); }
function typeNameFor(cat) { return (cat && CAT_NAMES[cat]) || "电视剧"; }

function cmsItem(it, typeName) {
  return {
    vod_id: String(it.id), vod_name: it.name,
    vod_pic: it.cover || "", vod_remarks: it.remark,
    vod_year: String(it.year || ""), vod_class: "",
    vod_actor: "", vod_director: "",
    vod_content: "", type_name: typeName || "",
    vod_area: it.area, vod_time: "",
    vod_play_url: "1$http://placeholder.m3u8",
  };
}

/* ============ KV 索引加载 (lazy + 模块级缓存) ============ */
let idxChunks = null;   // 全量块数组(按序)
let idxMeta = null;     // { chunks: [每块行数], total }
let catCache = {};      // { [cat]: 行数组 }

async function loadAllChunks(env) {
  if (idxChunks && idxMeta) return { idxChunks, idxMeta };
  if (!env?.JUZHI_CACHE) return { idxChunks: [], idxMeta: null };
  let meta = null;
  try { meta = JSON.parse(await env.JUZHI_CACHE.get("idx:meta")); } catch {}
  if (!meta?.chunks?.length) return { idxChunks: [], idxMeta: null };
  const chunks = [];
  for (let i = 0; i < meta.chunks.length; i++) {
    try {
      const raw = await env.JUZHI_CACHE.get("idx:" + i);
      if (raw) chunks.push(raw.split("\n").filter(Boolean));
    } catch {}
  }
  idxChunks = chunks;
  idxMeta = meta;
  return { idxChunks, idxMeta };
}

async function loadCat(env, cat) {
  if (catCache[cat]) return catCache[cat];
  if (!env?.JUZHI_CACHE) return [];
  try {
    const raw = await env.JUZHI_CACHE.get("cat:" + cat);
    catCache[cat] = raw ? raw.split("\n").filter(Boolean) : [];
  } catch { catCache[cat] = []; }
  return catCache[cat];
}

function parseLine(line) {
  const [id, name, year, area, remark, cover, cat] = line.split("|");
  return { id: Number(id), name, year: Number(year) || 0, area, remark, cover, cat };
}

/* ============ 处理器 ============ */

async function handleSearch(env, wd, pg) {
  try {
    const { idxChunks, idxMeta } = await loadAllChunks(env);
    const cacheKey = "s:" + wd.toLowerCase();
    if (idxChunks.length === 0) return { code: 0, msg: "索引未加载", list: [] };
    if (env?.JUZHI_CACHE) {
      try {
        const hit = await env.JUZHI_CACHE.get(cacheKey);
        if (hit) {
          const saved = JSON.parse(hit);
          const start = (pg - 1) * SEARCH_PS;
          return {
            code: 1, msg: "数据列表", page: pg,
            pagecount: Math.ceil(saved.total / SEARCH_PS) || 1,
            limit: SEARCH_PS, total: saved.total,
            list: saved.list.slice(start, start + SEARCH_PS),
          };
        }
      } catch {}
    }
    const kw = (wd || "").toLowerCase();
    const hits = [];
    for (const chunk of idxChunks) {
      for (const line of chunk) {
        const name = line.split("|")[1] || "";
        if (!kw || name.toLowerCase().includes(kw)) {
          const it = parseLine(line);
          hits.push(cmsItem(it, typeNameFor(it.cat)));
          if (!kw && hits.length >= SEARCH_PS * 5) break;
        }
      }
      if (!kw && hits.length >= SEARCH_PS * 5) break;
    }
    const start = (pg - 1) * SEARCH_PS;
    if (env?.JUZHI_CACHE) {
      try {
        await env.JUZHI_CACHE.put(cacheKey, JSON.stringify({ total: hits.length, list: hits }), { expirationTtl: 3600 });
      } catch {}
    }
    return {
      code: 1, msg: "数据列表", page: pg,
      pagecount: Math.ceil(hits.length / SEARCH_PS) || 1,
      limit: SEARCH_PS, total: hits.length,
      list: hits.slice(start, start + SEARCH_PS),
    };
  } catch (e) {
    return { code: 0, msg: "search error: " + e.message, list: [] };
  }
}

async function handleList(env, cat, pg) {
  try {
    const { idxChunks, idxMeta } = await loadAllChunks(env);
    let rows;
    if (cat && CAT_NAMES[cat]) {
      rows = await loadCat(env, cat);
    } else if (idxMeta?.chunks?.length) {
      rows = [];
      for (const chunk of idxChunks) rows.push(...chunk);
    } else {
      return { code: 0, msg: "索引未加载", list: [] };
    }
    const start = (pg - 1) * PS;
    const list = rows.slice(start, start + PS).map((line) => {
      const it = parseLine(line);
      return cmsItem(it, cat ? typeNameFor(cat) : "");
    });
    return {
      code: 1, msg: "数据列表", page: pg,
      pagecount: Math.ceil(rows.length / PS) || 1,
      limit: PS, total: rows.length, list,
    };
  } catch (e) {
    return { code: 0, msg: "list error: " + e.message, list: [] };
  }
}

async function handleClasses(env) {
  const { idxMeta } = await loadAllChunks(env);
  return {
    code: 1, msg: "数据列表", page: 1, pagecount: 1, limit: 20,
    total: idxMeta?.total || 0,
    class: Object.entries(CAT_NAMES).map(([id, name]) => ({ type_id: id, type_name: name })),
    list: [],
  };
}

async function handleDetail(env, ids, lineNum) {
  const id = String(ids).split(",")[0];
  const { code, data } = await juzhiRequest("/api/proto/v5/drama/getDetail", "id=" + id, env);
  if (code !== 200) return { code: 0, msg: "详情失败: " + code, list: [] };
  const detail = parseDetail(data);
  if (!detail || !detail.videos) return { code: 0, msg: "解析失败", list: [] };

  const groups = new Map();
  for (const v of detail.videos) {
    if (!v.path) continue;
    const src = v.source || "KZNB";
    if (!groups.has(src)) groups.set(src, []);
    groups.get(src).push(v);
  }

  const cms = {
    vod_id: String(detail.id), vod_name: detail.name,
    vod_pic: detail.cover, vod_remarks: detail.remark,
    vod_year: String(detail.year || ""), vod_class: detail.tag || "",
    vod_actor: detail.actor, vod_director: detail.director,
    vod_content: cleanHtml(detail.intro || detail.brief),
    type_name: typeNameFor(detail.cate_type2),
    vod_area: detail.area, vod_time: detail.vod_pubdate,
    vod_play_url: "",
  };

  const srcOrder = ["KZNB", "BFZY", "hnm3u8", "ukm3u8", "wolong", "ffm3u8"];
  const reqLine = lineNum != null ? Number(lineNum) : null;

  async function resolveLine(src) {
    const list = groups.get(src);
    if (!list) return "";
    const byEp = new Map();
    for (const v of list) {
      if (v.episode <= 0) continue;
      if (!byEp.has(v.episode)) byEp.set(v.episode, v);
      else if (!v.is_vip && byEp.get(v.episode).is_vip) byEp.set(v.episode, v);
    }
    const entries = [...byEp.entries()].sort((a, b) => a[0] - b[0]);
    const CONC = 8;
    const urls = new Array(entries.length).fill(null);
    let j = 0;
    async function worker() { while (j < entries.length) { const k = j++; urls[k] = await resolvePlayUrl(src, entries[k][1].path, env); } }
    await Promise.all(Array.from({ length: CONC }, worker));
    const parts = [];
    entries.forEach(([, v], k) => { if (urls[k]) parts.push((v.title || String(v.episode)) + "$" + urls[k]); });
    return parts.join("#");
  }

  const srcGroups = [];
  if (reqLine != null) {
    const srcKeys = [...groups.keys()];
    const targetSrc = srcKeys[reqLine];
    if (targetSrc) srcGroups.push(await resolveLine(targetSrc));
  } else {
    let primarySrc = null;
    for (const src of srcOrder) { if (groups.has(src)) { primarySrc = src; break; } }
    if (!primarySrc && groups.size > 0) primarySrc = groups.keys().next().value;

    for (const [src, list] of groups) {
      const eps = [...new Set(list.map(v => v.episode))].filter(e => e > 0).sort((a, b) => a - b);
      if (src === primarySrc && primarySrc) {
        srcGroups.push("");
      } else {
        srcGroups.push(eps.map(e => e + "$http://placeholder.m3u8").join("#"));
      }
    }
    if (primarySrc) {
      const primaryIdx = [...groups.keys()].indexOf(primarySrc);
      srcGroups[primaryIdx] = (await resolveLine(primarySrc)) || "";
    }
  }
  cms.vod_play_url = srcGroups.join("$$$");
  cms.vod_play_from = [...groups.keys()].join(",");
  return { code: 1, msg: "数据列表", page: 1, pagecount: 1, limit: 1, total: 1, list: [cms] };
}

/* ============ 路由 ============ */

async function handler(req, env) {
  const u = new URL(req.url);
  if (u.searchParams.get("debug") === "1") {
    let meta = null, keyCount = 0, putTest = null, listRaw = null;
    try {
      meta = env?.JUZHI_CACHE ? await env.JUZHI_CACHE.get("idx:meta") : null;
      if (env?.JUZHI_CACHE) {
        const list = await env.JUZHI_CACHE.list({ limit: 1 });
        keyCount = list.keys.length;
        listRaw = JSON.stringify(list);
        await env.JUZHI_CACHE.put("debug:test", "1");
        putTest = await env.JUZHI_CACHE.get("debug:test");
      }
    } catch (e) { meta = "ERR:" + e.message; }
    return new Response(JSON.stringify({
      envKeys: Object.keys(env || {}),
      hasKV: !!env?.JUZHI_CACHE,
      meta, keyCount, listRaw, putTest,
    }), { headers: { "Content-Type": "application/json" } });
  }
  const ac = u.searchParams.get("ac");
  const wd = u.searchParams.get("wd");
  const ids = u.searchParams.get("ids");
  const pg = Number(u.searchParams.get("pg")) || 1;
  const t = u.searchParams.get("t");

  let result;
  try {
    if (ac === "detail" && ids) {
      result = await handleDetail(env, ids, u.searchParams.get("line"));
    } else if (ac === "detail" && wd) {
      result = await handleSearch(env, wd, pg);
    } else if (ac === "detail" && (t || u.searchParams.get("pg"))) {
      result = await handleList(env, t || "", pg);
    } else if (!ac || ac === "detail" || ac === "list") {
      result = await handleClasses(env);
    } else {
      result = { code: 0, msg: "请使用 ?ac=detail&wd=关键词 或 ?ac=detail&ids=ID", list: [] };
    }
  } catch (e) {
    result = { code: 0, msg: "handler error: " + e.message, list: [] };
  }

  return new Response(JSON.stringify(result), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
}

export async function onRequestGet(context) {
  return handler(context.request, context.env);
}

export async function onRequestPost(context) {
  return handler(context.request, context.env);
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}
