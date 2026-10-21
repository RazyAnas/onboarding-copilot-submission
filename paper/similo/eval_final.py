import sys, collections, random, numpy as np
from scipy.optimize import linear_sum_assignment
sys.path.insert(0,'.')
exec(open('eval_online2.py').read().split("rnd=random.Random(9)")[0])
cnt=collections.Counter(g['app'] for g in G)
apps=[a for a in apps if sum(pub[a]['Similo'])==cnt[a]]; by={a:by[a] for a in apps}
print('sites with identical target counts:',len(apps),'targets',sum(cnt[a] for a in apps))
random.seed(3); sh=apps[:]; random.shuffle(sh); fold={a:i%K for i,a in enumerate(sh)}
def joint(L):
    n,m=L.shape
    if n>m: return L.argmax(1)
    r,c=linear_sum_assignment(-L); o=np.zeros(n,int); o[r]=c; return o
M=['Similo','indep','joint','joint_margin']; res={m:collections.defaultdict(collections.Counter) for m in M}
fails=collections.defaultdict(collections.Counter)
DG=[0,0.05,0.1,0.2,0.3,0.5]
for k in range(K):
    test=[a for a in apps if fold[a]==k]; cal=[a for a in apps if fold[a]==(k+1)%K]; trn=[a for a in apps if a not in test and a not in cal]
    w=fit([g for a in trn for g in by[a]])
    LL=lambda a:np.array([np.log(softmax(ctx(g['X'])@w)+1e-12) for g in by[a]])
    st=[]
    for a in cal:
        L=LL(a); J=joint(L)
        for i,g in enumerate(by[a]): P=np.sort(np.exp(L[i]))[::-1]; st.append((P[0]-P[1],J[i]==g['y']))
    dsel=DG[-1]
    for d in DG:
        if sum(1 for gap,ok in st if gap>=d and not ok)/len(st)<=0.03: dsel=d; break
    for a in test:
        L=LL(a); J=joint(L)
        for i,g in enumerate(by[a]):
            P=np.sort(np.exp(L[i]))[::-1]
            res['indep'][a]['c' if L[i].argmax()==g['y'] else 'w']+=1; res['joint'][a]['c' if J[i]==g['y'] else 'w']+=1
            res['joint_margin'][a]['a' if P[0]-P[1]<dsel else ('c' if J[i]==g['y'] else 'w')]+=1
            if J[i]!=g['y']:
                t=g['X'][g['y']]; half='A' if apps.index(a)%2==0 else 'B'
                fails[half]['text changed/missing' if (t[6]<0.5 and t[5]<0.5) else 'other']+=1
    print('fold',k,'delta',dsel,flush=True)
for a in apps: c,nf,wr=pub[a]['Similo']; res['Similo'][a]=collections.Counter({'c':c,'a':nf,'w':wr})
def tot(m,s):
    t=collections.Counter()
    for a in s: t.update(res[m][a])
    n=sum(t.values()); return np.array([t['c']/n,t['w']/n,t['a']/n])
rnd=random.Random(5)
def report(S,label):
    boots=[[rnd.choice(S) for _ in S] for _ in range(3000)]; print('==',label,len(S),'sites')
    for m in M:
        t=tot(m,S); line=f"{m:13s} C={100*t[0]:.1f} W={100*t[1]:.1f} A={100*t[2]:.1f}"
        if m!='Similo':
            d=np.array([tot(m,s)-tot('Similo',s) for s in boots]); lo,hi=np.percentile(d,[2.5,97.5],axis=0)
            line+=f" | vs Similo dC={100*d.mean(0)[0]:+.1f} [{100*lo[0]:.1f},{100*hi[0]:.1f}] dW={100*d.mean(0)[1]:+.1f} [{100*lo[1]:.1f},{100*hi[1]:.1f}]"
        print(line)
report(apps,'ALL matched sites')
A=[a for i,a in enumerate(apps) if i%2==0]; B=[a for i,a in enumerate(apps) if i%2==1]
report(A,'half A'); report(B,'half B')
for h,c in fails.items(): n=sum(c.values()); print('failures in half',h,{k:f'{v}/{n}' for k,v in c.items()})

import json
json.dump({m:{a:dict(res[m][a]) for a in apps} for m in res},open('persite_final.json','w'))
