// This replay tests whether player inputs can complete a climb. Adding body
// teleports or extra forces here would invalidate that evidence.
export const CLIMB_SEQUENCE=[
  {frames:360,label:'Settle the stance',input:{pitch:-30}},
  {frames:90,label:'Approach with both hands raised',input:{pitch:-30,z:.3,leftGrab:true,rightGrab:true}},
  {frames:30,label:'Jump and grab',input:{pitch:-30,z:.3,leftGrab:true,rightGrab:true},jump:true},
  {frames:30,label:'Hold the ledge',input:{pitch:-30,leftGrab:true,rightGrab:true}},
  {frames:360,label:'Look down and press forward',input:{pitch:80,z:1,leftGrab:true,rightGrab:true}},
  {frames:20,label:'Release the hands and shift forward',input:{pitch:80,z:1}},
  {frames:300,label:'Stand up and stop',input:{pitch:0}},
];
export class InputReplay {
  constructor(sequence=CLIMB_SEQUENCE){this.sequence=sequence;this.index=0;this.frame=0;}
  get done(){return this.index>=this.sequence.length;}
  get label(){return this.done?'Sequence complete':this.sequence[this.index].label;}
  step(sim){
    if(this.done)return;
    const stage=this.sequence[this.index];
    Object.assign(sim.controller.input,{x:0,z:0,pitch:0,yaw:0,jump:false,leftGrab:false,rightGrab:false},stage.input);
    sim.controller.input.jump=!!stage.jump&&this.frame===0;
    sim.step();
    if(++this.frame>=stage.frames){this.frame=0;this.index++;}
  }
}
