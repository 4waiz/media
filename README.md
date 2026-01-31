# AirBonsai Studio

A browser-based voxel bonsai sculptor controlled by hand gestures (MediaPipe) or mouse fallback. Built with Three.js + Vite.

## Run

```bash
npm install
npm run dev
```

Open the local URL shown by Vite (usually http://localhost:5173).

## Gestures (camera on)

Right hand (sculpt):
- Pinch: grow/stamp voxels
- Open palm: leaf paint
- Closed fist: prune/erase

Left hand (controls):
- Thumb up: cycle palette
- V sign: toggle symmetry
- Pinch + vertical move: brush size (1..6)

Two hands:
- Both pinching: orbit + zoom

## Keyboard

- 1 Grow
- 2 Leaf
- 3 Erase
- Z Undo
- Y Redo
- S Save JSON
- L Load JSON
- E Export OBJ

## Mouse fallback

Toggle **Mouse mode** in the UI. Use left mouse to sculpt with the current mode.

## Presets

Use the **Classic**, **Autumn**, and **Cyber** buttons for one-click palette presets.

## Export

- **Save JSON** downloads `airbonsai.json` (for reimport).
- **Export OBJ** downloads `airbonsai.obj` + `airbonsai.mtl`.
  Import into Blender: `File > Import > Wavefront (.obj)` and ensure the `.mtl` is in the same folder.

## Troubleshooting camera permissions

- Ensure the page is served from `http://localhost` (file:// URLs block camera access).
- Allow camera permissions in the browser prompt.
- If you see a black screen, verify your camera is not already in use.

## Notes

- MediaPipe Tasks Vision model assets are loaded from Google storage at runtime.
- Designed for modern Chrome/Edge.
