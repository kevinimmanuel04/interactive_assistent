# Live2D assets (optional)

Komorebi supports Cubism 3/4 models via [pixi-live2d-display](https://github.com/guansss/pixi-live2d-display).

## Setup

1. Download **Live2D Cubism Core for Web** (`live2dcubismcore.min.js`) from
   <https://www.live2d.com/en/sdk/download/web/> (EULA applies) and copy it
   into `public/` so it's served at `/live2dcubismcore.min.js`.

2. Copy a model folder here, e.g. `public/live2d/haru/` containing
   `haru.model3.json` plus its textures/motions/physics files.

3. In Settings → Avatar, paste the model URL, e.g. `/live2d/haru/haru.model3.json`.

## Without this setup

The app shows an animated silhouette placeholder and works normally.
Lip-sync, blinking, and motion playback need a real Live2D model.
