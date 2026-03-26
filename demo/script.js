const demoData = {
  kpis: [
    { label: "订单总行数", value: "268" },
    { label: "外箱总数", value: "132" },
    { label: "托盘总数", value: "11" },
    { label: "总毛重", value: "9,460 kg" }
  ],
  customer: {
    "客户编号": "CUST-6002",
    "客户名称": "美国 BBB",
    "装箱要求": "合并",
    "客户地址": "Los Angeles, CA",
    "内盒类型": "我司彩盒",
    "内盒提供方": "我司",
    "特定内盒要求": "104->111, 105->111",
    "生效状态": "启用"
  },
  plans: [
    { ref: "405398 + 405228 + 420867", mode: "合并", status: "待确认" },
    { ref: "405512 + 405601", mode: "不合并", status: "已确认" },
    { ref: "405790", mode: "合并", status: "草稿" }
  ],
  solutions: [
    {
      name: "保守方案",
      tag: "低复杂度",
      boxCount: 138,
      palletCount: 12,
      weight: "9,610 kg",
      note: "执行简单，优先同规格装箱装托。"
    },
    {
      name: "均衡方案",
      tag: "推荐",
      boxCount: 132,
      palletCount: 11,
      weight: "9,460 kg",
      note: "箱数与复杂度平衡，适配当前客户规则。"
    },
    {
      name: "极致省箱",
      tag: "最省箱托",
      boxCount: 127,
      palletCount: 10,
      weight: "9,430 kg",
      note: "拼箱拼托更多，复核要求更高。"
    }
  ],
  modelBoxes: [
    { model: "405398", inner: "104*2", weight: "2.1", perCase: "40" },
    { model: "405228", inner: "105", weight: "2.4", perCase: "36" },
    { model: "420867", inner: "111", weight: "2.9", perCase: "24" },
    { model: "406010", inner: "102", weight: "1.7", perCase: "48" }
  ],
  innerOuter: [
    { inner: "104", outer: "56*38*29", total: "40", pallet: "116*116*103" },
    { inner: "105", outer: "54*36*28", total: "36", pallet: "116*116*103" },
    { inner: "111", outer: "58*40*31", total: "24", pallet: "116*80*103" },
    { inner: "102", outer: "50*35*27", total: "48", pallet: "114*114*103" }
  ]
};

let outputTemplateRows = [
  { orderNo: "405398+405228+420867", model: "405398", qty: 80, inner: "104*2", cartonId: "CARTON-001", cartonSpec: "56*38*29", palletId: "PALLET-01", pose: "平放", grossWeight: 46.8 },
  { orderNo: "405398+405228+420867", model: "405228", qty: 72, inner: "105", cartonId: "CARTON-001", cartonSpec: "56*38*29", palletId: "PALLET-01", pose: "平放", grossWeight: 44.2 },
  { orderNo: "405398+405228+420867", model: "420867", qty: 48, inner: "111", cartonId: "CARTON-002", cartonSpec: "58*40*31", palletId: "PALLET-01", pose: "平放", grossWeight: 49.5 },
  { orderNo: "405398+405228+420867", model: "406010", qty: 60, inner: "102", cartonId: "CARTON-003", cartonSpec: "50*35*27", palletId: "PALLET-01", pose: "竖放", grossWeight: 41.3 },
  { orderNo: "405398+405228+420867", model: "405790", qty: 44, inner: "102", cartonId: "CARTON-003", cartonSpec: "50*35*27", palletId: "PALLET-01", pose: "平放", grossWeight: 36.2 },
  { orderNo: "405512+405601", model: "405228", qty: 68, inner: "105", cartonId: "CARTON-004", cartonSpec: "54*36*28", palletId: "PALLET-02", pose: "平放", grossWeight: 42.5 },
  { orderNo: "405512+405601", model: "420867", qty: 56, inner: "111", cartonId: "CARTON-004", cartonSpec: "54*36*28", palletId: "PALLET-02", pose: "竖放", grossWeight: 45.7 },
  { orderNo: "405512+405601", model: "406010", qty: 70, inner: "102", cartonId: "CARTON-005", cartonSpec: "56*38*29", palletId: "PALLET-02", pose: "平放", grossWeight: 43.9 },
  { orderNo: "405512+405601", model: "405398", qty: 64, inner: "104*2", cartonId: "CARTON-005", cartonSpec: "56*38*29", palletId: "PALLET-02", pose: "平放", grossWeight: 40.6 },
  { orderNo: "405790", model: "405790", qty: 52, inner: "102", cartonId: "CARTON-006", cartonSpec: "50*35*27", palletId: "PALLET-02", pose: "竖放", grossWeight: 38.4 },
  { orderNo: "405790", model: "405398", qty: 60, inner: "104*2", cartonId: "CARTON-007", cartonSpec: "58*40*31", palletId: "PALLET-02", pose: "平放", grossWeight: 47.6 },
  { orderNo: "405790", model: "420867", qty: 36, inner: "111", cartonId: "CARTON-007", cartonSpec: "58*40*31", palletId: "PALLET-02", pose: "平放", grossWeight: 41.8 }
];

const SOURCE_XLSX_PATH = "../导出模板.xlsx";
const EXPORT_API_URL = "http://127.0.0.1:8000/api/export-template-xlsx";
const PLAN_API_BASE = "";
const outputMeta = {
  mergeMode: "不合并",
  contractNo: "405398+405228+420867",
  receivingUnit: "6002美国BBB",
  shipDate: "2026-01-14"
};
let outputExceptions = [];

function normalizePlanStatus(value) {
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

function normalizeMergeMode(value) {
  const text = String(value || "").trim();
  if (text === "MERGE" || text === "合并") return "合并";
  if (text === "NO_MERGE" || text === "不合并") return "不合并";
  return text || "不合并";
}

function groupBy(items, keyGetter) {
  return items.reduce((acc, item) => {
    const key = keyGetter(item);
    if (!acc.has(key)) acc.set(key, []);
    acc.get(key).push(item);
    return acc;
  }, new Map());
}

function buildDerivedTemplate(rows) {
  const cartonMap = groupBy(rows, row => row.cartonId);
  const palletIds = [...new Set(rows.map(row => row.palletId))];
  const modelMap = groupBy(rows, row => row.model);
  const innerMap = groupBy(rows, row => row.inner);
  const orderMap = groupBy(rows, row => row.orderNo);
  const totalWeight = rows.reduce((sum, row) => sum + Number(row.grossWeight || 0), 0);

  const packingCases = [...cartonMap.entries()].map(([cartonId, list]) => {
    const dimParts = (list[0].cartonSpec || "56*38*29").split("*").map(n => Number(n));
    const [wRaw, dRaw, hRaw] = dimParts.length === 3 ? dimParts : [56, 38, 29];
    const uniqueModels = [...new Set(list.map(row => row.model))];
    return {
      id: cartonId,
      w: Math.max(Math.round(wRaw * 0.9), 40),
      d: Math.max(Math.round(dRaw * 0.9), 28),
      h: Math.max(Math.round(hRaw * 0.85), 22),
      spec: list[0].cartonSpec,
      models: uniqueModels,
      grid: { cols: 3, rows: 2, layers: 2 },
      pattern: uniqueModels.length ? uniqueModels : ["405398"]
    };
  });

  const flatModels = rows.filter(row => row.pose !== "竖放").slice(0, 4).map(row => row.model);
  const uprightModels = rows.filter(row => row.pose === "竖放").map(row => row.model);
  const derivedUpright = uprightModels.length ? uprightModels : ["420867"];

  return {
    kpis: [
      { label: "订单总行数", value: String(rows.length) },
      { label: "外箱总数", value: String(cartonMap.size) },
      { label: "托盘总数", value: String(palletIds.length) },
      { label: "总毛重", value: `${totalWeight.toFixed(1)} kg` }
    ],
    plans: [...orderMap.entries()].map(([orderNo], idx) => ({
      ref: orderNo,
      mode: idx % 2 === 0 ? "合并" : "不合并",
      status: idx === 0 ? "待确认" : "已确认"
    })),
    modelBoxes: [...modelMap.entries()].map(([model, list]) => ({
      model,
      inner: list[0].inner,
      weight: (list.reduce((sum, row) => sum + row.grossWeight, 0) / list.length / 20).toFixed(1),
      perCase: String(Math.max(24, Math.round(list.reduce((sum, row) => sum + row.qty, 0) / list.length)))
    })),
    innerOuter: [...innerMap.entries()].map(([inner, list]) => ({
      inner,
      outer: list[0].cartonSpec,
      total: String(Math.round(list.reduce((sum, row) => sum + row.qty, 0) / list.length)),
      pallet: list.some(row => row.cartonSpec === "58*40*31") ? "116*80*103" : "116*116*103"
    })),
    packingCases,
    palletConfigs: palletIds.map(id => ({ id })),
    flatCatalog: [
      { w: 24, d: 20, h: 16, spec: "56*38*29", models: [flatModels[0] || "405398", flatModels[1] || "405228"], color: 0x93c5fd },
      { w: 22, d: 20, h: 15, spec: "54*36*28", models: [flatModels[2] || "420867"], color: 0x60a5fa },
      { w: 24, d: 22, h: 17, spec: "58*40*31", models: [flatModels[3] || "406010", "405790"], color: 0x3b82f6 }
    ],
    uprightCatalog: [
      { w: 18, d: 16, h: 26, spec: "50*35*27(竖)", models: [derivedUpright[0]], color: 0xfb923c },
      { w: 17, d: 15, h: 28, spec: "54*36*28(竖)", models: [derivedUpright[1] || derivedUpright[0]], color: 0xf97316 }
    ]
  };
}

let derivedTemplate = buildDerivedTemplate(outputTemplateRows);

function applyDerivedTemplateToDemoData() {
  demoData.kpis = derivedTemplate.kpis;
  demoData.plans = derivedTemplate.plans;
  demoData.modelBoxes = derivedTemplate.modelBoxes;
  demoData.innerOuter = derivedTemplate.innerOuter;
  demoData.solutions = [
    {
      name: "保守方案",
      tag: "低复杂度",
      boxCount: Number(derivedTemplate.kpis[1].value) + 2,
      palletCount: Number(derivedTemplate.kpis[2].value) + 1,
      weight: `${(Number(derivedTemplate.kpis[3].value.replace(" kg", "")) + 13.2).toFixed(1)} kg`,
      note: "执行简单，优先同规格装箱装托。"
    },
    {
      name: "均衡方案",
      tag: "推荐",
      boxCount: Number(derivedTemplate.kpis[1].value),
      palletCount: Number(derivedTemplate.kpis[2].value),
      weight: derivedTemplate.kpis[3].value,
      note: "箱数与复杂度平衡，来自模板表格假数据。"
    },
    {
      name: "极致省箱",
      tag: "最省箱托",
      boxCount: Math.max(1, Number(derivedTemplate.kpis[1].value) - 1),
      palletCount: Number(derivedTemplate.kpis[2].value),
      weight: `${(Number(derivedTemplate.kpis[3].value.replace(" kg", "")) - 8.7).toFixed(1)} kg`,
      note: "拼箱拼托更多，复核要求更高。"
    }
  ];
}

applyDerivedTemplateToDemoData();

function renderKpis() {
  const kpiGrid = document.getElementById("kpiGrid");
  kpiGrid.innerHTML = demoData.kpis
    .map(item => `<article class="kpi"><h4>${item.label}</h4><p>${item.value}</p></article>`)
    .join("");
}

function renderCustomer() {
  const customerKv = document.getElementById("customerKv");
  customerKv.innerHTML = Object.entries(demoData.customer)
    .map(([k, v]) => `<div class="kv-item"><span>${k}</span><strong>${v}</strong></div>`)
    .join("");
}

function renderPlanTable() {
  const body = document.getElementById("planTableBody");
  body.innerHTML = demoData.plans
    .map(plan => `
      <tr>
        <td>${plan.ref}</td>
        <td>${plan.mode}</td>
        <td>${plan.status}</td>
        <td><button data-demo-btn>查看</button></td>
      </tr>
    `)
    .join("");
}

function renderSolutions() {
  const solutionGrid = document.getElementById("solutionGrid");
  solutionGrid.innerHTML = demoData.solutions
    .map(solution => `
      <article class="solution-card">
        <span class="badge">${solution.tag}</span>
        <h4>${solution.name}</h4>
        <div class="solution-meta">
          外箱数：<strong>${solution.boxCount}</strong><br>
          托盘数：<strong>${solution.palletCount}</strong><br>
          总毛重：<strong>${solution.weight}</strong><br>
          说明：${solution.note}
        </div>
        <button class="primary" data-demo-btn>选为最终方案</button>
      </article>
    `)
    .join("");
}

function renderMappingTables() {
  const modelBody = document.getElementById("modelBoxBody");
  modelBody.innerHTML = demoData.modelBoxes
    .map(row => `
      <tr>
        <td>${row.model}</td>
        <td>${row.inner}</td>
        <td>${row.weight}</td>
        <td>${row.perCase}</td>
      </tr>
    `)
    .join("");

  const innerOuterBody = document.getElementById("innerOuterBody");
  innerOuterBody.innerHTML = demoData.innerOuter
    .map(row => `
      <tr>
        <td>${row.inner}</td>
        <td>${row.outer}</td>
        <td>${row.total}</td>
        <td>${row.pallet}</td>
      </tr>
    `)
    .join("");
}

function renderOutputTemplateTable() {
  const body = document.getElementById("outputTemplateBody");
  if (!body) return;

  const orderMap = groupBy(outputTemplateRows, row => row.orderNo);
  const cartonMap = groupBy(outputTemplateRows, row => row.cartonId);
  const palletMap = groupBy(outputTemplateRows, row => row.palletId);
  const totalQty = outputTemplateRows.reduce((sum, row) => sum + row.qty, 0);
  const totalWeight = outputTemplateRows.reduce((sum, row) => sum + row.grossWeight, 0);

  const getTypeKey = row => row.inner || "其他";
  const htmlRows = [];
  htmlRows.push(`<tr><td colspan="8" style="background:#dbeafe;font-weight:800;color:#1e3a8a;">A1：${outputMeta.mergeMode}</td></tr>`);
  htmlRows.push(`<tr><td colspan="8" style="background:#eef2ff;font-weight:700;color:#3730a3;">合同编号：${outputMeta.contractNo}</td></tr>`);
  htmlRows.push(`<tr><td colspan="8" style="background:#eef2ff;font-weight:700;color:#3730a3;">收货单位：${outputMeta.receivingUnit}</td></tr>`);
  htmlRows.push(`<tr><td colspan="8" style="background:#eef2ff;font-weight:700;color:#3730a3;">发货时间(N4)：${outputMeta.shipDate}</td></tr>`);
  htmlRows.push(`<tr><td colspan="8" style="background:#eef2ff;font-weight:800;color:#3730a3;">装箱明细</td></tr>`);
  htmlRows.push(`<tr style="background:#f8fbff;font-weight:700;"><td>订单号</td><td>型号</td><td>数量</td><td>内盒</td><td>外箱编号</td><td>外箱规格(cm)</td><td>毛重(kg)</td><td>备注</td></tr>`);

  [...orderMap.entries()].forEach(([orderNo, orderRows]) => {
    htmlRows.push(`<tr><td colspan="8" style="background:#eef2ff;color:#334155;font-weight:700;">订单：${orderNo}</td></tr>`);
    const typeMap = groupBy(orderRows, row => getTypeKey(row));
    let orderQty = 0;
    let orderWeight = 0;

    [...typeMap.entries()].forEach(([typeKey, typeRows], typeIdx) => {
      if (typeIdx > 0) {
        htmlRows.push(`<tr><td colspan="8" style="height:8px;background:#ffffff;"></td></tr>`);
      }
      htmlRows.push(`<tr><td colspan="8" style="background:#f8fafc;color:#475569;font-weight:700;">类型：${typeKey}</td></tr>`);
      const orderCartonMap = groupBy(typeRows, row => row.cartonId);

      [...orderCartonMap.entries()].forEach(([cartonId, cartonRows]) => {
        const isMix = cartonRows.length > 1;
        cartonRows.forEach((row, idx) => {
          orderQty += row.qty;
          orderWeight += row.grossWeight;
          htmlRows.push(`
            <tr>
              <td>${orderNo}</td>
              <td>${row.model}</td>
              <td>${row.qty}</td>
              <td>${row.inner}</td>
              <td>${cartonId}</td>
              ${idx === 0 ? `<td rowspan="${cartonRows.length}" style="background:${isMix ? "#fff7ed" : "transparent"};">${row.cartonSpec}${isMix ? "（拼箱）" : ""}</td>` : ""}
              <td>${row.grossWeight.toFixed(1)}</td>
              <td>${isMix ? "拼箱" : "-"}</td>
            </tr>
          `);
        });
      });
    });

    htmlRows.push(`<tr><td colspan="8" style="background:#f8fbff;color:#1e3a8a;font-weight:700;">订单汇总：总件数 ${orderQty}，总毛重 ${orderWeight.toFixed(1)} kg</td></tr>`);
  });

  htmlRows.push(`<tr><td colspan="8" style="background:#e0f2fe;color:#0c4a6e;font-weight:800;">装箱总汇总：订单 ${orderMap.size} 笔，外箱 ${cartonMap.size} 箱，总件数 ${totalQty}，总毛重 ${totalWeight.toFixed(1)} kg</td></tr>`);
  htmlRows.push(`<tr><td colspan="8" style="height:8px;background:#ffffff;"></td></tr>`);
  htmlRows.push(`<tr><td colspan="8" style="background:#eef2ff;font-weight:800;color:#3730a3;">装托明细</td></tr>`);
  htmlRows.push(`<tr style="background:#f8fbff;font-weight:700;"><td>托盘编号</td><td>外箱编号</td><td>外箱规格(cm)</td><td>摆放</td><td>型号集合</td><td>件数</td><td>毛重(kg)</td><td>说明</td></tr>`);

  [...palletMap.entries()].forEach(([palletId, palletRows], palletIdx) => {
    const cartonGroup = groupBy(palletRows, row => row.cartonId);
    let palletQty = 0;
    let palletWeight = 0;

    [...cartonGroup.entries()].forEach(([cartonId, cartonRows]) => {
      const modelSet = [...new Set(cartonRows.map(item => item.model))].join("+");
      const qty = cartonRows.reduce((sum, item) => sum + item.qty, 0);
      const weight = cartonRows.reduce((sum, item) => sum + item.grossWeight, 0);
      const pose = cartonRows.some(item => item.pose === "竖放") ? "平放+竖放" : "平放";
      palletQty += qty;
      palletWeight += weight;
      htmlRows.push(`
        <tr>
          <td>${palletId}</td>
          <td>${cartonId}</td>
          <td>${cartonRows[0].cartonSpec}</td>
          <td>${pose}</td>
          <td>${modelSet}</td>
          <td>${qty}</td>
          <td>${weight.toFixed(1)}</td>
          <td>${pose.includes("竖放") ? "含竖放箱" : "-"}</td>
        </tr>
      `);
    });

    htmlRows.push(`<tr><td colspan="8" style="background:#f8fbff;color:#1e3a8a;font-weight:700;">木托${palletIdx + 1}：木托尺寸 116*116*103，总箱数 ${cartonGroup.size}，总件数 ${palletQty}，总毛重 ${palletWeight.toFixed(1)} kg</td></tr>`);
    htmlRows.push(`<tr><td colspan="8" style="height:8px;background:#ffffff;"></td></tr>`);
    htmlRows.push(`<tr><td colspan="8" style="height:8px;background:#ffffff;"></td></tr>`);
    htmlRows.push(`<tr><td colspan="8" style="height:8px;background:#ffffff;"></td></tr>`);
  });

  htmlRows.push(`<tr><td colspan="8" style="background:#e0f2fe;color:#0c4a6e;font-weight:800;">装托总汇总：托盘 ${palletMap.size} 托，外箱 ${cartonMap.size} 箱，总件数 ${totalQty}，总毛重 ${totalWeight.toFixed(1)} kg</td></tr>`);
  htmlRows.push(`<tr><td colspan="8" style="height:8px;background:#ffffff;"></td></tr>`);
  htmlRows.push(`<tr><td colspan="8" style="background:#eef2ff;font-weight:800;color:#3730a3;">汇总统计</td></tr>`);
  htmlRows.push(`<tr><td colspan="8" style="background:#f8fbff;color:#1e3a8a;font-weight:700;">外箱总数：${cartonMap.size}，托盘总数：${palletMap.size}，总件数：${totalQty}，总毛重：${totalWeight.toFixed(1)} kg</td></tr>`);
  htmlRows.push(`<tr><td colspan="8" style="height:8px;background:#ffffff;"></td></tr>`);
  htmlRows.push(`<tr><td colspan="8" style="background:#eef2ff;font-weight:800;color:#3730a3;">异常信息</td></tr>`);
  htmlRows.push(`<tr><td colspan="8" style="background:#f8fbff;color:#334155;">${outputExceptions.length ? outputExceptions.join("；") : "无"}</td></tr>`);

  body.innerHTML = htmlRows.join("");
}

function setupOutputPanel() {
  const showBtn = document.getElementById("showOutputBtn");
  const hideBtn = document.getElementById("hideOutputBtn");
  const downloadBtn = document.getElementById("downloadOutputBtn");
  const outputPanel = document.getElementById("outputPanel");
  if (!showBtn || !hideBtn || !outputPanel) return;

  showBtn.addEventListener("click", () => {
    outputPanel.classList.remove("hidden");
    outputPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  hideBtn.addEventListener("click", () => {
    outputPanel.classList.add("hidden");
  });

  if (downloadBtn) {
    downloadBtn.addEventListener("click", () => exportOutputXlsx());
  }
}

function buildRowsFromModels(models) {
  const uniqModels = [...new Set(models.map(item => String(item).trim()).filter(Boolean))];
  const selected = uniqModels.slice(0, 18);
  const orders = ["405398+405228+420867", "405512+405601", "405790"];
  const innerCycle = ["104*2", "105", "111", "102"];
  const specCycle = ["56*38*29", "58*40*31", "50*35*27", "54*36*28"];

  return selected.map((model, idx) => {
    const cartonNo = Math.floor(idx / 2) + 1;
    const palletNo = Math.floor(idx / 6) + 1;
    return {
      orderNo: orders[idx % orders.length],
      model,
      qty: 36 + (idx % 6) * 8,
      unit: "PCS",
      inner: innerCycle[idx % innerCycle.length],
      cartonId: `CARTON-${String(cartonNo).padStart(3, "0")}`,
      cartonSpec: specCycle[idx % specCycle.length],
      palletId: `PALLET-${String(palletNo).padStart(2, "0")}`,
      pose: idx % 5 === 0 ? "竖放" : "平放",
      grossWeight: 35 + (idx % 7) * 2.9
    };
  });
}

function toFiniteNumber(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value ?? "").replace(/,/g, "").trim();
  if (!text) return fallback;
  const num = Number(text);
  return Number.isFinite(num) ? num : fallback;
}

function inferCartonSpecByInner(innerValue) {
  const key = String(innerValue || "").trim();
  if (key.startsWith("111")) return "58*40*31";
  if (key.startsWith("105") || key.startsWith("106")) return "54*36*28";
  if (key.startsWith("104")) return "56*38*29";
  return "50*35*27";
}

function buildRowsFromTemplateSheet(sheetRows) {
  const parsedRows = [];
  let cartonIndex = 1;
  let palletIndex = 1;
  let rowsInCarton = 0;
  let rowsInPallet = 0;
  const orderNo = outputMeta.contractNo || "模板订单";

  for (let i = 8; i < sheetRows.length; i += 1) {
    const row = sheetRows[i] || [];
    const model = String(row[1] ?? "").trim();
    const qty = toFiniteNumber(row[3], 0);
    if (!model || qty <= 0) continue;

    const innerRaw = String(row[7] ?? "").trim();
    const inner = innerRaw || "102";
    const unitPrice = toFiniteNumber(row[5], 0);
    const amount = toFiniteNumber(row[6], unitPrice * qty);
    const qtyPerPackage = Math.max(1, toFiniteNumber(row[8], qty));
    const pkgCountCell = toFiniteNumber(row[9], Math.ceil(qty / qtyPerPackage));
    const packageCount = Math.max(1, Math.round(pkgCountCell));
    const cartonSpec = inferCartonSpecByInner(inner);
    const grossWeight = Number(Math.max(1, amount / 10 || qty / 10).toFixed(1));

    const cartonId = `CARTON-${String(cartonIndex).padStart(3, "0")}`;
    const palletId = `PALLET-${String(palletIndex).padStart(2, "0")}`;
    const pose = (i % 7 === 0 || i % 11 === 0) ? "竖放" : "平放";

    parsedRows.push({
      orderNo,
      model,
      qty: Math.round(qty),
      unit: String(row[4] || "只"),
      inner,
      cartonId,
      cartonSpec,
      palletId,
      pose,
      grossWeight,
      packageCount
    });

    rowsInCarton += 1;
    rowsInPallet += 1;
    if (rowsInCarton >= 2) {
      cartonIndex += 1;
      rowsInCarton = 0;
    }
    if (rowsInPallet >= 12) {
      palletIndex += 1;
      rowsInPallet = 0;
    }
  }

  return parsedRows;
}

async function loadTemplateRowsFromApi() {
  try {
    const query = new URLSearchParams(window.location.search);
    const inputPlanId = query.get("plan");

    const listRes = await fetch(`${PLAN_API_BASE}/api/plans`);
    if (!listRes.ok) return false;
    const listBody = await listRes.json();
    const plans = listBody.plans || [];
    if (!plans.length) return false;

    const selectedPlan = plans.find(item => String(item.id) === String(inputPlanId)) || plans[0];
    const detailRes = await fetch(`${PLAN_API_BASE}/api/plans/${encodeURIComponent(selectedPlan.id)}`);
    if (!detailRes.ok) return false;
    const detail = await detailRes.json();

    const plan = detail.plan || {};
    const solutions = detail.solutions || [];
    const selectedSolution = solutions.find(item => Number(item.id) === Number(plan.final_solution_id)) || solutions[0];
    if (!selectedSolution) return false;

    const solutionId = Number(selectedSolution.id);
    const boxRows = (detail.solution_item_boxes || []).filter(row => Number(row.solution_id) === solutionId);
    const palletRows = (detail.solution_item_pallets || []).filter(row => Number(row.solution_id) === solutionId);
    if (!boxRows.length) return false;

    const palletByCarton = new Map();
    palletRows.forEach(row => {
      const key = String(row.carton_id || "");
      if (!palletByCarton.has(key)) {
        palletByCarton.set(key, row);
      }
    });

    const cartonQtySum = new Map();
    boxRows.forEach(row => {
      const key = String(row.carton_id || "");
      cartonQtySum.set(key, (cartonQtySum.get(key) || 0) + Number(row.qty || 0));
    });

    outputMeta.mergeMode = normalizeMergeMode(plan.merge_mode);
    outputMeta.contractNo = (detail.orders || []).map(item => item.order_no).filter(Boolean).join("+") || `PLAN-${plan.id}`;
    outputMeta.receivingUnit = String(plan.customer_code || "客户");
    outputMeta.shipDate = String(plan.ship_date || outputMeta.shipDate);

    outputTemplateRows = boxRows.map((row, idx) => {
      const cartonId = String(row.carton_id || `CARTON-${String(idx + 1).padStart(3, "0")}`);
      const palletRow = palletByCarton.get(cartonId);
      const cartonGross = Number(row.carton_gross_weight_kg || 0);
      const cartonQty = Number(cartonQtySum.get(cartonId) || 0);
      const qty = Number(row.qty || 0);
      const grossWeight = cartonQty > 0 ? cartonGross * (qty / cartonQty) : cartonGross;
      return {
        orderNo: String(row.order_no || outputMeta.contractNo),
        model: String(row.model_code || "UNKNOWN"),
        qty: Math.max(0, Math.round(qty)),
        unit: "PCS",
        inner: String(row.inner_box_spec || "102"),
        cartonId,
        cartonSpec: String((palletRow && palletRow.carton_spec_cm) || inferCartonSpecByInner(row.inner_box_spec)),
        palletId: String((palletRow && palletRow.pallet_id) || "PALLET-01"),
        pose: String((palletRow && palletRow.carton_pose) || "upright").toLowerCase() === "vertical" ? "竖放" : "平放",
        grossWeight: Number((grossWeight || 0).toFixed(1)),
      };
    });

    derivedTemplate = buildDerivedTemplate(outputTemplateRows);
    applyDerivedTemplateToDemoData();

    demoData.customer["客户编号"] = String(plan.customer_code || "N/A");
    demoData.customer["客户名称"] = String(plan.customer_code || "N/A");
    demoData.customer["装箱要求"] = outputMeta.mergeMode;
    demoData.customer["生效状态"] = normalizePlanStatus(plan.status);
    demoData.plans = plans.slice(0, 8).map(item => ({
      ref: `#${item.id}`,
      mode: normalizeMergeMode(item.merge_mode),
      status: normalizePlanStatus(item.status)
    }));
    demoData.solutions = solutions.map(item => ({
      name: String(item.name || `方案${item.score_rank || "-"}`),
      tag: String(item.tag || "候选"),
      boxCount: Number(item.box_count || 0),
      palletCount: Number(item.pallet_count || 0),
      weight: `${Number(item.gross_weight_kg || 0).toFixed(1)} kg`,
      note: Number(item.id) === Number(plan.final_solution_id) ? "当前已确认方案" : "候选方案"
    }));

    const topbarText = document.querySelector(".topbar p");
    if (topbarText) {
      topbarText.textContent = `客户：${plan.customer_code || "-"} ｜ 发货日期：${plan.ship_date || "-"} ｜ 任务单号：#${plan.id || "-"}`;
    }
    const statusBlock = document.querySelector(".sidebar-footer p");
    if (statusBlock) {
      statusBlock.textContent = `当前模式：实时接口（任务状态：${normalizePlanStatus(plan.status)}）`;
    }
    const toast = document.getElementById("toast");
    if (toast) {
      toast.textContent = "实时模式：已接入任务与规则接口";
    }
    return true;
  } catch (err) {
    console.warn("实时任务数据加载失败，回退模板/假数据：", err);
    return false;
  }
}

async function loadTemplateRowsFromWorkbook() {
  if (!window.XLSX) return false;
  try {
    outputExceptions = [];
    const res = await fetch(encodeURI(SOURCE_XLSX_PATH));
    if (!res.ok) return false;
    const data = await res.arrayBuffer();
    const workbook = XLSX.read(data, { type: "array" });
    const sheet1 = workbook.Sheets.Sheet1 || workbook.Sheets[workbook.SheetNames[0]];
    const a1 = sheet1 ? XLSX.utils.sheet_to_json(sheet1, { header: 1, range: 0, blankrows: false }) : [];
    const a1Text = a1 && a1[0] && a1[0][0] ? String(a1[0][0]) : "";
    if (a1Text.includes("不合并")) {
      outputMeta.mergeMode = "不合并";
    } else if (a1Text.includes("合并")) {
      outputMeta.mergeMode = "合并";
    } else {
      outputMeta.mergeMode = "不合并";
      outputExceptions.push("A1 非法值，已按“不合并”处理");
    }
    const sheet1Rows = sheet1 ? XLSX.utils.sheet_to_json(sheet1, { header: 1, defval: "" }) : [];
    const row3 = sheet1Rows[2] || [];
    const row4 = sheet1Rows[3] || [];
    const contractCell = String(row3[0] || "");
    const receiveCell = String(row4[0] || "");
    const dateCell = row3[8] || "";
    const contractMatch = contractCell.match(/合同编号.*?[:：]\s*(.*)$/);
    const receiveMatch = receiveCell.match(/收货\\?单位.*?[:：]\s*(.*)$/);
    if (contractMatch && contractMatch[1]) outputMeta.contractNo = contractMatch[1].trim();
    if (receiveMatch && receiveMatch[1]) outputMeta.receivingUnit = receiveMatch[1].trim();
    if (dateCell) outputMeta.shipDate = String(dateCell).trim();

    const parsedRows = buildRowsFromTemplateSheet(sheet1Rows);
    if (!parsedRows.length) {
      outputExceptions.push("模板未解析到有效明细，回退到内置假数据");
      return false;
    }

    outputTemplateRows = parsedRows;
    derivedTemplate = buildDerivedTemplate(outputTemplateRows);
    applyDerivedTemplateToDemoData();
    return true;
  } catch (err) {
    outputExceptions.push("源 Excel 读取失败，已回退内置假数据");
    console.warn("读取xlsx失败，继续使用内置假数据：", err);
    return false;
  }
}

function triggerBrowserDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function fallbackExportOutputXlsxBySheetJs() {
  if (!window.XLSX) return;

  const orderMap = groupBy(outputTemplateRows, row => row.orderNo);
  const cartonMap = groupBy(outputTemplateRows, row => row.cartonId);
  const palletMap = groupBy(outputTemplateRows, row => row.palletId);
  const totalQty = outputTemplateRows.reduce((sum, row) => sum + row.qty, 0);
  const totalWeight = outputTemplateRows.reduce((sum, row) => sum + row.grossWeight, 0);

  const aoa = [];
  const merges = [];
  let rowIndex = 0;
  const pushRow = (row, mergeAll = false) => {
    aoa.push(row);
    if (mergeAll) {
      merges.push({ s: { r: rowIndex, c: 0 }, e: { r: rowIndex, c: 7 } });
    }
    rowIndex += 1;
  };

  pushRow(["装箱明细（按订单分隔）", "", "", "", "", "", "", ""], true);
  pushRow(["订单号", "型号", "数量", "内盒", "外箱编号", "外箱规格(手重", "毛重（kg）", "备注"]);

  [...orderMap.entries()].forEach(([orderNo, rows], idx) => {
    if (idx > 0) pushRow(["----- 订单分隔线 -----", "", "", "", "", "", "", ""], true);
    rows.forEach(row => {
      const mixFlag = rows.some(item => item.cartonId === row.cartonId && item.model !== row.model);
      pushRow([
        orderNo,
        row.model,
        row.qty,
        row.inner,
        row.cartonId,
        row.cartonSpec,
        Number(row.grossWeight.toFixed(1)),
        mixFlag ? "拼箱" : "-"
      ]);
    });
  });

  pushRow(["", "", "", "", "", "", "", ""], true);
  pushRow([`装箱汇总：订单 ${orderMap.size} 笔，外箱 ${cartonMap.size} 箱，总件数 ${totalQty}，总毛重 ${totalWeight.toFixed(1)} kg`, "", "", "", "", "", "", ""], true);
  pushRow(["", "", "", "", "", "", "", ""], true);
  pushRow(["装托明细", "", "", "", "", "", "", ""], true);
  pushRow(["托盘编号", "外箱编号", "外箱规格", "摆放", "型号集合", "件数", "毛重（kg）", ""]);

  [...palletMap.entries()].forEach(([palletId, rows]) => {
    const cartonGroup = groupBy(rows, row => row.cartonId);
    [...cartonGroup.entries()].forEach(([cartonId, cartonRows]) => {
      const modelSet = [...new Set(cartonRows.map(item => item.model))].join("+");
      const qty = cartonRows.reduce((sum, item) => sum + item.qty, 0);
      const weight = cartonRows.reduce((sum, item) => sum + item.grossWeight, 0);
      const pose = cartonRows.some(item => item.pose === "竖放") ? "平放+竖放" : "平放";
      pushRow([palletId, cartonId, cartonRows[0].cartonSpec, pose, modelSet, qty, Number(weight.toFixed(1)), ""]);
    });
  });

  pushRow(["", "", "", "", "", "", "", ""], true);
  pushRow([`装托汇总：托盘 ${palletMap.size} 托，外箱 ${cartonMap.size} 箱，总件数 ${totalQty}，总毛重 ${totalWeight.toFixed(1)} kg`, "", "", "", "", "", "", ""], true);
  pushRow(["", "", "", "", "", "", "", ""], true);
  pushRow(["汇总统计", "", "", "", "", "", "", ""], true);
  pushRow([`外箱总数：${cartonMap.size}，托盘总数：${palletMap.size}，总件数：${totalQty}，总毛重：${totalWeight.toFixed(1)} kg`, "", "", "", "", "", "", ""], true);
  pushRow(["", "", "", "", "", "", "", ""], true);
  pushRow(["异常信息", "", "", "", "", "", "", ""], true);
  pushRow([outputExceptions.length ? outputExceptions.join("；") : "无", "", "", "", "", "", "", ""], true);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!merges"] = merges;
  ws["!cols"] = [
    { wch: 20 },
    { wch: 16 },
    { wch: 10 },
    { wch: 10 },
    { wch: 14 },
    { wch: 16 },
    { wch: 12 },
    { wch: 8 }
  ];
  XLSX.utils.book_append_sheet(wb, ws, "输出内容");
  const safeDate = String(outputMeta.shipDate || "2026-01-14").replace(/[\\/:*?\"<>|]/g, "-");
  const safeCustomer = String(outputMeta.receivingUnit || "客户").replace(/[\\/:*?\"<>|]/g, "_");
  const safeContract = String(outputMeta.contractNo || "订单").replace(/[\\/:*?\"<>|]/g, "_");
  XLSX.writeFile(wb, `${safeCustomer}_${safeContract}_${safeDate}.xlsx`);
}

async function exportOutputXlsx() {
  try {
    const payload = {
      meta: {
        mergeMode: outputMeta.mergeMode,
        contractNo: outputMeta.contractNo,
        receivingUnit: outputMeta.receivingUnit,
        shipDate: outputMeta.shipDate
      }
    };

    const res = await fetch(EXPORT_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      throw new Error(`导出服务响应异常：${res.status}`);
    }

    const disposition = res.headers.get("Content-Disposition") || "";
    const fileNameMatch = disposition.match(/filename\*=UTF-8''([^;]+)|filename=\"?([^\";]+)\"?/i);
    const fileName = decodeURIComponent(fileNameMatch?.[1] || fileNameMatch?.[2] || "导出模板.xlsx");
    const blob = await res.blob();
    triggerBrowserDownload(blob, fileName);
  } catch (err) {
    console.warn("模板导出服务不可用，回退前端导出：", err);
    fallbackExportOutputXlsxBySheetJs();
  }
}

function setupDemoButtons() {
  const toast = document.getElementById("toast");
  let timer = null;

  document.querySelectorAll("[data-demo-btn]").forEach(btn => {
    btn.addEventListener("click", () => {
      toast.classList.add("show");
      clearTimeout(timer);
      timer = setTimeout(() => toast.classList.remove("show"), 1400);
    });
  });
}

function createInteractive3DViewer() {
  const container = document.getElementById("viewer3d");
  const meta = document.getElementById("sceneMeta");
  const btnPacking = document.getElementById("viewPackingBtn");
  const btnPallet = document.getElementById("viewPalletBtn");
  const packingBoxSelect = document.getElementById("packingBoxSelect");
  const palletSelect = document.getElementById("palletSelect");
  const labelScaleSelect = document.getElementById("labelScaleSelect");
  const labelModeSelect = document.getElementById("labelModeSelect");
  const labelScaleSteps = [1, 1.5, 2, 3, 4];

  if (!container || !window.THREE || !THREE.OrbitControls) {
    if (meta) {
      meta.textContent = "Three.js 资源加载失败，请检查网络连接。";
    }
    return;
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf3f8ff);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
  camera.position.set(180, 140, 200);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 16;
  controls.maxDistance = 1200;
  controls.target.set(0, 35, 0);
  controls.update();

  container.addEventListener("contextmenu", event => event.preventDefault());

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

  const grid = new THREE.GridHelper(900, 28, 0x9fb3c8, 0xc8d6e5);
  grid.position.y = 0;
  scene.add(grid);

  const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x1f2937, transparent: true, opacity: 0.25 });
  let sceneGroup = null;

  function addBox(group, cfg) {
    const geometry = new THREE.BoxGeometry(cfg.w, cfg.h, cfg.d);
    const material = new THREE.MeshStandardMaterial({
      color: cfg.color,
      transparent: cfg.opacity !== undefined,
      opacity: cfg.opacity ?? 1,
      roughness: 0.55,
      metalness: 0.05
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
    const width = cfg.width || 360;
    const height = cfg.height || 110;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    const bg = cfg.bg || "rgba(15, 23, 42, 0.80)";
    const fg = cfg.fg || "#f8fafc";
    const border = cfg.border || "rgba(148, 163, 184, 0.75)";
    const radius = 14;

    ctx.fillStyle = bg;
    ctx.strokeStyle = border;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(width - radius, 0);
    ctx.quadraticCurveTo(width, 0, width, radius);
    ctx.lineTo(width, height - radius);
    ctx.quadraticCurveTo(width, height, width - radius, height);
    ctx.lineTo(radius, height);
    ctx.quadraticCurveTo(0, height, 0, height - radius);
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
    const startY = height / 2 - ((lines.length - 1) * 16);
    lines.forEach((line, index) => {
      ctx.fillText(line, width / 2, startY + index * 32);
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: cfg.depthTest ?? false,
      depthWrite: cfg.depthWrite ?? false
    }));
    sprite.scale.set(cfg.scaleX || 26, cfg.scaleY || 8, 1);
    sprite.position.set(x, y, z);
    sprite.renderOrder = cfg.renderOrder ?? 10;
    group.add(sprite);
  }

  const modelColors = {
    "405398": 0x74c0fc,
    "405228": 0x4dabf7,
    "420867": 0x63e6be,
    "406010": 0xffd43b,
    "405790": 0xffa94d
  };

  const packingCases = derivedTemplate.packingCases;
  const palletConfigs = derivedTemplate.palletConfigs;
  const flatCatalog = derivedTemplate.flatCatalog;
  const uprightCatalog = derivedTemplate.uprightCatalog;

  const layerPatterns = [
    ["F", "F", "U", "F", "F", "F", "F", "U", "F", "F", "F", "F", "F", "U", "F", "F"],
    ["F", "U", "F", "F", "F", "F", "F", "F", "U", "F", "F", "F", "F", "F", "U", "F"],
    ["F", "F", "F", "U", "F", "F", "U", "F", "F", "F", "F", "F", "U", "F", "F", "F"],
    ["U", "F", "F", "F", "F", "U", "F", "F", "F", "F", "F", "U", "F", "F", "F", "F"]
  ];

  let currentMode = "pallet";

  function getModelLabelScale() {
    const scale = Number(labelScaleSelect ? labelScaleSelect.value : "2");
    return Number.isFinite(scale) && scale > 0 ? scale : 1;
  }

  function getLabelMode() {
    const mode = labelModeSelect ? labelModeSelect.value : "sparse";
    return ["sparse", "all", "top"].includes(mode) ? mode : "sparse";
  }

  function updateLabelScaleQuickButtons() {
    if (!container) return;
    const quickBtns = container.parentElement
      ? container.parentElement.querySelectorAll(".quick-scale-btn")
      : [];
    const current = getModelLabelScale();
    quickBtns.forEach(btn => {
      const action = btn.getAttribute("data-action");
      if (action === "reset") {
        btn.classList.toggle("active", current === 2);
      } else if (action === "max") {
        btn.classList.toggle("active", current >= 4);
      }
    });
  }

  function setLabelScale(value) {
    if (!labelScaleSelect) return;
    labelScaleSelect.value = String(value);
    setViewMode(currentMode);
    updateLabelScaleQuickButtons();
  }

  function bumpLabelScale(step) {
    if (!labelScaleSelect) return;
    const current = getModelLabelScale();
    const index = labelScaleSteps.findIndex(item => item === current);
    const fallbackIndex = index >= 0
      ? index
      : labelScaleSteps.reduce((best, value, idx) => (
        Math.abs(value - current) < Math.abs(labelScaleSteps[best] - current) ? idx : best
      ), 0);
    const nextIndex = Math.max(0, Math.min(labelScaleSteps.length - 1, fallbackIndex + step));
    setLabelScale(labelScaleSteps[nextIndex]);
  }

  function injectQuickScaleControls() {
    if (!labelScaleSelect || !labelScaleSelect.parentElement) return;
    if (labelScaleSelect.parentElement.querySelector(".quick-scale-row")) return;
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
    labelScaleSelect.insertAdjacentElement("afterend", row);
    updateLabelScaleQuickButtons();
  }

  function applyDefaultCameraPose(mode) {
    if (mode === "packing") {
      const isSingle = packingBoxSelect && packingBoxSelect.value !== "ALL";
      if (isSingle) {
        const selected = packingCases.find(item => item.id === packingBoxSelect.value);
        const ref = selected || { w: 54, h: 30, d: 34 };
        const maxDim = Math.max(ref.w, ref.h, ref.d);
        const distance = Math.max(42, maxDim * 0.95);
        camera.position.set(0, Math.max(26, ref.h * 1.08), distance);
        controls.target.set(0, Math.max(10, ref.h * 0.38), 0);
      } else {
        camera.position.set(170, 126, 208);
        controls.target.set(0, 28, 0);
      }
    } else {
      camera.position.set(180, 140, 200);
      controls.target.set(0, 35, 0);
    }
    controls.update();
  }

  function populateSelect(selectEl, options, allLabel) {
    if (!selectEl) return;
    selectEl.innerHTML = [`<option value="ALL">${allLabel}</option>`]
      .concat(options.map(item => `<option value="${item.id}">${item.id}</option>`))
      .join("");
  }

  function setFilterState(mode) {
    if (!packingBoxSelect || !palletSelect) return;
    const showPacking = mode === "packing";
    packingBoxSelect.disabled = !showPacking;
    palletSelect.disabled = showPacking;
  }

  container.addEventListener("dblclick", () => {
    applyDefaultCameraPose(currentMode);
  });

  function buildPalletView(group, palletId) {
    const labelScale = getModelLabelScale();
    const labelMode = getLabelMode();
    const visiblePallets = palletId === "ALL"
      ? palletConfigs
      : palletConfigs.filter(item => item.id === palletId);
    const palletGap = 185;

    visiblePallets.forEach((pallet, displayIndex) => {
      const xOffset = visiblePallets.length === 1
        ? 0
        : (displayIndex - (visiblePallets.length - 1) / 2) * palletGap;

      const palletW = 122;
      const palletD = 110;
      const palletH = 12;
      addBox(group, { x: xOffset, y: palletH / 2, z: 0, w: palletW, h: palletH, d: palletD, color: 0x8d5524 });

      createLabel(group, `${pallet.id}\\n4层紧密混放`, xOffset, 16, -66, {
        scaleX: 19,
        scaleY: 6,
        fontSize: 20
      });

      createLabel(group, "蓝色=平放  橙色=竖放", xOffset, 16, 66, {
        scaleX: 24,
        scaleY: 5,
        fontSize: 18,
        bg: "rgba(30, 41, 59, 0.82)"
      });

      const cols = 4;
      const rows = 4;
      const stepX = 27;
      const stepZ = 24;
      const startX = xOffset - ((cols - 1) * stepX) / 2;
      const startZ = -((rows - 1) * stepZ) / 2;

      let flatIdx = displayIndex;
      let uprightIdx = displayIndex;
      let baseY = palletH;

      for (let layer = 0; layer < layerPatterns.length; layer += 1) {
        const pattern = layerPatterns[layer];
        let maxLayerH = 0;

        for (let row = 0; row < rows; row += 1) {
          for (let col = 0; col < cols; col += 1) {
            const cellIdx = row * cols + col;
            const pose = pattern[cellIdx];
            const isUpright = pose === "U";
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
                y: y + box.h / 2 + 1.3,
                z,
                w: Math.max(6, box.w * 0.32),
                h: 1.3,
                d: Math.max(6, box.d * 0.32),
                color: 0xdc2626,
                opacity: 0.95
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
                border: isUpright ? "rgba(252, 165, 165, 0.92)" : "rgba(148, 163, 184, 0.75)"
              });
            }
          }
        }

        baseY += maxLayerH + 1.5;
      }
    });
  }

  function buildPackingView(group, boxId) {
    const labelScale = getModelLabelScale();
    const labelMode = getLabelMode();
    const visibleBoxes = boxId === "ALL"
      ? packingCases
      : packingCases.filter(item => item.id === boxId);
    const singleMode = visibleBoxes.length === 1;

    const cols = visibleBoxes.length === 1 ? 1 : 2;
    const gapX = 95;
    const gapZ = 86;

    visibleBoxes.forEach((box, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const xBase = (col - (cols - 1) / 2) * gapX;
      const zBase = (row - (Math.ceil(visibleBoxes.length / cols) - 1) / 2) * gapZ;
      const outerY = box.h / 2 + 1;

      addBox(group, {
        x: xBase,
        y: outerY,
        z: zBase,
        w: box.w,
        h: box.h,
        d: box.d,
        color: 0xf08c00,
        opacity: 0.12
      });

      createLabel(group, `${box.id}\\n${box.spec}`, xBase, outerY + box.h / 2 + 6.4, zBase, {
        scaleX: Math.min(34, 20 + 5.5 * (labelScale - 1)),
        scaleY: Math.min(10, 6.3 + 1.8 * (labelScale - 1)),
        fontSize: Math.min(28, Math.round(18 + 3 * (labelScale - 1)))
      });

      createLabel(group, `型号:${box.models.join("+")}`, xBase, outerY + box.h / 2 + 1.2, zBase - box.d * 0.33, {
        scaleX: Math.min(26, 15 + 4.5 * (labelScale - 1)),
        scaleY: Math.min(8, 4.2 + 1.4 * (labelScale - 1)),
        fontSize: Math.min(22, Math.round(14 + 3 * (labelScale - 1))),
        bg: "rgba(15, 23, 42, 0.78)"
      });

      const { cols: innerCols, rows: innerRows, layers } = box.grid;
      const innerW = (box.w - 8) / innerCols;
      const innerD = (box.d - 8) / innerRows;
      const innerH = (box.h - 8) / layers;
      let modelIndex = 0;

      for (let ly = 0; ly < layers; ly += 1) {
        for (let rz = 0; rz < innerRows; rz += 1) {
          for (let cx = 0; cx < innerCols; cx += 1) {
            const model = box.pattern[modelIndex % box.pattern.length];
            modelIndex += 1;

            const x = xBase - box.w / 2 + 4 + innerW / 2 + cx * innerW;
            const y = 4 + innerH / 2 + ly * innerH;
            const z = zBase - box.d / 2 + 4 + innerD / 2 + rz * innerD;

            addBox(group, {
              x, y, z,
              w: Math.max(innerW - 1.2, 5),
              h: Math.max(innerH - 1.2, 5),
              d: Math.max(innerD - 1.2, 5),
              color: modelColors[model] || 0x94a3b8
            });

            const isTopLayer = ly === layers - 1;
            const showLabel = labelMode === "all"
              ? true
              : labelMode === "top"
                ? isTopLayer
                : (singleMode ? isTopLayer : (isTopLayer && rz === 0 && cx % 2 === 0));

            if (showLabel) {
              const stagger = (cx - (innerCols - 1) / 2) * 0.9;
              createLabel(group, model, x + stagger, y + innerH / 2 + 2.2, z, {
                scaleX: 8.8 * labelScale,
                scaleY: 2.9 * labelScale,
                fontSize: Math.round(15 * labelScale),
                bg: "rgba(15, 23, 42, 0.78)",
                depthTest: false,
                depthWrite: false,
                renderOrder: 30
              });
            }
          }
        }
      }
    });
  }

  function setViewMode(mode) {
    if (sceneGroup) {
      scene.remove(sceneGroup);
    }

    currentMode = mode;
    sceneGroup = new THREE.Group();

    if (mode === "packing") {
      buildPackingView(sceneGroup, packingBoxSelect ? packingBoxSelect.value : "ALL");
      meta.textContent = "当前：装箱视图（仅展示外箱，不放托盘；支持单箱查看；外箱均编号，内盒标注型号）";
      btnPacking.classList.add("primary");
      btnPallet.classList.remove("primary");
    } else {
      buildPalletView(sceneGroup, palletSelect ? palletSelect.value : "ALL");
      meta.textContent = "当前：装托视图（支持单托查看；每个外箱标记型号；平放+竖放混排，竖放箱橙色标识）";
      btnPallet.classList.add("primary");
      btnPacking.classList.remove("primary");
    }

    setFilterState(mode);
    scene.add(sceneGroup);
    applyDefaultCameraPose(mode);
  }

  function resizeRenderer() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }

  populateSelect(packingBoxSelect, packingCases, "全部外箱");
  populateSelect(palletSelect, palletConfigs, "全部托盘");

  if (packingBoxSelect) {
    packingBoxSelect.addEventListener("change", () => {
      if (currentMode === "packing") {
        setViewMode("packing");
      }
    });
  }

  if (palletSelect) {
    palletSelect.addEventListener("change", () => {
      if (currentMode === "pallet") {
        setViewMode("pallet");
      }
    });
  }

  if (labelScaleSelect) {
    labelScaleSelect.addEventListener("change", () => {
      setViewMode(currentMode);
      updateLabelScaleQuickButtons();
    });
  }

  if (labelModeSelect) {
    labelModeSelect.addEventListener("change", () => {
      setViewMode(currentMode);
    });
  }

  btnPacking.addEventListener("click", () => setViewMode("packing"));
  btnPallet.addEventListener("click", () => setViewMode("pallet"));

  window.addEventListener("resize", resizeRenderer);
  window.addEventListener("keydown", event => {
    if (!labelScaleSelect) return;
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      bumpLabelScale(1);
    } else if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      bumpLabelScale(-1);
    }
  });
  injectQuickScaleControls();
  resizeRenderer();
  setViewMode("pallet");
  animate();
}

async function initDemoPage() {
  const loadedFromApi = await loadTemplateRowsFromApi();
  if (!loadedFromApi) {
    await loadTemplateRowsFromWorkbook();
  }
  renderKpis();
  renderCustomer();
  renderPlanTable();
  renderSolutions();
  renderMappingTables();
  renderOutputTemplateTable();
  setupDemoButtons();
  setupOutputPanel();
  createInteractive3DViewer();
}

initDemoPage();
