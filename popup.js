(() => {
  "use strict";
  const ids = ["width", "height", "maxCards", "opacity"];
  const inputs = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));

  function paint(settings) {
    for (const id of ids) inputs[id].value = String(settings[id]);
    document.getElementById("widthValue").textContent = `${settings.width} px`;
    document.getElementById("heightValue").textContent = `${settings.height} px`;
    document.getElementById("opacityValue").textContent = `${settings.opacity}%`;
  }

  function save() {
    const settings = BiliScData.sanitizeSettings(
      Object.fromEntries(ids.map(id => [id, inputs[id].value])));
    paint(settings);
    chrome.storage.local.set({ scOverlaySettings: settings });
  }

  chrome.storage.local.get("scOverlaySettings", data => {
    paint(BiliScData.sanitizeSettings(data.scOverlaySettings));
    for (const id of ids) inputs[id].addEventListener("input", save);
    document.getElementById("reset").addEventListener("click", () => {
      paint(BiliScData.DEFAULT_SETTINGS);
      chrome.storage.local.set({ scOverlaySettings: { ...BiliScData.DEFAULT_SETTINGS } });
    });
  });
})();
