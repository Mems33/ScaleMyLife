/* ScaleMyLife — animated shader-gradient background (vanilla WebGL, no deps).
   A slow, theme-tinted flowing mesh gradient behind the app, inspired by the
   shadergradient aesthetic but hand-written so it stays dependency-free,
   build-free, offline-capable and CSP-safe.

   Progressive enhancement: if WebGL is unavailable (or anything throws) the
   canvas hides itself and the CSS aurora fallback in styles.css shows instead.
   Respects prefers-reduced-motion (renders a single static frame), pauses when
   the tab is hidden, and caps device-pixel-ratio for battery/perf. */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;

  var canvas, gl, prog, buf, loc = {}, raf = 0, startT = 0, running = false, ready = false;
  var reduced = false;
  var cols = null; // {bg,c1,c2,c3}

  function hexToRgb(h) {
    h = (h || '').trim().replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) return [0.07, 0.06, 0.12];
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  function readTheme() {
    try {
      var s = getComputedStyle(document.documentElement);
      var g = function (v, f) { var x = s.getPropertyValue(v); return hexToRgb(x || f); };
      return { bg: g('--bg', '#12101f'), c1: g('--gold', '#f5c542'), c2: g('--skill', '#8f7bff'), c3: g('--xp', '#3ddc84') };
    } catch (e) { return { bg: [0.07, 0.06, 0.12], c1: [0.96, 0.77, 0.26], c2: [0.56, 0.48, 1], c3: [0.24, 0.86, 0.52] }; }
  }

  var VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}';
  var FRAG = [
    'precision highp float;',
    'uniform vec2 u_res; uniform float u_time;',
    'uniform vec3 u_bg,u_c1,u_c2,u_c3;',
    'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}',
    'float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.0-2.0*f);',
    ' return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),u.x),mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),u.x),u.y);}',
    'float fbm(vec2 p){float v=0.0,a=0.5;for(int i=0;i<5;i++){v+=a*noise(p);p*=2.02;a*=0.5;}return v;}',
    'void main(){',
    ' vec2 uv=gl_FragCoord.xy/u_res.xy;',
    ' vec2 p=uv; p.x*=u_res.x/u_res.y; p*=1.6;',
    ' float t=u_time*0.035;',
    ' vec2 q=vec2(fbm(p+vec2(0.0,t)),fbm(p+vec2(5.2,-t)));',
    ' vec2 r=vec2(fbm(p+2.0*q+vec2(1.7,9.2)+t*0.5),fbm(p+2.0*q+vec2(8.3,2.8)-t*0.4));',
    ' float f=fbm(p+2.0*r);',
    ' vec3 col=u_bg;',
    ' col=mix(col,u_c2,clamp(f*f*1.6,0.0,1.0)*0.5);',   // purple/skill bloom (primary)
    ' col=mix(col,u_c1,clamp(q.x*r.y*2.4,0.0,1.0)*0.4);',  // gold bloom (accent)
    ' col=mix(col,u_c3,clamp(r.x*1.1,0.0,1.0)*0.12);',    // green whisper (minimal)
    ' float vig=smoothstep(1.35,0.05,length(uv-0.5));',
    ' col=mix(u_bg,col,0.2+0.42*vig);',         // deep & moody: mostly bg, blooms are subtle',
    ' gl_FragColor=vec4(col,1.0);',
    '}'
  ].join('\n');

  function compile(type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { gl.deleteShader(sh); return null; }
    return sh;
  }

  function setup() {
    canvas = document.getElementById('bg');
    if (!canvas || !canvas.getContext) return false;
    try { gl = canvas.getContext('webgl', { antialias: false, depth: false, alpha: false, powerPreference: 'low-power' }) || canvas.getContext('experimental-webgl'); }
    catch (e) { gl = null; }
    if (!gl) return false;
    var vs = compile(gl.VERTEX_SHADER, VERT), fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    gl.useProgram(prog);
    buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var ap = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(ap); gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 0, 0);
    loc.res = gl.getUniformLocation(prog, 'u_res');
    loc.time = gl.getUniformLocation(prog, 'u_time');
    loc.bg = gl.getUniformLocation(prog, 'u_bg');
    loc.c1 = gl.getUniformLocation(prog, 'u_c1');
    loc.c2 = gl.getUniformLocation(prog, 'u_c2');
    loc.c3 = gl.getUniformLocation(prog, 'u_c3');
    return true;
  }

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var w = Math.max(2, Math.floor(window.innerWidth * dpr));
    var h = Math.max(2, Math.floor(window.innerHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
  }
  function pushColors() {
    if (!ready || !cols) return;
    gl.uniform3fv(loc.bg, cols.bg); gl.uniform3fv(loc.c1, cols.c1);
    gl.uniform3fv(loc.c2, cols.c2); gl.uniform3fv(loc.c3, cols.c3);
  }
  function draw(now) {
    if (!ready) return;
    resize();
    gl.uniform2f(loc.res, canvas.width, canvas.height);
    gl.uniform1f(loc.time, (now - startT) / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  var lastDraw = 0;
  function loop(now) {
    if (!running) return;
    if (now - lastDraw >= 32) { lastDraw = now; draw(now); } // ~30fps: smooth enough, half the GPU/battery
    raf = requestAnimationFrame(loop);
  }
  function start() {
    if (!ready || running || reduced) return;
    running = true; raf = requestAnimationFrame(loop);
  }
  function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }

  function fail() {
    try { if (canvas) canvas.style.display = 'none'; } catch (e) {}
    ready = false; stop();
  }

  function init() {
    try {
      var mm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
      reduced = !!(mm && mm.matches);
      if (!setup()) { fail(); return; }
      ready = true;
      cols = readTheme(); pushColors();
      startT = performance && performance.now ? performance.now() : Date.now();
      resize();
      if (reduced) { draw(startT); }   // one static frame, no loop
      else { start(); }
      window.addEventListener('resize', function () { if (ready) { resize(); if (reduced) draw(startT); } });
      document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });
      if (mm && mm.addEventListener) mm.addEventListener('change', function (e) { reduced = e.matches; if (reduced) { stop(); draw(startT); } else { start(); } });
    } catch (e) { fail(); }
  }

  /* public: called by app.js when the theme changes */
  window.SMLGradient = {
    setColors: function () { try { if (!ready) return; cols = readTheme(); pushColors(); if (reduced) draw(startT); } catch (e) {} },
    stop: stop, start: start
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
