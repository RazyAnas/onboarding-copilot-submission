import sys, json, collections, random
sys.path.insert(0,'.')
from load import *
rows=load()+load('../results/robustness_learned.jsonl')
for _r in load('../results/robustness_gbdt.jsonl'): rows.append(_r)
for _r in load('../results/robustness_learned_ctx.jsonl'):
    _r['m']=_r['m'].replace('learned','learnedctx'); rows.append(_r)
LEARNED_PAGES={r['p'] for r in rows if r['m']=='learned'}
rows=[r for r in rows if r['p'] in LEARNED_PAGES]
pages=sorted({r['p'] for r in rows})
random.seed(7); sh=pages[:]; random.shuffle(sh)
fold={p:i%2 for i,p in enumerate(sh)}
TAU=0.6
DGRID=[None,0.01,0.02,0.03,0.05,0.08,0.1,0.15,0.2,0.3]
def acted_outcome(r,tau,delta): return outcome(r,tau=tau,delta=delta)
# --- cross-fitted delta: smallest delta with W<=5% on calibration pages, redeploy rho>0 rows, method o_D
def pick_delta(cal_pages, target=0.05, meth='o_D'):
    sub=[r for r in rows if r['m']==meth and r['op']=='redeploy' and r['rho']>0 and r['p'] in cal_pages]
    for d in [0.0]+DGRID[1:]:
        c=collections.Counter(outcome(r,tau=(TAU if meth=='o_D' else None),delta=(d if d>0 else None)) for r in sub)
        if c['w']/len(sub)<=target: return d
    return DGRID[-1]
delta_sim={}
delta_of={}
for f in (0,1):
    cal={p for p in pages if fold[p]!=f}
    delta_of[f]=pick_delta(cal)
    delta_sim[f]=pick_delta(cal,meth='similo')
print('cross-fit deltas',delta_of, 'folds',{f:[p for p in pages if fold[p]==f] for f in (0,1)})
# --- build per-row final outcome table with method labels
LAB={'gbdt':'gbdt','gbdt_margin':'gbdt_margin','learnedctx':'learnedctx','learnedctx_margin':'learnedctx_margin','learned':'learned','learned_margin':'learned_margin','similo':'similo','css':'css','xpath':'xpath','text':'text','chain':'chain','rolename':'rolename','rolename_strict':'rolename_strict','oursC':'oursC'}
recs=[]  # (page,op,rho,method,outcome,dup)
for r in rows:
    m=r['m']
    if m in LAB and m!='similo': recs.append((r['p'],r['op'],r['rho'],m,r['o'],r['d']))
    elif m=='similo':
        recs.append((r['p'],r['op'],r['rho'],'similo',r['o'],r['d']))
        recs.append((r['p'],r['op'],r['rho'],'similo_margin',outcome(r,delta=delta_sim[fold[r['p']]] or None),r['d']))
    elif m=='o_D':
        recs.append((r['p'],r['op'],r['rho'],'ours',outcome(r,tau=TAU),r['d']))
        recs.append((r['p'],r['op'],r['rho'],'ours_margin',outcome(r,tau=TAU,delta=delta_of[fold[r['p']]] or None),r['d']))
        recs.append((r['p'],r['op'],r['rho'],'ours_tau04',outcome(r,tau=0.4),r['d']))
    elif m.startswith('o_D_'):
        recs.append((r['p'],r['op'],r['rho'],'abl_'+m[4:],outcome(r,tau=TAU),r['d']))
# aggregate per (page,op,rho,method)
agg=collections.defaultdict(lambda:[0,0,0,0])
for p,op,rho,m,o,d in recs:
    a=agg[(p,op,rho,m)]; a[{'c':0,'w':1,'a':2}[o]]+=1; a[3]+=1
def rate(keys, pages_sample):
    tot=[0,0,0,0]
    for p in pages_sample:
        for k in keys:
            a=agg.get((p,)+k)
            if a:
                for i in range(4): tot[i]+=a[i]
    n=tot[3]; return [tot[0]/n,tot[1]/n,tot[2]/n] if n else [0,0,0]
def boot(keys,B=1000,seed=1):
    rnd=random.Random(seed); out=[]
    for _ in range(B):
        s=[rnd.choice(pages) for _ in pages]; out.append(rate(keys,s))
    arr=np.array(out); return np.percentile(arr,[2.5,97.5],axis=0)
methods=sorted({k[3] for k in agg})
ops=sorted({k[1] for k in agg}); 
res={}
for op in ops:
    rhos=sorted({k[2] for k in agg if k[1]==op})
    for rho in rhos:
        for m in methods:
            keys=[(op,rho,m)]
            if not any((p,op,rho,m) in agg for p in pages): continue
            pt=rate(keys,pages)
            ci=boot(keys,B=400)
            res[f"{op}|{rho}|{m}"]={'c':pt[0],'w':pt[1],'a':pt[2],'c_ci':[ci[0][0],ci[1][0]],'w_ci':[ci[0][1],ci[1][1]],'a_ci':[ci[0][2],ci[1][2]]}
# pooled "any redeploy rho in {0.5,1}" headline & paired diffs
def pooled(m,opsel=('redeploy',),rhos=(0.5,1.0)):
    keys=[(o,r,m) for o in opsel for r in rhos]; return rate(keys,pages), boot(keys,B=600)
head={}
for m in methods:
    pt,ci=pooled(m); head[m]={'c':pt[0],'w':pt[1],'a':pt[2],'c_ci':[ci[0][0],ci[1][0]],'w_ci':[ci[0][1],ci[1][1]]}
# paired difference ours - best baseline (rolename) correct and wrong
def paired(m1,m2,B=1000):
    rnd=random.Random(3); ds=[];dw=[]
    for _ in range(B):
        s=[rnd.choice(pages) for _ in pages]
        k1=[('redeploy',r,m1) for r in (0.5,1.0)]; k2=[('redeploy',r,m2) for r in (0.5,1.0)]
        a=rate(k1,s); b=rate(k2,s); ds.append(a[0]-b[0]); dw.append(a[1]-b[1])
    return {'dc':[float(np.mean(ds)),float(np.percentile(ds,2.5)),float(np.percentile(ds,97.5))],'dw':[float(np.mean(dw)),float(np.percentile(dw,2.5)),float(np.percentile(dw,97.5))]}
pair={f"ours_vs_{b}":paired('ours',b) for b in ['rolename','text','chain','css','xpath','rolename_strict','similo','ours']}
pair.update({f'learned_vs_{b}':paired('learned',b) for b in ['similo','rolename','ours','similo_margin']})
pair.update({f'lctx_vs_{b}':paired('learnedctx',b) for b in ['similo','learned','similo_margin']})
pair.update({f'gb_vs_{b}':paired('gbdt',b) for b in ['similo','learnedctx','similo_margin','ours']})
pair['lctxm_vs_similo']=paired('learnedctx_margin','similo')
pair['lctxm_vs_simm']=paired('learnedctx_margin','similo_margin')
pair['learnedm_vs_similo']=paired('learned_margin','similo')
pair['learnedm_vs_simm']=paired('learned_margin','similo_margin')
pair.update({f"ours_margin_vs_{b}":paired('ours_margin',b) for b in ['rolename','text','chain','rolename_strict','css','similo','similo_margin']})
pair['simmargin_vs_ours_margin']=paired('similo_margin','ours_margin')
pair['simmargin_vs_strict']=paired('similo_margin','rolename_strict')
pair['simmargin_vs_similo']=paired('similo_margin','similo')
# per-page redeploy rho=0.5
perpage={p:{m:rate([('redeploy',0.5,m)],[p]) for m in methods if (p,'redeploy',0.5,m) in agg} for p in pages}
# risk-coverage frontier for o_D over (tau,delta) on redeploy rho in {0.5,1}
rc=[]
sub=[r for r in rows if r['m']=='o_D' and r['op']=='redeploy' and r['rho'] in (0.5,1.0)]
for tau in [0.4,0.5,0.6,0.65,0.7,0.75,0.8]:
    for delta in [None,0.02,0.05,0.08,0.1,0.15,0.2,0.3]:
        c=collections.Counter(outcome(r,tau=tau,delta=delta) for r in sub); n=len(sub)
        rc.append({'tau':tau,'delta':delta,'c':c['c']/n,'w':c['w']/n,'a':c['a']/n})
# dup split for redeploy pooled
dupsplit={}
for m in methods:
    for dv in (0,1):
        c=collections.Counter(); 
        for p,op,rho,mm,o,d in recs:
            if mm==m and op=='redeploy' and rho in (0.5,1.0) and d==dv: c[o]+=1
        n=sum(c.values()); dupsplit[f'{m}|{dv}']={'c':c['c']/n,'w':c['w']/n,'a':c['a']/n,'n':n}
nrows={'rows':len(rows),'pages':len(pages),'trial_resolutions':len({(r['p'],r['op'],r['rho'],r['seed'],r['t']) for r in rows})}
json.dump({'res':res,'head':head,'pair':pair,'perpage':perpage,'rc':rc,'dupsplit':dupsplit,'delta_of':delta_of,'delta_sim':delta_sim,'folds':fold,'meta':nrows,'methods':methods},open('../results/summary.json','w'),indent=1)
print(nrows)
print('HEADLINE redeploy pooled rho{.5,1}:')
for m in methods: h=head[m]; print(f"  {m:18s} C={h['c']:.3f} [{h['c_ci'][0]:.3f},{h['c_ci'][1]:.3f}]  W={h['w']:.3f} [{h['w_ci'][0]:.3f},{h['w_ci'][1]:.3f}] A={h['a']:.3f}")
print('PAIRED'); 
for k,v in pair.items(): print(' ',k,'dC=%.3f [%.3f,%.3f]'%tuple(v['dc']),'dW=%.3f [%.3f,%.3f]'%tuple(v['dw']))
