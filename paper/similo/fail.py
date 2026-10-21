import sys, collections, numpy as np
sys.path.insert(0,'.')
exec(open('eval_online.py').read().split("rnd=random.Random(9)")[0])
NM=["cls","idEq","idDice","hrefEq","hrefDice","text","vtext","vtextEq","nameAlt","xpath","idxEq","idxDice","tag","isBtn","loc","size","area","shape","nbA","nbB","nbL","nbR","nbAny"]
ix={n:i for i,n in enumerate(NM)}
cat=collections.Counter(); tot=0; ex=[]
for k in range(K):
    test=[a for a in apps if fold[a]==k]; trn=[a for a in apps if fold[a]!=k]; w=fit([g for a in trn for g in by[a]])
    for a in test:
        for g in by[a]:
            tot+=1; p=softmax(ctx(g['X'])@w); j=p.argmax()
            if j==g['y']: continue
            t=g['X'][g['y']]; q=g['X'][j]
            # how many candidates look identical to the truth on text AND tag (true duplicates)?
            dup=((np.abs(g['X'][:,ix['vtext']]-t[ix['vtext']])<1e-6)&(g['X'][:,ix['tag']]==t[ix['tag']])).sum()
            if t[ix['vtext']]<0.5 and t[ix['text']]<0.5: c='truth text changed/missing'
            elif dup>1 and t[ix['vtextEq']]==1: c='true duplicate text (ambiguous)'
            elif t[ix['loc']]<0.8: c='truth moved far (layout changed)'
            elif q[ix['vtext']]>t[ix['vtext']]+0.2: c='wrong pick has better text match'
            else: c='other'
            cat[c]+=1
n=sum(cat.values()); print('targets',tot,'errors',n,'(%.1f%%)'%(100*n/tot))
for c,v in cat.most_common(): print(f'  {c:36s} {v:3d} ({100*v/n:.0f}% of errors)')
