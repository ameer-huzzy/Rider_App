// ================================
// CONFIG
// ================================
const API_URL = "http://127.0.0.1:8000";

// ================================
// STATE
// ================================
let rawData = [];
let filteredData = [];
let cachedUsers = [];
let isEditingUser = false; // modal state
let editingUsername = null;

// ================================
// BOOT
// ================================
document.addEventListener("DOMContentLoaded", () => {
  secureRouteGuard();
  bindGlobalUI();
  bindDashboardUI();
  bindAdminUI();
  bindReportsUI();
  bindAccountsUI();
  loadProfileHeader();
  loadDashboard(); // stats + payments
});

// ================================
// AUTH / GUARD
// ================================
function getToken() {
  return localStorage.getItem("access_token");
}
function getRole() {
  // Ensure lowercase ("admin" | "user")
  const r = localStorage.getItem("role");
  return r ? r.toLowerCase() : "";
}
function secureRouteGuard() {
  if (!getToken()) {
    window.location.href = "index.html";
  }
}

// ================================
// SHARED HELPERS
// ================================
function safe(v) { return v ?? ""; }
function toNumber(v) {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function parseLooseDate(s) {
  if (!s) return null;
  if (s instanceof Date) return s;
  if (typeof s !== "string") return null;
  const t = s.includes("T") ? s.split("T")[0] : s.split(" ")[0];
  if (!t) return null;
  const dt = new Date(t + "T00:00:00");
  return isNaN(dt.getTime()) ? null : dt;
}
function formatDateForDisplay(s) {
  const d = parseLooseDate(s);
  if (!d) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add("show"), 50);
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 250);
  }, 2500);
}
function normalizeRole(val) {
  if (!val) return "user";
  const v = String(val).trim().toLowerCase();
  return v === "admin" ? "admin" : "user";
}

// ================================
// HEADER / SIDEBAR / PROFILE
// ================================
function bindGlobalUI() {
  // Sidebar collapse
  const sidebar = document.getElementById("sidebar");
  const sidebarToggle = document.getElementById("sidebarToggle");
  if (sidebar && sidebarToggle) {
    sidebarToggle.setAttribute("aria-expanded", "true");
    sidebarToggle.addEventListener("click", () => {
      const collapsed = sidebar.classList.toggle("collapsed");
      sidebarToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    });
  }

  // Profile dropdown
  const profileBtn = document.getElementById("profileBtn");
  const profileMenu = document.getElementById("profileMenu");
  const logoutLink = document.getElementById("logoutLink");

  if (profileBtn && profileMenu) {
    profileBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const nowHidden = profileMenu.classList.toggle("hidden");
      profileBtn.setAttribute("aria-expanded", nowHidden ? "false" : "true");
    });
    document.addEventListener("click", () => {
      if (!profileMenu.classList.contains("hidden")) {
        profileMenu.classList.add("hidden");
        profileBtn.setAttribute("aria-expanded", "false");
      }
    });
    profileMenu.addEventListener("click", (e) => e.stopPropagation());
  }


  // Logout -> backend blacklist
  logoutLink?.addEventListener("click", async (e) => {
    e.preventDefault();
    const token = localStorage.getItem("access_token");
    const refresh = localStorage.getItem("refresh_token");
    try {
      await fetch(`${API_URL}/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          access_token: token,
          refresh_token: refresh,
        }),
      });
    } catch (_) { }
    localStorage.clear();
    window.location.href = "index.html";
  });

  // Sidebar Nav -> show/hide sections
  const dashboardNav = document.getElementById("dashboardNav");
  const adminNav = document.getElementById("adminNav");
  const reportsNav = document.getElementById("reportsNav");
  const accountsNav = document.getElementById("accountsNav");
  const dashboardContent = document.querySelector(".dashboard-content");
  const adminSection = document.getElementById("adminPanelSection");
  const reportsSection = document.getElementById("reportsSection");
  const accountsSection = document.getElementById("accountsSection");

  function showSection(section) {
    dashboardContent?.classList.add("hidden");
    adminSection?.classList.add("hidden");
    reportsSection?.classList.add("hidden");
    accountsSection?.classList.add("hidden");
    section?.classList.remove("hidden");

    document.querySelectorAll(".sidebar-nav a").forEach((el) =>
      el.classList.remove("active")
    );
    if (section === dashboardContent) dashboardNav?.classList.add("active");
    if (section === adminSection) {
      adminNav?.classList.add("active");
      // Lazy load users when entering admin panel
      if (getRole() === "admin") loadAdminUsers();
    }
    if (section === reportsSection) reportsNav?.classList.add("active");
    if (section === accountsSection) accountsNav?.classList.add("active");
  }

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

async function loadProfileHeader() {
  const token = getToken();
  const profileWelcome = document.getElementById("profileWelcome");
  if (!token || !profileWelcome) return;
  try {
    const meRes = await fetch(`${API_URL}/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!meRes.ok) throw new Error();
    const me = await meRes.json();
    localStorage.setItem("username", me.username);
    localStorage.setItem("role", me.role);
    profileWelcome.textContent = `Welcome, ${me.username}`;
  } catch {
    // fallback to saved username if available
    const savedUsername = localStorage.getItem("username");
    profileWelcome.textContent = savedUsername ? `Welcome, ${savedUsername}` : "Welcome";
  }
}



/* ================================
 Change Password – open/close + eye toggles + submit
================================== */
const changePasswordLink = document.getElementById("changePasswordLink");
const changePasswordModal = document.getElementById("changePasswordModal");
const changePasswordForm = document.getElementById("changePasswordForm");
const cancelChangePwdBtn = document.getElementById("cancelChangePwd");
const profileMenuEl = document.getElementById("profileMenu");

function openChangePasswordModal() {
  if (!changePasswordModal) return;

  // reset form + inputs back to password type
  changePasswordForm?.reset();
  ["oldPassword", "newPassword", "confirmPassword"].forEach(id => {
    const input = document.getElementById(id);
    if (input) input.type = "password";
  });
  // reset icons to "eye"
  changePasswordModal.querySelectorAll(".toggle-password i").forEach(i => {
    i.classList.remove("fa-eye-slash");
    i.classList.add("fa-eye");
  });

  // hide profile dropdown if open
  profileMenuEl?.classList.add("hidden");

  changePasswordModal.classList.remove("hidden");
}

function closeChangePasswordModal() {
  changePasswordModal?.classList.add("hidden");
}

// Open modal from dropdown
changePasswordLink?.addEventListener("click", (e) => {
  e.preventDefault();
  openChangePasswordModal();
});

// Close: cancel button
cancelChangePwdBtn?.addEventListener("click", () => {
  closeChangePasswordModal();
});

// Close: click outside modal content
window.addEventListener("click", (e) => {
  if (e.target === changePasswordModal) closeChangePasswordModal();
});

// Close: ESC key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && changePasswordModal && !changePasswordModal.classList.contains("hidden")) {
    closeChangePasswordModal();
  }
});

// Eye toggles (works for old/new/confirm)
changePasswordModal?.querySelectorAll(".toggle-password").forEach(btn => {
  btn.addEventListener("click", () => {
    const targetId = btn.getAttribute("data-target");
    const input = document.getElementById(targetId);
    if (!input) return;

    const isHidden = input.type === "password";
    input.type = isHidden ? "text" : "password";

    const icon = btn.querySelector("i");
    if (icon) {
      icon.classList.toggle("fa-eye-slash", isHidden);
      icon.classList.toggle("fa-eye", !isHidden);
    }
  });
});


// Submit: update password
changePasswordForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const token = getToken(); // same helper you already use for admin actions

  const oldPassword = document.getElementById("oldPassword")?.value?.trim();
  const newPassword = document.getElementById("newPassword")?.value?.trim();
  const confirmPassword = document.getElementById("confirmPassword")?.value?.trim();

  // basic validation
  if (!oldPassword || !newPassword || !confirmPassword) {
    return showToast("⚠️ Please fill all fields", "error");
  }
  if (newPassword !== confirmPassword) {
    return showToast("❌ New and Confirm passwords do not match", "error");
  }

  try {
    const res = await fetch(`${API_URL}/profile/update-password`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`, // consistent with your other requests
      },
      body: JSON.stringify({
        old_password: oldPassword, // backend expects snake_case
        new_password: newPassword,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || data.message || "Password update failed");
    }

    showToast("✅ Password updated successfully", "success");
    changePasswordForm.reset();
    closeChangePasswordModal();
  } catch (err) {
    console.error("Password update error:", err);
    showToast(err.message || "⚠️ Operation failed", "error");
  }
});



// ================================
// DASHBOARD (stats + payments + filters + export + import)
// ================================
function bindDashboardUI() {
  const searchInput = document.getElementById("searchInput");
  const filterBtn = document.getElementById("filterBtn");
  const clearFilterBtn = document.getElementById("clearFilterBtn");

  searchInput?.addEventListener("input", applyFilters);
  filterBtn?.addEventListener("click", applyFilters);
  clearFilterBtn?.addEventListener("click", clearFilters);

  const searchInput1 = document.getElementById("searchInput1");
  const filterBtn1 = document.getElementById("filterBtn1");
  const clearFilterBtn1 = document.getElementById("clearFilterBtn1");

  searchInput1?.addEventListener("input", applyFilters);
  filterBtn1?.addEventListener("click", applyFilters);
  clearFilterBtn1?.addEventListener("click", clearFilters1);

  document.getElementById("downloadCSVBtn")?.addEventListener("click", () => {
    downloadCSV(filteredData.length ? filteredData : rawData);
  });

  document.getElementById("downloadPDFBtn")?.addEventListener("click", () => {
    downloadPDF(filteredData.length ? filteredData : rawData);
  });

  // Import Data (admin only)
  const importBtn = document.getElementById("importDataBtn");
  console.log("Import Button:", importBtn);

  importBtn?.addEventListener("click", async (event) => {
    event.preventDefault();  // stops form submit
    event.stopPropagation(); // stops any parent handlers

    const token = getToken();
    if (getRole() !== "admin") {
      showToast("Admins only.", "error");
      return;
    }

    importBtn.disabled = true;
    const old = importBtn.innerHTML;
    importBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Importing...';

    try {
      const res = await fetch(`${API_URL}/import-data`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { message: text }; }

      if (!res.ok) {
        // Handle HTTP errors (including already imported case)
        if (res.status === 400 && data.detail && data.detail.includes("already imported")) {
          alert(data.detail);  // ✅ show simple alert
        } else {
          throw new Error(data.detail || data.message || "Import failed");
        }
      } else {
        // Success case
        if (data.message && data.message.includes("already imported")) {
          alert(data.message); // ✅ show simple alert for existing data
        } else {
          showToast(data.message || "Import successful", "success");
          // await loadDashboard(); // refresh table after import
        }
      }

    } catch (err) {
      showToast(err.message || "Import failed", "error");
    } finally {
      importBtn.disabled = false;
      importBtn.innerHTML = old;
    }
  });


}

async function loadDashboard() {
  const token = getToken();
  const role = getRole();
  if (!token) {
    window.location.href = "index.html";
    return;
  }

  try {
    // Stats
    const statsRes = await fetch(`${API_URL}/dashboard/stats`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const stats = await statsRes.json();
    if (statsRes.ok) {
      if (role === "admin" && document.getElementById("totalRiders")) {
        document.getElementById("totalRiders").textContent = stats.total_riders ?? 0;
      } else if (document.getElementById("totalRiders")) {
        document.getElementById("totalRiders").textContent = "-";
      }
      document.getElementById("totalHours").textContent = stats.total_hours ?? 0;
      document.getElementById("avgHours").textContent =
        (stats.avg_hours ?? 0).toFixed ? stats.avg_hours.toFixed(2) : Number(stats.avg_hours || 0).toFixed(2);
    }

    // Payments
    const paymentsUrl = role === "admin" ? "/admin/riders" : "/my/payments";
    const payRes = await fetch(API_URL + paymentsUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    rawData = await payRes.json();
    filteredData = [...rawData];
    renderPaymentsTable(filteredData);
  } catch (err) {
    console.error("Dashboard load failed", err);
  }
}

function renderPaymentsTable(rows) {
  const tbody = document.querySelector("#paymentsTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!rows || !rows.length) {
    tbody.innerHTML = `<tr><td colspan="20">No records found</td></tr>`;
    return;
  }

  rows.forEach((row, idx) => {
    const tr = document.createElement("tr");
    const g = (v) => (v ?? "");
    const dojDisplay = formatDateForDisplay(row.doj);

    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${g(row.careem_captain_id)}</td>
      <td>${g(row.name)}</td>
      <td>${g(row.person_code)}</td>
      <td>${g(row.card_no)}</td>
      <td>${g(row.designation)}</td>
      <td>${dojDisplay}</td>
      <td>${g(row.total_working_hours)}</td>
      <td>${g(row.no_of_days)}</td>
      <td>${g(row.total_orders)}</td>
      <td>${g(row.actual_order_pay)}</td>
      <td>${g(row.total_excess_pay_bonus_and_dist_pay)}</td>
      <td>${g(row.gross_pay)}</td>
      <td>${g(row.total_cod_cash_on_delivery)}</td>
      <td>${g(row.vendor_fee)}</td>
      <td>${g(row.traffic_fine)}</td>
      <td>${g(row.loan_saladv_os_fine)}</td>
      <td>${g(row.training_fee)}</td>
      <td>${g(row.net_salary)}</td>
      <td>${g(row.imported_at)}</td>
      <td class="remarks">${g(row.remarks)}</td>
    `;
    tbody.appendChild(tr);
  });

  // Admin-only Grand Totals
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
function calculateGrandTotals(rows) {
  const sumField = (field) => rows.reduce((sum, r) => sum + toNumber(r[field]), 0);
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

// Filters (frontend only)
function applyFilters() {
  const term = document.getElementById("searchInput").value.trim().toLowerCase();
  const start = document.getElementById("startDate").value;
  const end = document.getElementById("endDate").value;

  const startDate = start ? new Date(start + "T00:00:00") : null;
  const endDate = end ? new Date(end + "T23:59:59") : null;

  filteredData = rawData.filter((r) => {
    const s =
      (r.careem_captain_id ?? "").toString().toLowerCase() +
      " " +
      (r.name ?? "").toString().toLowerCase() +
      " " +
      (r.person_code ?? "").toString().toLowerCase();

    const matchesSearch = term ? s.includes(term) : true;

    const date = parseLooseDate(r.imported_at);
    let matchesDate = true;
    if (startDate && date && date < startDate) matchesDate = false;
    if (endDate && date && date > endDate) matchesDate = false;
    if ((startDate || endDate) && !date) matchesDate = false;

    return matchesSearch && matchesDate;
  });

  renderPaymentsTable(filteredData);
}
function clearFilters() {
  document.getElementById("searchInput").value = "";
  document.getElementById("startDate").value = "";
  document.getElementById("endDate").value = "";
  filteredData = [...rawData];
  renderPaymentsTable(filteredData);
}

function clearFilters1() {
  document.getElementById("searchInput1").value = "";
  document.getElementById("startDate1").value = "";
  document.getElementById("endDate1").value = "";
  filteredData = [...rawData];
  renderPaymentsTable(filteredData);
}

// Export CSV
function downloadCSV(rows) {
  if (!rows.length) return alert("No data to download!");
  const headers = [
    "sno", "careem_captain_id", "name", "person_code", "card_no", "designation", "doj",
    "total_working_hours", "no_of_days", "total_orders", "actual_order_pay",
    "total_excess_pay_bonus_and_dist_pay", "gross_pay", "total_cod_cash_on_delivery",
    "vendor_fee", "traffic_fine", "loan_saladv_os_fine", "training_fee", "net_salary", "remarks"
  ];
  const csv = [
    headers.join(","),
    ...rows.map((r, i) =>
      headers.map((h) => {
        let v = r[h];
        if (h === "sno") v = v ?? i + 1;
        if (h === "doj") v = formatDateForDisplay(r.doj);
        v = (v ?? "").toString().replace(/"/g, '""');
        return `"${v}"`;
      }).join(",")
    )
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "rider_payments.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Export PDF
function downloadPDF(rows) {
  if (!rows.length) return alert("No data to download!");
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("landscape", "pt", "a3");

  const headers = [
    "S.No", "Captain ID", "Name", "Person Code", "Card No", "Designation", "DOJ",
    "Total Working Hours", "No of Days", "Total Orders", "Actual Order Pay",
    "Excess Pay Bonus/Dist", "Gross Pay", "Total COD", "Vendor Fee", "Traffic Fine",
    "Loan/SalAdv/OS Fine", "Training Fee", "Net Salary", "Remarks"
  ];

  const body = rows.map((r, i) => [
    r.sno ?? (i + 1),
    safe(r.careem_captain_id),
    safe(r.name),
    safe(r.person_code),
    safe(r.card_no),
    safe(r.designation),
    formatDateForDisplay(r.doj),
    safe(r.total_working_hours),
    safe(r.no_of_days),
    safe(r.total_orders),
    safe(r.actual_order_pay),
    safe(r.total_excess_pay_bonus_and_dist_pay),
    safe(r.gross_pay),
    safe(r.total_cod_cash_on_delivery),
    safe(r.vendor_fee),
    safe(r.traffic_fine),
    safe(r.loan_saladv_os_fine),
    safe(r.training_fee),
    safe(r.net_salary),
    safe(r.remarks)
  ]);

  doc.setFontSize(14);
  doc.text("Rider Payments Report", 40, 40);
  doc.autoTable({
    head: [headers],
    body,
    startY: 60,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak", valign: "top" },
    columnStyles: { 19: { cellWidth: 180 } },
    headStyles: { fillColor: [41, 128, 185], textColor: 255 }
  });
  doc.save("rider_payments.pdf");
}
function bindAdminUI() {
  const createUserBtn = document.getElementById("createUserBtn");
  const createModal = document.getElementById("createUserModal");
  const closeModalBtn = document.getElementById("closeModal");
  const createUserForm = document.getElementById("createUserForm");

  const editModal = document.getElementById("editUserModal");
  const closeEditModalBtn = document.getElementById("closeEditModal");
  const editUserForm = document.getElementById("editUserForm");

  // ------------------
  // CREATE USER
  // ------------------
  createUserBtn?.addEventListener("click", () => {
    createUserForm.reset();
    createModal?.classList.remove("hidden");
  });

  closeModalBtn?.addEventListener("click", () => createModal?.classList.add("hidden"));

  // Submit create form
  createUserForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const token = getToken();
    const username = document.getElementById("createUsername").value.trim();
    const password = document.getElementById("createPassword").value;
    const role = normalizeRole(document.getElementById("newRole").value);

    try {
      const res = await fetch(`${API_URL}/register?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&role=${encodeURIComponent(role)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      showToast("✅ User created", "success");
      createModal.classList.add("hidden");
      await loadAdminUsers();
    } catch (err) {
      showToast(err.message, "error");
    }
  });

  // ------------------
  // EDIT USER
  // ------------------
  closeEditModalBtn?.addEventListener("click", () => editModal?.classList.add("hidden"));

  document.addEventListener("click", (e) => {
    const editBtn = e.target.closest(".edit-user");
    if (!editBtn) return;

    const row = e.target.closest("tr");
    const username = row?.dataset?.username;
    const roleText = row.querySelector('[data-col="role"]').textContent.trim();

    document.getElementById("editUsername").value = username;
    document.getElementById("editRole").value = roleText === "Admin" ? "Admin" : "User";

    editModal.classList.remove("hidden");
  });

  editUserForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const token = getToken();
    const username = document.getElementById("editUsername").value.trim();
    const role = normalizeRole(document.getElementById("editRole").value);

    try {
      const res = await fetch(`${API_URL}/admin/update-user`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ username, role }),
      });
      if (!res.ok) throw new Error(await res.text());
      showToast("📝 User updated", "update");
      editModal.classList.add("hidden");
      await loadAdminUsers();
    } catch (err) {
      showToast(err.message, "error");
    }
  });
  document.addEventListener("click", async (e) => {
    const deleteBtn = e.target.closest(".delete-user");
    if (!deleteBtn) return;

    // find the row & username
    const row = e.target.closest("tr");
    const username = row?.dataset?.username;
    if (!username) return;

    if (confirm(`Delete user "${username}"?`)) {
      try {
        const token = getToken();
        const res = await fetch(`${API_URL}/admin/delete-user/${encodeURIComponent(username)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          const txt = await res.text();
          throw new Error(txt || "Delete failed");
        }

        showToast(`❌ User "${username}" deleted`, "delete");
        await loadAdminUsers();
      } catch (err) {
        showToast(err.message || "Delete failed", "error");
      }
    }
  });

}

async function loadAdminUsers() {
  const token = getToken();
  if (getRole() !== "admin") return;
  const tableBody = document.querySelector("#adminUsersTable tbody");
  if (!tableBody) return;

  tableBody.innerHTML = `<tr><td colspan="6">Loading...</td></tr>`;
  try {
    const res = await fetch(`${API_URL}/admin/users`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(await res.text());
    const users = await res.json(); // [{id, username, role}]
    cachedUsers = users;
    renderUsersTable(users);
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="6">Failed to load users</td></tr>`;
    showToast(err.message || "Failed to load users", "error");
  }
}

function renderUsersTable(users) {
  const tbody = document.querySelector("#adminUsersTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!users || !users.length) {
    tbody.innerHTML = `<tr><td colspan="6">No users found</td></tr>`;
    return;
  }

  users.forEach((u, idx) => {
    const tr = document.createElement("tr");
    tr.dataset.username = u.username;
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td data-col="username">${u.username}</td>
      <td data-col="role">${(u.role || "").toString().toLowerCase()}</td>
      <td data-col="created_at">${formatDateForDisplay(u.created_at)}</td>
      <td>
        <button class="btn btn-icon edit-user" title="Edit"><i class="fas fa-edit"></i></button>
        <button class="btn btn-icon delete-user" title="Delete"><i class="fas fa-trash"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ================================
// REPORTS (simple page size control)
// ================================
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


  async function loadLogs(limit = 10, skip = 0) {
    const params = new URLSearchParams();
    params.append("limit", limit);
    params.append("skip", skip);

    const term = searchInput?.value.trim();
    const start = document.getElementById("startDate1")?.value;
    const end = document.getElementById("endDate1")?.value;

    // Use "username" parameter as expected by your backend
    if (term) params.append("username", term);
    if (start) params.append("start_date", start);
    if (end) params.append("end_date", end);

    try {
      const res = await fetch(`${API_URL}/admin/logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) throw new Error("Failed to load logs");
      const data = await res.json();

      renderLogsTable(data.logs);
    } catch (err) {
      console.error("Error loading logs:", err);
      showToast("❌ Failed to load logs: " + err.message);
    }
  }

  function renderLogsTable(logs) {
    const tbody = reportsTable.querySelector("tbody");
    tbody.innerHTML = "";

    if (!logs || logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4">No records found</td></tr>`;
      return;
    }

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

  // Handle dropdown change
  reportLimit?.addEventListener("change", () => {
    loadLogs(parseInt(reportLimit.value), 0);
  });

  searchInput?.addEventListener("input", () => loadLogs(parseInt(reportLimit?.value) || 10, 0));
  filterBtn?.addEventListener("click", () => loadLogs(parseInt(reportLimit?.value) || 10, 0));
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
// ACCOUNTS (Profile + Change Password)
// ================================
function bindAccountsUI() {
  const changePwdForm = document.getElementById("changePasswordForm");
  if (!changePwdForm) return;

  changePwdForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const token = getToken();
    const old_password = document.getElementById("oldPassword").value;
    const new_password = document.getElementById("newPasswordAcc").value;

    try {
      const res = await fetch(`${API_URL}/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ old_password, new_password }),
      });

      if (!res.ok) throw new Error(await res.text());
      showToast("✅ Password changed successfully", "success");
      changePwdForm.reset();
    } catch (err) {
      showToast(err.message || "Failed to change password", "error");
    }
  });
}

async function loadAccountProfile() {
  const token = getToken();
  try {
    const res = await fetch(`${API_URL}/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error();
    const me = await res.json();
    document.getElementById("profileUsername").textContent = me.username;
    document.getElementById("profileRole").textContent = me.role;
  } catch {
    showToast("❌ Failed to load profile", "error");
  }
}

/* ================================
   My Account Modal – Fetch & Display
================================== */
const myAccountLink = document.getElementById("myAccountLink"); // dropdown link
const myAccountModal = document.getElementById("myAccountModal");
const closeAccountModal = document.getElementById("closeAccountModal");
const token = getToken();

// Open modal when "My Account" is clicked
myAccountLink?.addEventListener("click", async (e) => {
  e.preventDefault();

  try {
    const res = await fetch(`${API_URL}/profile`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
      }
    });

    if (!res.ok) {
      throw new Error("Failed to fetch profile");
    }

    const data = await res.json();

    // Fill modal fields
    document.getElementById("accId").textContent = data.id || "-";
    document.getElementById("accUsername").textContent = data.username || "-";
    document.getElementById("accRole").textContent = data.role || "-";
    document.getElementById("accCreated").textContent = data.created_at || "-";

    // Show modal
    myAccountModal.classList.remove("hidden");

  } catch (err) {
    console.error("Error fetching profile:", err);
    alert("⚠ Unable to load profile. Please login again.");
  }
});

// Close modal
closeAccountModal?.addEventListener("click", () => {
  myAccountModal.classList.add("hidden");
});

// Close modal when clicking outside content
myAccountModal?.addEventListener("click", (e) => {
  if (e.target === myAccountModal) {
    myAccountModal.classList.add("hidden");
  }
});

