/**
 * Browser-side renderer (bundled with esbuild, runs in headless Edge). Builds a three.js scene from
 * the SceneDescription, renders each FrameData into a linear HDR target, applies the camera model
 * (lens distortion, exposure, white balance, tone curve, noise) in a post pass and posts raw RGBA
 * rows (top row first) back to the Node driver.
 */
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import type { PartSpec } from '../../bodyShape.ts'
import type { FrameData, SceneDescription } from '../sceneTypes.ts'

const MAX_BALL_SAMPLES = 48
const BALL_RADIUS_M = 0.0335

function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D, size: number) => void, srgb = true): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const g = c.getContext('2d')!
  draw(g, size)
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

function noiseTexture(seed: number, base: string, amp: number, grain: number): THREE.CanvasTexture {
  const r = rng(seed)
  return canvasTexture(512, (g, n) => {
    g.fillStyle = base
    g.fillRect(0, 0, n, n)
    const img = g.getImageData(0, 0, n, n)
    for (let i = 0; i < img.data.length; i += 4) {
      const v = (r() - 0.5) * amp + (r() < grain ? (r() - 0.5) * amp * 2 : 0)
      img.data[i] = Math.max(0, Math.min(255, img.data[i] + v))
      img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1] + v))
      img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2] + v))
    }
    g.putImageData(img, 0, 0)
  })
}

function latheGeometry(profile: [number, number][]): THREE.BufferGeometry {
  // Smooth the profile with a Catmull-Rom curve for organic limbs.
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y))
  const curve = new THREE.SplineCurve(pts)
  const smooth = curve.getPoints(Math.max(24, profile.length * 6))
  smooth[0].x = profile[0][0]
  smooth[smooth.length - 1].x = profile[profile.length - 1][0]
  return new THREE.LatheGeometry(smooth, 32)
}

function partGeometry(p: PartSpec): THREE.BufferGeometry {
  const s = p.shape
  switch (s.kind) {
    case 'lathe': {
      const g = latheGeometry(s.profile)
      if (s.depthScale) g.scale(s.depthScale, 1, 1)
      return g
    }
    case 'ellipsoid': {
      const g = new THREE.SphereGeometry(1, 32, 20)
      g.scale(s.radii[0], s.radii[1], s.radii[2])
      return g
    }
    case 'box':
      return new RoundedBoxGeometry(s.size[0], s.size[1], s.size[2], 3, Math.min(s.radius ?? 0.001, Math.min(...s.size) / 2 - 1e-4))
    case 'cylinder':
      return new THREE.CylinderGeometry(s.rTop, s.rBottom, s.height, 20)
    case 'sphereCap': {
      const g = new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, s.thetaLength)
      g.scale(s.radii[0], s.radii[1], s.radii[2])
      return g
    }
    case 'ring': {
      const g = new THREE.TorusGeometry(1, s.tube, 10, 64)
      // Scale the ring into an ellipse without thickening the tube much.
      const pos = g.attributes.position
      const v = new THREE.Vector3()
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i)
        const ang = Math.atan2(v.y, v.x)
        const cx = Math.cos(ang)
        const cy = Math.sin(ang)
        const dx = v.x - cx
        const dy = v.y - cy
        pos.setXYZ(i, cx * s.radii[0] + dx, cy * s.radii[1] + dy, v.z)
      }
      g.computeVertexNormals()
      return g
    }
    case 'disc': {
      const g = new THREE.CircleGeometry(1, 48)
      g.scale(s.radii[0], s.radii[1], 1)
      return g
    }
  }
}

const textures: Record<string, THREE.Texture> = {}

function partMaterial(p: PartSpec): THREE.Material {
  const m = p.material
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(m.color),
    roughness: m.roughness ?? 0.7,
    metalness: m.metalness ?? 0,
  })
  if (m.opacity !== undefined && m.opacity < 1) {
    mat.transparent = true
    mat.opacity = m.opacity
    mat.side = THREE.DoubleSide
    mat.depthWrite = false
  }
  if (m.texture === 'strings') {
    textures.strings ??= canvasTexture(256, (g, n) => {
      g.clearRect(0, 0, n, n)
      g.fillStyle = 'rgba(255,255,255,0)'
      g.fillRect(0, 0, n, n)
      g.strokeStyle = 'rgba(255,255,245,1)'
      g.lineWidth = 2.5
      for (let i = 0; i <= 16; i++) {
        const x = (i / 16) * n
        g.beginPath()
        g.moveTo(x, 0)
        g.lineTo(x, n)
        g.stroke()
        g.beginPath()
        g.moveTo(0, x)
        g.lineTo(n, x)
        g.stroke()
      }
    })
    mat.map = textures.strings
    mat.alphaTest = 0.2
    mat.color = new THREE.Color('#ffffff')
  } else if (m.texture === 'fabric') {
    textures.fabric ??= noiseTexture(7, '#ffffff', 22, 0.02)
    mat.map = textures.fabric
  } else if (m.texture === 'skin') {
    textures.skin ??= noiseTexture(11, '#ffffff', 8, 0.0)
    mat.map = textures.skin
  }
  return mat
}

export class ServeRenderer {
  readonly desc: SceneDescription
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  private bones: THREE.Object3D[] = []
  private balls: { quad: THREE.Mesh; mat: THREE.ShaderMaterial; shadow: THREE.Mesh }[] = []
  private msaaRT: THREE.WebGLRenderTarget
  private accRT: THREE.WebGLRenderTarget | null = null
  private postScene = new THREE.Scene()
  private postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private postMat: THREE.ShaderMaterial
  private accScene = new THREE.Scene()
  private accMat: THREE.ShaderMaterial
  private sunDir = new THREE.Vector3()
  /** Post-processed 8-bit RGB image (yuv420p output only). */
  private postRT: THREE.WebGLRenderTarget | null = null
  /** Packed planar YUV bytes: (W/4) x (1.5 H) RGBA8 texels, i.e. exactly the yuv420p byte stream. */
  private packRT: THREE.WebGLRenderTarget | null = null
  private packScene = new THREE.Scene()
  readonly frameBytes: number

  constructor(canvas: HTMLCanvasElement, desc: SceneDescription) {
    this.desc = desc
    canvas.width = desc.width
    canvas.height = desc.height
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, alpha: false, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(1)
    this.renderer.setSize(desc.width, desc.height, false)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.NoToneMapping
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace

    const fovY = (2 * Math.atan(desc.renderHeight / 2 / desc.fyPx) * 180) / Math.PI
    this.camera = new THREE.PerspectiveCamera(fovY, desc.renderWidth / desc.renderHeight, desc.nearM, desc.farM)
    this.msaaRT = new THREE.WebGLRenderTarget(desc.renderWidth, desc.renderHeight, {
      type: THREE.HalfFloatType,
      samples: desc.msaaSamples,
      depthBuffer: true,
    })
    if (desc.bodyBlurSamples > 1) {
      this.accRT = new THREE.WebGLRenderTarget(desc.renderWidth, desc.renderHeight, { type: THREE.HalfFloatType })
    }
    if (desc.output === 'yuv420p') {
      if (desc.width % 4 !== 0 || desc.height % 2 !== 0) throw new Error(`yuv420p output needs width % 4 == 0 and even height, got ${desc.width}x${desc.height}`)
      const plain = { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter }
      this.postRT = new THREE.WebGLRenderTarget(desc.width, desc.height, plain)
      this.packRT = new THREE.WebGLRenderTarget(desc.width / 4, (desc.height * 3) / 2, plain)
      this.packScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.buildPack()))
      this.frameBytes = (desc.width * desc.height * 3) / 2
    } else {
      this.frameBytes = desc.width * desc.height * 4
    }
    this.buildEnvironment()
    this.buildBody()
    this.buildBalls()
    this.postMat = this.buildPost()
    this.accMat = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uWeight: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D tSrc; uniform float uWeight; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tSrc, vUv) * uWeight; }',
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    })
    this.accScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.accMat))
  }

  private buildEnvironment(): void {
    const d = this.desc
    const L = d.lighting
    const r = rng(d.environmentSeed)
    // Sky dome with a vertical gradient.
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(900, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { top: { value: new THREE.Color(L.skyTop) }, horizon: { value: new THREE.Color(L.skyHorizon) } },
        vertexShader: 'varying vec3 vW; void main(){ vW = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader:
          'uniform vec3 top; uniform vec3 horizon; varying vec3 vW; void main(){ float h = clamp(vW.z, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(h, 0.6)), 1.0); }',
      }),
    )
    sky.renderOrder = -1
    this.scene.add(sky)

    // Lights.
    const hemi = new THREE.HemisphereLight(new THREE.Color(L.hemiSky), new THREE.Color(L.hemiGround), L.hemiIntensity)
    hemi.position.set(0, 0, 1)
    this.scene.add(hemi)
    if (L.sunIntensity > 0) {
      const sun = new THREE.DirectionalLight(new THREE.Color(L.sunColor), L.sunIntensity)
      this.sunDir.set(L.sunDir[0], L.sunDir[1], L.sunDir[2]).normalize()
      const c = d.shadowFocus.centre
      sun.position.set(c[0] + this.sunDir.x * 60, c[1] + this.sunDir.y * 60, c[2] + this.sunDir.z * 60)
      sun.target.position.set(c[0], c[1], c[2])
      sun.castShadow = true
      const hs = d.shadowFocus.halfSizeM
      sun.shadow.camera.left = -hs
      sun.shadow.camera.right = hs
      sun.shadow.camera.top = hs
      sun.shadow.camera.bottom = -hs
      sun.shadow.camera.near = 1
      sun.shadow.camera.far = 200
      sun.shadow.mapSize.set(4096, 4096)
      sun.shadow.radius = L.shadowRadius
      sun.shadow.bias = -0.0004
      sun.shadow.normalBias = 0.02
      this.scene.add(sun, sun.target)
    } else {
      this.sunDir.set(0, 0, 1)
    }

    // Ground: surround plus the court inside the doubles lines.
    const surf = {
      'hard-blue': { court: '#2f63a3', surround: '#3d7a57', amp: 18 },
      'grass-green': { court: '#4f8f3c', surround: '#447e34', amp: 34 },
      'clay-red': { court: '#b4583b', surround: '#a9523a', amp: 26 },
    }[d.surface]
    const surroundTex = noiseTexture(d.environmentSeed + 1, surf.surround, surf.amp, 0.03)
    surroundTex.repeat.set(30, 20)
    const surround = new THREE.Mesh(new THREE.PlaneGeometry(120, 80), new THREE.MeshStandardMaterial({ map: surroundTex, roughness: 0.92 }))
    surround.position.set(11.885, 0, 0)
    surround.receiveShadow = true
    this.scene.add(surround)
    const courtTex = noiseTexture(d.environmentSeed + 2, surf.court, surf.amp, 0.03)
    courtTex.repeat.set(12, 6)
    const court = new THREE.Mesh(new THREE.PlaneGeometry(23.77 + 0.2, 10.97 + 0.2), new THREE.MeshStandardMaterial({ map: courtTex, roughness: 0.9 }))
    court.position.set(11.885, 0, 0.001)
    court.receiveShadow = true
    this.scene.add(court)
    const lineMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#f4f4f0'), roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
    for (const l of d.lines) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(l.x1 - l.x0, l.y1 - l.y0), lineMat)
      m.position.set((l.x0 + l.x1) / 2, (l.y0 + l.y1) / 2, 0.002)
      m.receiveShadow = true
      this.scene.add(m)
    }

    // Net with posts, sagging top tape and centre strap.
    const netX = 23.77 / 2
    const postY = 10.97 / 2 + 0.914
    const netTex = canvasTexture(128, (g, n) => {
      g.clearRect(0, 0, n, n)
      g.strokeStyle = 'rgba(20,20,20,0.95)'
      g.lineWidth = 3
      for (let i = 0; i <= 4; i++) {
        const x = (i / 4) * n
        g.beginPath()
        g.moveTo(x, 0)
        g.lineTo(x, n)
        g.stroke()
        g.beginPath()
        g.moveTo(0, x)
        g.lineTo(n, x)
        g.stroke()
      }
    })
    netTex.repeat.set(2 * postY / 0.045 / 4, 1.07 / 0.045 / 4)
    const netGeo = new THREE.PlaneGeometry(2 * postY, 1.07, 64, 4)
    const np = netGeo.attributes.position
    for (let i = 0; i < np.count; i++) {
      const y = np.getX(i)
      const zTop = 0.914 + (1.07 - 0.914) * Math.min(1, Math.abs(y) / postY)
      const z = ((np.getY(i) + 0.535) / 1.07) * zTop
      np.setXYZ(i, 0, y, z)
    }
    netGeo.computeVertexNormals()
    const net = new THREE.Mesh(netGeo, new THREE.MeshStandardMaterial({ map: netTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.9, color: new THREE.Color('#ffffff') }))
    net.position.set(netX, 0, 0)
    net.castShadow = true
    this.scene.add(net)
    const tapeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#f5f5f5'), roughness: 0.7 })
    for (const side of [-1, 1]) {
      const len = Math.hypot(postY, 1.07 - 0.914)
      const tape = new THREE.Mesh(new THREE.BoxGeometry(0.02, len, 0.06), tapeMat)
      tape.position.set(netX, (side * postY) / 2, (0.914 + 1.07) / 2 - 0.03)
      tape.rotation.x = side * Math.atan2(1.07 - 0.914, postY)
      this.scene.add(tape)
    }
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.05, 0.914), tapeMat)
    strap.position.set(netX, 0, 0.457)
    this.scene.add(strap)
    const postMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#1d3b2a'), roughness: 0.5, metalness: 0.3 })
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.1, 16), postMat)
      post.rotation.x = Math.PI / 2
      post.position.set(netX, side * postY, 0.55)
      post.castShadow = true
      this.scene.add(post)
    }

    // Fences: dark green windbreak below, chain-link above, posts every 3 m.
    const f = d.fence
    const windMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#1c3526'), roughness: 0.95, side: THREE.DoubleSide })
    const linkTex = canvasTexture(64, (g, n) => {
      g.clearRect(0, 0, n, n)
      g.strokeStyle = 'rgba(70,80,74,1)'
      g.lineWidth = 2
      g.beginPath()
      g.moveTo(0, n / 2)
      g.lineTo(n / 2, 0)
      g.lineTo(n, n / 2)
      g.lineTo(n / 2, n)
      g.closePath()
      g.stroke()
    })
    const linkMat = new THREE.MeshStandardMaterial({ map: linkTex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.4 })
    const windH = 2.2
    const wallGeometry = (length: number, height: number, alongX: boolean) => {
      // PlaneGeometry lies in XY; stand it up (y -> z) and turn walls that run along y.
      const g = new THREE.PlaneGeometry(length, height)
      g.rotateX(Math.PI / 2)
      if (!alongX) g.rotateZ(Math.PI / 2)
      return g
    }
    const fenceWall = (cx: number, cy: number, length: number, alongX: boolean) => {
      const wb = new THREE.Mesh(wallGeometry(length, windH, alongX), windMat)
      const clMat = linkMat.clone()
      clMat.map = linkTex.clone()
      clMat.map.repeat.set(length / 0.06, (f.heightM - windH) / 0.06)
      clMat.map.needsUpdate = true
      const cl = new THREE.Mesh(wallGeometry(length, f.heightM - windH, alongX), clMat)
      wb.position.set(cx, cy, windH / 2)
      cl.position.set(cx, cy, windH + (f.heightM - windH) / 2)
      wb.receiveShadow = true
      this.scene.add(wb, cl)
      const n = Math.ceil(length / 3)
      for (let i = 0; i <= n; i++) {
        const t = -length / 2 + (i * length) / n
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, f.heightM, 8), postMat)
        post.rotation.x = Math.PI / 2
        post.position.set(alongX ? cx + t : cx, alongX ? cy : cy + t, f.heightM / 2)
        this.scene.add(post)
      }
    }
    const spanX = f.farX - f.backX
    fenceWall(f.backX, 0, 2 * f.sideY, false)
    fenceWall(f.farX, 0, 2 * f.sideY, false)
    fenceWall((f.backX + f.farX) / 2, f.sideY, spanX, true)
    fenceWall((f.backX + f.farX) / 2, -f.sideY, spanX, true)

    // Trees beyond the fences.
    const leafMats = ['#2d5a2c', '#3c6b34', '#4a7a3b', '#27492a', '#557f43'].map(
      (c) => new THREE.MeshStandardMaterial({ color: new THREE.Color(c), roughness: 0.95, flatShading: true }),
    )
    const trunkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#4b3a2a'), roughness: 0.9 })
    const addTree = (x: number, y: number) => {
      const h = 5 + r() * 7
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, h * 0.5, 8), trunkMat)
      trunk.rotation.x = Math.PI / 2
      trunk.position.set(x, y, h * 0.25)
      this.scene.add(trunk)
      const blobs = 3 + Math.floor(r() * 3)
      for (let b = 0; b < blobs; b++) {
        const rad = h * (0.18 + r() * 0.14)
        const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(rad, 1), leafMats[Math.floor(r() * leafMats.length)])
        leaf.position.set(x + (r() - 0.5) * h * 0.35, y + (r() - 0.5) * h * 0.35, h * (0.55 + r() * 0.35))
        this.scene.add(leaf)
      }
    }
    for (let i = 0; i < 26; i++) addTree(f.backX - 3 - r() * 10, (r() - 0.5) * 70)
    for (let i = 0; i < 26; i++) addTree(f.farX + 3 + r() * 12, (r() - 0.5) * 70)
    for (const side of [-1, 1]) for (let i = 0; i < 18; i++) addTree(f.backX - 5 + r() * (spanX + 10), side * (f.sideY + 3 + r() * 10))

    // Floodlight poles (night): emissive heads plus spot lights aimed at the court.
    const poleXs = [-2, 11.885, 25.77]
    for (const side of [-1, 1]) {
      for (const px of poleXs) {
        const py = side * (f.sideY - 0.3)
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 10, 10), postMat)
        pole.rotation.x = Math.PI / 2
        pole.position.set(px, py, 5)
        this.scene.add(pole)
        const head = new THREE.Mesh(
          new THREE.BoxGeometry(0.9, 0.5, 0.25),
          new THREE.MeshStandardMaterial({ color: '#dddddd', emissive: new THREE.Color(L.floodlights ? '#fffbe8' : '#000000'), emissiveIntensity: L.floodlights ? 6 : 0 }),
        )
        head.position.set(px, py - side * 0.3, 10.1)
        this.scene.add(head)
        if (L.floodlights) {
          const spot = new THREE.SpotLight(new THREE.Color('#fff4e0'), L.floodIntensity, 60, Math.PI / 3.2, 0.5, 1.2)
          spot.position.set(px, py, 10)
          spot.target.position.set(px * 0.6 + 4, -side * 1.5, 0)
          spot.castShadow = px < 5
          spot.shadow.mapSize.set(2048, 2048)
          spot.shadow.bias = -0.0005
          this.scene.add(spot, spot.target)
        }
      }
    }
  }

  private buildBody(): void {
    for (const _ of this.desc.bones) {
      const o = new THREE.Object3D()
      o.matrixAutoUpdate = true
      this.scene.add(o)
      this.bones.push(o)
    }
    for (const p of this.desc.parts) {
      const mesh = new THREE.Mesh(partGeometry(p), partMaterial(p))
      if (p.position) mesh.position.set(p.position[0], p.position[1], p.position[2])
      if (p.quaternion) mesh.quaternion.set(p.quaternion[0], p.quaternion[1], p.quaternion[2], p.quaternion[3])
      mesh.castShadow = p.castShadow ?? true
      mesh.receiveShadow = true
      this.bones[this.desc.bones.indexOf(p.bone)].add(mesh)
    }
  }

  private buildBalls(): void {
    const felt = new THREE.Color('#d7f03c').convertSRGBToLinear()
    for (let b = 0; b < this.desc.maxBalls; b++) {
      const samples: THREE.Vector3[] = []
      for (let i = 0; i < MAX_BALL_SAMPLES; i++) samples.push(new THREE.Vector3())
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uRect: { value: new THREE.Vector4(-1, -1, 1, 1) },
          uDepth: { value: 0 },
          uSamples: { value: samples },
          uCount: { value: 0 },
          uColor: { value: felt },
          uLight: { value: new THREE.Vector3(0, 0, 1) },
          uSun: { value: 1 },
          uAmbient: { value: 0.5 },
        },
        vertexShader: `
          uniform vec4 uRect; uniform float uDepth;
          void main(){
            vec2 p = mix(uRect.xy, uRect.zw, position.xy * 0.5 + 0.5);
            gl_Position = vec4(p, uDepth, 1.0);
          }`,
        fragmentShader: `
          #define N ${MAX_BALL_SAMPLES}
          uniform vec3 uSamples[N]; uniform int uCount; uniform vec3 uColor; uniform vec3 uLight;
          uniform float uSun; uniform float uAmbient;
          void main(){
            vec2 px = gl_FragCoord.xy;
            float cov = 0.0; vec3 col = vec3(0.0);
            for (int i = 0; i < N; i++) {
              if (i >= uCount) break;
              vec3 s = uSamples[i];
              vec2 d = (px - s.xy) / max(s.z, 0.35);
              float r2 = dot(d, d);
              float edge = clamp((1.0 - sqrt(r2)) * s.z + 0.5, 0.0, 1.0);
              if (edge <= 0.0) continue;
              vec3 n = vec3(d, sqrt(max(0.0, 1.0 - min(r2, 1.0))));
              float lam = max(dot(n, uLight), 0.0);
              float fuzz = 0.85 + 0.15 * (1.0 - n.z);
              col += uColor * (uAmbient + uSun * lam) * fuzz * edge;
              cov += edge;
            }
            float inv = 1.0 / float(uCount);
            gl_FragColor = vec4(col * inv, cov * inv);
          }`,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        blendSrcAlpha: THREE.OneFactor,
        blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      })
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat)
      quad.frustumCulled = false
      quad.renderOrder = 10
      quad.visible = false
      this.scene.add(quad)
      // Invisible sphere that only casts the ball's shadow.
      const shadow = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS_M, 12, 8), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }))
      shadow.castShadow = true
      shadow.visible = false
      this.scene.add(shadow)
      this.balls.push({ quad, mat, shadow })
    }
  }

  private buildPost(): THREE.ShaderMaterial {
    const d = this.desc
    const p = d.post
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null },
        uOut: { value: new THREE.Vector2(d.width, d.height) },
        uRT: { value: new THREE.Vector2(d.renderWidth, d.renderHeight) },
        uF: { value: new THREE.Vector2(d.fxPx, d.fyPx) },
        uK: { value: new THREE.Vector2(d.k1, d.k2) },
        uGain: { value: 1 },
        uWB: { value: new THREE.Vector3(...p.whiteBalance) },
        uContrast: { value: p.contrast },
        uSaturation: { value: p.saturation },
        uVignette: { value: p.vignette },
        uRead: { value: p.readNoise },
        uShot: { value: p.shotNoise },
        uSeed: { value: 0 },
      },
      vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        precision highp float;
        uniform sampler2D tScene; uniform vec2 uOut; uniform vec2 uRT; uniform vec2 uF; uniform vec2 uK;
        uniform float uGain; uniform vec3 uWB; uniform float uContrast; uniform float uSaturation;
        uniform float uVignette; uniform float uRead; uniform float uShot; uniform float uSeed;
        float hash(vec3 p){ p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float gauss(vec2 px, float ch){
          float u1 = max(hash(vec3(px, uSeed * 1.37 + ch * 11.3)), 1e-6);
          float u2 = hash(vec3(px.yx + 7.1, uSeed * 0.71 + ch * 5.9 + 3.0));
          return sqrt(-2.0 * log(u1)) * cos(6.2831853 * u2);
        }
        vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
        vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
        void main(){
          // gl_FragCoord.y counts from the bottom of the canvas; we write the image upside down so that
          // readPixels returns the top image row first.
          vec2 pix = vec2(gl_FragCoord.x, gl_FragCoord.y);
          vec2 xd = (pix - 0.5 * uOut) / uF;
          vec2 xu = xd;
          for (int i = 0; i < 8; i++) {
            float r2 = dot(xu, xu);
            xu = xd / (1.0 + uK.x * r2 + uK.y * r2 * r2);
          }
          vec2 pr = xu * uF + 0.5 * uRT;
          vec2 uv = vec2(pr.x / uRT.x, 1.0 - pr.y / uRT.y);
          vec3 c = texture2D(tScene, uv).rgb;
          c *= uGain * uWB;
          c = aces(c);
          c = toSRGB(c);
          float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = mix(vec3(luma), c, uSaturation);
          c = (c - 0.5) * uContrast + 0.5;
          vec2 q = (pix - 0.5 * uOut) / (0.5 * length(uOut));
          c *= 1.0 - uVignette * dot(q, q);
          c = clamp(c, 0.0, 1.0) * 255.0;
          vec3 n = vec3(gauss(pix, 0.0), gauss(pix, 1.0), gauss(pix, 2.0));
          float lumaN = gauss(pix, 3.0);
          vec3 sigma = sqrt(uRead * uRead + uShot * c);
          c += sigma * (0.6 * vec3(lumaN) + 0.55 * n);
          gl_FragColor = vec4(floor(clamp(c, 0.0, 255.0) + 0.5) / 255.0, 1.0);
        }`,
      depthTest: false,
      depthWrite: false,
    })
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat))
    return mat
  }

  /**
   * Converts the 8-bit post image to planar yuv420p (BT.709, limited range). Each output texel holds
   * 4 consecutive bytes of the Y, U, V stream, so readPixels returns the exact ffmpeg rawvideo layout.
   * Chroma is the mean of each 2x2 block (centre sited).
   */
  private buildPack(): THREE.ShaderMaterial {
    const d = this.desc
    return new THREE.ShaderMaterial({
      uniforms: { tImg: { value: this.postRT!.texture }, uW: { value: d.width }, uH: { value: d.height } },
      vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        precision highp float; precision highp int;
        uniform highp sampler2D tImg; uniform int uW; uniform int uH;
        const vec3 KY = vec3(0.2126, 0.7152, 0.0722);
        float byteAt(int idx) {
          int ySize = uW * uH;
          if (idx < ySize) {
            int y = idx / uW;
            int x = idx - y * uW;
            return 16.0 + 219.0 * dot(texelFetch(tImg, ivec2(x, y), 0).rgb, KY);
          }
          int cw = uW / 2;
          int ch = uH / 2;
          int k = idx - ySize;
          int plane = k / (cw * ch);
          k -= plane * cw * ch;
          int cy = k / cw;
          int cx = k - cy * cw;
          vec3 c = 0.25 * (texelFetch(tImg, ivec2(2 * cx, 2 * cy), 0).rgb + texelFetch(tImg, ivec2(2 * cx + 1, 2 * cy), 0).rgb
                        + texelFetch(tImg, ivec2(2 * cx, 2 * cy + 1), 0).rgb + texelFetch(tImg, ivec2(2 * cx + 1, 2 * cy + 1), 0).rgb);
          float yv = dot(c, KY);
          return plane == 0 ? 128.0 + 224.0 * (c.b - yv) / 1.8556 : 128.0 + 224.0 * (c.r - yv) / 1.5748;
        }
        void main(){
          int base = int(gl_FragCoord.y) * uW + int(gl_FragCoord.x) * 4;
          vec4 o = vec4(byteAt(base), byteAt(base + 1), byteAt(base + 2), byteAt(base + 3));
          gl_FragColor = floor(clamp(o, 0.0, 255.0) + 0.5) / 255.0;
        }`,
      depthTest: false,
      depthWrite: false,
    })
  }

  private setBones(packed: number[]): void {
    for (let b = 0; b < this.bones.length; b++) {
      const o = this.bones[b]
      const k = b * 7
      o.position.set(packed[k], packed[k + 1], packed[k + 2])
      o.quaternion.set(packed[k + 3], packed[k + 4], packed[k + 5], packed[k + 6])
    }
  }

  private setBalls(balls: { samples: number[] }[]): void {
    const cam = this.camera
    cam.updateMatrixWorld()
    const v = new THREE.Vector3()
    const camInv = cam.matrixWorldInverse
    const W = this.desc.renderWidth
    const H = this.desc.renderHeight
    const lightView = this.sunDir.clone().transformDirection(camInv)
    const L = this.desc.lighting
    for (let b = 0; b < this.balls.length; b++) {
      const slot = this.balls[b]
      const data = balls[b]
      if (!data || data.samples.length === 0) {
        slot.quad.visible = false
        slot.shadow.visible = false
        continue
      }
      const n = Math.min(MAX_BALL_SAMPLES, data.samples.length / 3)
      let xmin = Infinity
      let ymin = Infinity
      let xmax = -Infinity
      let ymax = -Infinity
      let anyFront = false
      const u = slot.mat.uniforms
      const midIdx = Math.floor(n / 2)
      let midNdcZ = 0
      for (let i = 0; i < n; i++) {
        v.set(data.samples[3 * i], data.samples[3 * i + 1], data.samples[3 * i + 2])
        const depth = -v.clone().applyMatrix4(camInv).z
        v.project(cam)
        const px = ((v.x + 1) / 2) * W
        const py = ((v.y + 1) / 2) * H
        const rad = depth > 0 ? (this.desc.fyPx * BALL_RADIUS_M) / depth : 0
        if (depth > 0) anyFront = true
        u.uSamples.value[i].set(px, py, rad)
        xmin = Math.min(xmin, px - rad - 2)
        xmax = Math.max(xmax, px + rad + 2)
        ymin = Math.min(ymin, py - rad - 2)
        ymax = Math.max(ymax, py + rad + 2)
        if (i === midIdx) midNdcZ = v.z
      }
      const mid = new THREE.Vector3(data.samples[3 * midIdx], data.samples[3 * midIdx + 1], data.samples[3 * midIdx + 2])
      slot.shadow.position.copy(mid)
      slot.shadow.visible = true
      if (!anyFront || midNdcZ > 1 || xmax < 0 || ymax < 0 || xmin > W || ymin > H) {
        slot.quad.visible = false
        continue
      }
      u.uCount.value = n
      u.uRect.value.set((xmin / W) * 2 - 1, (ymin / H) * 2 - 1, (xmax / W) * 2 - 1, (ymax / H) * 2 - 1)
      u.uDepth.value = midNdcZ
      u.uLight.value.copy(lightView)
      u.uSun.value = L.sunIntensity > 0 ? Math.min(2.5, L.sunIntensity * 0.9) : 0
      u.uAmbient.value = L.hemiIntensity * 0.55 + (L.floodlights ? L.floodIntensity * 0.02 : 0)
      slot.quad.visible = true
    }
  }

  /** Render one frame into `out` (frameBytes long): RGBA or packed yuv420p, top image row first. */
  renderFrame(f: FrameData, out: Uint8Array<ArrayBuffer>): void {
    const r = this.renderer
    this.camera.position.set(f.camera.pos[0], f.camera.pos[1], f.camera.pos[2])
    this.camera.quaternion.set(f.camera.quat[0], f.camera.quat[1], f.camera.quat[2], f.camera.quat[3])
    this.camera.updateMatrixWorld()
    const K = f.sub.length
    if (this.accRT) {
      r.setRenderTarget(this.accRT)
      r.setClearColor(0x000000, 1)
      r.clear()
    }
    for (const sub of f.sub) {
      this.setBones(sub.bones)
      this.setBalls(sub.balls)
      r.setRenderTarget(this.msaaRT)
      r.render(this.scene, this.camera)
      if (this.accRT) {
        this.accMat.uniforms.tSrc.value = this.msaaRT.texture
        this.accMat.uniforms.uWeight.value = 1 / K
        r.setRenderTarget(this.accRT)
        r.autoClear = false
        r.render(this.accScene, this.postCam)
        r.autoClear = true
      }
    }
    this.postMat.uniforms.tScene.value = this.accRT ? this.accRT.texture : this.msaaRT.texture
    this.postMat.uniforms.uGain.value = f.gain * this.desc.post.exposure
    this.postMat.uniforms.uSeed.value = f.noiseSeed % 9973
    if (this.postRT && this.packRT) {
      r.setRenderTarget(this.postRT)
      r.render(this.postScene, this.postCam)
      r.setRenderTarget(this.packRT)
      r.render(this.packScene, this.postCam)
      r.readRenderTargetPixels(this.packRT, 0, 0, this.packRT.width, this.packRT.height, out)
      r.setRenderTarget(null)
      return
    }
    r.setRenderTarget(null)
    r.render(this.postScene, this.postCam)
    const gl = r.getContext()
    gl.readPixels(0, 0, this.desc.width, this.desc.height, gl.RGBA, gl.UNSIGNED_BYTE, out)
  }
}

/** Frames sent but not yet acknowledged by the Node driver (bounds memory and applies backpressure). */
const MAX_IN_FLIGHT = 3

async function main(): Promise<void> {
  const params = new URLSearchParams(location.search)
  const job = params.get('job') ?? '0'
  const status = document.getElementById('status')!
  try {
    const desc = (await (await fetch(`/job/${job}/scene`)).json()) as SceneDescription
    const canvas = document.createElement('canvas')
    document.body.appendChild(canvas)
    const renderer = new ServeRenderer(canvas, desc)
    const ws = new WebSocket(`ws://${location.host}/job/${job}/ws`)
    ws.binaryType = 'arraybuffer'
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve()
      ws.onerror = () => reject(new Error('websocket failed to open'))
    })
    let inFlight = 0
    let wake: (() => void) | null = null
    let socketError: Error | null = null
    ws.onmessage = () => {
      inFlight--
      wake?.()
    }
    ws.onclose = () => {
      socketError = new Error('websocket closed early')
      wake?.()
    }
    const waitUntil = async (cond: () => boolean) => {
      while (!cond()) {
        if (socketError) throw socketError
        await new Promise<void>((r) => (wake = r))
      }
    }
    const prof = { fetchMs: 0, renderMs: 0, sendWaitMs: 0, frames: 0 }
    let next = 0
    for (;;) {
      let t = performance.now()
      const batch = (await (await fetch(`/job/${job}/frames?from=${next}&count=8`)).json()) as FrameData[]
      prof.fetchMs += performance.now() - t
      if (batch.length === 0) break
      for (const f of batch) {
        const msg = new Uint8Array(4 + renderer.frameBytes)
        new DataView(msg.buffer).setUint32(0, f.i, true)
        t = performance.now()
        renderer.renderFrame(f, msg.subarray(4))
        prof.renderMs += performance.now() - t
        t = performance.now()
        await waitUntil(() => inFlight < MAX_IN_FLIGHT)
        prof.sendWaitMs += performance.now() - t
        inFlight++
        ws.send(msg)
        prof.frames++
      }
      next += batch.length
    }
    await waitUntil(() => inFlight === 0)
    ws.close()
    await fetch(`/job/${job}/done`, { method: 'POST', body: JSON.stringify(prof) })
    status.textContent = 'done'
  } catch (e) {
    const msg = e instanceof Error ? `${e.message}
${e.stack}` : String(e)
    status.textContent = `error: ${msg}`
    await fetch(`/job/${job}/error`, { method: 'POST', body: msg })
  }
}

void main()
