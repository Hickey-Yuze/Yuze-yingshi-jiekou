import {
  BASE, PKG, VC, SSK, AES_K,
  FIRST_LEVEL_PUB_B64, pubToPem, WYL_CERT_B64, REAL,
  md5Hex, sha1Hex, aesEcb, rsaEnc, randStr,
  uriEncodeAll, gsonEscape,
} from "./crypto.js";
import { varintField, lenField, decodeMsg, getField, bytesToStr, parsePlayUrl as parsePlayUrlData } from "./proto.js";

export const USER_AGENT = "okhttp/4.11.0";

/* safeCode = MD5(cert)######SHA1(cert)~~~~~~pkg>>>+++vc (两层 b64 + 截取) */
const WYL_CERT = Buffer.from(WYL_CERT_B64, "base64");
function computeSafeCode() {
  const deviceId = md5Hex(WYL_CERT) + "######" + sha1Hex(WYL_CERT) + "~~~~~~" + PKG + ">>>+++" + VC;
  const inner = aesEcb(AES_K, Buffer.from(deviceId, "utf8")).toString("base64");
  const outer = Buffer.from(inner, "utf8").toString("base64");
  return (outer.slice(0, 16) + outer.slice(-16)).toUpperCase();
}
const SAFE_CODE = computeSafeCode();

export async function rawPost(path, body, publicParamsHdr, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(BASE + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-protobuf",
        "Accept": "application/x-protobuf",
        "User-Agent": USER_AGENT,
        "publicParams": publicParamsHdr,
      },
      body,
      signal: ctrl.signal,
    });
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

/* zone: 内存 30 分钟 + KV 恢复 (Workers 多实例无共享内存) */
let zonePub = null;
let zonePubAt = 0;

async function zone(env) {
  const now = Date.now();
  if (zonePub && now - zonePubAt < 30 * 60 * 1000) return zonePub;
  if (env?.JUZHI_CACHE) {
    try {
      const cached = await env.JUZHI_CACHE.get("meta:zone");
      if (cached) { zonePub = cached; zonePubAt = now; return zonePub; }
    } catch {}
  }
  const ts = now;
  const rnd = randStr(16);
  const sign = rsaEnc(pubToPem(FIRST_LEVEL_PUB_B64), ts + "" + rnd);
  const body = Buffer.concat([
    varintField(1, ts),
    lenField(2, sign),
    lenField(3, Buffer.from(randStr(16))),
    lenField(4, Buffer.from(rnd)),
    lenField(5, Buffer.from(randStr(16))),
  ]);
  const hdr = gsonEscape(JSON.stringify(uriEncodeAll(REAL)));
  const res = await rawPost("/api/v5/find/app/zone", body, hdr);
  const fields = decodeMsg(res);
  const rsaBuf = getField(fields, 3, Buffer.alloc(0));
  const parts = {};
  for (const [fn, wt, v] of decodeMsg(rsaBuf)) {
    if (wt === 2) parts[fn] = bytesToStr(v);
  }
  zonePub = (parts[2] || "") + (parts[3] || "") + (parts[4] || "") + (parts[5] || "");
  zonePubAt = Date.now();
  if (env?.JUZHI_CACHE) {
    try { await env.JUZHI_CACHE.put("meta:zone", zonePub, { expirationTtl: 1800 }); } catch {}
  }
  return zonePub;
}

/* 业务请求: 返回 { code, msg, data } */
export async function juzhiRequest(apiPath, paramsStr, env) {
  const pub = await zone(env);
  const ts = Date.now();
  const rnd = randStr(16);
  const sig = rsaEnc(pubToPem(pub), ts + "" + rnd + VC);
  const aesFull = aesEcb(Buffer.from(SSK), Buffer.from(ts + "" + rnd, "utf8")).toString("base64");
  const m = {
    ...uriEncodeAll(REAL),
    timestamp: ts, random_str: rnd, sig,
    sig2: aesFull.slice(0, 8), sig3: aesFull.slice(8),
  };
  const hdr = gsonEscape(JSON.stringify(m));

  const aesFull2 = aesEcb(Buffer.from(SAFE_CODE), Buffer.from(paramsStr + ts, "utf8")).toString("base64");
  const r8 = randStr(8);
  const combined = r8 + aesFull2;
  const f1 = combined.slice(0, 20), f2 = combined.slice(20);
  const body = Buffer.concat([
    lenField(1, Buffer.from(f1)),
    lenField(2, Buffer.from(f2)),
    lenField(3, Buffer.from(randStr(20))),
    varintField(4, ts),
    lenField(5, Buffer.from(r8)),
  ]);
  const data = await rawPost(apiPath, body, hdr);
  const fields = decodeMsg(data);
  return {
    code: Number(getField(fields, 1, 0)),
    msg: bytesToStr(getField(fields, 2)),
    data: getField(fields, 3, Buffer.alloc(0)),
  };
}

/* 直链: KV 优先, 失败重试 3 次 (直链实测永久有效) */
export async function resolvePlayUrl(source, videoPath, env, retries = 3) {
  const key = "playurl:" + source + ":" + videoPath;
  if (env?.JUZHI_CACHE) {
    try {
      const hit = await env.JUZHI_CACHE.get(key);
      if (hit) return hit;
    } catch {}
  }
  for (let a = 0; a < retries; a++) {
    try {
      const { code, data } = await juzhiRequest(
        "/api/proto/v5/videoUsableUrl",
        "vodPlayFrom=" + source + "&playUrl=" + encodeURIComponent(videoPath),
        env,
      );
      if (code === 200 && data.length > 4) {
        const parsed = parsePlayUrlData(data);
        if (parsed && parsed.play_url) {
          if (env?.JUZHI_CACHE) {
            try { await env.JUZHI_CACHE.put(key, parsed.play_url, { expirationTtl: 60 * 60 * 24 * 365 }); } catch {}
          }
          return parsed.play_url;
        }
      }
    } catch (e) {
      if (a === retries - 1) console.error("resolvePlayUrl fail:", source, videoPath, e.message);
    }
    await new Promise((r) => setTimeout(r, 300 * (a + 1)));
  }
  return null;
}
