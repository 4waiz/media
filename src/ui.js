function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function createUI({
  onUndo,
  onRedo,
  onSave,
  onLoad,
  onExport,
  onToggleMouse,
  onPreset
}) {
  const modeLabel = document.getElementById('modeLabel');
  const paletteLabel = document.getElementById('paletteLabel');
  const brushLabel = document.getElementById('brushLabel');
  const voxelLabel = document.getElementById('voxelLabel');
  const trackingLabel = document.getElementById('trackingLabel');
  const mouseToggle = document.getElementById('mouseToggle');

  document.getElementById('undoBtn').addEventListener('click', () => onUndo());
  document.getElementById('redoBtn').addEventListener('click', () => onRedo());
  document.getElementById('saveBtn').addEventListener('click', () => onSave());
  document.getElementById('loadBtn').addEventListener('click', () => fileInput.click());
  document.getElementById('exportBtn').addEventListener('click', () => onExport());

  const presetClassic = document.getElementById('presetClassic');
  const presetAutumn = document.getElementById('presetAutumn');
  const presetCyber = document.getElementById('presetCyber');

  presetClassic.addEventListener('click', () => onPreset?.('Classic'));
  presetAutumn.addEventListener('click', () => onPreset?.('Autumn'));
  presetCyber.addEventListener('click', () => onPreset?.('Cyber'));

  mouseToggle.addEventListener('change', (event) => {
    onToggleMouse(event.target.checked);
  });

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'application/json';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);
  fileInput.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        onLoad(data);
      } catch (err) {
        console.error('Failed to load JSON', err);
      }
    };
    reader.readAsText(file);
    fileInput.value = '';
  });

  return {
    updateHUD({ mode, palette, brushSize, voxelCount, tracking }) {
      modeLabel.textContent = mode;
      paletteLabel.textContent = palette;
      brushLabel.textContent = brushSize.toString();
      voxelLabel.textContent = voxelCount.toString();
      trackingLabel.textContent = tracking ? 'Hand detected' : 'No Hand';
      trackingLabel.classList.toggle('off', !tracking);
    },
    downloadJSON(data) {
      downloadBlob('airbonsai.json', new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    },
    downloadOBJ({ obj, mtl }) {
      downloadBlob('airbonsai.obj', new Blob([obj], { type: 'text/plain' }));
      downloadBlob('airbonsai.mtl', new Blob([mtl], { type: 'text/plain' }));
    }
  };
}
