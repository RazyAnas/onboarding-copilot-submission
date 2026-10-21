import pickle, re, random, collections, glob, numpy as np, sys
sys.path.insert(0,'.')
exec(open('eval_online.py').read().split("rnd=random.Random(9)")[0])
from load_similo import props, ROOT
geo={}
for app in apps:
    tw={}
    for f in glob.glob(f'{ROOT}/{app}/target_widgets/*.properties'):
        d=props(f); tw[d.get('xpath')]=d
    cands=[props(f) for f in glob.glob(f'{ROOT}/{app}/candidate_widgets/*.properties')]
    C=np.array([[float(c.get('x',0)),float(c.get('y',0))] for c in cands]); T=[]
    for f in sorted(glob.glob(f'{ROOT}/{app}/[0-9]*.properties'),key=lambda x:int(re.findall(r'(\d+)\.properties',x)[0])):
        p=props(f)
        if p['old_xpath'] in tw: t=tw[p['old_xpath']]; T.append([float(t.get('x',0)),float(t.get('y',0))])
    geo[app]=(np.array(T),C)
def rerank(L,T,C,lam,thr=0.8):
    P=np.exp(L); top=P.argmax(1); conf=P.max(1)>thr
    if conf.sum()<2: return L.argmax(1)
    off=np.median(C[top[conf]]-T[conf],axis=0)       # robust (RANSAC-like) global shift
    D=np.linalg.norm(C[None,:,:]-(T[:,None,:]+off[None,None,:]),axis=2)
    return (L-lam*D/200.0).argmax(1)
LAMS=[0,0.25,0.5,1,2,4]
res={m:collections.defaultdict(collections.Counter) for m in ['indep','geo','Similo']}
for k in range(K):
    test=[a for a in apps if fold[a]==k]; cal=[a for a in apps if fold[a]==(k+1)%K]; trn=[a for a in apps if a not in test and a not in cal]
    w=fit([g for a in trn for g in by[a]])
    def LL(a): return np.array([np.log(softmax(ctx(g['X'])@w)+1e-12) for g in by[a]])
    sc={lam:0 for lam in LAMS}
    for a in cal:
        T,C=geo[a]; L=LL(a)
        if len(T)!=len(L) or C.shape[0]!=L.shape[1]: continue
        for lam in LAMS: sc[lam]+=sum(int(j==g['y']) for j,g in zip(rerank(L,T,C,lam),by[a]))
    best=max(LAMS,key=lambda l:(sc[l],-l)); print('fold',k,'lambda',best,flush=True)
    for a in test:
        T,C=geo[a]; L=LL(a)
        if len(T)!=len(L) or C.shape[0]!=L.shape[1]: continue
        for i,g in enumerate(by[a]): res['indep'][a]['c' if L[i].argmax()==g['y'] else 'w']+=1
        for j,g in zip(rerank(L,T,C,best),by[a]): res['geo'][a]['c' if j==g['y'] else 'w']+=1
used=[a for a in apps if res['geo'][a]]
for a in used: c,nf,wr=pub[a]['Similo']; res['Similo'][a]=collections.Counter({'c':c,'a':nf,'w':wr})
def tot(m,s):
    t=collections.Counter()
    for a in s: t.update(res[m][a])
    n=sum(t.values()); return t['c']/n
rnd=random.Random(5); boots=[[rnd.choice(used) for _ in used] for _ in range(2000)]
print('apps',len(used))
for m in ['Similo','indep','geo']: print(m,'C=%.1f'%(100*tot(m,used)))
for a,b in [('geo','Similo'),('geo','indep')]:
    d=np.array([tot(a,s)-tot(b,s) for s in boots]); print(a,'vs',b,'dC=%.1f [%.1f,%.1f]'%(100*d.mean(),*(100*np.percentile(d,[2.5,97.5]))))
