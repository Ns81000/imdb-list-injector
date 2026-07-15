/* Zoom Out — landing page interactions
   All effects honor prefers-reduced-motion. */

(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ==========================================================
     1. Split-text hero title — each word slides up from a
        clipped line, staggered.
     ========================================================== */
  document.querySelectorAll("[data-split]").forEach((el) => {
    const words = el.textContent.trim().split(/\s+/);
    el.textContent = "";
    words.forEach((word, i) => {
      const clip = document.createElement("span");
      clip.className = "w";
      const inner = document.createElement("span");
      inner.textContent = word;
      inner.style.transitionDelay = `${120 + i * 90}ms`;
      clip.appendChild(inner);
      el.appendChild(clip);
      if (i < words.length - 1) el.appendChild(document.createTextNode(" "));
    });
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("in")));
  });

  /* ==========================================================
     2. Scroll reveal — IntersectionObserver adds .in once.
     ========================================================== */
  const revealables = document.querySelectorAll(".reveal");
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        const d = e.target.getAttribute("data-delay");
        if (d) e.target.style.setProperty("--rd", `${d}ms`);
        e.target.classList.add("in");
        io.unobserve(e.target);
      }
    }
  }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
  revealables.forEach((el) => io.observe(el));

  /* ==========================================================
     3. Count-up stats.
     ========================================================== */
  const counters = document.querySelectorAll("[data-count]");
  const cio = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      cio.unobserve(e.target);
      const el = e.target;
      const end = parseInt(el.dataset.count, 10);
      const suffix = el.dataset.suffix || "";
      if (reduceMotion || end === 0) { el.textContent = end + suffix; continue; }
      const t0 = performance.now();
      const dur = 1400;
      const tick = (t) => {
        const p = Math.min((t - t0) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 4);
        el.textContent = Math.round(end * eased) + suffix;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  }, { threshold: 0.5 });
  counters.forEach((el) => cio.observe(el));

  /* ==========================================================
     4. Nav — scrolled state, progress bar, mobile drawer.
     ========================================================== */
  const nav = document.querySelector(".nav");
  const progress = document.querySelector(".scroll-progress");
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      nav.classList.toggle("scrolled", window.scrollY > 24);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`;
      ticking = false;
    });
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  const toggle = document.querySelector(".nav-toggle");
  const drawer = document.querySelector(".nav-drawer");
  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!open));
    drawer.hidden = open;
  });
  drawer.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => {
      toggle.setAttribute("aria-expanded", "false");
      drawer.hidden = true;
    })
  );

  /* ==========================================================
     5. Copy buttons.
     ========================================================== */
  document.querySelectorAll(".copy-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const target = document.getElementById(btn.dataset.copy);
      if (!target) return;
      try {
        await navigator.clipboard.writeText(target.textContent.trim());
        btn.classList.add("copied");
        setTimeout(() => btn.classList.remove("copied"), 1600);
      } catch { /* clipboard unavailable — ignore */ }
    });
  });

  /* ==========================================================
     6. Theater demo — cycles through real titles (artwork from
        TMDB, self-hosted) with a type-out title, crossfading
        backdrops, and swapping posters. Images are preloaded.
     ========================================================== */
  const titleEl = document.getElementById("theater-title");
  if (titleEl) {
    const yearEl = document.getElementById("theater-year");
    const runtimeEl = document.getElementById("theater-runtime");
    const ratingEl = document.getElementById("theater-rating");
    const posterEl = document.getElementById("theater-poster-img");
    const layers = [document.getElementById("bd-a"), document.getElementById("bd-b")];
    let front = 0;
    layers[0].classList.add("on");

    const shows = [
      { t: "Interstellar", y: "2014", r: "2h 49m", s: "8.5", img: "interstellar" },
      { t: "Blade Runner 2049", y: "2017", r: "2h 44m", s: "7.6", img: "bladerunner" },
      { t: "Dune: Part Two", y: "2024", r: "2h 47m", s: "8.1", img: "dune" },
      { t: "Breaking Bad", y: "2008", r: "5 seasons", s: "8.9", img: "breakingbad" },
      { t: "Spirited Away", y: "2001", r: "2h 05m", s: "8.5", img: "spirited" },
    ];
    let idx = 0;
    let typeTimer = 0;

    // preload all artwork once the section is near, so swaps are instant
    let preloaded = false;
    const preload = () => {
      if (preloaded) return;
      preloaded = true;
      shows.forEach((s) => {
        new Image().src = `assets/stills/${s.img}-bd.jpg`;
        new Image().src = `assets/stills/${s.img}-p.jpg`;
      });
    };

    const typeTitle = (text) => {
      clearTimeout(typeTimer);
      if (reduceMotion) { titleEl.textContent = text; return; }
      let i = 0;
      titleEl.textContent = "";
      const step = () => {
        titleEl.textContent = text.slice(0, ++i);
        if (i < text.length) typeTimer = setTimeout(step, 34 + Math.random() * 40);
      };
      step();
    };

    const show = (s) => {
      typeTitle(s.t);
      yearEl.textContent = s.y;
      runtimeEl.textContent = s.r;
      ratingEl.textContent = s.s;

      // crossfade backdrop on the back buffer
      const back = layers[1 - front];
      back.onload = () => {
        back.classList.add("on");
        layers[front].classList.remove("on");
        front = 1 - front;
        back.onload = null;
      };
      back.src = `assets/stills/${s.img}-bd.jpg`;

      // poster: quick dip-to-black swap
      posterEl.style.opacity = "0";
      const p = new Image();
      p.onload = () => {
        posterEl.src = p.src;
        posterEl.style.opacity = "1";
      };
      p.src = `assets/stills/${s.img}-p.jpg`;
    };

    let cycler = 0;
    const tio = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) preload();
      if (e.isIntersecting && !cycler) {
        cycler = setInterval(() => {
          idx = (idx + 1) % shows.length;
          show(shows[idx]);
        }, 4000);
      } else if (!e.isIntersecting && cycler) {
        clearInterval(cycler);
        cycler = 0;
      }
    }, { threshold: 0.3, rootMargin: "200px 0px" });
    tio.observe(document.getElementById("theater"));
  }

  /* ==========================================================
     7. Mobile lock — the site is desktop-only. The overlay is
        permanent on small screens: no dismiss, re-checked on
        resize and rotation.
     ========================================================== */
  const applyMobileLock = () => {
    const isMobile = window.innerWidth <= 800;
    document.body.classList.toggle("mobile-locked", isMobile);
    document.documentElement.classList.toggle("mobile-locked", isMobile);
    if (isMobile) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document.body.classList.add("mobile-overlay-visible");
        });
      });
    } else {
      document.body.classList.remove("mobile-overlay-visible");
    }
  };

  applyMobileLock();
  window.addEventListener("resize", applyMobileLock, { passive: true });
  window.addEventListener("orientationchange", applyMobileLock, { passive: true });
})();
