/* TLREF carry trade — hesaplama motoru ve arayüz
 * Veri: data/dataset.json (scripts/update_data.py üretir), data/events.json (elle düzenlenir)
 * Tüm hesaplar tarayıcıda, gecelik faiz birikim endeksleri ve TCMB alış/satış kurlarıyla yapılır.
 */
(() => {
  "use strict";

  // ── Dil ───────────────────────────────────────────────────────────────
  const params = new URLSearchParams(location.search);
  const safeGet = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const safeSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* gizli mod */ } };
  let LANG = (params.get("lang") || safeGet("tlref-lang") || "tr") === "en" ? "en" : "tr";
  const isEN = () => LANG === "en";
  const L = (tr, en) => (isEN() ? en : tr);

  // ── Sabitler ──────────────────────────────────────────────────────────
  const CUR = {
    USD: { tr: "ABD doları", en: "US dollar", center: { tr: "New York", en: "New York" }, cb: { tr: "Fed", en: "Fed" }, color: "--accent" },
    EUR: { tr: "euro", en: "euro", center: { tr: "Frankfurt", en: "Frankfurt" }, cb: { tr: "ECB", en: "ECB" }, color: "--tl" },
    GBP: { tr: "İngiliz sterlini", en: "British pound", center: { tr: "Londra", en: "London" }, cb: { tr: "BoE", en: "BoE" }, color: "--fund" },
    JPY: { tr: "Japon yeni", en: "Japanese yen", center: { tr: "Tokyo", en: "Tokyo" }, cb: { tr: "BoJ", en: "BoJ" }, color: "--ink-2" },
  };
  const CODES = ["USD", "EUR", "GBP", "JPY"];
  const FROM_TR = { USD: "New York'tan", EUR: "Frankfurt'tan", GBP: "Londra'dan", JPY: "Tokyo'dan" };
  const MONTHS_TR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
  const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const ANN = 252; // yıllık değerleme günü (gerçekleşen ortalama ≈ 250,7)

  // Sert gecelerin açıklamaları (değerin belirlendiği piyasa günü)
  const NIGHT_NOTES = {
    "2019-03-28": ["Yerel seçimler öncesi yurt dışı TL likidite sıkışması (offshore swap faizleri)", "Offshore TL liquidity squeeze ahead of local elections (offshore swap rates)"],
    "2020-11-09": ["TCMB başkan değişikliği (7 Kasım) ve ekonomi yönetimindeki değişiklik sonrası TL'de toparlanma", "Lira rebound after the CBRT governor change (7 Nov) and the change in economic management"],
    "2020-11-12": ["Ekonomi yönetimi değişikliği sonrası kur oynaklığı", "FX volatility after the change in economic management"],
    "2021-03-22": ["TCMB başkanının 20 Mart'ta görevden alınmasının ardından ilk işlem günü", "First trading day after the CBRT governor was dismissed on 20 March"],
    "2021-11-23": ["23 Kasım 2021: 18 Kasım indiriminin ardından TL'de tek günlük tarihi çöküş", "23 November 2021: historic one-day lira collapse after the 18 November cut"],
    "2021-11-24": ["23 Kasım çöküşünün ardından yüksek oynaklık", "High volatility after the 23 November collapse"],
    "2021-11-25": ["23 Kasım çöküşünün ardından kısmi düzeltme", "Partial correction after the 23 November collapse"],
    "2021-11-29": ["Kasım 2021 kur krizinde yüksek oynaklık", "High volatility during the November 2021 currency crisis"],
    "2021-12-16": ["16 Aralık PPK: politika faizi %15'ten %14'e", "16 December MPC: policy rate cut from 15% to 14%"],
    "2021-12-17": ["16 Aralık indiriminin ardından TL'de sert değer kaybı", "Sharp lira depreciation after the 16 December cut"],
    "2021-12-20": ["KKM açıklamasından önceki son kur (20 Aralık 15:30)", "Last fixing before KKM was announced (20 December 15:30)"],
    "2021-12-21": ["20 Aralık akşamı KKM'nin açıklanmasıyla TL'de tarihi toparlanma", "Historic lira rebound after KKM was announced on the evening of 20 December"],
    "2021-12-22": ["KKM sonrası yüksek oynaklık", "High volatility after KKM"],
    "2021-12-23": ["KKM sonrası TL'de değer kazancının sürmesi", "Lira appreciation continues after KKM"],
    "2021-12-28": ["KKM sonrası yüksek oynaklık", "High volatility after KKM"],
    "2021-12-30": ["Yıl sonu: KKM sonrası dalgalanma", "Year end: volatility after KKM"],
    "2022-06-27": ["BDDK'nın döviz varlığı yüksek şirketlere TL kredi kısıtı (24 Haziran) sonrası TL'de toparlanma", "Lira rebound after BRSA restricted TL loans to firms with large FX holdings (24 June)"],
    "2022-11-11": ["ABD enflasyon verisi (10 Kasım) sonrası doların küresel değer kaybı", "Global dollar sell-off after the US inflation release (10 November)"],
    "2023-06-07": ["Seçim sonrası kur politikasının değişmesiyle TL'de hızlı değer kaybı", "Rapid lira depreciation as exchange rate policy changed after the elections"],
    "2023-06-23": ["22 Haziran PPK: beklentinin altında kalan artırım (%8,5 → %15)", "22 June MPC: smaller-than-expected hike (8.5% → 15%)"],
    "2024-08-05": ["Küresel yen carry pozisyonlarının çözülmesi (Nikkei 225 −%12,4)", "Global yen carry unwind (Nikkei 225 −12.4%)"],
    "2025-03-19": ["19 Mart 2025 siyasi gelişmeleri sonrası kur şoku", "Currency shock after the political events of 19 March 2025"],
  };

  // ── Para politikası metinleri ─────────────────────────────────────────
  const POLICY = {
    TRY: {
      title: ["TCMB ve TLREF", "CBRT and TLREF"],
      tag: ["Yatırım bacağı · Borsa İstanbul · ACT/365", "Investment leg · Borsa İstanbul · ACT/365"],
      intro: ["TLREF, Borsa İstanbul'daki gecelik repo işlemlerinden hesaplanan Türk lirası gecelik referans faizidir ve TCMB'nin fiilî fonlama faizini yakından izler. 2019–2026 döneminde TL faizleri birbirinden çok farklı rejimlerden geçti:",
        "TLREF is the Turkish lira overnight reference rate, calculated from overnight repo trades on Borsa İstanbul, and closely tracks the CBRT's effective funding rate. Over 2019–2026 lira rates went through very different regimes:"],
      items: [
        ["Tem–Ara 2019", "Jul–Dec 2019", "Başkan değişikliğinin ardından politika faizi %24'ten %12'ye indirildi; TLREF yaklaşık %23'ten %11'e geriledi.", "After a change of governor the policy rate was cut from 24% to 12%; TLREF fell from about 23% to 11%."],
        ["Mar–May 2020", "Mar–May 2020", "Pandemide politika faizi %8,25'e indi; TLREF en düşük düzeyini (%7,5) Mayıs 2020'de gördü.", "During the pandemic the policy rate fell to 8.25%; TLREF hit its low (7.5%) in May 2020."],
        ["Ağu 2020–Mar 2021", "Aug 2020–Mar 2021", "Önce fonlamanın üst banda kaydırılmasıyla dolaylı, Kasım 2020'den itibaren doğrudan sıkılaştırma; politika faizi Mart 2021'de %19.", "First indirect tightening by shifting funding to the upper band, then direct hikes from November 2020; policy rate 19% by March 2021."],
        ["Eyl–Ara 2021", "Sep–Dec 2021", "Enflasyon yükselirken politika faizi %19'dan %14'e indirildi; Kasım–Aralık'ta kur krizi ve 20 Aralık'ta KKM.", "With inflation rising, the policy rate was cut from 19% to 14%; currency crisis in November–December and KKM on 20 December."],
        ["2022–May 2023", "2022–May 2023", "Derin negatif reel faiz: politika faizi Şubat 2023'te %8,5; TLREF %9–14 bandında.", "Deeply negative real rates: policy rate 8.5% by February 2023; TLREF in a 9–14% band."],
        ["Haz 2023–Mar 2024", "Jun 2023–Mar 2024", "Parasal sıkılaştırma: politika faizi %8,5'ten %50'ye; TLREF Nisan 2024'te %53'e yaklaştı.", "Monetary tightening: policy rate from 8.5% to 50%; TLREF approached 53% in April 2024."],
        ["Ara 2024–Nis 2025", "Dec 2024–Apr 2025", "İndirimlerle politika faizi Mart 2025 başında %42,5'e indi; 19 Mart şokunun ardından gecelik borç verme faizi %46'ya, Nisan'da politika faizi %46'ya çıkarıldı.", "Cuts took the policy rate to 42.5% by early March 2025; after the 19 March shock the overnight lending rate was raised to 46% and the policy rate to 46% in April."],
        ["Tem 2025–Oca 2026", "Jul 2025–Jan 2026", "İndirimler yeniden başladı; politika faizi Ocak 2026'da %37.", "Cuts resumed; policy rate 37% by January 2026."],
        ["Mar–Ağu 2026", "Mar–Aug 2026", "1 Mart'ta, ABD ve İsrail'in İran'a saldırılarının ardından bir hafta vadeli repo ihalelerine ara verildi; fonlama gecelik borç verme faizinden (%40) yapıldı ve TLREF %40'a çıktı. İhaleler Ağustos sonunda yeniden başladı; TLREF %37'ye yakın.", "On 1 March, after the US and Israeli strikes on Iran, one-week repo auctions were suspended; funding moved to the overnight lending rate (40%) and TLREF rose to 40%. Auctions resumed at the end of August; TLREF is close to 37%."],
      ],
    },
    USD: {
      title: ["Fed ve SOFR", "Fed and SOFR"],
      tag: ["Fonlama bacağı · New York Fed · ACT/360", "Funding leg · New York Fed · ACT/360"],
      intro: ["SOFR, ABD hazine tahvili teminatlı gecelik repo işlemlerinin hacim ağırlıklı medyanıdır ve Fed'in politika faizi aralığı içinde işlem görür.",
        "SOFR is the volume-weighted median of overnight repo trades collateralised by US Treasuries and trades within the Fed's target range."],
      items: [
        ["Tem–Eki 2019", "Jul–Oct 2019", "Üç indirimle hedef aralık %1,50–1,75. 17 Eylül 2019'da repo piyasasındaki sıkışma SOFR'u bir günlüğüne %5,25'e taşıdı.", "Three cuts took the target range to 1.50–1.75%. On 17 September 2019 a repo market squeeze pushed SOFR to 5.25% for one day."],
        ["Mar 2020", "Mar 2020", "Pandemi: iki olağanüstü indirimle %0–0,25; SOFR 2022 başına kadar %0,01–0,05.", "Pandemic: two emergency cuts to 0–0.25%; SOFR stayed at 0.01–0.05% until early 2022."],
        ["Mar 2022–Tem 2023", "Mar 2022–Jul 2023", "1980'lerden bu yana en hızlı sıkılaştırma: 525 baz puanla %5,25–5,50; SOFR %5,4'e kadar.", "The fastest tightening since the 1980s: 525 basis points to 5.25–5.50%; SOFR up to 5.4%."],
        ["Eyl–Ara 2024", "Sep–Dec 2024", "100 baz puan indirim: %4,25–4,50.", "100 basis points of cuts: 4.25–4.50%."],
        ["Eyl–Ara 2025", "Sep–Dec 2025", "Üç indirim daha: %3,50–3,75.", "Three more cuts: 3.50–3.75%."],
        ["16 Eyl 2026", "16 Sep 2026", "2023'ten bu yana ilk artırım: %3,75–4,00; SOFR %3,9.", "First hike since 2023: 3.75–4.00%; SOFR 3.9%."],
      ],
      note: ["Dolar fonlaması en ucuz düzeyini 2020–2021'de gördü; ancak bu yıllar TL'nin en sert değer kaybettiği dönemdi. SOFR'un %5'i aştığı 2023–2024'te ise TLREF %40–50 bandında olduğundan fonlama maliyeti getiriyi belirleyen unsur olmadı.",
        "Dollar funding was cheapest in 2020–2021, but those were the years of the lira's sharpest depreciation. When SOFR exceeded 5% in 2023–2024, TLREF was in the 40–50% range, so the funding cost never drove the result."],
    },
    EUR: {
      title: ["ECB ve €STR", "ECB and €STR"],
      tag: ["Fonlama bacağı · Avrupa Merkez Bankası · ACT/360", "Funding leg · European Central Bank · ACT/360"],
      intro: ["€STR, euro bölgesi bankalarının teminatsız gecelik borçlanma işlemlerinden hesaplanır ve ECB mevduat faizinin yaklaşık 8–10 baz puan altında seyreder.",
        "€STR is calculated from euro area banks' unsecured overnight borrowing and trades about 8–10 basis points below the ECB deposit facility rate."],
      items: [
        ["Eki 2019", "Oct 2019", "€STR'nin ilk yayımı; mevduat faizi −%0,50, €STR yaklaşık −%0,55. Euro ile borçlanan yatırımcı borcu için faiz ödemek yerine faiz alıyordu.", "First €STR publication; deposit rate −0.50%, €STR about −0.55%. An investor borrowing euros was paid, rather than charged, interest on the debt."],
        ["2020–Haz 2022", "2020–Jun 2022", "Negatif faiz ve varlık alımları sürdü; €STR −%0,59 ile −%0,57 arasında.", "Negative rates and asset purchases continued; €STR between −0.59% and −0.57%."],
        ["Tem 2022–Eyl 2023", "Jul 2022–Sep 2023", "450 baz puan artırımla mevduat faizi %4,00; negatif faiz dönemi sona erdi.", "450 basis points of hikes to a 4.00% deposit rate; the negative rate era ended."],
        ["Haz 2024–Haz 2025", "Jun 2024–Jun 2025", "Sekiz indirimle mevduat faizi %2,00.", "Eight cuts to a 2.00% deposit rate."],
        ["Haz ve Eyl 2026", "Jun and Sep 2026", "İki artırımla mevduat faizi %2,50; €STR %2,44.", "Two hikes to a 2.50% deposit rate; €STR 2.44%."],
      ],
      note: ["Negatif faiz döneminde fonlama bacağı getiriye katkı yaptı; ancak bu katkı yılda yarım puan civarındaydı ve TL'nin euro karşısındaki değer kaybı yanında önemsiz kaldı.",
        "During the negative rate era the funding leg added to returns, but only by about half a point a year, negligible next to the lira's depreciation against the euro."],
    },
    GBP: {
      title: ["BoE ve SONIA", "BoE and SONIA"],
      tag: ["Fonlama bacağı · Bank of England · ACT/365", "Funding leg · Bank of England · ACT/365"],
      intro: ["SONIA, Londra para piyasasındaki teminatsız gecelik sterlin işlemlerinin kırpılmış ortalamasıdır ve Bank Rate'in birkaç baz puan altında seyreder.",
        "SONIA is the trimmed mean of unsecured overnight sterling transactions in the London money market and trades a few basis points below Bank Rate."],
      items: [
        ["2019", "2019", "Bank Rate %0,75; SONIA %0,70 civarında.", "Bank Rate 0.75%; SONIA around 0.70%."],
        ["Mar 2020", "Mar 2020", "İki indirimle Bank Rate %0,10.", "Two cuts to a 0.10% Bank Rate."],
        ["Ara 2021–Ağu 2023", "Dec 2021–Aug 2023", "Pandemi sonrası faiz artıran ilk G7 merkez bankası: 14 ardışık artırımla %5,25.", "The first G7 central bank to hike after the pandemic: 14 consecutive hikes to 5.25%."],
        ["Eyl 2022", "Sep 2022", "Mini bütçe krizi: sterlin sert değer kaybetti; sterlin fonlamalı pozisyonun kur etkisi bu dönemde görece olumluydu.", "Mini-budget crisis: sterling fell sharply, so the FX effect on a sterling-funded position was relatively favourable."],
        ["Ağu 2024–Ara 2025", "Aug 2024–Dec 2025", "Altı indirimle Bank Rate %3,75; 2026 boyunca sabit.", "Six cuts to a 3.75% Bank Rate; unchanged through 2026."],
      ],
      note: ["Sterlin, dört fonlama para birimi arasında TL karşısında en çok değer kazananlardan biri oldu; bu nedenle SONIA'nın SOFR'a yakın seyrine rağmen GBP pozisyonu USD pozisyonuyla benzer sonuç verdi.",
        "Sterling was among the funding currencies that gained most against the lira, so despite SONIA tracking close to SOFR the GBP position ended up similar to the USD position."],
    },
    JPY: {
      title: ["BoJ ve TONA", "BoJ and TONA"],
      tag: ["Fonlama bacağı · Bank of Japan · ACT/365", "Funding leg · Bank of Japan · ACT/365"],
      intro: ["TONA, Tokyo çağrı piyasasındaki teminatsız gecelik işlemlerin ağırlıklı ortalamasıdır. Yen, uzun süre sıfırın altındaki faiziyle dünyanın başlıca carry trade fonlama para birimi oldu.",
        "TONA is the weighted average of unsecured overnight transactions in the Tokyo call market. With rates below zero for years, the yen became the world's main carry trade funding currency."],
      items: [
        ["2016–Mar 2024", "2016–Mar 2024", "Politika faizi −%0,10 ve getiri eğrisi kontrolü; TONA −%0,08 ile 0 arasında.", "Policy rate −0.10% and yield curve control; TONA between −0.08% and 0."],
        ["19 Mar 2024", "19 Mar 2024", "17 yıl sonra ilk artırım ve negatif faizden çıkış: %0–0,1.", "First hike in 17 years and exit from negative rates: 0–0.1%."],
        ["31 Tem 2024", "31 Jul 2024", "%0,25'e artırım; 5 Ağustos'ta küresel yen carry pozisyonlarının çözülmesiyle Nikkei 225 tek günde %12,4 düştü.", "Hike to 0.25%; on 5 August the global unwinding of yen carry positions sent the Nikkei 225 down 12.4% in one day."],
        ["Oca 2025–Eyl 2026", "Jan 2025–Sep 2026", "Kademeli artırımlar: %0,5 (Ocak 2025), %0,75 (Aralık 2025), %1,0 (Haziran 2026), %1,25 (Eylül 2026); yaklaşık 30 yılın en yüksek düzeyi.", "Gradual hikes: 0.5% (January 2025), 0.75% (December 2025), 1.0% (June 2026), 1.25% (September 2026), the highest in about 30 years."],
      ],
      note: ["Yen'in 2021–2024'teki küresel zayıflığı JPY/TRY kurunun diğer kurlardan yavaş yükselmesini sağladı. Bu yüzden aynı TLREF bacağı yenle fonlandığında dönemin pozitif kalan tek sonucunu verir: getiri farkı fonlama faizinden değil, fonlama para biriminin kendisinden gelir.",
        "The yen's global weakness in 2021–2024 meant JPY/TRY rose more slowly than the other rates. That is why the same TLREF leg funded in yen is the only one that stays positive over the period: the difference comes from the funding currency itself, not from the funding rate."],
    },
  };

  // ── Yardımcılar ───────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const loc = () => (isEN() ? "en-US" : "tr-TR");
  const nf = (x, d = 0) => (x == null || !isFinite(x)) ? "–" : x.toLocaleString(loc(), { minimumFractionDigits: d, maximumFractionDigits: d });
  const pct = (x, d = 1) => (x == null || !isFinite(x)) ? "–"
    : isEN() ? (x < 0 ? "−" : "") + nf(Math.abs(x * 100), d) + "%" : (x < 0 ? "−%" : "%") + nf(Math.abs(x * 100), d);
  const spct = (x, d = 1) => (x != null && x > 0 ? "+" : "") + pct(x, d);
  const rate = (v, d = 2) => (v == null || !isFinite(v)) ? "–" : pct(v / 100, d); // yüzde cinsinden sayı
  const bp = (x, d = 1) => (x == null || !isFinite(x)) ? "–" : (x < 0 ? "−" : "") + nf(Math.abs(x * 1e4), d) + " bp";
  const fdate = (s) => isEN()
    ? +s.slice(8, 10) + " " + MONTHS_EN[+s.slice(5, 7) - 1] + " " + s.slice(0, 4)
    : s.slice(8, 10) + "." + s.slice(5, 7) + "." + s.slice(0, 4);
  const fmonth = (ym) => (isEN() ? MONTHS_EN : MONTHS_TR)[+ym.slice(5, 7) - 1] + " " + ym.slice(0, 4);
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const cls = (x) => (x == null ? "" : x >= 0 ? "pos" : "neg");
  const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
  const addMonths = (s, m) => {
    const d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1 + m, +s.slice(8, 10)));
    return d.toISOString().slice(0, 10);
  };
  const annualize = (r, days) => (r == null || days <= 0 || 1 + r <= 0) ? null : Math.pow(1 + r, 365.25 / days) - 1;
  const lbl = (pair) => (isEN() ? pair[1] : pair[0]);
  const esc = (s) => String(s).replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));

  // ── Durum ─────────────────────────────────────────────────────────────
  const S = { data: null, events: [], N: 0, dates: [], cur: "USD", period: null, periodAll: true, dailyRange: null };
  const cfg = () => ({
    cur: S.cur, view: $("view").value, spread: $("spread").checked,
    showCarry: $("showCarry").checked, showFx: $("showFx").checked, showEvents: $("showEvents").checked,
  });
  const C = (code = S.cur) => S.data.cur[code];

  // ── Veri hazırlığı ────────────────────────────────────────────────────
  function prepare(data) {
    S.data = data;
    S.dates = data.dates;
    S.N = data.dates.length;
    S.tl = data.tl;
    for (const code of CODES) {
      const c = data.cur[code];
      c.code = code;
      c.i0 = S.dates.indexOf(c.start);
      c.mid = c.buy.map((b, i) => (b + c.sell[i]) / 2);
    }
    // Yıl sonları (her takvim yılının son değerleme günü)
    S.yearEnd = {};
    S.dates.forEach((d, i) => { S.yearEnd[d.slice(0, 4)] = i; });
  }
  const idxOnOrAfter = (date) => { const k = S.dates.findIndex((d) => d >= date); return k < 0 ? S.N - 1 : k; };
  const idxOnOrBefore = (date) => { let k = S.N - 1; while (k > 0 && S.dates[k] > date) k--; return k; };

  /* Pozisyon: i0 günü 1 birim döviz borçlanılır, i günü kapatılır (nominale oranla). */
  function pos(c, i0, i, spread) {
    const gtl = S.tl.idx[i] / S.tl.idx[i0];
    const gf = c.idx[i] / c.idx[i0];
    const ent = spread ? c.buy[i0] : c.mid[i0];
    const ext = spread ? c.sell[i] : c.mid[i];
    const total = ent * gtl / ext - gf;
    const carry = gtl - gf;
    const fx = gtl * (c.mid[i0] / c.mid[i] - 1);
    return { gtl, gf, ent, ext, total, carry, fx, spr: total - carry - fx };
  }
  /* Gecelik getiri (orta kur): i−1 → i */
  const night = (c, i) => (S.tl.idx[i] / S.tl.idx[i - 1]) * (c.mid[i - 1] / c.mid[i]) - c.idx[i] / c.idx[i - 1];
  /* Bir aralıktaki ortalama gecelik faiz (birikim endeksinden, yıllık %) */
  const effRate = (idx, a, b, basis) => {
    // Aynı birikimi veren sabit gecelik oran: (G^(1/gün) − 1) × B. Kısa aralıklarda basit yıllık orana eşittir.
    const days = dayDiff(S.dates[a], S.dates[b]);
    return days > 0 ? (Math.pow(idx[b] / idx[a], 1 / days) - 1) * basis * 100 : null;
  };

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
    modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d"] });
  function baseLayout() {
    const ink = css("--ink"), rule = css("--rule");
    return {
      paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
      font: { family: css("--sans") || "IBM Plex Sans, sans-serif", color: ink, size: 12.5 },
      margin: { l: 58, r: 18, t: 40, b: 44 },
      hovermode: "x unified",
      hoverlabel: { bgcolor: css("--panel"), bordercolor: rule, font: { color: ink, size: 12.5 } },
      legend: { orientation: "h", x: 0, y: 1.08, font: { color: ink, size: 12.5 } },
      xaxis: { type: "date", showgrid: true, gridcolor: css("--grid"), griddash: "dot", linecolor: css("--ink-2"),
        tickcolor: rule, hoverformat: isEN() ? "%d %b %Y" : "%d.%m.%Y", tickformat: "%Y", dtick: "M12", ticklabelmode: "period" },
      yaxis: { showgrid: true, gridcolor: css("--grid"), griddash: "dot", zerolinecolor: ink, zerolinewidth: 1.2,
        tickformat: ",.0f", automargin: true },
    };
  }
  const narrow = () => window.innerWidth < 700;

  // ── 1. Ana grafik ─────────────────────────────────────────────────────
  function mainSeries(c, view, spread) {
    const out = [];
    if (view === "cum") {
      for (let i = c.i0; i < S.N; i++) out.push({ i, j: i, i0: c.i0, x: S.dates[i], ...pos(c, c.i0, i, spread) });
      return out;
    }
    const m = +view;
    let j = c.i0;
    for (let i = c.i0; i < S.N; i++) {
      const target = addMonths(S.dates[i], m);
      if (j < i) j = i;
      while (j < S.N && S.dates[j] < target) j++;
      if (j >= S.N) break;
      out.push({ i, j, i0: i, x: S.dates[i], ...pos(c, i, j, spread) });
    }
    return out;
  }

  function renderMain() {
    const k = cfg(), c = C(), cur = CUR[k.cur];
    const s = mainSeries(c, k.view, k.spread);
    S.series = s;
    const x = s.map((p) => p.x);
    const y = s.map((p) => p.total * 100);
    const custom = s.map((p) => [
      spct(p.total), spct(p.carry), spct(p.fx), spct(p.spr),
      rate(S.tl.used[p.j]), rate(c.used[p.j]), nf(c.mid[p.j], c.code === "JPY" ? 4 : 4),
      k.view === "cum" ? "" : L(`Kapanış: ${fdate(S.dates[p.j])}`, `Close: ${fdate(S.dates[p.j])}`),
    ]);
    const hov = `<b>${L("Carry getirisi", "Carry return")}: %{customdata[0]}</b><br>` +
      `${L("Faiz farkı", "Rate differential")}: %{customdata[1]}<br>${L("Kur etkisi", "FX effect")}: %{customdata[2]}<br>` +
      `${L("Makas", "Spread")}: %{customdata[3]}<br>TLREF: %{customdata[4]} · ${c.rate}: %{customdata[5]}<br>` +
      `${k.cur}/TRY: %{customdata[6]}<br><span style="opacity:.7">%{customdata[7]}</span><extra></extra>`;
    const gain = css("--gain"), loss = css("--loss");
    const traces = [
      { x, y: y.map((v) => Math.max(v, 0)), type: "scatter", mode: "lines", line: { width: 0 }, fill: "tozeroy",
        fillcolor: hexA(gain, .32), hoverinfo: "skip", showlegend: false },
      { x, y: y.map((v) => Math.min(v, 0)), type: "scatter", mode: "lines", line: { width: 0 }, fill: "tozeroy",
        fillcolor: hexA(loss, .32), hoverinfo: "skip", showlegend: false },
      { x, y: s.map((p) => p.carry * 100), name: L("Faiz farkı katkısı (kur sabit)", "Rate differential (FX unchanged)"),
        type: "scatter", mode: "lines", line: { color: css("--tl"), width: 1.4, dash: "dash" }, visible: k.showCarry, hoverinfo: "skip" },
      { x, y: s.map((p) => p.fx * 100), name: L("Kur etkisi", "FX effect"),
        type: "scatter", mode: "lines", line: { color: css("--fx"), width: 1.3, dash: "dot" }, visible: k.showFx, hoverinfo: "skip" },
      { x, y, name: L(`Carry trade brüt getirisi (${k.cur} fonlamalı)`, `Gross carry trade return (${k.cur}-funded)`),
        type: "scatter", mode: "lines", line: { color: css("--accent"), width: 2.2 }, customdata: custom, hovertemplate: hov },
    ];
    const layout = baseLayout();
    layout.xaxis.dtick = narrow() ? "M24" : "M12";
    layout.yaxis.title = { text: L("Getiri (nominalin %'si)", "Return (% of notional)"), font: { color: css("--muted"), size: 12 } };
    layout.shapes = []; layout.annotations = [];
    if (k.showEvents) {
      const evs = S.events.filter((e) => (!e.cur || e.cur.includes(k.cur)) && e.date >= x[0] && e.date <= x[x.length - 1])
        .sort((a, b) => a.date.localeCompare(b.date));
      let prev = null, level = 0;
      for (const e of evs) {
        level = prev && dayDiff(prev, e.date) < 200 ? (level + 1) % 3 : 0;
        prev = e.date;
        layout.shapes.push({ type: "line", xref: "x", yref: "paper", x0: e.date, x1: e.date, y0: 0, y1: 1,
          line: { color: css("--event"), width: 1, dash: "dot" } });
        if (narrow()) continue;
        layout.annotations.push({ x: e.date, xref: "x", y: 1 - level * 0.22, yref: "paper", text: esc(isEN() ? (e.label_en || e.label) : e.label),
          showarrow: false, textangle: -90, xanchor: "right", yanchor: "top", xshift: -2, font: { size: 11, color: css("--ink-2") } });
      }
    }
    if (S.period && !S.periodAll && k.view === "cum") {
      const d = S.dates[S.period.i0];
      layout.shapes.push({ type: "line", xref: "x", yref: "paper", x0: d, x1: d, y0: 0, y1: 1, line: { color: css("--accent"), width: 1.5 } });
    }
    Plotly.react("mainChart", traces, layout, plotConfig());

    const viewTxt = k.view === "cum"
      ? L(`${fdate(c.start)} tarihinde açılıp her gün kapatılabilecek pozisyonun kümülatif getirisi`, `cumulative return of a position opened on ${fdate(c.start)} and closable on any day`)
      : L(`her gün açılıp ${k.view} ay sonra kapatılan pozisyonun getirisi (açılış tarihine göre)`, `return of a position opened each day and closed ${k.view} month${k.view === "1" ? "" : "s"} later (by opening date)`);
    $("mainCaption").textContent = isEN()
      ? `Figure 1. Gross return of borrowing ${cur.en} overnight at ${c.rate} in ${cur.center.en} and earning TLREF: ${viewTxt}. ` +
        `${k.spread ? "Entry at the CBRT buying rate, exit at the selling rate." : "Mid rate at both ends."} % of notional.`
      : `Şekil 1. ${FROM_TR[k.cur]} ${c.rate} ile gecelik ${cur.tr} borçlanıp TLREF ile değerlendirilen pozisyonun brüt getirisi: ${viewTxt}. ` +
        `${k.spread ? "Giriş TCMB döviz alış, çıkış döviz satış kuruyla." : "İki uçta da orta kur."} Nominalin yüzdesi.`;
    updateStats();
  }
  // "#1f9d55" → rgba(); tema değişkeni rgb() ise olduğu gibi döner
  function hexA(hex, a) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function visibleRange(id) {
    const gd = $(id);
    const r = gd && gd.layout && gd.layout.xaxis && gd.layout.xaxis.autorange !== true && gd.layout.xaxis.range;
    return r ? [String(r[0]).slice(0, 10), String(r[1]).slice(0, 10)] : null;
  }

  function describe(vals) {
    const v = vals.filter((x) => x != null && isFinite(x));
    if (!v.length) return null;
    const s = [...v].sort((a, b) => a - b), m = s.length >> 1;
    return { n: v.length, pos: v.filter((x) => x > 0).length / v.length, med: s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2,
      mean: v.reduce((a, b) => a + b, 0) / v.length, min: s[0], max: s[s.length - 1] };
  }

  function updateStats() {
    const k = cfg(), c = C(), s = S.series;
    if (!s || !s.length) return;
    const rng = visibleRange("mainChart");
    const lo = rng ? rng[0] : s[0].x, hi = rng ? rng[1] : s[s.length - 1].x;
    const inR = s.filter((p) => p.x >= lo && p.x <= hi);
    if (!inR.length) { $("stats").innerHTML = ""; return; }
    if (k.view === "cum") {
      const last = s[s.length - 1];
      const days = dayDiff(c.start, last.x);
      let mn = s[0], mx = s[0];
      for (const p of s) { if (p.total < mn.total) mn = p; if (p.total > mx.total) mx = p; }
      $("stats").innerHTML =
        `<div class="row"><span class="k">${L("Dönem", "Period")}</span><span><b>${fdate(c.start)} – ${fdate(last.x)}</b> · ${nf(days / 365.25, 2)} ${L("yıl", "years")} · ${nf(s.length - 1)} ${L("değerleme günü", "valuation days")}</span></div>` +
        `<div class="row"><span class="k">${L(`Carry getirisi (${k.cur})`, `Carry return (${k.cur})`)}</span>` +
        `<span>${L("Kümülatif", "Cumulative")}: <b class="${cls(last.total)}">${spct(last.total)}</b></span>` +
        `<span>${L("Yıllıklandırılmış", "Annualised")}: <b>${spct(annualize(last.total, days))}</b></span>` +
        `<span>${L("En düşük", "Low")}: <b>${spct(mn.total)}</b> (${fdate(mn.x)})</span><span>${L("En yüksek", "High")}: <b>${spct(mx.total)}</b> (${fdate(mx.x)})</span></div>` +
        `<div class="row"><span class="k">${L("Bileşenler", "Components")}</span>` +
        `<span>${L("TL bacağı (TLREF birikimi)", "TL leg (TLREF accrual)")}: <b>${spct(last.gtl - 1)}</b></span>` +
        `<span>${L(`Fonlama maliyeti (${c.rate})`, `Funding cost (${c.rate})`)}: <b>${spct(last.gf - 1, 2)}</b></span>` +
        `<span>${k.cur}/TRY ${L("değişimi (orta)", "change (mid)")}: <b>${spct(c.mid[S.N - 1] / c.mid[c.i0] - 1)}</b></span></div>`;
    } else {
      const st = describe(inR.map((p) => p.total));
      $("stats").innerHTML =
        `<div class="row"><span>${L("Görünen aralık", "Visible range")}: <b>${fdate(inR[0].x)} – ${fdate(inR[inR.length - 1].x)}</b></span>` +
        `<span>${L(`Tamamlanmış ${k.view} aylık dönem`, `Completed ${k.view}-month periods`)}: <b>${nf(st.n)}</b> ${L("açılış günü", "opening days")}</span></div>` +
        `<div class="row"><span class="k">${L(`Carry getirisi (${k.cur})`, `Carry return (${k.cur})`)}</span>` +
        `<span>${L("Pozitif", "Positive")}: <b>${pct(st.pos, 0)}</b></span><span>${L("Medyan", "Median")}: <b>${spct(st.med)}</b></span>` +
        `<span>${L("Ortalama", "Mean")}: <b>${spct(st.mean)}</b></span><span>${L("En düşük", "Min")}: <b>${spct(st.min)}</b></span>` +
        `<span>${L("En yüksek", "Max")}: <b>${spct(st.max)}</b></span></div>`;
    }
  }

  // ── 2. Gecelik getiriler ──────────────────────────────────────────────
  function nightSeries(c) {
    const out = [];
    for (let i = c.i0 + 1; i < S.N; i++) out.push({ i, x: S.dates[i], r: night(c, i) });
    return out;
  }
  function renderDaily() {
    const c = C();
    const s = nightSeries(c);
    S.nights = s;
    const gain = css("--gain"), loss = css("--loss");
    const traces = [{
      x: s.map((p) => p.x), y: s.map((p) => p.r * 100), type: "bar", marker: { color: s.map((p) => (p.r >= 0 ? gain : loss)) },
      name: L("Gecelik getiri", "Overnight return"),
      hovertemplate: `%{x|${isEN() ? "%d %b %Y" : "%d.%m.%Y"}}<br><b>%{y:.2f}%</b><extra></extra>`,
    }];
    const layout = baseLayout();
    layout.hovermode = "closest";
    layout.bargap = 0;
    layout.showlegend = false;
    layout.margin.t = 16;
    layout.xaxis.dtick = narrow() ? "M24" : "M12";
    layout.yaxis.title = { text: L("Gecelik getiri (nominalin %'si)", "Overnight return (% of notional)"), font: { color: css("--muted"), size: 12 } };
    layout.yaxis.tickformat = ",.0f";
    Plotly.react("dailyChart", traces, layout, plotConfig());
    renderDailyStats();
  }
  function moments(v) {
    const n = v.length, m = v.reduce((a, b) => a + b, 0) / n;
    let m2 = 0, m3 = 0, m4 = 0;
    for (const x of v) { const d = x - m; m2 += d * d; m3 += d * d * d; m4 += d * d * d * d; }
    m2 /= n; m3 /= n; m4 /= n;
    return { n, mean: m, sd: Math.sqrt(m2 * n / (n - 1)), skew: m3 / Math.pow(m2, 1.5), kurt: m4 / (m2 * m2) - 3 };
  }
  function renderDailyStats() {
    const c = C(), rng = visibleRange("dailyChart");
    const s = S.nights.filter((p) => !rng || (p.x >= rng[0] && p.x <= rng[1]));
    if (s.length < 3) { $("dailyStats").innerHTML = ""; $("tailTable").innerHTML = ""; return; }
    const v = s.map((p) => p.r);
    const mo = moments(v);
    const maxP = s.reduce((a, p) => (p.r > a.r ? p : a)), minP = s.reduce((a, p) => (p.r < a.r ? p : a));
    const exMax = moments(s.filter((p) => p !== maxP).map((p) => p.r));
    const hit = v.filter((x) => x > 0).length / v.length;
    const item = (k, val, sub = "") => `<div><dt>${k}</dt><dd>${val}${sub ? ` <small>${sub}</small>` : ""}</dd></div>`;
    $("dailyStats").innerHTML =
      item(L("Aralık", "Range"), `${fdate(s[0].x)} – ${fdate(s[s.length - 1].x)}`, `${nf(mo.n)} ${L("gece", "nights")}`) +
      item(L("Ortalama gecelik getiri", "Mean overnight return"), bp(mo.mean, 2), L(`yıllık ${spct(mo.mean * ANN)}`, `annual ${spct(mo.mean * ANN)}`)) +
      item(L("Standart sapma", "Standard deviation"), bp(mo.sd, 1), L(`yıllık ${pct(mo.sd * Math.sqrt(ANN))}`, `annual ${pct(mo.sd * Math.sqrt(ANN))}`)) +
      item(L("Getiri/oynaklık oranı", "Return/volatility ratio"), nf(mo.mean / mo.sd * Math.sqrt(ANN), 2), L("yıllık", "annual")) +
      item(L("Pozitif gece oranı", "Share of positive nights"), pct(hit, 0)) +
      item(L("Çarpıklık", "Skewness"), nf(mo.skew, 2), L(`en iyi gece hariç ${nf(exMax.skew, 2)}`, `excl. best night ${nf(exMax.skew, 2)}`)) +
      item(L("Fazla basıklık", "Excess kurtosis"), nf(mo.kurt, 1), L(`en iyi gece hariç ${nf(exMax.kurt, 1)}`, `excl. best night ${nf(exMax.kurt, 1)}`)) +
      item(L("En kötü gece", "Worst night"), `<span class="neg">${spct(minP.r, 2)}</span>`, fdate(minP.x)) +
      item(L("En iyi gece", "Best night"), `<span class="pos">${spct(maxP.r, 2)}</span>`, fdate(maxP.x));

    const worst = [...s].sort((a, b) => a.r - b.r).slice(0, 8);
    const best = [...s].sort((a, b) => b.r - a.r).slice(0, 4);
    const row = (p) => {
      const n = NIGHT_NOTES[p.x];
      return `<tr><td>${fdate(p.x)}</td><td class="${cls(p.r)}">${spct(p.r, 2)}</td>` +
        `<td>${spct(c.mid[p.i] / c.mid[p.i - 1] - 1, 2)}</td><td>${rate(S.tl.used[p.i])}</td><td>${rate(c.used[p.i])}</td>` +
        `<td class="note">${n ? esc(isEN() ? n[1] : n[0]) : "–"}</td></tr>`;
    };
    const sub = (t) => `<tr><td colspan="6" style="text-align:left;color:var(--muted);padding-top:14px">${t}</td></tr>`;
    $("tailTable").innerHTML =
      `<thead><tr><th>${L("Tarih", "Date")}</th><th>${L("Gecelik getiri", "Overnight return")}</th><th>${S.cur}/TRY ${L("değişimi", "change")}</th>` +
      `<th>TLREF</th><th>${c.rate}</th><th style="text-align:left">${L("Bağlam", "Context")}</th></tr></thead><tbody>` +
      sub(L("En kötü 8 gece", "Worst 8 nights")) + worst.map(row).join("") +
      sub(L("En iyi 4 gece", "Best 4 nights")) + best.map(row).join("") + "</tbody>";
  }

  // ── 3. Faiz farkı ve para politikası ──────────────────────────────────
  function renderRates() {
    const c = C();
    const x = S.dates;
    const fund = c.used.map((v, i) => (i < c.i0 ? null : v));
    const diff = S.tl.used.map((v, i) => (v == null || fund[i] == null ? null : v - fund[i]));
    const fmt = isEN() ? "%d %b %Y" : "%d.%m.%Y";
    const traces = [
      { x, y: S.tl.used, name: "TLREF", type: "scatter", mode: "lines", line: { color: css("--tl"), width: 1.8 },
        hovertemplate: `TLREF: %{y:.2f}%<extra></extra>` },
      { x, y: diff, name: L(`Faiz farkı (TLREF − ${c.rate})`, `Rate differential (TLREF − ${c.rate})`), type: "scatter", mode: "lines",
        line: { color: css("--accent"), width: 1.4, dash: "dot" }, hovertemplate: `${L("Fark", "Spread")}: %{y:.2f} ${L("puan", "pp")}<extra></extra>` },
      { x, y: fund, name: c.rate, type: "scatter", mode: "lines", line: { color: css("--fund"), width: 1.8, shape: "hv" }, yaxis: "y2",
        hovertemplate: `${c.rate}: %{y:.3f}%<extra></extra>` },
    ];
    const layout = baseLayout();
    layout.xaxis.anchor = "y2";
    layout.xaxis.dtick = narrow() ? "M24" : "M12";
    layout.xaxis.hoverformat = fmt;
    layout.yaxis.domain = [0.42, 1];
    layout.yaxis.title = { text: "TLREF (%)", font: { color: css("--muted"), size: 12 } };
    layout.yaxis2 = Object.assign({}, layout.yaxis, { domain: [0, 0.3], anchor: "x", tickformat: ",.1f",
      title: { text: `${c.rate} (%)`, font: { color: css("--muted"), size: 12 } } });
    layout.legend.y = 1.1;
    layout.margin.t = 46;
    Plotly.react("ratesChart", traces, layout, plotConfig());
    renderPolicy();
  }

  function renderPolicy() {
    const c = C(), code = S.cur;
    const card = (key, extra) => {
      const p = POLICY[key];
      return `<article><h3>${lbl(p.title)}</h3><p class="tag">${lbl(p.tag)}</p><p>${lbl(p.intro)}</p>` +
        `<ul class="timeline">${p.items.map((it) => `<li><time>${isEN() ? it[1] : it[0]}</time><span>${isEN() ? it[3] : it[2]}</span></li>`).join("")}</ul>` +
        (extra || "") + `</article>`;
    };
    // Veriden özet: dönem ortalamaları
    const a = c.i0, b = S.N - 1;
    const tlAvg = effRate(S.tl.idx, a, b, S.data.meta.tlBasis);
    const fAvg = effRate(c.idx, a, b, c.basis);
    let neg = 0, nf_ = 0;
    for (let i = a; i <= b; i++) { if (c.used[i] != null) { nf_++; if (c.used[i] < 0) neg++; } }
    const fxChg = c.mid[b] / c.mid[a] - 1;
    const facts = L(
      `${fdate(c.start)}–${fdate(S.dates[b])} ortalama gecelik faizler (birikimden): TLREF ${rate(tlAvg)}, ${c.rate} ${rate(fAvg, 2)}, fark ${nf(tlAvg - fAvg, 1)} puan. ` +
      `${code}/TRY ${spct(fxChg)}.` + (neg ? ` ${c.rate} değerleme günlerinin ${pct(neg / nf_, 0)}'inde negatifti.` : ""),
      `Average overnight rates over ${fdate(c.start)}–${fdate(S.dates[b])} (from accrual): TLREF ${rate(tlAvg)}, ${c.rate} ${rate(fAvg, 2)}, spread ${nf(tlAvg - fAvg, 1)} pp. ` +
      `${code}/TRY ${spct(fxChg)}.` + (neg ? ` ${c.rate} was negative on ${pct(neg / nf_, 0)} of valuation days.` : ""));
    $("policy").innerHTML =
      card(code, `<div class="takeaway">${lbl(POLICY[code].note)}<br><br>${facts}</div>`) + card("TRY");
  }

  // ── 4. Dönem analizi ──────────────────────────────────────────────────
  function setPeriod(i0, i1, opts = {}) {
    const c = C();
    i0 = Math.max(c.i0, Math.min(i0, S.N - 2));
    i1 = Math.max(i0 + 1, Math.min(i1, S.N - 1));
    S.period = { i0, i1 };
    if (opts.all != null) S.periodAll = opts.all;
    $("pStart").value = S.dates[i0];
    $("pEnd").value = S.dates[i1];
    $("pStart").min = S.dates[c.i0]; $("pStart").max = S.dates[S.N - 2];
    $("pEnd").min = S.dates[c.i0 + 1]; $("pEnd").max = S.dates[S.N - 1];
    renderPeriod();
    if ($("cmpStart").value === "period") renderCompare();
  }

  function renderPeriod() {
    const k = cfg(), c = C(), code = S.cur;
    const { i0, i1 } = S.period;
    const amt = Math.max(1, parseFloat($("pAmount").value) || 1);
    $("amtLabel").textContent = L(`Borç (${code})`, `Borrowed (${code})`);
    const p = pos(c, i0, i1, k.spread);
    const days = dayDiff(S.dates[i0], S.dates[i1]);
    const tl0 = amt * p.ent, tl1 = tl0 * p.gtl, back = tl1 / p.ext, debt = amt * p.gf, pnl = back - debt;
    const tlEff = effRate(S.tl.idx, i0, i1, S.data.meta.tlBasis), fEff = effRate(c.idx, i0, i1, c.basis);
    let low = { r: 0, i: i0 };
    for (let i = i0 + 1; i <= i1; i++) { const r = pos(c, i0, i, k.spread).total; if (r < low.r) low = { r, i }; }
    const dp = 0;
    const card = (t, v, sub, klass = "", primary = false) =>
      `<div class="card${primary ? " primary" : ""}"><h4>${t}</h4><div class="v ${klass}">${v}</div><div class="s">${sub}</div></div>`;
    $("cards").innerHTML =
      card(L(`Carry getirisi (${code})`, `Carry return (${code})`), spct(p.total), L(`Yıllıklandırılmış ${spct(annualize(p.total, days))} · ${nf(days)} gün`, `Annualised ${spct(annualize(p.total, days))} · ${nf(days)} days`), cls(p.total), true) +
      card(L("Brüt kâr/zarar", "Gross profit/loss"), `${pnl >= 0 ? "+" : "−"}${nf(Math.abs(pnl), dp)} ${code}`, L(`${nf(amt)} ${code} borç başına`, `per ${nf(amt)} ${code} borrowed`), cls(pnl)) +
      card(L("TL bacağı (TLREF)", "TL leg (TLREF)"), `${nf(tl1)} TL`, L(`${spct(p.gtl - 1)} · ort. gecelik ${rate(tlEff)}`, `${spct(p.gtl - 1)} · avg. overnight ${rate(tlEff)}`)) +
      card(L(`Borç (${c.rate})`, `Debt (${c.rate})`), `${nf(debt, dp)} ${code}`, L(`${spct(p.gf - 1, 2)} · ort. gecelik ${rate(fEff, 3)}`, `${spct(p.gf - 1, 2)} · avg. overnight ${rate(fEff, 3)}`)) +
      card(L(`${code}/TRY`, `${code}/TRY`), spct(p.ext / p.ent - 1), `${nf(p.ent, 4)} → ${nf(p.ext, 4)} TL`) +
      card(L("Ayrıştırma", "Decomposition"),
        `<span class="split"><span>${L("Faiz farkı", "Rate diff.")}</span><b class="${cls(p.carry)}">${spct(p.carry)}</b>` +
        `<span>${L("Kur etkisi", "FX effect")}</span><b class="${cls(p.fx)}">${spct(p.fx)}</b>` +
        `<span>${L("Makas", "Spread")}</span><b class="${cls(p.spr)}">${spct(p.spr, 2)}</b></span>`, "") +
      card(L("Dönem içi en düşük değer", "Lowest value in period"), spct(low.r), low.i === i0 ? "–" : fdate(S.dates[low.i]), cls(low.r));

    const eq = (s) => `<span class="eq">${s}</span>`;
    const ent = k.spread ? L("döviz alış", "buying rate") : L("orta kur", "mid rate");
    const ext = k.spread ? L("döviz satış", "selling rate") : L("orta kur", "mid rate");
    $("calc").innerHTML = `<h3>${L("Adım adım hesap", "Step-by-step calculation")}</h3><ol>` +
      `<li>${L(`Açılış (${fdate(S.dates[i0])}): ${code} borçlanılır ve ${ent} kuruyla TL'ye çevrilir`, `Open (${fdate(S.dates[i0])}): borrow ${code} and convert to TL at the ${ent}`)}: ` +
        eq(`${nf(amt)} ${code} × ${nf(p.ent, 4)} = ${nf(tl0)} TL`) + `</li>` +
      `<li>${L(`TL bakiye ${nf(days)} gün boyunca TLREF ile gecelik büyür (birikim çarpanı)`, `The TL balance grows overnight at TLREF for ${nf(days)} days (accrual factor)`)}: ` +
        eq(`${nf(tl0)} × ${nf(p.gtl, 6)} = ${nf(tl1)} TL`) + `</li>` +
      `<li>${L(`Kapanış (${fdate(S.dates[i1])}): TL bakiye ${ext} kuruyla dövize çevrilir`, `Close (${fdate(S.dates[i1])}): convert the TL balance back at the ${ext}`)}: ` +
        eq(`${nf(tl1)} ÷ ${nf(p.ext, 4)} = ${nf(back, 0)} ${code}`) + `</li>` +
      `<li>${L(`Borç ${c.rate} ile gecelik birikir`, `The debt accrues overnight at ${c.rate}`)}: ` +
        eq(`${nf(amt)} × ${nf(p.gf, 6)} = ${nf(debt, 0)} ${code}`) + `</li>` +
      `<li>${L("Brüt kâr/zarar ve getiri", "Gross profit/loss and return")}: ` +
        eq(`${nf(back, 0)} − ${nf(debt, 0)} = ${pnl >= 0 ? "" : "−"}${nf(Math.abs(pnl), 0)} ${code} → ${spct(p.total, 2)}`) + `</li>` +
      `<li>${L("Ayrıştırma", "Decomposition")}: ` +
        eq(`${L("faiz farkı", "rate diff.")} ${spct(p.carry, 2)} ${L("+ kur", "+ FX")} ${spct(p.fx, 2)} ${L("+ makas", "+ spread")} ${spct(p.spr, 2)} = ${spct(p.total, 2)}`) + `</li></ol>`;

    renderTable(c, i0, i1, amt, k.spread);
  }

  function periodRows(c, i0, i1, amt, spread) {
    const rows = [];
    for (let i = i0 + 1; i <= i1; i++) {
      const p = pos(c, i0, i, spread);
      rows.push({
        i, date: S.dates[i], days: dayDiff(S.dates[i - 1], S.dates[i]),
        tlPub: S.tl.pub[i], tlEff: effRate(S.tl.idx, i - 1, i, S.data.meta.tlBasis), fEff: effRate(c.idx, i - 1, i, c.basis),
        buy: c.buy[i], sell: c.sell[i], night: night(c, i),
        tlBal: amt * p.ent * p.gtl, debt: amt * p.gf, value: amt * p.total, cum: p.total,
      });
    }
    return rows;
  }

  function renderTable(c, i0, i1, amt, spread) {
    const code = S.cur, mode = $("tableMode").value;
    const rows = periodRows(c, i0, i1, amt, spread);
    S.periodRowsCache = rows;
    const open = `<tr><td>${fdate(S.dates[i0])} ${L("(açılış)", "(open)")}</td>`;
    let head, body;
    if (mode === "d") {
      head = `<thead><tr><th>${L("Tarih", "Date")}</th><th>${L("Gün", "Days")}</th><th>${L("TLREF (yayım)", "TLREF (published)")}</th>` +
        `<th>${L("TLREF (etkin)", "TLREF (effective)")}</th><th>${c.rate} ${L("(etkin)", "(effective)")}</th><th>${L("Alış", "Buy")}</th><th>${L("Satış", "Sell")}</th>` +
        `<th>${L("Gecelik getiri", "Overnight return")}</th><th>${L("TL bakiye", "TL balance")}</th><th>${L(`Borç (${code})`, `Debt (${code})`)}</th>` +
        `<th>${L(`Pozisyon değeri (${code})`, `Position value (${code})`)}</th><th>${L("Kümülatif", "Cumulative")}</th></tr></thead>`;
      body = open + `<td></td><td>${rate(S.tl.pub[i0])}</td><td></td><td></td><td>${nf(c.buy[i0], 4)}</td><td>${nf(c.sell[i0], 4)}</td><td></td>` +
        `<td>${nf(amt * (spread ? c.buy[i0] : c.mid[i0]))}</td><td>${nf(amt)}</td><td>${nf(spread ? amt * (c.buy[i0] / c.sell[i0] - 1) : 0)}</td><td></td></tr>` +
        rows.map((r) => `<tr><td>${fdate(r.date)}</td><td>${r.days}</td><td>${rate(r.tlPub)}</td><td>${rate(r.tlEff)}</td><td>${rate(r.fEff, 3)}</td>` +
          `<td>${nf(r.buy, 4)}</td><td>${nf(r.sell, 4)}</td><td class="${cls(r.night)}">${spct(r.night, 2)}</td><td>${nf(r.tlBal)}</td>` +
          `<td>${nf(r.debt)}</td><td class="${cls(r.value)}">${nf(r.value)}</td><td class="${cls(r.cum)}">${spct(r.cum, 2)}</td></tr>`).join("");
    } else {
      // Aylık özet: her ayın son değerleme günü
      const groups = [];
      let a = i0;
      rows.forEach((r, k) => {
        const next = rows[k + 1];
        if (!next || next.date.slice(0, 7) !== r.date.slice(0, 7)) { groups.push({ a, b: r.i, r }); a = r.i; }
      });
      head = `<thead><tr><th>${L("Ay", "Month")}</th><th>${L("Ay sonu", "Month end")}</th><th>${L("Gün", "Days")}</th>` +
        `<th>${L("TLREF (etkin ort.)", "TLREF (eff. avg.)")}</th><th>${c.rate} ${L("(etkin ort.)", "(eff. avg.)")}</th><th>${L("Faiz farkı", "Spread")}</th>` +
        `<th>${code}/TRY ${L("(orta)", "(mid)")}</th><th>${L("Aylık kur değişimi", "Monthly FX change")}</th><th>${L("TL bakiye", "TL balance")}</th>` +
        `<th>${L(`Borç (${code})`, `Debt (${code})`)}</th><th>${L(`Pozisyon değeri (${code})`, `Position value (${code})`)}</th><th>${L("Kümülatif", "Cumulative")}</th></tr></thead>`;
      body = groups.map((g) => {
        const tlE = effRate(S.tl.idx, g.a, g.b, S.data.meta.tlBasis), fE = effRate(c.idx, g.a, g.b, c.basis);
        const fxm = c.mid[g.b] / c.mid[g.a] - 1;
        return `<tr><td>${fmonth(g.r.date.slice(0, 7))}</td><td>${fdate(g.r.date)}</td><td>${dayDiff(S.dates[g.a], S.dates[g.b])}</td>` +
          `<td>${rate(tlE)}</td><td>${rate(fE, 3)}</td><td>${nf(tlE - fE, 2)}</td><td>${nf(c.mid[g.b], 4)}</td><td class="${cls(-fxm)}">${spct(fxm, 2)}</td>` +
          `<td>${nf(g.r.tlBal)}</td><td>${nf(g.r.debt)}</td><td class="${cls(g.r.value)}">${nf(g.r.value)}</td><td class="${cls(g.r.cum)}">${spct(g.r.cum, 2)}</td></tr>`;
      }).join("");
    }
    $("rollTable").innerHTML = head + "<tbody>" + body + "</tbody>";
  }

  // ── 5. Karşılaştırma ──────────────────────────────────────────────────
  function cmpBounds(c) {
    const mode = $("cmpStart").value;
    if (mode === "common") return [Math.max(c.i0, idxOnOrAfter("2019-10-01")), S.N - 1];
    if (mode === "period" && S.period) {
      const d0 = S.dates[S.period.i0];
      return [Math.max(c.i0, idxOnOrAfter(d0)), S.period.i1];
    }
    return [c.i0, S.N - 1];
  }
  function renderCompare() {
    const k = cfg();
    const traces = CODES.map((code) => {
      const c = C(code), [a, b] = cmpBounds(c);
      const x = [], y = [];
      for (let i = a; i <= b; i++) { x.push(S.dates[i]); y.push(pos(c, a, i, k.spread).total * 100); }
      const sel = code === S.cur;
      return { x, y, name: `${code} · ${c.rate}`, type: "scatter", mode: "lines",
        line: { color: css(CUR[code].color), width: sel ? 2.6 : 1.4 }, opacity: sel ? 1 : 0.8,
        hovertemplate: `${code}: %{y:.1f}%<extra></extra>` };
    });
    const layout = baseLayout();
    layout.xaxis.dtick = narrow() ? "M24" : "M12";
    layout.yaxis.title = { text: L("Getiri (nominalin %'si)", "Return (% of notional)"), font: { color: css("--muted"), size: 12 } };
    layout.legend.y = 1.12;
    Plotly.react("cmpChart", traces, layout, plotConfig());
    renderYears();
  }

  function yearData() {
    const k = cfg();
    const years = Object.keys(S.yearEnd).sort();
    const rows = years.map((y) => {
      const b = S.yearEnd[y];
      const prevEnd = S.yearEnd[String(+y - 1)];
      const out = { y, partialStart: false, ytd: y === S.dates[S.N - 1].slice(0, 4) && S.dates[S.N - 1].slice(5) < "12-20" };
      for (const code of CODES) {
        const c = C(code);
        if (b <= c.i0) { out[code] = null; continue; }
        const a = prevEnd != null && prevEnd >= c.i0 ? prevEnd : c.i0;
        if (a === c.i0 && S.dates[c.i0].slice(0, 4) === y) out[code + "_partial"] = true;
        out[code] = pos(c, a, b, k.spread).total;
        out[code + "_rate"] = effRate(c.idx, a, b, c.basis);
      }
      const a = prevEnd != null ? prevEnd : 0;
      out.tl = effRate(S.tl.idx, a, b, S.data.meta.tlBasis);
      return out;
    });
    const tot = {};
    for (const code of CODES) {
      const c = C(code), r = pos(c, c.i0, S.N - 1, k.spread).total;
      tot[code] = r; tot[code + "_ann"] = annualize(r, dayDiff(S.dates[c.i0], S.dates[S.N - 1]));
      tot[code + "_rate"] = effRate(c.idx, c.i0, S.N - 1, c.basis);
    }
    tot.tl = effRate(S.tl.idx, 0, S.N - 1, S.data.meta.tlBasis);
    return { rows, tot };
  }
  function renderYears() {
    const { rows, tot } = yearData();
    const rates = CODES.map((c) => C(c).rate);
    const head = `<thead><tr><th>${L("Yıl", "Year")}</th>${CODES.map((c) => `<th>${c} carry</th>`).join("")}<th>TLREF</th>${rates.map((r) => `<th>${r}</th>`).join("")}</tr></thead>`;
    const yl = (r) => r.ytd ? L(`${r.y} (yılbaşından bugüne)`, `${r.y} (year to date)`) : r.y;
    const body = rows.map((r) => `<tr><td>${yl(r)}</td>` +
      CODES.map((c) => `<td class="${cls(r[c])}">${r[c] == null ? "–" : spct(r[c]) + (r[c + "_partial"] ? "*" : "")}</td>`).join("") +
      `<td>${rate(r.tl)}</td>` + CODES.map((c) => `<td>${rate(r[c + "_rate"])}</td>`).join("") + `</tr>`).join("");
    const foot =
      `<tr class="total"><td>${L("Tüm dönem (kümülatif)", "Full period (cumulative)")}</td>${CODES.map((c) => `<td class="${cls(tot[c])}">${spct(tot[c])}</td>`).join("")}` +
      `<td>${rate(tot.tl)}</td>${CODES.map((c) => `<td>${rate(tot[c + "_rate"])}</td>`).join("")}</tr>` +
      `<tr class="total"><td>${L("Yıllıklandırılmış", "Annualised")}</td>${CODES.map((c) => `<td class="${cls(tot[c + "_ann"])}">${spct(tot[c + "_ann"])}</td>`).join("")}<td colspan="5"></td></tr>`;
    $("yearTable").innerHTML = head + "<tbody>" + body + foot + "</tbody>" +
      `<caption style="caption-side:bottom;text-align:left;color:var(--muted);font-size:.84rem;padding-top:8px">` +
      L("Faiz sütunları, dönemin birikimini veren sabit gecelik faizdir (yıllık). * Para biriminin başlangıç tarihinden yıl sonuna.",
        "Rate columns show the constant overnight rate that produces the period's accrual (annualised). * From the currency's start date to year end.") + `</caption>`;
  }

  // ── İndirme ───────────────────────────────────────────────────────────
  const sep = () => (isEN() ? "," : ";");
  const num = (v, d = 6) => (v == null || !isFinite(v)) ? "" : isEN() ? v.toFixed(d) : v.toFixed(d).replace(".", ",");
  function download(name, head, rows) {
    const text = "﻿" + [head.join(sep())].concat(rows.map((r) => r.join(sep()))).join("\r\n");
    const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }
  function dlMain() {
    const k = cfg(), c = C();
    const head = isEN()
      ? ["Open date", "Close date", "Carry return (%)", "Rate differential (%)", "FX effect (%)", "Spread (%)", "TLREF (%)", `${c.rate} (%)`, `${k.cur}TRY buy`, `${k.cur}TRY sell`]
      : ["Açılış", "Kapanış", "Carry getirisi (%)", "Faiz farkı (%)", "Kur etkisi (%)", "Makas (%)", "TLREF (%)", `${c.rate} (%)`, `${k.cur}TRY alış`, `${k.cur}TRY satış`];
    const rows = S.series.map((p) => [S.dates[p.i0], S.dates[p.j], num(p.total * 100, 4), num(p.carry * 100, 4), num(p.fx * 100, 4), num(p.spr * 100, 4),
      num(S.tl.used[p.j], 4), num(c.used[p.j], 4), num(c.buy[p.j], 6), num(c.sell[p.j], 6)]);
    download(`tlref_carry_${k.cur}_${k.view === "cum" ? L("kumulatif", "cumulative") : k.view + L("ay", "m")}${k.spread ? "" : L("_makassiz", "_nospread")}.csv`, head, rows);
  }
  function dlPeriod() {
    const c = C(), code = S.cur, { i0, i1 } = S.period;
    const rows = S.periodRowsCache || [];
    const head = isEN()
      ? ["Date", "Days", "TLREF published (%)", "TLREF effective (%)", `${c.rate} effective (%)`, `${code}TRY buy`, `${code}TRY sell`, "TLREF index", `${c.rate} index`, "Overnight return mid (%)", "TL balance", `Debt (${code})`, `Position value (${code})`, "Cumulative return (%)"]
      : ["Tarih", "Gün", "TLREF yayım (%)", "TLREF etkin (%)", `${c.rate} etkin (%)`, `${code}TRY alış`, `${code}TRY satış`, "TLREF endeksi", `${c.rate} endeksi`, "Gecelik getiri orta (%)", "TL bakiye", `Borç (${code})`, `Pozisyon değeri (${code})`, "Kümülatif getiri (%)"];
    const out = rows.map((r) => [r.date, r.days, num(r.tlPub, 4), num(r.tlEff, 4), num(r.fEff, 4), num(r.buy, 6), num(r.sell, 6),
      num(S.tl.idx[r.i], 10), num(c.idx[r.i], 10), num(r.night * 100, 4), num(r.tlBal, 2), num(r.debt, 2), num(r.value, 2), num(r.cum * 100, 4)]);
    download(`tlref_carry_${code}_${S.dates[i0]}_${S.dates[i1]}.csv`, head, out);
  }
  function dlYears() {
    const { rows, tot } = yearData();
    const head = [L("Yıl", "Year"), ...CODES.map((c) => `${c} carry (%)`), "TLREF (%)", ...CODES.map((c) => `${C(c).rate} (%)`)];
    const out = rows.map((r) => [r.y, ...CODES.map((c) => num(r[c] == null ? null : r[c] * 100, 2)), num(r.tl, 3), ...CODES.map((c) => num(r[c + "_rate"], 3))]);
    out.push([L("Tüm dönem", "Full period"), ...CODES.map((c) => num(tot[c] * 100, 2)), num(tot.tl, 3), ...CODES.map((c) => num(tot[c + "_rate"], 3))]);
    download(`tlref_carry_${L("yillik", "annual")}.csv`, head, out);
  }

  // ── Dil ve statik içerik ──────────────────────────────────────────────
  function applyLanguage() {
    document.documentElement.lang = LANG;
    document.title = L("TLREF Carry Analizi", "TLREF Carry Analysis");
    document.querySelectorAll("option[data-tr]").forEach((o) => { o.textContent = isEN() ? o.dataset.en : o.dataset.tr; });
    const btn = $("langBtn");
    btn.textContent = isEN() ? "Türkçe" : "English";
    btn.setAttribute("aria-label", isEN() ? "Türkçeye geç" : "Switch to English");
    document.querySelector(".controls").setAttribute("aria-label", L("Analiz ayarları", "Analysis settings"));
  }
  function renderMeta() {
    const m = S.data.meta, d = S.dates;
    $("metaLine").textContent = isEN()
      ? `Data: ${fdate(d[0])} – ${fdate(d[S.N - 1])} (daily, ${nf(S.N)} valuation days). Latest observations: TLREF ${fdate(m.last.TLREF)}, SOFR ${fdate(m.last.SOFR)}, €STR ${fdate(m.last["€STR"])}, SONIA ${fdate(m.last.SONIA)}, TONA ${fdate(m.last.TONA)}. Data updated: ${fdate(m.generated)}.`
      : `Veri: ${fdate(d[0])} – ${fdate(d[S.N - 1])} (günlük, ${nf(S.N)} değerleme günü). Son gözlemler: TLREF ${fdate(m.last.TLREF)}, SOFR ${fdate(m.last.SOFR)}, €STR ${fdate(m.last["€STR"])}, SONIA ${fdate(m.last.SONIA)}, TONA ${fdate(m.last.TONA)}. Veri güncelleme: ${fdate(m.generated)}.`;
    $("metaFiles").textContent = L("Kaynak dosyalar (data/raw): ", "Source files (data/raw): ") + Object.values(m.files).join(", ") + ".";
  }
  function setLanguage(lang) {
    LANG = lang;
    safeSet("tlref-lang", lang);
    try {
      const u = new URL(location.href);
      if (lang === "en") u.searchParams.set("lang", "en"); else u.searchParams.delete("lang");
      history.replaceState(null, "", u);
    } catch (_) { /* gömülü görünümde URL değiştirilemeyebilir */ }
    applyLanguage();
    if (S.data) renderAll();
  }

  function renderAll() {
    renderMeta();
    renderMain();
    renderDaily();
    renderRates();
    renderPeriod();
    renderCompare();
  }

  function selectCurrency(code) {
    S.cur = code;
    safeSet("tlref-cur", code);
    document.querySelectorAll("#curTabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.cur === code)));
    const c = C();
    if (S.periodAll || S.period.i0 < c.i0) setPeriod(c.i0, S.N - 1, { all: true });
    else setPeriod(S.period.i0, S.period.i1);
    renderMain(); renderDaily(); renderRates(); renderCompare();
  }

  // ── Olaylar ───────────────────────────────────────────────────────────
  function bind() {
    $("langBtn").addEventListener("click", () => setLanguage(isEN() ? "tr" : "en"));
    document.querySelectorAll("#curTabs button").forEach((b) => b.addEventListener("click", () => selectCurrency(b.dataset.cur)));
    $("curTabs").addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const k = CODES.indexOf(S.cur) + (e.key === "ArrowRight" ? 1 : -1);
      const code = CODES[(k + CODES.length) % CODES.length];
      selectCurrency(code);
      document.querySelector(`#curTabs [data-cur="${code}"]`).focus();
    });
    $("view").addEventListener("change", renderMain);
    $("spread").addEventListener("change", () => { renderMain(); renderPeriod(); renderCompare(); });
    $("showCarry").addEventListener("change", () => Plotly.restyle("mainChart", { visible: $("showCarry").checked }, [2]));
    $("showFx").addEventListener("change", () => Plotly.restyle("mainChart", { visible: $("showFx").checked }, [3]));
    $("showEvents").addEventListener("change", renderMain);

    let clickTimer = null, ignoreUntil = 0;
    const cancel = () => { clearTimeout(clickTimer); clickTimer = null; ignoreUntil = Date.now() + 450; };
    $("mainChart").on("plotly_doubleclick", cancel);
    $("mainChart").on("plotly_click", (e) => {
      if (Date.now() < ignoreUntil) return;
      if (clickTimer) { cancel(); return; }
      const p = e.points.find((q) => q.curveNumber === 4) || e.points[0];
      if (!p) return;
      clickTimer = setTimeout(() => {
        clickTimer = null;
        const pt = S.series[p.pointIndex];
        if (!pt) return;
        if (cfg().view === "cum") setPeriod(pt.i, S.N - 1, { all: false });
        else setPeriod(pt.i0, pt.j, { all: false });
        renderMain();
        document.getElementById("donem").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      }, 330);
    });
    $("mainChart").on("plotly_relayout", updateStats);
    $("dailyChart").on("plotly_relayout", renderDailyStats);

    $("pStart").addEventListener("change", () => { if ($("pStart").value) setPeriod(idxOnOrAfter($("pStart").value), S.period.i1, { all: false }); renderMain(); });
    $("pEnd").addEventListener("change", () => { if ($("pEnd").value) setPeriod(S.period.i0, idxOnOrBefore($("pEnd").value), { all: false }); });
    $("pAmount").addEventListener("input", renderPeriod);
    $("tableMode").addEventListener("change", renderPeriod);
    document.querySelectorAll("[data-quick]").forEach((b) => b.addEventListener("click", () => {
      const q = b.dataset.quick, c = C();
      if (q === "all") setPeriod(c.i0, S.N - 1, { all: true });
      else if (q === "last12") setPeriod(idxOnOrAfter(addMonths(S.dates[S.N - 1], -12)), S.N - 1, { all: false });
      else setPeriod(S.period.i0, idxOnOrAfter(addMonths(S.dates[S.period.i0], +q)), { all: false });
      renderMain();
    }));
    $("cmpStart").addEventListener("change", renderCompare);
    $("dlMain").addEventListener("click", dlMain);
    $("dlPeriod").addEventListener("click", dlPeriod);
    $("dlYears").addEventListener("click", dlYears);

    // Tema değişince grafik renkleri yeniden okunur
    const rerender = () => { if (S.data) { renderMain(); renderDaily(); renderRates(); renderCompare(); } };
    try { matchMedia("(prefers-color-scheme: dark)").addEventListener("change", rerender); } catch (_) { /* eski tarayıcı */ }
    new MutationObserver(rerender).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    let w = window.innerWidth;
    window.addEventListener("resize", () => { if ((w < 700) !== (window.innerWidth < 700)) { w = window.innerWidth; rerender(); } });
  }

  // ── Başlatma ──────────────────────────────────────────────────────────
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
      } catch (err) {
        fail(location.protocol === "file:"
          ? L("Veri dosyası tarayıcı güvenliği nedeniyle doğrudan dosyadan açılamıyor. Repo klasöründe <code>python -m http.server</code> çalıştırıp http://localhost:8000 adresini açın.",
              "The data file cannot be opened directly from disk for browser security reasons. Run <code>python -m http.server</code> in the repo folder and open http://localhost:8000.")
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
    if (saved && CODES.includes(saved)) S.cur = saved;
    document.querySelectorAll("#curTabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.cur === S.cur)));
    S.period = { i0: C().i0, i1: S.N - 1 };
    setPeriod(C().i0, S.N - 1, { all: true });
    renderMeta(); renderMain(); renderDaily(); renderRates(); renderCompare();
    bind();
  }

  init();
})();
