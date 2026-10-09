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
