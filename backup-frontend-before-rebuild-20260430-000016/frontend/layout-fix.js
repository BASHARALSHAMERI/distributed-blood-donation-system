(function () {
  function qs(selector) {
    return document.querySelector(selector);
  }

  function qsa(selector) {
    return Array.from(document.querySelectorAll(selector));
  }

  function createSidebar() {
    if (qs(".rtl-sidebar")) return;

    const oldNav = qs(".main-nav");
    if (!oldNav) return;

    const sidebar = document.createElement("aside");
    sidebar.className = "rtl-sidebar";

    sidebar.innerHTML = `
      <div class="rtl-sidebar__caption">نظام موزع لإدارة التبرع</div>
      <div class="rtl-sidebar__brand">
        <div class="rtl-sidebar__brand-icon">⌁</div>
        <div class="rtl-sidebar__brand-text">
          <strong>BloodNet</strong>
          <span>مدينة تعز</span>
        </div>
      </div>
      <nav class="rtl-sidebar__nav"></nav>
    `;

    const sidebarNav = sidebar.querySelector(".rtl-sidebar__nav");

    qsa(".main-nav .nav-pill").forEach((button) => {
      sidebarNav.appendChild(button);
    });

    document.body.prepend(sidebar);
    oldNav.remove();
  }

  function normalizeTopbar() {
    const topbar =
      qs(".topbar") ||
      qs(".header") ||
      qs(".app-header") ||
      qs("header");

    if (!topbar) return;

    topbar.classList.add("layout-topbar");

    // إزالة أي حاويات قديمة أنشأناها سابقاً حتى لا يتكرر الهيكل
    qsa(".header-search-wrap, .header-actions-wrap").forEach((el) => el.remove());

    // إخفاء الشعار من الهيدر
    qsa(".brand, .logo, .header-brand, .topbar-brand").forEach((el) => {
      if (topbar.contains(el)) {
        el.style.display = "none";
      }
    });

    // البحث
    const searchInput = topbar.querySelector(
      'input[type="search"], input[placeholder*="بحث"], input[placeholder*="ابحث"]'
    );

    let searchContainer = null;
    if (searchInput) {
      searchContainer =
        searchInput.closest(".search-box, .search, .search-wrapper") ||
        searchInput.parentElement;
    }

    // الأيقونات / الأزرار
    const allChildren = Array.from(topbar.children);

    const actionElements = allChildren.filter((el) => {
      if (!el) return false;
      if (searchContainer && el === searchContainer) return false;
      if (el.classList.contains("brand") || el.classList.contains("logo")) return false;
      return true;
    });

    const searchWrap = document.createElement("div");
    searchWrap.className = "header-search-wrap";

    const actionsWrap = document.createElement("div");
    actionsWrap.className = "header-actions-wrap";

    if (searchContainer) {
      searchWrap.appendChild(searchContainer);
    }

    // الترتيب الصحيح الذي طلبته:
    // المستخدم ثم الإعدادات ثم التنبيهات
    let avatarEl = null;
    let settingsEl = null;
    let bellEl = null;
    const others = [];

    actionElements.forEach((el) => {
      const txt = (el.textContent || "").trim();
      const cls = el.className || "";

      if (
        cls.includes("avatar") ||
        cls.includes("user") ||
        cls.includes("profile") ||
        txt === "B"
      ) {
        avatarEl = el;
      } else if (
        cls.includes("setting") ||
        cls.includes("gear")
      ) {
        settingsEl = el;
      } else if (
        cls.includes("bell") ||
        cls.includes("notification")
      ) {
        bellEl = el;
      } else {
        others.push(el);
      }
    });

    if (avatarEl) actionsWrap.appendChild(avatarEl);
    if (settingsEl) actionsWrap.appendChild(settingsEl);
    if (bellEl) actionsWrap.appendChild(bellEl);
    others.forEach((el) => actionsWrap.appendChild(el));

    // تنظيف الهيدر ثم إعادة بنائه
    topbar.innerHTML = "";
    topbar.appendChild(searchWrap);
    topbar.appendChild(actionsWrap);
  }

  function fixNavClicks() {
    qsa(".rtl-sidebar .nav-pill").forEach((button) => {
      if (button.dataset.layoutClickBound === "1") return;
      button.dataset.layoutClickBound = "1";

      button.addEventListener("click", function () {
        const page = button.dataset.page;
        qsa(".rtl-sidebar .nav-pill").forEach((item) => item.classList.remove("active"));
        button.classList.add("active");

        if (typeof window.setPage === "function") {
          window.setPage(page);
        }
      });
    });
  }

  function init() {
    createSidebar();
    normalizeTopbar();
    fixNavClicks();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
