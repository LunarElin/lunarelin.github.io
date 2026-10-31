"""Normalize selected local APK exports into texture-free browser mesh data.
Input is a prior static Unity export, never an APK execution. No network access.
"""
import argparse, hashlib, json, math, sys
from pathlib import Path

parser=argparse.ArgumentParser()
parser.add_argument('analysis_root',type=Path)
parser.add_argument('--output',type=Path,default=Path(__file__).resolve().parents[1]/'assets'/'burger-source')
args=parser.parse_args();p=args.analysis_root;out=args.output;out.mkdir(parents=True,exist_ok=True)
selected={
 'customer':'customer__0a477a10__857.obj',
 'player':'main-Character__0a477a10__1041.obj',
 'apron':'player_cloth__05b15b88__2.obj',
 'counter':'01_Counter__66005191__1.obj',
 'grill':'Burger_Grill_01_01__76c3e367__1.obj',
 'table':'Table__f1645ab2__1.obj',
 'chair':'01_Chair__0197ca1a__1.obj',
 'burger':'Hamburger__45a62237__1.obj',
 'emptyDish':'Hamburger.006__eda3c7fa__1.obj',
 'cup':'Coffee_cup02__0a477a10__838.obj',
 'cash':'Money__0a477a10__908.obj',
}
# Recover the compressed source weights. UnityPy 1.25.2's fourth-weight branch
# uses 1-sum(integer weights); the format's remaining weight is (31-sum)/31.
sys.path.insert(0,str(p/'tooling/python-deps'))
import UnityPy
from UnityPy.helpers.MeshHelper import MeshHandler
from UnityPy.helpers.PackedBitVector import unpack_ints
files=sorted((p/'raw/base/assets/bin/Data').glob('sharedassets1.assets.split*'),key=lambda x:int(x.suffix[6:]));env=UnityPy.load(b''.join(x.read_bytes() for x in files));mesh=next(o.read() for o in env.objects if o.type.name=='Mesh' and o.path_id==1041)
h=MeshHandler(mesh);h.process();bi=iter(unpack_ints(mesh.m_CompressedMesh.m_BoneIndices));wi=iter(unpack_ints(mesh.m_CompressedMesh.m_Weights));weights=[];indices=[]
for vertex in range(len(h.m_Vertices)):
 ii=[];ww=[];total=0
 for influence in range(4):
  if influence==3: w=31-total
  else: w=next(wi)
  ii.append(next(bi));ww.append(w/31);total+=w
  if total>=31:break
 ii += [0]*(4-len(ii));ww += [0]*(4-len(ww));indices.append(ii);weights.append(ww)
assert all(abs(sum(w)-1)<1e-6 and min(w)>=0 for w in weights)
# The source T-pose becomes an idle pose, then its original weights are folded
# onto the existing 8-bone web rig. Vertices/faces stay from the source mesh.
source_to_web=[0,0,0,0,0,0,6,6,6,6,5,5,5,5,2,4,4,4,1,3,3,3]
exports={};manifest=[]
for key,name in selected.items():
 path=p/'unity-resources/Mesh'/name;raw=path.read_bytes();vs=[];fs=[]
 for line in raw.decode().splitlines():
  if line.startswith('v '):vs.append(list(map(float,line.split()[1:4])))
  elif line.startswith('f '):
   face=[int(a.split('/')[0])-1 for a in line.split()[1:]]
   for i in range(1,len(face)-1):fs.extend([face[0],face[i],face[i+1]])
 data={'positions':vs,'indices':fs}
 if key=='player':
  assert len(vs)==len(weights)
  posed=[]
  for v,ii,ww in zip(vs,indices,weights):
   result=[0,0,0]
   for bone,w in zip(ii,ww):
    x,y,z=v
    if 6<=bone<=13:
     side=1 if bone<=9 else -1;cx=.0701698*side;cy=1.1906;angle=-side*1.43
     x,y=cx+(x-cx)*math.cos(angle)-(y-cy)*math.sin(angle),cy+(x-cx)*math.sin(angle)+(y-cy)*math.cos(angle)
    for a,q in enumerate([x,y,z]):result[a]+=q*w
   posed.append(result)
  data['positions']=posed;data['skinIndices']=[[source_to_web[x] for x in row] for row in indices];data['skinWeights']=weights
 exports[key]={k:([round(x,6) for row in v for x in row] if k!='indices' else v) for k,v in data.items()}
 bounds=[[min(v[a] for v in vs),max(v[a] for v in vs)] for a in range(3)]
 manifest.append({'key':key,'source':name,'sha256':hashlib.sha256(raw).hexdigest(),'vertices':len(vs),'triangles':len(fs)//3,'bounds':bounds})
(out/'mesh-data.mjs').write_text('// Selected Burger Please! 31.6.0 mesh exports; see SOURCES.md and manifest.json.\nexport const SOURCE_MESH_DATA = '+json.dumps(exports,separators=(',',':'))+';\n',encoding='utf-8')
(out/'manifest.json').write_text(json.dumps({'apk':'io.supercent.burgeridle 31.6.0 (141)','apkSha256':'426bd4308f45b9b8b84dec3819eb893a7c25ff254e7d6c26bc50551448a4d334','copyright':'Supercent, Inc. Proprietary source game assets; not Kenney/CC0.','conversion':'Selected source vertices/faces; mesh coordinates rounded to 1e-6; runtime bounds normalization and palette recolor. Source player compressed weights decoded, T-pose arms relaxed, weights folded to the web 8-bone rig. Web animations are separate.','assets':manifest},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print([(m['key'],m['vertices'],m['triangles']) for m in manifest]);print('module bytes',(out/'mesh-data.mjs').stat().st_size)
