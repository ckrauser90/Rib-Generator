"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createRibExtrudeGeometry, type Point, type ToolHole } from "../lib/contour";

type Rib3DPreviewProps = {
  outline: Point[];
  holes: ToolHole[];
  thicknessMm: number;
  className?: string;
};

const createRenderer = () => {
  try {
    return new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
  } catch {
    return new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: "default",
    });
  }
};

export function Rib3DPreview({ outline, holes, thicknessMm, className }: Rib3DPreviewProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [isUnavailable, setIsUnavailable] = useState(false);

  useEffect(() => {
    const mountNode = mountRef.current;
    if (!mountNode || outline.length < 3) {
      return;
    }

    let renderer: THREE.WebGLRenderer | null = null;
    let controls: OrbitControls | null = null;
    let geometry: THREE.ExtrudeGeometry | null = null;
    let material: THREE.MeshStandardMaterial | null = null;
    let edgeGeometry: THREE.EdgesGeometry | null = null;
    let edgeMaterial: THREE.LineBasicMaterial | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let frameId = 0;

    try {
      setIsUnavailable(false);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color("#F6F2EC");

      const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 2000);

      renderer = createRenderer();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.display = "block";
      renderer.domElement.style.touchAction = "none";
      mountNode.style.touchAction = "none";
      mountNode.appendChild(renderer.domElement);

      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.enablePan = false;
      controls.enableZoom = true;
      controls.target.set(0, 0, 0);
      controls.touches.ONE = THREE.TOUCH.ROTATE;
      controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;

      const ambientLight = new THREE.HemisphereLight("#fff6eb", "#cfb397", 1.15);
      scene.add(ambientLight);

      const keyLight = new THREE.DirectionalLight("#ffffff", 1.15);
      keyLight.position.set(90, -120, 160);
      scene.add(keyLight);

      const rimLight = new THREE.DirectionalLight("#ffd1ad", 0.7);
      rimLight.position.set(-80, 60, 110);
      scene.add(rimLight);

      geometry = createRibExtrudeGeometry(outline, holes, thicknessMm);
      geometry.center();

      material = new THREE.MeshStandardMaterial({
        color: "#f2f0eb",
        roughness: 0.64,
        metalness: 0.04,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -0.22;
      mesh.rotation.y = 0.62;
      scene.add(mesh);

      edgeGeometry = new THREE.EdgesGeometry(geometry, 22);
      edgeMaterial = new THREE.LineBasicMaterial({ color: "#7A8E6E" });
      const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
      edges.rotation.copy(mesh.rotation);
      scene.add(edges);

      geometry.computeBoundingSphere();
      const radius = geometry.boundingSphere?.radius ?? 80;
      const distance = radius * 3.2;
      camera.position.set(distance * 0.7, -distance * 0.5, distance);
      camera.near = distance * 0.01;
      camera.far = distance * 10;
      controls.minDistance = radius * 1.2;
      controls.maxDistance = radius * 8;

      const fit = () => {
        if (!renderer) return;
        const width = Math.max(1, mountNode.clientWidth);
        const height = Math.max(240, mountNode.clientHeight);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };

      fit();
      resizeObserver = new ResizeObserver(() => fit());
      resizeObserver.observe(mountNode);

      const render = () => {
        if (!renderer || !controls) return;
        controls.update();
        renderer.render(scene, camera);
        frameId = window.requestAnimationFrame(render);
      };
      render();
    } catch {
      setIsUnavailable(true);
    }

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      controls?.dispose();
      geometry?.dispose();
      material?.dispose();
      edgeGeometry?.dispose();
      edgeMaterial?.dispose();
      renderer?.dispose();
      if (renderer?.domElement.parentNode === mountNode) {
        mountNode.removeChild(renderer.domElement);
      }
    };
  }, [holes, outline, thicknessMm]);

  if (isUnavailable) {
    return <div className={className}>3D-Vorschau auf diesem Geraet gerade nicht verfuegbar.</div>;
  }

  return <div ref={mountRef} className={className} style={{ width: "100%", height: "100%" }} />;
}
