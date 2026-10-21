import sys, random, collections, numpy as np
from scipy.optimize import linear_sum_assignment
sys.path.insert(0,'.')
src=open('eval_final.py').read().split("M=['Similo'")[0].replace("similo_feats2.pkl","similo_feats3.pkl")
src=src.replace("eval_online2.py","eval_online3.py")
open('eval_online3.py','w').write(open('eval_online2.py').read().replace("similo_feats2.pkl","similo_feats3.pkl"))
exec(src)
import pickle
G=pickle.load(open('similo_feats3.pkl','rb')); by={a:[g for g in G if g['app']==a] for a in apps}
def hung(L):
    n,m=L.shape
    if n>m: return L.argmax(1)
    r,c=linear_sum_assignment(-L); o=np.zeros(n,int); o[r]=c; return o
def lsm(S): S=S-S.max(1,keepdims=True); return S-np.log(np.exp(S).sum(1,keepdims=True))
nf=G[0]['X'].shape[1]; print('feature dim',nf)
VARS={'baseline (30 feats)':list(range(30)),'+ FlyHash (34 feats)':list(range(34)),'FlyHash only + loc/xpath/tag':[30,31,32,33,14,9,12]}
res={v:{'indep':collections.defaultdict(collections.Counter),'joint':collections.defaultdict(collections.Counter)} for v in VARS}; res['Similo']=collections.defaultdict(collections.Counter)
for k in range(K):
    test=[a for a in apps if fold[a]==k]; trn=[a for a in apps if fold[a]!=k]
    for v,cols in VARS.items():
        sub=lambda g:dict(X=g['X'][:,cols],y=g['y'],n=g['n'])
        w=fit([sub(g) for a in trn for g in by[a]])
        for a in test:
            gs=[sub(g) for g in by[a]]; L=lsm(np.array([ctx(g['X'])@w for g in gs])); J=hung(L)
            for i,g in enumerate(gs):
                res[v]['indep'][a]['c' if L[i].argmax()==g['y'] else 'w']+=1; res[v]['joint'][a]['c' if J[i]==g['y'] else 'w']+=1
    print('fold',k,flush=True)
for a in apps: c,nf_,wr=pub[a]['Similo']; res['Similo'][a]=collections.Counter({'c':c,'a':nf_,'w':wr})
def tot(d,s):
    t=collections.Counter()
    for a in s: t.update(d[a])
    return t['c']/sum(t.values())
rnd=random.Random(5); boots=[[rnd.choice(apps) for _ in apps] for _ in range(3000)]
print('Similo',round(100*tot(res['Similo'],apps),1))
for v in VARS:
    for mode in ('indep','joint'):
        d=np.array([tot(res[v][mode],s)-tot(res['Similo'],s) for s in boots]); print(f"{v:32s} {mode:5s} C={100*tot(res[v][mode],apps):.1f}  vs Similo {100*d.mean():+.1f} [{100*np.percentile(d,2.5):.1f},{100*np.percentile(d,97.5):.1f}]")
    d=np.array([tot(res[v]['joint'],s)-tot(res['baseline (30 feats)']['joint'],s) for s in boots]); print(f"    joint vs baseline-joint {100*d.mean():+.1f} [{100*np.percentile(d,2.5):.1f},{100*np.percentile(d,97.5):.1f}]")
