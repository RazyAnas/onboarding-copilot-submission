import sys, random, collections, json, numpy as np, torch, torch.nn as nn
torch.set_num_threads(3)
sys.path.insert(0,'.')
exec(open('eval_final.py').read().split("M=['Similo'")[0])     # G(feats2), matched apps, folds, fit, ctx, softmax, joint, pub
TOPK=40
def prefilter(g,w):
    s=ctx(g['X'])@w; idx=np.argsort(-s)[:TOPK]
    if g['y'] not in idx: idx=np.concatenate([idx[:-1],[g['y']]]) # training-time only (see below)
    return idx
class Net(nn.Module):
    def __init__(s,nf,d=32,attn=True):
        super().__init__(); s.f=nn.Sequential(nn.Linear(nf,d),nn.ReLU(),nn.Linear(d,d)); s.attn=attn; s.mha=nn.MultiheadAttention(d,4,batch_first=True); s.ln=nn.LayerNorm(d); s.o=nn.Linear(d,1)
    def forward(s,x,m):
        h=s.f(x)
        if s.attn: a,_=s.mha(h,h,h,key_padding_mask=~m); h=s.ln(h+a)
        return s.o(h).squeeze(-1).masked_fill(~m,-1e9)
def pack(items):
    n=max(len(i[1]) for i in items); nf=items[0][0].shape[1]; X=np.zeros((len(items),n,nf),np.float32); M=np.zeros((len(items),n),bool); Y=[]
    for k,(x,idx,y) in enumerate(items): X[k,:len(idx)]=x[idx]; M[k,:len(idx)]=True; Y.append(y)
    return torch.tensor(X),torch.tensor(M),torch.tensor(Y)
def train(items,attn,epochs=40,seed=0):
    torch.manual_seed(seed); net=Net(items[0][0].shape[1],attn=attn); opt=torch.optim.AdamW(net.parameters(),3e-3,weight_decay=1e-2)
    X,M,Y=pack(items); idx=np.arange(len(items))
    for ep in range(epochs):
        net.train(); np.random.RandomState(ep).shuffle(idx)
        for b in range(0,len(idx),32):
            j=idx[b:b+32]; loss=nn.functional.cross_entropy(net(X[j],M[j]),Y[j]); opt.zero_grad(); loss.backward(); opt.step()
    return net.eval()
res={m:collections.defaultdict(collections.Counter) for m in ['Similo','lin','set_transformer','listwise_mlp','ens_lin_st']}
for k in range(K):
    test=[a for a in apps if fold[a]==k]; trn=[a for a in apps if fold[a]!=k]
    w=fit([g for a in trn for g in by[a]])
    items=[]
    for a in trn:
        for g in by[a]:
            idx=prefilter(g,w); items.append((g['X'],idx,int(np.where(idx==g['y'])[0][0])))
    nets={nm:train(items,at) for nm,at in [('set_transformer',True),('listwise_mlp',False)]}
    for a in test:
        for g in by[a]:
            s=ctx(g['X'])@w; idx=np.argsort(-s)[:TOPK]
            x=torch.tensor(g['X'][idx])[None]; m=torch.ones(1,len(idx),dtype=torch.bool)
            res['lin'][a]['c' if np.argmax(s)==g['y'] else 'w']+=1
            P={}
            for nm,net in nets.items():
                with torch.no_grad(): P[nm]=torch.softmax(net(x,m)[0],0).numpy()
                res[nm][a]['c' if idx[P[nm].argmax()]==g['y'] else 'w']+=1
            pl=softmax(s[idx]); e=np.log(pl+1e-9)+np.log(P['set_transformer']+1e-9)
            res['ens_lin_st'][a]['c' if idx[e.argmax()]==g['y'] else 'w']+=1
    print('fold',k,flush=True)
for a in apps: c,nf,wr=pub[a]['Similo']; res['Similo'][a]=collections.Counter({'c':c,'a':nf,'w':wr})
def tot(m,s):
    t=collections.Counter()
    for a in s: t.update(res[m][a])
    n=sum(t.values()); return t['c']/n
rnd=random.Random(5); boots=[[rnd.choice(apps) for _ in apps] for _ in range(2000)]
out={}
for m in res:
    line=f"{m:18s} C={100*tot(m,apps):.1f}"
    if m!='Similo':
        d=np.array([tot(m,s)-tot('Similo',s) for s in boots]); line+=f" vs Similo {100*d.mean():+.1f} [{100*np.percentile(d,2.5):.1f},{100*np.percentile(d,97.5):.1f}]"; out[m]=[tot(m,apps),float(d.mean()),float(np.percentile(d,2.5)),float(np.percentile(d,97.5))]
    print(line)
json.dump(out,open('fast_nn.json','w'))
