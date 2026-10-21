import sys, os, re, glob, pickle, random, collections, numpy as np
from scipy.optimize import linear_sum_assignment
sys.path.insert(0,'.')
from load_similo import props, ROOT
exec(open('eval_fly.py').read().split("def hung")[0].split("exec(src)")[0]+"exec(src)\nimport pickle\nG=pickle.load(open('similo_feats3.pkl','rb')); by={a:[g for g in G if g['app']==a] for a in apps}\n")
def hung(L):
    n,m=L.shape
    if n>m: return L.argmax(1)
    r,c=linear_sum_assignment(-L); o=np.zeros(n,int); o[r]=c; return o
def lsm(S): S=S-S.max(1,keepdims=True); return S-np.log(np.exp(S).sum(1,keepdims=True))
# candidate boxes per app (same glob order as feature builders)
boxes={}
for app in apps:
    c=[props(f) for f in glob.glob(f'{ROOT}/{app}/candidate_widgets/*.properties')]
    boxes[app]=np.array([[float(d.get('x',0)),float(d.get('y',0)),float(d.get('width',0)),float(d.get('height',0))] for d in c])
def overlap(B,thr):
    x1,y1,x2,y2=B[:,0],B[:,1],B[:,0]+B[:,2],B[:,1]+B[:,3]
    ix=np.maximum(0,np.minimum(x2[:,None],x2[None])-np.maximum(x1[:,None],x1[None])); iy=np.maximum(0,np.minimum(y2[:,None],y2[None])-np.maximum(y1[:,None],y1[None]))
    inter=ix*iy; a=(B[:,2]*B[:,3]); union=a[:,None]+a[None]-inter
    O=(inter/np.maximum(union,1))>thr; np.fill_diagonal(O,True); return O
SIM_COLS=[0,2,5,6,8,11,22,23,24,26,27,28,29,30,31,32,33]   # similarity columns to aggregate over a visual group
def group_feats(X,O):
    S=X[:,SIM_COLS]; mx=np.zeros_like(S); mean=np.zeros_like(S)
    for i in range(len(S)):
        idx=np.where(O[i])[0]; mx[i]=S[idx].max(0); mean[i]=S[idx].mean(0)
    return np.concatenate([mx,mean],1)
def addgroup(g,app,thr):
    O=overlap(boxes[app],thr); return dict(app=g['app'],X=np.concatenate([g['X'],group_feats(g['X'],O)],1),y=g['y'],n=g['n'])
res=collections.defaultdict(lambda:{'indep':collections.defaultdict(collections.Counter),'joint':collections.defaultdict(collections.Counter)})
CFG={'base':None,'VON groups IoU>0.5':0.5,'VON groups IoU>0.3':0.3,'VON groups IoU>0.7':0.7}
GG={}
for name,thr in CFG.items():
    GG[name]={a:[(g if thr is None else addgroup(g,a,thr)) for g in by[a]] for a in apps}
for k in range(K):
    test=[a for a in apps if fold[a]==k]; trn=[a for a in apps if fold[a]!=k]
    for name in CFG:
        w=fit([g for a in trn for g in GG[name][a]])
        for a in test:
            gs=GG[name][a]; L=lsm(np.array([ctx(g['X'])@w for g in gs])); J=hung(L)
            for i,g in enumerate(gs): res[name]['indep'][a]['c' if L[i].argmax()==g['y'] else 'w']+=1; res[name]['joint'][a]['c' if J[i]==g['y'] else 'w']+=1
    print('fold',k,flush=True)
res['Similo']=None; sim=collections.defaultdict(collections.Counter)
for a in apps: c,nf,wr=pub[a]['Similo']; sim[a]=collections.Counter({'c':c,'a':nf,'w':wr})
def tot(d,s):
    t=collections.Counter()
    for a in s: t.update(d[a])
    return t['c']/sum(t.values())
rnd=random.Random(5); boots=[[rnd.choice(apps) for _ in apps] for _ in range(3000)]
for name in CFG:
    for mode in ('indep','joint'):
        d=np.array([tot(res[name][mode],s)-tot(sim,s) for s in boots]); print(f"{name:22s} {mode:5s} C={100*tot(res[name][mode],apps):.1f} vs Similo {100*d.mean():+.1f} [{100*np.percentile(d,2.5):.1f},{100*np.percentile(d,97.5):.1f}]")
