'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import TrimeshViewer from '@/components/TrimeshViewer'
import type { TriMesh } from '@/lib/mesh'
import { MODEL_URLS } from '@/lib/model'
import { loadBallnetBase, buildMeshFromNodes, makeMotionFeeds, type BallnetBase } from '@/lib/ballnet'

export default function Home() {
  const [wireframe] = useState(false)
  const [color] = useState('#3b82f6')
  const [dark, setDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const html = document.documentElement
      const hasClass = html.classList.contains('dark')
      const prefersDark =
        typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      return hasClass || prefersDark
    }
    return false
  })
  const [dx, setDx] = useState(0)
  const [dy, setDy] = useState(0)
  const [dz, setDz] = useState(0)
  const [rx, setRx] = useState(0)
  const [ry, setRy] = useState(0)
  const [rz, setRz] = useState(0)
  const workerRef = useRef<Worker | null>(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const [modelUrl] = useState(MODEL_URLS[0])
  const [base, setBase] = useState<BallnetBase | null>(null)
  const [force, setForce] = useState<number[] | null>(null)
  const [pendingNodes, setPendingNodes] = useState<Float32Array | null>(null)
  const [ioInputs, setIoInputs] = useState<string[] | null>(null)
  const [ioOutputs, setIoOutputs] = useState<string[] | null>(null)
  const [modelLoadProgress, setModelLoadProgress] = useState<{ loaded: number; total?: number } | null>(null)
  const mesh = useMemo<TriMesh | null>(() => {
    if (!base || !pendingNodes) return null
    return buildMeshFromNodes(base, pendingNodes)
  }, [base, pendingNodes])
  const leftPanelRef = useRef<HTMLDivElement | null>(null)
  const rightPanelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const html = document.documentElement
    if (dark) html.classList.add('dark')
    else html.classList.remove('dark')
  }, [dark])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!workerRef.current) {
      workerRef.current = new Worker(new URL('../workers/inferenceWorker.ts', import.meta.url), { type: 'module' })
    }
    const worker = workerRef.current
    const handler = (e: MessageEvent) => {
      const data = e.data as
        | { type: 'loaded' }
        | { type: 'metadata'; inputs?: unknown; outputs?: unknown }
        | { type: 'nodes'; nodes: Float32Array | ArrayBufferLike; force?: Float32Array | Float64Array }
        | { type: 'mesh'; vertices: ArrayBufferLike; faces: ArrayBufferLike }
        | { type: 'error'; error: unknown }
        | { type: 'loadProgress'; loaded: number; total?: number }
      if (data.type === 'loaded') {
        setSessionLoaded(true)
        setModelLoadProgress(null)
      } else if (data.type === 'metadata') {
        if (Array.isArray(data.inputs)) setIoInputs(data.inputs as string[])
        if (Array.isArray(data.outputs)) setIoOutputs(data.outputs as string[])
      } else if (data.type === 'nodes') {
        const nodes =
          data.nodes instanceof Float32Array ? (data.nodes as Float32Array) : new Float32Array(data.nodes as ArrayBufferLike)
        setPendingNodes(nodes)
        if (data.force) {
          const farr = Array.from(data.force as Float32Array | Float64Array)
          setForce(farr)
        }
      } else if (data.type === 'mesh') {
      } else if (data.type === 'loadProgress') {
        if (typeof data.loaded === 'number') {
          setModelLoadProgress({
            loaded: data.loaded,
            total: typeof data.total === 'number' && !Number.isNaN(data.total) && data.total > 0 ? data.total : undefined,
          })
        }
      } else if (data.type === 'error') {
        setModelLoadProgress(null)
      }
    }
    worker.addEventListener('message', handler)
    Promise.resolve().then(() => {
      setModelLoadProgress({ loaded: 0, total: undefined })
      worker.postMessage({ type: 'loadModel', source: modelUrl })
    })
    return () => {
      worker.removeEventListener('message', handler)
      worker.terminate()
      workerRef.current = null
    }
  }, [modelUrl])

  useEffect(() => {
    loadBallnetBase().then(setBase).catch(() => {})
  }, [])

  useEffect(() => {
    if (!sessionLoaded || !base) return
    const worker = workerRef.current
    if (!worker) return
    const feeds = makeMotionFeeds(dx, dy, dz, rx, ry, rz)
    const transfer = [feeds.motion.data.buffer]
    Promise.resolve().then(() => {
      worker.postMessage({ type: 'run', feeds }, transfer)
    })
  }, [dx, dy, dz, rx, ry, rz, sessionLoaded, base])

  useEffect(() => {
    const left = leftPanelRef.current
    const right = rightPanelRef.current
    if (!left || !right || typeof window === 'undefined') return
    const update = () => {
      const isDesktop = window.matchMedia && window.matchMedia('(min-width: 1024px)').matches
      left.style.height = ''
      right.style.height = ''
      if (isDesktop) {
        const h = Math.max(left.offsetHeight, right.offsetHeight)
        left.style.height = `${h}px`
        right.style.height = `${h}px`
      }
    }
    const roL = new ResizeObserver(() => update())
    const roR = new ResizeObserver(() => update())
    roL.observe(left)
    roR.observe(right)
    window.addEventListener('resize', update)
    update()
    return () => {
      roL.disconnect()
      roR.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])

  /* no-op */

  return (
    <div className="min-h-screen app-bg text-[var(--foreground)]">
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-semibold">BallNet Demo</h1>
          <button
            onClick={() => {
              const html = document.documentElement
              const nextDark = !dark
              setDark(nextDark)
              if (nextDark) html.classList.add('dark')
              else html.classList.remove('dark')
              const body = document.body
              if (nextDark) body.classList.add('dark')
              else body.classList.remove('dark')
            }}
            className="px-3 py-1.5 text-base glass-button"
            aria-label="Toggle theme"
            title="Toggle theme"
          >
            {dark ? '☀️' : '🌙'}
          </button>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6 items-stretch">
          <div ref={leftPanelRef} className="col-span-1 p-4 glass-panel">
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold">Model</h2>
                <select className="mt-2 glass-input glass-input-contrast bg-transparent text-base" value="BallNet" disabled>
                  <option>BallNet</option>
                </select>
                {(!sessionLoaded || modelLoadProgress) && (
                  <div className="mt-3">
                    <div className="h-2 w-full rounded-full bg-[var(--glass-border)] overflow-hidden">
                      <div
                        className={
                          'h-full rounded-full transition-all duration-200 glass-progress-fill ' +
                          (!modelLoadProgress || !modelLoadProgress.total ? 'animate-pulse w-1/2' : '')
                        }
                        style={
                          modelLoadProgress && modelLoadProgress.total
                            ? {
                                width: `${Math.max(2, Math.min(100, Math.round((modelLoadProgress.loaded / modelLoadProgress.total) * 100)))}%`,
                              }
                            : undefined
                        }
                      />
                    </div>
                    <div className="mt-1 text-sm text-[var(--foreground)]/60">
                      {modelLoadProgress && modelLoadProgress.total
                        ? `${(modelLoadProgress.loaded / 1024 / 1024).toFixed(1)} MB / ${(modelLoadProgress.total / 1024 / 1024).toFixed(1)} MB`
                        : 'Loading ONNX model...'}
                    </div>
                  </div>
                )}
                {ioInputs && ioOutputs ? (
                  <div className="mt-2 text-sm text-[var(--foreground)]/60">
                    <div>Inputs: {ioInputs.join(', ')}</div>
                    <div>Outputs: {ioOutputs.join(', ')}</div>
                  </div>
                ) : null}
              </div>
              <div>
                <h2 className="text-lg font-bold">Motion Inputs</h2>
                <p className="mt-2 text-base">Translation (mm)</p>
                <label className="block mt-2 glass-section p-3">
                  <div className="flex items-center justify-between text-sm text-[var(--foreground)]/60">
                    <span>Dx</span>
                    <span>{dx.toFixed(2)} mm</span>
                  </div>
                  <input
                    type="range"
                    min={-10}
                    max={10}
                    step={0.1}
                    value={dx}
                    onChange={(e)=>setDx(parseFloat(e.target.value))}
                    className="w-full glass-input"
                  />
                  <div className="flex justify-between text-[13px] text-[var(--foreground)]/60 mt-2">
                    <span>-10</span>
                    <span>10</span>
                  </div>
                </label>
                <label className="block mt-3 glass-section p-3">
                  <div className="flex items-center justify-between text-sm text-[var(--foreground)]/60">
                    <span>Dy</span>
                    <span>{dy.toFixed(2)} mm</span>
                  </div>
                  <input
                    type="range"
                    min={-10}
                    max={10}
                    step={0.1}
                    value={dy}
                    onChange={(e)=>setDy(parseFloat(e.target.value))}
                    className="w-full glass-input"
                  />
                  <div className="flex justify-between text-[13px] text-[var(--foreground)]/60 mt-2">
                    <span>-10</span>
                    <span>10</span>
                  </div>
                </label>
                <label className="block mt-3 glass-section p-3">
                  <div className="flex items-center justify-between text-sm text-[var(--foreground)]/60">
                    <span>Dz</span>
                    <span>{dz.toFixed(2)} mm</span>
                  </div>
                  <input
                    type="range"
                    min={-3}
                    max={3}
                    step={0.1}
                    value={dz}
                    onChange={(e)=>setDz(parseFloat(e.target.value))}
                    className="w-full glass-input"
                  />
                  <div className="flex justify-between text-[13px] text-[var(--foreground)]/60 mt-2">
                    <span>-3</span>
                    <span>3</span>
                  </div>
                </label>
                <p className="mt-4 text-base">Rotation (degrees)</p>
                <label className="block mt-2 glass-section p-3">
                  <div className="flex items-center justify-between text-sm text-[var(--foreground)]/60">
                    <span>Rx</span>
                    <span>{rx.toFixed(2)}°</span>
                  </div>
                  <input
                    type="range"
                    min={-30}
                    max={30}
                    step={0.5}
                    value={rx}
                    onChange={(e)=>setRx(parseFloat(e.target.value))}
                    className="w-full glass-input"
                  />
                  <div className="flex justify-between text-[13px] text-[var(--foreground)]/60 mt-2">
                    <span>-30</span>
                    <span>30</span>
                  </div>
                </label>
                <label className="block mt-3 glass-section p-3">
                  <div className="flex items-center justify-between text-sm text-[var(--foreground)]/60">
                    <span>Ry</span>
                    <span>{ry.toFixed(2)}°</span>
                  </div>
                  <input
                    type="range"
                    min={-30}
                    max={30}
                    step={0.5}
                    value={ry}
                    onChange={(e)=>setRy(parseFloat(e.target.value))}
                    className="w-full glass-input"
                  />
                  <div className="flex justify-between text-[13px] text-[var(--foreground)]/60 mt-2">
                    <span>-30</span>
                    <span>30</span>
                  </div>
                </label>
                <label className="block mt-3 glass-section p-3">
                  <div className="flex items-center justify-between text-sm text-[var(--foreground)]/60">
                    <span>Rz</span>
                    <span>{rz.toFixed(2)}°</span>
                  </div>
                  <input
                    type="range"
                    min={-30}
                    max={30}
                    step={0.5}
                    value={rz}
                    onChange={(e)=>setRz(parseFloat(e.target.value))}
                    className="w-full glass-input"
                  />
                  <div className="flex justify-between text-[13px] text-[var(--foreground)]/60 mt-2">
                    <span>-30</span>
                    <span>30</span>
                  </div>
                </label>
              </div>
            </div>
          </div>
          <div ref={rightPanelRef} className="col-span-1 lg:col-span-2 p-4 glass-panel">
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold">Force Outputs</h2>
                <div className="overflow-x-auto mt-2 glass-section p-3 rounded-2xl">
                  <table className="min-w-full text-base table-fixed">
                    <thead>
                      <tr className="text-center">
                        <th className="px-2">Fx (N)</th>
                        <th className="px-2">Fy (N)</th>
                        <th className="px-2">Fz (N)</th>
                        <th className="px-2">Tx (Nmm)</th>
                        <th className="px-2">Ty (Nmm)</th>
                        <th className="px-2">Tz (Nmm)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="text-center">
                        {Array.from({length:6}).map((_,i)=>{
                          const val = force?.[i] ?? 0
                          return <td key={i} className="px-2">{val.toFixed(3)}</td>
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <h2 className="text-lg font-bold">Mesh Outputs</h2>
                <div className="relative h-[500px] mt-2 rounded-2xl overflow-hidden">
                  <TrimeshViewer mesh={mesh} wireframe={wireframe} color={color} dark={dark} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
