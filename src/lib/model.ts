export const MODEL_URLS = [
  'https://huggingface.co/asRobotics/ballnet/resolve/main/model.onnx',
  'https://huggingface.co/spaces/asRobotics/ballnet-demo/resolve/main/model.onnx',
  '/model.onnx',
]

export type PreprocessParams = {
  count: number
  seed: number
  radiusMin: number
  radiusMax: number
  threshold: number
  gridSize: number
  bounds: number
}

export function makeFeeds(params: PreprocessParams) {
  const rng = mulberry32(params.seed)
  const centers = new Float32Array(params.count * 3)
  const radii = new Float32Array(params.count)
  for (let i = 0; i < params.count; i++) {
    centers[i * 3 + 0] = (rng() * 2 - 1) * params.bounds
    centers[i * 3 + 1] = (rng() * 2 - 1) * params.bounds
    centers[i * 3 + 2] = (rng() * 2 - 1) * params.bounds
    radii[i] = params.radiusMin + rng() * (params.radiusMax - params.radiusMin)
  }
  const feeds = {
    centers: { data: centers, dims: [params.count, 3], dtype: 'float32' as const },
    radii: { data: radii, dims: [params.count], dtype: 'float32' as const },
    threshold: { data: new Float32Array([params.threshold]), dims: [1], dtype: 'float32' as const },
    grid_size: { data: new Int32Array([params.gridSize]), dims: [1], dtype: 'int32' as const },
  }
  return feeds
}

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
