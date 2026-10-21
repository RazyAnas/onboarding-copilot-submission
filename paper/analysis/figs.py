import json, numpy as np, matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager as fm
import os
for f in ["/System/Library/Fonts/Supplemental/Times New Roman.ttf","/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf","/System/Library/Fonts/Supplemental/Times New Roman Italic.ttf"]:
    if os.path.exists(f): fm.fontManager.addfont(f)
plt.rcParams.update({"font.family":"serif","font.serif":["Times New Roman","DejaVu Serif"],"font.size":7.5,"axes.labelsize":7.5,"axes.titlesize":8,
  "legend.fontsize":6.5,"xtick.labelsize":6.5,"ytick.labelsize":6.5,"axes.linewidth":0.6,"pdf.fonttype":42,"axes.spines.top":False,"axes.spines.right":False,
  "mathtext.fontset":"stix","lines.linewidth":1.1,"grid.linewidth":0.4,"grid.alpha":0.35})
S=json.load(open("../results/summary.json")); R=S["res"]
OUT="../figs/"
NAME={"css":"CSS selector (auto)","xpath":"XPath (absolute)","text":"Text rule","chain":"Selector chain","similo":"Similo-style","similo_margin":"Similo-style + margin","learnedctx":"Ours v2 (learned)","learnedctx_margin":"Ours v2 + margin","gbdt":"Ours v3 (boosted)","gbdt_margin":"Ours v3 + margin","rolename":"Role+name (first)","rolename_strict":"Role+name (strict)","ours":"Ours v1","ours_margin":"Ours v1 + margin","oursC":"Ours (authored criteria)"}
COL={"css":"#0072B2","xpath":"#56B4E9","text":"#E69F00","chain":"#D55E00","similo":"#6a3d9a","similo_margin":"#b15928","learnedctx":"#009E73","learnedctx_margin":"#555555","gbdt":"#111111","gbdt_margin":"#333333","rolename":"#CC79A7","rolename_strict":"#8c8c8c","ours":"#a6c94a","ours_margin":"#111111","oursC":"#7a9e00"}
MK={"css":"s","xpath":"^","text":"v","chain":"D","similo":"h","similo_margin":"8","learnedctx":"o","learnedctx_margin":"*","gbdt":"*","gbdt_margin":"P","rolename":"p","rolename_strict":"x","ours":"o","ours_margin":"*","oursC":"P"}
OPN={"classes":"Class rename","ids":"ID randomisation","reorder":"DOM reorder","wrap":"Wrapper drift","copy":"Copy drift","dup_section":"Duplicate (other section)","dup_adjacent":"Duplicate (adjacent)","redeploy":"Composite redeploy"}
def get(op,rho,m,k): 
    r=int(rho) if float(rho).is_integer() else rho
    key=f"{op}|{r}|{m}"; return R[key][k] if key in R else None
RH=[0,0.1,0.25,0.5,0.75,1.0]
def series(op,m,k):
    ys=[]
    for r in RH:
        v=get("identity",0,m,k) if r==0 else get(op,r,m,k)
        ys.append(v)
    return ys
# ---------- Fig robustness curves (correct rate) + wrong rate ----------
ops=["classes","ids","reorder","wrap","copy","dup_section","dup_adjacent","redeploy"]
ms=["css","xpath","text","chain","rolename","rolename_strict","similo","ours","learnedctx","gbdt"]
for key,fname,ylab in [("c","fig_robust_correct.pdf","Correct highlight rate"),("w","fig_robust_wrong.pdf","Wrong highlight rate")]:
    fig,axs=plt.subplots(2,4,figsize=(7.2,3.5),sharex=True,sharey=True)
    for ax,op in zip(axs.flat,ops):
        for m in ms:
            ys=series(op,m,key); lw=2.0 if (m.startswith("ours") or m.startswith("learned")) else 0.9
            ls="-" if (m.startswith("ours") or m.startswith("learned")) else "--" if m in("css","xpath") else "-"
            ax.plot(RH,ys,color=COL[m],marker=MK[m],ms=3.2 if not (m.startswith("ours") or m.startswith("learned")) else 4.2,lw=lw,ls=ls,label=NAME[m],zorder=5 if (m.startswith("ours") or m.startswith("learned")) else 2)
            if key in("c",):
                lo=series(op,m,key)  # no band for clarity
        ax.set_title(OPN[op],pad=2); ax.grid(True); ax.set_ylim(-0.02,1.02)
        if op=="redeploy":
            for s in ax.spines.values(): s.set_linewidth(0.6)
    for ax in axs[1]: ax.set_xlabel("Perturbation intensity $\\rho$")
    for ax in axs[:,0]: ax.set_ylabel(ylab)
    h,l=axs[0,0].get_legend_handles_labels()
    fig.legend(h,l,loc="lower center",ncol=5,frameon=False,bbox_to_anchor=(0.5,-0.01),handlelength=1.6,columnspacing=0.9,fontsize=6.2)
    fig.tight_layout(rect=(0,0.1,1,1),pad=0.4,h_pad=0.6,w_pad=0.5); fig.savefig(OUT+fname); plt.close(fig)
# ---------- Outcome breakdown ----------
fig,axs=plt.subplots(1,2,figsize=(7.2,2.3),sharey=True)
order=["css","xpath","text","chain","rolename","rolename_strict","similo","similo_margin","oursC","ours","learnedctx","gbdt"]
for ax,rho in zip(axs,[0.5,1.0]):
    x=np.arange(len(order)); c=np.array([get("redeploy",rho,m,"c") for m in order]); w=np.array([get("redeploy",rho,m,"w") for m in order]); a=np.array([get("redeploy",rho,m,"a") for m in order])
    ax.bar(x,c,color="#2a9d8f",label="Correct highlight",width=0.72,lw=0)
    ax.bar(x,w,bottom=c,color="#d62828",label="Wrong highlight",width=0.72,lw=0)
    ax.bar(x,a,bottom=c+w,color="#d9d9d9",label="Abstain / not found",width=0.72,lw=0)
    for i in range(len(order)):
        ax.text(i,c[i]/2,f"{c[i]*100:.0f}",ha="center",va="center",fontsize=6,color="white" if c[i]>0.18 else "black")
        if w[i]>0.045: ax.text(i,c[i]+w[i]/2,f"{w[i]*100:.0f}",ha="center",va="center",fontsize=6,color="white")
    ax.set_xticks(x); ax.set_xticklabels(["CSS","XPath","Text","Chain","Role+\nname","Role+name\n(strict)","Similo-\nstyle","Similo+\nmargin","v1\n(criteria)","v1","v2","v3"],rotation=0,fontsize=6)
    ax.set_title(f"Composite redeploy, $\\rho={rho}$",pad=2); ax.set_ylim(0,1)
axs[0].set_ylabel("Share of resolutions")
h,l=axs[0].get_legend_handles_labels(); fig.legend(h,l,loc="upper center",ncol=3,frameon=False,bbox_to_anchor=(0.5,1.07),fontsize=6.5)
fig.tight_layout(rect=(0,0,1,0.94),pad=0.4); fig.savefig(OUT+"fig_breakdown.pdf"); plt.close(fig)
# ---------- Risk-coverage ----------
fig,ax=plt.subplots(figsize=(3.4,3.35))
H=S["head"]
rc=S["rc"]; pts=[(r["c"],r["w"]) for r in rc]
# pareto: max c for min w
pts=sorted(set(pts),key=lambda p:p[1]); fr=[];best=-1
for c,w in pts:
    if c>best: fr.append((c,w)); best=c
ax.plot([p[0] for p in fr],[p[1] for p in fr],"-",color="#009E73",lw=1.6,zorder=3,label=r"Ours, $(\tau,\delta)$ sweep")
ax.scatter([p[0] for p in pts],[p[1] for p in pts],s=5,color="#009E73",alpha=0.3,zorder=2)
for m in ["css","xpath","text","chain","rolename","rolename_strict","similo","similo_margin"]:
    h=H[m]; ax.scatter(h["c"],h["w"],marker=MK[m],s=26,color=COL[m],label=NAME[m],zorder=4,lw=1)
for m in ["ours","learnedctx","gbdt"]:
    h=H[m]; ax.scatter(h["c"],h["w"],marker=MK[m],s=70 if m=="gbdt" else 34,color=COL[m],edgecolor="white",lw=0.5,label=NAME[m],zorder=6)
ax.set_xlabel("Correct highlight rate $\\rightarrow$ better"); ax.set_ylabel("Wrong highlight rate $\\downarrow$ better")
ax.set_xlim(0,0.85); ax.set_ylim(-0.01,0.36); ax.grid(True)
ax.legend(loc="upper center",bbox_to_anchor=(0.5,-0.2),ncol=2,frameon=False,fontsize=5.8,handletextpad=0.3,labelspacing=0.3,columnspacing=0.8)
fig.tight_layout(pad=0.4); fig.savefig(OUT+"fig_riskcov.pdf"); plt.close(fig)
# ---------- Ablation ----------
fig,ax=plt.subplots(figsize=(3.4,2.4))
ab=[("ours","v1 full descriptor"),("abl_nosection","$-$ section/ordinal"),("abl_nobbox","$-$ bbox"),("abl_noid","$-$ internal id"),("abl_noctx","$-$ all context"),("abl_rolename","role+name only")]
x=np.arange(len(ab)); c=[H[k]["c"] for k,_ in ab]; w=[H[k]["w"] for k,_ in ab]
ce=[[H[k]["c"]-H[k]["c_ci"][0] for k,_ in ab],[H[k]["c_ci"][1]-H[k]["c"] for k,_ in ab]]
we=[[H[k]["w"]-H[k]["w_ci"][0] for k,_ in ab],[H[k]["w_ci"][1]-H[k]["w"] for k,_ in ab]]
ax.bar(x-0.19,c,0.36,color="#2a9d8f",label="Correct",yerr=ce,error_kw=dict(lw=0.6,capsize=1.5))
ax.bar(x+0.19,w,0.36,color="#d62828",label="Wrong",yerr=we,error_kw=dict(lw=0.6,capsize=1.5))
ax.set_xticks(x); ax.set_xticklabels([n for _,n in ab],rotation=22,ha="right",fontsize=6); ax.set_ylabel("Rate (composite redeploy)"); ax.set_ylim(0,0.9); ax.grid(True,axis="y"); ax.legend(frameon=False,ncol=2,loc="upper right")
fig.tight_layout(pad=0.4); fig.savefig(OUT+"fig_ablation.pdf"); plt.close(fig)
# ---------- Heatmaps per page ----------
pp=S["perpage"]; pages=sorted(pp); hm=["css","xpath","text","chain","rolename","similo","ours","learnedctx","gbdt"]
fig,axs=plt.subplots(1,2,figsize=(7.2,5.2),sharey=True)
for ax,idx,title,cm in [(axs[0],0,"Correct highlight rate","YlGn"),(axs[1],1,"Wrong highlight rate","OrRd")]:
    M=np.array([[pp[p][m][idx] for m in hm] for p in pages]); im=ax.imshow(M,aspect="auto",cmap=cm,vmin=0,vmax=1)
    ax.set_xticks(range(len(hm))); ax.set_xticklabels([NAME[m].replace(" (","\n(").replace("Ours + margin gate","Ours +\nmargin").replace("Selector chain","Selector\nchain").replace("Role+name (first)","Role+name\n(first)") for m in hm],fontsize=5.0)
    ax.set_title(title,pad=2)
    for i in range(len(pages)):
        for j in range(len(hm)): ax.text(j,i,f"{M[i,j]*100:.0f}",ha="center",va="center",fontsize=5.5,color="black" if M[i,j]<0.62 else "white")
    ax.spines[:].set_visible(False)
axs[0].set_yticks(range(len(pages))); axs[0].set_yticklabels(pages,fontsize=6)
fig.tight_layout(pad=0.4); fig.savefig(OUT+"fig_perpage.pdf"); plt.close(fig)
# ---------- Efficiency ----------
T=json.load(open("../results/timing.json")); C=json.load(open("../results/codec.json"))
fig,axs=plt.subplots(1,3,figsize=(7.2,2.75))
ax=axs[0]; sc=T["scale"]; N=[s["N"] for s in sc]
ax.plot(N,[s["extractMs"] for s in sc],"-o",ms=3,color="#0072B2",label="Extraction (SDK)")
sc2=[s for s in sc if s["scoreAllMs"]>=0.3]; ax.plot([s["N"] for s in sc2],[s["scoreAllMs"] for s in sc2],"-s",ms=3,color="#009E73",label="Scoring (all $n$)")
pg=T["pages"]; ax.scatter([v["nInteractive"] for v in pg.values()],[v["extractMs"]+v["scoreMs"] for v in pg.values()],s=10,color="#D55E00",marker="x",label="Real pages (extract+score)",zorder=5)
ax.axhline(1000,color="#888",ls=":",lw=0.8); ax.text(12,1300,"typical LLM call $\\geq$ 1 s",fontsize=5.8,color="#555")
ax.set_xscale("log"); ax.set_yscale("log"); ax.set_xlabel("Interactive elements on page $n$"); ax.set_ylabel("Per-tick latency (ms)"); ax.grid(True); ax.legend(frameon=False,fontsize=5.6,loc="upper center",bbox_to_anchor=(0.5,-0.22),ncol=1); ax.set_ylim(0.1,4000); ax.set_title("(a) Local tick cost",pad=2)
ax=axs[1]; names=[c["page"] for c in C]; ratio=[c["delta"]/c["raw"] for c in C]; gz=[c["gzDelta"]/c["gzRaw"] for c in C]
idx=np.argsort(ratio); y=np.arange(len(C))
ax.barh(y-0.2,[ratio[i] for i in idx],0.38,color="#0072B2",label="delta / raw JSON"); ax.barh(y+0.2,[gz[i] for i in idx],0.38,color="#E69F00",label="gzip(delta) / gzip(raw)")
ax.axvline(1,color="#444",lw=0.6); ax.set_yticks(y); ax.set_yticklabels([names[i] for i in idx],fontsize=5.2); ax.set_xlabel("Size ratio ($<1$ is smaller)"); ax.legend(frameon=False,fontsize=5.6,loc="upper center",bbox_to_anchor=(0.5,-0.22),ncol=1); ax.set_title("(b) Snapshot codec",pad=2); ax.set_xlim(0,1.25)
ax=axs[2]; rtt=np.array([20,50,100,200,400]); L=3
ax.plot(rtt,L*(rtt+5),"-s",ms=3,color="#D55E00",label="Server-driven, per-step round trip")
ax.axhspan(0.3,120,color="#009E73",alpha=0.25,label="Local execution (measured, $\\leq$120 ms)")
ax.set_xlabel("Network round-trip time (ms)"); ax.set_ylabel("Blocking latency, 3-step guide (ms)"); ax.set_yscale("log"); ax.grid(True); ax.legend(frameon=False,fontsize=5.6,loc="upper center",bbox_to_anchor=(0.5,-0.22),ncol=1); ax.set_title("(c) Hot-path latency",pad=2); ax.set_ylim(0.2,3000)
fig.tight_layout(pad=0.4,w_pad=0.8); fig.savefig(OUT+"fig_efficiency.pdf"); plt.close(fig)
print("figs done")
