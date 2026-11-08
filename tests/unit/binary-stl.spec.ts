import { expect, test } from "@playwright/test";
import * as THREE from "three";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { buildRibToolOutline, createExtrudedStl, createRibExtrudeGeometry } from "../../lib/rib-tool-geometry";

for (const side of ["left", "right"] as const) {
  test(`binary STL preserves the previous ASCII mesh and print orientation (${side})`, () => {
    const profile = Array.from({ length: 96 }, (_, index) => ({
      x: 35 + Math.sin(index / 95 * Math.PI * 1.4) * 12,
      y: index * 2,
    }));
    const buffer = createExtrudedStl(profile, 240, 240, 55, 110, 3, side);
    const binary = new DataView(buffer);
    const triangleCount = binary.getUint32(80, true);
    expect(buffer.byteLength).toBe(84 + 50 * triangleCount);

    // Reference the existing ASCII exporter path so changing file encoding cannot
    // silently change triangulation, winding, bevels, holes or standing orientation.
    const outline = buildRibToolOutline(profile, 240, 240, 55, 110, side);
    const area = outline.outline.reduce((sum, point, index, points) => {
      const next = points[(index + 1) % points.length];
      return sum + point.x * next.y - next.x * point.y;
    }, 0);
    const geometry = createRibExtrudeGeometry(area < 0 ? outline.outline.slice().reverse() : outline.outline, outline.holes, 3);
    geometry.rotateX(-Math.PI / 2);
    geometry.rotateZ(Math.PI);
    geometry.rotateY(Math.PI);
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox!;
    geometry.translate(-bounds.min.x, -bounds.min.y, -bounds.min.z);
    const material = new THREE.MeshNormalMaterial();
    const ascii = new STLExporter().parse(new THREE.Mesh(geometry, material));
    const loader = new STLLoader();
    const previousMesh = loader.parse(ascii);
    const binaryMesh = loader.parse(buffer);
    try {
      expect(triangleCount).toBe(previousMesh.getAttribute("position").count / 3);
      for (const attribute of ["position", "normal"]) {
        const actual = binaryMesh.getAttribute(attribute).array;
        const expected = previousMesh.getAttribute(attribute).array;
        expect(actual.length).toBe(expected.length);
        // ASCII prints -0 as 0; both representations describe the same vector.
        expect(actual.every((value, index) => value === expected[index]), attribute).toBe(true);
      }
      binaryMesh.computeBoundingBox();
      const box = binaryMesh.boundingBox!;
      expect(box.min.x).toBeCloseTo(0, 5);
      expect(box.min.y).toBeCloseTo(0, 5);
      expect(box.min.z).toBeCloseTo(0, 5);
      expect(box.max.z - box.min.z).toBeGreaterThan(box.max.y - box.min.y);
      expect(buffer.byteLength).toBeLessThan(Buffer.byteLength(ascii) / 3);
    } finally {
      geometry.dispose();
      material.dispose();
      previousMesh.dispose();
      binaryMesh.dispose();
    }
  });
}
