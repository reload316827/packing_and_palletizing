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
  controls.minDistance = 70;
  controls.maxDistance = 650;
  controls.target.set(0, 35, 0);
  controls.update();

  container.addEventListener("contextmenu", event => event.preventDefault());
  container.addEventListener("dblclick", () => {
    camera.position.set(180, 140, 200);
    controls.target.set(0, 35, 0);
    controls.update();
  });

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
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
    sprite.scale.set(cfg.scaleX || 26, cfg.scaleY || 8, 1);
    sprite.position.set(x, y, z);
    group.add(sprite);
  }

  function buildPalletView(group) {
    const boxCatalog = [
      { w: 30, d: 26, h: 24, spec: "56*38*29", models: ["405398", "405228"], color: 0xffd8a8 },
      { w: 28, d: 24, h: 22, spec: "54*36*28", models: ["420867"], color: 0xffc078 },
      { w: 32, d: 28, h: 25, spec: "58*40*31", models: ["406010", "405790"], color: 0xffa94d },
      { w: 26, d: 23, h: 21, spec: "50*35*27", models: ["405228"], color: 0xff922b }
    ];

    const palletPositions = [-82, 82];
    palletPositions.forEach((xOffset, palletIdx) => {
      addBox(group, { x: xOffset, y: 6, z: 0, w: 110, h: 12, d: 110, color: 0x8d5524 });
      createLabel(group, `托盘${palletIdx + 1}\\n116*116*103`, xOffset, 16, -62, {
        scaleX: 20,
        scaleY: 6,
        fontSize: 20
      });

      const startX = xOffset - 34;
      const startZ = -34;
      const cell = 34;
      let idx = palletIdx;

      for (let row = 0; row < 3; row += 1) {
        for (let col = 0; col < 3; col += 1) {
          const box = boxCatalog[idx % boxCatalog.length];
          const x = startX + col * cell;
          const z = startZ + row * cell;
          const y = 12 + box.h / 2 + 1;
          idx += 1;

          addBox(group, { x, y, z, w: box.w, h: box.h, d: box.d, color: box.color });
          createLabel(group, `${box.spec}\\n${box.models.join("+")}`, x, y + box.h / 2 + 6, z, {
            scaleX: 22,
            scaleY: 6.8,
            fontSize: 18
          });
        }
      }
    });
  }

  function buildPackingView(group) {
    addBox(group, { x: 0, y: 6, z: 0, w: 150, h: 12, d: 104, color: 0x8d5524 });

    const modelColors = {
      "405398": 0x74c0fc,
      "405228": 0x4dabf7,
      "420867": 0x63e6be,
      "406010": 0xffd43b,
      "405790": 0xffa94d
    };

    const outerBoxes = [
      {
        x: -48, z: 0, w: 48, h: 28, d: 34,
        spec: "56*38*29",
        models: ["405398", "405228"],
        grid: { cols: 3, rows: 2, layers: 2 },
        pattern: ["405398", "405228"]
      },
      {
        x: 8, z: 0, w: 54, h: 30, d: 32,
        spec: "58*40*31",
        models: ["420867"],
        grid: { cols: 4, rows: 2, layers: 2 },
        pattern: ["420867"]
      },
      {
        x: 63, z: 0, w: 42, h: 24, d: 28,
        spec: "50*35*27",
        models: ["406010", "405790"],
        grid: { cols: 3, rows: 2, layers: 2 },
        pattern: ["406010", "405790", "406010"]
      }
    ];

    outerBoxes.forEach(box => {
      const outerY = 12 + box.h / 2 + 1;
      addBox(group, {
        x: box.x,
        y: outerY,
        z: box.z,
        w: box.w,
        h: box.h,
        d: box.d,
        color: 0xf08c00,
        opacity: 0.28
      });

      createLabel(group, `${box.spec}\\n${box.models.join("+")}`, box.x, outerY + box.h / 2 + 6, box.z, {
        scaleX: 22,
        scaleY: 6.8,
        fontSize: 18
      });

      const { cols, rows, layers } = box.grid;
      const innerW = (box.w - 8) / cols;
      const innerD = (box.d - 8) / rows;
      const innerH = (box.h - 8) / layers;
      let modelIndex = 0;

      for (let ly = 0; ly < layers; ly += 1) {
        for (let rz = 0; rz < rows; rz += 1) {
          for (let cx = 0; cx < cols; cx += 1) {
            const model = box.pattern[modelIndex % box.pattern.length];
            modelIndex += 1;

            const x = box.x - box.w / 2 + 4 + innerW / 2 + cx * innerW;
            const y = 12 + 4 + innerH / 2 + ly * innerH;
            const z = box.z - box.d / 2 + 4 + innerD / 2 + rz * innerD;

            addBox(group, {
              x, y, z,
              w: Math.max(innerW - 1.2, 5),
              h: Math.max(innerH - 1.2, 5),
              d: Math.max(innerD - 1.2, 5),
              color: modelColors[model] || 0x94a3b8
            });

            createLabel(group, model, x, y + innerH / 2 + 1.8, z, {
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

  function setViewMode(mode) {
    if (sceneGroup) {
      scene.remove(sceneGroup);
    }

    sceneGroup = new THREE.Group();

    if (mode === "packing") {
      buildPackingView(sceneGroup);
      meta.textContent = "当前：装箱视图（1 托盘 / 3 外箱规格 / 40 内盒，内盒标型号，外箱标内含型号）";
      btnPacking.classList.add("primary");
      btnPallet.classList.remove("primary");
    } else {
      buildPalletView(sceneGroup);
      meta.textContent = "当前：装托视图（2 托盘 / 混合外箱规格，外箱标签显示内含型号集合）";
      btnPallet.classList.add("primary");
      btnPacking.classList.remove("primary");
    }

    scene.add(sceneGroup);
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

  btnPacking.addEventListener("click", () => setViewMode("packing"));
  btnPallet.addEventListener("click", () => setViewMode("pallet"));

  window.addEventListener("resize", resizeRenderer);
  resizeRenderer();
  setViewMode("pallet");
  animate();
}

renderKpis();
renderCustomer();
renderPlanTable();
renderSolutions();
renderMappingTables();
setupDemoButtons();
createInteractive3DViewer();
