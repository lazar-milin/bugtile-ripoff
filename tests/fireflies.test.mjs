import test from 'node:test';
import assert from 'node:assert/strict';
import {createFireflyLights} from '../public/fireflies.js';

test('Firefly frames alternate at newly randomized intervals without re-render resets',()=>{
  const queue=[],changes=[],draws=[0,.5,1];
  const lights=createFireflyLights({random:()=>draws.shift(),schedule:(callback,delay)=>{queue.push({callback,delay});return queue.length;},onChange:(...change)=>changes.push(change)});
  assert.equal(lights.src('first'),'/art/F.png');
  assert.equal(queue[0].delay,2000);
  assert.equal(lights.src('first'),'/art/F.png');
  assert.equal(queue.length,1);
  queue[0].callback();
  assert.deepEqual(changes,[['first','/art/F-lit.png']]);
  assert.equal(lights.src('first'),'/art/F-lit.png');
  assert.equal(queue[1].delay,11000);
  queue[1].callback();
  assert.equal(lights.src('first'),'/art/F.png');
  assert.equal(queue[2].delay,20000);
});

test('Each Firefly has an independent light and clearing cancels every timer',()=>{
  const queue=[],cancelled=[];
  const lights=createFireflyLights({random:()=>.5,schedule:callback=>{queue.push(callback);return queue.length;},cancel:id=>cancelled.push(id)});
  lights.src('first');lights.src('second');queue[0]();
  assert.equal(lights.src('first'),'/art/F-lit.png');
  assert.equal(lights.src('second'),'/art/F.png');
  lights.clear();
  assert.deepEqual(cancelled.sort(),[2,3]);
});
