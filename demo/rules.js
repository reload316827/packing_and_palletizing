(function () {
  const API_BASE = "";

  const els = {
    datasetName: document.getElementById("datasetName"),
    datasetSwitch: document.getElementById("datasetSwitch"),
    moduleFilter: document.getElementById("moduleFilter"),
    keywordInput: document.getElementById("keywordInput"),
    resetFilters: document.getElementById("resetFilters"),
    fakeAddBtn: document.getElementById("fakeAddBtn"),
    fakeImportBtn: document.getElementById("fakeImportBtn"),
    ruleFileInput: document.getElementById("ruleFileInput"),
    ruleHead: document.getElementById("ruleHead"),
    ruleBody: document.getElementById("ruleBody"),
    ruleEmpty: document.getElementById("ruleEmpty"),
    ruleKpis: document.getElementById("ruleKpis"),
    toast: document.getElementById("toast")
  };

  const moduleConfig = {
    customerRules: {
      columns: [
        { label: "客户", key: "customer_code" },
        { label: "计划数", key: "plan_count" },
        { label: "已确认数", key: "confirmed_count" },
        { label: "最近发货日", key: "last_ship_date" }
      ]
    },
    modelInner: {
      columns: [
        { label: "型号", key: "model_code" },
        { label: "内盒", key: "inner_box_spec" },
        { label: "装箱数", key: "qty_per_carton" },
        { label: "毛重(kg)", key: "gross_weight_kg" }
      ]
    },
    innerOuter: {
      columns: [
        { label: "内盒编号", keys: ["inner_box_code", "编号", "内盒编号"] },
        { label: "长/mm", keys: ["长/mm", "内盒长/mm", "长"] },
        { label: "宽/mm", keys: ["宽/mm", "内盒宽/mm", "宽"] },
        { label: "高/mm", keys: ["高/mm", "内盒高/mm", "高"] },
        { label: "外箱规格/cm", keys: ["外箱规格/cm", "外箱规格(cm)", "外箱规格", "carton_spec_cm"] },
        { label: "内盒+外箱重量/kg", keys: ["内盒+外箱重量/kg", "内盒+外箱重量", "内盒外箱重量/kg"] },
        { label: "一箱总数/只", keys: ["一箱总数/只", "一箱总数", "carton_qty"] },
        { label: "内盒排列方式（横竖高）/只", keys: ["内盒排列方式（横竖高）/只", "内盒排列方式(横竖高)/只", "内盒排列方式"] },
        { label: "默认托盘规格/cm", keys: ["默认托盘规格/cm", "默认托盘规格(cm)", "默认托盘规格", "pallet_spec_cm"] },
        { label: "默认规格下一托外箱数", keys: ["默认规格下一托外箱数", "默认下一托外箱数", "pallet_carton_qty"] },
        { label: "外箱排列方式（横竖高）", keys: ["外箱排列方式（横竖高）/只", "外箱排列方式(横竖高)", "外箱排列方式（横竖高）"] },
        { label: "来源Sheet", key: "source_sheet" },
        { label: "来源行", key: "source_row" }
      ]
    }
  };

  function getCellValue(row, column) {
    if (column.key) return row[column.key] ?? "-";
    const keys = column.keys || [];
    for (const key of keys) {
      if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") {
        return row[key];
      }
    }
    return "-";
  }

  function showToast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 2000);
  }

  async function requestJson(path, options) {
    const res = await fetch(`${API_BASE}${path}`, options);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HTTP ${res.status}: ${body}`);
    }
    return res.json();
  }

  function withKeyword(rows) {
    const keyword = String(els.keywordInput.value || "").trim().toLowerCase();
    if (!keyword) return rows;
    return rows.filter(row => Object.values(row).join(" ").toLowerCase().includes(keyword));
  }

  function renderTable(moduleKey, rows) {
    const conf = moduleConfig[moduleKey];
    els.ruleHead.innerHTML = conf.columns.map(col => `<th>${col.label}</th>`).join("");

    if (!rows.length) {
      els.ruleBody.innerHTML = "";
      els.ruleEmpty.style.display = "block";
      return;
    }

    els.ruleEmpty.style.display = "none";
    els.ruleBody.innerHTML = rows.map(row => {
      const tds = conf.columns.map(col => `<td>${getCellValue(row, col)}</td>`).join("");
      return `<tr>${tds}</tr>`;
    }).join("");
  }

  function renderKpis(moduleKey, rows, extra) {
    const moduleName = {
      customerRules: "客户维度",
      modelInner: "型号-内盒",
      innerOuter: "内盒-外箱-托盘"
    }[moduleKey];

    els.ruleKpis.innerHTML = [
      { label: "数据源", value: "后端 API" },
      { label: "当前模块", value: moduleName },
      { label: "记录数", value: String(rows.length) },
      { label: "规则版本", value: extra.version || "-" }
    ].map(item => `<div class="kpi"><h4>${item.label}</h4><p>${item.value}</p></div>`).join("");
  }

  async function loadCustomerRules() {
    const body = await requestJson("/api/plans");
    const plans = body.plans || [];
    const grouped = new Map();

    plans.forEach(plan => {
      const key = String(plan.customer_code || "").trim() || "-";
      if (!grouped.has(key)) {
        grouped.set(key, {
          customer_code: key,
          plan_count: 0,
          confirmed_count: 0,
          last_ship_date: "-"
        });
      }
      const item = grouped.get(key);
      item.plan_count += 1;
      if (String(plan.status || "") === "CONFIRMED") item.confirmed_count += 1;
      if (String(plan.ship_date || "") > String(item.last_ship_date || "")) {
        item.last_ship_date = String(plan.ship_date || "-");
      }
    });

    return { rows: [...grouped.values()], version: "runtime" };
  }

  async function loadSnapshotRows(snapshotType) {
    const active = await requestJson(`/api/rules/active?snapshot_type=${encodeURIComponent(snapshotType)}`);
    const activeSnapshot = active.active_snapshot;
    if (!activeSnapshot) {
      return { rows: [], version: "-" };
    }

    const detail = await requestJson(`/api/rules/snapshots/${activeSnapshot.id}`);
    return {
      rows: detail.records_preview || [],
      version: activeSnapshot.version || "-"
    };
  }

  async function loadRowsByModule() {
    const moduleKey = els.moduleFilter.value;
    if (moduleKey === "customerRules") return loadCustomerRules();
    if (moduleKey === "modelInner") return loadSnapshotRows("box");
    return loadSnapshotRows("pallet");
  }

  async function handleImportClick() {
    const moduleKey = els.moduleFilter.value;
    if (moduleKey === "customerRules") {
      showToast("客户规则来自计划统计，无需上传文件");
      return;
    }
    els.ruleFileInput.value = "";
    els.ruleFileInput.click();
  }

  async function handleUploadSelected() {
    const file = els.ruleFileInput.files && els.ruleFileInput.files[0];
    if (!file) return;

    const moduleKey = els.moduleFilter.value;
    const endpoint = moduleKey === "modelInner" ? "/api/rules/box/import" : "/api/rules/pallet/import";
    const form = new FormData();
    form.append("file", file, file.name);

    try {
      const imported = await requestJson(endpoint, {
        method: "POST",
        body: form
      });

      await requestJson(`/api/rules/snapshots/${imported.snapshot_id}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ effective_from: new Date().toISOString() })
      });

      showToast(`导入成功：${imported.record_count} 条，冲突 ${imported.conflict_count}`);
      await refresh();
    } catch (err) {
      showToast(`导入失败：${err.message}`);
    }
  }

  async function refresh() {
    const moduleKey = els.moduleFilter.value;
    try {
      const loaded = await loadRowsByModule();
      const rows = withKeyword(loaded.rows);
      els.datasetName.textContent = `规则中心 / 模块 ${moduleKey}`;
      renderKpis(moduleKey, rows, loaded);
      renderTable(moduleKey, rows);
    } catch (err) {
      els.datasetName.textContent = "规则加载失败";
      els.ruleHead.innerHTML = "";
      els.ruleBody.innerHTML = "";
      els.ruleEmpty.style.display = "block";
      els.ruleEmpty.textContent = `加载失败：${err.message}`;
      renderKpis(moduleKey, [], { version: "-" });
    }
  }

  [els.moduleFilter, els.keywordInput].forEach(el => {
    el.addEventListener("input", refresh);
    el.addEventListener("change", refresh);
  });

  els.resetFilters.addEventListener("click", () => {
    els.moduleFilter.value = "customerRules";
    els.keywordInput.value = "";
    showToast("筛选条件已重置");
    refresh();
  });

  els.fakeAddBtn.addEventListener("click", () => showToast("Demo 暂不支持在线新增规则"));
  els.fakeImportBtn.addEventListener("click", handleImportClick);
  els.ruleFileInput.addEventListener("change", handleUploadSelected);

  els.datasetSwitch.innerHTML = `<button class="ghost" id="refreshRulesBtn">刷新</button>`;
  const refreshBtn = document.getElementById("refreshRulesBtn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      refresh();
      showToast("已刷新");
    });
  }

  refresh();
})();
