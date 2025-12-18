import * as ort from 'onnxruntime-web'
import { generateSphere } from '@/lib/mesh'
import { MODEL_URLS } from '@/lib/model'

type FeedPayload = {
  data: Float32Array | Int32Array | Uint8Array | Float64Array
  dims: number[]
  dtype: 'float32' | 'int32' | 'uint8' | 'float64'
}
type LoadMessage = { type: 'loadModel'; source: ArrayBuffer | string }
type RunMessage = { type: 'run'; feeds: Record<string, FeedPayload> }
type GenMessage = { type: 'generate'; params: { subdivisions: number; radius: number } }
type Message = LoadMessage | RunMessage | GenMessage

let session: ort.InferenceSession | null = null
try {
  // Pin to installed version
  const version = '1.23.2'
  ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${version}/dist/`
  // Be conservative for environments without crossOriginIsolated
  ort.env.wasm.numThreads = 1
} catch {}

async function fetchWithProgress(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`failed_to_fetch_model:${res.status}`)
  const totalHeader = res.headers.get('Content-Length')
  const total = totalHeader ? parseInt(totalHeader, 10) : 0
  const body = res.body
  if (!body || !total || Number.isNaN(total)) {
    return await res.arrayBuffer()
  }
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      chunks.push(value)
      loaded += value.byteLength
      ;(self as unknown as Worker).postMessage({
        type: 'loadProgress',
        loaded,
        total,
      })
    }
  }
  const buffer = new Uint8Array(loaded)
  let offset = 0
  for (const chunk of chunks) {
    buffer.set(chunk, offset)
    offset += chunk.byteLength
  }
  return buffer.buffer
}

async function fetchModelBytes(candidates: Array<string | ArrayBuffer>): Promise<ArrayBuffer> {
  let lastErr: unknown
  for (const c of candidates) {
    try {
      if (typeof c !== 'string') return c
      return await fetchWithProgress(c)
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr ?? new Error('failed_to_fetch_model')
}

async function loadModel(source: ArrayBuffer | string) {
  try {
    const bytes = await fetchModelBytes([source, ...MODEL_URLS])
    session = await ort.InferenceSession.create(new Uint8Array(bytes), {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    })
    ;(self as unknown as Worker).postMessage({ type: 'loaded' })
    ;(self as unknown as Worker).postMessage({
      type: 'metadata',
      inputs: session.inputNames,
      outputs: session.outputNames,
    })
  } catch (e) {
    ;(self as unknown as Worker).postMessage({ type: 'error', error: String(e) })
  }
}

async function run(feeds: Record<string, FeedPayload>) {
  try {
    if (!session) {
      ;(self as unknown as Worker).postMessage({ type: 'error', error: 'no_session' })
      return
    }
    const ortFeeds: Record<string, ort.Tensor> = {}
    for (const [name, f] of Object.entries(feeds)) {
      const dtype = f.dtype as 'float32' | 'int32' | 'uint8' | 'float64'
      const data =
        dtype === 'float32'
          ? (f.data as Float32Array)
          : dtype === 'int32'
          ? (f.data as Int32Array)
          : dtype === 'uint8'
          ? (f.data as Uint8Array)
          : (f.data as Float64Array)
      ortFeeds[name] = new ort.Tensor(dtype, data, f.dims)
    }
    const output = await session.run(ortFeeds)
    const keys = Object.keys(output)
    const forceKey = keys[0]
    const nodesKey = keys[1] ?? keys[0]
    const force = output[forceKey]?.data as Float32Array | Float64Array | undefined
    const nodes = output[nodesKey]?.data as Float32Array | Float64Array | undefined
    if (!nodes) {
      ;(self as unknown as Worker).postMessage({ type: 'error', error: 'invalid_outputs' })
      return
    }
    const nodesFloat32 = nodes instanceof Float32Array ? nodes : new Float32Array(nodes as ArrayLike<number>)
    ;(self as unknown as Worker).postMessage(
      { type: 'nodes', nodes: nodesFloat32, force },
      [nodesFloat32.buffer]
    )
  } catch (e) {
    ;(self as unknown as Worker).postMessage({ type: 'error', error: String(e) })
  }
}

function generate(params: { subdivisions: number; radius: number }) {
  const { vertices, faces } = generateSphere(params.subdivisions, params.radius)
  ;(self as unknown as Worker).postMessage(
    { type: 'mesh', vertices, faces },
    [vertices.buffer, faces.buffer]
  )
}

self.onmessage = async (e: MessageEvent<Message>) => {
  const msg = e.data
  if (msg.type === 'loadModel') await loadModel(msg.source)
  else if (msg.type === 'run') await run(msg.feeds)
  else if (msg.type === 'generate') generate(msg.params)
}
export {}
