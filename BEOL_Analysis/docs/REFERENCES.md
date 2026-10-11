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

---

# 第 2 批（v2.6，2026-10-11）：跨層／CMP topography、WAT－device 相關物理

> 本批重點：(a) **跨層影響**——CMP dishing／erosion 與 pattern density 造成的 topography 會往上層繼承，讓上層 THK／Rs 偏移，而且 WAT 結構位置與 inline monitor 位置不同時，兩者可能對不上；(b) WAT／device item 的物理：contact／via 電阻對 CD、overlay 的敏感度、barrier／liner 對 Cu 成長的影響、EM、自熱。arXiv 者已存入 alphaXiv 資料夾。

| # | 主題 | 文獻 | 連結 | 支持哪條診斷概念 | 取得 | 驗證 |
|---|---|---|---|---|---|---|
| 11 | **Cu CMP pattern dependence、多層 topography 繼承** | D. Boning (MIT), "Pattern Dependent Characterization of Copper Interconnect", *ICMTS Tutorial* (2003) | https://mtlsites.mit.edu/researchgroups/Metrology/PAPERS/ICMTS-copper-tutorial.pdf | 三個尺度：bulk ≈ 2 mm、erosion ≈ 100 µm、dishing ≈ 1 µm；dishing 隨線寬與 overpolish 增加（270→330 s，~2500 Å）；**M1 polish → M2 oxide／Cu → M2 polish，M1 topography 帶進 M2**，M2 厚度隨「距 M1 array 邊緣距離」變化；線電阻 R = ρL/(W·t) 反推剩餘 Cu 厚度。支持「跨層」卡與 Rs 的下層 topography 原因 | 開放 | ✔ |
| 12 | Dishing 的電性效應 | R. Chang, Y. Cao, C. J. Spanos, "Modeling the Electrical Effects of Metal Dishing Due to CMP for On-Chip Interconnect Optimization", *IEEE Trans. Electron Devices* 51(10) (2004) | https://escholarship.org/content/qt0gh6k3fz/qt0gh6k3fz.pdf | Dishing 讓截面變小、R 上升（寬線 +9.4%，窄線 +1.1%），C 幾乎不變；dishing 與線寬強相關、erosion 與 pattern density 相關，dummy fill 平衡密度可減少 erosion。支持「寬 metal 結構 Rs 偏高但 CD／THK monitor 正常 → 查 dishing 與結構位置」 | 開放（eScholarship） | ✔ |
| 13 | Chip-scale Cu CMP 模型 | T. E. Tugbawa, T. H. Park, D. S. Boning, "Chip-scale modeling of pattern dependencies in copper chemical mechanical polishing processes", MIT (2002) | https://dspace.mit.edu/entities/publication/2c287a6f-4036-49dd-973d-7f650f7d7ff3 | 以 layout density／linewidth 預測整片 dishing／erosion（RMS 誤差約 140 Å／420 Å）；說明為什麼 inline THK monitor（固定 pattern）與 WAT 結構（另一種 pattern）可以不同步 | 開放 | ✔ |
| 14 | BEOL layout 設計規則的物理、電性與可靠度 | E. N. Shauly, "Physical, Electrical, and Reliability Considerations for Copper BEOL Layout Design Rules", *J. Low Power Electron. Appl.* 8(2), 20 (2018) | https://doi.org/10.3390/jlpea8020020 | Contact CD 差 6.5 nm（~15%）→ Rc +45%／−35%；via misalignment 變異約為 CD 的 2 倍；TDDB 以 ≤ 1.5 MV/cm 定線距；多 contact 電流只按 √n 放大。支持 Rc 對 CD／overlay 的敏感度、VBD 與 space 的配對 | 開放（MDPI） | ✔ |
| 15 | Barrier／liner 上的 Cu 成長形貌 | "Control of Cu morphology on TaN barrier and combined Ru-TaN barrier/liner substrates…", arXiv:2410.06133 (2024) | https://arxiv.org/abs/2410.06133 | Ru liner 改善 Cu 濕潤與連續性；barrier 表面狀態決定 void／agglomeration → 支持 Rc／Rs 的「barrier／liner 異常、Cu void」原因 | arXiv | ✔ |
| 16 | 替代金屬：Co 化合物 | "Cobalt Binary Compounds for Advanced Interconnect Materials", arXiv:2603.13713 (2026) | https://arxiv.org/abs/2603.13713 | 窄線 Cu 電阻率急升的背景與替代材料評估（MOL／via 用 Co、Ru）；補充 #1、#4 | arXiv | ✔ |
| 17 | 超薄 Ru 的表面態與電阻 | "Role of surface states and band modulations in ultrathin ruthenium interconnects", arXiv:2603.29174 (2026) | https://arxiv.org/abs/2603.29174 | 薄膜厚度對電阻率的非線性影響（表面散射）；解釋 THK 偏薄時 Rs 的放大 | arXiv | ✔ |
| 18 | 電遷移（多段線） | "A Physics-Guided Transformer Framework for Electromigration Analysis in Multi-Segment Interconnects", arXiv:2610.06464 (2026) | https://arxiv.org/abs/2610.06464 | EM 應力隨時間在多段線中的演化；提醒 Rs 偏低／barrier 偏薄時仍要看 EM margin | arXiv | ✔ |
| 19 | 自熱與 MOL／BEOL 寄生 | "Self-Heating and Parasitic Effects in Multi-Tier CFET Design", arXiv:2603.21910 (2026) | https://arxiv.org/abs/2603.21910 | BEOL／MOL 寄生電阻電容與自熱對元件（Id、Vt）的影響；支持「WAT device item 偏移可能來自 BEOL 熱／寄生」的跨模組提醒 | arXiv | ✔ |
| 20 | BEOL 熱傳 | "Mechanistic Insight into BEOL Thermal Transport via Optical Metrology and Multiphysics Simulation", arXiv:2508.07740 (2025) | https://arxiv.org/abs/2508.07740 | 多層 BEOL 堆疊的熱傳導機制（介面、low-k）；自熱 → 電阻溫度係數 → WAT 量測溫度敏感度 | arXiv | ✔ |

補充（未列入上限）：arXiv:2609.20379（BEOL 熱傳導率結構模型）、arXiv:2402.14112（有限厚度線的非線性電流）、UCSD "Recent Topics in CMP-Related IC Design for Manufacturing"（https://vlsicad.ucsd.edu/Publications/Conferences/251/c251.pdf，dummy fill 與 CMP DFM 綜述）。

## 第 2 批對應到規則
| 規則／功能 | 引用 |
|---|---|
| 跨層卡（下層 THK／topography → 本層 Rs；下層 dishing → via 高度／Rc；下層 topography → 本層 CMP 殘留／LK） | #11 #12 #13 |
| Rc 對 via CD、overlay 的敏感度；VBD 與 space | #14 |
| Rc／Rs 的 barrier／liner、Cu void 原因 | #15 #17 |
| Rs 偏低時的 EM 提醒；device item 的 BEOL 熱／寄生 | #18 #19 #20 |

---

# 第 3 批（v2.7，2026-10-11）：跨層／前後製程搭配性的 issue

> 使用者要求：不只 dishing／pattern，整理 BEOL 多層堆疊裡「上一層或下一層、前一站或後一站」會互相影響的機制，用來擴充 `App.XLAYER` 與可能原因。本批 9 份（上限 10）。

| # | 主題 | 文獻 | 連結 | 跨層／前後製程的機制 | 取得 | 驗證 |
|---|---|---|---|---|---|---|
| 21 | **Via 下方的 stress-induced voiding（寬線）** | E. T. Ogawa, J. W. McPherson et al., "Stress-induced voiding under vias connected to wide Cu metal leads", *IEEE IRPS* (2002) | https://doi.org/10.1109/RELPHY.2002.996652 | 下層是寬線時 via 下方因熱應力與空位聚集形成空洞；via 越小、下層線越寬越嚴重；在後續熱循環（上層製程、退火）後才顯現為 Rc 上升／via chain 失效。支持 Rc 的「下層寬線 SIV」原因與 `rc←below cd` 規則 | 付費 | DOI |
| 22 | Cu／low-k 多層整合入門 | A. L. S. Loke, T. T. Wee, "Introduction to Copper/Low-K Interconnects & Electromigration Fundamentals", IEEE SSCS Denver (2003) | https://ewh.ieee.org/r5/denver/sscs/Presentations/2003_09_Loke.pdf | 整理多層互相影響：CMP dishing／erosion 與殘留帶到上層（層密度不同時 normalized Rs 0.8–1.2）；via-trench overlay 影響 via 落點與線距；etch stop 選擇比不足產生 unlanded "fangs"；後續 etch／ash／wet clean 損傷 porous low-k（吸濕，水 k≈80）；via stress migration 是「HUGE PROBLEM」；共用機台的 Cu 交叉污染 | 開放 | ✔ |
| 23 | 32 nm 以後的 Cu 互連技術（cap 介面） | J. Gambino, F. Chen, J. He (IBM), "Copper Interconnect Technology for the 32 nm Node and Beyond", *IEEE CICC* (2009) | https://ewh.ieee.org/r5/denver/sscs/References/2009_09_Gambino.pdf | EM 由 Cu／cap 介面的質傳決定（CoWP cap 可 >300×，但選擇性不足會增加線間漏電）；TDDB 崩潰發生在 cap／dielectric 介面，線寬上寬下窄時電場集中在頂部；cap 讓 k_eff 高約 10%；via 底部 barrier 是 EM 的阻擋邊界。支持「上層 cap 製程影響本層 LK／VBD／EM」 | 開放 | ✔ |
| 24 | Cu 互連綜述（SIV、cap、退火順序） | Y.-L. Cheng, C.-Y. Lee, Y.-L. Huang, "Copper Metal for Semiconductor Interconnects", *Noble and Precious Metals*, IntechOpen (2018) | https://doi.org/10.5772/intechopen.72396 | SIV 在 150–250 °C 成長最快（stress-free 溫度 300–450 °C），失效率隨 via 縮小與線寬變寬上升；Cu／cap 介面擴散活化能 1.0 eV（SiN／SiCN）、1.4（Ta／TaN）、2.4（CoWP）；cap 前的 H2／NH3 plasma 清洗對 EM 影響大於 cap 本身；**cap 後的高溫退火會增加 SIV**——上層熱預算是本層的跨層因素 | 開放 | ✔ |
| 25 | Cu 金屬化趨勢（via 底部、trench-first DOF） | H.-W. Kim, "Recent Trends in Copper Metallization", *Electronics* 11(18), 2914 (2022) | https://doi.org/10.3390/electronics11182914 | via 底部 barrier 厚度直接推高 Rc（選擇性 barrier 可降 ~50%、Ru prefill ~40%）；trench-first 的 via 微影因 step height 而 DOF 變窄（topography → 微影）；CMP 在 low-k／cap 介面留下高 trap 密度 → TDDB | 開放（MDPI） | ✔ |
| 26 | 先進 Cu 互連（air gap）整合回顧 | L. G. Gosset et al. (Philips／ST／Motorola), "General review of issues and perspectives for advanced copper interconnections using air gap…", *IITC* (2003) | https://www.nxp.com/docs/en/white-paper/IITC_2003_CU_AIRGAP_INTER.pdf | 每層都要處理 via misalignment；大面積 metal space 需 metal tiles 避免額外 dielectric CMP；上層 cure 400 °C／450 °C 退火的熱預算落在下層；self-aligned CoWP barrier | 開放 | ✔ |
| 27 | ITRS 2015 Interconnect | ITRS 2.0, *Interconnect* chapter (2015) | https://www.semiconductors.org/wp-content/uploads/2018/06/6_2015-ITRS-2.0_Interconnect.pdf | 多層互連的尺寸、k_eff、可靠度需求與整合挑戰的公版參考 | 開放 | ✔ |
| 28 | Cu／ULK 裂紋擴展（機械） | "A Practical Finite Element Approach for Simulating Dynamic Crack Growth in Cu/Ultra Low-k Interconnect Structures", arXiv:2508.00193 (2025) | https://arxiv.org/abs/2508.00193 | 多層 Cu／ULK 堆疊在 CMP 與封裝應力下的裂紋路徑；說明為什麼上層 CMP／封裝會讓下層 low-k 出問題（LK／VBD） | arXiv | ✔ |
| 29 | 跨層 via 對元件的影響（M3D） | "Metal Inter-layer Via Keep-out-zone in M3D IC: A Critical Process-aware Design Consideration", arXiv:2304.13808 (2023) | https://arxiv.org/abs/2304.13808 | 層間 via 的熱與應力影響鄰近元件（Vt、Id）；WAT device item 偏移可能來自上層互連製程的跨模組提醒 | arXiv | ✔ |

補充（未列入上限）：Semantic Scholar 頁面 https://www.semanticscholar.org/paper/40e377d39d668e5109f153b5875cd78512a5dd43（#21 摘要）；"Stress-induced voiding in multi-level copper/low-k interconnects"（IRPS 2004，IEEE 1315330）與 "Mechanisms of stress-induced voids in multi-level Cu interconnects"（IEEE 1014910）為 SIV 的多層延伸；"Electromigration Lifetime Improvement of Copper Interconnect by Cap/Dielectric Interface Treatment and Geometrical Design"（cap 介面處理）。

## 第 3 批對應到規則
| 規則／功能 | 引用 |
|---|---|
| `rc←below cd`（下層線寬：unlanded／寬線 SIV）、`rc←below topo`（dishing → via 變長） | #21 #22 #24 #25 |
| Rc 原因「下層寬線的 stress-induced voiding」、Rs 原因「上層熱預算或 cap 後退火造成 Cu 應力空洞」 | #21 #24 |
| LK 原因「上層 etch／ash／cap 製程損傷本層 low-k 或 cap 介面」、`vbd←below topo` | #22 #23 #25 #28 |
| `cap←above thk` | #23 #26 |
| 證據加權排序（v2.7）：同層 inline／跨層 inline／機台三種證據支持的原因排前、資料不支持的灰掉 | 設計依 #22 的整合清單 |
