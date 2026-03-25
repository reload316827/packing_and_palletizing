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
    if (status === "CONFIRMED") return "done";
    if (status === "PENDING_CONFIRM") return "pending";
    if (status === "CALCULATING") return "pending";
    return "draft";
  }

  function normalizeMergeMode(value) {
    const text = String(value || "").trim();
    if (text === "MERGE" || text === "合并") return "合并";
    if (text === "NO_MERGE" || text === "不合并") return "不合并";
    return text || "-";
  }

  function normalizeStatus(value) {
    const text = String(value || "").trim();
    const map = {
      DRAFT: "草稿",
      CALCULATING: "计算中",
      PENDING_CONFIRM: "待确认",
      CONFIRMED: "已确认",
      CALCULATE_FAILED: "计算失败"
    };
    return map[text] || text || "-";
  }

  function buildCustomerOptions(plans) {
    const values = [...new Set(plans.map(item => String(item.customer_code || "").trim()).filter(Boolean))];
    els.customerFilter.innerHTML = ['<option value="">全部客户</option>']
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
          plan.status
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
      { label: "计划数", value: String(plans.length) },
      { label: "外箱数", value: String(totalBoxes) },
      { label: "托盘数", value: String(totalPallets) },
      { label: "总毛重", value: `${totalWeight.toFixed(1)} kg` }
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
        <td>${plan.order_count || 0} 行</td>
        <td><span class="status ${statusClass(plan.status)}">${normalizeStatus(plan.status)}</span></td>
        <td>${plan.summary_box_count || 0} / ${plan.summary_pallet_count || 0}</td>
        <td><button data-open-plan="${plan.id}">查看详情</button></td>
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
      if (resetFilterOptions) buildCustomerOptions(plans);
      const filtered = applyClientFilters(plans);
      els.datasetName.textContent = `任务总数 ${plans.length}，筛选后 ${filtered.length}`;
      renderKpis(filtered);
      renderTable(filtered);
    } catch (err) {
      els.datasetName.textContent = "任务加载失败";
      els.planTable.innerHTML = "";
      els.planEmpty.style.display = "block";
      els.planEmpty.textContent = `加载失败：${err.message}`;
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
    showToast("筛选已重置");
    refresh(false);
  });

  refresh(true);
})();
