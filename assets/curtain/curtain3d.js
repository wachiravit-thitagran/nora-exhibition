/* ม่านทอง AI NORA — Three.js/WebGL
 *
 * ลักษณะผ้าอ้างอิงจาก INTRO_AINORA_.mp4 ช่วง 00:05.5–00:10.0:
 * ใช้เฟรมม่านปิดจริงเป็น texture แล้วดัดผ้า/รวบลอนด้วย vertex shader
 * ระหว่างเปิดขยับเฉพาะ uniform บน GPU ไม่แก้ geometry หรือวาด CSS ใหม่ทุกเฟรม
 */
(function(){
  'use strict';

  const curtain = document.getElementById('curtain');
  const canvas = document.getElementById('curtain-canvas');
  const THREE = window.exports;
  const DURATION = 3400;
  const api = window.__CURTAIN3D = {
    ready:false,
    playing:false,
    progress:0,
    duration:DURATION,
    reset(){},
    open(){},
    finish(){},
    render(){},
  };

  if(!curtain || !canvas || !THREE || !THREE.WebGLRenderer) return;

  let renderer;
  try{
    const arm = /(?:arm|aarch64)/i.test(navigator.userAgent + ' ' + navigator.platform);
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha:true,
      antialias:!arm,
      powerPreference:'high-performance',
      premultipliedAlpha:false,
    });
  }catch(error){
    curtain.classList.add('webgl-failed');
    return;
  }

  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(54, 16 / 9, 0.1, 100);
  const CAM_Z = 5;
  const CLOTH_H = 9;
  camera.position.set(0, 0, CAM_Z);

  const texture = new THREE.TextureLoader().load(
    'assets/curtain/curtain-plate.jpg',
    () => render(),
    undefined,
    () => curtain.classList.add('curtain-texture-failed')
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const VERTEX = `
    uniform float uOpen;
    uniform float uFolds;
    uniform float uDepth;
    uniform float uGather;
    uniform float uBunch;
    uniform float uSway;
    uniform float uSide;
    uniform float uHalf;
    uniform float uClothH;

    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying float vEdge;

    const float TAU = 6.28318530718;

    void main(){
      vUv = uv;
      float u = uSide < 0.0 ? 1.0 - uv.x : uv.x;
      vEdge = u;

      /* รางด้านบนถูกดึงก่อน ชายล่างหนักจึงตามช้า เกิดช่องเปิดทรง V กลับหัว
         แบบเดียวกับเฟรม 7.0–9.0 วินาทีของคลิป ไม่ใช่ช่องสี่เหลี่ยมตรง ๆ */
      float openExponent = mix(4.20, 1.0, pow(uv.y, 0.82));
      /* ช่วงท้ายแรงดึงชนะน้ำหนักผ้า ชายล่างจึงเร่งตามขึ้นมาทันในเวลาอันสั้น */
      float catchUp = smoothstep(0.55, 0.86, uOpen);
      float finishExponent = mix(0.22, 0.45, uv.y);
      float localOpen = pow(max(uOpen, 0.0001), mix(openExponent, finishExponent, catchUp));
      float widthNow = mix(1.0, uGather, localOpen);
      float x = (1.0 - (1.0 - u) * widthNow) * uHalf * uSide;

      float foldWidth = (uHalf * widthNow) / uFolds;
      float amplitude = uDepth * foldWidth * mix(1.0, uBunch, uOpen);
      float phase = u * uFolds * TAU;
      phase += sin(uv.y * 2.3 + u * 7.0) * 0.32;
      phase += (1.0 - uv.y) * localOpen * 1.35;
      /* เฟรมปิดต้องเป็น plate ตรงพิกเซล จึงค่อยเพิ่มความลึกเมื่อผ้าเริ่มขยับ */
      amplitude *= localOpen;
      float z = amplitude * cos(phase);

      /* ชายผ้าหนักและตามแรงดึงช้ากว่าส่วนบน */
      float lower = (1.0 - uv.y) * (1.0 - uv.y);
      x -= uSide * uSway * uHalf * localOpen * lower;
      float y = (uv.y - 0.5) * uClothH;

      float dzdu = -amplitude * sin(phase) * uFolds * TAU;
      float dxdu = widthNow * uHalf * uSide;
      vNormal = normalize(vec3(dzdu, 0.0, -dxdu) * (-uSide));

      vec3 p = vec3(x, y, z);
      vPosition = p;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }
  `;

  const FRAGMENT = `
    uniform sampler2D uPlate;
    uniform vec3 uWarm;
    uniform vec3 uDark;
    uniform float uOpen;
    uniform float uSide;
    uniform float uTexY;
    uniform float uRepeat;

    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying float vEdge;

    float wrapDiffuse(vec3 n, vec3 l, float amount){
      return clamp((dot(n, l) + amount) / (1.0 + amount), 0.0, 1.0);
    }

    void main(){
      vec3 n = normalize(vNormal);
      vec3 viewDirection = normalize(cameraPosition - vPosition);
      vec3 lightA = normalize(vec3(-0.92, 0.30, 0.46));
      vec3 lightB = normalize(vec3( 0.88, 0.12, 0.38));
      float diffuseA = wrapDiffuse(n, lightA, 0.34);
      float diffuseB = wrapDiffuse(n, lightB, 0.34);
      float sheenA = pow(max(dot(n, normalize(lightA + viewDirection)), 0.0), 20.0);
      float sheenB = pow(max(dot(n, normalize(lightB + viewDirection)), 0.0), 11.0);

      float baseX = 0.5 + uSide * vEdge * 0.5;
      float textureX = fract((baseX + 1.0) * uRepeat);
      float textureY = 0.5 + (vUv.y - 0.5) * uTexY;
      vec3 plate = texture2D(uPlate, vec2(textureX, textureY)).rgb;

      vec3 procedural = mix(uDark, uWarm,
        clamp(diffuseA * 0.86 + diffuseB * 0.42, 0.0, 1.0));
      procedural += uWarm * (sheenA * 0.62 + sheenB * 0.26);

      /* เฟรมปิดใช้สีจากวิดีโอตรง ๆ พอเริ่มรวบจึงเติมแสงตามผิวใหม่ */
      float relight = clamp(diffuseA * 0.90 + diffuseB * 0.50 + sheenA * 0.50,
                            0.76, 1.42);
      vec3 color = mix(plate, plate * relight, uOpen * 0.52);
      color = mix(color, procedural, uOpen * 0.06);
      color *= mix(1.0, 0.72, smoothstep(0.58, 1.0, vEdge) * uOpen);
      gl_FragColor = vec4(color, 1.0);
      #include <colorspace_fragment>
    }
  `;

  const shared = {
    uOpen:{ value:0 },
    uFolds:{ value:12 },
    uDepth:{ value:0.24 },
    uGather:{ value:0.075 },
    uBunch:{ value:2.1 },
    uSway:{ value:0.055 },
    uHalf:{ value:4.2 },
    uClothH:{ value:CLOTH_H },
    uPlate:{ value:texture },
    uWarm:{ value:new THREE.Color('#F0D081') },
    uDark:{ value:new THREE.Color('#4E3711') },
    uTexY:{ value:1.77 },
    uRepeat:{ value:1 },
  };

  function createPanel(side){
    const uniforms = {};
    for(const key in shared) uniforms[key] = shared[key];
    uniforms.uSide = { value:side };
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader:VERTEX,
      fragmentShader:FRAGMENT,
      side:THREE.DoubleSide,
      transparent:false,
    });
    const geometry = new THREE.PlaneGeometry(1, 1, 240, 28);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    return mesh;
  }
  createPanel(-1);
  createPanel(1);

  let lastAspect = 0;
  function resize(){
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    const aspect = width / height;
    if(Math.abs(aspect - lastAspect) < 0.001 && canvas.width && canvas.height) return;
    lastAspect = aspect;

    const glMax = renderer.capabilities.maxTextureSize || 4096;
    const arm = /(?:arm|aarch64)/i.test(navigator.userAgent + ' ' + navigator.platform);
    const targetH = arm ? 720 : 1080;
    const renderW = Math.min(glMax, Math.round(targetH * aspect));
    const renderH = Math.max(1, Math.round(renderW / aspect));
    renderer.setPixelRatio(1);
    renderer.setSize(renderW, renderH, false);

    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    const halfHeight = Math.tan(camera.fov * Math.PI / 360) * CAM_Z;
    shared.uHalf.value = halfHeight * aspect;
    shared.uTexY.value = CLOTH_H / (2 * halfHeight);
    const referenceScale = Math.max(1, aspect / (16 / 9));
    shared.uFolds.value = 12 * referenceScale;
    shared.uRepeat.value = referenceScale;
  }

  function referenceCurve(t){
    /* จุดวัดจากขอบม่านในคลิปช่วง 6.5–9.9 วินาที */
    const points = [
      [0.00, 0.000], [0.10, 0.012], [0.24, 0.095], [0.43, 0.300],
      [0.62, 0.555], [0.80, 0.790], [0.93, 0.945], [1.00, 1.000],
    ];
    for(let i = 1; i < points.length; i++){
      if(t <= points[i][0]){
        const a = points[i - 1], b = points[i];
        let k = (t - a[0]) / (b[0] - a[0]);
        k = k * k * (3 - 2 * k);
        return a[1] + (b[1] - a[1]) * k;
      }
    }
    return 1;
  }

  let startedAt = 0;
  let frame = 0;
  function render(){
    resize();
    renderer.render(scene, camera);
  }

  function setProgress(value){
    api.progress = Math.max(0, Math.min(1, value));
    shared.uOpen.value = referenceCurve(api.progress);
    camera.position.z = CAM_Z - 0.28 * shared.uOpen.value;
    render();
  }

  function tick(now){
    if(!api.playing) return;
    setProgress((now - startedAt) / DURATION);
    if(api.progress >= 1){
      api.playing = false;
      frame = 0;
      return;
    }
    frame = requestAnimationFrame(tick);
  }

  api.reset = function(){
    api.playing = false;
    if(frame) cancelAnimationFrame(frame);
    frame = 0;
    setProgress(0);
  };
  api.open = function(lag){
    if(frame) cancelAnimationFrame(frame);
    const elapsed = Math.max(0, Math.min(DURATION, Number(lag) || 0));
    startedAt = performance.now() - elapsed;
    api.playing = elapsed < DURATION;
    setProgress(elapsed / DURATION);
    if(api.playing) frame = requestAnimationFrame(tick);
  };
  api.finish = function(){
    api.playing = false;
    if(frame) cancelAnimationFrame(frame);
    frame = 0;
    setProgress(1);
  };
  api.render = render;
  api.ready = true;

  curtain.classList.add('webgl');
  addEventListener('resize', render, { passive:true });
  document.addEventListener('visibilitychange', () => {
    if(document.hidden || !api.playing) return;
    startedAt = performance.now() - api.progress * DURATION;
  });
  api.reset();
})();
