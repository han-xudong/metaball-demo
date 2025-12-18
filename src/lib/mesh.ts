import { BufferGeometry, BufferAttribute, IcosahedronGeometry } from 'three'

export type TriMesh = {
  vertices: Float32Array
  faces: Uint32Array
  colors?: Float32Array
}

export function buildGeometry(mesh: TriMesh) {
  const geometry = new BufferGeometry()
  const position = new Float32Array(mesh.faces.length * 3 * 3)
  let pi = 0
  for (let i = 0; i < mesh.faces.length; i += 3) {
    const a = mesh.faces[i] * 3
    const b = mesh.faces[i + 1] * 3
    const c = mesh.faces[i + 2] * 3
    position[pi++] = mesh.vertices[a]
    position[pi++] = mesh.vertices[a + 1]
    position[pi++] = mesh.vertices[a + 2]
    position[pi++] = mesh.vertices[b]
    position[pi++] = mesh.vertices[b + 1]
    position[pi++] = mesh.vertices[b + 2]
    position[pi++] = mesh.vertices[c]
    position[pi++] = mesh.vertices[c + 1]
    position[pi++] = mesh.vertices[c + 2]
  }
  geometry.setAttribute('position', new BufferAttribute(position, 3))
  if (mesh.colors) {
    const color = new Float32Array(mesh.faces.length * 3 * 3)
    let ci = 0
    for (let i = 0; i < mesh.faces.length; i += 3) {
      const a = mesh.faces[i] * 3
      const b = mesh.faces[i + 1] * 3
      const c = mesh.faces[i + 2] * 3
      color[ci++] = mesh.colors[a]
      color[ci++] = mesh.colors[a + 1]
      color[ci++] = mesh.colors[a + 2]
      color[ci++] = mesh.colors[b]
      color[ci++] = mesh.colors[b + 1]
      color[ci++] = mesh.colors[b + 2]
      color[ci++] = mesh.colors[c]
      color[ci++] = mesh.colors[c + 1]
      color[ci++] = mesh.colors[c + 2]
    }
    const colorAttr = new BufferAttribute(color, 3)
    geometry.setAttribute('color', colorAttr)
  }
  geometry.computeVertexNormals()
  return geometry
}

export function generateSphere(subdivisions = 3, radius = 1): TriMesh {
  const g = new IcosahedronGeometry(radius, subdivisions)
  const pos = g.getAttribute('position').array as ArrayLike<number>
  const vertices = new Float32Array(pos.length)
  for (let i = 0; i < pos.length; i++) vertices[i] = pos[i]
  const index = g.index ? g.index.array : undefined
  let faces: Uint32Array
  if (index) {
    faces = new Uint32Array(index as ArrayLike<number>)
  } else {
    faces = new Uint32Array((pos.length / 3) | 0)
    for (let i = 0; i < faces.length; i++) faces[i] = i
  }
  return { vertices, faces }
}
