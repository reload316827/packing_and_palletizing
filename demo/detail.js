(function () {
  const { PACKING_DEMO } = window;
  if (!PACKING_DEMO) return;

  const els = {
    detailTitle: document.getElementById("detailTitle"),
    detailSub: document.getElementById("detailSub"),
    datasetSwitch: document.getElementById("datasetSwitch"),
    planSelect: document.getElementById("planSelect"),
    modelFilter: document.getElementById("modelFilter"),
    specFilter: document.getElementById("specFilter"),
    cartonFilter: document.getElementById("cartonFilter"),
    reset3dFilters: document.getElementById("reset3dFilters"),
    viewPackingBtn: document.getElementById("viewPackingBtn"),
    viewPalletBtn: document.getElementById("viewPalletBtn"),
    viewerPager: document.getElementById("viewerPager"),
    viewerPrevBtn: document.getElementById("viewerPrevBtn"),
    viewerNextBtn: document.getElementById("viewerNextBtn"),
    viewerPageInfo: document.getElementById("viewerPageInfo"),
    detailKpis: document.getElementById("detailKpis"),
    missingDataCard: document.getElementById("missingDataCard"),
    missingDataMeta: document.getElementById("missingDataMeta"),
    missingDataEmpty: document.getElementById("missingDataEmpty"),
    missingDataTableWrap: document.getElementById("missingDataTableWrap"),
    missingDataBody: document.getElementById("missingDataBody"),
    saveMissingDataBtn: document.getElementById("saveMissingDataBtn"),
    planTableWrap: document.getElementById("planTableWrap"),
    solutionGrid: document.getElementById("solutionGrid"),
    ordersText: document.getElementById("ordersText"),
    metricScopeSwitch: document.getElementById("metricScopeSwitch"),
    metricsTable: document.getElementById("metricsTable"),
    viewer: document.getElementById("viewer"),
    sceneMeta: document.getElementById("sceneMeta"),
    cartonInfo: document.getElementById("cartonInfo"),
    packingBoxSelect: document.getElementById("packingBoxSelect"),
    palletSelect: document.getElementById("palletSelect"),
    labelScaleSelect: document.getElementById("labelScaleSelect"),
    labelModeSelect: document.getElementById("labelModeSelect"),
    toast: document.getElementById("toast"),
  };

  const modelColors = {
    "405398": 0x74c0fc,
    "405228": 0x4dabf7,
    "420867": 0x63e6be,
    "406010": 0xffd43b,
    "405790": 0xffa94d,
  };
  const labelScaleSteps = [1, 1.5, 2, 3, 4];

  const state = {
    datasetKey: PACKING_DEMO.getCurrentDatasetKey(),
    dataset: null,
    apiMode: false,
    availablePlans: [],
    plan: null,
    baseRows: [],
    rows: [],
    solutionIndex: 1,
    metricScope: "plan",
    currentMode: "pallet",
    pageByMode: { packing: 1, pallet: 1 },
    pageMetaByMode: {
      packing: { page: 1, totalPages: 1, totalItems: 0, pageItems: 0 },
      pallet: { page: 1, totalPages: 1, totalItems: 0, pageItems: 0 },
    },
    viewerApi: null,
    planId: null,
    missingData: null,
  };

  function showToast(msg) {
    if (!els.toast) return;
    els.toast.textContent = msg;
    els.toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 1700);
  }

  async function requestJson(path, options) {
    const res = await fetch(path, options);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HTTP ${res.status}: ${body}`);
    }
    return res.json();
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function groupBy(items, getKey) {
    return items.reduce((acc, item) => {
      const key = getKey(item);
      if (!acc.has(key)) acc.set(key, []);
      acc.get(key).push(item);
      return acc;
    }, new Map());
  }

  function dedupeJoin(values, delimiter = "+") {
    const seen = new Set();
    const ordered = [];
    (values || []).forEach(item => {
      const text = String(item || "").trim();
      if (!text || seen.has(text)) return;
      seen.add(text);
      ordered.push(text);
    });
    return ordered.length ? ordered.join(delimiter) : "-";
  }

  function getPlanIdFromUrl() {
    return new URLSearchParams(window.location.search).get("plan");
  }

  function upsertQuery(key, value) {
    const params = new URLSearchParams(window.location.search);
    if (!value) params.delete(key);
    else params.set(key, value);
    const query = params.toString();
    const next = `${window.location.pathname}${query ? `?${query}` : ""}`;
    window.history.replaceState({}, "", next);
  }

  function normalizePose(idx) {
    return idx % 5 === 0 || idx % 9 === 0 ? "竖放" : "平放";
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

  function parseSpecNumbers(specText, fallback = [56, 38, 29]) {
    const parts = String(specText || "")
      .split("*")
      .map(item => Number(String(item).trim()))
      .filter(item => Number.isFinite(item) && item > 0);
    return parts.length === 3 ? parts : fallback;
  }

  function parseSpecToDims(specText) {
    // 3D 展示按规格厘米值等比例呈现，不做人为缩放
    const [w, d, h] = parseSpecNumbers(specText, [56, 38, 29]);
    return { w: Math.max(1, Number(w || 0)), d: Math.max(1, Number(d || 0)), h: Math.max(1, Number(h || 0)) };
  }

  function buildRowsFromPlan(plan) {
    const boxes = (((plan || {}).layout || {}).outerBoxes || []);
    const orderNoText = String((plan || {}).orders || "-");
    return boxes.map((box, idx) => ({
      id: box.id,
      orderNo: orderNoText,
      palletId: `PALLET-${String(box.pallet).padStart(2, "0")}`,
      slotC: Number(box.slotC || 0),
      slotR: Number(box.slotR || 0),
      w: Number(box.w || 48),
      h: Number(box.h || 28),
      d: Number(box.d || 34),
      spec: String(box.spec || "-"),
      inner: String((box.spec || "").split("*")[0] || "-"),
      qty: Number(box.qty || Math.max(24, Math.round(((box.pattern || []).length || 2) * 12))),
      grossWeight: Number(box.grossWeight || (Math.max(24, Math.round(((box.pattern || []).length || 2) * 12)) * 0.18 + 5.6)),
      models: (box.models || []).map(item => String(item)),
      grid: box.grid || { cols: 3, rows: 2, layers: 2 },
      pattern: (box.pattern || box.models || ["405398"]).map(item => String(item)),
      pose: normalizePose(idx),
    }));
  }

  function buildRowsFromApiLayout(layoutBoxes) {
    return (layoutBoxes || []).map((box, idx) => {
      const spec = String(box.carton_spec_cm || "56*38*29");
      const dims = parseSpecToDims(spec);
      const models = (box.models || []).map(item => String(item));
      const poseText = String(box.pose || "").toLowerCase();
      return {
        id: String(box.carton_id || `CARTON-${idx + 1}`),
        orderNo: String(box.order_no || "-"),
        palletId: String(box.pallet_id || `PALLET-${String((box.pallet_seq || 0) + 1).padStart(2, "0")}`),
        slotC: Number((box.row_seq || 0) % 4),
        slotR: Number(Math.floor(Number(box.row_seq || 0) / 4)),
        rowSeq: Number(box.row_seq || idx),
        w: dims.w,
        h: dims.h,
        d: dims.d,
        spec,
        inner: String(spec.split("*")[0] || "-"),
        qty: Number(box.qty || 0),
        grossWeight: Number(box.gross_weight_kg || 0),
        models: models.length ? models : ["-"],
        grid: { cols: 3, rows: 2, layers: 2 },
        pattern: models.length ? models : ["-"],
        pose: ["vertical", "stand", "v"].includes(poseText) ? "竖放" : "平放",
        usableSpec: String(box.usable_spec_cm || box.pallet_spec_cm || "108*108*90"),
        palletSpec: String(box.pallet_spec_cm || "116*116*103"),
      };
    });
  }

  async function loadApiContext(planId) {
    if (!/^\d+$/.test(String(planId || ""))) return null;
    const numericPlanId = Number(planId);
    try {
      const [detail, planList] = await Promise.all([
        requestJson(`/api/plans/${numericPlanId}`),
        requestJson("/api/plans"),
      ]);
      let layout = null;
      try {
        layout = await requestJson(`/api/layout/${numericPlanId}`);
      } catch (layoutErr) {
        layout = { boxes: [] };
      }

      const planRow = detail.plan || {};
      const solutions = (detail.solutions || []).slice(0, 3).map((item, idx) => ({
        name: idx === 0 ? "保守" : idx === 1 ? "均衡" : "极致省箱",
        complexity: idx === 0 ? "低" : idx === 1 ? "中" : "高",
        boxCount: Number(item.box_count || 0),
        palletCount: Number(item.pallet_count || 0),
      }));
      if (!solutions.length) {
        solutions.push(
          { name: "保守", complexity: "低", boxCount: Number(planRow.summary_box_count || 0), palletCount: Number(planRow.summary_pallet_count || 0) },
          { name: "均衡", complexity: "中", boxCount: Number(planRow.summary_box_count || 0), palletCount: Number(planRow.summary_pallet_count || 0) },
          { name: "极致省箱", complexity: "高", boxCount: Number(planRow.summary_box_count || 0), palletCount: Number(planRow.summary_pallet_count || 0) }
        );
      }

      const mappedPlan = {
        id: String(planRow.id || numericPlanId),
        customerId: String(planRow.customer_code || "-"),
        shipDate: String(planRow.ship_date || "-"),
        mode: normalizeMergeMode(planRow.merge_mode),
        status: planRow.has_missing_data
          ? `缺少数据(${Number(planRow.missing_model_count || 0)})`
          : normalizeStatus(planRow.status),
        orders: dedupeJoin((detail.orders || []).map(row => row.order_no)),
        kpis: {
          lineCount: Number((detail.orders || []).length || 0),
          boxCount: Number(planRow.summary_box_count || 0),
          palletCount: Number(planRow.summary_pallet_count || 0),
          weight: Number(planRow.summary_weight_kg || 0),
        },
        solutions,
      };

      return {
        plan: mappedPlan,
        rows: buildRowsFromApiLayout(layout.boxes || []),
        availablePlans: (planList.plans || []).map(row => ({
          id: String(row.id),
          customerId: String(row.customer_code || "-"),
          shipDate: String(row.ship_date || "-"),
        })),
      };
    } catch (err) {
      return null;
    }
  }

  function projectRowsBySolution(baseRows, solutionIndex) {
    if (state.apiMode) {
      return baseRows.map(item => ({ ...item }));
    }
    const mapped = baseRows.map((item, idx) => {
      let pose = item.pose;
      if (solutionIndex === 0) {
        pose = idx % 8 === 0 ? "竖放" : "平放";
      } else if (solutionIndex === 2) {
        pose = (idx % 3 === 0 || idx % 4 === 0) ? "竖放" : "平放";
      }

      const pattern = solutionIndex === 2 && idx % 2 === 1
        ? [...item.pattern].reverse()
        : [...item.pattern];

      return { ...item, pose, pattern };
    });

    if (solutionIndex === 0) {
      return [...mapped].sort((a, b) => String(a.spec).localeCompare(String(b.spec), "zh-CN"));
    }
    if (solutionIndex === 2) {
      const rotated = [...mapped];
      if (rotated.length > 2) {
        rotated.push(rotated.shift());
        rotated.push(rotated.shift());
      }
      return rotated;
    }
    return mapped;
  }

  function uniqueSorted(items) {
    return [...new Set(items)].filter(Boolean).sort((a, b) => String(a).localeCompare(String(b), "zh-CN"));
  }

  function renderDatasetSwitch() {
    if (!els.datasetSwitch) return;
    if (state.apiMode) {
      els.datasetSwitch.innerHTML = '<button class="ghost" type="button">实时数据模式</button>';
      return;
    }
    els.datasetSwitch.innerHTML = PACKING_DEMO.buildDatasetSwitchHTML(state.datasetKey);
    els.datasetSwitch.querySelectorAll("[data-switch-dataset]").forEach(btn => {
      btn.addEventListener("click", () => {
        const key = btn.getAttribute("data-switch-dataset");
        state.datasetKey = PACKING_DEMO.setCurrentDatasetKey(key);
        const firstPlan = (PACKING_DEMO.getCurrentDataset().plans || [])[0];
        upsertQuery("plan", firstPlan ? firstPlan.id : "");
        initDataAndRender();
        showToast(`已切换到数据集 ${key}`);
      });
    });
  }

  function renderPlanSelect() {
    if (!els.planSelect) return;
    const plans = state.apiMode ? state.availablePlans : (state.dataset.plans || []);
    els.planSelect.innerHTML = plans
      .map(item => `<option value="${item.id}">${item.id} | ${item.customerId} | ${item.shipDate}</option>`)
      .join("");
    if (state.plan) els.planSelect.value = state.plan.id;
    els.planSelect.onchange = () => {
      upsertQuery("plan", els.planSelect.value);
      initDataAndRender();
    };
  }

  function renderHeader() {
    if (!state.plan) return;
    if (els.detailTitle) els.detailTitle.textContent = `任务详情 - ${state.plan.id}`;
    if (els.detailSub) {
      els.detailSub.textContent = [
        `客户 ${state.plan.customerId}`,
        `发货日期 ${state.plan.shipDate}`,
        `装箱要求 ${state.plan.mode}`,
        `状态 ${state.plan.status}`,
      ].join(" ｜ ");
    }
  }

  function renderMissingDataCard() {
    if (!els.missingDataCard) return;
    if (!state.apiMode || !state.planId) {
      els.missingDataCard.style.display = "none";
      return;
    }

    els.missingDataCard.style.display = "";
    const data = state.missingData || {};
    const missingDetails = data.missing_details || [];
    const manualRules = data.manual_rules || [];
    const manualByModel = new Map(manualRules.map(item => [String(item.model_code || "").trim(), item]));

    if (els.missingDataMeta) {
      els.missingDataMeta.textContent = `缺少 ${missingDetails.length} 个型号规则，补录后可直接重新计算`;
    }

    if (!missingDetails.length) {
      if (els.missingDataTableWrap) els.missingDataTableWrap.style.display = "none";
      if (els.missingDataEmpty) els.missingDataEmpty.style.display = "block";
      if (els.saveMissingDataBtn) els.saveMissingDataBtn.disabled = true;
      return;
    }

    if (els.missingDataTableWrap) els.missingDataTableWrap.style.display = "block";
    if (els.missingDataEmpty) els.missingDataEmpty.style.display = "none";
    if (els.saveMissingDataBtn) els.saveMissingDataBtn.disabled = false;

    if (els.missingDataBody) {
      els.missingDataBody.innerHTML = missingDetails
        .map(row => {
          const modelCode = String(row.model_code || "").trim();
          const manual = manualByModel.get(modelCode) || {};
          return `
            <tr data-model-code="${escapeHtml(modelCode)}">
              <td>${escapeHtml(modelCode)}</td>
              <td>${Number(row.line_count || 0)}</td>
              <td>${Number(row.qty || 0)}</td>
              <td><input class="missing-row-input" data-field="inner_box_spec" value="${escapeHtml(manual.inner_box_spec || "")}" placeholder="例如 105" /></td>
              <td><input class="missing-row-input" data-field="gross_weight_kg" type="number" min="0" step="0.01" value="${escapeHtml(manual.gross_weight_kg || "")}" /></td>
              <td><input class="missing-row-input" data-field="note" value="${escapeHtml(manual.note || "")}" /></td>
            </tr>
          `;
        })
        .join("");
    }
  }

  async function loadMissingData() {
    if (!state.apiMode || !state.planId) {
      state.missingData = null;
      renderMissingDataCard();
      return;
    }
    try {
      state.missingData = await requestJson(`/api/plans/${state.planId}/missing-data`);
      renderMissingDataCard();
    } catch (err) {
      if (String(err.message || "").includes("HTTP 404")) {
        if (els.missingDataCard) els.missingDataCard.style.display = "none";
        return;
      }
      state.missingData = { missing_details: [] };
      renderMissingDataCard();
      showToast(`缺少数据加载失败：${err.message}`);
    }
  }

  function collectMissingDataForm() {
    if (!els.missingDataBody) return [];
    const rows = [...els.missingDataBody.querySelectorAll("tr[data-model-code]")];
    return rows
      .map(row => {
        const modelCode = String(row.getAttribute("data-model-code") || "").trim();
        const innerBoxSpec = String((row.querySelector('[data-field="inner_box_spec"]') || {}).value || "").trim();
        const grossWeight = String((row.querySelector('[data-field="gross_weight_kg"]') || {}).value || "").trim();
        const note = String((row.querySelector('[data-field="note"]') || {}).value || "").trim();
        if (!modelCode || !innerBoxSpec || !grossWeight) return null;
        return {
          model_code: modelCode,
          inner_box_spec: innerBoxSpec,
          gross_weight_kg: grossWeight || null,
          note: note || null,
        };
      })
      .filter(Boolean);
  }

  async function saveMissingDataAndRecalculate() {
    const rules = collectMissingDataForm();
    if (!rules.length) {
      showToast("请先补录内盒编号和毛重后再保存");
      return;
    }
    if (els.saveMissingDataBtn) els.saveMissingDataBtn.disabled = true;
    try {
      const saved = await requestJson(`/api/plans/${state.planId}/missing-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ box_rules: rules }),
      });
      await requestJson(`/api/plans/${state.planId}/calculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      await initDataAndRender();
      const remain = (saved && saved.remaining_missing_models) || [];
      if (remain.length) {
        showToast(`已保存 ${rules.length} 条，仍缺少 ${remain.length} 个型号`);
      } else {
        showToast(`已保存 ${rules.length} 条并完成重新计算`);
      }
    } catch (err) {
      showToast(`保存失败：${err.message}`);
    } finally {
      if (els.saveMissingDataBtn) els.saveMissingDataBtn.disabled = false;
    }
  }

  function renderTopFilters() {
    const rows = state.rows;
    const modelOptions = uniqueSorted(rows.flatMap(item => item.models));
    const specOptions = uniqueSorted(rows.map(item => item.spec));
    const cartonOptions = uniqueSorted(rows.map(item => item.id));

    els.modelFilter.innerHTML = ['<option value="">全部型号</option>']
      .concat(modelOptions.map(item => `<option value="${item}">${item}</option>`))
      .join("");
    els.specFilter.innerHTML = ['<option value="">全部规格</option>']
      .concat(specOptions.map(item => `<option value="${item}">${item}</option>`))
      .join("");
    els.cartonFilter.innerHTML = ['<option value="">全部外箱</option>']
      .concat(cartonOptions.map(item => `<option value="${item}">${item}</option>`))
      .join("");
  }

  function getFilteredRows() {
    const model = String(els.modelFilter.value || "").trim();
    const spec = String(els.specFilter.value || "").trim();
    const carton = String(els.cartonFilter.value || "").trim();
    return state.rows.filter(item => {
      if (model && !item.models.includes(model)) return false;
      if (spec && item.spec !== spec) return false;
      if (carton && item.id !== carton) return false;
      return true;
    });
  }

  function renderKpis(rows) {
    if (!els.detailKpis) return;
    const palletCount = new Set(rows.map(item => item.palletId)).size;
    const uprightCount = rows.filter(item => item.pose === "竖放").length;
    const labels = [
      { label: "外箱总数", value: String(rows.length) },
      { label: "托盘总数", value: String(palletCount) },
      { label: "竖放外箱", value: String(uprightCount) },
      { label: "计划行数", value: String((state.plan.kpis || {}).lineCount || rows.length) },
    ];
    els.detailKpis.innerHTML = labels
      .map(item => `<article class="kpi"><h4>${item.label}</h4><p>${item.value}</p></article>`)
      .join("");
  }

  function renderPlanTable(rows) {
    if (!els.planTableWrap) return;
    const byPallet = groupBy(rows, item => item.palletId);
    const packingLines = rows.flatMap(item => {
      const parts = item.models.length || 1;
      return item.models.map(model => ({
        orderNo: item.orderNo || "-",
        model,
        qty: Math.max(1, Math.round((Number(item.qty || 0) || 0) / parts)),
        inner: item.inner || "-",
        cartonId: item.id,
        cartonSpec: item.spec,
        grossWeight: Number(item.grossWeight || 0) / parts,
        remark: parts > 1 ? "拼箱" : "-",
      }));
    });
    const orderMap = groupBy(packingLines, line => line.orderNo);
    const totalQty = packingLines.reduce((sum, item) => sum + Number(item.qty || 0), 0);
    const totalWeight = packingLines.reduce((sum, item) => sum + Number(item.grossWeight || 0), 0);

    const packingTable = `
      <div class="plan-table-block">
        <div class="plan-table-head">
          <h4>装箱明细</h4>
          <p>格式对齐导出模板：订单/型号/数量/内盒/外箱/规格/毛重/备注</p>
        </div>
        <div class="plan-table-scroll">
          <table>
            <thead>
              <tr>
                <th>订单号</th><th>型号</th><th>数量</th><th>内盒</th><th>外箱编号</th><th>外箱规格(cm)</th><th>毛重(kg)</th><th>备注</th>
              </tr>
            </thead>
            <tbody>
              ${[...orderMap.entries()].map(([orderNo, lineRows]) => `
                <tr><td colspan="8" style="background:#eef2ff;color:#334155;font-weight:700;">订单：${orderNo}</td></tr>
                ${lineRows.map(line => `
                  <tr>
                    <td>${line.orderNo}</td>
                    <td>${line.model}</td>
                    <td>${line.qty}</td>
                    <td>${line.inner}</td>
                    <td>${line.cartonId}</td>
                    <td>${line.cartonSpec}</td>
                    <td>${Number(line.grossWeight || 0).toFixed(1)}</td>
                    <td>${line.remark}</td>
                  </tr>
                `).join("")}
                <tr><td colspan="8" style="background:#f8fbff;color:#1e3a8a;font-weight:700;">订单汇总：总件数 ${lineRows.reduce((sum, row) => sum + Number(row.qty || 0), 0)}，总毛重 ${lineRows.reduce((sum, row) => sum + Number(row.grossWeight || 0), 0).toFixed(1)} kg</td></tr>
              `).join("")}
              <tr><td colspan="8" style="background:#e0f2fe;color:#0c4a6e;font-weight:800;">装箱总汇总：订单 ${orderMap.size} 笔，外箱 ${new Set(rows.map(item => item.id)).size} 箱，总件数 ${totalQty}，总毛重 ${totalWeight.toFixed(1)} kg</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    const palletRows = [...byPallet.entries()].map(([palletId, list]) => {
      const specList = uniqueSorted(list.map(item => item.spec));
      const specs = specList.join(" / ");
      const modelList = uniqueSorted(list.flatMap(item => item.models));
      const fullModels = modelList.join("、");
      const previewModels = modelList.slice(0, 8).join("、");
      const modelSummary = modelList.length > 8
        ? `${previewModels} 等 ${modelList.length} 种`
        : (previewModels || "-");
      const hasUpright = list.some(item => item.pose === "竖放");
      return `
        <tr>
          <td>${palletId}</td>
          <td>${list.length}</td>
          <td>${specs}</td>
          <td class="model-summary-cell">
            <div class="model-summary-main" title="${escapeHtml(fullModels)}">${escapeHtml(modelSummary)}</div>
            ${modelList.length > 8 ? `<details class="model-summary-more"><summary>展开全部</summary><div class="model-summary-full">${escapeHtml(fullModels)}</div></details>` : ""}
          </td>
          <td>${hasUpright ? "平放+竖放" : "平放"}</td>
        </tr>
      `;
    }).join("");

    const palletTable = `
      <div class="plan-table-block">
        <div class="plan-table-head">
          <h4>装托汇总</h4>
          <p>竖放箱高亮展示</p>
        </div>
        <div class="plan-table-scroll">
          <table class="pallet-table">
            <thead>
              <tr>
                <th>托盘编号</th><th>外箱数</th><th>外箱规格</th><th>型号集合</th><th>摆放</th>
              </tr>
            </thead>
            <tbody>${palletRows}</tbody>
          </table>
        </div>
      </div>
    `;

    els.planTableWrap.innerHTML = `${packingTable}${palletTable}`;
  }

  function renderSolutions() {
    if (!els.solutionGrid) return;
    const solutions = state.plan.solutions || [];
    els.solutionGrid.innerHTML = solutions
      .map((item, idx) => `
        <article class="solution ${idx === state.solutionIndex ? "active" : ""}" data-solution-index="${idx}">
          <span class="badge">${item.complexity}</span>
          <h4>${item.name}</h4>
          <p>外箱 ${item.boxCount} 箱｜托盘 ${item.palletCount} 托</p>
        </article>
      `)
      .join("");
    els.solutionGrid.querySelectorAll("[data-solution-index]").forEach(card => {
      card.addEventListener("click", () => {
        const idx = Number(card.getAttribute("data-solution-index"));
        if (!Number.isFinite(idx) || idx === state.solutionIndex) return;
        state.solutionIndex = idx;
        state.rows = projectRowsBySolution(state.baseRows, state.solutionIndex);
        rerenderContent();
        showToast(`已切换到 ${(state.plan.solutions[idx] || {}).name || "目标"} 方案`);
      });
    });
  }

  function renderOrders() {
    if (!els.ordersText) return;
    const parts = String(state.plan.orders || "")
      .split("+")
      .map(item => String(item || "").trim())
      .filter(Boolean);
    els.ordersText.textContent = dedupeJoin(parts);
  }

  function renderMetricScopeSwitch() {
    if (!els.metricScopeSwitch) return;
    els.metricScopeSwitch.innerHTML = `
      <button class="${state.metricScope === "plan" ? "primary" : "ghost"}" data-scope="plan">计划口径</button>
      <button class="${state.metricScope === "filtered" ? "primary" : "ghost"}" data-scope="filtered">筛选口径</button>
    `;
    els.metricScopeSwitch.querySelectorAll("[data-scope]").forEach(btn => {
      btn.addEventListener("click", () => {
        state.metricScope = btn.getAttribute("data-scope");
        renderMetrics(getFilteredRows());
        renderMetricScopeSwitch();
      });
    });
  }

  function renderMetrics(filteredRows) {
    if (!els.metricsTable) return;
    const planKpis = state.plan.kpis || {};
    const useFiltered = state.metricScope === "filtered";
    const sourceRows = useFiltered ? filteredRows : state.rows;
    const palletCount = new Set(sourceRows.map(item => item.palletId)).size;
    const uprightCount = sourceRows.filter(item => item.pose === "竖放").length;
    const metricPairs = [
      ["数据集", PACKING_DEMO.datasets[state.datasetKey].name],
      ["计划编号", state.plan.id],
      ["外箱数", useFiltered ? String(sourceRows.length) : String(planKpis.boxCount || sourceRows.length)],
      ["托盘数", useFiltered ? String(palletCount) : String(planKpis.palletCount || palletCount)],
      ["竖放箱数", String(uprightCount)],
      ["总毛重", `${Number(planKpis.weight || 0).toFixed(1)} kg`],
    ];
    els.metricsTable.innerHTML = metricPairs
      .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
      .join("");
  }

  function populateSelect(selectEl, values, allLabel) {
    if (!selectEl) return;
    selectEl.innerHTML = [`<option value="ALL">${allLabel}</option>`]
      .concat(values.map(item => `<option value="${item}">${item}</option>`))
      .join("");
  }

  function ensureLabelScaleOption4x() {
    if (!els.labelScaleSelect) return;
    const has4x = [...els.labelScaleSelect.options].some(item => item.value === "4");
    if (!has4x) {
      els.labelScaleSelect.insertAdjacentHTML("beforeend", '<option value="4">4x</option>');
    }
  }

  function createViewer(rows) {
    if (!els.viewer || !window.THREE || !THREE.OrbitControls) {
      if (els.sceneMeta) els.sceneMeta.textContent = "Three.js 资源加载失败。";
      return null;
    }

    const displayRows = rows;

    els.viewer.innerHTML = "";
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf3f8ff);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2200);
    camera.position.set(190, 142, 210);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    els.viewer.appendChild(renderer.domElement);

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 18;
    controls.maxDistance = 1400;
    controls.target.set(0, 34, 0);
    controls.update();

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xb2becd, 0.88);
    hemiLight.position.set(0, 320, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
    dirLight.position.set(180, 240, 140);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 900),
      new THREE.MeshStandardMaterial({ color: 0xe5edf5, roughness: 0.96, metalness: 0 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    floor.receiveShadow = true;
    scene.add(floor);

    const board = { width: 640, depth: 420 };
    const boardPlate = new THREE.Mesh(
      new THREE.PlaneGeometry(board.width, board.depth),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94, metalness: 0.02 })
    );
    boardPlate.rotation.x = -Math.PI / 2;
    boardPlate.position.y = 0.02;
    boardPlate.receiveShadow = true;
    scene.add(boardPlate);

    const boardOutlinePoints = [
      new THREE.Vector3(-board.width / 2, 0.06, -board.depth / 2),
      new THREE.Vector3(board.width / 2, 0.06, -board.depth / 2),
      new THREE.Vector3(board.width / 2, 0.06, board.depth / 2),
      new THREE.Vector3(-board.width / 2, 0.06, board.depth / 2),
      new THREE.Vector3(-board.width / 2, 0.06, -board.depth / 2),
    ];
    const boardOutline = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(boardOutlinePoints),
      new THREE.LineBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.75 })
    );
    scene.add(boardOutline);

    scene.add(new THREE.GridHelper(900, 28, 0x9fb3c8, 0xc8d6e5));
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x1f2937, transparent: true, opacity: 0.25 });
    let sceneGroup = null;

    function getModelLabelScale() {
      const scale = Number(els.labelScaleSelect ? els.labelScaleSelect.value : "2");
      return Number.isFinite(scale) && scale > 0 ? scale : 1;
    }

    function getLabelMode() {
      const mode = els.labelModeSelect ? els.labelModeSelect.value : "sparse";
      return ["sparse", "all", "top"].includes(mode) ? mode : "sparse";
    }

    function addBox(group, cfg) {
      const geometry = new THREE.BoxGeometry(cfg.w, cfg.h, cfg.d);
      const material = new THREE.MeshStandardMaterial({
        color: cfg.color,
        transparent: cfg.opacity !== undefined,
        opacity: cfg.opacity ?? 1,
        roughness: 0.55,
        metalness: 0.05,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(cfg.x, cfg.y, cfg.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMaterial);
      edges.position.copy(mesh.position);
      group.add(edges);
      return mesh;
    }

    function createLabel(group, text, x, y, z, cfg = {}) {
      const canvas = document.createElement("canvas");
      canvas.width = cfg.width || 360;
      canvas.height = cfg.height || 110;
      const ctx = canvas.getContext("2d");
      const w = canvas.width;
      const h = canvas.height;
      const bg = cfg.bg || "rgba(15, 23, 42, 0.8)";
      const fg = cfg.fg || "#f8fafc";
      const border = cfg.border || "rgba(148, 163, 184, 0.75)";
      const radius = 14;

      ctx.fillStyle = bg;
      ctx.strokeStyle = border;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(radius, 0);
      ctx.lineTo(w - radius, 0);
      ctx.quadraticCurveTo(w, 0, w, radius);
      ctx.lineTo(w, h - radius);
      ctx.quadraticCurveTo(w, h, w - radius, h);
      ctx.lineTo(radius, h);
      ctx.quadraticCurveTo(0, h, 0, h - radius);
      ctx.lineTo(0, radius);
      ctx.quadraticCurveTo(0, 0, radius, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = fg;
      ctx.font = `${cfg.fontSize || 24}px Microsoft YaHei`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const lines = String(text).split("\\n");
      const startY = h / 2 - ((lines.length - 1) * 16);
      lines.forEach((line, i) => ctx.fillText(line, w / 2, startY + i * 32));

      const texture = new THREE.CanvasTexture(canvas);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: cfg.depthTest ?? false,
        depthWrite: cfg.depthWrite ?? false,
      }));
      sprite.scale.set(cfg.scaleX || 20, cfg.scaleY || 6, 1);
      sprite.position.set(x, y, z);
      sprite.renderOrder = cfg.renderOrder ?? 10;
      group.add(sprite);
    }

    function paginateItems(mode, items, pageSize) {
      const size = Math.max(1, Number(pageSize) || 1);
      const totalItems = items.length;
      const totalPages = Math.max(1, Math.ceil(totalItems / size));
      const current = Math.min(Math.max(1, Number((state.pageByMode || {})[mode] || 1)), totalPages);
      state.pageByMode[mode] = current;
      const start = (current - 1) * size;
      const pageItems = items.slice(start, start + size);
      const meta = { page: current, totalPages, totalItems, pageItems: pageItems.length, pageSize: size };
      state.pageMetaByMode[mode] = meta;
      return { pageItems, meta };
    }

    function updateViewerPager(mode) {
      if (!els.viewerPager || !els.viewerPrevBtn || !els.viewerNextBtn || !els.viewerPageInfo) return;
      const meta = (state.pageMetaByMode || {})[mode] || { page: 1, totalPages: 1, totalItems: 0, pageItems: 0 };
      const multiPage = meta.totalPages > 1;
      els.viewerPager.style.display = multiPage ? "inline-flex" : "none";
      els.viewerPrevBtn.disabled = meta.page <= 1;
      els.viewerNextBtn.disabled = meta.page >= meta.totalPages;
      const scope = mode === "packing" ? "箱" : "托";
      els.viewerPageInfo.textContent = `第 ${meta.page} / ${meta.totalPages} 页（共 ${meta.totalItems} ${scope}）`;
    }

    function updateCartonInfo() {
      if (!els.cartonInfo) return;
      const boxId = els.packingBoxSelect ? els.packingBoxSelect.value : "ALL";
      const list = boxId === "ALL" ? displayRows : displayRows.filter(item => item.id === boxId);
      if (!list.length) {
        els.cartonInfo.textContent = "当前筛选无可显示外箱";
        return;
      }
      if (boxId === "ALL") {
        const upright = list.filter(item => item.pose === "竖放").length;
        const pageMeta = (state.pageMetaByMode || {}).packing || { page: 1, totalPages: 1, pageItems: list.length };
        const pageHint = pageMeta.totalPages > 1 ? `当前页 ${pageMeta.page}/${pageMeta.totalPages}（展示 ${pageMeta.pageItems} 箱）` : "当前页展示全部外箱";
        els.cartonInfo.textContent = `共 ${list.length} 箱，竖放 ${upright} 箱；${pageHint}。`;
        return;
      }
      const item = list[0];
      els.cartonInfo.textContent = `${item.id} | ${item.spec} | 型号 ${item.models.join("+")} | ${item.pose} | ${item.palletId}`;
    }

    function applyDefaultCameraPose(mode) {
      if (mode === "packing") {
        const singleId = els.packingBoxSelect && els.packingBoxSelect.value !== "ALL" ? els.packingBoxSelect.value : "";
        if (singleId) {
          const item = displayRows.find(row => row.id === singleId) || { w: 54, h: 30, d: 34 };
          const distance = Math.max(44, Math.max(item.w, item.h, item.d) * 0.98);
          camera.position.set(0, Math.max(26, item.h * 1.15), distance);
          controls.target.set(0, Math.max(10, item.h * 0.42), 0);
        } else {
          camera.position.set(170, 126, 208);
          controls.target.set(0, 28, 0);
        }
      } else {
        camera.position.set(190, 142, 210);
        controls.target.set(0, 35, 0);
      }
      controls.update();
    }

    function buildPackingView(group) {
      const labelScale = getModelLabelScale();
      const labelMode = getLabelMode();
      const selected = els.packingBoxSelect ? els.packingBoxSelect.value : "ALL";
      const visible = selected === "ALL" ? displayRows : displayRows.filter(item => item.id === selected);
      const gapX = 95;
      const gapZ = 86;
      const maxCols = Math.max(1, Math.floor((board.width - 40) / gapX));
      const maxRows = Math.max(1, Math.floor((board.depth - 36) / gapZ));
      const pageSize = maxCols * maxRows;
      const { pageItems, meta } = paginateItems("packing", visible, pageSize);
      const cols = Math.max(1, Math.min(maxCols, Math.ceil(Math.sqrt(pageItems.length || 1))));
      const rowsCount = Math.max(1, Math.ceil((pageItems.length || 1) / cols));

      pageItems.forEach((box, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const xBase = (col - (cols - 1) / 2) * gapX;
        const zBase = (row - (rowsCount - 1) / 2) * gapZ;
        const outerY = box.h / 2 + 1;

        addBox(group, { x: xBase, y: outerY, z: zBase, w: box.w, h: box.h, d: box.d, color: 0xf08c00, opacity: 0.12 });
        createLabel(group, `${box.id}\\n${box.spec}`, xBase, outerY + box.h / 2 + 6.4, zBase, {
          scaleX: Math.min(34, 20 + 5.5 * (labelScale - 1)),
          scaleY: Math.min(10, 6.3 + 1.8 * (labelScale - 1)),
          fontSize: Math.min(28, Math.round(18 + 3 * (labelScale - 1))),
        });
        createLabel(group, `型号:${box.models.join("+")}`, xBase, outerY + box.h / 2 + 1.2, zBase - box.d * 0.33, {
          scaleX: Math.min(26, 15 + 4.5 * (labelScale - 1)),
          scaleY: Math.min(8, 4.2 + 1.4 * (labelScale - 1)),
          fontSize: Math.min(22, Math.round(14 + 3 * (labelScale - 1))),
          bg: "rgba(15, 23, 42, 0.78)",
        });

        const innerCols = Number((box.grid || {}).cols || 3);
        const innerRows = Number((box.grid || {}).rows || 2);
        const layers = Number((box.grid || {}).layers || 2);
        const innerW = (box.w - 8) / innerCols;
        const innerD = (box.d - 8) / innerRows;
        const innerH = (box.h - 8) / layers;
        let modelIdx = 0;
        for (let ly = 0; ly < layers; ly += 1) {
          for (let rz = 0; rz < innerRows; rz += 1) {
            for (let cx = 0; cx < innerCols; cx += 1) {
              const model = box.pattern[modelIdx % box.pattern.length];
              modelIdx += 1;
              const x = xBase - box.w / 2 + 4 + innerW / 2 + cx * innerW;
              const y = 4 + innerH / 2 + ly * innerH;
              const z = zBase - box.d / 2 + 4 + innerD / 2 + rz * innerD;
              addBox(group, {
                x, y, z,
                w: Math.max(innerW - 1.2, 5),
                h: Math.max(innerH - 1.2, 5),
                d: Math.max(innerD - 1.2, 5),
                color: modelColors[model] || 0x94a3b8,
              });
              const isTopLayer = ly === layers - 1;
              const showLabel = labelMode === "all"
                ? true
                : labelMode === "top"
                  ? isTopLayer
                  : (pageItems.length === 1 ? isTopLayer : (isTopLayer && rz === 0 && cx % 2 === 0));
              if (showLabel) {
                createLabel(group, model, x, y + innerH / 2 + 2.2, z, {
                  scaleX: 8.8 * labelScale,
                  scaleY: 2.9 * labelScale,
                  fontSize: Math.round(15 * labelScale),
                  bg: "rgba(15, 23, 42, 0.78)",
                  renderOrder: 30,
                });
              }
            }
          }
        }
      });
      return meta;
    }

    function buildPalletView(group) {
      const labelScale = getModelLabelScale();
      const labelMode = getLabelMode();
      const selectedPallet = els.palletSelect ? els.palletSelect.value : "ALL";
      const palletIds = uniqueSorted(displayRows.map(item => item.palletId));
      const visiblePallets = selectedPallet === "ALL" ? palletIds : palletIds.filter(item => item === selectedPallet);

      const palletBaseSpec = new Map();
      visiblePallets.forEach(palletId => {
        const palletBoxes = displayRows.filter(item => item.palletId === palletId);
        const palletSpec = palletBoxes[0] ? String(palletBoxes[0].palletSpec || "116*116*103") : "116*116*103";
        const usableSpec = palletBoxes[0] ? String(palletBoxes[0].usableSpec || palletSpec) : palletSpec;
        const [palletW, palletD, palletTotalH] = parseSpecNumbers(palletSpec, [116, 116, 103]);
        const [, , usableH] = parseSpecNumbers(usableSpec, [Math.max(1, palletW - 8), Math.max(1, palletD - 8), 90]);
        const baseH = Math.max(8, Math.min(24, Number(palletTotalH || 0) - Number(usableH || 0) || 12));
        palletBaseSpec.set(palletId, { palletW, palletD, baseH });
      });
      const maxPalletW = Math.max(116, ...[...palletBaseSpec.values()].map(item => Number(item.palletW || 0)));
      const maxPalletD = Math.max(116, ...[...palletBaseSpec.values()].map(item => Number(item.palletD || 0)));
      // 多托盘场景仅在托盘间保留少量距离，托盘内箱体不加缝隙
      const palletGapX = Math.max(maxPalletW + 22, 160);
      const palletGapZ = Math.max(maxPalletD + 22, 150);
      const maxCols = Math.max(1, Math.floor((board.width - 24) / palletGapX));
      const maxRows = Math.max(1, Math.floor((board.depth - 24) / palletGapZ));
      const pageSize = maxCols * maxRows;
      const { pageItems: pagePallets, meta } = paginateItems("pallet", visiblePallets, pageSize);

      const colsPerPage = Math.max(1, Math.min(maxCols, pagePallets.length || 1));
      const rowsPerPage = Math.max(1, Math.ceil((pagePallets.length || 1) / colsPerPage));

      pagePallets.forEach((palletId, displayIndex) => {
        const gridCol = displayIndex % colsPerPage;
        const gridRow = Math.floor(displayIndex / colsPerPage);
        const xOffset = (gridCol - (colsPerPage - 1) / 2) * palletGapX;
        const zOffset = (gridRow - (rowsPerPage - 1) / 2) * palletGapZ;
        const palletBoxes = displayRows
          .filter(item => item.palletId === palletId)
          .sort((a, b) => Number(a.rowSeq || 0) - Number(b.rowSeq || 0));
        const base = palletBaseSpec.get(palletId) || { palletW: 116, palletD: 116, baseH: 12 };
        const palletW = Number(base.palletW || 116);
        const palletD = Number(base.palletD || 116);
        const palletH = Number(base.baseH || 12);

        addBox(group, { x: xOffset, y: palletH / 2, z: zOffset, w: palletW, h: palletH, d: palletD, color: 0x8d5524 });
        createLabel(group, `${palletId}\\n${palletBoxes.length}箱`, xOffset, palletH + 7.5, zOffset - (palletD / 2 + 10), { scaleX: 18, scaleY: 6, fontSize: 20 });
        createLabel(group, "蓝色=平放  橙色=竖放（等比例尺寸）", xOffset, palletH + 7.5, zOffset + (palletD / 2 + 10), { scaleX: 30, scaleY: 5, fontSize: 17, bg: "rgba(30, 41, 59, 0.82)" });

        if (!palletBoxes.length) return;

        const displayBoxes = palletBoxes.map(item => {
          const isUpright = item.pose === "竖放";
          // 竖放时将最长边作为高度，保持三边比例关系
          const uprightDims = { w: Number(item.d || 1), d: Number(item.h || 1), h: Number(item.w || 1) };
          const flatDims = { w: Number(item.w || 1), d: Number(item.d || 1), h: Number(item.h || 1) };
          const dims = isUpright ? uprightDims : flatDims;
          return {
            ...item,
            isUpright,
            w: Math.max(1, dims.w),
            d: Math.max(1, dims.d),
            h: Math.max(1, dims.h),
            color: isUpright ? 0xfb923c : 0x60a5fa,
          };
        });
        // 竖放箱体集中排布，避免在每层/每行随机分散
        const orderedBoxes = displayBoxes
          .filter(item => !item.isUpright)
          .concat(displayBoxes.filter(item => item.isUpright));

        // 采用紧密排布：同层内箱体之间不留额外间距；放不下时换行/换层
        const left = -palletW / 2;
        const near = -palletD / 2;
        let cursorX = left;
        let cursorZ = near;
        let rowDepth = 0;
        let layerMaxH = 0;
        let baseY = palletH;

        orderedBoxes.forEach((box, idx) => {
          if (cursorX + box.w > left + palletW + 0.0001) {
            cursorX = left;
            cursorZ += rowDepth;
            rowDepth = 0;
          }
          if (cursorZ + box.d > near + palletD + 0.0001) {
            cursorX = left;
            cursorZ = near;
            baseY += layerMaxH;
            rowDepth = 0;
            layerMaxH = 0;
          }

          const x = xOffset + cursorX + box.w / 2;
          const z = zOffset + cursorZ + box.d / 2;
          const y = baseY + box.h / 2;
          addBox(group, { x, y, z, w: box.w, h: box.h, d: box.d, color: box.color });
          if (box.isUpright) {
            addBox(group, {
              x,
              y: y + box.h / 2 + 0.9,
              z,
              w: Math.max(2.8, box.w * 0.22),
              h: 0.9,
              d: Math.max(2.8, box.d * 0.22),
              color: 0xdc2626,
              opacity: 0.95,
            });
          }
          const showTopByNeighbor = idx === orderedBoxes.length - 1 || (orderedBoxes[idx + 1] && orderedBoxes[idx + 1].h <= box.h);
          const isTopLayer = showTopByNeighbor;
          const showLabel = labelMode === "all"
            ? true
            : labelMode === "top"
              ? isTopLayer
              : (isTopLayer && idx % 2 === 0);
          if (showLabel) {
            createLabel(group, `${box.models.join("+")}${box.isUpright ? "\\n竖放" : ""}`, x, y + box.h / 2 + 4.6, z, {
              scaleX: 10.5 * labelScale,
              scaleY: 3.2 * labelScale,
              fontSize: Math.round(14 * labelScale),
              bg: box.isUpright ? "rgba(185, 28, 28, 0.86)" : "rgba(30, 41, 59, 0.78)",
              border: box.isUpright ? "rgba(252, 165, 165, 0.92)" : "rgba(148, 163, 184, 0.75)",
            });
          }
          cursorX += box.w;
          rowDepth = Math.max(rowDepth, box.d);
          layerMaxH = Math.max(layerMaxH, box.h);
        });
      });
      return meta;
    }

    function setFilterState(mode) {
      if (!els.packingBoxSelect || !els.palletSelect) return;
      const showPacking = mode === "packing";
      els.packingBoxSelect.disabled = !showPacking;
      els.palletSelect.disabled = showPacking;
    }

    function setViewMode(mode) {
      if (sceneGroup) scene.remove(sceneGroup);
      state.currentMode = mode;
      sceneGroup = new THREE.Group();
      let pageMeta = { page: 1, totalPages: 1, totalItems: 0, pageItems: 0 };
      if (mode === "packing") {
        pageMeta = buildPackingView(sceneGroup) || pageMeta;
        const pageHint = pageMeta.totalPages > 1 ? `（第 ${pageMeta.page}/${pageMeta.totalPages} 页）` : "";
        els.sceneMeta.textContent = `当前：装箱视图（显示外箱编号+规格；外箱内显示型号）${pageHint}`;
        els.viewPackingBtn.classList.add("primary");
        els.viewPalletBtn.classList.remove("primary");
      } else {
        pageMeta = buildPalletView(sceneGroup) || pageMeta;
        const pageHint = pageMeta.totalPages > 1 ? `（第 ${pageMeta.page}/${pageMeta.totalPages} 页）` : "";
        els.sceneMeta.textContent = `当前：装托视图（竖放外箱橙色+红色标识突出显示）${pageHint}`;
        els.viewPalletBtn.classList.add("primary");
        els.viewPackingBtn.classList.remove("primary");
      }
      setFilterState(mode);
      updateViewerPager(mode);
      scene.add(sceneGroup);
      applyDefaultCameraPose(mode);
      updateCartonInfo();
    }

    function resize() {
      const width = els.viewer.clientWidth;
      const height = els.viewer.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }

    function animate() {
      renderer.setAnimationLoop(() => {
        controls.update();
        renderer.render(scene, camera);
      });
    }

    const allBoxIds = uniqueSorted(displayRows.map(item => item.id));
    const allPalletIds = uniqueSorted(displayRows.map(item => item.palletId));
    populateSelect(els.packingBoxSelect, allBoxIds, "全部外箱");
    populateSelect(els.palletSelect, allPalletIds, "全部托盘");
    ensureLabelScaleOption4x();

    const removeListeners = [];
    const bind = (el, event, handler) => {
      if (!el) return;
      el.addEventListener(event, handler);
      removeListeners.push(() => el.removeEventListener(event, handler));
    };

    bind(els.packingBoxSelect, "change", () => {
      state.pageByMode.packing = 1;
      if (state.currentMode === "packing") setViewMode("packing");
      updateCartonInfo();
    });
    bind(els.palletSelect, "change", () => {
      state.pageByMode.pallet = 1;
      if (state.currentMode === "pallet") setViewMode("pallet");
    });
    bind(els.viewerPrevBtn, "click", () => {
      const mode = state.currentMode || "pallet";
      const current = Number((state.pageByMode || {})[mode] || 1);
      if (current <= 1) return;
      state.pageByMode[mode] = current - 1;
      setViewMode(mode);
    });
    bind(els.viewerNextBtn, "click", () => {
      const mode = state.currentMode || "pallet";
      const meta = (state.pageMetaByMode || {})[mode] || { totalPages: 1 };
      const current = Number((state.pageByMode || {})[mode] || 1);
      if (current >= Number(meta.totalPages || 1)) return;
      state.pageByMode[mode] = current + 1;
      setViewMode(mode);
    });
    bind(els.labelScaleSelect, "change", () => setViewMode(state.currentMode));
    bind(els.labelModeSelect, "change", () => setViewMode(state.currentMode));
    bind(els.viewer, "dblclick", () => applyDefaultCameraPose(state.currentMode));

    function updateQuickScaleButtons() {
      const quickBtns = els.viewer.parentElement ? els.viewer.parentElement.querySelectorAll(".quick-scale-btn") : [];
      const current = getModelLabelScale();
      quickBtns.forEach(btn => {
        const action = btn.getAttribute("data-action");
        btn.classList.toggle("active", (action === "reset" && current === 2) || (action === "max" && current >= 4));
      });
    }

    function setLabelScale(value) {
      if (!els.labelScaleSelect) return;
      els.labelScaleSelect.value = String(value);
      setViewMode(state.currentMode);
      updateQuickScaleButtons();
    }

    function bumpLabelScale(step) {
      const current = getModelLabelScale();
      const index = labelScaleSteps.findIndex(item => item === current);
      const fallback = index >= 0 ? index : 0;
      const next = Math.max(0, Math.min(labelScaleSteps.length - 1, fallback + step));
      setLabelScale(labelScaleSteps[next]);
    }

    function injectQuickScaleControls() {
      if (!els.labelScaleSelect || !els.labelScaleSelect.parentElement) return;
      if (els.labelScaleSelect.parentElement.querySelector(".quick-scale-row")) return;
      const row = document.createElement("div");
      row.className = "quick-scale-row";
      row.innerHTML = `
        <button type="button" class="quick-scale-btn" data-action="minus">字号-</button>
        <button type="button" class="quick-scale-btn" data-action="plus">字号+</button>
        <button type="button" class="quick-scale-btn" data-action="max">4x</button>
        <button type="button" class="quick-scale-btn" data-action="reset">2x</button>
      `;
      row.addEventListener("click", event => {
        const btn = event.target.closest(".quick-scale-btn");
        if (!btn) return;
        const action = btn.getAttribute("data-action");
        if (action === "minus") bumpLabelScale(-1);
        if (action === "plus") bumpLabelScale(1);
        if (action === "max") setLabelScale(4);
        if (action === "reset") setLabelScale(2);
      });
      els.labelScaleSelect.insertAdjacentElement("afterend", row);
      updateQuickScaleButtons();
    }

    function onKeyDown(event) {
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        bumpLabelScale(1);
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        bumpLabelScale(-1);
      }
    }

    bind(window, "resize", resize);
    bind(window, "keydown", onKeyDown);
    injectQuickScaleControls();
    resize();
    setViewMode(state.currentMode);
    animate();

    return {
      destroy() {
        renderer.setAnimationLoop(null);
        removeListeners.forEach(fn => fn());
        if (renderer && renderer.dispose) renderer.dispose();
        if (els.viewer) els.viewer.innerHTML = "";
      },
      rerender(mode) {
        setViewMode(mode || state.currentMode);
      },
    };
  }

  function rerenderContent() {
    state.pageByMode.packing = 1;
    state.pageByMode.pallet = 1;
    const filteredRows = getFilteredRows();
    renderKpis(filteredRows);
    renderPlanTable(filteredRows);
    renderSolutions();
    renderOrders();
    renderMetricScopeSwitch();
    renderMetrics(filteredRows);

    const allBoxIds = uniqueSorted(filteredRows.map(item => item.id));
    const allPalletIds = uniqueSorted(filteredRows.map(item => item.palletId));
    populateSelect(els.packingBoxSelect, allBoxIds, "全部外箱");
    populateSelect(els.palletSelect, allPalletIds, "全部托盘");

    if (state.viewerApi) {
      state.viewerApi.destroy();
      state.viewerApi = null;
    }
    state.viewerApi = createViewer(filteredRows);
  }

  async function initDataAndRender() {
    const planId = getPlanIdFromUrl();
    state.planId = /^\d+$/.test(String(planId || "")) ? Number(planId) : null;
    const apiCtx = await loadApiContext(planId);
    if (apiCtx) {
      state.apiMode = true;
      state.availablePlans = apiCtx.availablePlans;
      state.plan = apiCtx.plan;
      state.baseRows = apiCtx.rows;
    } else {
      state.apiMode = false;
      state.dataset = PACKING_DEMO.getCurrentDataset();
      state.datasetKey = PACKING_DEMO.getCurrentDatasetKey();
      state.plan = PACKING_DEMO.getPlanById(state.dataset, planId);
      state.baseRows = buildRowsFromPlan(state.plan);
      state.availablePlans = (state.dataset.plans || []).map(item => ({
        id: String(item.id),
        customerId: String(item.customerId || "-"),
        shipDate: String(item.shipDate || "-"),
      }));
    }
    if (state.solutionIndex > 2) state.solutionIndex = 1;
    state.rows = projectRowsBySolution(state.baseRows, state.solutionIndex);

    renderDatasetSwitch();
    renderPlanSelect();
    renderHeader();
    await loadMissingData();
    renderTopFilters();
    rerenderContent();
  }

  [els.modelFilter, els.specFilter, els.cartonFilter].forEach(el => {
    if (!el) return;
    el.addEventListener("change", rerenderContent);
    el.addEventListener("input", rerenderContent);
  });

  if (els.reset3dFilters) {
    els.reset3dFilters.addEventListener("click", () => {
      if (els.modelFilter) els.modelFilter.value = "";
      if (els.specFilter) els.specFilter.value = "";
      if (els.cartonFilter) els.cartonFilter.value = "";
      if (els.packingBoxSelect) els.packingBoxSelect.value = "ALL";
      if (els.palletSelect) els.palletSelect.value = "ALL";
      if (els.labelScaleSelect) els.labelScaleSelect.value = "2";
      if (els.labelModeSelect) els.labelModeSelect.value = "sparse";
      state.currentMode = "pallet";
      state.pageByMode.packing = 1;
      state.pageByMode.pallet = 1;
      rerenderContent();
      showToast("3D 筛选已重置");
    });
  }

  if (els.viewPackingBtn) {
    els.viewPackingBtn.addEventListener("click", () => {
      state.currentMode = "packing";
      if (state.viewerApi) state.viewerApi.rerender("packing");
    });
  }

  if (els.viewPalletBtn) {
    els.viewPalletBtn.addEventListener("click", () => {
      state.currentMode = "pallet";
      if (state.viewerApi) state.viewerApi.rerender("pallet");
    });
  }

  if (els.saveMissingDataBtn) {
    els.saveMissingDataBtn.addEventListener("click", saveMissingDataAndRecalculate);
  }

  initDataAndRender();
})();
