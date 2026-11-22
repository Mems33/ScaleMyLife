/* ScaleMyLife motion layer (fx.js).

   What this file is: the small animations that make the game feel like a game.
   A "+25 XP" chip that flies into the XP bar, the combo pill, the LOCKED IN
   stamp, number counters on the celebration screens, the pulse on a header
   pill when its value changes.

   What it is NOT: game logic. Nothing here reads or writes the save, pays XP
   or decides what happens. app.js calls these helpers and always guards the
   call with `window.FX &&`, so if this file fails to load, or you delete it,
   every button in the app still works and only the flourishes are gone.

   Three rules every helper follows:
   1. Reduced motion wins. If the device asks for less motion, a helper either
      does nothing or jumps straight to the end state. Nothing is ever left
      half-shown.
   2. Transform and opacity only. Those are the two properties a phone can
      animate without re-laying out the page, which is what keeps this smooth
      on a cheap Android.
   3. Every element a helper adds to the page removes itself again. If you add
      a helper, give it a timeout or an onfinish that calls remove(), or the
      page slowly fills with invisible leftovers.

   ES5 on purpose, like the rest of the app: no build step, no modules. */
(function (root) {
  'use strict';
  var doc = root.document;

  function reduced() {
    try { return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); }
    catch (e) { return false; }
  }
  /* The Web Animations API (el.animate) is missing in very old browsers and in
     the test harness. Helpers that need it check here and fall back to simply
     cleaning up after themselves. */
  function canAnimate(el) { return !reduced() && !!el && typeof el.animate === 'function'; }

  var FX = { reduced: reduced };

  /* Restart a CSS animation on an element by re-adding its class. Reading
     offsetWidth in between is what forces the browser to notice the class was
     gone; without that line the second add is ignored and nothing replays. */
  FX.bump = function (el, cls) {
    if (!el || !el.classList) return;
    cls = cls || 'fx-bump';
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  };

  /* Count a number up (or down) inside an element, easing out so it slows as
     it lands. `fmt` turns the number into text ("12 days"). With reduced
     motion, or where requestAnimationFrame is missing, the final value is
     written at once. The final value is ALWAYS what ends up on screen. */
  FX.count = function (el, from, to, ms, fmt) {
    if (!el) return;
    fmt = fmt || function (n) { return String(n); };
    if (reduced() || !root.requestAnimationFrame || from === to || !(ms > 0)) { el.textContent = fmt(to); return; }
    var t0 = null;
    el.textContent = fmt(from);
    function step(t) {
      if (t0 === null) t0 = t;
      var p = Math.min(1, (t - t0) / ms), eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(Math.round(from + (to - from) * eased));
      if (p < 1) root.requestAnimationFrame(step);
    }
    root.requestAnimationFrame(step);
  };

  /* A bar that fills from where it was instead of jumping. This one helper is
     the exception to rule 2 above: it animates the bar's width, through the
     width transition styles.css already gives every .bar fill. Moving it to a
     transform would mean restyling every bar in the app. app.js rebuilds the
     header on every action, so a fresh bar would otherwise appear already
     full. We put it back at the old width with the transition switched off,
     force one layout, then let the stylesheet's own transition carry it to
     the new width. The new width is set in the same tick, so anything reading
     the bar right away sees the final value. */
  FX.grow = function (fill, fromPct) {
    if (!fill || !fill.style || reduced() || !(fromPct >= 0)) return;
    var to = fill.style.width;
    fill.style.transition = 'none';
    fill.style.width = Math.max(0, Math.min(100, fromPct)) + '%';
    void fill.offsetWidth;
    fill.style.transition = '';
    fill.style.width = to;
  };

  /* A small chip ("+25 XP") that rises from where the user tapped and flies
     into a target (the XP bar, the coin purse), which then pulses. `done` runs
     when it lands. Skipped entirely under reduced motion: the toast already
     says the same thing in words. */
  FX.flyText = function (text, x, y, target, cls, done) {
    if (reduced() || !doc || !doc.body) { if (done) done(); return; }
    var el = doc.createElement('div');
    el.className = 'fx-fly' + (cls ? ' ' + cls : '');
    el.setAttribute('aria-hidden', 'true');
    el.textContent = text;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    doc.body.appendChild(el);
    function finish() { if (el.parentNode) el.parentNode.removeChild(el); if (target) FX.bump(target, 'fx-land'); if (done) done(); }
    if (!canAnimate(el) || !target || !target.getBoundingClientRect) { root.setTimeout(finish, 650); return; }
    var r = target.getBoundingClientRect();
    var dx = r.left + r.width / 2 - x, dy = r.top + r.height / 2 - y;
    /* An older engine can reject calc() inside keyframes and throw here. The
       chip must still be removed, so a throw falls back to the timed cleanup. */
    var anim;
    try { anim = el.animate([
      { transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 },
      { transform: 'translate(-50%,-150%) scale(1.12)', opacity: 1, offset: 0.22 },
      { transform: 'translate(-50%,-170%) scale(1)', opacity: 1, offset: 0.5 },
      { transform: 'translate(calc(-50% + ' + dx + 'px),calc(-50% + ' + dy + 'px)) scale(.45)', opacity: 0.25 }
    ], { duration: 880, easing: 'cubic-bezier(.3,.1,.3,1)' }); }
    catch (e) { root.setTimeout(finish, 650); return; }
    anim.onfinish = finish;
    anim.oncancel = finish;
  };

  /* The combo pill: clear two things in quick succession and "COMBO x2" drops
     in at the top of the screen. One pill at a time: a new hit replaces the
     old pill instead of stacking. Purely cosmetic, it pays nothing. */
  var comboTimer = null;
  FX.combo = function (n) {
    if (reduced() || !doc || !doc.body || !(n >= 2)) return;
    var el = doc.getElementById('fxCombo');
    if (!el) {
      el = doc.createElement('div');
      el.id = 'fxCombo';
      el.setAttribute('aria-hidden', 'true');
      doc.body.appendChild(el);
    }
    el.className = 'fx-combo' + (n >= 5 ? ' hot' : n >= 3 ? ' warm' : '');
    el.textContent = 'COMBO ×' + n;
    FX.bump(el, 'show');
    root.clearTimeout(comboTimer);
    comboTimer = root.setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 1700);
  };

  /* A word that slams in over the page and fades ("LOCKED IN"). */
  FX.stamp = function (text) {
    if (reduced() || !doc || !doc.body) return;
    var el = doc.createElement('div');
    el.className = 'fx-stamp';
    el.setAttribute('aria-hidden', 'true');
    el.textContent = text;
    doc.body.appendChild(el);
    root.setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 1100);
  };

  root.FX = FX;
})(window);
