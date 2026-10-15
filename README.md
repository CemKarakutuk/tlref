# TLREF Carry Trade: Gross Returns on Overnight Funding

**Live site: [cemkarakutuk.github.io/tlrefcarry](https://cemkarakutuk.github.io/tlrefcarry/)** · Türkçe ve İngilizce · *Site is bilingual (TR/EN); use the language button in the top-right corner.*

An interactive, open-data study of the classic carry trade into the Turkish lira: borrow overnight in **New York (SOFR)**, **Frankfurt (€STR)**, **London (SONIA)** or **Tokyo (TONA)**, convert into lira, and earn the lira overnight reference rate **TLREF**. Daily, from 2 January 2019 (€STR from 1 October 2019) to the present.

Companion to the deposit-based study [Carry trade returns and TL deposit rate policy](https://cemkarakutuk.github.io/trcarryreturn/), which uses weighted-average TL deposit rates back to 2002. This study uses the overnight rate the institutional market actually trades, over a shorter but daily window.

## What the site does

The visitor chooses the funding currency (USD, EUR, GBP, JPY), a holding period in days and a date range. For every opening day in the range, the site computes the gross return of a position opened that day and closed after the chosen number of days (not annualised) and plots it on a single chart. Zooming works on the date axis only and the vertical axis rescales to the visible range. The table below lists each opening day in detail: TLREF and funding rate that day, entry and exit exchange rates, closing date and day count, average rates over the period, TL return, funding cost, FX change and carry return. Table data and the combined dataset can be downloaded as CSV.

## Method

Each reference rate applies from its publication day until the next one, accruing for calendar days (SOFR Index logic):

```
I(d_{i+1}) = I(d_i) · (1 + r_i · (d_{i+1} − d_i) / B)
R(t)       = A(t0) · [I_TL(t) / I_TL(t0)] / S(t) − I_F(t) / I_F(t0)
```

`A` and `S` are CBRT buying and selling rates, `B` is the day-count basis (TLREF, SONIA, TONA ACT/365; SOFR, €STR ACT/360). The return is relative to the foreign currency principal borrowed and is given for the holding period, not annualised.

**Exchange rate timing.** In EVDS, the CBRT indicative rate dated *t* is set at 15:30 on the previous business day and valid on *t* (the rate dated 22 Dec 2021 reflects the 21 Dec market, after KKM was announced). Rates are shifted back to the day they were set so they line up with that day's TLREF and funding rate.

Returns are **gross**: no taxes, fees, margin or credit spread over the reference rates.

## Repository layout

```
index.html                 Site
assets/css/styles.css      Styling (same theme as trcarryreturn)
assets/js/app.js           Calculation engine, chart, bilingual UI
data/dataset.json          Processed dataset the site reads
data/dataset.csv           Same data as CSV (rates, accrual indices, FX)
data/events.json           Event markers on the main chart (edit by hand)
data/raw/                  Source files
scripts/update_data.py     Builds dataset.json and dataset.csv from data/raw/
.github/workflows/         Regenerates the dataset when data/raw/ changes
```

## Updating the data

Upload refreshed files to `data/raw/`; the GitHub Actions workflow rebuilds the dataset. File names only need to start with these words (`.xlsx` or `.csv`):

| File | Contents | Source |
| --- | --- | --- |
| `evds` | `TP.BISTTLREF.ORAN`, USD/EUR/GBP/JPY buying and selling rates (daily) | CBRT EVDS |
| `sofr` | SOFR (`Effective Date`, `Rate (%)`) | New York Fed |
| `estr` | €STR | ECB Data Portal |
| `sonia` | IUDSOIA | Bank of England |
| `tona` | FM01'STRDCLUCON | Bank of Japan |

To rebuild locally:

```bash
pip install pandas openpyxl
python scripts/update_data.py
python -m http.server   # then open http://localhost:8000
```

## License

MIT — see [LICENSE](LICENSE). The underlying data belongs to its respective publishers.

## Contact

Cem Karakutuk · [cemkarakutuk@hotmail.com](mailto:cemkarakutuk@hotmail.com)

This project is for academic purposes and does not constitute investment advice.
