import pickle, re, random, json, collections, numpy as np, sys
from sklearn.ensemble import HistGradientBoostingClassifier
G=pickle.load(open('similo_feats.pkl','rb')); apps=sorted({g['app'] for g in G})
def ctx(X): return np.concatenate([X,X-X.max(0,keepdims=True),X-X.mean(0,keepdims=True)],1)
# published per-app results (authors' replication package), restricted to our apps
pub=collections.defaultdict(dict); cur=None
for l in open('/private/tmp/claude-501/-Users-mariyafatima-projectonboard/65754c46-9609-498c-a652-1939a978aaa9/scratchpad/sim/Similo2/WidgetLocator/FinalResultsTable.txt'):
    m=re.match(r'##### Application: (\w+)',l)
    if m: cur=m.group(1); continue
    m=re.match(r'(\w+):\s+(\d+)\s+(\d+)\s+(\d+)',l)
    if m and cur: pub[cur][m.group(1)]=tuple(int(m.group(i)) for i in (2,3,4))
tn=collections.Counter(g['app'] for g in G)
def per_app_pub(meth): return {a:pub[a][meth] for a in apps if a in pub}
random.seed(3); sh=apps[:]; random.shuffle(sh); K=5; fold={a:i%K for i,a in enumerate(sh)}
by={a:[g for g in G if g['app']==a] for a in apps}
def rows(groups):
    X=np.concatenate([ctx(g['X']) for g in groups]); y=np.concatenate([(np.arange(g['n'])==g['y']).astype(int) for g in groups]); return X,y
def probs(clf,groups):
    out=[]
    for g in groups: out.append(clf.predict_proba(ctx(g['X']))[:,1])
    return out
def decide(g,P,delta,tau=None):
    o=np.argsort(-P); p1,p2=P[o[0]],(P[o[1]] if len(P)>1 else 0)
    if (delta is not None and p1-p2<delta*max(p1,1e-9)) or (tau is not None and p1<tau): return 'a'
    return 'c' if o[0]==g['y'] else 'w'
res=collections.defaultdict(lambda: collections.defaultdict(collections.Counter)); DG=[None,0.05,0.1,0.2,0.3,0.5,0.7]
for k in range(K):
    test=[a for a in apps if fold[a]==k]; cal=[a for a in apps if fold[a]==(k+1)%K]; trn=[a for a in apps if a not in test and a not in cal]
    X,y=rows([g for a in trn for g in by[a]])
    clf=HistGradientBoostingClassifier(max_iter=250,learning_rate=0.1,max_leaf_nodes=31,l2_regularization=1.0,random_state=0).fit(X,y)
    Gc=[g for a in cal for g in by[a]]; Pc=probs(clf,Gc); dsel=DG[-1]
    for d in DG:
        c=collections.Counter(decide(g,P,d) for g,P in zip(Gc,Pc))
        if c['w']/sum(c.values())<=0.03: dsel=d; break
    for a in test:
        Gs=by[a]; Ps=probs(clf,Gs)
        for g,P in zip(Gs,Ps):
            res['ours_v3'][a][decide(g,P,None)]+=1; res['ours_v3_margin'][a][decide(g,P,dsel)]+=1
    print('fold',k,'delta',dsel,flush=True)
PUBN={'xpath':'XPath','idxpath':'IdXPath','ide':'Selenium IDE','robula':'ROBULA+','montoto':'Montoto','Multilocator':'Multilocator','Similo':'Similo (original code)'}
for m in PUBN:
    for a in apps:
        c,nf,w=pub[a][m]; res[m][a]=collections.Counter({'c':c,'a':nf,'w':w})
def tot(m,sample=None):
    sample=sample or apps; t=collections.Counter()
    for a in sample:
        t.update(res[m][a])
    n=sum(t.values()); return np.array([t['c']/n,t['w']/n,t['a']/n])
rnd=random.Random(5); boots=[[rnd.choice(apps) for _ in apps] for _ in range(2000)]
def ci(m): arr=np.array([tot(m,s) for s in boots]); return np.percentile(arr,[2.5,97.5],axis=0)
def pci(m1,m2): d=np.array([tot(m1,s)-tot(m2,s) for s in boots]); return d.mean(0),np.percentile(d,[2.5,97.5],axis=0)
out={}; print('targets',sum(sum(res['Similo'][a].values()) for a in apps),'apps',len(apps))
for m in list(PUBN)+['ours_v3','ours_v3_margin']:
    t=tot(m); c=ci(m); out[m]={'c':t[0],'w':t[1],'a':t[2],'c_ci':[c[0][0],c[1][0]],'w_ci':[c[0][1],c[1][1]]}
    print(f"{PUBN.get(m,m):24s} C={100*t[0]:.1f} [{100*c[0][0]:.1f},{100*c[1][0]:.1f}]  W={100*t[1]:.1f} [{100*c[0][1]:.1f},{100*c[1][1]:.1f}]  A={100*t[2]:.1f}")
pair={}
for m in ['Similo','Multilocator','robula']:
    for o in ['ours_v3','ours_v3_margin']:
        mean,c=pci(o,m); pair[f'{o}_vs_{m}']={'dc':[mean[0],c[0][0],c[1][0]],'dw':[mean[1],c[0][1],c[1][1]]}
        print(o,'vs',m,'dC=%.1f [%.1f,%.1f]  dW=%.1f [%.1f,%.1f]'%(100*mean[0],100*c[0][0],100*c[1][0],100*mean[1],100*c[0][1],100*c[1][1]))
json.dump({'res':out,'pair':pair,'apps':len(apps),'targets':len(G)},open('similo_results.json','w'),indent=1)
