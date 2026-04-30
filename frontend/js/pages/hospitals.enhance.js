(function () {
  const API_BASE = "";

  function qs(selector) {
    return document.querySelector(selector);
  }

  function createHospitalModal() {
    if (qs("#hospitalModal")) return;

    document.body.insertAdjacentHTML("beforeend", `
      <div id="hospitalModal" class="modal-overlay">
        <div class="modal-card compact-modal">
          <div class="modal-header">
            <div>
              <h3>إضافة مستشفى</h3>
              <p>أدخل بيانات المستشفى المرتبط بطلبات الدم.</p>
            </div>
            <button type="button" class="modal-close" id="closeHospitalModalBtn">×</button>
          </div>

          <form id="hospitalForm" class="modal-form">
            <label>
              <span>اسم المستشفى</span>
              <input id="hospitalName" required placeholder="مثال: Al-Jumhori Hospital" />
            </label>

            <label>
              <span>كود المستشفى</span>
              <input id="hospitalCode" required placeholder="مثال: HOSP-TAIZ-01" />
            </label>

            <label>
              <span>المدينة</span>
              <input id="hospitalCity" value="Taiz" placeholder="Taiz" />
            </label>

            <label>
              <span>العنوان</span>
              <input id="hospitalAddress" placeholder="عنوان المستشفى" />
            </label>

            <label>
              <span>رقم التواصل</span>
              <input id="hospitalPhone" placeholder="777000000" />
            </label>

            <label>
              <span>الشخص المسؤول</span>
              <input id="hospitalContactPerson" placeholder="اسم مسؤول التواصل" />
            </label>

            <div class="modal-actions">
              <button type="button" class="btn btn-light" id="cancelHospitalModalBtn">إلغاء</button>
              <button type="submit" class="btn btn-primary">حفظ المستشفى</button>
            </div>
          </form>
        </div>
      </div>
    `);
  }

  function openHospitalModal() {
    createHospitalModal();
    qs("#hospitalModal")?.classList.add("active");
  }

  function closeHospitalModal() {
    qs("#hospitalModal")?.classList.remove("active");
    qs("#hospitalForm")?.reset();
    const city = qs("#hospitalCity");
    if (city) city.value = "Taiz";
  }

  async function postHospital(payload) {
    const response = await fetch(`${API_BASE}/api/requests/hospitals`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok || data.success === false) {
      throw new Error(data.message || "فشل حفظ بيانات المستشفى");
    }

    return data;
  }

  function ensureHospitalActions() {
    const page = qs("#hospitalsPage");
    if (!page) return false;

    const pageHeader = page.querySelector(".page-header");
    if (!pageHeader) return false;

    if (!qs("#openHospitalModalBtn")) {
      pageHeader.insertAdjacentHTML("beforeend", `
        <div class="page-actions">
          <button id="openHospitalModalBtn" class="btn btn-primary" type="button">
            إضافة مستشفى
          </button>
        </div>
      `);
    }

    return true;
  }

  function setupHospitalEvents() {
    document.addEventListener("click", (event) => {
      if (event.target.closest("#openHospitalModalBtn")) {
        openHospitalModal();
      }

      if (
        event.target.closest("#closeHospitalModalBtn") ||
        event.target.closest("#cancelHospitalModalBtn")
      ) {
        closeHospitalModal();
      }
    });

    document.addEventListener("submit", async (event) => {
      if (event.target.id !== "hospitalForm") return;

      event.preventDefault();

      const payload = {
        name: qs("#hospitalName")?.value.trim(),
        code: qs("#hospitalCode")?.value.trim(),
        city: qs("#hospitalCity")?.value.trim() || "Taiz",
        address: qs("#hospitalAddress")?.value.trim() || null,
        phone: qs("#hospitalPhone")?.value.trim() || null,
        contactPerson: qs("#hospitalContactPerson")?.value.trim() || null
      };

      try {
        await postHospital(payload);
        closeHospitalModal();

        if (typeof loadDashboard === "function") {
          await loadDashboard();
        }

        if (typeof setPage === "function") {
          setPage("hospitals");
        }

        alert("تم حفظ المستشفى بنجاح.");
      } catch (error) {
        alert(error.message || "حدث خطأ أثناء حفظ المستشفى.");
      }
    });
  }

  function boot() {
    createHospitalModal();

    const ready = ensureHospitalActions();

    if (!ready) {
      setTimeout(boot, 300);
      return;
    }

    setupHospitalEvents();
  }

  boot();
})();
