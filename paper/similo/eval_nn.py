import pickle, re, random, json, collections, numpy as np, torch, torch.nn as nn, sys
torch.set_num_threads(8)
exec(open('eval_similo.py').read().split("res=collections.defaultdict")[0])   # reuse G, folds, pub loading
res=collections.defaultdict(lambda: collections.defaultdict(collections.Counter))
class Net(nn.Module):
    def __init__(s,nf,d=48,heads=4,attn=True):
        super().__init__(); s.inp=nn.Sequential(nn.Linear(nf,d),nn.ReLU(),nn.Dropout(0.1),nn.Linear(d,d)); s.attn=attn
        s.mha=nn.MultiheadAttention(d,heads,batch_first=True,dropout=0.1); s.ln=nn.LayerNorm(d); s.ff=nn.Sequential(nn.Linear(d,d),nn.ReLU()); s.out=nn.Linear(d,1)
    def forward(s,x,mask):
        h=s.inp(x)
        if s.attn:
            a,_=s.mha(h,h,h,key_padding_mask=~mask); h=s.ln(h+a); h=h+s.ff(h)
        return s.out(h).squeeze(-1).masked_fill(~mask,-1e9)
def batchify(groups):
    n=max(g['n'] for g in groups); nf=groups[0]['X'].shape[1]; X=np.zeros((len(groups),n,nf),np.float32); M=np.zeros((len(groups),n),bool); Y=np.array([g['y'] for g in groups])
    for i,g in enumerate(groups): X[i,:g['n']]=g['X']; M[i,:g['n']]=True
    return torch.tensor(X),torch.tensor(M),torch.tensor(Y)
def train(groups,seed,attn=True,epochs=120):
    torch.manual_seed(seed); net=Net(groups[0]['X'].shape[1],attn=attn); opt=torch.optim.AdamW(net.parameters(),lr=3e-3,weight_decay=1e-2)
    X,M,Y=batchify(groups); idx=np.arange(len(groups))
    for ep in range(epochs):
        net.train(); np.random.RandomState(seed*1000+ep).shuffle(idx)
        for b in range(0,len(idx),32):
            j=idx[b:b+32]; xb,mb,yb=X[j],M[j],Y[j]; xb=xb[:,:int(mb.sum(1).max())]; mb2=mb[:,:xb.shape[1]]
            loss=nn.functional.cross_entropy(net(xb,mb2),yb); opt.zero_grad(); loss.backward(); opt.step()
    return net.eval()
def probs(nets,groups):
    out=[]
    with torch.no_grad():
        for g in groups:
            x=torch.tensor(g['X'])[None]; m=torch.ones(1,g['n'],dtype=torch.bool)
            out.append(np.mean([torch.softmax(n(x,m)[0],0).numpy() for n in nets],0))
    return out
def decide(g,P,delta):
    o=np.argsort(-P); p1,p2=P[o[0]],(P[o[1]] if len(P)>1 else 0)
    if delta is not None and p1-p2<delta: return 'a'
    return 'c' if o[0]==g['y'] else 'w'
DG=[None,0.02,0.05,0.1,0.2,0.3,0.5]
for name,attn in [('ours_set_transformer',True),('ours_listwise_mlp',False)]:
    for k in range(K):
        test=[a for a in apps if fold[a]==k]; cal=[a for a in apps if fold[a]==(k+1)%K]; trn=[a for a in apps if a not in test and a not in cal]
        nets=[train([g for a in trn for g in by[a]],s,attn) for s in range(3)]
        Gc=[g for a in cal for g in by[a]]; Pc=probs(nets,Gc); dsel=DG[-1]
        for d in DG:
            c=collections.Counter(decide(g,P,d) for g,P in zip(Gc,Pc))
            if c['w']/sum(c.values())<=0.03: dsel=d; break
        for a in test:
            Ps=probs(nets,by[a])
            for g,P in zip(by[a],Ps): res[name][a][decide(g,P,None)]+=1; res[name+'_margin'][a][decide(g,P,dsel)]+=1
        print(name,'fold',k,'delta',dsel,flush=True)
for m in PUBN if False else ['Similo','Multilocator','robula']:
    for a in apps: c,nf,w=pub[a][m]; res[m][a]=collections.Counter({'c':c,'a':nf,'w':w})
def tot(m,sample=None):
    sample=sample or apps; t=collections.Counter()
    for a in sample: t.update(res[m][a])
    n=sum(t.values()); return np.array([t['c']/n,t['w']/n,t['a']/n])
rnd=random.Random(5); boots=[[rnd.choice(apps) for _ in apps] for _ in range(2000)]
out={}
for m in ['Similo','ours_set_transformer','ours_set_transformer_margin','ours_listwise_mlp','ours_listwise_mlp_margin']:
    t=tot(m); arr=np.array([tot(m,s) for s in boots]); c=np.percentile(arr,[2.5,97.5],axis=0)
    out[m]={'c':t[0],'w':t[1],'a':t[2],'c_ci':[c[0][0],c[1][0]],'w_ci':[c[0][1],c[1][1]]}
    print(f"{m:30s} C={100*t[0]:.1f} [{100*c[0][0]:.1f},{100*c[1][0]:.1f}] W={100*t[1]:.1f} [{100*c[0][1]:.1f},{100*c[1][1]:.1f}] A={100*t[2]:.1f}")
    if m!='Similo':
        d=np.array([tot(m,s)-tot('Similo',s) for s in boots]); print('   vs Similo dC=%.1f [%.1f,%.1f] dW=%.1f [%.1f,%.1f]'%(100*d.mean(0)[0],*(100*np.percentile(d,[2.5,97.5],axis=0)[:,0]),100*d.mean(0)[1],*(100*np.percentile(d,[2.5,97.5],axis=0)[:,1])))
json.dump(out,open('similo_results_nn.json','w'),indent=1)
