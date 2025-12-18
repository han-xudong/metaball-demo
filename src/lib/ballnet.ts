import type { TriMesh } from '@/lib/mesh'

export type BallnetBase = {
  vertices: Float32Array
  faces: Uint32Array
  deformIndices: Uint32Array
}

const HF_SPACE_BASE = 'https://huggingface.co/spaces/asRobotics/ballnet-demo/resolve/main/assets/ball'
const LOCAL_BASE = '/assets/ball'

async function fetchTextFromUrls(urls: string[]) {
  for (const url of urls) {
    try {
      const res = await fetch(url)
      if (res.ok) return await res.text()
    } catch {
    }
  }
  throw new Error('failed_to_load_ballnet_assets')
}

function parseFloatTable(text: string, columns: number) {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0)
  const data = new Float32Array(lines.length * columns)
  let i = 0
  for (const line of lines) {
    const parts = line.split(',').map(p => p.trim()).filter(p => p.length > 0)
    for (let c = 0; c < columns; c++) {
      data[i++] = parseFloat(parts[c] ?? '0')
    }
  }
  return data
}

function parseIntTable(text: string, columns: number, subtractOne: boolean) {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0)
  const data = new Uint32Array(lines.length * columns)
  let i = 0
  for (const line of lines) {
    const parts = line.split(',').map(p => p.trim()).filter(p => p.length > 0)
    for (let c = 0; c < columns; c++) {
      const v = parseInt(parts[c] ?? '0', 10)
      data[i++] = subtractOne ? v - 1 : v
    }
  }
  return data
}

export async function loadBallnetBase(): Promise<BallnetBase> {
  const vertText = await fetchTextFromUrls([
    `${HF_SPACE_BASE}/surface_coordinate.txt`,
    `${LOCAL_BASE}/surface_coordinate.txt`,
  ])
  const faceText = await fetchTextFromUrls([
    `${HF_SPACE_BASE}/surface_triangle.txt`,
    `${LOCAL_BASE}/surface_triangle.txt`,
  ])
  const deformText = await fetchTextFromUrls([
    `${HF_SPACE_BASE}/deform_node.txt`,
    `${LOCAL_BASE}/deform_node.txt`,
  ])
  const vertices = parseFloatTable(vertText, 3)
  const faces = parseIntTable(faceText, 3, true)
  const deformIndices = parseIntTable(deformText, 1, true)
  return { vertices, faces, deformIndices }
}

function clamp(value: number, min: number, max: number) {
  if (value < min) return min
  if (value > max) return max
  return value
}

function sampleViridis(t: number) {
  const stops = [
    [0.267, 0.005, 0.329],
    [0.283, 0.141, 0.458],
    [0.254, 0.265, 0.530],
    [0.207, 0.372, 0.553],
    [0.164, 0.471, 0.558],
    [0.128, 0.567, 0.551],
    [0.135, 0.659, 0.518],
    [0.267, 0.749, 0.441],
    [0.477, 0.821, 0.318],
    [0.741, 0.873, 0.150],
    [0.993, 0.906, 0.144],
  ]
  const x = clamp(t, 0, 1) * (stops.length - 1)
  const i = Math.floor(x)
  const j = i + 1 >= stops.length ? stops.length - 1 : i + 1
  const f = x - i
  const a = stops[i]
  const b = stops[j]
  return [
    a[0] + (b[0] - a[0]) * f,
    a[1] + (b[1] - a[1]) * f,
    a[2] + (b[2] - a[2]) * f,
  ]
}

export function buildMeshFromNodes(base: BallnetBase, nodes: Float32Array): TriMesh {
  const vertexCount = base.vertices.length / 3
  const deformCount = base.deformIndices.length
  const delta = new Float32Array(base.vertices.length)
  for (let i = 0; i < deformCount; i++) {
    const vi = base.deformIndices[i]
    if (vi < 0 || vi >= vertexCount) continue
    const vOffset = vi * 3
    const nOffset = i * 3
    delta[vOffset] += nodes[nOffset] ?? 0
    delta[vOffset + 1] += nodes[nOffset + 1] ?? 0
    delta[vOffset + 2] += nodes[nOffset + 2] ?? 0
  }
  const rotated = new Float32Array(base.vertices.length)
  const norms = new Float32Array(vertexCount)
  for (let i = 0; i < vertexCount; i++) {
    const vx = base.vertices[i * 3]
    const vy = base.vertices[i * 3 + 1]
    const vz = base.vertices[i * 3 + 2]
    const dx = delta[i * 3]
    const dy = delta[i * 3 + 1]
    const dz = delta[i * 3 + 2]
    const nx = vx + dx
    const ny = vy + dy
    const nz = vz + dz
    const rx = nx
    const ry = nz
    const rz = -ny
    rotated[i * 3] = rx
    rotated[i * 3 + 1] = ry
    rotated[i * 3 + 2] = rz
    const mag = Math.sqrt(dx * dx + dy * dy + dz * dz)
    norms[i] = clamp(mag, 0, 12)
  }
  const colors = new Float32Array(vertexCount * 3)
  for (let i = 0; i < vertexCount; i++) {
    const t = (norms[i] - 0) / 12
    const c = sampleViridis(t)
    colors[i * 3] = c[0]
    colors[i * 3 + 1] = c[1]
    colors[i * 3 + 2] = c[2]
  }
  return {
    vertices: rotated,
    faces: base.faces,
    colors,
  }
}

export function makeMotionFeeds(dx: number, dy: number, dz: number, rx: number, ry: number, rz: number) {
  const motion = new Float32Array(6)
  motion[0] = dx
  motion[1] = dy
  motion[2] = dz
  const d2r = Math.PI / 180
  motion[3] = rx * d2r
  motion[4] = ry * d2r
  motion[5] = rz * d2r
  return {
    motion: { data: motion, dims: [1, 6], dtype: 'float32' as const },
  }
}
