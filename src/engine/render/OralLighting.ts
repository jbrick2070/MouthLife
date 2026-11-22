import * as THREE from 'three';

/**
 * A dive's sun. It sits low on the far side of the tooth, a little to the left, where the stage's
 * dusk sky glows: shadows fall toward the player (where they can be seen, instead of hiding behind
 * what cast them) and clean enamel catches a sheen. Points from the ground toward the sun.
 */
export const DIVE_KEY_DIRECTION = new THREE.Vector3(-0.25, 0.7, -0.67).normalize();
/** A dive's soft fill light, from the camera's side, so near faces never go black. */
export const DIVE_FILL_DIRECTION = new THREE.Vector3(0.4, 0.8, 0.45).normalize();

const glslVec3 = (v: THREE.Vector3): string => `vec3(${v.x.toFixed(5)}, ${v.y.toFixed(5)}, ${v.z.toFixed(5)})`;

/**
 * The uniforms `ORAL_LIGHTING_GLSL` needs for a dive's look. Everything starts off, so a material
 * that never hears from SceneManager draws exactly as it did before.
 */
export function createSunUniforms(): {
  uSunShadowMap: { value: THREE.Texture | null };
  uSunShadowMatrix: { value: THREE.Matrix4 };
  uSunShadow: { value: THREE.Vector4 };
  uDiveLook: { value: number };
} {
  return {
    uSunShadowMap: { value: null },
    uSunShadowMatrix: { value: new THREE.Matrix4() },
    uSunShadow: { value: new THREE.Vector4(0, 0, 0, 0) },
    uDiveLook: { value: 0 },
  };
}

// Shared lighting for the enamel and gingiva passes. Colors match the dark oral backdrop.
export const ORAL_LIGHTING_GLSL = /* glsl */ `
  uniform vec4 uHeadlamp;
  uniform vec2 uDepthCue;
  uniform int uDetail;
  uniform float uMotionTime;

  // Sun shadows (see SunShadowPass.ts). uSunShadow = (darkness, one texel in uv, tap spread, depth bias).
  uniform sampler2DShadow uSunShadowMap;
  uniform mat4 uSunShadowMatrix;
  uniform vec4 uSunShadow;
  // 1 during a dive: the far-side sun and film-style colour. 0 everywhere else (nothing changes).
  uniform float uDiveLook;

  const vec3 DIVE_KEY_DIR = ${glslVec3(DIVE_KEY_DIRECTION)};
  const vec3 DIVE_FILL_DIR = ${glslVec3(DIVE_FILL_DIRECTION)};

  // The key and fill light directions: a dive's own, or the caller's usual ones elsewhere.
  vec3 keyLightDir(vec3 elsewhere) {
    return uDiveLook > 0.5 ? DIVE_KEY_DIR : elsewhere;
  }
  vec3 fillLightDir(vec3 elsewhere) {
    return uDiveLook > 0.5 ? DIVE_FILL_DIR : elsewhere;
  }

  vec3 safeUnit(vec3 v) {
    return v * inversesqrt(max(dot(v, v), 0.000001));
  }

  vec3 headlamp(vec3 p, vec3 n) {
    vec3 toLight = mix(cameraPosition, uHeadlamp.xyz, uHeadlamp.w) - p;
    float range = mix(22.0, 3.4, uHeadlamp.w);
    float falloff = 1.0 / (1.0 + dot(toLight, toLight) / (range * range));
    float facing = clamp(dot(n, safeUnit(toLight)), 0.0, 1.0);
    vec3 tint = mix(vec3(0.18, 0.43, 0.62), vec3(1.0, 0.76, 0.50), falloff);
    return tint * falloff * (0.12 + 0.44 * facing);
  }

  vec3 attenuateOralLight(vec3 color, vec3 p) {
    float beyond = max(0.0, distance(cameraPosition, p) - uDepthCue.x);
    float transmission = exp2(-beyond * uDepthCue.y);
    return mix(vec3(0.045, 0.095, 0.145), color, transmission);
  }

  float sunTap(vec3 sc, vec2 offset) {
    return texture(uSunShadowMap, vec3(sc.xy + offset * (uSunShadow.y * uSunShadow.z), sc.z));
  }

  // How much direct sun reaches p: 1 = fully lit, 0 = in a cast shadow. n is the surface's true normal.
  float sunVisibility(vec3 p, vec3 n) {
    if (uSunShadow.x <= 0.0) return 1.0;
    float ndl = dot(n, DIVE_KEY_DIR);
    // A face turned away from the sun sits in its own soft shade, much lighter than a cast shadow.
    float selfShade = mix(0.6, 1.0, smoothstep(-0.05, 0.25, ndl));
    vec3 sc = (uSunShadowMatrix * vec4(p + n * 0.07, 1.0)).xyz;
    vec2 edge = min(sc.xy, 1.0 - sc.xy);
    // Only faces that look toward the sun take cast shadows (grazing faces would speckle), and the
    // shadows fade out at the edge of the mapped ground instead of ending in a line.
    float receives = smoothstep(0.03, 0.28, ndl) * smoothstep(0.0, 0.05, min(edge.x, edge.y)) * step(sc.z, 1.0);
    if (receives <= 0.0) return selfShade;
    sc.z -= uSunShadow.w;
    // Each tap is already smoothed by the GPU; four on a turned square give a soft, even edge.
    float lit = sunTap(sc, vec2(-0.75, -0.25)) + sunTap(sc, vec2(0.25, -0.75))
              + sunTap(sc, vec2(0.75, 0.25)) + sunTap(sc, vec2(-0.25, 0.75));
    if (uDetail > 1) {
      lit += sunTap(sc, vec2(-1.5, 0.9)) + sunTap(sc, vec2(0.9, 1.5))
           + sunTap(sc, vec2(1.5, -0.9)) + sunTap(sc, vec2(-0.9, -1.5));
      lit *= 0.125;
    } else {
      lit *= 0.25;
    }
    return min(selfShade, mix(1.0, lit, receives));
  }

  // Shade is cool and blue, as it is under an open sky, never plain grey.
  vec3 sunShade(float visibility) {
    return mix(vec3(1.0), vec3(0.50, 0.58, 0.74), uSunShadow.x * (1.0 - visibility));
  }

  // Dark and middling colours pass through untouched. Above the knee, brightness rolls off smoothly
  // toward white, so a clean tooth keeps its shading, shadows and highlights instead of clipping to
  // one flat white. It works on brightness, not on each channel, so a colour keeps its hue: plaque
  // stays its yellow, the seal its gold.
  vec3 filmTone(vec3 c) {
    if (uDiveLook <= 0.0) return c;
    const float KNEE = 0.72;
    float lum = dot(c, vec3(0.30, 0.50, 0.20));
    if (lum <= KNEE) return c;
    float over = (lum - KNEE) / (1.0 - KNEE);
    float mapped = KNEE + (1.0 - KNEE) * (1.0 - exp(-over));
    return c * (mapped / lum);
  }
`;
