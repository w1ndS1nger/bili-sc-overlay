/* Shared between the content script and the small Node test suite. */
(function (root) {
  "use strict";

  // The default tiers mirror the colors returned by Bilibili's SC config API.
  const TIERS = [
    [30, "#EDF5FF", "#2A60B2", "#7497CD"],
    [50, "#DBFFFD", "#427D9E", "#7DA4BD"],
    [100, "#FFF1C5", "#E2B52B", "#ECCF75"],
    [500, "#FFEAD2", "#E09443", "#E8AF79"],
    [1000, "#FFE7E4", "#E54D4D", "#EE8B8B"],
    [2000, "#FFD8D8", "#AB1A32", "#C86A7A"]
  ];

  function hex(value, fallback) {
    return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  }

  function imageUrl(value) {
    if (typeof value !== "string" || !value) return "";
    try {
      const url = new URL(value.startsWith("http://") ? `https://${value.slice(7)}` : value);
      if (url.protocol !== "https:" || !/^(?:[a-z0-9-]+\.)*(?:hdslb\.com|biliimg\.com)$/i.test(url.hostname)) return "";
      return url.href;
    } catch { return ""; }
  }

  function colors(item, price) {
    const tier = [...TIERS].reverse().find(row => price >= row[0]) || TIERS[0];
    return {
      background: hex(item.background_color, tier[1]),
      header: hex(item.background_bottom_color, tier[2]),
      price: hex(item.background_price_color, tier[3])
    };
  }

  function dragBounds(box, viewport, size, gap) {
    const minLeft = Math.max(0, box.left + gap);
    const minTop = Math.max(0, box.top + gap);
    const right = Math.min(viewport.width, box.right - gap);
    const bottom = Math.min(viewport.height, box.bottom - gap);
    return {
      minLeft, minTop,
      maxLeft: Math.max(minLeft, right - size.width),
      maxTop: Math.max(minTop, bottom - size.height)
    };
  }

  function clampDrag(bounds, left, top) {
    const fittedLeft = Math.min(bounds.maxLeft, Math.max(bounds.minLeft, left));
    const fittedTop = Math.min(bounds.maxTop, Math.max(bounds.minTop, top));
    return {
      left: fittedLeft,
      top: fittedTop,
      x: bounds.maxLeft === bounds.minLeft ? 0 :
        (fittedLeft - bounds.minLeft) / (bounds.maxLeft - bounds.minLeft),
      y: bounds.maxTop === bounds.minTop ? 0 :
        (fittedTop - bounds.minTop) / (bounds.maxTop - bounds.minTop)
    };
  }

  const DEFAULT_SETTINGS = Object.freeze({ width: 330, height: 480, maxCards: 99, opacity: 100 });
  function sanitizeSettings(raw) {
    const input = raw && typeof raw === "object" ? raw : {};
    const range = (value, fallback, min, max) => {
      const number = Number(value);
      return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
    };
    const maxCards = Number(input.maxCards);
    return {
      width: range(input.width, DEFAULT_SETTINGS.width, 180, 520),
      height: range(input.height, DEFAULT_SETTINGS.height, 100, 700),
      maxCards: [1, 2, 3, 5, 10, 99].includes(maxCards) ? maxCards : DEFAULT_SETTINGS.maxCards,
      opacity: range(input.opacity, DEFAULT_SETTINGS.opacity, 60, 100)
    };
  }

  function normalize(raw, nowSeconds) {
    const source = Array.isArray(raw) ? raw : [];
    const seen = new Set();
    return source.flatMap((item) => {
      const id = String(item?.id ?? "");
      const end = Number(item?.end_time);
      const start = Number(item?.start_time ?? 0);
      if (!id || !Number.isFinite(end) || end <= nowSeconds ||
          !Number.isFinite(start) || start > nowSeconds || seen.has(id)) return [];
      seen.add(id);
      const price = Number(item?.price) || 0;
      return [{
        id,
        end,
        start,
        name: String(item?.user_info?.uname ?? "匿名用户"),
        message: String(item?.message ?? ""),
        price,
        avatar: imageUrl(item?.user_info?.face),
        avatarFrame: imageUrl(item?.user_info?.face_frame),
        colors: colors(item, price)
      }];
    }).sort((a, b) => b.start - a.start || b.end - a.end);
  }

  const api = { normalize, colors, imageUrl, dragBounds, clampDrag,
    DEFAULT_SETTINGS, sanitizeSettings };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.BiliScData = api;
})(globalThis);
