import {MeshBuilder,Mesh,DynamicTexture,StandardMaterial,Color3,Vector3} from '@babylonjs/core';
import {COURSE_MARKERS,FIXTURE_LABELS} from './playground.js';

export function createStationSigns(scene,stations){
  const meshes=[],billboards=[];
  const colorFor=id=>stations.find(station=>station.id===id)?.color||'#B9C7D0';
  const decorate=mesh=>{mesh.isPickable=false;mesh.metadata={decorative:true};meshes.push(mesh);return mesh;};
  function textMaterial(id,text,color,width=1024,height=144){
    const texture=new DynamicTexture('Wayfinding text: '+id,{width,height},scene,false);
    const ctx=texture.getContext();ctx.fillStyle='#172630';ctx.fillRect(0,0,width,height);
    ctx.strokeStyle=color;ctx.lineWidth=5;ctx.strokeRect(3,3,width-6,height-6);
    ctx.fillStyle=color;ctx.font='bold '+Math.floor(height*.31)+'px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,width/2,height/2,width-30);texture.update();
    const material=new StandardMaterial('Wayfinding: '+id,scene);material.diffuseTexture=texture;material.emissiveColor=Color3.White();material.disableLighting=true;material.backFaceCulling=false;
    return material;
  }
  function billboard(id,text,position,color,width=4.6,height=.65){
    const sign=decorate(MeshBuilder.CreatePlane('Sign: '+id,{width,height},scene));
    sign.position=Vector3.FromArray(position);sign.billboardMode=Mesh.BILLBOARDMODE_ALL;
    sign.material=textMaterial(id,text,color);
    billboards.push(sign);
    return sign;
  }
  function floorLabel(id,text,position,size,color){
    const sign=decorate(MeshBuilder.CreateGround('Floor marker: '+id,{width:size[0],height:size[1]},scene));
    sign.position.copyFrom(Vector3.FromArray(position));sign.material=textMaterial(id,text,color,1024,256);
    return sign;
  }
  for(const station of stations){
    billboard(station.id,station.title,station.sign,station.color);
    const [x,y,z]=station.spawn;
    floorLabel('station-'+station.id,station.title,[x,y-.55+.014,z-.9],[3.6,.7],station.color);
  }
  for(const marker of COURSE_MARKERS)floorLabel(marker.id,marker.label,marker.position,marker.size,marker.color||colorFor(marker.station));
  for(const label of FIXTURE_LABELS)billboard(label.fixture,label.text,label.position,colorFor(label.station),2.3,.32);
  const routes=[
    {station:'start',points:[[-3,-9],[3,-9]]},
    {station:'carry',points:[[14,-4.7],[14,-3.9],[14,-3.4]]},
    {station:'stairs',points:[[-10,1.4],[-10,2.1]]},
    {station:'stairs',points:[[-13,1.4],[-13,2]]},
    {station:'jump',points:[[-5.5,2.8],[-4.9,2.8]]},
    {station:'moving',points:[[17.2,3.9],[17.2,4.7]]},
    {station:'camera',points:[[7,10.5],[7,11.5]]},
    ...[20,35,50].map((angle,i)=>({station:'slopes',points:[[-13+i*3,10],[-13+i*3,11]]})),
  ];
  for(const [i,route] of routes.entries()){
    const points=route.points.map(([x,z])=>new Vector3(x,.018,z));
    const end=points.at(-1),direction=end.subtract(points.at(-2)).normalize(),side=new Vector3(-direction.z,0,direction.x);
    const left=end.subtract(direction.scale(.28)).add(side.scale(.18)),right=end.subtract(direction.scale(.28)).subtract(side.scale(.18));
    const arrow=decorate(MeshBuilder.CreateLineSystem('Route: '+i,{lines:[points,[left,end,right]]},scene));arrow.color=Color3.FromHexString(colorFor(route.station));
  }
  for(const [i,gap] of [.6,.9,1.2].entries()){
    const z=[3.7,5.65,7.9][i];
    billboard('gap-'+i,gap+' m GAP',[-1,1.75,z],colorFor('jump'),1.4,.3);
  }
  scene.onBeforeRenderObservable.add(()=>{
    const camera=scene.activeCamera;
    if(!camera)return;
    for(const sign of billboards)sign.visibility=Math.max(0,Math.min(1,(Vector3.Distance(camera.globalPosition,sign.position)-5)/3));
  });
  return meshes;
}
