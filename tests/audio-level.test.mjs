import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseAudioGain,signalStats,AudioLevelTracker} from '../server/audio-level.mjs';

test('Manual audio levels apply 100–300% without waiting for signal analysis',()=>{
  for(const boost of [100,150,200,250,300]){const tracker=new AudioLevelTracker();assert.equal(tracker.reset({mode:'manual',boost,targetDb:-21}),boost/100);assert.equal(tracker.update(0,0.05,{mode:'manual',boost,targetDb:-21}),boost/100);}
});
test('AUTO keeps ordinary recordings unchanged, boosts quiet ones and lowers loud ones',()=>{
  for(const rms of [0.045,0.075,0.1,0.16])assert.equal(chooseAudioGain('auto',100,rms),1);
  assert.equal(chooseAudioGain('auto',100,0.025),3);
  assert.equal(chooseAudioGain('auto',100,0.04),2);
  assert.equal(chooseAudioGain('auto',100,0.3),0.4);
});
test('Normalizer reaches the selected RMS reference from quiet and loud recordings',()=>{
  for(const targetDb of [-30,-24,-21,-12])for(const rms of [0.02,0.08,0.3,0.9]){
    const desired=10**(targetDb/20),gain=chooseAudioGain('normalizer',100,rms,targetDb);
    assert.ok(gain>=0.03&&gain<=3);
    if(desired/rms<=3)assert.ok(Math.abs(rms*gain-desired)<1e-9);
    else assert.equal(gain,3);
  }
});
test('Program leveling converges smoothly in both directions and ignores silence',()=>{
  for(const [rms,target] of [[0.025,3],[0.3,0.4]]){
    const options={mode:'auto',boost:100,targetDb:-21},tracker=new AudioLevelTracker();tracker.reset(options);
    const initial=tracker.update(rms,0.05,options);assert.ok(initial!==target,'Gain must not jump abruptly');
    for(let index=0;index<240;index++)tracker.update(rms,0.05,options);
    assert.ok(Math.abs(tracker.gain-target)<0.002);
    const saved=tracker.gain;for(let index=0;index<100;index++)assert.equal(tracker.update(0,0.05,options),saved);
    tracker.reset(options);assert.equal(tracker.gain,1);assert.equal(tracker.hasSignal,false);
  }
});
test('RMS measures stereo channels independently instead of cancelling opposite phases',()=>{
  const result=signalStats([new Float32Array([0.1,-0.1]),new Float32Array([-0.1,0.1]),new Float32Array(2)]);
  assert.ok(Math.abs(result.rms-0.1)<1e-7);assert.ok(Math.abs(result.peak-0.1)<1e-7);
  assert.deepEqual(signalStats([new Float32Array([NaN,Infinity,0])]),{rms:0,peak:0});
});
