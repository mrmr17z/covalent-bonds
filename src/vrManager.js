// ============================================================================
//  مدير الواقع الافتراضي — المُصيِّر، جلسة WebXR (immersive-vr)، وحدات تحكم Quest
//  Touch، تتبع اليدين الاختياري، وشعاع التأشير لكل يد.
// ============================================================================
import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';

export class VRManager extends EventTarget {
  constructor(container) {
    super();
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.xr.enabled = true;
    this.renderer.xr.setReferenceSpaceType('local-floor');
    this.renderer.xr.setFoveation(0.6);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.03, 60);
    this.rig = new THREE.Group();
    this.rig.name = 'PlayerRig';
    this.rig.add(this.camera);
    this.scene.add(this.rig);

    this.session = null;
    this.support = { checked: false, supported: false, reason: '' };
    this.controllers = [];
    this._setupControllers();

    window.addEventListener('resize', () => {
      if (this.renderer.xr.isPresenting) return;
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  get presenting() { return this.renderer.xr.isPresenting; }

  async checkSupport() {
    const s = this.support;
    s.checked = true;
    if (!window.isSecureContext) {
      s.supported = false;
      s.reason = 'الصفحة ليست في سياق آمن. يتطلب WebXR فتح الصفحة عبر HTTPS أو http://localhost.';
      return s;
    }
    if (!('xr' in navigator)) {
      s.supported = false;
      s.reason = 'هذا المتصفح لا يدعم WebXR. استخدم متصفح Meta Quest Browser على Quest 3.';
      return s;
    }
    try {
      s.supported = await navigator.xr.isSessionSupported('immersive-vr');
      s.reason = s.supported ? '' : 'المتصفح يدعم WebXR لكن لا يوجد جهاز واقع افتراضي متصل يدعم immersive-vr.';
    } catch (e) {
      s.supported = false;
      s.reason = 'تعذر التحقق من دعم الواقع الافتراضي: ' + (e.message || e);
    }
    return s;
  }

  /** يجب استدعاؤها مباشرة من حدث نقرة المستخدم */
  async enterVR() {
    if (this.session) return this.session;
    const init = {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['bounded-floor', 'hand-tracking', 'layers'],
    };
    const session = await navigator.xr.requestSession('immersive-vr', init);
    session.addEventListener('end', () => {
      this.session = null;
      this.dispatchEvent(new Event('sessionend'));
    });
    await this.renderer.xr.setSession(session);
    this.session = session;
    // محاولة رفع معدل الإطارات إلى 90Hz إذا سمح الجهاز
    try {
      const rates = session.supportedFrameRates;
      if (rates && session.updateTargetFrameRate) {
        const target = [...rates].includes(90) ? 90 : Math.max(...rates);
        session.updateTargetFrameRate(target).catch(() => {});
      }
    } catch (e) { /* اختياري */ }
    this.dispatchEvent(new Event('sessionstart'));
    return session;
  }

  exitVR() { this.session?.end(); }

  _setupControllers() {
    const modelFactory = new XRControllerModelFactory();
    const handFactory = new XRHandModelFactory();
    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
    for (let i = 0; i < 2; i++) {
      const controller = this.renderer.xr.getController(i);
      const grip = this.renderer.xr.getControllerGrip(i);
      const hand = this.renderer.xr.getHand(i);
      grip.add(modelFactory.createControllerModel(grip));
      try { hand.add(handFactory.createHandModel(hand, 'spheres')); } catch (e) { /* اختياري */ }
      const lineMat = new THREE.LineBasicMaterial({ color: 0x7fd4ff, transparent: true, opacity: 0.75 });
      const line = new THREE.Line(lineGeo, lineMat);
      line.scale.z = 2.5;
      line.name = 'ray';
      controller.add(line);
      const cursor = new THREE.Mesh(new THREE.RingGeometry(0.006, 0.011, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true }));
      cursor.renderOrder = 999;
      cursor.visible = false;
      this.scene.add(cursor);
      const entry = { index: i, controller, grip, hand, line, cursor, inputSource: null, handedness: 'none', connected: false };
      controller.addEventListener('connected', (e) => {
        entry.inputSource = e.data; entry.handedness = e.data.handedness; entry.connected = true;
        entry.isHand = !!e.data.hand;
        line.visible = true;
        this.dispatchEvent(new CustomEvent('controllerconnected', { detail: entry }));
      });
      controller.addEventListener('disconnected', () => {
        entry.connected = false; entry.inputSource = null; line.visible = false; cursor.visible = false;
        this.dispatchEvent(new CustomEvent('controllerdisconnected', { detail: entry }));
      });
      this.rig.add(controller, grip, hand);
      this.controllers.push(entry);
    }
  }

  /** إرجاع وحدة التحكم حسب اليد */
  byHand(h) { return this.controllers.find(c => c.connected && c.handedness === h) || null; }
}
