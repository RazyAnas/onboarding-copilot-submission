import sys, json, random, collections, numpy as np
sys.path.insert(0,'.')
import train_rank; train_rank.CTX=True
from train_rank import load, ctx
from sklearn.ensemble import HistGradientBoostingClassifier
G=load(); pages=sorted({g[0] for g in G}); random.seed(11); sh=pages[:]; random.shuffle(sh); K=4
fold={p:i%K for i,p in enumerate(sh)}
def rows(groups):
    X=[];y=[];idx=[]
    for gi,g in enumerate(groups):
        C=np.concatenate([g[7], g[7]-g[7].max(0,keepdims=True), g[7]-g[7].mean(0,keepdims=True)],1)
        for j in range(C.shape[0]): X.append(C[j]); y.append(1 if j==g[6] else 0); idx.append((gi,j))
    return np.array(X,np.float32),np.array(y),idx
by={p:[g for g in G if g[0]==p] for p in pages}
out=[]; DG=[None,0.02,0.05,0.1,0.2,0.3,0.5]
def predict_groups(clf,groups):
    X,y,idx=rows(groups); P=clf.predict_proba(X)[:,1]; res=collections.defaultdict(list)
    for (gi,j),p in zip(idx,P): res[gi].append(p)
    return [np.array(res[i]) for i in range(len(groups))]
def outcome(g,P,delta):
    o=np.argsort(-P); p1=P[o[0]]; p2=P[o[1]] if len(P)>1 else 0
    if delta is not None and p1-p2<delta*max(p1,1e-9): return 'a'
    return 'c' if int(o[0])==g[6] else 'w'
for k in range(K):
    test=[p for p in pages if fold[p]==k]; cal=[p for p in pages if fold[p]==(k+1)%K]; trn=[p for p in pages if p not in test and p not in cal]
    Gt=[g for p in trn for g in by[p] if g[6]>=0 or True]
    # subsample negatives implicitly handled by HGB; cap training groups for speed
    random.seed(k); Gt=random.sample(Gt,min(len(Gt),20000))
    X,y,_=rows(Gt); clf=HistGradientBoostingClassifier(max_iter=250,learning_rate=0.1,max_leaf_nodes=31,l2_regularization=1.0,random_state=0).fit(X,y)
    Gc=[g for p in cal for g in by[p] if g[1]=='redeploy' and g[2]>0]; Pc=predict_groups(clf,Gc)
    dsel=DG[-1]
    for d in DG:
        c=collections.Counter(outcome(g,P,d) for g,P in zip(Gc,Pc))
        if c['w']/sum(c.values())<=0.04: dsel=d; break
    Gtest=[g for p in test for g in by[p]]; Pt=predict_groups(clf,Gtest)
    for g,P in zip(Gtest,Pt):
        base=dict(p=g[0],op=g[1],rho=g[2],seed=g[3],t=g[4],d=g[5])
        out.append(base|dict(m='gbdt',o=outcome(g,P,None))); out.append(base|dict(m='gbdt_margin',o=outcome(g,P,dsel)))
    print('fold',k,'delta',dsel,flush=True)
open('../results/robustness_gbdt.jsonl','w').write('\n'.join(json.dumps(r) for r in out)+'\n')
