import { useEffect, useMemo, useRef, useState } from 'react'
import { Viewer } from './scene/viewer'
import {
  buildBody,
  DEFAULT_PARAMS,
  PRESETS,
  type BodyParams,
  type BodyMetrics,
} from './lib/body'

const LS_KEY = 'muscu3d.v1'

type Mode = 'current' | 'target'

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

function loadState(): { current: BodyParams; target: BodyParams } {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed?.current && parsed?.target) {
        return { current: { ...DEFAULT_PARAMS, ...parsed.current }, target: { ...DEFAULT_PARAMS, ...parsed.target } }
      }
    }
  } catch {
    /* état illisible : on repart des valeurs par défaut */
  }
  return {
    current: { ...DEFAULT_PARAMS },
    target: { ...DEFAULT_PARAMS, ...PRESETS.athletique },
  }
}

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Viewer | null>(null)
  const initial = useMemo(loadState, [])

  const [mode, setMode] = useState<Mode>(() =>
    new URLSearchParams(location.search).get('mode') === 'target' ? 'target' : 'current',
  )
  const [current, setCurrent] = useState<BodyParams>(initial.current)
  const [target, setTarget] = useState<BodyParams>(initial.target)
  const [rotate, setRotate] = useState(false)
  const [wire, setWire] = useState(() => new URLSearchParams(location.search).get('wire') === '1')
  const [metrics, setMetrics] = useState<BodyMetrics | null>(null)

  const params = mode === 'current' ? current : target

  useEffect(() => {
    const v = new Viewer(mountRef.current!)
    viewerRef.current = v
    const view = new URLSearchParams(location.search).get('view')
    if (view === 'face' || view === 'profil' || view === 'dos' || view === 'troisquarts') {
      v.setCameraPreset(view)
    }
    const cam = new URLSearchParams(location.search).get('cam')
    const tgt = new URLSearchParams(location.search).get('target')
    if (cam) {
      const p = cam.split(',').map(Number)
      const t = (tgt ?? '0,0.92,0').split(',').map(Number)
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
    if (!v) return
    const { group, metrics: m } = buildBody(params)
    v.setBody(group)
    v.setWireframeVisible(wire)
    v.setAccent(mode === 'current' ? 0x38bdf8 : 0xa3e635)
    setMetrics(m)
  }, [params, mode, wire])

  useEffect(() => {
    // Surcharge des paramètres via l'URL (debug) : ?fat=20&lats=30&arms=80
    const qs = new URLSearchParams(location.search)
    const patch: Partial<BodyParams> = {}
    for (const k of [
      'height', 'fat', 'belly', 'neck', 'shoulders', 'lats', 'pecs', 'abs',
      'glutes', 'thighs', 'calves', 'arms', 'forearms',
    ] as const) {
      const v = qs.get(k)
      if (v !== null && Number.isFinite(Number(v))) (patch as Record<string, number>)[k] = Number(v)
    }
    if (Object.keys(patch).length) {
      setCurrent((c) => ({ ...c, ...patch }))
      setTarget((t) => ({ ...t, ...patch }))
    }

    const preset = new URLSearchParams(location.search).get('preset')
    if (preset && PRESETS[preset]) {
      setTarget({ ...DEFAULT_PARAMS, ...PRESETS[preset] })
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify({ current, target }))
  }, [current, target])

  useEffect(() => {
    viewerRef.current?.setAutoRotate(rotate)
  }, [rotate])

  const update = (patch: Partial<BodyParams>) => {
    if (mode === 'current') setCurrent((c) => ({ ...c, ...patch }))
    else setTarget((t) => ({ ...t, ...patch }))
  }

  const applyPreset = (name: keyof typeof PRESETS) => update({ ...PRESETS[name], height: params.height })
  const resetActive = () => (mode === 'current' ? setCurrent({ ...DEFAULT_PARAMS }) : setTarget({ ...DEFAULT_PARAMS }))

  const fmt = (v: number, d = 1) => v.toFixed(d)

  return (
    <div className={'app ' + (mode === 'current' ? 'cur' : 'tgt')}>
      <header className="topbar">
        <div className="brand">
          MUSCU<span>3D</span>
          <em>prototype corps paramétrique</em>
        </div>

        <div className="modes">
          <button className={mode === 'current' ? 'on' : ''} onClick={() => setMode('current')}>
            Corps actuel
          </button>
          <button className={mode === 'target' ? 'on' : ''} onClick={() => setMode('target')}>
            Corps cible
          </button>
        </div>

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
          <label>
            <input type="checkbox" checked={wire} onChange={(e) => setWire(e.target.checked)} />
            Maillage
          </label>
        </div>
        <div className="hint">glisse pour tourner · pince pour zoomer</div>
      </div>

      <aside className="panel">
        <div className="panel-head">
          <div className={'tag ' + (mode === 'current' ? 'cur' : 'tgt')}>
            {mode === 'current' ? 'CORPS ACTUEL' : 'CORPS CIBLE'}
          </div>
          <div className="actions">
            <button onClick={() => setTarget({ ...current })}>actuel → cible</button>
            <button onClick={resetActive}>réinitialiser</button>
          </div>
        </div>

        <div className="group">
          <h3>Taille</h3>
          <div className="row">
            <label>Taille</label>
            <span>{params.height} cm</span>
          </div>
          <input
            type="range"
            min={150}
            max={200}
            step={1}
            value={params.height}
            onChange={(e) => update({ height: +e.target.value })}
          />
        </div>

        {GROUPS.map((g) => (
          <div className="group" key={g.title}>
            <h3>{g.title}</h3>
            {g.sliders.map((s) => (
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
                  onChange={(e) => update({ [s.key]: +e.target.value } as Partial<BodyParams>)}
                />
              </div>
            ))}
          </div>
        ))}

        <div className="group">
          <h3>Profils types</h3>
          <div className="presets">
            <button onClick={() => applyPreset('sec')}>Sec</button>
            <button onClick={() => applyPreset('athletique')}>Athlétique</button>
            <button onClick={() => applyPreset('bodybuilder')}>Bodybuilder</button>
            <button onClick={() => applyPreset('massif')}>Massif</button>
          </div>
        </div>

        <p className="note">
          Le poids et les mensurations sont <b>estimés</b> à partir du volume du maillage. C'est un prototype
          visuel : la simulation physiologique viendra ensuite.
        </p>
      </aside>
    </div>
  )
}
