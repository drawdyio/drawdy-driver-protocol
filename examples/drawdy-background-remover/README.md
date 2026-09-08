# drawdy-background-remover

Private Drawdy driver. Select one or more images, right-click, and choose
**Remove background → Fast** or **Best quality**. Segmentation runs inside the
driver worker on ONNX Runtime Web's WebAssembly backend; no pixels leave the
browser.

## Models

| Menu item    | Model     | Download | Source                                |
| ------------ | --------- | -------- | ------------------------------------- |
| Fast         | `u2netp`  | 4.6 MB   | U²-Net (Apache-2.0), rembg export     |
| Best quality | `silueta` | 44 MB    | U²-Net variant (MIT), rembg export    |

Both are fetched from a CORS-enabled Hugging Face mirror of rembg's release
assets and verified against a pinned SHA-256 before a session is created. The
worker has an opaque origin, so downloads cannot be cached across page loads;
a model is fetched once per session and reused for every image.

## Scripts

```bash
npm install --no-workspaces
npm run typecheck
npm test                                   # pure pipeline tests
BG_REMOVER_MODEL=/path/to/u2netp.onnx npm test   # + end-to-end model test
npm run build                              # dist/drawdy-background-remover.drawdyx
```
