# BEOL 診斷知識庫：參考文獻（v1，2026-10-09）

> 目的：讓 `rules.js` 裡的診斷文字有物理背景可查。上限 10 份通則文獻；fab 專屬經驗（FA、8D、結案回饋）另外累積，不在此表。
> 維護方式：arXiv 論文存在 alphaXiv 資料夾「BEOL knowledge（戰報知識庫參考）」；非 arXiv 文獻以 DOI 連結。要新增時，先加進資料夾或 DOI，再請 agent 重整此表。
> 驗證狀態：「✔」= 本次已確認連結可解析；「DOI」= 以標準 DOI 登錄，出版社頁面本次未能讀取（受限於網路），連結格式正確但請在可連網環境再點一次確認。

| # | 主題 | 文獻 | 連結 | 支持哪條診斷概念 | 取得 | 驗證 |
|---|---|---|---|---|---|---|
| 1 | Cu 電阻率尺寸效應 | D. Josell, S. H. Brongersma, Z. Tőkei, "Size-Dependent Resistivity in Nanoscale Interconnects", *Annu. Rev. Mater. Res.* 39, 231 (2009) | https://doi.org/10.1146/annurev-matsci-082908-145415 | 線寬、厚度縮小 → 表面與晶界散射增加 → Rs 上升；解釋為什麼 CD／THK 偏小會讓 Con 偏高，且非線性放大 | 付費 | ✔ |
| 2 | Cu 電阻率尺寸效應（原始量測） | W. Steinhögl, G. Schindler, G. Steinlesberger, M. Engelhardt, "Size-dependent resistivity of metallic wires in the mesoscopic range", *Phys. Rev. B* 66, 075414 (2002) | https://doi.org/10.1103/PhysRevB.66.075414 | 提供 Fuchs–Sondheimer 與 Mayadas–Shatzkes 模型在 Cu 線上的實測；K-shift 對 CD 的敏感度估算可引用 | 付費 | DOI |
| 3 | Barrier／liner 對有效截面的影響 | S. M. Rossnagel, T. S. Kuan, "Alteration of Cu conductivity in the size effect regime", *J. Vac. Sci. Technol. B* 22, 240 (2004) | https://doi.org/10.1116/1.1642639 | Barrier 偏厚、Cu 截面變小 → Rs 與 Rc 上升；支持「Barrier／liner 偏厚」這條原因 | 付費 | DOI |
| 4 | 先進 interconnect 的電阻與可靠度綜述 | Z. Tőkei et al. (imec), "Selecting Alternative Metals for Advanced Interconnects", arXiv:2406.09106 (2024) | https://arxiv.org/abs/2406.09106 | 綜述 Cu 在縮小尺寸下的電阻、EM、barrier 需求，以及替代金屬的評估準則；作為 BEOL 通則背景 | arXiv | ✔ |
| 5 | 奈米尺度傳輸評估框架 | "A Transport Framework for Evaluating Nanoscale Interconnect Materials", arXiv:2609.06170 (2026) | https://arxiv.org/abs/2609.06170 | 電阻率、自熱與可靠度隨尺寸變化的評估方法；補充 #1、#4 | arXiv | ✔ |
| 6 | Damascene Cu 電鍍 | P. C. Andricacos, C. Uzoh, J. O. Dukovic, J. Horkans, H. Deligianni, "Damascene copper electroplating for chip interconnections", *IBM J. Res. Dev.* 42(5), 567 (1998) | https://doi.org/10.1147/rd.425.0567 | Superfill 機制與 void 形成；支持「Cu 電鍍異常（void、晶粒）」與 ECP 檢查項目 | 付費 | ✔ |
| 7 | 電遷移 | J. R. Black, "Electromigration — A brief survey and some recent results", *IEEE Trans. Electron Devices* 16(4), 338 (1969) | https://doi.org/10.1109/T-ED.1969.16754 | Black 方程式；Rs 偏低但 barrier 偏薄時要留意 EM 的依據 | 付費 | ✔ |
| 8 | Low-k 電漿損傷與吸濕 | M. R. Baklanov, J.-F. de Marneffe, D. Shamiryan, A. M. Urbanowicz, H. Shi, T. V. Rakhimova, H. Huang, P. S. Ho, "Plasma processing of low-k dielectrics", *J. Appl. Phys.* 113, 041101 (2013) | https://doi.org/10.1063/1.4765297 | Ash／etch 電漿造成 low-k 碳流失、吸濕 → k 值上升、漏電增加；支持 LK／SPA／Cap 的「Low-k 損傷」原因 | 付費 | DOI |
| 9 | Low-k TDDB 與線間距 | F. Chen et al., "A Comprehensive Study of Low-k SiCOH TDDB Phenomena and Its Reliability Lifetime Model Development", *IEEE IRPS* (2006) | https://doi.org/10.1109/RELPHY.2006.251190 | 線間距縮小與 Cu 殘留如何降低崩潰電壓；支持 VBD／LK 與 CD（space）的配對方向 | 付費 | DOI |
| 10 | 多重比較校正 | Y. Benjamini, Y. Hochberg, "Controlling the False Discovery Rate", *J. R. Stat. Soc. B* 57(1), 289 (1995) | https://doi.org/10.1111/j.2517-6161.1995.tb02031.x | commonality 掃描一次檢定幾十個欄位時用 BH 校正 p 值；避免偶然顯著 | 開放 | DOI |

補充（未列入 10 份上限）：
- CMP dishing／erosion 與全晶圓厚度模型：arXiv:2605.05062（2026，CMP 模型）已存入資料夾作為背景；教科書 J. M. Steigerwald, S. P. Murarka, R. J. Gutmann, *Chemical Mechanical Planarization of Microelectronic Materials* (Wiley, 1997) 是 dishing／erosion 的標準來源。
- Kruskal–Wallis 檢定（1952）用於機台分組的非參數比較；JASA 47, 583。

## 對應到規則（rules）
| 規則類別 | 引用 |
|---|---|
| Rs 偏高／偏低（CD、THK、barrier） | #1 #2 #3 |
| Rc（barrier、via void） | #3 #6 |
| LK／SPA／VBD（space、low-k 損傷、Cu 殘留） | #8 #9 |
| Cap（k 值） | #8 |
| EM 提醒（barrier 偏薄） | #7 |
| 統計方法（K-shift、commonality 掃描） | #10 |
