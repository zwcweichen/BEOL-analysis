# -*- coding: utf-8 -*-
"""Robustness samples: data shapes the report was NOT designed around.
  C: CSV, names like "RS_M3 (ohm/sq)", Route = POR/NEW1/NEW2 (3 conditions), Product groups, string dates, 5% missing, one unknown PARAM_X
  D: long table with other column names (WaferID / Parameter / Value / X / Y), condition = Chamber
  E: only one condition value -> must stop at setup and ask
"""
import numpy as np, pandas as pd
import os
OUT=os.path.join(os.path.dirname(os.path.abspath(__file__)),'variants')+os.sep
os.makedirs(OUT,exist_ok=True)
rng=np.random.default_rng(7)
# ---- C: CSV, different naming, 3 conditions, unit in parentheses, string dates, missing values, unknown param
rows=[]
for prod in ['PX100','PX200','QZ300']:
    for route,n in [('POR',120),('NEW1',30),('NEW2',30)]:
        for i in range(n):
            cd=48+rng.normal(0,.8)+(1.8 if (route=='NEW1' and prod=='PX200') else 0)
            thk=1200+rng.normal(0,15)-(40 if route=='NEW2' else 0)
            rs=0.09*(48/cd)*(1200/thk)*(1+rng.normal(0,.01))
            leak=np.exp(rng.normal(np.log(2e-11),.5))*np.exp((cd-48)/0.7)
            r={'WaferID':f'{prod}{route}{i:03d}','Lot':f'L{i//6:03d}','Product':prod,'Route':route,
               'TestDate':f'2026/{5+i%4:02d}/{1+i%27:02d} 10:00',
               'RS_M3 (ohm/sq)':round(rs,5),'LEAK_M3 (A)':leak,'VIA2_RC (ohm)':round(3.1*(46/(46+rng.normal(0,.8)))**2+rng.normal(0,.05),4),
               'M3 CD (nm)':round(cd,2),'M3 THK (A)':round(thk,1),'PARAM_X':rng.normal(5,1)}
            if rng.random()<0.05: r['RS_M3 (ohm/sq)']=None
            rows.append(r)
pd.DataFrame(rows).to_csv(OUT+'C_route_3cond.csv',index=False)
# ---- D: long format, different column names, condition = chamber
rows=[]
for w in range(80):
    ch='CH_A' if w<60 else 'CH_B'
    for p,nom,s in [('Con_M5',0.08,0.002),('Rc_V4',2.5,0.08),('M5_CD',52,0.7),('V4_CD',44,0.6)]:
        for site,(x,y) in enumerate([(0,0),(60,0),(-60,0),(0,120),(0,-120)]):
            v=nom+rng.normal(0,s)
            if ch=='CH_B' and p=='V4_CD': v-=1.5
            if ch=='CH_B' and p=='Rc_V4': v+=0.2
            rows.append({'WaferID':f'W{w:03d}','Chamber':ch,'Parameter':p,'Site':site+1,'X':x,'Y':y,'Value':v,'MeasDate':pd.Timestamp('2026-06-01')+pd.Timedelta(days=w)})
pd.DataFrame(rows).to_excel(OUT+'D_long_chamber.xlsx',index=False)
# ---- E: one condition only
pd.DataFrame({'Wafer':[f'W{i}' for i in range(30)],'Split':['POR']*30,'Con_M1':rng.normal(1,.01,30),'M1_CD':rng.normal(40,.5,30)}).to_excel(OUT+'E_single_cond.xlsx',index=False)
# ---- G (v2.6, 跨層 story): Rs_M3 偏高但 M3 CD／THK 正常；M2 THK 偏薄、M2 dishing 變大（下層 topography 繼承）。沒有任何機台欄位。
rows=[]
for prod in ['PA','PB']:
    for cond,n in [('BSL',150),('CIP',40)]:
        for i in range(n):
            hit=(prod=='PA' and cond=='CIP')
            m2dish=320+rng.normal(0,25)+(70 if hit else 0)          # Å, dishing of the wide-metal monitor
            m2thk=2400+rng.normal(0,30)-(60 if hit else 0)
            m3cd=60+rng.normal(0,.7); m3thk=2600+rng.normal(0,30)
            rs3=0.075*(60/m3cd)*(2600/m3thk)*(1+rng.normal(0,.012))*(1+0.05*(m2dish-320)/70 if hit else 1)
            rc2=2.2+rng.normal(0,.07)+(0.12*(m2dish-320)/70 if hit else 0)
            rows.append({'WAFER':f'{prod}{cond}{i:03d}.{1+i%25:02d}','Product':prod,'Lot_Type':cond,'Date':pd.Timestamp('2026-07-01')+pd.Timedelta(days=i%60),
                'Rs_M3':round(rs3,5),'Rc_V2':round(rc2,4),'LK_M3':np.exp(rng.normal(np.log(3e-11),.4)),
                'M3 CD':round(m3cd,2),'M3 THK':round(m3thk,1),'M2 THK':round(m2thk,1),'M2 DISH':round(m2dish,1)})
pd.DataFrame(rows).to_excel(OUT+'G_xlayer.xlsx',index=False)
# ---- H (v2.8, 角色 B：模仿使用者實際資料的樣子): 長欄名 "Mean(Item Value by Site, 07504.050 M15CUCMP_5, NOVA_THK)"、
#      同站點另有 NOVA_THK_R（range，衍生統計）、條件值 "FAB18_U%_BSL"／"FAB15_U%_BSL"、M14 CMP tool 欄；
#      故事：Con_M15 偏高（+2.3σ），M15 THK 正常，M14 THK 略偏（+0.7σ）但 wafer 間與 Con_M15 關聯弱；沒有任何 CD 欄（檢查視窗應提示匯入）。
rows=[]; cnt=0
for prod in ['TMQI55','TMSA72']:
    for cond,n in [('FAB18_U%_BSL',400),('FAB15_U%_BSL',60)]:
        for i in range(n):
            cnt+=1; hit=(prod=='TMQI55' and cond.startswith('FAB15'))
            m15=2600+rng.normal(0,30); m14=2500+rng.normal(0,30)+(20 if hit else 0)
            m15r=60+rng.normal(0,8)+(10 if hit else 0); m14r=55+rng.normal(0,8)
            con15=0.1*(2600/m15)*(1+rng.normal(0,.012))+(0.0035 if hit else 0)      # shift NOT driven by M14 THK → weak r
            con14=0.1*(2500/m14)*(1+rng.normal(0,.012))
            rows.append({'WAFER_ID':f'UAB{cnt//25:03d}.{1+cnt%25:02d}','Product':prod,'FAB_Name':cond,'WAT Date':pd.Timestamp('2026-05-01')+pd.Timedelta(days=int(i*150/n)),
                'M14_CMP_Tool':f'CMP0{1+i%6}',
                'Mean(Con_M14)':round(con14,5),'Mean(Con_M15)':round(con15,5),'Mean(Rc_V13)':round(2.3+rng.normal(0,.08),4),'Mean(Rc_V14)':round(2.4+rng.normal(0,.08),4),
                'Mean(LK_M14)':np.exp(rng.normal(np.log(2e-11),.4)),'Mean(LK_M15)':np.exp(rng.normal(np.log(2e-11),.4)),
                'Mean(Item Value by Site, 07348.050 M14CUCMP_5, NOVA_THK)':round(m14,1),'Mean(Item Value by Site, 07348.050 M14CUCMP_5, NOVA_THK_R)':round(m14r,1),
                'Mean(Item Value by Site, 07504.050 M15CUCMP_5, NOVA_THK)':round(m15,1),'Mean(Item Value by Site, 07504.050 M15CUCMP_5, NOVA_THK_R)':round(m15r,1)})
pd.DataFrame(rows).to_excel(OUT+'H_longnames.xlsx',index=False)
# 補資料用：M15 trench CD，只有部分 wafer，CD 與 Con_M15 負相關（匯入後檢查視窗應變成 ✔）
cd=[]
for r in rows:
    if rng.random()<0.8:
        c=62-(r['Mean(Con_M15)']-0.1)/0.0035*1.2+rng.normal(0,.5)
        cd.append({'WAFER':r['WAFER_ID'].replace('.','-'),'M15 CD AEI':round(c,2)})
pd.DataFrame(cd).to_excel(OUT+'H_link_M15CD.xlsx',index=False)
