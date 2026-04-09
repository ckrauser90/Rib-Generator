"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Point, ToolHole } from "../lib/contour";

type Rib3DPreviewProps = {
  outline: Point[];
  holes: ToolHole[];
  thicknessMm: number;
};

const buildHolePath = (hole: ToolHole, segments = 32) => {
  const path = new THREE.Path();

  for (let index = 0; index <= segments; index += 1) {
    const angle = (Math.PI * 2 * index) / segments;
    const x = hole.center.x + Math.cos(angle) * hole.radius;
    const y = hole.center.y + Math.sin(angle) * hole.radius;

    if (index === 0) {
      path.moveTo(x, y);
    } else {
      path.lineTo(x, y);
    }
  }

  path.closePath();
  return path;
};

export function Rib3DPreview({ outline, holes, thicknessMm }: Rib3DPreviewProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mountNode = mountRef.current;
    if (!mountNode || outline.length < 3) {
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#EDE7DD");

    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 2000);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mountNode.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.target.set(0, 0, 0);

    const ambientLight = new THREE.HemisphereLight("#fff6eb", "#cfb397", 1.15);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight("#ffffff", 1.15);
    keyLight.position.set(90, -120, 160);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight("#ffd1ad", 0.7);
    rimLight.position.set(-80, 60, 110);
    scene.add(rimLight);

    const shapePoints = outline.map((point) => new THREE.Vector2(point.x, -point.y));
    const shape = new THREE.Shape(shapePoints);
    shape.autoClose = true;
    shape.holes = holes.map((hole) => buildHolePath({
      center: { x: hole.center.x, y: -hole.center.y },
      radius: hole.radius,
    }));

    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: thicknessMm,
      bevelEnabled: false,
      curveSegments: 24,
      steps: 1,
    });
    geometry.center();

    const material = new THREE.MeshStandardMaterial({
      color: "#f2f0eb",
      roughness: 0.64,
      metalness: 0.04,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -0.22;
    mesh.rotation.y = 0.62;
    scene.add(mesh);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 22),
      new THREE.LineBasicMaterial({ color: "#cf5d27" }),
    );
    edges.rotation.copy(mesh.rotation);
    scene.add(edges);

    // Position camera to fit geometry — based on bounding sphere
    geometry.computeBoundingSphere();
    const radius = geometry.boundingSphere?.radius ?? 80;
    const distance = radius * 3.2;
    camera.position.set(distance * 0.7, -distance * 0.5, distance);
    camera.near = distance * 0.01;
    camera.far = distance * 10;
    controls.minDistance = radius * 1.2;
    controls.maxDistance = radius * 8;

    const fit = () => {
      const width = Math.max(1, mountNode.clientWidth);
      const height = Math.max(1, mountNode.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    fit();
    const resizeObserver = new ResizeObserver(() => fit());
    resizeObserver.observe(mountNode);

    let frameId = 0;
    const render = () => {
      controls.update();
      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(render);
    };
    render();

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      controls.dispose();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mountNode) {
        mountNode.removeChild(renderer.domElement);
      }
    };
  }, [holes, outline, thicknessMm]);

  return <div ref={mountRef} style={{ width: "100%", height: "100%" }} />;
}
