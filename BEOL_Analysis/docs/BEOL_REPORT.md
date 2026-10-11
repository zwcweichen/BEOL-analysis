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

## 0.8 v2.6 精簡交叉比對、機台分析改版、跨層知識、角色自審

**使用者回饋（2026-10-11）與對應改動**

| 回饋 | 改動 |
|---|---|
| 疑似因子的 p-value、ε² 等太學術；資料有限、另有系統做系統性 tool correlation；列太多眼花 | 疑似因子表拿掉。改成 HL 上方的**交叉比對卡**（Inline／跨層／機台／Yield 各一張，一行文字＋✔△✘○ 四種狀態）。機台卡只寫結論：`V12_ETCH_CH：CH_B +3.55σ（CIP 50% 走 CH_B，n 40）`、`2/2 台皆偏（非 tool-specific）`、`與條件完全混淆`。統計仍在引擎裡算，只是不顯示。 |
| 建議檢查文字太多 | 只列檢查項目本身（精簡、每條一行），fallback 改成灰字備註；WAT ↔ inline 對上時以專業短句呈現（`Inline ✔ V12 CD AEI −2.79σ，r = -0.84`）。 |
| 機台視窗 a. 表格拿掉 | 只留 run 貨比例長條（含 %）＋一行結論（`.tw-v`）。 |
| b. K-shift 放到 box plot | 每個 level 的 K 以標註框放在 CIP box 上緣（上 whisker 之上），顏色依燈號；最差 level 排最左；x 軸標籤附 `n BSL／CIP`，n < 30 灰字。 |
| c. 分時間看 run 貨 | 新增**每週 run 貨**堆疊長條（各 level 片數），CIP 期間淡底；下方列出每個 level 的出現期間，超過 3 週沒再出現標「（已停）」、後期才出現標「（後期加入）」；可切「只看本組／全部 wafer」。 |

**跨層知識（物理知識庫擴充）**

使用者指出：WAT 偏移不只來自當層 inline（CD、VCD、THK…），CMP dishing／erosion 與 pattern density 造成的 topography 會往上層繼承（Boning ICMTS 2003；Chang–Cao–Spanos TED 2004；Tugbawa–Boning chip-scale CMP model，見 REFERENCES #11–#13），而且 WAT 結構與 inline monitor 的位置／pattern 不同時兩者可以對不上。v2.6 的做法：

- `rules_base.js` 新增 `App.XLAYER` 表（資料，不是程式）：WAT 類別 × 鄰層（below／above）× inline 類別 × 預期方向（0 = 視 pattern 而定）× 機制文字 × 檢查文字。目前 7 條：Rs←M(n−1) THK／topography、Rc←Mn THK（via 落點）與 M(n+1) THK（trench 深度）、LK／SPA←M(n−1) topography（CMP 殘留）、Cap←M(n−1) topography。
- 新增 inline 類別 `topo`（`*dish*`、`*eros*`、`*step_h*`、`*topo*`、`*recess*`）。
- `rules.js`：`R.adjLayer`、`R.relatedXLayer`；`R.diagnose(cell, rel, xrel)`：同層 inline 解釋不了而鄰層有偏移時，結論改寫成「同層 … 未偏移；跨層 M2 THK −2.19σ、M2 DISH +2.81σ 有偏移 → 下層 CMP dishing／erosion 的 topography 繼承到本層…」，原因第一條與檢查第一條換成跨層項目。
- HL 的「跨層」卡只在資料中有鄰層 inline 時出現；配對圖也改畫跨層項目（標「跨層，方向視 pattern 而定」）。
- 自動設定：比較欄改成先看**值**（BSL／CIP／POR／ref…），再看欄名；避免 `Product` 被誤認成比較欄（角色 B 模擬時抓到的問題）。

**開發模式（使用者提議）**：每版完成後分三個角色自審——A 開發（製程整合主管＋系統設計：設計簡潔、避免複雜 UI、顧及製程分析需求）、B 使用者模擬（工程師：產 1～2 份模擬資料，可取材文獻 issue，驗證泛用性）、C 使用者體驗回饋（與 B 同視角放入資料後檢查卡住、欄位抓不到、可更方便，再加管理者視角判斷結論能否直接用）。紀錄在 `docs/REVIEW_LOG.xlsx`。B 每版產生 1～2 份模擬資料（可取材論文的 issue），例如本版的 `variants/G_xlayer.xlsx`（Rs_M3 偏高、當層 inline 正常、M2 THK 偏薄與 M2 dishing 變大、無任何機台欄）。本版自審發現並修掉：比較欄誤判、配對圖畫錯項目、跨層卡 r 與圖不一致、toast 顯示毫秒、建議檢查太長。

## 0.9 v2.7 可能原因依證據排序、跨層規則第 2 輪

**可能原因依證據排序**（使用者認同的概念）：知識庫的原因清單原本照寫入順序列。v2.7 為每條原因自動配一個「證據類型」（用原因文字的關鍵字對應，fab 層規則只要用同樣字眼即可）：

| 證據類型 | 關鍵字 | 證據來源 |
|---|---|---|
| cd／vcd | CD、線寬、space、litho、dose、etch bias、hardmask、via CD、底部接觸 | 同層 inline CD／via CD 的 K 與方向 |
| thk | 厚度、THK、CMP、過拋、dishing、erosion、trench 深度 | 同層 inline THK |
| xlayer | topography、繼承、跨層、下層 dishing | 鄰層 inline（`App.XLAYER`） |
| xcd | 下層寬線、stress-induced、unlanded | 鄰層 inline CD |
| tool | 機台、chamber、pad、slurry、電鍍、ECP、PVD、recipe、matching | 疑似因子掃描 |
| ext | 其他（barrier、void、low-k 損傷、overlay、熱預算…） | 工具外 |

每條原因得到三種狀態：✔ 資料支持（排最前、粗體、附證據如 `V12 CD AEI −2.79σ`）、· 無資料可比對（中間）、✘ 資料不支持（排最後、灰字，附 `M3 CD 未偏移`）。同一層內維持知識庫順序。HL 面板、HTML 匯出、PPT、複製結論都用同一個排序（`rankCauses`）。Inline item 只用機台證據（同層 WAT 的反應無法分辨 litho 與 etch）。

**跨層規則第 2 輪**（文獻第 3 批 #21–#29）：`App.XLAYER` 加 `rc←below topo`（dishing → via 變長）、`rc←below cd`（unlanded／寬線 SIV，方向視情況）、`vbd←below topo`、`cap←above thk`；可能原因加「下層寬線的 stress-induced voiding」「上層熱預算或 cap 後退火造成 Cu 應力空洞」「上層 etch／ash／cap 製程損傷本層 low-k 或 cap 介面」「下層 topography 造成本層 CMP 殘留」。

注意：知識庫 Excel 的清單欄用「；」或換行分隔，原因文字裡不能再用「；」（本版自審時被 round-trip 測試抓到）。

## 0.10 v2.8 其他類別、單一檢查清單＋檢查視窗、用 r 說話

**使用者實測回饋（2026-10-12，真實資料截圖）與對應改動**

| 回饋 | 改動 |
|---|---|
| `NOVA_THK_R`（厚度 range）被歸進 inline THK | 新增 `other_inline`、`other_yield` 類別（原 `other` 改名「其他（WAT）」）。`R.classify` 偵測衍生統計後綴（`_R`、`_RNG`、`_SD`、`_STD`、`_3S`、`_MAX`、`_MIN`、`_NU`、`_U%`、`_CV`、`(R)`…）→ 歸該模組的「其他」：仍點燈，但不參與同層／鄰層配對、不產生物理診斷。設定頁類別下拉可改。 |
| 可能原因與建議檢查重疊、文字多；需人工與缺資料應一視同仁 | HL 只剩一個**建議檢查**清單。每列：狀態（✔ 有關聯／△ 弱關聯／✘ 關聯性不大或未偏移／○ 缺資料／➜ 其他模組）＋證據（`V12 CD AEI −2.79σ，r = −0.84 有關聯`）＋ 🔍。**每一列**的 🔍 都開同一種「檢查視窗」；機台類開機台視窗。可能原因降為清單下一行「物理機制」（仍依證據排序、✔／✘ 標記），HTML／PPT／複製結論同步。 |
| 檢查視窗 | X／Y 下拉（所有數值欄）、只看本組／全部、一行判定（`r = −0.84（N 543），CIP 內 r = −0.88 → 有關聯，方向與物理預期一致`）、左散佈圖（各條件擬合線）、右**共振 trend**（兩 item 相對 BSL 的 z 分數移動平均，X 依物理預期取反向，CIP wafer 以點標示；CIP 期間明顯時加淡底）、「＋ 匯入資料補進」：走資料層以 wafer id 合併，重算後**同一個視窗自動重開**並把新欄位選進 X。 |
| 鄰層只有 THK／range、r = 0.11 卻寫「下層 topography 繼承 ✔」 | 引擎為每個同層／鄰層配對算 wafer 間 r（`E.pearson`）。`R.relOf`：有偏移（\|K\| ≥ 0.5）且同向且 \|r\| ≥ 0.3 → strong；有偏移但 r 弱 → weak；未偏移 → flat；反向 → opp。卡片、結論、物理機制排序、配對圖都用它。結論只寫資料看到的：「同層 M15 THK 未偏移；鄰層 M14 THK +0.66σ（r = 0.14）有偏移但關聯弱，證據不足」；機制文字只留在物理機制行與 tooltip。 |
| 欄名太長 | `R.parseName`：`Mean(Item Value by Site, 07504.050 M15CUCMP_5, NOVA_THK)` → `M15CUCMP_5 NOVA_THK`（拿掉統計包裝、固定字樣、站點代碼）；層別仍判出 M15。 |

**檢查列的判定規則**（角色 C 在 H 資料上抓到的）：相關存在不代表它解釋這次偏移——`Con_M15` 與 `M15 THK` 本來就 r = −0.58，但 CIP 的 THK 沒偏移。所以 ✔ 需要「該 item 在 CIP 有偏移」**和**「wafer 間有關聯」兩者；只有相關沒偏移 → ✘「此 item 未偏移」。機台類：掃到 bad tool 才 ✔，掃過沒集中 → ✘。

**三角色自審（本版）**：B 產 `variants/H_longnames.xlsx`（模仿使用者截圖的欄名、條件值、range 欄、無 CD 欄）＋ `H_link_M15CD.xlsx`（補資料用，80% wafer，id 寫法不同）。C 抓到 6 項（全部已修）、A 延後 1 項（檢查視窗「設為此 item 的對應欄」存進 fab 層 pairs）。紀錄在 `docs/REVIEW_LOG.xlsx`。

## 0.11 v2.9 PPT 自審：現象措辭、HL 總表、細節頁分配

使用者檢視 v2.6 PPT 後的回饋與角色 A 的方案：

| 回饋 | 改動 |
|---|---|
| HL 標題「金屬線變細或變薄」是推論不是現象 | `dx.title` 一律只寫現象：`Con_M15 @ TMQI55：FAB15 +2.30σ`（LK 寫 ×2.96、SPA 寫異常 19%、變異寫片內 σ ×2.40）。知識庫的意義文字移到 `dx.mean`，只在網頁 HL 清單以灰字當提示；PPT、封面、複製結論不再出現。 |
| 封面字多 | 每個模組的 HL 改成一個燈號一行：「橘 3：SPA_M12 @ TMRX12 +16.2%pt、…」「黃 3：…」，超過 8 個以「…（共 N）」收尾。CIP vs BSL 標題維持（使用者在 PPT 自行精修）。 |
| 12 個 HL 一頁一個太多 | **方案**：每個模組先放「HL 總表」（每列：燈、item @ 組、偏移、Inline／鄰層／機台／Yield 各一句、先查什麼；8 列一頁），所有 HL 都在；**細節頁只做橘燈**（HL ≤ 4 時全部做），按鈕旁 `HL 細節：自動／只橘燈／全部` 可改。黃燈在總表就能看到卡片結論，要細看回工具點開。這樣 12 個 HL（橘 4）= 2 頁總表 + 4 頁細節，而不是 12 頁。細節頁右欄改成：數字、結論、四張卡一句話、建議檢查（狀態＋證據）、物理機制一行。 |
| 其他 | 「其他」類別在點燈表排最後；rate 類（SPA）不算 r，只看 K；配對圖註記與卡片用同一套判定（未偏移就寫未偏移）。 |

角色 A 對「幾個一頁」的理由：細節頁的價值是 trend＋相關圖＋檢查清單，一頁放兩個以上圖會小到看不出 wafer 分布；總表一列一個 HL 才是「多個一頁」該做的事——主管看總表決定要翻哪幾頁。

---

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
