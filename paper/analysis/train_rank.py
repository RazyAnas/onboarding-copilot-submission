"""Learned local ranker over candidate feature vectors (softmax / listwise), evaluated on HELD-OUT PAGES
and (secondary) HELD-OUT PERTURBATION TYPES. Exportable: linear weights or 1-hidden-layer MLP."""
import json, sys, collections, random, math
import numpy as np
from scipy.optimize import minimize
FEATS=["cls","idEq","idDice","aria","hrefEq","text","xpath","loc","size","role","nameEq","nameDice","section","ordinal","visible","testId","hasSdk","pcls","prev","next"]
def load(path='../results/feats.jsonl'):
    G=[]
    for l in open(path):
        if not l.strip(): continue
        r=json.loads(l); X=np.array(r['X'],dtype=np.float32)/100.0
        G.append((r['p'],r['op'],r['rho'],r['seed'],r['t'],r['d'],r['y'],X))
    return G
CTX=False
def ctx(X):
    return np.concatenate([X, X-X.max(0,keepdims=True), X-X.mean(0,keepdims=True)],1) if CTX else X
def pad(X,K=15):
    X=ctx(X)
    if X.shape[0]<K: X=np.vstack([X,np.zeros((K-X.shape[0],X.shape[1]),np.float32)]); 
    return X
class Lin:
    def __init__(s,nf): s.w=np.zeros(nf); s.b=0.0
    def score(s,X): return X@s.w
def fit_linear(train,l2=1e-3):
    tr=[(pad(g[7]),g[6]) for g in train if g[6]>=0 and g[7].shape[0]>1]
    Xs=np.stack([x for x,_ in tr]); ys=np.array([y for _,y in tr]); nf=Xs.shape[2]
    def loss(w):
        S=Xs@w; S=S-S.max(1,keepdims=True); P=np.exp(S); P/=P.sum(1,keepdims=True)
        ll=-np.log(P[np.arange(len(ys)),ys]+1e-9).mean()+l2*(w@w)
        G=(P.copy()); G[np.arange(len(ys)),ys]-=1
        grad=np.einsum('nk,nkf->f',G,Xs)/len(ys)+2*l2*w
        return ll,grad
    r=minimize(loss,np.zeros(nf),jac=True,method='L-BFGS-B',options={'maxiter':300})
    return r.x
def predict(w,X):
    X=pad(X); S=X@w; S=S-S.max(); P=np.exp(S); P/=P.sum(); return P
def evaluate(w,groups,tau=None,delta=None,nm=None):
    c=collections.Counter()
    for g in groups:
        X=g[7]; y=g[6]
        P=predict(w,X); order=np.argsort(-P); p1=P[order[0]]; p2=P[order[1]] if len(P)>1 else 0
        top=int(order[0]); act=True
        # raw feature-sim score as confidence: use probability margin
        if tau is not None and p1<tau: act=False
        if delta is not None and (p1-p2)<delta: act=False
        if not act: c['a']+=1
        else: c['c' if top==y else 'w']+=1
    n=sum(c.values()); return {k:c[k]/n for k in 'cwa'}|{'n':n}
