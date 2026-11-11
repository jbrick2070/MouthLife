// Shared lighting for the enamel and gingiva passes. Colors match the dark oral backdrop.
export const ORAL_LIGHTING_GLSL = /* glsl */ `
  uniform vec4 uHeadlamp;
  uniform vec2 uDepthCue;
  uniform int uDetail;
  uniform float uMotionTime;

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
`;
