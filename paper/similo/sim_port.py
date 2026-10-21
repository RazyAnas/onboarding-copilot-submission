import os, re, glob, sys, random, collections, numpy as np, pickle
from rapidfuzz.distance import Levenshtein
sys.path.insert(0,'.')
from load_similo import props, ROOT
LOC=["tag","class","name","id","href","alt","xpath","idxpath","is_button","location","area","shape","visible_text","neighbor_text"]
W=[1.5,.5,1.5,1.5,.5,.5,.5,.5,.5,.5,.5,.5,1.5,1.5]; FN=[0,1,0,0,1,1,1,1,0,3,2,2,1,4]
def strip(s): return re.sub(r'[^A-Za-z0-9]','',s)
def md(d):
    m=dict(d); nt=' '.join(d.get('neighbor_text_'+s,'') for s in ('above','below','left','right')).strip()
    if nt: m['neighbor_text']=nt
    if 'x' in d and 'y' in d: m['location']='1'
    t=d.get('text')
    if t: m['visible_text']=t[:49] if len(t)>50 else t
    return m
def toint(s):
    try: return int(float(s))
    except: return 0
def strsim(a,b):
    if not a or not b: return 0.0
    if a==b: return 1.0
    if len(a)<len(b): a,b=b,a
    d=Levenshtein.distance(strip(a),strip(b)); return ((len(a)-d)*100//len(a))/100
def intsim(a,b):
    v1,v2=toint(a),toint(b); mx=max(v1,v2)
    return 0.0 if mx==0 else ((mx-abs(v1-v2))*100//mx)/100
def nbsim(a,b):
    if not a or not b: return 0.0
    w1,w2=a.split(),b.split(); wc=max(len(a)-len(w1)+1,len(b)-len(w2)+1); ex=sum(len(w) for w in w1 if w in w2)
    return min(ex*100//max(wc,1),100)/100
def score(T,C):
    s=0.0
    for k,w,f in zip(LOC,W,FN):
        tv,cv=T.get(k),C.get(k)
        if tv is None or cv is None: continue
        if f==1: sim=strsim(tv,cv)
        elif f==2: sim=intsim(tv,cv)
        elif f==3:
            dx=toint(T.get('x'))-toint(C.get('x')); dy=toint(T.get('y'))-toint(C.get('y')); sim=max(100-int((dx*dx+dy*dy)**.5),0)/100
        elif f==4: sim=nbsim(tv,cv)
        else: sim=1.0 if tv.lower()==cv.lower() else 0.0
        s+=sim*w
    return s
def run_app(root,app):
    tw={}
    for f in glob.glob(f'{root}/{app}/target_widgets/*.properties'): d=props(f); tw[d.get('xpath')]=md(d)
    cands=[md(props(f)) for f in sorted(glob.glob(f'{root}/{app}/candidate_widgets/*.properties'))]
    out=[]
    for f in sorted(glob.glob(f'{root}/{app}/[0-9]*.properties'),key=lambda x:int(re.findall(r'(\d+)\.properties',x)[0])):
        p=props(f); T=tw.get(p['old_xpath'])
        if T is None: continue
        sc=[score(T,C) for C in cands]; j=int(np.argmax(sc)); out.append(cands[j].get('xpath')==p['new_xpath'])
    return out
if __name__=='__main__':
    root=sys.argv[1]; tot=collections.Counter()
    for app in sorted(os.listdir(root)):
        if not os.path.isdir(f'{root}/{app}'): continue
        r=run_app(root,app); tot['c']+=sum(r); tot['n']+=len(r)
    print(root,'Similo port correct %.1f%% of %d'%(100*tot['c']/tot['n'],tot['n']))
