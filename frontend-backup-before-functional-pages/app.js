const API_BASE = "http://localhost:3000";

const state = {
  donors: [],
  requests: [],
  notifications: [],
  health: null,
  filteredDonors: [],
  filteredRequests: []
};

function qs(selector) {
  return document.querySelector(selector);
}

function qsa(selector) {
  return Array.from(document.querySelectorAll(selector));
}

async function apiGet(path) {
  const response = await fetch(`${API_BASE}${path}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || `GET ${path} failed`);
  return data;
}

async function apiPost(path, payload) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.message || `POST ${path} failed`);
  return data;
}

async function apiPatch(path, payload) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.message || `PATCH ${path} failed`);
  return data;
}

async function apiDelete(path) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "DELETE"
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.message || `DELETE ${path} failed`);
  return data;
}

function setText(selector, value) {
  const el = qs(selector);
  if (el) el.textContent = value;
}

function setPage(page) {
  qsa(".page").forEach((el) => el.classList.remove("active"));
  qsa(".nav-pill").forEach((el) => el.classList.remove("active"));

  qs(`#${page}Page`)?.classList.add("active");
  qs(`[data-page="${page}"]`)?.classList.add("active");

  if (page === "donors") renderDonors();
  if (page === "requests") renderRequests();
}

function cityLabel(city) {
  const map = {
    Sanaa: "صنعاء",
    Taiz: "تعز",
    Aden: "عدن",
    Ibb: "إب"
  };

  return map[city] || city;
}

function translateStatus(value) {
  const map = {
    PENDING: "قيد الانتظار",
    MATCHED: "تمت المطابقة",
    COMPLETED: "مكتمل",
    CANCELLED: "ملغي",
    CRITICAL: "حرج",
    HIGH: "مرتفع",
    MEDIUM: "متوسط",
    LOW: "منخفض",
    UP: "يعمل",
    DOWN: "متوقف"
  };

  return map[value] || value;
}

function badge(text, type = "gray") {
  return `<span class="badge badge-${type}">${translateStatus(text)}</span>`;
}

function urgencyClass(urgency) {
  const value = String(urgency || "").toLowerCase();
  if (value === "critical") return "critical";
  if (value === "high") return "high";
  if (value === "medium") return "medium";
  return "low";
}

function statusClass(status) {
  const value = String(status || "").toLowerCase();
  if (value === "matched") return "matched";
  if (value === "completed") return "completed";
  if (value === "cancelled") return "cancelled";
  return "pending";
}

async function loadDashboard() {
  const [donorsRes, requestsRes, notificationsRes, healthRes] = await Promise.allSettled([
    apiGet("/api/donors/donors"),
    apiGet("/api/requests/requests"),
    apiGet("/api/notifications/notifications"),
    apiGet("/api/system/health")
  ]);

  state.donors = donorsRes.status === "fulfilled" ? donorsRes.value.data || [] : [];
  state.requests = requestsRes.status === "fulfilled" ? requestsRes.value.data || [] : [];
  state.notifications = notificationsRes.status === "fulfilled" ? notificationsRes.value.data || [] : [];
  state.health = healthRes.status === "fulfilled" ? healthRes.value : null;

  state.filteredDonors = [...state.donors];
  state.filteredRequests = [...state.requests];

  renderDashboard();
  renderDonors();
  renderRequests();
}

function renderDashboard() {
  const availableDonors = state.donors.filter((donor) => donor.isAvailable).length;
  const criticalRequests = state.requests.filter((request) => request.urgency === "CRITICAL").length;

  setText("#donorsCount", state.donors.length);
  setText("#availableDonorsCount", availableDonors);
  setText("#criticalRequestsCount", criticalRequests);
  setText("#notificationsCount", state.notifications.length);

  renderRecentRequests();
  renderServices();
}

function renderRecentRequests() {
  const list = qs("#recentRequestsList");
  if (!list) return;

  const recent = state.requests.slice(-5).reverse();

  if (!recent.length) {
    list.innerHTML = `
      <div class="request-row">
        <div class="request-main">
          <strong>لا توجد طلبات حتى الآن</strong>
          <span>أنشئ طلب دم لاختبار مسار النظام.</span>
        </div>
      </div>
    `;
    return;
  }

  list.innerHTML = recent.map((request) => `
    <div class="request-row">
      <div class="request-strip"></div>
      <div class="request-main">
        <strong>${request.patientName}</strong>
        <span>${request.hospitalName} • ${cityLabel(request.city)}</span>
      </div>
      <div class="badges">
        ${badge(request.bloodType, "blue")}
        ${badge(request.urgency, request.urgency === "CRITICAL" ? "red" : "gray")}
        ${badge(request.status, "gray")}
      </div>
    </div>
  `).join("");
}

function renderServices() {
  const list = qs("#servicesList");
  if (!list) return;

  const services = state.health?.services || [];

  if (!services.length) {
    list.innerHTML = `
      <div class="service-row">
        <div class="service-left">
          <strong>لا توجد بيانات</strong>
          <span>تحقق من تشغيل API Gateway.</span>
        </div>
        ${badge("غير معروف", "gray")}
      </div>
    `;
    return;
  }

  list.innerHTML = services.map((service) => `
    <div class="service-row">
      <div class="service-left">
        <strong>${service.service}</strong>
        <span>متصل عبر بوابة النظام</span>
      </div>
      ${badge(service.reachable ? "UP" : "DOWN", service.reachable ? "green" : "red")}
    </div>
  `).join("");
}

/* Donors */

function applyDonorFilters() {
  const search = qs("#donorSearchInput")?.value.trim().toLowerCase() || "";
  const bloodType = qs("#bloodTypeFilter")?.value || "";
  const city = qs("#cityFilter")?.value || "";
  const availability = qs("#availabilityFilter")?.value || "";

  state.filteredDonors = state.donors.filter((donor) => {
    const matchesSearch =
      donor.fullName.toLowerCase().includes(search) ||
      donor.phone.toLowerCase().includes(search);

    const matchesBloodType = !bloodType || donor.bloodType === bloodType;
    const matchesCity = !city || donor.city === city;

    const matchesAvailability =
      !availability ||
      (availability === "available" && donor.isAvailable) ||
      (availability === "unavailable" && !donor.isAvailable);

    return matchesSearch && matchesBloodType && matchesCity && matchesAvailability;
  });

  renderDonors();
}

function renderDonors() {
  const list = qs("#donorsList");
  const count = qs("#donorResultsCount");

  if (!list || !count) return;

  count.textContent = state.filteredDonors.length;

  if (!state.filteredDonors.length) {
    list.innerHTML = `<div class="empty-state">لا توجد نتائج مطابقة.</div>`;
    return;
  }

  list.innerHTML = state.filteredDonors.map((donor) => `
    <div class="donor-row" data-id="${donor.id}">
      <div class="donor-strip"></div>

      <div class="donor-main">
        <strong>${donor.fullName}</strong>
        <span>${donor.phone}</span>
      </div>

      <div class="donor-cell"><span class="blood-chip">${donor.bloodType}</span></div>
      <div class="donor-cell">${cityLabel(donor.city)}</div>

      <div class="donor-cell">
        <span class="status-chip ${donor.isAvailable ? "status-available" : "status-unavailable"}">
          ${donor.isAvailable ? "متاح" : "غير متاح"}
        </span>
      </div>

      <div class="donor-cell">
        ${donor.lastDonationDate ? donor.lastDonationDate.slice(0, 10) : "—"}
      </div>

      <div class="row-actions">
        <button class="action-btn edit" data-action="edit" data-id="${donor.id}" title="تعديل">
          <svg viewBox="0 0 24 24">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"></path>
          </svg>
        </button>

        <button class="action-btn delete" data-action="delete" data-id="${donor.id}" title="حذف">
          <svg viewBox="0 0 24 24">
            <path d="M3 6h18"></path>
            <path d="M8 6V4h8v2"></path>
            <path d="M19 6l-1 14H6L5 6"></path>
            <path d="M10 11v5"></path>
            <path d="M14 11v5"></path>
          </svg>
        </button>
      </div>
    </div>
  `).join("");
}

function openDonorModal(mode = "create", donor = null) {
  const modal = qs("#donorModal");
  const form = qs("#donorForm");

  if (!modal || !form) return;

  form.dataset.mode = mode;
  form.dataset.id = donor?.id || "";

  qs("#donorModal .modal-header h3").textContent =
    mode === "edit" ? "تعديل بيانات المتبرع" : "إضافة متبرع جديد";

  qs("#donorModal .modal-header p").textContent =
    mode === "edit" ? "عدّل بيانات المتبرع ثم احفظ التغييرات." : "أدخل بيانات المتبرع الأساسية.";

  const saveBtn = qs("#saveDonorBtn");
  if (saveBtn) saveBtn.textContent = mode === "edit" ? "حفظ التعديلات" : "حفظ المتبرع";

  qs("#donorFullName").value = donor?.fullName || "";
  qs("#donorBloodType").value = donor?.bloodType || "";
  qs("#donorCity").value = donor?.city || "";
  qs("#donorPhone").value = donor?.phone || "";

  modal.classList.add("active");
}

function closeDonorModal() {
  qs("#donorModal")?.classList.remove("active");
  qs("#donorForm")?.reset();
}

/* Requests */

function applyRequestFilters() {
  const search = qs("#requestSearchInput")?.value.trim().toLowerCase() || "";
  const bloodType = qs("#requestBloodTypeFilter")?.value || "";
  const urgency = qs("#urgencyFilter")?.value || "";
  const status = qs("#requestStatusFilter")?.value || "";

  state.filteredRequests = state.requests.filter((request) => {
    const matchesSearch =
      request.patientName.toLowerCase().includes(search) ||
      request.hospitalName.toLowerCase().includes(search);

    const matchesBloodType = !bloodType || request.bloodType === bloodType;
    const matchesUrgency = !urgency || request.urgency === urgency;
    const matchesStatus = !status || request.status === status;

    return matchesSearch && matchesBloodType && matchesUrgency && matchesStatus;
  });

  renderRequests();
}

function renderRequestMetrics() {
  setText("#totalRequestsMetric", state.requests.length);
  setText("#criticalRequestsMetric", state.requests.filter((r) => r.urgency === "CRITICAL").length);
  setText("#pendingRequestsMetric", state.requests.filter((r) => r.status === "PENDING").length);
  setText("#completedRequestsMetric", state.requests.filter((r) => r.status === "COMPLETED").length);
}

function renderRequests() {
  const list = qs("#requestsList");
  const count = qs("#requestResultsCount");

  if (!list || !count) return;

  renderRequestMetrics();

  count.textContent = state.filteredRequests.length;

  if (!state.filteredRequests.length) {
    list.innerHTML = `<div class="empty-state">لا توجد طلبات مطابقة.</div>`;
    return;
  }

  list.innerHTML = state.filteredRequests.slice().reverse().map((request) => `
    <div class="request-card" data-id="${request.id}">
      <div class="request-priority-strip ${urgencyClass(request.urgency)}"></div>

      <div class="request-main">
        <strong>${request.patientName}</strong>
        <span>${request.hospitalName} • ${cityLabel(request.city)}</span>
      </div>

      <div class="request-cell"><span class="blood-chip">${request.bloodType}</span></div>

      <div class="request-cell">
        <span class="urgency-chip urgency-${urgencyClass(request.urgency)}">
          ${translateStatus(request.urgency)}
        </span>
      </div>

      <div class="request-cell">
        <span class="request-status-chip request-status-${statusClass(request.status)}">
          ${translateStatus(request.status)}
        </span>
      </div>

      <div class="request-cell">
        ${request.createdAt ? request.createdAt.slice(0, 10) : "—"}
      </div>

      <div class="request-actions">
        <button class="request-action-btn match" data-request-action="MATCHED" data-id="${request.id}">
          مطابقة
        </button>
        <button class="request-action-btn complete" data-request-action="COMPLETED" data-id="${request.id}">
          مكتمل
        </button>
        <button class="request-action-btn cancel" data-request-action="CANCELLED" data-id="${request.id}">
          إلغاء
        </button>
      </div>
    </div>
  `).join("");
}

function openRequestModal() {
  qs("#requestModal")?.classList.add("active");
}

function closeRequestModal() {
  qs("#requestModal")?.classList.remove("active");
  qs("#requestForm")?.reset();
}

/* Events */

function setupNavigation() {
  qsa(".nav-pill").forEach((button) => {
    button.addEventListener("click", () => setPage(button.dataset.page));
  });

  qs("#viewWorkflowBtn")?.addEventListener("click", () => setPage("workflow"));
}

function setupDonorActions() {
  qs("#openDonorModalBtn")?.addEventListener("click", () => openDonorModal("create"));
  qs("#closeDonorModalBtn")?.addEventListener("click", closeDonorModal);
  qs("#cancelDonorModalBtn")?.addEventListener("click", closeDonorModal);

  ["#donorSearchInput", "#bloodTypeFilter", "#cityFilter", "#availabilityFilter"].forEach((selector) => {
    qs(selector)?.addEventListener("input", applyDonorFilters);
    qs(selector)?.addEventListener("change", applyDonorFilters);
  });

  qs("#donorsList")?.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const id = Number(button.dataset.id);
    const donor = state.donors.find((item) => item.id === id);
    if (!donor) return;

    if (button.dataset.action === "edit") {
      openDonorModal("edit", donor);
      return;
    }

    if (button.dataset.action === "delete") {
      const confirmed = confirm(`هل تريد حذف المتبرع: ${donor.fullName}؟`);
      if (!confirmed) return;

      await apiDelete(`/api/donors/donors/${id}`);
      await loadDashboard();
      setPage("donors");
    }
  });

  qs("#donorForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const form = event.currentTarget;
    const mode = form.dataset.mode || "create";
    const id = form.dataset.id;

    const payload = {
      fullName: qs("#donorFullName").value.trim(),
      bloodType: qs("#donorBloodType").value,
      city: qs("#donorCity").value.trim(),
      phone: qs("#donorPhone").value.trim()
    };

    if (mode === "edit") {
      await apiPatch(`/api/donors/donors/${id}`, payload);
    } else {
      await apiPost("/api/donors/donors", payload);
    }

    closeDonorModal();
    await loadDashboard();
    setPage("donors");
  });
}

function setupRequestActions() {
  qs("#openRequestModalBtn")?.addEventListener("click", openRequestModal);
  qs("#closeRequestModalBtn")?.addEventListener("click", closeRequestModal);
  qs("#cancelRequestModalBtn")?.addEventListener("click", closeRequestModal);

  ["#requestSearchInput", "#requestBloodTypeFilter", "#urgencyFilter", "#requestStatusFilter"].forEach((selector) => {
    qs(selector)?.addEventListener("input", applyRequestFilters);
    qs(selector)?.addEventListener("change", applyRequestFilters);
  });

  qs("#requestForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const payload = {
      patientName: qs("#patientName").value.trim(),
      hospitalName: qs("#hospitalName").value.trim(),
      bloodType: qs("#requestBloodType").value,
      city: qs("#requestCity").value.trim(),
      urgency: qs("#requestUrgency").value
    };

    const result = await apiPost("/api/requests/requests", payload);

    const resultBox = qs("#lastWorkflowResult");
    if (resultBox) {
      resultBox.textContent = JSON.stringify({
        success: result.success,
        requestId: result.data?.request?.id,
        matchedDonors: result.data?.matchedDonors?.length || 0,
        eventPublished: result.data?.event?.published ?? false,
        multicastSent: result.data?.multicast?.sent ?? false
      }, null, 2);
    }

    closeRequestModal();
    await loadDashboard();
    setPage("requests");
  });

  qs("#requestsList")?.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-request-action]");
    if (!button) return;

    const id = button.dataset.id;
    const status = button.dataset.requestAction;

    await apiPatch(`/api/requests/requests/${id}/status`, { status });
    await loadDashboard();
    setPage("requests");
  });
}

qs("#refreshBtn")?.addEventListener("click", loadDashboard);

qs("#createCriticalBtn")?.addEventListener("click", () => {
  setPage("requests");
  openRequestModal();
});

setupNavigation();
setupDonorActions();
setupRequestActions();

loadDashboard().catch((error) => {
  console.error(error);
  alert(error.message || "تأكد من تشغيل Docker و API Gateway.");
});
