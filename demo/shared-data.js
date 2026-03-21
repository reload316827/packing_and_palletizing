(function () {
  const datasets = {
    A: {
      name: "数据集 A（美国客户）",
      customers: [
        { id: "CUST-6002", name: "美国 BBB", city: "Los Angeles", packingMode: "合并" },
        { id: "CUST-6108", name: "加拿大 MNO", city: "Vancouver", packingMode: "不合并" }
      ],
      plans: [
        {
          id: "PLN-A-001",
          customerId: "CUST-6002",
          shipDate: "2026-03-24",
          mode: "合并",
          status: "待确认",
          orders: "405398+405228+420867",
          kpis: { lineCount: 268, boxCount: 132, palletCount: 11, weight: 9460 },
          solutions: [
            { name: "保守", boxCount: 138, palletCount: 12, complexity: "低" },
            { name: "均衡", boxCount: 132, palletCount: 11, complexity: "中" },
            { name: "极致省箱", boxCount: 127, palletCount: 10, complexity: "高" }
          ],
          layout: {
            outerBoxes: [
              { id: "A1", pallet: 1, slotC: 0, slotR: 0, w: 48, h: 28, d: 34, spec: "56*38*29", models: ["405398", "405228"], grid: { cols: 3, rows: 2, layers: 2 }, pattern: ["405398", "405228"] },
              { id: "A2", pallet: 1, slotC: 1, slotR: 0, w: 54, h: 30, d: 32, spec: "58*40*31", models: ["420867"], grid: { cols: 4, rows: 2, layers: 2 }, pattern: ["420867"] },
              { id: "A3", pallet: 1, slotC: 2, slotR: 0, w: 42, h: 24, d: 28, spec: "50*35*27", models: ["406010", "405790"], grid: { cols: 3, rows: 2, layers: 2 }, pattern: ["406010", "405790", "406010"] },
              { id: "A4", pallet: 1, slotC: 0, slotR: 1, w: 46, h: 26, d: 32, spec: "54*36*28", models: ["405228"], grid: { cols: 3, rows: 2, layers: 2 }, pattern: ["405228"] },
              { id: "A5", pallet: 1, slotC: 1, slotR: 1, w: 48, h: 28, d: 34, spec: "56*38*29", models: ["405398", "420867"], grid: { cols: 3, rows: 2, layers: 2 }, pattern: ["405398", "420867"] },
              { id: "A6", pallet: 1, slotC: 2, slotR: 1, w: 42, h: 24, d: 28, spec: "50*35*27", models: ["405790"], grid: { cols: 3, rows: 2, layers: 2 }, pattern: ["405790"] },
              { id: "A7", pallet: 2, slotC: 0, slotR: 0, w: 54, h: 30, d: 32, spec: "58*40*31", models: ["420867", "405398"], grid: { cols: 4, rows: 2, layers: 2 }, pattern: ["420867", "405398"] },
              { id: "A8", pallet: 2, slotC: 1, slotR: 0, w: 46, h: 26, d: 32, spec: "54*36*28", models: ["405228", "406010"], grid: { cols: 3, rows: 2, layers: 2 }, pattern: ["405228", "406010"] },
              { id: "A9", pallet: 2, slotC: 2, slotR: 0, w: 42, h: 24, d: 28, spec: "50*35*27", models: ["405790"], grid: { cols: 3, rows: 2, layers: 2 }, pattern: ["405790"] },
              { id: "A10", pallet: 2, slotC: 0, slotR: 1, w: 48, h: 28, d: 34, spec: "56*38*29", models: ["405398", "405228"], grid: { cols: 3, rows: 2, layers: 2 }, pattern: ["405398", "405228"] },
              { id: "A11", pallet: 2, slotC: 1, slotR: 1, w: 54, h: 30, d: 32, spec: "58*40*31", models: ["420867"], grid: { cols: 4, rows: 2, layers: 2 }, pattern: ["420867"] },
              { id: "A12", pallet: 2, slotC: 2, slotR: 1, w: 42, h: 24, d: 28, spec: "50*35*27", models: ["406010", "405790"], grid: { cols: 3, rows: 2, layers: 2 }, pattern: ["406010", "405790"] }
            ]
          }
        },
        {
          id: "PLN-A-002",
          customerId: "CUST-6108",
          shipDate: "2026-03-26",
          mode: "不合并",
          status: "已确认",
          orders: "405512+405601",
          kpis: { lineCount: 122, boxCount: 66, palletCount: 6, weight: 4340 },
          solutions: [
            { name: "保守", boxCount: 70, palletCount: 7, complexity: "低" },
            { name: "均衡", boxCount: 66, palletCount: 6, complexity: "中" },
            { name: "极致省箱", boxCount: 63, palletCount: 6, complexity: "高" }
          ],
          layout: {
            outerBoxes: [
              { id: "A2-1", pallet: 1, slotC: 0, slotR: 0, w: 54, h: 30, d: 32, spec: "58*40*31", models: ["405512"], grid: { cols: 4, rows: 2, layers: 2 }, pattern: ["405512"] },
              { id: "A2-2", pallet: 1, slotC: 1, slotR: 0, w: 46, h: 26, d: 32, spec: "54*36*28", models: ["405601"], grid: { cols: 3, rows: 2, layers: 2 }, pattern: ["405601"] },
              { id: "A2-3", pallet: 1, slotC: 2, slotR: 0, w: 42, h: 24, d: 28, spec: "50*35*27", models: ["405512"], grid: { cols: 3, rows: 2, layers: 2 }, pattern: ["405512"] }
            ]
          }
        }
      ],
      rules: {
        customerRules: [
          { customerId: "CUST-6002", customerName: "美国 BBB", mode: "合并", boxType: "我司彩盒", provider: "我司", special: "104->111" },
          { customerId: "CUST-6108", customerName: "加拿大 MNO", mode: "不合并", boxType: "客户彩盒", provider: "客户", special: "" }
        ],
        modelInner: [
          { model: "405398", inner: "104*2", unitWeight: 2.1, perCase: 40 },
          { model: "405228", inner: "105", unitWeight: 2.4, perCase: 36 },
          { model: "420867", inner: "111", unitWeight: 2.9, perCase: 24 },
          { model: "406010", inner: "102", unitWeight: 1.7, perCase: 48 }
        ],
        innerOuter: [
          { inner: "104", outerSpec: "56*38*29", perCase: 40, pallet: "116*116*103" },
          { inner: "105", outerSpec: "54*36*28", perCase: 36, pallet: "116*116*103" },
          { inner: "111", outerSpec: "58*40*31", perCase: 24, pallet: "116*80*103" },
          { inner: "102", outerSpec: "50*35*27", perCase: 48, pallet: "114*114*103" }
        ]
      }
    },
    B: {
      name: "数据集 B（欧洲客户）",
      customers: [
        { id: "CUST-7201", name: "德国 QRS", city: "Hamburg", packingMode: "合并" },
        { id: "CUST-7210", name: "法国 TUV", city: "Lyon", packingMode: "合并" }
      ],
      plans: [
        {
          id: "PLN-B-001",
          customerId: "CUST-7201",
          shipDate: "2026-04-01",
          mode: "合并",
          status: "草稿",
          orders: "510112+510310+510402",
          kpis: { lineCount: 196, boxCount: 104, palletCount: 9, weight: 7120 },
          solutions: [
            { name: "保守", boxCount: 110, palletCount: 10, complexity: "低" },
            { name: "均衡", boxCount: 104, palletCount: 9, complexity: "中" },
            { name: "极致省箱", boxCount: 99, palletCount: 8, complexity: "高" }
          ],
          layout: {
            outerBoxes: [
              { id: "B1", pallet: 1, slotC: 0, slotR: 0, w: 50, h: 30, d: 34, spec: "60*40*32", models: ["510112", "510310"], grid: { cols: 4, rows: 2, layers: 2 }, pattern: ["510112", "510310"] },
              { id: "B2", pallet: 1, slotC: 1, slotR: 0, w: 45, h: 26, d: 30, spec: "55*37*29", models: ["510402"], grid: { cols: 3, rows: 2, layers: 2 }, pattern: ["510402"] },
              { id: "B3", pallet: 1, slotC: 2, slotR: 0, w: 40, h: 24, d: 28, spec: "52*35*27", models: ["510112"], grid: { cols: 3, rows: 2, layers: 2 }, pattern: ["510112"] },
              { id: "B4", pallet: 2, slotC: 0, slotR: 0, w: 50, h: 30, d: 34, spec: "60*40*32", models: ["510310", "510402"], grid: { cols: 4, rows: 2, layers: 2 }, pattern: ["510310", "510402"] }
            ]
          }
        },
        {
          id: "PLN-B-002",
          customerId: "CUST-7210",
          shipDate: "2026-04-02",
          mode: "合并",
          status: "待确认",
          orders: "520111+520205",
          kpis: { lineCount: 88, boxCount: 48, palletCount: 4, weight: 3220 },
          solutions: [
            { name: "保守", boxCount: 51, palletCount: 5, complexity: "低" },
            { name: "均衡", boxCount: 48, palletCount: 4, complexity: "中" },
            { name: "极致省箱", boxCount: 45, palletCount: 4, complexity: "高" }
          ],
          layout: {
            outerBoxes: [
              { id: "B2-1", pallet: 1, slotC: 0, slotR: 0, w: 44, h: 25, d: 29, spec: "54*36*28", models: ["520111"], grid: { cols: 3, rows: 2, layers: 2 }, pattern: ["520111"] },
              { id: "B2-2", pallet: 1, slotC: 1, slotR: 0, w: 40, h: 24, d: 28, spec: "52*35*27", models: ["520205"], grid: { cols: 3, rows: 2, layers: 2 }, pattern: ["520205"] }
            ]
          }
        }
      ],
      rules: {
        customerRules: [
          { customerId: "CUST-7201", customerName: "德国 QRS", mode: "合并", boxType: "我司白盒", provider: "我司", special: "105->111" },
          { customerId: "CUST-7210", customerName: "法国 TUV", mode: "合并", boxType: "我司彩盒", provider: "我司", special: "" }
        ],
        modelInner: [
          { model: "510112", inner: "107", unitWeight: 2.5, perCase: 32 },
          { model: "510310", inner: "111", unitWeight: 2.8, perCase: 24 },
          { model: "510402", inner: "105", unitWeight: 2.2, perCase: 36 },
          { model: "520205", inner: "104", unitWeight: 1.9, perCase: 40 }
        ],
        innerOuter: [
          { inner: "107", outerSpec: "60*40*32", perCase: 32, pallet: "116*116*103" },
          { inner: "111", outerSpec: "58*40*31", perCase: 24, pallet: "116*80*103" },
          { inner: "105", outerSpec: "55*37*29", perCase: 36, pallet: "116*116*103" },
          { inner: "104", outerSpec: "52*35*27", perCase: 40, pallet: "114*114*103" }
        ]
      }
    }
  };

  const STORAGE_KEY = "packing_demo_dataset";

  function safeDatasetKey(key) {
    return datasets[key] ? key : "A";
  }

  function getDatasetKeyFromUrl() {
    const key = new URLSearchParams(window.location.search).get("ds");
    return key ? safeDatasetKey(key) : null;
  }

  function getCurrentDatasetKey() {
    const fromUrl = getDatasetKeyFromUrl();
    if (fromUrl) {
      localStorage.setItem(STORAGE_KEY, fromUrl);
      return fromUrl;
    }
    return safeDatasetKey(localStorage.getItem(STORAGE_KEY) || "A");
  }

  function setCurrentDatasetKey(key) {
    const safe = safeDatasetKey(key);
    localStorage.setItem(STORAGE_KEY, safe);
    return safe;
  }

  function getCurrentDataset() {
    return datasets[getCurrentDatasetKey()];
  }

  function getPlanById(dataset, planId) {
    return dataset.plans.find(p => p.id === planId) || dataset.plans[0];
  }

  function buildDatasetSwitchHTML(activeKey) {
    return ["A", "B"].map(key => {
      const cls = key === activeKey ? "primary" : "ghost";
      return `<button class="${cls}" data-switch-dataset="${key}">数据集 ${key}</button>`;
    }).join("");
  }

  window.PACKING_DEMO = {
    datasets,
    getCurrentDatasetKey,
    setCurrentDatasetKey,
    getCurrentDataset,
    getPlanById,
    buildDatasetSwitchHTML
  };
})();
