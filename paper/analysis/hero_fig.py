import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt, matplotlib.image as mpimg, json, os
from matplotlib import font_manager as fm
for f in ["/System/Library/Fonts/Supplemental/Times New Roman.ttf","/System/Library/Fonts/Supplemental/Times New Roman Bold.ttf"]:
    if os.path.exists(f): fm.fontManager.addfont(f)
plt.rcParams.update({"font.family":"serif","font.serif":["Times New Roman","DejaVu Serif"],"pdf.fonttype":42})
H="../figs/hero/"; rows=[("demo-members","Our fixture:\nduplicate \u201cInvite\u201d"),("shadcn-dashboard","shadcn dashboard:\nrepeated \u201cOpen menu\u201d"),("hackernews","Hacker News:\nrepeated \u201chide\u201d")]
cols=[("v0","(a) Authoring time"),("css","(b) CSS selector (auto)"),("text","(c) Text rule"),("ours","(d) Ours")]
fig,axs=plt.subplots(3,4,figsize=(7.2,3.2))
for i,(pg,lab) in enumerate(rows):
    for j,(k,t) in enumerate(cols):
        ax=axs[i,j]; im=mpimg.imread(f"{H}{pg}_{k}.png"); ax.imshow(im); ax.set_xticks([]); ax.set_yticks([])
        for s in ax.spines.values(): s.set_linewidth(1.6 if j==3 else 0.5); s.set_edgecolor("#009E73" if j==3 else "#888")
        if i==0: ax.set_title(t,fontsize=8,pad=3,fontweight="bold" if j==3 else "normal")
    axs[i,0].set_ylabel(lab.replace("``","“").replace("''","”"),fontsize=5.8,labelpad=2)
fig.tight_layout(pad=0.3,w_pad=0.25,h_pad=0.25); fig.savefig("../figs/fig_hero.pdf",dpi=200); fig.savefig("../figs/fig_hero.png",dpi=130)
