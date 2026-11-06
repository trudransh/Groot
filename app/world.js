import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

const calm = matchMedia('(prefers-reduced-motion: reduce)').matches
const MOTION = calm ? 0.3 : 1
const THIRSTY_LEAF = new THREE.Color('#d6a33a')

function seeded(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, ...extra })

function mesh(geometry, material, { shadow = true } = {}) {
  const m = new THREE.Mesh(geometry, material)
  m.castShadow = shadow
  m.receiveShadow = shadow
  return m
}

function backgroundTree(rng) {
  const g = new THREE.Group()
  const h = 1.1 + rng() * 1.8
  const trunk = mesh(new THREE.CylinderGeometry(0.12, 0.2, h, 6), toon('#8b4a1c'))
  trunk.position.y = h / 2
  g.add(trunk)
  const greens = ['#3fae2a', '#4cd137', '#2e8b2a', '#62c94a', '#7bd64f']
  const leaf = toon(greens[Math.floor(rng() * greens.length)])
  if (rng() < 0.55) {
    for (let i = 0; i < 3; i++) {
      const cone = mesh(new THREE.ConeGeometry(1.05 - i * 0.27, 1.25, 7), leaf)
      cone.position.y = h + 0.35 + i * 0.62
      g.add(cone)
    }
  } else {
    const r = 0.85 + rng() * 0.6
    const blob = mesh(new THREE.IcosahedronGeometry(r, 1), leaf)
    blob.position.y = h + r * 0.75
    g.add(blob)
    const side = mesh(new THREE.IcosahedronGeometry(r * 0.6, 1), leaf)
    side.position.set(r * 0.6, h + r * 0.5, 0.1)
    g.add(side)
  }
  g.scale.setScalar(0.85 + rng() * 0.6)
  g.userData.phase = rng() * Math.PI * 2
  return g
}

function face(radius, { eyeSize }) {
  const g = new THREE.Group()
  const white = toon('#ffffff')
  const black = toon('#1b1b1b')
  const pink = toon('#ff8fb1')
  const eyes = []
  const pupils = []
  for (const side of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(eyeSize, 20, 16), white, { shadow: false })
    eye.position.set(side * eyeSize * 1.75, eyeSize * 0.35, 0)
    eye.scale.set(1, 1.15, 0.55)
    const pupil = mesh(new THREE.SphereGeometry(eyeSize * 0.55, 16, 12), black, { shadow: false })
    pupil.position.set(0, -eyeSize * 0.05, eyeSize * 0.62)
    const shine = mesh(new THREE.SphereGeometry(eyeSize * 0.17, 10, 8), white, { shadow: false })
    shine.position.set(eyeSize * 0.18, eyeSize * 0.2, eyeSize * 0.48)
    pupil.add(shine)
    pupil.userData.base = pupil.position.clone()
    eye.add(pupil)
    g.add(eye)
    eyes.push(eye)
    pupils.push(pupil)
    const blush = mesh(new THREE.SphereGeometry(eyeSize * 0.6, 14, 10), pink, { shadow: false })
    blush.position.set(side * eyeSize * 3.05, -eyeSize * 0.75, -eyeSize * 0.15)
    blush.scale.set(1, 0.55, 0.3)
    g.add(blush)
  }
  const mouthMat = toon('#5a1a1a')
  const smile = mesh(new THREE.TorusGeometry(eyeSize * 0.75, eyeSize * 0.17, 8, 20, Math.PI), mouthMat, { shadow: false })
  smile.rotation.z = Math.PI
  smile.position.set(0, -eyeSize * 0.65, eyeSize * 0.45)
  const frown = mesh(new THREE.TorusGeometry(eyeSize * 0.6, eyeSize * 0.15, 8, 20, Math.PI), mouthMat, { shadow: false })
  frown.position.set(0, -eyeSize * 1.25, eyeSize * 0.4)
  frown.visible = false
  g.add(smile, frown)
  g.position.z = radius * 0.97
  return { group: g, eyes, pupils, smile, frown }
}

function heroTree({ label, scale, leaf, sapling }) {
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)
  root.scale.setScalar(scale)
  const leafMat = toon(leaf)
  const trunkH = sapling ? 1.3 : 2.1
  const trunk = mesh(new THREE.CylinderGeometry(sapling ? 0.16 : 0.3, sapling ? 0.24 : 0.46, trunkH, 12), toon('#9a5524'))
  trunk.position.y = trunkH / 2
  body.add(trunk)
  const radius = sapling ? 1.05 : 1.75
  const canopy = new THREE.Group()
  canopy.position.y = trunkH + radius * 0.8
  body.add(canopy)
  const blob = mesh(new THREE.IcosahedronGeometry(radius, 2), leafMat)
  canopy.add(blob)
  const lumps = sapling ? [] : [[-1.25, 0.55, -0.2, 0.75], [1.3, 0.5, -0.25, 0.8], [0.1, 1.35, -0.3, 0.85]]
  for (const [x, y, z, r] of lumps) {
    const l = mesh(new THREE.IcosahedronGeometry(r, 1), leafMat)
    l.position.set(x, y, z)
    canopy.add(l)
  }
  const sprouts = []
  if (sapling) {
    for (const side of [-1, 1]) {
      const sprout = mesh(new THREE.SphereGeometry(0.42, 14, 10), leafMat)
      sprout.scale.set(1, 0.4, 0.6)
      sprout.position.set(side * 0.38, radius + 0.25, 0)
      sprout.rotation.z = side * -0.6
      canopy.add(sprout)
      sprouts.push(sprout)
    }
    const stem = mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.4, 6), toon('#3b8f2a'))
    stem.position.y = radius + 0.05
    canopy.add(stem)
  }
  const hands = []
  for (const side of [-1, 1]) {
    const hand = mesh(new THREE.SphereGeometry(sapling ? 0.24 : 0.36, 14, 10), leafMat)
    hand.position.set(side * (radius + (sapling ? 0.12 : 0.2)), -radius * 0.15, 0.25)
    hand.userData.base = hand.position.clone()
    hand.userData.side = side
    canopy.add(hand)
    hands.push(hand)
  }
  const f = face(radius, { eyeSize: sapling ? 0.2 : 0.26 })
  canopy.add(f.group)
  const sweat = mesh(new THREE.SphereGeometry(0.11, 12, 10), toon('#5cc8ff', { transparent: true, opacity: 0.9 }), { shadow: false })
  sweat.scale.set(1, 1.5, 1)
  sweat.visible = false
  canopy.add(sweat)
  root.traverse((o) => (o.userData.hero = label))
  return {
    label, root, body, canopy, leafMat, baseLeaf: new THREE.Color(leaf), radius, face: f, hands, sprouts, sweat,
    headY: trunkH + radius * 1.8 + (sapling ? 0.5 : 1.2), thirsty: false, jump: 0, blinkAt: 1 + Math.random() * 2, blinkUntil: 0,
    speed: sapling ? 4.1 : 3.2, phase: Math.random() * 10,
  }
}

function butterfly(color) {
  const g = new THREE.Group()
  const wing = new THREE.MeshToonMaterial({ color, side: THREE.DoubleSide })
  const shape = new THREE.CircleGeometry(0.22, 12)
  const left = new THREE.Mesh(shape, wing)
  const right = new THREE.Mesh(shape, wing)
  left.position.x = -0.2
  right.position.x = 0.2
  const lp = new THREE.Group()
  const rp = new THREE.Group()
  lp.add(left)
  rp.add(right)
  g.add(lp, rp, new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.22, 4, 8), toon('#2b1606')))
  g.children[2].rotation.x = Math.PI / 2
  g.userData = { lp, rp, a: 0.3 + Math.random() * 0.3, b: 0.4 + Math.random() * 0.3, r: 4 + Math.random() * 4, p: Math.random() * 10 }
  return g
}

function cloud(rng) {
  const g = new THREE.Group()
  const m = toon('#ffffff')
  for (let i = 0; i < 5; i++) {
    const s = mesh(new THREE.SphereGeometry(0.8 + rng() * 0.7, 14, 10), m, { shadow: false })
    s.position.set(i * 0.9 - 1.8, rng() * 0.5, rng() * 0.6)
    g.add(s)
  }
  g.userData.speed = 0.25 + rng() * 0.35
  return g
}

export function createWorld(container, { onTap } = {}) {
  const canvas = container.querySelector('canvas')
  const labelsEl = container.querySelector('.labels')
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#9be7ff')
  scene.fog = new THREE.Fog('#9be7ff', 24, 52)

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200)
  camera.position.set(0, 4.6, 13)
  const controls = new OrbitControls(camera, canvas)
  controls.target.set(0, 2.6, 0)
  controls.enablePan = false
  controls.enableDamping = true
  controls.minDistance = 8
  controls.maxDistance = 22
  controls.minPolarAngle = 0.7
  controls.maxPolarAngle = 1.48
  controls.autoRotate = !calm
  controls.autoRotateSpeed = 0.4

  scene.add(new THREE.HemisphereLight('#ffffff', '#3f8f2a', 1.6))
  const sun = new THREE.DirectionalLight('#fff1c1', 2.4)
  sun.position.set(7, 14, 9)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16 })
  scene.add(sun)

  const ground = mesh(new THREE.CircleGeometry(60, 64), toon('#6fd14a'))
  ground.rotation.x = -Math.PI / 2
  scene.add(ground)
  const clearing = mesh(new THREE.CircleGeometry(7, 48), toon('#94e86d'))
  clearing.rotation.x = -Math.PI / 2
  clearing.position.y = 0.01
  scene.add(clearing)

  const rng = seeded(42)
  const forest = []
  for (let i = 0; i < 70; i++) {
    const angle = rng() * Math.PI * 2
    const dist = 9 + rng() * 22
    const x = Math.cos(angle) * dist
    const z = Math.sin(angle) * dist
    const t = backgroundTree(rng)
    t.position.set(x, 0, z)
    t.rotation.y = rng() * Math.PI
    scene.add(t)
    forest.push(t)
  }

  const flowerColors = ['#ff5fa2', '#ffd23f', '#ffffff', '#b07cff', '#ff8a3d']
  const flowerGeo = new THREE.SphereGeometry(0.09, 8, 6)
  for (let i = 0; i < 160; i++) {
    const a = rng() * Math.PI * 2
    const d = 2 + rng() * 14
    const f = new THREE.Mesh(flowerGeo, toon(flowerColors[i % flowerColors.length]))
    f.position.set(Math.cos(a) * d, 0.1, Math.sin(a) * d)
    scene.add(f)
  }

  const mushrooms = []
  for (let i = 0; i < 8; i++) {
    const g = new THREE.Group()
    const stem = mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.3, 8), toon('#fff3dc'))
    stem.position.y = 0.15
    const cap = mesh(new THREE.SphereGeometry(0.22, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), toon('#ff4d4d'))
    cap.position.y = 0.3
    g.add(stem, cap)
    const a = rng() * Math.PI * 2
    const d = 3 + rng() * 5
    g.position.set(Math.cos(a) * d, 0, Math.sin(a) * d)
    g.userData.p = rng() * 10
    scene.add(g)
    mushrooms.push(g)
  }

  const clouds = []
  for (let i = 0; i < 6; i++) {
    const c = cloud(rng)
    c.position.set(-30 + i * 11, 11 + rng() * 4, -18 - rng() * 10)
    scene.add(c)
    clouds.push(c)
  }

  const butterflies = ['#ff5fa2', '#ffd23f', '#7c5cff', '#38d6ff'].map((c) => {
    const b = butterfly(c)
    scene.add(b)
    return b
  })

  const flyCount = 70
  const flyPos = new Float32Array(flyCount * 3)
  const flySeed = Array.from({ length: flyCount }, () => [rng() * 14 - 7, 0.6 + rng() * 5, rng() * 10 - 5, rng() * 10])
  const flyGeo = new THREE.BufferGeometry()
  flyGeo.setAttribute('position', new THREE.BufferAttribute(flyPos, 3))
  const flies = new THREE.Points(flyGeo, new THREE.PointsMaterial({ color: '#fff27a', size: 0.14, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }))
  scene.add(flies)

  const bursts = []
  function confetti(at) {
    const n = 90
    const pos = new Float32Array(n * 3)
    const col = new Float32Array(n * 3)
    const vel = []
    const palette = ['#ff5fa2', '#ffd23f', '#4cd137', '#38d6ff', '#b07cff'].map((c) => new THREE.Color(c))
    for (let i = 0; i < n; i++) {
      pos.set([at.x, at.y, at.z], i * 3)
      const c = palette[i % palette.length]
      col.set([c.r, c.g, c.b], i * 3)
      vel.push(new THREE.Vector3((Math.random() - 0.5) * 7, 4 + Math.random() * 6, (Math.random() - 0.5) * 7))
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.22, vertexColors: true, transparent: true }))
    scene.add(pts)
    bursts.push({ pts, vel, life: 0 })
  }

  const heroes = new Map()
  const labels = new Map()
  const spots = { groot: [-2.7, 0, 0.4], sapling: [2.9, 0, 0.8] }
  const looks = {
    groot: { scale: 1, leaf: '#46c93a', sapling: false },
    sapling: { scale: 1, leaf: '#8be04e', sapling: true },
  }

  function setPlants(plants) {
    plants.forEach((p, i) => {
      let h = heroes.get(p.label)
      if (!h) {
        const look = looks[p.label] || { scale: 0.85, leaf: ['#5ad16a', '#3fbf8f', '#9be04e'][i % 3], sapling: p.stage === 'sapling' }
        h = heroTree({ label: p.label, ...look })
        const spot = spots[p.label] || [(i - plants.length / 2) * 3.2, 0, -2.5]
        h.root.position.set(...spot)
        scene.add(h.root)
        heroes.set(p.label, h)
        const tag = document.createElement('div')
        tag.className = 'tag3d'
        labelsEl.appendChild(tag)
        labels.set(p.label, tag)
      }
      h.thirsty = p.signal === '1'
      const status = p.signal === '1' ? ['thirsty', 'THIRSTY!'] : p.signal === '0' ? ['ok', 'HAPPY'] : ['unknown', '…']
      labels.get(p.label).innerHTML = `<div class="n">${p.label.charAt(0).toUpperCase() + p.label.slice(1)}</div><span class="s ${status[0]}">${status[1]}</span>`
    })
  }

  const pointer = new THREE.Vector2()
  const ray = new THREE.Raycaster()
  let down = null
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect()
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
  })
  canvas.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]))
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return
    const r = canvas.getBoundingClientRect()
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera)
    const hit = ray.intersectObjects([...heroes.values()].map((h) => h.root), true)[0]
    const label = hit?.object.userData.hero
    const h = label && heroes.get(label)
    if (!h) return
    h.jump = 1
    confetti(new THREE.Vector3().setFromMatrixPosition(h.canopy.matrixWorld))
    onTap?.(label)
  })

  function resize() {
    const w = container.clientWidth
    const hgt = container.clientHeight
    renderer.setSize(w, hgt, false)
    camera.aspect = w / hgt
    camera.fov = camera.aspect < 0.65 ? 72 : camera.aspect < 0.9 ? 62 : 45
    camera.updateProjectionMatrix()
  }
  new ResizeObserver(resize).observe(container)
  resize()

  const clock = new THREE.Clock()
  const v = new THREE.Vector3()
  const toCam = new THREE.Vector3()

  function animate() {
    const dt = Math.min(clock.getDelta(), 0.05)
    const t = clock.elapsedTime

    for (const tree of forest) tree.rotation.z = Math.sin(t * 0.9 + tree.userData.phase) * 0.035 * MOTION
    for (const m of mushrooms) m.scale.y = 1 + Math.sin(t * 3 + m.userData.p) * 0.08 * MOTION
    for (const c of clouds) {
      c.position.x += c.userData.speed * dt
      if (c.position.x > 40) c.position.x = -40
    }
    for (const b of butterflies) {
      const u = b.userData
      b.position.set(Math.cos(t * u.a + u.p) * u.r, 1.8 + Math.sin(t * 1.3 + u.p) * 1.1, Math.sin(t * u.b + u.p) * u.r * 0.7)
      b.rotation.y = -t * u.a - u.p
      const flap = Math.sin(t * 22 + u.p) * 0.9 * MOTION
      u.lp.rotation.y = flap
      u.rp.rotation.y = -flap
    }
    for (let i = 0; i < flyCount; i++) {
      const [x, y, z, p] = flySeed[i]
      flyPos.set([x + Math.sin(t * 0.6 + p) * 0.8, y + Math.sin(t * 0.9 + p * 2) * 0.5, z + Math.cos(t * 0.5 + p) * 0.8], i * 3)
    }
    flyGeo.attributes.position.needsUpdate = true
    flies.material.opacity = 0.55 + Math.sin(t * 3) * 0.35

    for (const h of heroes.values()) {
      const s = t * h.speed + h.phase
      toCam.set(camera.position.x - h.root.position.x, 0, camera.position.z - h.root.position.z)
      const want = Math.atan2(toCam.x, toCam.z)
      let diff = want - h.root.rotation.y
      diff = Math.atan2(Math.sin(diff), Math.cos(diff))
      h.root.rotation.y += diff * Math.min(1, dt * 3)

      let y = 0
      let squash = 0
      if (h.thirsty) {
        h.body.rotation.z = Math.sin(t * 2.2 + h.phase) * 0.09 * MOTION
        h.body.rotation.x = 0.08
        squash = -0.05
      } else {
        const hop = Math.abs(Math.sin(s * 0.5))
        y = hop * 0.28 * MOTION
        squash = (hop < 0.25 ? (0.25 - hop) * 0.6 : 0) * MOTION
        h.body.rotation.z = Math.sin(s * 0.5) * 0.06 * MOTION
        h.body.rotation.x = 0
      }
      if (h.jump > 0) {
        h.jump = Math.max(0, h.jump - dt * 0.9)
        const j = 1 - h.jump
        y += Math.sin(j * Math.PI) * 2.6
        h.body.rotation.y = j * Math.PI * 2
      } else {
        h.body.rotation.y = 0
      }
      h.body.position.y = y
      h.body.scale.set(1 + squash, 1 - squash * 1.4, 1 + squash)

      h.leafMat.color.lerp(h.thirsty ? THIRSTY_LEAF : h.baseLeaf, Math.min(1, dt * 2))
      h.face.smile.visible = !h.thirsty
      h.face.frown.visible = h.thirsty

      if (t > h.blinkAt) {
        h.blinkUntil = t + 0.13
        h.blinkAt = t + 1.6 + Math.random() * 3.4
      }
      const lid = t < h.blinkUntil ? 0.12 : h.thirsty ? 0.7 : 1.15
      for (const eye of h.face.eyes) eye.scale.y += (lid - eye.scale.y) * Math.min(1, dt * 25)
      for (const pupil of h.face.pupils) {
        pupil.position.x = pupil.userData.base.x + pointer.x * 0.06
        pupil.position.y = pupil.userData.base.y + pointer.y * 0.05 - (h.thirsty ? 0.04 : 0)
      }
      for (const hand of h.hands) {
        const b = hand.userData.base
        const wave = h.thirsty ? -0.35 : Math.sin(t * 7 + hand.userData.side * 1.7 + h.phase) * 0.22 * MOTION
        hand.position.set(b.x, b.y + wave, b.z)
      }
      for (const sp of h.sprouts) sp.rotation.x = Math.sin(t * 5 + h.phase) * 0.25 * MOTION
      h.sweat.visible = h.thirsty
      if (h.thirsty) {
        const k = (t * 0.9 + h.phase) % 1
        h.sweat.position.set(h.radius * 0.72, h.radius * 0.35 - k * 0.9, h.radius * 0.62)
        h.sweat.material.opacity = 1 - k
      }

      const tag = labels.get(h.label)
      v.set(h.root.position.x, h.root.position.y + (h.headY + y) * h.root.scale.y, h.root.position.z).project(camera)
      tag.style.left = `${(v.x * 0.5 + 0.5) * container.clientWidth}px`
      tag.style.top = `${(-v.y * 0.5 + 0.5) * container.clientHeight}px`
      tag.style.opacity = v.z < 1 ? '1' : '0'
    }

    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i]
      b.life += dt
      const arr = b.pts.geometry.attributes.position.array
      b.vel.forEach((vel, k) => {
        vel.y -= 9.8 * dt
        arr[k * 3] += vel.x * dt
        arr[k * 3 + 1] = Math.max(0.05, arr[k * 3 + 1] + vel.y * dt)
        arr[k * 3 + 2] += vel.z * dt
      })
      b.pts.geometry.attributes.position.needsUpdate = true
      b.pts.material.opacity = Math.max(0, 1 - b.life / 2.2)
      if (b.life > 2.2) {
        scene.remove(b.pts)
        b.pts.geometry.dispose()
        bursts.splice(i, 1)
      }
    }

    controls.update()
    renderer.render(scene, camera)
    requestAnimationFrame(animate)
  }
  requestAnimationFrame(animate)

  return { setPlants }
}
