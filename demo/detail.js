(function () {
  const {
    datasets,
    setCurrentDatasetKey,
    getCurrentDatasetKey,
    buildDatasetSwitchHTML,
    getPlanById
  } = window.PACKING_DEMO;

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
    "510112": 0x91a7ff,
    "510310": 0x9775fa,
    "510402": 0xf783ac,
    "520111": 0x66d9e8,
    "520205": 0xb197fc,
    "405512": 0x74c69d,
    "405601": 0xe599f7
  };

  let datasetKey = getCurrentDatasetKey();
  let dataset = datasets[datasetKey];
  let selectedPlanId = new URLSearchParams(window.location.search).get("plan") || dataset.plans[0].id;
  let viewMode = "pallet";

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
    showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 1200);
  }

  function currentPlan() {
    return getPlanById(dataset, selectedPlanId);
  }

  function renderSwitch() {
    els.datasetSwitch.innerHTML = buildDatasetSwitchHTML(datasetKey);
    els.datasetSwitch.querySelectorAll("[data-switch-dataset]").forEach(btn => {
      btn.addEventListener("click", () => {
        datasetKey = setCurrentDatasetKey(btn.dataset.switchDataset);
        dataset = datasets[datasetKey];
        selectedPlanId = dataset.plans[0].id;
        showToast(`已切换到数据集 ${datasetKey}`);
        renderAll(true);
      });
    });
  }

  function renderPlanOptions() {
    els.planSelect.innerHTML = dataset.plans
      .map(p => `<option value="${p.id}">${p.id} - ${p.orders}</option>`)
      .join("");
    els.planSelect.value = selectedPlanId;
  }

  function render3DFilterOptions(plan) {
    const modelSet = new Set();
    const specSet = new Set();

    plan.layout.outerBoxes.forEach(box => {
      specSet.add(box.spec);
      box.models.forEach(m => modelSet.add(m));
    });

    const modelOptions = ['<option value="">全部型号</option>']
      .concat([...modelSet].sort().map(m => `<option value="${m}">${m}</option>`));
    const specOptions = ['<option value="">全部外箱规格</option>']
      .concat([...specSet].sort().map(s => `<option value="${s}">${s}</option>`));

    const modelPrev = els.modelFilter.value;
    const specPrev = els.specFilter.value;

    els.modelFilter.innerHTML = modelOptions.join("");
    els.specFilter.innerHTML = specOptions.join("");

    if ([...modelSet].includes(modelPrev)) els.modelFilter.value = modelPrev;
    if ([...specSet].includes(specPrev)) els.specFilter.value = specPrev;
  }

  function filterBoxes(plan) {
    const model = els.modelFilter.value;
    const spec = els.specFilter.value;

    return plan.layout.outerBoxes.filter(box => {
      if (model && !box.models.includes(model)) return false;
      if (spec && box.spec !== spec) return false;
      return true;
    });
  }

  function renderSummary(plan) {
    const customer = dataset.customers.find(c => c.id === plan.customerId);
    els.detailTitle.textContent = `任务详情 - ${plan.id}`;
    els.detailSub.textContent = `${dataset.name} ｜ 客户：${customer ? customer.name : plan.customerId} ｜ 发货：${plan.shipDate} ｜ 状态：${plan.status}`;

    const kpiItems = [
      { label: "订单行数", value: String(plan.kpis.lineCount) },
      { label: "外箱总数", value: String(plan.kpis.boxCount) },
      { label: "托盘总数", value: String(plan.kpis.palletCount) },
      { label: "总毛重", value: `${plan.kpis.weight} kg` }
    ];
    els.detailKpis.innerHTML = kpiItems.map(k => `<div class="kpi"><h4>${k.label}</h4><p>${k.value}</p></div>`).join("");

    els.solutionGrid.innerHTML = plan.solutions.map(s => `
      <article class="solution">
        <span class="badge">${s.complexity}复杂度</span>
        <h4>${s.name}</h4>
        <div>外箱：<strong>${s.boxCount}</strong></div>
        <div>托盘：<strong>${s.palletCount}</strong></div>
        <button style="margin-top:8px;" class="ghost" data-demo-action>选为最终方案</button>
      </article>
    `).join("");

    els.ordersText.textContent = plan.orders;
    els.metricsTable.innerHTML = [
      ["装箱要求", plan.mode],
      ["任务状态", plan.status],
      ["候选方案数", String(plan.solutions.length)],
      ["数据集", datasetKey]
    ].map(row => `<tr><td>${row[0]}</td><td>${row[1]}</td></tr>`).join("");

    document.querySelectorAll("[data-demo-action]").forEach(btn => {
      btn.addEventListener("click", () => showToast("Demo 模式：未接入真实保存逻辑"));
    });
  }

  function init3DScene() {
    if (!window.THREE || !THREE.OrbitControls) {
      els.sceneMeta.textContent = "Three.js 加载失败，请检查 vendor 资源。";
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
    controls.maxDistance = 800;
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
    const pallets = [...new Set(boxes.map(b => b.pallet))].sort((a, b) => a - b);
    if (!pallets.length) return;

    const spacing = 180;
    pallets.forEach((palletNo, idx) => {
      const xOffset = (idx - (pallets.length - 1) / 2) * spacing;
      addBox(group, { x: xOffset, y: 6, z: 0, w: 112, h: 12, d: 112, color: 0x8d5524 });
      addLabel(group, `托盘${palletNo}\n116*116*103`, xOffset, 16, -64, { scaleX: 20, scaleY: 6, fontSize: 20 });

      const palletBoxes = boxes.filter(b => b.pallet === palletNo);
      palletBoxes.forEach(box => {
        const x = xOffset - 34 + box.slotC * 34;
        const z = -34 + box.slotR * 34;
        const y = 12 + box.h / 2 + 1;

        addBox(group, { x, y, z, w: box.w, h: box.h, d: box.d, color: 0xffa94d });
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

      addBox(group, {
        x: xBase,
        y: yOuter,
        z: 0,
        w: box.w,
        h: box.h,
        d: box.d,
        color: 0xf08c00,
        opacity: 0.28
      });

      addLabel(group, `${box.spec}\n${box.models.join("+")}`, xBase, yOuter + box.h / 2 + 6, 0, {
        scaleX: 22,
        scaleY: 6.5,
        fontSize: 18
      });

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
              color: modelColors[model] || 0x94a3b8
            });

            addLabel(group, model, x, y + innerH / 2 + 1.8, z, {
              scaleX: 8,
              scaleY: 2.8,
              fontSize: 15,
              bg: "rgba(15, 23, 42, 0.78)"
            });
          }
        }
      }
    });
  }

  function render3D() {
    if (!scene) return;
    const plan = currentPlan();
    const boxes = filterBoxes(plan);

    if (sceneGroup) {
      scene.remove(sceneGroup);
    }

    sceneGroup = new THREE.Group();

    if (!boxes.length) {
      els.sceneMeta.textContent = "筛选结果为空，请放宽型号或外箱规格筛选条件。";
      scene.add(sceneGroup);
      return;
    }

    if (viewMode === "packing") {
      buildPackingView(boxes, sceneGroup);
      els.sceneMeta.textContent = `装箱视图：展示 ${Math.min(4, boxes.length)} 个外箱（共匹配 ${boxes.length} 个）`;
      els.viewPackingBtn.classList.add("primary");
      els.viewPalletBtn.classList.remove("primary");
    } else {
      buildPalletView(boxes, sceneGroup);
      const palletCount = new Set(boxes.map(b => b.pallet)).size;
      els.sceneMeta.textContent = `装托视图：${palletCount} 托盘，${boxes.length} 外箱（已应用筛选）`;
      els.viewPalletBtn.classList.add("primary");
      els.viewPackingBtn.classList.remove("primary");
    }

    scene.add(sceneGroup);
  }

  function renderAll(resetFilters) {
    renderSwitch();
    renderPlanOptions();

    const plan = currentPlan();
    if (resetFilters) {
      els.modelFilter.value = "";
      els.specFilter.value = "";
    }
    render3DFilterOptions(plan);
    renderSummary(plan);
    render3D();
  }

  els.planSelect.addEventListener("change", () => {
    selectedPlanId = els.planSelect.value;
    renderAll(true);
  });

  [els.modelFilter, els.specFilter].forEach(el => {
    el.addEventListener("change", render3D);
  });

  els.reset3dFilters.addEventListener("click", () => {
    els.modelFilter.value = "";
    els.specFilter.value = "";
    showToast("3D 筛选已重置");
    render3D();
  });

  els.viewPackingBtn.addEventListener("click", () => {
    viewMode = "packing";
    render3D();
  });

  els.viewPalletBtn.addEventListener("click", () => {
    viewMode = "pallet";
    render3D();
  });

  init3DScene();
  renderAll(true);
})();
