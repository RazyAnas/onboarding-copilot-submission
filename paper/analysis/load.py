import json, collections, math
import numpy as np
def load(path='../results/robustness.jsonl'):
    rows=[]
    for l in open(path):
        if not l.strip(): continue
        r=json.loads(l); rows.append(r)
    return rows
def wilson(k,n,z=1.96):
    if n==0: return (0,0)
    p=k/n; d=1+z*z/n; c=(p+z*z/(2*n))/d; h=z*math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d
    return (max(0,c-h),min(1,c+h))
def outcome(r, tau=None, delta=None):
    """return 'c','w','a' applying gates to ours-D style rows (x=[s1,s2,secmatch])"""
    if r['m'].startswith('o_') or r['m']=='similo':
        s1,s2=r['x'][:2]
        if tau is not None and s1<tau: return 'a'
        if delta is not None and (s1-s2)<delta: return 'a'
        return r['o']
    return r['o']
