'use client'
import { useEffect, useRef } from 'react'
import { Scene, PerspectiveCamera, WebGLRenderer, Mesh, MeshStandardMaterial, Color, AmbientLight, DirectionalLight, BufferGeometry, DoubleSide } from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { TriMesh } from '@/lib/mesh'
import { buildGeometry } from '@/lib/mesh'

type Props = {
  mesh: TriMesh | null
  wireframe?: boolean
  color?: string
  dark?: boolean
}

export default function TrimeshViewer({ mesh, wireframe = false, color = '#3b82f6', dark = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<WebGLRenderer | null>(null)
  const sceneRef = useRef<Scene | null>(null)
  const cameraRef = useRef<PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const meshRef = useRef<Mesh<BufferGeometry, MeshStandardMaterial> | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const scene = new Scene()
    const camera = new PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.01, 1000)
    camera.position.set(45, 60, 150)
    const renderer = new WebGLRenderer({ antialias: true })
    renderer.setSize(container.offsetWidth, container.offsetHeight)
    renderer.setPixelRatio(window.devicePixelRatio)
    const isDark = typeof window !== 'undefined' && document.documentElement.classList.contains('dark')
    renderer.setClearColor(new Color(isDark ? '#000000' : '#f6f6f6'), 1)
    container.appendChild(renderer.domElement)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    const ambient = new AmbientLight(new Color('#ffffff'), 0.6)
    const dir = new DirectionalLight(new Color('#ffffff'), 0.8)
    dir.position.set(5, 5, 5)
    scene.add(ambient)
    scene.add(dir)
    sceneRef.current = scene
    cameraRef.current = camera
    rendererRef.current = renderer
    controlsRef.current = controls
    const updateSize = () => {
      if (!container || !rendererRef.current || !cameraRef.current) return
      const w = container.offsetWidth
      const h = container.offsetHeight
      cameraRef.current.aspect = w / h
      cameraRef.current.updateProjectionMatrix()
      rendererRef.current.setSize(w, h)
    }
    const ro = new ResizeObserver(() => updateSize())
    ro.observe(container)
    updateSize()
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      controls.update()
      renderer.render(scene, camera)
    }
    loop()
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      controls.dispose()
      renderer.dispose()
      container.removeChild(renderer.domElement)
      scene.clear()
      sceneRef.current = null
      cameraRef.current = null
      rendererRef.current = null
      controlsRef.current = null
    }
  }, [])

  useEffect(() => {
    const r = rendererRef.current
    if (r) {
      r.setClearColor(new Color(dark ? '#000000' : '#f6f6f6'), 1)
    }
  }, [dark])

  useEffect(() => {
    if (!sceneRef.current) return
    if (meshRef.current) {
      sceneRef.current.remove(meshRef.current)
      meshRef.current.geometry.dispose()
      meshRef.current.material.dispose()
      meshRef.current = null
    }
    if (!mesh) return
    const geometry = buildGeometry(mesh)
    geometry.center()
    const hasColors = !!((mesh as { colors?: Float32Array } | null)?.colors)
    const baseColor = hasColors ? new Color('#ffffff') : new Color(color)
    const material = new MeshStandardMaterial({ color: baseColor, wireframe, vertexColors: hasColors })
    material.metalness = 0
    material.roughness = 0.7
    material.side = DoubleSide
    const m = new Mesh(geometry, material)
    sceneRef.current.add(m)
    meshRef.current = m
  }, [mesh, wireframe, color])

  return <div ref={containerRef} className="absolute inset-0 w-full h-full overflow-hidden" />
}
