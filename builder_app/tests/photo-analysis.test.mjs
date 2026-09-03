import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { photoAnalysisReady, canUsePhotoMask, resetPhotoAnalysis, capturePhoto, isCurrentPhoto } from '../photo-analysis.js'
import { buildDesignConfig } from '../studio-core.js'

const analysis={status:'completed',sourceAssetId:'a',provider:'isnet',capabilities:{subjectMask:true,faceProtection:false}}
test('still-image masks are not falsely applied to moving or alternate images',()=>{
  const editor={imageAssetId:'a',photoAnalysis:analysis,photoAnalysisMaskSrc:'blob:mask'}
  assert.equal(canUsePhotoMask(editor),true)
  for(const patch of [{videoEnabled:true},{interaction:'lenticular',lenticularSrc:'second.jpg'},{effect:'holographic',spatialEnabled:true,spatialScene:{status:'completed'},spatialSceneMedia:{background:'bg',mask:'mask'}}])
    assert.equal(canUsePhotoMask({...editor,...patch}),false)
})
test('only source-matched real subject analysis enables background effects',()=>{
  assert.equal(photoAnalysisReady({imageAssetId:'a',photoAnalysis:analysis,photoAnalysisMaskSrc:'blob:mask'}),true)
  for(const patch of [{imageAssetId:'b'},{photoAnalysisMaskSrc:''},{photoAnalysis:{...analysis,provider:'local_fallback'}},{photoAnalysis:{...analysis,capabilities:{subjectMask:false}}}])
    assert.equal(photoAnalysisReady({imageAssetId:'a',photoAnalysis:analysis,photoAnalysisMaskSrc:'blob:mask',...patch}),false)
})
test('photo replacement clears both analysis and spatial products without resetting effect style',()=>{
  const editor={photoAnalysis:analysis,photoAnalysisMaskSrc:'blob:mask',spatialScene:{status:'completed'},spatialSceneMedia:{mask:'blob:old'},foilPattern:'satin-pearl'}
  resetPhotoAnalysis(editor)
  assert.equal(editor.photoAnalysis,null)
  assert.equal(editor.spatialScene,null)
  assert.equal(editor.photoAnalysisMaskSrc,'')
  assert.equal(editor.foilPattern,'satin-pearl')
})
test('pending requests cannot attach results after photo replacement or card switch',()=>{
  const editor={imageSrc:'blob:a',imageFile:{}}
  const captured=capturePhoto(editor)
  editor.imageAssetId='uploaded-a'
  assert.equal(isCurrentPhoto(editor,captured),true)
  assert.equal(isCurrentPhoto({...editor},captured),false)
  editor.imageSrc='blob:b'
  assert.equal(isCurrentPhoto(editor,captured),false)
})
test('analysis metadata persists but explicitly cleared metadata never revives',()=>{
  const form={imageAssetId:'a',designConfig:{front:{photoAnalysis:analysis}}}
  assert.deepEqual(buildDesignConfig({form,editor:{imageAssetId:'a',photoAnalysis:analysis}}).front.photoAnalysis,analysis)
  assert.equal(buildDesignConfig({form,editor:{imageAssetId:'b',photoAnalysis:null,spatialScene:null}}).front.photoAnalysis,null)
})
test('depth toggle intent persists separately from prepared metadata',()=>{
  const result=buildDesignConfig({form:{},editor:{spatialEnabled:false,selectedEffect:'holographic',spatialScene:{status:'completed'}}})
  assert.equal(result.front.spatialEnabled,false)
  assert.equal(result.front.spatialScene.status,'completed')
  assert.equal(result.front.selectedEffect,'holographic')
  assert.equal(canUsePhotoMask({imageAssetId:'a',photoAnalysis:analysis,photoAnalysisMaskSrc:'mask',effect:'holographic',spatialEnabled:false,spatialScene:{status:'completed'},spatialSceneMedia:{background:'bg',mask:'mask'}}),true)
})
test('studio separates analysis and spatial controls and binds real mask without blocking editor',()=>{
  const src=readFileSync(new URL('../app.js',import.meta.url),'utf8')
  assert.match(src,/data-action="retry-effects"/)
  assert.match(src,/data-subject-mask=/)
  assert.match(src,/photo-analysis-progress/)
  assert.match(src,/isCurrentPhoto\(state.editor, captured\)/)
})
test('selected ambient effects opt into subtle idle animation independently of tilt',()=>{
  const src=readFileSync(new URL('../app.js',import.meta.url),'utf8')
  assert.match(src,/idle-effect-motion/)
  assert.match(src,/blossom-depth.*constellation/)
})
test('choosing a new surface effect defaults to the visible full-card range',()=>{
  const src=readFileSync(new URL('../app.js',import.meta.url),'utf8')
  const handler=src.match(/const foilPattern = event\.target\.closest\('\[data-foil-pattern\]'\)[\s\S]*?\n  \}/)?.[0] || ''
  assert.match(handler,/state\.editor\.foilCoverage = 'full'/)
})
