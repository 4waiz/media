import * as THREE from 'three';

const THUMB_TIP = 4;
const THUMB_IP = 3;
const THUMB_MCP = 2;
const INDEX_TIP = 8;
const INDEX_PIP = 6;
const INDEX_MCP = 5;
const MIDDLE_TIP = 12;
const MIDDLE_PIP = 10;
const MIDDLE_MCP = 9;
const RING_TIP = 16;
const RING_PIP = 14;
const RING_MCP = 13;
const PINKY_TIP = 20;
const PINKY_PIP = 18;
const PINKY_MCP = 17;
const WRIST = 0;

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function fingerExtended(landmarks, tip, pip, mcp) {
  const tipLm = landmarks[tip];
  const pipLm = landmarks[pip];
  const mcpLm = landmarks[mcp];
  const yExtended = tipLm.y < pipLm.y - 0.02 && tipLm.y < mcpLm.y - 0.02;
  const zExtended = tipLm.z < pipLm.z + 0.02;
  return yExtended && zExtended;
}

function thumbExtended(landmarks) {
  const tip = landmarks[THUMB_TIP];
  const ip = landmarks[THUMB_IP];
  const mcp = landmarks[THUMB_MCP];
  const away = dist(tip, mcp) > 0.08;
  return tip.y < ip.y - 0.02 && away;
}

function handSize(landmarks) {
  return dist(landmarks[WRIST], landmarks[MIDDLE_MCP]);
}

export function computeHandPose(landmarks) {
  const size = handSize(landmarks);
  const pinchDistance = dist(landmarks[THUMB_TIP], landmarks[INDEX_TIP]);
  const pinch = pinchDistance < size * 0.35;

  const indexExt = fingerExtended(landmarks, INDEX_TIP, INDEX_PIP, INDEX_MCP);
  const middleExt = fingerExtended(landmarks, MIDDLE_TIP, MIDDLE_PIP, MIDDLE_MCP);
  const ringExt = fingerExtended(landmarks, RING_TIP, RING_PIP, RING_MCP);
  const pinkyExt = fingerExtended(landmarks, PINKY_TIP, PINKY_PIP, PINKY_MCP);
  const thumbExt = thumbExtended(landmarks);

  const openPalm = indexExt && middleExt && ringExt && pinkyExt && thumbExt && !pinch;
  const fist = !indexExt && !middleExt && !ringExt && !pinkyExt && !thumbExt && !pinch;
  const vSign = indexExt && middleExt && !ringExt && !pinkyExt;
  const thumbUp = thumbExt && !indexExt && !middleExt && !ringExt && !pinkyExt && landmarks[THUMB_TIP].y < landmarks[WRIST].y - 0.04;

  const pinchPoint = new THREE.Vector3(
    (landmarks[THUMB_TIP].x + landmarks[INDEX_TIP].x) * 0.5,
    (landmarks[THUMB_TIP].y + landmarks[INDEX_TIP].y) * 0.5,
    (landmarks[THUMB_TIP].z + landmarks[INDEX_TIP].z) * 0.5
  );

  const indexPoint = new THREE.Vector3(
    landmarks[INDEX_TIP].x,
    landmarks[INDEX_TIP].y,
    landmarks[INDEX_TIP].z
  );

  return {
    pinch,
    pinchDistance,
    pinchPoint,
    indexPoint,
    openPalm,
    fist,
    vSign,
    thumbUp
  };
}

export function interpretGestureRecognizer(gestureResult, handIndex) {
  if (!gestureResult?.gestures?.[handIndex]?.length) return null;
  const gesture = gestureResult.gestures[handIndex][0];
  if (gesture.score < 0.55) return null;
  return gesture.categoryName;
}

export function mergeGestureSignals(heuristic, recognized) {
  if (!recognized) return heuristic;
  const merged = { ...heuristic };
  switch (recognized) {
    case 'Closed_Fist':
      merged.fist = true;
      merged.openPalm = false;
      merged.pinch = false;
      break;
    case 'Open_Palm':
      merged.openPalm = true;
      merged.fist = false;
      break;
    case 'Pointing_Up':
      merged.pinch = false;
      merged.fist = false;
      merged.openPalm = false;
      break;
    case 'Victory':
      merged.vSign = true;
      break;
    case 'Thumb_Up':
      merged.thumbUp = true;
      break;
    case 'ILoveYou':
      merged.vSign = true;
      break;
    default:
      break;
  }
  return merged;
}

export const LANDMARKS = {
  WRIST,
  INDEX_TIP,
  THUMB_TIP
};
