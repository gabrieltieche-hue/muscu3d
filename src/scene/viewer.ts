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
    this.renderer.toneMapping = THREE.NeutralToneMapping
    this.renderer.toneMappingExposure = 0.66
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    container.appendChild(this.renderer.domElement)

    this.scene.background = this.gradientBackground()
    this.pmrem = new THREE.PMREMGenerator(this.renderer)
    this.scene.environment = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environmentIntensity = 0.5

    const w = container.clientWidth || 800
    const h = container.clientHeight || 600
    this.camera = new THREE.PerspectiveCamera(30, w / h, 0.05, 60)
    this.camera.position.set(1.9, 1.42, 3.4)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.target.set(0, 0.9, 0)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.minDistance = 1.0
    this.controls.maxDistance = 8
    this.controls.maxPolarAngle = Math.PI / 1.92
    this.controls.minPolarAngle = 0.25
    this.controls.autoRotateSpeed = 1.0
    this.controls.update()

    // lumières studio : clé douce, fill large, rim discret (sculpture)
    this.scene.add(new THREE.HemisphereLight(0xf4f5f7, 0x8d8b87, 0.26))

    const key = new THREE.DirectionalLight(0xfffaf2, 1.85)
    key.position.set(2.5, 2.5, 1.9)
    this.scene.add(key)

    const fill = new THREE.DirectionalLight(0xeef1ff, 0.16)
    fill.position.set(-3.2, 1.6, 1.8)
    this.scene.add(fill)

    const rim = new THREE.DirectionalLight(0xffffff, 0.95)
    rim.position.set(-1.2, 2.6, -3.2)
    this.scene.add(rim)

    // socle : cylindre clay à bord biseauté, même matière que le corps
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.54, 0.56, 0.045, 128, 1),
      new THREE.MeshStandardMaterial({ color: 0x87847e, roughness: 0.9, metalness: 0 }),
    )
    pedestal.position.y = -0.0225
    this.scene.add(pedestal)

    // ombre de contact douce
    const shadowTex = this.contactShadow()
    const contact = new THREE.Mesh(
      new THREE.PlaneGeometry(1.25, 0.95).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      }),
    )
    contact.position.set(0, 0.0036, 0.02)
    this.scene.add(contact)

    // anneau d'accent (couleur = mode actif) : très discret sur le socle
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.44, 0.444, 96).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x8d9aa4, transparent: true, opacity: 0.1 }),
    )
    this.ring.position.y = 0.0006
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
    const g = ctx.createRadialGradient(512, 380, 30, 512, 470, 780)
    g.addColorStop(0, '#8b8b8b')
    g.addColorStop(0.55, '#7b7b7b')
    g.addColorStop(1, '#616161')
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
    g.addColorStop(0, 'rgba(30,28,26,0.55)')
    g.addColorStop(0.35, 'rgba(30,28,26,0.28)')
    g.addColorStop(0.7, 'rgba(30,28,26,0.08)')
    g.addColorStop(1, 'rgba(30,28,26,0)')
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
    const target = new THREE.Vector3(0, 0.9, 0)
    const pos = {
      face: new THREE.Vector3(0, 1.0, 4.0),
      profil: new THREE.Vector3(4.0, 1.0, 0),
      dos: new THREE.Vector3(0, 1.0, -4.0),
      troisquarts: new THREE.Vector3(3.25, 1.28, 2.75),
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
