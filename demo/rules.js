(function () {
  const { datasets, setCurrentDatasetKey, getCurrentDatasetKey, buildDatasetSwitchHTML } = window.PACKING_DEMO;

  const els = {
    datasetName: document.getElementById("datasetName"),
    datasetSwitch: document.getElementById("datasetSwitch"),
    moduleFilter: document.getElementById("moduleFilter"),
    keywordInput: document.getElementById("keywordInput"),
    resetFilters: document.getElementById("resetFilters"),
    fakeAddBtn: document.getElementById("fakeAddBtn"),
    fakeImportBtn: document.getElementById("fakeImportBtn"),
    ruleHead: document.getElementById("ruleHead"),
    ruleBody: document.getElementById("ruleBody"),
    ruleEmpty: document.getElementById("ruleEmpty"),
    ruleKpis: document.getElementById("ruleKpis"),
    toast: document.getElementById("toast")
  };

  const moduleConfig = {
    customerRules: {
      columns: ["customerId", "customerName", "mode", "boxType", "provider", "special"],
      labels: ["客户编号", "客户名称", "装箱要求", "内盒类型", "提供方", "特定内盒要求"]
    },
    modelInner: {
      columns: ["model", "inner", "unitWeight", "perCase"],
      labels: ["型号", "默认内盒", "单重(kg)", "默认每箱"]
    },
    innerOuter: {
      columns: ["inner", "outerSpec", "perCase", "pallet"],
      labels: ["内盒编号", "外箱规格(cm)", "一箱总数", "默认托盘"]
    }
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

  function getRows(dataset) {
    const moduleKey = els.moduleFilter.value;
    const rows = dataset.rules[moduleKey] || [];
    const keyword = els.keywordInput.value.trim().toLowerCase();

    if (!keyword) return rows;

    return rows.filter(row => Object.values(row).join(" ").toLowerCase().includes(keyword));
  }

  function renderKpis(dataset, rows) {
    const moduleKey = els.moduleFilter.value;
    const moduleName = {
      customerRules: "客户规则",
      modelInner: "型号-内盒",
      innerOuter: "内盒-外箱"
    }[moduleKey];

    const totalModules = Object.keys(dataset.rules).length;
    const uniqueCount = moduleKey === "customerRules"
      ? new Set(rows.map(r => r.customerId)).size
      : moduleKey === "modelInner"
        ? new Set(rows.map(r => r.model)).size
        : new Set(rows.map(r => r.inner)).size;

    els.ruleKpis.innerHTML = [
      { label: "当前数据集", value: datasetKey },
      { label: "规则模块", value: moduleName },
      { label: "当前行数", value: String(rows.length) },
      { label: "唯一键数量", value: String(uniqueCount || 0) }
    ].map(k => `<div class="kpi"><h4>${k.label}</h4><p>${k.value}</p></div>`).join("");

    void totalModules;
  }

  function renderTable(rows) {
    const moduleKey = els.moduleFilter.value;
    const conf = moduleConfig[moduleKey];

    els.ruleHead.innerHTML = conf.labels.map(l => `<th>${l}</th>`).join("");

    if (!rows.length) {
      els.ruleBody.innerHTML = "";
      els.ruleEmpty.style.display = "block";
      return;
    }

    els.ruleEmpty.style.display = "none";
    els.ruleBody.innerHTML = rows.map(row => {
      const tds = conf.columns.map(col => `<td>${row[col] ?? "-"}</td>`).join("");
      return `<tr>${tds}</tr>`;
    }).join("");
  }

  function init() {
    const dataset = datasets[datasetKey];
    els.datasetName.textContent = `${dataset.name} ｜ 可维护模块 3 个`;
    renderSwitch();
    const rows = getRows(dataset);
    renderKpis(dataset, rows);
    renderTable(rows);
  }

  [els.moduleFilter, els.keywordInput].forEach(el => {
    el.addEventListener("input", init);
    el.addEventListener("change", init);
  });

  els.resetFilters.addEventListener("click", () => {
    els.moduleFilter.value = "customerRules";
    els.keywordInput.value = "";
    showToast("筛选已重置");
    init();
  });

  [els.fakeAddBtn, els.fakeImportBtn].forEach(btn => {
    btn.addEventListener("click", () => showToast("Demo 模式：未接入真实保存逻辑"));
  });

  init();
})();
