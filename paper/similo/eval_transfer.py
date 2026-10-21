import pickle, json, random, collections, numpy as np, sys
from sklearn.ensemble import HistGradientBoostingClassifier
exec(open('eval_similo.py').read().split("res=collections.defaultdict")[0])
# synthetic groups: my feature order [cls,idEq,idDice,aria,hrefEq,text,xpath,loc,size,role,nameEq,nameDice,section,ordinal,visible,testId,hasSdk,pcls,prev,next]
S=[]
for l in open('../results/feats.jsonl'):
    if not l.strip(): continue
    r=json.loads(l)
    if r['y']<0: continue
    X=np.array(r['X'],np.float32)/100; S.append(X)
random.seed(1); random.shuffle(S); S=S[:25000]
def syn_common(X): return X[:,[0,1,2,4,5,3,6,7,8]]      # cls,idEq,idDice,hrefEq,text,aria,xpath,loc,size
def sim_common(X): return X[:,[0,1,2,3,5,8,9,14,15]]     # same semantics from Similo-schema (text, nameAlt, xpath, loc, size)
def c2(X): return np.concatenate([X,X-X.max(0,keepdims=True),X-X.mean(0,keepdims=True)],1)
def rows(Xs,ys): 
    X=np.concatenate([c2(x) for x in Xs]); y=np.concatenate([(np.arange(len(x))==yy).astype(int) for x,yy in zip(Xs,ys)]); return X,y
# need synthetic labels: label index
Y=[]; S2=[]
for l in open('../results/feats.jsonl'):
    if not l.strip(): continue
    r=json.loads(l)
    if r['y']<0: continue
    S2.append(np.array(r['X'],np.float32)/100); Y.append(r['y'])
idx=list(range(len(S2))); random.Random(2).shuffle(idx); idx=idx[:25000]
SX=[syn_common(S2[i]) for i in idx]; SY=[Y[i] for i in idx]
res=collections.defaultdict(lambda: collections.defaultdict(collections.Counter))
for k in range(K):
    test=[a for a in apps if fold[a]==k]; trn=[a for a in apps if fold[a]!=k]
    TX=[sim_common(g['X']) for a in trn for g in by[a]]; TY=[g['y'] for a in trn for g in by[a]]
    for name,Xs,ys,wt in [('sim_only',TX,TY,1),('synth_plus_sim',SX+TX*3,SY+TY*3,1)]:
        X,y=rows(Xs,ys); clf=HistGradientBoostingClassifier(max_iter=250,learning_rate=0.08,max_leaf_nodes=31,l2_regularization=1.0,random_state=0).fit(X,y)
        for a in test:
            for g in by[a]:
                P=clf.predict_proba(c2(sim_common(g['X'])))[:,1]; res[name][a]['c' if np.argmax(P)==g['y'] else 'w']+=1
    print('fold',k,flush=True)
for a in apps: c,nf,w=pub[a]['Similo']; res['Similo'][a]=collections.Counter({'c':c,'a':nf,'w':w})
def tot(m,s=None):
    s=s or apps; t=collections.Counter()
    for a in s: t.update(res[m][a])
    n=sum(t.values()); return np.array([t['c']/n,t['w']/n])
rnd=random.Random(5); boots=[[rnd.choice(apps) for _ in apps] for _ in range(2000)]
for m in ['Similo','sim_only','synth_plus_sim']:
    t=tot(m); print(m,'C=%.1f W=%.1f'%(100*t[0],100*t[1]))
    if m!='Similo':
        d=np.array([tot(m,s)[0]-tot('Similo',s)[0] for s in boots]); print('  vs Similo dC=%.1f [%.1f,%.1f]'%(100*d.mean(),*(100*np.percentile(d,[2.5,97.5]))))
