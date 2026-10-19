import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/** Scène studio : fond dégradé, socle, éclairage doux, caméra orbitale. */
export class Viewer {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private controls: OrbitControls
  private pivot = new THREE.Group()
  private ring: THREE.Mesh
  private raf = 0
  private ro: ResizeObserver
  private container: HTMLElement
  private pmrem: THREE.PMREMGenerator

  constructor(container: HTMLElement) {
    this.container = container

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(container.clientWidth || 800, container.clientHeight || 600)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.95
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    container.appendChild(this.renderer.domElement)

    this.scene.background = this.gradientBackground()
    this.pmrem = new THREE.PMREMGenerator(this.renderer)
    this.scene.environment = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environmentIntensity = 0.4

    const w = container.clientWidth || 800
    const h = container.clientHeight || 600
    this.camera = new THREE.PerspectiveCamera(30, w / h, 0.05, 60)
    this.camera.position.set(1.9, 1.42, 3.4)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.target.set(0, 0.92, 0)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.minDistance = 1.0
    this.controls.maxDistance = 8
    this.controls.maxPolarAngle = Math.PI / 1.92
    this.controls.minPolarAngle = 0.25
    this.controls.autoRotateSpeed = 1.0
    this.controls.update()

    // lumières studio
    this.scene.add(new THREE.HemisphereLight(0xe9f2ff, 0x14171c, 0.38))

    const key = new THREE.DirectionalLight(0xfff1e0, 2.5)
    key.position.set(3.1, 3.4, 1.5)
    this.scene.add(key)

    const fill = new THREE.DirectionalLight(0xccdcff, 0.42)
    fill.position.set(-3.0, 1.2, 2.4)
    this.scene.add(fill)

    const rim = new THREE.DirectionalLight(0x9dc5ff, 2.8)
    rim.position.set(-1.8, 2.4, -3.0)
    this.scene.add(rim)

    // socle
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.525, 0.05, 96, 1),
      new THREE.MeshStandardMaterial({ color: 0x262b33, roughness: 0.62, metalness: 0.18 }),
    )
    pedestal.position.y = -0.022
    this.scene.add(pedestal)

    const edge = new THREE.Mesh(
      new THREE.TorusGeometry(0.5, 0.0022, 8, 96).rotateX(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x6d7684, roughness: 0.35, metalness: 0.6 }),
    )
    edge.position.y = 0.003
    this.scene.add(edge)

    // ombre de contact douce
    const shadowTex = this.contactShadow()
    const contact = new THREE.Mesh(
      new THREE.PlaneGeometry(1.25, 0.95).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
      }),
    )
    contact.position.set(0, 0.0036, 0.02)
    this.scene.add(contact)

    // anneau d'accent (couleur = mode actif)
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 0.407, 96).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.55 }),
    )
    this.ring.position.y = 0.0042
    this.scene.add(this.ring)

    this.scene.add(this.pivot)

    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(container)
    this.animate()
  }

  private gradientBackground(): THREE.Texture {
    const c = document.createElement('canvas')
    c.width = 1024
    c.height = 1024
    const ctx = c.getContext('2d')!
    const g = ctx.createRadialGradient(512, 400, 40, 512, 470, 760)
    g.addColorStop(0, '#222932')
    g.addColorStop(0.45, '#151b22')
    g.addColorStop(1, '#07090c')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 1024, 1024)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }

  private contactShadow(): THREE.Texture {
    const c = document.createElement('canvas')
    c.width = 512
    c.height = 512
    const ctx = c.getContext('2d')!
    const g = ctx.createRadialGradient(256, 256, 10, 256, 256, 250)
    g.addColorStop(0, 'rgba(0,0,0,0.95)')
    g.addColorStop(0.35, 'rgba(0,0,0,0.55)')
    g.addColorStop(0.7, 'rgba(0,0,0,0.16)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 512, 512)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }

  private resize() {
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    if (w < 2 || h < 2) return
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  private animate = () => {
    this.raf = requestAnimationFrame(this.animate)
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  setBody(group: THREE.Group) {
    for (const child of [...this.pivot.children]) {
      child.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.geometry) m.geometry.dispose()
      })
      this.pivot.remove(child)
    }
    this.pivot.add(group)
  }

  setAccent(hex: number) {
    ;(this.ring.material as THREE.MeshBasicMaterial).color.setHex(hex)
  }

  setWireframeVisible(v: boolean) {
    this.pivot.traverse((o) => {
      if (o.userData.isWire) o.visible = v
    })
  }

  setAutoRotate(v: boolean) {
    this.controls.autoRotate = v
  }

  setCameraPreset(p: 'face' | 'profil' | 'dos' | 'troisquarts') {
    const target = new THREE.Vector3(0, 0.92, 0)
    const pos = {
      face: new THREE.Vector3(0, 1.02, 3.55),
      profil: new THREE.Vector3(3.55, 1.02, 0),
      dos: new THREE.Vector3(0, 1.02, -3.55),
      troisquarts: new THREE.Vector3(1.9, 1.42, 3.4),
    }[p]
    this.camera.position.copy(pos)
    this.controls.target.copy(target)
    this.controls.update()
  }

  /** Outil de dev : caméra libre via query string (?cam=x,y,z&target=x,y,z). */
  setCameraPosition(px: number, py: number, pz: number, tx: number, ty: number, tz: number) {
    this.camera.position.set(px, py, pz)
    this.controls.target.set(tx, ty, tz)
    this.controls.update()
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    this.controls.dispose()
    this.pmrem.dispose()
    this.pivot.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.geometry) m.geometry.dispose()
    })
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
