import json,sys
S=sys.argv[1]
def ranks(lst):  # by outlets desc then days desc
    s=sorted(lst,key=lambda x:(-x['outlets'],-x['days']))
    return {x['topic']:i+1 for i,x in enumerate(s)}
for w in ['W42','W43','W44','W45']:
    B={x['topic']:x for x in json.load(open(f'{S}/{w}/B.json'))['world']}
    N={x['topic']:x for x in json.load(open(f'{S}/{w}/N.json'))['world']}
    sel={x['topic']:x for x in json.load(open(f'../../data/runs/2026-{w}.json'))['selection']['world']}
    print(f'\n== {w}  (G=기록된 값(Guardian 포함), B=위키+NPR business, N=B+NPR world)')
    print(f"{'사안':<28} {'판정':<10} {'G':>6} {'B':>6} {'N':>6}")
    for t,x in sel.items():
        g=f"{x['outlets']}/{x['days']}"; b=B.get(t); n=N.get(t)
        j=('rank '+str(x['rank'])) if 'rank' in x else x.get('out','')
        print(f"{t[:26]:<28} {j:<10} {g:>6} {(str(b['outlets'])+'/'+str(b['days'])) if b else '-':>6} {(str(n['outlets'])+'/'+str(n['days'])) if n else '-':>6}")
    # ordering agreement: count pairs among selected topics where order (outlets) agrees with G
    ts=[t for t in sel if t in B and t in N]
    def agree(M):
        a=d=0
        for i in range(len(ts)):
            for k in range(i+1,len(ts)):
                gi,gk=sel[ts[i]]['outlets'],sel[ts[k]]['outlets']
                mi,mk=M[ts[i]]['outlets'],M[ts[k]]['outlets']
                if gi==gk: continue
                if (gi-gk)*(mi-mk)>0: a+=1
                else: d+=1
        return a,d
    if w!='W45': print('G 와 순서 일치(일치/불일치·동점):','B',agree(B),' N',agree(N))
