# BEOL 分析戰報（BEOL_Report.html）設計說明

BEOL 後段製程（Cu interconnect）固定流程的 BSL vs CIP 比較工具。每次只要丟入不同時期的資料，就能跑完同一套分析，產出一頁式報告。
自由分析（任意拖放作圖）仍然用 ProcessDataTool.html；兩者共用同一套讀檔與資料轉換程式。

## 0. 模組
| 模組 | 狀態 | 內容 |
|---|---|---|
| WAT | ✅ | 一般 item 用 K-shift；**LK** 用倍數；**SPA** 用固定值異常比例；同層 inline 交叉驗證 |
| Inline | ✅ | 均值 K-shift、wafer 間 σ 倍數（W2W）、片內 σ 倍數（WIW，需 by site 資料）、徑向分布、對同層 WAT 的預期影響 |
| Yield | ⏳ 規劃中 | CP bin／yield 與 WAT、inline 串接 |

匯入後系統依欄位自動選模組（有 WAT item 先開 WAT）；同一份檔案同時有 WAT 與 inline 時，上方按鈕可直接切換。

## 0.1 WAT 判斷方式（依物理類別）
| 類別 | 判斷指標 | 燈號預設 | 圖 |
|---|---|---|---|
| 一般（Rs、Rc、VBD、Cap…） | K = (Mean_CIP − Mean_BSL) / σ_BSL | 綠 ≤ 1σ、橘 > 1.5σ | 線性軸，灰帶 = BSL ±1σ／±2σ |
| **LK（漏電流）** | median 倍數 CIP／BSL，取 max(×, ÷) | 綠 ≤ ×2、橘 > ×5 | **log 軸**，灰帶 = BSL median ×/÷ 門檻；correlation 以 log 值擬合 |
| **SPA（線間漏電，輸出電壓）** | 正常讀值為固定值（自動偵測眾數，例如 20 V）；偏離 0.5% 以上算異常，比較異常比例差 | 綠 ≤ +2%pt、橘 > +5%pt | 綠虛線 = 固定值，◆ = 偏離固定值的 wafer |

- LK 用 median 而不是 mean：漏電流接近 lognormal，少數極端片會把 mean 拉偏。
- SPA 讀值越低越異常，所以 SPA 與 CD 的原始值相關預期為**負**；但「異常比例」與 CD 同向（CD 變大 → space 變小 → 異常變多）。
- 若某個 SPA 欄位找不到固定值（眾數占比 < 30%），自動退回 K-shift；LK 欄位有 ≤ 0 的值時也退回 K-shift。
- 門檻都可以在上方調整，存在瀏覽器（key `rpt-th`）。

## 0.2 Inline 判斷方式
| 指標 | 定義 | 燈號預設 |
|---|---|---|
| 均值 K | 同 WAT | 綠 ≤ 1σ、橘 > 1.5σ |
| W2W σ 倍數 | 各片 wafer mean 的 σ：CIP ÷ BSL | 綠 ≤ ×1.3、橘 > ×1.6 |
| WIW σ 倍數 | 每片 wafer 各 site σ 的平均：CIP ÷ BSL（需 by site 長表或每片多列的寬表） | 同上 |

- 徑向分布：site value vs 半徑 R（由 Site X／Y 計算），BSL 灰、CIP 彩色，含每個半徑的平均線，用來分辨 edge／center 問題。
- 對 WAT 的預期影響：依同層物理關係推估（例如 M12 CD 偏大 → Con_M12 預期下降、LK_M12 預期上升），並標出 WAT 目前是否已同向偏移；檔案中沒有 WAT 時會提醒切回 WAT 模組確認。
- W2W 只有 3 個 lot 左右時容易受 lot 效應影響，看到單獨的 W2W 黃／橘燈時，先確認 CIP lot 數量。

## 0.3 v2.1 介面（總覽儀表板、Trend 矩陣、浮動視窗、PPT）
- **點燈表只顯示一個數字**：K-shift 顯示 `+2.33σ`，LK 顯示 `×2.96`，SPA 顯示 `+16.2%pt`。底色就是燈號（綠／黃／橘／灰），不再加箭頭和 N；N 與 mean 放在滑鼠提示和視窗的統計表裡。
- **戰報頁上方可以直接切換比較方式**，改了立即重算：
  - **分組欄**：任一文字欄，例如 Part6、layer、機台；也可以選「不分組」。分組欄的每個值各算一欄。
  - **比較欄**與 **BSL**。
  - **CIP**：可多選。每個 CIP 各自和 BSL 比較，表頭會再分出 condition 1、condition 2…。
- **戰報總覽**：一個畫面內完成主要判讀，盡量不用捲動。
  - 左邊是總覽點燈表。Inline 模組可以在「均值 K」和「變異 σ 倍數」之間切換。
  - 右邊是異常 HL 清單；點一列（或按 ↑↓ 鍵）切換下方的詳細內容：判讀、trend 與配對圖、可能原因與建議檢查。
- **Trend 矩陣**：列是 item，欄是分組值，每格一張小 trend；左側色條標出該 item 最差的燈號。可以切換「異常與觀察」或「全部」。
- **浮動視窗**：點燈格、矩陣小圖或 HL 圖都會開出視窗。
  - 視窗不是 modal，開著時原頁面照樣可以操作。
  - 標題列可拖曳移動，右下角可拉大縮小，⤢ 或雙擊標題列可最大化。
  - 可以同時開多個：第 1 個在左、第 2 個在右，方便並排比對。Esc 由上往下關閉。
- **匯出**：
  - **HTML**：目前模組的 one-page。內容有點燈表，以及每個 HL 的說明、trend 圖和配對圖，圖都以 PNG 嵌入。
  - **PPT（16:9）**：檔案中有 WAT／Inline 的資料就各自產生以下頁面：
    - 封面摘要
    - 點燈表：PowerPoint 原生表格，可以直接編輯；Inline 另加一頁變異表
    - HL：每項一頁，左邊放 trend 和配對圖，右邊放判讀、原因與檢查
    - 總覽 Trend：每頁 3 個 item × 最多 4 個分組
  - **列印／PDF**：開新視窗顯示 one-page HTML 後列印。

## 0.4 v2.2 大型點燈表的自適應排版（例如 6 產品 × 6 層 × 2 CIP）
點燈表的欄數 = 分組數 × CIP 數，列數 = item 數。欄數多時系統自動改變密度，讓總覽表仍然能和 HL 面板並排，不必上下捲動找異常：

| 密度 | 自動採用條件 | 格子 | 顯示 |
|---|---|---|---|
| 標準 | 欄數 × 78 px 放得進報告寬度的 46%，且 ≤ 14 列 | 78 px | 完整數字（+2.33σ、×2.96、+16.2%pt） |
| 緊湊 | 欄數 × 58 px 放得進，且 ≤ 28 列 | 58 px，11 px 字 | 完整數字 |
| 熱圖 | 其餘 | 42 px × 21 px | **綠格只顯示顏色**，黃／橘格顯示短數字（+2.6、×8.9、+13；單位寫在類別列）。完整數字在滑鼠提示 |

- 上方「自動／標準／緊湊／熱圖」可手動切換。表格比 HL 面板能容納的寬度還寬時（例如手動選標準），版面改成上下堆疊，表格區塊內部捲動（最高 46vh）。
- 表頭與第一欄固定（sticky），表格內捲動時仍看得到 item 與分組名稱。
- 最後一列「異常格數」統計每一欄（每個產品 × CIP）的橘與黃格數，一眼看出哪個產品最差。
- 列篩選：「只看異常 item」、層別 chips（M1、M2、V1…，由欄名的層別代號自動產生）；類別列（Rs、LK、SPA…）可點選收合，收合時顯示該類別的異常數。
- HL 清單：項目超過 6 個時提供「全部／橘／黃」與分組的篩選；↑↓ 鍵只在篩選後的清單中移動。
- 視窗寬度 1366 px 時 HL 面板改單欄顯示圖，仍與點燈表並排。
- Trend 矩陣也能用層別 chips 篩選列。
- 匯出：HTML 與 PPT 一律輸出完整表格（不受篩選與收合影響）；PPT 欄數超過 8 時自動縮小字級並每頁 19 列。
- 壓力測試資料：`sample_data/gen_big.py` → `variants/F_big_6x6.xlsx`（6 產品、M1–M6、2 CIP；23 個 WAT item、17 個 inline item）。

## 0.5 v2.3 知識庫頁、疑似因子掃描、Yield 模組
### 知識庫（④ 知識庫 頁）
- 規則現在是**資料**（`src/report/rules_base.js`，一條規則一個物件），`rules.js` 只負責把樣式編譯成比對程式與產生診斷文字。
- 欄名與單位樣式用萬用字元，不用 regex：`*` 任意、`?` 一個字、`#` 一個數字，多個樣式以 `;` 分隔；沒有 `*` 的樣式以整個名稱或名稱中的一個單字比對（名稱以 `_`、`-`、空白切字）。例：`con_*`、`cd`、`v#*cd*`。
- 兩層：**基礎層**隨工具出貨；**fab 層**由使用者在頁面編輯或匯入，存在瀏覽器 `localStorage['rpt-kb']`，同 id 覆蓋、新 id 追加。匯出 Excel／JSON 後可交給同事，或併回 `rules_base.js` 重建。
- 頁面：規則表（含**命中欄位**：目前資料中哪些欄位會套用這條規則）→ 點一列編輯 → **試算**（儲存前看會命中哪些欄位，並標出只有單位符合的情況）→ 儲存到 fab 層後立即重算戰報。
- Excel 公版：一列一條規則，欄位 `id, label, kind, metric, bad, name, unit, up_mean, up_causes, up_checks, down_mean, down_causes, down_checks, pairs, source, note, author, date, enabled`；清單欄位一行一條。「下載公版」會給空白檔。
- 匯入時只把**與基礎層不同**的規則放進 fab 層，所以把匯出的檔案原封不動匯回不會產生覆蓋。
- 戰報頁尾與純文字結論都會印出知識庫版本（base vX＋fab 層 N 條），結論可追溯。
- 設定頁手動改過類別的 item 不會被知識庫重算覆蓋。
- 參考文獻見 `docs/REFERENCES.md`（10 份通則文獻，含 DOI；arXiv 論文存在 alphaXiv 資料夾「BEOL knowledge」）。

### 疑似因子掃描（commonality，HL 詳細面板下方）
- 對每個異常 item，在該分組的 CIP wafer 內，把資料裡**所有類別欄**（機台、chamber、route…，排除 wafer／lot／比較欄／分組欄／時間欄）逐一當因子：各 level 的 N、mean、相對 BSL 的 K；level 數 ≥ 2 且每個 level ≥ 3 片時做 Kruskal–Wallis 檢定，效果量用 ε²；p 值以 Benjamini–Hochberg 校正（同一個 item 掃描的所有欄位一起校正）。
- 排名：效果量優先。判定「先查這個因子」的條件：校正後 p < 0.1 且 ε² ≥ 0.1。
- **混淆偵測**：若某欄位的每個 level 都只出現在一種條件（例如 CIP 全走 CMP03、BSL 走 CMP01／02），標示「與條件完全混淆」，不做檢定。
- 點任一列開浮動視窗：依 level 的 strip plot（BSL 灰、CIP 彩色、各 level 平均線）與統計表。
- 結論一句話（疑似因子 … = …（N 片，K，p））會進入純文字結論、HTML 與 PPT 的 HL 頁。
- 沒有類別欄時只提示「加上機台／chamber 欄位後會自動掃描」，不影響其他分析；欄位有多少就掃多少。
- 範例：`WAT_FAB_compare.xlsx` 新增 `V12_ETCH_CH`（TMTQ11 FAB15 的高 Rc wafer 走 CH_B）、`M12_CMP_Tool`（TMWF54 FAB15 全走 CMP03，混淆）、`M13_ETCH_CH`（隨機）。

### Yield 模組
- by wafer 的 `Yield (%)`、`Bin*` 欄位自動歸到 yield／bin 類別（kind = yield），K-shift 與 WAT 相同；yield 低於 BSL 為壞，bin 高於 BSL 為壞。
- 診斷會對照**同組同 CIP 的 WAT 亮燈**：LK／SPA／VBD → 線間漏電／短路；Rc → via 開路或高阻；Rs → 金屬線高阻。配對圖畫 yield 對該 WAT 的相關。
- 範例資料的 `Yield (%)`、`Bin3_short (%)`、`Bin7_open (%)` 由 LK 與 Rc 驅動。

## 0.6 v2.4 資料層：連結第二個檔案（機台履歷、yield…）
- 上方「＋ 連結資料」或設定頁「連結另一個檔案」：再匯入一個 Excel／CSV，系統以 **wafer id** 對應到目前資料。
- **鍵正規化**：`UAB123.01`、`UAB123-01`、`UAB123#1`、`uab123 1` 都視為同一片（lot 加兩位 slot）；找不到規律時用原字串比對。系統自動挑出連結檔中與主檔 wafer 最吻合的欄位當鍵。
- **配對率一定顯示**：主檔幾片中幾片對到、連結檔另有幾片不在主檔；低於 50% 以紅字提醒。
- **先壓再連**：連結檔一片多列時先壓成每片一列（數值取平均、文字取最後一筆）；長表（wafer × 站點 × 機台）會依站點轉成寬表（`<站點> <機台欄>`），有時間欄時依時間排序，**rework 取最後一次**。
- 新欄位：文字欄直接進入疑似因子掃描；數值欄依知識庫分類成 item（例如另一份 yield 檔）。欄名重複時加「·2」。
- 設定頁列出每個連結檔（列數、鍵欄、配對、新增欄位），可以個別移除；戰報頁上方有「資料層」chip。
- 範例：`sample_data/TOOL_history_wide.xlsx`（每片一列，wafer id 用 `-` 分隔、缺 4% wafer）與 `TOOL_history_long.xlsx`（wafer × 站點，含 rework 列）。連上後 LK_M12 的疑似因子會指向 `M12_ECP Tool = ECP02`。

## 0.7 v2.5 引導式建議檢查與機台分析
設計原則：使用者只要提供資料，系統決定下一步。每一條「建議檢查」不再只是文字，而是帶狀態與一個動作：

| 狀態 | 意思 | 動作 |
|---|---|---|
| ✔ 已有資料 | 檢查所需的資料已在檔案裡 | 一鍵開視窗：同層 inline 的相關圖、機台分析、徑向分布 |
| ○ 需要補資料 | 檔案裡沒有這項資料 | 「連結 inline 資料」「連結機台履歷」直接開啟連結檔案 |
| ➜ 其他模組 | 要看 WAT／Inline／Yield 戰報 | 一鍵切模組 |
| ◇ 系統外確認 | SEM／TEM、recipe、log 等 | 無動作，留給工程師 |

判斷方式：以檢查文字的關鍵字（CD／THK／via、機台／chamber／commonality、WAT 戰報、CP bin、徑向／wafer map）對應到資料中的欄位與功能，不需要知識庫另外設定；fab 層新增的規則只要用同樣的字眼，引導就會生效。

**機台分析視窗**（疑似因子表任一列、或「⤢ 機台分析」）：
- 上方「分組欄」chips，可複選 → 組合分組（例 機台 × chamber）。
- 左：**run 貨比例**（各 level 占 BSL、CIP wafer 數的百分比，長條＋表格，含 K vs BSL）；一眼看出 CIP 是否集中走某台機台，或 BSL／CIP 配置失衡（部分混淆）。
- 右：**box plot**，依 level 分組，BSL 灰、CIP 彩色，含每片點與平均線，灰帶為 BSL ±1σ。
- 下方統計：Kruskal–Wallis H、p、ε²、level 間最大差 ΔK。

**疑似因子判定修正**：除了 p 與效果量，新增 **ΔK（level 間最大差）**；要同時滿足 ΔK ≥ 0.5σ 且 ΔK ≥ 整體偏移的 20% 才標「先查這個因子」。否則註明「各 level 差 xσ，相對整體偏移不大 → 比較像條件本身的差異」。這是為了避免整個 CIP 都偏了 −9σ、兩台機台只差 0.6σ 時被誤判成 bad tool。

## 1. 流程
1. **匯入**：拖入 Excel 或 CSV。水平（by wafer）、垂直（by site／Item-Value 長表）兩種格式都可以；長表會自動轉成每片一列。
2. **自動設定**：系統自動判斷以下欄位，判斷正確時直接產生戰報，不必經過設定頁：
   - Wafer ID、日期、分組（例如 Part6）
   - Condition 欄、Baseline（樣本數最多，或名稱是 POR／BSL 的條件）、CIP
   - 每個量測欄的物理類別
3. **One-page 戰報**：包含以下內容
   - KPI（綠、黃、橘格數）與一句話結論
   - 點燈表
   - 異常說明與建議：可能原因、inline 佐證、建議檢查
   - 關鍵圖表：異常 item 的 trend，以及它和同層 inline 的 correlation
   - Inline 對照表、資料品質
4. **Trend**：預設只顯示異常與觀察 item；可切換成全部 WAT 或含 inline。
5. **Correlation**：依物理關係自動建議配對，異常 item 優先；每個 condition 各自擬合，並檢查相關方向是否符合物理預期。
6. **輸出**：
   - 匯出 One-page report：單一 HTML 檔，圖表嵌成 PNG，不含程式，可以直接寄送
   - 列印／存 PDF
   - 複製結論文字：純文字，可以貼到 mail 或 chat

## 2. 對參考介面的審視與改善
| 參考介面的狀況 | 這一版的做法 |
|---|---|
| 點燈表每格同時有圓點和 K 值，但圓點不表示方向，K 值很小 | 燈號本身就是整格底色；格內顯示 ▲▼ 方向、K 值和 N；依物理類別分段（Rs、LK、Rc、VBD） |
| 灰色格（SPA）沒有說明原因 | 灰色格直接寫出原因（例如「FAB15 無資料」「BSL σ = 0」），並在「資料品質」段落列出，避免被誤讀成 match |
| LK、SPA 被判成「unknown 20%」，再預設成 THK（類別錯誤） | 依名稱加單位（~A、~V、~OHM/SQ、~OHM）判斷類別，信心低時才標「請確認類別」 |
| Trend 一次畫 8 × 4 = 32 張小圖，異常不容易找 | 預設只畫有黃燈或橘燈的 item，並且延遲繪圖；BSL 點數超過 1,500 時抽樣顯示，統計仍用全部資料 |
| Correlation 用 18k 點全部畫成同一色，R² = 0.07，沒有參考價值 | 依 condition 上色（BSL 灰、CIP 彩色），各自擬合；可依分組篩選；自動檢查相關方向 |
| Correlation 顯示「未偵測到可自動配對的關係」 | 依「同層」加「物理類別」自動配對（例如 Rc_V12 ↔ V12 CD、Con_M13 ↔ M13 THK）；沒有 inline 時，改用同層 WAT 交叉檢查（LK ↔ SPA、Rs ↔ LK） |
| 沒有結論文字 | 每個異常都產生原因、inline 佐證、建議檢查；一鍵複製純文字結論 |
| 報告需要截圖拼湊 | 一鍵匯出 one-page HTML，或列印成 PDF |

## 3. 診斷知識庫（`src/report/rules_base.js` 資料 + `src/report/rules.js` 程式）
每個類別定義：
- 名稱與單位比對規則
- 偏高、偏低各自的物理意義、可能原因、建議檢查
- 會驅動這個 WAT item 的 inline 類別，以及預期相關方向

| WAT 類別 | 偏高的意義 | 配對 inline（預期方向） |
|---|---|---|
| Rs（Con_、Rs_、~OHM/SQ） | 金屬線變細或變薄 | THK（−）、CD（−） |
| Rc（Rc_、Rv_、~OHM） | Via 導通變差 | Via CD（−） |
| LK（LK_、Ileak、~A） | 線間絕緣變差 | CD（+，線寬變大即 space 變小） |
| VBD（~V） | 線間耐壓變好（偏低時表示變差） | CD（−） |
| SPA（SPA_、~V，固定值） | 異常比例上升（讀值低於固定值） | CD（+） |
| Cap、Vt、Idsat | 見程式碼 | CD、THK |

**inline 交叉驗證規則**：

| 同層 inline 的 K | 判斷 |
|---|---|
| \|K\| ≥ 0.5，方向符合預期 | 主因很可能是尺寸偏移 |
| \|K\| < 0.5 | 不像尺寸造成，優先查製程條件與機台 commonality |
| \|K\| ≥ 0.5，方向相反 | 提醒確認量測或資料對應 |
| 沒有 inline 欄位 | 建議調出對應的 inline 數據 |

這份知識庫是確定性規則：每一句結論都查得到來源、可以審查，也可以修改。在沒有 AI、沒有網路的 fab 電腦上也能產生一樣的結論。

## 4. K 與燈號
- K = (Mean_CIP − Mean_BSL) / σ_BSL，σ 為樣本標準差（n − 1）。
- 依分組與 CIP 分別計算。
- 燈號門檻預設：綠燈 |K| ≤ 1σ，黃燈 1–1.5σ，橘燈 > 1.5σ；可以在上方調整，設定會存在瀏覽器裡。
- CIP 少於 5 片時加註「⚠ 樣本少」。

## 5. 測試
- `node tests/e2e_report.js`（v2.1：另外檢查點燈格只有一個數字、分組欄切換、HL 切換、雙視窗並排與最大化、Trend 矩陣、HTML 與 PPT 匯出內容）：先執行 `tests/expected_beol.py` 用 pandas 獨立計算參考值，再跑完整流程比對：
  - WAT（`WAT_FAB_compare.xlsx`）：自動設定、LK→倍數、SPA→固定值 20；Rc_V12 K、Con_M13 K、LK_M12 倍數、SPA_M12／M13 異常率都等於 pandas 結果；LK trend 為 log 軸；結論引用正確 inline；門檻調整、匯出、模組切換
  - Inline（`INLINE_FAB_compare.xlsx`，by site 長表）：V12 CD K、M13 THK 片內 σ 倍數、M12 CD wafer 間 σ 倍數等於 pandas 結果；有徑向分布圖；結論文字
- `sample_data/gen_wat_fab.py`：WAT 寬表範例（SPA 固定值 20 V，偏離表示漏電）。
- `sample_data/gen_inline_fab.py`：Inline by site 長表範例，故事：TMWF54 M13 THK 偏薄且 edge 變差、TMTQ11 V12 CD 偏小、TMRX12 M12 CD 偏大且 wafer 間變異放大。
