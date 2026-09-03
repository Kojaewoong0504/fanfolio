import test from 'node:test'
import assert from 'node:assert/strict'
import { createEffectPreparation, spatialEffectActive } from '../effect-preparation.js'

function setup() {
  const editor = {effect:'holographic',imageSrc:'a',photoAnalysisStatus:'idle',spatialSceneStatus:'idle'}
  let current = editor
  const calls=[]
  const prepare=createEffectPreparation({current:()=>current, analyzed:e=>e.photoAnalysisStatus==='completed', spatialReady:e=>e.spatialSceneStatus==='completed', analyze:async()=>{calls.push('analysis');editor.photoAnalysisStatus='completed'}, spatial:async()=>{calls.push('spatial');editor.spatialSceneStatus='completed'}})
  return {editor,calls,prepare,replace:e=>{current=e}}
}
test('single flight, cached reuse, depth is not automatically enabled',async()=>{
  const s=setup(); await Promise.all([s.prepare(),s.prepare(),s.prepare()]); await s.prepare()
  assert.deepEqual(s.calls,['analysis','spatial']); assert.notEqual(s.editor.spatialEnabled,true)
})
test('OFF and empty photos do not start work',async()=>{
  const s=setup();s.editor.effect='none';await s.prepare();s.editor.effect='holographic';s.editor.imageSrc='';await s.prepare();assert.deepEqual(s.calls,[])
})
test('OFF during analysis stops next stage, ON resumes without re-analysis',async()=>{
  const s=setup();const p=s.prepare();s.editor.effect='none';await p;assert.deepEqual(s.calls,['analysis']);s.editor.effect='holographic';await s.prepare();assert.deepEqual(s.calls,['analysis','spatial'])
})
test('replaced editor does not get an old depth task',async()=>{
  const s=setup();const p=s.prepare();s.replace({...s.editor,imageSrc:'b'});await p;assert.deepEqual(s.calls,['analysis'])
})
test('failed analysis stops depth; explicit retry succeeds',async()=>{
  const editor={effect:'holographic',imageSrc:'a'};let good=false;let depth=0
  const prepare=createEffectPreparation({current:()=>editor,analyzed:()=>good,spatialReady:()=>false,analyze:async()=>{},spatial:async()=>{depth++}})
  await prepare();assert.equal(depth,0);good=true;await prepare();assert.equal(depth,1)
})
test('prepared depth renders only with master and depth toggles ON',()=>{
  const e={effect:'holographic',spatialEnabled:false,spatialScene:{status:'completed'},spatialSceneMedia:{background:'bg',mask:'mask'}}
  assert.equal(spatialEffectActive(e),false);e.spatialEnabled=true;assert.equal(spatialEffectActive(e),true);e.effect='none';assert.equal(spatialEffectActive(e),false)
})
