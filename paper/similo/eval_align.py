import pickle, re, random, collections, glob, os, numpy as np
from scipy.optimize import linear_sum_assignment
exec(open('eval_online.py').read().split("rnd=random.Random(9)")[0])
import sys; sys.path.insert(0,'.')
from load_similo import props, ROOT
def key(x): return tuple(int(i) for i in re.findall(r'\[(\d+)\]',x or ''))
# rebuild order info parallel to G
meta={}
for app in apps:
    tw={}
    for f in glob.glob(f'{ROOT}/{app}/target_widgets/*.properties'):
        d=props(f); tw[d.get('xpath')]=d
    cands=[props(f) for f in glob.glob(f'{ROOT}/{app}/candidate_widgets/*.properties')]
    olds=[]
    for f in sorted(glob.glob(f'{ROOT}/{app}/[0-9]*.properties'),key=lambda x:int(re.findall(r'(\d+)\.properties',x)[0])):
        p=props(f)
        if p['old_xpath'] in tw: olds.append(p['old_xpath'])
    meta[app]=([key(c.get('xpath')) for c in cands],[key(o) for o in olds])
def align(L,tk,ck):
    n,m=L.shape; ti=sorted(range(n),key=lambda i:tk[i]); cj=sorted(range(m),key=lambda j:ck[j])
    S=L[np.ix_(ti,cj)]; NEG=-1e18
    D=np.full((n+1,m+1),0.0); B=np.zeros((n+1,m+1),int)   # D[i,j]: best using first i targets, first j cands
    for i in range(1,n+1):
        D[i,0]=NEG
        for j in range(1,m+1):
            a=D[i-1,j-1]+S[i-1,j-1]; b=D[i,j-1]
            if a>=b: D[i,j]=a; B[i,j]=1
            else: D[i,j]=b
    i,j=n,m; out={}
    while i>0 and j>0:
        if B[i,j]==1: out[ti[i-1]]=cj[j-1]; i-=1; j-=1
        else: j-=1
    return out
res={m:collections.defaultdict(collections.Counter) for m in ['indep','joint','align','Similo']}
for k in range(K):
    test=[a for a in apps if fold[a]==k]; trn=[a for a in apps if fold[a]!=k]
    w=fit([g for a in trn for g in by[a]])
    for a in test:
        gs=by[a]; n=gs[0]['n']; ck,tk=meta[a]
        if any(g['n']!=n for g in gs) or len(ck)!=n or len(tk)!=len(gs) or len(gs)>n: continue
        L=np.array([np.log(softmax(ctx(g['X'])@w)+1e-12) for g in gs])
        for i,g in enumerate(gs): res['indep'][a]['c' if L[i].argmax()==g['y'] else 'w']+=1
        r,c=linear_sum_assignment(-L)
        for i,j in zip(r,c): res['joint'][a]['c' if j==gs[i]['y'] else 'w']+=1
        al=align(L,tk,ck)
        for i,g in enumerate(gs): res['align'][a]['c' if al.get(i,-1)==g['y'] else 'w']+=1
used=[a for a in apps if res['align'][a]]
for a in used: c,nf,wr=pub[a]['Similo']; res['Similo'][a]=collections.Counter({'c':c,'a':nf,'w':wr})
def tot(m,s):
    t=collections.Counter()
    for a in s: t.update(res[m][a])
    n=sum(t.values()); return t['c']/n
rnd=random.Random(5); boots=[[rnd.choice(used) for _ in used] for _ in range(2000)]
print('apps',len(used))
for m in ['Similo','indep','joint','align']: print(m,'C=%.1f'%(100*tot(m,used)))
for a,b in [('align','Similo'),('align','indep'),('align','joint')]:
    d=np.array([tot(a,s)-tot(b,s) for s in boots]); print(a,'vs',b,'dC=%.1f [%.1f,%.1f]'%(100*d.mean(),*(100*np.percentile(d,[2.5,97.5]))))
