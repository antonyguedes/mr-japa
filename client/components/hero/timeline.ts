import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

// Time on the master timeline where each scene rests. The intro plays up to SCENE_1,
// scrolling moves between the two.
export const SCENE_1 = 2;
export const SCENE_2 = 4.16;

// Camera values below were measured from the design video by fitting a homography
// of each background onto every frame.
const REST_SCALE = 1.02;
const INTRO_SCALE = 1.354;

export function buildHeroTimeline(root: HTMLElement) {
  const q = gsap.utils.selector(root);
  const stage = q("[data-hero-stage]")[0] as HTMLElement;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const tl = gsap.timeline({ paused: true });

  const ctx = gsap.context(() => {
    // Moving through a tween's start/end in reverse must restore its "from" state.
    const fromTo = (
      targets: gsap.TweenTarget,
      from: gsap.TweenVars,
      to: gsap.TweenVars,
      at: number,
    ) => tl.fromTo(targets, from, { ...to, immediateRender: true }, at);

    // --- Intro -------------------------------------------------------------
    fromTo("[data-bg-front]", { scale: INTRO_SCALE }, { scale: REST_SCALE, duration: 2, ease: "expo.out" }, 0);
    fromTo("[data-logo]", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, 0);
    fromTo(
      "[data-nav-link]",
      { autoAlpha: 0, yPercent: -90 },
      { autoAlpha: 1, yPercent: 0, duration: 0.5, ease: "power2.out", stagger: 0.08 },
      0.03,
    );
    fromTo("[data-burger]", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4 }, 0.42);
    fromTo("[data-hill]", { yPercent: 100 }, { yPercent: 0, duration: 0.85, ease: "power3.out" }, 0.12);
    fromTo("[data-intro]", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6 }, 0.35);
    fromTo("[data-intro-heading]", { yPercent: -100, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 1.1, ease: "power2.out" }, 0.42);
    fromTo("[data-intro-body]", { yPercent: 100, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 1.1, ease: "power2.out" }, 0.45);
    fromTo("[data-kana]", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4, stagger: 0.06 }, 0.55);
    fromTo(
      "[data-letter]",
      { autoAlpha: 0, yPercent: 8 },
      { autoAlpha: 1, yPercent: 0, duration: 0.95, ease: "power1.out", stagger: 0.078 },
      0.55,
    );

    // --- Scene 1 leaves (design video t = timeline t + 0.9) ------------------
    tl.to(
      "[data-letter]",
      { yPercent: 125, duration: 0.2, ease: "power1.in", stagger: 0.065 },
      SCENE_1,
    );
    tl.set("[data-letter]", { autoAlpha: 0 }, SCENE_1 + 0.6);
    tl.to("[data-intro-heading]", { yPercent: -100, autoAlpha: 0, duration: 0.33, ease: "power1.in" }, SCENE_1);
    tl.to("[data-intro-body]", { yPercent: 100, autoAlpha: 0, duration: 0.25, ease: "power1.in" }, SCENE_1);
    tl.set("[data-intro-body]", { autoAlpha: 0 }, SCENE_1 + 0.25);
    tl.to("[data-kana]", { autoAlpha: 0, duration: 0.2, ease: "power1.in" }, SCENE_1);
    tl.set("[data-kana]", { autoAlpha: 0 }, SCENE_1 + 0.25);
    tl.to("[data-intro]", { autoAlpha: 0, duration: 0.3, ease: "power1.in" }, SCENE_1);
    tl.set("[data-intro]", { autoAlpha: 0 }, SCENE_1 + 0.33);
    tl.to("[data-hill]", { yPercent: 100, duration: 0.2, ease: "power2.in" }, SCENE_1 + 0.2);

    // --- Camera orbit between the two backgrounds ----------------------------
    tl.to(
      "[data-bg-front]",
      { xPercent: 7.6, yPercent: -5, rotationY: -11, scale: 1.04, duration: 0.39, ease: "power2.in" },
      SCENE_1 + 0.65,
    );
    // The floor shears on its own as the camera swings, like a ground plane in perspective.
    tl.to("[data-bg-floor]", { skewX: -50, duration: 0.35, ease: "power1.out" }, SCENE_1 + 0.69);
    fromTo("[data-bg-side]", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.05, ease: "none" }, SCENE_1 + 1.04);
    fromTo(
      "[data-bg-side]",
      { xPercent: -16.4, yPercent: 7, rotationY: 17, scale: 1.2 },
      { xPercent: 0, yPercent: 0, rotationY: 0, scale: REST_SCALE, duration: 1.12, ease: "power1.out" },
      SCENE_1 + 1.04,
    );

    // --- Scene 2 arrives ------------------------------------------------------
    fromTo(
      "[data-reveal-heading]",
      { autoAlpha: 0, yPercent: 10 },
      { autoAlpha: 1, yPercent: 0, duration: 0.5, ease: "power2.out" },
      SCENE_1 + 0.72,
    );
    fromTo(
      "[data-reveal-body]",
      { autoAlpha: 0, y: 14 },
      { autoAlpha: 1, y: 0, duration: 0.6, ease: "power2.out" },
      SCENE_1 + 0.9,
    );
    // Enters only after the cut, so it never shares the screen with the first background.
    fromTo(
      "[data-order]",
      { autoAlpha: 0, yPercent: 40 },
      { autoAlpha: 1, yPercent: 0, duration: 0.8, ease: "power3.out" },
      SCENE_1 + 1.15,
    );
    fromTo("[data-reveal-arrow]", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4 }, SCENE_1 + 1.05);
  }, root);

  stage.dataset.ready = "true";

  if (process.env.NODE_ENV === "development") {
    (window as unknown as { __heroTl: gsap.core.Timeline }).__heroTl = tl;
  }

  const go = (time: number) => {
    if (reduced) tl.pause(time);
    else tl.tweenTo(time, { ease: "none" });
  };

  const trigger = ScrollTrigger.create({
    trigger: root,
    start: "top+=40 top",
    onEnter: () => go(SCENE_2),
    onLeaveBack: () => go(SCENE_1),
  });

  // Reloading part-way down the page lands directly on the right scene.
  if (trigger.progress > 0 || trigger.scroll() > trigger.start) tl.pause(SCENE_2);
  else go(SCENE_1);

  return () => {
    trigger.kill();
    tl.kill();
    ctx.revert();
    delete stage.dataset.ready;
  };
}
