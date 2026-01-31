import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

import { HandTracker } from './handTracking.js';
import { computeHandPose, interpretGestureRecognizer, mergeGestureSignals } from './gestures.js';
import { VoxelGrid, VoxelHistory } from './voxels.js';
import {
  snapToGrid,
  getBrushOffsets,
  createGrowthCurve,
  sampleCurve,
  clampToBox,
  findNearestVoxel,
  isBranchTip
} from './bonsaiGrowth.js';
import { exportOBJ } from './exportOBJ.js';
import { createUI } from './ui.js';

const MODES = {
  GROW: 'Grow',
  LEAF: 'Leaf',
  ERASE: 'Erase'
};

const bounds = {
  min: new THREE.Vector3(-12, 0, -12),
  max: new THREE.Vector3(12, 18, 12)
};

const palettes = [
  {
    name: 'Classic',
    trunk: [0x5a3a1b, 0x6b4522],
    leaves: [0x5ad36b, 0x4bc25d, 0x76f29a]
  },
  {
    name: 'Autumn',
    trunk: [0x5b3b1f, 0x6d4726],
    leaves: [0xf28c28, 0xf04c3c, 0xffb74d]
  },
  {
    name: 'Sakura',
    trunk: [0x4f3420, 0x5c3a24],
    leaves: [0xf9c3d1, 0xf3a8c3, 0xffd7e7]
  },
  {
    name: 'Neon',
    trunk: [0x1e1f2f, 0x2a2333],
    leaves: [0x67f4ff, 0x9f72ff, 0xff7cf0]
  },
  {
    name: 'Monochrome',
    trunk: [0x2a2a2a, 0x3a3a3a],
    leaves: [0xc9c9c9, 0xf5f5f5, 0x9f9f9f]
  },
  {
    name: 'Cyber',
    trunk: [0x12141f, 0x1a1d2a],
    leaves: [0x7cf9c0, 0x6de2ff, 0x8cff6a]
  }
];

const brushCache = new Map();
for (let r = 1; r <= 6; r++) {
  brushCache.set(r, getBrushOffsets(r));
}

const app = document.getElementById('app');
const video = document.getElementById('video');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0b1016, 15, 60);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(18, 14, 20);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 6, 0);
controls.update();

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.6, 0.55, 0.2);
bloomPass.threshold = 0.1;
bloomPass.strength = 0.75;
bloomPass.radius = 0.35;
composer.addPass(bloomPass);

const hemi = new THREE.HemisphereLight(0xaecbff, 0x2b2f3a, 0.8);
scene.add(hemi);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
dirLight.position.set(10, 18, 8);
scene.add(dirLight);

const fillLight = new THREE.PointLight(0x5b7cff, 0.6, 40);
fillLight.position.set(-12, 8, -8);
scene.add(fillLight);

const pedestal = new THREE.Mesh(
  new THREE.CylinderGeometry(6.5, 7, 1.4, 32),
  new THREE.MeshStandardMaterial({ color: 0x1a202a, roughness: 0.8, metalness: 0.1 })
);
pedestal.position.set(0, -0.7, 0);
scene.add(pedestal);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(12, 40),
  new THREE.MeshStandardMaterial({ color: 0x0f141c, roughness: 0.9, metalness: 0.1 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -1.4;
scene.add(ground);

const voxelGrid = new VoxelGrid(scene, { maxInstances: 60000 });
const history = new VoxelHistory(60);

const cursor = new THREE.Mesh(
  new THREE.SphereGeometry(0.25, 16, 16),
  new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x223355, emissiveIntensity: 1.5 })
);
scene.add(cursor);

const brushSphere = new THREE.Mesh(
  new THREE.SphereGeometry(1, 16, 16),
  new THREE.MeshBasicMaterial({ color: 0x7cf9c0, wireframe: true, transparent: true, opacity: 0.35 })
);
scene.add(brushSphere);

const sparkleGeo = new THREE.BufferGeometry();
const sparkleCount = 120;
const sparklePositions = new Float32Array(sparkleCount * 3);
const sparkleLife = new Float32Array(sparkleCount);
const sparkleVelocity = new Float32Array(sparkleCount * 3);
for (let i = 0; i < sparkleCount; i++) {
  sparkleLife[i] = 0;
}
sparkleGeo.setAttribute('position', new THREE.BufferAttribute(sparklePositions, 3));
const sparkleMat = new THREE.PointsMaterial({
  color: 0x7cf9c0,
  size: 0.12,
  transparent: true,
  opacity: 0.9
});
const sparkles = new THREE.Points(sparkleGeo, sparkleMat);
scene.add(sparkles);

function spawnSparkles(position) {
  for (let i = 0; i < sparkleCount; i++) {
    if (sparkleLife[i] <= 0) {
      sparkleLife[i] = 1;
      sparklePositions[i * 3] = position.x;
      sparklePositions[i * 3 + 1] = position.y;
      sparklePositions[i * 3 + 2] = position.z;
      sparkleVelocity[i * 3] = (Math.random() - 0.5) * 0.5;
      sparkleVelocity[i * 3 + 1] = Math.random() * 0.6 + 0.2;
      sparkleVelocity[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
      break;
    }
  }
}

const state = {
  mode: MODES.GROW,
  brushSize: 2,
  paletteIndex: 0,
  symmetry: false,
  tracking: false,
  mouseMode: false
};

const ui = createUI({
  onUndo: () => history.undo(voxelGrid),
  onRedo: () => history.redo(voxelGrid),
  onSave: () => {
    ui.downloadJSON({
      version: 1,
      paletteIndex: state.paletteIndex,
      paletteName: palettes[state.paletteIndex].name,
      brushSize: state.brushSize,
      symmetry: state.symmetry,
      data: voxelGrid.exportData()
    });
  },
  onLoad: (data) => {
    if (!data?.data) return;
    voxelGrid.importData(data.data);
    if (typeof data.paletteIndex === 'number') {
      state.paletteIndex = data.paletteIndex;
    }
    if (typeof data.brushSize === 'number') {
      state.brushSize = data.brushSize;
    }
    if (typeof data.symmetry === 'boolean') {
      state.symmetry = data.symmetry;
    }
  },
  onExport: () => {
    const exported = exportOBJ(voxelGrid);
    ui.downloadOBJ(exported);
  },
  onToggleMouse: (enabled) => {
    state.mouseMode = enabled;
  },
  onPreset: (name) => {
    const index = palettes.findIndex((palette) => palette.name === name);
    if (index >= 0) state.paletteIndex = index;
  }
});

const tracker = new HandTracker({
  onResults: handleHandResults,
  onStatus: () => {}
});

let rightPinching = false;
let leftPinching = false;
let rightAction = null;
let growState = null;
let lastGestureTime = 0;
let leftPinchStartY = 0;
let leftBrushStart = 2;
let cameraControlActive = false;
let cameraStartDistance = 0;
let cameraStartMid = null;
let leafActive = false;
let eraseActive = false;
let activeGestureMode = null;

const raycaster = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -3.5);
const cameraDir = new THREE.Vector3();

const mouse = {
  ndc: new THREE.Vector2(),
  active: false,
  down: false,
  world: new THREE.Vector3(),
  last: new THREE.Vector3()
};

window.addEventListener('mousemove', (event) => {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
});
window.addEventListener('mousedown', () => {
  mouse.down = true;
});
window.addEventListener('mouseup', () => {
  mouse.down = false;
});

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  switch (event.key.toLowerCase()) {
    case '1':
      state.mode = MODES.GROW;
      break;
    case '2':
      state.mode = MODES.LEAF;
      break;
    case '3':
      state.mode = MODES.ERASE;
      break;
    case 'z':
      history.undo(voxelGrid);
      break;
    case 'y':
      history.redo(voxelGrid);
      break;
    case 's':
      ui.downloadJSON({
        version: 1,
        paletteIndex: state.paletteIndex,
        paletteName: palettes[state.paletteIndex].name,
        brushSize: state.brushSize,
        symmetry: state.symmetry,
        data: voxelGrid.exportData()
      });
      break;
    case 'l':
      document.getElementById('loadBtn').click();
      break;
    case 'e':
      ui.downloadOBJ(exportOBJ(voxelGrid));
      break;
    default:
      break;
  }
});

function handleHandResults({ landmarks, handednesses, gestureResult }) {
  if (state.mouseMode) return;
  const hands = [];
  for (let i = 0; i < landmarks.length; i++) {
    const label = handednesses[i]?.[0]?.categoryName || 'Unknown';
    const pose = computeHandPose(landmarks[i]);
    const gestureName = interpretGestureRecognizer(gestureResult, i);
    const merged = mergeGestureSignals(pose, gestureName);
    hands.push({
      label,
      pose: merged,
      landmarks: landmarks[i]
    });
  }
  processHands(hands);
}

function processHands(hands) {
  state.tracking = hands.length > 0;
  activeGestureMode = null;

  const rightHand = hands.find((hand) => hand.label === 'Right') || null;
  const leftHand = hands.find((hand) => hand.label === 'Left') || null;

  if (rightHand) {
    rightHand.world = mapLandmarkToWorld(rightHand.pose.indexPoint);
    rightHand.pinchWorld = mapLandmarkToWorld(rightHand.pose.pinchPoint);
  }
  if (leftHand) {
    leftHand.world = mapLandmarkToWorld(leftHand.pose.indexPoint);
    leftHand.pinchWorld = mapLandmarkToWorld(leftHand.pose.pinchPoint);
  }

  handleLeftGestures(leftHand);
  handleCameraControl(leftHand, rightHand);
  handleRightGestures(rightHand);

  if (rightHand?.world) {
    cursor.position.copy(rightHand.world);
  }
}

function mapLandmarkToWorld(landmark) {
  const ndc = new THREE.Vector2(landmark.x * 2 - 1, -(landmark.y * 2 - 1));
  raycaster.setFromCamera(ndc, camera);
  const hit = new THREE.Vector3();
  raycaster.ray.intersectPlane(plane, hit);

  camera.getWorldDirection(cameraDir);
  const depth = THREE.MathUtils.clamp(-landmark.z * 12, -5, 5);
  hit.addScaledVector(cameraDir, depth);

  return clampToBox(hit, bounds);
}

function handleLeftGestures(leftHand) {
  if (!leftHand) {
    leftPinching = false;
    return;
  }

  const now = performance.now();
  if (leftHand.pose.thumbUp && now - lastGestureTime > 900) {
    cyclePalette(1);
    lastGestureTime = now;
  }
  if (leftHand.pose.vSign && now - lastGestureTime > 900) {
    state.symmetry = !state.symmetry;
    lastGestureTime = now;
  }

  if (leftHand.pose.pinch) {
    if (!leftPinching) {
      leftPinching = true;
      leftPinchStartY = leftHand.pose.pinchPoint.y;
      leftBrushStart = state.brushSize;
    }
    const delta = (leftPinchStartY - leftHand.pose.pinchPoint.y) * 10;
    const next = Math.round(leftBrushStart + delta);
    state.brushSize = THREE.MathUtils.clamp(next, 1, 6);
  } else if (leftPinching) {
    leftPinching = false;
  }
}

function handleCameraControl(leftHand, rightHand) {
  if (leftHand?.pose.pinch && rightHand?.pose.pinch) {
    const left = leftHand.pinchWorld;
    const right = rightHand.pinchWorld;
    if (!left || !right) return;
    const mid = new THREE.Vector3().addVectors(left, right).multiplyScalar(0.5);
    const distance = left.distanceTo(right);
    if (!cameraControlActive) {
      cameraControlActive = true;
      cameraStartDistance = distance;
      cameraStartMid = mid.clone();
    } else {
      const delta = new THREE.Vector3().subVectors(mid, cameraStartMid);
      controls.rotateLeft(delta.x * 0.06);
      controls.rotateUp(delta.y * 0.06);
      const zoomFactor = cameraStartDistance / Math.max(distance, 0.1);
      if (zoomFactor > 1) {
        controls.dollyIn(zoomFactor);
      } else {
        controls.dollyOut(1 / zoomFactor);
      }
      cameraStartMid.copy(mid);
      cameraStartDistance = distance;
    }
    return;
  }
  cameraControlActive = false;
}

function handleRightGestures(rightHand) {
  if (!rightHand || cameraControlActive) {
    if (rightPinching) stopGrow();
    if (leafActive) stopLeaf();
    if (eraseActive) stopErase();
    rightPinching = false;
    return;
  }

  const pointer = rightHand.pinchWorld || rightHand.world;
  if (!pointer) return;

  const gestureMode = rightHand.pose.pinch
    ? MODES.GROW
    : rightHand.pose.openPalm
      ? MODES.LEAF
      : rightHand.pose.fist
        ? MODES.ERASE
        : null;

  activeGestureMode = gestureMode;

  if (rightHand.pose.pinch) {
    if (!rightPinching) startGrow(pointer);
    updateGrow(pointer);
  } else {
    if (rightPinching) stopGrow();
    rightPinching = false;
  }

  if (gestureMode === MODES.LEAF) {
    if (!leafActive) startLeaf();
    paintLeaves(pointer);
  } else if (leafActive) {
    stopLeaf();
  }

  if (gestureMode === MODES.ERASE) {
    if (!eraseActive) startErase();
    eraseVoxels(pointer);
  } else if (eraseActive) {
    stopErase();
  }
}

function startGrow(pointer) {
  rightPinching = true;
  history.begin('grow');
  const nearest = findNearestVoxel(voxelGrid, pointer, 2.2);
  if (nearest) {
    rightAction = 'grow';
    growState = {
      points: [new THREE.Vector3(nearest.x, nearest.y, nearest.z)],
      placed: new Set()
    };
    growState.points.push(pointer.clone());
  } else {
    rightAction = 'stamp';
    growState = {
      points: [pointer.clone()],
      placed: new Set()
    };
  }
}

function updateGrow(pointer) {
  if (!growState) return;
  const palette = palettes[state.paletteIndex];
  const trunkColor = palette.trunk[Math.floor(Math.random() * palette.trunk.length)];

  if (rightAction === 'stamp') {
    const snapped = snapToGrid(pointer);
    placeVoxelBrush(snapped, state.brushSize, trunkColor, 'wood');
    return;
  }

  const lastPoint = growState.points[growState.points.length - 1];
  if (lastPoint.distanceTo(pointer) > 0.4) {
    growState.points.push(pointer.clone());
  }

  const curve = createGrowthCurve(growState.points);
  if (!curve) return;
  const samples = sampleCurve(curve, 0, 1, 0.05, 0.35);

  for (const sample of samples) {
    const snapped = snapToGrid(sample);
    const radius = computeGrowRadius(snapped.y);
    placeVoxelBrush(snapped, radius, trunkColor, 'wood');
  }
}

function stopGrow() {
  rightPinching = false;
  rightAction = null;
  growState = null;
  history.commit();
}

function startLeaf() {
  leafActive = true;
  history.begin('leaf');
}

function stopLeaf() {
  leafActive = false;
  history.commit();
}

function startErase() {
  eraseActive = true;
  history.begin('erase');
}

function stopErase() {
  eraseActive = false;
  history.commit();
}

function computeGrowRadius(y) {
  const factor = THREE.MathUtils.clamp(1 - y / 16, 0.35, 1);
  return Math.max(1, Math.round(state.brushSize * factor));
}

function placeVoxelBrush(center, radius, color, type) {
  const offsets = brushCache.get(radius) || brushCache.get(1);
  offsets.forEach((offset) => {
    const pos = new THREE.Vector3().addVectors(center, offset);
    clampToBox(pos, bounds);
    const snapped = snapToGrid(pos);
    const voxel = { x: snapped.x, y: snapped.y, z: snapped.z, color, type };
    if (!voxelGrid.hasVoxel(voxel.x, voxel.y, voxel.z)) {
      voxelGrid.setVoxel(voxel.x, voxel.y, voxel.z, voxel, history);
      spawnSparkles(snapped);
    }
    if (state.symmetry && voxel.x !== 0) {
      const mirror = { ...voxel, x: -voxel.x };
      if (!voxelGrid.hasVoxel(mirror.x, mirror.y, mirror.z)) {
        voxelGrid.setVoxel(mirror.x, mirror.y, mirror.z, mirror, history);
        spawnSparkles(new THREE.Vector3(mirror.x, mirror.y, mirror.z));
      }
    }
  });
}

function hasWoodNeighbor(x, y, z) {
  const neighbors = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1]
  ];
  return neighbors.some(([dx, dy, dz]) => {
    const voxel = voxelGrid.getVoxel(x + dx, y + dy, z + dz);
    return voxel?.type === 'wood';
  });
}

function paintLeaves(pointer) {
  const palette = palettes[state.paletteIndex];
  const leafColor = palette.leaves[Math.floor(Math.random() * palette.leaves.length)];

  const nearby = findNearestVoxel(voxelGrid, pointer, 2.2);
  let center = pointer.clone();
  if (nearby && isBranchTip(voxelGrid, nearby)) {
    center = new THREE.Vector3(nearby.x, nearby.y, nearby.z);
  }

  const offsets = brushCache.get(state.brushSize) || brushCache.get(1);
  offsets.forEach((offset) => {
    const pos = new THREE.Vector3().addVectors(center, offset);
    clampToBox(pos, bounds);
    const snapped = snapToGrid(pos);
    const existing = voxelGrid.getVoxel(snapped.x, snapped.y, snapped.z);
    if (existing?.type === 'wood') return;
    if (!hasWoodNeighbor(snapped.x, snapped.y, snapped.z)) return;
    const voxel = { x: snapped.x, y: snapped.y, z: snapped.z, color: leafColor, type: 'leaf' };
    voxelGrid.setVoxel(voxel.x, voxel.y, voxel.z, voxel, history);
    spawnSparkles(snapped);
    if (state.symmetry && voxel.x !== 0) {
      const mirror = { ...voxel, x: -voxel.x };
      voxelGrid.setVoxel(mirror.x, mirror.y, mirror.z, mirror, history);
      spawnSparkles(new THREE.Vector3(mirror.x, mirror.y, mirror.z));
    }
  });
}

function eraseVoxels(pointer) {
  const offsets = brushCache.get(state.brushSize) || brushCache.get(1);
  offsets.forEach((offset) => {
    const pos = new THREE.Vector3().addVectors(pointer, offset);
    const snapped = snapToGrid(pos);
    voxelGrid.removeVoxel(snapped.x, snapped.y, snapped.z, history);
    if (state.symmetry && snapped.x !== 0) {
      voxelGrid.removeVoxel(-snapped.x, snapped.y, snapped.z, history);
    }
  });
}

function cyclePalette(step) {
  state.paletteIndex = (state.paletteIndex + step + palettes.length) % palettes.length;
}

function updateMouse() {
  if (!state.mouseMode) return;
  raycaster.setFromCamera(mouse.ndc, camera);
  const hit = new THREE.Vector3();
  raycaster.ray.intersectPlane(plane, hit);
  clampToBox(hit, bounds);
  mouse.world.copy(hit);
  cursor.position.copy(hit);

  if (!mouse.down) {
    if (mouse.active) {
      history.commit();
    }
    mouse.active = false;
    return;
  }

  if (!mouse.active) {
    mouse.active = true;
    mouse.last.copy(hit);
    history.begin('mouse');
  }

  const distance = mouse.last.distanceTo(hit);
  if (distance > 0.4) {
    mouse.last.copy(hit);
  }

  if (state.mode === MODES.GROW) {
    placeVoxelBrush(snapToGrid(hit), state.brushSize, palettes[state.paletteIndex].trunk[0], 'wood');
  } else if (state.mode === MODES.LEAF) {
    paintLeaves(hit);
  } else if (state.mode === MODES.ERASE) {
    eraseVoxels(hit);
  }
}

function updateSparkles(delta) {
  let active = 0;
  for (let i = 0; i < sparkleCount; i++) {
    if (sparkleLife[i] <= 0) continue;
    sparkleLife[i] -= delta * 1.8;
    sparklePositions[i * 3] += sparkleVelocity[i * 3] * delta * 6;
    sparklePositions[i * 3 + 1] += sparkleVelocity[i * 3 + 1] * delta * 6;
    sparklePositions[i * 3 + 2] += sparkleVelocity[i * 3 + 2] * delta * 6;
    sparkleVelocity[i * 3 + 1] -= delta * 1.2;
    active++;
  }
  sparkleGeo.attributes.position.needsUpdate = active > 0;
}

function animate() {
  requestAnimationFrame(animate);
  updateMouse();
  updateSparkles(0.016);

  brushSphere.position.copy(cursor.position);
  brushSphere.scale.setScalar(state.brushSize * 1.2);
  brushSphere.visible = state.mouseMode || state.tracking;
  cursor.visible = brushSphere.visible;

  const hudMode = activeGestureMode || state.mode;

  ui.updateHUD({
    mode: hudMode,
    palette: palettes[state.paletteIndex].name,
    brushSize: state.brushSize,
    voxelCount: voxelGrid.getCount(),
    tracking: state.tracking && !state.mouseMode
  });

  controls.update();
  composer.render();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

async function boot() {
  await tracker.init(video);
  tracker.start();
  animate();
}

boot();
