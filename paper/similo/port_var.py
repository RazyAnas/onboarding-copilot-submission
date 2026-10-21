import sys, os, re, glob, collections, numpy as np
sys.path.insert(0,'.')
import sim_port as sp
from sim_port import *
ROOTD='/private/tmp/claude-501/-Users-mariyafatima-projectonboard/65754c46-9609-498c-a652-1939a978aaa9/scratchpad/sim/Similo2/WidgetLocator/apps'
apps=[a for a in sorted(os.listdir(ROOTD)) if os.path.isdir(f'{ROOTD}/{a}/target_widgets')][:14]
def prep(app):
    tw={}
    for f in glob.glob(f'{ROOTD}/{app}/target_widgets/*.properties'): d=props(f); tw[d.get('xpath')]=d
    cands=[props(f) for f in sorted(glob.glob(f'{ROOTD}/{app}/candidate_widgets/*.properties'))]
    items=[]
    for f in sorted(glob.glob(f'{ROOTD}/{app}/[0-9]*.properties')):
        p=props(f)
        if p['old_xpath'] in tw: items.append((tw[p['old_xpath']],p['new_xpath']))
    return cands,items
data={a:prep(a) for a in apps}
def mdv(d,v):
    m=dict(d)
    if v!='noNB':
        nt=' '.join(d.get('neighbor_text_'+s,'') for s in ('above','below','left','right')).strip()
        if nt: m['neighbor_text']=nt
    if 'x' in d and 'y' in d and v!='noLoc': m['location']='1'
    if v=='vt_from_text' and d.get('text'): m['visible_text']=d['text']
    if v=='noIdx': m.pop('idxpath',None)
    if v=='noXp': m.pop('xpath',None); 
    return m
for v in ['base','noNB','noLoc','noIdx','vt_from_text']:
    c=n=0
    for a in apps:
        cands,items=data[a]; C=[mdv(x,v) for x in cands]
        for T,newx in items:
            T=mdv(T,v); sc=[score(T,x) for x in C]; j=int(np.argmax(sc)); c+= cands[j].get('xpath')==newx; n+=1
    print(v,'%.1f%% of %d'%(100*c/n,n),flush=True)
