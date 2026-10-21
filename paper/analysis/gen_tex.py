import json, statistics as st, collections
S=json.load(open('../results/summary.json')); R=S['res']; H=S['head']
T=json.load(open('../results/timing.json')); C=json.load(open('../results/codec.json')); M=json.load(open('../results/corpus_meta.json'))
def g(op,rho,m,k):
    r=int(rho) if float(rho).is_integer() else rho
    return R[f"{op}|{r}|{m}"][k]
NAME={"css":"CSS selector (auto)","xpath":"XPath (absolute)","text":"Text rule","chain":"Selector chain","similo":"Similo-style (our reimpl.)","similo_margin":"Similo-style + margin gate$^{\\dagger}$","rolename":"Role+name (first)","rolename_strict":"Role+name (strict)","oursC":"Ours v1, authored criteria","ours":"Ours v1 (hand-weighted)","ours_margin":"Ours v1 + margin gate$^{\\dagger}$","learnedctx":"Ours v2 (learned ranker)","learnedctx_margin":"Ours v2 + margin gate$^{\\dagger}$","gbdt":"Ours v3 (boosted ranker)","gbdt_margin":"Ours v3 + margin gate$^{\\dagger}$"}
order=["css","xpath","text","chain","rolename","rolename_strict","similo","similo_margin","oursC","ours","ours_margin","learnedctx","learnedctx_margin","gbdt","gbdt_margin"]
pc=lambda x:f"{100*x:.1f}"
out=[]
# ---- main table
bestC=max(H[m]['c'] for m in order); bestW=min(H[m]['w'] for m in order)
rows=[]
for m in order:
    h=H[m]; prec=h['c']/(h['c']+h['w']) if h['c']+h['w']>0 else 0
    c=pc(h['c']); w=pc(h['w'])
    if abs(h['c']-bestC)<1e-9: c=f"\\textbf{{{c}}}"
    if abs(h['w']-bestW)<1e-9: w=f"\\textbf{{{w}}}"
    sep="\\midrule\n" if m in ("oursC","learnedctx","gbdt") else ""
    rows.append(f"{sep}{NAME[m]} & {c} & {{\\scriptsize[{pc(h['c_ci'][0])}, {pc(h['c_ci'][1])}]}} & {w} & {{\\scriptsize[{pc(h['w_ci'][0])}, {pc(h['w_ci'][1])}]}} & {pc(h['a'])} & {100*prec:.1f}\\\\")
open('../tex/tab_main.tex','w').write("\n".join(rows)+"\n")
# ---- per-operator table at rho=1 (C/W)
ops=["classes","ids","reorder","wrap","copy","dup_section","dup_adjacent","redeploy"]
OPN={"classes":"Class rename","ids":"ID randomisation","reorder":"DOM reorder","wrap":"Wrapper drift","copy":"Copy drift","dup_section":"Dup. (other section)","dup_adjacent":"Dup. (adjacent)","redeploy":"Composite redeploy"}
cols=["css","xpath","text","chain","rolename","similo","ours","learnedctx","gbdt"]
rows=[]
for op in ops:
    cs=[g(op,1.0,m,'c') for m in cols]; best=max(cs)
    cells=[]
    for m,c in zip(cols,cs):
        w=g(op,1.0,m,'w'); s=f"{100*c:.0f}/{100*w:.0f}"
        cells.append(f"\\textbf{{{s}}}" if abs(c-best)<1e-9 else s)
    rows.append(f"{OPN[op]} & "+" & ".join(cells)+"\\\\")
cs=[g('identity',0,m,'c') for m in cols]; best=max(cs)
rows.insert(0,"Identity ($\\rho{=}0$) & "+" & ".join((f"\\textbf{{{100*c:.0f}/{100*g('identity',0,m,'w'):.0f}}}" if abs(c-best)<1e-9 else f"{100*c:.0f}/{100*g('identity',0,m,'w'):.0f}") for m,c in zip(cols,cs))+"\\\\\n\\midrule")
open('../tex/tab_ops.tex','w').write("\n".join(rows)+"\n")
# ---- ablation
ab=[("ours","Full descriptor (shipped)"),("abl_nosection","$-$ section \\& ordinal hints"),("abl_nobbox","$-$ bounding-box hint"),("abl_noid","$-$ internal id"),("abl_noctx","$-$ all context (role, name, text, test id)"),("abl_rolename","role + name only")]
rows=[f"{n} & {pc(H[k]['c'])} & {pc(H[k]['w'])} & {pc(H[k]['a'])}\\\\" for k,n in ab]
open('../tex/tab_abl.tex','w').write("\n".join(rows)+"\n")
# ---- corpus
NEW={"bootstrap-signin": ["Bootstrap sign-in example", "Forms"], "bootstrap-checkout": ["Bootstrap checkout example", "Forms"], "bootstrap-pricing": ["Bootstrap pricing example", "Web app"], "bootstrap-navbar": ["Bootstrap navbar component docs", "Docs"], "django-docs": ["Django documentation", "Docs"], "vuejs": ["Vue.js home", "Docs"], "angular-dev": ["Angular home", "Docs"], "svelte-dev": ["Svelte home", "Docs"], "tailwind-docs": ["Tailwind CSS installation docs", "Docs"], "nextjs-docs": ["Next.js documentation", "Docs"], "flask-docs": ["Flask documentation", "Docs"], "pypi": ["PyPI home", "Web app"], "shadcn-tasks": ["shadcn/ui tasks example", "Admin UI"], "adminlte-forms": ["AdminLTE general forms", "Forms"], "adminlte-tables": ["AdminLTE data tables", "Admin UI"], "archive-org": ["Internet Archive home", "Content"], "w3c": ["W3C home", "Content"]}
DESC={"demo-members":("Fixture","Our fixture: members settings"),"demo-dashboard":("Fixture","Our fixture: dashboard"),"demo-modal":("Fixture","Our fixture: invite modal open"),"todomvc":("Web app","TodoMVC (React)"),"adminlte":("Admin UI","AdminLTE 3 dashboard demo"),"bootstrap-dashboard":("Admin UI","Bootstrap dashboard example"),"bootstrap-forms":("Forms","Bootstrap forms overview"),"hackernews":("Content","Hacker News front page"),"python-docs":("Docs","Python 3 documentation"),"react-dev":("Docs","React documentation home"),"shadcn-dashboard":("Admin UI","shadcn/ui dashboard example"),"mdn-button":("Docs","MDN \\texttt{<button>} reference"),"wikipedia-main":("Content","Wikipedia main page"),"github-playwright":("Web app","GitHub repository page")}
CITE={"demo-members":"","demo-dashboard":"","demo-modal":"","todomvc":"\\cite{page_todomvc}","adminlte":"\\cite{page_adminlte}","bootstrap-dashboard":"\\cite{page_bsdash}","bootstrap-forms":"\\cite{page_bsforms}","hackernews":"\\cite{page_hn}","python-docs":"\\cite{page_pydocs}","react-dev":"\\cite{page_react}","shadcn-dashboard":"\\cite{page_shadcn}","mdn-button":"\\cite{page_mdn}","wikipedia-main":"\\cite{page_wiki}","github-playwright":"\\cite{page_github}"}
for _k,_v in NEW.items(): DESC[_k]=(_v[1],_v[0]); CITE[_k]='\\cite{page_'+_k.replace('-','_')+'}'
rows=[]
for p in sorted([q for q in M if M[q]['pool']>0],key=lambda q:(not q.startswith('demo'),q)):
    t={'nKept':M[p]['pool']}
    rows.append(f"{DESC[p][1]}{(' '+CITE[p]) if CITE[p] else ''} & {DESC[p][0]} & {t['nKept']} & {M[p]['dups']} \\\\")
open('../tex/tab_corpus.tex','w').write("\n".join(rows)+"\n")
# ---- macros
pair=S['pair']
pf=lambda x:f"{100*x:.1f}"
ratios=[c['delta']/c['raw'] for c in C]; gz=[c['gzDelta']/c['gzRaw'] for c in C]
pg=T['pages']; ticks=[v['extractMs']+v['scoreMs'] for v in pg.values()]
sc={s['N']:s for s in T['scale']}
mac={
 'nPages':S['meta']['pages'],'nTimed':len(T['pages']),'nTargets':10,'nSeeds':5,'nOps':8,'nTrials':f"{S['meta']['trial_resolutions']:,}".replace(',','{,}'),'nRows':f"{S['meta']['rows']:,}".replace(',','{,}'),
 'oursC':pf(H['ours']['c']),'oursW':pf(H['ours']['w']),'oursA':pf(H['ours']['a']),
 'oursCci':f"{pf(H['ours']['c_ci'][0])}--{pf(H['ours']['c_ci'][1])}",'oursWci':f"{pf(H['ours']['w_ci'][0])}--{pf(H['ours']['w_ci'][1])}",
 'marginC':pf(H['ours_margin']['c']),'marginW':pf(H['ours_margin']['w']),'marginA':pf(H['ours_margin']['a']),'marginWci':f"{pf(H['ours_margin']['w_ci'][0])}--{pf(H['ours_margin']['w_ci'][1])}",
 'deltaGate':f"{S['delta_of']['0']}",
 'rnC':pf(H['rolename']['c']),'rnW':pf(H['rolename']['w']),'textC':pf(H['text']['c']),'textW':pf(H['text']['w']),'chainC':pf(H['chain']['c']),'chainW':pf(H['chain']['w']),
 'cssC':pf(H['css']['c']),'cssW':pf(H['css']['w']),'cssA':pf(H['css']['a']),'xpC':pf(H['xpath']['c']),'xpW':pf(H['xpath']['w']),'xpA':pf(H['xpath']['a']),
 'strictC':pf(H['rolename_strict']['c']),'strictW':pf(H['rolename_strict']['w']),'strictA':pf(H['rolename_strict']['a']),
 'simC':pf(H['similo']['c']),'simW':pf(H['similo']['w']),'simA':pf(H['similo']['a']),'dCsim':pf(pair['ours_vs_similo']['dc'][0]),'dCsimLo':pf(pair['ours_vs_similo']['dc'][1]),'dCsimHi':pf(pair['ours_vs_similo']['dc'][2]),'dWsim':pf(-pair['ours_vs_similo']['dw'][0]),'dWsimLo':pf(-pair['ours_vs_similo']['dw'][2]),'dWsimHi':pf(-pair['ours_vs_similo']['dw'][1]),'dCmsim':pf(pair['ours_margin_vs_similo']['dc'][0]),'dWmsim':pf(-pair['ours_margin_vs_similo']['dw'][0]),
 'simmC':pf(H['similo_margin']['c']),'simmW':pf(H['similo_margin']['w']),'simmA':pf(H['similo_margin']['a']),'simmWci':f"{pf(H['similo_margin']['w_ci'][0])}--{pf(H['similo_margin']['w_ci'][1])}",'deltaSim':str(S['delta_sim']['0']),'dCmsimm':pf(pair['simmargin_vs_ours_margin']['dc'][0]),'dWsimmOM':pf(pair['simmargin_vs_ours_margin']['dw'][0]),
 'vTwoC':pf(H['learnedctx']['c']),'vTwoW':pf(H['learnedctx']['w']),'vTwoA':pf(H['learnedctx']['a']),'vTwoCci':f"{pf(H['learnedctx']['c_ci'][0])}--{pf(H['learnedctx']['c_ci'][1])}",'vTwoWci':f"{pf(H['learnedctx']['w_ci'][0])}--{pf(H['learnedctx']['w_ci'][1])}",'vTwomC':pf(H['learnedctx_margin']['c']),'vTwomW':pf(H['learnedctx_margin']['w']),'vTwomA':pf(H['learnedctx_margin']['a']),'dCvSim':pf(pair['lctx_vs_similo']['dc'][0]),'dCvSimLo':pf(pair['lctx_vs_similo']['dc'][1]),'dCvSimHi':pf(pair['lctx_vs_similo']['dc'][2]),'dWvSim':pf(pair['lctx_vs_similo']['dw'][0]),'dCvOne':pf(pair['lctx_vs_ours']['dc'][0]) if 'lctx_vs_ours' in pair else '',
 'gbC':pf(H['gbdt']['c']),'gbW':pf(H['gbdt']['w']),'gbCci':f"{pf(H['gbdt']['c_ci'][0])}--{pf(H['gbdt']['c_ci'][1])}",'gbWci':f"{pf(H['gbdt']['w_ci'][0])}--{pf(H['gbdt']['w_ci'][1])}",'dCgb':pf(pair['gb_vs_similo']['dc'][0]),'dCgbLo':pf(pair['gb_vs_similo']['dc'][1]),'dCgbHi':pf(pair['gb_vs_similo']['dc'][2]),'dWgb':pf(-pair['gb_vs_similo']['dw'][0]),'dWgbLo':pf(-pair['gb_vs_similo']['dw'][2]),'dWgbHi':pf(-pair['gb_vs_similo']['dw'][1]),'gbmC':pf(H['gbdt_margin']['c']),'gbmW':pf(H['gbdt_margin']['w']),
 'critC':pf(H['oursC']['c']),'critW':pf(H['oursC']['w']),'critA':pf(H['oursC']['a']),
 'dCrn':f"{pf(pair['ours_vs_rolename']['dc'][0])}",'dCrnLo':pf(pair['ours_vs_rolename']['dc'][1]),'dCrnHi':pf(pair['ours_vs_rolename']['dc'][2]),
 'dWrn':f"{pf(-pair['ours_vs_rolename']['dw'][0])}",'dWrnLo':pf(-pair['ours_vs_rolename']['dw'][2]),'dWrnHi':pf(-pair['ours_vs_rolename']['dw'][1]),
 'dCtext':pf(pair['ours_vs_text']['dc'][0]),'dWtext':pf(-pair['ours_vs_text']['dw'][0]),'dCchain':pf(pair['ours_vs_chain']['dc'][0]),'dWchain':pf(-pair['ours_vs_chain']['dw'][0]),
 'dCmStrict':pf(pair['ours_margin_vs_rolename_strict']['dc'][0]),'dCmStrictLo':pf(pair['ours_margin_vs_rolename_strict']['dc'][1]),'dCmStrictHi':pf(pair['ours_margin_vs_rolename_strict']['dc'][2]),
 'dWmStrict':pf(pair['ours_margin_vs_rolename_strict']['dw'][0]),'dWmStrictLo':pf(pair['ours_margin_vs_rolename_strict']['dw'][1]),'dWmStrictHi':pf(pair['ours_margin_vs_rolename_strict']['dw'][2]),
 'dWmRn':pf(-pair['ours_margin_vs_rolename']['dw'][0]),
 'codecMedian':f"{100*st.median(ratios):.0f}",'codecBest':f"{100*min(ratios):.0f}",'codecWorst':f"{100*max(ratios):.0f}",'gzMedian':f"{100*st.median(gz):.0f}",'gzWorst':f"{100*max(gz):.0f}",'gzBest':f"{100*min(gz):.0f}",
 'tickMax':f"{max(ticks):.0f}",'tickMed':f"{st.median(ticks):.1f}",'extFiveK':f"{sc[5000]['extractMs']:.0f}",'extOneK':f"{sc[1000]['extractMs']:.0f}",'scoreFiveK':f"{sc[5000]['scoreAllMs']:.1f}",
}
open('../tex/macros.tex','w').write("\n".join(f"\\newcommand{{\\{k}}}{{{v}}}" for k,v in mac.items())+"\n")
print(open('../tex/macros.tex').read()[:1500])
# unique-vs-dup numbers
ds=S['dupsplit']
for m in ["rolename","text","ours","ours_margin"]: print(m,{k:round(v,3) for k,v in ds[m+'|0'].items()},{k:round(v,3) for k,v in ds[m+'|1'].items()})

import glob
for f in glob.glob('../tex/tab_*.tex'):
    t=open(f).read().rstrip()
    if t.endswith('\\\\'): t=t[:-2]
    open(f,'w').write(t)
