const API_BASE = "http://localhost:3000";

const state = {
  donors: [],
  requests: [],
  notifications: [],
  health: null,
  serviceDetails: {},
  lastWorkflow: null,
  activity: []
};

const pages = {
  overview: ["Overview", "لوحة التحكم التشغيلية", "ملخص عملي للنظام الموزع وخدماته الأساسية."],
  donors: ["Donors", "المتبرعون", "إدارة المتبرعين والبحث حسب الفصيلة والمدينة."],
  requests: ["Requests", "طلبات الدم", "إنشاء طلبات دم وتشغيل Remote Invocation وRabbitMQ وUDP Multicast."],
  workflow: ["Workflow", "مسار النظام الموزع", "تمثيل بصري للمتطلبات الأساسية في تكليف الأنظمة الموزعة."],
  notifications: ["Notifications", "الإشعارات", "الإشعارات الناتجة عن أحداث RabbitMQ."],
  system: ["System Health", "حالة الخدمات", "فحص حالة الخدمات المستقلة داخل Docker Network."],
  evidence: ["Evidence", "أدلة التنفيذ", "صفحة مخصصة لدعم التقرير والمناقشة العملية."]
};

function qs(selector) {
  return document.querySelector(selector);
}

function qsa(selector) {
  return Array.from(document.querySelectorAll(selector));
}

function initials(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "BD";
}

function formatDate(value) {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("ar", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function toast(message, type = "success") {
  const el = qs("#toast");
  el.textContent = message;
  el.className = `toast active ${type}`;
  setTimeout(() => {
    el.className = "toast";
  }, 3200);
}

function addActivity(title, description) {
  state.activity.unshift({
    title,
    description,
    at: new Date().toISOString()
  });

  state.activity = state.activity.slice(0, 6);
  renderActivity();
}

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `GET ${path} failed`);
  return data;
}

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `POST ${path} failed`);
  return data;
}

function formToObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function setPage(page) {
  qsa(".page").forEach((el) => el.classList.remove("active"));
  qsa(".nav-item").forEach((el) => el.classList.remove("active"));

  qs(`#${page}Page`).classList.add("active");
  qs(`[data-page="${page}"]`)?.classList.add("active");

  qs("#breadcrumbPage").textContent = pages[page][0];
  qs("#pageTitle").textContent = pages[page][1];
  qs("#pageSubtitle").textContent = pages[page][2];
}

function openModal(title, subtitle, body) {
  qs("#modalTitle").textContent = title;
  qs("#modalSubtitle").textContent = subtitle;
  qs("#modalBody").innerHTML = body;
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

  renderOverview();
}

async function loadDonors() {
  const data = await apiGet("/api/donors/donors");
  state.donors = data.data || [];
  renderDonors(state.donors);
}

async function loadRequests() {
  const data = await apiGet("/api/requests/requests");
  state.requests = data.data || [];
  renderRequests(state.requests);
}

async function loadNotifications() {
  try {
    const data = await apiGet("/api/notifications/notifications");
    state.notifications = data.data || [];
  } catch {
    state.notifications = [];
  }
  renderNotifications();
}

async function loadHealth() {
  const system = await apiGet("/api/system/health");

  const details = await Promise.allSettled([
    apiGet("/health"),
    apiGet("/api/donors/health"),
    apiGet("/api/requests/health"),
    apiGet("/api/notifications/health")
  ]);

  state.health = system;
  state.serviceDetails = {
    gateway: details[0].status === "fulfilled" ? details[0].value : null,
    donor: details[1].status === "fulfilled" ? details[1].value : null,
    request: details[2].status === "fulfilled" ? details[2].value : null,
    notification: details[3].status === "fulfilled" ? details[3].value : null
  };

  renderHealth();
}

function renderOverview() {
  qs("#kpiDonors").textContent = state.donors.length;
  qs("#kpiRequests").textContent = state.requests.length;
  qs("#kpiNotifications").textContent = state.notifications.length;
  qs("#kpiSystem").textContent = state.health?.status || "UNKNOWN";

  const latest = state.requests.slice(-5).reverse();

  qs("#overviewRequests").innerHTML = latest.length
    ? latest.map((r) => `
      <tr>
        <td>
          <div class="identity">
            <div class="avatar">${initials(r.patientName)}</div>
            <div>
              <strong>${r.patientName}</strong>
              <small>${formatDate(r.createdAt)}</small>
            </div>
          </div>
        </td>
        <td>${r.hospitalName}</td>
        <td><span class="badge badge-info">${r.bloodType}</span></td>
        <td>${urgencyBadge(r.urgency)}</td>
        <td><span class="badge badge-warning">${r.status}</span></td>
      </tr>
    `).join("")
    : `<tr><td colspan="5" class="empty">لا توجد طلبات حتى الآن</td></tr>`;

  const services = state.health?.services || [];

  qs("#overviewHealth").innerHTML = services.length
    ? services.map((service) => `
      <div class="health-item">
        <strong>${service.service}</strong>
        <span class="badge ${service.reachable ? "badge-ok" : "badge-danger"}">
          ${service.reachable ? "UP" : "DOWN"}
        </span>
      </div>
    `).join("")
    : `<div class="empty">لا توجد بيانات حالة</div>`;

  renderActivity();
}

function renderActivity() {
  const fallback = [
    {
      title: "System initialized",
      description: "API Gateway, MySQL, RabbitMQ, and services are running.",
      at: new Date().toISOString()
    }
  ];

  const list = state.activity.length ? state.activity : fallback;

  qs("#activityTimeline").innerHTML = list.map((item) => `
    <div class="timeline-item">
      <div class="timeline-dot"></div>
      <div>
        <strong>${item.title}</strong>
        <p>${item.description}</p>
      </div>
    </div>
  `).join("");
}

function renderDonors(data) {
  qs("#donorsSummary").textContent = `عدد النتائج: ${data.length}`;

  qs("#donorsTable").innerHTML = data.length
    ? data.map((d) => `
      <tr>
        <td>
          <div class="identity">
            <div class="avatar">${initials(d.fullName)}</div>
            <div>
              <strong>${d.fullName}</strong>
              <small>ID: ${d.id}</small>
            </div>
          </div>
        </td>
        <td><span class="badge badge-info">${d.bloodType}</span></td>
        <td>${d.city}</td>
        <td>${d.phone}</td>
        <td>
          <span class="badge ${d.isAvailable ? "badge-ok" : "badge-danger"}">
            ${d.isAvailable ? "Available" : "Unavailable"}
          </span>
        </td>
      </tr>
    `).join("")
    : `<tr><td colspan="5" class="empty">لا توجد نتائج مطابقة</td></tr>`;
}

function renderRequests(data) {
  qs("#requestsSummary").textContent = `عدد النتائج: ${data.length}`;

  qs("#requestsTable").innerHTML = data.length
    ? data.map((r) => `
      <tr>
        <td>
          <div class="identity">
            <div class="avatar">${initials(r.patientName)}</div>
            <div>
              <strong>${r.patientName}</strong>
              <small>ID: ${r.id}</small>
            </div>
          </div>
        </td>
        <td>${r.hospitalName}</td>
        <td><span class="badge badge-info">${r.bloodType}</span></td>
        <td>${urgencyBadge(r.urgency)}</td>
        <td><span class="badge badge-warning">${r.status}</span></td>
        <td>${formatDate(r.createdAt)}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="6" class="empty">لا توجد طلبات مطابقة</td></tr>`;
}

function renderNotifications() {
  const grid = qs("#notificationsGrid");

  grid.innerHTML = state.notifications.length
    ? state.notifications.slice().reverse().map((n) => `
      <article class="notification-card">
        <strong>${n.type || "Notification Event"}</strong>
        <p>${n.message || "No message"}</p>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:12px;">
          <span class="badge badge-info">${n.bloodType || "-"}</span>
          ${urgencyBadge(n.urgency || "MEDIUM")}
          <span class="badge badge-ok">${n.status || "SENT"}</span>
        </div>
      </article>
    `).join("")
    : `<article class="notification-card"><p class="empty">لا توجد إشعارات حاليًا. أنشئ طلبًا حرجًا لتفعيل RabbitMQ.</p></article>`;

  qs("#kpiNotifications").textContent = state.notifications.length;
}

function renderHealth() {
  const services = state.health?.services || [];

  qs("#healthGrid").innerHTML = services.map((s) => {
    const detail = serviceDetailByName(s.service);

    return `
      <article class="service-card">
        <strong>${s.service}</strong>
        <p>Reachable through API Gateway</p>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:12px;">
          <span class="badge ${s.reachable ? "badge-ok" : "badge-danger"}">
            ${s.reachable ? "UP" : "DOWN"}
          </span>
          ${detail?.database ? `<span class="badge badge-info">DB: ${detail.database}</span>` : ""}
          ${detail?.rabbitmq ? `<span class="badge badge-info">RabbitMQ: ${detail.rabbitmq}</span>` : ""}
        </div>
      </article>
    `;
  }).join("");

  qs("#kpiSystem").textContent = state.health?.status || "UNKNOWN";
}

function serviceDetailByName(name) {
  if (name === "donor-service") return state.serviceDetails.donor;
  if (name === "request-service") return state.serviceDetails.request;
  if (name === "notification-service") return state.serviceDetails.notification;
  return null;
}

function urgencyBadge(urgency) {
  if (urgency === "CRITICAL") {
    return `<span class="badge badge-critical">CRITICAL</span>`;
  }

  if (urgency === "LOW") {
    return `<span class="badge badge-info">LOW</span>`;
  }

  return `<span class="badge badge-warning">${urgency}</span>`;
}

function applyDonorFilters() {
  const text = qs("#donorTextFilter").value.trim().toLowerCase();
  const blood = qs("#donorBloodFilter").value;
  const city = qs("#donorCityFilter").value.trim().toLowerCase();

  const filtered = state.donors.filter((d) => {
    const textOk = !text ||
      d.fullName.toLowerCase().includes(text) ||
      d.phone.includes(text) ||
      d.city.toLowerCase().includes(text);

    const bloodOk = !blood || d.bloodType === blood;
    const cityOk = !city || d.city.toLowerCase().includes(city);

    return textOk && bloodOk && cityOk;
  });

  renderDonors(filtered);
}

function resetDonorFilters() {
  qs("#donorTextFilter").value = "";
  qs("#donorBloodFilter").value = "";
  qs("#donorCityFilter").value = "";
  renderDonors(state.donors);
}

function applyRequestFilters() {
  const text = qs("#requestTextFilter").value.trim().toLowerCase();
  const urgency = qs("#requestUrgencyFilter").value;
  const status = qs("#requestStatusFilter").value;

  const filtered = state.requests.filter((r) => {
    const textOk = !text ||
      r.patientName.toLowerCase().includes(text) ||
      r.hospitalName.toLowerCase().includes(text) ||
      r.city.toLowerCase().includes(text);

    const urgencyOk = !urgency || r.urgency === urgency;
    const statusOk = !status || r.status === status;

    return textOk && urgencyOk && statusOk;
  });

  renderRequests(filtered);
}

function resetRequestFilters() {
  qs("#requestTextFilter").value = "";
  qs("#requestUrgencyFilter").value = "";
  qs("#requestStatusFilter").value = "";
  renderRequests(state.requests);
}

function openDonorModal() {
  openModal(
    "إضافة متبرع",
    "سيتم حفظ البيانات في donor_db عبر Donor Service.",
    `
      <form id="donorForm" class="modal-form">
        <div class="form-grid">
          <div class="field">
            <label>اسم المتبرع</label>
            <input name="fullName" required placeholder="Bashar Al Shameri" />
          </div>
          <div class="field">
            <label>رقم الهاتف</label>
            <input name="phone" required placeholder="777000111" />
          </div>
          <div class="field">
            <label>فصيلة الدم</label>
            <select name="bloodType" required>
              <option value="">اختر الفصيلة</option>
              <option>A+</option><option>A-</option>
              <option>B+</option><option>B-</option>
              <option>AB+</option><option>AB-</option>
              <option>O+</option><option>O-</option>
            </select>
          </div>
          <div class="field">
            <label>المدينة</label>
            <input name="city" required placeholder="Sanaa" />
          </div>
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" type="submit">حفظ المتبرع</button>
          <button class="btn btn-soft" type="button" id="cancelModalBtn">إلغاء</button>
        </div>
      </form>
    `
  );

  qs("#cancelModalBtn").addEventListener("click", closeModal);

  qs("#donorForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      const result = await apiPost("/api/donors/donors", formToObject(event.currentTarget));
      closeModal();
      toast(result.message || "تم حفظ المتبرع");
      addActivity("Donor created", "تمت إضافة متبرع جديد إلى قاعدة donor_db.");
      await loadDonors();
      renderOverview();
    } catch (error) {
      toast(error.message, "error");
    }
  });
}

function openRequestModal() {
  openModal(
    "إنشاء طلب دم",
    "الطلب الحرج يشغل Remote Invocation وRabbitMQ وUDP Multicast.",
    `
      <form id="requestForm" class="modal-form">
        <div class="form-grid">
          <div class="field">
            <label>اسم المريض</label>
            <input name="patientName" required placeholder="Ali Ahmed" />
          </div>
          <div class="field">
            <label>اسم المستشفى</label>
            <input name="hospitalName" required placeholder="Al-Thawra Hospital" />
          </div>
          <div class="field">
            <label>فصيلة الدم</label>
            <select name="bloodType" required>
              <option value="">اختر الفصيلة</option>
              <option>A+</option><option>A-</option>
              <option>B+</option><option>B-</option>
              <option>AB+</option><option>AB-</option>
              <option>O+</option><option>O-</option>
            </select>
          </div>
          <div class="field">
            <label>المدينة</label>
            <input name="city" required placeholder="Sanaa" />
          </div>
          <div class="field">
            <label>الأولوية</label>
            <select name="urgency" required>
              <option>LOW</option>
              <option>MEDIUM</option>
              <option>HIGH</option>
              <option selected>CRITICAL</option>
            </select>
          </div>
        </div>

        <div class="form-note">
          عند اختيار CRITICAL سيتم إرسال حدث RabbitMQ وإنشاء إشعار، ثم إرسال UDP Multicast Alert إلى multicast-node.
        </div>

        <div class="form-actions">
          <button class="btn btn-danger" type="submit">إنشاء الطلب</button>
          <button class="btn btn-soft" type="button" id="cancelModalBtn">إلغاء</button>
        </div>
      </form>
    `
  );

  qs("#cancelModalBtn").addEventListener("click", closeModal);

  qs("#requestForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      const result = await apiPost("/api/requests/requests", formToObject(event.currentTarget));

      state.lastWorkflow = result;
      qs("#lastWorkflowResult").textContent = JSON.stringify(result, null, 2);

      closeModal();
      toast("تم إنشاء طلب الدم وتشغيل workflow موزع");

      addActivity(
        "Critical request workflow executed",
        "تم تنفيذ Remote Invocation ثم RabbitMQ Pub/Sub ثم UDP Multicast."
      );

      await Promise.allSettled([
        loadRequests(),
        loadNotifications(),
        loadDonors(),
        loadHealth()
      ]);

      renderOverview();
      setPage("requests");
    } catch (error) {
      toast(error.message, "error");
    }
  });
}

function setupEvents() {
  qsa(".nav-item").forEach((button) => {
    button.addEventListener("click", () => setPage(button.dataset.page));
  });

  qsa("[data-jump]").forEach((button) => {
    button.addEventListener("click", () => setPage(button.dataset.jump));
  });

  qs("#refreshBtn").addEventListener("click", async () => {
    await loadAll();
    toast("تم تحديث البيانات");
  });

  qs("#quickCriticalBtn").addEventListener("click", openRequestModal);
  qs("#heroCreateRequestBtn").addEventListener("click", openRequestModal);
  qs("#workflowRunBtn").addEventListener("click", openRequestModal);

  qs("#openDonorModalBtn").addEventListener("click", openDonorModal);
  qs("#openRequestModalBtn").addEventListener("click", openRequestModal);

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
    toast("تم تحديث الإشعارات");
  });

  qs("#reloadHealthBtn").addEventListener("click", async () => {
    await loadHealth();
    toast("تم تحديث حالة الخدمات");
  });

  qs("#copyEvidenceBtn").addEventListener("click", async () => {
    const text = [
      "Distributed Blood Donation System Evidence",
      "- API Gateway: localhost:3000",
      "- Remote Invocation: Request Service -> Donor Service",
      "- RabbitMQ: blood_request.created event",
      "- UDP Multicast: 239.10.10.10:5005",
      "- MySQL: donor_db + request_db",
      "- Docker Compose: distributed local deployment"
    ].join("\\n");

    try {
      await navigator.clipboard.writeText(text);
      toast("تم نسخ ملخص الأدلة");
    } catch {
      toast("تعذر النسخ من المتصفح", "error");
    }
  });
}

setupEvents();

loadAll()
  .then(() => addActivity("Dashboard loaded", "تم تحميل بيانات النظام من API Gateway."))
  .catch((error) => {
    console.error(error);
    toast("تعذر تحميل البيانات. تأكد من تشغيل Docker وAPI Gateway.", "error");
  });
