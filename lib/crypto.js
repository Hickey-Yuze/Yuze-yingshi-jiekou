import { createHash, createCipheriv, publicEncrypt, constants as cryptoConstants } from "node:crypto";

export const BASE = "http://103.45.131.38:50001";
export const PKG = "com.mxj.wylcjbxyx";
export const VC = "3023";
export const SSK = "OC1A06E197EF10CF3F6058CA7A803B5E";
const AES_K = "11GK2we32144LO&hilUITB)FMd1khdaF";
export { AES_K };

export const FIRST_LEVEL_PUB_B64 =
  "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCr8SzZhjYy+rsya1K09t8d2K50pWFoBkgUqMpKOiW+3IEVKd4eTdvg9RSOjQ82kypL6R9BnsmrS1V8s4PVDwjQbUtYhTPPC9Hz16qY7rpD6m0d2vr09/UpWQ5uOy9PR0QTrsioveZ+DIe9jc3C+zBCu/kZSY/R8stwJoiitki3gwIDAQAB";

/* base64 DER -> PEM */
export function pubToPem(b64) {
  const m = b64.match(/.{1,64}/g);
  const lines = m ? m.join("\n") : "";
  return "-----BEGIN PUBLIC KEY-----\n" + lines + "\n-----END PUBLIC KEY-----\n";
}

export const WYL_CERT_B64 =
  "MIIDHDCCAgSgAwIBAgIKWU0AAAAAANljozANBgkqhkiG9w0BAQsFADAbMQswCQYDVQQGEwJDTjEM" +
  "MAoGA1UEAwwDd3lsMCAXDTI2MDYzMDIzMjIxMloYDzIwNTEwNzAxMjMyMjEyWjAbMQswCQYDVQQG" +
  "EwJDTjEMMAoGA1UEAwwDd3lsMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA5mEVWjg0" +
  "SH9g5uLuaeHgvQmwjgL3309b9VErVVNk4OSj2DUrck/iUFkmxxDEqefOMa08/SlcjifCjd689N6D" +
  "lyAPCm5FxIcVaZyUoAoFPADJ0kzoqZ0Oze6ACPM8a1GXnUIHMak9vcff7RKa9BO0CgmRuwzhv7n2" +
  "+dmckSZL4YKcg4B/VpeDhB9Edhx2qLI4KQIfMBnlyYWmHoCimy+JOwyfgkgbqaVddBdjJj3XVsKC" +
  "C4UKk11foKZuiPblstui2gM3+YJEvSdZ8EnelLIg779FPccK4fVizH7MQgl62c843akIOIgAsrdr" +
  "qaJcRBaxIgrs/iNFp93sSPzInfISxwIDAQABo2AwXjAMBgNVHRMBAf8EAjAAMB8GA1UdIwQYMBaA" +
  "FCpaoXNfj7oNv0XCe2ULaZAZ5NjZMB0GA1UdDgQWBBQqWqFzX4+6Db9FwntlC2mQGeTY2TAOBgNV" +
  "HQ8BAf8EBAMCB4AwDQYJKoZIhvcNAQELBQADggEBAI104Tjh7NsLVKukHgJLAo/cCt5i0/ZS0Nq6" +
  "8vWwrM323lwNBWl19tv5UcrzppV39UlMYTy82gnq9FwqQB2nCwY0Xc6VSNH6EnjZ5LaCWkiMs4qn" +
  "Ua8oMVUO8aVRBwYh2mZ9EbQoCUDjd4FRKLtTowsgrF+vmR6r8dVaUecUHCTanVAP+lLoxDXS/lPk" +
  "ahoWqiVZfmXsb68xJhJvw0KObaRuBmuuSl3SFFF4DYU/8IU8QLWywo8rtAhOwLhd1eFrTUNy8pEg" +
  "P06ZaYjdNtGYKtx44Jdg/qZbEsd7+F+cWayQsowNn4BZcVNuXgb61ZkrG/p/IfuaRCy0CR5zwf1P" +
  "Eoo=";

/* 设备参数(逆向自 APK; 内容服务器不校验, 保持与 App 一致即可) */
export const REAL = {
  _vOsCode: "36", abid: "7722", androidID: "d4c878afdf441117",
  appName: "%E6%A9%98%E6%B1%81", brand: "Redmi", carrier: "%E7%94%B5%E4%BF%A1",
  chid: "10000", country: "CN", cpu: "arm64-v8a", cpuId: "",
  density: "3.25", device: 0, dpi: "520", facturer: "Xiaomi", lang: "zh",
  mac: "02%3A00%3A00%3A00%3A00%3A00", model: "2604FRK1EC", net: "1",
  pkg: PKG, plat: "android", resolution: "1280x2568", tenantId: "*",
  udid: "F850571F2D335A133D8AAB7805B1E556", uuid: "F850571F2D335A133D8AAB7805B1E556",
  v: 1, vApp: VC, vName: "3.0.2.3", vOs: "16", young: 0,
};

const CHARSET = "1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export function md5Hex(buf) {
  return createHash("md5").update(buf).digest("hex").toUpperCase();
}

export function sha1Hex(buf) {
  return createHash("sha1").update(buf).digest("hex").toUpperCase();
}

export function aesEcb(keyStr, buf) {
  const key = Buffer.from(keyStr, "utf8");
  const c = createCipheriv("aes-256-ecb", key, null);
  c.setAutoPadding(false);
  const pad = 16 - (buf.length % 16);
  const padded = Buffer.concat([buf, Buffer.alloc(pad, pad)]);
  return Buffer.concat([c.update(padded), c.final()]);
}

export function rsaEnc(pubPem, text) {
  return publicEncrypt(
    { key: pubPem, padding: cryptoConstants.RSA_PKCS1_PADDING },
    Buffer.from(text, "utf8"),
  );
}

export function randStr(n) {
  let s = "";
  for (let i = 0; i < n - 1; i++) {
    s += CHARSET[Math.floor(Math.random() * CHARSET.length)];
  }
  return s + "=";
}

export function uriEncodeAll(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = encodeURIComponent(String(v));
  }
  return out;
}

export function gsonEscape(s) {
  return s
    .replace(/=/g, "\\u003d")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}
