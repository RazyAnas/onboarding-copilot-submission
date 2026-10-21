import pickle, re, random, collections, numpy as np, sys
from scipy.optimize import linear_sum_assignment
from sklearn.ensemble import HistGradientBoostingClassifier
sys.path.insert(0,'.')
exec(open('eval_online.py').read().split("rnd=random.Random(9)")[0])
def lsm(s): s=s-s.max(); return s-np.log(np.exp(s).sum())
def gb_logp(clf,X):
    p=clf.predict_proba(ctx(X))[:,1]; return np.log(p/p.sum()+1e-12)
def joint(L):
    n,m=L.shape
    if n>m: return L.argmax(1)
    r,c=linear_sum_assignment(-L); out=np.zeros(n,int); out[r]=c; return out
def prf(w0,gs,steps=3,eta=0.05,thr=0.9):
    L0=np.array([lsm(ctx(g['X'])@w0) for g in gs]); P=np.exp(L0); conf=np.where(P.max(1)>thr)[0]; w=w0.copy()
    for _ in range(steps):
        for i in conf:
            g=gs[i]; X=ctx(g['X']); p=softmax(X@w); t=P[i].argmax(); y=np.zeros(g['n']); y[t]=1
            w=w-eta*(X.T@(p-y))-eta*0.05*(w-w0)
    return np.array([lsm(ctx(g['X'])@w) for g in gs])
M=['Similo','lin','gbdt','ens','ens_joint','ens_prf_joint','ens_prf_joint_margin']
res={m:collections.defaultdict(collections.Counter) for m in M}
DG=[0,0.1,0.2,0.4,0.7,1.0,1.5]
for k in range(K):
    test=[a for a in apps if fold[a]==k]; cal=[a for a in apps if fold[a]==(k+1)%K]; trn=[a for a in apps if a not in test and a not in cal]
    Gt=[g for a in trn for g in by[a]]; w=fit(Gt)
    X=np.concatenate([ctx(g['X']) for g in Gt]); y=np.concatenate([(np.arange(g['n'])==g['y']).astype(int) for g in Gt])
    clf=HistGradientBoostingClassifier(max_iter=200,learning_rate=0.1,max_leaf_nodes=31,l2_regularization=1.0,random_state=0).fit(X,y)
    def pipeline(a):
        gs=by[a]; Ll=np.array([lsm(ctx(g['X'])@w) for g in gs]); Lg=np.array([gb_logp(clf,g['X']) for g in gs]); Le=(Ll+Lg)/2
        w2=prf(w,gs); Lp=(w2*0+Le) if False else (np.array([ (lsm(ctx(g['X'])@0)*0) for g in gs])+ (Le+0.5*(w2*0)) if False else None)
        Lprf=prf(w,gs); Lc=(Lprf+Lg)/2
        return gs,Ll,Lg,Le,Lc
    # margin delta on cal
    sc=collections.Counter(); store={}
    for a in cal:
        gs,Ll,Lg,Le,Lc=pipeline(a); J=joint(Lc)
        for i,g in enumerate(gs):
            P=np.exp(Lc[i]); o=np.sort(P)[::-1]; gap=o[0]-o[1]
            store[(a,i)]=(gap,J[i]==g['y'])
    dsel=DG[-1]
    for d in DG:
        act=[(ok) for (gap,ok) in store.values() if gap>=d*0.2]; 
        wrong=sum(1 for (gap,ok) in store.values() if gap>=d*0.2 and not ok)/len(store)
        if wrong<=0.03: dsel=d; break
    for a in test:
        gs,Ll,Lg,Le,Lc=pipeline(a); J=joint(Le); Jc=joint(Lc)
        for i,g in enumerate(gs):
            res['lin'][a]['c' if Ll[i].argmax()==g['y'] else 'w']+=1; res['gbdt'][a]['c' if Lg[i].argmax()==g['y'] else 'w']+=1
            res['ens'][a]['c' if Le[i].argmax()==g['y'] else 'w']+=1; res['ens_joint'][a]['c' if J[i]==g['y'] else 'w']+=1
            res['ens_prf_joint'][a]['c' if Jc[i]==g['y'] else 'w']+=1
            P=np.exp(Lc[i]); o=np.sort(P)[::-1]
            res['ens_prf_joint_margin'][a]['a' if o[0]-o[1]<dsel*0.2 else ('c' if Jc[i]==g['y'] else 'w')]+=1
    print('fold',k,'delta',dsel,flush=True)
for a in apps: c,nf,wr=pub[a]['Similo']; res['Similo'][a]=collections.Counter({'c':c,'a':nf,'w':wr})
def tot(m,s):
    t=collections.Counter()
    for a in s: t.update(res[m][a])
    n=sum(t.values()); return np.array([t['c']/n,t['w']/n,t['a']/n])
rnd=random.Random(5); boots=[[rnd.choice(apps) for _ in apps] for _ in range(1500)]
for m in M:
    t=tot(m,apps); print(f"{m:24s} C={100*t[0]:.1f} W={100*t[1]:.1f} A={100*t[2]:.1f}",end='')
    if m!='Similo':
        d=np.array([tot(m,s)-tot('Similo',s) for s in boots]); print('  | vs Similo dC=%+.1f [%.1f,%.1f]  dW=%+.1f [%.1f,%.1f]'%(100*d.mean(0)[0],*(100*np.percentile(d,[2.5,97.5],axis=0)[:,0]),100*d.mean(0)[1],*(100*np.percentile(d,[2.5,97.5],axis=0)[:,1])))
    else: print()
