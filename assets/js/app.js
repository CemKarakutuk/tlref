/* TLREF carry trade — hesaplama ve arayüz
 * Veri: data/dataset.json (scripts/update_data.py üretir), data/events.json (elle düzenlenir)
 * Her açılış günü için: girilen gün sayısı sonunda kapatılan pozisyonun getirisi (yıllıklandırılmamış).
 */
(() => {
  "use strict";

  // ── Dil (TR/EN) ───────────────────────────────────────────────────────
  const params = new URLSearchParams(location.search);
  const safeGet = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const safeSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* gizli mod */ } };
  let LANG = (params.get("lang") || safeGet("tlref-lang") || "tr") === "en" ? "en" : "tr";
  const isEN = () => LANG === "en";
  const L = (tr, en) => (isEN() ? en : tr);

  // ── Sabitler ──────────────────────────────────────────────────────────
  const CUR = {
    USD: { tr: "ABD doları", en: "US dollar", from: "New York'tan", city: "New York" },
    EUR: { tr: "euro", en: "euro", from: "Frankfurt'tan", city: "Frankfurt" },
    GBP: { tr: "İngiliz sterlini", en: "British pound", from: "Londra'dan", city: "London" },
    JPY: { tr: "Japon yeni", en: "Japanese yen", from: "Tokyo'dan", city: "Tokyo" },
  };
  const MONTHS_TR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
  const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // ── Yardımcılar ───────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const nf = (x, d = 0) => (x == null || !isFinite(x)) ? "–"
    : x.toLocaleString(isEN() ? "en-US" : "tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const pct = (x, d = 1) => (x == null || !isFinite(x)) ? "–"
    : isEN() ? (x < 0 ? "−" : "") + nf(Math.abs(x * 100), d) + "%" : (x < 0 ? "−%" : "%") + nf(Math.abs(x * 100), d);
  const rate = (v, d = 2) => (v == null || !isFinite(v)) ? "–" : pct(v / 100, d);
  const fdate = (s) => isEN()
    ? +s.slice(8, 10) + " " + MONTHS_EN[+s.slice(5, 7) - 1] + " " + s.slice(0, 4)
    : s.slice(8, 10) + "." + s.slice(5, 7) + "." + s.slice(0, 4);
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const cls = (x) => (x == null ? "" : x >= 0 ? "pos" : "neg");
  const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
  const addDays = (s, n) => new Date(Date.parse(s) + n * 864e5).toISOString().slice(0, 10);
  const esc = (s) => String(s).replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
  const fxDp = (code) => (code === "JPY" ? 6 : 4);

  // ── Durum ─────────────────────────────────────────────────────────────
  const S = { data: null, events: [], N: 0, dates: [], rows: [] };
  const cfg = () => ({
    cur: document.querySelector("#curSeg [aria-checked=true]").dataset.cur,
    days: Math.max(1, Math.min(2500, Math.round(parseFloat($("days").value) || 365))),
    spread: $("spread").checked,
    from: $("dFrom").value, to: $("dTo").value,
  });

  function prepare(data) {
    S.data = data;
    S.dates = data.dates;
    S.N = data.dates.length;
    for (const [code, c] of Object.entries(data.cur)) {
      c.code = code;
      c.i0 = S.dates.indexOf(c.start);
      c.mid = c.buy.map((b, i) => (b + c.sell[i]) / 2);
    }
  }
  const idxOnOrAfter = (d) => { const k = S.dates.findIndex((x) => x >= d); return k < 0 ? S.N - 1 : k; };
  const idxOnOrBefore = (d) => { let k = S.N - 1; while (k > 0 && S.dates[k] > d) k--; return k; };
  // Aynı birikimi veren sabit gecelik oran (yıllık %)
  const avgRate = (idx, a, b, basis) => {
    const n = dayDiff(S.dates[a], S.dates[b]);
    return n > 0 ? (Math.pow(idx[b] / idx[a], 1 / n) - 1) * basis * 100 : null;
  };

  /* Seçilen vade ve tarih aralığı için her açılış gününün sonucu */
  function compute(k) {
    const c = S.data.cur[k.cur], tl = S.data.tl;
    const a = Math.max(c.i0, idxOnOrAfter(k.from || S.dates[0]));
    const last = idxOnOrBefore(k.to || S.dates[S.N - 1]);
    const out = [];
    let j = a;
    for (let i = a; i < last; i++) {
      const target = addDays(S.dates[i], k.days);
      if (j <= i) j = i + 1;
      while (j < S.N && S.dates[j] < target) j++;
      if (j > last || j >= S.N) break;
      const n = dayDiff(S.dates[i], S.dates[j]);
      const ent = k.spread ? c.buy[i] : c.mid[i];
      const ext = k.spread ? c.sell[j] : c.mid[j];
      const gtl = tl.idx[j] / tl.idx[i], gf = c.idx[j] / c.idx[i];
      const r = ent * gtl / ext - gf;
      out.push({ i, j, n, date: S.dates[i], exit: S.dates[j], ent, ext, gtl, gf, r,
        tlRate: tl.used[i], fRate: c.used[i],
        tlAvg: avgRate(tl.idx, i, j, S.data.meta.tlBasis), fAvg: avgRate(c.idx, i, j, c.basis) });
    }
    return out;
  }

  // ── Plotly ────────────────────────────────────────────────────────────
  function registerLocale() {
    Plotly.register({ moduleType: "locale", name: "tr", dictionary: {}, format: {
      days: ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"],
      shortDays: ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"],
      months: ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"],
      shortMonths: MONTHS_TR, date: "%d.%m.%Y", decimal: ",", thousands: ".",
    } });
  }
  const plotConfig = () => ({ responsive: true, displaylogo: false, locale: isEN() ? "en" : "tr",
    modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d", "zoomIn2d", "zoomOut2d"] });

  function render() {
    const k = cfg(), c = S.data.cur[k.cur], cur = CUR[k.cur];
    const s = compute(k);
    S.rows = s;
    $("chartTitle").textContent = L(`Carry trade getirisi: ${nf(k.days)} günlük vade`, `Carry trade return: ${nf(k.days)}-day holding period`);

    if (!s.length) {
      Plotly.purge("mainChart");
      $("mainChart").__bound = false;
      $("mainChart").innerHTML = `<p class="chart-msg">${L("Seçilen aralık bu vade için yeterince uzun değil. Vadeyi kısaltın ya da tarih aralığını genişletin.",
        "The selected range is not long enough for this holding period. Shorten the holding period or widen the date range.")}</p>`;
      $("stats").innerHTML = ""; $("rollTable").innerHTML = ""; $("mainCaption").textContent = "";
      return;
    }
    if ($("mainChart").querySelector(".chart-msg")) $("mainChart").innerHTML = "";

    const x = s.map((p) => p.date), y = s.map((p) => p.r * 100);
    const custom = s.map((p) => [pct(p.r, 2), fdate(p.exit), nf(p.n), rate(p.tlAvg), rate(p.fAvg, 2), pct(p.ext / p.ent - 1, 2), pct(p.gtl - 1, 2)]);
    const gain = css("--gain"), loss = css("--loss");
    const hov = `<b>${L("Carry getirisi", "Carry return")}: %{customdata[0]}</b><br>` +
      `${L("Kapanış", "Close")}: %{customdata[1]} (%{customdata[2]} ${L("gün", "days")})<br>` +
      `${L("TL getirisi", "TL return")}: %{customdata[6]} · ${k.cur}/TRY: %{customdata[5]}<br>` +
      `TLREF ${L("ort.", "avg.")}: %{customdata[3]} · ${c.rate} ${L("ort.", "avg.")}: %{customdata[4]}<extra></extra>`;
    const traces = [
      { x, y: y.map((v) => (v == null ? null : Math.max(v, 0))), type: "scatter", mode: "lines", line: { width: 0 },
        fill: "tozeroy", fillcolor: gain + "59", hoverinfo: "skip", showlegend: false },
      { x, y: y.map((v) => (v == null ? null : Math.min(v, 0))), type: "scatter", mode: "lines", line: { width: 0 },
        fill: "tozeroy", fillcolor: loss + "59", hoverinfo: "skip", showlegend: false },
      { x, y, name: L(`Carry trade getirisi (${k.cur} borçlanarak, ${nf(k.days)} gün)`, `Carry trade return (${k.cur}-funded, ${nf(k.days)} days)`),
        type: "scatter", mode: "lines", line: { color: css("--accent"), width: 2 }, customdata: custom, hovertemplate: hov },
    ];
    const ink = css("--ink"), rule = css("--rule");
    const span = dayDiff(x[0], x[x.length - 1]), narrow = window.innerWidth < 700;
    const layout = {
      paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
      font: { family: css("--sans") || "IBM Plex Sans, sans-serif", color: ink, size: 12.5 },
      margin: { l: 58, r: 18, t: 40, b: 44 }, hovermode: "x unified", dragmode: "zoom",
      hoverlabel: { bgcolor: "#ffffff", bordercolor: rule, font: { color: ink, size: 12.5 } },
      legend: { orientation: "h", x: 0, y: 1.07, font: { color: ink, size: 12.5 } },
      xaxis: { type: "date", showgrid: true, gridcolor: css("--grid"), griddash: "dot", linecolor: css("--ink-2"), tickcolor: rule,
        hoverformat: L("%d.%m.%Y açılış", "Open: %d %b %Y"),
        ...(span > 900 ? { dtick: narrow ? "M24" : "M12", tickformat: "%Y", ticklabelmode: "period" } : { tickformat: "%b %Y" }) },
      // Yakınlaştırma yalnızca tarih ekseninde; y ekseni görünen aralığa göre rescaleY() ile ölçeklenir
      yaxis: { fixedrange: true, showgrid: true, gridcolor: css("--grid"), griddash: "dot", zerolinecolor: ink, zerolinewidth: 1.2,
        range: yRange(s, x[0], x[x.length - 1]), autorange: false,
        title: { text: L(`${nf(k.days)} günlük getiri (%)`, `${nf(k.days)}-day return (%)`), font: { color: css("--muted"), size: 12 } } },
      shapes: [], annotations: [],
    };
    if ($("showEvents").checked) {
      const evs = S.events.filter((e) => (!e.cur || e.cur.includes(k.cur)) && e.date >= x[0] && e.date <= x[x.length - 1])
        .sort((a, b) => a.date.localeCompare(b.date));
      let prev = null, level = 0;
      for (const e of evs) {
        level = prev && dayDiff(prev, e.date) < 240 ? level + 1 : 0;
        prev = e.date;
        layout.shapes.push({ type: "line", xref: "x", yref: "paper", x0: e.date, x1: e.date, y0: 0, y1: 1,
          line: { color: css("--event"), width: 1, dash: "dot" } });
        if (narrow) continue;
        layout.annotations.push({ x: e.date, xref: "x", y: 1 - level * 0.2, yref: "paper", text: esc(isEN() ? (e.label_en || e.label) : e.label),
          showarrow: false, textangle: -90, xanchor: "right", yanchor: "top", xshift: -2, font: { size: 11, color: css("--ink-2") } });
      }
    }
    Plotly.react("mainChart", traces, layout, plotConfig());
    const gd = $("mainChart");
    if (!gd.__bound) { gd.on("plotly_relayout", onRelayout); gd.__bound = true; }

    const sp = k.spread ? L("kur makası dahil (giriş alış, çıkış satış kuru)", "FX spread included (entry at buying, exit at selling rate)")
      : L("kur makası hariç (orta kur)", "FX spread excluded (mid rate)");
    $("mainCaption").textContent = isEN()
      ? `Figure 1. Gross return of borrowing ${cur.en} overnight at ${c.rate} in ${cur.city} and earning TLREF, held for ${nf(k.days)} days (in ${k.cur}, %, not annualised); ${sp}. Each point shows the position opened on that day.`
      : `Şekil 1. ${cur.from} ${c.rate} ile gecelik ${cur.tr} borçlanıp TLREF ile değerlendirilen pozisyonun ${nf(k.days)} günlük brüt getirisi (${k.cur} bazında, %, yıllıklandırılmamış); ${sp}. Her nokta, o gün açılan pozisyonu gösterir.`;
    updateStats();
    renderTable(k, c);
  }

  /* Görünen tarih aralığındaki en düşük ve en yüksek getiriye göre y ekseni sınırları */
  function yRange(s, lo, hi) {
    let mn = Infinity, mx = -Infinity;
    for (const p of s) {
      if (p.date < lo || p.date > hi) continue;
      const v = p.r * 100;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    if (!isFinite(mn)) return [-1, 1];
    const pad = Math.max((mx - mn) * 0.08, 0.05);
    return [mn - pad, mx + pad];
  }
  function onRelayout(ev) {
    // Kendi y ekseni güncellemelerimiz de bu olayı tetikler; yalnızca x değişince ölçekle
    const xKeys = Object.keys(ev || {}).some((key) => key.startsWith("xaxis.range") || key === "xaxis.autorange");
    if (!xKeys) return;
    rescaleY();
    updateStats();
  }
  function rescaleY() {
    const gd = $("mainChart"), s = S.rows;
    if (!s.length || !gd.layout) return;
    const xa = gd.layout.xaxis;
    const full = !xa.range || xa.autorange === true;
    const lo = full ? s[0].date : String(xa.range[0]).slice(0, 10);
    const hi = full ? s[s.length - 1].date : String(xa.range[1]).slice(0, 10);
    // Kısa aralıklarda x ekseni ay etiketlerine geçer
    const days = dayDiff(lo, hi), narrow = window.innerWidth < 700;
    const xt = days > (narrow ? 1300 : 900) ? { "xaxis.dtick": narrow ? "M24" : "M12", "xaxis.tickformat": "%Y", "xaxis.ticklabelmode": "period" }
      : days > (narrow ? 500 : 300) ? { "xaxis.dtick": "M3", "xaxis.tickformat": "%b %Y", "xaxis.ticklabelmode": "instant" }
      : { "xaxis.dtick": "M1", "xaxis.tickformat": "%b %Y", "xaxis.ticklabelmode": "instant" };
    Plotly.relayout(gd, Object.assign({ "yaxis.range": yRange(s, lo, hi), "yaxis.autorange": false }, xt));
  }

  function describe(vals) {
    const v = vals.filter((x) => x != null && isFinite(x));
    if (!v.length) return null;
    const s = [...v].sort((a, b) => a - b), m = s.length >> 1;
    return { n: v.length, pos: v.filter((x) => x > 0).length / v.length, med: s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2,
      mean: v.reduce((a, b) => a + b, 0) / v.length, min: s[0], max: s[s.length - 1] };
  }
  function updateStats() {
    const s = S.rows; if (!s.length) return;
    const gd = $("mainChart"), xa = gd.layout && gd.layout.xaxis;
    const rng = xa && xa.autorange !== true && xa.range;
    const lo = rng ? String(rng[0]).slice(0, 10) : s[0].date, hi = rng ? String(rng[1]).slice(0, 10) : s[s.length - 1].date;
    const inR = s.filter((p) => p.date >= lo && p.date <= hi);
    if (!inR.length) return;
    const unit = cfg().cur;
    const row = (label, st) => !st ? "" :
      `<div class="row"><span class="k">${label}</span><span>${L("Pozitif", "Positive")}: <b>${pct(st.pos, 0)}</b></span>` +
      `<span>${L("Medyan", "Median")}: <b>${pct(st.med)}</b></span><span>${L("Ortalama", "Mean")}: <b>${pct(st.mean)}</b></span>` +
      `<span>${L("En düşük", "Min")}: <b>${pct(st.min)}</b></span><span>${L("En yüksek", "Max")}: <b>${pct(st.max)}</b></span></div>`;
    $("stats").innerHTML =
      `<div class="row"><span>${L("Açılış günleri", "Opening days")}: <b>${fdate(inR[0].date)} – ${fdate(inR[inR.length - 1].date)}</b></span>` +
      `<span>${L("Pozisyon sayısı", "Positions")}: <b>${nf(inR.length)}</b></span></div>` +
      row(L(`Carry getirisi (${unit}, ${nf(cfg().days)} gün)`, `Carry return (${unit}, ${nf(cfg().days)} days)`), describe(inR.map((p) => p.r)));
  }

  function renderTable(k, c) {
    const dp = fxDp(k.cur);
    const head = `<thead><tr><th>${L("Açılış", "Open")}</th><th>TLREF</th><th>${c.rate}</th>` +
      `<th>${k.spread ? L("Alış", "Buy") : L("Orta kur", "Mid")}</th><th>${L("Kapanış", "Close")}</th><th>${L("Gün", "Days")}</th>` +
      `<th>${k.spread ? L("Satış", "Sell") : L("Orta kur", "Mid")}</th><th>${L("TLREF ort.", "TLREF avg.")}</th><th>${c.rate} ${L("ort.", "avg.")}</th>` +
      `<th>${L("TL getirisi", "TL return")}</th><th>${L("Fonlama maliyeti", "Funding cost")}</th><th>${L("Kur değişimi", "FX change")}</th>` +
      `<th>${L("Carry getirisi", "Carry return")}</th></tr></thead>`;
    const body = S.rows.map((p) => {
      const fx = p.ext / p.ent - 1;
      return `<tr><td>${fdate(p.date)}</td><td>${rate(p.tlRate)}</td><td>${rate(p.fRate, 3)}</td><td>${nf(p.ent, dp)}</td>` +
        `<td>${fdate(p.exit)}</td><td>${nf(p.n)}</td><td>${nf(p.ext, dp)}</td><td>${rate(p.tlAvg)}</td><td>${rate(p.fAvg, 3)}</td>` +
        `<td>${pct(p.gtl - 1, 2)}</td><td>${pct(p.gf - 1, 3)}</td><td>${pct(fx, 2)}</td>` +
        `<td class="${cls(p.r)}"><b>${pct(p.r, 2)}</b></td></tr>`;
    }).join("");
    $("rollTable").innerHTML = head + "<tbody>" + body + "</tbody>";
  }

  function downloadCsv() {
    const k = cfg(), c = S.data.cur[k.cur];
    const sep = isEN() ? "," : ";";
    const f = (v, d) => (v == null || !isFinite(v)) ? "" : isEN() ? v.toFixed(d) : v.toFixed(d).replace(".", ",");
    const head = isEN()
      ? ["Open", "TLREF (%)", `${c.rate} (%)`, `${k.cur}TRY entry`, "Close", "Days", `${k.cur}TRY exit`, "TLREF avg (%)", `${c.rate} avg (%)`, "TL return (%)", "Funding cost (%)", "FX change (%)", "Carry return (%)"]
      : ["Açılış", "TLREF (%)", `${c.rate} (%)`, `${k.cur}TRY giriş`, "Kapanış", "Gün", `${k.cur}TRY çıkış`, "TLREF ort. (%)", `${c.rate} ort. (%)`, "TL getirisi (%)", "Fonlama maliyeti (%)", "Kur değişimi (%)", "Carry getirisi (%)"];
    const rows = S.rows.map((p) => [p.date, f(p.tlRate, 4), f(p.fRate, 4), f(p.ent, 6), p.exit, p.n, f(p.ext, 6), f(p.tlAvg, 4), f(p.fAvg, 4),
      f((p.gtl - 1) * 100, 4), f((p.gf - 1) * 100, 4), f((p.ext / p.ent - 1) * 100, 4), f(p.r * 100, 4)].join(sep));
    const blob = new Blob(["﻿" + [head.join(sep)].concat(rows).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `tlref_carry_${k.cur}_${k.days}${L("gun", "d")}${k.spread ? "" : L("_makassiz", "_nospread")}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }

  // ── Dil ve meta ───────────────────────────────────────────────────────
  function applyLanguage() {
    document.documentElement.lang = LANG;
    document.title = L("TLREF Carry Analizi", "TLREF Carry Analysis");
    const b = $("langBtn");
    b.textContent = isEN() ? "Türkçe" : "English";
    b.setAttribute("aria-label", isEN() ? "Türkçeye geç" : "Switch to English");
    document.querySelector(".controls").setAttribute("aria-label", L("Analiz ayarları", "Analysis settings"));
  }
  function renderMeta() {
    const m = S.data.meta, d = S.dates;
    $("metaLine").textContent = L(
      `Veri: ${fdate(d[0])} – ${fdate(d[S.N - 1])} (günlük). Son gözlemler: TLREF ${fdate(m.last.TLREF)}, SOFR ${fdate(m.last.SOFR)}, €STR ${fdate(m.last["€STR"])}, SONIA ${fdate(m.last.SONIA)}, TONA ${fdate(m.last.TONA)}. Veri güncelleme: ${fdate(m.generated)}.`,
      `Data: ${fdate(d[0])} – ${fdate(d[S.N - 1])} (daily). Latest observations: TLREF ${fdate(m.last.TLREF)}, SOFR ${fdate(m.last.SOFR)}, €STR ${fdate(m.last["€STR"])}, SONIA ${fdate(m.last.SONIA)}, TONA ${fdate(m.last.TONA)}. Data updated: ${fdate(m.generated)}.`);
    $("metaFiles").textContent = L("Kaynak dosyalar (data/raw): ", "Source files (data/raw): ") + Object.values(m.files).join(", ") + ".";
  }
  function setLanguage(lang) {
    LANG = lang;
    safeSet("tlref-lang", lang);
    try {
      const u = new URL(location.href);
      if (lang === "en") u.searchParams.set("lang", "en"); else u.searchParams.delete("lang");
      history.replaceState(null, "", u);
    } catch (_) { /* gömülü görünüm */ }
    applyLanguage();
    if (S.data) { renderMeta(); render(); }
  }

  // Tarih alanlarını seçili dövizin veri aralığına göre ayarlar
  function syncDates(reset) {
    const c = S.data.cur[cfg().cur];
    const min = S.dates[c.i0], max = S.dates[S.N - 1];
    ["dFrom", "dTo"].forEach((id) => { $(id).min = min; $(id).max = max; });
    if (reset || !$("dFrom").value || $("dFrom").value < min) $("dFrom").value = min;
    if (reset || !$("dTo").value || $("dTo").value > max) $("dTo").value = max;
  }

  function bind() {
    $("langBtn").addEventListener("click", () => setLanguage(isEN() ? "tr" : "en"));
    document.querySelectorAll("#curSeg button").forEach((b) => b.addEventListener("click", () => {
      const wasMin = $("dFrom").value === S.dates[S.data.cur[cfg().cur].i0];
      document.querySelectorAll("#curSeg button").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
      if (wasMin) $("dFrom").value = S.dates[S.data.cur[b.dataset.cur].i0];
      safeSet("tlref-cur", b.dataset.cur);
      syncDates(false);
      render();
    }));
    let t = null;
    $("days").addEventListener("input", () => { clearTimeout(t); t = setTimeout(render, 450); });
    $("days").addEventListener("change", () => { clearTimeout(t); $("days").value = cfg().days; render(); });
    ["dFrom", "dTo", "spread", "showEvents"].forEach((id) => $(id).addEventListener("change", render));
    $("dlMain").addEventListener("click", downloadCsv);
  }

  async function init() {
    applyLanguage();
    const fail = (msg) => { $("mainChart").innerHTML = `<p class="chart-msg">${msg}</p>`; $("metaLine").textContent = ""; };
    if (typeof Plotly === "undefined") {
      fail(L("Grafik kütüphanesi (Plotly) yüklenemedi. İnternet bağlantısını veya içerik engelleyiciyi kontrol edin.",
        "The charting library (Plotly) could not be loaded. Check your internet connection or content blocker."));
      return;
    }
    let data = window.__TLREF_DATA__;
    if (!data) {
      try {
        const res = await fetch("data/dataset.json", { cache: "no-cache" });
        if (!res.ok) throw new Error(res.status);
        data = await res.json();
      } catch (_) {
        fail(location.protocol === "file:"
          ? L("Veri dosyası doğrudan dosyadan açılamıyor. Repo klasöründe <code>python -m http.server</code> çalıştırıp http://localhost:8000 adresini açın.",
              "The data file cannot be opened directly from disk. Run <code>python -m http.server</code> in the repo folder and open http://localhost:8000.")
          : L("Veri dosyası (data/dataset.json) yüklenemedi.", "The data file (data/dataset.json) could not be loaded."));
        return;
      }
    }
    S.events = window.__TLREF_EVENTS__ || [];
    if (!window.__TLREF_EVENTS__) {
      try { const r = await fetch("data/events.json", { cache: "no-cache" }); if (r.ok) S.events = await r.json(); } catch (_) { /* isteğe bağlı */ }
    }
    registerLocale();
    prepare(data);
    const saved = safeGet("tlref-cur");
    if (saved && data.cur[saved]) document.querySelectorAll("#curSeg button").forEach((x) => x.setAttribute("aria-checked", String(x.dataset.cur === saved)));
    syncDates(true);
    renderMeta();
    render();
    bind();
  }

  init();
})();
