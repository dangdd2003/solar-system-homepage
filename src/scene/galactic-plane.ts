import { BackSide, Mesh, ShaderMaterial, SphereGeometry } from "three";
import { SIMPLEX_3D_GLSL } from "./noise-glsl";

const GALACTIC_VERT = /* glsl */ `
varying vec3 vDir;

void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

function getGalacticFrag(octaves: number): string {
  const safeOctaves = Math.max(1, Math.min(6, Math.floor(octaves)));
  return /* glsl */ `
varying vec3 vDir;
${SIMPLEX_3D_GLSL}

float fbm(vec3 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < ${safeOctaves}; i++) {
    sum += amp * snoise(p);
    p *= 2.05;
    amp *= 0.5;
  }
  return sum;
}

void main() {
  // Rotate local sphere coords into Galactic Coordinates (tilted ~60 deg to ecliptic)
  // Axis: normalize(vec3(-0.4, 0.9, -0.2)), angle: ~1.05 rad
  mat3 rTilt = mat3(
     0.88,  0.44, -0.18,
    -0.45,  0.89,  0.03,
     0.17,  0.05,  0.98
  );
  vec3 gDir = normalize(rTilt * vDir);

  // Galactic latitude: distance from equator
  float lat = abs(gDir.y);
  // Galactic longitude
  float lon = atan(gDir.z, gDir.x);

  // 1. Disc Gaussian falloff
  float disc = exp(-pow(lat / 0.16, 2.0));

  // 2. Central Galactic Core Bulge (centered around lon = 0, lat = 0)
  float core = exp(-pow(length(vec2(lon, lat * 1.5)) / 0.55, 2.0));

  // 3. Simplex noise dust lanes
  vec3 np = gDir * 3.5;
  float dust = fbm(np + vec3(1.7, 3.2, 0.5));
  float rift = smoothstep(0.1, 0.65, 0.5 + 0.5 * dust);

  // Combine components into soft, low-contrast neutral monochrome glow
  float intensity = (disc * 0.22 + core * 0.28) * rift;
  intensity = clamp(intensity, 0.0, 0.35);

  gl_FragColor = vec4(vec3(intensity), 1.0);
}
`;
}

export function buildGalacticSkybox(
  radius = 400,
  octaves = 4
): {
  mesh: Mesh;
  material: ShaderMaterial;
} {
  const geo = new SphereGeometry(radius, 48, 32);
  const material = new ShaderMaterial({
    vertexShader: GALACTIC_VERT,
    fragmentShader: getGalacticFrag(octaves),
    side: BackSide,
    depthWrite: false,
    fog: false
  });
  const mesh = new Mesh(geo, material);
  // Drawn after the other opaque meshes (still before every transparent one), so the depth
  // test rejects sky fragments hidden behind planets instead of shading them first.
  mesh.renderOrder = 1;
  return { mesh, material };
}
