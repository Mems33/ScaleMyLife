/* ScaleMyLife - animated mosaic background (vanilla WebGL, no deps).
   Slow, theme-tinted pools of light drawn as rounded pixel tiles behind the
   app, hand-written so it stays dependency-free, build-free, offline-capable
   and CSP-safe.

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
  /* The mosaic: soft pools of light that drift behind the app, quantised into
     rounded tiles, so the background reads as the same pixel tiles as every
     icon and hero. Three slow light sources, a little noise, and each tile
     breathing on its own clock. u_c1 is the theme accent (warm light), u_c2
     the skill colour (cool light), u_bg the page colour everything fades to.
     The 0.30 in `k` is how bright the brightest tile gets over the page
     colour; raise it and text on the page starts to fight the background.
     Adapted from the mosaic sky in "mosaic-prompt-template" by Kedhareswer
     Naidu (https://kedhar.pages.dev), MIT License. */
  var FRAG = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'uniform vec2 u_res; uniform float u_time;',
    'uniform vec3 u_bg,u_c1,u_c2,u_c3;',
    'float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}',
    'float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.0-2.0*f);',
    ' return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),u.x),mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),u.x),u.y);}',
    'float fbm(vec2 p){float v=0.0,a=0.5;for(int i=0;i<4;i++){v+=a*noise(p);p=p*2.03+17.0;a*=0.5;}return v;}',
    'void main(){',
    ' vec2 frag=gl_FragCoord.xy;',
    ' float cell=max(u_res.y/34.0,9.0);',
    ' vec2 id=floor(frag/cell); vec2 f=fract(frag/cell);',
    ' vec2 p=(id+0.5)*cell/u_res.y;',
    ' float ax=u_res.x/u_res.y;',
    ' float t=u_time*0.06;',
    ' vec2 l1=vec2(ax*0.78+0.22*sin(t*2.1),0.80+0.10*cos(t*1.7));',
    ' vec2 l2=vec2(ax*0.18-0.20*cos(t*1.3),0.22+0.10*sin(t*2.3));',
    ' vec2 l3=vec2(ax*0.5+0.5*cos(t*0.9+2.0),0.5+0.2*sin(t*1.1));',
    ' float L=0.62*exp(-3.0*dot(p-l1,p-l1))+0.40*exp(-4.0*dot(p-l2,p-l2))+0.22*exp(-6.0*dot(p-l3,p-l3));',
    ' float n=fbm(p*3.0+vec2(t*1.6,-t*1.1));',
    ' L*=0.45+n;',
    ' float h=hash(id);',
    ' L*=0.80+0.28*sin(u_time*(0.5+h*1.4)+h*40.0);',
    ' L=clamp(L,0.0,1.0);',
    ' L=floor(L*7.0+h*0.6)/7.0;',
    ' vec2 q=abs(f-0.5);',
    ' float tile=smoothstep(0.47,0.40,max(q.x,q.y));',
    ' vec3 cool=mix(u_c2,vec3(0.62,0.70,0.86),0.6);',
    ' vec3 tint=mix(cool,u_c1,smoothstep(0.30,0.75,n));',
    ' float k=L*0.30*tile*(0.85+0.3*f.y);',
    ' vec3 col=mix(u_bg,tint,k+0.025*tile);',
    ' vec2 uv=frag/u_res;',
    ' float vig=smoothstep(1.3,0.3,length((uv-0.5)*vec2(1.0,1.1)));',
    ' float lum=dot(u_bg,vec3(0.299,0.587,0.114));',
    ' vec3 edge=u_bg*mix(0.78,0.97,step(0.5,lum));',
    ' col=mix(edge,col,0.55+0.45*vig);',
    ' col+=(hash(mod(frag,64.0)+fract(u_time))-0.5)/255.0;',   // mod keeps the numbers small for GPUs without highp
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
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5) * 0.75;  // the tiles hide the lower resolution, the battery notices it
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
    if (now - lastDraw >= 40) { lastDraw = now; draw(now); } // ~25fps: the tiles drift slowly, more frames would only cost battery
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
