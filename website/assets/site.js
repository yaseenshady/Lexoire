const initialMouseX = window.innerWidth / 2;
const initialMouseY = window.innerHeight / 2;

const state = {
  scroll: 0,
  scrollVelocity: 0,
  targetScrollVelocity: 0,
  mouseX: initialMouseX,
  mouseY: initialMouseY,
  targetMouseX: initialMouseX,
  targetMouseY: initialMouseY,
  visible: true,
  reducedMotion: false,
};

const RELEASES_PAGE_URL = "https://github.com/yaseensh/Lexoire/releases/latest";
const RELEASES_API_URL = "https://api.github.com/repos/yaseensh/Lexoire/releases/latest";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const isWindows = () => /Win/i.test(window.navigator.platform || window.navigator.userAgent || "");

const readMotionPreference = () => {
  const query = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  return Boolean(query?.matches);
};

const hasFinePointer = () => {
  const query = window.matchMedia ? window.matchMedia("(hover: hover) and (pointer: fine)") : null;
  return Boolean(query?.matches);
};

const hasForcedColors = () => {
  const query = window.matchMedia ? window.matchMedia("(forced-colors: active)") : null;
  return Boolean(query?.matches);
};

const setupEffectFallbacks = () => {
  const root = document.documentElement;
  const supportsBlendMode = typeof CSS === "undefined" || typeof CSS.supports !== "function"
    ? true
    : CSS.supports("mix-blend-mode", "screen");
  const supportsBackdropFilter = typeof CSS === "undefined" || typeof CSS.supports !== "function"
    ? true
    : CSS.supports("backdrop-filter", "blur(3px)") || CSS.supports("-webkit-backdrop-filter", "blur(3px)");
  const forcedColors = hasForcedColors();

  root.classList.toggle("is-windows", isWindows());
  root.classList.toggle("visual-effects-fallback", forcedColors || !supportsBlendMode);
  root.classList.toggle("glass-effects-fallback", forcedColors || !supportsBackdropFilter);
};

const getAnimationProfile = () => {
  const width = window.innerWidth;
  const dpr = window.devicePixelRatio || 1;
  const windows = isWindows();

  if (state.reducedMotion) {
    return { dpr: 1, matrixFps: 0, flowFps: 12, sphereDots: 420, particles: 8, circuits: 2, gridStep: 84 };
  }

  if (width < 640) {
    return { dpr: 1, matrixFps: 16, flowFps: 30, sphereDots: 520, particles: 22, circuits: 5, gridStep: 72 };
  }

  if (width < 1024) {
    return { dpr: Math.min(dpr, windows ? 1 : 1.1), matrixFps: windows ? 16 : 20, flowFps: windows ? 30 : 40, sphereDots: windows ? 640 : 900, particles: windows ? 28 : 42, circuits: windows ? 5 : 8, gridStep: 62 };
  }

  return { dpr: Math.min(dpr, windows ? 1 : 1.35), matrixFps: windows ? 18 : 24, flowFps: windows ? 30 : 60, sphereDots: windows ? 900 : 1500, particles: windows ? 42 : 72, circuits: windows ? 7 : 12, gridStep: 56 };
};

const setCurrentYear = () => {
  document.querySelectorAll("[data-current-year]").forEach((element) => {
    element.textContent = String(new Date().getFullYear());
  });
};

const setupNav = () => {
  const nav = document.querySelector("[data-site-nav]");
  const toggle = document.querySelector("[data-nav-toggle]");

  if (nav) {
    const syncScrolled = () => {
      nav.classList.toggle("is-scrolled", window.scrollY > 8);
    };

    syncScrolled();
    window.addEventListener("scroll", syncScrolled, { passive: true });
  }

  if (toggle) {
    toggle.addEventListener("click", () => {
      document.body.classList.toggle("nav-open");
    });
  }
};

const setupScrollSpy = () => {
  const links = Array.from(document.querySelectorAll("[data-scroll-nav] a[href^='#']"));
  const targets = links
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);

  if (!links.length || !targets.length || !("IntersectionObserver" in window)) return;

  const activate = (id) => {
    links.forEach((link) => {
      const active = link.getAttribute("href") === `#${id}`;
      link.classList.toggle("active", active);
      const parentDetails = link.closest("details");
      if (active && parentDetails) {
        parentDetails.open = true;
      }
    });
  };

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

      if (visible?.target?.id) activate(visible.target.id);
    },
    { rootMargin: "-30% 0px -55% 0px", threshold: [0.2, 0.4, 0.6] },
  );

  targets.forEach((target) => observer.observe(target));
};

const setupReveal = () => {
  const elements = Array.from(document.querySelectorAll(".terminal-reveal, .terminal-line, .section-rule"));
  elements.forEach((element, index) => {
    element.style.setProperty("--delay", `${Math.min(index * 28, 240)}ms`);
  });

  if (!("IntersectionObserver" in window)) {
    elements.forEach((element) => {
      element.classList.add("is-visible");
    });
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
        }
      });
    },
    { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
  );

  elements.forEach((element) => observer.observe(element));
};

const setupCenteredArticleLinks = () => {
  const links = Array.from(document.querySelectorAll("[data-center-link]"));
  const articles = Array.from(document.querySelectorAll("[data-center-article]"));
  if (!links.length || !articles.length) return;

  const focusArticle = (target) => {
    articles.forEach((article) => {
      article.classList.toggle("is-focused", article === target);
    });
  };

  const scrollToArticle = (hash, updateHistory = true) => {
    if (!hash || hash === "#") return false;

    const id = decodeURIComponent(hash.slice(1));
    const target = document.getElementById(id);
    if (!target?.matches("[data-center-article]")) return false;

    target.classList.add("is-visible");
    focusArticle(target);
    target.scrollIntoView({
      behavior: state.reducedMotion ? "auto" : "smooth",
      block: "center",
      inline: "nearest",
    });

    if (updateHistory && window.location.hash !== hash) {
      window.history.pushState(null, "", hash);
    }

    return true;
  };

  links.forEach((link) => {
    link.addEventListener("click", (event) => {
      const hash = link.getAttribute("href");
      if (!hash?.startsWith("#")) return;
      if (scrollToArticle(hash)) event.preventDefault();
    });
  });

  window.addEventListener("hashchange", () => {
    scrollToArticle(window.location.hash, false);
  });

  if (window.location.hash) {
    window.setTimeout(() => scrollToArticle(window.location.hash, false), 80);
  }
};

const setupArticleLaunchLinks = () => {
  const links = Array.from(document.querySelectorAll(".news-title-link[href$='.html']"));
  if (!links.length) return;

  links.forEach((link) => {
    link.addEventListener("click", (event) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
        return;
      }

      event.preventDefault();
      link.classList.add("is-launching");
      link.closest(".news-post")?.classList.add("is-launching");

      window.setTimeout(() => {
        window.location.href = link.href;
      }, state.reducedMotion ? 0 : 160);
    });
  });
};

const releaseAssetMatchers = {
  mac: [
    (name) => /\.dmg$/i.test(name) && /universal/i.test(name),
    (name) => /\.dmg$/i.test(name) && /arm64/i.test(name),
    (name) => /\.dmg$/i.test(name) && /x64/i.test(name),
    (name) => /\.dmg$/i.test(name),
    (name) => /\.zip$/i.test(name),
  ],
  windows: [
    (name) => /-setup\.exe$/i.test(name),
    (name) => /-portable\.exe$/i.test(name),
    (name) => /\.exe$/i.test(name),
  ],
  linux: [
    (name) => /\.AppImage$/i.test(name),
    (name) => /\.deb$/i.test(name),
  ],
};

const getReleaseAssetLabel = (assetName) => {
  if (/\.dmg$/i.test(assetName)) return "DMG";
  if (/\.zip$/i.test(assetName)) return "ZIP";
  if (/-setup\.exe$/i.test(assetName)) return "SETUP EXE";
  if (/-portable\.exe$/i.test(assetName)) return "PORTABLE EXE";
  if (/\.AppImage$/i.test(assetName)) return "APPIMAGE";
  if (/\.deb$/i.test(assetName)) return "DEB";
  return "LATEST RELEASE";
};

const pickReleaseAsset = (assets, platform) => {
  const matchers = releaseAssetMatchers[platform] || [];
  for (const matches of matchers) {
    const asset = assets.find((candidate) => matches(candidate?.name || ""));
    if (asset) return asset;
  }
  return null;
};

const setupReleaseDownloads = async () => {
  const buttons = Array.from(document.querySelectorAll("[data-release-platform]"));
  if (!buttons.length) return;

  const syncButton = (button, asset) => {
    const fallbackLabel = button.getAttribute("data-release-fallback") || "LATEST RELEASE";
    const status = button.querySelector("[data-release-status]");

    if (asset?.browser_download_url) {
      button.href = asset.browser_download_url;
      button.title = `Download ${asset.name}`;
      button.classList.add("is-ready");
      button.classList.remove("is-fallback");
      if (status) {
        status.textContent = `${getReleaseAssetLabel(asset.name)} · latest release`;
      }
      return;
    }

    button.href = RELEASES_PAGE_URL;
    button.title = "Open the latest GitHub release";
    button.classList.add("is-fallback");
    button.classList.remove("is-ready");
    if (status) {
      status.textContent = fallbackLabel;
    }
  };

  buttons.forEach((button) => syncButton(button, null));

  try {
    const response = await fetch(RELEASES_API_URL, {
      headers: {
        Accept: "application/vnd.github+json",
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub releases API returned ${response.status}`);
    }

    const release = await response.json();
    const assets = Array.isArray(release?.assets) ? release.assets : [];

    buttons.forEach((button) => {
      syncButton(button, pickReleaseAsset(assets, button.getAttribute("data-release-platform")));
    });
  } catch (error) {
    console.warn("Unable to resolve platform release assets.", error);
  }
};

const setupVisibility = () => {
  const syncVisibility = () => {
    state.visible = !document.hidden;
  };

  document.addEventListener("visibilitychange", syncVisibility);
  syncVisibility();
};

const setupMouseGlow = () => {
  const root = document.documentElement;
  root.classList.remove("has-custom-cursor");
  if (state.reducedMotion || !hasFinePointer() || hasForcedColors()) return;

  root.classList.add("has-custom-cursor");
  let frame = 0;

  const syncMouse = () => {
    frame = 0;
    if (!state.visible) return;

    state.mouseX += (state.targetMouseX - state.mouseX) * 0.18;
    state.mouseY += (state.targetMouseY - state.mouseY) * 0.18;
    root.style.setProperty("--mouse-x", `${state.mouseX.toFixed(1)}px`);
    root.style.setProperty("--mouse-y", `${state.mouseY.toFixed(1)}px`);

    const deltaX = Math.abs(state.targetMouseX - state.mouseX);
    const deltaY = Math.abs(state.targetMouseY - state.mouseY);
    if (deltaX > 0.25 || deltaY > 0.25) {
      frame = requestAnimationFrame(syncMouse);
    }
  };

  window.addEventListener("pointermove", (event) => {
    state.targetMouseX = event.clientX;
    state.targetMouseY = event.clientY;
    if (!frame) frame = requestAnimationFrame(syncMouse);
  }, { passive: true });
};

const setupScrollReaction = () => {
  const root = document.documentElement;
  let lastY = window.scrollY;
  let ticking = false;
  let decayFrame = 0;

  const decay = () => {
    decayFrame = 0;
    if (!state.visible) return;

    state.scrollVelocity += (state.targetScrollVelocity - state.scrollVelocity) * 0.18;
    state.targetScrollVelocity *= 0.82;
    root.style.setProperty("--scroll-react", clamp(state.scrollVelocity / 90, 0, 1).toFixed(3));

    if (state.scrollVelocity > 0.08 || state.targetScrollVelocity > 0.08) {
      decayFrame = requestAnimationFrame(decay);
    }
  };

  const requestDecay = () => {
    if (!decayFrame) decayFrame = requestAnimationFrame(decay);
  };

  const update = () => {
    const y = window.scrollY;
    state.targetScrollVelocity = Math.abs(y - lastY);
    state.scroll = clamp(y / Math.max(1, document.body.scrollHeight - window.innerHeight), 0, 1);
    lastY = y;
    ticking = false;
    requestDecay();
  };

  window.addEventListener("scroll", () => {
    if (!ticking) {
      requestAnimationFrame(update);
      ticking = true;
    }
  }, { passive: true });

  update();
  requestDecay();
};

const setupMatrixCanvas = () => {
  const canvas = document.querySelector("[data-matrix-canvas]");
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const context = canvas.getContext("2d", { alpha: true, desynchronized: true });
  if (!context) return;

  const glyphs = "LEXOIRE 01 ROUTE VOICE SESSION PROVIDER MEMORY STREAM";
  let profile = getAnimationProfile();
  if (!profile.matrixFps) return;

  let columns = [];
  let width = 0;
  let height = 0;
  let lastFrame = 0;
  let resizeTimer = 0;

  const resize = () => {
    profile = getAnimationProfile();
    const ratio = profile.dpr;
    width = window.innerWidth;
    height = window.innerHeight;
    if (width <= 0 || height <= 0) return;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    columns = Array.from({ length: Math.ceil(width / (width < 640 ? 32 : 24)) }, () => Math.random() * -height);
  };

  const draw = (time = 0) => {
    if (!state.visible || time - lastFrame < 1000 / profile.matrixFps) {
      requestAnimationFrame(draw);
      return;
    }

    lastFrame = time;
    context.fillStyle = "rgba(0, 0, 0, 0.08)";
    context.fillRect(0, 0, width, height);
    context.font = "12px SFMono-Regular, Menlo, monospace";

    columns.forEach((y, index) => {
      const x = index * (width < 640 ? 32 : 24);
      const glyph = glyphs[Math.floor(Math.random() * glyphs.length)];
      context.fillStyle = `rgba(57, 255, 136, ${0.05 + Math.random() * 0.12})`;
      context.fillText(glyph, x, y);
      columns[index] = y > height + 80 ? Math.random() * -180 : y + 0.65 + state.scrollVelocity * 0.015;
    });

    requestAnimationFrame(draw);
  };

  resize();
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
  });
  draw();
};

const setupFlowCanvas = () => {
  const canvas = document.querySelector("[data-flow-canvas]");
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const context = canvas.getContext("2d", { alpha: true, desynchronized: true });
  if (!context) return;

  let width = 0;
  let height = 0;
  let particles = [];
  let circuits = [];
  let sphereDots = [];
  let profile = getAnimationProfile();
  let lastFrame = 0;
  let resizeTimer = 0;

  if (!profile.flowFps) return;

  const resize = () => {
    profile = getAnimationProfile();
    const ratio = profile.dpr;
    width = window.innerWidth;
    height = window.innerHeight;
    if (width <= 0 || height <= 0) return;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    particles = Array.from({ length: profile.particles }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      z: 0.4 + Math.random() * 1.8,
      vx: -0.12 + Math.random() * 0.24,
      vy: -0.2 - Math.random() * 0.6,
    }));
    circuits = Array.from({ length: profile.circuits }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      length: 80 + Math.random() * 260,
      speed: 0.25 + Math.random() * 0.8,
      phase: Math.random() * 1000,
    }));
    sphereDots = Array.from({ length: profile.sphereDots }, () => {
      const phi = Math.random() * Math.PI * 2;
      const theta = Math.acos(2 * Math.random() - 1);
      const radius = 0.9 + Math.random() * 0.16;
      return {
        x: radius * Math.sin(theta) * Math.cos(phi),
        y: radius * Math.sin(theta) * Math.sin(phi),
        z: radius * Math.cos(theta),
        baseRadius: radius,
        theta,
        phi,
        phase: Math.random() * Math.PI * 2,
        drift: 0.35 + Math.random() * 1.25,
        size: 0.65 + Math.random() * 1.45,
      };
    });
  };

  const drawBeam = (time, offset, alpha) => {
    const x = width * (0.15 + offset) + Math.sin(time * 0.0002 + offset * 8) * width * 0.08;
    const gradient = context.createLinearGradient(x - 180, 0, x + 220, height);
    gradient.addColorStop(0, "transparent");
    gradient.addColorStop(0.45, `rgba(57, 255, 136, ${alpha})`);
    gradient.addColorStop(1, "transparent");
    context.fillStyle = gradient;
    context.save();
    context.translate(x, height / 2);
    context.rotate(-0.18 + state.scroll * 0.16);
    context.fillRect(-180, -height, 260, height * 2);
    context.restore();
  };

  const draw = (time) => {
    if (!state.visible || time - lastFrame < 1000 / profile.flowFps) {
      requestAnimationFrame(draw);
      return;
    }

    lastFrame = time;
    context.clearRect(0, 0, width, height);
    const motion = state.reducedMotion ? 0.14 : 1;

    drawBeam(time * motion, 0.05, state.reducedMotion ? 0.042 : 0.075);
    drawBeam(time * motion, 0.42, state.reducedMotion ? 0.032 : 0.052);
    drawBeam(time * motion, 0.72, state.reducedMotion ? 0.026 : 0.042);

    const sphereSize = Math.min(width, height) * (width < 820 ? 1.02 : 0.92);
    const sphereX = width * (width < 820 ? 0.58 : 0.67) + (state.mouseX / width - 0.5) * 78;
    const sphereY = height * 0.42 + (state.mouseY / height - 0.5) * 52 + state.scroll * 58;
    const rotation = time * 0.00028 * motion + state.scroll * 1.45 * motion;
    const tilt = -0.34 + Math.sin(time * 0.00022 * motion) * 0.11 * motion;
    const speechPulse = 1 + Math.sin(time * 0.0019 * motion) * 0.055 * motion + Math.max(0, state.scrollVelocity) * 0.0012 * motion;

    context.save();
    context.globalCompositeOperation = "lighter";

    const sphereGradient = context.createRadialGradient(sphereX, sphereY, 0, sphereX, sphereY, sphereSize * 0.78);
    sphereGradient.addColorStop(0, "rgba(57, 255, 136, 0.24)");
    sphereGradient.addColorStop(0.32, "rgba(57, 255, 136, 0.095)");
    sphereGradient.addColorStop(0.7, "rgba(57, 255, 136, 0.038)");
    sphereGradient.addColorStop(1, "transparent");
    context.fillStyle = sphereGradient;
    context.beginPath();
    context.arc(sphereX, sphereY, sphereSize * 0.76, 0, Math.PI * 2);
    context.fill();

    sphereDots.forEach((dot) => {
      const surfaceRipple = 1
        + Math.sin(time * 0.0026 * dot.drift * motion + dot.phase + dot.phi * 3) * 0.08 * motion
        + Math.sin(time * 0.0015 * motion + dot.theta * 8) * 0.045 * motion;
      const dynamicRadius = dot.baseRadius * speechPulse * surfaceRipple;
      const swirl = Math.sin(time * 0.0014 * motion + dot.phase) * 0.032 * motion;
      const sourceX = (dot.x / dot.baseRadius) * dynamicRadius + Math.cos(dot.phase + time * 0.001 * motion) * swirl;
      const sourceY = (dot.y / dot.baseRadius) * dynamicRadius + Math.sin(dot.phase + time * 0.0013 * motion) * swirl;
      const sourceZ = (dot.z / dot.baseRadius) * dynamicRadius;
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      const rotatedX = sourceX * cos - sourceZ * sin;
      const rotatedZ = sourceX * sin + sourceZ * cos;
      const tiltedY = sourceY * Math.cos(tilt) - rotatedZ * Math.sin(tilt);
      const tiltedZ = sourceY * Math.sin(tilt) + rotatedZ * Math.cos(tilt);
      const depth = (tiltedZ + 1.55) / 3.1;
      if (depth < 0.04) return;
      const scale = sphereSize * (0.38 + depth * 0.17);
      const x = sphereX + rotatedX * scale;
      const y = sphereY + tiltedY * scale;
      const alpha = 0.09 + depth * 0.56 + Math.sin(time * 0.004 * motion + dot.phase) * 0.06 * motion;
      const radius = dot.size * (0.75 + depth * 2.15);

      context.fillStyle = `rgba(57, 255, 136, ${alpha})`;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();

      if (depth > 0.62) {
        context.fillStyle = `rgba(185, 255, 205, ${0.09 + depth * 0.12})`;
        context.beginPath();
        context.arc(x, y, radius * 2.6, 0, Math.PI * 2);
        context.fill();
      }
    });
    context.restore();

    context.strokeStyle = "rgba(57, 255, 136, 0.055)";
    context.lineWidth = 1;
    for (let y = -40; y < height + 40; y += profile.gridStep) {
      context.beginPath();
      for (let x = 0; x <= width; x += 44) {
        const warp = Math.sin(x * 0.009 + y * 0.015 + time * 0.0007 * motion + state.scroll * 8 * motion) * 8 * motion;
        const py = y + warp + state.scroll * 28;
        if (x === 0) context.moveTo(x, py);
        else context.lineTo(x, py);
      }
      context.stroke();
    }

    circuits.forEach((line) => {
      const progress = ((time * line.speed * 0.04 * motion + line.phase) % (width + line.length)) - line.length;
      const y = line.y + Math.sin(time * 0.0005 * motion + line.phase) * 18 * motion;
      context.strokeStyle = "rgba(57, 255, 136, 0.16)";
      context.beginPath();
      context.moveTo(progress, y);
      context.lineTo(progress + line.length * 0.55, y);
      context.lineTo(progress + line.length * 0.72, y + 20);
      context.lineTo(progress + line.length, y + 20);
      context.stroke();
    });

    particles.forEach((particle) => {
      particle.x += (particle.vx * particle.z + Math.sin(time * 0.001 * motion + particle.y) * 0.08) * motion;
      particle.y += particle.vy * particle.z * motion - state.scrollVelocity * 0.01 * motion;
      if (particle.y < -20) {
        particle.y = height + 20;
        particle.x = Math.random() * width;
      }
      if (particle.x < -20) particle.x = width + 20;
      if (particle.x > width + 20) particle.x = -20;

      context.fillStyle = `rgba(57, 255, 136, ${0.12 + particle.z * 0.08})`;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.z, 0, Math.PI * 2);
      context.fill();
    });

    requestAnimationFrame(draw);
  };

  resize();
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
  });
  requestAnimationFrame(draw);
};

document.addEventListener("DOMContentLoaded", () => {
  state.reducedMotion = readMotionPreference();
  setupEffectFallbacks();
  setCurrentYear();
  setupNav();
  setupScrollSpy();
  setupReveal();
  setupCenteredArticleLinks();
  setupArticleLaunchLinks();
  setupReleaseDownloads();
  setupVisibility();
  setupMouseGlow();
  setupScrollReaction();
  setupMatrixCanvas();
  setupFlowCanvas();
});
