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
    ruleHead: document.getElementById("ruleHead"),
    ruleBody: document.getElementById("ruleBody"),
    ruleEmpty: document.getElementById("ruleEmpty"),
    ruleKpis: document.getElementById("ruleKpis"),
    toast: document.getElementById("toast")
  };

  const moduleConfig = {
    customerRules: {
      columns: ["customer_code", "plan_count", "confirmed_count", "last_ship_date"],
      labels: ["????", "???", "?????", "??????"]
    },
    modelInner: {
      columns: ["model_code", "inner_box_spec", "qty_per_carton", "gross_weight_kg"],
      labels: ["??", "????", "????", "??(kg)"]
    },
    innerOuter: {
      columns: ["inner_box_code", "carton_spec_cm", "pallet_spec_cm", "pallet_carton_qty"],
      labels: ["????", "????(cm)", "????", "???????"]
    }
  };

  function showToast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 1500);
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
    els.ruleHead.innerHTML = conf.labels.map(label => `<th>${label}</th>`).join("");

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

  function renderKpis(moduleKey, rows, extra) {
    const moduleName = {
      customerRules: "????",
      modelInner: "??-??",
      innerOuter: "??-??-??"
    }[moduleKey];

    els.ruleKpis.innerHTML = [
      { label: "????", value: "??API" },
      { label: "????", value: moduleName },
      { label: "????", value: String(rows.length) },
      { label: "????", value: extra.version || "???" },
    ].map(k => `<div class="kpi"><h4>${k.label}</h4><p>${k.value}</p></div>`).join("");
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
          last_ship_date: "-",
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
      return { rows: [], version: "???" };
    }

    const detail = await requestJson(`/api/rules/snapshots/${activeSnapshot.id}`);
    return {
      rows: detail.records_preview || [],
      version: activeSnapshot.version || "-",
    };
  }

  async function loadRowsByModule() {
    const moduleKey = els.moduleFilter.value;
    if (moduleKey === "customerRules") {
      return loadCustomerRules();
    }
    if (moduleKey === "modelInner") {
      return loadSnapshotRows("box");
    }
    return loadSnapshotRows("pallet");
  }

  async function handleImport() {
    const moduleKey = els.moduleFilter.value;
    if (moduleKey === "customerRules") {
      showToast("??????????????????????");
      return;
    }

    const inputPath = window.prompt("???????????????????", "");
    if (!inputPath) return;

    const endpoint = moduleKey === "modelInner" ? "/api/rules/box/import" : "/api/rules/pallet/import";

    try {
      const imported = await requestJson(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_path: inputPath })
      });

      await requestJson(`/api/rules/snapshots/${imported.snapshot_id}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ effective_from: new Date().toISOString() })
      });

      showToast(`?????${imported.record_count} ???? ${imported.conflict_count}`);
      await refresh();
    } catch (err) {
      showToast(`?????${err.message}`);
    }
  }

  async function refresh() {
    const moduleKey = els.moduleFilter.value;
    try {
      const loaded = await loadRowsByModule();
      const rows = withKeyword(loaded.rows);
      els.datasetName.textContent = `?????? ? ?? ${moduleKey}`;
      renderKpis(moduleKey, rows, loaded);
      renderTable(moduleKey, rows);
    } catch (err) {
      els.datasetName.textContent = "????????";
      els.ruleHead.innerHTML = "";
      els.ruleBody.innerHTML = "";
      els.ruleEmpty.style.display = "block";
      els.ruleEmpty.textContent = `??????${err.message}`;
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
    showToast("?????");
    refresh();
  });

  els.fakeAddBtn.addEventListener("click", () => showToast("?????????????????"));
  els.fakeImportBtn.addEventListener("click", handleImport);

  els.datasetSwitch.innerHTML = `<button class="ghost" id="refreshRulesBtn">????</button>`;
  const refreshBtn = document.getElementById("refreshRulesBtn");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      refresh();
      showToast("?????");
    });
  }

  refresh();
})();
