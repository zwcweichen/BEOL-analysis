# BEOL_Analysis：Agent 接手文件

> 給接手的 AI agent（或工程師）閱讀。讀完這份就能繼續開發，不必回頭看對話紀錄。
> 版本：BEOL 分析戰報 **v2.7**（2026-10-11）。P1、P2 完成；**P3 結案回饋暫緩**（使用者決定）。主線：分析與戰報產出、使用者只提供資料的體驗。

---

## 1. 專案在做什麼

給半導體 **BEOL（Cu interconnect）製程整合工程師**使用的 **單一 HTML 分析工具**，用途是比較 **BSL（baseline）與 CIP（改善條件）** 的差異。

- 匯入 Excel 或 CSV 後，系統自動判斷欄位，跑一套**固定、不發散**的分析，產生 one-page 戰報（點燈表、異常 HL、診斷文字）、Trend 矩陣和 Correlation，最後可以匯出 HTML 或 PPT。
- 模組：**WAT** ✅、**Inline** ✅、**Yield** ✅（by wafer 的 yield／bin K-shift，診斷對照同組 WAT）。
- 產品定位：用一個「AI agent 式」的**確定性診斷知識庫**（`rules.js`），把 WAT 偏移連到同層 inline 的物理原因，直接寫出結論與建議檢查項目。

### 使用者（製程整合主管）的硬性需求，務必遵守

| # | 需求 | 對實作的影響 |
|---|---|---|
| 1 | **單一 HTML、可離線** | 程式庫全部 inline（`build.py`）；lite 版改由 CDN 載入 |
| 2 | 其他電腦**可能不能下載檔案，只能複製程式碼** | 有 lite 版（0.17 MB）；有單一 Python 產生器 `make_BEOL_Analysis.py`，可展開整個專案 |
| 3 | **不限定資料格式** | 寬表（by wafer）和長表（by site，Item／Value）都要支援；欄名不固定，靠自動判斷 |
| 4 | 分析要**固定、不發散**；報告要**簡潔、工整、明亮** | 不加自由作圖（自由作圖在另一個工具 ProcessDataTool）；淺色主題 |
| 5 | 點燈格**只顯示一個數字**＋底色 | 不加箭頭、不加 N |
| 6 | 分組欄、比較欄、BSL、CIP 都要能由使用者切換 | 例如依產品 A／B／C 分組，各自算 POR 與 CIP 的差 |
| 7 | 盡量**不用滾輪上下捲動**；6 產品 × 6 層這種大表也不能擁擠 | 戰報做成儀表板：左邊點燈表，右邊 HL 清單加詳細；點燈表依欄數自動切換標準／緊湊／熱圖密度（`pickDensity`），太寬時改為上下堆疊；提供只看異常、層別、類別收合、HL 篩選 |
| 8 | 圖可以**彈出浮動視窗**放大、縮放，**同時開多個**比對 | 非 modal 視窗管理器 |
| 9 | 匯出 **HTML 與 PPT** | PPT 包含：WAT 點燈表／HL trend／總覽 trend，以及 Inline 的同樣三項 |
| 10 | GitHub **暫不推送** | 只在本機 git commit |

---

## 2. 領域知識（判斷規則）

### 2.1 指標

| 類型 | 適用 | 定義 | 燈號預設（綠 ≤／橘 >） |
|---|---|---|---|
| `k` | 一般 WAT、inline | K = (Mean_CIP − Mean_BSL) / σ_BSL，σ 為樣本標準差（n−1） | 1σ／1.5σ |
| `fold` | **LK 漏電流** | median_CIP ÷ median_BSL，以 max(f, 1/f) 判斷；**trend 用 log 軸** | ×2／×5 |
| `rate` | **SPA**（輸出電壓，正常讀值是固定值，例如 20 V） | 自動找出眾數當固定值（占比 ≥ 30%）；讀值偏離 0.5% 以上算異常；比較 CIP 與 BSL 的異常比例差（%pt） | 2%pt／5%pt |
| W2W | inline 變異 | 各片 wafer mean 的 σ，CIP ÷ BSL | ×1.3／×1.6 |
| WIW | inline 片內 | 每片 site σ 的平均，CIP ÷ BSL（需要 by site 資料） | ×1.3／×1.6 |

- 黃燈介於綠、橘之間；灰燈表示無法判定，並附原因（例如「CIP 無資料」「BSL σ = 0」）。
- 門檻存在 `localStorage['rpt-th']`，預設 `{kG:1,kO:1.5,fG:2,fO:5,rG:2,rO:5,sG:1.3,sO:1.6}`。
- 找不到固定值的 SPA，或含 ≤ 0 值的 LK，會自動退回 `k`。
- SPA 讀值越低越異常，所以 SPA 與 CD 的**原始值相關預期為負**（`rawSign()` 會把方向翻轉）；但「異常比例」與 CD 同向。

### 2.2 診斷知識庫：`src/report/rules_base.js`（資料）＋ `src/report/rules.js`（程式）
- **規則是資料**：一條規則一個物件，欄位見 `R.FIELDS`。欄名／單位用萬用字元（`*`、`?`、`#`，`;` 分隔），`R.globToRe` 編譯成 regex；沒有 `*` 的樣式以整個名稱或單字比對。
- `R.load(base, overlay)`：基礎層 + fab 層（`localStorage['rpt-kb']`）合併 → `R.RULES`（平面）與 `R.CATS`（編譯後）。`R.kbVersion()` 印在頁尾。`R.dryRun(columns)` 回傳每條規則命中的欄位。`R.canon()` 用來判斷匯入的規則是否與基礎層不同。
- 知識庫頁在 `app.js`：`renderKB` / `renderKBForm` / `kbExcel` / `kbImport` / `kbSave`（儲存後重新分類未手動指定的 item 並重算）。
- 新增 fab 命名習慣：改 `rules_base.js` 的 `name` 樣式或在知識庫頁新增，再加變體資料與測試。
- 參考文獻：`docs/REFERENCES.md`（10 份，含 DOI）；arXiv 論文在 alphaXiv 資料夾「BEOL knowledge（戰報知識庫參考）」。

- 類別：`rs` `rc` `lk` `spa` `vbd` `cap` `vt` `id`（WAT）；`vcd` `cd` `thk`（inline）；`yield` `bin`（yield）；`other`。每條有 `bad`（up／down）表示壞的方向，用於 yield↔WAT 的相關方向。
- 每個類別包含：
  - 名稱 regex 與單位 regex
  - `up` 和 `down` 各自的 `{mean 意義, causes, checks}`
  - `pairs`：與哪個 inline 類別配對，以及預期的正負方向
- **層別代號** `R.layer()`：M12、V12、TM1、TV2…；`VIA2` 會轉成 V2，`METAL3` 會轉成 M3。只有同層才配對。
- 欄名解析 `R.parseName()`：支援 `Con_M12~OHM/SQ~Mean`，也支援 `RS_M3 (ohm/sq)`、`M3 CD [nm]`。
- **inline 交叉驗證**（`R.diagnose`），門檻 |K| ≥ 0.5：
  - 方向一致：主因很可能是尺寸偏移
  - 沒有明顯偏移，或方向相反：尺寸無法解釋，優先查製程條件與機台 commonality
  - 沒有同層 inline：建議調出對應的 inline 數據
- `R.diagnoseInline`：inline 偏移時，推估對同層 WAT 的預期影響，並標出 WAT 目前有沒有已經同向偏移。
- `R.diagnoseVar`：W2W 或 WIW 變異異常時的原因與檢查項目；THK 和 CD 的內容不同。

> 新增 fab 的命名習慣時，先改 `R.CATS` 的 regex 或 `R.layer()`，再加一份變體資料到 `sample_data/gen_variants.py` 並寫測試。

---

## 3. 架構

```
BEOL_Analysis/
├─ BEOL_Report.html         ← 成品，離線完整版（約 6.1 MB，內含 Plotly、SheetJS、PptxGenJS）
├─ BEOL_Report_lite.html    ← 成品，lite 版（約 0.17 MB，程式庫由 cdn.jsdelivr.net 載入）
├─ make_BEOL_Analysis.py    ← 單一 Python 產生器（約 2 MB，可離線）；_lite.py 約 0.12 MB
├─ build.py                 ← 把 src/ 打包成上面兩個 HTML（輸出到根目錄）
├─ src/
│  ├─ report.html           ← HTML 樣板，用 <!--INLINE:path--> 標記要嵌入的檔案
│  ├─ report/report.css
│  ├─ report/rules_base.js  ← 知識庫資料（App.RULES_BASE）
│  ├─ report/rules.js       ← 知識庫程式：編譯、合併 fab 層、診斷文字（App.rules）
│  ├─ report/engine.js      ← 資料準備、自動設定、計算、摘要文字（App.rptEngine）
│  ├─ report/app.js         ← UI：設定、戰報、Trend 矩陣、Correlation、視窗、匯出（App.rpt、App.rptUI）
│  └─ js/core.js importer.js transform.js stats.js   ← 與 ProcessDataTool 共用：讀檔、長寬表轉換、統計
├─ vendor/                  ← plotly 2.35.3、xlsx 0.18.5、pptxgenjs 3.12.0
├─ docs/BEOL_REPORT.md      ← 設計說明（給人看）；docs/ROADMAP.md 路線；docs/REFERENCES.md 文獻
├─ sample_data/             ← gen_*.py 範例資料產生器（numpy／pandas／openpyxl）與產出的檔案
└─ tests/                   ← Playwright 端對端測試，參考值用 pandas 獨立計算
```

### 3.1 資料流

```
File → E.load()（importer 讀檔 → transform.buildDatasets）
     → { ds（每片一列）, siteDs（by site 表，用於 WIW 和徑向分布） }
     → E.autoConfig(ds) → cfg { waferCol, dateCol, groupCol, condCol, baseline, cips[], items[], mode }
     → E.compute(ds, cfg, siteDs) → res { cells[item][group][cip], findings{wat,inline,yield}, cnt, varCnt, naList, ... }
     → 資料層：E.waferKey / E.findWaferCol / E.collapseLinked / E.linkInto（app.js linkFile / unlink；S.links 記錄配對率與新增欄位）
     → E.scanFactors(ds, cfg, item, group, cip, cell) → 疑似因子排名（Kruskal–Wallis、ε²、BH、混淆偵測）；app.js factorHtml / factorFig / factorVerdict
     → app.js 繪製畫面；R.diagnose* 產生每個 finding 的 dx { title, cat, verdict, causes, checks, fallback }
```

- **自動設定**：
  - 比較欄：名稱符合 /fab|split|cond|route|tool|chamber…/，且有 2～12 個不同值。
  - BSL：筆數最多的值，或名稱是 POR／BSL 的值；其餘值都當 CIP。
  - 分組欄：名稱符合 /part|product|layer…/。
  - 找不到比較欄，或比較欄只有一個值時，**停在設定頁要使用者選**，不產生假報告。
- **cell 欄位**：`metric, k, n, mean, sd, bn, bmean, bsd, median, bmedian, level, dir, text, reason, low`，再依指標加上 `fold`、`rateC/rateB/diff`、`sdRatio/sdLevel`、`wiwRatio/wiwLevel/wiwC/wiwB`、`varLevel`。
- **finding**：`{ type:'mean'|'var', which?:'wiw'|'w2w', cell, rel, score, dx, varLevel? }`；`res.lvOf(f)` 取燈號。

### 3.2 UI（app.js 主要函式）

| 區塊 | 函式 |
|---|---|
| 模組切換 | `renderMods`, `setMode`（`S.mode` = 'wat'／'inline'） |
| 設定頁 | `renderSetup`（欄位、類別下拉選單、粒度 by wafer／by site） |
| 戰報儀表板 | `renderReport` → `ctrlBar`（分組欄、比較欄、BSL、CIP，改了即重算）＋ `pickDensity` / `lightTable(kind, view, dens)`（含列篩選 `S.rowf`、類別收合 `S.collapsed`、欄位異常數 footer）＋ HL 清單（`S.hlf` 篩選）`selectHL` → `renderHL`；`.dash.stack` 與 `.pane.hl.narrow` 依寬度切換 |
| 疑似因子 | `factors`（快取）、`factorHtml`（HL 面板表格，含 ΔK）、`factorVerdict`（一句話，進純文字／HTML／PPT）|
| 引導式檢查 | `checkHint(f, text)`：以關鍵字把每條建議檢查對應到 ok／need／nav／ext 與一個動作（開相關圖、機台分析、連結檔案、切模組） |
| 機台分析 | `openToolWin(item, group, cip, col)`：分組欄 chips 可複選組合；`E.factorLevels` 算 run 貨比例、K、KW；左 run-rate 長條＋表，右 box plot |
| 知識庫頁 | `renderKB`、`renderKBForm`、`kbExcel`、`kbImport`、`kbSave` |
| 圖 | `trendFig`（k：±1σ／±2σ 灰帶；fold：log 軸＋×÷門檻帶；rate：固定值線＋◆標出異常點）、`radialFig`、`corrFig`（LK 以 log 值擬合）、`mainFig`、`partnerFig` |
| 浮動視窗 | `openWin` `closeWin` `closeTopWin`（Esc）、`openCell`、`openCorrWin`；小圖都是 `staticPlot`，點一下開成可互動的視窗 |
| Trend 矩陣 | `renderTrend`（列 = item，欄 = 分組，IntersectionObserver 延遲繪圖） |
| 匯出 | `buildHtml` / `exportHtml` / `printReport`；`buildPpt` / `exportPpt`（點燈表是 PPT 原生表格，圖用 `figPng` 離屏轉成 PNG） |
| 測試用介面 | `App.rptUI = { loadFile, generate, setMode, buildPpt, summary, openCell, closeAllWins, selectHL, wins, ... }` |

---

## 4. 開發與驗證流程

```bash
python build.py                          # 產生 BEOL_Report.html 與 _lite.html
python sample_data/gen_wat_fab.py        # 其他產生器：gen_inline_fab、gen_variants、gen_beol＋write_xlsx_single
node tests/e2e_report.js                 # 49 項：WAT／Inline 數值與 pandas 比對、儀表板、分組切換、視窗、矩陣、HTML／PPT 匯出
node tests/e2e_variants.js               # 21 項：沒為工具設計過的資料（CSV、不同欄名、三個條件、長表、單一條件）
```

- `tests/e2e_report.js` 現在也涵蓋疑似因子（V12_ETCH_CH 命中、M12_CMP_Tool 混淆）、Yield 模組、知識庫頁編輯與 Excel 來回匯入。
- 測試需要 Node、Playwright 和 Python（pandas、python-pptx）。在 Anthropic 的雲端沙箱中，用 `NODE_PATH=/home/claude/.npm-global/lib/node_modules node tests/xxx.js`，Chromium 在 `/opt/pw-browsers`。
- **改完程式一定要重跑兩組測試，並截圖目視檢查版面**（使用者很在意版面）。
- 測試用 `App.rptUI` 和 `App.rpt.res` 取值；參考值由 `tests/expected_beol.py` 或測試裡的 inline pandas 計算，**不要把數值寫死**。
- 更新單一 Python 產生器：在原始開發 repo（pdat）執行 `python tools/pack_beol.py`，產出 `dist/make_BEOL_Analysis(_lite).py`。打包清單是 `tools/pack_beol.py` 裡的 `FILES`；新增檔案要加進清單。

### 範例資料裡埋的故事（測試依賴這些設定）

| 檔案 | 故事 |
|---|---|
| `WAT_FAB_compare.xlsx`（寬表，Part6 × FAB18／FAB15） | TMTQ11 Rc_V12 偏高（V12 CD −2.6）；TMRX12 LK_M12 ×2.96，SPA_M12／M13 異常率上升（M12 CD +2.2）；TMWF54 Con_M13 +1.38σ（M13 THK 偏薄）；TMRF89 的 SPA_M13 缺 CIP 資料 |
| `INLINE_FAB_compare.xlsx`（長表，每片 9 點） | TMWF54 M13 THK −3.5% 且 edge 變差（WIW ×2.4）；TMTQ11 V12 CD −2.6；TMRX12 M12 CD +2 且 W2W ×1.9 |
| `BEOL_horizontal_by_wafer.xlsx`／`BEOL_vertical_by_site.xlsx` | 使用者最早定義的兩種格式；Split = POR／Thin_TaN。垂直格式沒有條件欄，工具應該停在設定頁 |
| `variants/` | 用來測試工具在不同資料形狀下的表現；`F_big_6x6.xlsx`（`gen_big.py`）是 6 產品 × 6 層 × 2 CIP 的壓力測試 |
| `TOOL_history_wide.xlsx`／`TOOL_history_long.xlsx`（`gen_tool_history.py`） | 連結到 WAT 範例的機台履歷；wafer id 用 `-`、缺 4%；TMRX12 FAB15 高 LK 的 wafer 走 ECP02；長表含 rework 列 |

---

## 5. 狀態與待辦

### 已完成（依時間排序）
- v1.0：WAT 戰報（K-shift、點燈表、診斷、Trend、Correlation、HTML 匯出）
- v2.0：改名 BEOL；LK 改用倍數＋log 軸；SPA 改用固定值異常比例；新增 Inline 模組（均值、W2W、WIW、徑向分布、對 WAT 的影響）
- v2.1：點燈格只顯示數字；戰報頁可切換分組、比較欄、BSL、CIP；儀表板版面；Trend 矩陣；浮動視窗；PPT 匯出；強化不同欄名的解析；單一 Python 產生器
- v2.7：可能原因依證據排序（`rankCauses`：cd／vcd／thk／xlayer／xcd／tool／ext 六類證據，✔／·／✘ 三態）；`App.XLAYER` 第 2 輪（rc←topo／cd、vbd←topo、cap←above）；跨層原因加入 base；文獻第 3 批（#21–#29）；比較欄先看值
- v2.6：疑似因子表→交叉比對卡（Inline／跨層／機台／Yield）；建議檢查精簡；機台視窗改版（結論行、run 貨 %、每週 run 貨＋出現期間、K 標註在 box 上、最差排最左）；跨層知識 `App.XLAYER`＋`topo` 類別＋`R.relatedXLayer`；比較欄先看值；三角色自審流程；文獻第 2 批（#11–#20）
- v2.5：引導式建議檢查（✔／○／➜／◇ 加一鍵動作）、機台分析視窗（run 貨比例、box plot、組合分組）、疑似因子 ΔK 判定
- v2.4：資料層（連結第二個檔案）
- v2.3：知識庫資料化與知識庫頁、疑似因子掃描、Yield 模組
- v2.2：大型點燈表自適應（標準／緊湊／熱圖、堆疊、sticky、欄位異常數、篩選與收合）；壓力測試資料 `gen_big.py`；PPT 大表字級自動縮小

### 開發路線（見 docs/ROADMAP.md，2026-10-09 討論）
- P1 ✅（v2.3）：規則公版＋知識庫頁；單檔內類別欄自動掃描；Yield 模組提前完成
- P2 ✅（v2.4）：資料層（wafer 鍵正規化、配對率、一片多列先壓、長表→寬表、rework 取最後一次）；疑似因子已在 P1
- P3：結案回饋與規則命中率、CUSUM 變化點、規格欄
- P4：知識庫套件化（FEOL.json 等）

### 下一步（尚未開始）
1. 每版照三角色自審（A 開發／B 使用者模擬：產 1～2 份新資料／C 體驗回饋 = B 的視角 + 管理者視角）；流程與紀錄在 `docs/REVIEW_LOG.xlsx`（角色定義、自審紀錄、模擬資料、檢核清單），每版自審在 Excel 加列，開啟的項目由 A 決定修／延後／不做。
1b. 跨層表 `App.XLAYER` 目前只能改原始碼；之後可併入知識庫頁（Excel 多一個 sheet）。可能原因可依證據加權排序；run 貨圖在無失衡時自動收合；box 點擊列 wafer 清單。
2. **P3 結案回饋暫緩**（使用者 2026-10-09 決定），之後再做：HL 結案紀錄、規則命中率、CUSUM、規格欄。
3. 使用者確認：wafer id 在所有資料中一致，`.xx` 結尾。
2. 依使用者實際的 fab 欄名微調 `R.CATS` 和 `R.layer`（使用者會提供欄名）。
3. 長表的日期欄名稱有時顯示成「Parameter 時間」（transform 的命名問題），不影響計算，有空再修。

### 交付位置與慣例
- 使用者電腦：`C:\Claude_project\Data analysis工具\BEOL_Analysis\`，由 Cowork 的 device bridge 寫入。
- claude.ai Project「半導體製程整合」：放原始碼與 lite 版；**不要放 6 MB 的完整版 HTML**（Project 有容量上限）。
- Git：只 commit，**不 push**（使用者要求先不用 GitHub）。
- 介面文字一律用**繁體中文**；數字的負號用「−」（U+2212）；報告色系固定：深藍 `#1f3b63`、綠 `#1e8e4e`、黃 `#a86b00`、橘 `#d4580f`、灰 `#98a2b3`。
