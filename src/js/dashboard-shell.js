document.addEventListener("DOMContentLoaded", function () {
  const body = document.body;
  const sidebar = document.getElementById("sidebar-wrapper");
  const toggleButtons = document.querySelectorAll("[data-dashboard-toggle]");
  const overlay = document.querySelector(".sidebar-overlay");
  const navLinks = document.querySelectorAll("#sidebar-wrapper .list-group-item");
  const mobileBreakpoint = window.matchMedia("(max-width: 991px)");

  if (!sidebar || !toggleButtons.length) return;

  function setSidebarOpen(nextState) {
    body.classList.toggle("dashboard-sidebar-open", nextState);
  }

  function closeSidebar() {
    setSidebarOpen(false);
  }

  function toggleSidebar() {
    setSidebarOpen(!body.classList.contains("dashboard-sidebar-open"));
  }

  toggleButtons.forEach((button) => {
    button.addEventListener("click", function () {
      toggleSidebar();
    });
  });

  if (overlay) {
    overlay.addEventListener("click", closeSidebar);
  }

  navLinks.forEach((link) => {
    link.addEventListener("click", function () {
      if (mobileBreakpoint.matches) {
        closeSidebar();
      }
    });
  });

  window.addEventListener("resize", function () {
    if (!mobileBreakpoint.matches) {
      closeSidebar();
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      closeSidebar();
    }
  });

    // PANEL SWITCHING LOGIC
  const panels = document.querySelectorAll(".panel");

  navLinks.forEach((link) => {
    link.addEventListener("click", function (e) {
      e.preventDefault();

      // 1. Remove active from ALL panels
      panels.forEach((panel) => panel.classList.remove("active"));

      // 2. Remove active from all sidebar links
      navLinks.forEach((l) => l.classList.remove("active"));

      // 3. Activate clicked link
      this.classList.add("active");

      // 4. Activate target panel
      const target = this.getAttribute("data-target");

      if (target) {
        const targetPanel = document.getElementById(target);
        if (targetPanel) {
          targetPanel.classList.add("active");
        }
      }
    });
  });
});
