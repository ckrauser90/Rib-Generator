"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createRibExtrudeGeometry, type Point, type ToolHole } from "../lib/contour";

type Rib3DPreviewProps = {
  outline: Point[];
  holes: ToolHole[];
  thicknessMm: number;
  bevelStrength?: number;
  className?: string;
};

type PreviewRuntime = {
  updateGeometry: (outline: Point[], holes: ToolHole[], thicknessMm: number, bevelStrength: number) => void;
};

const createRenderer = () => {
  try {
    return new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  } catch {
    return new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "default" });
  }
};

export function Rib3DPreview({ outline, holes, thicknessMm, bevelStrength = 68, className }: Rib3DPreviewProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<PreviewRuntime | null>(null);
  const [isUnavailable, setIsUnavailable] = useState(false);

  // The WebGL context, materials and controls belong to the mounted preview. Parameter
  // changes replace only geometry; they must not create another renderer/context.
  useEffect(() => {
    const mountNode = mountRef.current;
    if (!mountNode) return;

    let renderer: THREE.WebGLRenderer | null = null;
    let controls: OrbitControls | null = null;
    let geometry: THREE.ExtrudeGeometry | null = null;
    let edgeGeometry: THREE.EdgesGeometry | null = null;
    let material: THREE.MeshStandardMaterial | null = null;
    let edgeMaterial: THREE.LineBasicMaterial | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let intersectionObserver: IntersectionObserver | null = null;
    let frameId = 0;
    let inViewport = !window.IntersectionObserver;
    let disposed = false;

    const canRender = () => !disposed && inViewport && !document.hidden && mountNode.clientWidth > 0 && mountNode.clientHeight > 0;
    const cancelFrame = () => {
      window.cancelAnimationFrame(frameId);
      frameId = 0;
    };
    let requestRender = () => {};
    const onVisibilityChange = () => {
      if (canRender()) requestRender();
      else cancelFrame();
    };

    try {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color("#FAF8F5");
      const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 2000);
      const activeRenderer = createRenderer();
      renderer = activeRenderer;
      activeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      activeRenderer.outputColorSpace = THREE.SRGBColorSpace;
      Object.assign(activeRenderer.domElement.style, { width: "100%", height: "100%", display: "block", touchAction: "none" });
      mountNode.style.touchAction = "none";
      mountNode.appendChild(activeRenderer.domElement);

      const activeControls = new OrbitControls(camera, activeRenderer.domElement);
      controls = activeControls;
      activeControls.enableDamping = true;
      activeControls.enablePan = false;
      activeControls.enableZoom = true;
      activeControls.target.set(0, 0, 0);
      activeControls.touches.ONE = THREE.TOUCH.ROTATE;
      activeControls.touches.TWO = THREE.TOUCH.DOLLY_PAN;

      scene.add(new THREE.HemisphereLight("#faf8f5", "#c8d4be", 1.3));
      const keyLight = new THREE.DirectionalLight("#ffffff", 0.9);
      keyLight.position.set(90, -120, 160);
      scene.add(keyLight);
      const rimLight = new THREE.DirectionalLight("#e8f0e4", 0.5);
      rimLight.position.set(-80, 60, 110);
      scene.add(rimLight);

      material = new THREE.MeshStandardMaterial({ color: "#7A8E6E", roughness: 0.82, metalness: 0.0 });
      edgeMaterial = new THREE.LineBasicMaterial({ color: "#5a6e52" });
      let mesh: THREE.Mesh | null = null;
      let edges: THREE.LineSegments | null = null;
      let lastWidth = 0;
      let lastHeight = 0;
      const fit = () => {
        if (!canRender()) return;
        const width = Math.max(1, mountNode.clientWidth);
        const height = Math.max(240, mountNode.clientHeight);
        if (width !== lastWidth || height !== lastHeight) {
          lastWidth = width;
          lastHeight = height;
          activeRenderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        }
      };
      const render = () => {
        frameId = 0;
        if (!canRender()) return;
        fit();
        const changed = activeControls.update();
        activeRenderer.render(scene, camera);
        // OrbitControls emits change while damping is settling. Stop requesting frames
        // when the view is stable; pointer/zoom, resize and geometry updates wake it up.
        if (changed) requestRender();
      };
      requestRender = () => {
        if (!frameId && canRender()) frameId = window.requestAnimationFrame(render);
      };
      activeControls.addEventListener("change", requestRender);
      resizeObserver = new ResizeObserver(onVisibilityChange);
      resizeObserver.observe(mountNode);
      if (window.IntersectionObserver) {
        intersectionObserver = new IntersectionObserver(([entry]) => {
          inViewport = entry.isIntersecting;
          onVisibilityChange();
        });
        intersectionObserver.observe(mountNode);
      }
      document.addEventListener("visibilitychange", onVisibilityChange);

      runtimeRef.current = {
        updateGeometry: (nextOutline, nextHoles, nextThickness, nextBevel) => {
          if (nextOutline.length < 3) return;
          const nextGeometry = createRibExtrudeGeometry(nextOutline, nextHoles, nextThickness, nextBevel);
          let nextEdges: THREE.EdgesGeometry;
          try {
            nextGeometry.center();
            nextEdges = new THREE.EdgesGeometry(nextGeometry, 22);
          } catch (error) {
            nextGeometry.dispose();
            throw error;
          }
          if (mesh) scene.remove(mesh);
          if (edges) scene.remove(edges);
          geometry?.dispose();
          edgeGeometry?.dispose();
          geometry = nextGeometry;
          edgeGeometry = nextEdges;
          mesh = new THREE.Mesh(nextGeometry, material!);
          mesh.rotation.set(-0.22, 0.62, 0);
          edges = new THREE.LineSegments(nextEdges, edgeMaterial!);
          edges.rotation.copy(mesh.rotation);
          scene.add(mesh, edges);

          nextGeometry.computeBoundingSphere();
          const radius = nextGeometry.boundingSphere?.radius ?? 80;
          const distance = radius * 3.2;
          camera.position.set(distance * 0.7, -distance * 0.5, distance);
          camera.near = distance * 0.01;
          camera.far = distance * 10;
          camera.updateProjectionMatrix();
          activeControls.minDistance = radius * 1.2;
          activeControls.maxDistance = radius * 8;
          requestRender();
        },
      };
    } catch {
      setIsUnavailable(true);
    }

    return () => {
      disposed = true;
      runtimeRef.current = null;
      cancelFrame();
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      controls?.removeEventListener("change", requestRender);
      controls?.dispose();
      geometry?.dispose();
      material?.dispose();
      edgeGeometry?.dispose();
      edgeMaterial?.dispose();
      renderer?.dispose();
      if (renderer?.domElement.parentNode === mountNode) mountNode.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    if (!runtimeRef.current) return;
    try {
      runtimeRef.current.updateGeometry(outline, holes, thicknessMm, bevelStrength);
      setIsUnavailable(false);
    } catch {
      setIsUnavailable(true);
    }
  }, [bevelStrength, holes, outline, thicknessMm]);

  useEffect(() => {
    const canvas = mountRef.current?.querySelector("canvas");
    if (canvas) canvas.style.display = isUnavailable ? "none" : "block";
  }, [isUnavailable]);

  return (
    <div ref={mountRef} className={className} style={{ width: "100%", height: "100%" }}>
      {isUnavailable && <span>3D-Vorschau auf diesem Geraet gerade nicht verfuegbar.</span>}
    </div>
  );
}
