const API_BASE = "http://localhost:3000";

const state = {
  donors: [],
  filteredDonors: [],
  requests: [],
  filteredRequests: [],
  notifications: [],
  health: null
};

const pageMeta = {
  dashboard: ["لوحة التحكم", "مراقبة خدمات النظام الموزع وسيناريو طلب الدم الحرج"],
  donors: ["المتبرعون", "إدارة المتبرعين والبحث حسب الفصيلة والمدينة"],
  requests: ["طلبات الدم", "إنشاء طلب دم وتشغيل Remote Invocation وRabbitMQ وMulticast"],
  notifications: ["الإشعارات", "الإشعارات الناتجة عن RabbitMQ Pub/Sub"],
  system: ["حالة النظام", "فحص الخدمات المستقلة والاتصال عبر API Gateway"]
};

function qs(selector) {
  return document.querySelector(selector);
}

function qsa(selector) {
  return [...document.querySelectorAll(selector)];
}

function showToast(message, type = "success") {
  const toast = qs("#toast");
  toast.textContent = message;
  toast.className = `toast active ${type}`;
  setTimeout(() => {
    toast.className = "toast";
  }, 3200);
}

async function apiGet(path) {
  const response = await fetch(`${API_BASE}${path}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || `GET ${path} failed`);
  return data;
}

async function apiPost(path, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.message || `POST ${path} failed`);
  return data;
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function setPage(page) {
  qsa(".page").forEach((el) => el.classList.remove("active"));
  qsa(".nav-link").forEach((el) => el.classList.remove("active"));

  qs(`#${page}Page`).classList.add("active");
  qs(`[data-page="${page}"]`).classList.add("active");

  qs("#pageTitle").textContent = pageMeta[page][0];
  qs("#pageSubtitle").textContent = pageMeta[page][1];
}

function openModal(title, subtitle, bodyHtml) {
  qs("#modalTitle").textContent = title;
  qs("#modalSubtitle").textContent = subtitle;
  qs("#modalBody").innerHTML = bodyHtml;
  qs("#modalOverlay").classList.add("active");
}

function closeModal() {
  qs("#modalOverlay").classList.remove("active");
  qs("#modalBody").innerHTML = "";
}

async function loadAll() {
  await Promise.allSettled([
    loadDonors(),
    loadRequests(),
    loadNotifications(),
    loadHealth()
  ]);

  renderDashboard();
}

async function loadDonors() {
  const response = await apiGet("/api/donors/donors");
  state.donors = response.data || [];
  state.filteredDonors = [...state.donors];
  renderDonors(state.filteredDonors);
}

async function loadRequests() {
  const response = await apiGet("/api/requests/requests");
  state.requests = response.data || [];
  state.filteredRequests = [...state.requests];
  renderRequests(state.filteredRequests);
}

async function loadNotifications() {
  try {
    const response = await apiGet("/api/notifications/notifications");
    state.notifications = response.data || [];
  } catch {
    state.notifications = [];
  }
  renderNotifications();
}

async function loadHealth() {
  const response = await apiGet("/api/system/health");
  state.health = response;
  renderHealth();
}

function renderDashboard() {
  qs("#metricDonors").textContent = state.donors.length;
  qs("#metricRequests").textContent = state.requests.length;
  qs("#metricNotifications").textContent = state.notifications.length;
  qs("#metricSystem").textContent = state.health?.status || "UNKNOWN";

  const latestRequests = state.requests.slice(-5).reverse();
  qs("#dashboardRequests").innerHTML = latestRequests.length
    ? latestRequests.map((r) => `
        <tr>
          <td>${r.patientName}</td>
          <td><span class="badge info">${r.bloodType}</span></td>
          <td>${urgencyBadge(r.urgency)}</td>
          <td><span class="badge warning">${r.status}</span></td>
        </tr>
      `).join("")
    : `<tr><td colspan="4" class="empty">لا توجد طلبات حتى الآن</td></tr>`;

  const services = state.health?.services || [];
  qs("#dashboardHealth").innerHTML = services.length
    ? services.map((s) => `
        <div class="health-item">
          <strong>${s.service}</strong>
          <span class="badge ${s.reachable ? "ok" : "bad"}">${s.reachable ? "UP" : "DOWN"}</span>
        </div>
      `).join("")
    : `<div class="empty">لا توجد بيانات حالة</div>`;
}

function renderDonors(donors) {
  qs("#donorsSummary").textContent = `عدد النتائج: ${donors.length}`;

  qs("#donorsTable").innerHTML = donors.length
    ? donors.map((d) => `
      <tr>
        <td>${d.id}</td>
        <td><strong>${d.fullName}</strong></td>
        <td><span class="badge info">${d.bloodType}</span></td>
        <td>${d.city}</td>
        <td>${d.phone}</td>
        <td>
          <span class="badge ${d.isAvailable ? "ok" : "bad"}">
            ${d.isAvailable ? "متاح" : "غير متاح"}
          </span>
        </td>
      </tr>
    `).join("")
    : `<tr><td colspan="6" class="empty">لا توجد نتائج مطابقة</td></tr>`;

  qs("#metricDonors").textContent = state.donors.length;
}

function renderRequests(requests) {
  qs("#requestsSummary").textContent = `عدد النتائج: ${requests.length}`;

  qs("#requestsTable").innerHTML = requests.length
    ? requests.map((r) => `
      <tr>
        <td>${r.id}</td>
        <td><strong>${r.patientName}</strong></td>
        <td>${r.hospitalName}</td>
        <td><span class="badge info">${r.bloodType}</span></td>
        <td>${urgencyBadge(r.urgency)}</td>
        <td><span class="badge warning">${r.status}</span></td>
      </tr>
    `).join("")
    : `<tr><td colspan="6" class="empty">لا توجد طلبات مطابقة</td></tr>`;

  qs("#metricRequests").textContent = state.requests.length;
}

function renderNotifications() {
  qs("#notificationsGrid").innerHTML = state.notifications.length
    ? state.notifications.slice().reverse().map((n) => `
      <article class="notification-card">
        <strong>${n.type || "Notification"}</strong>
        <p>${n.message}</p>
        <div class="meta">
          <span class="badge info">${n.bloodType || "-"}</span>
          <span class="badge ${n.urgency === "CRITICAL" ? "critical" : "warning"}">${n.urgency || "-"}</span>
          <span class="badge ok">${n.status || "SENT"}</span>
        </div>
      </article>
    `).join("")
    : `<div class="panel"><div class="empty">لا توجد إشعارات حتى الآن</div></div>`;

  qs("#metricNotifications").textContent = state.notifications.length;
}

function renderHealth() {
  const services = state.health?.services || [];

  qs("#healthGrid").innerHTML = services.length
    ? services.map((s) => `
      <div class="health-item">
        <strong>${s.service}</strong>
        <span class="badge ${s.reachable ? "ok" : "bad"}">${s.reachable ? "UP" : "DOWN"}</span>
      </div>
    `).join("")
    : `<div class="panel"><div class="empty">لا توجد بيانات حالة</div></div>`;

  qs("#metricSystem").textContent = state.health?.status || "UNKNOWN";
}

function urgencyBadge(urgency) {
  const cls = urgency === "CRITICAL"
    ? "critical"
    : urgency === "LOW"
      ? "info"
      : "warning";

  return `<span class="badge ${cls}">${urgency}</span>`;
}

function applyDonorFilters() {
  const text = qs("#donorTextFilter").value.trim().toLowerCase();
  const blood = qs("#donorBloodFilter").value;
  const city = qs("#donorCityFilter").value.trim().toLowerCase();

  state.filteredDonors = state.donors.filter((d) => {
    const textMatch =
      !text ||
      d.fullName.toLowerCase().includes(text) ||
      d.phone.includes(text) ||
      d.city.toLowerCase().includes(text);

    const bloodMatch = !blood || d.bloodType === blood;
    const cityMatch = !city || d.city.toLowerCase().includes(city);

    return textMatch && bloodMatch && cityMatch;
  });

  renderDonors(state.filteredDonors);
}

function resetDonorFilters() {
  qs("#donorTextFilter").value = "";
  qs("#donorBloodFilter").value = "";
  qs("#donorCityFilter").value = "";
  state.filteredDonors = [...state.donors];
  renderDonors(state.filteredDonors);
}

function applyRequestFilters() {
  const text = qs("#requestTextFilter").value.trim().toLowerCase();
  const urgency = qs("#requestUrgencyFilter").value;
  const status = qs("#requestStatusFilter").value;

  state.filteredRequests = state.requests.filter((r) => {
    const textMatch =
      !text ||
      r.patientName.toLowerCase().includes(text) ||
      r.hospitalName.toLowerCase().includes(text) ||
      r.city.toLowerCase().includes(text);

    const urgencyMatch = !urgency || r.urgency === urgency;
    const statusMatch = !status || r.status === status;

    return textMatch && urgencyMatch && statusMatch;
  });

  renderRequests(state.filteredRequests);
}

function resetRequestFilters() {
  qs("#requestTextFilter").value = "";
  qs("#requestUrgencyFilter").value = "";
  qs("#requestStatusFilter").value = "";
  state.filteredRequests = [...state.requests];
  renderRequests(state.filteredRequests);
}

function donorModal() {
  openModal(
    "إضافة متبرع جديد",
    "سيتم حفظ المتبرع مباشرة في قاعدة donor_db",
    `
      <form id="modalDonorForm" class="modal-form">
        <div class="form-grid">
          <div class="input-group">
            <label>اسم المتبرع</label>
            <input name="fullName" required placeholder="مثال: Bashar Al Shameri" />
          </div>
          <div class="input-group">
            <label>رقم الهاتف</label>
            <input name="phone" required placeholder="777000111" />
          </div>
          <div class="input-group">
            <label>فصيلة الدم</label>
            <select name="bloodType" required>
              <option value="">اختر</option>
              <option>A+</option><option>A-</option>
              <option>B+</option><option>B-</option>
              <option>AB+</option><option>AB-</option>
              <option>O+</option><option>O-</option>
            </select>
          </div>
          <div class="input-group">
            <label>المدينة</label>
            <input name="city" required placeholder="Sanaa" />
          </div>
        </div>
        <div class="form-actions">
          <button class="btn primary" type="submit">حفظ المتبرع</button>
          <button class="btn ghost" type="button" onclick="closeModal()">إلغاء</button>
        </div>
      </form>
    `
  );

  qs("#modalDonorForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      const result = await apiPost("/api/donors/donors", formData(event.currentTarget));
      showToast(result.message || "تم حفظ المتبرع بنجاح");
      closeModal();
      await loadDonors();
      renderDashboard();
    } catch (error) {
      showToast(error.message, "error");
    }
  });
}

function requestModal() {
  openModal(
    "إنشاء طلب دم",
    "عند اختيار CRITICAL سيتم تشغيل RabbitMQ وUDP Multicast",
    `
      <form id="modalRequestForm" class="modal-form">
        <div class="form-grid">
          <div class="input-group">
            <label>اسم المريض</label>
            <input name="patientName" required placeholder="Ali Ahmed" />
          </div>
          <div class="input-group">
            <label>اسم المستشفى</label>
            <input name="hospitalName" required placeholder="Al-Thawra Hospital" />
          </div>
          <div class="input-group">
            <label>فصيلة الدم</label>
            <select name="bloodType" required>
              <option value="">اختر</option>
              <option>A+</option><option>A-</option>
              <option>B+</option><option>B-</option>
              <option>AB+</option><option>AB-</option>
              <option>O+</option><option>O-</option>
            </select>
          </div>
          <div class="input-group">
            <label>المدينة</label>
            <input name="city" required placeholder="Sanaa" />
          </div>
          <div class="input-group">
            <label>الأولوية</label>
            <select name="urgency" required>
              <option>LOW</option>
              <option>MEDIUM</option>
              <option>HIGH</option>
              <option selected>CRITICAL</option>
            </select>
          </div>
        </div>
        <div class="form-actions">
          <button class="btn danger" type="submit">إنشاء الطلب</button>
          <button class="btn ghost" type="button" onclick="closeModal()">إلغاء</button>
        </div>
      </form>
    `
  );

  qs("#modalRequestForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      const result = await apiPost("/api/requests/requests", formData(event.currentTarget));
      qs("#lastWorkflowResult").textContent = JSON.stringify(result, null, 2);
      showToast("تم إنشاء طلب الدم وتشغيل مسار النظام الموزع");
      closeModal();

      await Promise.allSettled([
        loadRequests(),
        loadNotifications(),
        loadDonors()
      ]);

      renderDashboard();
      setPage("requests");
    } catch (error) {
      showToast(error.message, "error");
    }
  });
}

function setupEvents() {
  qsa(".nav-link").forEach((button) => {
    button.addEventListener("click", () => setPage(button.dataset.page));
  });

  qsa("[data-page-target]").forEach((button) => {
    button.addEventListener("click", () => setPage(button.dataset.pageTarget));
  });

  qs("#refreshBtn").addEventListener("click", async () => {
    await loadAll();
    showToast("تم تحديث البيانات");
  });

  qs("#quickRequestBtn").addEventListener("click", requestModal);
  qs("#openDonorModalBtn").addEventListener("click", donorModal);
  qs("#openRequestModalBtn").addEventListener("click", requestModal);
  qs("#closeModalBtn").addEventListener("click", closeModal);

  qs("#modalOverlay").addEventListener("click", (event) => {
    if (event.target.id === "modalOverlay") closeModal();
  });

  qs("#applyDonorFilterBtn").addEventListener("click", applyDonorFilters);
  qs("#resetDonorFilterBtn").addEventListener("click", resetDonorFilters);

  qs("#applyRequestFilterBtn").addEventListener("click", applyRequestFilters);
  qs("#resetRequestFilterBtn").addEventListener("click", resetRequestFilters);

  qs("#reloadNotificationsBtn").addEventListener("click", async () => {
    await loadNotifications();
    showToast("تم تحديث الإشعارات");
  });

  qs("#reloadHealthBtn").addEventListener("click", async () => {
    await loadHealth();
    showToast("تم تحديث حالة النظام");
  });
}

setupEvents();
loadAll().catch((error) => {
  console.error(error);
  showToast("فشل تحميل البيانات. تأكد من تشغيل Docker وAPI Gateway.", "error");
});
