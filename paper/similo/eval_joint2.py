import pickle, re, random, collections, numpy as np
from scipy.optimize import linear_sum_assignment
exec(open('eval_online2.py').read().split("rnd=random.Random(9)")[0])
res={m:collections.defaultdict(collections.Counter) for m in ['indep','joint','Similo']}
for k in range(K):
    test=[a for a in apps if fold[a]==k]; trn=[a for a in apps if fold[a]!=k]
    w=fit([g for a in trn for g in by[a]])
    for a in test:
        gs=by[a]; n=gs[0]['n']
        if any(g['n']!=n for g in gs): continue
        L=np.array([np.log(softmax(ctx(g['X'])@w)+1e-12) for g in gs])      # targets x candidates
        for i,g in enumerate(gs): res['indep'][a]['c' if L[i].argmax()==g['y'] else 'w']+=1
        r,c=linear_sum_assignment(-L)
        for i,j in zip(r,c): res['joint'][a]['c' if j==gs[i]['y'] else 'w']+=1
used=[a for a in apps if res['indep'][a]]
for a in used: c,nf,wr=pub[a]['Similo']; res['Similo'][a]=collections.Counter({'c':c,'a':nf,'w':wr})
def tot(m,s):
    t=collections.Counter()
    for a in s: t.update(res[m][a])
    n=sum(t.values()); return t['c']/n
rnd=random.Random(5); boots=[[rnd.choice(used) for _ in used] for _ in range(2000)]
print('apps',len(used))
for m in ['Similo','indep','joint']: print(m,'C=%.1f'%(100*tot(m,used)))
for a,b in [('joint','Similo'),('joint','indep')]:
    d=np.array([tot(a,s)-tot(b,s) for s in boots]); print(a,'vs',b,'dC=%.1f [%.1f,%.1f]'%(100*d.mean(),*(100*np.percentile(d,[2.5,97.5]))))
