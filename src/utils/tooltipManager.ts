/**
 * Global Uiverse Tooltip Manager.
 * Replaces native browser tooltips across the entire application with
 * the modern glowing cyan Uiverse floating tooltip effect without breaking any logic.
 */

let tooltipEl: HTMLDivElement | null = null;
let currentTarget: HTMLElement | null = null;
let hideTimer: number | null = null;

function getOrCreateTooltipEl(): HTMLDivElement {
  if (!tooltipEl) {
    tooltipEl = document.createElement("div");
    tooltipEl.id = "uiverse-global-tooltip";
    tooltipEl.className = "uiverse-global-tooltip";
    tooltipEl.innerHTML = `<span class="uiverse-tooltip-text"></span>`;
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}

function showTooltip(target: HTMLElement, text: string) {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }

  const tip = getOrCreateTooltipEl();
  const textEl = tip.querySelector(".uiverse-tooltip-text");
  if (textEl) {
    textEl.textContent = text;
  }

  const rect = target.getBoundingClientRect();
  // Measure tooltip size
  tip.style.visibility = "hidden";
  tip.style.display = "flex";
  tip.classList.remove("visible", "pos-top", "pos-bottom");

  const tipRect = tip.getBoundingClientRect();
  const padding = 10;
  const viewportWidth = window.innerWidth;

  // Decide position (top or bottom)
  let top = rect.top - tipRect.height - 8;
  let isBottom = false;

  if (top < padding) {
    // If not enough room on top, show on bottom
    top = rect.bottom + 8;
    isBottom = true;
  }

  // Center horizontally relative to target
  let left = rect.left + rect.width / 2 - tipRect.width / 2;

  // Clamp within viewport
  if (left < padding) left = padding;
  if (left + tipRect.width > viewportWidth - padding) {
    left = viewportWidth - tipRect.width - padding;
  }

  tip.style.top = `${top}px`;
  tip.style.left = `${left}px`;
  tip.style.visibility = "visible";
  tip.classList.add(isBottom ? "pos-bottom" : "pos-top");

  // Trigger floating animation on next frame
  requestAnimationFrame(() => {
    tip.classList.add("visible");
  });

  currentTarget = target;
}

function hideTooltip() {
  if (!tooltipEl) return;
  tooltipEl.classList.remove("visible");
  hideTimer = window.setTimeout(() => {
    if (tooltipEl && !tooltipEl.classList.contains("visible")) {
      tooltipEl.style.display = "none";
    }
  }, 250);
  currentTarget = null;
}

export function initGlobalTooltips() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  document.addEventListener(
    "mouseenter",
    (e) => {
      const target = (e.target as HTMLElement)?.closest?.(
        "[title], [data-tooltip]"
      ) as HTMLElement | null;

      if (!target) return;

      let text = target.getAttribute("data-tooltip");
      const titleAttr = target.getAttribute("title");

      if (titleAttr) {
        text = titleAttr;
        // Suppress native OS title tooltip
        target.setAttribute("data-tooltip", titleAttr);
        target.removeAttribute("title");
      }

      if (text && text.trim()) {
        showTooltip(target, text.trim());
      }
    },
    true
  );

  document.addEventListener(
    "mouseleave",
    (e) => {
      const target = (e.target as HTMLElement)?.closest?.(
        "[data-tooltip]"
      ) as HTMLElement | null;

      if (target && target === currentTarget) {
        hideTooltip();
      }
    },
    true
  );

  // Hide when clicking or scrolling
  window.addEventListener("scroll", hideTooltip, true);
  document.addEventListener("click", hideTooltip, true);
}
