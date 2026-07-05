/* reveal.js — Scroll-triggered entrance animations */

(function () {
  const els = document.querySelectorAll("[data-reveal]");
  const groups = document.querySelectorAll("[data-reveal-group]");
  if (!els.length) return;

  groups.forEach((group) => {
    Array.from(group.children).forEach((child, i) => {
      child.style.setProperty("--delay", `${i * 80}ms`);
    });
  });

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
  );

  els.forEach((el) => observer.observe(el));
})();
