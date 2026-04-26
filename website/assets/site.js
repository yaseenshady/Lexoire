const state = {
  scroll: 0,
  scrollVelocity: 0,
  mouseX: window.innerWidth / 2,
  mouseY: window.innerHeight / 2,
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

  if (!links.length || !targets.length) return;

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

const setupMouseGlow = () => {
  window.addEventListener("pointermove", (event) => {
    state.mouseX += (event.clientX - state.mouseX) * 0.35;
    state.mouseY += (event.clientY - state.mouseY) * 0.35;
    document.documentElement.style.setProperty("--mouse-x", `${state.mouseX}px`);
    document.documentElement.style.setProperty("--mouse-y", `${state.mouseY}px`);
  }, { passive: true });
};

const setupScrollReaction = () => {
  let lastY = window.scrollY;
  let ticking = false;

  const update = () => {
    const y = window.scrollY;
    state.scrollVelocity += (Math.abs(y - lastY) - state.scrollVelocity) * 0.12;
    state.scroll = Math.min(1, y / Math.max(1, document.body.scrollHeight - window.innerHeight));
    lastY = y;
    document.documentElement.style.setProperty("--scroll-react", String(Math.min(1, state.scrollVelocity / 80)));
    ticking = false;
  };

  window.addEventListener("scroll", () => {
    if (!ticking) {
      requestAnimationFrame(update);
      ticking = true;
    }
  }, { passive: true });

  update();
};

const setupMatrixCanvas = () => {
  const canvas = document.querySelector("[data-matrix-canvas]");
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const context = canvas.getContext("2d");
  if (!context) return;

  const glyphs = "LEXOIRE 01 ROUTE VOICE SESSION PROVIDER MEMORY STREAM";
  let columns = [];
  let width = 0;
  let height = 0;

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    columns = Array.from({ length: Math.ceil(width / 22) }, () => Math.random() * -height);
  };

  const draw = () => {
    context.fillStyle = "rgba(0, 0, 0, 0.08)";
    context.fillRect(0, 0, width, height);
    context.font = "12px SFMono-Regular, Menlo, monospace";

    columns.forEach((y, index) => {
      const x = index * 22;
      const glyph = glyphs[Math.floor(Math.random() * glyphs.length)];
      context.fillStyle = `rgba(57, 255, 136, ${0.05 + Math.random() * 0.12})`;
      context.fillText(glyph, x, y);
      columns[index] = y > height + 80 ? Math.random() * -180 : y + 0.65 + state.scrollVelocity * 0.015;
    });

    requestAnimationFrame(draw);
  };

  resize();
  window.addEventListener("resize", resize);
  draw();
};

const setupFlowCanvas = () => {
  const canvas = document.querySelector("[data-flow-canvas]");
  if (!(canvas instanceof HTMLCanvasElement)) return;
  const context = canvas.getContext("2d");
  if (!context) return;

  let width = 0;
  let height = 0;
  let particles = [];
  let circuits = [];
  let sphereDots = [];

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    particles = Array.from({ length: Math.floor(width / 11) }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      z: 0.4 + Math.random() * 1.8,
      vx: -0.12 + Math.random() * 0.24,
      vy: -0.2 - Math.random() * 0.6,
    }));
    circuits = Array.from({ length: 22 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      length: 80 + Math.random() * 260,
      speed: 0.25 + Math.random() * 0.8,
      phase: Math.random() * 1000,
    }));
    sphereDots = Array.from({ length: width < 820 ? 1600 : 3000 }, () => {
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
    context.clearRect(0, 0, width, height);

    drawBeam(time, 0.05, 0.075);
    drawBeam(time, 0.42, 0.052);
    drawBeam(time, 0.72, 0.042);

    const sphereSize = Math.min(width, height) * (width < 820 ? 1.02 : 0.92);
    const sphereX = width * (width < 820 ? 0.58 : 0.67) + (state.mouseX / width - 0.5) * 78;
    const sphereY = height * 0.42 + (state.mouseY / height - 0.5) * 52 + state.scroll * 58;
    const rotation = time * 0.00028 + state.scroll * 1.45;
    const tilt = -0.34 + Math.sin(time * 0.00022) * 0.11;
    const speechPulse = 1 + Math.sin(time * 0.0019) * 0.055 + Math.max(0, state.scrollVelocity) * 0.0012;

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
        + Math.sin(time * 0.0026 * dot.drift + dot.phase + dot.phi * 3) * 0.08
        + Math.sin(time * 0.0015 + dot.theta * 8) * 0.045;
      const dynamicRadius = dot.baseRadius * speechPulse * surfaceRipple;
      const swirl = Math.sin(time * 0.0014 + dot.phase) * 0.032;
      const sourceX = (dot.x / dot.baseRadius) * dynamicRadius + Math.cos(dot.phase + time * 0.001) * swirl;
      const sourceY = (dot.y / dot.baseRadius) * dynamicRadius + Math.sin(dot.phase + time * 0.0013) * swirl;
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
      const alpha = 0.09 + depth * 0.56 + Math.sin(time * 0.004 + dot.phase) * 0.06;
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
    for (let y = -40; y < height + 40; y += 42) {
      context.beginPath();
      for (let x = 0; x <= width; x += 30) {
        const warp = Math.sin(x * 0.009 + y * 0.015 + time * 0.0007 + state.scroll * 8) * 8;
        const py = y + warp + state.scroll * 28;
        if (x === 0) context.moveTo(x, py);
        else context.lineTo(x, py);
      }
      context.stroke();
    }

    circuits.forEach((line) => {
      const progress = ((time * line.speed * 0.04 + line.phase) % (width + line.length)) - line.length;
      const y = line.y + Math.sin(time * 0.0005 + line.phase) * 18;
      context.strokeStyle = "rgba(57, 255, 136, 0.16)";
      context.beginPath();
      context.moveTo(progress, y);
      context.lineTo(progress + line.length * 0.55, y);
      context.lineTo(progress + line.length * 0.72, y + 20);
      context.lineTo(progress + line.length, y + 20);
      context.stroke();
    });

    particles.forEach((particle) => {
      particle.x += particle.vx * particle.z + Math.sin(time * 0.001 + particle.y) * 0.08;
      particle.y += particle.vy * particle.z - state.scrollVelocity * 0.01;
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
  window.addEventListener("resize", resize);
  requestAnimationFrame(draw);
};

document.addEventListener("DOMContentLoaded", () => {
  setCurrentYear();
  setupNav();
  setupScrollSpy();
  setupReveal();
  setupMouseGlow();
  setupScrollReaction();
  setupMatrixCanvas();
  setupFlowCanvas();
});
