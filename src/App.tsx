import { useEffect, useRef, useState } from 'react'
import { Viewer } from './scene/viewer'
import { loadBodyModel, getLoadedBody } from './lib/base/model'
import { buildBody, DEFAULT_PARAMS, type BodyParams, type BodyMetrics } from './lib/body'
import { buildStatue } from './lib/statue'

/**
 * Profil de référence FIGÉ.
 *
 * Le projet ne modifie plus la géométrie en direct : la statue affichée est
 * toujours ce profil (calé sur les images de `docs/reference/`). Les curseurs
 * restent visibles pour montrer le futur réglage, mais sont désactivés.
 *
 * Base : DEFAULT_PARAMS (le profil « sec et sportif » du moteur), avec une
 * taille plus fine et des cuisses/fessiers resserrés pour retrouver la
 * silhouette en V des références.
 */
const FIXED_PARAMS: BodyParams = {
  ...DEFAULT_PARAMS,
  fat: 10,
  belly: 12,
  neck: 74,
  shoulders: 96,
  lats: 94,
  pecs: 88,
  abs: 84,
  glutes: 64,
  thighs: 72,
  calves: 74,
  arms: 84,
  forearms: 68,
}

interface SliderDef {
  key: keyof BodyParams
  label: string
  min: number
  max: number
  unit?: string
}

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
    title: 'Tronc',
    sliders: [
      { key: 'abs', label: 'Abdos', min: 0, max: 100 },
      { key: 'glutes', label: 'Fessiers', min: 0, max: 100 },
    ],
  },
  {
    title: 'Jambes',
    sliders: [
      { key: 'thighs', label: 'Cuisses', min: 0, max: 100 },
      { key: 'calves', label: 'Mollets', min: 0, max: 100 },
    ],
  },
]

/** Presets : conservés à l'écran, désactivés (modèle figé). */
const PRESETS: { label: string }[] = [
  { label: 'Sec' },
  { label: 'Athlétique' },
  { label: 'Bodybuilder' },
  { label: 'Massif' },
]

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Viewer | null>(null)

  const [rotate, setRotate] = useState(false)
  const [wire, setWire] = useState(() => new URLSearchParams(location.search).get('wire') === '1')
  const [metrics, setMetrics] = useState<BodyMetrics | null>(null)
  const [ready, setReady] = useState(false)
  const [built, setBuilt] = useState(false)
  const [raw, setRaw] = useState(false)
  const [source, setSource] = useState('—')
  const [error, setError] = useState<string | null>(null)

  const params = FIXED_PARAMS

  useEffect(() => {
    // 1. charger le fichier modèle : `modele.glb` s'il existe, sinon le corps
    //    de référence `body.glb`. `?model=xxx.glb` force un fichier précis.
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

  useEffect(() => {
    const v = new Viewer(mountRef.current!)
    viewerRef.current = v
    const qs = new URLSearchParams(location.search)
    const view = qs.get('view')
    if (view === 'face' || view === 'profil' || view === 'dos' || view === 'troisquarts') {
      v.setCameraPreset(view)
    }
    const cam = qs.get('cam')
    const tgt = qs.get('target')
    if (cam) {
      const p = cam.split(',').map(Number)
      const t = (tgt ?? '0,0.9,0').split(',').map(Number)
      if (p.length === 3 && t.length === 3 && [...p, ...t].every(Number.isFinite)) {
        v.setCameraPosition(p[0], p[1], p[2], t[0], t[1], t[2])
      }
    }
    return () => {
      v.dispose()
      viewerRef.current = null
    }
  }, [])

  useEffect(() => {
    const v = viewerRef.current
    if (!v || !ready) return
    const model = getLoadedBody()
    if (!model) return
    try {
      if (model.makehuman) {
        // Modèle de référence : moteur complet (morphing figé + pose +
        // subdivision + anatomie). Les paramètres ne changent plus.
        const { group, metrics: m } = buildBody(FIXED_PARAMS)
        v.setBody(group)
        setMetrics(m)
      } else {
        // Modèle externe : affiché tel quel, matériau argile, pas de
        // métriques (la topologie n'est pas connue).
        const { group } = buildStatue()
        v.setBody(group)
        setMetrics(null)
      }
      v.setWireframeVisible(wire)
      setBuilt(true)
    } catch (e) {
      console.error(e)
      setError(e instanceof Error ? e.message : String(e))
    }
    // `wire` est appliqué séparément ci-dessous : on ne reconstruit pas la
    // géométrie à chaque clic.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  // mode debug : affichage des repères anatomiques du modèle
  useEffect(() => {
    const v = viewerRef.current
    if (!v || !built) return
    const show = new URLSearchParams(location.search).get('joints') === '1'
    v.setJoints(show ? (getLoadedBody()?.joints ?? null) : null)
  }, [built])

  useEffect(() => {
    viewerRef.current?.setAutoRotate(rotate)
  }, [rotate])

  useEffect(() => {
    viewerRef.current?.setWireframeVisible(wire)
  }, [wire])

  const fmt = (v: number, d = 1) => v.toFixed(d)

  const slider = (s: SliderDef) => (
    <div className="slider" key={s.key}>
      <div className="row">
        <label>{s.label}</label>
        <span>
          {params[s.key]}
          {s.unit ?? ''}
        </span>
      </div>
      <input
        type="range"
        min={s.min}
        max={s.max}
        step={1}
        value={params[s.key]}
        disabled
        aria-label={s.label}
      />
    </div>
  )

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          MUSCU<span>3D</span>
          <em>statue 3D · rendu studio</em>
        </div>

        <div className="badge">MODÈLE FIGÉ</div>

        {metrics && (
          <div className="chips">
            <div className="chip">
              <b>{fmt(metrics.weight)} kg</b>
              <span>poids est.</span>
            </div>
            <div className="chip">
              <b>{params.fat}%</b>
              <span>masse grasse</span>
            </div>
            <div className="chip">
              <b>{fmt(metrics.lean)} kg</b>
              <span>masse maigre</span>
            </div>
            <div className="chip">
              <b>{fmt(metrics.waist)} cm</b>
              <span>taille</span>
            </div>
            <div className="chip">
              <b>{fmt(metrics.chest)} cm</b>
              <span>poitrine</span>
            </div>
            <div className="chip">
              <b>{fmt(metrics.arm)} cm</b>
              <span>bras</span>
            </div>
            <div className="chip">
              <b>{fmt(metrics.thigh)} cm</b>
              <span>cuisse</span>
            </div>
          </div>
        )}
      </header>

      <div className="stage" ref={mountRef}>
        <div className="views">
          <button onClick={() => viewerRef.current?.setCameraPreset('face')}>Face</button>
          <button onClick={() => viewerRef.current?.setCameraPreset('profil')}>Profil</button>
          <button onClick={() => viewerRef.current?.setCameraPreset('dos')}>Dos</button>
          <button onClick={() => viewerRef.current?.setCameraPreset('troisquarts')}>3/4</button>
        </div>
        <div className="toggles">
          <label>
            <input type="checkbox" checked={rotate} onChange={(e) => setRotate(e.target.checked)} />
            Rotation auto
          </label>
          {!raw && (
            <label>
              <input type="checkbox" checked={wire} onChange={(e) => setWire(e.target.checked)} />
              Maillage
            </label>
          )}
        </div>
        <div className="hint">glisse pour tourner · pince pour zoomer</div>
        {!built && !error && <div className="hint loading">chargement du modèle 3D…</div>}
        {error && (
          <div className="hint loading">
            modèle indisponible : {error}
            <br />
            dépose un fichier .glb/.gltf dans public/ sous le nom <b>modele.glb</b>.
          </div>
        )}
      </div>

      <aside className="panel">
        <div className="panel-head">
          <div className="tag">STATUE 3D</div>
          <span className="file">{source}</span>
        </div>

        <div className="notice">
          <b>Modèle figé.</b> La morphologie vient du fichier 3D : les curseurs ne modifient plus la
          géométrie en direct. {raw ? 'Ce fichier externe n’a pas les cibles de morphing du modèle de référence.' : 'Le profil est calé sur les images de référence.'}
        </div>

        <div className="group">
          <h3>Taille</h3>
          <div className="row">
            <label>Taille</label>
            <span>{params.height} cm</span>
          </div>
          <input type="range" min={150} max={200} step={1} value={params.height} disabled aria-label="Taille" />
        </div>

        {GROUPS.map((g) => (
          <div className="group" key={g.title}>
            <h3>{g.title}</h3>
            {g.sliders.map(slider)}
          </div>
        ))}

        <div className="group">
          <h3>Profils types (inactifs)</h3>
          <div className="presets">
            {PRESETS.map((p) => (
              <button key={p.label} disabled>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <p className="note">
          Le poids et les mensurations sont <b>estimés</b> à partir du volume du maillage.
          <br />
          <br />
          Pour utiliser un autre fichier : dépose-le dans <b>public/</b> sous le nom{' '}
          <b>modele.glb</b>, puis recharge la page. Le corps de référence reste{' '}
          <b>body.glb</b>.
        </p>
      </aside>
    </div>
  )
}
