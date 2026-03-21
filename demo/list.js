(function () {
  const { datasets, setCurrentDatasetKey, getCurrentDatasetKey, buildDatasetSwitchHTML } = window.PACKING_DEMO;

  const els = {
    datasetName: document.getElementById("datasetName"),
    datasetSwitch: document.getElementById("datasetSwitch"),
    customerFilter: document.getElementById("customerFilter"),
    statusFilter: document.getElementById("statusFilter"),
    keywordInput: document.getElementById("keywordInput"),
    planTable: document.getElementById("planTable"),
    planEmpty: document.getElementById("planEmpty"),
    listKpis: document.getElementById("listKpis"),
    resetFilters: document.getElementById("resetFilters"),
    toast: document.getElementById("toast")
  };

  let datasetKey = getCurrentDatasetKey();

  function showToast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 1200);
  }

  function renderSwitch() {
    els.datasetSwitch.innerHTML = buildDatasetSwitchHTML(datasetKey);
    els.datasetSwitch.querySelectorAll("[data-switch-dataset]").forEach(btn => {
      btn.addEventListener("click", () => {
        datasetKey = setCurrentDatasetKey(btn.dataset.switchDataset);
        showToast(`已切换到数据集 ${datasetKey}`);
        init();
      });
    });
  }

  function renderCustomerOptions(dataset) {
    const options = ['<option value="">全部客户</option>']
      .concat(dataset.customers.map(c => `<option value="${c.id}">${c.id} - ${c.name}</option>`));
    els.customerFilter.innerHTML = options.join("");
  }

  function getFilteredPlans(dataset) {
    const customerId = els.customerFilter.value;
    const status = els.statusFilter.value;
    const keyword = els.keywordInput.value.trim().toLowerCase();

    return dataset.plans.filter(plan => {
      if (customerId && plan.customerId !== customerId) return false;
      if (status && plan.status !== status) return false;

      if (keyword) {
        const hit = [plan.id, plan.orders, plan.customerId].join(" ").toLowerCase().includes(keyword);
        if (!hit) return false;
      }

      return true;
    });
  }

  function statusClass(status) {
    if (status === "已确认") return "done";
    if (status === "待确认") return "pending";
    return "draft";
  }

  function renderKpis(dataset, filteredPlans) {
    const totalBoxes = filteredPlans.reduce((s, p) => s + p.kpis.boxCount, 0);
    const totalPallets = filteredPlans.reduce((s, p) => s + p.kpis.palletCount, 0);
    const totalWeight = filteredPlans.reduce((s, p) => s + p.kpis.weight, 0);

    els.listKpis.innerHTML = [
      { label: "任务数量", value: String(filteredPlans.length) },
      { label: "外箱总数", value: String(totalBoxes) },
      { label: "托盘总数", value: String(totalPallets) },
      { label: "总毛重", value: `${totalWeight} kg` }
    ].map(k => `<div class="kpi"><h4>${k.label}</h4><p>${k.value}</p></div>`).join("");
  }

  function renderTable(dataset, filteredPlans) {
    const customerMap = Object.fromEntries(dataset.customers.map(c => [c.id, c]));

    if (!filteredPlans.length) {
      els.planTable.innerHTML = "";
      els.planEmpty.style.display = "block";
      return;
    }

    els.planEmpty.style.display = "none";
    els.planTable.innerHTML = filteredPlans.map(plan => {
      const customer = customerMap[plan.customerId];
      return `
        <tr>
          <td>${plan.id}</td>
          <td>${customer ? customer.name : plan.customerId}</td>
          <td>${plan.shipDate}</td>
          <td>${plan.mode}</td>
          <td>${plan.orders}</td>
          <td><span class="status ${statusClass(plan.status)}">${plan.status}</span></td>
          <td>${plan.kpis.boxCount} / ${plan.kpis.palletCount}</td>
          <td><button data-open-plan="${plan.id}">查看详情</button></td>
        </tr>
      `;
    }).join("");

    els.planTable.querySelectorAll("[data-open-plan]").forEach(btn => {
      btn.addEventListener("click", () => {
        window.location.href = `./detail.html?plan=${encodeURIComponent(btn.dataset.openPlan)}&ds=${datasetKey}`;
      });
    });
  }

  function bindFilters() {
    [els.customerFilter, els.statusFilter, els.keywordInput].forEach(el => {
      el.addEventListener("input", () => init(false));
      el.addEventListener("change", () => init(false));
    });

    els.resetFilters.addEventListener("click", () => {
      els.customerFilter.value = "";
      els.statusFilter.value = "";
      els.keywordInput.value = "";
      showToast("筛选已重置");
      init(false);
    });
  }

  function init(resetFilters = true) {
    const dataset = datasets[datasetKey];
    els.datasetName.textContent = `${dataset.name} ｜ 客户数 ${dataset.customers.length} ｜ 任务数 ${dataset.plans.length}`;

    renderSwitch();

    if (resetFilters) {
      renderCustomerOptions(dataset);
      els.statusFilter.value = "";
      els.keywordInput.value = "";
    }

    const filteredPlans = getFilteredPlans(dataset);
    renderKpis(dataset, filteredPlans);
    renderTable(dataset, filteredPlans);
  }

  bindFilters();
  init(true);
})();
