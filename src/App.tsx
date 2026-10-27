import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Viewer } from './scene/viewer'
import { loadBodyModel, getLoadedBody, type LoadedBody } from './lib/base/model'
import { clearBaseMeshCache } from './lib/base/mesh'
import { clearPoseCache } from './lib/base/pose'
import { buildBody, PRESETS, type BodyMetrics, type BodyParams } from './lib/body'
import { FIXED_PARAMS } from './lib/referenceProfile'
import { buildParametricStatue, buildStatue, type StatueBody } from './lib/statue'

type ViewKey = 'face' | 'profil' | 'dos' | 'troisquarts'

const VIEWS: { key: ViewKey; label: string; short: string }[] = [
  { key: 'face', label: 'Face', short: 'F' },
  { key: 'profil', label: 'Profil', short: 'P' },
  { key: 'dos', label: 'Dos', short: 'D' },
  { key: 'troisquarts', label: '3/4', short: '¾' },
]

const VIEW_LABEL: Record<ViewKey, string> = {
  face: 'Vue de face',
  profil: 'Vue de profil',
  dos: 'Vue de dos',
  troisquarts: 'Vue trois-quarts',
}

interface SliderDef {
  key: keyof BodyParams
  label: string
  min: number
  max: number
  unit?: string
}

/** Groupes de curseurs affichés dans la fiche. */
const GROUPS: { title: string; sliders: SliderDef[] }[] = [
  {
    title: 'Corpulence',
    sliders: [
      { key: 'fat', label: 'Masse grasse', min: 5, max: 40, unit: '%' },
      { key: 'belly', label: 'Ventre', min: 0, max: 100 },
    ],
  },
  {
    title: 'Haut du corps',
    sliders: [
      { key: 'shoulders', label: 'Épaules', min: 0, max: 100 },
      { key: 'lats', label: 'Dorsaux', min: 0, max: 100 },
      { key: 'pecs', label: 'Pectoraux', min: 0, max: 100 },
      { key: 'neck', label: 'Cou', min: 0, max: 100 },
      { key: 'abs', label: 'Abdominaux', min: 0, max: 100 },
    ],
  },
  {
    title: 'Bras',
    sliders: [
      { key: 'arms', label: 'Biceps / triceps', min: 0, max: 100 },
      { key: 'forearms', label: 'Avant-bras', min: 0, max: 100 },
    ],
  },
  {
    title: 'Bas du corps',
    sliders: [
      { key: 'glutes', label: 'Fessiers', min: 0, max: 100 },
      { key: 'thighs', label: 'Cuisses', min: 0, max: 100 },
      { key: 'calves', label: 'Mollets', min: 0, max: 100 },
    ],
  },
]

const PARAM_KEYS = Object.keys(FIXED_PARAMS) as (keyof BodyParams)[]
const LS_KEY = 'muscu3d.params.v2'

const SOURCE_URL =
  'https://static.makehumancommunity.org/makehuman/faq/are_makehuman_files_free.html'

const BASE_MESH_URL =
  'https://www.innerscene.com/tools/library/3d-parts/male-base-mesh-3d-person-rigged-a-pose-380e6d89'

function IconDownload() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v12" />
      <path d="m7 11 5 5 5-5" />
      <path d="M4 20h16" />
    </svg>
  )
}

function IconRotate() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path d="M20 4v5h-5" />
    </svg>
  )
}

function IconMesh() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 3 8v8l9 5 9-5V8z" />
      <path d="m3 8 9 5 9-5" />
      <path d="M12 13v8" />
    </svg>
  )
}

function IconPedestal() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v5c0 1.66 3.58 3 8 3s8-1.34 8-3V6" />
      <path d="M8 13.4V19c0 .55 1.8 1 4 1s4-.45 4-1v-5.6" />
    </svg>
  )
}

function IconArrow() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </svg>
  )
}

/** Formate un nombre à la française (virgule décimale). */
function fr(value: number, digits = 1): string {
  return value.toFixed(digits).replace('.', ',')
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${fr(bytes / (1024 * 1024), 1)} Mo`
  return `${Math.round(bytes / 1024)} Ko`
}

function initialView(): ViewKey {
  if (typeof location === 'undefined') return 'troisquarts'
  const v = new URLSearchParams(location.search).get('view')
  return v === 'face' || v === 'profil' || v === 'dos' || v === 'troisquarts' ? v : 'troisquarts'
}

function initialFlag(name: string): boolean {
  if (typeof location === 'undefined') return false
  return new URLSearchParams(location.search).get(name) === '1'
}

/** Paramètres initiaux : référence, puis localStorage, puis `?fat=…` etc. */
function initialParams(): BodyParams {
  const p: BodyParams = { ...FIXED_PARAMS }
  try {
    const stored = localStorage.getItem(LS_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<BodyParams>
      for (const k of PARAM_KEYS) {
        if (Number.isFinite(parsed[k])) p[k] = parsed[k] as number
      }
    }
  } catch {
    /* état illisible : on garde le profil de référence */
  }
  const qs = new URLSearchParams(location.search)
  for (const k of PARAM_KEYS) {
    const v = qs.get(k)
    if (v !== null && Number.isFinite(Number(v))) p[k] = Number(v)
  }
  return p
}

/** Un modèle externe est paramétrable s'il n'a qu'un maillage. */
function canMorph(model: LoadedBody): boolean {
  let meshes = 0
  model.scene.traverse((o) => {
    if ((o as { isMesh?: boolean }).isMesh) meshes++
  })
  return meshes === 1 && model.positions.length / 3 >= 1000 && !model.makehuman
}

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Viewer | null>(null)
  const statueRef = useRef<StatueBody | null>(null)

  const [view, setView] = useState<ViewKey>(initialView)
  const [rotate, setRotate] = useState(() => initialFlag('rotate'))
  const [wire, setWire] = useState(() => new URLSearchParams(location.search).get('wire') === '1')
  const [pedestal, setPedestal] = useState(
    () => new URLSearchParams(location.search).get('socle') !== '0',
  )
  const [params, setParams] = useState<BodyParams>(initialParams)

  const [metrics, setMetrics] = useState<BodyMetrics | null>(null)
  const [ready, setReady] = useState(false)
  const [built, setBuilt] = useState(false)
  const [raw, setRaw] = useState(false)
  const [source, setSource] = useState('modele.glb')
  const [fileSize, setFileSize] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [switching, setSwitching] = useState(false)

  const wireRef = useRef(wire)
  const pedestalRef = useRef(pedestal)
  const paramsRef = useRef(params)
  const timerRef = useRef<number | null>(null)
  const frameRef = useRef<number | null>(null)
  const lastBuildRef = useRef(0)
  wireRef.current = wire
  pedestalRef.current = pedestal
  paramsRef.current = params

  const downloadHref = raw ? source : 'statue.glb'

  // 1. charger le fichier modèle : `modele.glb` s'il existe, sinon le corps
  //    de référence `body.glb`. `?model=xxx.glb` force un fichier précis.
  useEffect(() => {
    let alive = true
    loadBodyModel()
      .then((model) => {
        if (!alive) return
        setSource(model.url)
        setRaw(!model.makehuman)
        setReady(true)
      })
      .catch((e) => {
        console.error(e)
        if (alive) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      alive = false
    }
  }, [])

  // 2. créer la scène studio une seule fois.
  useEffect(() => {
    const v = new Viewer(mountRef.current!)
    viewerRef.current = v
    const qs = new URLSearchParams(location.search)
    const cam = qs.get('cam')
    const tgt = qs.get('target')
    if (cam) {
      const p = cam.split(',').map(Number)
      const t = (tgt ?? '0,0.9,0').split(',').map(Number)
      if (p.length === 3 && t.length === 3 && [...p, ...t].every(Number.isFinite)) {
        v.setCameraPosition(p[0], p[1], p[2], t[0], t[1], t[2])
      }
    }
    v.setPedestalVisible(pedestal)
    return () => {
      v.dispose()
      viewerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 3. construire la sculpture pour le fichier chargé.
  useEffect(() => {
    const v = viewerRef.current
    if (!v || !ready) return
    const model = getLoadedBody()
    if (!model) return
    try {
      if (model.makehuman) {
        clearBaseMeshCache()
        clearPoseCache()
        const { group, metrics: m } = buildBody(paramsRef.current)
        v.setBody(group)
        statueRef.current = null
        setMetrics(m)
      } else if (canMorph(model)) {
        // modèle téléchargé d'un seul tenant : masques anatomiques + curseurs
        const statue = buildParametricStatue(paramsRef.current)
        v.setBody(statue.group)
        statueRef.current = statue
        setMetrics(statue.update(paramsRef.current))
      } else {
        v.setBody(buildStatue().group)
        statueRef.current = null
        setMetrics(null)
      }
      v.setWireframeVisible(wireRef.current)
      v.setPedestalVisible(pedestalRef.current)
      lastBuildRef.current = performance.now()
      setBuilt(true)
    } catch (e) {
      console.error(e)
      setError(e instanceof Error ? e.message : String(e))
      setBuilt(true)
    }
    // `wire` et `pedestal` sont appliqués séparément : on ne reconstruit pas
    // la géométrie à chaque clic.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, source])

  // 4. curseurs : mise à jour en direct.
  useEffect(() => {
    if (!built) return
    const model = getLoadedBody()
    if (!model) return

    if (!model.makehuman) {
      // Modèle paramétrable : une mise à jour du maillage coûte ~9 ms. On la
      // coalesce à une par image (les événements d'un glissement rapide
      // s'empileraient sinon) et on redemande un rendu : la scène est en
      // rendu à la demande, elle ne se redessine pas toute seule.
      if (!statueRef.current || frameRef.current !== null) return
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null
        const statue = statueRef.current
        if (!statue) return
        setMetrics(statue.update(paramsRef.current))
        viewerRef.current?.refresh()
      })
      return
    }

    // MakeHuman : la reconstruction complète coûte ~80 ms. On la limite à
    // ~12 images/s pour que le curseur reste fluide.
    if (timerRef.current !== null) return
    const wait = Math.max(0, 80 - (performance.now() - lastBuildRef.current))
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      lastBuildRef.current = performance.now()
      const viewer = viewerRef.current
      if (!viewer) return
      try {
        const { group, metrics: m } = buildBody(paramsRef.current)
        viewer.setBody(group)
        viewer.setWireframeVisible(wireRef.current)
        setMetrics(m)
      } catch (e) {
        console.error(e)
      }
    }, wait)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, built])

  // 5. appliquer les réglages d'affichage.
  useEffect(() => {
    viewerRef.current?.setCameraPreset(view)
  }, [view])

  useEffect(() => {
    viewerRef.current?.setAutoRotate(rotate)
  }, [rotate])

  useEffect(() => {
    viewerRef.current?.setWireframeVisible(wire)
  }, [wire])

  useEffect(() => {
    viewerRef.current?.setPedestalVisible(pedestal)
  }, [pedestal])

  // 6. persistance locale des paramètres.
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(params))
    } catch {
      /* quota plein : sans conséquence */
    }
  }, [params])

  // 7. mode debug : affichage des repères anatomiques du modèle.
  useEffect(() => {
    const v = viewerRef.current
    if (!v || !built) return
    const show = new URLSearchParams(location.search).get('joints') === '1'
    v.setJoints(show ? (getLoadedBody()?.joints ?? null) : null)
  }, [built])

  // 8. poids du fichier téléchargeable (affiché dans la fiche).
  useEffect(() => {
    let alive = true
    setFileSize(null)
    fetch(downloadHref, { method: 'HEAD' })
      .then((r) => {
        const len = Number(r.headers.get('content-length'))
        if (alive && r.ok && Number.isFinite(len) && len > 0) setFileSize(formatSize(len))
      })
      .catch(() => {
        /* la taille est un détail : on l'ignore si le serveur ne la donne pas */
      })
    return () => {
      alive = false
    }
  }, [downloadHref])

  // 9. nettoyage du minuteur de reconstruction et de l'image différée.
  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    },
    [],
  )

  // 10. raccourcis clavier : 1–4 vues, R rotation, M maillage, S socle.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return
      if (e.key >= '1' && e.key <= '4') setView(VIEWS[Number(e.key) - 1].key)
      else if (e.key.toLowerCase() === 'r') setRotate((v) => !v)
      else if (e.key.toLowerCase() === 'm') setWire((v) => !v)
      else if (e.key.toLowerCase() === 's') setPedestal((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const change = (patch: Partial<BodyParams>) => setParams((p) => ({ ...p, ...patch }))
  const applyPreset = (name: keyof typeof PRESETS) =>
    setParams((p) => ({ ...p, ...PRESETS[name], height: p.height }))
  const reset = () => setParams({ ...FIXED_PARAMS })

  const switchModel = async (url: string) => {
    if (switching || url === source) return
    setSwitching(true)
    try {
      const model = await loadBodyModel(url, true)
      clearBaseMeshCache()
      clearPoseCache()
      setError(null)
      setBuilt(false)
      setMetrics(null)
      setSource(model.url)
      setRaw(!model.makehuman)
      setReady(true)
    } catch (e) {
      console.error(e)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSwitching(false)
    }
  }

  const viewIndex = VIEWS.findIndex((v) => v.key === view) + 1
  const heightPct = ((params.height - 150) / 50) * 100

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            M
          </span>
          <span className="brand-name">
            MUSCU<em>3D</em>
          </span>
        </div>

        <div className="topbar-meta">
          <span className="live">
            <span className="live-dot" aria-hidden="true" />
            Studio temps réel
          </span>
          <span className="meta-rule" aria-hidden="true" />
          <span className="meta-model">{raw ? 'Modèle importé' : 'Sculpture MakeHuman'}</span>
        </div>

        <div className="topbar-actions">
          {!raw && (
            <a className="btn-quiet" href={SOURCE_URL} target="_blank" rel="noreferrer">
              Source <IconArrow />
            </a>
          )}
          <a
            className="btn-primary"
            href={downloadHref}
            download
            aria-label="Télécharger le modèle GLB"
          >
            <IconDownload />
            <span>Télécharger le GLB</span>
          </a>
        </div>
      </header>

      <main className="stage" ref={mountRef}>
        <div className="stage-head">
          <p className="eyebrow">Vue {String(viewIndex).padStart(2, '0')} / 04</p>
          <p className="stage-title">{VIEW_LABEL[view]}</p>
        </div>

        <div className="stage-tag">{raw ? 'Modèle importé · paramétrable' : 'Sculpture paramétrable'}</div>

        <div className="dock" role="toolbar" aria-label="Contrôles de la scène">
          <div className="segmented" role="group" aria-label="Points de vue">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                type="button"
                className={view === v.key ? 'is-on' : ''}
                aria-pressed={view === v.key}
                onClick={() => setView(v.key)}
                title={`${v.label} (${VIEWS.indexOf(v) + 1})`}
              >
                <span className="seg-full">{v.label}</span>
                <span className="seg-short" aria-hidden="true">
                  {v.short}
                </span>
              </button>
            ))}
          </div>

          <span className="dock-rule" aria-hidden="true" />

          <div className="tools">
            <button
              type="button"
              className={`tool ${rotate ? 'is-on' : ''}`}
              aria-pressed={rotate}
              onClick={() => setRotate((v) => !v)}
              title="Rotation automatique (R)"
            >
              <IconRotate />
              <span>Rotation</span>
            </button>

            <button
              type="button"
              className={`tool ${wire ? 'is-on' : ''}`}
              aria-pressed={wire}
              onClick={() => setWire((v) => !v)}
              title="Afficher le maillage (M)"
            >
              <IconMesh />
              <span>Maillage</span>
            </button>

            <button
              type="button"
              className={`tool ${pedestal ? 'is-on' : ''}`}
              aria-pressed={pedestal}
              onClick={() => setPedestal((v) => !v)}
              title="Afficher le socle (S)"
            >
              <IconPedestal />
              <span>Socle</span>
            </button>
          </div>
        </div>

        <p className="stage-hint">Glisser pour orbiter · molette pour zoomer</p>

        {!built && !error && (
          <div className="loader" role="status" aria-live="polite">
            <span className="loader-ring" aria-hidden="true" />
            <span>{switching ? 'Chargement du modèle…' : 'Sculpture du corps…'}</span>
          </div>
        )}

        {error && (
          <div className="overlay">
            <div className="overlay-card" role="alert">
              <p className="eyebrow">Modèle indisponible</p>
              <p className="overlay-text">{error}</p>
              <p className="overlay-note">
                Dépose un fichier <code>.glb</code> dans <code>public/</code> sous le nom{' '}
                <code>modele.glb</code>, puis recharge la page.
              </p>
              <button type="button" className="btn-primary" onClick={() => location.reload()}>
                Réessayer
              </button>
            </div>
          </div>
        )}
      </main>

      <aside className="panel">
        <div className="panel-inner">
          <p className="eyebrow">{raw ? 'Fichier importé' : 'Profil de référence'}</p>
          <h1>
            {raw ? 'Grey' : 'L’athlète'}
            <br />
            <em>{raw ? 'Adonis' : 'sec'}</em>
          </h1>
          <p className="lede">
            {raw
              ? 'Le fichier téléchargé, débarrassé de son socle et rendu paramétrable. Bougez les curseurs : la statue se déforme en direct.'
              : 'Silhouette en V, taille marquée, musculature sèche. Les curseurs pilotent le morphing du maillage MakeHuman.'}
          </p>

          <div className="model-switch" role="group" aria-label="Modèle affiché">
            <button
              type="button"
              className={raw ? 'is-on' : ''}
              aria-pressed={raw}
              disabled={switching}
              onClick={() => switchModel('modele.glb')}
            >
              Adonis
              <small>importé</small>
            </button>
            <button
              type="button"
              className={!raw ? 'is-on' : ''}
              aria-pressed={!raw}
              disabled={switching}
              onClick={() => switchModel('body.glb')}
            >
              Référence
              <small>MakeHuman</small>
            </button>
          </div>

          {metrics ? (
            <div className="metrics">
              <div className="metric">
                <span>Poids</span>
                <b>
                  {fr(metrics.weight)}
                  <small>kg</small>
                </b>
              </div>
              <div className="metric">
                <span>Masse grasse</span>
                <b>
                  {fr(params.fat, 0)}
                  <small>%</small>
                </b>
              </div>
              <div className="metric">
                <span>Masse maigre</span>
                <b>
                  {fr(metrics.lean)}
                  <small>kg</small>
                </b>
              </div>
              <div className="metric">
                <span>Tour de taille</span>
                <b>
                  {fr(metrics.waist, 0)}
                  <small>cm</small>
                </b>
              </div>
              <div className="metric">
                <span>Poitrine</span>
                <b>
                  {fr(metrics.chest, 0)}
                  <small>cm</small>
                </b>
              </div>
              <div className="metric">
                <span>Bras</span>
                <b>
                  {fr(metrics.arm)}
                  <small>cm</small>
                </b>
              </div>
            </div>
          ) : (
            <div className="empty">
              <p>Métriques indisponibles</p>
              <span>
                Ce fichier n’a pas un maillage unique : il est affiché tel quel, sans estimation
                de volume.
              </span>
            </div>
          )}

          <section className="block controls">
            <div className="block-head">
              <h2>Réglage</h2>
              <button type="button" className="reset" onClick={reset}>
                Réinitialiser
              </button>
            </div>

            <div className="presets">
              {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((name) => (
                <button key={name} type="button" onClick={() => applyPreset(name)}>
                  {name === 'sec'
                    ? 'Sec'
                    : name === 'athletique'
                      ? 'Athlétique'
                      : name === 'bodybuilder'
                        ? 'Bodybuilder'
                        : 'Massif'}
                </button>
              ))}
            </div>

            <div className="slider">
              <div className="slider-head">
                <label htmlFor="s-height">Hauteur</label>
                <b>
                  {params.height}
                  <small>cm</small>
                </b>
              </div>
              <input
                id="s-height"
                type="range"
                min={150}
                max={200}
                step={1}
                value={params.height}
                onChange={(e) => change({ height: Number(e.target.value) })}
                style={{ '--fill': `${heightPct}%` } as CSSProperties}
              />
            </div>

            {GROUPS.map((g) => (
              <div className="control-group" key={g.title}>
                <h3>{g.title}</h3>
                {g.sliders.map((s) => {
                  const value = params[s.key]
                  const pct = ((value - s.min) / (s.max - s.min)) * 100
                  return (
                    <div className="slider" key={s.key}>
                      <div className="slider-head">
                        <label htmlFor={`s-${s.key}`}>{s.label}</label>
                        <b>
                          {value}
                          {s.unit ? <small>{s.unit}</small> : null}
                        </b>
                      </div>
                      <input
                        id={`s-${s.key}`}
                        type="range"
                        min={s.min}
                        max={s.max}
                        step={1}
                        value={value}
                        onChange={(e) =>
                          change({ [s.key]: Number(e.target.value) } as Partial<BodyParams>)
                        }
                        style={{ '--fill': `${pct}%` } as CSSProperties}
                      />
                    </div>
                  )
                })}
              </div>
            ))}

            <p className="control-note">
              Les curseurs agissent sur la morphologie. Les mesures sont estimées à partir du
              volume du maillage déformé.
            </p>
          </section>

          <section className="block file-block">
            <div className="file-head">
              <div className="file-id">
                <p className="eyebrow">Fichier 3D</p>
                <strong>{raw ? source : 'statue.glb'}</strong>
                <span>
                  {raw ? (source.includes('modele') ? 'Meshy AI · importé' : 'Modèle importé') : 'MakeHuman · CC0'}
                  {fileSize ? ` · ${fileSize}` : ''}
                </span>
              </div>
              <a
                className="file-dl"
                href={downloadHref}
                download
                aria-label="Télécharger le fichier GLB"
                title="Télécharger le GLB"
              >
                <IconDownload />
              </a>
            </div>
            <div className="file-actions">
              <a className="btn-quiet" href={downloadHref} download>
                Télécharger
              </a>
              {!raw && (
                <a className="btn-quiet" href={SOURCE_URL} target="_blank" rel="noreferrer">
                  Licence <IconArrow />
                </a>
              )}
            </div>
          </section>

          <details className="how">
            <summary>
              <span>Utiliser un autre modèle</span>
              <span className="how-plus" aria-hidden="true">
                +
              </span>
            </summary>
            <div className="how-body">
              <p>
                Dépose un fichier <code>.glb</code> ou <code>.gltf</code> dans{' '}
                <code>public/</code> sous le nom <code>modele.glb</code>, puis recharge la page.
                Il sera centré, mis à l’échelle et posé sur le socle automatiquement.
              </p>
              <p>
                Pour les modèles avec socle, <code>scripts/prep-external.py</code> le cache sous le
                sol et normalise le corps.
              </p>
              <p>
                Base mesh masculin CC0 prêt à télécharger :{' '}
                <a href={BASE_MESH_URL} target="_blank" rel="noreferrer">
                  Innerscene <IconArrow />
                </a>
              </p>
            </div>
          </details>

          <p className="footnote">
            {raw ? 'Modèle importé · morphologie éditable · ' : 'Mesures estimées · '}
            Rendu temps réel · Three.js.
          </p>
        </div>
      </aside>
    </div>
  )
}
