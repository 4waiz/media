import * as THREE from 'three';

function keyFor(x, y, z) {
  return `${x},${y},${z}`;
}

export class VoxelHistory {
  constructor(limit = 50) {
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
    this.current = null;
  }

  begin(label) {
    if (this.current) return;
    this.current = { label, adds: [], removes: [] };
  }

  recordAdd(voxel) {
    if (!this.current) return;
    this.current.adds.push(voxel);
  }

  recordRemove(voxel) {
    if (!this.current) return;
    this.current.removes.push(voxel);
  }

  commit() {
    if (!this.current) return;
    if (this.current.adds.length || this.current.removes.length) {
      this.undoStack.push(this.current);
      if (this.undoStack.length > this.limit) this.undoStack.shift();
      this.redoStack.length = 0;
    }
    this.current = null;
  }

  cancel() {
    this.current = null;
  }

  undo(grid) {
    const action = this.undoStack.pop();
    if (!action) return null;
    for (const voxel of action.adds) {
      grid.removeVoxel(voxel.x, voxel.y, voxel.z, null);
    }
    for (const voxel of action.removes) {
      grid.setVoxel(voxel.x, voxel.y, voxel.z, voxel, null);
    }
    this.redoStack.push(action);
    return action;
  }

  redo(grid) {
    const action = this.redoStack.pop();
    if (!action) return null;
    for (const voxel of action.removes) {
      grid.removeVoxel(voxel.x, voxel.y, voxel.z, null);
    }
    for (const voxel of action.adds) {
      grid.setVoxel(voxel.x, voxel.y, voxel.z, voxel, null);
    }
    this.undoStack.push(action);
    return action;
  }
}

export class VoxelGrid {
  constructor(scene, { maxInstances = 50000 } = {}) {
    this.grid = new Map();
    this.maxInstances = maxInstances;
    this.geometry = new THREE.BoxGeometry(1, 1, 1);
    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.55,
      metalness: 0.05
    });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, this.maxInstances);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;

    this.keyToIndex = new Map();
    this.indexToKey = [];
    this.count = 0;
    this.tempMatrix = new THREE.Matrix4();
    this.tempColor = new THREE.Color();

    scene.add(this.mesh);
  }

  getCount() {
    return this.count;
  }

  hasVoxel(x, y, z) {
    return this.grid.has(keyFor(x, y, z));
  }

  getVoxel(x, y, z) {
    return this.grid.get(keyFor(x, y, z));
  }

  setVoxel(x, y, z, voxel, history) {
    const key = keyFor(x, y, z);
    const existing = this.grid.get(key);
    if (existing) {
      if (existing.color !== voxel.color || existing.type !== voxel.type) {
        this.grid.set(key, { ...voxel, x, y, z });
        const index = this.keyToIndex.get(key);
        if (index !== undefined) {
          this.tempColor.setHex(voxel.color);
          this.mesh.setColorAt(index, this.tempColor);
          this.mesh.instanceColor.needsUpdate = true;
        }
      }
      return;
    }

    if (this.count >= this.maxInstances) {
      console.warn('Voxel instance limit reached.');
      return;
    }

    const index = this.count;
    this.keyToIndex.set(key, index);
    this.indexToKey[index] = key;
    this.grid.set(key, { ...voxel, x, y, z });

    this.tempMatrix.makeTranslation(x, y, z);
    this.mesh.setMatrixAt(index, this.tempMatrix);
    this.tempColor.setHex(voxel.color);
    this.mesh.setColorAt(index, this.tempColor);

    this.count += 1;
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;

    if (history) history.recordAdd({ ...voxel, x, y, z });
  }

  removeVoxel(x, y, z, history) {
    const key = keyFor(x, y, z);
    const existing = this.grid.get(key);
    if (!existing) return;

    const index = this.keyToIndex.get(key);
    const lastIndex = this.count - 1;

    if (index !== lastIndex) {
      const lastKey = this.indexToKey[lastIndex];
      this.mesh.getMatrixAt(lastIndex, this.tempMatrix);
      this.mesh.setMatrixAt(index, this.tempMatrix);
      if (this.mesh.instanceColor) {
        this.mesh.getColorAt(lastIndex, this.tempColor);
        this.mesh.setColorAt(index, this.tempColor);
      }
      this.keyToIndex.set(lastKey, index);
      this.indexToKey[index] = lastKey;
    }

    this.keyToIndex.delete(key);
    this.indexToKey.pop();
    this.grid.delete(key);

    this.count -= 1;
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    if (history) history.recordRemove(existing);
  }

  clear() {
    this.grid.clear();
    this.keyToIndex.clear();
    this.indexToKey.length = 0;
    this.count = 0;
    this.mesh.count = 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  exportData() {
    return {
      voxels: Array.from(this.grid.values())
    };
  }

  importData(data) {
    this.clear();
    if (!data?.voxels) return;
    for (const voxel of data.voxels) {
      this.setVoxel(voxel.x, voxel.y, voxel.z, voxel, null);
    }
  }

  forEachVoxel(callback) {
    this.grid.forEach((voxel) => callback(voxel));
  }
}

export function keyFromVector(vec) {
  return keyFor(vec.x, vec.y, vec.z);
}
