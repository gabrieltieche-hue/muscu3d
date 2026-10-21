import { getBaseMesh } from '../../src/lib/base/mesh'
const base = getBaseMesh()
const quads = base.quads
const nF = quads.length / 4

// réimplémentation locale de la table pour tester
class ET {
  private mask: number
  private ka: Int32Array
  private kb: Int32Array
  private vals: Int32Array
  constructor(expected: number) {
    let cap = 16
    while (cap < expected * 2) cap <<= 1
    this.mask = cap - 1
    this.ka = new Int32Array(cap).fill(-1)
    this.kb = new Int32Array(cap).fill(-1)
    this.vals = new Int32Array(cap).fill(-1)
  }
  private hash(a: number, b: number): number {
    return (Math.imul(a, 2654435761) ^ Math.imul(b, 40503)) >>> 0
  }
  get(a: number, b: number): number {
    let h = this.hash(a, b) & this.mask
    for (;;) {
      if (this.ka[h] === -1) return -1
      if (this.ka[h] === a && this.kb[h] === b) return this.vals[h]
      h = (h + 1) & this.mask
    }
  }
  ensure(a: number, b: number, value: number): number {
    let h = this.hash(a, b) & this.mask
    for (;;) {
      if (this.ka[h] === -1) { this.ka[h] = a; this.kb[h] = b; this.vals[h] = value; return value }
      if (this.ka[h] === a && this.kb[h] === b) return this.vals[h]
      h = (h + 1) & this.mask
    }
  }
}

const t = new ET(nF * 2)
let nE = 0
const edgeA: number[] = []
const edgeB: number[] = []
for (let f = 0; f < nF; f++) {
  const o = f * 4
  for (let k = 0; k < 4; k++) {
    const a = quads[o + k]
    const b = quads[o + ((k + 1) & 3)]
    const lo = a < b ? a : b
    const hi = a < b ? b : a
    let e = t.get(lo, hi)
    if (e < 0) { e = nE++; edgeA.push(lo); edgeB.push(hi); t.ensure(lo, hi, e) }
  }
}
console.log('edges via table :', nE)

// variante avec hash sans XOR
class ET2 {
  private mask: number
  private ka: Int32Array; private kb: Int32Array; private vals: Int32Array
  constructor(expected: number) {
    let cap = 16
    while (cap < expected * 2) cap <<= 1
    this.mask = cap - 1
    this.ka = new Int32Array(cap).fill(-1); this.kb = new Int32Array(cap).fill(-1); this.vals = new Int32Array(cap).fill(-1)
  }
  private hash(a: number, b: number): number {
    return (Math.imul(a, 2654435761) + Math.imul(b, 2246822519)) >>> 0
  }
  get(a: number, b: number): number {
    let h = this.hash(a, b) & this.mask
    for (;;) {
      if (this.ka[h] === -1) return -1
      if (this.ka[h] === a && this.kb[h] === b) return this.vals[h]
      h = (h + 1) & this.mask
    }
  }
  ensure(a: number, b: number, value: number): number {
    let h = this.hash(a, b) & this.mask
    for (;;) {
      if (this.ka[h] === -1) { this.ka[h] = a; this.kb[h] = b; this.vals[h] = value; return value }
      if (this.ka[h] === a && this.kb[h] === b) return this.vals[h]
      h = (h + 1) & this.mask
    }
  }
}
const t2 = new ET2(nF * 2)
let nE2 = 0
for (let f = 0; f < nF; f++) {
  const o = f * 4
  for (let k = 0; k < 4; k++) {
    const a = quads[o + k]
    const b = quads[o + ((k + 1) & 3)]
    const lo = a < b ? a : b
    const hi = a < b ? b : a
    let e = t2.get(lo, hi)
    if (e < 0) { e = nE2++; t2.ensure(lo, hi, e) }
  }
}
console.log('edges via table2 (hash add) :', nE2)
