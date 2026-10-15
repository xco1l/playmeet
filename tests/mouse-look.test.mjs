import test from 'node:test';
import assert from 'node:assert/strict';
import {MouseLook} from '../src/mouse-look.js';
test('mouse filter uses four weighted samples and vertical gain two',()=>{
 const look=new MouseLook(),input={pitch:0,yaw:0};
 for(let i=0;i<4;i++)look.step(input,1/60);
 look.add(100,100);look.step(input,1/60);
 assert.ok(Math.abs(input.yaw-6)<1e-9);assert.ok(Math.abs(input.pitch-12)<1e-9);
 for(let i=0;i<3;i++)look.step(input,1/60);
 assert.ok(Math.abs(input.yaw-15)<1e-9);assert.ok(Math.abs(input.pitch-30)<1e-9);
 look.step(input,1/60);assert.ok(Math.abs(input.yaw-15)<1e-9);
});
test('look pitch is limited and target pitch approaches it at 1800 degrees per second',()=>{
 const look=new MouseLook(),input={pitch:0,yaw:0};
 look.add(0,10000);look.step(input,1/60);
 assert.equal(look.pitch,80);assert.equal(input.pitch,30);
 look.step(input,1/60);look.step(input,1/60);assert.equal(input.pitch,80);
 look.reset(0,0);input.pitch=0;look.add(0,-10000);look.step(input,1/60);
 assert.equal(look.pitch,-80);assert.equal(input.pitch,-30);
});
