import sys, os, re, glob, pickle, zlib, random, collections, numpy as np
import scipy.sparse as sp_
sys.path.insert(0,'.')
from load_similo import props, ROOT
D=4096; MK=4096; TOPK=int(MK*0.06)
rng=np.random.RandomState(0)
M=sp_.random(MK,D,density=0.10,random_state=1,data_rvs=lambda n:np.ones(n),format='csr')     # sparse binary random projection (Kenyon-cell connectivity)
def toks(prefix,s):
    s=(s or '').lower(); out=[prefix+':'+w for w in re.findall(r'[a-z0-9]+',s)]
    s2=re.sub(r'[^a-z0-9]','',s); out+= [prefix+'#'+s2[i:i+3] for i in range(len(s2)-2)]
    return out
GROUPS={'all':['tag','class','id','href','text','visible_text','name','alt','title','value','neighbor_text_above','neighbor_text_below','neighbor_text_left','neighbor_text_right'],
        'text':['text','visible_text','name','alt','title','value'],'struct':['tag','class','id','href'],'nb':['neighbor_text_above','neighbor_text_below','neighbor_text_left','neighbor_text_right']}
def code(d,fields):
    x=np.zeros(D,np.float32)
    for f in fields:
        for t in toks(f if f.startswith('neighbor') is False else 'nb',d.get(f,'')): x[zlib.crc32(t.encode())%D]+=1
    if not x.any(): return None
    y=M@x; idx=np.argpartition(-y,TOPK)[:TOPK]; b=np.zeros(MK,bool); b[idx]=True      # winner-take-all
    return b
def flyfeats(T,C,cacheT,cacheC):
    f=[]
    for g in GROUPS:
        a,b=cacheT[g],cacheC[g]
        f.append(0.0 if a is None or b is None else (a&b).sum()/TOPK)
    return f
if __name__=='__main__':
    G=pickle.load(open('similo_feats2.pkl','rb')); out=[]; gi=0
    for app in sorted(os.listdir(ROOT)):
        tw={}
        for f in glob.glob(f'{ROOT}/{app}/target_widgets/*.properties'): d=props(f); tw[d.get('xpath')]=d
        cands=[props(f) for f in glob.glob(f'{ROOT}/{app}/candidate_widgets/*.properties')]
        cc=[{g:code(c,fl) for g,fl in GROUPS.items()} for c in cands]
        for f in sorted(glob.glob(f'{ROOT}/{app}/[0-9]*.properties'),key=lambda x:int(re.findall(r'(\d+)\.properties',x)[0])):
            p=props(f); T=tw.get(p['old_xpath'])
            if T is None: continue
            ct={g:code(T,fl) for g,fl in GROUPS.items()}
            ff=np.array([flyfeats(T,C,ct,cc[j]) for j,C in enumerate(cands)],np.float32)
            g=G[gi]; assert g['n']==len(cands) and g['app']==app
            out.append(dict(app=app,X=np.concatenate([g['X'],ff],1),y=g['y'],n=g['n'])); gi+=1
    pickle.dump(out,open('similo_feats3.pkl','wb')); print('built',len(out),'feature dim',out[0]['X'].shape[1])
