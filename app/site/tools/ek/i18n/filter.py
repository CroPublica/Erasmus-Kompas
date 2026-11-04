import json,sys,re
v7=open('/home/claude/proto/erasmus-kompas-dizajn-v7.html',encoding='utf-8').read()
i=v7.index('const D = ')+10
D,_=json.JSONDecoder().raw_decode(v7[i:])
data=set()
for p in D['projects']: data.add(p[1].strip())
for o in D['orgs']:
    data.add(o[1].strip()); data.add((o[2] or '').strip())
for t in D['topics']['topics']: data.add(t['name']); 
for n in D['graph']['nodes']: data.add(n[2]); data.add(n[3] or '')
for c in D['graph']['communities']: data.update(c['name'])
low={x.lower() for x in data}
# nazivi država (engleski i hrvatski) iz Intl nisu poznati ovdje: filtriramo ih ručno kasnije
def isdata(k):
    return k.lower() in low
keys=json.load(open(sys.argv[1]))
out={k:v for k,v in keys.items() if not isdata(k)}
json.dump(out,open(sys.argv[2],'w'),ensure_ascii=False,indent=0)
print(len(keys),'->',len(out))
