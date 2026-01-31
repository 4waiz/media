import * as THREE from 'three';

const FACE_DEFS = [
  {
    dir: [1, 0, 0],
    corners: [
      [0.5, -0.5, -0.5],
      [0.5, -0.5, 0.5],
      [0.5, 0.5, 0.5],
      [0.5, 0.5, -0.5]
    ]
  },
  {
    dir: [-1, 0, 0],
    corners: [
      [-0.5, -0.5, 0.5],
      [-0.5, -0.5, -0.5],
      [-0.5, 0.5, -0.5],
      [-0.5, 0.5, 0.5]
    ]
  },
  {
    dir: [0, 1, 0],
    corners: [
      [-0.5, 0.5, -0.5],
      [0.5, 0.5, -0.5],
      [0.5, 0.5, 0.5],
      [-0.5, 0.5, 0.5]
    ]
  },
  {
    dir: [0, -1, 0],
    corners: [
      [-0.5, -0.5, 0.5],
      [0.5, -0.5, 0.5],
      [0.5, -0.5, -0.5],
      [-0.5, -0.5, -0.5]
    ]
  },
  {
    dir: [0, 0, 1],
    corners: [
      [0.5, -0.5, 0.5],
      [-0.5, -0.5, 0.5],
      [-0.5, 0.5, 0.5],
      [0.5, 0.5, 0.5]
    ]
  },
  {
    dir: [0, 0, -1],
    corners: [
      [-0.5, -0.5, -0.5],
      [0.5, -0.5, -0.5],
      [0.5, 0.5, -0.5],
      [-0.5, 0.5, -0.5]
    ]
  }
];

function materialName(color) {
  const hex = color.toString(16).padStart(6, '0');
  return `mat_${hex}`;
}

export function exportOBJ(grid) {
  const materials = new Map();
  const facesByMaterial = new Map();
  let vertexIndex = 1;

  grid.forEachVoxel((voxel) => {
    const matName = materialName(voxel.color);
    if (!materials.has(matName)) {
      materials.set(matName, voxel.color);
    }
    if (!facesByMaterial.has(matName)) facesByMaterial.set(matName, []);

    FACE_DEFS.forEach((face) => {
      const nx = voxel.x + face.dir[0];
      const ny = voxel.y + face.dir[1];
      const nz = voxel.z + face.dir[2];
      if (grid.hasVoxel(nx, ny, nz)) return;

      const vertices = face.corners.map((corner) => {
        const vx = voxel.x + corner[0];
        const vy = voxel.y + corner[1];
        const vz = voxel.z + corner[2];
        return `v ${vx} ${vy} ${vz}`;
      });

      const faceLine = `f ${vertexIndex} ${vertexIndex + 1} ${vertexIndex + 2} ${vertexIndex + 3}`;
      vertexIndex += 4;

      const lines = facesByMaterial.get(matName);
      lines.push(...vertices, faceLine);
    });
  });

  const objLines = ['mtllib airbonsai.mtl', 'o AirBonsai'];
  facesByMaterial.forEach((lines, mat) => {
    objLines.push(`usemtl ${mat}`);
    objLines.push(...lines);
  });

  const mtlLines = [];
  materials.forEach((color, mat) => {
    const c = new THREE.Color(color);
    mtlLines.push(`newmtl ${mat}`);
    mtlLines.push(`Kd ${c.r.toFixed(4)} ${c.g.toFixed(4)} ${c.b.toFixed(4)}`);
    mtlLines.push('Ka 0 0 0');
    mtlLines.push('Ks 0.2 0.2 0.2');
    mtlLines.push('d 1.0');
    mtlLines.push('illum 2');
    mtlLines.push('');
  });

  return {
    obj: objLines.join('\n'),
    mtl: mtlLines.join('\n')
  };
}
