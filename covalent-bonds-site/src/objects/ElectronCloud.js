// ============================================================================
//  السحب الإلكترونية — Shader خفيف (بدون Post-processing) يمثّل مناطق احتمال
//  وجود الإلكترونات: كثافة غاوسية قابلة للإزاحة على طول المحور X المحلي،
//  ولون يتدرّج مع الكثافة، وحركة ناعمة غير عشوائية.
// ============================================================================
import * as THREE from 'three';

export const cloudTime = { value: 0 };
const geo = new THREE.SphereGeometry(1, 40, 28);
geo.userData.shared = true;

const vert = /* glsl */`
  varying vec3 vLocal;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vLocal = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const frag = /* glsl */`
  uniform vec3 uLow;
  uniform vec3 uHigh;
  uniform float uTime;
  uniform float uShift;    // موضع مركز الكثافة على المحور X المحلي (−1..1)
  uniform float uWidth;    // عرض توزيع الكثافة
  uniform float uOpacity;
  uniform float uBase;     // كثافة أساسية موحدة
  varying vec3 vLocal;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float facing = abs(dot(vN, vV));               // أكثف في المركز البصري
    float x = vLocal.x - uShift;
    float dens = exp(-(x * x) / (uWidth * uWidth));
    float wave = 0.5 + 0.5 * sin(vLocal.y * 7.0 + uTime * 1.4) * sin(vLocal.z * 6.0 - uTime * 1.1);
    float d = clamp(uBase + (1.0 - uBase) * dens, 0.0, 1.0);
    float a = uOpacity * d * (0.25 + 0.75 * pow(facing, 1.6)) * (0.88 + 0.12 * wave);
    vec3 col = mix(uLow, uHigh, d);
    col += 0.08 * wave * uHigh;
    gl_FragColor = vec4(col, a);
  }
`;

export function createCloudMaterial({ low = 0x3fa9ff, high = 0xff4fd8, opacity = 0.5, width = 0.6, base = 0.25, shift = 0 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uLow: { value: new THREE.Color(low) },
      uHigh: { value: new THREE.Color(high) },
      uTime: cloudTime,
      uShift: { value: shift },
      uWidth: { value: width },
      uOpacity: { value: opacity },
      uBase: { value: base },
    },
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
  });
}

/** سحابة إلكترونية: إهليلج بين نقطتين أو كرة حول ذرة */
export class ElectronCloud extends THREE.Mesh {
  constructor(opts = {}) {
    super(geo, createCloudMaterial(opts));
    this.renderOrder = 5;
    this.baseScale = new THREE.Vector3(1, 1, 1);
    this.phase = Math.random() * 6.28;
    this.targetShift = opts.shift || 0;
    this.targetOpacity = opts.opacity ?? 0.5;
  }
  /** يمد السحابة بين نقطتين (في فضاء الأب) بنصف قطر عرضي r */
  spanBetween(a, b, r, extra = 0.02) {
    const d = b.clone().sub(a);
    const L = d.length();
    this.position.copy(a).add(b).multiplyScalar(0.5);
    this.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.normalize());
    this.baseScale.set(L / 2 + extra + r * 0.6, r, r);
    this.scale.copy(this.baseScale);
  }
  setShift(s) { this.targetShift = s; }
  setOpacity(o) { this.targetOpacity = o; }
  update(dt, t) {
    const u = this.material.uniforms;
    u.uShift.value += (this.targetShift - u.uShift.value) * Math.min(1, dt * 6);
    u.uOpacity.value += (this.targetOpacity - u.uOpacity.value) * Math.min(1, dt * 5);
    const br = 1 + 0.025 * Math.sin(t * 1.6 + this.phase);
    this.scale.set(this.baseScale.x * br, this.baseScale.y * (2 - br), this.baseScale.z * br);
    this.visible = u.uOpacity.value > 0.005;
  }
}
