// 新版落地页的交互脚本（原为 landing.html 的内联 <script>，现抽为 Vite 模块，
// 以便直接复用经典登录页同一份登录实现）。
import { performLogin } from "./loginFlow.js";

(function(){
  "use strict";

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) document.body.classList.add("reduce");

  var theme = { accent: "#35C2D6" };
  var t = 0;

  function fit(canvas){
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var rect = canvas.parentElement.getBoundingClientRect();
    var w = Math.max(1, Math.round(rect.width));
    var h = Math.max(1, Math.round(rect.height));
    canvas.style.width = w + "px"; canvas.style.height = h + "px";
    canvas.width = Math.round(w*dpr); canvas.height = Math.round(h*dpr);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h };
  }
  function easeInOut(x){ return x < 0.5 ? 2*x*x : 1 - Math.pow(-2*x + 2, 2)/2; }
  function clamp(v, a, b){ return v < a ? a : (v > b ? b : v); }
  function smooth(e0, e1, x){ return easeInOut(clamp((x - e0)/(e1 - e0), 0, 1)); }

  var CORE = "#E2397D";
  var LOGO_RING_N = 150, LOGO_CORE_N = 84, LOGO_ARR_N = 40;
  function logoPoints(k){
    var out = [], i;
    var ringN = Math.round(LOGO_RING_N*k), coreN = Math.round(LOGO_CORE_N*k), arrN = Math.round(LOGO_ARR_N*k);
    for (i = 0; i < ringN; i++){
      var a = (340 + 310*(i/ringN))*Math.PI/180;
      out.push({ x: 120 + 62*Math.cos(a), y: 120 + 62*Math.sin(a), c: 0 });
    }
    var sq = [[103,103],[137,103],[137,137],[103,137]];
    for (i = 0; i < coreN; i++){
      var tt = (i/coreN)*4, s = Math.floor(tt), u = tt - s;
      var A = sq[s], B = sq[(s+1)%4];
      out.push({ x: A[0]+(B[0]-A[0])*u, y: A[1]+(B[1]-A[1])*u, c: 1 });
    }
    var co = Math.cos(Math.PI/4), si = Math.sin(Math.PI/4);
    function rot(p){ return { x: 163.8 + p[0]*co - p[1]*si, y: 76.2 + p[0]*si + p[1]*co }; }
    var tri = [rot([-9,-9]), rot([11,0]), rot([-9,9])];
    for (i = 0; i < arrN; i++){
      var u2 = (i/arrN)*3, s2 = Math.floor(u2), v2 = u2 - s2;
      var A2 = tri[s2], B2 = tri[(s2+1)%3];
      out.push({ x: A2.x+(B2.x-A2.x)*v2, y: A2.y+(B2.y-A2.y)*v2, c: 0 });
    }
    return out;
  }

  /* hero: 3D point-cloud ring, slow rotation */
  var heroCanvas = document.getElementById("heroCanvas");
  var hero = (function(){
    var ctx, w, h, pts = [];
    function rebuild(){
      var n = Math.round(reduce ? 420 : 900);
      pts = [];
      for (var i = 0; i < n; i++){
        var u = Math.random()*Math.PI*2, v = Math.random()*Math.PI*2;
        var R = 1, r = 0.30;
        pts.push({ x:(R + r*Math.cos(v))*Math.cos(u), y: r*Math.sin(v), z:(R + r*Math.cos(v))*Math.sin(u) });
      }
      var e = 0.18;
      for (var a = -1; a <= 1; a += 2) for (var b = -1; b <= 1; b += 2) for (var c = -1; c <= 1; c += 2)
        pts.push({ x:a*e, y:b*e, z:c*e, core:true });
    }
    function resize(){ var f = fit(heroCanvas); ctx = f.ctx; w = f.w; h = f.h; rebuild(); }
    function render(){
      ctx.clearRect(0, 0, w, h);
      var ay = t*0.16, ax = 0.52;
      var scale = Math.min(w, h)*0.30, f2 = 3.2, cx = w/2, cy = h/2;
      var out = [];
      for (var i = 0; i < pts.length; i++){
        var p = pts[i];
        var x1 = p.x*Math.cos(ay) + p.z*Math.sin(ay);
        var z1 = -p.x*Math.sin(ay) + p.z*Math.cos(ay);
        var y2 = p.y*Math.cos(ax) - z1*Math.sin(ax);
        var z2 = p.y*Math.sin(ax) + z1*Math.cos(ax);
        var s = f2/(f2 + z2*0.6);
        out.push({ sx: cx + x1*scale*s, sy: cy + y2*scale*s, d: z2, s: s, c: p.core });
      }
      out.sort(function(a, b){ return b.d - a.d; });
      for (var k = 0; k < out.length; k++){
        var o = out[k];
        ctx.globalAlpha = Math.max(0.06, Math.min(0.75, (1.7 - o.d)/3.0));
        ctx.fillStyle = o.c ? CORE : theme.accent;
        ctx.beginPath(); ctx.arc(o.sx, o.sy, o.c ? 2.2 : (1.5*o.s*0.8 + 0.4), 0, Math.PI*2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    return { resize: resize, render: render };
  })();

  /* pinned: scroll-driven assembly of the closed-loop logo */
  var asmCanvas = document.getElementById("asmCanvas");
  var asm = (function(){
    var ctx, w, h, parts = [], nodes = [];
    function rebuild(){
      var src = logoPoints(reduce ? 0.6 : 1.0), S = 1/85, i;
      parts = src.map(function(o){
        var u = Math.random()*Math.PI*2, v = Math.random()*Math.PI*2;
        var R = 1.35, r = 0.40;
        return {
          tx:(o.x-120)*S, ty:(o.y-120)*S, tz:0,
          sx:(R + r*Math.cos(v))*Math.cos(u),
          sy:r*Math.sin(v) + (Math.random()-0.5)*0.2,
          sz:(R + r*Math.cos(v))*Math.sin(u),
          c:o.c, ph: Math.random()*Math.PI*2
        };
      });
      nodes = [];
      for (i = 0; i < 6; i++){
        var a = (340 + 310*((i + 0.5)/6)) * Math.PI/180;
        nodes.push({ x: (120 + 62*Math.cos(a) - 120)*S, y: (120 + 62*Math.sin(a) - 120)*S });
      }
    }
    function resize(){ var f = fit(asmCanvas); ctx = f.ctx; w = f.w; h = f.h; rebuild(); }
    function project(x, y, z, ay, ax, scale, f2, cx, cy){
      var x1 = x*Math.cos(ay) + z*Math.sin(ay);
      var z1 = -x*Math.sin(ay) + z*Math.cos(ay);
      var y2 = y*Math.cos(ax) - z1*Math.sin(ax);
      var z2 = y*Math.sin(ax) + z1*Math.cos(ax);
      var s = f2/(f2 + z2*0.6);
      return { sx: cx + x1*scale*s, sy: cy + y2*scale*s, d: z2, s: s };
    }
    function render(e, lit){
      ctx.clearRect(0, 0, w, h);
      var ay = (1.25*Math.sin(t*0.55) + 0.32*Math.sin(t*1.27)) * (1 - e) + Math.sin(t*0.42)*0.16*e;
      var ax = (0.56 + 0.12*Math.sin(t*0.47)) * (1 - e) + (0.075 + Math.sin(t*0.29)*0.03)*e;
      var scale = Math.min(w, h) * (0.22 + 0.14*e);
      var f2 = 3.2, cx = w/2, cy = h*0.40;
      var out = [];
      for (var i = 0; i < parts.length; i++){
        var p = parts[i];
        var pr = project(
          p.sx + (p.tx - p.sx)*e,
          p.sy + (p.ty - p.sy)*e,
          p.sz + (p.tz - p.sz)*e,
          ay, ax, scale, f2, cx, cy
        );
        var jx = Math.sin(t*1.9 + p.ph)*2.2*(1 - e)*e*4;
        out.push({ sx: pr.sx + jx, sy: pr.sy, d: pr.d, s: pr.s, c: p.c });
      }
      out.sort(function(a, b){ return b.d - a.d; });
      for (var k = 0; k < out.length; k++){
        var o = out[k];
        ctx.globalAlpha = Math.max(0.07, Math.min(1, (1.7 - o.d)/2.3)) * (0.42 + 0.58*e);
        ctx.fillStyle = o.c ? CORE : theme.accent;
        ctx.beginPath(); ctx.arc(o.sx, o.sy, o.c ? 2.35 : (1.55*o.s*0.85 + 0.45), 0, Math.PI*2); ctx.fill();
      }
      var glow = clamp((e - 0.9)/0.1, 0, 1);
      if (glow > 0){
        for (var ni = 0; ni < nodes.length; ni++){
          var npr = project(nodes[ni].x, nodes[ni].y, 0, ay, ax, scale, f2, cx, cy);
          var on = ni < lit;
          ctx.globalAlpha = glow * (on ? 0.20 : 0.05);
          ctx.fillStyle = theme.accent;
          ctx.beginPath(); ctx.arc(npr.sx, npr.sy, 16, 0, Math.PI*2); ctx.fill();
          ctx.globalAlpha = glow * (on ? 1 : 0.16);
          ctx.fillStyle = on ? theme.accent : "rgba(146,180,220,.55)";
          ctx.beginPath(); ctx.arc(npr.sx, npr.sy, on ? 5.4 : 3.0, 0, Math.PI*2); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
    return { resize: resize, render: render };
  })();

  var track = document.getElementById("pinTrack");
  var lineA = document.getElementById("lineA");
  var lineB = document.getElementById("lineB");
  var lineC = document.getElementById("lineC");
  var chips = Array.prototype.slice.call(document.querySelectorAll("#stageChips span"));
  var pinBar = document.getElementById("pinBar");
  var nav = document.getElementById("nav");

  var forced = null;
  (function(){
    var mm = /[?&]p=([0-9]*\.?[0-9]+)/.exec(location.search);
    if (mm) forced = clamp(parseFloat(mm[1]), 0, 1);
  })();

  function pinProgress(){
    if (forced !== null) return forced;
    var total = track.offsetHeight - window.innerHeight;
    if (total <= 0) return reduce ? 1 : 0;
    return clamp(-track.getBoundingClientRect().top / total, 0, 1);
  }

  /* role switcher */
  var segBtns = Array.prototype.slice.call(document.querySelectorAll(".seg-btn"));
  var segInd = document.getElementById("segInd");
  var rolePanels = Array.prototype.slice.call(document.querySelectorAll(".role-panel"));
  segBtns.forEach(function(btn, i){
    btn.addEventListener("click", function(){
      segBtns.forEach(function(b, k){
        var on = k === i;
        b.classList.toggle("active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
      segInd.style.transform = "translateX(" + (i*136) + "px)";
      rolePanels.forEach(function(p){
        p.classList.toggle("active", p.getAttribute("data-panel") === btn.getAttribute("data-role"));
      });
    });
  });

  /* reveal on scroll */
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(en){
      if (en.isIntersecting){ en.target.classList.add("in"); io.unobserve(en.target); }
    });
  }, { threshold: 0.16, rootMargin: "0px 0px -8% 0px" });
  Array.prototype.slice.call(document.querySelectorAll(".reveal")).forEach(function(el){ io.observe(el); });

  /* count up */
  var cio = new IntersectionObserver(function(entries){
    entries.forEach(function(en){
      if (!en.isIntersecting) return;
      var el = en.target, target = parseInt(el.getAttribute("data-count"), 10) || 0;
      cio.unobserve(el);
      if (reduce){ el.textContent = String(target); return; }
      var start = null, dur = 1100;
      function step(now){
        if (start === null) start = now;
        var k = clamp((now - start)/dur, 0, 1);
        el.textContent = String(Math.round(target * easeInOut(k)));
        if (k < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }, { threshold: 0.5 });
  Array.prototype.slice.call(document.querySelectorAll("[data-count]")).forEach(function(el){ cio.observe(el); });

  var ro = new ResizeObserver(function(){
    hero.resize(); asm.resize();
  });
  ro.observe(document.body);
  hero.resize(); asm.resize();

  var last = performance.now();
  function loop(now){
    var dt = Math.min(60, now - last)/1000;
    last = now;
    if (!reduce) t += dt;

    var p = pinProgress();
    var e = reduce ? 1 : smooth(0.08, 0.52, p);
    var lit = reduce ? 6 : Math.round(clamp((p - 0.60)/0.056, 0, 6));
    asm.render(e, lit);

    if (reduce){
      lineA.style.opacity = "0"; lineB.style.opacity = "0"; lineC.style.opacity = "1";
    } else {
      lineA.style.opacity = String(clamp(1 - (p - 0.10)/0.16, 0, 1));
      lineB.style.opacity = String(clamp((p - 0.18)/0.14, 0, 1) * clamp(1 - (p - 0.44)/0.14, 0, 1));
      lineC.style.opacity = String(clamp((p - 0.48)/0.14, 0, 1));
    }
    for (var ci = 0; ci < chips.length; ci++) chips[ci].classList.toggle("lit", ci < lit);
    pinBar.style.width = (p*100).toFixed(1) + "%";

    hero.render();
    nav.classList.toggle("scrolled", window.scrollY > 24);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(function(now){ last = now; requestAnimationFrame(loop); });

})();

/* ---------- 真实登录：复用 src/loginFlow.js 的 performLogin（与经典登录页同一份逻辑） ---------- */
(function () {
  "use strict";
  var form = document.getElementById("landingLogin");
  if (!form) return;
  var errBox = document.getElementById("loginErr");
  var submitBtn = document.getElementById("loginSubmit");
  var backLink = document.getElementById("backClassic");
  var appHref = import.meta.env.BASE_URL;

  // 「返回经典登录」指向应用入口（index.html），随部署 base 变化
  if (backLink) backLink.href = appHref;

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    var username = String(form.elements.username.value || "").trim();
    var password = String(form.elements.password.value || "");
    errBox.hidden = true;
    errBox.textContent = "";
    submitBtn.disabled = true;
    submitBtn.textContent = "正在登录…";

    var result = await performLogin(username, password);

    if (!result.ok) {
      errBox.textContent = result.error;
      errBox.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = "进入系统";
      return;
    }

    // 登录成功：会话已写入 localStorage，跳回应用即可直接进入
    window.location.href = appHref;
  });
})();
