(function () {
  const API_BASE = "";

  const els = {
    datasetName: document.getElementById("datasetName"),
    customerFilter: document.getElementById("customerFilter"),
    statusFilter: document.getElementById("statusFilter"),
    keywordInput: document.getElementById("keywordInput"),
    planTable: document.getElementById("planTable"),
    planEmpty: document.getElementById("planEmpty"),
    listKpis: document.getElementById("listKpis"),
    resetFilters: document.getElementById("resetFilters"),
    toast: document.getElementById("toast")
  };

  function showToast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 1400);
  }

  async function requestJson(path, options) {
    const res = await fetch(`${API_BASE}${path}`, options);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HTTP ${res.status}: ${body}`);
    }
    return res.json();
  }

  function statusClass(status) {
    if (status === "CONFIRMED" || status === "???") return "done";
    if (status === "PENDING_CONFIRM" || status === "???") return "pending";
    if (status === "CALCULATING" || status === "???") return "pending";
    return "draft";
  }

  function normalizeMergeMode(value) {
    const text = String(value || "").trim();
    if (text === "MERGE" || text === "??") return "??";
    if (text === "NO_MERGE" || text === "???") return "???";
    return text || "-";
  }

  function normalizeStatus(value) {
    const text = String(value || "").trim();
    const map = {
      DRAFT: "??",
      CALCULATING: "???",
      PENDING_CONFIRM: "???",
      CONFIRMED: "???",
      CALCULATE_FAILED: "????"
    };
    return map[text] || text || "-";
  }

  function buildCustomerOptions(plans) {
    const values = [...new Set(plans.map(item => String(item.customer_code || "").trim()).filter(Boolean))];
    els.customerFilter.innerHTML = ['<option value="">????</option>']
      .concat(values.map(v => `<option value="${v}">${v}</option>`))
      .join("");
  }

  function applyClientFilters(plans) {
    const customerCode = String(els.customerFilter.value || "").trim();
    const keyword = String(els.keywordInput.value || "").trim().toLowerCase();

    return plans.filter(plan => {
      if (customerCode && String(plan.customer_code || "").trim() !== customerCode) {
        return false;
      }
      if (keyword) {
        const hit = [
          plan.id,
          plan.customer_code,
          plan.ship_date,
          plan.merge_mode,
          plan.status,
        ].join(" ").toLowerCase().includes(keyword);
        if (!hit) return false;
      }
      return true;
    });
  }

  function renderKpis(plans) {
    const totalBoxes = plans.reduce((sum, row) => sum + Number(row.summary_box_count || 0), 0);
    const totalPallets = plans.reduce((sum, row) => sum + Number(row.summary_pallet_count || 0), 0);
    const totalWeight = plans.reduce((sum, row) => sum + Number(row.summary_weight_kg || 0), 0);

    els.listKpis.innerHTML = [
      { label: "????", value: String(plans.length) },
      { label: "????", value: String(totalBoxes) },
      { label: "????", value: String(totalPallets) },
      { label: "???", value: `${totalWeight.toFixed(1)} kg` }
    ]
      .map(k => `<div class="kpi"><h4>${k.label}</h4><p>${k.value}</p></div>`)
      .join("");
  }

  function renderTable(plans) {
    if (!plans.length) {
      els.planTable.innerHTML = "";
      els.planEmpty.style.display = "block";
      return;
    }

    els.planEmpty.style.display = "none";
    els.planTable.innerHTML = plans.map(plan => `
      <tr>
        <td>${plan.id}</td>
        <td>${plan.customer_code || "-"}</td>
        <td>${plan.ship_date || "-"}</td>
        <td>${normalizeMergeMode(plan.merge_mode)}</td>
        <td>${plan.order_count || 0} ?</td>
        <td><span class="status ${statusClass(plan.status)}">${normalizeStatus(plan.status)}</span></td>
        <td>${plan.summary_box_count || 0} / ${plan.summary_pallet_count || 0}</td>
        <td><button data-open-plan="${plan.id}">????</button></td>
      </tr>
    `).join("");

    els.planTable.querySelectorAll("[data-open-plan]").forEach(btn => {
      btn.addEventListener("click", () => {
        window.location.href = `./detail.html?plan=${encodeURIComponent(btn.dataset.openPlan)}`;
      });
    });
  }

  async function loadPlans() {
    const status = String(els.statusFilter.value || "").trim();
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    const body = await requestJson(`/api/plans${query}`);
    return body.plans || [];
  }

  async function refresh(resetFilterOptions) {
    try {
      const plans = await loadPlans();
      if (resetFilterOptions) {
        buildCustomerOptions(plans);
      }
      const filtered = applyClientFilters(plans);
      els.datasetName.textContent = `?????? ? ??? ${plans.length} ? ???? ${filtered.length}`;
      renderKpis(filtered);
      renderTable(filtered);
    } catch (err) {
      els.datasetName.textContent = "??????????";
      els.planTable.innerHTML = "";
      els.planEmpty.style.display = "block";
      els.planEmpty.textContent = `??????${err.message}`;
      renderKpis([]);
    }
  }

  [els.customerFilter, els.statusFilter, els.keywordInput].forEach(el => {
    el.addEventListener("input", () => refresh(false));
    el.addEventListener("change", () => refresh(false));
  });

  els.resetFilters.addEventListener("click", () => {
    els.customerFilter.value = "";
    els.statusFilter.value = "";
    els.keywordInput.value = "";
    showToast("?????");
    refresh(false);
  });

  refresh(true);
})();
