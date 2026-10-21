import glob, os, re, json, pickle, numpy as np, collections
ROOT='/private/tmp/claude-501/-Users-mariyafatima-projectonboard/65754c46-9609-498c-a652-1939a978aaa9/scratchpad/sim/Similo2/WidgetLocator/apps'
def props(f):
    d={}
    for l in open(f,errors='ignore'):
        l=l.rstrip('\n')
        if '=' in l: k,v=l.split('=',1); d[k]=v
    return d
def bigr(s):
    s=(s or '').lower().strip(); return collections.Counter(s[i:i+2] for i in range(len(s)-1)), max(0,len(s)-1)
def dice(a,b):
    if not a and not b: return 0.0   # missing both -> no evidence
    if a==b: return 1.0
    (m1,n1),(m2,n2)=bigr(a),bigr(b)
    if n1+n2==0: return 0.0
    return 2*sum(min(c,m2.get(g,0)) for g,c in m1.items())/(n1+n2)
def num(d,k,default=0.0):
    try: return float(d.get(k,default))
    except: return default
def feats(T,C):
    tx,ty,tw,th=num(T,'x'),num(T,'y'),num(T,'width'),num(T,'height'); cx,cy,cw,ch=num(C,'x'),num(C,'y'),num(C,'width'),num(C,'height')
    nb=lambda d:[d.get('neighbor_text_'+s,'') for s in ('above','below','left','right')]
    tn,cn=nb(T),nb(C)
    f=[dice(T.get('class'),C.get('class')),
       1.0 if T.get('id') and T.get('id')==C.get('id') else 0.0, dice(T.get('id'),C.get('id')),
       1.0 if T.get('href') and T.get('href')==C.get('href') else 0.0, dice(T.get('href'),C.get('href')),
       dice(T.get('text'),C.get('text')), dice(T.get('visible_text'),C.get('visible_text')), 1.0 if T.get('visible_text') and T.get('visible_text')==C.get('visible_text') else 0.0,
       dice(T.get('name') or T.get('alt') or T.get('title') or T.get('value'),C.get('name') or C.get('alt') or C.get('title') or C.get('value')),
       dice(T.get('xpath'),C.get('xpath')), 1.0 if T.get('idxpath') and T.get('idxpath')==C.get('idxpath') else 0.0, dice(T.get('idxpath'),C.get('idxpath')),
       1.0 if T.get('tag')==C.get('tag') else 0.0, 1.0 if T.get('is_button')==C.get('is_button') else 0.0,
       max(0,1-np.hypot(tx-cx,ty-cy)/800), max(0,1-(abs(tw-cw)+abs(th-ch))/max(1,tw+th)), min(num(T,'area'),num(C,'area'))/max(1,max(num(T,'area'),num(C,'area'))),
       1-min(1,abs(num(T,'shape')-num(C,'shape'))/max(1,num(T,'shape'))),
       *[dice(a,b) for a,b in zip(tn,cn)], max(dice(a,b) for a in tn for b in cn)]
    return f
NAMES=["cls","idEq","idDice","hrefEq","hrefDice","text","vtext","vtextEq","nameAlt","xpath","idxEq","idxDice","tag","isBtn","loc","size","area","shape","nbA","nbB","nbL","nbR","nbAny"]
if __name__=='__main__':
    G=[]
    for app in sorted(os.listdir(ROOT)):
        tw={}
        for f in glob.glob(f'{ROOT}/{app}/target_widgets/*.properties'):
            d=props(f); tw[d.get('xpath')]=d
        cands=[props(f) for f in glob.glob(f'{ROOT}/{app}/candidate_widgets/*.properties')]
        for f in sorted(glob.glob(f'{ROOT}/{app}/*.properties'),key=lambda x:int(re.findall(r'(\d+)\.properties',x)[0])):
            p=props(f); T=tw.get(p['old_xpath'])
            if T is None: continue
            rows=[]; lab=-1
            for C in cands:
                if C.get('xpath')==p['new_xpath']: lab=len(rows)
                rows.append(feats(T,C))
            X=np.array(rows,np.float32)
            G.append(dict(app=app,X=X,y=lab,n=len(rows)))
    print(len(G),'targets;',sum(g['y']>=0 for g in G),'with truth in candidates;',len({g['app'] for g in G}),'apps; mean cands',np.mean([g['n'] for g in G]))
    pickle.dump(G,open('similo_feats.pkl','wb'))
