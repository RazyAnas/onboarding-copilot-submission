import sys, os, re, glob, json, pickle, random, collections, numpy as np
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from matplotlib import font_manager as fm
from matplotlib.patches import Rectangle
sys.path.insert(0,'.')
for f in ["/System/Library/Fonts/Supplemental/Times New Roman.ttf"]:
    if os.path.exists(f): fm.fontManager.addfont(f)
plt.rcParams.update({"font.family":"serif","font.serif":["Times New Roman","DejaVu Serif"],"font.size":7,"pdf.fonttype":42,"axes.linewidth":0.5})
exec(open('eval_online2.py').read().split("rnd=random.Random(9)")[0])      # G (feats2), apps, pub, fit, ctx, softmax, folds
import sim_port as sp
from load_similo import props, ROOT
PS=json.load(open('persite_final.json')); sites=sorted(PS['joint'])
def rate(c): n=sum(c.values()); return c.get('c',0)/n if n else np.nan
cols=[('xpath','XPath'),('idxpath','Id-XPath'),('ide','Selenium IDE'),('montoto','Montoto'),('robula','ROBULA+'),('Multilocator','Multilocator'),('Similo','Similo (authors)'),('indep','Ours (one-by-one)'),('joint','Ours (joint)')]
M=np.zeros((len(sites),len(cols)))
for i,s in enumerate(sites):
    for j,(k,_) in enumerate(cols):
        if k in ('indep','joint'): M[i,j]=100*rate(PS[k][s])
        else: c,nf,w=pub[s][k]; M[i,j]=100*c/(c+nf+w)
delta=M[:,-1]-M[:,6]; order=np.argsort(-delta); M=M[order]; sites_o=[sites[i] for i in order]; delta=delta[order]
fig,ax=plt.subplots(1,2,figsize=(7.2,6.2),gridspec_kw={'width_ratios':[9,1.1]},sharey=True)
im=ax[0].imshow(M,aspect='auto',cmap='YlGn',vmin=0,vmax=100)
ax[0].set_xticks(range(len(cols))); ax[0].set_xticklabels([c[1] for c in cols],rotation=30,ha='right',fontsize=6.5); ax[0].set_yticks(range(len(sites_o))); ax[0].set_yticklabels(sites_o,fontsize=6)
for i in range(M.shape[0]):
    for j in range(M.shape[1]): ax[0].text(j,i,f"{M[i,j]:.0f}",ha='center',va='center',fontsize=5.3,color='white' if M[i,j]>62 else 'black')
ax[0].set_title("Correct rate (%) on 37 real websites (real before/after versions); sorted by our margin over Similo",fontsize=7)
d=ax[1].imshow(delta[:,None],aspect='auto',cmap='RdYlGn',vmin=-40,vmax=40); ax[1].set_xticks([0]); ax[1].set_xticklabels(["Ours$-$Similo\n(pts)"],fontsize=6.5)
for i,v in enumerate(delta): ax[1].text(0,i,f"{v:+.0f}",ha='center',va='center',fontsize=5.5)
for a in ax: 
    for s in a.spines.values(): s.set_visible(False)
fig.tight_layout(pad=0.3,w_pad=0.3); fig.savefig('../figs/fig_site_heatmap.pdf'); plt.close(fig)
wins=int((delta>0.5).sum()); ties=int((abs(delta)<=0.5).sum()); loss=int((delta<-0.5).sum()); print('sites: ours better',wins,'tie',ties,'worse',loss)
# ---- feature heatmap
w=fit([g for g in G if g['y']>=0]); nf=len(w)//3
NAMES=["cls","idEq","idDice","hrefEq","hrefDice","text","vtext","vtextEq","nameAlt","xpath","idxEq","idxDice","tag","isBtn","loc","size","area","shape","nbAbove","nbBelow","nbLeft","nbRight","nbAny","NCD(all attrs)","classTok","hrefTok","textTok","nbTok","labelTok","NCD(text)"]
W=np.stack([w[:nf],w[nf:2*nf],w[2*nf:]]); idx=np.argsort(-np.abs(W).sum(0)); 
fig,ax=plt.subplots(figsize=(7.2,2.0)); im=ax.imshow(W[:,idx],aspect='auto',cmap='RdBu_r',vmin=-np.abs(W).max(),vmax=np.abs(W).max())
ax.set_xticks(range(nf)); ax.set_xticklabels([NAMES[i] for i in idx],rotation=55,ha='right',fontsize=6); ax.set_yticks(range(3)); ax.set_yticklabels(["feature","feature $-$ best rival","feature $-$ mean rival"],fontsize=6.5)
fig.colorbar(im,ax=ax,fraction=0.02,pad=0.01).ax.tick_params(labelsize=6); ax.set_title("Learned matcher weights (the matcher's skeleton): which signals drive a correct match, sorted by influence",fontsize=7)
fig.tight_layout(pad=0.3); fig.savefig('../figs/fig_feature_heatmap.pdf'); plt.close(fig)
top=[(NAMES[i],round(float(abs(W[:,i]).sum()),2)) for i in idx[:8]]; print('top features',top)
# ---- skeleton layout heatmaps: find targets where Similo(port) wrong and ours right, held-out by site
random.seed(3); sh=apps[:]; random.shuffle(sh); fold={a:i%K for i,a in enumerate(sh)}
by2={a:[g for g in G if g['app']==a] for a in apps}
cands_cache={}; ex=[]
for k in range(K):
    trn=[a for a in apps if fold[a]!=k]; wk=fit([g for a in trn for g in by2[a] if g['y']>=0])
    for a in [x for x in apps if fold[x]==k]:
        tw={}
        for f in glob.glob(f'{ROOT}/{a}/target_widgets/*.properties'): d=props(f); tw[d.get('xpath')]=d
        cands=[props(f) for f in glob.glob(f'{ROOT}/{a}/candidate_widgets/*.properties')]
        olds=[]
        for f in sorted(glob.glob(f'{ROOT}/{a}/[0-9]*.properties'),key=lambda x:int(re.findall(r'(\d+)\.properties',x)[0])):
            p=props(f)
            if p['old_xpath'] in tw: olds.append(tw[p['old_xpath']])
        for g,T in zip(by2[a],olds):
            P=softmax(ctx(g['X'])@wk)
            sim=int(np.argmax([sp.score(sp.md(T),sp.md(C)) for C in cands]))
            if P.argmax()==g['y'] and sim!=g['y'] and len(cands)>40: ex.append((a,T,cands,P,g['y'],sim))
print('examples where ours right & Similo wrong:',len(ex))
random.seed(1); pick=[]; seen=set()
def okex(e):
    a,T,cands,P,y,sim=e; t=cands[y]; w_=float(t.get('width',0)); h_=float(t.get('height',0)); cx=float(t.get('x',0))+w_/2; cy=float(t.get('y',0))+h_/2
    inwin=sum(1 for c in cands if abs(float(c.get('x',0))-cx)<520 and abs(float(c.get('y',0))-cy)<300 and float(c.get('width',0))<1500)
    return w_>8 and h_>8 and inwin>=20 and cy>0
for e in sorted([e for e in ex if okex(e)],key=lambda e:-e[3][e[4]]):
    if e[0] not in seen: pick.append(e); seen.add(e[0])
    if len(pick)==3: break
fig,axs=plt.subplots(1,3,figsize=(7.2,2.6))
for ax,(a,T,cands,P,y,sim) in zip(axs,pick):
    tc=cands[y]; cx=float(tc.get('x',0))+float(tc.get('width',0))/2; cy=float(tc.get('y',0))+float(tc.get('height',0))/2
    X0,xm,Y0,ym=cx-520,cx+520,cy-300,cy+300
    for c,p in zip(cands,P):
        x,yy,wd,h=[float(c.get(k,0)) for k in ('x','y','width','height')]
        if x>xm or x+wd<X0 or yy>ym or yy+h<Y0 or wd>1500: continue
        ax.add_patch(Rectangle((x,yy),wd,h,facecolor=plt.cm.magma(min(1,p**0.35)),edgecolor='#333',linewidth=0.3,alpha=0.9))
    for idx_,col,ls,lw in ((y,'#00d26a','-',1.8),(sim,'#ff3b3b','--',1.4)):
        c=cands[idx_]; ax.add_patch(Rectangle((float(c.get('x',0)),float(c.get('y',0))),float(c.get('width',0)),float(c.get('height',0)),fill=False,edgecolor=col,linestyle=ls,linewidth=lw))
    ax.set_xlim(X0,xm); ax.set_ylim(ym,Y0); ax.set_facecolor('#111'); ax.set_xticks([]); ax.set_yticks([]); ax.set_title(f"{a}: P(truth)={P[y]:.2f}",fontsize=7)
fig.suptitle("Layout heatmaps of real pages: every element coloured by our match probability; green = true target (ours picks it), red dashed = Similo's wrong pick",fontsize=7,y=0.995)
fig.tight_layout(pad=0.3,rect=(0,0,1,0.95)); fig.savefig('../figs/fig_skeleton.pdf'); plt.close(fig); print('done')
