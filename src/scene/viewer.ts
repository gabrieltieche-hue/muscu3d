import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js'

/**
 * Scène studio : rendu de « statue de plâtre » — fond neutre dégradé, socle
 * biseauté, éclairage trois points doux, occlusion ambiante, ombres portées
 * et tone mapping filmique.
 *
 * Le passage en post-traitement (GTAO + MSAA + tone mapping + vignette) est
 * ce qui sépare un « viewer Three.js » d'un rendu de studio : sans lui, le
 * corps reste plat, sans ombre au sol ni creux dans les plis.
 */

/** Vignette + léger étalonnage, appliqué en fin de chaîne. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uVignette: { value: 0.26 },
    uGrain: { value: 0.016 },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uTime;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      // vignette douce (studio : les bords tombent dans le gris)
      vec2 d = vUv - 0.5;
      float r = length(d * vec2(1.05, 1.0));
      float vig = 1.0 - uVignette * smoothstep(0.32, 0.86, r);
      c.rgb *= vig;
      // grain fin : casse le banding des dégradés, comme un vrai tirage
      float g = hash(vUv * 1024.0 + uTime) - 0.5;
      c.rgb += g * uGrain;
      gl_FragColor = c;
    }
  `,
}

/** Environnement studio : 3 boîtes à lumière + un fond dégradé. */
function studioEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer)
  const scene = new THREE.Scene()

  // fond : gris dégradé
  const geo = new THREE.SphereGeometry(12, 32, 24)
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {},
    vertexShader: /* glsl */ `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vPos;
      void main() {
        float h = clamp(vPos.y / 12.0 * 0.5 + 0.5, 0.0, 1.0);
        vec3 c = mix(vec3(0.055, 0.055, 0.058), vec3(0.62, 0.63, 0.66), pow(h, 0.75));
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  })
  scene.add(new THREE.Mesh(geo, mat))

  // boîtes à lumière (émissives) : clé chaude en haut à droite, remplissage
  // froid à gauche, contre-jour discret derrière
  const box = (w: number, h: number, x: number, y: number, z: number, color: number, power: number) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(power) }),
    )
    m.position.set(x, y, z)
    m.lookAt(0, 0.9, 0)
    scene.add(m)
  }
  box(6, 6, 5.5, 5.5, 4.5, 0xfff3e2, 6.2)
  box(7, 5, -6.5, 2.2, 2.5, 0xdce6ff, 1.5)
  box(8, 3, -1.5, 4.0, -6.5, 0xffffff, 2.1)
  box(9, 9, 0, -3.5, 0, 0x6b6a68, 0.5)

  const tex = pmrem.fromScene(scene, 0.02).texture
  geo.dispose()
  mat.dispose()
  pmrem.dispose()
  return tex
}

export class Viewer {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private controls: OrbitControls
  private pivot = new THREE.Group()
  private raf = 0
  private ro: ResizeObserver
  private container: HTMLElement
  private composer: EffectComposer
  private grade: ShaderPass
  private smaa: SMAAPass
  private gtao: GTAOPass
  private key: THREE.DirectionalLight
  private clock = new THREE.Clock()

  constructor(container: HTMLElement) {
    this.container = container

    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(container.clientWidth || 800, container.clientHeight || 600)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.98
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    container.appendChild(this.renderer.domElement)

    // Fond gris neutre UNI (référence studio) : pas de dégradé, pas de ciel.
    // L'environnement (boîtes à lumière) reste séparé : il ne sert qu'aux
    // reflets doux du matériau, pas au fond visible.
    this.scene.background = new THREE.Color(0x8c8c8c)
    this.scene.environment = studioEnvironment(this.renderer)
    this.scene.environmentIntensity = 0.38
    // debug : ?shadow=0 désactive les ombres portées
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('shadow') === '0') {
      this.renderer.shadowMap.enabled = false
    }

    const w = container.clientWidth || 800
    const h = container.clientHeight || 600
    this.camera = new THREE.PerspectiveCamera(26, w / h, 0.05, 60)
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

    // --- éclairage studio (trois points + ambiance) ---
    // Ambiance : débouche les creux (aisselles, entrejambe, sous le socle)
    // sans aplatir le modelé. C'est une lumière d'appoint, pas la lumière
    // principale.
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.1))
    this.scene.add(new THREE.HemisphereLight(0xe4ebf5, 0x5a5854, 0.1))

    // Clé : modelé principal, en haut à droite et devant. Elle sculpte les
    // pectoraux et les abdos. Elle ne projette PAS d'ombre : sur la
    // sculpture de référence, l'ombre au sol est un simple contact.
    const key = new THREE.DirectionalLight(0xfff8ef, 2.9)
    key.position.set(2.7, 3.3, 2.5)
    this.scene.add(key)

    // Remplissage froid, large, à gauche : il tient les ombres du côté
    // opposé sans les boucher.
    const fill = new THREE.DirectionalLight(0xdce6ff, 0.28)
    fill.position.set(-3.4, 1.6, 2.2)
    this.scene.add(fill)

    // Contre-jour gauche : détache la silhouette du fond gris et dessine le
    // liseré clair sur l'épaule et le bras (visible sur les vues de dos et
    // de profil de la référence).
    const rim = new THREE.DirectionalLight(0xffffff, 1.5)
    rim.position.set(-2.1, 2.9, -3.3)
    this.scene.add(rim)

    // Second contre-jour, plus bas à droite : évite que le dos soit plat et
    // souligne les omoplates et le triceps.
    const rim2 = new THREE.DirectionalLight(0xffffff, 0.7)
    rim2.position.set(3.0, 1.8, -2.8)
    this.scene.add(rim2)

    // Ombre : lumière quasi zénithale, elle plaque la statue au socle et
    // dessine une ombre de contact serrée (comme sur la référence).
    this.key = new THREE.DirectionalLight(0xffffff, 0.55)
    this.key.position.set(0.35, 6.0, 0.45)
    this.key.castShadow = true
    this.key.shadow.mapSize.set(2048, 2048)
    this.key.shadow.camera.near = 4
    this.key.shadow.camera.far = 8.5
    this.key.shadow.camera.left = -0.5
    this.key.shadow.camera.right = 0.5
    this.key.shadow.camera.top = 0.5
    this.key.shadow.camera.bottom = -0.5
    this.key.shadow.bias = -0.0015
    this.key.shadow.normalBias = 0.022
    this.key.shadow.radius = 4
    this.key.target.position.set(0, 0, 0)
    this.scene.add(this.key)
    this.scene.add(this.key.target)

    // --- socle ---
    // Socle large et bas, comme sur la référence : le corps ne doit pas
    // déborder. Rayon 0,38 m pour une statue de 1,75 m.
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.398, 0.044, 160, 1),
      new THREE.MeshStandardMaterial({
        color: 0x5e5e5e,
        roughness: 0.88,
        metalness: 0,
        envMapIntensity: 0.5,
      }),
    )
    pedestal.position.y = -0.022
    pedestal.receiveShadow = true
    this.scene.add(pedestal)

    // Biseau supérieur : un second disque très fin, plus clair, qui capte la
    // lumière et dessine l'arête du socle comme sur la référence.
    const bevel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3785, 0.38, 0.005, 160, 1),
      new THREE.MeshStandardMaterial({ color: 0x757575, roughness: 0.8, metalness: 0 }),
    )
    bevel.position.y = 0.0015
    bevel.receiveShadow = true
    this.scene.add(bevel)

    // --- ombre de contact (assombrit le socle sous les pieds) ---
    const contact = new THREE.Mesh(
      new THREE.PlaneGeometry(0.66, 0.54).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        map: this.contactShadow(),
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
      }),
    )
    contact.position.set(0, 0.0045, 0.01)
    contact.renderOrder = 1
    this.scene.add(contact)

    this.scene.add(this.pivot)

    // --- post-traitement ---
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2())
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: 4, // MSAA multi-échantillonné
    })
    this.composer = new EffectComposer(this.renderer, target)
    this.composer.addPass(new RenderPass(this.scene, this.camera))

    // Occlusion ambiante : c'est elle qui creuse les plis (aisselles, entre-
    // jambes, sous les pectoraux) et qui donne le relief « sculpture ».
    this.gtao = new GTAOPass(this.scene, this.camera, size.x, size.y)
    this.gtao.output = GTAOPass.OUTPUT.Default
    this.gtao.blendIntensity = 1.15
    this.gtao.updateGtaoMaterial({
      radius: 0.2,
      distanceExponent: 1.0,
      thickness: 0.4,
      scale: 1.1,
      samples: 16,
      distanceFallOff: 1.0,
      screenSpaceRadius: false,
    })
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, rings: 2, samples: 16 })
    this.composer.addPass(this.gtao)

    this.grade = new ShaderPass(GradeShader)
    this.composer.addPass(this.grade)

    this.smaa = new SMAAPass()
    this.composer.addPass(this.smaa)

    this.composer.addPass(new OutputPass())

    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(container)
    this.animate()
  }

  private contactShadow(): THREE.Texture {
    const c = document.createElement('canvas')
    c.width = 512
    c.height = 512
    const ctx = c.getContext('2d')!
    const g = ctx.createRadialGradient(256, 256, 8, 256, 256, 250)
    g.addColorStop(0, 'rgba(22,20,18,0.72)')
    g.addColorStop(0.3, 'rgba(22,20,18,0.38)')
    g.addColorStop(0.66, 'rgba(22,20,18,0.11)')
    g.addColorStop(1, 'rgba(22,20,18,0)')
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
    this.composer.setSize(w, h)
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2())
    this.gtao.setSize(size.x, size.y)
  }

  private animate = () => {
    this.raf = requestAnimationFrame(this.animate)
    this.controls.update()
    this.grade.uniforms.uTime.value = this.clock.getElapsedTime()
    this.composer.render()
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

  /**
   * Affiche les repères anatomiques du modèle (mode debug `?joints=1`).
   * Sert à vérifier l'import d'un modèle externe : les repères mal placés
   * se voient immédiatement.
   */
  setJoints(joints: Record<string, THREE.Vector3> | null) {
    const existing = this.pivot.getObjectByName('__joints')
    if (existing) {
      this.pivot.remove(existing)
      ;(existing as THREE.Group).traverse((o) => {
        const m = o as THREE.Mesh
        if (m.geometry) m.geometry.dispose()
      })
    }
    if (!joints) return
    const g = new THREE.Group()
    g.name = '__joints'
    const geo = new THREE.SphereGeometry(0.012, 12, 8)
    const mat = new THREE.MeshBasicMaterial({ color: 0xff3366, depthTest: false })
    for (const [name, p] of Object.entries(joints)) {
      const s = new THREE.Mesh(geo, mat)
      s.position.copy(p)
      s.renderOrder = 999
      s.name = name
      g.add(s)
    }
    this.pivot.add(g)
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
      face: new THREE.Vector3(0, 0.98, 4.55),
      profil: new THREE.Vector3(4.55, 0.98, 0),
      dos: new THREE.Vector3(0, 0.98, -4.55),
      troisquarts: new THREE.Vector3(3.4, 1.2, 2.9),
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
    this.composer.dispose()
    this.pivot.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.geometry) m.geometry.dispose()
    })
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
