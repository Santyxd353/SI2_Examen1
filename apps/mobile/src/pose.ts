import type { PoseResult } from '../modules/pose-landmarker/src';

export type Point = { x: number; y: number };
export type Torso = { leftShoulder: Point; rightShoulder: Point; leftHip: Point; rightHip: Point };
export type Layout = { width: number; height: number };
export type GarmentKind = 'top' | 'dress' | 'unsupported';

export function garmentKind(name: string): GarmentKind {
  if (/vestido|dress/i.test(name)) return 'dress';
  if (/blusa|camisa|camiseta|top|chaqueta|polera|suéter|sudadera/i.test(name)) return 'top';
  return 'unsupported';
}

export function projectTorso(
  pose: PoseResult,
  layout: Layout,
  previous?: Torso | null,
): Torso | null {
  if (pose.width <= 0 || pose.height <= 0 || layout.width <= 0 || layout.height <= 0) return null;
  const indices = [11, 12, 23, 24];
  const landmarks = indices.map((index) => pose.landmarks[index]);
  if (
    landmarks.some(
      (point) =>
        !point || point.visibility < 0.55 || !Number.isFinite(point.x) || !Number.isFinite(point.y),
    )
  )
    return null;
  const scale = Math.max(layout.width / pose.width, layout.height / pose.height);
  const offsetX = (pose.width * scale - layout.width) / 2;
  const offsetY = (pose.height * scale - layout.height) / 2;
  const points = landmarks.map((point) => ({
    x: point!.x * pose.width * scale - offsetX,
    y: point!.y * pose.height * scale - offsetY,
  }));
  const [a, b, c, d] = points as [Point, Point, Point, Point];
  const [leftShoulder, rightShoulder] = a.x <= b.x ? [a, b] : [b, a];
  const [leftHip, rightHip] = c.x <= d.x ? [c, d] : [d, c];
  const width = rightShoulder.x - leftShoulder.x;
  if (
    width < layout.width * 0.1 ||
    width > layout.width * 0.85 ||
    Math.min(leftHip.y, rightHip.y) <= Math.max(leftShoulder.y, rightShoulder.y) + width * 0.25
  )
    return null;
  const next = { leftShoulder, rightShoulder, leftHip, rightHip };
  if (!previous) return next;
  const smooth = (old: Point, current: Point): Point => ({
    x: old.x * 0.65 + current.x * 0.35,
    y: old.y * 0.65 + current.y * 0.35,
  });
  return {
    leftShoulder: smooth(previous.leftShoulder, next.leftShoulder),
    rightShoulder: smooth(previous.rightShoulder, next.rightShoulder),
    leftHip: smooth(previous.leftHip, next.leftHip),
    rightHip: smooth(previous.rightHip, next.rightHip),
  };
}

export function garmentOutline(torso: Torso, kind: Exclude<GarmentKind, 'unsupported'>): Point[] {
  const { leftShoulder: ls, rightShoulder: rs, leftHip: lh, rightHip: rh } = torso;
  const width = rs.x - ls.x;
  const neckX = (ls.x + rs.x) / 2;
  const shoulderY = (ls.y + rs.y) / 2;
  const hemY =
    kind === 'dress'
      ? Math.max(lh.y, rh.y) + (Math.max(lh.y, rh.y) - shoulderY) * 0.75
      : Math.max(lh.y, rh.y) + width * 0.08;
  const flare = kind === 'dress' ? width * 0.36 : width * 0.11;
  return [
    { x: neckX - width * 0.13, y: shoulderY - width * 0.01 },
    { x: ls.x - width * 0.1, y: ls.y - width * 0.07 },
    { x: ls.x - width * 0.37, y: ls.y + width * 0.26 },
    { x: ls.x - width * 0.16, y: ls.y + width * 0.48 },
    { x: lh.x - flare, y: hemY },
    { x: rh.x + flare, y: hemY },
    { x: rs.x + width * 0.16, y: rs.y + width * 0.48 },
    { x: rs.x + width * 0.37, y: rs.y + width * 0.26 },
    { x: rs.x + width * 0.1, y: rs.y - width * 0.07 },
    { x: neckX + width * 0.13, y: shoulderY - width * 0.01 },
    { x: neckX, y: shoulderY + width * 0.12 },
  ];
}
