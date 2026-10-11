# BEOL_Analysis — BEOL 分析戰報（Cu interconnect）

BEOL 後段製程 BSL vs CIP 的固定流程分析工具。這個專案資料夾會依序加入三個模組：

| 模組 | 狀態 | 重點 |
|---|---|---|
| WAT | ✅ v2.0 | Rs／Rc／VBD 用 K-shift；**LK 用倍數（median CIP／BSL）＋ log 軸**；**SPA 用固定值（20 V）異常比例** |
| Inline | ✅ v2.0 | 均值 K、wafer 間 σ 倍數、片內 σ 倍數、徑向分布、對同層 WAT 的預期影響 |
| Yield | ✅ v2.3 | by wafer 的 yield／bin K-shift；診斷對照同組 WAT 亮燈 |
| 知識庫頁 | ✅ v2.3 | 規則用 Excel／JSON 維護，頁面內編輯、試算命中欄位、fab 層覆蓋 |
| 資料層 | ✅ v2.4 | 「＋ 連結資料」把機台履歷、yield 等第二個檔案以 wafer id 連進來；顯示配對率；長表自動轉寬表 |
| 疑似因子 | ✅ v2.3 | 異常 item 自動掃描資料中的機台／chamber 等欄位（Kruskal–Wallis、BH 校正、混淆偵測、ΔK） |
| 引導式檢查＋機台分析 | ✅ v2.5 | 每條建議檢查帶狀態與一鍵動作；機台分析視窗：run 貨比例、box plot、自訂組合分組 |
| 檢查視窗＋其他類別 | ✅ v2.8 | 每條建議檢查一個 🔍：相關圖（X／Y 可換）、r 判定、共振 trend、缺資料直接匯入補進；range／σ 欄歸「其他」不配對 |
| 原因依證據排序 | ✅ v2.7 | 可能原因依同層 inline／跨層／機台證據排序：✔ 支持排前、✘ 不支持灰掉 |
| 交叉比對卡＋跨層 | ✅ v2.6 | HL 上方一行一張：Inline／跨層／機台／Yield；機台視窗加每週 run 貨與 K 標註；下層 CMP topography 繼承的跨層診斷 |

## 使用
1. 直接用瀏覽器（Edge／Chrome）開 `BEOL_Report.html`。這個檔案已內含所有程式庫，可以離線使用。
2. 匯入 Excel 或 CSV。水平（by wafer）、垂直（by site 長表）兩種格式都可以。
3. 系統自動判斷 Wafer、日期、分組、Condition、Baseline 以及每個 item 的類別，接著直接產生戰報。
4. 上方按鈕切換 WAT／Inline 模組。戰報頁上方可以直接改分組欄（例如 Part6、不分組）、比較欄、BSL 和 CIP。
5. 戰報總覽：左邊是點燈表，右邊是異常 HL；點 HL 或按 ↑↓ 切換。點任何燈格或圖會開浮動視窗，可以拖曳、縮放、最大化，也可以同時開兩個並排比對。
6. 匯出：
   - **匯出 PPT**：封面、點燈表、HL 總表（所有 HL 一列一個）、HL 細節頁（預設只橘燈，可改全部）、總覽 trend；WAT／Inline／Yield 都會包含
   - **匯出 HTML**：one-page HTML
   - **列印／PDF**
   - **複製結論**：純文字

## 用一個 Python 檔重建整個專案
`make_BEOL_Analysis.py` 是單一 Python 檔。只要有 Python 3.8 以上，不需要另外安裝套件，執行後就會產生這整個資料夾：工具 HTML、原始碼、文件、測試，以及範例資料。
```
python make_BEOL_Analysis.py                  # 在目前位置產生 BEOL_Analysis\
python make_BEOL_Analysis.py D:\work\BEOL     # 指定位置
python make_BEOL_Analysis.py --no-samples     # 不產生範例資料
```
- 完整版產生器約 1.9 MB，內含 Plotly、SheetJS、PptxGenJS 三個程式庫，產生的 HTML 可以離線使用。
- `make_BEOL_Analysis_lite.py` 約 0.1 MB，不含程式庫，只產生 lite 版 HTML，使用時需要能連到 cdn.jsdelivr.net。
- 範例資料需要 numpy、pandas、openpyxl；沒有這些套件時會自動略過，工具本身照常產生。
- 每個檔案都附 SHA-256 檢查碼；複製貼上時如果有內容遺漏，產生器會直接指出是哪個檔案。

如果另一台電腦不能下載檔案，可以改用 `BEOL_Report_lite.html`。這個檔案只有 0.14 MB，容易複製貼上；但需要能連到 cdn.jsdelivr.net。用法：打開檔案 → 全選複製 → 貼到記事本 → 另存成 `.html`，編碼選 UTF-8。

## 試用資料
| 檔案 | 格式 | 埋入的故事 |
|---|---|---|
| `sample_data/WAT_FAB_compare.xlsx` | 水平（by wafer），WAT＋inline | TMTQ11 Rc_V12 偏高（V12 CD 偏小）、TMRX12 LK_M12 ×3 與 SPA 異常率上升（M12 CD 偏大）、TMWF54 Con_M13 偏高（M13 THK 偏薄） |
| `sample_data/INLINE_FAB_compare.xlsx` | 垂直（by site），9 點／片 | TMWF54 M13 THK 偏薄且 edge 變差（片內 σ ×2.4）、TMTQ11 V12 CD −2.6 nm、TMRX12 M12 CD 偏大且 wafer 間 σ ×1.9 |
| `sample_data/BEOL_horizontal_by_wafer.xlsx`、`BEOL_vertical_by_site.xlsx` | 最早定義的兩種格式 | Split＝POR／Thin_TaN |
| `sample_data/variants/` | CSV、不同欄名、三個條件、只有一個條件、跨層故事 `G_xlayer.xlsx`（無機台欄） | 用來確認換資料時仍然正確（`node tests/e2e_variants.js`） |

## 資料夾內容
- `AGENTS.md`：接手文件（需求、判斷規則、架構、測試、待辦），給 AI agent 或新同事接續開發時閱讀。
- `BEOL_Report.html`、`BEOL_Report_lite.html`：可以直接使用的工具（v2.9）。
- `src/`：原始碼。
  - `src/report/rules_base.js`：診斷知識庫（資料）；`src/report/rules.js`：知識庫程式。
  - `src/report/engine.js`：計算。
  - `src/report/app.js`：介面。
  - `src/js/`：共用的讀檔與轉換程式。
- `build.py`：把 `src` 和 `vendor` 打包成單一 HTML（`python build.py`，輸出到資料夾根目錄）。
- `docs/REFERENCES.xlsx`：文獻管理表（由 `docs/build_refs_xlsx.py` 從 REFERENCES.md 產生；含開放 PDF 下載來源與本機檔名）；PDF 放 `docs/papers/`（不進 git）。
- `docs/REVIEW_LOG.xlsx`：三角色自審紀錄（角色定義、自審紀錄、模擬資料、檢核清單），每版自審直接在 Excel 加列。
- `docs/BEOL_REPORT.md`：設計說明；`docs/ROADMAP.md`：開發路線；`docs/REFERENCES.md`：二十份通則文獻（兩批，含 DOI；第 2 批為跨層／CMP topography 與 WAT-device 物理）。
- `tests/`：端對端測試（`node tests/e2e_report.js`、`node tests/e2e_variants.js`，需要 Playwright＋pandas）。
