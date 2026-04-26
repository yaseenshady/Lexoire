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

  if (!links.length || !targets.length) {
    return;
  }

  const activate = (id) => {
    links.forEach((link) => {
      const active = link.getAttribute("href") === `#${id}`;
      link.classList.toggle("active", active);

      const details = link.closest("details");
      if (active && details) {
        details.open = true;
      }
    });
  };

  const fromHash = window.location.hash.replace(/^#/, "");
  if (fromHash) {
    activate(fromHash);
  } else if (targets[0]?.id) {
    activate(targets[0].id);
  }

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

      if (visible?.target?.id) {
        activate(visible.target.id);
      }
    },
    {
      rootMargin: "-24% 0px -60% 0px",
      threshold: [0.15, 0.3, 0.6],
    },
  );

  targets.forEach((target) => observer.observe(target));

  window.addEventListener("hashchange", () => {
    const id = window.location.hash.replace(/^#/, "");
    if (id) {
      activate(id);
    }
  });
};

document.addEventListener("DOMContentLoaded", () => {
  setCurrentYear();
  setupNav();
  setupScrollSpy();
});
