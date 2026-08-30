// utils/config.js

export const config = {
  suspendAfterMs: 60 * 60 * 1000,
  checkIntervalMs: 5 * 60 * 1000,
  autosaveIntervalMs: 60 * 1000,
  recentFilesMax: 10,
  defaultFileName: "Untitled.md",
  fallbackImage: "https://upload.wikimedia.org/wikipedia/commons/a/a3/Image-not-found.png",
};

export async function loadConfig() {
  try {
    const res = await fetch("./config.json");
    if (res.ok) {
      const data = await res.json();
      Object.assign(config, data);
      console.log("Configuration chargée :", config);
    }
  } catch (err) {
    console.warn("Impossible de charger config.json, utilisation des valeurs par défaut.", err);
  }
  return config;
}