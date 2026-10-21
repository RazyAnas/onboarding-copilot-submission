import json, os, re, glob, shutil, collections
RAW='raw'; OUT='apps_new'
def normhref(h):
    h=re.sub(r'^(https?:)?//web\.archive\.org/web/\d+[a-z_]*/','',h or ''); h=re.sub(r'^/web/\d+[a-z_]*/','',h)
    h=re.sub(r'^https?://(www\.)?','',h).rstrip('/'); return h
def clean(e,mask):
    d=dict(e); d['href']=normhref(d['href'])
    if mask=='id': d['id']=''; d['idxpath']=d['xpath']
    if mask=='href': d['href']=''
    return d
def write_props(path,d):
    with open(path,'w') as f:
        for k,v in d.items():
            if v not in ('',None): f.write(f"{k}={str(v).replace(chr(10),' ')}\n")
shutil.rmtree(OUT,ignore_errors=True); os.makedirs(OUT)
stats=[]
sites=sorted({os.path.basename(f).rsplit('_',1)[0] for f in glob.glob(RAW+'/*_old.json')})
for s in sites:
    if not (os.path.exists(f'{RAW}/{s}_new.json')): continue
    old=json.load(open(f'{RAW}/{s}_old.json'))['els']; new=json.load(open(f'{RAW}/{s}_new.json'))['els']
    if len(old)<10 or len(new)<10: continue
    for mask,keyf in (('id',lambda e:e['id']),('href',lambda e:normhref(e['href']))):
        ko=collections.defaultdict(list); kn=collections.defaultdict(list)
        for e in old:
            k=keyf(e)
            if k and not (mask=='href' and (k.startswith('#') or k.startswith('javascript'))): ko[(e['tag'],k)].append(e)
        for e in new:
            k=keyf(e)
            if k: kn[(e['tag'],k)].append(e)
        pairs=[(ko[k][0],kn[k][0]) for k in ko if len(ko[k])==1 and len(kn.get(k,[]))==1 and ko[k][0]['xpath']!=kn[k][0]['xpath']]
        # drop trivial targets whose xpath is unchanged AND key present (still keep, but cap) ; keep all
        if len(pairs)<4: continue
        app=f'{s.replace(".","_")}_{mask}'; d=f'{OUT}/{app}'; os.makedirs(d+'/target_widgets'); os.makedirs(d+'/candidate_widgets')
        for i,e in enumerate(new): write_props(f'{d}/candidate_widgets/{i}.properties',clean(e,mask))
        # candidates: all new elements (masked)
        for i,(o,n) in enumerate(pairs[:40]):
            co=clean(o,mask); co['widget_id']=i; write_props(f'{d}/target_widgets/{i}.properties',co)
            open(f'{d}/{i}.properties','w').write(f"old_xpath={o['xpath']}\nnew_xpath={n['xpath']}\n")
        stats.append((app,min(len(pairs),40),len(new)))
print(len(stats),'apps',sum(x[1] for x in stats),'targets'); print(stats)
