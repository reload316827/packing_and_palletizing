(function () {
  const API_BASE = "";

  const els = {
    datasetName: document.getElementById("datasetName"),
    uploadOrdersBtn: document.getElementById("uploadOrdersBtn"),
    uploadOrdersFile: document.getElementById("uploadOrdersFile"),
    customerFilter: document.getElementById("customerFilter"),
    statusFilter: document.getElementById("statusFilter"),
    keywordInput: document.getElementById("keywordInput"),
    planTable: document.getElementById("planTable"),
    planEmpty: document.getElementById("planEmpty"),
    listKpis: document.getElementById("listKpis"),
    resetFilters: document.getElementById("resetFilters"),
    toast: document.getElementById("toast"),
  };

  function showToast(msg) {
    if (!els.toast) return;
    els.toast.textContent = msg;
    els.toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 1800);
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
    if (status === "MISSING_DATA") return "bad";
    if (status === "CONFIRMED") return "done";
    if (status === "PENDING_CONFIRM" || status === "CALCULATING") return "pending";
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
      CALCULATE_FAILED: "计算失败",
    };
    return map[text] || text || "-";
  }

  function statusText(plan) {
    if (plan && plan.has_missing_data) {
      return `缺少数据(${plan.missing_model_count || 0})`;
    }
    return normalizeStatus(plan.status);
  }

  function buildCustomerOptions(plans) {
    const values = [...new Set(plans.map(item => String(item.customer_code || "").trim()).filter(Boolean))];
    els.customerFilter.innerHTML = ['<option value="">全部客户</option>']
      .concat(values.map(v => `<option value="${v}">${v}</option>`))
      .join("");
  }

  function applyClientFilters(plans) {
    const customerCode = String(els.customerFilter.value || "").trim();
    const selectedStatus = String(els.statusFilter.value || "").trim();
    const keyword = String(els.keywordInput.value || "").trim().toLowerCase();

    return plans.filter(plan => {
      if (customerCode && String(plan.customer_code || "").trim() !== customerCode) {
        return false;
      }
      if (selectedStatus === "MISSING_DATA" && !plan.has_missing_data) {
        return false;
      }
      if (selectedStatus && selectedStatus !== "MISSING_DATA" && String(plan.status || "").trim() !== selectedStatus) {
        return false;
      }
      if (keyword) {
        const hit = [plan.id, plan.customer_code, plan.ship_date, plan.merge_mode, plan.status]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
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
      { label: "总毛重", value: `${totalWeight.toFixed(1)} kg` },
    ]
      .map(k => `<div class="kpi"><h4>${k.label}</h4><p>${k.value}</p></div>`)
      .join("");
  }

  function renderTable(plans) {
    if (!plans.length) {
      els.planTable.innerHTML = "";
      els.planEmpty.style.display = "block";
      els.planEmpty.textContent = "没有匹配数据";
      return;
    }

    els.planEmpty.style.display = "none";
    els.planTable.innerHTML = plans
      .map(
        plan => `
      <tr>
        <td>${plan.id}</td>
        <td>${plan.customer_code || "-"}</td>
        <td>${plan.ship_date || "-"}</td>
        <td>${normalizeMergeMode(plan.merge_mode)}</td>
        <td>${plan.order_count || 0} 行</td>
        <td><span class="status ${plan.has_missing_data ? "bad" : statusClass(plan.status)}">${statusText(plan)}</span></td>
        <td>${plan.summary_box_count || 0} / ${plan.summary_pallet_count || 0}</td>
        <td>
          <button data-open-plan="${plan.id}">查看详情</button>
          <button data-recalc-plan="${plan.id}" class="ghost">重新计算</button>
        </td>
      </tr>
    `
      )
      .join("");

    els.planTable.querySelectorAll("[data-open-plan]").forEach(btn => {
      btn.addEventListener("click", () => {
        window.location.href = `./detail.html?plan=${encodeURIComponent(btn.dataset.openPlan)}`;
      });
    });
    els.planTable.querySelectorAll("[data-recalc-plan]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const planId = Number(btn.dataset.recalcPlan);
        btn.disabled = true;
        try {
          await requestJson(`/api/plans/${planId}/calculate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}"
          });
          showToast(`计划 #${planId} 已重新计算`);
          await refresh(false);
        } catch (err) {
          showToast(`重算失败：${err.message}`);
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  async function loadPlans() {
    const status = String(els.statusFilter.value || "").trim();
    const statusQuery = status && status !== "MISSING_DATA" ? status : "";
    const query = statusQuery ? `?status=${encodeURIComponent(statusQuery)}` : "";
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

  async function importOrderWorkbook(file) {
    if (!file) return;
    const lowerName = String(file.name || "").toLowerCase();
    if (!lowerName.endsWith(".xlsx")) {
      throw new Error("仅支持上传 .xlsx 文件");
    }

    const form = new FormData();
    form.append("file", file, file.name);
    form.append("actor", "web_user");

    const imported = await requestJson("/api/plans/import", {
      method: "POST",
      body: form,
    });

    const planId = imported && imported.plan ? imported.plan.id : "-";
    const solutionCount = imported && imported.calculate ? imported.calculate.solution_count : 0;
    showToast(`上传成功：计划 #${planId}，已生成 ${solutionCount} 套方案`);
    await refresh(true);
  }

  [els.customerFilter, els.statusFilter, els.keywordInput].forEach(el => {
    if (!el) return;
    el.addEventListener("input", () => refresh(false));
    el.addEventListener("change", () => refresh(false));
  });

  if (els.resetFilters) {
    els.resetFilters.addEventListener("click", () => {
      els.customerFilter.value = "";
      els.statusFilter.value = "";
      els.keywordInput.value = "";
      showToast("筛选条件已重置");
      refresh(false);
    });
  }

  if (els.uploadOrdersBtn && els.uploadOrdersFile) {
    els.uploadOrdersBtn.addEventListener("click", () => {
      els.uploadOrdersFile.value = "";
      els.uploadOrdersFile.click();
    });

    els.uploadOrdersFile.addEventListener("change", async () => {
      const file = els.uploadOrdersFile.files && els.uploadOrdersFile.files[0];
      if (!file) return;
      try {
        await importOrderWorkbook(file);
      } catch (err) {
        showToast(`上传失败：${err.message}`);
      } finally {
        els.uploadOrdersFile.value = "";
      }
    });
  }

  refresh(true);
})();
