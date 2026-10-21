import sys, random, collections, json, numpy as np
from scipy.optimize import linear_sum_assignment
sys.path.insert(0,'.')
exec(open('eval_final.py').read().split("M=['Similo'")[0])
def hung(L):
    n,m=L.shape
    if n>m: return L.argmax(1)
    r,c=linear_sum_assignment(-L); o=np.zeros(n,int); o[r]=c; return o
def lsm(S): S=S-S.max(1,keepdims=True); return S-np.log(np.exp(S).sum(1,keepdims=True))
NM=["cls","idEq","idDice","hrefEq","hrefDice","text","vtext","vtextEq","nameAlt","xpath","idxEq","idxDice","tag","isBtn","loc","size","area","shape","nbA","nbB","nbL","nbR","nbAny","ncd","clsTok","hrefTok","textTok","nbTok","labelTok","ncdText"]
TXT=[NM.index(n) for n in ["text","vtext","vtextEq","nameAlt","textTok","ncdText","labelTok"]]
ALLTXT=TXT+[NM.index("ncd")]
def aug(g,cols,rng):
    X=g['X'].copy(); X[:,cols]=0; return dict(X=X,y=g['y'],n=g['n'])
CFG={'none':(0,TXT),'text p=.3':(0.3,TXT),'text p=.5':(0.5,TXT),'text+ncd p=.4':(0.4,ALLTXT),'text p=.8':(0.8,TXT)}
res={c:collections.defaultdict(collections.Counter) for c in CFG}; res['Similo']=collections.defaultdict(collections.Counter)
for k in range(K):
    test=[a for a in apps if fold[a]==k]; trn=[a for a in apps if fold[a]!=k]; Gt=[g for a in trn for g in by[a]]
    for name,(p,cols) in CFG.items():
        rng=random.Random(k); extra=[aug(g,cols,rng) for g in Gt if rng.random()<p]
        w=fit(Gt+extra)
        for a in test:
            gs=by[a]; L=lsm(np.array([ctx(g['X'])@w for g in gs])); J=hung(L)
            for i,g in enumerate(gs): res[name][a]['c' if J[i]==g['y'] else 'w']+=1
    print('fold',k,flush=True)
for a in apps: c,nf,wr=pub[a]['Similo']; res['Similo'][a]=collections.Counter({'c':c,'a':nf,'w':wr})
def tot(m,s):
    t=collections.Counter()
    for a in s: t.update(res[m][a])
    return t['c']/sum(t.values())
rnd=random.Random(5); boots=[[rnd.choice(apps) for _ in apps] for _ in range(2000)]
for m in CFG:
    d=np.array([tot(m,s)-tot('Similo',s) for s in boots]); print(f"joint, augmentation {m:16s} C={100*tot(m,apps):.1f} vs Similo {100*d.mean():+.1f} [{100*np.percentile(d,2.5):.1f},{100*np.percentile(d,97.5):.1f}]")
