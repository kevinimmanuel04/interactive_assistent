# Live2D assets

Komorebi supports Cubism 2 / 3 / 4 / 5 models via [pixi-live2d-display-lipsyncpatch](https://github.com/RaSan147/pixi-live2d-display).

## Default model

Komorebi ships with **`mao_pro`** under `public/live2d/mao_pro/` (Cubism 5 sample, `mao_pro.model3.json`). It is loaded automatically on first run.

## Cubism Core for Web

The Cubism 4/5 runtime requires `Live2DCubismCore`. Komorebi falls back to the official CDN (`https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js`) automatically. To run fully offline, download `live2dcubismcore.min.js` from <https://www.live2d.com/en/sdk/download/web/> (EULA applies) and drop it into `public/` so it is served at `/live2dcubismcore.min.js`.

## Adding your own model

1. Copy the runtime folder of any Cubism 4 or 5 model here, e.g. `public/live2d/haru/` containing `haru.model3.json` plus its textures/motions/physics files.
2. In Settings -> Avatar, paste the model URL, e.g. `/live2d/haru/haru.model3.json`.

For legacy Cubism 2 (`.model.json`) models, also drop `live2d.min.js` into `public/`.