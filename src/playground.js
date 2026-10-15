// The steep run leaves enough contact time for the controller's one-second slope history.
const SLOPES=[20,35,50].map((angle,i)=>({angle,radians:angle*Math.PI/180,length:angle===50?10:5,x:-13+i*3,z:14,thickness:.3}));
const steep=SLOPES.at(-1),faceAlong=steep.length/2-1.6;
const slideFaceSpawn=[steep.x,(steep.length/2+faceAlong)*Math.sin(steep.radians)+steep.thickness/2*(1/Math.cos(steep.radians)-Math.cos(steep.radians))+.65,steep.z+faceAlong*Math.cos(steep.radians)];

export const STATIONS = [
  {id:'start',title:'00 · Open floor',spawn:[0,.55,-6],sign:[0,3,-1],color:'#71BCC4',hint:'Walk, turn, jump, and grab the floor. Hold Y to go limp, release it to recover. Coloured ground signs mark each station; checkpoints return you to individual obstacles.',checkpoints:[
    {id:'open',label:'Open floor',spawn:[0,.55,-6]},
    {id:'turn',label:'Turning lane',spawn:[-3,.55,-9],yaw:90},
  ]},
  {id:'carry',title:'01 · Grab and carry',spawn:[9,.55,-7],sign:[10,3,-3],color:'#D6AC6A',pitch:35,hint:'Compare the 4, 12, and 60 kg crates. Carry a crate or the 8 kg beam to the podium. The blue 24 kg crate accepts grabs but disables carrying assistance: push or drag it to the blue bay.',checkpoints:[
    {id:'light',label:'4 kg crate',spawn:[7.5,.55,-7],pitch:35},
    {id:'medium',label:'12 kg crate',spawn:[9,.55,-7],pitch:35},
    {id:'heavy',label:'60 kg crate',spawn:[10.5,.55,-7],pitch:35},
    {id:'beam',label:'Aligned beam',spawn:[12,.55,-7],pitch:35},
    {id:'push',label:'Push / drag crate',spawn:[14,.55,-7],pitch:35},
  ]},
  {id:'climb',title:'02 · Ledges and climbing',spawn:[-10,.55,-7],sign:[-10,3,-3],color:'#88B99C',pitch:-30,hint:'Ledges rise from 0.6 to 1.6 m. Raise both hands, approach, jump, and look down while pressing W. Release your hands at the ledge prompt.',checkpoints:[
    ...[.6,1,1.3,1.6].map((height,i)=>({id:'ledge-'+height,label:height+' m ledge',spawn:[-15+i*2.5,.55,-7],pitch:-30})),
  ]},
  {id:'stairs',title:'03 · Steps and balance',spawn:[-10,.55,1],sign:[-10,3.8,7],color:'#86A8C5',hint:'Climb six 15 cm steps, cross the 35 cm beam, and stop on the far pad. The adjacent uneven lane tests footing and recovery after a stumble.',checkpoints:[
    {id:'steps',label:'Stair approach',spawn:[-10,.55,1]},
    {id:'beam',label:'Balance beam entry',spawn:[-10,1.45,5.5]},
    {id:'uneven',label:'Uneven lane',spawn:[-13,.55,1]},
  ]},
  {id:'jump',title:'04 · Jumps and hanging',spawn:[0,.55,1],sign:[0,4,8],color:'#C5A0D0',hint:'The raised course has real 0.6, 0.9, and 1.2 m gaps above a catch floor. Jump from a deck centre and release W in the air; briefly press S to brake for the shortest gap. At the high bar, jump with both hands raised, then release one hand before dropping.',checkpoints:[
    {id:'approach',label:'Jump course approach',spawn:[-5.5,.55,2.8],yaw:90},
    {id:'jump-1',label:'0.6 m gap',spawn:[-1,1.75,2.8]},
    {id:'jump-2',label:'0.9 m gap',spawn:[-1,1.75,4.6]},
    {id:'jump-3',label:'1.2 m gap',spawn:[-1,1.75,6.7]},
    {id:'low-bar',label:'Low bar practice',spawn:[3,.85,3.1],pitch:-40},
    {id:'hang',label:'Suspended bar launch',spawn:[3,1.65,5.4],pitch:-45},
  ]},
  {id:'moving',title:'05 · Moving supports',spawn:[10,.8,2],sign:[10,4,8],color:'#D99770',hint:'Jump forward from the lift while it rises toward the walkway, then release W in the air. Ride the shuttle toward a landing, face it, and jump near the end of its travel. Support motion carries into the jump.',checkpoints:[
    {id:'lift',label:'Lift deck',spawn:[10,.8,2]},
    {id:'walkway',label:'Lift landing',spawn:[10,2.35,4.4],yaw:180},
    {id:'shuttle',label:'Shuttle deck',spawn:[13,.8,6],yaw:90},
    {id:'west',label:'Shuttle west landing',spawn:[8.8,.8,6],yaw:90},
    {id:'east',label:'Shuttle east landing',spawn:[17.2,.8,6],yaw:-90},
  ]},
  {id:'slopes',title:'06 · Slopes 20° / 35° / 50°',spawn:[-11,.55,10],sign:[-10,4.5,17],color:'#8FAE78',hint:'Climb each slope from its marked approach. Enter the steep descent slowly and release movement before the edge. The 50° slide face checkpoint places you on the long slope: release all controls and observe the slide. Hold Y to compare active balance with a passive fall.',checkpoints:[
    ...SLOPES.flatMap(({angle,radians,length,x,z})=>{
      const top=length*Math.sin(radians);
      return [{id:'slope-'+angle,label:angle+'° ascent',spawn:[x,.55,10]},
        {id:'summit-'+angle,label:angle+'° descent',spawn:[x,top+.55,z+length/2*Math.cos(radians)+1.1],yaw:180,pitch:35}];
    }),
    {id:'slide-face',label:'50° slide face',spawn:slideFaceSpawn,yaw:180,pitch:35},
  ]},
  {id:'camera',title:'07 · Walls and camera',spawn:[7,.55,11],sign:[9,4,17],color:'#C38783',hint:'Walk through the low passage and around the corner while rotating and zooming the camera. Compare the red panel, which rejects grips, with the green panel. The amber block starts with grips suspended; the grip toggle enables regrabbing.',checkpoints:[
    {id:'corridor',label:'Corridor entrance',spawn:[7,.55,11]},
    {id:'corner',label:'Inside corner',spawn:[7,.55,15.5],yaw:90},
    {id:'no-grab',label:'Red grip-disabled panel',spawn:[11,.55,12.3],pitch:-15},
    {id:'grab',label:'Green grip-enabled panel',spawn:[14,.55,12.3],pitch:-15},
    {id:'suspended',label:'Amber suspended grips',spawn:[17,.55,12.3],pitch:35},
  ]},
  {id:'fall',title:'08 · Long fall',spawn:[19,52.55,-15],sign:[19,55,-13],color:'#A5B5BF',hint:'Step off the 52 m platform toward the marked catch area. Compare an active landing with holding Y during the fall. Reset returns to the selected checkpoint.',checkpoints:[
    {id:'top',label:'52 m platform',spawn:[19,52.55,-15]},
    {id:'landing',label:'Catch area',spawn:[19,.55,-11],yaw:180},
  ]},
];
export const SLOPE_TOP = [...STATIONS.find(station=>station.id==='slopes').checkpoints.find(checkpoint=>checkpoint.id==='summit-50').spawn];

export const COURSE_MARKERS = [
  {id:'carry-target',station:'carry',label:'CARRY / PLACE',position:[10,.512,-2.8],size:[3.7,1.15]},
  {id:'push-target',station:'carry',label:'PUSH / DRAG',position:[14,.012,-2.8],size:[1.8,1.8],color:'#70BACC'},
  {id:'beam-finish',station:'stairs',label:'BALANCE FINISH',position:[-10,.912,9.4],size:[2,1.05]},
  {id:'jump-finish',station:'jump',label:'JUMP FINISH',position:[-1,1.212,9.1],size:[1.8,1.05]},
  {id:'hang-launch',station:'jump',label:'JUMP / TWO HANDS / ONE HAND',position:[3,1.112,5.4],size:[1.8,1.05]},
  {id:'lift-landing',station:'moving',label:'LIFT TRANSFER',position:[10,1.812,4.4],size:[2.8,1.1]},
  {id:'shuttle-west',station:'moving',label:'SHUTTLE WEST',position:[8.8,.262,6],size:[2,1.8]},
  {id:'shuttle-east',station:'moving',label:'SHUTTLE EAST',position:[17.2,.262,6],size:[2,1.8]},
  {id:'fall-catch',station:'fall',label:'52 m FALL / CATCH FLOOR',position:[19,.012,-11],size:[4.5,5]},
];

export const FIXTURE_LABELS = [
  {fixture:'crate-4',station:'carry',text:'4 kg · LIFT',position:[7.5,1.2,-5.5]},
  {fixture:'crate-12',station:'carry',text:'12 kg · CARRY',position:[9,1.2,-5.5]},
  {fixture:'crate-60',station:'carry',text:'60 kg · HEAVY',position:[10.5,1.2,-5.5]},
  {fixture:'carry-beam',station:'carry',text:'8 kg · AIM / ALIGN',position:[12,1.2,-5.2]},
  {fixture:'push-crate',station:'carry',text:'24 kg · NO LIFT ASSIST',position:[14,1.4,-5.5]},
  {fixture:'no-grab-panel',station:'camera',text:'GRIP DISABLED',position:[11,2,14]},
  {fixture:'grip-panel',station:'camera',text:'GRIP ENABLED',position:[14,2,14]},
  {fixture:'suspended-grip',station:'camera',text:'GRIP SUSPENSION TEST',position:[17,1.5,14]},
  {fixture:'traverse-bar',station:'jump',text:'HANG · RELEASE ONE HAND',position:[3,4.1,7]},
];

export function buildPlayground(box) {
  const moving=[];
  const fixture=(id,name,size,position,color,mass=0,pitch=0)=>{
    const aggregate=box(name,size,position,color,mass,pitch);
    Object.assign(aggregate.transformNode.metadata,{fixtureId:id,fixtureSize:[...size]});
    return aggregate;
  };
  for(const [i,mass] of [4,12,60].entries())fixture('crate-'+mass,`Crate · ${mass} kg`,[.65,.65,.65],[7.5+i*1.5,.325,-5.5],'#D6AC6A',mass);
  const beam=fixture('carry-beam','Beam · 8 kg',[.3,.3,2.2],[12,.15,-5.2],'#C69350',8);
  beam.transformNode.metadata.interaction={
    grip:{anchor:[0,.15,-.8],preferred:true},
    transport:{strength:1.2,decayDistance:1,angularResistance:2},
    alignment:{axis:'forward',stiffness:80,maximumTorque:40,distanceExponent:0},
  };
  fixture('carry-podium','Object podium',[4,.5,1.4],[10,.25,-2.8],'#836F53');
  const push=fixture('push-crate','Push crate · 24 kg',[.8,.8,.8],[14,.4,-5.5],'#70BACC',24);
  push.transformNode.metadata.interaction.transport.disabled=true;
  for(const [i,h] of [.6,1,1.3,1.6].entries())fixture('ledge-'+h,`Ledge · ${h} m`,[2,h,2],[-15+i*2.5,h/2,-4.6],'#88B99C');
  for(let i=0;i<6;i++)fixture('step-'+(i+1),`Step · ${(i+1)*15} cm`,[2,.15*(i+1),.6],[-10,.075*(i+1),2.6+i*.6],'#86A8C5');
  fixture('balance-beam','Balance beam · 35 cm wide',[.35,.9,3.2],[-10,.45,7.2],'#ABC8DF');
  fixture('balance-finish','Balance landing',[2.2,.9,1.2],[-10,.45,9.4],'#86A8C5');
  for(let i=0;i<5;i++)fixture('uneven-'+i,'Uneven block '+i,[1.1,.15+(i%3)*.13,1],[-13,.075+(i%3)*.065,2.5+i*1.2],'#637E94');
  let z=2.8;
  for(const [i,gap] of [0,.6,.9,1.2].entries()){
    if(i)z+=1.2+gap;
    fixture('jump-platform-'+(i+1),`Jump ${i+1} · gap ${gap} m`,[2,1.2,1.2],[-1,.6,z],'#A989B3');
  }
  for(let i=0;i<5;i++)fixture('jump-entry-'+i,'Jump entry step '+(i+1),[.55,.2*(i+1),1.2],[-4.475+i*.55,.1*(i+1),2.8],'#94739E');
  fixture('hanging-bar','Hanging bar · 1.9 m',[3.4,.22,.35],[3,2.01,4.4],'#D2B1DD');
  for(const x of [1.4,4.6])fixture('bar-support-'+x,'Bar support',[.25,2,.35],[x,1,4.4],'#826A8B');
  fixture('bar-step','Bar step',[1,.3,1],[3,.15,3.1],'#A989B3');
  fixture('hang-launch','Hanging launch',[2,1.1,1.2],[3,.55,5.4],'#A989B3');
  fixture('traverse-bar','Suspended traverse bar',[3.4,.22,.35],[3,3.15,7],'#D2B1DD');
  for(const x of [1.4,4.6])fixture('traverse-support-'+x,'Traverse support',[.22,3.15,.35],[x,1.575,7],'#826A8B');
  for(let i=0;i<5;i++)fixture('hang-entry-'+i,'Hanging entry step '+(i+1),[.55,.2*(i+1),1.2],[6.525-i*.55,.1*(i+1),5.4],'#94739E');
  const lift=fixture('lift','Lift',[3,.25,3],[10,.125,2],'#D99770');
  const shuttle=fixture('shuttle','Horizontal platform',[2,.25,2],[13,.125,6],'#E4B18F');
  for(const a of [lift,shuttle])a.body.setMotionType(1);
  moving.push({body:lift.body,position:t=>[10,.125+1.05*(1-Math.cos(t*.7)),2]});
  moving.push({body:shuttle.body,position:t=>[13+2*Math.sin(t*.6),.125,6]});
  fixture('lift-walkway','Lift walkway',[3,1.8,1.3],[10,.9,4.4],'#96705A');
  fixture('shuttle-west','Shuttle west landing',[2.2,.25,2.2],[8.8,.125,6],'#96705A');
  fixture('shuttle-east','Shuttle east landing',[2.2,.25,2.2],[17.2,.125,6],'#96705A');
  for(const {angle,radians:a,length,x,z,thickness} of SLOPES){
    const y=length*Math.sin(a)/2-thickness/2*Math.cos(a);
    fixture('slope-'+angle,`Slope · ${angle}°`,[2.4,thickness,length],[x,y,z],'#8FAE78',0,-a);
    const top=y+length*Math.sin(a)/2+thickness/2*Math.cos(a);
    const end=z+length*Math.cos(a)/2;
    fixture('summit-'+angle,`Summit platform · ${angle}°`,[2.4,top,2.4],[x,top/2,end+1.1],'#6D895A');
  }
  fixture('corridor-wall-5.5','Corridor wall',[.3,2.6,4.8],[5.5,1.3,14],'#997C78');
  fixture('corridor-wall-8.5','Corridor wall',[.3,2.6,3.2],[8.5,1.3,13.2],'#997C78');
  fixture('corner-wall','Corner wall',[3,2.6,.3],[7,1.3,16.4],'#997C78');
  fixture('low-passage','Low passage',[3,.25,1.2],[7,1.9,13.4],'#B99993');
  const noGrab=fixture('no-grab-panel','Red panel · no grab',[2,1.4,.35],[11,.7,14],'#C45F57');
  noGrab.transformNode.metadata.interaction.grip.disabled=true;
  fixture('grip-panel','Green panel · grab',[2,1.4,.35],[14,.7,14],'#88B99C');
  const suspended=fixture('suspended-grip','Amber block · suspended grips',[.8,.8,.8],[17,.4,14],'#D3A359',8);
  suspended.transformNode.metadata.interaction.grip.suspended=true;
  fixture('fall-start','Free-fall start · 52 m',[3,.3,3],[19,51.85,-15],'#8195A3');
  return moving;
}
