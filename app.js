/* ============================================================
   COSMOS — MAIN APPLICATION SCRIPT
   ============================================================ */

'use strict';

// =====================================================================
// 0. UTILITY
// =====================================================================
function lerp(a, b, t) { return a + (b - a) * t; }
function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// =====================================================================
// 1. CUSTOM CURSOR
// =====================================================================
(function initCursor() {
  const dot = document.getElementById('cursor-dot');
  const ring = document.getElementById('cursor-ring');
  let mx = 0, my = 0, rx = 0, ry = 0;

  document.addEventListener('mousemove', e => {
    mx = e.clientX; my = e.clientY;
    dot.style.left = mx + 'px';
    dot.style.top = my + 'px';
  });

  (function animRing() {
    rx = lerp(rx, mx, 0.12);
    ry = lerp(ry, my, 0.12);
    ring.style.left = rx + 'px';
    ring.style.top = ry + 'px';
    requestAnimationFrame(animRing);
  })();

  document.querySelectorAll('.clickable, a, button, input').forEach(el => {
    el.addEventListener('mouseenter', () => { dot.classList.add('cursor-hover'); ring.classList.add('cursor-hover'); });
    el.addEventListener('mouseleave', () => { dot.classList.remove('cursor-hover'); ring.classList.remove('cursor-hover'); });
  });
})();

// =====================================================================
// 2. AUDIO ENGINE
// =====================================================================
const AudioEngine = (function() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  let ambientStarted = false;
  let masterGain;
  let muted = false;
  let ambientNodes = [];

  function startAmbient() {
    if (ambientStarted) return;
    ambientStarted = true;
    masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.18, ctx.currentTime);
    masterGain.connect(ctx.destination);

    // Deep space drone: layered oscillators
    [40, 60, 80, 120].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      osc.frequency.value = freq;
      osc.type = i % 2 === 0 ? 'sine' : 'triangle';
      g.gain.value = 0.08 - i * 0.015;
      filter.type = 'lowpass';
      filter.frequency.value = 300;
      osc.connect(filter);
      filter.connect(g);
      g.connect(masterGain);
      osc.start();
      ambientNodes.push(osc);

      // slow LFO modulation
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 0.05 + i * 0.03;
      lfoGain.gain.value = freq * 0.05;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start();
      ambientNodes.push(lfo);
    });
  }

  function playBlip(type = 'hover') {
    if (muted || !ambientStarted) return;
    try {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      if (type === 'hover') {
        o.frequency.setValueAtTime(880, ctx.currentTime);
        o.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.08);
        g.gain.setValueAtTime(0.06, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
        o.type = 'sine';
        o.start(); o.stop(ctx.currentTime + 0.12);
      } else if (type === 'click') {
        o.frequency.setValueAtTime(440, ctx.currentTime);
        o.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.1);
        g.gain.setValueAtTime(0.1, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        o.type = 'square';
        o.start(); o.stop(ctx.currentTime + 0.15);
      } else if (type === 'planet') {
        [0, 0.05, 0.1].forEach((delay, i) => {
          const oo = ctx.createOscillator();
          const gg = ctx.createGain();
          oo.connect(gg); gg.connect(ctx.destination);
          oo.frequency.setValueAtTime(300 + i * 150, ctx.currentTime + delay);
          oo.frequency.exponentialRampToValueAtTime(600 + i * 200, ctx.currentTime + delay + 0.1);
          gg.gain.setValueAtTime(0.08, ctx.currentTime + delay);
          gg.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.2);
          oo.type = 'sine';
          oo.start(ctx.currentTime + delay);
          oo.stop(ctx.currentTime + delay + 0.2);
        });
      }
    } catch(e) {}
  }

  function toggle() {
    if (!ambientStarted) { startAmbient(); return; }
    muted = !muted;
    if (masterGain) masterGain.gain.setTargetAtTime(muted ? 0 : 0.18, ctx.currentTime, 0.5);
    document.getElementById('audio-toggle').classList.toggle('muted', muted);
  }

  function resume() { if (ctx.state === 'suspended') ctx.resume(); }

  return { startAmbient, playBlip, toggle, resume };
})();

document.getElementById('audio-toggle').addEventListener('click', () => {
  AudioEngine.resume();
  AudioEngine.toggle();
  AudioEngine.playBlip('click');
});

document.querySelectorAll('.clickable, button, a').forEach(el => {
  el.addEventListener('mouseenter', () => AudioEngine.playBlip('hover'));
  el.addEventListener('click', () => {
    AudioEngine.resume();
    AudioEngine.startAmbient();
    AudioEngine.playBlip('click');
  });
});

// =====================================================================
// 3. STARFIELD CANVAS
// =====================================================================
(function initStarfield() {
  const canvas = document.getElementById('starfield');
  const ctx = canvas.getContext('2d');
  let W, H, stars = [], nebulas = [];

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  function createStars() {
    stars = [];
    const count = Math.floor((W * H) / 2000);
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.5 + 0.2,
        alpha: Math.random() * 0.8 + 0.2,
        speed: Math.random() * 0.015 + 0.005,
        phase: Math.random() * Math.PI * 2,
        color: Math.random() < 0.1 ? '#00e5ff' : Math.random() < 0.05 ? '#b026ff' : '#ffffff'
      });
    }
    nebulas = [];
    for (let i = 0; i < 4; i++) {
      nebulas.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 300 + 150,
        color: Math.random() < 0.5 ? 'rgba(0,229,255,0.025)' : 'rgba(176,38,255,0.025)',
        phase: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.003 + 0.001
      });
    }
  }
  createStars();
  window.addEventListener('resize', createStars);

  let t = 0;
  function drawStars() {
    ctx.clearRect(0, 0, W, H);
    t += 0.01;

    // Draw nebulas
    nebulas.forEach(n => {
      n.phase += n.speed;
      const alpha = 0.015 + Math.sin(n.phase) * 0.005;
      const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
      grad.addColorStop(0, n.color.replace('0.025', alpha.toString()));
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw stars
    stars.forEach(s => {
      const alpha = s.alpha * (0.6 + 0.4 * Math.sin(s.phase + t * s.speed * 10));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
      if (s.r > 1.2) {
        ctx.globalAlpha = alpha * 0.3;
        const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 4);
        grad.addColorStop(0, s.color);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * 4, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.globalAlpha = 1;
    requestAnimationFrame(drawStars);
  }
  drawStars();
})();

// =====================================================================
// 4. NAVIGATION
// =====================================================================
window.addEventListener('scroll', () => {
  const nav = document.getElementById('main-nav');
  nav.classList.toggle('scrolled', window.scrollY > 60);
});

// Profile panel toggle
const profilePanel = document.getElementById('profile-panel');
const profileToggle = document.getElementById('profile-toggle');
let profileCollapsed = false;
profileToggle.addEventListener('click', () => {
  profileCollapsed = !profileCollapsed;
  profilePanel.classList.toggle('collapsed', profileCollapsed);
  profileToggle.textContent = profileCollapsed ? '⟩' : '⟨';
});

// =====================================================================
// 5. PLANET DATA
// =====================================================================
const PLANETS = [
  {
    name: 'Mercury', index: '01', type: 'Terrestrial Planet',
    desc: 'The smallest planet in our solar system and nearest to the Sun, Mercury experiences extreme temperature swings, scorching days and frigid nights.',
    diameter: '4,879 km', distance: '57.9M km', moons: '0', orbital: '88 days', temp: '430°C', gravity: '3.7 m/s²',
    badges: ['Extreme temperatures', 'No atmosphere', 'Cratered surface'],
    color: 0x9b9b9b,
    textureSeed: 'mercury'
  },
  {
    name: 'Venus', index: '02', type: 'Terrestrial Planet',
    desc: 'The hottest planet in our solar system, Venus has a thick toxic atmosphere and surface temperatures that can melt lead. Its atmospheric glow is spectacular.',
    diameter: '12,104 km', distance: '108.2M km', moons: '0', orbital: '225 days', temp: '465°C', gravity: '8.87 m/s²',
    badges: ['Toxic atmosphere', 'Hottest planet', 'Retrograde rotation'],
    color: 0xe8cda0,
    textureSeed: 'venus',
    hasAtmosphere: true
  },
  {
    name: 'Earth', index: '03', type: 'Terrestrial Planet',
    desc: 'Our home world — a vibrant ocean planet teeming with life. Earth\'s complex biosphere and magnetic field make it unique in the known universe.',
    diameter: '12,756 km', distance: '149.6M km', moons: '1', orbital: '365 days', temp: '15°C avg', gravity: '9.81 m/s²',
    badges: ['Liquid water oceans', 'Active biosphere', 'Strong magnetosphere'],
    color: 0x3a8fd4,
    textureSeed: 'earth',
    hasAtmosphere: true
  },
  {
    name: 'Mars', index: '04', type: 'Terrestrial Planet',
    desc: 'The Red Planet — a cold desert world with the largest volcano and canyon in the solar system. A prime candidate for future human exploration.',
    diameter: '6,792 km', distance: '227.9M km', moons: '2', orbital: '687 days', temp: '-65°C avg', gravity: '3.72 m/s²',
    badges: ['Red iron oxide surface', 'Thin atmosphere', 'Olympus Mons volcano'],
    color: 0xc1440e,
    textureSeed: 'mars'
  },
  {
    name: 'Jupiter', index: '05', type: 'Gas Giant',
    desc: 'The largest planet in our solar system, Jupiter is a colossal gas giant with a Great Red Spot storm that has raged for centuries and 95 known moons.',
    diameter: '142,984 km', distance: '778.5M km', moons: '95', orbital: '12 years', temp: '-110°C avg', gravity: '24.79 m/s²',
    badges: ['Great Red Spot', 'Largest planet', '95 moons'],
    color: 0xc88b3a,
    textureSeed: 'jupiter'
  },
  {
    name: 'Saturn', index: '06', type: 'Gas Giant',
    desc: 'The jewel of the solar system, Saturn is famous for its stunning ring system made of ice and rock debris. It is the least dense planet — it could float on water.',
    diameter: '120,536 km', distance: '1.43B km', moons: '146', orbital: '29 years', temp: '-140°C avg', gravity: '10.44 m/s²',
    badges: ['Iconic ring system', 'Would float on water', '146 moons'],
    color: 0xead6a7,
    textureSeed: 'saturn'
  },
  {
    name: 'Uranus', index: '07', type: 'Ice Giant',
    desc: 'An ice giant tilted completely on its side, Uranus rotates with its poles pointing toward the Sun. Its blue-green color comes from methane in its atmosphere.',
    diameter: '51,118 km', distance: '2.87B km', moons: '27', orbital: '84 years', temp: '-195°C avg', gravity: '8.69 m/s²',
    badges: ['Rotates on its side', 'Ice giant', 'Faint ring system'],
    color: 0x7de8e8,
    textureSeed: 'uranus'
  },
  {
    name: 'Neptune', index: '08', type: 'Ice Giant',
    desc: 'The windiest planet, Neptune experiences the most violent storms in the solar system with wind speeds reaching 2,100 km/h. It takes 165 years to orbit the Sun.',
    diameter: '49,528 km', distance: '4.5B km', moons: '16', orbital: '165 years', temp: '-200°C avg', gravity: '11.15 m/s²',
    badges: ['Fastest winds', 'Deepest blue', 'Great Dark Spot'],
    color: 0x3f54ba,
    textureSeed: 'neptune'
  }
];

// =====================================================================
// 6. THREE.JS — PLANET VIEWER
// =====================================================================
let planetScene, planetCamera, planetRenderer, planetMesh, atmosphereMesh, planetClock;
let isDragging = false, prevMouse = { x: 0, y: 0 }, planetRotVelocity = { x: 0, y: 0 };
let currentPlanetIdx = 0;

function createPlanetTexture(seed, color) {
  const size = 512;
  const tc = document.createElement('canvas');
  tc.width = tc.height = size;
  const tctx = tc.getContext('2d');

  // Base color
  tctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
  tctx.fillRect(0, 0, size, size);

  // Planet-specific patterns
  if (seed === 'earth') {
    // Continents
    tctx.fillStyle = '#2d7a2d';
    [[80,200,220,150],[300,100,180,120],[160,350,200,100],[350,280,170,110]].forEach(([x,y,w,h]) => {
      tctx.beginPath();
      tctx.ellipse(x, y, w, h, Math.PI/6, 0, Math.PI*2);
      tctx.fill();
    });
    // Ocean gradient
    const grad = tctx.createLinearGradient(0,0,size,size);
    grad.addColorStop(0, 'rgba(30,80,180,0.3)');
    grad.addColorStop(1, 'rgba(10,40,120,0.5)');
    tctx.fillStyle = grad;
    tctx.fillRect(0,0,size,size);
    // Clouds
    tctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (let i = 0; i < 12; i++) {
      tctx.beginPath();
      tctx.ellipse(Math.random()*size, Math.random()*size, 80+Math.random()*120, 20+Math.random()*30, Math.random()*Math.PI, 0, Math.PI*2);
      tctx.fill();
    }
  } else if (seed === 'jupiter') {
    // Bands
    const bandColors = ['#c88b3a','#e8a84a','#a06020','#d4a060','#b87030','#f0c080','#8a5020'];
    for (let i = 0; i < 7; i++) {
      tctx.fillStyle = bandColors[i];
      const bh = size / 7;
      tctx.fillRect(0, i * bh, size, bh);
    }
    // Great Red Spot
    tctx.fillStyle = 'rgba(180,50,20,0.8)';
    tctx.beginPath();
    tctx.ellipse(200, 280, 60, 40, Math.PI/8, 0, Math.PI*2);
    tctx.fill();
    // Swirls
    tctx.strokeStyle = 'rgba(0,0,0,0.15)';
    tctx.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
      tctx.beginPath();
      tctx.moveTo(0, 50 + i * 90);
      tctx.bezierCurveTo(130, 30+i*90, 380, 70+i*90, size, 50+i*90);
      tctx.stroke();
    }
  } else if (seed === 'saturn') {
    // Bands
    const bColors = ['#ead6a7','#d4c090','#c0a870','#e8d0a0','#b89060'];
    for (let i = 0; i < 5; i++) {
      tctx.fillStyle = bColors[i];
      tctx.fillRect(0, i*(size/5), size, size/5);
    }
    tctx.fillStyle = 'rgba(200,180,140,0.4)';
    for (let i = 0; i < 8; i++) {
      tctx.beginPath();
      tctx.moveTo(0, 50+i*65);
      tctx.bezierCurveTo(130,30+i*65,380,70+i*65,size,50+i*65);
      tctx.lineWidth = 2;
      tctx.strokeStyle = 'rgba(120,100,60,0.3)';
      tctx.stroke();
    }
  } else if (seed === 'mars') {
    tctx.fillStyle = '#c1440e';
    tctx.fillRect(0,0,size,size);
    // Craters and terrain
    tctx.fillStyle = 'rgba(180,70,20,0.6)';
    for (let i = 0; i < 15; i++) {
      tctx.beginPath();
      tctx.arc(Math.random()*size, Math.random()*size, 10+Math.random()*50, 0, Math.PI*2);
      tctx.fill();
    }
    // Polar ice cap
    tctx.fillStyle = 'rgba(240,240,255,0.6)';
    tctx.beginPath();
    tctx.ellipse(size/2, 30, 90, 40, 0, 0, Math.PI*2);
    tctx.fill();
  } else if (seed === 'mercury') {
    tctx.fillStyle = '#9b9b9b';
    tctx.fillRect(0,0,size,size);
    for (let i = 0; i < 40; i++) {
      const r = 8+Math.random()*30;
      const cx = Math.random()*size, cy = Math.random()*size;
      tctx.fillStyle = `rgba(80,80,80,${0.3+Math.random()*0.4})`;
      tctx.beginPath();
      tctx.arc(cx, cy, r, 0, Math.PI*2);
      tctx.fill();
      tctx.strokeStyle = 'rgba(60,60,60,0.3)';
      tctx.lineWidth = 2;
      tctx.beginPath();
      tctx.arc(cx, cy, r+4, 0, Math.PI*2);
      tctx.stroke();
    }
  } else if (seed === 'venus') {
    tctx.fillStyle = '#e8cda0';
    tctx.fillRect(0,0,size,size);
    tctx.fillStyle = 'rgba(220,180,80,0.5)';
    for (let i = 0; i < 8; i++) {
      tctx.beginPath();
      tctx.moveTo(0, 40+i*65);
      tctx.bezierCurveTo(170,20+i*65,350,60+i*65,size,40+i*65);
      tctx.lineWidth = 20+Math.random()*30;
      tctx.strokeStyle = `rgba(210,170,90,0.3)`;
      tctx.stroke();
    }
  } else if (seed === 'uranus') {
    const grad = tctx.createLinearGradient(0,0,size,size);
    grad.addColorStop(0,'#7de8e8'); grad.addColorStop(1,'#5ab8d0');
    tctx.fillStyle = grad;
    tctx.fillRect(0,0,size,size);
    tctx.strokeStyle = 'rgba(255,255,255,0.1)';
    for(let i=0;i<5;i++){tctx.beginPath();tctx.moveTo(0,100+i*80);tctx.lineTo(size,100+i*80);tctx.lineWidth=15;tctx.stroke();}
  } else if (seed === 'neptune') {
    const grad = tctx.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);
    grad.addColorStop(0,'#4466dd'); grad.addColorStop(1,'#2233aa');
    tctx.fillStyle = grad;
    tctx.fillRect(0,0,size,size);
    tctx.fillStyle = 'rgba(80,100,220,0.5)';
    tctx.beginPath();
    tctx.ellipse(300,200,80,40,Math.PI/4,0,Math.PI*2);
    tctx.fill();
    tctx.strokeStyle='rgba(160,200,255,0.15)';
    for(let i=0;i<4;i++){tctx.beginPath();tctx.moveTo(0,80+i*110);tctx.bezierCurveTo(180,60+i*110,340,100+i*110,size,80+i*110);tctx.lineWidth=25;tctx.stroke();}
  }

  // Noise overlay
  const imgData = tctx.getImageData(0,0,size,size);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random()-0.5) * 20;
    d[i] = clamp(d[i]+n,0,255); d[i+1] = clamp(d[i+1]+n,0,255); d[i+2] = clamp(d[i+2]+n,0,255);
  }
  tctx.putImageData(imgData,0,0);

  const texture = new THREE.Texture(tc);
  texture.needsUpdate = true;
  return texture;
}

// Atmosphere shader material
function createAtmosphereMaterial(color) {
  return new THREE.ShaderMaterial({
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vPosition;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 atmosphereColor;
      uniform float intensity;
      varying vec3 vNormal;
      varying vec3 vPosition;
      void main() {
        vec3 viewDir = normalize(-vPosition);
        float fresnel = pow(1.0 - abs(dot(vNormal, viewDir)), 3.0);
        float glow = fresnel * intensity;
        gl_FragColor = vec4(atmosphereColor * glow, glow * 0.8);
      }
    `,
    uniforms: {
      atmosphereColor: { value: new THREE.Color(color) },
      intensity: { value: 1.4 }
    },
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
    transparent: true,
    depthWrite: false
  });
}

function initPlanetViewer() {
  const canvas = document.getElementById('planet-canvas');
  const container = canvas.parentElement;

  planetScene = new THREE.Scene();
  planetCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  planetCamera.position.z = 3.2;

  planetRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  function sizePlanetRenderer() {
    const rect = container.getBoundingClientRect();
    const s = Math.min(rect.width, rect.height) || 500;
    planetRenderer.setSize(s, s);
    planetRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }
  sizePlanetRenderer();
  window.addEventListener('resize', sizePlanetRenderer);
  planetRenderer.setClearColor(0x000000, 0);

  // Lights
  const ambLight = new THREE.AmbientLight(0x222244, 0.5);
  const sunLight = new THREE.DirectionalLight(0xfff5e0, 2.5);
  sunLight.position.set(5, 3, 5);
  planetScene.add(ambLight, sunLight);

  // Stars background inside viewer
  const starsGeo = new THREE.BufferGeometry();
  const starsCount = 1500;
  const starsPos = new Float32Array(starsCount * 3);
  for (let i = 0; i < starsCount * 3; i++) starsPos[i] = (Math.random() - 0.5) * 80;
  starsGeo.setAttribute('position', new THREE.BufferAttribute(starsPos, 3));
  const starsMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.08, transparent: true, opacity: 0.6 });
  planetScene.add(new THREE.Points(starsGeo, starsMat));

  // Create initial planet
  createPlanetMesh(0);

  // Orbit controls via mouse
  canvas.addEventListener('mousedown', e => { isDragging = true; prevMouse = { x: e.clientX, y: e.clientY }; });
  window.addEventListener('mouseup', () => { isDragging = false; });
  canvas.addEventListener('mousemove', e => {
    if (!isDragging) return;
    const dx = (e.clientX - prevMouse.x) * 0.006;
    const dy = (e.clientY - prevMouse.y) * 0.006;
    planetRotVelocity.x = dy;
    planetRotVelocity.y = dx;
    prevMouse = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('touchstart', e => { isDragging = true; prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY }; });
  canvas.addEventListener('touchend', () => { isDragging = false; });
  canvas.addEventListener('touchmove', e => {
    if (!isDragging) return;
    const dx = (e.touches[0].clientX - prevMouse.x) * 0.006;
    const dy = (e.touches[0].clientY - prevMouse.y) * 0.006;
    planetRotVelocity.x = dy;
    planetRotVelocity.y = dx;
    prevMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  });

  planetClock = new THREE.Clock();

  function animatePlanet() {
    requestAnimationFrame(animatePlanet);
    const delta = planetClock.getDelta();
    if (planetMesh) {
      planetMesh.rotation.y += isDragging ? planetRotVelocity.y : 0.003;
      planetMesh.rotation.x += isDragging ? planetRotVelocity.x : 0;
      planetMesh.rotation.x = clamp(planetMesh.rotation.x, -Math.PI/3, Math.PI/3);
      planetRotVelocity.x *= 0.92;
      planetRotVelocity.y *= 0.92;
    }
    if (atmosphereMesh && planetMesh) {
      atmosphereMesh.rotation.copy(planetMesh.rotation);
    }
    planetRenderer.render(planetScene, planetCamera);
  }
  animatePlanet();
}

function createPlanetMesh(idx) {
  const p = PLANETS[idx];

  // Remove old meshes
  if (planetMesh) { planetScene.remove(planetMesh); planetMesh.geometry.dispose(); planetMesh.material.dispose(); }
  if (atmosphereMesh) { planetScene.remove(atmosphereMesh); atmosphereMesh.geometry.dispose(); atmosphereMesh.material.dispose(); }

  const geo = new THREE.SphereGeometry(1, 64, 64);
  const texture = createPlanetTexture(p.textureSeed, p.color);
  const mat = new THREE.MeshPhongMaterial({
    map: texture,
    shininess: 25,
    specular: new THREE.Color(0x224466),
    bumpScale: 0.02
  });
  planetMesh = new THREE.Mesh(geo, mat);
  planetScene.add(planetMesh);

  // Saturn rings
  if (idx === 5) {
    const ringGeo = new THREE.RingGeometry(1.3, 2.0, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xc8a870,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.55
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2.5;
    planetMesh.add(ring);
  }

  // Atmosphere (Earth & Venus)
  if (p.hasAtmosphere) {
    const atmoGeo = new THREE.SphereGeometry(1.12, 64, 64);
    const atmoColor = p.textureSeed === 'earth' ? 0x4488ff : 0xffcc44;
    atmosphereMesh = new THREE.Mesh(atmoGeo, createAtmosphereMaterial(atmoColor));
    planetScene.add(atmosphereMesh);
  } else {
    atmosphereMesh = null;
  }
}

function updatePlanetUI(idx) {
  const p = PLANETS[idx];
  const fields = ['name','index','type','desc','diameter','distance','moons','orbital','temp','gravity'];

  document.getElementById('planet-name').textContent = p.name;
  document.getElementById('planet-index').textContent = p.index;
  document.getElementById('planet-type').textContent = p.type;
  document.getElementById('planet-desc').textContent = p.desc;
  document.getElementById('pstat-diameter').textContent = p.diameter;
  document.getElementById('pstat-distance').textContent = p.distance;
  document.getElementById('pstat-moons').textContent = p.moons;
  document.getElementById('pstat-orbital').textContent = p.orbital;
  document.getElementById('pstat-temp').textContent = p.temp;
  document.getElementById('pstat-gravity').textContent = p.gravity;

  const badgesEl = document.getElementById('planet-badges');
  badgesEl.innerHTML = p.badges.map(b => `<span class="badge">${b}</span>`).join('');

  // Timeline
  document.querySelectorAll('.tl-planet').forEach((btn, i) => {
    btn.classList.toggle('active', i === idx);
  });

  // Animate in
  const dataPanel = document.querySelector('.planet-data');
  dataPanel.classList.remove('planet-data-transition');
  void dataPanel.offsetWidth;
  dataPanel.classList.add('planet-data-transition');
}

function selectPlanet(idx) {
  idx = (idx + PLANETS.length) % PLANETS.length;
  currentPlanetIdx = idx;
  createPlanetMesh(idx);
  updatePlanetUI(idx);
  AudioEngine.playBlip('planet');
}

function initPlanetControls() {
  document.getElementById('next-planet').addEventListener('click', () => selectPlanet(currentPlanetIdx + 1));
  document.getElementById('prev-planet').addEventListener('click', () => selectPlanet(currentPlanetIdx - 1));
  document.querySelectorAll('.tl-planet').forEach(btn => {
    btn.addEventListener('click', () => selectPlanet(parseInt(btn.dataset.planet)));
  });
}

// =====================================================================
// 7. FACTS — INTERSECTION OBSERVER + COUNTER
// =====================================================================
function initFactCounters() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.querySelectorAll('[data-target]').forEach(card => {
          animateCounter(card);
        });
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.3 });

  const factsGrid = document.querySelector('.facts-grid');
  if (factsGrid) observer.observe(factsGrid);
}

function animateCounter(card) {
  const target = parseFloat(card.dataset.target);
  const counter = card.querySelector('.fact-counter');
  const duration = 2000;
  const start = performance.now();

  function update(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = easeOut(progress);
    const current = target * eased;
    counter.textContent = current >= 100 ? Math.floor(current).toLocaleString() : current.toFixed(current < 10 ? 1 : 0);
    if (progress < 1) requestAnimationFrame(update);
    else counter.textContent = target >= 100 ? Math.floor(target).toLocaleString() : target;
  }
  requestAnimationFrame(update);
}

// DYK Facts
const dykFacts = [
  "A day on Venus is longer than a year on Venus. It takes 243 Earth days to rotate once on its axis, but only 225 Earth days to orbit the Sun.",
  "Neutron stars can spin at 716 rotations per second. At that speed, their equators move at about 24% the speed of light.",
  "The footprints left by Apollo astronauts will stay on the Moon for at least 100 million years — there's no wind to erode them.",
  "One million Earths could fit inside the Sun. Yet the Sun is considered just an average-sized star compared to other giants."
];
let dykIdx = 0;

function initDYK() {
  const nextBtn = document.querySelector('.dyk-next');
  const factEl = document.getElementById('dyk-fact');
  const dots = document.querySelectorAll('.dyk-dot');

  function showFact(idx) {
    factEl.style.opacity = '0';
    factEl.style.transform = 'translateY(8px)';
    setTimeout(() => {
      factEl.textContent = dykFacts[idx];
      factEl.style.transition = 'opacity 0.4s, transform 0.4s';
      factEl.style.opacity = '1';
      factEl.style.transform = 'translateY(0)';
    }, 200);
    dots.forEach((d, i) => d.classList.toggle('active', i === idx));
  }

  nextBtn.addEventListener('click', () => {
    dykIdx = (dykIdx + 1) % dykFacts.length;
    showFact(dykIdx);
  });

  setInterval(() => {
    dykIdx = (dykIdx + 1) % dykFacts.length;
    showFact(dykIdx);
  }, 8000);
}

// =====================================================================
// 8. THREE.JS — SOLAR SYSTEM EXPLORER
// =====================================================================
let expScene, expCamera, expRenderer, expClock;
let expPlanets = {};
let expAnimating = false;
let expCamTarget = { x: 0, y: 0, z: 100 };
let expCamCurrent = { x: 0, y: 0, z: 100 };
let expLookTarget = new THREE.Vector3(0, 0, 0);

const EXP_PLANET_DATA = [
  { name: 'sun',     label: 'Sun',     detail: 'The Star — Our Solar System\'s Heart', radius: 5.0, color: 0xffcc00, x: 0,    emissive: 0xff8800, hasAtmo: false, isGlow: true },
  { name: 'mercury', label: 'Mercury', detail: 'Terrestrial Planet — 57.9M km from Sun', radius: 0.7, color: 0x9b9b9b, x: 14,   emissive: 0, hasAtmo: false },
  { name: 'venus',   label: 'Venus',   detail: 'Terrestrial Planet — 108.2M km from Sun', radius: 1.1, color: 0xe8cda0, x: 22,   emissive: 0, hasAtmo: true, atmoColor: 0xffcc44 },
  { name: 'earth',   label: 'Earth',   detail: 'Our Home — 149.6M km from Sun', radius: 1.2, color: 0x3a8fd4, x: 31,   emissive: 0, hasAtmo: true, atmoColor: 0x4488ff },
  { name: 'mars',    label: 'Mars',    detail: 'The Red Planet — 227.9M km from Sun', radius: 0.9, color: 0xc1440e, x: 42,   emissive: 0, hasAtmo: false },
  { name: 'jupiter', label: 'Jupiter', detail: 'Gas Giant — 778.5M km from Sun', radius: 2.8, color: 0xc88b3a, x: 58,   emissive: 0, hasAtmo: false },
  { name: 'saturn',  label: 'Saturn',  detail: 'Ringed Giant — 1.43B km from Sun', radius: 2.3, color: 0xead6a7, x: 74,   emissive: 0, hasAtmo: false, hasRings: true },
  { name: 'uranus',  label: 'Uranus',  detail: 'Ice Giant — 2.87B km from Sun', radius: 1.6, color: 0x7de8e8, x: 90,   emissive: 0, hasAtmo: false },
  { name: 'neptune', label: 'Neptune', detail: 'Ice Giant — 4.5B km from Sun', radius: 1.5, color: 0x3f54ba, x: 104,  emissive: 0, hasAtmo: false }
];

function initExplorer() {
  const canvas = document.getElementById('explorer-canvas');
  const container = canvas.parentElement;

  expScene = new THREE.Scene();
  expCamera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 2000);
  expCamera.position.set(0, 25, 120);
  expCamera.lookAt(0, 0, 0);

  expRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  expRenderer.setSize(container.clientWidth, container.clientHeight);
  expRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  expRenderer.setClearColor(0x020509, 1);

  window.addEventListener('resize', () => {
    expCamera.aspect = container.clientWidth / container.clientHeight;
    expCamera.updateProjectionMatrix();
    expRenderer.setSize(container.clientWidth, container.clientHeight);
  });

  // Stars
  const starsGeo = new THREE.BufferGeometry();
  const sc = 8000;
  const sp = new Float32Array(sc * 3);
  for (let i = 0; i < sc * 3; i++) sp[i] = (Math.random() - 0.5) * 1600;
  starsGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const starsMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.35, transparent: true, opacity: 0.75 });
  expScene.add(new THREE.Points(starsGeo, starsMat));

  // Sun light
  const sunLight = new THREE.PointLight(0xffeedd, 3, 500);
  sunLight.position.set(0, 0, 0);
  expScene.add(sunLight);
  const ambLight = new THREE.AmbientLight(0x111133, 0.8);
  expScene.add(ambLight);

  // Orbit path line
  const orbitMat = new THREE.LineBasicMaterial({ color: 0x334466, transparent: true, opacity: 0.25 });

  EXP_PLANET_DATA.forEach(pd => {
    const geo = new THREE.SphereGeometry(pd.radius, 48, 48);
    let mat;
    if (pd.isGlow) {
      mat = new THREE.MeshBasicMaterial({ color: pd.color });
    } else {
      mat = new THREE.MeshPhongMaterial({
        color: pd.color,
        emissive: pd.emissive || 0x000000,
        shininess: 20,
        specular: new THREE.Color(0x224466)
      });
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pd.x, 0, 0);
    expScene.add(mesh);

    // Sun glow
    if (pd.isGlow) {
      const glowGeo = new THREE.SphereGeometry(pd.radius * 1.4, 48, 48);
      const glowMat = new THREE.ShaderMaterial({
        vertexShader: `varying vec3 vNormal; void main() { vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `varying vec3 vNormal; void main() { float intensity = pow(0.7 - dot(vNormal, vec3(0,0,1.0)), 2.0); gl_FragColor = vec4(1.0, 0.6, 0.1, 1.0) * intensity; }`,
        blending: THREE.AdditiveBlending,
        side: THREE.FrontSide,
        transparent: true,
        depthWrite: false
      });
      const glowMesh = new THREE.Mesh(glowGeo, glowMat);
      glowMesh.position.copy(mesh.position);
      expScene.add(glowMesh);
    }

    // Atmosphere
    if (pd.hasAtmo && pd.atmoColor) {
      const atmoGeo = new THREE.SphereGeometry(pd.radius * 1.15, 48, 48);
      const atmoMesh = new THREE.Mesh(atmoGeo, createAtmosphereMaterial(pd.atmoColor));
      atmoMesh.position.copy(mesh.position);
      expScene.add(atmoMesh);
    }

    // Saturn rings
    if (pd.hasRings) {
      const rGeo = new THREE.RingGeometry(pd.radius * 1.4, pd.radius * 2.3, 64);
      const rMat = new THREE.MeshBasicMaterial({ color: 0xb89070, side: THREE.DoubleSide, transparent: true, opacity: 0.45 });
      const rMesh = new THREE.Mesh(rGeo, rMat);
      rMesh.rotation.x = Math.PI / 2.5;
      rMesh.position.copy(mesh.position);
      expScene.add(rMesh);
    }

    // Orbit dotted circle (around sun)
    if (pd.x > 0) {
      const pts = [];
      for (let i = 0; i <= 128; i++) {
        const ang = (i / 128) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(ang) * pd.x, 0, Math.sin(ang) * pd.x));
      }
      const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
      expScene.add(new THREE.Line(lineGeo, orbitMat));
    }

    expPlanets[pd.name] = { mesh, data: pd };
  });

  expClock = new THREE.Clock();
  expCamTarget = { x: 0, y: 25, z: 120 };
  expCamCurrent = { x: 0, y: 25, z: 120 };

  // Gentle auto-rotate + camera drift
  let autoT = 0;
  function animateExplorer() {
    requestAnimationFrame(animateExplorer);
    const delta = expClock.getDelta();
    autoT += delta;

    // Slow rotation for planets
    Object.values(expPlanets).forEach(({ mesh, data }) => {
      if (!data.isGlow) mesh.rotation.y += 0.004 * delta * 60;
      else mesh.rotation.y += 0.001 * delta * 60;
    });

    // Camera lerp
    if (!expAnimating) {
      expCamCurrent.x = lerp(expCamCurrent.x, expCamTarget.x, 0.04);
      expCamCurrent.y = lerp(expCamCurrent.y, expCamTarget.y, 0.04);
      expCamCurrent.z = lerp(expCamCurrent.z, expCamTarget.z, 0.04);
      expCamera.position.set(expCamCurrent.x, expCamCurrent.y, expCamCurrent.z);
      expCamera.lookAt(expLookTarget);
    }

    // Update coords display
    const coord = document.getElementById('cam-coords');
    if (coord) {
      coord.textContent = `X: ${expCamera.position.x.toFixed(0)} | Y: ${expCamera.position.y.toFixed(0)} | Z: ${expCamera.position.z.toFixed(0)}`;
    }

    expRenderer.render(expScene, expCamera);
  }
  animateExplorer();
}

function flyToPlanet(planetName) {
  const pd = EXP_PLANET_DATA.find(p => p.name === planetName);
  if (!pd) return;

  const infoName = document.getElementById('exp-planet-name');
  const infoDetail = document.getElementById('exp-planet-detail');

  if (planetName === 'sun') {
    expCamTarget = { x: 0, y: 25, z: 120 };
    expLookTarget.set(52, 0, 0);
    if (infoName) infoName.textContent = 'SOLAR SYSTEM';
    if (infoDetail) infoDetail.textContent = 'Overview — 8 Planets, 1 Star';
  } else {
    const dist = pd.radius * 5 + 8;
    expCamTarget = { x: pd.x, y: dist * 0.7, z: dist };
    expLookTarget.set(pd.x, 0, 0);
    if (infoName) infoName.textContent = pd.label.toUpperCase();
    if (infoDetail) infoDetail.textContent = pd.detail;
  }

  // Use GSAP if available
  if (typeof gsap !== 'undefined') {
    gsap.to(expCamera.position, {
      x: expCamTarget.x,
      y: expCamTarget.y,
      z: expCamTarget.z,
      duration: 2.5,
      ease: 'power3.inOut',
      onUpdate: () => { expCamera.lookAt(expLookTarget); },
      onComplete: () => {
        expCamCurrent = { x: expCamTarget.x, y: expCamTarget.y, z: expCamTarget.z };
      }
    });
  }

  AudioEngine.playBlip('planet');

  // Update sidebar active state
  document.querySelectorAll('.planet-nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.expPlanet === planetName);
  });
}

function initExplorerControls() {
  document.querySelectorAll('.planet-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => flyToPlanet(btn.dataset.expPlanet));
  });
  document.getElementById('return-base').addEventListener('click', () => {
    expCamTarget = { x: 0, y: 25, z: 120 };
    expLookTarget.set(52, 0, 0);
    if (typeof gsap !== 'undefined') {
      gsap.to(expCamera.position, {
        x: 0, y: 25, z: 120,
        duration: 2.5,
        ease: 'power3.inOut',
        onUpdate: () => expCamera.lookAt(expLookTarget),
        onComplete: () => { expCamCurrent = { x: 0, y: 25, z: 120 }; }
      });
    }
    document.getElementById('exp-planet-name').textContent = 'SOLAR SYSTEM';
    document.getElementById('exp-planet-detail').textContent = 'Overview — 8 Planets, 1 Star';
    document.querySelectorAll('.planet-nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-exp-planet="sun"]').classList.add('active');
    AudioEngine.playBlip('click');
  });
}

// =====================================================================
// 9. SMOOTH SCROLL NAV
// =====================================================================
function initNavScroll() {
  document.querySelectorAll('a[href^="#"], .nav-link').forEach(link => {
    link.addEventListener('click', e => {
      const href = link.getAttribute('href');
      if (href && href.startsWith('#')) {
        e.preventDefault();
        const target = document.querySelector(href);
        if (target) target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  document.getElementById('explore-btn')?.addEventListener('click', () => {
    document.getElementById('planets')?.scrollIntoView({ behavior: 'smooth' });
  });
  document.getElementById('trailer-btn')?.addEventListener('click', () => {
    document.getElementById('explorer')?.scrollIntoView({ behavior: 'smooth' });
  });
}

// =====================================================================
// 10. SCROLL REVEAL
// =====================================================================
function initScrollReveal() {
  const revealEls = document.querySelectorAll('.fact-card, .course-card, .planet-data, .did-you-know');
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.transition = 'opacity 0.7s ease, transform 0.7s ease';
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  revealEls.forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(30px)';
    obs.observe(el);
  });
}

// =====================================================================
// 11. SUBSCRIBE FORM
// =====================================================================
function initSubscribeForm() {
  const form = document.querySelector('.subscribe-form');
  const btn = document.querySelector('.subscribe-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const input = document.querySelector('.subscribe-input');
    if (!input.value) return;
    btn.textContent = 'Joined! ✦';
    btn.style.background = 'linear-gradient(135deg, #b026ff, #8800cc)';
    input.value = '';
    setTimeout(() => {
      btn.textContent = 'Launch ↗';
      btn.style.background = '';
    }, 3000);
  });
}

// =====================================================================
// 12. ASTRONAUT PHYSICS ENGINE
// =====================================================================
function initAstronauts() {
  const field = document.getElementById('astronaut-field');
  if (!field) return;

  const astronauts = Array.from(field.querySelectorAll('.astronaut'));

  // Physics state per astronaut
  const state = astronauts.map((el, i) => {
    // Spread them across the hero initially
    const positions = [
      { x: 0.12, y: 0.18 },
      { x: 0.78, y: 0.22 },
      { x: 0.08, y: 0.60 },
      { x: 0.82, y: 0.62 }
    ];
    const W = window.innerWidth;
    const H = window.innerHeight;
    const p = positions[i] || { x: Math.random(), y: Math.random() };
    return {
      el,
      x: p.x * W,
      y: p.y * H,
      vx: (Math.random() - 0.5) * 0.45,
      vy: (Math.random() - 0.5) * 0.35,
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 0.25,
      width: 110,
      height: 160,
      wobblePhase: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.4 + Math.random() * 0.3
    };
  });

  // Mouse repulsion
  let mouseX = -999, mouseY = -999;
  document.addEventListener('mousemove', e => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  let lastTime = performance.now();

  function physicsLoop(now) {
    const dt = Math.min((now - lastTime) / 16.67, 3); // cap at 3x step
    lastTime = now;

    const W = window.innerWidth;
    const H = window.innerHeight;

    state.forEach(s => {
      s.wobblePhase += s.wobbleSpeed * 0.016 * dt;

      // Gravity-less drift with wobble
      const wobbleX = Math.sin(s.wobblePhase) * 0.08;
      const wobbleY = Math.cos(s.wobblePhase * 0.7) * 0.06;

      s.x += (s.vx + wobbleX) * dt;
      s.y += (s.vy + wobbleY) * dt;
      s.rotation += s.rotSpeed * dt;

      // Soft boundary bounce (keep within viewport with padding)
      const pad = 20;
      const navH = 80;
      if (s.x < pad) { s.x = pad; s.vx = Math.abs(s.vx) * 0.7; }
      if (s.x > W - s.width - pad) { s.x = W - s.width - pad; s.vx = -Math.abs(s.vx) * 0.7; }
      if (s.y < navH + pad) { s.y = navH + pad; s.vy = Math.abs(s.vy) * 0.7; }
      if (s.y > H - s.height - pad) { s.y = H - s.height - pad; s.vy = -Math.abs(s.vy) * 0.7; }

      // Mouse repulsion
      const cx = s.x + s.width / 2;
      const cy = s.y + s.height / 2;
      const dx = cx - mouseX;
      const dy = cy - mouseY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const repelRadius = 140;
      if (dist < repelRadius && dist > 1) {
        const force = ((repelRadius - dist) / repelRadius) * 0.4;
        s.vx += (dx / dist) * force * dt;
        s.vy += (dy / dist) * force * dt;
      }

      // Astronaut-to-astronaut repulsion (so they don't overlap)
      state.forEach(other => {
        if (other === s) return;
        const odx = cx - (other.x + other.width / 2);
        const ody = cy - (other.y + other.height / 2);
        const od = Math.sqrt(odx * odx + ody * ody);
        const minD = 130;
        if (od < minD && od > 1) {
          const f = ((minD - od) / minD) * 0.15;
          s.vx += (odx / od) * f * dt;
          s.vy += (ody / od) * f * dt;
        }
      });

      // Speed limit
      const maxSpeed = 1.8;
      const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
      if (speed > maxSpeed) {
        s.vx = (s.vx / speed) * maxSpeed;
        s.vy = (s.vy / speed) * maxSpeed;
      }

      // Apply — use gentle tilt from velocity
      const tiltX = clamp(s.vy * 8, -18, 18);
      const tiltY = clamp(-s.vx * 8, -18, 18);

      s.el.style.transform = `translate(${s.x}px, ${s.y}px) rotateZ(${tiltX}deg)`;
      s.el.style.position = 'absolute';
      s.el.style.left = '0';
      s.el.style.top = '0';
      s.el.style.willChange = 'transform';
    });

    requestAnimationFrame(physicsLoop);
  }

  requestAnimationFrame(physicsLoop);

  // Click handler — open portfolio
  astronauts.forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      el.classList.add('clicked');
      setTimeout(() => el.classList.remove('clicked'), 400);
      openPortfolio(id);
      AudioEngine.playBlip('planet');
    });
  });
}

// =====================================================================
// 12b. PORTFOLIO MODALS
// =====================================================================
function initPortfolioModals() {
  const backdrop = document.getElementById('portfolio-backdrop');

  function openPortfolio(id) {
    // Close any open
    document.querySelectorAll('.portfolio-modal.active').forEach(m => m.classList.remove('active'));
    const modal = document.getElementById('portfolio-' + id);
    if (!modal) return;
    backdrop.classList.add('active');
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeAll() {
    document.querySelectorAll('.portfolio-modal.active').forEach(m => m.classList.remove('active'));
    backdrop.classList.remove('active');
    document.body.style.overflow = '';
  }

  // Expose globally for astronaut click handler
  window.openPortfolio = openPortfolio;

  // Close on backdrop click
  backdrop.addEventListener('click', closeAll);

  // Close buttons
  document.querySelectorAll('.portfolio-close').forEach(btn => {
    btn.addEventListener('click', () => {
      closeAll();
      AudioEngine.playBlip('click');
    });
  });

  // Close on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeAll();
  });
}

// =====================================================================
// 13. LOADING SCREEN
// =====================================================================
function initLoadingScreen() {
  const screen = document.getElementById('loading-screen');
  const bar = document.getElementById('loader-bar');
  const status = document.getElementById('loader-status');
  const messages = [
    'Initializing Deep Space Engines...',
    'Calibrating Stellar Navigation...',
    'Loading Planet Textures...',
    'Synchronizing Orbital Mechanics...',
    'Preparing WebGL Shaders...',
    'System Online — Welcome, Commander.'
  ];
  let pct = 0;
  let msgIdx = 0;

  const interval = setInterval(() => {
    const increment = Math.random() * 18 + 8;
    pct = Math.min(pct + increment, 100);
    bar.style.width = pct + '%';
    msgIdx = Math.min(Math.floor(pct / 20), messages.length - 1);
    status.textContent = messages[msgIdx];

    if (pct >= 100) {
      clearInterval(interval);
      status.textContent = messages[messages.length - 1];
      setTimeout(() => {
        screen.classList.add('hidden');
        // Animate hero on load
        const heroContent = document.querySelector('.hero-content');
        heroContent.style.opacity = '0';
        heroContent.style.transform = 'translateY(40px)';
        setTimeout(() => {
          heroContent.style.transition = 'opacity 1.2s ease, transform 1.2s ease';
          heroContent.style.opacity = '1';
          heroContent.style.transform = 'translateY(0)';
        }, 100);
      }, 800);
    }
  }, 220);
}

document.addEventListener('DOMContentLoaded', () => {
  initLoadingScreen();
  initAstronauts();
  initPortfolioModals();
  initPlanetViewer();
  initPlanetControls();
  updatePlanetUI(0);
  initFactCounters();
  initDYK();
  initExplorer();
  initExplorerControls();
  initNavScroll();
  initScrollReveal();
  initSubscribeForm();

  // Start ambient on first user interaction
  document.body.addEventListener('click', () => {
    AudioEngine.resume();
    AudioEngine.startAmbient();
  }, { once: true });
});
