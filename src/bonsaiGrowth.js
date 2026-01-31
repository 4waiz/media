import * as THREE from 'three';

export function snapToGrid(point) {
  return new THREE.Vector3(
    Math.round(point.x),
    Math.round(point.y),
    Math.round(point.z)
  );
}

export function getBrushOffsets(radius) {
  const offsets = [];
  for (let x = -radius; x <= radius; x++) {
    for (let y = -radius; y <= radius; y++) {
      for (let z = -radius; z <= radius; z++) {
        const dist = Math.sqrt(x * x + y * y + z * z);
        if (dist <= radius + 0.01) offsets.push(new THREE.Vector3(x, y, z));
      }
    }
  }
  return offsets;
}

export function createGrowthCurve(points) {
  if (points.length < 2) return null;
  const curve = new THREE.CatmullRomCurve3(points);
  curve.curveType = 'catmullrom';
  curve.tension = 0.6;
  return curve;
}

export function sampleCurve(curve, fromT, toT, step = 0.04, upBias = 0.3) {
  const samples = [];
  if (!curve) return samples;
  for (let t = fromT; t <= toT; t += step) {
    const p = curve.getPoint(t);
    p.y += upBias * t;
    samples.push(p);
  }
  return samples;
}

export function clampToBox(point, bounds) {
  point.x = THREE.MathUtils.clamp(point.x, bounds.min.x, bounds.max.x);
  point.y = THREE.MathUtils.clamp(point.y, bounds.min.y, bounds.max.y);
  point.z = THREE.MathUtils.clamp(point.z, bounds.min.z, bounds.max.z);
  return point;
}

export function findNearestVoxel(grid, point, radius = 1.5) {
  let best = null;
  let bestDist = Infinity;
  grid.forEachVoxel((voxel) => {
    const dx = voxel.x - point.x;
    const dy = voxel.y - point.y;
    const dz = voxel.z - point.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < radius && d < bestDist) {
      best = voxel;
      bestDist = d;
    }
  });
  return best;
}

export function isBranchTip(grid, voxel) {
  if (!voxel) return false;
  return !grid.hasVoxel(voxel.x, voxel.y + 1, voxel.z);
}
