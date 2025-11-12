/* ------------------------------------------------------------------
 L’Oréal Product-Aware Routine Builder — Client Script (fixed version)
 - Loads products whether products.json is an array OR { products: [...] }
 - Normalizes categories so filters + routine builder always work
 - Shows product images if provided
 - Product grid + selection with localStorage
 - Description modal
 - Category filter + live text search
 - RTL toggle
 - Chat window w/ on-topic guard
 - Generate Routine:
     1) Try Cloudflare Worker (if WORKER_URL is set)
     2) Fallback local routine builder (no backend required)
------------------------------------------------------------------- */

const els = {
  grid: document.getElementById("productGrid"),
  selectedList: document.getElementById("selectedList"),
  category: document.getElementById("categorySelect"),
  search: document.getElementById("searchInput"),
  generate: document.getElementById("generateBtn"),
  chatWin: document.getElementById("chatWindow"),
  chatForm: document.getElementById("chatForm"),
  chatInput: document.getElementById("chatInput"),
  clearSelections: document.getElementById("clearSelections"),
  rtlToggle: document.getElementById("rtlToggle"),
  liveWebToggle: document.getElementById("liveWebToggle"),
  modal: document.getElementById("descModal"),
  modalTitle: document.getElementById("modalTitle"),
  modalBody: document.getElementById("modalBody"),
  modalClose: document.getElementById("modalClose"),
};

const STATE = {
  products: [],
  selectedIds: new Set(JSON.parse(localStorage.getItem("selectedIds") || "[]")),
  chat: [], // {role:'user'|'assistant', content:string}
  lastRoutine: null,
};

// ---------- Boot ----------
init().catch((err) => {
  console.error(err);
  alert("Could not load products.json. Make sure the file exists.");
});

async function init() {
  await loadProducts();
  wireEvents();
  renderGrid();
  renderSelected();
  greet();
}

// Accept either an array OR an object with { products: [...] }
async function loadProducts() {
  const res = await fetch("products.json", { cache: "no-store" });
  if (!res.ok) throw new Error("products.json not found");
  const data = await res.json();
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data.products)
    ? data.products
    : [];
  STATE.products = arr.map((p) => ({
    ...p,
    // ensure string ids (so Set logic is stable)
    id: String(p.id),
  }));
}

// ---------- Category normalization ----------
function mapCat(c) {
  const x = String(c || "").toLowerCase();
  // Canonical buckets our UI & routine understand:
  if (
    [
      "cleanser",
      "toner",
      "serum",
      "moisturizer",
      "sunscreen",
      "makeup",
      "haircare",
      "fragrance",
    ].includes(x)
  )
    return x;
  // Map common alternates → canonical buckets:
  if (x === "skincare") return "serum"; // treat as treatment step
  if (x === "suncare") return "sunscreen";
  if (x === "hair styling" || x === "hair color" || x === "men's grooming")
    return "haircare";
  return x || "serum";
}

// ---------- Rendering ----------
function productCard(p) {
  const isSelected = STATE.selectedIds.has(p.id);
  const cat = mapCat(p.category);
  const img = p.image
    ? `<img alt="" src="${escapeHtml(
        p.image
      )}" style="width:100%;height:140px;object-fit:contain;background:#0a0d12;border-bottom:1px solid var(--ring)">`
    : "";
  return `
    <article class="product ${isSelected ? "selected" : ""}" data-id="${p.id}">
      ${img}
      <header>
        <h3>${escapeHtml(p.name)}</h3>
        <span class="brand">${escapeHtml(p.brand || "L’Oréal")}</span>
      </header>
      <div class="body">
        <div class="tags">
          ${badge(cat)}
        </div>
      </div>
      <footer>
        <button class="select-btn" data-action="toggle">${
          isSelected ? "Unselect" : "Select"
        }</button>
        <button class="desc-btn" data-action="desc">Details</button>
      </footer>
    </article>
  `;
}

function renderGrid() {
  const q = (els.search.value || "").trim().toLowerCase();
  const cat = els.category.value; // 'all' or a canonical slot
  const filtered = STATE.products.filter((p) => {
    const catOk = cat === "all" || mapCat(p.category) === cat;
    const haystack = [p.name, p.brand, p.category, p.description]
      .join(" ")
      .toLowerCase();
    const qOk = !q || haystack.includes(q);
    return catOk && qOk;
  });
  els.grid.innerHTML = filtered.length
    ? filtered.map(productCard).join("")
    : `<p>No products match your filters.</p>`;
}

function renderSelected() {
  const items = STATE.products.filter((p) => STATE.selectedIds.has(p.id));
  els.selectedList.innerHTML = items.length
    ? items
        .map(
          (p) => `
        <li class="selected-item" data-id="${p.id}">
          <div>
            <strong>${escapeHtml(p.name)}</strong><br>
            <small>${escapeHtml(p.brand || "L’Oréal")} • ${escapeHtml(
            mapCat(p.category)
          )}</small>
          </div>
          <button class="remove-btn" data-action="remove">Remove</button>
        </li>
      `
        )
        .join("")
    : `<li class="selected-item"><small>No products selected yet.</small></li>`;

  els.generate.disabled = items.length === 0;
  localStorage.setItem(
    "selectedIds",
    JSON.stringify(Array.from(STATE.selectedIds))
  );
}

// ---------- Events ----------
function wireEvents() {
  // Grid clicks
  els.grid.addEventListener("click", (e) => {
    const card = e.target.closest(".product");
    if (!card) return;
    const id = card.getAttribute("data-id");
    const action = e.target.getAttribute("data-action");
    const product = STATE.products.find((p) => p.id === id);
    if (!product) return;

    if (action === "toggle") {
      if (STATE.selectedIds.has(id)) STATE.selectedIds.delete(id);
      else STATE.selectedIds.add(id);
      renderGrid();
      renderSelected();
    }
    if (action === "desc") {
      openDescription(product);
    }
  });

  // Selected list remove
  els.selectedList.addEventListener("click", (e) => {
    const li = e.target.closest(".selected-item");
    if (!li) return;
    const id = li.getAttribute("data-id");
    const action = e.target.getAttribute("data-action");
    if (action === "remove") {
      STATE.selectedIds.delete(id);
      renderGrid();
      renderSelected();
    }
  });

  // Filters
  els.category.addEventListener("change", renderGrid);
  els.search.addEventListener("input", renderGrid);

  // Clear all
  els.clearSelections.addEventListener("click", () => {
    STATE.selectedIds.clear();
    renderGrid();
    renderSelected();
  });

  // RTL toggle
  els.rtlToggle.addEventListener("click", () => {
    const root = document.documentElement;
    const isRtl = root.getAttribute("dir") === "rtl";
    root.setAttribute("dir", isRtl ? "ltr" : "rtl");
    els.rtlToggle.setAttribute("aria-pressed", String(!isRtl));
    els.rtlToggle.textContent = `RTL: ${isRtl ? "Off" : "On"}`;
  });

  // Modal
  els.modalClose.addEventListener("click", closeDescription);
  els.modal.addEventListener("click", (e) => {
    if (e.target === els.modal) closeDescription();
  });

  // Generate routine
  els.generate.addEventListener("click", handleGenerate);

  // Chat submit
  els.chatForm.addEventListener("submit", handleChat);
}

// ---------- Modal ----------
function openDescription(p) {
  els.modalTitle.textContent = p.name;
  els.modalBody.textContent = p.description || "No description available.";
  if (typeof els.modal.showModal === "function") els.modal.showModal();
  else els.modal.setAttribute("open", "");
}
function closeDescription() {
  els.modal.close ? els.modal.close() : els.modal.removeAttribute("open");
}

// ---------- Chat window helpers ----------
function greet() {
  addMsg(
    "assistant",
    "Hi! Pick a few products, then hit “Generate Routine.” Ask follow-ups about order, when to use, and frequency."
  );
}
function addMsg(role, text) {
  STATE.chat.push({ role, content: text });
  const row = document.createElement("div");
  row.className = `msg ${role === "user" ? "user" : "ai"}`;
  row.innerHTML = `<div class="bubble">${escapeHtml(text)}</div>`;
  els.chatWin.appendChild(row);
  els.chatWin.scrollTop = els.chatWin.scrollHeight;
}

function onTopic(text) {
  const s = text.toLowerCase();
  return /(skin|face|acne|spf|sunscreen|cleanser|toner|serum|moisturizer|retinol|niacinamide|vitamin c|makeup|hair|shampoo|conditioner|fragrance|perfume|loreal|garnier|lancome|routine|oily|dry|combination|sensitive|pores|hyperpigmentation|texture|mask|exfoliat)/.test(
    s
  );
}

// ---------- Generate Routine ----------
async function handleGenerate() {
  const selected = STATE.products.filter((p) => STATE.selectedIds.has(p.id));
  if (selected.length === 0) return;
  addMsg("user", "Generate a personalized routine from my selected products.");
  setThinking(true);

  // 1) Try Worker if provided
  const workerUrl = (window.APP_CONFIG && window.APP_CONFIG.WORKER_URL) || "";
  if (workerUrl && /^https?:\/\//.test(workerUrl)) {
    try {
      const res = await fetch(workerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: STATE.chat,
          products: selected.map(stripProduct),
          web: !!els.liveWebToggle?.checked,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.text || data.routine || "(no response)";
        STATE.lastRoutine = data.routine || text;
        addMsg("assistant", text);
        setThinking(false);
        return;
      }
    } catch (e) {
      console.warn("Worker call failed, using local fallback.", e);
    }
  }

  // 2) Fallback: local routine builder (no backend needed)
  const text = buildLocalRoutine(selected);
  STATE.lastRoutine = text;
  addMsg("assistant", text);
  setThinking(false);
}

function stripProduct(p) {
  return {
    id: String(p.id),
    name: p.name,
    brand: p.brand,
    category: mapCat(p.category),
    description: p.description,
    image: p.image || "",
  };
}

function buildLocalRoutine(selected) {
  // Categorize selected using normalized categories
  const byCat = (cat) => selected.filter((p) => mapCat(p.category) === cat);
  const cleanser = byCat("cleanser")[0];
  const toner = byCat("toner")[0];
  const serum = byCat("serum")[0];
  const moisturizer = byCat("moisturizer")[0];
  const sunscreen = byCat("sunscreen")[0];

  const extras = selected.filter(
    (p) =>
      !["cleanser", "toner", "serum", "moisturizer", "sunscreen"].includes(
        mapCat(p.category)
      )
  );

  const stepsAM = [];
  const stepsPM = [];

  if (cleanser) {
    stepsAM.push(step(cleanser));
    stepsPM.push(step(cleanser));
  }
  if (toner) {
    stepsAM.push(step(toner));
    stepsPM.push(step(toner));
  }
  if (serum) {
    stepsAM.push(step(serum));
    stepsPM.push(step(serum));
  }
  if (moisturizer) {
    stepsAM.push(step(moisturizer));
    stepsPM.push(step(moisturizer));
  }
  if (sunscreen) {
    stepsAM.push(step(sunscreen, "last, 2-finger rule (SPF 30+)"));
  }

  // Extras: place makeup after sunscreen AM, haircare separate, fragrance last
  const makeup = extras
    .filter((p) => mapCat(p.category) === "makeup")
    .map(step);
  const haircare = extras
    .filter((p) => mapCat(p.category) === "haircare")
    .map(step);
  const fragrance = extras
    .filter((p) => mapCat(p.category) === "fragrance")
    .map(step);

  const am = bullets([
    ...stepsAM,
    ...(makeup.length
      ? ["(Optional) Makeup: then apply selected makeup."]
      : []),
  ]);
  const pm = bullets(stepsPM);

  const reminders = [
    !sunscreen
      ? "No sunscreen selected — consider adding SPF 30+ for AM."
      : null,
    "Patch-test new products on the inner arm for 24 hours.",
    "Introduce actives (retinol, acids) slowly: 2–3×/week, increase as tolerated.",
    "Apply from thinnest to thickest textures.",
  ].filter(Boolean);

  return [
    "Here’s a simple routine based on your selected products:",
    "",
    "AM",
    am,
    "",
    "PM",
    pm,
    haircare.length
      ? `\nHaircare (use as directed):\n${bullets(haircare)}`
      : "",
    fragrance.length ? `\nFragrance (last step):\n${bullets(fragrance)}` : "",
    "",
    "Notes",
    bullets(reminders),
  ].join("\n");
}

function step(p, note) {
  return `• ${p.name} — ${mapCat(p.category)}${note ? ` (${note})` : ""}`;
}
function bullets(arr) {
  if (!arr || !arr.length) return "• (none selected)";
  return arr.map((x) => (x.startsWith("•") ? x : `• ${x}`)).join("\n");
}

function setThinking(on) {
  if (on) {
    els.generate.disabled = true;
    addMsg("assistant", "…thinking…");
  } else {
    els.generate.disabled = STATE.selectedIds.size === 0;
  }
}

// ---------- Chat handling (simple local fallback) ----------
async function handleChat(e) {
  e.preventDefault();
  const q = (els.chatInput.value || "").trim();
  if (!q) return;

  if (!onTopic(q)) {
    addMsg(
      "assistant",
      "Let’s keep it beauty-focused (skincare, haircare, makeup, fragrance)."
    );
    els.chatInput.value = "";
    return;
  }

  addMsg("user", q);
  els.chatInput.value = "";

  // If Worker present, forward to it; else answer locally
  const workerUrl = (window.APP_CONFIG && window.APP_CONFIG.WORKER_URL) || "";
  if (workerUrl && /^https?:\/\//.test(workerUrl)) {
    try {
      const res = await fetch(workerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: STATE.chat,
          products: STATE.products
            .filter((p) => STATE.selectedIds.has(String(p.id)))
            .map(stripProduct),
          web: !!els.liveWebToggle?.checked,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        addMsg("assistant", data.text || "(no response)");
        return;
      }
    } catch (e) {
      console.warn("Worker chat failed, falling back.", e);
    }
  }

  // Local canned follow-ups
  addMsg("assistant", localFollowUp(q));
}

function localFollowUp(q) {
  const s = q.toLowerCase();
  if (s.includes("order") || s.includes("layer")) {
    return "General order: Cleanser → Toner → Serum → Moisturizer → (AM) Sunscreen → Makeup. Go from thinnest to thickest textures.";
  }
  if (s.includes("retinol")) {
    return "Retinol: start 2–3×/week at night after cleanser/toner, before moisturizer. Avoid layering with strong acids the same night; always wear SPF in the morning.";
  }
  if (s.includes("vitamin c") || s.includes("vit c")) {
    return "Vitamin C is typically used in the morning after cleanser/toner and before moisturizer and SPF.";
  }
  if (s.includes("sunscreen") || s.includes("spf")) {
    return "Use SPF 30+ every morning as the last skincare step before makeup. Use the 2-finger rule and reapply every 2 hours if in sun.";
  }
  return "Got it. If you want, tell me which products you’re using and I’ll explain where each fits (AM or PM) and how often.";
}

// ---------- Utils ----------
function badge(text) {
  return `<span class="tag">${escapeHtml(text || "")}</span>`;
}
function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        m
      ])
  );
}
