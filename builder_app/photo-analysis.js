import { spatialEffectActive } from './effect-preparation.js'

export function photoAnalysisReady(editor) {
  const a=editor.photoAnalysis
  return Boolean(a?.status==='completed' && a.sourceAssetId===editor.imageAssetId && a.provider!=='local_fallback' && a.capabilities?.subjectMask===true && editor.photoAnalysisMaskSrc)
}

// A single still-image mask must not be applied to a different/moving source.
export function canUsePhotoMask(editor) {
  return photoAnalysisReady(editor) && !editor.videoEnabled
    && !(editor.interaction==='lenticular' && editor.lenticularSrc)
    && !spatialEffectActive(editor)
}

export function capturePhoto(editor) {
  return {editor,src:editor.imageSrc,file:editor.imageFile}
}

export function isCurrentPhoto(editor,captured) {
  return editor===captured.editor && editor.imageSrc===captured.src && editor.imageFile===captured.file
}

export function resetPhotoAnalysis(editor) {
  for(const url of [editor.photoAnalysisMaskSrc,...Object.values(editor.spatialSceneMedia||{})]) {
    if(typeof url==='string' && url.startsWith('blob:')) URL.revokeObjectURL(url)
  }
  Object.assign(editor,{photoAnalysis:null,photoAnalysisMaskSrc:'',photoAnalysisStatus:'idle',photoAnalysisError:'',showAnalysisMask:false,spatialEnabled:false,spatialSceneError:'',spatialScene:null,spatialSceneMedia:{background:'',mask:'',depth:''},spatialSceneStatus:'idle',spatialSceneJobId:null})
}
