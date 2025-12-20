# Metaball Demo

A web-based demo that runs a BallNet model of the Metaball and visualizes deformed meshes in real time.

## Quick Start

- Install: `npm install`
- Dev server: `npm run dev` then open `http://localhost:3000`
- Lint: `npm run lint`

## Model & Assets

- Model loading priority: provided source → HuggingFace mirrors
  - Model URL list: `MODEL_URLS` in `src/lib/model.ts`
  - Base assets (vertices, faces, deform indices) try local `/assets/ball/*.txt` first, then fall back to HuggingFace
- Optional local assets:
  - `public/model.onnx`
  - `public/assets/ball/surface_coordinate.txt`
  - `public/assets/ball/surface_triangle.txt`
  - `public/assets/ball/deform_node.txt`

## Troubleshooting

- No model progress or load failure:
  - Ensure HuggingFace and jsDelivr are reachable
  - For offline use, place model and assets under `public/` (see “Model & Assets”)
- Static deploy path issues:
  - On GitHub Pages, `basePath` and `assetPrefix` must be set; this project configures them automatically in CI
- Dark mode:
  - Use the toggle button in the top-right; system preference is also respected

## License

This repository is under [MIT License](LICENSE).
