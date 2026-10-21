import pickle, re, random, collections, glob, numpy as np, sys
sys.path.insert(0,'.')
exec(open('eval_geo.py').read().split("def rerank")[0])      # loads fit, ctx, geo (T,C coords), by, folds, pub
def spectral(L,T,C,beta,tau=120.0,topk=5,iters=30):
    n,m=L.shape; nodes=[]
    for i in range(n):
        for c in np.argsort(-L[i])[:topk]: nodes.append((i,c))
    N=len(nodes); u=np.exp(np.array([L[i,c] for i,c in nodes]))
    ti=np.array([n_[0] for n_ in nodes]); cj=np.array([n_[1] for n_ in nodes])
    dold=T[ti][:,None,:]-T[ti][None,:,:]; dnew=C[cj][:,None,:]-C[cj][None,:,:]
    A=np.exp(-np.linalg.norm(dold-dnew,axis=2)/tau)
    A[ti[:,None]==ti[None,:]]=0; A[cj[:,None]==cj[None,:]]=0
    v=u/np.linalg.norm(u)
    for _ in range(iters):
        v=u*0+ (A@v)*beta+ u; v/=np.linalg.norm(v)
    out=np.zeros(n,int)
    for i in range(n):
        idx=np.where(ti==i)[0]; out[i]=cj[idx[np.argmax(v[idx])]]
    return out
BETAS=[0,0.5,2,8]
res={m:collections.defaultdict(collections.Counter) for m in ['indep','graph','Similo']}
for k in range(K):
    test=[a for a in apps if fold[a]==k]; cal=[a for a in apps if fold[a]==(k+1)%K]; trn=[a for a in apps if a not in test and a not in cal]
    w=fit([g for a in trn for g in by[a]])
    LL=lambda a:np.array([np.log(softmax(ctx(g['X'])@w)+1e-12) for g in by[a]])
    sc={b:0 for b in BETAS}
    for a in cal:
        T,C=geo[a]; L=LL(a)
        if len(T)!=len(L) or C.shape[0]!=L.shape[1]: continue
        for b in BETAS: sc[b]+=sum(int(j==g['y']) for j,g in zip(spectral(L,T,C,b),by[a]))
    best=max(BETAS,key=lambda b:(sc[b],-b)); print('fold',k,'beta',best,flush=True)
    for a in test:
        T,C=geo[a]; L=LL(a)
        if len(T)!=len(L) or C.shape[0]!=L.shape[1]: continue
        for i,g in enumerate(by[a]): res['indep'][a]['c' if L[i].argmax()==g['y'] else 'w']+=1
        for j,g in zip(spectral(L,T,C,best),by[a]): res['graph'][a]['c' if j==g['y'] else 'w']+=1
used=[a for a in apps if res['graph'][a]]
for a in used: c,nf,wr=pub[a]['Similo']; res['Similo'][a]=collections.Counter({'c':c,'a':nf,'w':wr})
def tot(m,s):
    t=collections.Counter()
    for a in s: t.update(res[m][a])
    n=sum(t.values()); return t['c']/n
rnd=random.Random(5); boots=[[rnd.choice(used) for _ in used] for _ in range(2000)]
print('apps',len(used))
for m in ['Similo','indep','graph']: print(m,'C=%.1f'%(100*tot(m,used)))
for a,b in [('graph','Similo'),('graph','indep')]:
    d=np.array([tot(a,s)-tot(b,s) for s in boots]); print(a,'vs',b,'dC=%.1f [%.1f,%.1f]'%(100*d.mean(),*(100*np.percentile(d,[2.5,97.5]))))
