import { useEffect, useRef, useState } from 'react'
import { Viewer } from './scene/viewer'
import { loadBodyModel, getLoadedBody } from './lib/base/model'
import { buildBody, type BodyMetrics } from './lib/body'
import { FIXED_PARAMS } from './lib/referenceProfile'
import { buildStatue } from './lib/statue'

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

/** Groupes musculaires affichés dans la fiche (échelle 0–100). */
const MORPHO: { label: string; value: number }[] = [
  { label: 'Épaules', value: FIXED_PARAMS.shoulders },
  { label: 'Dorsaux', value: FIXED_PARAMS.lats },
  { label: 'Pectoraux', value: FIXED_PARAMS.pecs },
  { label: 'Abdominaux', value: FIXED_PARAMS.abs },
  { label: 'Bras', value: FIXED_PARAMS.arms },
  { label: 'Cuisses', value: FIXED_PARAMS.thighs },
  { label: 'Mollets', value: FIXED_PARAMS.calves },
]

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

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Viewer | null>(null)

  const [view, setView] = useState<ViewKey>(initialView)
  const [rotate, setRotate] = useState(() => initialFlag('rotate'))
  const [wire, setWire] = useState(() => new URLSearchParams(location.search).get('wire') === '1')
  const [pedestal, setPedestal] = useState(
    () => new URLSearchParams(location.search).get('socle') !== '0',
  )

  const [metrics, setMetrics] = useState<BodyMetrics | null>(null)
  const [ready, setReady] = useState(false)
  const [built, setBuilt] = useState(false)
  const [raw, setRaw] = useState(false)
  const [source, setSource] = useState('body.glb')
  const [fileSize, setFileSize] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  // 3. construire la sculpture (une seule fois, profil figé).
  useEffect(() => {
    const v = viewerRef.current
    if (!v || !ready) return
    const model = getLoadedBody()
    if (!model) return
    try {
      if (model.makehuman) {
        // Modèle de référence : morphing figé + pose + subdivision + anatomie.
        const { group, metrics: m } = buildBody(FIXED_PARAMS)
        v.setBody(group)
        setMetrics(m)
      } else {
        // Modèle externe : affiché tel quel, matériau argile studio.
        const { group } = buildStatue()
        v.setBody(group)
        setMetrics(null)
      }
      v.setWireframeVisible(wire)
      v.setPedestalVisible(pedestal)
      setBuilt(true)
    } catch (e) {
      console.error(e)
      setError(e instanceof Error ? e.message : String(e))
    }
    // `wire` et `pedestal` sont appliqués séparément : on ne reconstruit pas
    // la géométrie à chaque clic.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  // 4. appliquer les réglages d'affichage.
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

  // mode debug : affichage des repères anatomiques du modèle
  useEffect(() => {
    const v = viewerRef.current
    if (!v || !built) return
    const show = new URLSearchParams(location.search).get('joints') === '1'
    v.setJoints(show ? (getLoadedBody()?.joints ?? null) : null)
  }, [built])

  // poids du fichier téléchargeable (affiché dans la fiche)
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

  // raccourcis clavier : 1–4 vues, R rotation, M maillage, S socle
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

  const viewIndex = VIEWS.findIndex((v) => v.key === view) + 1

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
          <span className="meta-model">{raw ? 'Modèle importé' : 'Sculpture de référence'}</span>
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
          <p className="eyebrow">
            Vue {String(viewIndex).padStart(2, '0')} / 04
          </p>
          <p className="stage-title">{VIEW_LABEL[view]}</p>
        </div>

        <div className="stage-tag">{raw ? 'Fichier externe' : 'Sculpture figée'}</div>

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

            {!raw && (
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
            )}

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
            <span>Sculpture du corps…</span>
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
            {raw ? 'Votre' : 'L’athlète'}
            <br />
            <em>{raw ? 'modèle' : 'sec'}</em>
          </h1>
          <p className="lede">
            {raw
              ? 'Fichier 3D externe affiché tel quel, avec la matière argile du studio. Sa pose et ses proportions d’origine sont conservées.'
              : 'Silhouette en V, taille marquée, musculature sèche. Un profil figé pour étudier le volume, la posture et les proportions.'}
          </p>

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
                  {fr(FIXED_PARAMS.fat, 0)}
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
                <span>Taille</span>
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
                Ce fichier externe n’a pas la topologie du modèle de référence : il est affiché
                tel quel, sans estimation de volume.
              </span>
            </div>
          )}

          {metrics && (
            <section className="block">
              <div className="block-head">
                <h2>Développement</h2>
                <span>0 — 100</span>
              </div>
              <div className="morpho">
                {MORPHO.map((m) => (
                  <div className="morpho-row" key={m.label}>
                    <div className="morpho-label">
                      <span>{m.label}</span>
                      <b>{m.value}</b>
                    </div>
                    <div className="track" aria-hidden="true">
                      <i style={{ width: `${m.value}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="block file-block">
            <div className="file-head">
              <div className="file-id">
                <p className="eyebrow">Fichier 3D</p>
                <strong>{raw ? source : 'statue.glb'}</strong>
                <span>
                  {raw ? 'Modèle importé' : 'MakeHuman · CC0'}
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
                Base mesh masculin CC0 prêt à télécharger :{' '}
                <a href={BASE_MESH_URL} target="_blank" rel="noreferrer">
                  Innerscene <IconArrow />
                </a>
              </p>
            </div>
          </details>

          <p className="footnote">
            {raw
              ? 'Fichier externe : aucune mesure n’est calculée. Rendu temps réel · Three.js.'
              : 'Mesures estimées à partir du volume du maillage. Rendu temps réel · Three.js.'}
          </p>
        </div>
      </aside>
    </div>
  )
}
