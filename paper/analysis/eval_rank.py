import sys, json, random, collections
import numpy as np
sys.path.insert(0,'.')
import train_rank
from train_rank import *
import os
train_rank.CTX=os.environ.get('CTX')=='1'
SUF='_ctx' if train_rank.CTX else ''
G=load(); pages=sorted({g[0] for g in G}); print('groups',len(G),'pages',len(pages))
random.seed(11); sh=pages[:]; random.shuffle(sh); K=4
fold={p:i%K for i,p in enumerate(sh)}
by={p:[g for g in G if g[0]==p] for p in pages}
DG=[None,0.02,0.05,0.1,0.15,0.2,0.3,0.4,0.5,0.6,0.7,0.8]
def sel(groups,f): return [g for g in groups if f(g)]
redeploy=lambda g:g[1]=='redeploy' and g[2]>0
rows=[]; wts=[]; deltas=[]; looo=collections.defaultdict(lambda: collections.Counter())
def outcome_row(w,g,delta):
    X=g[7]; y=g[6]; P=predict(w,X); o=np.argsort(-P); p1=P[o[0]]; p2=P[o[1]] if len(P)>1 else 0
    act = not(delta is not None and (p1-p2)<delta)
    return ('a' if not act else ('c' if int(o[0])==y else 'w')), p1, p2
for k in range(K):
    test=[p for p in pages if fold[p]==k]; cal=[p for p in pages if fold[p]==(k+1)%K]; trn=[p for p in pages if p not in test and p not in cal]
    Gt=[g for p in trn for g in by[p]]
    w=fit_linear(Gt); wts.append(w)
    # calibrate delta on cal pages (redeploy rho>0): smallest delta with wrong<=5%
    Gc=[g for p in cal for g in by[p] if redeploy(g)]
    dsel=DG[-1]
    for d in DG:
        c=collections.Counter(outcome_row(w,g,d)[0] for g in Gc)
        if c['w']/sum(c.values())<=0.05: dsel=d; break
    deltas.append(dsel)
    for p in test:
        for g in by[p]:
            o1=outcome_row(w,g,None)[0]; o2=outcome_row(w,g,dsel)[0]
            base=dict(p=g[0],op=g[1],rho=g[2],seed=g[3],t=g[4],d=g[5])
            rows.append(base|dict(m='learned',o=o1)); rows.append(base|dict(m='learned_margin',o=o2))
    # leave-one-operator-out on test pages
    for op in ['classes','ids','reorder','wrap','copy','dup_section','dup_adjacent','redeploy']:
        Gt2=[g for p in trn for g in by[p] if g[1]!=op]; w2=fit_linear(Gt2)
        for p in test:
            for g in by[p]:
                if g[1]==op and g[2]==1.0: looo[op][outcome_row(w2,g,None)[0]]+=1
with open('../results/robustness_learned'+SUF+'.jsonl','w') as f:
    for r in rows: f.write(json.dumps(r)+'\n')
W=np.mean(wts,0); json.dump({'features':FEATS,'ctx':train_rank.CTX,'weights':[float(x) for x in W],'deltas':deltas,'fold_weights':[[float(x) for x in w] for w in wts],
  'looo':{op:{k:v/sum(c.values()) for k,v in c.items()} for op,c in looo.items()}},open('../results/learned_model'+SUF+'.json','w'),indent=1)
print('deltas',deltas); print('weights',{f:round(float(x),2) for f,x in zip(FEATS,W)})
print('LOOO (rho=1) learned C/W:',{op:(round(c['c']/sum(c.values()),3),round(c['w']/sum(c.values()),3)) for op,c in looo.items()})
