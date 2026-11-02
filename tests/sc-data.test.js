const { test } = require("node:test");
const assert = require("node:assert/strict");
const { normalize, dragBounds, clampDrag, sanitizeSettings } = require("../sc-data.js");

test("only current SCs survive; duplicates are removed", () => {
  const at = 200;
  const rows = [
    { id: 1, start_time: 150, end_time: 201, message: "有效", price: 30, user_info: { uname: "甲" } },
    { id: 1, start_time: 150, end_time: 201, message: "重复" },
    { id: 2, start_time: 100, end_time: 200, message: "刚到期" },
    { id: 3, start_time: 201, end_time: 260, message: "未开始" },
    { id: 4, start_time: 150, end_time: "oops", message: "时间错误" }
  ];
  assert.deepEqual(normalize(rows, at), [
    { id: "1", end: 201, start: 150, name: "甲", message: "有效", price: 30,
      avatar: "", avatarFrame: "",
      colors: { background: "#EDF5FF", header: "#2A60B2", price: "#7497CD" } }
  ]);
});

test("1000-yuan SC gets red defaults and avatar; valid per-card colors take priority", () => {
  const rows = normalize([{
    id: 9, start_time: 150, end_time: 300, price: 1000,
    background_color: "#faeeee", background_bottom_color: "invalid",
    user_info: { uname: "阿紫", face: "http://i0.hdslb.com/bfs/face/avatar.jpg" }
  }], 200);
  assert.deepEqual(rows[0].colors, {
    background: "#faeeee", header: "#E54D4D", price: "#EE8B8B"
  });
  assert.equal(rows[0].avatar, "https://i0.hdslb.com/bfs/face/avatar.jpg");
});

test("ignore untrusted avatar locations and CSS color strings", () => {
  const rows = normalize([{
    id: 10, start_time: 150, end_time: 300, price: 50,
    background_bottom_color: "red; background: url(https://example.com)",
    user_info: { face: "https://example.com/face.png", face_frame: "javascript:alert(1)" }
  }], 200);
  assert.equal(rows[0].avatar, "");
  assert.equal(rows[0].avatarFrame, "");
  assert.equal(rows[0].colors.header, "#427D9E");
});

test("dragging clamps the whole card within the video and viewport", () => {
  const video = { left: 100, top: 50, right: 500, bottom: 350 };
  const viewport = { width: 480, height: 320 };
  const size = { width: 200, height: 100 };
  const bounds = dragBounds(video, viewport, size, 10);
  assert.deepEqual(bounds, { minLeft: 110, maxLeft: 280, minTop: 60, maxTop: 220 });
  assert.deepEqual(clampDrag(bounds, 600, -100), { left: 280, top: 60, x: 1, y: 0 });
  assert.deepEqual(clampDrag(bounds, 195, 140), { left: 195, top: 140, x: .5, y: .5 });
});

test("saved settings normalize invalid values and permit all active messages", () => {
  assert.deepEqual(sanitizeSettings({ width: 800, height: 50, maxCards: "99", opacity: 20 }),
    { width: 520, height: 100, maxCards: 99, opacity: 60 });
  assert.deepEqual(sanitizeSettings({ maxCards: 4 }),
    { width: 330, height: 480, maxCards: 99, opacity: 100 });
});
