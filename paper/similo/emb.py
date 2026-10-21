import sys, os, re, glob, pickle, numpy as np
sys.path.insert(0,'.')
from load_similo import props, ROOT
from sentence_transformers import SentenceTransformer
m=SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')
FIELDS={'text':lambda d:(d.get('visible_text') or d.get('text') or ''),'label':lambda d:' '.join(d.get(k,'') for k in ('name','alt','title','value','placeholder')).strip(),
        'nb':lambda d:' '.join(d.get('neighbor_text_'+s,'') for s in ('above','below','left','right')).strip(),
        'all':lambda d:' | '.join(d.get(k,'') for k in ('tag','class','href','text','name','alt','title','neighbor_text_above','neighbor_text_below') if d.get(k))}
apps=[a for a in sorted(os.listdir(ROOT))]
items={}
data={}
for app in apps:
    tw={}
    for f in glob.glob(f'{ROOT}/{app}/target_widgets/*.properties'): d=props(f); tw[d.get('xpath')]=d
    cands=[props(f) for f in glob.glob(f'{ROOT}/{app}/candidate_widgets/*.properties')]
    ts=[]
    for f in sorted(glob.glob(f'{ROOT}/{app}/[0-9]*.properties'),key=lambda x:int(re.findall(r'(\d+)\.properties',x)[0])):
        p=props(f); T=tw.get(p['old_xpath'])
        if T is not None: ts.append(T)
    data[app]=(ts,cands)
    for d in ts+cands:
        for fn in FIELDS.values():
            s=fn(d)[:200]
            if s: items[s]=None
strs=list(items); print('unique strings',len(strs),flush=True)
E=m.encode(strs,batch_size=128,normalize_embeddings=True,show_progress_bar=False); idx={s:i for i,s in enumerate(strs)}
G=pickle.load(open('similo_feats3.pkl','rb')); out=[]; gi=0
for app in apps:
    ts,cands=data[app]
    def emb(d,fn):
        s=fn(d)[:200]; return E[idx[s]] if s else None
    cE={k:[emb(c,fn) for c in cands] for k,fn in FIELDS.items()}
    for T in ts:
        tE={k:emb(T,fn) for k,fn in FIELDS.items()}
        ff=np.zeros((len(cands),4),np.float32)
        for j in range(len(cands)):
            for q,k in enumerate(FIELDS):
                a,b=tE[k],cE[k][j]
                ff[j,q]=0.0 if a is None or b is None else float(a@b)
        g=G[gi]; assert g['app']==app and g['n']==len(cands); out.append(dict(app=app,X=np.concatenate([g['X'],ff],1),y=g['y'],n=g['n'])); gi+=1
pickle.dump(out,open('similo_feats4.pkl','wb')); print('built',len(out),out[0]['X'].shape[1])
