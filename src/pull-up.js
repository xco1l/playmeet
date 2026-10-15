import {Vector3} from '@babylonjs/core';
import {WORLD_MASK,clamp,clampVector} from './physics.js';

// Ledge clearance supplements the arm forces only after both hands support the body.
export function pullUp(controller){
  const c=controller,ball=c.p.Ball;
  c.pullUpPhase='';
  c.pullUpForce=0;
  const hands=Object.values(c.handControl.sides).filter(m=>m.grab);
  if(hands.length===0)return;
  c.pullUpPhase=c.grounded?'Supported grip':'Hanging';
  if(hands.length!==2||hands[0].grab.body!==hands[1].grab.body||hands[0].grab.body.getMotionType()!==0)return;
  const forward=new Vector3(c.target.x,0,c.target.z).normalize();
  const handCenter=hands[0].part.com.add(hands[1].part.com).scale(.5);
  const probe=handCenter.add(forward.scale(.22));
  const hit=c.engine.raycast(probe.add(new Vector3(0,.45,0)),probe.subtract(new Vector3(0,.25,0)),{collideWith:WORLD_MASK});
  if(!hit.hasHit||hit.body!==hands[0].grab.body||hit.hitNormalWorld.y<.9)return;
  const top=hit.hitPointWorld.y;
  // Floor grabs can satisfy the two-hand condition, so height must distinguish a ledge.
  if(top< c.grabStartHeight+.4)return;
  const rear=ball.position.subtract(forward.scale(.05));
  const support=c.engine.raycast(rear,rear.subtract(new Vector3(0,.4,0)),{collideWith:WORLD_MASK});
  if(support.hasHit&&support.body===hit.body&&support.hitNormalWorld.y>.9&&ball.position.y>top+.24){c.pullUpPhase='On ledge — release hands';return;}
  if((c.grounded&&c.groundBody!==hit.body)||c.input.pitch<45||Vector3.Dot(c.walkDirection,forward)<.2)return;
  c.pullUpPhase='Pulling up';
  // Leave initial lifting to the arm controller so assistance cannot turn any grip into an ascent.
  if(ball.position.y<top-.4)return;
  const strength=clamp((c.input.pitch-45)/15);
  const target=hit.hitPointWorld.add(new Vector3(0,.6,0)).add(forward.scale(.3));
  const error=target.subtract(ball.position),velocity=ball.velocity;
  const lift=clamp(error.y*3000-velocity.y*200,0,900)*strength;
  const push=clamp(Vector3.Dot(error,forward)*1200-Vector3.Dot(velocity,forward)*150,0,500)*strength;
  const force=clampVector(new Vector3(0,lift,0).add(forward.scale(push)),1050);
  c.pullUpForce=force.length();
  ball.addForce(force);
  for(const hand of hands)hand.part.addForce(force.scale(-.5));
}





