(function () {
  const API_BASE = "";
  const state = {
    plans: [],
    selectedPlanId: null
  };

  const els = {
    toast: document.getElementById("toast"),
    refreshAllBtn: document.getElementById("refreshAllBtn"),
    boxRuleFile: document.getElementById("boxRuleFile"),
    palletRuleFile: document.getElementById("palletRuleFile"),
    uploadBoxRuleBtn: document.getElementById("uploadBoxRuleBtn"),
    uploadPalletRuleBtn: document.getElementById("uploadPalletRuleBtn"),
    ruleInfo: document.getElementById("ruleInfo"),
    customerCodeInput: document.getElementById("customerCodeInput"),
    shipDateInput: document.getElementById("shipDateInput"),
    mergeModeInput: document.getElementById("mergeModeInput"),
    ordersInput: document.getElementById("ordersInput"),
    createPlanBtn: document.getElementById("createPlanBtn"),
    plansBody: document.getElementById("plansBody"),
    planDetail: document.getElementById("planDetail"),
    layoutPlanId: document.getElementById("layoutPlanId"),
    layoutPalletId: document.getElementById("layoutPalletId"),
    layoutCartonId: document.getElementById("layoutCartonId"),
    layoutModel: document.getElementById("layoutModel"),
    queryLayoutBtn: document.getElementById("queryLayoutBtn"),
    layoutResult: document.getElementById("layoutResult")
  };

  function showToast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 2200);
  }

  async function requestJson(path, options) {
    const res = await fetch(`${API_BASE}${path}`, options);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    return res.json();
  }

  function parseOrders(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map((line, idx) => {
        const parts = line.split(",").map(item => item.trim());
        if (parts.length < 3) throw new Error(`第 ${idx + 1} 行格式错误，应为：订单号,型号,数量`);
        const qty = Number(parts[2]);
        if (!Number.isFinite(qty) || qty <= 0) throw new Error(`第 ${idx + 1} 行数量非法`);
        return { order_no: parts[0], model: parts[1], qty: qty };
      });
  }

  function formatPlanStatus(value) {
    const map = {
      DRAFT: "草稿",
      CALCULATING: "计算中",
      PENDING_CONFIRM: "待确认",
      CONFIRMED: "已确认",
      CALCULATE_FAILED: "计算失败"
    };
    return map[String(value || "")] || String(value || "-");
  }

  async function uploadRule(type) {
    const fileInput = type === "box" ? els.boxRuleFile : els.palletRuleFile;
    const file = fileInput.files && fileInput.files[0];
    if (!file) {
      showToast("请先选择规则文件");
      return;
    }
    const endpoint = type === "box" ? "/api/rules/box/import" : "/api/rules/pallet/import";
    const form = new FormData();
    form.append("file", file, file.name);

    const imported = await requestJson(endpoint, { method: "POST", body: form });
    const activated = await requestJson(`/api/rules/snapshots/${imported.snapshot_id}/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ effective_from: new Date().toISOString() })
    });
    els.ruleInfo.textContent = `${type.toUpperCase()} 导入成功：snapshot=${imported.snapshot_id} version=${imported.version || "-"} 生效=${activated.effective_from}`;
    showToast("规则上传并激活成功");
  }

  async function createPlan() {
    const orders = parseOrders(els.ordersInput.value);
    if (!orders.length) throw new Error("订单不能为空");

    const payload = {
      customer_code: String(els.customerCodeInput.value || "").trim(),
      ship_date: String(els.shipDateInput.value || "").trim(),
      merge_mode: String(els.mergeModeInput.value || "NO_MERGE").trim(),
      orders: orders
    };
    const created = await requestJson("/api/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    showToast(`计划创建成功：#${created.plan.id}`);
    state.selectedPlanId = Number(created.plan.id);
    await refreshPlans();
    await loadPlanDetail(state.selectedPlanId);
  }

  async function refreshPlans() {
    const body = await requestJson("/api/plans");
    state.plans = body.plans || [];
    renderPlans();
  }

  function renderPlans() {
    if (!state.plans.length) {
      els.plansBody.innerHTML = `<tr><td colspan="6">暂无计划</td></tr>`;
      return;
    }
    els.plansBody.innerHTML = state.plans.map(plan => `
      <tr>
        <td>${plan.id}</td>
        <td>${plan.customer_code || "-"}</td>
        <td>${plan.ship_date || "-"}</td>
        <td>${formatPlanStatus(plan.status)}</td>
        <td>${plan.summary_box_count || 0}/${plan.summary_pallet_count || 0}</td>
        <td>
          <button data-action="detail" data-plan="${plan.id}">详情</button>
          <button data-action="calc" data-plan="${plan.id}">计算</button>
          <button data-action="confirm" data-plan="${plan.id}">确认</button>
          <button data-action="rollback" data-plan="${plan.id}">回退</button>
          <button data-action="export" data-plan="${plan.id}">导出</button>
          <button data-action="override" data-plan="${plan.id}">覆盖上传</button>
        </td>
      </tr>
    `).join("");

    els.plansBody.querySelectorAll("button[data-action]").forEach(btn => {
      btn.addEventListener("click", () => handlePlanAction(btn.dataset.action, Number(btn.dataset.plan)));
    });
  }

  async function loadPlanDetail(planId) {
    const body = await requestJson(`/api/plans/${planId}`);
    state.selectedPlanId = Number(planId);
    els.layoutPlanId.value = String(planId);
    els.planDetail.textContent = JSON.stringify(
      {
        plan: body.plan,
        solution_count: (body.solutions || []).length,
        box_rows: (body.solution_item_boxes || []).length,
        pallet_rows: (body.solution_item_pallets || []).length,
        latest_audit: (body.audit_logs || [])[0] || null
      },
      null,
      2
    );
    return body;
  }

  async function calculatePlan(planId) {
    await requestJson(`/api/plans/${planId}/calculate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });
    showToast(`计划 #${planId} 计算完成`);
    await refreshPlans();
    await loadPlanDetail(planId);
  }

  async function confirmPlan(planId) {
    const detail = await loadPlanDetail(planId);
    const solution = (detail.solutions || [])[0];
    if (!solution) throw new Error("该计划暂无可确认方案，请先计算");

    await requestJson(`/api/plans/${planId}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ solution_id: solution.id, actor: "web_user" })
    });
    showToast(`计划 #${planId} 已确认方案 #${solution.id}`);
    await refreshPlans();
    await loadPlanDetail(planId);
  }

  async function rollbackPlan(planId) {
    await requestJson(`/api/plans/${planId}/rollback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "web rollback", actor: "web_user" })
    });
    showToast(`计划 #${planId} 已回退`);
    await refreshPlans();
    await loadPlanDetail(planId);
  }

  async function exportPlan(planId) {
    const res = await fetch(`${API_BASE}/api/plans/${planId}/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }

    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") || "";
    const matched = disposition.match(/filename\*=UTF-8''([^;]+)|filename=\"?([^\";]+)\"?/i);
    const fileName = decodeURIComponent(matched && (matched[1] || matched[2]) ? (matched[1] || matched[2]) : `plan_${planId}.xlsx`);

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast(`计划 #${planId} 导出完成`);
  }

  async function uploadOverride(planId) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx,.xls";
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const form = new FormData();
      form.append("file", file, file.name);
      form.append("actor", "web_user");
      form.append("note", "web override upload");
      await requestJson(`/api/plans/${planId}/override-upload`, {
        method: "POST",
        body: form
      });
      showToast(`计划 #${planId} 覆盖文件上传成功`);
      await loadPlanDetail(planId);
    };
    input.click();
  }

  async function handlePlanAction(action, planId) {
    try {
      if (action === "detail") await loadPlanDetail(planId);
      if (action === "calc") await calculatePlan(planId);
      if (action === "confirm") await confirmPlan(planId);
      if (action === "rollback") await rollbackPlan(planId);
      if (action === "export") await exportPlan(planId);
      if (action === "override") await uploadOverride(planId);
    } catch (err) {
      showToast(`操作失败：${err.message}`);
    }
  }

  async function queryLayout() {
    const planId = String(els.layoutPlanId.value || "").trim();
    if (!planId) throw new Error("请先输入计划ID");
    const params = new URLSearchParams();
    if (els.layoutPalletId.value.trim()) params.set("pallet_id", els.layoutPalletId.value.trim());
    if (els.layoutCartonId.value.trim()) params.set("carton_id", els.layoutCartonId.value.trim());
    if (els.layoutModel.value.trim()) params.set("model", els.layoutModel.value.trim());

    const query = params.toString() ? `?${params.toString()}` : "";
    const data = await requestJson(`/api/layout/${encodeURIComponent(planId)}${query}`);
    els.layoutResult.textContent = JSON.stringify(
      {
        plan_id: data.plan_id,
        solution_id: data.solution_id,
        filters: data.filters,
        stats: data.stats,
        sample: (data.boxes || []).slice(0, 10)
      },
      null,
      2
    );
    showToast("布局查询成功");
  }

  async function refreshAll() {
    await refreshPlans();
    if (state.selectedPlanId) {
      await loadPlanDetail(state.selectedPlanId);
    } else if (state.plans.length) {
      await loadPlanDetail(state.plans[0].id);
    }
  }

  function bindEvents() {
    els.refreshAllBtn.addEventListener("click", () => refreshAll().catch(err => showToast(err.message)));
    els.uploadBoxRuleBtn.addEventListener("click", () => uploadRule("box").catch(err => showToast(err.message)));
    els.uploadPalletRuleBtn.addEventListener("click", () => uploadRule("pallet").catch(err => showToast(err.message)));
    els.createPlanBtn.addEventListener("click", () => createPlan().catch(err => showToast(err.message)));
    els.queryLayoutBtn.addEventListener("click", () => queryLayout().catch(err => showToast(err.message)));
  }

  async function bootstrap() {
    els.ordersInput.value = "ORD-001,54-1801,120\nORD-002,54-82202,60";
    bindEvents();
    await refreshAll();
  }

  bootstrap().catch(err => showToast(`初始化失败：${err.message}`));
})();
