const API_BASE = "http://localhost:3000";

const state = {
  hospitals: [],
  donors: [],
  donations: [],
  inventory: [],
  requests: [],
  handovers: [],
  notifications: [],
  services: [],
  filteredDonors: [],
  filteredRequests: []
};

function qs(selector) {
  return document.querySelector(selector);
}

function qsa(selector) {
  return Array.from(document.querySelectorAll(selector));
}

function setText(selector, value) {
  const el = qs(selector);
  if (el) el.textContent = value;
}

function safe(value, fallback = "—") {
  return value === null || value === undefined || value === "" ? fallback : value;
}

function escapeHtml(value) {
  return String(safe(value, ""))
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function apiGet(path) {
  const response = await fetch(`${API_BASE}${path}`);
  const data = await response.json();
  if (!response.ok || data.success === false) {
    throw new Error(data.message || `GET ${path} failed`);
  }
  return data;
}

async function apiPost(path, payload) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok || data.success === false) {
    throw new Error(data.message || `POST ${path} failed`);
  }
  return data;
}

async function apiPatch(path, payload) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok || data.success === false) {
    throw new Error(data.message || `PATCH ${path} failed`);
  }
  return data;
}

async function apiDelete(path) {
  const response = await fetch(`${API_BASE}${path}`, { method: "DELETE" });
  const data = await response.json();
  if (!response.ok || data.success === false) {
    throw new Error(data.message || `DELETE ${path} failed`);
  }
  return data;
}

function translate(value) {
  const map = {
    PENDING: "قيد الانتظار",
    MATCHED: "تمت المطابقة",
    RESERVED: "محجوز",
    DELIVERED: "تم التسليم",
    CANCELLED: "ملغي",
    CRITICAL: "حرج",
    HIGH: "مرتفع",
    MEDIUM: "متوسط",
    LOW: "منخفض",
    SENT: "مرسل",
    READ: "مقروء",
    ACCEPTED: "مقبول",
    REJECTED: "مرفوض",
    UP: "يعمل",
    DOWN: "متوقف",
    CONNECTED: "متصل",
    DISCONNECTED: "غير متصل",
    BLOOD_REQUEST_CRITICAL: "طلب دم حرج",
    BLOOD_REQUEST_DELIVERED: "تم تسليم طلب"
  };

  return map[value] || value || "—";
}

function cityLabel(city) {
  const map = {
    Taiz: "تعز",
    Sanaa: "صنعاء",
    Aden: "عدن",
    Ibb: "إب"
  };

  return map[city] || city || "—";
}

function badge(text, type = "gray") {
  return `<span class="badge badge-${type}">${escapeHtml(translate(text))}</span>`;
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
  if (value === "reserved") return "matched";
  if (value === "delivered") return "completed";
  if (value === "completed") return "completed";
  if (value === "cancelled") return "cancelled";
  return "pending";
}

function setPage(page) {
  qsa(".page").forEach((el) => el.classList.remove("active"));
  qsa(".nav-pill").forEach((el) => el.classList.remove("active"));

  qs(`#${page}Page`)?.classList.add("active");
  qs(`[data-page="${page}"]`)?.classList.add("active");

  if (page === "donors") renderDonors();
  if (page === "requests") renderRequests();
  if (page === "health") renderServices();
}

async function loadServiceHealth() {
  const checks = [
    ["Donor Service", "/api/donors/health"],
    ["Inventory Service", "/api/inventory/health"],
    ["Request Service", "/api/requests/health"],
    ["Notification Service", "/api/notifications/health"]
  ];

  const results = await Promise.allSettled(
    checks.map(async ([name, path]) => {
      const data = await apiGet(path);
      return {
        service: name,
        reachable: data.status === "UP",
        status: data.status,
        database: data.database,
        rabbitmq: data.rabbitmq || null,
        queue: data.queue || null,
        port: data.port
      };
    })
  );

  return results.map((result, index) => {
    if (result.status === "fulfilled") return result.value;

    return {
      service: checks[index][0],
      reachable: false,
      status: "DOWN",
      database: "DISCONNECTED",
      rabbitmq: null,
      queue: null,
      port: null
    };
  });
}

async function loadDashboard() {
  const [
    hospitalsRes,
    donorsRes,
    donationsRes,
    inventoryRes,
    requestsRes,
    handoversRes,
    notificationsRes,
    servicesRes
  ] = await Promise.allSettled([
    apiGet("/api/requests/hospitals"),
    apiGet("/api/donors/donors"),
    apiGet("/api/inventory/donations"),
    apiGet("/api/inventory/inventory"),
    apiGet("/api/requests/requests"),
    apiGet("/api/requests/handovers"),
    apiGet("/api/notifications/notifications"),
    loadServiceHealth()
  ]);

  state.hospitals = hospitalsRes.status === "fulfilled" ? hospitalsRes.value.data || [] : [];
  state.donors = donorsRes.status === "fulfilled" ? donorsRes.value.data || [] : [];
  state.donations = donationsRes.status === "fulfilled" ? donationsRes.value.data || [] : [];
  state.inventory = inventoryRes.status === "fulfilled" ? inventoryRes.value.data || [] : [];
  state.requests = requestsRes.status === "fulfilled" ? requestsRes.value.data || [] : [];
  state.handovers = handoversRes.status === "fulfilled" ? handoversRes.value.data || [] : [];
  state.notifications = notificationsRes.status === "fulfilled" ? notificationsRes.value.data || [] : [];
  state.services = servicesRes.status === "fulfilled" ? servicesRes.value || [] : [];

  state.filteredDonors = [...state.donors];
  state.filteredRequests = [...state.requests];

  renderDashboard();
  renderDonors();
  renderRequests();
  renderServices();
}

function renderDashboard() {
  const eligibleDonors = state.donors.filter((donor) => donor.isEligible).length;
  const criticalRequests = state.requests.filter((request) => request.urgency === "CRITICAL").length;

  setText("#donorsCount", state.donors.length);
  setText("#availableDonorsCount", eligibleDonors);
  setText("#criticalRequestsCount", criticalRequests);
  setText("#notificationsCount", state.notifications.length);

  renderRecentRequests();
  renderRecentNotifications();
  renderServices();
}

function renderRecentRequests() {
  const list = qs("#recentRequestsList") || qs("#recentطلبات الدمList");
  if (!list) return;

  const recent = state.requests.slice(0, 5);

  if (!recent.length) {
    list.innerHTML = `
      <div class="request-row">
        <div class="request-main">
          <strong>لا توجد طلبات حتى الآن</strong>
          <span>أنشئ طلب دم لاختبار النظام.</span>
        </div>
      </div>
    `;
    return;
  }

  list.innerHTML = recent.map((request) => `
    <div class="request-row">
      <div class="request-strip"></div>
      <div class="request-main">
        <strong>${escapeHtml(request.refCode)} - ${escapeHtml(request.patientName)}</strong>
        <span>${escapeHtml(request.hospitalName)} • ${cityLabel(request.city)} • الكمية: ${escapeHtml(request.quantity)}</span>
      </div>
      <div class="badges">
        ${badge(request.bloodType, "blue")}
        ${badge(request.urgency, request.urgency === "CRITICAL" ? "red" : "gray")}
        ${badge(request.status, "gray")}
      </div>
    </div>
  `).join("");
}

function renderRecentNotifications() {
  const list =
    qs("#recentNotificationsList") ||
    qs("#recentالإشعاراتList") ||
    qs("#notificationsPreviewList");

  if (!list) return;

  const recent = state.notifications.slice(0, 5);

  if (!recent.length) {
    list.innerHTML = `
      <div class="service-row">
        <div class="service-left">
          <strong>لا توجد إشعارات</strong>
          <span>ستظهر هنا إشعارات RabbitMQ بعد إنشاء طلب حرج.</span>
        </div>
      </div>
    `;
    return;
  }

  list.innerHTML = recent.map((item) => `
    <div class="service-row">
      <div class="service-left">
        <strong>${escapeHtml(translate(item.type))} - ${escapeHtml(item.refCode || "—")}</strong>
        <span>${escapeHtml(item.message)}</span>
      </div>
      ${badge(item.status, item.status === "SENT" ? "green" : "gray")}
    </div>
  `).join("");
}

function renderServices() {
  const list = qs("#servicesList");
  if (!list) return;

  if (!state.services.length) {
    list.innerHTML = `
      <div class="service-row">
        <div class="service-left">
          <strong>لا توجد بيانات</strong>
          <span>تحقق من تشغيل Docker و API Gateway.</span>
        </div>
        ${badge("غير معروف", "gray")}
      </div>
    `;
    return;
  }

  list.innerHTML = state.services.map((service) => `
    <div class="service-row">
      <div class="service-left">
        <strong>${escapeHtml(service.service)}</strong>
        <span>
          قاعدة البيانات: ${translate(service.database)}
          ${service.rabbitmq ? ` • RabbitMQ: ${translate(service.rabbitmq)}` : ""}
          ${service.queue ? ` • Queue: ${escapeHtml(service.queue)}` : ""}
        </span>
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
      String(donor.fullName || "").toLowerCase().includes(search) ||
      String(donor.phone || "").toLowerCase().includes(search);

    const matchesBloodType = !bloodType || donor.bloodType === bloodType;
    const matchesCity = !city || donor.city === city;

    const matchesAvailability =
      !availability ||
      (availability === "available" && donor.isEligible) ||
      (availability === "unavailable" && !donor.isEligible);

    return matchesSearch && matchesBloodType && matchesCity && matchesAvailability;
  });

  renderDonors();
}

function renderDonors() {
  const list = qs("#donorsList");
  const count = qs("#donorResultsCount");

  if (!list) return;
  if (count) count.textContent = state.filteredDonors.length;

  if (!state.filteredDonors.length) {
    list.innerHTML = `<div class="empty-state">لا توجد نتائج مطابقة.</div>`;
    return;
  }

  list.innerHTML = state.filteredDonors.map((donor) => `
    <div class="donor-row" data-id="${donor.id}">
      <div class="donor-strip"></div>

      <div class="donor-main">
        <strong>${escapeHtml(donor.fullName)}</strong>
        <span>${escapeHtml(donor.phone)}${donor.email ? " • " + escapeHtml(donor.email) : ""}</span>
      </div>

      <div class="donor-cell"><span class="blood-chip">${escapeHtml(donor.bloodType)}</span></div>
      <div class="donor-cell">${cityLabel(donor.city)}${donor.district ? " - " + escapeHtml(donor.district) : ""}</div>

      <div class="donor-cell">
        <span class="status-chip ${donor.isEligible ? "status-available" : "status-unavailable"}">
          ${donor.isEligible ? "مؤهل" : "غير مؤهل"}
        </span>
      </div>

      <div class="donor-cell">
        ${donor.lastDonationDate ? String(donor.lastDonationDate).slice(0, 10) : "لم يتبرع"}
      </div>

      <div class="row-actions">
        <button class="action-btn edit" data-action="edit" data-id="${donor.id}" title="تعديل">
          <svg viewBox="0 0 24 24">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"></path>
          </svg>
        </button>

        <button class="action-btn delete" data-action="delete" data-id="${donor.id}" title="تعطيل">
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
  qs("#donorCity").value = donor?.city || "Taiz";
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
      String(request.refCode || "").toLowerCase().includes(search) ||
      String(request.patientName || "").toLowerCase().includes(search) ||
      String(request.hospitalName || "").toLowerCase().includes(search);

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
  setText("#completedRequestsMetric", state.requests.filter((r) => r.status === "DELIVERED").length);
}

function requestActionsHtml(request) {
  if (request.status === "DELIVERED") {
    return `<button class="request-action-btn view" data-request-view="${request.id}">عرض</button>`;
  }

  if (request.status === "CANCELLED") {
    return `<button class="request-action-btn view" data-request-view="${request.id}">عرض</button>`;
  }

  return `
    <button class="request-action-btn view" data-request-view="${request.id}">عرض</button>
    <button class="request-action-btn complete" data-request-deliver="${request.refCode}">تسليم</button>
    <button class="request-action-btn cancel" data-request-action="CANCELLED" data-id="${request.id}">إلغاء</button>
  `;
}

function renderRequests() {
  const list = qs("#requestsList");
  const count = qs("#requestResultsCount");

  if (!list) return;

  renderRequestMetrics();

  if (count) count.textContent = state.filteredRequests.length;

  if (!state.filteredRequests.length) {
    list.innerHTML = `<div class="empty-state">لا توجد طلبات مطابقة.</div>`;
    return;
  }

  list.innerHTML = state.filteredRequests.map((request) => `
    <div class="request-card" data-id="${request.id}">
      <div class="request-priority-strip ${urgencyClass(request.urgency)}"></div>

      <div class="request-main">
        <strong>${escapeHtml(request.refCode)} - ${escapeHtml(request.patientName)}</strong>
        <span>${escapeHtml(request.hospitalName)} • ${escapeHtml(request.doctorName || "لا يوجد طبيب")}</span>
      </div>

      <div class="request-cell"><span class="blood-chip">${escapeHtml(request.bloodType)}</span></div>

      <div class="request-cell">
        <span class="urgency-chip urgency-${urgencyClass(request.urgency)}">
          ${translate(request.urgency)}
        </span>
      </div>

      <div class="request-cell">
        <span class="request-status-chip request-status-${statusClass(request.status)}">
          ${translate(request.status)}
        </span>
      </div>

      <div class="request-cell">
        الكمية: ${escapeHtml(request.quantity)}
      </div>

      <div class="request-actions">
        ${requestActionsHtml(request)}
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

/* Workflow */

async function runCriticalWorkflowScenario() {
  const resultBox = qs("#workflowResult");
  if (resultBox) resultBox.textContent = "جاري تشغيل السيناريو...";

  const result = await apiPost("/api/requests/requests", {
    hospitalId: 1,
    patientName: "حالة حرجة تجريبية",
    doctorName: "دكتور الطوارئ",
    bloodType: "O+",
    quantity: 1,
    city: "Taiz",
    urgency: "CRITICAL",
    notes: "Frontend workflow scenario"
  });

  renderWorkflowResult(result);
  await loadDashboard();
  setPage("workflow");
}

function renderWorkflowResult(result) {
  const resultBox = qs("#workflowResult");
  if (!resultBox) return;

  const data = result.data || {};

  resultBox.textContent = JSON.stringify({
    success: result.success,
    refCode: data.request?.refCode || null,
    requestStatus: data.request?.status || null,
    inventoryCheck: data.inventoryCheck || null,
    matchedDonors: Array.isArray(data.matchedDonors) ? data.matchedDonors.length : 0,
    eventPublished: data.event?.published ?? false,
    multicastSent: data.multicast?.sent ?? false,
    message: result.message || null
  }, null, 2);
}

async function deliverRequest(refCode) {
  const receiverName = prompt("اسم المستلم:");
  if (!receiverName) return;

  const quantity = Number(prompt("الكمية المسلمة:", "1"));
  if (!quantity || quantity <= 0) return;

  await apiPost("/api/requests/handovers", {
    refCode,
    receiverName,
    receiverPhone: "",
    deliveredQuantity: quantity,
    deliveredBy: "Blood Bank Staff",
    notes: "Delivered from frontend"
  });

  await loadDashboard();
  setPage("requests");
}

/* Events */

function setupNavigation() {
  qsa(".nav-pill").forEach((button) => {
    button.addEventListener("click", () => setPage(button.dataset.page));
  });

  qsa(".panel-link").forEach((button) => {
    button.addEventListener("click", () => setPage(button.dataset.page));
  });

  qs("#viewWorkflowBtn")?.addEventListener("click", () => setPage("workflow"));
  qs("#runWorkflowBtn")?.addEventListener("click", runCriticalWorkflowScenario);
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
      const confirmed = confirm(`هل تريد تعطيل المتبرع: ${donor.fullName}؟`);
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
      city: qs("#donorCity").value.trim() || "Taiz",
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
      hospitalName: qs("#hospitalName").value.trim(),
      patientName: qs("#patientName").value.trim(),
      doctorName: "غير محدد",
      bloodType: qs("#requestBloodType").value,
      quantity: 1,
      city: qs("#requestCity").value.trim() || "Taiz",
      urgency: qs("#requestUrgency").value,
      notes: "Created from frontend"
    };

    const result = await apiPost("/api/requests/requests", payload);
    renderWorkflowResult(result);

    closeRequestModal();
    await loadDashboard();

    if (qs("#workflowPage")?.classList.contains("active")) {
      setPage("workflow");
    } else {
      setPage("requests");
    }
  });

  qs("#requestsList")?.addEventListener("click", async (event) => {
    const statusButton = event.target.closest("button[data-request-action]");
    if (statusButton) {
      const id = statusButton.dataset.id;
      const status = statusButton.dataset.requestAction;

      await apiPatch(`/api/requests/requests/${id}/status`, { status });
      await loadDashboard();
      setPage("requests");
      return;
    }

    const deliverButton = event.target.closest("button[data-request-deliver]");
    if (deliverButton) {
      await deliverRequest(deliverButton.dataset.requestDeliver);
      return;
    }

    const viewButton = event.target.closest("button[data-request-view]");
    if (viewButton) {
      const id = Number(viewButton.dataset.requestView);
      const request = state.requests.find((item) => item.id === id);
      if (!request) return;

      alert(
        `المرجع: ${request.refCode}\n` +
        `المريض: ${request.patientName}\n` +
        `المستشفى: ${request.hospitalName}\n` +
        `الطبيب: ${request.doctorName || "—"}\n` +
        `الفصيلة: ${request.bloodType}\n` +
        `الكمية: ${request.quantity}\n` +
        `الأولوية: ${translate(request.urgency)}\n` +
        `الحالة: ${translate(request.status)}`
      );
    }
  });
}

qs("#refreshBtn")?.addEventListener("click", loadDashboard);

qs("#createCriticalBtn")?.addEventListener("click", () => {
  setPage("workflow");
  runCriticalWorkflowScenario();
});

setupNavigation();
setupDonorActions();
setupRequestActions();

loadDashboard().catch((error) => {
  console.error(error);
  alert(error.message || "تأكد من تشغيل Docker و API Gateway.");
});
