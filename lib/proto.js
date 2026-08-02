export function varint(n) {
  const out = [];
  while (n > 0x7f) { out.push((n & 0x7f) | 0x80); n = Math.floor(n / 128); }
  out.push(n);
  return out;
}

export function lenField(fn, buf) {
  const tag = (fn << 3) | 2;
  return Uint8Array.from([tag, ...varint(buf.length), ...buf]);
}

export function varintField(fn, n) {
  const tag = (fn << 3) | 0;
  return Uint8Array.from([tag, ...varint(n)]);
}

function decodeVarint(buf, start) {
  let v = 0n, sh = 0n, i = start;
  while (i < buf.length) {
    const b = buf[i++];
    v |= BigInt(b & 0x7f) << sh;
    if (!(b & 0x80)) return { v: v > 0x7fffffffffffffffn ? v : Number(v), end: i };
    sh += 7n;
  }
  return { v: 0, end: start };
}

export function decodeMsg(buf) {
  const fields = [];
  let i = 0;
  while (i < buf.length) {
    const tag = buf[i++];
    const fn = tag >> 3, wt = tag & 7;
    if (wt === 0) {
      const r = decodeVarint(buf, i);
      fields.push([fn, 0, r.v]); i = r.end;
    } else if (wt === 2) {
      const r = decodeVarint(buf, i);
      const l = Number(r.v); i = r.end;
      fields.push([fn, 2, buf.subarray(i, i + l)]); i += l;
    } else if (wt === 1) {
      const dv = new DataView(buf.buffer, buf.byteOffset + i, 8);
      fields.push([fn, 1, Number(dv.getBigUint64(0, true))]); i += 8;
    } else if (wt === 5) {
      const dv = new DataView(buf.buffer, buf.byteOffset + i, 4);
      fields.push([fn, 5, dv.getUint32(0, true)]); i += 4;
    } else if (wt === 3) {
      fields.push([fn, 3, null]); i = skipGroup(buf, i);
    } else {
      break;
    }
  }
  return fields;
}

function skipGroup(buf, i) {
  while (i < buf.length) {
    const tag = buf[i++];
    const wt = tag & 7;
    if (wt === 0) return decodeVarint(buf, i).end;
    if (wt === 1) return i + 8;
    if (wt === 5) return i + 4;
    if (wt === 2) return i + Number(decodeVarint(buf, i).v);
    if (wt === 4) return i;
  }
  return i;
}

export function getFields(fields, fn) { return fields.filter((f) => f[0] === fn).map((f) => f[2]); }
export function getField(fields, fn, dflt) {
  for (const f of fields) if (f[0] === fn) return f[2];
  return dflt;
}

export function bytesToStr(b, dflt = "") {
  if (typeof b === "string") return b;
  if (b instanceof Uint8Array) {
    try { return new TextDecoder("utf-8", { fatal: false }).decode(b); } catch { return dflt; }
  }
  return dflt;
}

/* ============ schema 提取 ============ */

function coverImage(fields) {
  if (!fields || !fields.length) return {};
  return {
    path: bytesToStr(getField(fields, 1)),
    thumbnail_path: bytesToStr(getField(fields, 2)),
  };
}

/* DramaBeanPage: dramaBean=1(rep), total=16 */
export function parseListPage(buf) {
  const fields = decodeMsg(buf);
  const items = [];
  for (const raw of getFields(fields, 1)) {
    if (!(raw instanceof Uint8Array)) continue;
    const b = decodeMsg(raw);
    const cv = coverImage(getField(b, 2, null));
    items.push({
      id: getField(b, 3, 0),
      name: bytesToStr(getField(b, 5)),
      area: bytesToStr(getField(b, 1)),
      cover: cv.path || cv.thumbnail_path,
      cover_thumb: cv.thumbnail_path,
      brief: bytesToStr(getField(b, 4)),
      director: bytesToStr(getField(b, 7)),
      type: getField(b, 8, 0),
      cate_type2: getField(b, 9, 0),
      update_time: getField(b, 10, 0),
      vod_pubdate: bytesToStr(getField(b, 11)),
      actor: bytesToStr(getField(b, 12)),
      remark: bytesToStr(getField(b, 13)),
      year: getField(b, 14, 0),
      clazz: bytesToStr(getField(b, 15)),
      stars: getField(b, 6, 0),
    });
  }
  return { items, total: getField(fields, 16, 0) };
}

/* DramaVideoBean: id=1 title=2 path=4 size=5 time=6 format=7 type=8 source=9 source_cn=10 episode=13 is_vip=14 drama_id=15 priority=16 season=12 */
function videoItem(raw) {
  if (!(raw instanceof Uint8Array)) return null;
  const b = decodeMsg(raw);
  return {
    title: bytesToStr(getField(b, 2)),
    title_old: bytesToStr(getField(b, 3)),
    path: bytesToStr(getField(b, 4)),
    size: getField(b, 5, 0),
    time: getField(b, 6, 0),
    format: bytesToStr(getField(b, 7)),
    type: getField(b, 8, 0),
    source: bytesToStr(getField(b, 9)),
    source_cn: bytesToStr(getField(b, 10)),
    episode: getField(b, 13, 0),
    is_vip: getField(b, 14, 0),
    drama_id: getField(b, 15, 0),
    priority: getField(b, 16, 0),
    season: getField(b, 12, 0),
  };
}

/* DramaDetailBean: 见 schema */
export function parseDetail(buf) {
  const b = decodeMsg(buf);
  const cv = coverImage(getField(b, 2, null));
  const videos = [];
  for (const raw of getFields(b, 29)) {
    const v = videoItem(raw);
    if (v) videos.push(v);
  }
  return {
    id: getField(b, 4, 0),
    name: bytesToStr(getField(b, 9)),
    area: bytesToStr(getField(b, 1)),
    cover: cv.path || cv.thumbnail_path,
    cover_thumb: cv.thumbnail_path,
    intro: bytesToStr(getField(b, 6)),
    brief: bytesToStr(getField(b, 7)),
    director: bytesToStr(getField(b, 12)),
    type: getField(b, 14, 0),
    cate_type2: getField(b, 15, 0),
    cate_type1: getField(b, 16, 0),
    update_time: getField(b, 17, 0),
    year: getField(b, 18, 0),
    vod_pubdate: bytesToStr(getField(b, 28)),
    actor: bytesToStr(getField(b, 25)),
    remark: bytesToStr(getField(b, 26)),
    tag: bytesToStr(getField(b, 13)),
    keyword: bytesToStr(getField(b, 23)),
    is_end: getField(b, 27, 0),
    season: getField(b, 33, 0),
    serial: getField(b, 34, 0),
    vip: getField(b, 35, 0),
    hot: getField(b, 36, 0),
    like: getField(b, 8, 0),
    hits: getField(b, 19, 0),
    videos,
  };
}

/* ParsePlayUrlBean: play_url=1 fit_mode=2 timeout=4 direct=5 msg=9 */
export function parsePlayUrl(buf) {
  const b = decodeMsg(buf);
  return {
    play_url: bytesToStr(getField(b, 1)),
    fit_mode: getField(b, 2, 0),
    timeout: getField(b, 4, 0),
    direct: getField(b, 5, 0),
    msg: bytesToStr(getField(b, 9)),
  };
}
