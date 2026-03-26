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

  function parseSpecToDims(specText) {
    const parts = String(specText || "")
      .split("*")
      .map(item => Number(String(item).trim()))
      .filter(item => Number.isFinite(item) && item > 0);
    const [w, d, h] = parts.length === 3 ? parts : [56, 38, 29];
    return { w: Math.max(16, Math.round(w * 0.9)), d: Math.max(14, Math.round(d * 0.9)), h: Math.max(12, Math.round(h * 0.85)) };
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
      return {
        id: String(box.carton_id || `CARTON-${idx + 1}`),
        orderNo: String(box.order_no || "-"),
        palletId: String(box.pallet_id || `PALLET-${String((box.pallet_seq || 0) + 1).padStart(2, "0")}`),
        slotC: Number((box.row_seq || 0) % 4),
        slotR: Number(Math.floor(Number(box.row_seq || 0) / 4)),
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
        pose: String(box.pose || "").toLowerCase() === "vertical" ? "竖放" : "平放",
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
      els.datasetSwitch.innerHTML = '<button class="ghost" type="button">瀹炴椂鏁版嵁妯″紡</button>';
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
        showToast(`宸插垏鎹㈠埌鏁版嵁闆?${key}`);
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
    if (els.detailTitle) els.detailTitle.textContent = `浠诲姟璇︽儏 - ${state.plan.id}`;
    if (els.detailSub) {
      els.detailSub.textContent = [
        `瀹㈡埛 ${state.plan.customerId}`,
        `鍙戣揣鏃ユ湡 ${state.plan.shipDate}`,
        `瑁呯瑕佹眰 ${state.plan.mode}`,
        `鐘舵€?${state.plan.status}`,
      ].join(" 锝?");
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
      els.missingDataMeta.textContent = `缂哄皯 ${missingDetails.length} 涓瀷鍙疯鍒欙紝琛ュ綍鍚庡彲鐩存帴閲嶆柊璁＄畻`;
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
              <td><input class="missing-row-input" data-field="inner_box_spec" value="${escapeHtml(manual.inner_box_spec || "")}" placeholder="渚嬪 105" /></td>
              <td><input class="missing-row-input" data-field="qty_per_carton" type="number" min="1" step="1" value="${escapeHtml(manual.qty_per_carton || "")}" /></td>
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
      showToast(`缂哄皯鏁版嵁鍔犺浇澶辫触锛?{err.message}`);
    }
  }

  function collectMissingDataForm() {
    if (!els.missingDataBody) return [];
    const rows = [...els.missingDataBody.querySelectorAll("tr[data-model-code]")];
    return rows
      .map(row => {
        const modelCode = String(row.getAttribute("data-model-code") || "").trim();
        const innerBoxSpec = String((row.querySelector('[data-field="inner_box_spec"]') || {}).value || "").trim();
        const qtyPerCarton = String((row.querySelector('[data-field="qty_per_carton"]') || {}).value || "").trim();
        const grossWeight = String((row.querySelector('[data-field="gross_weight_kg"]') || {}).value || "").trim();
        const note = String((row.querySelector('[data-field="note"]') || {}).value || "").trim();
        if (!modelCode || !innerBoxSpec) return null;
        return {
          model_code: modelCode,
          inner_box_spec: innerBoxSpec,
          qty_per_carton: qtyPerCarton || null,
          gross_weight_kg: grossWeight || null,
          note: note || null,
        };
      })
      .filter(Boolean);
  }

  async function saveMissingDataAndRecalculate() {
    const rules = collectMissingDataForm();
    if (!rules.length) {
      showToast("璇峰厛琛ュ綍鍐呯洅缂栧彿鍚庡啀淇濆瓨");
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

    els.modelFilter.innerHTML = ['<option value="">鍏ㄩ儴鍨嬪彿</option>']
      .concat(modelOptions.map(item => `<option value="${item}">${item}</option>`))
      .join("");
    els.specFilter.innerHTML = ['<option value="">鍏ㄩ儴瑙勬牸</option>']
      .concat(specOptions.map(item => `<option value="${item}">${item}</option>`))
      .join("");
    els.cartonFilter.innerHTML = ['<option value="">鍏ㄩ儴澶栫</option>']
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
      { label: "澶栫鎬绘暟", value: String(rows.length) },
      { label: "鎵樼洏鎬绘暟", value: String(palletCount) },
      { label: "竖放外箱", value: String(uprightCount) },
      { label: "璁″垝琛屾暟", value: String((state.plan.kpis || {}).lineCount || rows.length) },
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
        remark: parts > 1 ? "鎷肩" : "-",
      }));
    });
    const orderMap = groupBy(packingLines, line => line.orderNo);
    const totalQty = packingLines.reduce((sum, item) => sum + Number(item.qty || 0), 0);
    const totalWeight = packingLines.reduce((sum, item) => sum + Number(item.grossWeight || 0), 0);

    const packingTable = `
      <div class="plan-table-block">
        <div class="plan-table-head">
          <h4>瑁呯鏄庣粏</h4>
          <p>鏍煎紡瀵归綈瀵煎嚭妯℃澘锛氳鍗?鍨嬪彿/鏁伴噺/鍐呯洅/澶栫/瑙勬牸/姣涢噸/澶囨敞</p>
        </div>
        <div class="plan-table-scroll">
          <table>
            <thead>
              <tr>
                <th>璁㈠崟鍙?/th><th>鍨嬪彿</th><th>鏁伴噺</th><th>鍐呯洅</th><th>澶栫缂栧彿</th><th>澶栫瑙勬牸(cm)</th><th>姣涢噸(kg)</th><th>澶囨敞</th>
              </tr>
            </thead>
            <tbody>
              ${[...orderMap.entries()].map(([orderNo, lineRows]) => `
                <tr><td colspan="8" style="background:#eef2ff;color:#334155;font-weight:700;">璁㈠崟锛?{orderNo}</td></tr>
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
                <tr><td colspan="8" style="background:#f8fbff;color:#1e3a8a;font-weight:700;">璁㈠崟姹囨€伙細鎬讳欢鏁?${lineRows.reduce((sum, row) => sum + Number(row.qty || 0), 0)}锛屾€绘瘺閲?${lineRows.reduce((sum, row) => sum + Number(row.grossWeight || 0), 0).toFixed(1)} kg</td></tr>
              `).join("")}
              <tr><td colspan="8" style="background:#e0f2fe;color:#0c4a6e;font-weight:800;">瑁呯鎬绘眹鎬伙細璁㈠崟 ${orderMap.size} 绗旓紝澶栫 ${new Set(rows.map(item => item.id)).size} 绠憋紝鎬讳欢鏁?${totalQty}锛屾€绘瘺閲?${totalWeight.toFixed(1)} kg</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `;

    const palletRows = [...byPallet.entries()].map(([palletId, list]) => {
      const specs = uniqueSorted(list.map(item => item.spec)).join(" / ");
      const models = uniqueSorted(list.flatMap(item => item.models)).join("+");
      const hasUpright = list.some(item => item.pose === "竖放");
      return `
        <tr>
          <td>${palletId}</td>
          <td>${list.length}</td>
          <td>${specs}</td>
          <td>${models}</td>
          <td>${hasUpright ? "平放+竖放" : "平放"}</td>
        </tr>
      `;
    }).join("");

    const palletTable = `
      <div class="plan-table-block">
        <div class="plan-table-head">
          <h4>瑁呮墭姹囨€?/h4>
          <p>竖放箱高亮展示</p>
        </div>
        <div class="plan-table-scroll">
          <table>
            <thead>
              <tr>
                <th>鎵樼洏缂栧彿</th><th>澶栫鏁?/th><th>澶栫瑙勬牸</th><th>鍨嬪彿闆嗗悎</th><th>鎽嗘斁</th>
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
          <p>澶栫 ${item.boxCount} 绠憋綔鎵樼洏 ${item.palletCount} 鎵?/p>
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
        showToast(`宸插垏鎹㈠埌${(state.plan.solutions[idx] || {}).name || "鐩爣"}鏂规`);
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
      <button class="${state.metricScope === "plan" ? "primary" : "ghost"}" data-scope="plan">璁″垝鍙ｅ緞</button>
      <button class="${state.metricScope === "filtered" ? "primary" : "ghost"}" data-scope="filtered">绛涢€夊彛寰?/button>
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

    const maxViewerRows = 260;
    const displayRows = rows.length > maxViewerRows
      ? rows.filter((_, idx) => idx % Math.ceil(rows.length / maxViewerRows) === 0)
      : rows;

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
        els.cartonInfo.textContent = `共 ${list.length} 箱，竖放 ${upright} 箱；可切换“装箱筛选（单箱）”查看明细。`;
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
      const cols = visible.length === 1 ? 1 : 2;
      const gapX = 95;
      const gapZ = 86;

      visible.forEach((box, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const xBase = (col - (cols - 1) / 2) * gapX;
        const zBase = (row - (Math.ceil(visible.length / cols) - 1) / 2) * gapZ;
        const outerY = box.h / 2 + 1;

        addBox(group, { x: xBase, y: outerY, z: zBase, w: box.w, h: box.h, d: box.d, color: 0xf08c00, opacity: 0.12 });
        createLabel(group, `${box.id}\\n${box.spec}`, xBase, outerY + box.h / 2 + 6.4, zBase, {
          scaleX: Math.min(34, 20 + 5.5 * (labelScale - 1)),
          scaleY: Math.min(10, 6.3 + 1.8 * (labelScale - 1)),
          fontSize: Math.min(28, Math.round(18 + 3 * (labelScale - 1))),
        });
        createLabel(group, `鍨嬪彿:${box.models.join("+")}`, xBase, outerY + box.h / 2 + 1.2, zBase - box.d * 0.33, {
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
                  : (visible.length === 1 ? isTopLayer : (isTopLayer && rz === 0 && cx % 2 === 0));
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
    }

    function buildPalletView(group) {
      const labelScale = getModelLabelScale();
      const labelMode = getLabelMode();
      const selectedPallet = els.palletSelect ? els.palletSelect.value : "ALL";
      const palletIds = uniqueSorted(displayRows.map(item => item.palletId));
      const visiblePallets = selectedPallet === "ALL" ? palletIds : palletIds.filter(item => item === selectedPallet);
      const palletGap = 185;
      const layerPatterns = [
        ["F", "F", "U", "F", "F", "F", "F", "U", "F", "F", "F", "F", "F", "U", "F", "F"],
        ["F", "U", "F", "F", "F", "F", "F", "F", "U", "F", "F", "F", "F", "F", "U", "F"],
        ["F", "F", "F", "U", "F", "F", "U", "F", "F", "F", "F", "F", "U", "F", "F", "F"],
        ["U", "F", "F", "F", "F", "U", "F", "F", "F", "F", "F", "U", "F", "F", "F", "F"],
      ];

      visiblePallets.forEach((palletId, displayIndex) => {
        const xOffset = visiblePallets.length === 1 ? 0 : (displayIndex - (visiblePallets.length - 1) / 2) * palletGap;
        const palletBoxes = displayRows.filter(item => item.palletId === palletId);
        const toFlatDisplaySize = item => ({
          w: Math.max(12, Math.min(23, Math.round(item.w * 0.45))),
          d: Math.max(10, Math.min(21, Math.round(item.d * 0.43))),
          h: Math.max(10, Math.min(16, Math.round(item.h * 0.4))),
        });
        const toUprightDisplaySize = item => ({
          w: Math.max(10, Math.min(18, Math.round(item.w * 0.34))),
          d: Math.max(9, Math.min(15, Math.round(item.d * 0.33))),
          h: Math.max(14, Math.min(24, Math.round(item.h * 0.95))),
        });
        const flatCatalog = palletBoxes
          .filter(item => item.pose !== "竖放")
          .map(item => ({
            ...toFlatDisplaySize(item),
            models: item.models,
            color: 0x60a5fa,
          }));
        const uprightCatalog = palletBoxes
          .filter(item => item.pose === "竖放")
          .map(item => ({
            ...toUprightDisplaySize(item),
            models: item.models,
            color: 0xfb923c,
          }));
        if (!flatCatalog.length && palletBoxes.length) {
          const fallback = palletBoxes[0];
          flatCatalog.push({
            ...toFlatDisplaySize(fallback),
            models: fallback.models,
            color: 0x60a5fa,
          });
        }
        if (!uprightCatalog.length && palletBoxes.length) {
          const fallback = palletBoxes[0];
          uprightCatalog.push({
            ...toUprightDisplaySize(fallback),
            models: fallback.models,
            color: 0xfb923c,
          });
        }

        addBox(group, { x: xOffset, y: 6, z: 0, w: 122, h: 12, d: 110, color: 0x8d5524 });
        createLabel(group, `${palletId}\\n${palletBoxes.length}箱`, xOffset, 16, -66, { scaleX: 18, scaleY: 6, fontSize: 20 });
        createLabel(group, "蓝色=平放  橙色=竖放", xOffset, 16, 66, { scaleX: 24, scaleY: 5, fontSize: 18, bg: "rgba(30, 41, 59, 0.82)" });

        const cols = 4;
        const rowsCount = 4;
        const stepX = 27;
        const stepZ = 24;
        const startX = xOffset - ((cols - 1) * stepX) / 2;
        const startZ = -((rowsCount - 1) * stepZ) / 2;
        let flatIdx = displayIndex;
        let uprightIdx = displayIndex;
        let baseY = 12;

        for (let layer = 0; layer < layerPatterns.length; layer += 1) {
          const pattern = layerPatterns[layer];
          let maxLayerH = 0;
          for (let row = 0; row < rowsCount; row += 1) {
            for (let col = 0; col < cols; col += 1) {
              const cellIdx = row * cols + col;
              const isUpright = pattern[cellIdx] === "U";
              const box = isUpright
                ? uprightCatalog[uprightIdx++ % uprightCatalog.length]
                : flatCatalog[flatIdx++ % flatCatalog.length];
              const x = startX + col * stepX;
              const z = startZ + row * stepZ;
              const y = baseY + box.h / 2 + 1;
              maxLayerH = Math.max(maxLayerH, box.h);

              addBox(group, { x, y, z, w: box.w, h: box.h, d: box.d, color: box.color });
              if (isUpright) {
                addBox(group, {
                  x,
                  y: y + box.h / 2 + 1.2,
                  z,
                  w: Math.max(6, box.w * 0.32),
                  h: 1.2,
                  d: Math.max(6, box.d * 0.32),
                  color: 0xdc2626,
                  opacity: 0.95,
                });
              }
              const isTopLayer = layer === layerPatterns.length - 1;
              const showLabel = labelMode === "all"
                ? true
                : labelMode === "top"
                  ? isTopLayer
                  : (isTopLayer && row % 2 === 0 && col % 2 === 0);
              if (showLabel) {
                createLabel(group, `${box.models.join("+")}${isUpright ? "\\n竖放" : ""}`, x, y + box.h / 2 + 4.6, z, {
                  scaleX: 10.5 * labelScale,
                  scaleY: 3.2 * labelScale,
                  fontSize: Math.round(14 * labelScale),
                  bg: isUpright ? "rgba(185, 28, 28, 0.86)" : "rgba(30, 41, 59, 0.78)",
                  border: isUpright ? "rgba(252, 165, 165, 0.92)" : "rgba(148, 163, 184, 0.75)",
                });
              }
            }
          }
          baseY += maxLayerH + 1.5;
        }
      });
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
      const sampledHint = displayRows.length < rows.length
        ? `（3D为保证流畅仅展示 ${displayRows.length}/${rows.length} 箱）`
        : "";
      if (mode === "packing") {
        buildPackingView(sceneGroup);
        els.sceneMeta.textContent = `当前：装箱视图（显示外箱编号+规格；外箱内显示型号）${sampledHint}`;
        els.viewPackingBtn.classList.add("primary");
        els.viewPalletBtn.classList.remove("primary");
      } else {
        buildPalletView(sceneGroup);
        els.sceneMeta.textContent = `当前：装托视图（竖放外箱橙色+红色标识突出显示）${sampledHint}`;
        els.viewPalletBtn.classList.add("primary");
        els.viewPackingBtn.classList.remove("primary");
      }
      setFilterState(mode);
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
    populateSelect(els.packingBoxSelect, allBoxIds, "鍏ㄩ儴澶栫");
    populateSelect(els.palletSelect, allPalletIds, "鍏ㄩ儴鎵樼洏");
    ensureLabelScaleOption4x();

    const removeListeners = [];
    const bind = (el, event, handler) => {
      if (!el) return;
      el.addEventListener(event, handler);
      removeListeners.push(() => el.removeEventListener(event, handler));
    };

    bind(els.packingBoxSelect, "change", () => {
      if (state.currentMode === "packing") setViewMode("packing");
      updateCartonInfo();
    });
    bind(els.palletSelect, "change", () => {
      if (state.currentMode === "pallet") setViewMode("pallet");
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
        <button type="button" class="quick-scale-btn" data-action="minus">瀛楀彿-</button>
        <button type="button" class="quick-scale-btn" data-action="plus">瀛楀彿+</button>
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
    const filteredRows = getFilteredRows();
    renderKpis(filteredRows);
    renderPlanTable(filteredRows);
    renderSolutions();
    renderOrders();
    renderMetricScopeSwitch();
    renderMetrics(filteredRows);

    const allBoxIds = uniqueSorted(filteredRows.map(item => item.id));
    const allPalletIds = uniqueSorted(filteredRows.map(item => item.palletId));
    populateSelect(els.packingBoxSelect, allBoxIds, "鍏ㄩ儴澶栫");
    populateSelect(els.palletSelect, allPalletIds, "鍏ㄩ儴鎵樼洏");

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
      rerenderContent();
      showToast("3D 绛涢€夊凡閲嶇疆");
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
