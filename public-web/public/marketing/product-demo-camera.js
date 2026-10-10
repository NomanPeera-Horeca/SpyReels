(function () {
  var MOBILE_MQ = "(max-width: 640px)";
  var REDUCED_MQ = "(prefers-reduced-motion: reduce)";
  var MAX_LOOPS = 2;
  var HOLD_MS = 2500;
  var MOVE_MS = 900;
  var TAP_APPEAR_MS = 300;
  var TAP_PRESS_MS = 220;
  var TAP_RIPPLE_MS = 420;
  var TAP_LEAD_MS = TAP_APPEAR_MS + TAP_PRESS_MS + TAP_RIPPLE_MS + 120;

  var FOCUS = {
    search: { x: 286.4, y: 90.5, w: 587.3, h: 503.4 },
    results: { x: 93.1, y: 95.8, w: 569.0, h: 487.7 },
    winner: { x: 35, y: 120, w: 420, h: 360 },
    remakeA: { x: 100, y: 140, w: 420, h: 360 },
    remakeB: { x: 470, y: 120, w: 560, h: 480 },
    scriptA: { x: 120, y: 80, w: 560, h: 480 },
    scriptB: { x: 620, y: 340, w: 420, h: 360 },
    success: { x: 330, y: 150, w: 500, h: 428.6 },
  };

  var STEPS = [
    { focus: "search", scene: "search", tap: "search" },
    { focus: "results", scene: "results" },
    { focus: "winner", scene: "winner", tap: "winner" },
    { focus: "remakeA", scene: "remake" },
    { focus: "remakeB", scene: "remake", tap: "remake" },
    { focus: "scriptA", scene: "script" },
    { focus: "scriptB", scene: "script", tap: "schedule" },
    { focus: "success", scene: "success" },
  ];

  function isMobile() {
    return window.matchMedia(MOBILE_MQ).matches;
  }

  function prefersReduced() {
    return window.matchMedia(REDUCED_MQ).matches;
  }

  function cameraCss(focus) {
    var f = FOCUS[focus];
    var scale = 350 / f.w;
    return (
      "translate(" +
      (-f.x * scale).toFixed(2) +
      "px, " +
      (-f.y * scale).toFixed(2) +
      "px) scale(" +
      scale.toFixed(4) +
      ")"
    );
  }

  function sleep(ms, alive) {
    return new Promise(function (resolve) {
      var start = performance.now();
      function tick() {
        if (!alive()) {
          resolve();
          return;
        }
        if (performance.now() - start >= ms) {
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }

  async function waitWhile(ms, shouldPause, alive) {
    var left = ms;
    while (left > 0 && alive()) {
      if (shouldPause()) {
        await sleep(50, alive);
        continue;
      }
      var slice = Math.min(40, left);
      await sleep(slice, alive);
      left -= slice;
    }
  }

  function settleScene(shell, sceneName) {
    shell.querySelectorAll(".motion-scene").forEach(function (scene) {
      var active = scene.classList.contains(sceneName + "-scene");
      scene.style.animation = "none";
      scene.style.opacity = active ? "1" : "0";
      if (!active) return;

      scene.querySelectorAll("*").forEach(function (el) {
        el.style.animation = "none";
        el.style.animationPlayState = "paused";
      });

      if (sceneName === "search") {
        scene.querySelectorAll(".type-stage").forEach(function (t) {
          t.style.opacity = t.classList.contains("type-final") ? "1" : "0";
        });
        var caret = scene.querySelector(".type-caret");
        if (caret) caret.style.opacity = "0";
      }

      if (sceneName === "results") {
        scene.querySelectorAll(".motion-reel").forEach(function (reel) {
          reel.style.opacity = "1";
          reel.style.transform = "none";
        });
      }

      if (sceneName === "winner") {
        scene.querySelectorAll(".motion-reel").forEach(function (reel, i) {
          reel.style.opacity = i === 0 ? "1" : "0.28";
          reel.style.transform = "none";
          if (i === 0) reel.classList.remove("is-selected");
        });
        var pill = scene.querySelector(".viral-pill");
        if (pill) {
          pill.style.opacity = "1";
          pill.style.transform = "none";
        }
      }

      if (sceneName === "remake" || sceneName === "script" || sceneName === "success") {
        scene
          .querySelectorAll(
            ".selected-card, .remake-copy, .motion-btn, .script-heading, .voice-badge, .script-paper, .success-mark, .success-message, .calendar-chip, .final-line, .viral-pill"
          )
          .forEach(function (el) {
            el.style.opacity = "1";
            el.style.transform = "none";
          });
      }
    });

    shell.querySelectorAll(".tap-indicator").forEach(function (el) {
      el.classList.remove("tap-appear", "tap-press", "tap-ripple-run");
    });
    shell.querySelectorAll(".is-pressed").forEach(function (el) {
      el.classList.remove("is-pressed");
    });
  }

  function tapTarget(shell, tap) {
    if (tap === "search") return shell.querySelector(".search-btn");
    if (tap === "remake") return shell.querySelector(".remake-btn");
    if (tap === "schedule") return shell.querySelector(".schedule-btn");
    return shell.querySelector(".winner-grid .motion-reel:first-child");
  }

  async function playTap(shell, tap, shouldPause, alive) {
    var target = tapTarget(shell, tap);
    if (!target) return;
    var indicator = target.querySelector(".tap-indicator");
    if (!indicator) return;

    indicator.classList.remove("tap-press", "tap-ripple-run");
    indicator.classList.add("tap-appear");
    await waitWhile(TAP_APPEAR_MS, shouldPause, alive);
    if (!alive()) return;

    indicator.classList.add("tap-press");
    target.classList.add("is-pressed");
    await waitWhile(TAP_PRESS_MS, shouldPause, alive);
    if (!alive()) return;

    indicator.classList.add("tap-ripple-run");
    if (tap === "winner") target.classList.add("is-selected");
    await waitWhile(TAP_RIPPLE_MS, shouldPause, alive);

    target.classList.remove("is-pressed");
    indicator.classList.remove("tap-appear", "tap-press", "tap-ripple-run");
  }

  function freezeSuccess(shell, camera, stage) {
    settleScene(shell, "success");
    camera.style.transition = "none";
    camera.style.transform = cameraCss("success");
    stage.setAttribute("data-product-demo-stopped", "true");
  }

  function initStage(stage) {
    if (stage.getAttribute("data-product-demo-booted")) return function () {};
    stage.setAttribute("data-product-demo-booted", "1");

    var camera = stage.querySelector(".product-demo-camera-scene");
    var shell = stage.querySelector(".motion-shell");
    if (!shell || !camera) return function () {};

    var userPaused = false;
    var offscreen = false;
    var stopped = false;
    var loopsCompleted = 0;
    var runId = 0;

    function shouldPause() {
      return userPaused || offscreen;
    }

    function disableCssTimeline() {
      camera.style.animation = "none";
      shell.querySelectorAll(".motion-scene, .motion-scene *").forEach(function (el) {
        el.style.animationPlayState = "paused";
      });
    }

    async function runLoop(id) {
      function isAlive() {
        return id === runId && !stopped && isMobile() && !prefersReduced();
      }

      disableCssTimeline();
      camera.style.transition = "none";
      camera.style.transform = cameraCss("search");
      settleScene(shell, "search");

      for (var i = 0; i < STEPS.length; i++) {
        if (!isAlive()) return;
        var step = STEPS[i];
        var next = STEPS[i + 1];

        settleScene(shell, step.scene);
        if (i === 0) {
          camera.style.transition = "none";
          camera.style.transform = cameraCss(step.focus);
        }

        var holdBeforeTap = step.tap ? Math.max(500, HOLD_MS - TAP_LEAD_MS) : HOLD_MS;
        await waitWhile(holdBeforeTap, shouldPause, isAlive);
        if (!isAlive()) return;

        if (step.tap) {
          await playTap(shell, step.tap, shouldPause, isAlive);
          if (!isAlive()) return;
          await waitWhile(100, shouldPause, isAlive);
        }

        if (!next) break;

        settleScene(shell, next.scene);
        camera.style.transition = "transform " + MOVE_MS + "ms ease-in-out";
        void camera.offsetWidth;
        camera.style.transform = cameraCss(next.focus);
        await waitWhile(MOVE_MS, shouldPause, isAlive);
      }

      if (!isAlive()) return;

      loopsCompleted += 1;
      if (loopsCompleted >= MAX_LOOPS) {
        stopped = true;
        freezeSuccess(shell, camera, stage);
        return;
      }
      runLoop(id);
    }

    function startMobile() {
      if (!isMobile()) return;
      stage.setAttribute("data-product-demo-driver", "mobile");
      if (prefersReduced()) {
        stopped = true;
        disableCssTimeline();
        freezeSuccess(shell, camera, stage);
        stage.setAttribute("data-product-demo-reduced", "true");
        return;
      }
      stopped = false;
      stage.removeAttribute("data-product-demo-stopped");
      stage.removeAttribute("data-product-demo-reduced");
      runId += 1;
      runLoop(runId);
    }

    function stopDriver() {
      runId += 1;
    }

    var io = new IntersectionObserver(
      function (entries) {
        var entry = entries[0];
        if (!entry) return;
        offscreen = !entry.isIntersecting;
      },
      { threshold: 0.2 }
    );
    io.observe(stage);

    stage.addEventListener("click", function () {
      if (!isMobile() || prefersReduced() || stopped) return;
      userPaused = !userPaused;
      if (userPaused) stage.setAttribute("data-product-demo-paused", "true");
      else stage.removeAttribute("data-product-demo-paused");
    });

    var mobileMq = window.matchMedia(MOBILE_MQ);
    var reducedMq = window.matchMedia(REDUCED_MQ);
    function onEnvChange() {
      stopDriver();
      if (isMobile()) startMobile();
    }
    if (mobileMq.addEventListener) mobileMq.addEventListener("change", onEnvChange);
    else mobileMq.addListener(onEnvChange);
    if (reducedMq.addEventListener) reducedMq.addEventListener("change", onEnvChange);
    else reducedMq.addListener(onEnvChange);

    if (isMobile()) startMobile();

    return function () {
      stopDriver();
      io.disconnect();
    };
  }

  function boot() {
    document.querySelectorAll("[data-product-demo-camera]").forEach(initStage);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  window.__spyreelsProductDemoCameraBoot = boot;
})();
