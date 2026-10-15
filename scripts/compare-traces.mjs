import fs from 'node:fs';
// Position errors only support a solver comparison when poses, inputs, units,
// coordinate frames, and time origins match; this tool does not verify those conditions.
const [referencePath,candidatePath]=process.argv.slice(2);
if(!referencePath||!candidatePath)throw new Error('Usage: node scripts/compare-traces.mjs reference.json candidate.json');
const read=path=>{const text=fs.readFileSync(path,'utf8').replace(/^\uFEFF/,'');try{return JSON.parse(text)}catch{const records=text.trim().split(/\r?\n/).map(JSON.parse);return {...records[0],frames:records.slice(1)};}};
const a=read(referencePath),b=read(candidatePath);
if(!a.frames?.length||!b.frames?.length)throw new Error('Both recordings require frames');
let sum=0,count=0,max=0;const byBody={};
for(const frame of b.frames){
 const nearest=a.frames.reduce((best,f)=>Math.abs(f.time-frame.time)<Math.abs(best.time-frame.time)?f:best,a.frames[0]);
 if(Math.abs(nearest.time-frame.time)>Math.max(a.dt,b.dt)*3.1)continue;
 for(const body of frame.bodies){const ref=nearest.bodies.find(r=>r.name===body.name);if(!ref)continue;
 const distance=Math.hypot(...body.position.map((v,i)=>v-ref.position[i]));sum+=distance**2;count++;max=Math.max(max,distance);
 const row=byBody[body.name]??={sum:0,count:0,max:0};row.sum+=distance**2;row.count++;row.max=Math.max(row.max,distance);
 }
}
if(!count)throw new Error('No matching samples/bodies');
console.log(JSON.stringify({reference:a.source,candidate:b.source,matchedBodySamples:count,positionRmsMeters:Math.sqrt(sum/count),positionMaxMeters:max,note:'No pass/fail or fidelity claim; verify identical initial pose, inputs, units and time origin.',bodies:Object.fromEntries(Object.entries(byBody).map(([name,r])=>[name,{rms:Math.sqrt(r.sum/r.count),max:r.max,count:r.count}]))},null,2));
