// Synthetische Gefäßfotos mit exakt bekannter Sollkontur.
//
// Zweck: Für den Segmentierungs-Vergleich brauchen wir Bilder, bei denen die
// richtige Kontur feststeht. Jede Szene wird zweimal gerendert: einmal als
// „Foto“ (Licht, Glasur, Hintergrund) und einmal als Sollmaske (Gefäß weiß auf
// Schwarz, gleiche Kamera). Die Sollmaske ist damit pixelgenau richtig – auch
// mit Perspektive und Henkel.
//
// Zusammenspiel: Die Laborseite (app/lab/segmentation) ruft `renderSyntheticScene`
// auf; tests/lab/generate-synthetic.spec.ts speichert die Ergebnisse als Fixtures.
// Alles ist deterministisch (fester Zufalls-Seed pro Szene), damit sich die
// Fixtures reproduzieren lassen.

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

type ShapeId = "becher" | "vase" | "schale" | "krug";
type BackgroundId = "ruhig" | "unruhig" | "kontrastarm";

export type SyntheticScene = {
  id: string;
  label: string;
  shape: ShapeId;
  background: BackgroundId;
  glaze: { color: string; roughness: number };
  /** Leicht verdrehte Kamera, wie bei einem freihändigen Foto. */
  rollDeg?: number;
};

const GLOSSY_BROWN = { color: "#8a4f33", roughness: 0.22 };
const MATTE_CLAY = { color: "#b9805c", roughness: 0.85 };
const DARK_GLAZE = { color: "#2b2622", roughness: 0.3 };
const SAGE_GLAZE = { color: "#8fa382", roughness: 0.4 };
const WHITE_GLAZE = { color: "#efebe4", roughness: 0.35 };

export const SYNTHETIC_SCENES: SyntheticScene[] = [
  { id: "s01-becher-ruhig", label: "Becher, ruhig, glänzend", shape: "becher", background: "ruhig", glaze: GLOSSY_BROWN },
  { id: "s02-vase-ruhig", label: "Vase, ruhig, matt", shape: "vase", background: "ruhig", glaze: MATTE_CLAY },
  { id: "s03-schale-ruhig", label: "Schale, ruhig, salbei", shape: "schale", background: "ruhig", glaze: SAGE_GLAZE },
  { id: "s04-krug-ruhig", label: "Krug mit Henkel, ruhig", shape: "krug", background: "ruhig", glaze: GLOSSY_BROWN },
  { id: "s05-becher-unruhig", label: "Becher, unruhiger Hintergrund", shape: "becher", background: "unruhig", glaze: SAGE_GLAZE },
  { id: "s06-vase-unruhig", label: "Vase, unruhiger Hintergrund", shape: "vase", background: "unruhig", glaze: DARK_GLAZE },
  { id: "s07-schale-unruhig", label: "Schale, unruhiger Hintergrund", shape: "schale", background: "unruhig", glaze: MATTE_CLAY },
  { id: "s08-krug-unruhig", label: "Krug mit Henkel, unruhig", shape: "krug", background: "unruhig", glaze: MATTE_CLAY },
  { id: "s09-becher-weiss", label: "Becher, weiß auf weiß", shape: "becher", background: "kontrastarm", glaze: WHITE_GLAZE },
  { id: "s10-vase-weiss", label: "Vase, weiß auf weiß", shape: "vase", background: "kontrastarm", glaze: WHITE_GLAZE },
  { id: "s11-vase-schraeg", label: "Vase, 3° schräg, glänzend", shape: "vase", background: "ruhig", glaze: GLOSSY_BROWN, rollDeg: 3 },
  { id: "s12-krug-dunkel", label: "Krug, dunkle Glasur, ruhig", shape: "krug", background: "ruhig", glaze: DARK_GLAZE },
];

// Außenkonturen als [Radius, Höhe] in cm, vom Fuß nach oben.
const OUTER_PROFILES: Record<ShapeId, [number, number][]> = {
  becher: [[3.3, 0], [3.6, 0.4], [3.75, 3], [3.85, 6.5], [4.0, 9.5]],
  vase: [[2.9, 0], [3.4, 1.2], [4.9, 4.2], [5.1, 5.6], [4.2, 8.2], [2.5, 10.8], [2.3, 11.8], [2.8, 13]],
  schale: [[2.6, 0], [3.2, 0.5], [5.4, 2.2], [6.8, 4.2], [7.4, 6]],
  krug: [[3.4, 0], [4.0, 1.0], [4.7, 3.6], [4.6, 6.5], [4.0, 9], [4.2, 10.5]],
};

const WALL_THICKNESS = 0.35;
const LIP_RISE_CM = 0.06;

/** Gefäßhöhe einer Szene in mm (Fuß bis Lippe) – Maßstab für die mm-Abweichung. */
export const getSceneHeightMm = (scene: SyntheticScene) => {
  const profile = OUTER_PROFILES[scene.shape];
  return Math.round((profile[profile.length - 1][1] + LIP_RISE_CM) * 100) / 10;
};

const mulberry32 = (seed: number) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const hashSeed = (text: string) =>
  [...text].reduce((hash, char) => (Math.imul(hash, 31) + char.charCodeAt(0)) | 0, 7);

const buildVesselGeometry = (shape: ShapeId) => {
  const outer = new THREE.SplineCurve(
    OUTER_PROFILES[shape].map(([radius, y]) => new THREE.Vector2(radius, y)),
  ).getPoints(80);
  const top = outer[outer.length - 1];
  const inner = outer
    .slice()
    .reverse()
    .filter((point) => point.y > WALL_THICKNESS * 1.5)
    .map((point) => new THREE.Vector2(Math.max(0.01, point.x - WALL_THICKNESS), point.y));

  // Geschlossener Querschnitt: Boden → Außenwand → Lippe → Innenwand → Innenboden.
  const section = [
    new THREE.Vector2(0.001, 0),
    ...outer,
    new THREE.Vector2(top.x - WALL_THICKNESS / 2, top.y + LIP_RISE_CM),
    ...inner,
    new THREE.Vector2(0.001, WALL_THICKNESS * 1.5),
  ];
  return { geometry: new THREE.LatheGeometry(section, 160), height: top.y, maxRadius: Math.max(...outer.map((p) => p.x)) };
};

const buildHandle = (shape: ShapeId, material: THREE.Material) => {
  if (shape !== "krug") return null;
  // Henkel auf der linken Bildseite, damit die rechte Seite als saubere Arbeitskante bleibt.
  const handle = new THREE.Mesh(new THREE.TorusGeometry(2.0, 0.42, 24, 64, Math.PI * 1.15), material);
  handle.rotation.z = Math.PI / 2 - Math.PI * 0.075;
  handle.position.set(-4.35, 5.6, 0);
  return handle;
};

const buildBusyTexture = (random: () => number) => {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const context = canvas.getContext("2d")!;
  const palette = ["#5b6f8a", "#c9a26b", "#7a3e2e", "#e3d9c8", "#3d4a3a", "#a7b6c2", "#d1785a", "#2e2a26"];
  context.fillStyle = "#d8cfc2";
  context.fillRect(0, 0, 1024, 1024);
  for (let index = 0; index < 70; index += 1) {
    context.fillStyle = palette[Math.floor(random() * palette.length)];
    context.globalAlpha = 0.55 + random() * 0.45;
    context.fillRect(random() * 1024, random() * 1024, 40 + random() * 260, 20 + random() * 200);
  }
  context.globalAlpha = 1;
  for (let index = 0; index < 40; index += 1) {
    context.strokeStyle = palette[Math.floor(random() * palette.length)];
    context.lineWidth = 2 + random() * 8;
    context.beginPath();
    context.moveTo(random() * 1024, random() * 1024);
    context.lineTo(random() * 1024, random() * 1024);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

const addClutter = (scene: THREE.Scene, random: () => number, vesselRadius: number) => {
  const colors = ["#4f6d8f", "#c79a52", "#7d3b2b", "#f0ebe1", "#36463a", "#9aa9b4"];
  for (let index = 0; index < 8; index += 1) {
    const isBox = random() > 0.4;
    const geometry = isBox
      ? new THREE.BoxGeometry(1.5 + random() * 4, 2 + random() * 9, 1.5 + random() * 3)
      : new THREE.CylinderGeometry(0.8 + random() * 1.6, 0.8 + random() * 1.6, 3 + random() * 8, 40);
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: colors[index % colors.length], roughness: 0.6 }),
    );
    geometry.computeBoundingBox();
    const halfHeight = (geometry.boundingBox!.max.y - geometry.boundingBox!.min.y) / 2;
    // Hinter und neben dem Gefäß – Überschneidungen mit der Silhouette sind gewollt.
    const side = index % 2 === 0 ? -1 : 1;
    mesh.position.set(side * (vesselRadius * 0.6 + random() * 9), halfHeight, -4 - random() * 9);
    mesh.rotation.y = random() * Math.PI;
    mesh.castShadow = true;
    scene.add(mesh);
  }
};

export type SyntheticRender = {
  photo: string;
  truth: string;
  width: number;
  height: number;
};

/** Rendert Foto und Sollmaske einer Szene als Data-URLs (Foto JPEG, Maske PNG). */
export const renderSyntheticScene = (
  sceneSpec: SyntheticScene,
  width = 900,
  height = 1200,
): SyntheticRender => {
  const random = mulberry32(hashSeed(sceneSpec.id));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(width, height, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const { geometry, height: vesselHeight, maxRadius } = buildVesselGeometry(sceneSpec.shape);
  const glaze = new THREE.MeshStandardMaterial({
    color: sceneSpec.glaze.color,
    roughness: sceneSpec.glaze.roughness,
  });
  const vessel = new THREE.Group();
  const body = new THREE.Mesh(geometry, glaze);
  body.castShadow = true;
  vessel.add(body);
  const handle = buildHandle(sceneSpec.shape, glaze);
  if (handle) {
    handle.castShadow = true;
    vessel.add(handle);
  }
  scene.add(vessel);

  const isWhite = sceneSpec.background === "kontrastarm";
  const wallMaterial =
    sceneSpec.background === "unruhig"
      ? new THREE.MeshStandardMaterial({ map: buildBusyTexture(random), roughness: 0.9 })
      : new THREE.MeshStandardMaterial({ color: isWhite ? "#f3f1ed" : "#e6dfd4", roughness: 0.95 });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(80, 60), wallMaterial);
  wall.position.set(0, 20, -14);
  wall.receiveShadow = true;
  scene.add(wall);

  const table = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 60),
    new THREE.MeshStandardMaterial({ color: isWhite ? "#ebe8e2" : "#c6b8a4", roughness: 0.8 }),
  );
  table.rotation.x = -Math.PI / 2;
  table.position.z = 10;
  table.receiveShadow = true;
  scene.add(table);

  if (sceneSpec.background === "unruhig") {
    addClutter(scene, random, maxRadius);
  }

  scene.add(new THREE.HemisphereLight("#fff6ea", "#6b5e50", 0.7));
  const sun = new THREE.DirectionalLight("#ffffff", 1.8);
  sun.position.set(-12 + random() * 6, 22, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -20;
  sun.shadow.camera.right = 20;
  sun.shadow.camera.top = 20;
  sun.shadow.camera.bottom = -20;
  scene.add(sun);

  // Handykamera auf halber Gefäßhöhe; das Gefäß füllt etwa 60 % der Bildhöhe.
  const fov = 50;
  const camera = new THREE.PerspectiveCamera(fov, width / height, 0.1, 200);
  const fillHeight = Math.max(vesselHeight, (maxRadius * 2 * height) / width) / 0.6;
  const distance = fillHeight / 2 / Math.tan(THREE.MathUtils.degToRad(fov / 2));
  camera.position.set(0, vesselHeight / 2, distance);
  camera.lookAt(0, vesselHeight / 2, 0);
  camera.rotateZ(THREE.MathUtils.degToRad(sceneSpec.rollDeg ?? 0));

  renderer.render(scene, camera);
  const photo = canvas.toDataURL("image/jpeg", 0.92);

  // Sollmaske: nur das Gefäß, weiß auf schwarz, ohne Tonemapping.
  const truthMaterial = new THREE.MeshBasicMaterial({ color: "#ffffff" });
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.visible = object === body || object === handle;
      if (object.visible) object.material = truthMaterial;
    }
  });
  scene.environment = null;
  scene.background = new THREE.Color("#000000");
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.render(scene, camera);
  const truth = canvas.toDataURL("image/png");

  renderer.dispose();
  pmrem.dispose();
  return { photo, truth, width, height };
};
