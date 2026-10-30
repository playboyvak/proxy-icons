/*
 * Surge Panel：机场剩余流量 / 到期日
 * 只读订阅响应头 subscription-userinfo，不修改任何策略组或节点列表。
 * argument: title=名称&key=缓存键&url=<encodeURIComponent 后的订阅地址>
 * 拿不到头（订阅未启用 / 上游故障）时显示上次成功缓存。
 */
const args = {};
($argument || "").split("&").forEach(kv => { const i = kv.indexOf("="); if (i > 0) args[kv.slice(0, i)] = kv.slice(i + 1); });
const title = decodeURIComponent(args.title || "机场");
const key = "subinfo_" + (args.key || title);
const url = decodeURIComponent(args.url || "");
const icon = args.icon || "airplane.circle";
const color = args.color || "#007AFF";

function fmtB(b) {
  if (!isFinite(b) || b < 0) return "?";
  const u = ["B", "KB", "MB", "GB", "TB"]; let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return b.toFixed(i >= 3 ? 2 : 0) + u[i];
}
function fmtD(ts) {
  const d = new Date(ts * 1000), p = n => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}
function nowStr() {
  const d = new Date(), p = n => String(n).padStart(2, "0");
  return p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}
function parse(h) {
  const o = {}; h.split(";").forEach(s => { const [k, v] = s.split("=").map(x => (x || "").trim()); if (k) o[k.toLowerCase()] = Number(v); });
  return o;
}
function render(o, note) {
  const used = (o.upload || 0) + (o.download || 0), total = o.total || 0;
  const lines = [];
  if (total > 0) lines.push("已用 " + fmtB(used) + " / " + fmtB(total) + " · 剩余 " + fmtB(total - used));
  else lines.push("已用 " + fmtB(used) + " · 总量未知");
  lines.push(o.expire ? "到期 " + fmtD(o.expire) + " · 剩 " + Math.max(0, Math.ceil((o.expire * 1000 - Date.now()) / 86400000)) + " 天" : "到期 未提供");
  if (note) lines.push(note);
  return lines.join("\n");
}
function fallback(reason) {
  const c = $persistentStore.read(key);
  if (c) {
    const j = JSON.parse(c);
    $done({ title: title, content: render(j.info, reason + " · 缓存 " + j.at), icon: icon, "icon-color": "#8E8E93" });
  } else {
    $done({ title: title, content: reason + "\n暂无缓存数据", icon: icon, "icon-color": "#8E8E93" });
  }
}
function getHeader(h, name) {
  for (const k in h) if (k.toLowerCase() === name) return h[k];
  return null;
}
if (!url) fallback("未配置订阅地址");
else $httpClient.head({ url: url, headers: { "User-Agent": "Surge iOS/3000" }, timeout: 10 }, (err, resp) => {
  let h = !err && resp ? getHeader(resp.headers || {}, "subscription-userinfo") : null;
  if (h) return done(h);
  // 部分订阅 HEAD 不回头，用 GET 再试一次（只读响应，不写入节点）
  $httpClient.get({ url: url, headers: { "User-Agent": "Surge iOS/3000" }, timeout: 15 }, (e2, r2, body) => {
    const h2 = !e2 && r2 ? getHeader(r2.headers || {}, "subscription-userinfo") : null;
    if (h2) return done(h2);
    const st = r2 ? r2.status : 0;
    fallback(e2 ? "请求失败" : (st >= 500 ? "订阅暂不可用(" + st + ")" : "订阅未启用/无流量信息"));
  });
});
function done(h) {
  const o = parse(h);
  $persistentStore.write(JSON.stringify({ info: o, at: nowStr() }), key);
  $done({ title: title, content: render(o, "更新 " + nowStr()), icon: icon, "icon-color": color });
}
