import { readFileSync } from 'node:fs'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
const buf = readFileSync('public/body.glb')
const loader = new GLTFLoader()
loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', (gltf: any) => {
  console.log('cles:', Object.keys(gltf))
  console.log('scene?', !!gltf.scene, 'scenes', gltf.scenes?.length)
  console.log('userData', Object.keys(gltf.userData ?? {}))
}, (e: any) => console.log('ERR', e))
