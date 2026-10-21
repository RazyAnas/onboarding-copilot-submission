import sys, os, re, glob, zlib, random, collections, numpy as np
sys.path.insert(0,'.')
from load_similo import props, feats, ROOT
exec(open('eval_online.py').read().split("rnd=random.Random(9)")[0].replace("G=pickle.load(open('similo_feats.pkl','rb'))","G=[]"))  if False else None
import pickle
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
    return [ncd(blob(T),blob(C)), jac(T.get('class'),C.get('class')), jac(T.get('href'),C.get('href')), jac(T.get('text') or T.get('visible_text'),C.get('text') or C.get('visible_text')),
            jac(' '.join(T.get('neighbor_text_'+s,'') for s in ('above','below','left','right')),' '.join(C.get('neighbor_text_'+s,'') for s in ('above','below','left','right'))),
            jac(T.get('title') or T.get('alt') or T.get('name') or T.get('value'),C.get('title') or C.get('alt') or C.get('name') or C.get('value')),
            ncd(T.get('visible_text','')+' '+T.get('text',''),C.get('visible_text','')+' '+C.get('text',''))]
G=[]
for app in sorted(os.listdir(ROOT)):
    tw={}
    for f in glob.glob(f'{ROOT}/{app}/target_widgets/*.properties'): d=props(f); tw[d.get('xpath')]=d
    cands=[props(f) for f in glob.glob(f'{ROOT}/{app}/candidate_widgets/*.properties')]
    for f in sorted(glob.glob(f'{ROOT}/{app}/[0-9]*.properties'),key=lambda x:int(re.findall(r'(\d+)\.properties',x)[0])):
        p=props(f); T=tw.get(p['old_xpath'])
        if T is None: continue
        rows=[]; lab=-1
        for C in cands:
            if C.get('xpath')==p['new_xpath']: lab=len(rows)
            rows.append(feats(T,C)+extra(T,C))
        G.append(dict(app=app,X=np.array(rows,np.float32),y=lab,n=len(rows)))
pickle.dump(G,open('similo_feats2.pkl','wb')); print('built',len(G),'x',G[0]['X'].shape[1],'feats',flush=True)
