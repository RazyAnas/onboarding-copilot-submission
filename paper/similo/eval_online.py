import pickle, re, random, json, collections, numpy as np
from scipy.optimize import minimize
exec(open('eval_similo.py').read().split("res=collections.defaultdict")[0])
def softmax(s): s=s-s.max(); e=np.exp(s); return e/e.sum()
def fit(groups,l2=1e-2):
    Xs=[ctx(g['X']) for g in groups]; ys=[g['y'] for g in groups]; nf=Xs[0].shape[1]
    def f(w):
        L=0;gr=np.zeros(nf)
        for X,y in zip(Xs,ys):
            p=softmax(X@w); L-=np.log(p[y]+1e-9); p[y]-=1; gr+=X.T@p
        return L/len(Xs)+l2*w@w, gr/len(Xs)+2*l2*w
    return minimize(f,np.zeros(nf),jac=True,method='L-BFGS-B',options={'maxiter':200}).x
def run(w0,groups,eta,lam=0.05,feedback=True,rng=None):
    w=w0.copy(); out=[]
    order=list(range(len(groups)))
    for i in order:
        g=groups[i]; X=ctx(g['X']); p=softmax(X@w); o=np.argsort(-p); out.append('c' if o[0]==g['y'] else 'w')
        if feedback:  # observe confirmed target (user click / success signal), take one SGD step with pull toward prior
            gr=X.T@(p-(np.arange(g['n'])==g['y']))
            w=w-eta*gr-eta*lam*(w-w0)
    return out
rnd=random.Random(9)
res={m:collections.defaultdict(collections.Counter) for m in ['static','online','Similo']}
ETA=float(__import__('sys').argv[1]) if len(__import__('sys').argv)>1 else 0.05
pos_curve=collections.defaultdict(lambda:[0,0,0]) # position bucket -> [static c, online c, n]
for k in range(K):
    test=[a for a in apps if fold[a]==k]; trn=[a for a in apps if fold[a]!=k]
    w0=fit([g for a in trn for g in by[a]]); 
    for a in test:
        gs=by[a][:]; rnd.shuffle(gs)           # random order of steps within a site
        s=run(w0,gs,ETA,feedback=False); o=run(w0,gs,ETA,feedback=True)
        for i,(x,y) in enumerate(zip(s,o)):
            res['static'][a][x]+=1; res['online'][a][y]+=1
            b=min(i,9); pc=pos_curve[b]; pc[0]+= x=='c'; pc[1]+= y=='c'; pc[2]+=1
    print('fold',k,flush=True)
for m in ['Similo']:
    for a in apps: c,nf,w=pub[a][m]; res[m][a]=collections.Counter({'c':c,'a':nf,'w':w})
def tot(m,sample=None):
    sample=sample or apps; t=collections.Counter()
    for a in sample: t.update(res[m][a])
    n=sum(t.values()); return np.array([t['c']/n,t['w']/n])
boots=[[rnd.choice(apps) for _ in apps] for _ in range(2000)]
out={}
for m in ['Similo','static','online']:
    t=tot(m); arr=np.array([tot(m,s) for s in boots]); c=np.percentile(arr,[2.5,97.5],axis=0)
    out[m]={'c':t[0],'w':t[1],'c_ci':[c[0][0],c[1][0]]}; print(f"{m:8s} C={100*t[0]:.1f} [{100*c[0][0]:.1f},{100*c[1][0]:.1f}]  W={100*t[1]:.1f}")
for a,b in [('online','static'),('online','Similo'),('static','Similo')]:
    d=np.array([tot(a,s)[0]-tot(b,s)[0] for s in boots]); out[f'{a}_vs_{b}']=[d.mean(),*np.percentile(d,[2.5,97.5])]; print(a,'vs',b,'dC=%.1f [%.1f,%.1f]'%(100*d.mean(),*(100*np.percentile(d,[2.5,97.5]))))
print('accuracy by step index within a site (static vs online):')
for b in range(10): s,o,n=pos_curve[b]; print(b+1 if b<9 else '10+', 'static %.3f online %.3f n=%d'%(s/n,o/n,n))
json.dump({'eta':ETA,'res':out,'curve':{b:pos_curve[b] for b in pos_curve}},open('similo_online.json','w'),indent=1)
