"use strict";

const API = "https://api.live.bilibili.com";
const roomCache = new Map();

async function getJson(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(API + path, {
      credentials: "omit",
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`接口 HTTP ${response.status}`);
    const result = await response.json();
    if (result.code !== 0) throw new Error(`接口错误 ${result.code}`);
    return result.data;
  } finally {
    clearTimeout(timer);
  }
}

chrome.runtime.onMessage.addListener((request, sender, respond) => {
  if (request?.type !== "FETCH_SC") return false;
  let pathRoom;
  try {
    const url = new URL(sender.url || "");
    pathRoom = /^\/(\d+)(?:\/|$)/.exec(url.pathname)?.[1];
    if (url.protocol !== "https:" || url.hostname !== "live.bilibili.com" ||
        !pathRoom || pathRoom !== String(request.roomId)) return false;
  } catch { return false; }

  (async () => {
    let realId = roomCache.get(pathRoom);
    if (!realId) {
      const room = await getJson(`/room/v1/Room/room_init?id=${pathRoom}`);
      realId = String(room?.room_id ?? "");
      if (!/^\d+$/.test(realId)) throw new Error("无法识别直播间");
      roomCache.set(pathRoom, realId);
    }
    const data = await getJson(`/av/v1/SuperChat/getMessageList?room_id=${realId}`);
    if (!Array.isArray(data?.list)) throw new Error("醒目留言列表格式已变化");
    return data.list;
  })().then(list => respond({ ok: true, list }), error => {
    respond({ ok: false, error: String(error?.message || error) });
  });
  return true;
});
