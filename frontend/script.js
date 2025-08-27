// ================================
// CONFIGURATION
// ================================
const API_URL = "http://127.0.0.1:8000"; // Base API URL

// ================================
// APPLICATION STATE
// ================================
let rawData = []; // Original data from API
let filteredData = []; // Filtered data for display
let cachedUsers = []; // Cached user list for admin panel
let isEditingUser = false; // Modal state flag
let editingUsername = null; // Currently edited username

// ================================
// INITIALIZATION
// ================================
document.addEventListener("DOMContentLoaded", () => {
  secureRouteGuard(); // Check authentication
  bindGlobalUI(); // Setup global UI elements
  bindDashboardUI(); // Setup dashboard functionality
  bindAdminUI(); // Setup admin panel functionality
  bindReportsUI(); // Setup reports functionality
  bindAccountsUI(); // Setup accounts functionality
  loadProfileHeader(); // Load user profile in header
  loadDashboard(); // Load dashboard stats and payments
});

// ================================
// AUTHENTICATION & SECURITY
// ================================

/**
 * Retrieve JWT token from localStorage
 * @returns {string|null} JWT token or null
 */
function getToken() {
  return localStorage.getItem("access_token");
}

/**
 * Retrieve user role from localStorage
 * @returns {string} User role (admin/user)
 */
function getRole() {
  const role = localStorage.getItem("role");
  return role ? role.toLowerCase() : "";
}

/**
 * Redirect to login if no valid token exists
 */
function secureRouteGuard() {
  if (!getToken()) {
    window.location.href = "index.html";
  }
}

// ================================
// UTILITY FUNCTIONS
// ================================

/**
 * Safely return value or empty string if null/undefined
 * @param {*} value - Input value
 * @returns {*} Value or empty string
 */
function safe(value) {
  return value ?? "";
}

/**
 * Convert value to number, return 0 if invalid
 * @param {*} value - Input value
 * @returns {number} Valid number or 0
 */
function toNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

/**
 * Parse loosely formatted date string
 * @param {string} dateString - Date string to parse
 * @returns {Date|null} Parsed date or null
 */
function parseLooseDate(dateString) {
  if (!dateString) return null;
  if (dateString instanceof Date) return dateString;
  if (typeof dateString !== "string") return null;
  
  // Extract date portion from datetime strings
  const datePart = dateString.includes("T") 
    ? dateString.split("T")[0] 
    : dateString.split(" ")[0];
  
  if (!datePart) return null;
  
  const parsedDate = new Date(datePart + "T00:00:00");
  return isNaN(parsedDate.getTime()) ? null : parsedDate;
}

/**
 * Format date for display in YYYY-MM-DD format
 * @param {string} dateString - Date string to format
 * @returns {string} Formatted date or empty string
 */
function formatDateForDisplay(dateString) {
  const date = parseLooseDate(dateString);
  if (!date) return "";
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  
  return `${year}-${month}-${day}`;
}

/**
 * Display toast notification
 * @param {string} message - Message to display
 * @param {string} type - Toast type (info/success/error/update/delete)
 */
function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  // Animation timing
  setTimeout(() => toast.classList.add("show"), 50);
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 250);
  }, 2500);
}

/**
 * Normalize role value to 'admin' or 'user'
 * @param {string} role - Role to normalize
 * @returns {string} Normalized role
 */
function normalizeRole(role) {
  if (!role) return "user";
  const normalized = String(role).trim().toLowerCase();
  return normalized === "admin" ? "admin" : "user";
}

// ================================
// HEADER & NAVIGATION
// ================================

/**
 * Setup global UI elements (sidebar, profile menu, navigation)
 */
function bindGlobalUI() {
  setupSidebarToggle();
  setupProfileDropdown();
  setupNavigation();
}

/**
 * Setup sidebar toggle functionality
 */
function setupSidebarToggle() {
  const sidebar = document.getElementById("sidebar");
  const sidebarToggle = document.getElementById("sidebarToggle");
  
  if (sidebar && sidebarToggle) {
    sidebarToggle.setAttribute("aria-expanded", "true");
    sidebarToggle.addEventListener("click", () => {
      const isCollapsed = sidebar.classList.toggle("collapsed");
      sidebarToggle.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
    });
  }
}

/**
 * Setup profile dropdown functionality
 */
function setupProfileDropdown() {
  const profileBtn = document.getElementById("profileBtn");
  const profileMenu = document.getElementById("profileMenu");
  const logoutLink = document.getElementById("logoutLink");

  if (profileBtn && profileMenu) {
    // Toggle profile menu on button click
    profileBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isHidden = profileMenu.classList.toggle("hidden");
      profileBtn.setAttribute("aria-expanded", isHidden ? "false" : "true");
    });
    
    // Close menu when clicking outside
    document.addEventListener("click", () => {
      if (!profileMenu.classList.contains("hidden")) {
        profileMenu.classList.add("hidden");
        profileBtn.setAttribute("aria-expanded", "false");
      }
    });
    
    // Prevent menu from closing when clicking inside it
    profileMenu.addEventListener("click", (e) => e.stopPropagation());
  }

  // Handle logout
  logoutLink?.addEventListener("click", handleLogout);
}

/**
 * Handle user logout process
 * @param {Event} e - Click event
 */
async function handleLogout(e) {
  e.preventDefault();
  const token = getToken();
  const refreshToken = localStorage.getItem("refresh_token");
  
  try {
    // Notify backend to blacklist tokens
    await fetch(`${API_URL}/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        access_token: token,
        refresh_token: refreshToken,
      }),
    });
  } catch (error) {
    // Continue with logout even if API call fails
    console.error("Logout API error:", error);
  }
  
  // Clear local storage and redirect
  localStorage.clear();
  window.location.href = "index.html";
}

/**
 * Setup navigation between sections
 */
function setupNavigation() {
  const dashboardNav = document.getElementById("dashboardNav");
  const adminNav = document.getElementById("adminNav");
  const reportsNav = document.getElementById("reportsNav");
  const accountsNav = document.getElementById("accountsNav");
  
  const dashboardContent = document.querySelector(".dashboard-content");
  const adminSection = document.getElementById("adminPanelSection");
  const reportsSection = document.getElementById("reportsSection");
  const accountsSection = document.getElementById("accountsSection");

  /**
   * Show specific section and hide others
   * @param {HTMLElement} section - Section to show
   */
  function showSection(section) {
    // Hide all sections
    dashboardContent?.classList.add("hidden");
    adminSection?.classList.add("hidden");
    reportsSection?.classList.add("hidden");
    accountsSection?.classList.add("hidden");
    
    // Show requested section
    section?.classList.remove("hidden");

    // Update active navigation
    document.querySelectorAll(".sidebar-nav a").forEach((el) => 
      el.classList.remove("active")
    );
    
    if (section === dashboardContent) dashboardNav?.classList.add("active");
    if (section === adminSection) {
      adminNav?.classList.add("active");
      // Load users when entering admin panel
      if (getRole() === "admin") loadAdminUsers();
    }
    if (section === reportsSection) reportsNav?.classList.add("active");
    if (section === accountsSection) accountsNav?.classList.add("active");
  }

  // Navigation event handlers
  dashboardNav?.addEventListener("click", (e) => {
    e.preventDefault();
    showSection(dashboardContent);
  });
  
  adminNav?.addEventListener("click", (e) => {
    e.preventDefault();
    if (getRole() !== "admin") {
      showToast("Admins only.", "error");
      return;
    }
    showSection(adminSection);
  });
  
  reportsNav?.addEventListener("click", (e) => {
    e.preventDefault();
    showSection(reportsSection);
  });
  
  accountsNav?.addEventListener("click", (e) => {
    e.preventDefault();
    showSection(accountsSection);
    loadAccountProfile();
  });
}

/**
 * Load user profile information into header
 */
async function loadProfileHeader() {
  const token = getToken();
  const profileWelcome = document.getElementById("profileWelcome");
  
  if (!token || !profileWelcome) return;
  
  try {
    // Fetch current user data
    const response = await fetch(`${API_URL}/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    if (!response.ok) throw new Error("Failed to fetch user data");
    
    const userData = await response.json();
    
    // Store user data in localStorage
    localStorage.setItem("username", userData.username);
    localStorage.setItem("role", userData.role);
    
    // Update welcome message
    profileWelcome.textContent = `Welcome, ${userData.username}`;
  } catch (error) {
    // Fallback to saved username if API call fails
    const savedUsername = localStorage.getItem("username");
    profileWelcome.textContent = savedUsername 
      ? `Welcome, ${savedUsername}` 
      : "Welcome";
  }
}

// ================================
// PASSWORD MANAGEMENT
// ================================

// Get password modal elements
const changePasswordLink = document.getElementById("changePasswordLink");
const changePasswordModal = document.getElementById("changePasswordModal");
const changePasswordForm = document.getElementById("changePasswordForm");
const cancelChangePwdBtn = document.getElementById("cancelChangePwd");
const profileMenuEl = document.getElementById("profileMenu");

/**
 * Open change password modal
 */
function openChangePasswordModal() {
  if (!changePasswordModal) return;
  
  // Reset form and hide password fields
  changePasswordForm?.reset();
  ["oldPassword", "newPassword", "confirmPassword"].forEach(id => {
    const input = document.getElementById(id);
    if (input) input.type = "password";
  });
  
  // Reset eye icons to show password
  changePasswordModal.querySelectorAll(".toggle-password i").forEach(icon => {
    icon.classList.remove("fa-eye-slash");
    icon.classList.add("fa-eye");
  });

  // Hide profile dropdown if open
  profileMenuEl?.classList.add("hidden");

  // Show modal
  changePasswordModal.classList.remove("hidden");
}

/**
 * Close change password modal
 */
function closeChangePasswordModal() {
  changePasswordModal?.classList.add("hidden");
}

// Open modal from dropdown
changePasswordLink?.addEventListener("click", (e) => {
  e.preventDefault();
  openChangePasswordModal();
});

// Close modal with cancel button
cancelChangePwdBtn?.addEventListener("click", () => {
  closeChangePasswordModal();
});

// Close modal when clicking outside
window.addEventListener("click", (e) => {
  if (e.target === changePasswordModal) closeChangePasswordModal();
});

// Close modal with ESC key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && changePasswordModal && 
      !changePasswordModal.classList.contains("hidden")) {
    closeChangePasswordModal();
  }
});

// Toggle password visibility
changePasswordModal?.querySelectorAll(".toggle-password").forEach(button => {
  button.addEventListener("click", () => {
    const targetId = button.getAttribute("data-target");
    const input = document.getElementById(targetId);
    if (!input) return;

    // Toggle input type
    const isHidden = input.type === "password";
    input.type = isHidden ? "text" : "password";

    // Update eye icon
    const icon = button.querySelector("i");
    if (icon) {
      icon.classList.toggle("fa-eye-slash", isHidden);
      icon.classList.toggle("fa-eye", !isHidden);
    }
  });
});

// Handle password change form submission
changePasswordForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const token = getToken();

  // Get form values
  const oldPassword = document.getElementById("oldPassword")?.value?.trim();
  const newPassword = document.getElementById("newPassword")?.value?.trim();
  const confirmPassword = document.getElementById("confirmPassword")?.value?.trim();

  // Validation
  if (!oldPassword || !newPassword || !confirmPassword) {
    return showToast("⚠️ Please fill all fields", "error");
  }
  
  if (newPassword !== confirmPassword) {
    return showToast("❌ New and Confirm passwords do not match", "error");
  }

  try {
    // Send password update request
    const response = await fetch(`${API_URL}/profile/update-password`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        old_password: oldPassword,
        new_password: newPassword,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || errorData.message || "Password update failed");
    }

    // Success handling
    showToast("✅ Password updated successfully", "success");
    changePasswordForm.reset();
    closeChangePasswordModal();
  } catch (error) {
    console.error("Password update error:", error);
    showToast(error.message || "⚠️ Operation failed", "error");
  }
});

// ================================
// DASHBOARD FUNCTIONALITY
// ================================

/**
 * Setup dashboard UI elements and event listeners
 */
function bindDashboardUI() {
  setupDashboardFilters();
  setupExportButtons();
  setupImportButton();
}

/**
 * Setup dashboard filter functionality
 */
function setupDashboardFilters() {
  const searchInput = document.getElementById("searchInput");
  const filterBtn = document.getElementById("filterBtn");
  const clearFilterBtn = document.getElementById("clearFilterBtn");

  searchInput?.addEventListener("input", applyFilters);
  filterBtn?.addEventListener("click", applyFilters);
  clearFilterBtn?.addEventListener("click", clearFilters);

  // Secondary filter set (if exists)
  const searchInput1 = document.getElementById("searchInput1");
  const filterBtn1 = document.getElementById("filterBtn1");
  const clearFilterBtn1 = document.getElementById("clearFilterBtn1");

  if (searchInput1 && filterBtn1 && clearFilterBtn1) {
    searchInput1.addEventListener("input", applyFilters);
    filterBtn1.addEventListener("click", applyFilters);
    clearFilterBtn1.addEventListener("click", clearFilters1);
  }
}

/**
 * Setup export buttons functionality
 */
function setupExportButtons() {
  document.getElementById("downloadCSVBtn")?.addEventListener("click", () => {
    downloadCSV(filteredData.length ? filteredData : rawData);
  });

  document.getElementById("downloadPDFBtn")?.addEventListener("click", () => {
    downloadPDF(filteredData.length ? filteredData : rawData);
  });
}

/**
 * Setup data import functionality
 */
function setupImportButton() {
  const importBtn = document.getElementById("importDataBtn");

  importBtn?.addEventListener("click", handleDataImport);
}

/**
 * Handle data import process
 * @param {Event} event - Click event
 */
async function handleDataImport(event) {
  event.preventDefault();
  event.stopPropagation();

  const token = getToken();
  
  // Admin-only feature
  if (getRole() !== "admin") {
    showToast("Admins only.", "error");
    return;
  }

  // Show loading state
  importBtn.disabled = true;
  const originalText = importBtn.innerHTML;
  importBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Importing...';

  try {
    // Send import request
    const response = await fetch(`${API_URL}/import-data`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    const responseText = await response.text();
    let responseData;
    
    try { 
      responseData = JSON.parse(responseText); 
    } catch { 
      responseData = { message: responseText }; 
    }

    if (!response.ok) {
      // Handle already imported case
      if (response.status === 400 && responseData.detail && 
          responseData.detail.includes("already imported")) {
        alert(responseData.detail);
      } else {
        throw new Error(responseData.detail || responseData.message || "Import failed");
      }
    } else {
      // Success case
      if (responseData.message && responseData.message.includes("already imported")) {
        alert(responseData.message);
      } else {
        showToast(responseData.message || "Import successful", "success");
      }
    }
  } catch (error) {
    showToast(error.message || "Import failed", "error");
  } finally {
    // Restore button state
    importBtn.disabled = false;
    importBtn.innerHTML = originalText;
  }
}

/**
 * Load dashboard data (stats and payments)
 */
async function loadDashboard() {
  const token = getToken();
  const role = getRole();
  
  if (!token) {
    window.location.href = "index.html";
    return;
  }

  try {
    // Load dashboard statistics
    await loadDashboardStats(token, role);
    
    // Load payment data
    await loadPaymentData(token, role);
  } catch (error) {
    console.error("Dashboard load failed", error);
  }
}

/**
 * Load dashboard statistics
 * @param {string} token - JWT token
 * @param {string} role - User role
 */
async function loadDashboardStats(token, role) {
  const statsResponse = await fetch(`${API_URL}/dashboard/stats`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  
  if (statsResponse.ok) {
    const stats = await statsResponse.json();
    
    // Update stats in UI
    if (role === "admin" && document.getElementById("totalRiders")) {
      document.getElementById("totalRiders").textContent = stats.total_riders ?? 0;
    } else if (document.getElementById("totalRiders")) {
      document.getElementById("totalRiders").textContent = "-";
    }
    
    document.getElementById("totalHours").textContent = stats.total_hours ?? 0;
    document.getElementById("avgHours").textContent = 
      (stats.avg_hours ?? 0).toFixed ? stats.avg_hours.toFixed(2) : Number(stats.avg_hours || 0).toFixed(2);
  }
}

/**
 * Load payment data based on user role
 * @param {string} token - JWT token
 * @param {string} role - User role
 */
async function loadPaymentData(token, role) {
  const paymentsUrl = role === "admin" ? "/admin/riders" : "/my/payments";
  
  const paymentsResponse = await fetch(API_URL + paymentsUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  
  rawData = await paymentsResponse.json();
  filteredData = [...rawData];
  renderPaymentsTable(filteredData);
}

/**
 * Render payments table with data
 * @param {Array} rows - Data rows to render
 */
function renderPaymentsTable(rows) {
  const tbody = document.querySelector("#paymentsTable tbody");
  if (!tbody) return;
  
  tbody.innerHTML = "";

  if (!rows || !rows.length) {
    tbody.innerHTML = `<tr><td colspan="20">No records found</td></tr>`;
    return;
  }

  // Render each row
  rows.forEach((row, index) => {
    const tr = document.createElement("tr");
    const getValue = (value) => (value ?? "");
    const joinDateDisplay = formatDateForDisplay(row.doj);

    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${getValue(row.careem_captain_id)}</td>
      <td>${getValue(row.name)}</td>
      <td>${getValue(row.person_code)}</td>
      <td>${getValue(row.card_no)}</td>
      <td>${getValue(row.designation)}</td>
      <td>${joinDateDisplay}</td>
      <td>${getValue(row.total_working_hours)}</td>
      <td>${getValue(row.no_of_days)}</td>
      <td>${getValue(row.total_orders)}</td>
      <td>${getValue(row.actual_order_pay)}</td>
      <td>${getValue(row.total_excess_pay_bonus_and_dist_pay)}</td>
      <td>${getValue(row.gross_pay)}</td>
      <td>${getValue(row.total_cod_cash_on_delivery)}</td>
      <td>${getValue(row.vendor_fee)}</td>
      <td>${getValue(row.traffic_fine)}</td>
      <td>${getValue(row.loan_saladv_os_fine)}</td>
      <td>${getValue(row.training_fee)}</td>
      <td>${getValue(row.net_salary)}</td>
      <td>${getValue(row.imported_at)}</td>
      <td class="remarks">${getValue(row.remarks)}</td>
    `;
    
    tbody.appendChild(tr);
  });

  // Add grand totals for admin users
  if (rows.length && getRole() === "admin") {
    const totals = calculateGrandTotals(rows);
    const totalRow = document.createElement("tr");
    totalRow.style.fontWeight = "bold";
    totalRow.style.backgroundColor = "#f0f0f0";

    totalRow.innerHTML = `
      <td colspan="7" style="text-align:right;">Grand Total:</td>
      <td>${totals.total_working_hours}</td>
      <td>${totals.no_of_days}</td>
      <td>${totals.total_orders}</td>
      <td>${totals.actual_order_pay}</td>
      <td>${totals.total_excess_pay_bonus_and_dist_pay}</td>
      <td>${totals.gross_pay}</td>
      <td>${totals.total_cod_cash_on_delivery}</td>
      <td>${totals.vendor_fee}</td>
      <td>${totals.traffic_fine}</td>
      <td>${totals.loan_saladv_os_fine}</td>
      <td>${totals.training_fee}</td>
      <td>${totals.net_salary}</td>
      <td></td>
    `;
    
    tbody.appendChild(totalRow);
  }
}

/**
 * Calculate grand totals for payment data
 * @param {Array} rows - Data rows to calculate totals from
 * @returns {Object} Object containing summed values
 */
function calculateGrandTotals(rows) {
  const sumField = (field) => rows.reduce((sum, row) => sum + toNumber(row[field]), 0);
  
  return {
    total_working_hours: sumField("total_working_hours"),
    no_of_days: sumField("no_of_days"),
    total_orders: sumField("total_orders"),
    actual_order_pay: sumField("actual_order_pay"),
    total_excess_pay_bonus_and_dist_pay: sumField("total_excess_pay_bonus_and_dist_pay"),
    gross_pay: sumField("gross_pay"),
    total_cod_cash_on_delivery: sumField("total_cod_cash_on_delivery"),
    vendor_fee: sumField("vendor_fee"),
    traffic_fine: sumField("traffic_fine"),
    loan_saladv_os_fine: sumField("loan_saladv_os_fine"),
    training_fee: sumField("training_fee"),
    net_salary: sumField("net_salary"),
  };
}

/**
 * Apply filters to payment data
 */
function applyFilters() {
  const searchTerm = document.getElementById("searchInput").value.trim().toLowerCase();
  const startDateValue = document.getElementById("startDate").value;
  const endDateValue = document.getElementById("endDate").value;

  const startDate = startDateValue ? new Date(startDateValue + "T00:00:00") : null;
  const endDate = endDateValue ? new Date(endDateValue + "T23:59:59") : null;

  filteredData = rawData.filter((row) => {
    // Create search string from relevant fields
    const searchString = (
      (row.careem_captain_id ?? "").toString().toLowerCase() +
      " " +
      (row.name ?? "").toString().toLowerCase() +
      " " +
      (row.person_code ?? "").toString().toLowerCase()
    );

    const matchesSearch = searchTerm ? searchString.includes(searchTerm) : true;

    // Check date filters
    const rowDate = parseLooseDate(row.imported_at);
    let matchesDate = true;
    
    if (startDate && rowDate && rowDate < startDate) matchesDate = false;
    if (endDate && rowDate && rowDate > endDate) matchesDate = false;
    if ((startDate || endDate) && !rowDate) matchesDate = false;

    return matchesSearch && matchesDate;
  });

  renderPaymentsTable(filteredData);
}

/**
 * Clear all filters and reset view
 */
function clearFilters() {
  document.getElementById("searchInput").value = "";
  document.getElementById("startDate").value = "";
  document.getElementById("endDate").value = "";
  filteredData = [...rawData];
  renderPaymentsTable(filteredData);
}

/**
 * Clear secondary filters (if exists)
 */
function clearFilters1() {
  const searchInput1 = document.getElementById("searchInput1");
  const startDate1 = document.getElementById("startDate1");
  const endDate1 = document.getElementById("endDate1");
  
  if (searchInput1 && startDate1 && endDate1) {
    searchInput1.value = "";
    startDate1.value = "";
    endDate1.value = "";
    filteredData = [...rawData];
    renderPaymentsTable(filteredData);
  }
}

/**
 * Download data as CSV file
 * @param {Array} rows - Data to export
 */
function downloadCSV(rows) {
  if (!rows.length) {
    alert("No data to download!");
    return;
  }
  
  const headers = [
    "sno", "careem_captain_id", "name", "person_code", "card_no", "designation", "doj",
    "total_working_hours", "no_of_days", "total_orders", "actual_order_pay",
    "total_excess_pay_bonus_and_dist_pay", "gross_pay", "total_cod_cash_on_delivery",
    "vendor_fee", "traffic_fine", "loan_saladv_os_fine", "training_fee", "net_salary", "remarks"
  ];
  
  // Create CSV content
  const csvRows = [
    headers.join(","),
    ...rows.map((row, index) =>
      headers.map((header) => {
        let value = row[header];
        if (header === "sno") value = value ?? index + 1;
        if (header === "doj") value = formatDateForDisplay(row.doj);
        
        // Escape quotes in values
        value = (value ?? "").toString().replace(/"/g, '""');
        return `"${value}"`;
      }).join(",")
    )
  ];
  
  const csvContent = csvRows.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  
  // Create download link
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "rider_payments.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Download data as PDF file
 * @param {Array} rows - Data to export
 */
function downloadPDF(rows) {
  if (!rows.length) {
    alert("No data to download!");
    return;
  }
  
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("landscape", "pt", "a3");

  const headers = [
    "S.No", "Captain ID", "Name", "Person Code", "Card No", "Designation", "DOJ",
    "Total Working Hours", "No of Days", "Total Orders", "Actual Order Pay",
    "Excess Pay Bonus/Dist", "Gross Pay", "Total COD", "Vendor Fee", "Traffic Fine",
    "Loan/SalAdv/OS Fine", "Training Fee", "Net Salary", "Remarks"
  ];

  const body = rows.map((row, index) => [
    row.sno ?? (index + 1),
    safe(row.careem_captain_id),
    safe(row.name),
    safe(row.person_code),
    safe(row.card_no),
    safe(row.designation),
    formatDateForDisplay(row.doj),
    safe(row.total_working_hours),
    safe(row.no_of_days),
    safe(row.total_orders),
    safe(row.actual_order_pay),
    safe(row.total_excess_pay_bonus_and_dist_pay),
    safe(row.gross_pay),
    safe(row.total_cod_cash_on_delivery),
    safe(row.vendor_fee),
    safe(row.traffic_fine),
    safe(row.loan_saladv_os_fine),
    safe(row.training_fee),
    safe(row.net_salary),
    safe(row.remarks)
  ]);

  // Add title and table to PDF
  doc.setFontSize(14);
  doc.text("Rider Payments Report", 40, 40);
  
  doc.autoTable({
    head: [headers],
    body,
    startY: 60,
    theme: "grid",
    styles: { 
      fontSize: 8, 
      cellPadding: 3, 
      overflow: "linebreak", 
      valign: "top" 
    },
    columnStyles: { 
      19: { cellWidth: 180 } // Wider column for remarks
    },
    headStyles: { 
      fillColor: [41, 128, 185], 
      textColor: 255 
    }
  });
  
  // Save PDF
  doc.save("rider_payments.pdf");
}

// ================================
// ADMIN PANEL FUNCTIONALITY
// ================================

/**
 * Setup admin panel UI and event listeners
 */
function bindAdminUI() {
  setupCreateUserModal();
  setupEditUserModal();
  setupUserDeletion();
}

/**
 * Setup create user modal functionality
 */
function setupCreateUserModal() {
  const createUserBtn = document.getElementById("createUserBtn");
  const createModal = document.getElementById("createUserModal");
  const closeModalBtn = document.getElementById("closeModal");
  const createUserForm = document.getElementById("createUserForm");

  // Open modal
  createUserBtn?.addEventListener("click", () => {
    createUserForm.reset();
    createModal?.classList.remove("hidden");
  });

  // Close modal
  closeModalBtn?.addEventListener("click", () => {
    createModal?.classList.add("hidden");
  });

  // Handle form submission
  createUserForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const token = getToken();
    
    const username = document.getElementById("createUsername").value.trim();
    const password = document.getElementById("createPassword").value;
    const role = normalizeRole(document.getElementById("newRole").value);

    try {
      const response = await fetch(
        `${API_URL}/register?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&role=${encodeURIComponent(role)}`, 
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      
      if (!response.ok) {
        throw new Error(await response.text());
      }
      
      showToast("✅ User created", "success");
      createModal.classList.add("hidden");
      await loadAdminUsers(); // Refresh user list
    } catch (error) {
      showToast(error.message, "error");
    }
  });
}

/**
 * Setup edit user modal functionality
 */
function setupEditUserModal() {
  const editModal = document.getElementById("editUserModal");
  const closeEditModalBtn = document.getElementById("closeEditModal");
  const editUserForm = document.getElementById("editUserForm");

  // Close modal
  closeEditModalBtn?.addEventListener("click", () => {
    editModal?.classList.add("hidden");
  });

  // Handle edit button clicks
  document.addEventListener("click", (e) => {
    const editBtn = e.target.closest(".edit-user");
    if (!editBtn) return;

    const row = e.target.closest("tr");
    const username = row?.dataset?.username;
    const roleText = row.querySelector('[data-col="role"]').textContent.trim();

    // Populate form with user data
    document.getElementById("editUsername").value = username;
    document.getElementById("editRole").value = roleText === "Admin" ? "Admin" : "User";

    // Show modal
    editModal.classList.remove("hidden");
  });

  // Handle form submission
  editUserForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const token = getToken();
    
    const username = document.getElementById("editUsername").value.trim();
    const role = normalizeRole(document.getElementById("editRole").value);

    try {
      const response = await fetch(`${API_URL}/admin/update-user`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ username, role }),
      });
      
      if (!response.ok) {
        throw new Error(await response.text());
      }
      
      showToast("📝 User updated", "update");
      editModal.classList.add("hidden");
      await loadAdminUsers(); // Refresh user list
    } catch (error) {
      showToast(error.message, "error");
    }
  });
}

/**
 * Setup user deletion functionality
 */
function setupUserDeletion() {
  document.addEventListener("click", async (e) => {
    const deleteBtn = e.target.closest(".delete-user");
    if (!deleteBtn) return;

    // Get username from data attribute
    const row = e.target.closest("tr");
    const username = row?.dataset?.username;
    
    if (!username) return;

    // Confirm deletion
    if (confirm(`Delete user "${username}"?`)) {
      try {
        const token = getToken();
        const response = await fetch(
          `${API_URL}/admin/delete-user/${encodeURIComponent(username)}`, 
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || "Delete failed");
        }

        showToast(`❌ User "${username}" deleted`, "delete");
        await loadAdminUsers(); // Refresh user list
      } catch (error) {
        showToast(error.message || "Delete failed", "error");
      }
    }
  });
}

/**
 * Load admin users list
 */
async function loadAdminUsers() {
  const token = getToken();
  
  // Only admins can access this
  if (getRole() !== "admin") return;
  
  const tableBody = document.querySelector("#adminUsersTable tbody");
  if (!tableBody) return;

  // Show loading state
  tableBody.innerHTML = `<tr><td colspan="6">Loading...</td></tr>`;
  
  try {
    const response = await fetch(`${API_URL}/admin/users`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    if (!response.ok) {
      throw new Error(await response.text());
    }
    
    const users = await response.json();
    cachedUsers = users;
    renderUsersTable(users);
  } catch (error) {
    tableBody.innerHTML = `<tr><td colspan="6">Failed to load users</td></tr>`;
    showToast(error.message || "Failed to load users", "error");
  }
}

/**
 * Render users table with data
 * @param {Array} users - User data to render
 */
function renderUsersTable(users) {
  const tbody = document.querySelector("#adminUsersTable tbody");
  if (!tbody) return;
  
  tbody.innerHTML = "";

  if (!users || !users.length) {
    tbody.innerHTML = `<tr><td colspan="6">No users found</td></tr>`;
    return;
  }

  // Render each user row
  users.forEach((user, index) => {
    const tr = document.createElement("tr");
    tr.dataset.username = user.username;
    
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td data-col="username">${user.username}</td>
      <td data-col="role">${(user.role || "").toString().toLowerCase()}</td>
      <td data-col="created_at">${formatDateForDisplay(user.created_at)}</td>
      <td>
        <button class="btn btn-icon edit-user" title="Edit">
          <i class="fas fa-edit"></i>
        </button>
        <button class="btn btn-icon delete-user" title="Delete">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    `;
    
    tbody.appendChild(tr);
  });
}

// ================================
// REPORTS FUNCTIONALITY
// ================================

/**
 * Setup reports UI and event listeners
 */
async function bindReportsUI() {
  const searchInput = document.getElementById("searchInput1");
  const filterBtn = document.getElementById("filterBtn1");
  const clearBtn = document.getElementById("clearFilterBtn1");
  const reportLimit = document.getElementById("reportLimit");
  const reportsTable = document.getElementById("reportsTable");
  
  if (!reportsTable) return;

  const token = getToken();
  if (!token) {
    alert("Please login first.");
    window.location.href = "index.html";
    return;
  }

  /**
   * Load logs with filtering and pagination
   * @param {number} limit - Number of records to load
   * @param {number} skip - Number of records to skip
   */
  async function loadLogs(limit = 10, skip = 0) {
    const params = new URLSearchParams();
    params.append("limit", limit);
    params.append("skip", skip);

    // Get filter values
    const searchTerm = searchInput?.value.trim();
    const startDate = document.getElementById("startDate1")?.value;
    const endDate = document.getElementById("endDate1")?.value;

    // Add filters to request
    if (searchTerm) params.append("username", searchTerm);
    if (startDate) params.append("start_date", startDate);
    if (endDate) params.append("end_date", endDate);

    try {
      const response = await fetch(`${API_URL}/admin/logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        throw new Error("Failed to load logs");
      }
      
      const data = await response.json();
      renderLogsTable(data.logs);
    } catch (error) {
      console.error("Error loading logs:", error);
      showToast("❌ Failed to load logs: " + error.message);
    }
  }

  /**
   * Render logs table with data
   * @param {Array} logs - Log data to render
   */
  function renderLogsTable(logs) {
    const tbody = reportsTable.querySelector("tbody");
    tbody.innerHTML = "";

    if (!logs || logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4">No records found</td></tr>`;
      return;
    }

    // Render each log row
    logs.forEach((log) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${log.id}</td>
        <td>${log.username}</td>
        <td>${log.action}</td>
        <td>${formatDateForDisplay(log.timestamp)}</td>
      `;
      
      tbody.appendChild(row);
    });
  }

  // Event listeners for filters and pagination
  reportLimit?.addEventListener("change", () => {
    loadLogs(parseInt(reportLimit.value), 0);
  });

  searchInput?.addEventListener("input", () => {
    loadLogs(parseInt(reportLimit?.value) || 10, 0);
  });
  
  filterBtn?.addEventListener("click", () => {
    loadLogs(parseInt(reportLimit?.value) || 10, 0);
  });
  
  clearBtn?.addEventListener("click", () => {
    if (searchInput) searchInput.value = "";
    document.getElementById("startDate1").value = "";
    document.getElementById("endDate1").value = "";
    loadLogs(parseInt(reportLimit?.value) || 10, 0);
  });

  // Initial load
  loadLogs(parseInt(reportLimit?.value) || 10, 0);
}

// ================================
// ACCOUNT MANAGEMENT
// ================================

/**
 * Setup account management UI
 */
function bindAccountsUI() {
  // This functionality has been moved to the password section
  // Keeping this as a placeholder for future account-related features
}

/**
 * Load account profile information
 */
async function loadAccountProfile() {
  const token = getToken();
  
  try {
    const response = await fetch(`${API_URL}/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (!response.ok) {
      throw new Error("Failed to load profile");
    }
    
    const userData = await response.json();
    
    // Update profile information
    document.getElementById("profileUsername").textContent = userData.username;
    document.getElementById("profileRole").textContent = userData.role;
  } catch (error) {
    showToast("❌ Failed to load profile", "error");
  }
}

// ================================
// MY ACCOUNT MODAL
// ================================

// Get modal elements
const myAccountLink = document.getElementById("myAccountLink");
const myAccountModal = document.getElementById("myAccountModal");
const closeAccountModal = document.getElementById("closeAccountModal");

// Open modal when "My Account" is clicked
myAccountLink?.addEventListener("click", async (e) => {
  e.preventDefault();
  const token = getToken();

  try {
    const response = await fetch(`${API_URL}/profile`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
      }
    });

    if (!response.ok) {
      throw new Error("Failed to fetch profile");
    }

    const userData = await response.json();

    // Fill modal with user data
    document.getElementById("accId").textContent = userData.id || "-";
    document.getElementById("accUsername").textContent = userData.username || "-";
    document.getElementById("accRole").textContent = userData.role || "-";
    document.getElementById("accCreated").textContent = userData.created_at || "-";

    // Show modal
    myAccountModal.classList.remove("hidden");

  } catch (error) {
    console.error("Error fetching profile:", error);
    alert("⚠ Unable to load profile. Please login again.");
  }
});

// Close modal with button
closeAccountModal?.addEventListener("click", () => {
  myAccountModal.classList.add("hidden");
});

// Close modal when clicking outside content
myAccountModal?.addEventListener("click", (e) => {
  if (e.target === myAccountModal) {
    myAccountModal.classList.add("hidden");
  }
});