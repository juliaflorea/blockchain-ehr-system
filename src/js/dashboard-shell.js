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
});
