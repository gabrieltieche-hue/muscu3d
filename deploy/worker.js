/**
 * Muscu3D — site statique.
 *
 * L'application est entièrement côté navigateur (React + Three.js). Le Worker
 * ne fait que servir le build Vite (HTML, JS, CSS, public/body.glb) depuis le
 * binding ASSETS fourni par Sites.
 */
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request)
  },
}
