# BEOL_Analysis：Agent 接手文件

> 給接手的 AI agent（或工程師）閱讀。讀完這份就能繼續開發，不必回頭看對話紀錄。
> 版本：BEOL 分析戰報 **v3.14**（2026-11-10）。P1、P2 完成；**P3 結案回饋暫緩**（使用者決定）。主線：分析與戰報產出、使用者只提供資料的體驗。

---

## 0. 接手摘要（Update summary，2026-11-10 整理）

> 這一節是「接續記憶」用：另一個對話或另一個 AI 工具讀完這節，就知道現在系統長什麼樣、哪些是使用者定案不能改、哪些還沒做。細節再往下翻。

### 0.1 現在的系統（v3.14）一眼看完

| 面向 | 現況 |
|---|---|
| 成品 | `BEOL_Report.html`（離線完整版 **3.1 MB**，v3.13 起 Plotly 改用 cartesian 子集）、`BEOL_Report_lite.html`（0.39 MB，程式庫走 cdn.jsdelivr.net）、`make_BEOL_Analysis(_lite).py` 單一 Python 產生器可展開整個專案 |
| 匯入 | Excel（xlsx／xls／xlsm）、CSV／TSV／TXT；寬表（by wafer）與長表（by site）；欄名不固定靠自動判斷；`.jmp` 不能直接讀（二進位），匯入時提示用 JMP 匯出 CSV（附 JSL 一行）。解析在 **Web Worker**，六段進度條（讀取→解析→整理→判斷欄位→統計→畫戰報）；31k 列 6–8 s、100k 列 CSV 6.3 s |
| 設定頁 ⚙ 量測項目 | v3.14：整張卡片可點（勾選／取消）、Ctrl／Shift＋點與空白處**框選**多張、底部批次列（勾選／取消／移到 WAT·Inline·Yield）、卡片可**拖曳**（含整個選取）到其他群組改類別（`RU.classify(name, kind)` 限定模組重判，信心低仍標「請確認類別」）；空群組為虛線放置區 |
| 前處理分頁 ⓪ | 重複 wafer（保留／平均／第一筆／刪除）、單位不同（×10ⁿ 一鍵換算）、極端值（MAD |z|>6，尾巴規則只提示不標）——系統提示、使用者確認 |
| 戰報總覽 ① | 左點燈表（自動／標準／緊湊／熱圖）、右 HL 清單＋細節（trend、同層相關圖、建議檢查）。燈號：K 類 σ、LK 倍數（log）、**固定值類（SPA）＝全部等於固定值 → 綠「=20」，有 wafer 偏離 → 灰「n片≠20」交工程師判讀，永遠不是 HL** |
| 建議檢查 | 知識庫**預設關**：只列資料能互相對照的項目——依 item 的 pairs 列同層對應 inline（Rs → THK＋metal CD、Rc → via CD、LK → CD），資料沒有該欄仍列為「○ 缺資料」；同組 yield；機台／chamber（只給路線，不下評語）。**鄰層（跨層）只在知識庫開啟時出現**。每列 🔍 開檢查視窗（相關圖、上下兩面板共振 trend）或機台視窗 |
| 機台分析 | 文字欄角色 **機台／其他**（`E.TOOL_RX`／`E.NOT_TOOL_RX`），設定頁第 3 區「機台欄」可勾選；Part ID／Lot／備註不會被當機台。視窗：run 貨比例長條、每週 run 貨、box plot＋K 標註；無「出現期間」文字 |
| Trend 矩陣 ② | 多組：欄 = 組；單一組：**畫廊 2／3／4／5 欄（預設 3，記住選擇）**，4–5 欄點縮小。x 軸 = wafer 順序，**刻度吸附到排序欄值改變處並以該值標示**（日期 MM/DD、跨年 YY/MM/DD、lot）。縮圖排隊一張一個 task，第一張 < 1 s |
| Correlation ③ | 依物理關係自動配對；每條件各自回歸；**全部 SVG scatter**（不用 scattergl，否則圖層順序拖不動） |
| Quantile ④ | JMP Fit Y by X 樣式 Normal Quantile plot（x 量測值、y 常態分位 0.0001…0.9999，每條件一條線），pill 只顯示 K-shift |
| 條件樣式 | Condition 列膠囊可**拖曳改圖層順序**（最左最上，BSL 預設最下）、**色點改色**（色票即時；拖色盤只預覽，放開或「套用」才重繪）、**圖例單擊凸顯**（其餘條件變淡色 tint 78%，不透明）、雙擊恢復。所有 trace 帶 `meta.cond`，`applyVis` 用 Plotly.react 不重算 |
| PPT「戰報」 | 封面 → 點燈表（N 一致時片數進表頭；**先縮字 11→8.5pt 再分頁**，類別標題不留頁尾）→ HL 總表 → HL 細節（trend＋相關圖＋K 表＋建議檢查＋同組其他 item）→ 總覽 trend（1×1／1×2／2×2 自適應，綠燈 3×3 附錄平均分頁）→ 結論。設計語言見 `docs/PPT_STYLE.md`（紅標題＝現象＋偏移、藍數字、☐ 區塊標題、K 小表、深灰頁尾只放頁碼；無來源列、無說明小字） |
| PPT「排排站」 | 每模組：點燈表 → trend 排排站 → quantile 排排站。每頁：標題 → **黑框 comment 方框（● Wording）** → 組名＋小圖例「■ A廠 BSL　■ B廠 CIP」→ 列（名稱連續表格｜圖＋mean（片數小字）｜K-shift 燈號色）。每組自成欄（≤7 列，否則等分），每頁兩欄，單欄頁整頁寬；quantile 列 ≤5、圖寬 ≤ 2×列高，P50／片數寫在圖右側；item 依 **(Mx, Vx−1) 同層排序**（M1、M2、V1、M3、V2…） |
| 文字原則 | 介面與 PPT **不放解釋系統設定的小字**（資料品質、燈號門檻、判定規則、請人工判讀…都已移除）；標題只寫現象；偏移一位小數；r 只在檢查視窗看得到 |

### 0.2 使用者定案（不要再改回去）

1. 單一 HTML 離線；lite 版走 CDN；單一 Python 產生器。欄名不固定、缺欄位不能擋。
2. K-shift 以 mean 為準（不改 median）；低 N 不另外處理；yield 規則、rate 散佈、campaign／time-aligned BSL 皆**略過**（使用者決定）。
3. 前處理放在獨立分頁，系統提示、使用者確認；交叉比對卡片移除；同 item 的均值／變異 HL 合併；摘要不重複。
4. r 不顯示在戰報／PPT／摘要；知識庫建議預設關；鄰層檢查屬知識庫。
5. 機台欄：CIP 走的機台沒有 BSL 可對照時**不下評語**（跨廠 BSL／CIP 是常態）。
6. 固定值 item（SPA）：綠／灰二值，不用 % 門檻，不進 HL，PPT 只標 mean。
7. PPT：標題＝item＋偏移；不放 a／b 小標、不放來源列、不放片數在句子裡（片數只在格子小字／mean 下括號）；偏移一位小數；條件圖例要寫清楚哪個顏色是哪個條件。
8. 點：實心、無白邊、無透明；凸顯用淡色不用透明。
9. 只改 `BEOL_Analysis` 資料夾（不要動 `BEOL_Analysis_Claude module`）。
10. GitHub 從雲端 session 推送會 403：**只在本機 commit，並產出 git bundle**（`Claude outputs\Data-analysis-tool_vX.Y.bundle`）；使用者自己 `git pull <bundle> main` 到 `C:\Github\BEOL-analysis` 再 push。
11. claude.ai Project 只放原始碼與 lite 版，不放完整版 HTML。

### 0.3 每版流程（三角色內審）

A 開發／製程整合主管 → B 使用者模擬（每版產 1～2 份**新**模擬資料，`sample_data/gen_*.py`）→ C 使用者體驗（審 HTML 畫面與兩份 PPT 的截圖：圖是否超出頁面、點是否清晰、資訊是否齊、排版是否整齊、一頁一個問題）。發現與決策寫進 `docs/build_review_log.py` → `docs/REVIEW_LOG.xlsx`（欄位：版本、日期、角色、來源、現象、類別、嚴重度、處置、狀態、版本、開關）。改完一定重跑兩組測試（目前 **117 + 97**）並截圖目視。

### 0.4 效能現況與可再做的事

- 已做：Worker 解析（dense、無格式文字）；縮圖點數抽樣（BSL 700／CIP 900，統計用全部）；矩陣縮圖排隊；凸顯／改色用 Plotly.react；相關圖抽樣 4000／3000；Plotly 改 cartesian 子集（6.3 → 3.1 MB）。
- 量測（31k 列、21 item、4 組）：載入 6–8 s（解析 ≈ 4 s 在背景）、Trend 矩陣第一張 0.4–0.8 s、20 張 4 s、Quantile 20 張 3 s；PPT 排排站 21 頁 ≈ 2–3 分鐘（每張 PNG 0.42 s：newPlot 0.14 ＋ toImage 0.27）。
- 待做（效益由大到小）：① 排排站列圖改自製 canvas 繪圖（估每張 < 20 ms，PPT 匯出從分鐘級降到秒級）；② `E.compute`＋前處理掃描搬到 Worker（目前主執行緒 ≈ 2 s）；③ app.js 以 terser 壓縮（220 KB → ≈110 KB，對 3.1 MB 影響小，且不利除錯，暫不做）；④ xlsx 換 mini 版可再省 0.5 MB 但會失去舊版 .xls，暫不做。

### 0.5 待辦（使用者已知、尚未排程）

- 匯出按鈕兩個在窄螢幕會把表頭擠成兩行 → 改成一個下拉。
- Condition 列超過 4 個條件時門檻列換行；色點 hover 放大。
- Inline 變異頁摘要去重；3×3 格高受摘要列擠壓。
- 延後項目（使用者決定）：CUSUM 變化點、證據等級、time-aligned／campaign BSL、vs 上次戰報、P3 結案回饋。

### 0.6 測試資料對照（`sample_data/variants/`）

| 檔案 | 用途 |
|---|---|
| `I_trap.xlsx`、`J_fabrun.xlsx` | 重複 wafer、單位差 1000、文字日期、campaign 尾巴（前處理） |
| `K_sixcond.xlsx` | BSL＋5 CIP（條件樣式、凸顯、拖曳） |
| `H_longnames.xlsx` | 長條件名（PPT K 表寬度） |
| `L_pp5.xlsx`、`M_pp10.xlsx`、`N_pp30k.xlsx` | 4 型號 × A廠／B廠、5+5／10+10 item、31k 列（排排站、quantile、效能、SPA） |
| `O_wat15.xlsx` | 單一 CIP、無分組、15 WAT＋SPA 固定值（點燈表字級自適應、SPA 灰燈） |
| `P_items100.csv`、`R_10k.csv`、`Q_100k.csv` | 100 item 畫廊欄數研究；1 萬／10 萬片 x 軸刻度；CSV 匯入 |

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
| 10 | GitHub 從雲端 **推不上去（403）** | 本機 git commit ＋ 產出 git bundle 到 `Claude outputs\`，使用者自行 pull／push |

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
├─ BEOL_Report.html         ← 成品，離線完整版（約 3.1 MB，內含 Plotly cartesian、SheetJS、PptxGenJS）
├─ BEOL_Report_lite.html    ← 成品，lite 版（約 0.39 MB，程式庫由 cdn.jsdelivr.net 載入）
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
├─ vendor/                  ← plotly-cartesian 2.35.3（報表用；ProcessDataTool 仍用完整版 plotly.min.js）、xlsx 0.18.5、pptxgenjs 3.12.0
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
| 設定頁 | `renderSetup`（欄位、類別下拉選單、粒度 by wafer／by site）；`bindItemCards(host, c)`（v3.14：整卡點選、Ctrl／Shift 選取、marquee 框選 `#iMarq`、批次列 `#iBulk`、HTML5 拖曳到 `.igroup[data-kind]` → `moveTo`）；選取集 `itemSel` 跨重繪保留、換檔清空 |
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
node tests/shot_items.js                 # v3.14 設定頁卡片互動＋截圖（tests/shots/）
node tests/e2e_report.js                 # 97 項：WAT／Inline 數值與 pandas 比對、儀表板、分組切換、視窗、矩陣、HTML／PPT 匯出
node tests/e2e_variants.js               # 117 項：沒為工具設計過的資料（CSV、不同欄名、三個條件、長表、單一條件）
```

- `tests/e2e_report.js` 現在也涵蓋疑似因子（V12_ETCH_CH 命中、M12_CMP_Tool 混淆）、Yield 模組、知識庫頁編輯與 Excel 來回匯入。
- 測試需要 Node、Playwright 和 Python（pandas、python-pptx）。在 Anthropic 的雲端沙箱中，用 `NODE_PATH=/home/claude/.npm-global/lib/node_modules node tests/xxx.js`，Chromium 在 `/opt/pw-browsers`。
- **改完程式一定要重跑兩組測試，並截圖目視檢查版面**（使用者很在意版面）。
- 測試用 `App.rptUI` 和 `App.rpt.res` 取值；參考值由 `tests/expected_beol.py` 或測試裡的 inline pandas 計算，**不要把數值寫死**。
- 更新單一 Python 產生器：在原始開發 repo（pdat）或**直接在 BEOL_Analysis 資料夾**執行 `python tools/pack_beol.py`（v3.14 起沒有 `beol/` 子資料夾時來源＝目的路徑），產出 `dist/make_BEOL_Analysis(_lite).py`，再複製到根目錄。打包清單是 `tools/pack_beol.py` 裡的 `FILES`／`VENDOR`；新增檔案要加進清單；**vendor 清單必須與 `src/report.html` 的 INLINE 一致**——v3.13 曾因 `build.py` 要求 CDN 表全部 4 檔（含已不用的 `plotly.min.js`）而讓產生器只建出 lite 版（v3.14 修正：只檢查 report.html 實際引用的檔）。

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
- v3.14：build.py vendor 檢查改依 report.html 實際 INLINE（修產生器只建 lite 版、cp950 亂碼→UTF-8）；pack_beol 可在 BEOL_Analysis 內執行；設定頁 item 卡片整卡點選／框選／批次列／拖曳改類別（`bindItemCards`、`itemSel`、`RU.classify(name, kind)`）；`tests/shot_items.js`
- v3.13：Plotly 改 cartesian 子集（HTML 6.3 → 3.1 MB；`build.py`／`beol/build.py` CDN 表、`report.html` INLINE、`pack_beol.py`）；移除無人呼叫的 `E.dataQualityLines`、`figCache`、`HI_DIM`；前處理極端值圖抽樣 3000 點改 SVG
- v3.12：`jmpGuard`（.jmp 提示）、accept 加 .tsv/.txt/.jmp；色盤 input 預覽／change 套用＋「套用」鈕；`seqTicks(ord, k)` 刻度吸附排序欄變化點；Trend 矩陣單組畫廊 `S.trend.cols`（store `rpt-trend-cols`）、`opts.dense`；`gen_scale.py`
- v3.11：移除資料品質列（頁面／HTML／PPT 結論／summaryText）、Condition 列固定值說明、summary 燈號行
- v3.10：相關圖全 SVG（無 scattergl）；`lightTables` 的 `fit()`（字級／邊距／每列高度）＋ `paginate()` 依實際列高；固定值 item `cell.failC`／`failB`，綠 =target、灰 n片≠target，無 HL；quantile 右側只有 K；單欄頁整頁寬
- v3.9：點無白邊／透明；凸顯改 `tint()` 淡色（`visData`）；排排站 `frame(title, { comment })` comment 框＋`legendInline`；quantile 列 `maxRows: 5, aspect: 2`，窄圖時標註移到右側文字
- v3.8：Quantile plot（`E.quantile`／`E.probit`，`qStats`／`qFig`／`renderQuantile`，`#tab-quant`，`S.qt`）取代 P-chart；`lightTables()` 共用；`sortLayer`／`layerKey`；匯入進度 `progress()`（importer `readFile(file, onStage)` Web Worker 解析）；`queuePlot` 縮圖排隊；`dataChecks` 依 pairs 列同層、鄰層限知識庫；固定值常數欄保留；機台視窗刪出現期間、confound 無註解
- v3.7：第二種 PPT「Summary 排排站」（`buildPptStack`／`stackLayout`／`rowPng`，按鈕 `#btnPptStack`）；P-chart（v3.8 已改為 Quantile）；戰報點燈表 N 進表頭、依可用高度分頁；附錄平均分頁；測試資料 `gen_pp.py`（L_pp5／M_pp10）
- v3.6：欄位角色——文字欄 機台／其他（`E.TOOL_RX`／`E.NOT_TOOL_RX`／`E.toolCandidates`，設定頁第 3 區「機台欄」勾選 → `cfg.toolCols`，`E.factorColumns` 只看勾選欄）；PPT K 表寬度依內容（`tw`／`kWidth`，`kTable(..., fixed)`），總覽格去片數後綴→縮字；單圖 PNG 以格子比例重畫；封面刪來源檔字
- v3.5：檢查視窗條件膠囊走 `S.vis.order`；共振 trend 改上下兩面板共用 x；全系統一位小數；PPT 摘要「組 CIP　item 偏移」、片數只在點燈表小字
- v3.4：`S.vis = { order, colors, hi }`（`visInit`／`visSave`／`condColor`／`tag`／`orderTraces`／`applyVis`／`bindHi`）；Condition 列膠囊拖曳＋`openColorPop`；所有 trace 帶 `meta.cond`
- v3.3：`buildPpt` 重寫（frame／bullets／section／kTable／pptFig；docs/PPT_STYLE.md）；`E.scanFactors` 的 `layerRel`／`offOnly`／`itemLayer`；`CIPC[0]` 深藍；UI 說明文字移除
- v3.2：前處理分頁（`applyPrep`／`renderPrep`／`prepPending`，engine `E.prepScanBase`／`E.prepScanOutliers`／`E.applyPrep`，`S.prep = { dup, scale, excl, ack }`）；`crossChecks` 只供 PPT HL 總表；`checkRows` 灰格 → need；`E.scanFactors` 混淆針對 CIP；findings.inline 同格合併（`f.varOf`）；`E.dataQualityLines`；`summaryText` 去重；`App.toDate` 多格式
- v3.1：機台列 🔍 → `openToolWin`（`checkRows` 回傳 `tool` 旗標）；檢查視窗 `st.group`／`st.conds`，`corrFig(..., { conds })`；trend X 軸 `S.trend = { x: 'seq'|'col', by }`，helper `orderCols`／`orderBy`／`orderRows`／`trendX`／`trendXCtrl`／`bindTrendX`，所有 trend（含共振圖、PPT）共用
- v3.0：知識庫建議開關（`S.kbOn`，預設關，`dataChecks`）；r 不顯示（`R.relTxt` 預設不帶 r）；介面小字與頁尾刪除；設定頁四個編號區塊；theme_b.css「工程筆記」風格＋PPT 同步
- v2.9：PPT 自審——標題只寫現象（`dx.mean` 另存）、封面每燈號一行、HL 總表頁、細節頁預設只橘燈（`#pptDetail`）、rate 類不算 r、其他類別排最後
- v2.8：其他類別（other_inline／other_yield，統計後綴自動歸類）；單一建議檢查清單＋檢查視窗（`openCheckWin`：X／Y、r 判定、共振 trend、匯入補進後自動重開）；`E.pearson`＋`R.relOf` 用 K 與 r 判定同層／鄰層（strong／weak／flat／opp），措辭不過度推論；長欄名縮寫；H 資料集
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
- claude.ai Project「半導體製程整合」：放原始碼與 lite 版；**不要放 6 MB 的完整版 HTML**（Project 有容量上限）。**以使用者電腦的資料夾為準**：Project 內的大檔（`pdat/src/report/app.js`、`pdat/dist/BEOL_Report_lite.html`、`pdat/dist/make_BEOL_Analysis_lite.py`、`pdat/docs/build_review_log.py`）在 v3.14 未能同步（工具限制：整檔需一次讀完才能覆寫），仍是 v3.13；接手時請從使用者電腦 stage 最新檔，或用 `python tools/pack_beol.py` 重新產生 dist。
- Git：本機 commit ＋ `git bundle create Data-analysis-tool_vX.Y.bundle --all`，交付到 `Claude outputs\`（雲端 push 會 403）。
- 介面文字一律用**繁體中文**；數字的負號用「−」（U+2212）；報告色系固定：深藍 `#1f3b63`、綠 `#1e8e4e`、黃 `#a86b00`、橘 `#d4580f`、灰 `#98a2b3`。
