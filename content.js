(() => {
  "use strict";
  let roomId = /^\/(\d+)(?:\/|$)/.exec(location.pathname)?.[1];
  if (!roomId) return;
  const POLL_MS = 6000;
  let cards = [];
  let lastRendered = "";
  let pending = false;
  let nextPoll = 0;
  let host = null;
  let list = null;
  let drag = null;
  let resize = null;
  let settings = { ...BiliScData.DEFAULT_SETTINGS };
  const positions = new Map();

  function videoElement() {
    return [...document.querySelectorAll("video")].filter(video => {
      const box = video.getBoundingClientRect();
      return box.width >= 160 && box.height >= 90 && box.bottom > 0 &&
        box.right > 0 && box.left < innerWidth && box.top < innerHeight;
    }).sort((a, b) => {
      const x = a.getBoundingClientRect(), y = b.getBoundingClientRect();
      return y.width * y.height - x.width * x.height;
    })[0];
  }

  function displayTarget() {
    const video = videoElement();
    if (!video) return null;
    const box = video.getBoundingClientRect();
    const fullscreen = document.fullscreenElement;
    if (fullscreen) {
      // Native fullscreen on <video> itself cannot contain HTML overlays.
      if (fullscreen === video) return null;
      return { parent: fullscreen, box, mode: "fullscreen" };
    }
    let ancestor = video.parentElement;
    let floating = false;
    let webFullscreen = false;
    while (ancestor && ancestor !== document.body) {
      const style = getComputedStyle(ancestor);
      const rect = ancestor.getBoundingClientRect();
      if (style.position === "fixed" && rect.width <= innerWidth * .7 &&
          rect.height <= innerHeight * .7 && rect.width >= 160) floating = true;
      if (rect.width >= innerWidth * .88 && rect.height >= innerHeight * .86 &&
          (style.position === "fixed" || style.position === "absolute")) {
        webFullscreen = true;
      }
      ancestor = ancestor.parentElement;
    }
    if (floating || (box.width < innerWidth * .5 && box.height < innerHeight * .5 &&
        (box.left > innerWidth * .45 || box.top > innerHeight * .45) &&
        !!video.closest('[class*="mini-player"], [class*="miniPlayer"], [class*="float-player"]'))) {
      return { parent: document.body, box, mode: "floating" };
    }
    if (webFullscreen || (box.width >= innerWidth * .9 && box.height >= innerHeight * .7)) {
      return { parent: document.body, box, mode: "fullscreen" };
    }
    return null;
  }

  function createHost() {
    host = document.createElement("div");
    host.setAttribute("data-bili-sc-overlay", "");
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; display: block; position: fixed; z-index: 2147483647;
        pointer-events: none; overflow: visible; }
      .list { box-sizing: border-box; display: flex; flex-direction: column; gap: 8px;
        max-height: 100%; overflow-y: auto; overscroll-behavior: contain;
        scrollbar-width: thin; pointer-events: auto; font-family: system-ui, sans-serif; }
      .card { flex: none; overflow: hidden; border-radius: 8px;
        background: var(--sc-body); box-shadow: 0 4px 18px #0008;
        overflow-wrap: anywhere; line-height: 1.42; }
      .header { display: flex; align-items: center; gap: 9px; min-height: 47px;
        box-sizing: border-box; padding: 7px 10px; background: var(--sc-header);
        color: #fff; cursor: grab; touch-action: none; user-select: none; }
      .header:active { cursor: grabbing; }
      .avatar-box { position: relative; flex: none; width: 34px; height: 34px;
        border-radius: 50%; background: #ffffff54; }
      .avatar { position: absolute; inset: 0; width: 100%; height: 100%;
        object-fit: cover; border-radius: 50%;
        border: 2px solid #ffffffb3; box-sizing: border-box; }
      .initial { display: grid; place-items: center; color: #fff; font-weight: 700;
        width: 100%; height: 100%; border-radius: 50%; }
      .frame { position: absolute; inset: -4px; width: calc(100% + 8px);
        height: calc(100% + 8px); object-fit: contain; pointer-events: none; }
      .identity { min-width: 0; flex: 1; }
      .name { display: block; font-size: 13px; font-weight: 700; overflow: hidden;
        white-space: nowrap; text-overflow: ellipsis; }
      .remaining { font-size: 11px; color: #ffffffd9; }
      .price { flex: none; padding: 3px 7px; background: var(--sc-price);
        border-radius: 4px; color: #fff; font-weight: 700; font-size: 13px; }
      .message { padding: 10px 11px 12px; color: #262b32; font-size: 14px;
        white-space: pre-wrap; }
      .more { position: sticky; bottom: 0; flex: none; padding: 5px;
        border-radius: 5px; background: #162437ef;
        color: #fff; font-size: 12px; text-align: center; }
      .resize { position: absolute; left: -5px; bottom: -5px; z-index: 2;
        width: 19px; height: 19px; border-radius: 4px 10px 4px 4px;
        background: #00aeec; box-shadow: 0 2px 7px #0007;
        cursor: nesw-resize; pointer-events: auto; touch-action: none; }
      .resize::after { content: ""; position: absolute; left: 5px; top: 5px;
        width: 7px; height: 7px; border-left: 2px solid #fff;
        border-bottom: 2px solid #fff; }
    `;
    list = document.createElement("div");
    list.className = "list";
    list.addEventListener("pointerdown", event => {
      if (event.button !== 0 || !event.target.closest(".header")) return;
      const target = displayTarget();
      if (!target || !host.isConnected) return;
      const rect = host.getBoundingClientRect();
      drag = {
        pointerId: event.pointerId,
        key: `${roomId}:${target.mode}`,
        x: event.clientX,
        y: event.clientY,
        left: rect.left,
        top: rect.top
      };
      list.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    list.addEventListener("pointermove", event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const target = displayTarget();
      if (!target || `${roomId}:${target.mode}` !== drag.key) return;
      const rect = host.getBoundingClientRect();
      const gap = target.mode === "floating" ? 7 : 16;
      const bounds = BiliScData.dragBounds(target.box,
        { width: innerWidth, height: innerHeight }, rect, gap);
      const fitted = BiliScData.clampDrag(bounds,
        drag.left + event.clientX - drag.x, drag.top + event.clientY - drag.y);
      positions.set(drag.key, { x: fitted.x, y: fitted.y });
      host.style.left = `${fitted.left}px`;
      host.style.top = `${fitted.top}px`;
      event.preventDefault();
    });
    const stopDrag = event => {
      if (drag?.pointerId === event.pointerId) drag = null;
    };
    list.addEventListener("pointerup", stopDrag);
    list.addEventListener("pointercancel", stopDrag);
    const handle = document.createElement("div");
    handle.className = "resize";
    handle.title = "拖动调整窗口宽度和最大高度";
    handle.setAttribute("role", "button");
    handle.setAttribute("aria-label", "调整留言窗口大小");
    handle.addEventListener("pointerdown", event => {
      if (event.button !== 0) return;
      const target = displayTarget();
      if (!target) return;
      resize = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        width: parseFloat(host.style.width),
        height: parseFloat(list.style.maxHeight)
      };
      handle.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    handle.addEventListener("pointermove", event => {
      if (!resize || event.pointerId !== resize.pointerId) return;
      settings = BiliScData.sanitizeSettings({
        ...settings,
        width: resize.width + resize.x - event.clientX,
        height: resize.height + event.clientY - resize.y
      });
      layout(displayTarget());
      event.preventDefault();
    });
    const stopResize = event => {
      if (!resize || event.pointerId !== resize.pointerId) return;
      resize = null;
      chrome.storage.local.set({ scOverlaySettings: settings });
    };
    handle.addEventListener("pointerup", stopResize);
    handle.addEventListener("pointercancel", stopResize);
    shadow.append(style, list, handle);
  }

  function layout(target) {
    if (!target || !cards.length) {
      host?.remove();
      lastRendered = "";
      return;
    }
    if (!host) createHost();
    if (host.parentNode !== target.parent) target.parent.append(host);
    const box = target.box;
    const gap = target.mode === "floating" ? 7 : 16;
    const width = Math.min(settings.width, box.width - gap * 2, innerWidth - gap * 2);
    host.style.width = `${width}px`;
    host.style.opacity = String(settings.opacity / 100);
    list.style.maxHeight = `${Math.min(settings.height, Math.max(60, box.height * .85))}px`;
    const visible = cards.slice(0, settings.maxCards);
    const hiddenCount = cards.length - visible.length;
    const signature = JSON.stringify(visible) + `:${hiddenCount}`;
    if (signature !== lastRendered) {
      lastRendered = signature;
      const scrollTop = list.scrollTop;
      const nodes = visible.map(card => {
      const element = document.createElement("article");
      element.className = "card";
      element.style.setProperty("--sc-body", card.colors.background);
      element.style.setProperty("--sc-header", card.colors.header);
      element.style.setProperty("--sc-price", card.colors.price);
      const header = document.createElement("div");
      header.className = "header";
      const avatarBox = document.createElement("div");
      avatarBox.className = "avatar-box";
      const initial = document.createElement("span");
      initial.className = "initial";
      initial.textContent = [...card.name][0] || "?";
      avatarBox.append(initial);
      if (card.avatar) {
        const avatar = document.createElement("img");
        avatar.className = "avatar";
        avatar.alt = "";
        avatar.referrerPolicy = "no-referrer";
        avatar.src = card.avatar;
        avatar.addEventListener("load", () => initial.remove(), { once: true });
        avatar.addEventListener("error", () => avatar.remove(), { once: true });
        avatarBox.append(avatar);
      }
      if (card.avatarFrame) {
        const frame = document.createElement("img");
        frame.className = "frame";
        frame.alt = "";
        frame.src = card.avatarFrame;
        avatarBox.append(frame);
      }
      const identity = document.createElement("div");
      identity.className = "identity";
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = card.name;
      const remaining = document.createElement("div");
      remaining.className = "remaining";
      remaining.dataset.end = String(card.end);
      identity.append(name, remaining);
      const price = document.createElement("span");
      price.className = "price";
      price.textContent = card.price > 0 ? `¥${card.price}` : "SC";
      header.append(avatarBox, identity, price);
      const message = document.createElement("div");
      message.className = "message";
      message.textContent = card.message;
      element.append(header, message);
      return element;
      });
      if (hiddenCount) {
        const more = document.createElement("div");
        more.className = "more";
        more.textContent = `另有 ${hiddenCount} 条有效留言`;
        nodes.push(more);
      }
      list.replaceChildren(...nodes);
      list.scrollTop = scrollTop;
    }
    const size = host.getBoundingClientRect();
    const bounds = BiliScData.dragBounds(box,
      { width: innerWidth, height: innerHeight }, size, gap);
    const saved = positions.get(`${roomId}:${target.mode}`) || { x: 1, y: 0 };
    host.style.left = `${bounds.minLeft + (bounds.maxLeft - bounds.minLeft) * saved.x}px`;
    host.style.top = `${bounds.minTop + (bounds.maxTop - bounds.minTop) * saved.y}px`;
  }

  function tick() {
    const currentRoom = /^\/(\d+)(?:\/|$)/.exec(location.pathname)?.[1];
    if (currentRoom !== roomId) {
      roomId = currentRoom;
      cards = [];
      lastRendered = "";
      nextPoll = 0;
      drag = null;
      resize = null;
    }
    const now = Date.now() / 1000;
    const target = roomId ? displayTarget() : null;
    const previousLength = cards.length;
    cards = cards.filter(card => card.end > now);
    if (cards.length !== previousLength) lastRendered = "";
    layout(target);
    if (target && list) {
      list.querySelectorAll("[data-end]").forEach(label => {
        label.textContent = `剩余 ${Math.max(0, Math.ceil(Number(label.dataset.end) - now))} 秒`;
      });
    }
    if (target && !pending && Date.now() >= nextPoll) fetchCards(roomId);
    if (!target) nextPoll = 0; // Return to fullscreen: refresh immediately.
  }

  function fetchCards(requestedRoom) {
    pending = true;
    nextPoll = Date.now() + POLL_MS;
    chrome.runtime.sendMessage({ type: "FETCH_SC", roomId: requestedRoom }, response => {
      pending = false;
      if (roomId !== requestedRoom) return;
      if (chrome.runtime.lastError || !response?.ok) {
        // Preserve previously fetched messages until their actual end time.
        nextPoll = Date.now() + POLL_MS;
        return;
      }
      cards = BiliScData.normalize(response.list, Date.now() / 1000);
      tick();
    });
  }

  document.addEventListener("fullscreenchange", tick);
  window.addEventListener("resize", tick);
  chrome.storage.local.get("scOverlaySettings", data => {
    settings = BiliScData.sanitizeSettings(data.scOverlaySettings);
    lastRendered = "";
    tick();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.scOverlaySettings) return;
    settings = BiliScData.sanitizeSettings(changes.scOverlaySettings.newValue);
    lastRendered = "";
    tick();
  });
  setInterval(tick, 500);
  tick();
})();
