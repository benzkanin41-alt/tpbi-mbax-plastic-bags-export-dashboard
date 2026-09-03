(function () {
  "use strict";

  const RAW_DATA = window.TPBIMBAX_EXPORT_DATA || window.MOC_EXPORT_DATA;
  const EXPECTED_HS_CODES = ["392321", "392329"];
  const COMBINED_CODE = "COMBINED";
  const THEME_STORAGE_KEY = "tpbiMbaxExportTheme";
  const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const SERIES_COLORS = ["#2dd4bf", "#60a5fa", "#fbbf24", "#fb7185", "#4ade80", "#c084fc", "#22d3ee", "#fb923c", "#818cf8", "#34d399"];
  const METRIC_LABELS = { value: "มูลค่า", quantity: "ปริมาณ" };
  const PERIOD_LABELS = { month: "รายเดือน", quarter: "รายไตรมาส", year: "รายปี" };
  const DIMENSION_LABELS = { total: "รวมทุกประเทศ", country: "รายประเทศ", continent: "รายทวีป" };
  const HS_SCOPE_LABELS = {
    combined: "รวม HS 392321 + 392329",
    "392321": "HS 392321 — ถุง/กระสอบ PE",
    "392329": "HS 392329 — ถุง/กระสอบพลาสติกอื่น",
  };
  const DATA_ERROR_HTML = "<strong>ไม่สามารถโหลดข้อมูล Dashboard</strong><span>ไม่พบ data.js หรือรูปแบบข้อมูลไม่ครบ กรุณารันขั้นตอนอัปเดตข้อมูลแล้วเปิดหน้าอีกครั้ง</span>";

  const state = {
    hsScope: "combined",
    periodType: "month",
    dimension: "total",
    metric: "value",
    growth: "mom",
    rowLimit: 100,
    sortKey: "period",
    sortDir: "desc",
    entitySearch: "",
    selectedIds: new Set(["TOTAL"]),
    selectedChartPoints: { level: null, growth: null },
  };

  const els = {
    appError: document.getElementById("appError"),
    appRoot: document.getElementById("appRoot"),
    dashboardTitle: document.getElementById("dashboardTitle"),
    coverageText: document.getElementById("coverageText"),
    sourceLink: document.getElementById("sourceLink"),
    downloadCsvBtn: document.getElementById("downloadCsvBtn"),
    themeToggle: document.getElementById("themeToggle"),
    themeToggleText: document.getElementById("themeToggleText"),
    kpiGrid: document.getElementById("kpiGrid"),
    hsScopeSelect: document.getElementById("hsScopeSelect"),
    periodControls: document.getElementById("periodControls"),
    dimensionSelect: document.getElementById("dimensionSelect"),
    metricSelect: document.getElementById("metricSelect"),
    growthSelect: document.getElementById("growthSelect"),
    entityBand: document.getElementById("entityBand"),
    entitySearch: document.getElementById("entitySearch"),
    entityList: document.getElementById("entityList"),
    selectTopBtn: document.getElementById("selectTopBtn"),
    selectAllBtn: document.getElementById("selectAllBtn"),
    clearSelectionBtn: document.getElementById("clearSelectionBtn"),
    levelSubtitle: document.getElementById("levelSubtitle"),
    levelUnit: document.getElementById("levelUnit"),
    levelChart: document.getElementById("levelChart"),
    levelPointDetail: document.getElementById("levelPointDetail"),
    growthSubtitle: document.getElementById("growthSubtitle"),
    growthChart: document.getElementById("growthChart"),
    growthPointDetail: document.getElementById("growthPointDetail"),
    tableSubtitle: document.getElementById("tableSubtitle"),
    sortKeySelect: document.getElementById("sortKeySelect"),
    sortDirSelect: document.getElementById("sortDirSelect"),
    rowLimitSelect: document.getElementById("rowLimitSelect"),
    shareHeader: document.getElementById("shareHeader"),
    growthValueHeader: document.getElementById("growthValueHeader"),
    growthQuantityHeader: document.getElementById("growthQuantityHeader"),
    tableBody: document.getElementById("dataTableBody"),
    sourceDetails: document.getElementById("sourceDetails"),
  };

  const number0 = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 });
  const number1 = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 1 });
  const compact1 = new Intl.NumberFormat("th-TH", { notation: "compact", maximumFractionDigits: 1 });
  const dateTime = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });

  let DATA = null;
  let currentRows = [];
  let currentTotalRows = [];
  let currentEntityOptions = [];
  let currentTableRows = [];
  let resizeTimer = null;
  let csvObjectUrl = null;

  function normalizeHsCode(value) {
    const code = String(value || "").trim().toUpperCase();
    if (code === "COMBINED" || code === "TOTAL" || code.includes("COMBIN")) return COMBINED_CODE;
    return code;
  }

  function finiteNumber(value) {
    if (value === null || value === undefined || value === "") return 0;
    const parsed = Number(typeof value === "string" ? value.replaceAll(",", "") : value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function normalizePeriod(row) {
    const supplied = String(row.period || "").trim();
    if (/^\d{4}-\d{2}$/.test(supplied)) return supplied;
    const year = Number(row.year);
    const month = Number(row.month);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return "";
    return `${year}-${String(month).padStart(2, "0")}`;
  }

  function baseRow(row, fallbackHsCode) {
    const period = normalizePeriod(row);
    const parsedYear = period ? Number(period.slice(0, 4)) : Number(row.year);
    const parsedMonth = period ? Number(period.slice(5, 7)) : Number(row.month);
    return {
      hsCode: normalizeHsCode(row.hsCode || fallbackHsCode),
      period,
      year: parsedYear,
      month: parsedMonth,
      quarter: Number(row.quarter) || Math.floor((parsedMonth - 1) / 3) + 1,
      value: finiteNumber(row.valueBaht ?? row.value),
      quantity: finiteNumber(row.quantityKg ?? row.quantity),
    };
  }

  function normalizeCountryRow(row, fallbackHsCode) {
    const base = baseRow(row, fallbackHsCode);
    const countryId = String(row.countryId ?? row.id ?? row.countryCode ?? row.code ?? row.countryNameTh ?? row.countryName ?? "").trim();
    const countryCode = String(row.countryCode ?? row.code ?? "").trim();
    const suppliedName = row.countryNameTh ?? row.countryName ?? row.countryNameEn ?? row.nameTh ?? row.name;
    const countryName = String(suppliedName || countryCode || countryId).trim();
    return {
      ...base,
      countryId,
      countryCode,
      countryName,
      continentId: String(row.continentId ?? row.continentCode ?? "UNMAPPED").trim(),
      continentName: String(row.continentNameTh ?? row.continentName ?? "ไม่จัดกลุ่ม").trim(),
    };
  }

  function normalizeContinentRow(row, fallbackHsCode) {
    const base = baseRow(row, fallbackHsCode);
    return {
      ...base,
      continentId: String(row.continentId ?? row.id ?? row.continentCode ?? row.continentNameTh ?? row.continentName ?? "UNMAPPED").trim(),
      continentName: String(row.continentNameTh ?? row.continentName ?? row.nameTh ?? row.name ?? "ไม่จัดกลุ่ม").trim(),
    };
  }

  function validBaseRow(row) {
    return /^\d{4}-\d{2}$/.test(row.period) && Number.isInteger(row.year) && row.month >= 1 && row.month <= 12 && Boolean(row.hsCode);
  }

  function aggregateNormalized(rows, getIdentity) {
    const map = new Map();
    for (const row of rows) {
      const identity = getIdentity(row);
      const key = `${row.hsCode}|${row.period}|${identity.id}`;
      if (!map.has(key)) {
        map.set(key, { ...row, ...identity, value: 0, quantity: 0 });
      }
      const target = map.get(key);
      target.value += row.value;
      target.quantity += row.quantity;
    }
    return Array.from(map.values());
  }

  function deriveContinentRows(countryRows) {
    return aggregateNormalized(countryRows, (row) => ({
      id: row.continentId,
      continentId: row.continentId,
      continentName: row.continentName,
    })).map(({ id, countryId, countryCode, countryName, ...row }) => row);
  }

  function deriveTotalRows(countryRows) {
    return aggregateNormalized(countryRows, () => ({ id: "TOTAL" })).map(({ id, countryId, countryCode, countryName, continentId, continentName, ...row }) => row);
  }

  function normalizeDataset(raw) {
    if (!raw || typeof raw !== "object") return null;
    const fallbackHsCode = raw.metadata && raw.metadata.hsCode ? raw.metadata.hsCode : "";
    const countrySource = Array.isArray(raw.countryMonthly) ? raw.countryMonthly : Array.isArray(raw.monthly) ? raw.monthly : [];
    const countryMonthly = countrySource.map((row) => normalizeCountryRow(row, fallbackHsCode)).filter((row) => validBaseRow(row) && row.countryId);

    const continentSource = Array.isArray(raw.continentMonthly) ? raw.continentMonthly : [];
    const continentMonthly = continentSource.length
      ? continentSource.map((row) => normalizeContinentRow(row, fallbackHsCode)).filter(validBaseRow)
      : deriveContinentRows(countryMonthly);

    const totalSource = Array.isArray(raw.totalMonthly) ? raw.totalMonthly : Array.isArray(raw.totals) ? raw.totals : [];
    const totalMonthly = totalSource.length
      ? totalSource.map((row) => baseRow(row, fallbackHsCode)).filter(validBaseRow)
      : deriveTotalRows(countryMonthly);

    if (!totalMonthly.length) return null;
    return {
      metadata: raw.meta && typeof raw.meta === "object"
        ? raw.meta
        : raw.metadata && typeof raw.metadata === "object"
          ? raw.metadata
          : {},
      hsCodes: Array.isArray(raw.hsCodes) ? raw.hsCodes : EXPECTED_HS_CODES.map((hsCode) => ({ hsCode })),
      countries: Array.isArray(raw.countries) ? raw.countries : [],
      continents: Array.isArray(raw.continents) ? raw.continents : [],
      countryMonthly,
      continentMonthly,
      totalMonthly,
      validation: raw.validation ?? {},
    };
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function stripHtml(value) {
    const temp = document.createElement("span");
    temp.innerHTML = value;
    return temp.textContent || "";
  }

  function toThaiYear(year) {
    return Number(year) + 543;
  }

  function monthIndex(year, month) {
    return Number(year) * 12 + Number(month) - 1;
  }

  function parsePeriod(period) {
    return { year: Number(period.slice(0, 4)), month: Number(period.slice(5, 7)) };
  }

  function monthKeyFromIndex(index) {
    const year = Math.floor(index / 12);
    const month = index - year * 12 + 1;
    return `${year}-${String(month).padStart(2, "0")}`;
  }

  function periodMeta(periodType, row) {
    if (periodType === "month") {
      return {
        key: row.period,
        label: `${THAI_MONTHS[row.month - 1]} ${toThaiYear(row.year)}`,
        sortIndex: monthIndex(row.year, row.month),
        expectedMonths: 1,
      };
    }
    if (periodType === "quarter") {
      const quarter = Math.floor((row.month - 1) / 3) + 1;
      return {
        key: `${row.year}-Q${quarter}`,
        label: `Q${quarter} ${toThaiYear(row.year)}`,
        sortIndex: monthIndex(row.year, (quarter - 1) * 3 + 1),
        expectedMonths: 3,
      };
    }
    return {
      key: String(row.year),
      label: String(toThaiYear(row.year)),
      sortIndex: monthIndex(row.year, 1),
      expectedMonths: 12,
    };
  }

  function compareKey(periodType, periodKey, growthType) {
    if (periodType === "month") {
      const parsed = parsePeriod(periodKey);
      const index = monthIndex(parsed.year, parsed.month);
      if (growthType === "mom") return monthKeyFromIndex(index - 1);
      if (growthType === "yoy") return monthKeyFromIndex(index - 12);
      return null;
    }
    if (periodType === "quarter") {
      const match = periodKey.match(/^(\d+)-Q([1-4])$/);
      if (!match) return null;
      let year = Number(match[1]);
      let quarter = Number(match[2]);
      if (growthType === "qoq") {
        quarter -= 1;
        if (quarter === 0) {
          quarter = 4;
          year -= 1;
        }
        return `${year}-Q${quarter}`;
      }
      if (growthType === "yoy") return `${year - 1}-Q${quarter}`;
      return null;
    }
    if (periodType === "year" && growthType === "yoy") return String(Number(periodKey) - 1);
    return null;
  }

  function growthOptions() {
    if (state.periodType === "month") return [{ id: "mom", label: "MoM" }, { id: "yoy", label: "YoY" }];
    if (state.periodType === "quarter") return [{ id: "qoq", label: "QoQ" }, { id: "yoy", label: "YoY" }];
    return [{ id: "yoy", label: "YoY" }];
  }

  function ensureGrowthOption() {
    const options = growthOptions();
    if (!options.some((option) => option.id === state.growth)) state.growth = options[0].id;
    els.growthSelect.innerHTML = options.map((option) => `<option value="${option.id}">${option.label}</option>`).join("");
    els.growthSelect.value = state.growth;
  }

  function selectionForScope(rows, scope) {
    if (scope !== "combined") {
      return { rows: rows.filter((row) => row.hsCode === scope), requiredCodes: [scope] };
    }
    const combinedRows = rows.filter((row) => row.hsCode === COMBINED_CODE);
    if (combinedRows.length) return { rows: combinedRows, requiredCodes: [COMBINED_CODE] };
    return { rows: rows.filter((row) => EXPECTED_HS_CODES.includes(row.hsCode)), requiredCodes: EXPECTED_HS_CODES.slice() };
  }

  function completeMonthCoverage() {
    const selection = selectionForScope(DATA.totalMonthly, state.hsScope);
    const codesByPeriod = new Map();
    for (const row of selection.rows) {
      if (!codesByPeriod.has(row.period)) codesByPeriod.set(row.period, new Set());
      codesByPeriod.get(row.period).add(row.hsCode);
    }
    const completePeriods = new Set();
    for (const [period, codes] of codesByPeriod) {
      if (selection.requiredCodes.every((code) => codes.has(code))) completePeriods.add(period);
    }
    return { completePeriods, requiredCodes: selection.requiredCodes };
  }

  function coverageByAggregatePeriod(periodType) {
    const { completePeriods } = completeMonthCoverage();
    const grouped = new Map();
    for (const period of completePeriods) {
      const parsed = parsePeriod(period);
      const meta = periodMeta(periodType, { period, year: parsed.year, month: parsed.month });
      if (!grouped.has(meta.key)) grouped.set(meta.key, { periods: [], months: [] });
      grouped.get(meta.key).periods.push(period);
      grouped.get(meta.key).months.push(parsed.month);
    }
    for (const item of grouped.values()) {
      item.periods.sort();
      item.months.sort((a, b) => a - b);
    }
    return grouped;
  }

  function entityFromRow(row, dimension) {
    if (dimension === "total") return { entityId: "TOTAL", entityName: "รวมทุกประเทศ" };
    if (dimension === "continent") {
      return {
        entityId: String(row.continentId || row.continentName || "UNMAPPED"),
        entityName: String(row.continentName || "ไม่จัดกลุ่ม"),
      };
    }
    const code = row.countryCode ? `${row.countryCode} : ` : "";
    return {
      entityId: String(row.countryId || row.countryCode || row.countryName),
      entityName: `${code}${row.countryName || row.countryCode || row.countryId}`,
    };
  }

  function sourceForDimension(dimension) {
    if (dimension === "total") return DATA.totalMonthly;
    if (dimension === "continent") return DATA.continentMonthly;
    return DATA.countryMonthly;
  }

  function aggregateBase(periodType, dimension) {
    const selection = selectionForScope(sourceForDimension(dimension), state.hsScope);
    const coverage = coverageByAggregatePeriod(periodType);
    const monthlyCoverage = completeMonthCoverage();
    const map = new Map();

    const ensureEntry = (meta, entity) => {
      const key = `${meta.key}|${entity.entityId}`;
      if (!map.has(key)) {
        map.set(key, {
          periodKey: meta.key,
          periodLabel: meta.label,
          periodSort: meta.sortIndex,
          expectedMonths: meta.expectedMonths,
          entityId: entity.entityId,
          entityName: entity.entityName,
          value: 0,
          quantity: 0,
          monthlyValues: new Map(),
        });
      }
      return map.get(key);
    };

    for (const row of selection.rows) {
      const meta = periodMeta(periodType, row);
      const entity = entityFromRow(row, dimension);
      const entry = ensureEntry(meta, entity);
      entry.value += row.value;
      entry.quantity += row.quantity;
      if (!entry.monthlyValues.has(row.period)) entry.monthlyValues.set(row.period, { value: 0, quantity: 0 });
      const monthValue = entry.monthlyValues.get(row.period);
      monthValue.value += row.value;
      monthValue.quantity += row.quantity;
    }

    if (dimension !== "total") {
      const entities = new Map();
      for (const row of selection.rows) {
        const entity = entityFromRow(row, dimension);
        entities.set(entity.entityId, entity);
      }
      const completePeriods = Array.from(monthlyCoverage.completePeriods).sort();
      for (const entity of entities.values()) {
        for (const period of completePeriods) {
          const parsed = parsePeriod(period);
          const monthlyRow = { period, year: parsed.year, month: parsed.month };
          const meta = periodMeta(periodType, monthlyRow);
          const entry = ensureEntry(meta, entity);
          if (!entry.monthlyValues.has(period)) entry.monthlyValues.set(period, { value: 0, quantity: 0 });
        }
      }
    }

    return Array.from(map.values()).map((row) => {
      const periodCoverage = coverage.get(row.periodKey) || { periods: [], months: [] };
      const coveredMonthNumbers = periodCoverage.months.slice();
      const isPartial = periodCoverage.periods.length < row.expectedMonths;
      const isYtd = periodType === "year"
        && isPartial
        && coveredMonthNumbers.length > 0
        && coveredMonthNumbers.every((month, index) => month === index + 1);
      return {
        ...row,
        monthCount: periodCoverage.periods.length,
        coveredMonths: periodCoverage.periods.slice(),
        coveredMonthNumbers,
        isPartial,
        isYtd,
      };
    });
  }

  function percentChange(current, previous) {
    if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
    return ((current - previous) / previous) * 100;
  }

  function sumMonthlyThrough(row, throughMonth, metric) {
    let total = 0;
    for (const [period, values] of row.monthlyValues) {
      if (Number(period.slice(5, 7)) <= throughMonth) total += finiteNumber(values[metric]);
    }
    return total;
  }

  function addGrowth(rows, periodType) {
    const lookup = new Map(rows.map((row) => [`${row.periodKey}|${row.entityId}`, row]));
    for (const row of rows) {
      for (const growthType of ["mom", "qoq", "yoy"]) {
        const target = compareKey(periodType, row.periodKey, growthType);
        const previous = target ? lookup.get(`${target}|${row.entityId}`) : null;
        let currentValue = row.value;
        let currentQuantity = row.quantity;
        let previousValue = previous ? previous.value : null;
        let previousQuantity = previous ? previous.quantity : null;
        let eligible = Boolean(previous);
        let comparisonBasis = "full-period";

        if (periodType === "quarter") {
          eligible = Boolean(previous) && !row.isPartial && !previous.isPartial;
        } else if (periodType === "year") {
          eligible = growthType === "yoy" && Boolean(previous) && !row.isPartial && !previous.isPartial;
        }

        row[`${growthType}Value`] = eligible ? percentChange(currentValue, previousValue) : null;
        row[`${growthType}Quantity`] = eligible ? percentChange(currentQuantity, previousQuantity) : null;
        row[`${growthType}Basis`] = eligible ? comparisonBasis : "not-comparable";
      }
    }
    return rows;
  }

  function aggregate(periodType, dimension) {
    const rows = aggregateBase(periodType, dimension);
    const totalRows = dimension === "total" ? rows : aggregateBase(periodType, "total");
    const totalsByPeriod = new Map(totalRows.map((row) => [row.periodKey, row]));
    for (const row of rows) {
      const total = totalsByPeriod.get(row.periodKey);
      row.valueShare = total && total.value !== 0 ? (row.value / total.value) * 100 : null;
      row.quantityShare = total && total.quantity !== 0 ? (row.quantity / total.quantity) * 100 : null;
    }
    return addGrowth(rows, periodType).sort((a, b) => a.periodSort - b.periodSort || b.value - a.value);
  }

  function filteredRows(rows) {
    if (state.dimension === "total") return rows;
    if (!state.selectedIds.size) return [];
    return rows.filter((row) => state.selectedIds.has(row.entityId));
  }

  function buildEntityOptions(rows) {
    if (!rows.length) return [];
    const latestSort = Math.max(...rows.map((row) => row.periodSort));
    const map = new Map();
    for (const row of rows) {
      if (!map.has(row.entityId)) {
        map.set(row.entityId, { id: row.entityId, name: row.entityName, latestValue: 0, totalValue: 0 });
      }
      const option = map.get(row.entityId);
      option.totalValue += row.value;
      if (row.periodSort === latestSort) option.latestValue += row.value;
    }
    return Array.from(map.values()).sort((a, b) => (b.latestValue - a.latestValue) || (b.totalValue - a.totalValue) || a.name.localeCompare(b.name, "th"));
  }

  function resetSelection(rows) {
    currentEntityOptions = buildEntityOptions(rows);
    state.selectedIds.clear();
    if (state.dimension === "total") {
      state.selectedIds.add("TOTAL");
      return;
    }
    const selectionCount = state.dimension === "continent" ? currentEntityOptions.length : Math.min(10, currentEntityOptions.length);
    currentEntityOptions.slice(0, selectionCount).forEach((option) => state.selectedIds.add(option.id));
  }

  function formatNumber(value) {
    return Number.isFinite(value) ? number0.format(value) : "N/A";
  }

  function formatCompact(value) {
    return Number.isFinite(value) ? compact1.format(value) : "N/A";
  }

  function formatPercent(value, html = true) {
    if (!Number.isFinite(value)) return html ? '<span class="neutral">N/A</span>' : "N/A";
    const className = value > 0 ? "positive" : value < 0 ? "negative" : "neutral";
    const label = `${value > 0 ? "+" : ""}${number1.format(value)}%`;
    return html ? `<span class="${className}">${label}</span>` : label;
  }

  function formatDateTime(value) {
    if (!value) return "N/A";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? String(value) : dateTime.format(parsed);
  }

  function partialBadge(row) {
    if (!row || !row.isPartial) return "";
    const label = "งวดยังไม่ครบ";
    return `<span class="partial-tag">${escapeHtml(label)}</span>`;
  }

  function growthDisplayName(growthType, row) {
    if (growthType === "mom") return "MoM";
    if (growthType === "qoq") return "QoQ";
    return "YoY";
  }

  function latestPeriodForScope() {
    const selection = selectionForScope(DATA.totalMonthly, state.hsScope);
    return selection.rows.map((row) => row.period).sort().at(-1) || "";
  }

  function scopeCoverageRange() {
    const selection = selectionForScope(DATA.totalMonthly, state.hsScope);
    const periods = Array.from(new Set(selection.rows.map((row) => row.period))).sort();
    return { first: periods[0] || "N/A", last: periods.at(-1) || "N/A" };
  }

  function renderHeader() {
    const range = scopeCoverageRange();
    els.dashboardTitle.textContent = "ถุงและกระสอบพลาสติก สำหรับหุ้น TPBI, MBAX";
    document.title = els.dashboardTitle.textContent;
    els.coverageText.textContent = `${HS_SCOPE_LABELS[state.hsScope]} | ${range.first} ถึง ${range.last}\nข้อมูลส่งออกประเทศไทยจากกระทรวงพาณิชย์`;
    const reportUrl = DATA.metadata.sourceUrl || DATA.metadata.reportUrl || "https://tradereport.moc.go.th/th/stat/reporthscodeexport01";
    els.sourceLink.href = reportUrl;
  }

  function renderKpis() {
    const monthlyTotals = aggregate("month", "total");
    const latest = monthlyTotals.at(-1);
    if (!latest) {
      els.kpiGrid.innerHTML = Array.from({ length: 6 }, () => '<article class="kpi"><div class="kpi-value neutral">N/A</div><div class="kpi-note">ไม่มีข้อมูลในขอบเขตนี้</div></article>').join("");
      return;
    }

    const latestYear = Number(latest.periodKey.slice(0, 4));
    const latestMonth = Number(latest.periodKey.slice(5, 7));
    const currentYtdRows = monthlyTotals.filter((row) => Number(row.periodKey.slice(0, 4)) === latestYear && Number(row.periodKey.slice(5, 7)) <= latestMonth);
    const priorYtdRows = monthlyTotals.filter((row) => Number(row.periodKey.slice(0, 4)) === latestYear - 1 && Number(row.periodKey.slice(5, 7)) <= latestMonth);
    const currentComplete = currentYtdRows.length === latestMonth && currentYtdRows.every((row) => !row.isPartial);
    const priorComplete = priorYtdRows.length === latestMonth && priorYtdRows.every((row) => !row.isPartial);
    const currentYtd = currentYtdRows.reduce((acc, row) => ({ value: acc.value + row.value, quantity: acc.quantity + row.quantity }), { value: 0, quantity: 0 });
    const priorYtd = priorYtdRows.reduce((acc, row) => ({ value: acc.value + row.value, quantity: acc.quantity + row.quantity }), { value: 0, quantity: 0 });
    const ytdValueYoY = currentComplete && priorComplete ? percentChange(currentYtd.value, priorYtd.value) : null;
    const ytdQuantityYoY = currentComplete && priorComplete ? percentChange(currentYtd.quantity, priorYtd.quantity) : null;
    const latestLabel = `${latest.periodLabel}${latest.isPartial ? " · partial" : ""}`;

    const kpis = [
      { label: "มูลค่าเดือนล่าสุด", value: formatCompact(latest.value), note: latestLabel },
      { label: "ปริมาณเดือนล่าสุด", value: formatCompact(latest.quantity), note: `${latestLabel} · กก.` },
      { label: "MoM มูลค่า", value: formatPercent(latest.momValue), note: "เทียบเดือนก่อน" },
      { label: "YoY มูลค่า", value: formatPercent(latest.yoyValue), note: "เทียบเดือนเดียวกันปีก่อน" },
      { label: "YTD มูลค่า", value: formatCompact(currentYtd.value), note: `YoY ${formatPercent(ytdValueYoY, false)} · ${latestMonth} เดือน` },
      { label: "YTD ปริมาณ", value: formatCompact(currentYtd.quantity), note: `YoY ${formatPercent(ytdQuantityYoY, false)} · กก.` },
    ];

    els.kpiGrid.innerHTML = kpis.map((kpi) => `
      <article class="kpi">
        <div class="kpi-label">${escapeHtml(kpi.label)}</div>
        <div class="kpi-value">${kpi.value}</div>
        <div class="kpi-note">${escapeHtml(kpi.note)}</div>
      </article>
    `).join("");
  }

  function renderEntities() {
    currentEntityOptions = buildEntityOptions(currentRows);
    els.entityBand.hidden = state.dimension === "total";
    if (state.dimension === "total") return;
    const search = state.entitySearch.trim().toLocaleLowerCase("th");
    const options = currentEntityOptions.filter((option) => option.name.toLocaleLowerCase("th").includes(search));
    if (!options.length) {
      els.entityList.innerHTML = '<span class="entity-empty">ไม่พบรายการที่ตรงกับคำค้น</span>';
      return;
    }
    els.entityList.innerHTML = options.map((option) => `
      <label title="${escapeHtml(option.name)}">
        <input type="checkbox" value="${escapeHtml(option.id)}" ${state.selectedIds.has(option.id) ? "checked" : ""}>
        <span>${escapeHtml(option.name)}</span>
      </label>
    `).join("");
    els.entityList.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      input.addEventListener("change", () => {
        if (input.checked) state.selectedIds.add(input.value);
        else state.selectedIds.delete(input.value);
        clearSelectedPoints();
        renderChartsAndTable();
      });
    });
  }

  function chartSeries(rows, valueKey, growthChart) {
    const selectedRows = filteredRows(rows);
    const periods = currentTotalRows.map((row) => ({
      periodKey: row.periodKey,
      periodLabel: row.periodLabel,
      periodSort: row.periodSort,
      isPartial: row.isPartial,
      isYtd: row.isYtd,
      monthCount: row.monthCount,
    }));
    const byEntity = new Map();
    for (const row of selectedRows) {
      if (!byEntity.has(row.entityId)) byEntity.set(row.entityId, { id: row.entityId, name: row.entityName, rows: new Map() });
      byEntity.get(row.entityId).rows.set(row.periodKey, row);
    }
    return Array.from(byEntity.values()).map((entity, index) => ({
      id: entity.id,
      name: entity.name,
      color: SERIES_COLORS[index % SERIES_COLORS.length],
      points: periods.map((period) => {
        const row = entity.rows.get(period.periodKey) || null;
        return {
          row,
          periodKey: period.periodKey,
          periodLabel: period.periodLabel,
          periodSort: period.periodSort,
          isPartial: row ? row.isPartial : period.isPartial,
          isYtd: row ? row.isYtd : period.isYtd,
          monthCount: row ? row.monthCount : period.monthCount,
          value: row ? row[valueKey] : growthChart ? null : 0,
        };
      }),
    }));
  }

  function pointIsSelectable(point) {
    return Boolean(point.row) && Number.isFinite(point.value);
  }

  function resolveSelectedPoint(chartId, series) {
    const saved = state.selectedChartPoints[chartId];
    if (saved) {
      const savedSeries = series.find((item) => item.id === saved.entityId);
      const savedPoint = savedSeries && savedSeries.points.find((point) => point.periodKey === saved.periodKey);
      if (savedPoint && pointIsSelectable(savedPoint)) return { series: savedSeries, point: savedPoint };
    }
    for (const item of series) {
      for (let index = item.points.length - 1; index >= 0; index -= 1) {
        if (pointIsSelectable(item.points[index])) {
          state.selectedChartPoints[chartId] = { entityId: item.id, periodKey: item.points[index].periodKey };
          return { series: item, point: item.points[index] };
        }
      }
    }
    state.selectedChartPoints[chartId] = null;
    return null;
  }

  function buildLineSegments(points, xScale, yScale) {
    const segments = [];
    let segment = [];
    for (const point of points) {
      if (!Number.isFinite(point.value)) {
        if (segment.length) segments.push(segment);
        segment = [];
        continue;
      }
      segment.push(`${xScale(point.periodSort).toFixed(2)},${yScale(point.value).toFixed(2)}`);
    }
    if (segment.length) segments.push(segment);
    return segments;
  }

  function axisValue(value, isGrowth) {
    return isGrowth ? `${number1.format(value)}%` : compact1.format(value);
  }

  function renderLineChart(container, series, options) {
    if (!series.length || !series.some((item) => item.points.some((point) => Number.isFinite(point.value)))) {
      container.innerHTML = '<div class="empty-chart">เลือกรายการอย่างน้อย 1 รายการเพื่อแสดงกราฟ</div>';
      options.detailElement.innerHTML = '<div class="empty-detail">ไม่มีจุดข้อมูลสำหรับรายละเอียด</div>';
      return;
    }

    const width = Math.max(320, Math.round(container.clientWidth || 960));
    const height = window.matchMedia("(max-width: 760px)").matches ? 310 : 360;
    const margin = { top: 18, right: 18, bottom: 48, left: 70 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const allPoints = series.flatMap((item) => item.points);
    const values = allPoints.map((point) => point.value).filter(Number.isFinite);
    const xMin = Math.min(...allPoints.map((point) => point.periodSort));
    const xMax = Math.max(...allPoints.map((point) => point.periodSort));
    let yMin = options.isGrowth ? Math.min(0, ...values) : 0;
    let yMax = Math.max(0, ...values);
    if (yMin === yMax) {
      if (options.isGrowth) {
        yMin -= 1;
        yMax += 1;
      } else {
        yMax = yMax === 0 ? 1 : yMax * 1.1;
      }
    } else {
      const padding = (yMax - yMin) * 0.08;
      if (options.isGrowth) yMin -= padding;
      yMax += padding;
    }

    const xScale = (value) => margin.left + ((value - xMin) / Math.max(1, xMax - xMin)) * plotWidth;
    const yScale = (value) => margin.top + ((yMax - value) / (yMax - yMin)) * plotHeight;
    const yTickCount = 5;
    const yTicks = Array.from({ length: yTickCount }, (_value, index) => yMin + ((yMax - yMin) * index) / (yTickCount - 1));
    const periodPoints = series[0].points;
    const visibleWidth = Math.max(320, container.clientWidth || 720);
    const desiredXTicks = Math.max(3, Math.min(9, Math.floor(visibleWidth / 105)));
    const xTickIndexes = new Set();
    for (let index = 0; index < desiredXTicks; index += 1) {
      xTickIndexes.add(Math.round((index * (periodPoints.length - 1)) / Math.max(1, desiredXTicks - 1)));
    }
    const xTicks = Array.from(xTickIndexes).sort((a, b) => a - b).map((index) => periodPoints[index]);
    const selected = resolveSelectedPoint(options.chartId, series);

    const grid = yTicks.map((tick) => `
      <line class="grid-line" x1="${margin.left}" y1="${yScale(tick)}" x2="${width - margin.right}" y2="${yScale(tick)}"></line>
      <text class="axis-label" x="${margin.left - 10}" y="${yScale(tick) + 4}" text-anchor="end">${escapeHtml(axisValue(tick, options.isGrowth))}</text>
    `).join("");
    const zeroLine = options.isGrowth && yMin < 0 && yMax > 0
      ? `<line class="zero-line" x1="${margin.left}" y1="${yScale(0)}" x2="${width - margin.right}" y2="${yScale(0)}"></line>`
      : "";
    const xLabels = xTicks.map((point, index) => {
      const anchor = index === 0 ? "start" : index === xTicks.length - 1 ? "end" : "middle";
      return `<text class="axis-label" x="${xScale(point.periodSort)}" y="${height - 17}" text-anchor="${anchor}">${escapeHtml(point.periodLabel)}</text>`;
    }).join("");
    const lines = series.map((item) => buildLineSegments(item.points, xScale, yScale)
      .filter((segment) => segment.length > 1)
      .map((segment) => `<polyline class="series-line" points="${segment.join(" ")}" stroke="${item.color}"></polyline>`).join("")).join("");
    const points = series.map((item) => item.points.filter(pointIsSelectable).map((point) => {
      const isSelected = selected && selected.series.id === item.id && selected.point.periodKey === point.periodKey;
      const label = `${item.name} | ${point.periodLabel} | ${options.valueLabel}: ${options.formatValue(point.value)}`;
      return `<circle class="chart-point${isSelected ? " selected" : ""}" cx="${xScale(point.periodSort)}" cy="${yScale(point.value)}" r="${isSelected ? 5.2 : 3.5}" fill="${item.color}" tabindex="0" role="button" aria-label="${escapeHtml(label)}" data-chart-point="true" data-chart-id="${options.chartId}" data-entity-id="${escapeHtml(item.id)}" data-period-key="${escapeHtml(point.periodKey)}"><title>${escapeHtml(label)}</title></circle>`;
    }).join("")).join("");
    const latestPartial = currentTotalRows.at(-1);
    const partialBand = latestPartial && latestPartial.isPartial
      ? `<rect class="chart-partial-band" x="${Math.max(margin.left, xScale(latestPartial.periodSort) - 9)}" y="${margin.top}" width="18" height="${plotHeight}"></rect>`
      : "";

    container.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(options.ariaLabel)}" preserveAspectRatio="xMidYMid meet">
        <title>${escapeHtml(options.ariaLabel)}</title>
        ${partialBand}${grid}${zeroLine}${xLabels}${lines}${points}
      </svg>
      <div class="chart-legend" aria-label="คำอธิบายเส้นกราฟ">
        ${series.map((item) => `<span class="legend-item"><i style="background:${item.color}"></i>${escapeHtml(item.name)}</span>`).join("")}
      </div>
    `;

    container.querySelectorAll("[data-chart-id]").forEach((node) => {
      const selectPoint = () => {
        state.selectedChartPoints[options.chartId] = { entityId: node.dataset.entityId, periodKey: node.dataset.periodKey };
        renderCharts();
      };
      node.addEventListener("click", selectPoint);
      node.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectPoint();
        }
      });
    });
    renderPointDetail(options.detailElement, selected, options);
  }

  function renderPointDetail(container, selection, options) {
    if (!selection || !selection.point.row) {
      container.innerHTML = '<div class="empty-detail">เลือกจุดบนกราฟเพื่อดูรายละเอียด</div>';
      return;
    }
    const row = selection.point.row;
    const selectedValue = options.chartId === "growth"
      ? formatPercent(selection.point.value)
      : formatNumber(selection.point.value);
    const selectedLabel = options.chartId === "growth"
      ? `${growthDisplayName(state.growth, row)} ${METRIC_LABELS[state.metric]}`
      : METRIC_LABELS[state.metric];
    container.innerHTML = `
      <div class="detail-head">
        <strong>${escapeHtml(row.periodLabel)} ${partialBadge(row)}</strong>
        <span>${escapeHtml(row.entityName)} · ${escapeHtml(selectedLabel)} ${selectedValue}</span>
      </div>
      <div class="detail-grid">
        <div class="detail-item"><span>มูลค่า</span><strong>${formatNumber(row.value)} บาท</strong></div>
        <div class="detail-item"><span>ปริมาณ</span><strong>${formatNumber(row.quantity)} กก.</strong></div>
        <div class="detail-item"><span>Share มูลค่า</span><strong>${formatPercent(row.valueShare)}</strong></div>
        <div class="detail-item"><span>Share ปริมาณ</span><strong>${formatPercent(row.quantityShare)}</strong></div>
        <div class="detail-item"><span>MoM มูลค่า</span><strong>${formatPercent(row.momValue)}</strong></div>
        <div class="detail-item"><span>MoM ปริมาณ</span><strong>${formatPercent(row.momQuantity)}</strong></div>
        <div class="detail-item"><span>${escapeHtml(growthDisplayName("yoy", row))} มูลค่า</span><strong>${formatPercent(row.yoyValue)}</strong></div>
        <div class="detail-item"><span>${escapeHtml(growthDisplayName("yoy", row))} ปริมาณ</span><strong>${formatPercent(row.yoyQuantity)}</strong></div>
        <div class="detail-item"><span>QoQ มูลค่า</span><strong>${formatPercent(row.qoqValue)}</strong></div>
        <div class="detail-item"><span>QoQ ปริมาณ</span><strong>${formatPercent(row.qoqQuantity)}</strong></div>
      </div>
    `;
  }

  function renderCharts() {
    const metricKey = state.metric;
    const growthKey = `${state.growth}${state.metric === "value" ? "Value" : "Quantity"}`;
    const growthName = state.growth.toUpperCase();
    const visibleRows = filteredRows(currentRows);
    els.levelSubtitle.textContent = `${PERIOD_LABELS[state.periodType]} | ${DIMENSION_LABELS[state.dimension]} | ${HS_SCOPE_LABELS[state.hsScope]}`;
    els.growthSubtitle.textContent = `${growthName} ${METRIC_LABELS[state.metric]} | ${PERIOD_LABELS[state.periodType]}`;
    els.levelUnit.textContent = state.metric === "value" ? "บาท" : "กก.";

    renderLineChart(els.levelChart, chartSeries(visibleRows, metricKey, false), {
      chartId: "level",
      isGrowth: false,
      valueLabel: METRIC_LABELS[state.metric],
      formatValue: formatNumber,
      ariaLabel: `กราฟยอดส่งออก${METRIC_LABELS[state.metric]} ${PERIOD_LABELS[state.periodType]} ${DIMENSION_LABELS[state.dimension]}`,
      detailElement: els.levelPointDetail,
    });
    renderLineChart(els.growthChart, chartSeries(visibleRows, growthKey, true), {
      chartId: "growth",
      isGrowth: true,
      valueLabel: `${growthName} ${METRIC_LABELS[state.metric]}`,
      formatValue: (value) => formatPercent(value, false),
      ariaLabel: `กราฟการเติบโต${growthName} ${METRIC_LABELS[state.metric]} ${PERIOD_LABELS[state.periodType]}`,
      detailElement: els.growthPointDetail,
    });
  }

  function selectedShare(row) {
    return state.metric === "value" ? row.valueShare : row.quantityShare;
  }

  function compareRows(a, b) {
    const growthValueKey = `${state.growth}Value`;
    const growthQuantityKey = `${state.growth}Quantity`;
    const keyValues = {
      period: [a.periodSort, b.periodSort],
      value: [a.value, b.value],
      quantity: [a.quantity, b.quantity],
      share: [selectedShare(a), selectedShare(b)],
      growthValue: [a[growthValueKey], b[growthValueKey]],
      growthQuantity: [a[growthQuantityKey], b[growthQuantityKey]],
    };
    const [aValue, bValue] = keyValues[state.sortKey] || keyValues.period;
    const aValid = Number.isFinite(aValue);
    const bValid = Number.isFinite(bValue);
    if (!aValid && !bValid) return b.periodSort - a.periodSort || b.value - a.value;
    if (!aValid) return 1;
    if (!bValid) return -1;
    const direction = state.sortDir === "asc" ? 1 : -1;
    if (aValue !== bValue) return (aValue - bValue) * direction;
    return b.periodSort - a.periodSort || b.value - a.value || a.entityName.localeCompare(b.entityName, "th");
  }

  function renderTable() {
    const growthValueKey = `${state.growth}Value`;
    const growthQuantityKey = `${state.growth}Quantity`;
    const growthName = state.growth.toUpperCase();
    const rows = filteredRows(currentRows).slice().sort(compareRows);
    currentTableRows = rows;
    const shownRows = rows.slice(0, state.rowLimit);
    els.shareHeader.textContent = `Share ${METRIC_LABELS[state.metric]}`;
    els.growthValueHeader.textContent = `${growthName} มูลค่า`;
    els.growthQuantityHeader.textContent = `${growthName} ปริมาณ`;
    els.tableSubtitle.textContent = `${number0.format(shownRows.length)} จาก ${number0.format(rows.length)} แถว | เรียง${els.sortKeySelect.options[els.sortKeySelect.selectedIndex].text} ${els.sortDirSelect.options[els.sortDirSelect.selectedIndex].text}`;

    if (!shownRows.length) {
      els.tableBody.innerHTML = '<tr><td colspan="7"><div class="empty-table">ไม่มีข้อมูลตามตัวกรองที่เลือก</div></td></tr>';
      return;
    }
    els.tableBody.innerHTML = shownRows.map((row) => `
      <tr>
        <td>${escapeHtml(row.periodLabel)}${partialBadge(row)}</td>
        <td>${escapeHtml(row.entityName)}</td>
        <td class="num">${formatNumber(row.value)}</td>
        <td class="num">${formatNumber(row.quantity)}</td>
        <td class="num">${formatPercent(selectedShare(row))}</td>
        <td class="num">${formatPercent(row[growthValueKey])}</td>
        <td class="num">${formatPercent(row[growthQuantityKey])}</td>
      </tr>
    `).join("");
  }

  function findValidationNumber(value, pattern) {
    if (!value || typeof value !== "object") return null;
    for (const [key, item] of Object.entries(value)) {
      if (pattern.test(key) && Number.isFinite(Number(item))) return Number(item);
    }
    for (const item of Object.values(value)) {
      if (item && typeof item === "object") {
        const found = findValidationNumber(item, pattern);
        if (Number.isFinite(found)) return found;
      }
    }
    return null;
  }

  function renderSourceDetails() {
    const range = scopeCoverageRange();
    const metadata = DATA.metadata;
    const endpoint = metadata.resultEndpoint || metadata.endpoint || "https://tradereport.moc.go.th/stat/reporthscodeexport01/result";
    const reportUrl = metadata.sourceUrl || metadata.reportUrl || "https://tradereport.moc.go.th/th/stat/reporthscodeexport01";
    const fetchedAt = metadata.fetchedAtUtc || metadata.fetchedAt || metadata.generatedAtUtc || metadata.updatedAt;
    const maxValueDiff = findValidationNumber(DATA.validation, /max.*(?:value|baht).*diff|(?:value|baht).*max.*diff/i);
    const maxQuantityDiff = findValidationNumber(DATA.validation, /max.*(?:quantity|kg).*diff|(?:quantity|kg).*max.*diff/i);
    const latestMonth = range.last !== "N/A" ? Number(range.last.slice(5, 7)) : null;
    const partials = latestMonth
      ? `${latestMonth % 3 === 0 ? "ไตรมาสล่าสุดครบ" : `Q${Math.floor((latestMonth - 1) / 3) + 1} ยังไม่ครบ`} | ปีล่าสุดเป็น YTD ${latestMonth} เดือน`
      : "N/A";
    const reconciliation = Number.isFinite(maxValueDiff) || Number.isFinite(maxQuantityDiff)
      ? `max value diff ${Number.isFinite(maxValueDiff) ? formatNumber(maxValueDiff) : "N/A"} | max quantity diff ${Number.isFinite(maxQuantityDiff) ? formatNumber(maxQuantityDiff) : "N/A"}`
      : String(DATA.validation.status || DATA.validation.verificationStatus || "ดูรายละเอียดใน validation artifact");

    const items = [
      { label: "แหล่งข้อมูล", value: metadata.sourceName || metadata.source || "Thailand's Trade Statistic, Ministry of Commerce", href: reportUrl },
      { label: "Endpoint", value: endpoint, href: endpoint },
      { label: "อัปเดตข้อมูล", value: formatDateTime(fetchedAt) },
      { label: "ช่วงข้อมูลที่เลือก", value: `${range.first} ถึง ${range.last}` },
      { label: "HS Code", value: "392321, 392329 และยอดรวมสองรหัส" },
      { label: "จำนวนแถวประเทศ-เดือน", value: number0.format(DATA.countryMonthly.length) },
      { label: "การกระทบยอด", value: reconciliation },
      { label: "งวดปัจจุบัน", value: partials },
    ];
    els.sourceDetails.innerHTML = items.map((item) => `
      <div class="source-item">
        <span>${escapeHtml(item.label)}</span>
        ${item.href
          ? `<a href="${escapeHtml(item.href)}" target="_blank" rel="noreferrer">${escapeHtml(item.value)}</a>`
          : `<strong>${escapeHtml(item.value)}</strong>`}
      </div>
    `).join("");
  }

  function csvEscape(value) {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  function downloadCurrentCsv() {
    const growthValueKey = `${state.growth}Value`;
    const growthQuantityKey = `${state.growth}Quantity`;
    const header = ["hs_scope", "period", "entity_id", "entity", "value_baht", "quantity_kg", `share_${state.metric}_pct`, `${state.growth}_value_pct`, `${state.growth}_quantity_pct`, "partial", "comparison_basis"];
    const rows = currentTableRows.map((row) => [
      state.hsScope,
      row.periodKey,
      row.entityId,
      row.entityName,
      row.value,
      row.quantity,
      selectedShare(row) ?? "",
      row[growthValueKey] ?? "",
      row[growthQuantityKey] ?? "",
      row.isPartial ? "true" : "false",
      row[`${state.growth}Basis`] || "",
    ]);
    const csv = "\ufeff" + [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");
    if (csvObjectUrl) URL.revokeObjectURL(csvObjectUrl);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    csvObjectUrl = URL.createObjectURL(blob);
    els.downloadCsvBtn.href = csvObjectUrl;
    els.downloadCsvBtn.download = `plastic-bags-export_${state.hsScope}_${state.periodType}_${state.dimension}_${state.metric}.csv`;
    const downloadUrl = csvObjectUrl;
    window.setTimeout(() => {
      URL.revokeObjectURL(downloadUrl);
      if (csvObjectUrl === downloadUrl) {
        csvObjectUrl = null;
        els.downloadCsvBtn.href = "#";
      }
    }, 60000);
  }

  function clearSelectedPoints() {
    state.selectedChartPoints.level = null;
    state.selectedChartPoints.growth = null;
  }

  function renderChartsAndTable() {
    renderCharts();
    renderTable();
  }

  function renderAll() {
    renderHeader();
    renderKpis();
    renderEntities();
    renderChartsAndTable();
    renderSourceDetails();
  }

  function rebuild(resetEntities) {
    ensureGrowthOption();
    currentRows = aggregate(state.periodType, state.dimension);
    currentTotalRows = aggregate(state.periodType, "total");
    if (resetEntities) resetSelection(currentRows);
    renderAll();
  }

  function applyTheme(theme, persist) {
    const selectedTheme = theme === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = selectedTheme;
    const isDark = selectedTheme === "dark";
    els.themeToggle.setAttribute("aria-pressed", String(isDark));
    els.themeToggle.setAttribute("aria-label", isDark ? "เปลี่ยนเป็นโหมดสว่าง" : "เปลี่ยนเป็นโหมดมืด");
    els.themeToggle.querySelector(".theme-icon").textContent = isDark ? "☾" : "☀";
    els.themeToggleText.textContent = isDark ? "Dark" : "Light";
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.content = isDark ? "#07111f" : "#f3f6fa";
    if (persist) {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, selectedTheme);
      } catch (_error) {
        // The visual theme still works when storage is unavailable.
      }
    }
  }

  function bindEvents() {
    els.hsScopeSelect.addEventListener("change", () => {
      state.hsScope = els.hsScopeSelect.value;
      state.entitySearch = "";
      els.entitySearch.value = "";
      clearSelectedPoints();
      rebuild(true);
    });

    els.periodControls.querySelectorAll("button[data-period]").forEach((button) => {
      button.addEventListener("click", () => {
        state.periodType = button.dataset.period;
        els.periodControls.querySelectorAll("button[data-period]").forEach((node) => {
          const active = node === button;
          node.classList.toggle("active", active);
          node.setAttribute("aria-pressed", String(active));
        });
        state.sortKey = "period";
        els.sortKeySelect.value = "period";
        clearSelectedPoints();
        rebuild(true);
      });
    });

    els.dimensionSelect.addEventListener("change", () => {
      state.dimension = els.dimensionSelect.value;
      state.entitySearch = "";
      els.entitySearch.value = "";
      clearSelectedPoints();
      rebuild(true);
    });

    els.metricSelect.addEventListener("change", () => {
      state.metric = els.metricSelect.value;
      clearSelectedPoints();
      renderChartsAndTable();
    });

    els.growthSelect.addEventListener("change", () => {
      state.growth = els.growthSelect.value;
      state.selectedChartPoints.growth = null;
      renderChartsAndTable();
    });

    els.entitySearch.addEventListener("input", () => {
      state.entitySearch = els.entitySearch.value;
      renderEntities();
    });

    els.selectTopBtn.addEventListener("click", () => {
      state.selectedIds.clear();
      currentEntityOptions.slice(0, Math.min(10, currentEntityOptions.length)).forEach((option) => state.selectedIds.add(option.id));
      clearSelectedPoints();
      renderEntities();
      renderChartsAndTable();
    });

    els.selectAllBtn.addEventListener("click", () => {
      state.selectedIds.clear();
      currentEntityOptions.forEach((option) => state.selectedIds.add(option.id));
      clearSelectedPoints();
      renderEntities();
      renderChartsAndTable();
    });

    els.clearSelectionBtn.addEventListener("click", () => {
      state.selectedIds.clear();
      clearSelectedPoints();
      renderEntities();
      renderChartsAndTable();
    });

    els.sortKeySelect.addEventListener("change", () => {
      state.sortKey = els.sortKeySelect.value;
      renderTable();
    });
    els.sortDirSelect.addEventListener("change", () => {
      state.sortDir = els.sortDirSelect.value;
      renderTable();
    });
    els.rowLimitSelect.addEventListener("change", () => {
      state.rowLimit = Number(els.rowLimitSelect.value);
      renderTable();
    });
    els.downloadCsvBtn.addEventListener("click", downloadCurrentCsv);
    els.themeToggle.addEventListener("click", () => {
      const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      applyTheme(nextTheme, true);
    });

    window.addEventListener("resize", () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(renderCharts, 120);
    });
  }

  function getQaState() {
    return {
      hsScope: state.hsScope,
      period: state.periodType,
      periodType: state.periodType,
      dimension: state.dimension,
      metric: state.metric,
      growth: state.growth,
      rowLimit: state.rowLimit,
      sortKey: state.sortKey,
      sortDir: state.sortDir,
      selectedIds: Array.from(state.selectedIds),
    };
  }

  function qaSnapshot() {
    return {
      loaded: Boolean(DATA),
      title: document.title,
      theme: document.documentElement.dataset.theme,
      filters: getQaState(),
      availableGrowth: Array.from(els.growthSelect.options || []).map((option) => option.value),
      kpiCount: document.querySelectorAll(".kpi").length,
      chartSvgCount: document.querySelectorAll(".chart svg").length,
      chartPointCount: document.querySelectorAll(".chart-point").length,
      tableRowCount: document.querySelectorAll("#dataTableBody tr").length,
      sourceCardCount: document.querySelectorAll(".source-item").length,
      errorText: els.appError.hidden ? "" : els.appError.textContent.trim(),
      latestPeriod: DATA ? latestPeriodForScope() : "",
    };
  }

  function installQaContract() {
    window.__DASHBOARD_QA__ = {
      version: 1,
      getState: getQaState,
      snapshot: qaSnapshot,
    };
  }

  function showDataError() {
    els.appError.hidden = false;
    els.appError.innerHTML = DATA_ERROR_HTML;
    els.coverageText.textContent = "ไม่พบชุดข้อมูลที่พร้อมใช้งาน";
    document.querySelectorAll("select, input, button").forEach((element) => {
      if (element !== els.themeToggle) element.disabled = true;
    });
    installQaContract();
  }

  function initialize() {
    applyTheme(document.documentElement.dataset.theme, false);
    DATA = normalizeDataset(RAW_DATA);
    if (!DATA) {
      showDataError();
      return;
    }
    els.appError.hidden = true;
    els.appError.textContent = "";
    els.hsScopeSelect.value = state.hsScope;
    els.dimensionSelect.value = state.dimension;
    els.metricSelect.value = state.metric;
    els.sortKeySelect.value = state.sortKey;
    els.sortDirSelect.value = state.sortDir;
    els.rowLimitSelect.value = String(state.rowLimit);
    bindEvents();
    rebuild(true);
    installQaContract();
  }

  initialize();
})();
