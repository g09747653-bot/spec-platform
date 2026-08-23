/* =============================================================================
   Поведение сайта — ОДИН слой на весь артефакт.
   Каждый блок ниже читает разметку по data-атрибутам и ничего не знает о
   конкретной странице: главная и страница видеокарт получают одну и ту же жизнь
   из одного места. Отсюда одинаковые повадки у одинаковых на вид элементов.
   ========================================================================== */

(() => {
  'use strict';

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

  /* ── Шапка: уплотняется, когда страница ушла вверх ─────────────────────── */

  const header = $('[data-header]');
  if (header) {
    const sync = () => header.classList.toggle('is-stuck', window.scrollY > 8);
    sync();
    window.addEventListener('scroll', sync, { passive: true });
  }

  /* ── Меню на узком экране ──────────────────────────────────────────────── */

  const toggle = $('[data-nav-toggle]');
  const nav = $('[data-nav]');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    nav.addEventListener('click', (event) => {
      if (event.target.closest('a')) {
        nav.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ── Плавные появления: элемент показывается, когда доехал до экрана ───── */

  const revealed = $$('.reveal');
  if (revealed.length > 0) {
    if (reduced || !('IntersectionObserver' in window)) {
      revealed.forEach((node) => node.classList.add('is-visible'));
    } else {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          });
        },
        { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
      );

      /* Соседи в одной сетке появляются лесенкой, а не все разом. */
      $$('[data-stagger]').forEach((group) => {
        $$('.reveal', group).forEach((node, index) => {
          node.style.setProperty('--reveal-delay', `${Math.min(index, 6) * 90}ms`);
        });
      });

      revealed.forEach((node) => observer.observe(node));
    }
  }

  /* ── Счётчики показателей: считают, когда полоса появилась ─────────────── */

  const counters = $$('[data-count-to]');
  if (counters.length > 0) {
    const run = (node) => {
      const target = Number(node.dataset.countTo);
      const decimals = Number(node.dataset.countDecimals || 0);
      if (reduced || !Number.isFinite(target)) {
        node.textContent = target.toFixed(decimals);
        return;
      }
      const started = performance.now();
      const duration = 1400;
      const step = (now) => {
        const progress = Math.min((now - started) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        node.textContent = (target * eased).toFixed(decimals);
        if (progress < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            run(entry.target);
            observer.unobserve(entry.target);
          });
        },
        { threshold: 0.4 },
      );
      counters.forEach((node) => observer.observe(node));
    } else {
      counters.forEach(run);
    }
  }

  /* ── Слайдер: едет сам, слушается стрелок, точек, клавиш и перетаскивания ─ */

  $$('[data-slider]').forEach((root) => {
    const track = $('[data-slider-track]', root);
    const slides = $$('.slide', track);
    const dots = $$('[data-slider-dot]', root);
    if (slides.length < 2) return;

    let index = 0;
    let timer = null;
    const delay = Number(root.dataset.slider) || 4200;

    const paint = () => {
      track.style.transform = `translate3d(-${index * 100}%, 0, 0)`;
      dots.forEach((dot, position) => dot.classList.toggle('is-active', position === index));
      slides.forEach((slide, position) => {
        slide.setAttribute('aria-hidden', String(position !== index));
      });
    };

    const go = (next) => {
      index = (next + slides.length) % slides.length;
      paint();
    };

    const start = () => {
      if (reduced || timer !== null) return;
      timer = window.setInterval(() => go(index + 1), delay);
    };

    const stop = () => {
      if (timer === null) return;
      window.clearInterval(timer);
      timer = null;
    };

    $('[data-slider-prev]', root)?.addEventListener('click', () => go(index - 1));
    $('[data-slider-next]', root)?.addEventListener('click', () => go(index + 1));
    dots.forEach((dot, position) => dot.addEventListener('click', () => go(position)));

    root.addEventListener('mouseenter', stop);
    root.addEventListener('mouseleave', start);
    root.addEventListener('focusin', stop);
    root.addEventListener('focusout', start);

    root.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') go(index - 1);
      if (event.key === 'ArrowRight') go(index + 1);
    });

    /* Перетаскивание пальцем и мышью — тот же ход, что стрелкой. */
    let downX = null;
    root.addEventListener('pointerdown', (event) => {
      downX = event.clientX;
      stop();
    });
    root.addEventListener('pointerup', (event) => {
      if (downX === null) return;
      const moved = event.clientX - downX;
      if (Math.abs(moved) > 40) go(index + (moved < 0 ? 1 : -1));
      downX = null;
      start();
    });

    /* Пока вкладка спрятана, слайдер стоит: невидимое движение — только расход. */
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stop();
      else start();
    });

    paint();
    start();
  });

  /* ── Сравнение «до / после»: полоса тянется мышью и пальцем ────────────── */

  $$('[data-compare]').forEach((root) => {
    const set = (clientX) => {
      const box = root.getBoundingClientRect();
      const ratio = ((clientX - box.left) / box.width) * 100;
      root.style.setProperty('--pos', `${Math.min(Math.max(ratio, 0), 100).toFixed(2)}%`);
    };

    let dragging = false;
    root.addEventListener('pointerdown', (event) => {
      dragging = true;
      root.setPointerCapture(event.pointerId);
      set(event.clientX);
    });
    root.addEventListener('pointermove', (event) => {
      if (dragging) set(event.clientX);
    });
    root.addEventListener('pointerup', () => {
      dragging = false;
    });
    root.addEventListener('pointercancel', () => {
      dragging = false;
    });
  });

  /* ── Гармошка вопросов ─────────────────────────────────────────────────── */

  $$('[data-faq] .faq__item').forEach((item) => {
    const question = $('.faq__q', item);
    question?.addEventListener('click', () => {
      const open = item.classList.toggle('is-open');
      question.setAttribute('aria-expanded', String(open));
    });
  });

  /* ── Год в подвале — одна правда на обеих страницах ────────────────────── */

  $$('[data-year]').forEach((node) => {
    node.textContent = String(new Date().getFullYear());
  });
})();
