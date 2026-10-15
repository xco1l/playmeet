import './style.css';
import './hands-ui.css';
import Havok from '@babylonjs/havok';
import wasmUrl from '@babylonjs/havok/lib/esm/HavokPhysics.wasm?url';
import {Engine, ArcRotateCamera, Vector3, HemisphericLight, DirectionalLight, Color4, Color3, MeshBuilder} from '@babylonjs/core';
import {createSimulation} from './simulation.js';
import {InputReplay} from './replay.js';
import {MouseLook} from './mouse-look.js';
import {CameraBoom} from './camera-boom.js';
import {CameraView} from './camera-view.js';
import {STATIONS} from './playground.js';
import {createStationSigns} from './station-signs.js';
import {PlaygroundChecks} from './playground-checks.js';
import {PlaygroundTools} from './playground-tools.js';

const $ = id => document.getElementById(id);
try {
  const [havok, spec] = await Promise.all([
    Havok({locateFile: () => wasmUrl}),
    fetch(import.meta.env.BASE_URL + 'data/character.json').then(async response => {
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json'))
        throw new Error('Character configuration is missing. Run pnpm character, then rebuild.');
      return response.json();
    }),
  ]);
  const engine = new Engine($('view'), true);
  const canvas = $('view');
  $('bodyCount').textContent = String(spec.bodies.length);
  $('totalMass').textContent = spec.totalMass.toFixed(1);
  for (const item of STATIONS) $('station').add(new Option(item.title, item.id));
  const station = () => STATIONS.find(item => item.id === $('station').value) || STATIONS[0];
  const checkpoint = () => station().checkpoints?.find(item => item.id === $('checkpoint').value);
  const sim = createSimulation(engine, havok, spec, {scenario: $('scenario').value, spawn: Vector3.FromArray(STATIONS[0].spawn)});
  const scene = sim.scene, signs = createStationSigns(scene, STATIONS);
  const checks = new PlaygroundChecks(), tools = new PlaygroundTools();
  scene.clearColor = new Color4(.08, .13, .17, 1);
  const camera = new ArcRotateCamera('Camera', -Math.PI * .62, 1.25, 5.8, new Vector3(-.5, .9, 0), scene);
  camera.attachControl(canvas, true);
  for (const type of ['ArcRotateCameraKeyboardMoveInput', 'ArcRotateCameraPointersInput', 'ArcRotateCameraMouseWheelInput']) camera.inputs.removeByType(type);
  camera.lowerRadiusLimit = .02; camera.upperRadiusLimit = 18;
  camera.lowerBetaLimit = .02; camera.upperBetaLimit = Math.PI - .02;
  camera.minZ = .1; camera.fov = 70 * Math.PI / 180;
  const cameraBoom = new CameraBoom(scene, sim.plugin), mouseLook = new MouseLook(), cameraView = new CameraView();
  let cameraDistance = 5.8, paused = false, accumulator = 0, last = performance.now(), hudTime = 0;
  let replay = null, pointerDead = false, guideSignature = '';
  const keys = new Set(), pointerHands = {Left: false, Right: false}, mouseHands = {Left: false, Right: false};
  const hints = {
    platform: 'Ride the platform, jump while it rises, and compare takeoff with the support speed.',
    slope: 'Steep slopes trigger sliding. Hold Y to go limp, then release to recover.',
    carry: 'Look down and grab the beam with both hands. Look up to lift it; its orientation follows your gaze.',
    box: 'Hold Q and E to grab a crate. Look up to lift it, then release to drop it.',
    ledge: 'Raise both hands, approach and jump. Look down and press W. At the ledge prompt release your hands, briefly continue forward, then stop and look ahead.',
    lab: 'Walk, turn, jump and compare the movement strength settings. Q and E control the hands independently.',
  };
  const labels = {Idle: 'Standing', Walk: 'Walking', Jump: 'Jump', Fall: 'Falling', Climb: 'Hanging / climbing', Unconscious: 'Recovering', FreeFall: 'Free fall', Slide: 'Sliding', Passive: 'Passive ragdoll'};
  new HemisphericLight('Sky', new Vector3(.5, 1, .3), scene).intensity = .85;
  new DirectionalLight('Sun', new Vector3(-.5, -1, .5), scene).intensity = 1.2;
  const lines = [];
  for (let i = -24; i <= 24; i++) lines.push([new Vector3(i, .002, -24), new Vector3(i, .002, 24)], [new Vector3(-24, .002, i), new Vector3(24, .002, i)]);
  const grid = MeshBuilder.CreateLineSystem('Grid', {lines}, scene);
  grid.color = new Color3(.25, .33, .38);

  function focusScene() {canvas.focus({preventScroll: true});}
  function setPanelsHidden(hidden) {
    document.body.classList.toggle('panels-hidden', hidden);
    $('panelToggle').textContent = hidden ? 'Show panels · H' : 'Hide panels · H';
    $('panelToggle').setAttribute('aria-expanded', String(!hidden));
  }
  function togglePanels() {
    setPanelsHidden(!document.body.classList.contains('panels-hidden'));
    focusScene();
  }
  function syncHands() {
    for (const side of ['Left', 'Right']) {
      const hold = $(side.toLowerCase() + 'Latch').checked || mouseHands[side] || pointerHands[side] || keys.has(side === 'Left' ? 'KeyQ' : 'KeyE');
      sim.controller.input[side.toLowerCase() + 'Grab'] = hold;
      $(side.toLowerCase() + 'Hand').setAttribute('aria-pressed', String(hold));
    }
  }
  function syncDead() {
    const held = pointerDead || keys.has('KeyY');
    sim.controller.input.playDead = held;
    $('limp').setAttribute('aria-pressed', String(held));
  }
  function clearControls() {
    keys.clear(); mouseHands.Left = mouseHands.Right = pointerHands.Left = pointerHands.Right = false;
    $('leftLatch').checked = $('rightLatch').checked = false;
    pointerDead = false;
    Object.assign(sim.controller.input, {x: 0, z: 0, jump: false, playDead: false});
    syncHands(); syncDead();
  }
  function stopDemo() {
    replay = null; $('demo').textContent = 'Show the climb'; $('demoStatus').textContent = '';
  }
  function resume() {paused = false; $('pause').textContent = 'Pause'; $('pause').setAttribute('aria-label', 'Pause');}
  function updateInputs() {
    sim.controller.input.pitch = +$('pitch').value; sim.controller.input.yaw = +$('yaw').value;
    mouseLook.reset(sim.controller.input.pitch, sim.controller.input.yaw);
    sim.controller.active = $('active').checked;
    $('pitchValue').textContent = Math.round(+$('pitch').value) + '°';
    $('yawValue').textContent = Math.round(+$('yaw').value) + '°';
    $('strengthValue').textContent = Math.round(+$('strength').value * 100) + '%';
  }
  function populateCheckpoints() {
    $('checkpoint').replaceChildren(new Option('Station entrance', 'entrance'));
    for (const point of station().checkpoints || []) $('checkpoint').add(new Option(point.label, point.id));
  }
  function renderGuide(force = false) {
    if ($('scenario').value !== 'playground') return;
    const status = checks.status;
    const signature = JSON.stringify([station().id, status, checks.completed]);
    if (!force && signature === guideSignature) return;
    guideSignature = signature;
    $('stationTitle').textContent = station().title;
    $('allProgress').textContent = checks.completed + ' / ' + checks.total + ' complete';
    $('stationProgress').textContent = status.filter(item => item.complete).length + ' / ' + status.length + ' station checks complete';
    $('checklist').replaceChildren(...status.map(item => {
      const row = document.createElement('li');
      row.className = item.complete ? 'complete' : '';
      const title = document.createElement('div'); title.className = 'check-title';
      const mark = document.createElement('span'); mark.className = 'check-mark'; mark.textContent = item.complete ? '✓' : '○';
      const text = document.createElement('span'); text.textContent = item.title;
      title.append(mark, text);
      const type = document.createElement('span'); type.className = 'check-type';
      type.textContent = item.automatic ? 'Sensor check' : 'Visual check';
      const instruction = document.createElement('p'); instruction.textContent = item.instruction;
      row.append(title, type, instruction);
      if (item.detail) {const detail = document.createElement('p'); detail.className = 'check-detail'; detail.textContent = item.detail; row.append(detail);}
      if (!item.automatic && !item.complete) {
        const confirm = document.createElement('button'); confirm.textContent = 'Confirm observed';
        confirm.setAttribute('aria-label', 'Confirm: ' + item.title);
        confirm.onclick = () => {checks.confirm(item.id); renderGuide(true); focusScene();};
        row.append(confirm);
      }
      return row;
    }));
  }
  function preset() {
    const full = $('scenario').value === 'playground', point = checkpoint() || station();
    $('pitch').value = full ? point.pitch ?? station().pitch ?? 0 : ({box: 35, carry: 60, ledge: -30}[$('scenario').value] ?? 0);
    $('yaw').value = full ? point.yaw ?? station().yaw ?? 0 : 0;
    $('stationPanel').hidden = $('fieldGuide').hidden = !full;
    $('testTools').hidden = !full;
    for (const sign of signs) sign.setEnabled(full);
    $('demoPanel').hidden = $('scenario').value !== 'ledge';
    $('hint').textContent = full ? station().hint : hints[$('scenario').value];
    document.body.style.setProperty('--station-color', full ? station().color : '#86d8db');
    $('toggleAmber').textContent = 'Enable amber block grips';
    updateInputs(); renderGuide(true);
  }
  function reset() {
    stopDemo(); clearControls(); tools.reset();
    const point = checkpoint() || station();
    sim.reset($('scenario').value === 'playground' ? Vector3.FromArray(point.spawn) : new Vector3(0, .55, 0), $('scenario').value);
    accumulator = 0; cameraBoom.distance = null;
    $('failure').textContent = '';
    checks.select(station().id, sim); resume(); preset(); focusScene();
  }
  function travel(delta) {
    $('scenario').value = 'playground';
    const index = STATIONS.findIndex(item => item.id === station().id);
    $('station').value = STATIONS[(index + delta + STATIONS.length) % STATIONS.length].id;
    populateCheckpoints(); reset();
  }
  function toolAction(action) {
    if ($('scenario').value !== 'playground') return;
    if (replay) {stopDemo(); clearControls();}
    tools[action](sim); resume(); focusScene();
  }

  $('reset').onclick = reset;
  $('panelToggle').onclick = togglePanels;
  $('scenario').onchange = reset;
  $('station').onchange = () => {populateCheckpoints(); reset();};
  $('checkpoint').onchange = reset;
  $('previousStation').onclick = () => travel(-1);
  $('nextStation').onclick = () => travel(1);
  $('clearChecks').onclick = () => {checks.clear(); checks.select(station().id, sim); renderGuide(true); focusScene();};
  $('pause').onclick = () => {
    paused = !paused; $('pause').textContent = paused ? 'Resume' : 'Pause';
    $('pause').setAttribute('aria-label', paused ? 'Resume' : 'Pause'); focusScene();
  };
  $('demo').onclick = () => {
    if (replay) {stopDemo(); clearControls(); return;}
    reset(); $('active').checked = true; updateInputs(); replay = new InputReplay();
    resume(); $('demo').textContent = 'Stop the demo';
  };
  for (const id of ['pitch', 'yaw', 'active', 'strength']) {
    $(id).oninput = () => {if (replay) {stopDemo(); clearControls();} updateInputs();};
    $(id).onchange = focusScene;
  }
  for (const [id, value] of [['up', -60], ['level', 0], ['down', 80]]) $(id).onclick = () => {
    if (replay) {stopDemo(); clearControls();}
    $('pitch').value = value; updateInputs(); focusScene();
  };
  for (const side of ['Left', 'Right']) {
    $(side.toLowerCase() + 'Latch').onchange = () => {
      const requested = $(side.toLowerCase() + 'Latch').checked;
      if (replay) {stopDemo(); clearControls(); $(side.toLowerCase() + 'Latch').checked = requested;}
      syncHands(); focusScene();
    };
    const button = $(side.toLowerCase() + 'Hand');
    button.onpointerdown = event => {
      event.preventDefault(); if (replay) {stopDemo(); clearControls();}
      button.setPointerCapture(event.pointerId); pointerHands[side] = true; syncHands(); focusScene();
    };
    button.onpointerup = button.onpointercancel = button.onlostpointercapture = () => {pointerHands[side] = false; syncHands();};
  }
  $('limp').onpointerdown = event => {
    if (replay) {stopDemo(); clearControls();}
    event.preventDefault(); $('limp').setPointerCapture(event.pointerId); pointerDead = true; syncDead(); focusScene();
  };
  $('limp').onpointerup = $('limp').onpointercancel = $('limp').onlostpointercapture = () => {pointerDead = false; syncDead();};
  $('impact').onclick = () => toolAction('impact');
  $('suspendGrip').onclick = () => toolAction('suspendGrips');
  $('loadGrip').onclick = () => toolAction('loadGrips');
  $('toggleAmber').onclick = () => {
    const suspended = tools.toggleSuspendedFixture(sim);
    $('toggleAmber').textContent = suspended ? 'Enable amber block grips' : 'Suspend amber block grips'; focusScene();
  };

  canvas.addEventListener('wheel', event => {
    event.preventDefault(); cameraDistance = Math.max(2, Math.min(18, cameraDistance * Math.exp(event.deltaY * .001)));
  }, {passive: false});
  canvas.addEventListener('click', () => {
    if (document.pointerLockElement === canvas) return;
    focusScene();
    try {
      const request = canvas.requestPointerLock();
      request?.catch(() => {$('cameraHint').textContent = 'Mouse capture failed. Q / E and arrow keys also work.';});
    } catch {$('cameraHint').textContent = 'Mouse capture is unavailable. Use Q / E and arrow keys.';}
  });
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    $('cameraHint').textContent = locked ? 'Mouse: look · Left / right button: hands · Esc: cursor' : 'Click the scene for mouse look · Q / E and arrow keys also work';
    if (!locked) {clearControls(); mouseLook.reset(mouseLook.pitch, mouseLook.yaw);}
  });
  document.addEventListener('pointerlockerror', () => {$('cameraHint').textContent = 'Mouse capture failed. Q / E and arrow keys also work.';});
  document.addEventListener('mousemove', event => {
    if (document.pointerLockElement !== canvas) return;
    if (replay) {stopDemo(); clearControls();}
    mouseLook.add(event.movementX, event.movementY);
  });
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  document.addEventListener('mousedown', event => {
    if (document.pointerLockElement !== canvas || ![0, 2].includes(event.button)) return;
    if (replay) {stopDemo(); clearControls();}
    mouseHands[event.button === 0 ? 'Left' : 'Right'] = true; syncHands(); event.preventDefault();
  });
  document.addEventListener('mouseup', event => {
    if (![0, 2].includes(event.button)) return;
    mouseHands[event.button === 0 ? 'Left' : 'Right'] = false; if (!replay) syncHands();
  });
  const gameplayKeys = new Set(['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR', 'KeyQ', 'KeyE', 'KeyY', 'KeyH', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'BracketLeft', 'BracketRight', 'KeyI', 'KeyG', 'KeyL']);
  window.addEventListener('keydown', event => {
    if (event.code === 'Escape') {
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      if (replay) stopDemo();
      clearControls();
    }
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || !gameplayKeys.has(event.code)) return;
    if (event.code === 'Space' && event.target instanceof HTMLButtonElement) return;
    event.preventDefault();
    if (event.code === 'KeyH') {if (!event.repeat) togglePanels(); return;}
    if (replay) {stopDemo(); clearControls();}
    keys.add(event.code); syncHands(); syncDead();
    if (event.code === 'Space' && !event.repeat) sim.controller.input.jump = true;
    if (event.code === 'KeyR' && !event.repeat) reset();
    if (event.code === 'BracketLeft' && !event.repeat) travel(-1);
    if (event.code === 'BracketRight' && !event.repeat) travel(1);
    if (!event.repeat && ['KeyI', 'KeyG', 'KeyL'].includes(event.code))
      toolAction({KeyI: 'impact', KeyG: 'suspendGrips', KeyL: 'loadGrips'}[event.code]);
  });
  window.addEventListener('keyup', event => {keys.delete(event.code); syncDead(); if (!replay) syncHands();});
  window.addEventListener('blur', () => {stopDemo(); clearControls();});

  populateCheckpoints(); checks.select(station().id, sim); preset();
  function fixedStep() {
    tools.step(spec.fixedDeltaTime);
    if (!replay) {
      if (document.pointerLockElement === canvas) {
        mouseLook.step(sim.controller.input, spec.fixedDeltaTime);
        $('pitch').value = mouseLook.pitch; $('yaw').value = ((mouseLook.yaw + 180) % 360 + 360) % 360 - 180;
        $('pitchValue').textContent = Math.round(mouseLook.pitch) + '°'; $('yawValue').textContent = Math.round(+$('yaw').value) + '°';
      }
      sim.step();
      if ($('scenario').value === 'playground') checks.sample(sim);
      return;
    }
    replay.step(sim);
    const input = sim.controller.input;
    mouseLook.reset(input.pitch, input.yaw);
    $('pitch').value = input.pitch; $('yaw').value = input.yaw;
    $('pitchValue').textContent = input.pitch + '°'; $('yawValue').textContent = input.yaw + '°';
    for (const side of ['Left', 'Right']) $(side.toLowerCase() + 'Hand').setAttribute('aria-pressed', String(input[side.toLowerCase() + 'Grab']));
    $('demoStatus').textContent = replay.label;
    if (replay.done) {
      const onTop = sim.controller.grounded && sim.controller.groundBody === sim.world[1]?.body && sim.rig.parts.Ball.position.y > 1.5 && sim.controller.handControl.count === 0;
      stopDemo(); clearControls();
      $('demoStatus').textContent = onTop ? 'Complete: standing on the ledge with both hands released.' : 'Demo ended; a stable climb was not confirmed.';
    }
  }
  engine.runRenderLoop(() => {
    const now = performance.now(), elapsed = Math.min((now - last) / 1000, .083333); last = now;
    const controller = sim.controller;
    if (!replay) {
      const strength = +$('strength').value;
      controller.input.x = ((keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0)) * strength;
      controller.input.z = ((keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0)) * strength;
    }
    const pitchDelta = (keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0);
    const yawDelta = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
    if (pitchDelta || yawDelta) {
      $('pitch').value = Math.max(-80, Math.min(80, +$('pitch').value + pitchDelta * 90 * elapsed));
      $('yaw').value = ((+$('yaw').value + yawDelta * 90 * elapsed + 540) % 360) - 180; updateInputs();
    }
    if (!paused) {accumulator += elapsed; while (accumulator >= spec.fixedDeltaTime) {fixedStep(); accumulator -= spec.fixedDeltaTime;}}
    if (now - hudTime > 100) {
      const data = sim.rig.diagnostics();
      $('state').textContent = controller.pullUpPhase || labels[controller.state] || controller.state;
      $('height').textContent = data.headHeight.toFixed(2) + ' m';
      $('speed').textContent = data.speed.toFixed(2) + ' m/s';
      $('error').textContent = (data.maxAnchorError * 100).toFixed(1) + ' cm';
      $('support').textContent = controller.grounded ? controller.groundBody?.transformNode.name || 'Grounded' : 'Airborne';
      $('supportSpeed').textContent = controller.ground.velocity.length().toFixed(2) + ' m/s';
      $('cameraDistance').textContent = camera.radius.toFixed(1) + ' / ' + cameraDistance.toFixed(1) + ' m';
      $('status').textContent = paused ? 'Paused' : 'Havok ready · fixed timestep';
      $('toolStatus').textContent = tools.message;
      for (const [side, hand] of Object.entries(controller.handControl.diagnostics())) {
        $(side.toLowerCase() + 'State').textContent = hand.holding ? hand.holding + ' · ' + Math.round(hand.force) + ' N'
          : (hand.reaching ? 'Reaching' : 'Free') + (hand.lastRelease ? ' · ' + hand.lastRelease : '');
      }
      renderGuide(); hudTime = now;
      if (!data.finite) {paused = true; setPanelsHidden(false); $('failure').textContent = 'Physics stopped: restore a checkpoint to continue.';}
    }
    const angles = cameraView.update(mouseLook.pitch, mouseLook.yaw, controller.walkSpeed, elapsed);
    camera.alpha = angles.alpha; camera.beta = angles.beta; camera.target.copyFrom(sim.rig.parts.Head.position);
    const direction = new Vector3(Math.cos(camera.alpha) * Math.sin(camera.beta), Math.cos(camera.beta), Math.sin(camera.alpha) * Math.sin(camera.beta));
    const nearHeight = camera.minZ * Math.tan(camera.fov / 2), nearRadius = Math.hypot(camera.minZ, nearHeight, nearHeight * engine.getAspectRatio(camera)) + .03;
    camera.radius = cameraBoom.update(camera.target, direction, cameraDistance, elapsed, nearRadius);
    scene.render();
  });
  window.addEventListener('resize', () => engine.resize());
} catch (error) {
  $('failure').textContent = error.stack || error.message; $('status').textContent = 'Startup failed'; console.error(error);
}
