import sys, os, re, glob, pickle, random, collections, numpy as np
from scipy.optimize import linear_sum_assignment
sys.path.insert(0,'.')
import sim_port as sp
from load_similo import props, feats
NEWROOT='../wb/apps_new'
# ---- feature builder identical to eval_sem
src=open('eval_sem.py').read(); exec(src.split("G=[]\nfor app in sorted")[0].split("import pickle")[1].join(["import pickle",""]) if False else "")
import zlib
def toks(s): return set(re.findall(r'[a-z]{2,}',(s or '').lower()))
def jac(a,b):
    a,b=toks(a),toks(b); return len(a&b)/len(a|b) if a|b else 0.0
def ncd(a,b):
    a,b=a.encode(),b.encode()
    if not a or not b: return 0.0
    ca,cb,cab=len(zlib.compress(a)),len(zlib.compress(b)),len(zlib.compress(a+b)); return 1-(cab-min(ca,cb))/max(ca,cb)
ATT=['tag','class','id','href','text','visible_text','name','alt','title','value','neighbor_text_above','neighbor_text_below','neighbor_text_left','neighbor_text_right']
def blob(d): return ' '.join(f"{k}:{d.get(k,'')}" for k in ATT if d.get(k))
def extra(T,C):
    nbT=' '.join(T.get('neighbor_text_'+s,'') for s in ('above','below','left','right')); nbC=' '.join(C.get('neighbor_text_'+s,'') for s in ('above','below','left','right'))
    return [ncd(blob(T),blob(C)), jac(T.get('class'),C.get('class')), jac(T.get('href'),C.get('href')), jac(T.get('text') or T.get('visible_text'),C.get('text') or C.get('visible_text')),
            jac(nbT,nbC), jac(T.get('title') or T.get('alt') or T.get('name') or T.get('value'),C.get('title') or C.get('alt') or C.get('name') or C.get('value')),
            ncd(T.get('visible_text','')+' '+T.get('text',''),C.get('visible_text','')+' '+C.get('text',''))]
def build(root):
    G=[]
    for app in sorted(os.listdir(root)):
        if not os.path.isdir(f'{root}/{app}/target_widgets'): continue
        tw={}
        for f in glob.glob(f'{root}/{app}/target_widgets/*.properties'): d=props(f); tw[d.get('xpath')]=d
        cands=[props(f) for f in sorted(glob.glob(f'{root}/{app}/candidate_widgets/*.properties'))]
        for f in sorted(glob.glob(f'{root}/{app}/[0-9]*.properties'),key=lambda x:int(re.findall(r'(\d+)\.properties',x)[0])):
            p=props(f); T=tw.get(p['old_xpath'])
            if T is None: continue
            rows=[];lab=-1
            for C in cands:
                if C.get('xpath')==p['new_xpath']: lab=len(rows)
                rows.append(feats(T,C)+extra(T,C))
            simp=[sp.score(sp.md(T),sp.md(C)) for C in cands]
            G.append(dict(app=app,X=np.array(rows,np.float32),y=lab,n=len(rows),sim=int(np.argmax(simp))))
    return G
Gn=build(NEWROOT); print('new groups',len(Gn),'apps',len({g['app'] for g in Gn}),flush=True)
Go=pickle.load(open('similo_feats2.pkl','rb'))
exec(open('eval_online.py').read().split("def run(")[0].split("def softmax")[1].join(["def softmax",""]) if False else "")
from scipy.optimize import minimize
def softmax(s): s=s-s.max(); e=np.exp(s); return e/e.sum()
def ctx(X): return np.concatenate([X,X-X.max(0,keepdims=True),X-X.mean(0,keepdims=True)],1)
def fit(groups,l2=1e-2):
    Xs=[ctx(g['X']) for g in groups]; ys=[g['y'] for g in groups]; nf=Xs[0].shape[1]
    def f(w):
        L=0;gr=np.zeros(nf)
        for X,y in zip(Xs,ys):
            p=softmax(X@w); L-=np.log(p[y]+1e-9); p[y]-=1; gr+=X.T@p
        return L/len(Xs)+l2*w@w, gr/len(Xs)+2*l2*w
    return minimize(f,np.zeros(nf),jac=True,method='L-BFGS-B',options={'maxiter':200}).x
w=fit([g for g in Go if g['y']>=0])
res=collections.defaultdict(lambda: collections.defaultdict(collections.Counter))
byapp=collections.defaultdict(list)
for g in Gn:
    if g['y']>=0: byapp[g['app']].append(g)
for a,gs in byapp.items():
    L=np.array([np.log(softmax(ctx(g['X'])@w)+1e-12) for g in gs]); n,m=L.shape
    J=L.argmax(1)
    if n<=m: r,c=linear_sum_assignment(-L); J2=np.zeros(n,int); J2[r]=c
    else: J2=J
    for i,g in enumerate(gs):
        res['Similo (validated port)'][a]['c' if g['sim']==g['y'] else 'w']+=1
        res['Ours indep'][a]['c' if J[i]==g['y'] else 'w']+=1
        res['Ours joint'][a]['c' if J2[i]==g['y'] else 'w']+=1
apps=sorted(byapp); rnd=random.Random(5); boots=[[rnd.choice(apps) for _ in apps] for _ in range(3000)]
def tot(m,s):
    t=collections.Counter()
    for a in s: t.update(res[m][a])
    return t['c']/sum(t.values())
print('targets',sum(len(v) for v in byapp.values()),'apps',len(apps))
for m in res:
    line=f"{m:26s} C={100*tot(m,apps):.1f}"
    if m!='Similo (validated port)':
        d=np.array([tot(m,s)-tot('Similo (validated port)',s) for s in boots]); line+=f"  vs Similo {100*d.mean():+.1f} [{100*np.percentile(d,2.5):.1f},{100*np.percentile(d,97.5):.1f}]"
    print(line)
