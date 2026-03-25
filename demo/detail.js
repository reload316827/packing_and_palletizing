(function () {
  const API_BASE = "";

  const els = {
    detailTitle: document.getElementById("detailTitle"),
    detailSub: document.getElementById("detailSub"),
    datasetSwitch: document.getElementById("datasetSwitch"),
    planSelect: document.getElementById("planSelect"),
    modelFilter: document.getElementById("modelFilter"),
    specFilter: document.getElementById("specFilter"),
    reset3dFilters: document.getElementById("reset3dFilters"),
    viewPackingBtn: document.getElementById("viewPackingBtn"),
    viewPalletBtn: document.getElementById("viewPalletBtn"),
    detailKpis: document.getElementById("detailKpis"),
    solutionGrid: document.getElementById("solutionGrid"),
    ordersText: document.getElementById("ordersText"),
    metricsTable: document.getElementById("metricsTable"),
    sceneMeta: document.getElementById("sceneMeta"),
    viewer: document.getElementById("viewer"),
    toast: document.getElementById("toast")
  };

  const modelColors = {
    "405398": 0x74c0fc,
    "405228": 0x4dabf7,
    "420867": 0x63e6be,
    "406010": 0xffd43b,
    "405790": 0xffa94d,
  };

  const state = {
    plans: [],
    planId: new URLSearchParams(window.location.search).get("plan") || "",
    detail: null,
    selectedSolutionId: null,
    viewMode: "pallet",
  };

  let scene;
  let camera;
  let renderer;
  let controls;
  let sceneGroup;
  let edgeMaterial;

  function showToast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 1400);
  }

  async function requestJson(path, options) {
    const res = await fetch(`${API_BASE}${path}`, options);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HTTP ${res.status}: ${body}`);
    }
    return res.json();
  }

  function normalizeStatus(value) {
    const map = {
      DRAFT: "草稿",
      CALCULATING: "计算中",
      PENDING_CONFIRM: "待确认",
      CONFIRMED: "已确认",
      CALCULATE_FAILED: "计算失败"
    };
    return map[String(value || "")] || String(value || "-");
  }

  function normalizeMergeMode(value) {
    const text = String(value || "").trim();
    if (text === "MERGE" || text === "合并") return "合并";
    if (text === "NO_MERGE" || text === "不合并") return "不合并";
    return text || "-";
  }

  function parseSpec(specText, fallback) {
    const text = String(specText || "").replace(/cm/gi, "");
    const nums = text.match(/\d+(?:\.\d+)?/g) || [];
    if (nums.length < 3) return fallback;
    return [Number(nums[0]), Number(nums[1]), Number(nums[2])];
  }

  function ensurePlanId() {
    if (state.planId) return;
    if (state.plans.length > 0) state.planId = String(state.plans[0].id);
  }

  function parseMetrics(raw) {
    if (!raw) return {};
    if (typeof raw === "object") return raw;
    try {
      return JSON.parse(raw);
    } catch (err) {
      return {};
    }
  }

  function getCurrentViewModel() {
    const detail = state.detail;
    if (!detail) return null;

    const plan = detail.plan || {};
    const orders = detail.orders || [];
    const solutions = (detail.solutions || []).map(row => ({
      ...row,
      metrics: parseMetrics(row.metrics_payload),
    }));

    const selectedSolution = solutions.find(s => Number(s.id) === Number(state.selectedSolutionId)) || solutions[0] || null;
    if (!selectedSolution) {
      return {
        plan,
        orders,
        solutions,
        selectedSolution: null,
        boxes: [],
        modelOptions: [],
        specOptions: [],
      };
    }

    const boxRows = (detail.solution_item_boxes || []).filter(row => Number(row.solution_id) === Number(selectedSolution.id));
    const palletRows = (detail.solution_item_pallets || []).filter(row => Number(row.solution_id) === Number(selectedSolution.id));

    const modelMap = new Map();
    boxRows.forEach(row => {
      const key = String(row.carton_id || "");
      if (!modelMap.has(key)) modelMap.set(key, new Set());
      modelMap.get(key).add(String(row.model_code || "-").trim() || "-");
    });

    let boxes = [];
    if (palletRows.length > 0) {
      boxes = palletRows.map(row => {
        const models = [...(modelMap.get(String(row.carton_id || "")) || new Set(["-"]))];
        const dims = parseSpec(row.carton_spec_cm, [56, 38, 29]);
        const rowSeq = Number(row.row_seq || 1);
        return {
          cartonId: String(row.carton_id || "-"),
          palletSeq: Number(row.pallet_seq || 1),
          palletId: String(row.pallet_id || "PALLET-001"),
          spec: String(row.carton_spec_cm || "56*38*29"),
          pose: String(row.carton_pose || "upright"),
          w: Math.max(10, dims[0] * 0.45),
          d: Math.max(8, dims[1] * 0.45),
          h: Math.max(6, dims[2] * 0.35),
          models,
          grid: { cols: 3, rows: 2, layers: 2 },
          pattern: models,
          slotR: Math.floor((rowSeq - 1) / 3),
          slotC: (rowSeq - 1) % 3,
        };
      });
    } else {
      boxes = [...new Set(boxRows.map(row => String(row.carton_id || "")).filter(Boolean))].map((cartonId, idx) => {
        const rows = boxRows.filter(row => String(row.carton_id || "") === cartonId);
        const models = [...new Set(rows.map(row => String(row.model_code || "-").trim() || "-"))];
        return {
          cartonId,
          palletSeq: Math.floor(idx / 6) + 1,
          palletId: `PALLET-${String(Math.floor(idx / 6) + 1).padStart(3, "0")}`,
          spec: "56*38*29",
          pose: "upright",
          w: 25,
          d: 17,
          h: 12,
          models,
          grid: { cols: 3, rows: 2, layers: 2 },
          pattern: models,
          slotR: Math.floor((idx % 6) / 3),
          slotC: idx % 3,
        };
      });
    }

    const modelOptions = [...new Set(boxes.flatMap(row => row.models))].sort();
    const specOptions = [...new Set(boxes.map(row => row.spec))].sort();

    return {
      plan,
      orders,
      solutions,
      selectedSolution,
      boxes,
      modelOptions,
      specOptions,
    };
  }

  function filteredBoxes(vm) {
    const model = String(els.modelFilter.value || "").trim();
    const spec = String(els.specFilter.value || "").trim();
    return vm.boxes.filter(box => {
      if (model && !box.models.includes(model)) return false;
      if (spec && box.spec !== spec) return false;
      return true;
    });
  }

  function renderPlanOptions() {
    els.planSelect.innerHTML = state.plans
      .map(plan => `<option value="${plan.id}">#${plan.id} - ${plan.customer_code || "-"}</option>`)
      .join("");
    els.planSelect.value = String(state.planId || "");
  }

  function renderFilters(vm, keepSelected) {
    const oldModel = keepSelected ? els.modelFilter.value : "";
    const oldSpec = keepSelected ? els.specFilter.value : "";

    els.modelFilter.innerHTML = ['<option value="">全部型号</option>']
      .concat(vm.modelOptions.map(v => `<option value="${v}">${v}</option>`))
      .join("");
    els.specFilter.innerHTML = ['<option value="">全部外箱规格</option>']
      .concat(vm.specOptions.map(v => `<option value="${v}">${v}</option>`))
      .join("");

    if (keepSelected && vm.modelOptions.includes(oldModel)) els.modelFilter.value = oldModel;
    if (keepSelected && vm.specOptions.includes(oldSpec)) els.specFilter.value = oldSpec;
  }

  async function confirmSolution(solutionId) {
    try {
      await requestJson(`/api/plans/${encodeURIComponent(state.planId)}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ solution_id: solutionId, actor: "demo_user" })
      });
      showToast("方案确认成功");
      await loadPlanDetail(true);
    } catch (err) {
      showToast(`确认失败：${err.message}`);
    }
  }

  async function rollbackConfirmation() {
    try {
      await requestJson(`/api/plans/${encodeURIComponent(state.planId)}/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "demo rollback", actor: "demo_user" })
      });
      showToast("已回退到待确认");
      await loadPlanDetail(true);
    } catch (err) {
      showToast(`回退失败：${err.message}`);
    }
  }

  function renderSummary(vm) {
    const { plan, orders, selectedSolution } = vm;

    els.detailTitle.textContent = `任务详情 - #${plan.id}`;
    els.detailSub.textContent = `客户：${plan.customer_code || "-"} ｜ 发货日：${plan.ship_date || "-"} ｜ 状态：${normalizeStatus(plan.status)} ｜ 装箱要求：${normalizeMergeMode(plan.merge_mode)}`;

    const lineCount = orders.length;
    const boxCount = Number(selectedSolution ? selectedSolution.box_count : 0);
    const palletCount = Number(selectedSolution ? selectedSolution.pallet_count : 0);
    const weightKg = Number(selectedSolution ? selectedSolution.gross_weight_kg : 0);

    els.detailKpis.innerHTML = [
      { label: "订单行数", value: String(lineCount) },
      { label: "外箱数", value: String(boxCount) },
      { label: "托盘数", value: String(palletCount) },
      { label: "总毛重", value: `${weightKg.toFixed(1)} kg` },
    ].map(k => `<div class="kpi"><h4>${k.label}</h4><p>${k.value}</p></div>`).join("");

    const selectedId = Number(plan.final_solution_id || 0);
    els.solutionGrid.innerHTML = vm.solutions.map(s => {
      const isSelected = Number(s.id) === Number(selectedId);
      return `
        <article class="solution">
          <span class="badge">${s.tag || "-"}</span>
          <h4>${s.name}</h4>
          <div>外箱数：<strong>${s.box_count}</strong></div>
          <div>托盘数：<strong>${s.pallet_count}</strong></div>
          <div>总重：<strong>${Number(s.gross_weight_kg || 0).toFixed(1)} kg</strong></div>
          <button style="margin-top:8px;" class="${isSelected ? "primary" : "ghost"}" data-confirm-solution="${s.id}">${isSelected ? "已确认" : "确认此方案"}</button>
        </article>
      `;
    }).join("") + `<div style="margin-top:8px;"><button class="ghost" id="rollbackConfirmBtn">回退确认</button></div>`;

    els.ordersText.textContent = orders.map(row => row.order_no).join(" + ") || "-";
    els.metricsTable.innerHTML = [
      ["任务状态", normalizeStatus(plan.status)],
      ["方案数量", String(vm.solutions.length)],
      ["当前方案", selectedSolution ? `${selectedSolution.name} (#${selectedSolution.id})` : "-"],
      ["最终方案ID", plan.final_solution_id || "未确认"],
    ].map(row => `<tr><td>${row[0]}</td><td>${row[1]}</td></tr>`).join("");

    document.querySelectorAll("[data-confirm-solution]").forEach(btn => {
      btn.addEventListener("click", () => confirmSolution(Number(btn.dataset.confirmSolution)));
    });

    const rollbackBtn = document.getElementById("rollbackConfirmBtn");
    if (rollbackBtn) {
      rollbackBtn.addEventListener("click", rollbackConfirmation);
    }
  }

  function init3DScene() {
    if (!window.THREE || !THREE.OrbitControls) {
      els.sceneMeta.textContent = "Three.js 资源未加载，请检查 /demo/vendor 文件";
      return;
    }

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf3f8ff);

    camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2200);
    camera.position.set(200, 160, 230);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    els.viewer.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 70;
    controls.maxDistance = 900;
    controls.target.set(0, 35, 0);
    controls.update();

    els.viewer.addEventListener("contextmenu", e => e.preventDefault());
    els.viewer.addEventListener("dblclick", () => {
      camera.position.set(200, 160, 230);
      controls.target.set(0, 35, 0);
      controls.update();
    });

    const hemi = new THREE.HemisphereLight(0xffffff, 0xb2becd, 0.9);
    hemi.position.set(0, 320, 0);
    scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xffffff, 0.72);
    dir.position.set(200, 250, 150);
    dir.castShadow = true;
    scene.add(dir);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(960, 960),
      new THREE.MeshStandardMaterial({ color: 0xe5edf5, roughness: 0.95, metalness: 0 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(960, 30, 0x9fb3c8, 0xc8d6e5);
    scene.add(grid);

    edgeMaterial = new THREE.LineBasicMaterial({ color: 0x1f2937, transparent: true, opacity: 0.26 });

    function resize() {
      const w = els.viewer.clientWidth;
      const h = els.viewer.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }

    window.addEventListener("resize", resize);
    resize();

    (function animate() {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    })();
  }

  function addBox(group, cfg) {
    const geo = new THREE.BoxGeometry(cfg.w, cfg.h, cfg.d);
    const mat = new THREE.MeshStandardMaterial({
      color: cfg.color,
      transparent: cfg.opacity !== undefined,
      opacity: cfg.opacity ?? 1,
      roughness: 0.55,
      metalness: 0.05
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cfg.x, cfg.y, cfg.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMaterial);
    edge.position.copy(mesh.position);
    group.add(edge);

    return mesh;
  }

  function addLabel(group, text, x, y, z, opt = {}) {
    const width = opt.width || 360;
    const height = opt.height || 110;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = opt.bg || "rgba(15, 23, 42, 0.80)";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(148, 163, 184, 0.7)";
    ctx.lineWidth = 3;
    ctx.strokeRect(1, 1, width - 2, height - 2);

    ctx.fillStyle = "#f8fafc";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${opt.fontSize || 22}px Microsoft YaHei`;

    const lines = String(text).split("\n");
    const startY = height / 2 - ((lines.length - 1) * 16);
    lines.forEach((line, index) => ctx.fillText(line, width / 2, startY + index * 32));

    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    sprite.scale.set(opt.scaleX || 24, opt.scaleY || 7.5, 1);
    sprite.position.set(x, y, z);
    group.add(sprite);
  }

  function buildPalletView(boxes, group) {
    const palletMap = new Map();
    boxes.forEach(box => {
      const key = box.palletSeq;
      if (!palletMap.has(key)) palletMap.set(key, []);
      palletMap.get(key).push(box);
    });
    const pallets = [...palletMap.entries()].sort((a, b) => a[0] - b[0]);

    const spacing = 180;
    pallets.forEach(([palletSeq, list], idx) => {
      const xOffset = (idx - (pallets.length - 1) / 2) * spacing;
      addBox(group, { x: xOffset, y: 6, z: 0, w: 112, h: 12, d: 112, color: 0x8d5524 });
      addLabel(group, `??${palletSeq}\n116*116*103`, xOffset, 16, -64, { scaleX: 20, scaleY: 6, fontSize: 20 });

      list.forEach(box => {
        const x = xOffset - 34 + box.slotC * 34;
        const z = -34 + box.slotR * 34;
        const y = 12 + box.h / 2 + 1;

        addBox(group, {
          x,
          y,
          z,
          w: box.w,
          h: box.h,
          d: box.d,
          color: box.pose === "vertical" ? 0xff922b : 0x60a5fa,
        });

        addLabel(group, `${box.spec}\n${box.models.join("+")}`, x, y + box.h / 2 + 6, z, { scaleX: 22, scaleY: 6.5, fontSize: 18 });
      });
    });
  }

  function buildPackingView(boxes, group) {
    addBox(group, { x: 0, y: 6, z: 0, w: 170, h: 12, d: 112, color: 0x8d5524 });

    const showBoxes = boxes.slice(0, 4);
    const startX = -58;

    showBoxes.forEach((box, i) => {
      const xBase = startX + i * 40;
      const yOuter = 12 + box.h / 2 + 1;

      addBox(group, { x: xBase, y: yOuter, z: 0, w: box.w, h: box.h, d: box.d, color: 0xf08c00, opacity: 0.28 });
      addLabel(group, `${box.spec}\n${box.models.join("+")}`, xBase, yOuter + box.h / 2 + 6, 0, { scaleX: 22, scaleY: 6.5, fontSize: 18 });

      const cols = box.grid.cols;
      const rows = box.grid.rows;
      const layers = box.grid.layers;
      const innerW = (box.w - 8) / cols;
      const innerD = (box.d - 8) / rows;
      const innerH = (box.h - 8) / layers;
      let idx = 0;

      for (let ly = 0; ly < layers; ly += 1) {
        for (let rz = 0; rz < rows; rz += 1) {
          for (let cx = 0; cx < cols; cx += 1) {
            const model = box.pattern[idx % box.pattern.length];
            idx += 1;

            const x = xBase - box.w / 2 + 4 + innerW / 2 + cx * innerW;
            const y = 12 + 4 + innerH / 2 + ly * innerH;
            const z = -box.d / 2 + 4 + innerD / 2 + rz * innerD;

            addBox(group, {
              x,
              y,
              z,
              w: Math.max(innerW - 1.2, 5),
              h: Math.max(innerH - 1.2, 5),
              d: Math.max(innerD - 1.2, 5),
              color: modelColors[model] || 0x94a3b8,
            });

            addLabel(group, model, x, y + innerH / 2 + 1.8, z, { scaleX: 8, scaleY: 2.8, fontSize: 15, bg: "rgba(15, 23, 42, 0.78)" });
          }
        }
      }
    });
  }

  function render3D(vm) {
    if (!scene) return;
    const boxes = filteredBoxes(vm);

    if (sceneGroup) {
      scene.remove(sceneGroup);
    }
    sceneGroup = new THREE.Group();

    if (!boxes.length) {
      els.sceneMeta.textContent = "当前筛选条件下无可展示外箱";
      scene.add(sceneGroup);
      return;
    }

    if (state.viewMode === "packing") {
      buildPackingView(boxes, sceneGroup);
      els.sceneMeta.textContent = `装箱视图：显示 ${Math.min(4, boxes.length)} 箱（共 ${boxes.length} 箱）`;
      els.viewPackingBtn.classList.add("primary");
      els.viewPalletBtn.classList.remove("primary");
    } else {
      buildPalletView(boxes, sceneGroup);
      const palletCount = new Set(boxes.map(b => b.palletSeq)).size;
      els.sceneMeta.textContent = `装托视图：托盘 ${palletCount} 个，外箱 ${boxes.length} 箱`;
      els.viewPalletBtn.classList.add("primary");
      els.viewPackingBtn.classList.remove("primary");
    }

    scene.add(sceneGroup);
  }

  async function loadPlanList() {
    const body = await requestJson("/api/plans");
    state.plans = body.plans || [];
    ensurePlanId();
    renderPlanOptions();

    els.datasetSwitch.innerHTML = `<button class="ghost" id="refreshPlansBtn">刷新</button>`;
    const refreshBtn = document.getElementById("refreshPlansBtn");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", async () => {
        await loadPlanList();
        await loadPlanDetail(true);
        showToast("计划列表已刷新");
      });
    }
  }

  async function loadPlanDetail(resetFilters) {
    const body = await requestJson(`/api/plans/${encodeURIComponent(state.planId)}`);
    state.detail = body;

    const plan = body.plan || {};
    const solutions = body.solutions || [];
    state.selectedSolutionId = Number(plan.final_solution_id || 0) || Number((solutions[0] || {}).id || 0);

    const vm = getCurrentViewModel();
    renderSummary(vm);
    renderFilters(vm, !resetFilters);
    render3D(vm);
  }

  async function bootstrap() {
    init3DScene();
    try {
      await loadPlanList();
      if (!state.planId) {
        els.detailSub.textContent = "暂无可查看的计划";
        return;
      }
      await loadPlanDetail(true);
    } catch (err) {
      els.detailSub.textContent = `加载失败：${err.message}`;
      showToast("详情加载失败，请检查后端服务");
    }
  }

  els.planSelect.addEventListener("change", async () => {
    state.planId = String(els.planSelect.value || "");
    await loadPlanDetail(true);
  });

  [els.modelFilter, els.specFilter].forEach(el => {
    el.addEventListener("change", () => {
      const vm = getCurrentViewModel();
      if (vm) render3D(vm);
    });
  });

  els.reset3dFilters.addEventListener("click", () => {
    els.modelFilter.value = "";
    els.specFilter.value = "";
    const vm = getCurrentViewModel();
    if (vm) render3D(vm);
    showToast("3D 筛选已重置");
  });

  els.viewPackingBtn.addEventListener("click", () => {
    state.viewMode = "packing";
    const vm = getCurrentViewModel();
    if (vm) render3D(vm);
  });

  els.viewPalletBtn.addEventListener("click", () => {
    state.viewMode = "pallet";
    const vm = getCurrentViewModel();
    if (vm) render3D(vm);
  });

  bootstrap();
})();
