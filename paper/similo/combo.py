import sys, random, collections, json, itertools, numpy as np
from scipy.optimize import linear_sum_assignment
from sklearn.ensemble import HistGradientBoostingClassifier
sys.path.insert(0,'.')
exec(open('eval_final.py').read().split("M=['Similo'")[0])
def lsm(S,axis): S=S-S.max(axis,keepdims=True); return S-np.log(np.exp(S).sum(axis,keepdims=True))
def hung(L):
    n,m=L.shape
    if n>m: return L.argmax(1)
    r,c=linear_sum_assignment(-L); o=np.zeros(n,int); o[r]=c; return o
def sinkhorn(L,tau=1.0,it=20):
    K=L/tau; 
    for _ in range(it): K=lsm(K,1); K=np.minimum(K-np.log(np.exp(K).sum(0,keepdims=True)+1e-12)*0+0,0) if False else K; col=np.log(np.exp(K).sum(0,keepdims=True)+1e-12); K=K-np.maximum(col,0)
    return K
def gale_shapley(L):
    n,m=L.shape; pref=np.argsort(-L,1); nxt=[0]*n; held={}; free=list(range(n))
    while free:
        t=free.pop(); 
        if nxt[t]>=m: continue
        c=pref[t][nxt[t]]; nxt[t]+=1
        if c not in held: held[c]=t
        elif L[t,c]>L[held[c],c]: free.append(held[c]); held[c]=t
        else: free.append(t)
    o=L.argmax(1).copy()
    for c,t in held.items(): o[t]=c
    return o
VAR={}
def add(name,fn): VAR[name]=fn
res=collections.defaultdict(lambda: collections.defaultdict(collections.Counter))
def record(name,a,pred,gs):
    for p,g in zip(pred,gs): res[name][a]['c' if p==g['y'] else 'w']+=1
def tempfit(Ls,gs_all,taus=(0.5,0.75,1,1.5,2,3)):
    best=None
    for t in taus:
        nll=0;n=0
        for L,gs in zip(Ls,gs_all):
            Lt=lsm(L/t,1); nll-=sum(Lt[i,g['y']] for i,g in enumerate(gs)); n+=len(gs)
        if best is None or nll<best[0]: best=(nll/n,t)
    return best[1]
for k in range(K):
    test=[a for a in apps if fold[a]==k]; cal=[a for a in apps if fold[a]==(k+1)%K]; trn=[a for a in apps if a not in test and a not in cal]
    Gt=[g for a in trn for g in by[a]]; w=fit(Gt)
    X=np.concatenate([ctx(g['X']) for g in Gt]); y=np.concatenate([(np.arange(g['n'])==g['y']).astype(int) for g in Gt])
    hgb=HistGradientBoostingClassifier(max_iter=150,learning_rate=0.1,max_leaf_nodes=31,l2_regularization=1.0,random_state=0).fit(X,y)
    S=lambda a:np.array([ctx(g['X'])@w for g in by[a]])
    Sg=lambda a:np.array([np.log(hgb.predict_proba(ctx(g['X']))[:,1]+1e-9) for g in by[a]])
    tcal=tempfit([lsm(S(a),1) for a in cal],[by[a] for a in cal])
    # self-training data prep
    for a in test:
        gs=by[a]; L0=lsm(S(a),1); Lg=lsm(Sg(a),1)
        def variants(L,tag):
            record(tag+'|indep',a,L.argmax(1),gs)
            record(tag+'|joint',a,hung(L),gs)
            D=L+lsm(L,0)                      # dual softmax (agreement fwd x rev)
            record(tag+'|dual',a,D.argmax(1),gs); record(tag+'|dual+joint',a,hung(D),gs)
            Sk=sinkhorn(L,1.0); record(tag+'|sinkhorn',a,Sk.argmax(1),gs); record(tag+'|sinkhorn+joint',a,hung(Sk),gs)
            record(tag+'|stable',a,gale_shapley(L),gs)
        variants(L0,'lin'); variants(lsm(S(a)/tcal,1),'lin+temp'); variants(Lg,'gbdt'); variants((L0+Lg)/2,'ens(lin+gbdt)'); variants(lsm((S(a)/tcal),1)*0.5+Lg*0.5,'ens+temp')
        # self-training: pseudo-label confident targets of this site (p>0.9 after joint), refit, re-predict
        P=np.exp(L0); J=hung(L0); conf=[i for i in range(len(gs)) if P[i,J[i]]>0.9]
        if len(conf)>=3:
            pseudo=[dict(X=gs[i]['X'],y=int(J[i]),n=gs[i]['n']) for i in conf]
            w2=fit(Gt+pseudo*3); L2=lsm(np.array([ctx(g['X'])@w2 for g in gs]),1)
        else: L2=L0
        variants(L2,'selftrain')
        variants((L2+Lg)/2,'selftrain+gbdt')
    print('fold',k,flush=True)
for a in apps: c,nf,wr=pub[a]['Similo']; res['Similo'][a]=collections.Counter({'c':c,'a':nf,'w':wr})
def tot(m,s):
    t=collections.Counter()
    for a in s: t.update(res[m][a])
    n=sum(t.values()); return t['c']/n
rnd=random.Random(5); boots=[[rnd.choice(apps) for _ in apps] for _ in range(1500)]
rows=[]
for m in res:
    if m=='Similo': continue
    d=np.array([tot(m,s)-tot('Similo',s) for s in boots]); rows.append((tot(m,apps),m,d.mean(),np.percentile(d,2.5),np.percentile(d,97.5)))
rows.sort(reverse=True)
print('Similo C=%.1f'%(100*tot('Similo',apps)))
for c,m,dm,lo,hi in rows[:25]: print(f"{m:34s} C={100*c:.1f}  vs Similo {100*dm:+.1f} [{100*lo:.1f},{100*hi:.1f}]")
json.dump([(m,c,dm,lo,hi) for c,m,dm,lo,hi in rows],open('combo.json','w'))
